#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::{Local, TimeZone};
use percent_encoding::percent_decode_str;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

const DEFAULT_CHECKLIST: &[&str] = &[
    "Re：ゼロから始める異世界生活　短編集２",
    "Re：ゼロから始める異世界生活　短編集３",
    "Re：ゼロから始める異世界生活　短編集４",
    "Re：ゼロから始める異世界生活　短編集５",
    "Re：ゼロから始める異世界生活　短編集６",
    "Re：ゼロから始める異世界生活　短編集１０",
    "Re：ゼロから始める異世界生活　短編集１１",
    "Re：ゼロから始める異世界生活 Ex6　剣鬼戦歌",
    "Ｒｅ：ゼロから始める異世界生活 大塚真一郎 Art Works　Re：BOX",
    "Ｒｅ：ゼロから始める異世界生活 大塚真一郎 Art Works　Re：BOX 2nd",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ShelfConfig {
    shelf: String,
    #[serde(default)]
    slug: String,
    #[serde(default)]
    name: String,
    #[serde(rename = "categoryLabel", default)]
    category_label: String,
    #[serde(rename = "filterLabel", default)]
    filter_label: String,
}

impl ShelfConfig {
    fn normalized(mut self, idx: usize) -> Self {
        if self.slug.trim().is_empty() {
            self.slug = format!("shelf_{}", idx + 1);
        }
        if self.name.trim().is_empty() {
            self.name = self.shelf.clone();
        }
        if self.category_label.trim().is_empty() {
            self.category_label = self.name.clone();
        }
        if self.filter_label.trim().is_empty() {
            self.filter_label = self.name.to_uppercase();
        }
        self
    }
}

fn default_shelves() -> Vec<ShelfConfig> {
    vec![
        ShelfConfig {
            shelf: "Re:ゼロ".to_string(),
            slug: "main".to_string(),
            name: "Main Novels".to_string(),
            category_label: "本編 (Main Novels)".to_string(),
            filter_label: "本編 (MAIN)".to_string(),
        },
        ShelfConfig {
            shelf: "Re:ゼロ 短編集".to_string(),
            slug: "tanpenshuu".to_string(),
            name: "Tanpenshuu (短編集)".to_string(),
            category_label: "短編集 (Tanpenshuu)".to_string(),
            filter_label: "短編集 (TANPENSHUU)".to_string(),
        },
        ShelfConfig {
            shelf: "Re:ゼロ Ex".to_string(),
            slug: "ex".to_string(),
            name: "EX Novels".to_string(),
            category_label: "Ex (EX Novels)".to_string(),
            filter_label: "EX (EX NOVELS)".to_string(),
        },
        ShelfConfig {
            shelf: "Re:ゼロ 小編集".to_string(),
            slug: "shouhenshuu".to_string(),
            name: "Shouhenshuu (小編集)".to_string(),
            category_label: "小編集 (Shouhenshuu)".to_string(),
            filter_label: "小編集 (ART BOX)".to_string(),
        },
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DeadlineGoal {
    #[serde(rename = "dueDate")]
    due_date: String,
    #[serde(rename = "startDate")]
    start_date: String,
    #[serde(rename = "startRemainingChars")]
    start_remaining_chars: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AppConfig {
    #[serde(rename = "hoshiReaderDir", default)]
    hoshi_reader_dir: Option<String>,
    #[serde(default = "default_shelves")]
    shelves: Vec<ShelfConfig>,
    #[serde(rename = "deadlineGoal", default)]
    deadline_goal: Option<DeadlineGoal>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            hoshi_reader_dir: None,
            shelves: default_shelves(),
            deadline_goal: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChecklistPayload {
    name: String,
    stems: Vec<String>,
}

fn resolve_app_file(filename: &str) -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let exe_file = dir.join(filename);
            if exe_file.exists() {
                return exe_file;
            }
        }
    }
    let release_file = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.join("release").join(filename));
    if let Some(ref p) = release_file {
        if p.exists() {
            return p.clone();
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            return dir.join(filename);
        }
    }
    release_file.unwrap_or_else(|| PathBuf::from(filename))
}

fn load_config() -> AppConfig {
    let path = resolve_app_file("config.json");
    if let Ok(raw) = fs::read_to_string(&path) {
        if let Ok(mut parsed) = serde_json::from_str::<AppConfig>(&raw) {
            if parsed.shelves.is_empty() {
                parsed.shelves = default_shelves();
            } else {
                parsed.shelves = parsed
                    .shelves
                    .into_iter()
                    .enumerate()
                    .map(|(i, s)| s.normalized(i))
                    .collect();
            }
            return parsed;
        }
    }
    let default_cfg = AppConfig::default();
    if let Ok(body) = serde_json::to_string_pretty(&default_cfg) {
        let _ = fs::write(&path, body);
    }
    default_cfg
}

fn find_hoshi_in_parent(parent: &Path) -> Option<PathBuf> {
    let direct = parent.join("Hoshi Reader");
    if direct.join("state").is_dir() {
        return Some(direct);
    }
    if let Ok(entries) = fs::read_dir(parent) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let candidate = path.join("Hoshi Reader");
                if candidate.join("state").is_dir() {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

fn discover_hoshi_reader_dir(config: &AppConfig) -> PathBuf {
    // 1. Explicit config override
    if let Some(ref custom) = config.hoshi_reader_dir {
        let trimmed = custom.trim();
        if !trimmed.is_empty() {
            let p = PathBuf::from(trimmed);
            if p.join("state").is_dir() {
                return p;
            }
            if p.is_dir() && p.file_name().and_then(|n| n.to_str()) == Some("state") {
                if let Some(parent) = p.parent() {
                    return parent.to_path_buf();
                }
            }
        }
    }

    // 2. Scan drive roots (prioritizing G..Z where Google Drive mounts, then C..F)
    let drive_order = "GHIJKLMNOPQRSTUVWXYZDEF C";
    for ch in drive_order.chars() {
        if !ch.is_ascii_alphabetic() {
            continue;
        }
        let root = PathBuf::from(format!("{}:\\", ch));
        if !root.exists() {
            continue;
        }
        if let Some(found) = find_hoshi_in_parent(&root) {
            return found;
        }
    }

    // 3. Check %USERPROFILE% for mirrored Google Drive folders in any language
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        let up = PathBuf::from(user_profile);
        if let Some(found) = find_hoshi_in_parent(&up) {
            return found;
        }
        if let Ok(entries) = fs::read_dir(&up) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    if let Some(found) = find_hoshi_in_parent(&p) {
                        return found;
                    }
                }
            }
        }
    }

    // Fallback default
    PathBuf::from(r"G:\Meu Drive\Hoshi Reader")
}

