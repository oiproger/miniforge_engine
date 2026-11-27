#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod lan;

#[cfg(feature = "steamworks")]
mod steam;

macro_rules! game_commands {
    ($app:expr $(, $command:path)* $(,)?) => {{
        #[cfg(feature = "steamworks")]
        let app = $app.invoke_handler(tauri::generate_handler![
            $($command,)*
            lan::lan_start_server, lan::lan_stop_server, lan::lan_discover,
            steam::steam_init, steam::steam_unlock_achievement, steam::steam_clear_achievement,
            steam::steam_has_achievement, steam::steam_set_rich_presence, steam::steam_clear_rich_presence,
            steam::steam_cloud_write, steam::steam_cloud_read, steam::steam_cloud_delete, steam::steam_cloud_list,
            steam::steam_create_lobby, steam::steam_list_lobbies, steam::steam_join_lobby,
            steam::steam_leave_lobby, steam::steam_set_lobby_data, steam::steam_send_p2p,
            steam::steam_poll_p2p, steam::steam_relay_status, steam::steam_invite_friends,
            steam::steam_read_stat, steam::steam_write_stat, steam::steam_is_dlc_installed,
            #[cfg(feature = "editor")]
            steam::steam_preview_supported,
            #[cfg(feature = "editor")]
            steam::steam_preview_end
        ]);
        #[cfg(not(feature = "steamworks"))]
        let app = $app.invoke_handler(tauri::generate_handler![
            $($command,)*
            lan::lan_start_server, lan::lan_stop_server, lan::lan_discover
        ]);
        app
    }};
}

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


#[cfg(feature = "player")]
mod player_host {
    use std::path::{Path, PathBuf};

    pub struct GameWindowConfig {
        pub title: String,
        pub width: f64,
        pub height: f64,
        pub fullscreen: bool,
        pub resizable: bool,
        pub decorated: bool,
    }

    pub fn find_game_dir() -> PathBuf {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                let sibling = dir.join("game");
                if sibling.is_dir() {
                    return sibling;
                }
                // macOS .app bundle: Contents/MacOS/exe -> Contents/Resources/game
                let mac_res = dir.join("../Resources/game");
                if mac_res.is_dir() {
                    return mac_res;
                }
            }
        }
        PathBuf::from("game")
    }

    fn json_str(src: &str, key: &str) -> Option<String> {
        let pat = format!("\"{}\"", key);
        let idx = src.find(&pat)? + pat.len();
        let rest = &src[idx..];
        let colon = rest.find(':')? + 1;
        let val = rest[colon..].trim_start();
        if !val.starts_with('"') { return None; }
        let inner = &val[1..];
        let end = inner.find('"')?;
        Some(inner[..end].to_string())
    }

    fn json_num(src: &str, key: &str) -> Option<f64> {
        let pat = format!("\"{}\"", key);
        let idx = src.find(&pat)? + pat.len();
        let rest = &src[idx..];
        let colon = rest.find(':')? + 1;
        let val = rest[colon..].trim_start();
        let end = val.find(|c: char| !c.is_ascii_digit() && c != '.' && c != '-').unwrap_or(val.len());
        val[..end].parse::<f64>().ok()
    }

    fn json_bool(src: &str, key: &str) -> Option<bool> {
        let pat = format!("\"{}\"", key);
        let idx = src.find(&pat)? + pat.len();
        let rest = &src[idx..];
        let colon = rest.find(':')? + 1;
        let val = rest[colon..].trim_start();
        if val.starts_with("true") { Some(true) }
        else if val.starts_with("false") { Some(false) }
        else { None }
    }

    pub fn load_config(game_dir: &Path) -> GameWindowConfig {
        let mut cfg = GameWindowConfig {
            title: "Miniforge Game".into(),
            width: 1280.0,
            height: 720.0,
            fullscreen: false,
            resizable: true,
            decorated: true,
        };
        if let Ok(raw) = std::fs::read_to_string(game_dir.join("game.config.json")) {
            if let Some(t) = json_str(&raw, "title") { cfg.title = t; }
            if let Some(w) = json_num(&raw, "width") { cfg.width = w.max(320.0); }
            if let Some(h) = json_num(&raw, "height") { cfg.height = h.max(240.0); }
            if let Some(f) = json_bool(&raw, "fullscreen") { cfg.fullscreen = f; }
            if let Some(r) = json_bool(&raw, "resizable") { cfg.resizable = r; }
            if let Some(d) = json_bool(&raw, "decorated") { cfg.decorated = d; }
        }
        cfg
    }

    pub fn mime_for(path: &Path) -> &'static str {
        match path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
            "html" | "htm" => "text/html; charset=utf-8",
            "js" | "mjs" => "application/javascript; charset=utf-8",
            "css" => "text/css; charset=utf-8",
            "json" => "application/json; charset=utf-8",
            "wasm" => "application/wasm",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            "svg" => "image/svg+xml",
            "wav" => "audio/wav",
            "mp3" => "audio/mpeg",
            "ogg" => "audio/ogg",
            "glb" => "model/gltf-binary",
            _ => "application/octet-stream",
        }
    }
}

fn main() {
    let app = tauri::Builder::default();
    #[cfg(feature = "editor")]
    let app = game_commands!(app, save_bytes, pick_project_file, write_project_file,
        open_project_file, convert_model_to_glb);
    #[cfg(not(any(feature = "editor", feature = "player")))]
    let app = game_commands!(app);
    #[cfg(feature = "player")]
    let app = {
        let game_dir = player_host::find_game_dir();
        let game_dir_proto = game_dir.clone();
        let cfg = player_host::load_config(&game_dir);
        game_commands!(app)
        .register_uri_scheme_protocol("mfgame", move |_ctx, req| {
            let raw_path = req.uri().path().trim_start_matches('/');
            let rel = if raw_path.is_empty() { "index.html" } else { raw_path };
            let target = game_dir_proto.join(rel);
            match std::fs::read(&target) {
                Ok(bytes) => tauri::http::Response::builder()
                    .status(200)
                    .header("Content-Type", player_host::mime_for(&target))
                    .body(bytes)
                    .unwrap(),
                Err(_) => tauri::http::Response::builder()
                    .status(404)
                    .header("Content-Type", "text/plain")
                    .body(b"Not found".to_vec())
                    .unwrap(),
            }
        })
        .setup(move |app_handle| {
            use tauri::Manager;
            if let Some(extra) = app_handle.get_webview_window("main") {
                let _ = extra.close();
            }
            let url = tauri::WebviewUrl::External("mfgame://localhost/index.html".parse().unwrap());
            tauri::WebviewWindowBuilder::new(app_handle, "game", url)
                .title(&cfg.title)
                .inner_size(cfg.width, cfg.height)
                .fullscreen(cfg.fullscreen)
                .resizable(cfg.resizable)
                .decorations(cfg.decorated)
                .build()?;
            Ok(())
        })
    };
    #[cfg(feature = "player")]
    app.run(tauri::generate_context!("player.conf.json")).expect("Miniforge could not open the system webview");
    #[cfg(not(feature = "player"))]
    app.run(tauri::generate_context!()).expect("Miniforge could not open the system webview");
}
