use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashSet},
    io::{Read, Write},
    sync::{mpsc, Arc, Mutex, OnceLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use steamworks::{
    networking_types::{NetworkingIdentity, SendFlags},
    AppId, Client, DistanceFilter, GameLobbyJoinRequested, LobbyId, LobbyType, SteamId,
};

const CHANNEL: u32 = 23;
const PACKET_LIMIT: usize = 256 * 1024;
const CLOUD_LIMIT: usize = 8 * 1024 * 1024;
static STEAM: OnceLock<Steam> = OnceLock::new();
static INIT: Mutex<()> = Mutex::new(());

struct Steam {
    client: Client,
    lobby: Arc<Mutex<Option<LobbyId>>>,
    invite: Arc<Mutex<Option<Value>>>,
}

fn state() -> Result<&'static Steam, String> {
    STEAM
        .get()
        .ok_or_else(|| "Steamworks must be initialized first".into())
}

fn steam_id(value: &str) -> Result<SteamId, String> {
    value
        .parse::<u64>()
        .ok()
        .filter(|id| *id != 0)
        .map(SteamId::from_raw)
        .ok_or_else(|| "Invalid Steam ID".into())
}

fn lobby_id(value: &str) -> Result<LobbyId, String> {
    Ok(LobbyId::from_raw(steam_id(value)?.raw()))
}

fn text(value: &str, limit: usize) -> Result<&str, String> {
    if value.is_empty() || value.len() > limit || value.contains('\0') {
        return Err("Invalid Steamworks string".into());
    }
    Ok(value)
}

fn cloud_name(value: &str) -> Result<&str, String> {
    if value == "." || value == ".." || value.contains(['/', '\\']) {
        return Err("Use a Steam Cloud filename without directories".into());
    }
    text(value, 255)
}

fn lobby_snapshot(client: &Client, lobby: LobbyId) -> Value {
    let matchmaking = client.matchmaking();
    let data: BTreeMap<_, _> = (0..matchmaking.lobby_data_count(lobby))
        .filter_map(|index| matchmaking.lobby_data_by_index(lobby, index))
        .collect();
    let members: Vec<_> = matchmaking
        .lobby_members(lobby)
        .iter()
        .map(|id| id.raw().to_string())
        .collect();
    json!({
        "id": lobby.raw().to_string(),
        "name": data.get("name").map(String::as_str).unwrap_or("Steam Lobby"),
        "ownerId": matchmaking.lobby_owner(lobby).raw().to_string(),
        "maxMembers": matchmaking.lobby_member_limit(lobby).unwrap_or(0),
        "members": members,
        "type": data.get("mf_type").map(String::as_str).unwrap_or("public"),
        "createdAt": data.get("mf_created").and_then(|s| s.parse::<u64>().ok()).unwrap_or(0),
        "data": data,
    })
}

fn set_active_lobby(steam: &Steam, lobby: LobbyId) {
    let old = steam.lobby.lock().unwrap().replace(lobby);
    if let Some(old) = old.filter(|old| *old != lobby) {
        steam.client.matchmaking().leave_lobby(old);
    }
}

