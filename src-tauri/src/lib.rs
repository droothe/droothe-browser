use serde::Serialize;
use std::sync::Mutex;
use tauri::{
    webview::{PageLoadEvent, WebviewBuilder},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalSize, State, WebviewUrl,
    Window, WindowEvent,
};
use url::Url;

const TOOLBAR_HEIGHT: f64 = 84.0;
const SCRATCHPAD_WIDTH: f64 = 360.0;

#[derive(Default)]
struct BrowserState {
    active_tab: Mutex<Option<String>>,
    internal_tab: Mutex<Option<String>>,
    scratchpad_open: Mutex<bool>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TabTitleUpdated {
    tab_id: String,
    title: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserShortcutEvent {
    tab_id: String,
    shortcut: String,
}

fn tab_label(tab_id: &str) -> Result<String, String> {
    if tab_id.is_empty()
        || !tab_id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
    {
        return Err("Geçersiz sekme kimliği.".into());
    }
    Ok(format!("tab-{tab_id}"))
}

fn parse_web_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|error| format!("Geçersiz adres: {error}"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Yalnızca HTTP ve HTTPS adresleri desteklenir.".into());
    }
    Ok(url)
}

fn is_new_tab_url(value: &str) -> bool {
    value.trim().is_empty()
        || value
            .trim()
            .trim_end_matches('/')
            .eq_ignore_ascii_case("droothe://newtab")
}

fn logical_window_dimensions(window: &Window) -> Result<(f64, f64), String> {
    let scale_factor = match window.scale_factor() {
        Ok(scale_factor) => scale_factor,
        Err(error) => {
            return Err(format!("Pencere ölçeği okunamadı: {error}"));
        }
    };
    let physical_size = match window.inner_size() {
        Ok(size) => size,
        Err(error) => {
            return Err(format!("Pencere boyutu okunamadı: {error}"));
        }
    };
    let width = f64::from(physical_size.width) / scale_factor;
    let height = f64::from(physical_size.height) / scale_factor;
    Ok((width, height))
}

fn set_active_tab(state: &BrowserState, tab_id: String, is_internal: bool) -> Result<(), String> {
    *state
        .active_tab
        .lock()
        .map_err(|_| "Sekme durumu kullanılamıyor.".to_string())? = Some(tab_id.clone());
    *state
        .internal_tab
        .lock()
        .map_err(|_| "Dahili sekme durumu kullanılamıyor.".to_string())? =
        if is_internal { Some(tab_id) } else { None };
    Ok(())
}

fn active_webview_layout(state: &BrowserState) -> (Option<String>, bool, bool) {
    let active_tab = state
        .active_tab
        .lock()
        .map(|tab| tab.clone())
        .unwrap_or_else(|error| {
            eprintln!("Sekme durumu okunamadı: {error}");
            None
        });
    let internal_tab = state
        .internal_tab
        .lock()
        .map(|tab| tab.clone())
        .unwrap_or_else(|error| {
            eprintln!("Dahili sekme durumu okunamadı: {error}");
            None
        });
    let scratchpad_open = state
        .scratchpad_open
        .lock()
        .map(|open| *open)
        .unwrap_or_else(|error| {
            eprintln!("Scratchpad durumu okunamadı: {error}");
            false
        });
    let is_internal = active_tab.is_some() && active_tab == internal_tab;
    (active_tab, is_internal, scratchpad_open)
}

fn child_webview_dimensions(state: &BrowserState, window: &Window) -> Result<(f64, f64), String> {
    let (window_width, window_height) = logical_window_dimensions(window)?;
    let scratchpad_open = *state
        .scratchpad_open
        .lock()
        .map_err(|_| "Scratchpad durumu kullanılamıyor.".to_string())?;
    let width = (window_width
        - if scratchpad_open {
            SCRATCHPAD_WIDTH
        } else {
            0.0
        })
    .max(1.0);
    let height = (window_height - TOOLBAR_HEIGHT).max(1.0);
    Ok((width, height))
}

fn create_tab_webview(
    app: &AppHandle,
    window: &Window,
    state: &BrowserState,
    tab_id: &str,
    url: Url,
) -> Result<(), String> {
    let label = tab_label(tab_id)?;
    let (width, height) = child_webview_dimensions(state, window)?;
    let app_handle = app.clone();
    let load_tab_id = tab_id.to_string();
    let title_app_handle = app.clone();
    let title_tab_id = tab_id.to_string();
    let shortcut_script = r#"(() => {
  const tabId = "__TAB_ID__";
  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const modifier = event.ctrlKey || event.metaKey;
    const target = event.target;
    const isTypingTarget = target instanceof Element
      && target.closest('input, textarea, [contenteditable="true"]') !== null;
    let shortcut;
    if (modifier && event.shiftKey && key === "t") shortcut = "restore-tab";
    else if (modifier && !event.shiftKey && key === "t") shortcut = "new-tab";
    else if (modifier && !event.shiftKey && key === "w") shortcut = "close-tab";
    else if ((event.key === "F5" && !modifier) || (modifier && !event.shiftKey && key === "r")) shortcut = "reload";
    else if (event.key === "F6" && !modifier) shortcut = "focus-address";
    else if (event.key === '"' && !isTypingTarget) shortcut = "toggle-scratchpad";
    else if (modifier && key === "tab") shortcut = event.shiftKey ? "previous-tab" : "next-tab";
    else if (modifier && !event.shiftKey && /^[1-9]$/.test(event.key)) shortcut = `tab-${event.key}`;
    if (!shortcut) return;

    event.preventDefault();
    event.stopPropagation();
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (typeof invoke === "function") {
      void invoke("dispatch_browser_shortcut", { tabId, shortcut })
        .catch((error) => console.error("Browser shortcut failed:", error));
    }
  }, true);
})();"#
        .replace("__TAB_ID__", tab_id);
    window
        .add_child(
            WebviewBuilder::new(label, WebviewUrl::External(url))
                .initialization_script(&shortcut_script)
                .on_document_title_changed(move |_, title| {
                    if let Err(error) = title_app_handle.emit(
                        "tab-title-updated",
                        TabTitleUpdated {
                            tab_id: title_tab_id.clone(),
                            title,
                        },
                    ) {
                        eprintln!("Sekme başlığı gönderilemedi: {error}");
                    }
                })
                .on_page_load(move |_, payload| {
                    let loading = matches!(payload.event(), PageLoadEvent::Started);
                    if let Err(error) =
                        app_handle.emit("tab-load-state", format!("{load_tab_id}|{loading}"))
                    {
                        eprintln!("Sekme yükleme durumu gönderilemedi: {error}");
                    }
                }),
            LogicalPosition::new(0.0, TOOLBAR_HEIGHT),
            LogicalSize::new(width, height),
        )
        .map_err(|error| format!("Sekme webview'ı oluşturulamadı: {error}"))?;
    Ok(())
}

