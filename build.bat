@echo off
setlocal
cd /d "%~dp0"

set "PATH=%USERPROFILE%\.cargo\bin;%USERPROFILE%\.local-tools\mingw64\bin;%PATH%"

echo [1/3] Closing any running instance of rezero-tracker.exe...
taskkill /F /IM rezero-tracker.exe >nul 2>&1

echo [2/3] Building Tauri release binary...
cd src-tauri
cargo build --release
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed!
    pause
    exit /b 1
)
cd ..

echo [3/3] Updating release\ folder and launching app...
if not exist "release" mkdir "release"
copy /Y "src-tauri\target\release\rezero-tracker.exe" "release\rezero-tracker.exe" >nul
copy /Y "src-tauri\target\release\WebView2Loader.dll" "release\WebView2Loader.dll" >nul

start "" "release\rezero-tracker.exe"
echo Done!
