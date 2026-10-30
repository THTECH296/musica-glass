#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Música: lê a pasta do iTunes (e outras que o usuário adicionar), com as tags e capas de cada arquivo,
// e serve o áudio e as capas para a interface por protocolos próprios.

use lofty::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex, OnceLock, RwLock,
    },
    time::UNIX_EPOCH,
};
use tauri::{
    http::{Request, Response},
    AppHandle, Emitter, Manager, UriSchemeResponder,
};
use tauri_plugin_dialog::DialogExt;

const AUDIO_EXT: &[&str] = &["mp3", "m4a", "aac", "flac", "wav", "ogg", "opus", "wma", "aiff", "aif", "alac"];

#[derive(Serialize, Deserialize, Clone, Default)]
struct Track {
    id: String,
    path: String,
    title: String,
    artist: String,
    #[serde(default)]
    album: String,
    #[serde(default, rename = "albumArtist")]
    album_artist: String,
    #[serde(default)]
    genre: String,
    #[serde(default)]
    year: u32,
    #[serde(default)]
    track: u32,
    #[serde(default)]
    disc: u32,
    #[serde(default)]
    dur: f64,
    #[serde(default)]
    bitrate: u32,
    size: u64,
    mtime: i64,
    #[serde(default)]
    added: i64,
    #[serde(default)]
    art: bool,
    #[serde(default)]
    lyrics: bool,
    fmt: String,
}

static PATHS: OnceLock<RwLock<HashMap<String, PathBuf>>> = OnceLock::new();
static ROOT: OnceLock<PathBuf> = OnceLock::new();

fn paths() -> &'static RwLock<HashMap<String, PathBuf>> {
    PATHS.get_or_init(|| RwLock::new(HashMap::new()))
}
fn root() -> &'static PathBuf {
    ROOT.get().expect("root")
}
fn remember(items: &[Track]) {
    let mut m = paths().write().unwrap();
    for t in items {
        m.insert(t.id.clone(), PathBuf::from(&t.path));
    }
}
fn path_of(id: &str) -> Result<PathBuf, String> {
    paths().read().unwrap().get(id).cloned().ok_or_else(|| "Música não encontrada".into())
}

fn id_for(p: &Path) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in p.to_string_lossy().to_lowercase().bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", h)
}
fn ext_of(p: &Path) -> String {
    p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}