#[tauri::command]
fn dispatch_browser_shortcut(
    app: AppHandle,
    state: State<'_, BrowserState>,
    tab_id: String,
    shortcut: String,
) -> Result<(), String> {
    let valid_shortcut = matches!(
        shortcut.as_str(),
        "new-tab"
            | "close-tab"
            | "restore-tab"
            | "reload"
            | "focus-address"
            | "toggle-scratchpad"
            | "next-tab"
            | "previous-tab"
            | "tab-1"
            | "tab-2"
            | "tab-3"
            | "tab-4"
            | "tab-5"
            | "tab-6"
            | "tab-7"
            | "tab-8"
            | "tab-9"
    );
    if !valid_shortcut {
        return Err("Geçersiz tarayıcı kısayolu.".into());
    }

    let active_tab = state
        .active_tab
        .lock()
        .map_err(|_| "Sekme durumu kullanılamıyor.".to_string())?;
    if active_tab.as_deref() != Some(tab_id.as_str()) {
        return Ok(());
    }
    app.emit(
        "browser-shortcut",
        BrowserShortcutEvent { tab_id, shortcut },
    )
    .map_err(|error| format!("Tarayıcı kısayolu gönderilemedi: {error}"))
}

fn show_internal_tab(
    app: &AppHandle,
    window: &Window,
    state: &BrowserState,
    tab_id: &str,
    previous_active: Option<String>,
) -> Result<(), String> {
    let label = tab_label(tab_id)?;
    if let Some(webview) = app.get_webview(&label) {
        webview
            .hide()
            .map_err(|error| format!("Sekme gizlenemedi: {error}"))?;
    }
    if let Some(previous_id) = previous_active {
        if previous_id != tab_id {
            if let Ok(label) = tab_label(&previous_id) {
                if let Some(webview) = app.get_webview(&label) {
                    webview
                        .hide()
                        .map_err(|error| format!("Önceki sekme gizlenemedi: {error}"))?;
                }
            }
        }
    }

    let (width, height) = logical_window_dimensions(window)?;
    let main_webview = app
        .get_webview("main")
        .ok_or_else(|| "Ana arayüz webview'ı bulunamadı.".to_string())?;
    main_webview
        .set_position(LogicalPosition::new(0.0, 0.0))
        .and_then(|_| main_webview.set_size(LogicalSize::new(width, height)))
        .and_then(|_| main_webview.show())
        .map_err(|error| format!("Yeni sekme arayüzü gösterilemedi: {error}"))?;
    set_active_tab(state, tab_id.to_string(), true)
}

