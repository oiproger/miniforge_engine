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

fn read_ws_frame(stream: &mut TcpStream) -> Option<String> {
    let mut header = [0u8; 2];
    stream.read_exact(&mut header).ok()?;
    let opcode = header[0] & 0x0f;
    if opcode == 0x8 {
        return None;
    }
    let masked = (header[1] & 0x80) != 0;
    let mut len = (header[1] & 0x7f) as usize;
    if len == 126 {
        let mut ext = [0u8; 2];
        stream.read_exact(&mut ext).ok()?;
        len = u16::from_be_bytes(ext) as usize;
    } else if len == 127 {
        let mut ext = [0u8; 8];
        stream.read_exact(&mut ext).ok()?;
        len = u64::from_be_bytes(ext) as usize;
    }
    if len > 2 * 1024 * 1024 {
        return None;
    }
    let mut mask = [0u8; 4];
    if masked {
        stream.read_exact(&mut mask).ok()?;
    }
    let mut data = vec![0u8; len];
    stream.read_exact(&mut data).ok()?;
    if masked {
        for (i, b) in data.iter_mut().enumerate() {
            *b ^= mask[i % 4];
        }
    }
    if opcode == 0x9 {
        let _ = stream.write_all(&[0x8a, 0x00]);
        return Some(String::new());
    }
    if opcode != 0x1 {
        return Some(String::new());
    }
    String::from_utf8(data).ok()
}

type ClientMap = Arc<Mutex<HashMap<usize, TcpStream>>>;

fn handle_client(mut stream: TcpStream, id: usize, clients: ClientMap, running: Arc<AtomicBool>) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
    let mut req_buf = [0u8; 4096];
    let n = match stream.read(&mut req_buf) {
        Ok(n) if n > 0 => n,
        _ => return,
    };
    let req_str = String::from_utf8_lossy(&req_buf[..n]);
    let key = req_str.lines().find_map(|line| {
        let mut parts = line.splitn(2, ':');
        let k = parts.next()?.trim();
        let v = parts.next()?.trim();
        if k.eq_ignore_ascii_case("Sec-WebSocket-Key") {
            Some(v.to_string())
        } else {
            None
        }
    });
    let Some(ws_key) = key else { return };
    let accept_src = format!("{}258EAFA5-E914-47DA-95CA-C5AB0DC85B11", ws_key);
    let accept = base64_encode(&sha1(accept_src.as_bytes()));
    let resp = format!(
        "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {}\r\n\r\n",
        accept
    );
    if stream.write_all(resp.as_bytes()).is_err() {
        return;
    }

    if let Ok(cloned) = stream.try_clone() {
        if let Ok(mut map) = clients.lock() {
            map.insert(id, cloned);
        }
    }

    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    while running.load(Ordering::Relaxed) {
        match read_ws_frame(&mut stream) {
            Some(msg) => {
                if msg.is_empty() {
                    continue;
                }
                let frame = encode_ws_text(&msg);
                if let Ok(mut map) = clients.lock() {
                    let mut dead = Vec::new();
                    for (&cid, sock) in map.iter_mut() {
                        if cid == id {
                            continue;
                        }
                        if sock.write_all(&frame).is_err() {
                            dead.push(cid);
                        }
                    }
                    for d in dead {
                        map.remove(&d);
                    }
                }
            }
            None => {
                let mut peek = [0u8; 1];
                match stream.peek(&mut peek) {
                    Err(ref e)
                        if e.kind() == std::io::ErrorKind::WouldBlock
                            || e.kind() == std::io::ErrorKind::TimedOut =>
                    {
                        continue
                    }
                    _ => break,
                }
            }
        }
    }
    if let Ok(mut map) = clients.lock() {
        map.remove(&id);
    }
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
