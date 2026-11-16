use std::sync::Mutex;
use tauri::{
    webview::{PageLoadEvent, WebviewBuilder},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, WebviewUrl, Window,
    WindowEvent,
};
use url::Url;

const TOOLBAR_HEIGHT: f64 = 84.0;

#[derive(Default)]
struct BrowserState {
    active_tab: Mutex<Option<String>>,
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

fn update_webview_bounds(window: &Window, app: &AppHandle, tab_id: Option<String>) {
    let scale_factor = match window.scale_factor() {
        Ok(scale_factor) => scale_factor,
        Err(error) => {
            eprintln!("Pencere ölçeği okunamadı: {error}");
            return;
        }
    };
    let physical_size = match window.inner_size() {
        Ok(size) => size,
        Err(error) => {
            eprintln!("Pencere boyutu okunamadı: {error}");
            return;
        }
    };
    let width = f64::from(physical_size.width) / scale_factor;
    let height = (f64::from(physical_size.height) / scale_factor - TOOLBAR_HEIGHT).max(1.0);

    if let Some(main_webview) = app.get_webview("main") {
        if let Err(error) = main_webview.set_size(LogicalSize::new(width, TOOLBAR_HEIGHT)) {
            eprintln!("Ana arayüz boyutu güncellenemedi: {error}");
        }
    }
    if let Some(tab_id) = tab_id {
        if let Ok(label) = tab_label(&tab_id) {
            if let Some(webview) = app.get_webview(&label) {
                if let Err(error) = webview
                    .set_position(LogicalPosition::new(0.0, TOOLBAR_HEIGHT))
                    .and_then(|_| webview.set_size(LogicalSize::new(width, height)))
                {
                    eprintln!("Sekme webview boyutu güncellenemedi: {error}");
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
async fn open_tab(
    app: AppHandle,
    state: State<'_, BrowserState>,
    tab_id: String,
    url: String,
) -> Result<(), String> {
    let label = tab_label(&tab_id)?;
    let url = parse_web_url(&url)?;
    let previous_active = state
        .active_tab
        .lock()
        .map_err(|_| "Sekme durumu kullanılamıyor.".to_string())?
        .clone();

    let window = app
        .get_window("main")
        .ok_or_else(|| "Ana pencere bulunamadı.".to_string())?;
    if app.get_webview(&label).is_none() {
        let scale_factor = window
            .scale_factor()
            .map_err(|error| format!("Pencere ölçeği okunamadı: {error}"))?;
        let physical_size = window
            .inner_size()
            .map_err(|error| format!("Pencere boyutu okunamadı: {error}"))?;
        let width = f64::from(physical_size.width) / scale_factor;
        let height = (f64::from(physical_size.height) / scale_factor - TOOLBAR_HEIGHT).max(1.0);
        let app_handle = app.clone();
        let load_tab_id = tab_id.clone();
        window
            .add_child(
                WebviewBuilder::new(label.clone(), WebviewUrl::External(url)).on_page_load(
                    move |_, payload| {
                        let loading = matches!(payload.event(), PageLoadEvent::Started);
                        if let Err(error) =
                            app_handle.emit("tab-load-state", format!("{load_tab_id}|{loading}"))
                        {
                            eprintln!("Sekme yükleme durumu gönderilemedi: {error}");
                        }
                    },
                ),
                LogicalPosition::new(0.0, TOOLBAR_HEIGHT),
                LogicalSize::new(width, height),
            )
            .map_err(|error| format!("Sekme webview'ı oluşturulamadı: {error}"))?;
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
    webview
        .show()
        .map_err(|error| format!("Sekme gösterilemedi: {error}"))?;
    state
        .active_tab
        .lock()
        .map_err(|_| "Sekme durumu kullanılamıyor.".to_string())?
        .replace(tab_id);
    Ok(())
}

#[tauri::command]
fn navigate_tab(app: AppHandle, tab_id: String, url: String) -> Result<(), String> {
    let label = tab_label(&tab_id)?;
    let url = parse_web_url(&url)?;
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| "Sekme bulunamadı.".to_string())?;
    webview
        .navigate(url)
        .map_err(|error| format!("Adrese gidilemedi: {error}"))
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
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(BrowserState::default())
        .invoke_handler(tauri::generate_handler![
            open_tab,
            navigate_tab,
            close_tab,
            history_tab
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
            window.on_window_event(move |event| {
                if let WindowEvent::Resized(_) = event {
                    let active_tab = app_handle
                        .state::<BrowserState>()
                        .active_tab
                        .lock()
                        .map(|tab| tab.clone())
                        .unwrap_or_else(|error| {
                            eprintln!("Sekme durumu okunamadı: {error}");
                            None
                        });
                    update_webview_bounds(&resize_window, &app_handle, active_tab);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Droothe Browser başlatılamadı");
}
