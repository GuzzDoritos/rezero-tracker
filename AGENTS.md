# AGENTS.md — Re:Zero Reading Archive (Tauri v2 Desktop App)

## Overview
A standalone native Windows desktop application built with **Tauri v2** (Rust backend + vanilla HTML/CSS/JS frontend) that tracks reading progress, pace projections, milestones, and daily session history for light novels read in **Hoshi Reader** (defaulting to *Re:Zero*).

## Data Sources & Configuration
- **Runtime Bundle & Config (`release/` directory, gitignored):**
  - Compiled binary (`rezero-tracker.exe`), loader (`WebView2Loader.dll`), and user runtime JSON files (`config.json` and `checklist.json`) reside together in `release/` (next to the executable) and are excluded from version control via `.gitignore`.
  - If `config.json` is absent on first launch, the binary automatically creates it next to `.exe` with default settings.
- **Configuration (`release/config.json`):**
  - `hoshiReaderDir`: Optional explicit path override to the `Hoshi Reader` folder (or `null` for automatic discovery).
  - `shelves`: Configurable list of Hoshi Reader shelves (`{ shelf, slug, name, categoryLabel, filterLabel }`). Defaults to the 4 *Re:Zero* shelves (`Re:ゼロ`, `Re:ゼロ 短編集`, `Re:ゼロ Ex`, `Re:ゼロ 小編集`). Only `"shelf"` is required when adding a new shelf; other fields auto-populate if omitted.
- **Language- & Drive-Independent Hoshi Reader Auto-Discovery:**
  - When `hoshiReaderDir` is `null`, `discover_hoshi_reader_dir()` in `src-tauri/src/main.rs` automatically scans drive letters (`G:\`..`Z:\`, `D:\`..`F:\`, `C:\`) and `%USERPROFILE%` for any `<drive>\<localized-google-drive-folder>\Hoshi Reader\state` directory.
  - Works seamlessly across any OS/Google Drive language (`Meu Drive`, `My Drive`, `Mi unidad`, `マイドライブ`, `Mon Drive`, `Meine Ablage`, etc.) and any mounted drive letter.
- **Checklist Persistence:** `release/checklist.json` (next to `rezero-tracker.exe`).

## Project Structure
```text
rezero-tracker/
├── .gitignore                  # Ignores release/, target/, dist/, gen/, *.exe, *.dll, runtime .json
├── AGENTS.md                   # Project architecture & build documentation
├── build.bat                   # One-click Windows build + run script
├── index.html                  # UI markup (Editorial light theme)
├── style.css                   # Styling (Cinzel, Shippori Mincho, Noto Sans JP)
├── app.js                      # Frontend logic (invokes Tauri commands & listens to events)
├── release/                    # [GITIGNORED] Standalone distribution & runtime config folder
│   ├── rezero-tracker.exe      # Built release executable
│   ├── WebView2Loader.dll      # Required runtime loader DLL next to rezero-tracker.exe
│   ├── config.json             # User configuration (Hoshi Reader path & shelves)
│   └── checklist.json          # Persisted target milestone name & book stems
└── src-tauri/
    ├── Cargo.toml              # Rust dependencies & release profile settings
    ├── Cargo.lock              # Locked Rust dependency versions
    ├── build.rs                # Syncs ../index.html, ../app.js, ../style.css into ./dist/ before build
    ├── tauri.conf.json         # Tauri v2 window, bundle, and global API configuration
    ├── capabilities/
    │   └── default.json        # Tauri v2 IPC permissions
    ├── icons/                  # App icons (.png and .ico)
    └── src/
        └── main.rs             # Rust backend: auto-discovery, get_rezero_data, save_checklist, save_config, cover protocol, file watcher
```

## Architecture & IPC
1. **Tauri Commands (`src-tauri/src/main.rs`):**
   - `get_rezero_data() -> Value`: Auto-discovers (or reads configured) `Hoshi Reader/state`, aggregates series/overall stats for the configured shelves, reads `.shelves.json` (`availableShelves`), and loads `checklist.json` and `config.json`.
   - `save_checklist(payload: ChecklistPayload)`: Saves `{ name, stems }` to `checklist.json` next to the executable.
   - `save_config(payload: AppConfig)`: Saves `{ hoshiReaderDir, shelves }` to `config.json` next to the executable.
2. **Custom URI Scheme Protocol (`rezero://`):**
   - Registered via `.register_uri_scheme_protocol("rezero", ...)`.
   - Accessed from the WebView2 frontend at `http://rezero.localhost/cover?stem=...&gen=...&file=...` to stream book covers directly from the resolved `Hoshi Reader/books` folder.
3. **Live File Watcher:**
   - A background thread in `main.rs` checks the resolved `state` directory metadata every 3 seconds and emits the `"state-updated"` Tauri event whenever Hoshi Reader writes or updates a state file.
4. **Frontend Sync (`src-tauri/build.rs`):**
   - Always edit `index.html`, `app.js`, and `style.css` in the **project root**.
   - `src-tauri/build.rs` automatically copies them into `src-tauri/dist/` during `cargo build`. Do not edit files inside `src-tauri/dist/` directly.

## Toolchain & Building on This Machine
Rust (`stable-x86_64-pc-windows-gnu`) and portable MinGW-w64 (`16.2.0`) are installed in user space (no Admin required):
- **Cargo / Rust:** `%USERPROFILE%\.cargo\bin`
- **MinGW-w64:** `%USERPROFILE%\.local-tools\mingw64\bin`

To build and launch `release/rezero-tracker.exe`, simply double-click **`build.bat`** in the project root (or run `.\build.bat` in PowerShell).

Manual PowerShell equivalent:
```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:USERPROFILE\.local-tools\mingw64\bin;$env:PATH"
Set-Location "c:\Users\gustavo.bragada\Downloads\rezero-tracker\src-tauri"
cargo build --release
New-Item -ItemType Directory -Force -Path "..\release" | Out-Null
Copy-Item "target\release\rezero-tracker.exe", "target\release\WebView2Loader.dll" -Destination "..\release\" -Force
```

## CLI Verification Flag
Because the binary is compiled with `windows_subsystem = "windows"`, stdout is detached unless redirected. You can verify the backend JSON output from PowerShell without opening a GUI window using `--dump-json`:
```powershell
Start-Process -FilePath ".\release\rezero-tracker.exe" -ArgumentList "--dump-json" -NoNewWindow -Wait -RedirectStandardOutput "dump.json"
```
