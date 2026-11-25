//! Zero-dependency embedded LAN WebSocket Room Relay + WebRTC Signaling Server
//! + UDP LAN Discovery Beacon for Miniforge Engine Desktop (Tauri v2).
//! Uses ONLY Rust stdlib + tauri::command (no extra Cargo crates, +0 MB overhead).

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use tauri::command;

const DISCOVERY_PORT: u16 = 41234;

#[derive(Clone)]
struct LanServerInfo {
    local_ip: String,
    port: u16,
    url: String,
    room: String,
    game_name: String,
}

impl LanServerInfo {
    fn to_json(&self) -> String {
        format!(
            r#"{{"localIp":"{}","port":{},"url":"{}","room":"{}","gameName":"{}"}}"#,
            escape_json(&self.local_ip),
            self.port,
            escape_json(&self.url),
            escape_json(&self.room),
            escape_json(&self.game_name)
        )
    }
}

struct ServerHandle {
    running: Arc<AtomicBool>,
    info: LanServerInfo,
}

static LAN_SERVER: OnceLock<Mutex<Option<ServerHandle>>> = OnceLock::new();

fn server_slot() -> &'static Mutex<Option<ServerHandle>> {
    LAN_SERVER.get_or_init(|| Mutex::new(None))
}

fn escape_json(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn detect_local_ip() -> String {
    if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
        if sock.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = sock.local_addr() {
                return addr.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

// ---- Minimal stdlib SHA-1 & Base64 for RFC 6455 WebSocket Accept ----
fn sha1(input: &[u8]) -> [u8; 20] {
    let mut h0: u32 = 0x67452301;
    let mut h1: u32 = 0xEFCDAB89;
    let mut h2: u32 = 0x98BADCFE;
    let mut h3: u32 = 0x10325476;
    let mut h4: u32 = 0xC3D2E1F0;

    let bit_len = (input.len() as u64) * 8;
    let mut msg = input.to_vec();
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in msg.chunks(64) {
        let mut w = [0u32; 80];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }
        let (mut a, mut b, mut c, mut d, mut e) = (h0, h1, h2, h3, h4);
        for (i, &wi) in w.iter().enumerate() {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5A827999u32),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1u32),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDCu32),
                _ => (b ^ c ^ d, 0xCA62C1D6u32),
            };
            let temp = a
                .rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(wi);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = temp;
        }
        h0 = h0.wrapping_add(a);
        h1 = h1.wrapping_add(b);
        h2 = h2.wrapping_add(c);
        h3 = h3.wrapping_add(d);
        h4 = h4.wrapping_add(e);
    }
    let mut out = [0u8; 20];
    out[0..4].copy_from_slice(&h0.to_be_bytes());
    out[4..8].copy_from_slice(&h1.to_be_bytes());
    out[8..12].copy_from_slice(&h2.to_be_bytes());
    out[12..16].copy_from_slice(&h3.to_be_bytes());
    out[16..20].copy_from_slice(&h4.to_be_bytes());
    out
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 { TABLE[((n >> 6) & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[(n & 63) as usize] as char } else { '=' });
    }
    out
}

fn encode_ws_text(text: &str) -> Vec<u8> {
    let payload = text.as_bytes();
    let len = payload.len();
    let mut frame = Vec::with_capacity(len + 10);
    frame.push(0x81);
    if len < 126 {
        frame.push(len as u8);
    } else if len < 65536 {
        frame.push(126);
        frame.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        frame.push(127);
        frame.extend_from_slice(&(len as u64).to_be_bytes());
    }
    frame.extend_from_slice(payload);
    frame
}

