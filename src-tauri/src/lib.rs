mod local;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            local::identity,
            local::instance_read,
            local::instance_write,
            local::instance_forget,
        ])
        .run(tauri::generate_context!())
        .expect("error while running gild desktop");
}
