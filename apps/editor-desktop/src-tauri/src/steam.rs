//! Optional Steamworks SDK bridge for Miniforge Engine Desktop (Tauri v2).
//! Enable native Steamworks SDK at build time with:
//!   cargo build --features "player,steamworks"
//! When built without the `steamworks` feature (default CI builds), these IPC
//! commands cleanly report unavailable so the JS SteamManager falls back to
//! local AppID 480 (Spacewar) debug mode.

use tauri::command;

#[derive(serde::Serialize)]
pub struct SteamUserPayload {
    #[serde(rename = "steamId")]
    pub steam_id: String,
    pub name: String,
    #[serde(rename = "appId")]
    pub app_id: u32,
    pub native: bool,
}

#[command]
pub fn steam_init(_app_id: u32) -> Result<SteamUserPayload, String> {
    Err("Native steamworks feature not enabled in this build (falling back to local debug bridge)".into())
}

#[command]
pub fn steam_unlock_achievement(_id: String) -> Result<bool, String> {
    Err("Native steamworks feature not enabled".into())
}

#[command]
pub fn steam_clear_achievement(_id: String) -> Result<bool, String> {
    Err("Native steamworks feature not enabled".into())
}

#[command]
pub fn steam_set_rich_presence(_key: String, _value: String) -> Result<bool, String> {
    Err("Native steamworks feature not enabled".into())
}

#[command]
pub fn steam_clear_rich_presence() -> Result<bool, String> {
    Err("Native steamworks feature not enabled".into())
}

#[command]
pub fn steam_cloud_write(_filename: String, _content: String) -> Result<bool, String> {
    Err("Native steamworks feature not enabled".into())
}

#[command]
pub fn steam_cloud_read(_filename: String) -> Result<Option<String>, String> {
    Err("Native steamworks feature not enabled".into())
}

#[command]
pub fn steam_cloud_delete(_filename: String) -> Result<bool, String> {
    Err("Native steamworks feature not enabled".into())
}

#[command]
pub fn steam_create_lobby(_max_members: u32, _lobby_type: String, _name: String) -> Result<serde_json::Value, String> {
    Err("Native steamworks feature not enabled".into())
}

#[command]
pub fn steam_list_lobbies() -> Result<Vec<serde_json::Value>, String> {
    Err("Native steamworks feature not enabled".into())
}

#[command]
pub fn steam_join_lobby(_lobby_id: String) -> Result<serde_json::Value, String> {
    Err("Native steamworks feature not enabled".into())
}

#[command]
pub fn steam_leave_lobby(_lobby_id: String) -> Result<bool, String> {
    Err("Native steamworks feature not enabled".into())
}

#[command]
pub fn steam_set_lobby_data(_lobby_id: String, _key: String, _value: String) -> Result<bool, String> {
    Err("Native steamworks feature not enabled".into())
}

#[command]
pub fn steam_send_p2p(_to: String, _data: String) -> Result<bool, String> {
    Err("Native steamworks feature not enabled".into())
}

#[command]
pub fn steam_poll_p2p() -> Result<Vec<serde_json::Value>, String> {
    Ok(Vec::new())
}
