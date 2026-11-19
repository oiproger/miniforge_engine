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

#[cfg(feature = "editor")]
#[tauri::command]
async fn pick_project_file(default_name: String) -> Result<Option<String>, String> {
    let file_name = std::path::Path::new(&default_name)
        .file_name()
        .and_then(|part| part.to_str())
        .unwrap_or("project.json");
    let dialog = rfd::AsyncFileDialog::new()
        .add_filter("Miniforge Project", &["json"])
        .set_file_name(file_name);
    Ok(dialog.save_file().await.map(|f| f.path().to_string_lossy().into_owned()))
}

#[cfg(feature = "editor")]
#[tauri::command]
async fn write_project_file(path: String, content: String) -> Result<bool, String> {
    std::fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(true)
}

#[cfg(feature = "editor")]
#[tauri::command]
async fn open_project_file() -> Result<Option<(String, String)>, String> {
    let dialog = rfd::AsyncFileDialog::new().add_filter("Miniforge Project", &["json"]);
    if let Some(file) = dialog.pick_file().await {
        let path = file.path().to_string_lossy().into_owned();
        let content = std::fs::read_to_string(file.path()).map_err(|e| e.to_string())?;
        return Ok(Some((path, content)));
    }
    Ok(None)
}

fn main() {
    let app = tauri::Builder::default();
    #[cfg(feature = "editor")]
    let app = app.invoke_handler(tauri::generate_handler![
        save_bytes,
        pick_project_file,
        write_project_file,
        open_project_file
    ]);
    app.run(tauri::generate_context!()).expect("Miniforge could not open the system webview");
}