fn update_webview_bounds(
    app: &AppHandle,
    tab_id: Option<String>,
    is_internal: bool,
    scratchpad_open: bool,
    physical_size: PhysicalSize<u32>,
    scale_factor: f64,
) {
    if !scale_factor.is_finite() || scale_factor <= 0.0 {
        eprintln!("Pencere ölçeği geçersiz: {scale_factor}");
        return;
    }
    let window_width = f64::from(physical_size.width) / scale_factor;
    let child_width = (window_width
        - if scratchpad_open {
            SCRATCHPAD_WIDTH
        } else {
            0.0
        })
    .max(1.0);
    let window_height = f64::from(physical_size.height) / scale_factor;
    let height = (window_height - TOOLBAR_HEIGHT).max(1.0);

    if let Some(main_webview) = app.get_webview("main") {
        let main_height = if is_internal {
            window_height
        } else {
            TOOLBAR_HEIGHT
        };
        if let Err(error) = main_webview.set_size(LogicalSize::new(window_width, main_height)) {
            eprintln!("Ana arayüz boyutu güncellenemedi: {error}");
        }
    }
    if !is_internal {
        if let Some(tab_id) = tab_id {
            if let Ok(label) = tab_label(&tab_id) {
                if let Some(webview) = app.get_webview(&label) {
                    if let Err(error) = webview
                        .set_position(LogicalPosition::new(0.0, TOOLBAR_HEIGHT))
                        .and_then(|_| webview.set_size(LogicalSize::new(child_width, height)))
                    {
                        eprintln!("Sekme webview boyutu güncellenemedi: {error}");
                    }
                }
            }
        }
    }
}

#[tauri::command]
fn history_tab(app: AppHandle, tab_id: String, action: String) -> Result<(), String> {
    let label = tab_label(&tab_id)?;
    let script = match action.as_str() {
        "goBack" => "history.back()",
        "goForward" => "history.forward()",
        "reload" => "location.reload()",
        "stop" => "window.stop()",
        _ => return Err("Geçersiz gezinme işlemi.".into()),
    };
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "Sekme bulunamadı.".to_string())?;
    webview
        .eval(script)
        .map_err(|error| format!("Gezinme işlemi başarısız: {error}"))
}