fn secs(t: std::time::SystemTime) -> i64 {
    t.duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// "Bring Me To Life_spotdown.org" → "Bring Me To Life"
fn clean_stem(stem: &str) -> String {
    let mut s = stem.to_string();
    for suf in ["_spotdown.org", " (spotdown.org)", "_spotdown"] {
        if let Some(x) = s.strip_suffix(suf) {
            s = x.to_string();
        }
    }
    s.trim().to_string()
}

fn read_track(p: &Path, size: u64, mtime: i64, added: i64) -> Track {
    let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let mut t = Track {
        id: id_for(p),
        path: p.to_string_lossy().to_string(),
        title: clean_stem(&stem),
        size,
        mtime,
        added,
        fmt: ext_of(p).to_uppercase(),
        ..Default::default()
    };
    // "Artista - Título" no nome do arquivo, quando não há tags
    if let Some((a, b)) = t.title.split_once(" - ") {
        if !a.is_empty() && !b.is_empty() && !b.contains("Remaster") && !b.contains("Remix") && !b.contains("Rework") {
            t.artist = a.trim().to_string();
            t.title = b.trim().to_string();
        }
    }
    if let Ok(f) = lofty::read_from_path(p) {
        let props = f.properties();
        t.dur = props.duration().as_secs_f64();
        t.bitrate = props.audio_bitrate().unwrap_or(0);
        if let Some(tag) = f.primary_tag().or_else(|| f.first_tag()) {
            let s = |k: &ItemKey| tag.get_string(k).map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
            if let Some(v) = s(&ItemKey::TrackTitle) {
                t.title = v;
            }
            if let Some(v) = s(&ItemKey::TrackArtist) {
                t.artist = v;
            }
            t.album = s(&ItemKey::AlbumTitle).unwrap_or_default();
            t.album_artist = s(&ItemKey::AlbumArtist).unwrap_or_default();
            t.genre = s(&ItemKey::Genre).unwrap_or_default();
            t.year = s(&ItemKey::Year)
                .or_else(|| s(&ItemKey::RecordingDate))
                .and_then(|v| v.get(..4).and_then(|y| y.parse().ok()))
                .unwrap_or(0);
            t.track = s(&ItemKey::TrackNumber).and_then(|v| v.split('/').next().and_then(|n| n.trim().parse().ok())).unwrap_or(0);
            t.disc = s(&ItemKey::DiscNumber).and_then(|v| v.split('/').next().and_then(|n| n.trim().parse().ok())).unwrap_or(0);
            t.art = !tag.pictures().is_empty();
            t.lyrics = s(&ItemKey::Lyrics).is_some();
        }
    }
    if t.artist.is_empty() {
        t.artist = "Artista Desconhecido".into();
    }
    t
}

fn index_file() -> PathBuf {
    root().join("biblioteca.json")
}

fn scan(app: &AppHandle, folders: &[String]) -> Vec<Track> {
    let cache: HashMap<String, Track> = fs::read(index_file())
        .ok()
        .and_then(|b| serde_json::from_slice::<Vec<Track>>(&b).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|t| (t.path.clone(), t))
        .collect();
    let mut seen = HashSet::new();
    let mut files = Vec::new();
    for folder in folders {
        for e in walkdir::WalkDir::new(folder).into_iter().filter_entry(|e| !e.file_name().to_string_lossy().starts_with('.')).flatten() {
            if !e.file_type().is_file() || !AUDIO_EXT.contains(&ext_of(e.path()).as_str()) {
                continue;
            }
            let Ok(md) = e.metadata() else { continue };
            if md.len() < 32 * 1024 || !seen.insert(e.path().to_string_lossy().to_lowercase()) {
                continue;
            }
            let mtime = md.modified().map(secs).unwrap_or(0);
            files.push((e.path().to_path_buf(), md.len(), mtime, md.created().map(secs).unwrap_or(mtime)));
        }
    }
    let total = files.len();
    let next = AtomicUsize::new(0);
    let out = Mutex::new(Vec::with_capacity(total));
    let _ = app.emit("scan-progress", (0usize, total));
    std::thread::scope(|s| {
        for _ in 0..std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(2, 8) {
            s.spawn(|| loop {
                let i = next.fetch_add(1, Ordering::Relaxed);
                if i >= total {
                    break;
                }
                let (p, size, mtime, added) = &files[i];
                let t = match cache.get(&p.to_string_lossy().to_string()) {
                    Some(c) if c.size == *size && c.mtime == *mtime => c.clone(),
                    _ => read_track(p, *size, *mtime, *added),
                };
                out.lock().unwrap().push(t);
                if i % 100 == 0 {
                    let _ = app.emit("scan-progress", (i, total));
                }
            });
        }
    });
    let mut items = out.into_inner().unwrap();
    items.sort_by(|a, b| a.path.cmp(&b.path));
    if let Ok(j) = serde_json::to_vec(&items) {
        let tmp = index_file().with_extension("tmp");
        if fs::write(&tmp, j).is_ok() {
            let _ = fs::rename(tmp, index_file());
        }
    }
    items
}

// ---------- protocolos ----------

fn respond(r: UriSchemeResponder, status: u16, mime: &str, body: Vec<u8>, extra: &[(&str, String)]) {
    let mut b = Response::builder()
        .status(status)
        .header("Content-Type", mime)
        .header("Access-Control-Allow-Origin", "*")
        .header("Cache-Control", "max-age=3600");
    for (k, v) in extra {
        b = b.header(*k, v);
    }
    r.respond(b.body(body).unwrap());
}

fn id_from(req: &Request<Vec<u8>>) -> String {
    req.uri().path().trim_start_matches('/').to_string()
}

/// capa embutida no arquivo
fn capa_protocol(req: Request<Vec<u8>>, r: UriSchemeResponder) {
    let id = id_from(&req);
    std::thread::spawn(move || {
        let pic = path_of(&id).ok().and_then(|p| lofty::read_from_path(p).ok()).and_then(|f| {
            let tag = f.primary_tag().or_else(|| f.first_tag())?;
            let pics = tag.pictures();
            let pic = pics.iter().find(|p| p.pic_type() == lofty::picture::PictureType::CoverFront).or(pics.first())?;
            Some((pic.mime_type().map(|m| m.as_str().to_string()).unwrap_or("image/jpeg".into()), pic.data().to_vec()))
        });
        match pic {
            Some((m, b)) => respond(r, 200, &m, b, &[]),
            None => respond(r, 404, "text/plain", vec![], &[]),
        }
    });
}

fn mime(ext: &str) -> &'static str {
    match ext {
        "mp3" => "audio/mpeg",
        "m4a" | "aac" | "alac" => "audio/mp4",
        "flac" => "audio/flac",
        "wav" => "audio/wav",
        "ogg" | "opus" => "audio/ogg",
        "aiff" | "aif" => "audio/aiff",
        "wma" => "audio/x-ms-wma",
        _ => "application/octet-stream",
    }
}