fn resolve_hoshi_dirs(config: &AppConfig) -> (PathBuf, PathBuf) {
    let base = discover_hoshi_reader_dir(config);
    (base.join("state"), base.join("books"))
}

fn load_available_shelves(state_dir: &Path) -> Vec<String> {
    let shelves_file = state_dir.join(".shelves.json");
    if let Ok(raw) = fs::read_to_string(shelves_file) {
        if let Ok(val) = serde_json::from_str::<Value>(&raw) {
            if let Some(obj) = val.get("shelves").and_then(|v| v.as_object()) {
                let mut pairs: Vec<(String, i64)> = obj
                    .iter()
                    .map(|(k, v)| (k.clone(), val_i64(v.get("value"))))
                    .collect();
                pairs.sort_by_key(|(_, order)| *order);
                return pairs.into_iter().map(|(k, _)| k).collect();
            }
        }
    }
    Vec::new()
}

fn load_checklist() -> ChecklistPayload {
    let path = resolve_app_file("checklist.json");
    if let Ok(raw) = fs::read_to_string(&path) {
        if let Ok(parsed) = serde_json::from_str::<ChecklistPayload>(&raw) {
            return parsed;
        }
    }
    ChecklistPayload {
        name: "Road to Volume 21".to_string(),
        stems: DEFAULT_CHECKLIST.iter().map(|s| (*s).to_string()).collect(),
    }
}

fn normalize_text(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '０'..='９' => char::from_u32(c as u32 - '０' as u32 + '0' as u32).unwrap_or(c),
            _ => c,
        })
        .collect()
}

