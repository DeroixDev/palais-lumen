use tauri::{plugin::Builder as PluginBuilder, Manager, WebviewWindow};

// F11 toggles fullscreen. The webview swallows the key, so a small init script
// (injected into every page load, no change to the web code) forwards it here.
#[tauri::command]
fn toggle_fullscreen(window: WebviewWindow) -> Result<(), String> {
    let on = window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(!on).map_err(|e| e.to_string())
}

const F11_SCRIPT: &str = r#"
window.addEventListener('keydown', (e) => {
  if (e.key !== 'F11') return;
  e.preventDefault();
  window.__TAURI_INTERNALS__.invoke('toggle_fullscreen');
}, true);
"#;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(PluginBuilder::<tauri::Wry>::new("f11").js_init_script(F11_SCRIPT).build())
        .invoke_handler(tauri::generate_handler![toggle_fullscreen])
        .setup(|app| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Casino Nachtfalter");
}