/// áudio com suporte a Range (avançar/voltar na música)
fn audio_protocol(req: Request<Vec<u8>>, r: UriSchemeResponder) {
    let Ok(p) = path_of(&id_from(&req)) else {
        return respond(r, 404, "text/plain", vec![], &[]);
    };
    let range = req.headers().get("range").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    std::thread::spawn(move || {
        let Ok(mut f) = fs::File::open(&p) else {
            return respond(r, 404, "text/plain", vec![], &[]);
        };
        let len = f.metadata().map(|m| m.len()).unwrap_or(0);
        let m = mime(&ext_of(&p));
        let spec = range.as_deref().and_then(|s| s.strip_prefix("bytes=")).unwrap_or("0-");
        let (a, b) = spec.split_once('-').unwrap_or((spec, ""));
        let start: u64 = a.parse().unwrap_or(0).min(len.saturating_sub(1));
        let end: u64 = b.parse().unwrap_or(u64::MAX).min(start + 2 * 1024 * 1024 - 1).min(len.saturating_sub(1));
        let mut buf = vec![0u8; (end - start + 1) as usize];
        let _ = f.seek(SeekFrom::Start(start));
        let _ = f.read_exact(&mut buf);
        respond(r, 206, m, buf, &[("Accept-Ranges", "bytes".into()), ("Content-Range", format!("bytes {start}-{end}/{len}"))]);
    });
}

// ---------- comandos ----------

#[tauri::command]
fn load_state() -> Value {
    fs::read(root().join("estado.json")).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or(Value::Null)
}

#[tauri::command]
fn save_state(state: Value) -> Result<(), String> {
    let f = root().join("estado.json");
    let tmp = f.with_extension("tmp");
    fs::write(&tmp, serde_json::to_vec(&state).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::rename(tmp, f).map_err(|e| e.to_string())
}

#[tauri::command]
fn default_folders(app: AppHandle) -> Vec<String> {
    let Ok(music) = app.path().audio_dir() else { return vec![] };
    let itunes = music.join("iTunes");
    vec![if itunes.is_dir() { itunes } else { music }.to_string_lossy().to_string()]
}

#[tauri::command]
fn cached_index() -> Vec<Track> {
    let items: Vec<Track> = fs::read(index_file()).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    remember(&items);
    items
}

#[tauri::command]
async fn scan_library(app: AppHandle, folders: Vec<String>) -> Vec<Track> {
    tauri::async_runtime::spawn_blocking(move || {
        let items = scan(&app, &folders);
        remember(&items);
        items
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
async fn pick_folder(app: AppHandle) -> Option<String> {
    app.dialog().file().set_title("Escolha uma pasta de músicas").blocking_pick_folder().map(|p| p.to_string())
}

#[tauri::command]
fn reveal(id: String) -> Result<(), String> {
    let p = path_of(&id)?;
    std::process::Command::new("explorer").arg(format!("/select,{}", p.display())).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_path(path: String) {
    let _ = std::process::Command::new("explorer").arg(path).spawn();
}

/// letra guardada nas tags do arquivo (USLT/©lyr)
#[tauri::command]
fn embedded_lyrics(id: String) -> Option<String> {
    let f = lofty::read_from_path(path_of(&id).ok()?).ok()?;
    let tag = f.primary_tag().or_else(|| f.first_tag())?;
    tag.get_string(&ItemKey::Lyrics).map(|s| s.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol("capa", |_c, req, r| capa_protocol(req, r))
        .register_asynchronous_uri_scheme_protocol("audio", |_c, req, r| audio_protocol(req, r))
        .setup(|app| {
            let dir = app.path().app_local_data_dir()?;
            fs::create_dir_all(&dir)?;
            let _ = ROOT.set(dir);
            let h = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(2500));
                if let Some(w) = h.get_webview_window("main") {
                    if !w.is_visible().unwrap_or(true) {
                        let _ = w.show();
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            default_folders,
            cached_index,
            scan_library,
            pick_folder,
            reveal,
            open_path,
            embedded_lyrics
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Música");
}
