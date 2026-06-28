#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Durable server-URL injection. The web app's getServerUrl() honors
  // globalThis.__HAPPY_CONFIG__.serverUrl ABOVE its prod default, so injecting it
  // here — before the webview loads — points the daily driver at the self-host
  // server reliably, immune to the Metro transform-cache bug that defeats the
  // EXPO_PUBLIC build-time bake. Two layers: runtime HAPPY_SERVER_URL override
  // (repoint without rebuild) > compile-time HAPPY_SELFHOST_URL baked default.
  let server_url = std::env::var("HAPPY_SERVER_URL").ok()
    .or_else(|| option_env!("HAPPY_SELFHOST_URL").map(|s| s.to_string()))
    .filter(|s| !s.is_empty());

  let mut builder = tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_opener::init());

  if let Some(url) = server_url {
    // serde_json escapes the URL safely into a JS string literal.
    let script = format!(
      "globalThis.__HAPPY_CONFIG__ = Object.assign(globalThis.__HAPPY_CONFIG__ || {{}}, {{ serverUrl: {} }});",
      serde_json::to_string(&url).unwrap_or_else(|_| "\"\"".to_string())
    );
    builder = builder.plugin(
      tauri::plugin::Builder::<tauri::Wry>::new("happy-config").js_init_script(script).build()
    );
  }

  builder
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