/// Parse one RFC6455 frame from a buffered TCP stream. Retains incomplete
/// frames across socket read timeouts instead of desynchronizing the stream.
fn read_ws_frame(stream: &mut TcpStream, buffer: &mut Vec<u8>) -> Result<Option<String>, ()> {
    loop {
        if buffer.len() >= 2 {
            let first = buffer[0];
            let opcode = first & 0x0f;
            if first & 0x80 == 0 || buffer[1] & 0x80 == 0 { return Err(()); }
            if !matches!(opcode, 1 | 8 | 9 | 10) { return Err(()); }
            let mut len = (buffer[1] & 0x7f) as usize;
            let mut offset = 2;
            if len == 126 {
                if buffer.len() < 4 { /* need more data */ }
                else { len = u16::from_be_bytes([buffer[2], buffer[3]]) as usize; offset = 4; }
            } else if len == 127 {
                if buffer.len() < 10 { /* need more data */ }
                else {
                    let bytes: [u8; 8] = buffer[2..10].try_into().map_err(|_| ())?;
                    let wide = u64::from_be_bytes(bytes);
                    if wide > 256 * 1024 { return Err(()); }
                    len = wide as usize;
                    offset = 10;
                }
            }
            if len > 256 * 1024 || matches!(opcode, 8 | 9 | 10) && len > 125 { return Err(()); }
            let header_ready = (buffer[1] & 0x7f) < 126 || (buffer[1] & 0x7f) == 126 && buffer.len() >= 4 || buffer.len() >= 10;
            if header_ready && buffer.len() >= offset + 4 + len {
                let mask = [buffer[offset], buffer[offset+1], buffer[offset+2], buffer[offset+3]];
                let mut bytes = buffer[offset+4..offset+4+len].to_vec();
                buffer.drain(..offset+4+len);
                for (i, byte) in bytes.iter_mut().enumerate() { *byte ^= mask[i % 4]; }
                if opcode == 8 { return Err(()); }
                if opcode == 9 {
                    let mut pong = Vec::with_capacity(bytes.len() + 2);
                    pong.extend_from_slice(&[0x8a, bytes.len() as u8]);
                    pong.extend_from_slice(&bytes);
                    let _ = stream.write_all(&pong);
                    continue;
                }
                if opcode == 10 { continue; }
                return String::from_utf8(bytes).map(Some).map_err(|_| ());
            }
        }
        if buffer.len() > 256 * 1024 + 32 { return Err(()); }
        let mut chunk = [0u8; 8192];
        match stream.read(&mut chunk) {
            Ok(0) => return Err(()),
            Ok(n) => buffer.extend_from_slice(&chunk[..n]),
            Err(ref err) if matches!(err.kind(), std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock) => return Ok(None),
            Err(_) => return Err(()),
        }
    }
}

