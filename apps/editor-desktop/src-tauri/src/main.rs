#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(feature = "editor")]
#[tauri::command]
async fn save_bytes(name: String, bytes: Vec<u8>) -> Result<bool, String> {
    let file_name = std::path::Path::new(&name)
        .file_name()
        .and_then(|part| part.to_str())
        .unwrap_or("project.miniforge");
    let dialog = rfd::AsyncFileDialog::new().set_file_name(file_name);
    if let Some(file) = dialog.save_file().await {
        file.write(&bytes).await.map_err(|error| error.to_string())?;
        return Ok(true);
    }
    Ok(false)
}

fn main() {
    let app = tauri::Builder::default();
    #[cfg(feature = "editor")]
    let app = app.invoke_handler(tauri::generate_handler![save_bytes]);
    app.run(tauri::generate_context!()).expect("Miniforge could not open the system webview");
}