fn first_number_in(s: &str) -> i64 {
    let mut num_str = String::new();
    for ch in s.chars() {
        if ch.is_ascii_digit() {
            num_str.push(ch);
        } else if !num_str.is_empty() {
            break;
        }
    }
    num_str.parse::<i64>().unwrap_or(0)
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

#[derive(Clone, Serialize)]
struct BookEntry {
    stem: String,
    title: String,
    series: String,
    #[serde(rename = "totalChars")]
    total_chars: i64,
    #[serde(rename = "bookmarkChars")]
    bookmark_chars: i64,
    #[serde(rename = "readChars")]
    read_chars: i64,
    #[serde(rename = "remainingChars")]
    remaining_chars: i64,
    #[serde(rename = "progressPct")]
    progress_pct: f64,
    status: String,
    #[serde(rename = "sessionChars")]
    session_chars: i64,
    #[serde(rename = "readingTimeSec")]
    reading_time_sec: f64,
    #[serde(rename = "firstStartedAt")]
    first_started_at: Option<i64>,
    #[serde(rename = "lastEndedAt")]
    last_ended_at: Option<i64>,
    generation: i64,
    #[serde(rename = "coverFile")]
    cover_file: String,
}

#[derive(Clone, Serialize)]
struct SeriesBucket {
    shelf: String,
    slug: String,
    name: String,
    #[serde(rename = "categoryLabel")]
    category_label: String,
    #[serde(rename = "filterLabel")]
    filter_label: String,
    books: Vec<BookEntry>,
    #[serde(rename = "totalBooks")]
    total_books: usize,
    #[serde(rename = "totalChars")]
    total_chars: i64,
    #[serde(rename = "readChars")]
    read_chars: i64,
    #[serde(rename = "remainingChars")]
    remaining_chars: i64,
    #[serde(rename = "progressPct")]
    progress_pct: f64,
    #[serde(rename = "completedBooks")]
    completed_books: usize,
    #[serde(rename = "inProgressBooks")]
    in_progress_books: usize,
    #[serde(rename = "unreadBooks")]
    unread_books: usize,
    #[serde(rename = "readingTimeSec")]
    reading_time_sec: f64,
}

#[derive(Clone, Serialize)]
struct SessionEntry {
    stem: String,
    title: String,
    series: String,
    #[serde(rename = "startedAt")]
    started_at: i64,
    #[serde(rename = "endedAt")]
    ended_at: i64,
    #[serde(rename = "charactersRead")]
    characters_read: i64,
    #[serde(rename = "readingTime")]
    reading_time: f64,
}

#[derive(Clone, Serialize)]
struct DailyEntry {
    date: String,
    chars: i64,
    #[serde(rename = "readingTimeSec")]
    reading_time_sec: f64,
    sessions: usize,
}

fn val_i64(v: Option<&Value>) -> i64 {
    match v {
        Some(Value::Number(n)) => n
            .as_i64()
            .or_else(|| n.as_f64().map(|f| f as i64))
            .unwrap_or(0),
        Some(Value::String(s)) => s.parse::<i64>().unwrap_or(0),
        _ => 0,
    }
}

fn val_f64(v: Option<&Value>) -> f64 {
    match v {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(Value::String(s)) => s.parse::<f64>().unwrap_or(0.0),
        _ => 0.0,
    }
}

#[tauri::command]
fn get_rezero_data() -> Value {
    let config = load_config();
    let (state_dir, _) = resolve_hoshi_dirs(&config);
    let state_dir_str = state_dir.to_string_lossy().to_string();

    let mut series_map: BTreeMap<String, SeriesBucket> = BTreeMap::new();
    for sc in &config.shelves {
        series_map.insert(
            sc.slug.clone(),
            SeriesBucket {
                shelf: sc.shelf.clone(),
                slug: sc.slug.clone(),
                name: sc.name.clone(),
                category_label: sc.category_label.clone(),
                filter_label: sc.filter_label.clone(),
                books: Vec::new(),
                total_books: 0,
                total_chars: 0,
                read_chars: 0,
                remaining_chars: 0,
                progress_pct: 0.0,
                completed_books: 0,
                in_progress_books: 0,
                unread_books: 0,
                reading_time_sec: 0.0,
            },
        );
    }

    if !state_dir.exists() {
        return json!({
            "error": format!("State directory not found: {}", state_dir_str)
        });
    }

    let mut all_sessions: Vec<SessionEntry> = Vec::new();

    if let Ok(entries) = fs::read_dir(&state_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_string();
            if !fname.ends_with(".json") || fname == ".shelves.json" {
                continue;
            }

            let raw = match fs::read_to_string(entry.path()) {
                Ok(s) => s,
                Err(_) => continue,
            };
            let data: Value = match serde_json::from_str(&raw) {
                Ok(v) => v,
                Err(_) => continue,
            };

            if data.get("deleted").and_then(|v| v.as_bool()).unwrap_or(false) {
                continue;
            }

            let mut matched_slug: Option<String> = None;
            if let Some(shelves_obj) = data.get("shelves").and_then(|v| v.as_object()) {
                'outer: for k in shelves_obj.keys() {
                    for sc in &config.shelves {
                        if k == &sc.shelf {
                            matched_slug = Some(sc.slug.clone());
                            break 'outer;
                        }
                    }
                }
            }

            let slug = match matched_slug {
                Some(s) => s,
                None => continue,
            };

            let stem = fname[..fname.len() - 5].to_string();
            let title = data
                .get("metadata")
                .and_then(|m| m.get("value"))
                .and_then(|v| v.get("title"))
                .and_then(|t| t.as_str())
                .filter(|s| !s.is_empty())
                .unwrap_or(&stem)
                .to_string();

            let total_chars = val_i64(data.get("characterCount"));

            let mut bm_chars = 0i64;
            let mut bm_modified = 0i64;
            if let Some(bm_obj) = data.get("bookmark").and_then(|v| v.as_object()) {
                bm_modified = val_i64(bm_obj.get("modified"));
                if let Some(bm_val) = bm_obj.get("value").and_then(|v| v.as_object()) {
                    bm_chars = val_i64(bm_val.get("characterCount"));
                }
            }

            let is_completed = total_chars > 0
                && (bm_chars >= total_chars || (bm_chars > 0 && (total_chars - bm_chars) <= 100));
            let is_in_progress = !is_completed && bm_chars > 0;
            let read_chars = if is_completed {
                total_chars
            } else {
                bm_chars.min(total_chars)
            };
            let rem_chars = (total_chars - read_chars).max(0);

            let mut book_sess_chars = 0i64;
            let mut book_sess_sec = 0.0f64;
            let mut first_started: Option<i64> = None;
            let mut last_ended: Option<i64> = None;

            if let Some(sessions_obj) = data.get("sessions").and_then(|v| v.as_object()) {
                for s in sessions_obj.values() {
                    let val = match s.get("value").and_then(|v| v.as_object()) {
                        Some(v) => v,
                        None => continue,
                    };
                    let sc = val_i64(val.get("charactersRead"));
                    let st = val_f64(val.get("readingTime"));
                    let started_at = val_i64(val.get("startedAt"));
                    let ended_at = val_i64(val.get("endedAt"));

                    book_sess_chars += sc;
                    book_sess_sec += st;

                    if started_at > 0 && (first_started.is_none() || Some(started_at) < first_started) {
                        first_started = Some(started_at);
                    }
                    if ended_at > 0 && (last_ended.is_none() || Some(ended_at) > last_ended) {
                        last_ended = Some(ended_at);
                    }

                    if ended_at > 0 {
                        all_sessions.push(SessionEntry {
                            stem: stem.clone(),
                            title: title.clone(),
                            series: slug.clone(),
                            started_at,
                            ended_at,
                            characters_read: sc,
                            reading_time: st,
                        });
                    }
                }
            }

            let generation = {
                let g = val_i64(data.get("generation"));
                if g > 0 { g } else { 1 }
            };
            let cover_file = data
                .get("files")
                .and_then(|f| f.get("cover"))
                .and_then(|c| c.get("value"))
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .unwrap_or("cover.jpeg")
                .to_string();

            let status = if is_completed {
                "completed"
            } else if is_in_progress {
                "in_progress"
            } else {
                "unread"
            };

            let progress_pct = if total_chars > 0 {
                round2(read_chars as f64 / total_chars as f64 * 100.0)
            } else {
                0.0
            };

            let last_ended_at = last_ended.or_else(|| {
                if is_completed && bm_modified > 0 {
                    Some(bm_modified)
                } else {
                    None
                }
            });

            let book_entry = BookEntry {
                stem,
                title,
                series: slug.clone(),
                total_chars,
                bookmark_chars: bm_chars,
                read_chars,
                remaining_chars: rem_chars,
                progress_pct,
                status: status.to_string(),
                session_chars: book_sess_chars,
                reading_time_sec: round1(book_sess_sec),
                first_started_at: first_started,
                last_ended_at,
                generation,
                cover_file,
            };

            if let Some(bucket) = series_map.get_mut(&slug) {
                bucket.books.push(book_entry);
                bucket.total_chars += total_chars;
                bucket.read_chars += read_chars;
                bucket.remaining_chars += rem_chars;
                bucket.reading_time_sec += book_sess_sec;
                if is_completed {
                    bucket.completed_books += 1;
                } else if is_in_progress {
                    bucket.in_progress_books += 1;
                } else {
                    bucket.unread_books += 1;
                }
            }
        }
    }

    let mut series_list: Vec<SeriesBucket> = Vec::new();
    for sc in &config.shelves {
        if let Some(mut sb) = series_map.remove(&sc.slug) {
            sb.books.sort_by(|a, b| {
                let norm_a = normalize_text(&format!("{} {}", a.title, a.stem));
                let norm_b = normalize_text(&format!("{} {}", b.title, b.stem));
                let num_a = first_number_in(&norm_a);
                let num_b = first_number_in(&norm_b);
                (num_a, norm_a).cmp(&(num_b, norm_b))
            });
            sb.total_books = sb.books.len();
            sb.progress_pct = if sb.total_chars > 0 {
                round2(sb.read_chars as f64 / sb.total_chars as f64 * 100.0)
            } else {
                0.0
            };
            sb.reading_time_sec = round1(sb.reading_time_sec);
            series_list.push(sb);
        }
    }

    all_sessions.sort_by_key(|s| s.ended_at);

    let mut daily_map: BTreeMap<String, DailyEntry> = BTreeMap::new();
    for sess in &all_sessions {
        if let Some(dt) = Local.timestamp_millis_opt(sess.ended_at).single() {
            let dt_str = dt.format("%Y-%m-%d").to_string();
            let entry = daily_map.entry(dt_str.clone()).or_insert(DailyEntry {
                date: dt_str,
                chars: 0,
                reading_time_sec: 0.0,
                sessions: 0,
            });
            entry.chars += sess.characters_read;
            entry.reading_time_sec += sess.reading_time;
            entry.sessions += 1;
        }
    }

    let daily_history: Vec<DailyEntry> = daily_map.into_values().collect();

    let total_chars: i64 = series_list.iter().map(|s| s.total_chars).sum();
    let read_chars: i64 = series_list.iter().map(|s| s.read_chars).sum();
    let rem_chars = total_chars - read_chars;
    let total_books: usize = series_list.iter().map(|s| s.total_books).sum();
    let completed_books: usize = series_list.iter().map(|s| s.completed_books).sum();
    let in_progress_books: usize = series_list.iter().map(|s| s.in_progress_books).sum();
    let total_time_sec: f64 = series_list.iter().map(|s| s.reading_time_sec).sum();

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let available_shelves = load_available_shelves(&state_dir);

    json!({
        "generatedAt": now_ms,
        "stateDir": state_dir_str,
        "availableShelves": available_shelves,
        "config": config,
        "overall": {
            "totalChars": total_chars,
            "readChars": read_chars,
            "remainingChars": rem_chars,
            "progressPct": if total_chars > 0 { round2(read_chars as f64 / total_chars as f64 * 100.0) } else { 0.0 },
            "totalBooks": total_books,
            "completedBooks": completed_books,
            "inProgressBooks": in_progress_books,
            "unreadBooks": total_books.saturating_sub(completed_books + in_progress_books),
            "readingTimeSec": round1(total_time_sec),
        },
        "series": series_list,
        "sessions": all_sessions,
        "dailyHistory": daily_history,
        "checklist": load_checklist(),
    })
}

