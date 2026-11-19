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


#[cfg(feature = "editor")]
#[tauri::command]
async fn convert_model_to_glb(name: String, bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    let ext = std::path::Path::new(&name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("x");
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp = std::env::temp_dir();
    let in_path = tmp.join(format!("miniforge_in_{}.{}", stamp, ext));
    let out_path = tmp.join(format!("miniforge_out_{}.glb", stamp));
    std::fs::write(&in_path, &bytes).map_err(|e| format!("Failed to write temp model: {}", e))?;

    let status = std::process::Command::new("assimp")
        .args([
            "export",
            &in_path.to_string_lossy(),
            &out_path.to_string_lossy(),
            "-fglb2",
        ])
        .output();

    let _ = std::fs::remove_file(&in_path);

    match status {
        Ok(out) if out.status.success() && out_path.exists() => {
            let glb = std::fs::read(&out_path).map_err(|e| e.to_string())?;
            let _ = std::fs::remove_file(&out_path);
            Ok(glb)
        }
        Ok(out) => {
            let _ = std::fs::remove_file(&out_path);
            let err = String::from_utf8_lossy(&out.stderr);
            Err(format!("Assimp failed to convert {}: {}", name, err.trim()))
        }
        Err(_) => {
            let _ = std::fs::remove_file(&out_path);
            Err("Assimp CLI not found. Install it once (Linux: sudo apt install assimp-utils, macOS: brew install assimp, Windows: winget install Assimp) to import .fbx/.smd/.x models.".into())
        }
    }
}

fn main() {
    let app = tauri::Builder::default();
    #[cfg(feature = "editor")]
    let app = app.invoke_handler(tauri::generate_handler![
        save_bytes,
        pick_project_file,
        write_project_file,
        open_project_file,
        convert_model_to_glb
    ]);
    app.run(tauri::generate_context!()).expect("Miniforge could not open the system webview");
}
