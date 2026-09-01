@echo off
setlocal EnableDelayedExpansion

set "TARGET_URL=https://adaptativo-sesi.educat.net.br"
if not "%~1"=="" set "TARGET_URL=%~1"

set "BROWSER="

REM 1. Microsoft Edge (Padrao no Windows 10 e 11)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
    goto :LAUNCH
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
    goto :LAUNCH
)
if exist "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"
    goto :LAUNCH
)

REM 2. Google Chrome
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
    goto :LAUNCH
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
    goto :LAUNCH
)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
    goto :LAUNCH
)

:LAUNCH
if defined BROWSER (
    start "" /max "!BROWSER!" --kiosk "%TARGET_URL%" --edge-kiosk-type=fullscreen --no-first-run --no-default-browser-check --disable-pinch --disable-translate --app="%TARGET_URL%"
) else (
    start "" /max msedge.exe --kiosk "%TARGET_URL%" --edge-kiosk-type=fullscreen --no-first-run --no-default-browser-check --disable-pinch --disable-translate --app="%TARGET_URL%"
)

exit /b 0