#[tauri::command]
fn save_checklist(payload: ChecklistPayload) -> Result<Value, String> {
    let path = resolve_app_file("checklist.json");
    let body = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    fs::write(&path, body).map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn save_config(payload: AppConfig) -> Result<Value, String> {
    let path = resolve_app_file("config.json");
    let body = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    fs::write(&path, body).map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn save_deadline_goal(payload: Option<DeadlineGoal>) -> Result<Value, String> {
    let mut config = load_config();
    config.deadline_goal = payload;
    let path = resolve_app_file("config.json");
    let body = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, body).map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true, "config": config }))
}

fn parse_query_param(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        let k = parts.next().unwrap_or("");
        let v = parts.next().unwrap_or("");
        if k == key {
            let replaced = v.replace('+', " ");
            return Some(
                percent_decode_str(&replaced)
                    .decode_utf8_lossy()
                    .to_string(),
            );
        }
    }
    None
}

fn state_dir_signature(state_dir: &Path) -> (usize, u128) {
    let mut count = 0usize;
    let mut max_mtime = 0u128;
    if let Ok(entries) = fs::read_dir(state_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_string();
            if !fname.ends_with(".json") {
                continue;
            }
            count += 1;
            if let Ok(meta) = entry.metadata() {
                if let Ok(modified) = meta.modified() {
                    if let Ok(dur) = modified.duration_since(UNIX_EPOCH) {
                        let ms = dur.as_millis();
                        if ms > max_mtime {
                            max_mtime = ms;
                        }
                    }
                }
            }
        }
    }
    (count, max_mtime)
}

