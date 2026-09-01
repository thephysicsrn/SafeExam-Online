@echo off
title SafeExam Secure Browser - SESI Escola
chcp 65001 >nul 2>&1
cls
echo ========================================================
echo   SafeExam Secure Browser — SESI Escola
echo   Iniciando Plataforma Educat SESI em Tela Cheia...
echo ========================================================

:: Cria diretório temporário isolado para a sessão do aluno
set "PROFILE_DIR=%TEMP%\SafeExam_Session_%RANDOM%_%RANDOM%"
mkdir "%PROFILE_DIR%" >nul 2>&1

:: 1. Busca caminho do Microsoft Edge no Windows 64-bit e 32-bit
set "BROWSER_PATH="

if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_PATH=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
)
if not defined BROWSER_PATH if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_PATH=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
)
if not defined BROWSER_PATH if exist "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_PATH=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"
)
if not defined BROWSER_PATH if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
)
if not defined BROWSER_PATH if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_PATH=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)

:: 2. Fallback para Google Chrome se Edge não for encontrado
if not defined BROWSER_PATH if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
)
if not defined BROWSER_PATH if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
)
if not defined BROWSER_PATH if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_PATH=%LocalAppData%\Google\Chrome\Application\chrome.exe"
)

:: URL padrão de avaliação do Educat SESI
set "EXAM_URL=https://adaptativo-sesi.educat.net.br"
if not "%~1"=="" set "EXAM_URL=%~1"

:: 3. Inicia o Chromium em Modo Kiosk 100% Tela Cheia
if defined BROWSER_PATH (
    start "" /max "%BROWSER_PATH%" --kiosk "%EXAM_URL%" --edge-kiosk-type=fullscreen --no-first-run --no-default-browser-check --disable-pinch --disable-translate --user-data-dir="%PROFILE_DIR%" --app="%EXAM_URL%"
) else (
    start "" /max msedge.exe --kiosk "%EXAM_URL%" --edge-kiosk-type=fullscreen --no-first-run --no-default-browser-check --disable-pinch --disable-translate --user-data-dir="%PROFILE_DIR%" --app="%EXAM_URL%"
)

:: Atalho para fechar quando terminar: Alt + F4
exit
