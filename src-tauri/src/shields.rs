use adblock::{
    lists::{FilterSet, ParseOptions},
    request::Request,
    Engine,
};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use url::Url;

const DEFAULT_FILTERS: &str = include_str!("../resources/default_filters.txt");

pub struct ShieldsState {
    inner: Mutex<ShieldsInner>,
}

struct ShieldsInner {
    engine: Engine,
    enabled: bool,
    disabled_domains: HashSet<String>,
    blocked_by_tab: HashMap<String, u32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShieldsStatus {
    pub enabled: bool,
    pub site_enabled: bool,
    pub blocked_count: u32,
    pub hostname: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CosmeticPayload {
    pub hide_selectors: Vec<String>,
    pub style_selectors: Vec<String>,
    pub injected_script: String,
}

impl Default for ShieldsState {
    fn default() -> Self {
        let mut filters = FilterSet::new(false);
        filters.add_filter_list(DEFAULT_FILTERS.to_string(), ParseOptions::default());
        Self {
            inner: Mutex::new(ShieldsInner {
                engine: Engine::new_with_filter_set(filters),
                enabled: true,
                disabled_domains: HashSet::new(),
                blocked_by_tab: HashMap::new(),
            }),
        }
    }
}

fn hostname_from_url(value: &str) -> Result<String, String> {
    let url = Url::parse(value).map_err(|error| format!("Invalid URL for Shields: {error}"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Droothe Shields supports HTTP and HTTPS pages only.".into());
    }
    url.host_str()
        .map(|host| host.trim_end_matches('.').to_ascii_lowercase())
        .filter(|host| !host.is_empty())
        .ok_or_else(|| "URL does not contain a hostname.".into())
}

fn status(inner: &ShieldsInner, tab_id: &str, hostname: String) -> ShieldsStatus {
    ShieldsStatus {
        enabled: inner.enabled,
        site_enabled: inner.enabled && !inner.disabled_domains.contains(&hostname),
        blocked_count: inner.blocked_by_tab.get(tab_id).copied().unwrap_or(0),
        hostname,
    }
}

pub fn get_status(state: &ShieldsState, tab_id: &str, url: &str) -> Result<ShieldsStatus, String> {
    let hostname = hostname_from_url(url)?;
    let inner = state
        .inner
        .lock()
        .map_err(|_| "Droothe Shields state is unavailable.".to_string())?;
    Ok(status(&inner, tab_id, hostname))
}

pub fn toggle_site(state: &ShieldsState, tab_id: &str, url: &str) -> Result<ShieldsStatus, String> {
    let hostname = hostname_from_url(url)?;
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Droothe Shields state is unavailable.".to_string())?;
    if !inner.disabled_domains.remove(&hostname) {
        inner.disabled_domains.insert(hostname.clone());
    }
    Ok(status(&inner, tab_id, hostname))
}

pub fn check_request(
    state: &ShieldsState,
    source_url: &str,
    request_url: &str,
    request_type: &str,
    method: &str,
) -> Result<bool, String> {
    let source_host = hostname_from_url(source_url)?;
    let request = Request::new(request_url, source_url, request_type, method)
        .map_err(|error| format!("Droothe Shields could not inspect request: {error}"))?;
    let inner = state
        .inner
        .lock()
        .map_err(|_| "Droothe Shields state is unavailable.".to_string())?;
    if !inner.enabled || inner.disabled_domains.contains(&source_host) {
        return Ok(false);
    }
    Ok(inner.engine.check_network_request(&request).should_block())
}

pub fn cosmetic_resources(state: &ShieldsState, url: &str) -> Result<CosmeticPayload, String> {
    hostname_from_url(url)?;
    let inner = state
        .inner
        .lock()
        .map_err(|_| "Droothe Shields state is unavailable.".to_string())?;
    let resources = inner.engine.url_cosmetic_resources(url);
    let generic_selectors = inner.engine.hidden_class_id_selectors(
        ["adsbygoogle", "ad-banner", "advertisement", "reklam"],
        ["google_ads", "reklam"],
        &resources.exceptions,
    );
    let mut hide_selectors: Vec<_> = resources
        .hide_selectors
        .into_iter()
        .chain(generic_selectors)
        .collect();
    hide_selectors.sort();
    Ok(CosmeticPayload {
        style_selectors: hide_selectors.clone(),
        hide_selectors,
        injected_script: resources.injected_script,
    })
}

pub fn record_blocked(state: &ShieldsState, tab_id: &str, count: u32) -> Result<u32, String> {
    if tab_id.is_empty() || count == 0 {
        return Err("A valid tab ID and positive blocked count are required.".into());
    }
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Droothe Shields state is unavailable.".to_string())?;
    let blocked_count = inner.blocked_by_tab.entry(tab_id.to_string()).or_default();
    *blocked_count = blocked_count.saturating_add(count);
    Ok(*blocked_count)
}

pub fn clear_tab(state: &ShieldsState, tab_id: &str) -> Result<(), String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "Droothe Shields state is unavailable.".to_string())?;
    inner.blocked_by_tab.remove(tab_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_rules_block_known_advertising_hosts() {
        let state = ShieldsState::default();
        assert!(check_request(
            &state,
            "https://example.com",
            "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
            "script",
            "GET",
        )
        .expect("request should be checked"));
    }

    #[test]
    fn site_toggle_allows_requests_for_that_host() {
        let state = ShieldsState::default();
        toggle_site(&state, "1", "https://example.com").expect("site toggle should succeed");
        assert!(!check_request(
            &state,
            "https://example.com",
            "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
            "script",
            "GET",
        )
        .expect("request should be checked"));
    }

    #[test]
    fn cosmetic_rules_are_available_offline() {
        let payload = cosmetic_resources(&ShieldsState::default(), "https://example.com")
            .expect("cosmetic resources should be available");
        assert!(payload.hide_selectors.contains(&".adsbygoogle".to_string()));
    }

    #[test]
    fn blocked_counts_are_reported_per_tab() {
        let state = ShieldsState::default();
        assert_eq!(
            record_blocked(&state, "1", 2).expect("count should update"),
            2
        );
        assert_eq!(
            get_status(&state, "1", "https://example.com")
                .expect("status should be available")
                .blocked_count,
            2
        );
        assert_eq!(
            get_status(&state, "2", "https://example.com")
                .expect("status should be available")
                .blocked_count,
            0
        );
    }
}