struct ClientEntry {
    socket: TcpStream,
    peer_id: String,
    room: String,
    name: String,
}
type ClientMap = Arc<Mutex<HashMap<usize, ClientEntry>>>;
fn valid_id(s: &str, max: usize) -> bool {
    !s.is_empty() && s.len() <= max && s.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-' | b':'))
}
fn broadcast_to_room(map: &mut HashMap<usize, ClientEntry>, room: &str, message: &str, exclude: usize, to: Option<&str>) {
    let frame = encode_ws_text(message);
    for (id, peer) in map.iter_mut() {
        if *id != exclude && peer.room == room && (to.is_none() || to == Some(peer.peer_id.as_str())) {
            let _ = peer.socket.write_all(&frame);
        }
    }
}
fn send_roster(map: &mut HashMap<usize, ClientEntry>, room: &str) {
    let members: Vec<serde_json::Value> = map.values().filter(|c| c.room == room).map(|c| serde_json::json!({"id": c.peer_id, "name": c.name})).collect();
    let ids: Vec<String> = map.values().filter(|c| c.room == room).map(|c| c.peer_id.clone()).collect();
    let pkt = serde_json::json!({"type":"peer-list","from":"server","room":room,"ts":0,"payload":{"peers":ids,"members":members}}).to_string();
    broadcast_to_room(map, room, &pkt, usize::MAX, None);
}
fn remove_client(id: usize, clients: &ClientMap) {
    if let Ok(mut map) = clients.lock() {
        if let Some(removed) = map.remove(&id) {
            if !removed.room.is_empty() {
                let message = serde_json::json!({"type":"leave","from":removed.peer_id,"room":removed.room,"ts":0}).to_string();
                broadcast_to_room(&mut map, &removed.room, &message, id, None);
                send_roster(&mut map, &removed.room);
            }
        }
    }
}
fn handle_client(mut stream: TcpStream, id: usize, clients: ClientMap, running: Arc<AtomicBool>) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let mut req_buf = Vec::<u8>::new();
    while !req_buf.windows(4).any(|w| w == b"\r\n\r\n") {
        if req_buf.len() > 8192 { return; }
        let mut chunk = [0u8; 2048];
        match stream.read(&mut chunk) { Ok(n) if n > 0 => req_buf.extend_from_slice(&chunk[..n]), _ => return }
    }
    let end = match req_buf.windows(4).position(|w| w == b"\r\n\r\n") { Some(n) => n + 4, None => return };
    let request = String::from_utf8_lossy(&req_buf[..end]);
    if !request.starts_with("GET ") || !request.to_ascii_lowercase().contains("upgrade: websocket") { return; }
    let key = request.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        if name.eq_ignore_ascii_case("Sec-WebSocket-Key") { Some(value.trim().to_string()) } else { None }
    });
    let Some(ws_key) = key else { return };
    if ws_key.len() != 24 || !ws_key.ends_with("==") { return; }
    let accept = base64_encode(&sha1(format!("{}258EAFA5-E914-47DA-95CA-C5AB0DC85B11", ws_key).as_bytes()));
    let response = format!("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {}\r\n\r\n", accept);
    if stream.write_all(response.as_bytes()).is_err() { return; }
    if let Ok(cloned) = stream.try_clone() {
        let _ = cloned.set_write_timeout(Some(Duration::from_millis(300)));
        if let Ok(mut map) = clients.lock() {
            map.insert(id, ClientEntry { socket: cloned, peer_id: String::new(), room: String::new(), name: String::new() });
        }
    }
    let mut frame_buffer = req_buf[end..].to_vec();
    let _ = stream.set_read_timeout(Some(Duration::from_millis(350)));
    let mut rate_started = std::time::Instant::now();
    let mut rate_count = 0u32;
    while running.load(Ordering::Relaxed) {
        let msg = match read_ws_frame(&mut stream, &mut frame_buffer) {
            Ok(Some(msg)) => msg,
            Ok(None) => continue,
            Err(_) => break,
        };
        if rate_started.elapsed() >= Duration::from_secs(1) { rate_started = std::time::Instant::now(); rate_count = 0; }
        rate_count += 1;
        if rate_count > 180 { break; }
        let Ok(pkt) = serde_json::from_str::<serde_json::Value>(&msg) else { break };
        let Some(ty) = pkt.get("type").and_then(|v| v.as_str()) else { break };
        let from = pkt.get("from").and_then(|v| v.as_str()).unwrap_or("");
        let room = pkt.get("room").and_then(|v| v.as_str()).unwrap_or("");
        if let Ok(mut map) = clients.lock() {
            if ty == "join" {
                if !valid_id(from, 100) || !valid_id(room, 80) || map.get(&id).is_some_and(|c| !c.room.is_empty()) || map.values().any(|c| c.room == room && c.peer_id == from) { break; }
                if map.values().filter(|c| c.room == room).count() >= 32 { break; }
                let name = pkt.pointer("/payload/name").and_then(|v| v.as_str()).unwrap_or(from).chars().take(60).collect::<String>();
                if let Some(client) = map.get_mut(&id) { client.peer_id = from.into(); client.room = room.into(); client.name = name; }
                let announced = serde_json::json!({"type":"join","from":from,"room":room,"ts":0,"payload":{"name":map.get(&id).map(|c| c.name.as_str()).unwrap_or(from),"webrtc":pkt.pointer("/payload/webrtc").and_then(|v| v.as_bool()).unwrap_or(false)}}).to_string();
                broadcast_to_room(&mut map, room, &announced, id, None);
                send_roster(&mut map, room);
                continue;
            }
            let registered = map.get(&id).is_some_and(|c| !c.room.is_empty() && c.peer_id == from && c.room == room);
            if !registered || !matches!(ty, "leave" | "ping" | "pong" | "rpc" | "snapshot" | "world-state" | "chat" | "signal") { break; }
            if ty == "leave" { break; }
            let to = pkt.get("to").and_then(|v| v.as_str());
            let outgoing = pkt.to_string();
            broadcast_to_room(&mut map, room, &outgoing, id, to);
        } else { break; }
    }
    remove_client(id, &clients);
}