#[tauri::command]
fn sync_active_webview_bounds(
    app: AppHandle,
    state: State<'_, BrowserState>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    scratchpad_open: bool,
) -> Result<(), String> {
    if ![x, y, width, height].iter().all(|value| value.is_finite())
        || x < 0.0
        || y < TOOLBAR_HEIGHT
        || width <= 0.0
        || height <= 0.0
    {
        return Err("Webview sınırları geçersiz.".into());
    }

    *state
        .scratchpad_open
        .lock()
        .map_err(|_| "Scratchpad durumu kullanılamıyor.".to_string())? = scratchpad_open;

    let active_tab = state
        .active_tab
        .lock()
        .map_err(|_| "Sekme durumu kullanılamıyor.".to_string())?
        .clone()
        .ok_or_else(|| "Etkin sekme bulunamadı.".to_string())?;
    let internal_tab = state
        .internal_tab
        .lock()
        .map_err(|_| "Dahili sekme durumu kullanılamıyor.".to_string())?
        .clone();
    if internal_tab.as_deref() == Some(active_tab.as_str()) {
        return Ok(());
    }

    let label = tab_label(&active_tab)?;
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "Etkin sekme webview'ı bulunamadı.".to_string())?;
    webview
        .set_position(LogicalPosition::new(x, y))
        .and_then(|_| webview.set_size(LogicalSize::new(width, height)))
        .map_err(|error| format!("Sekme boyutu eşitlenemedi: {error}"))
}

#[tauri::command]
async fn open_tab(
    app: AppHandle,
    state: State<'_, BrowserState>,
    tab_id: String,
    url: String,
) -> Result<(), String> {
    let label = tab_label(&tab_id)?;
    let previous_active = state
        .active_tab
        .lock()
        .map_err(|_| "Sekme durumu kullanılamıyor.".to_string())?
        .clone();

    let window = app
        .get_window("main")
        .ok_or_else(|| "Ana pencere bulunamadı.".to_string())?;
    if is_new_tab_url(&url) {
        return show_internal_tab(&app, &window, &state, &tab_id, previous_active);
    }

    let url = parse_web_url(&url)?;
    let (width, _) = logical_window_dimensions(&window)?;
    let main_webview = app
        .get_webview("main")
        .ok_or_else(|| "Ana arayüz webview'ı bulunamadı.".to_string())?;
    main_webview
        .set_size(LogicalSize::new(width, TOOLBAR_HEIGHT))
        .and_then(|_| main_webview.show())
        .map_err(|error| format!("Tarayıcı araç çubuğu gösterilemedi: {error}"))?;

    if app.get_webview(&label).is_none() {
        create_tab_webview(&app, &window, &state, &tab_id, url)?;
    }

    if let Some(previous_id) = previous_active {
        if previous_id != tab_id {
            if let Ok(previous_label) = tab_label(&previous_id) {
                if let Some(previous) = app.get_webview(&previous_label) {
                    previous
                        .hide()
                        .map_err(|error| format!("Önceki sekme gizlenemedi: {error}"))?;
                }
            }
        }
    }

    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "Sekme webview'ı bulunamadı.".to_string())?;
    let (child_width, child_height) = child_webview_dimensions(&state, &window)?;
    webview
        .set_position(LogicalPosition::new(0.0, TOOLBAR_HEIGHT))
        .and_then(|_| webview.set_size(LogicalSize::new(child_width, child_height)))
        .and_then(|_| webview.show())
        .map_err(|error| format!("Sekme gösterilemedi: {error}"))?;
    set_active_tab(&state, tab_id, false)
}

