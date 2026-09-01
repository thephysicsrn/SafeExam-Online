@echo off
setlocal EnableDelayedExpansion
title SafeExam Secure Browser - SESI Escola

set "TARGET_URL=https://adaptativo-sesi.educat.net.br"
if not "%~1"=="" set "TARGET_URL=%~1"

set "EXE_PATH=%~dp0SafeExamBlocker.exe"

if not exist "!EXE_PATH!" (
    set "EXE_PATH=%TEMP%\SafeExamBlocker.exe"
)

if not exist "!EXE_PATH!" (
    echo [SafeExam] Inicializando modulo de blindagem de teclado...
    curl -s -L "https://raw.githubusercontent.com/thephysicsrn/SafeExam-Online/main/SafeExamBlocker.exe" -o "!EXE_PATH!" 2>nul
    if not exist "!EXE_PATH!" (
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://raw.githubusercontent.com/thephysicsrn/SafeExam-Online/main/SafeExamBlocker.exe', '!EXE_PATH!')" 2>nul
    )
)

if exist "!EXE_PATH!" (
    start "" "!EXE_PATH!" "%TARGET_URL%"
    exit /b 0
)

REM Fallback se nao houver conexao
set "BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"

if defined BROWSER (
    start "" /max "!BROWSER!" --kiosk "%TARGET_URL%" --edge-kiosk-type=fullscreen --no-first-run --no-default-browser-check --disable-pinch --disable-translate --app="%TARGET_URL%"
) else (
    start "" /max msedge.exe --kiosk "%TARGET_URL%" --edge-kiosk-type=fullscreen --no-first-run --no-default-browser-check --disable-pinch --disable-translate --app="%TARGET_URL%"
)

exit /b 0