fn main() {
    if std::env::args().any(|a| a == "--dump-json") {
        let data = get_rezero_data();
        println!("{}", serde_json::to_string(&data).unwrap_or_default());
        return;
    }

    tauri::Builder::default()
        .register_uri_scheme_protocol("rezero", |_ctx, request| {
            let config = load_config();
            let (_, books_dir) = resolve_hoshi_dirs(&config);

            let uri = request.uri();
            let query = uri.query().unwrap_or("");
            let stem = parse_query_param(query, "stem").unwrap_or_default();
            let gen = parse_query_param(query, "gen").unwrap_or_else(|| "1".to_string());
            let cfile = parse_query_param(query, "file").unwrap_or_else(|| "cover.jpeg".to_string());

            let book_folder = books_dir.join(&stem).join(&gen);
            let candidates = [
                book_folder.join(&cfile),
                book_folder.join("cover.jpeg"),
                book_folder.join("cover.jpg"),
                book_folder.join("cover.png"),
            ];

            for cpath in candidates {
                if cpath.is_file() {
                    if let Ok(bytes) = fs::read(&cpath) {
                        let ext = cpath
                            .extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or("jpeg")
                            .to_lowercase();
                        let mime = if ext == "png" {
                            "image/png"
                        } else {
                            "image/jpeg"
                        };
                        return tauri::http::Response::builder()
                            .status(200)
                            .header("Content-Type", mime)
                            .header("Access-Control-Allow-Origin", "*")
                            .header("Cache-Control", "max-age=3600")
                            .body(bytes)
                            .unwrap();
                    }
                }
            }

            tauri::http::Response::builder()
                .status(404)
                .header("Access-Control-Allow-Origin", "*")
                .body(Vec::new())
                .unwrap()
        })
        .setup(|app| {
            let handle = app.handle().clone();
            thread::spawn(move || {
                let mut last_sig = (0usize, 0u128);
                loop {
                    let config = load_config();
                    let (state_dir, _) = resolve_hoshi_dirs(&config);
                    let current_sig = state_dir_signature(&state_dir);
                    if last_sig == (0, 0) {
                        last_sig = current_sig;
                    } else if current_sig != last_sig && current_sig.0 > 0 {
                        last_sig = current_sig;
                        let _ = handle.emit("state-updated", ());
                    }
                    thread::sleep(Duration::from_secs(3));
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_rezero_data,
            save_checklist,
            save_config,
            save_deadline_goal
        ])
        .run(tauri::generate_context!())
        .expect("error while running Re:Zero Reading Archive Tauri application");
}