async fn wait_for<T: Send + 'static>(rx: mpsc::Receiver<Result<T, String>>) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        rx.recv_timeout(Duration::from_secs(15))
            .map_err(|_| "Steamworks request timed out".to_owned())?
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
pub fn steam_init(app_id: u32) -> Result<Value, String> {
    if app_id == 0 {
        return Err("Configure a Steam AppID".into());
    }
    let _guard = INIT.lock().map_err(|err| err.to_string())?;
    if STEAM.get().is_none() {
        // A Steam-launched process supplies its own identity. init_app also supports local developer runs.
        let client = if !cfg!(feature = "editor") && std::env::var_os("SteamAppId").is_some() {
            Client::init()
        } else {
            Client::init_app(AppId(app_id))
        }
        .map_err(|err| err.to_string())?;
        let lobby = Arc::new(Mutex::new(None::<LobbyId>));
        let args: Vec<_> = std::env::args().collect();
        let startup_invite = args
            .windows(2)
            .find(|arg| arg[0] == "+connect_lobby")
            .and_then(|arg| lobby_id(&arg[1]).ok())
            .map(|lobby| json!({"lobbyId": lobby.raw().to_string(), "friendId": null}));
        let invite = Arc::new(Mutex::new(startup_invite));
        let pending_invite = invite.clone();
        // The registration is process-scoped, like the Steam client.
        std::mem::forget(
            client.register_callback(move |event: GameLobbyJoinRequested| {
                *pending_invite.lock().unwrap() = Some(json!({
                    "lobbyId": event.lobby_steam_id.raw().to_string(),
                    "friendId": event.friend_steam_id.raw().to_string(),
                }));
            }),
        );
        let callback_client = client.clone();
        let callback_lobby = lobby.clone();
        client.networking_utils().init_relay_network_access();
        client
            .networking_messages()
            .session_request_callback(move |request| {
                let lobby = *callback_lobby.lock().unwrap();
                if let (Some(lobby), Some(peer)) = (lobby, request.remote().steam_id()) {
                    if callback_client
                        .matchmaking()
                        .lobby_members(lobby)
                        .contains(&peer)
                    {
                        request.accept();
                    }
                }
            });
        let pump = client.clone();
        std::thread::Builder::new()
            .name("steamworks-callbacks".into())
            .spawn(move || loop {
                pump.run_callbacks();
                std::thread::sleep(Duration::from_millis(10));
            })
            .map_err(|err| err.to_string())?;
        let _ = STEAM.set(Steam {
            client,
            lobby,
            invite,
        });
    }
    let client = &state()?.client;
    let actual_app = client.utils().app_id().0;
    if actual_app != app_id {
        return Err(format!(
            "Steam AppID {actual_app} differs from configured AppID {app_id}. Restart the desktop host to switch AppIDs."
        ));
    }
    Ok(
        json!({ "steamId": client.user().steam_id().raw().to_string(),
        "name": client.friends().name(), "appId": actual_app, "native": true }),
    )
}

#[cfg(feature = "editor")]
#[tauri::command]
pub fn steam_preview_supported() -> bool {
    true
}

#[cfg(feature = "editor")]
#[tauri::command]
pub fn steam_preview_end() -> Result<(), String> {
    let steam = state()?;
    if let Some(lobby) = steam.lobby.lock().unwrap().take() {
        steam.client.matchmaking().leave_lobby(lobby);
    }
    steam.client.friends().clear_rich_presence();
    steam
        .client
        .networking_messages()
        .receive_messages_on_channel(CHANNEL, 64);
    Ok(())
}

#[tauri::command]
pub fn steam_unlock_achievement(id: String) -> Result<bool, String> {
    let stats = state()?.client.user_stats();
    Ok(stats.achievement(text(&id, 127)?).set().is_ok() && stats.store_stats().is_ok())
}

#[tauri::command]
pub fn steam_clear_achievement(id: String) -> Result<bool, String> {
    let stats = state()?.client.user_stats();
    Ok(stats.achievement(text(&id, 127)?).clear().is_ok() && stats.store_stats().is_ok())
}

#[tauri::command]
pub fn steam_has_achievement(id: String) -> Result<bool, String> {
    state()?
        .client
        .user_stats()
        .achievement(text(&id, 127)?)
        .get()
        .map_err(|_| "Steam achievement unavailable".into())
}

#[tauri::command]
pub fn steam_set_rich_presence(key: String, value: String) -> Result<bool, String> {
    let key = text(&key, 63)?;
    let value = if value.is_empty() {
        None
    } else {
        Some(text(&value, 255)?)
    };
    Ok(state()?.client.friends().set_rich_presence(key, value))
}

#[tauri::command]
pub fn steam_clear_rich_presence() -> Result<bool, String> {
    state()?.client.friends().clear_rich_presence();
    Ok(true)
}