#[tauri::command]
async fn navigate_tab(
    app: AppHandle,
    state: State<'_, BrowserState>,
    tab_id: String,
    url: String,
) -> Result<(), String> {
    let label = tab_label(&tab_id)?;
    let window = app
        .get_window("main")
        .ok_or_else(|| "Ana pencere bulunamadı.".to_string())?;
    let previous_active = state
        .active_tab
        .lock()
        .map_err(|_| "Sekme durumu kullanılamıyor.".to_string())?
        .clone();

    if is_new_tab_url(&url) {
        return show_internal_tab(&app, &window, &state, &tab_id, previous_active);
    }

    let url = parse_web_url(&url)?;
    let (width, _) = logical_window_dimensions(&window)?;
    let main_webview = app
        .get_webview("main")
        .ok_or_else(|| "Ana arayüz webview'ı bulunamadı.".to_string())?;
    main_webview
        .set_size(LogicalSize::new(width, TOOLBAR_HEIGHT))
        .and_then(|_| main_webview.show())
        .map_err(|error| format!("Tarayıcı araç çubuğu gösterilemedi: {error}"))?;

    let is_new_webview = app.get_webview(&label).is_none();
    if is_new_webview {
        create_tab_webview(&app, &window, &state, &tab_id, url)?;
    } else {
        app.get_webview(&label)
            .ok_or_else(|| "Sekme bulunamadı.".to_string())?
            .navigate(url)
            .map_err(|error| format!("Adrese gidilemedi: {error}"))?;
    }
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "Sekme bulunamadı.".to_string())?;
    let (child_width, child_height) = child_webview_dimensions(&state, &window)?;
    if let Some(previous_id) = previous_active {
        if previous_id != tab_id {
            if let Ok(previous_label) = tab_label(&previous_id) {
                if let Some(previous) = app.get_webview(&previous_label) {
                    previous
                        .hide()
                        .map_err(|error| format!("Önceki sekme gizlenemedi: {error}"))?;
                }
            }
        }
    }
    webview
        .set_position(LogicalPosition::new(0.0, TOOLBAR_HEIGHT))
        .and_then(|_| webview.set_size(LogicalSize::new(child_width, child_height)))
        .and_then(|_| webview.show())
        .map_err(|error| format!("Sekme gösterilemedi: {error}"))?;
    set_active_tab(&state, tab_id, false)
}

#[tauri::command]
fn close_tab(app: AppHandle, state: State<'_, BrowserState>, tab_id: String) -> Result<(), String> {
    let label = tab_label(&tab_id)?;
    if let Some(webview) = app.get_webview(&label) {
        webview
            .close()
            .map_err(|error| format!("Sekme kapatılamadı: {error}"))?;
    }

    let mut active_tab = state
        .active_tab
        .lock()
        .map_err(|_| "Sekme durumu kullanılamıyor.".to_string())?;
    if active_tab.as_deref() == Some(tab_id.as_str()) {
        *active_tab = None;
    }
    let mut internal_tab = state
        .internal_tab
        .lock()
        .map_err(|_| "Dahili sekme durumu kullanılamıyor.".to_string())?;
    if internal_tab.as_deref() == Some(tab_id.as_str()) {
        *internal_tab = None;
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(BrowserState::default())
        .invoke_handler(tauri::generate_handler![
            open_tab,
            navigate_tab,
            close_tab,
            history_tab,
            sync_active_webview_bounds,
            dispatch_browser_shortcut
        ])
        .setup(|app| {
            let window = app
                .get_window("main")
                .expect("main window must be configured in tauri.conf.json");
            let scale_factor = window.scale_factor()?;
            let physical_size = window.inner_size()?;
            let width = f64::from(physical_size.width) / scale_factor;
            let main_webview = app
                .get_webview("main")
                .expect("main webview must be created from tauri.conf.json");
            main_webview.set_position(LogicalPosition::new(0.0, 0.0))?;
            main_webview.set_size(LogicalSize::new(width, TOOLBAR_HEIGHT))?;

            let app_handle = app.handle().clone();
            let resize_window = window.clone();
            window.on_window_event(move |event| match event {
                WindowEvent::Resized(physical_size) => match resize_window.scale_factor() {
                    Ok(scale_factor) => {
                        let state = app_handle.state::<BrowserState>();
                        let (active_tab, is_internal, scratchpad_open) =
                            active_webview_layout(&state);
                        update_webview_bounds(
                            &app_handle,
                            active_tab,
                            is_internal,
                            scratchpad_open,
                            *physical_size,
                            scale_factor,
                        );
                    }
                    Err(error) => eprintln!("Pencere ölçeği okunamadı: {error}"),
                },
                WindowEvent::ScaleFactorChanged {
                    scale_factor,
                    new_inner_size,
                    ..
                } => {
                    let state = app_handle.state::<BrowserState>();
                    let (active_tab, is_internal, scratchpad_open) = active_webview_layout(&state);
                    update_webview_bounds(
                        &app_handle,
                        active_tab,
                        is_internal,
                        scratchpad_open,
                        *new_inner_size,
                        *scale_factor,
                    );
                }
                _ => {}
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Droothe Browser başlatılamadı");
}