#[command]
pub fn lan_start_server(
    port: Option<u16>,
    room: Option<String>,
    game_name: Option<String>,
) -> Result<String, String> {
    let mut slot = server_slot().lock().map_err(|_| "Lock error".to_string())?;
    if let Some(existing) = slot.as_ref() {
        if existing.running.load(Ordering::Relaxed) {
            return Ok(existing.info.to_json());
        }
    }

    let bind_port = port.unwrap_or(8765);
    let room_name = room.unwrap_or_else(|| "lobby-1".to_string());
    let gname = game_name.unwrap_or_else(|| "Miniforge Game".to_string());
    let listener = TcpListener::bind(("0.0.0.0", bind_port))
        .map_err(|e| format!("Failed to bind LAN port {}: {}", bind_port, e))?;
    let _ = listener.set_nonblocking(true);

    let local_ip = detect_local_ip();
    let info = LanServerInfo {
        url: format!("ws://{}:{}", local_ip, bind_port),
        local_ip: local_ip.clone(),
        port: bind_port,
        room: room_name.clone(),
        game_name: gname.clone(),
    };

    let running = Arc::new(AtomicBool::new(true));
    let clients: ClientMap = Arc::new(Mutex::new(HashMap::new()));

    let run_tcp = running.clone();
    let clients_tcp = clients.clone();
    thread::spawn(move || {
        let mut next_id: usize = 1;
        while run_tcp.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((stream, _addr)) => {
                    let cid = next_id;
                    next_id += 1;
                    let c_clone = clients_tcp.clone();
                    let r_clone = run_tcp.clone();
                    thread::spawn(move || handle_client(stream, cid, c_clone, r_clone));
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(25));
                }
                Err(_) => break,
            }
        }
    });

    let run_udp = running.clone();
    let clients_udp = clients.clone();
    let info_udp = info.clone();
    thread::spawn(move || {
        if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
            let _ = sock.set_broadcast(true);
            while run_udp.load(Ordering::Relaxed) {
                let count = clients_udp.lock().map(|m| m.len().max(1)).unwrap_or(1);
                let payload = format!(
                    "MF_LAN|{}|{}|{}|{}|{}",
                    info_udp.local_ip, info_udp.port, info_udp.room, info_udp.game_name, count
                );
                let _ = sock.send_to(payload.as_bytes(), ("255.255.255.255", DISCOVERY_PORT));
                thread::sleep(Duration::from_millis(1200));
            }
        }
    });

    let json = info.to_json();
    *slot = Some(ServerHandle { running, info });
    Ok(json)
}

#[command]
pub fn lan_stop_server() -> Result<bool, String> {
    let mut slot = server_slot().lock().map_err(|_| "Lock error".to_string())?;
    if let Some(handle) = slot.take() {
        handle.running.store(false, Ordering::Relaxed);
        return Ok(true);
    }
    Ok(false)
}

#[command]
pub fn lan_discover(timeout_ms: Option<u64>) -> Result<String, String> {
    let wait = Duration::from_millis(timeout_ms.unwrap_or(1400).clamp(250, 5000));
    let sock = UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT))
        .map_err(|e| format!("LAN discovery bind failed: {}", e))?;
    let _ = sock.set_read_timeout(Some(Duration::from_millis(120)));
    let start = std::time::Instant::now();
    let mut found: HashMap<String, String> = HashMap::new();
    let mut buf = [0u8; 512];
    while start.elapsed() < wait {
        if let Ok((n, src)) = sock.recv_from(&mut buf) {
            let msg = String::from_utf8_lossy(&buf[..n]);
            let parts: Vec<&str> = msg.split('|').collect();
            if parts.len() >= 6 && parts[0] == "MF_LAN" {
                let ip = if parts[1].is_empty() {
                    src.ip().to_string()
                } else {
                    parts[1].to_string()
                };
                let port: u16 = parts[2].parse().unwrap_or(8765);
                let players: usize = parts[5].parse().unwrap_or(1);
                let key = format!("{}:{}", ip, port);
                let entry = format!(
                    r#"{{"hostIp":"{}","port":{},"url":"ws://{}:{}","room":"{}","gameName":"{}","players":{}}}"#,
                    escape_json(&ip),
                    port,
                    escape_json(&ip),
                    port,
                    escape_json(parts[3]),
                    escape_json(parts[4]),
                    players
                );
                found.insert(key, entry);
            }
        }
    }
    let items: Vec<String> = found.into_values().collect();
    Ok(format!("[{}]", items.join(",")))
}