#[tauri::command]
pub fn steam_cloud_write(filename: String, content: String) -> Result<bool, String> {
    if content.len() > CLOUD_LIMIT {
        return Err("Steam Cloud file exceeds 8 MiB".into());
    }
    state()?
        .client
        .remote_storage()
        .file(cloud_name(&filename)?)
        .write()
        .write_all(content.as_bytes())
        .map_err(|err| err.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn steam_cloud_read(filename: String) -> Result<Option<String>, String> {
    let file = state()?
        .client
        .remote_storage()
        .file(cloud_name(&filename)?);
    if !file.exists() {
        return Ok(None);
    }
    let mut content = String::new();
    file.read()
        .take(CLOUD_LIMIT as u64 + 1)
        .read_to_string(&mut content)
        .map_err(|err| err.to_string())?;
    if content.len() > CLOUD_LIMIT {
        return Err("Steam Cloud file exceeds 8 MiB".into());
    }
    Ok(Some(content))
}

#[tauri::command]
pub fn steam_cloud_delete(filename: String) -> Result<bool, String> {
    Ok(state()?
        .client
        .remote_storage()
        .file(cloud_name(&filename)?)
        .delete())
}

#[tauri::command]
pub fn steam_cloud_list() -> Result<Vec<String>, String> {
    Ok(state()?
        .client
        .remote_storage()
        .files()
        .into_iter()
        .map(|file| file.name)
        .collect())
}

#[tauri::command]
pub async fn steam_create_lobby(
    max_members: u32,
    lobby_type: String,
    name: String,
    data: Option<BTreeMap<String, String>>,
) -> Result<Value, String> {
    let ty = match lobby_type.as_str() {
        "public" => LobbyType::Public,
        "friends" => LobbyType::FriendsOnly,
        "private" => LobbyType::Private,
        _ => return Err("Invalid Steam lobby visibility".into()),
    };
    text(&name, 255)?;
    let data = data.unwrap_or_default();
    for (key, value) in &data {
        text(key, 254)?;
        text(value, 4095)?;
    }
    let steam = state()?;
    let (tx, rx) = mpsc::channel();
    let client = steam.client.clone();
    steam
        .client
        .matchmaking()
        .create_lobby(ty, max_members.clamp(2, 32), move |result| {
            let result = result.map_err(|err| err.to_string());
            if let Err(err) = tx.send(result) {
                if let Ok(lobby) = err.0 {
                    client.matchmaking().leave_lobby(lobby);
                }
            }
        });
    let lobby = wait_for(rx).await?;
    let matchmaking = steam.client.matchmaking();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let metadata_ok = matchmaking.set_lobby_data(lobby, "mf_type", &lobby_type)
        && matchmaking.set_lobby_data(lobby, "mf_created", &now.to_string())
        && matchmaking.set_lobby_data(lobby, "name", &name)
        && data
            .into_iter()
            .filter(|(key, _)| !["name", "mf_type", "mf_created"].contains(&key.as_str()))
            .all(|(key, value)| matchmaking.set_lobby_data(lobby, &key, &value));
    if !metadata_ok {
        matchmaking.leave_lobby(lobby);
        return Err("Steam rejected lobby metadata".into());
    }
    set_active_lobby(steam, lobby);
    Ok(lobby_snapshot(&steam.client, lobby))
}

#[tauri::command]
pub async fn steam_list_lobbies() -> Result<Vec<Value>, String> {
    let client = &state()?.client;
    let (tx, rx) = mpsc::channel();
    client
        .matchmaking()
        .set_request_lobby_list_distance_filter(DistanceFilter::Worldwide)
        .request_lobby_list(move |result| {
            let _ = tx.send(result.map_err(|err| err.to_string()));
        });
    Ok(wait_for(rx)
        .await?
        .into_iter()
        .map(|lobby| lobby_snapshot(client, lobby))
        .collect())
}

#[tauri::command]
pub async fn steam_join_lobby(lobby_id: String) -> Result<Value, String> {
    let lobby = self::lobby_id(&lobby_id)?;
    let steam = state()?;
    if *steam.lobby.lock().unwrap() == Some(lobby) {
        return Ok(lobby_snapshot(&steam.client, lobby));
    }
    let (tx, rx) = mpsc::channel();
    let client = steam.client.clone();
    steam.client.matchmaking().join_lobby(lobby, move |result| {
        if let Err(err) = tx.send(result.map_err(|_| "Steam refused lobby join".into())) {
            if let Ok(lobby) = err.0 {
                client.matchmaking().leave_lobby(lobby);
            }
        }
    });
    let lobby = wait_for(rx).await?;
    set_active_lobby(steam, lobby);
    Ok(lobby_snapshot(&steam.client, lobby))
}

#[tauri::command]
pub fn steam_leave_lobby(lobby_id: String) -> Result<bool, String> {
    let lobby = self::lobby_id(&lobby_id)?;
    let steam = state()?;
    let mut current = steam.lobby.lock().unwrap();
    if *current != Some(lobby) {
        return Ok(false);
    }
    *current = None;
    steam.client.matchmaking().leave_lobby(lobby);
    Ok(true)
}

#[tauri::command]
pub fn steam_set_lobby_data(lobby_id: String, key: String, value: String) -> Result<bool, String> {
    let lobby = self::lobby_id(&lobby_id)?;
    let steam = state()?;
    if *steam.lobby.lock().unwrap() != Some(lobby) {
        return Ok(false);
    }
    Ok(steam
        .client
        .matchmaking()
        .set_lobby_data(lobby, text(&key, 254)?, text(&value, 4095)?))
}

#[tauri::command]
pub fn steam_send_p2p(to: String, data: String, reliable: Option<bool>) -> Result<bool, String> {
    if data.len() > PACKET_LIMIT {
        return Err("Steam message exceeds 256 KiB".into());
    }
    let steam = state()?;
    let peer = steam_id(&to)?;
    let lobby = steam
        .lobby
        .lock()
        .unwrap()
        .ok_or("Join a Steam lobby first")?;
    if !steam
        .client
        .matchmaking()
        .lobby_members(lobby)
        .contains(&peer)
    {
        return Ok(false);
    }
    let flags = if reliable == Some(false) {
        SendFlags::UNRELIABLE_NO_NAGLE
    } else {
        SendFlags::RELIABLE_NO_NAGLE
    };
    steam
        .client
        .networking_messages()
        .send_message_to_user(
            NetworkingIdentity::new_steam_id(peer),
            flags | SendFlags::AUTO_RESTART_BROKEN_SESSION,
            data.as_bytes(),
            CHANNEL,
        )
        .map_err(|err| err.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn steam_poll_p2p(include_lobby: Option<bool>) -> Result<Value, String> {
    let steam = state()?;
    let invite = if include_lobby == Some(true) {
        steam.invite.lock().unwrap().take()
    } else {
        None
    };
    let Some(lobby) = *steam.lobby.lock().unwrap() else {
        return Ok(json!({"packets": [], "lobby": null, "invite": invite}));
    };
    let members: HashSet<_> = steam
        .client
        .matchmaking()
        .lobby_members(lobby)
        .into_iter()
        .collect();
    let packets: Vec<_> = steam
        .client
        .networking_messages()
        .receive_messages_on_channel(CHANNEL, 64)
        .into_iter()
        .filter_map(|message| {
            let from = message.identity_peer().steam_id()?;
            if !members.contains(&from) || message.data().len() > PACKET_LIMIT {
                return None;
            }
            let data = std::str::from_utf8(message.data()).ok()?;
            Some(json!({"from": from.raw().to_string(), "data": data}))
        })
        .collect();
    let mut result = json!({"packets": packets, "invite": invite});
    if include_lobby == Some(true) {
        result["lobby"] = members
            .contains(&steam.client.user().steam_id())
            .then(|| lobby_snapshot(&steam.client, lobby))
            .unwrap_or(Value::Null);
    }
    Ok(result)
}

#[tauri::command]
pub fn steam_relay_status() -> Result<String, String> {
    Ok(format!(
        "{:?}",
        state()?.client.networking_utils().relay_network_status()
    ))
}

#[tauri::command]
pub fn steam_invite_friends() -> Result<bool, String> {
    let steam = state()?;
    let lobby = steam
        .lobby
        .lock()
        .unwrap()
        .ok_or("Join a Steam lobby first")?;
    if !steam.client.utils().is_overlay_enabled() {
        return Ok(false);
    }
    steam.client.friends().activate_invite_dialog(lobby);
    Ok(true)
}

#[tauri::command]
pub fn steam_read_stat(name: String, floating_point: bool) -> Result<f64, String> {
    let name = text(&name, 127)?;
    let stats = state()?.client.user_stats();
    let result = if floating_point {
        stats.get_stat_f32(name).map(f64::from)
    } else {
        stats.get_stat_i32(name).map(f64::from)
    };
    result.map_err(|_| "Steam stat unavailable or has a different type".into())
}

#[tauri::command]
pub fn steam_write_stat(name: String, value: f64, floating_point: bool) -> Result<bool, String> {
    let name = text(&name, 127)?;
    if !value.is_finite() {
        return Err("Steam stat must be finite".into());
    }
    let stats = state()?.client.user_stats();
    let updated = if floating_point {
        if value.abs() > f32::MAX as f64 {
            return Err("Steam stat is out of range".into());
        }
        stats.set_stat_f32(name, value as f32)
    } else {
        if value.fract() != 0.0 || value < i32::MIN as f64 || value > i32::MAX as f64 {
            return Err("Steam integer stat is out of range".into());
        }
        stats.set_stat_i32(name, value as i32)
    };
    Ok(updated.is_ok() && stats.store_stats().is_ok())
}

#[tauri::command]
pub fn steam_is_dlc_installed(app_id: u32) -> Result<bool, String> {
    Ok(app_id != 0 && state()?.client.apps().is_dlc_installed(AppId(app_id)))
}
