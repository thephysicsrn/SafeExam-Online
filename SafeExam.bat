@echo off
setlocal EnableDelayedExpansion
title SafeExam Secure Browser - SESI Escola

set "TARGET_URL=https://adaptativo-sesi.educat.net.br"
if not "%~1"=="" set "TARGET_URL=%~1"

set "EXE_FILE=%TEMP%\SafeExam_Launcher.exe"

if exist "!EXE_FILE!" (
    start "" "!EXE_FILE!" "%TARGET_URL%"
    exit /b 0
)

REM 1. Localiza o Compilador C# Embutido do Windows (Pre-instalado em 100% dos PCs Windows)
set "CSC="
if exist "%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" set "CSC=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not defined CSC if exist "%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\csc.exe" set "CSC=%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\csc.exe"

set "CS_SRC=%TEMP%\SafeExam_Src.cs"
(
echo using System;
echo using System.Diagnostics;
echo using System.IO;
echo using System.Runtime.InteropServices;
echo using System.Windows.Forms;
echo class SafeExamApp {
echo     private const int WH_KEYBOARD_LL = 13;
echo     private static IntPtr _hookID = IntPtr.Zero;
echo     private static LowLevelKeyboardProc _proc = HookCallback;
echo     private static Process _browserProcess = null;
echo     [STAThread]
echo     static void Main^(string[] args^) {
echo         string targetUrl = ^(args != null ^&^& args.Length ^> 0 ^&^& !string.IsNullOrEmpty^(args[0]^)^) ? args[0] : "https://adaptativo-sesi.educat.net.br";
echo         _hookID = SetHook^(_proc^);
echo         LaunchBrowser^(targetUrl^);
echo         Application.Run^(^);
echo         if ^(_hookID != IntPtr.Zero^) { UnhookWindowsHookEx^(_hookID^); _hookID = IntPtr.Zero; }
echo     }
echo     private static void LaunchBrowser^(string url^) {
echo         try {
echo             string browser = null;
echo             string progX86 = Environment.GetEnvironmentVariable^("ProgramFiles(x86)"^);
echo             string prog = Environment.GetEnvironmentVariable^("ProgramFiles"^);
echo             string localApp = Environment.GetFolderPath^(Environment.SpecialFolder.LocalApplicationData^);
echo             string[] paths = new string[] {
echo                 Path.Combine^(progX86 ?? "", @"Microsoft\Edge\Application\msedge.exe"^),
echo                 Path.Combine^(prog ?? "", @"Microsoft\Edge\Application\msedge.exe"^),
echo                 Path.Combine^(localApp ?? "", @"Microsoft\Edge\Application\msedge.exe"^),
echo                 Path.Combine^(prog ?? "", @"Google\Chrome\Application\chrome.exe"^),
echo                 Path.Combine^(progX86 ?? "", @"Google\Chrome\Application\chrome.exe"^),
echo                 Path.Combine^(localApp ?? "", @"Google\Chrome\Application\chrome.exe"^)
echo             };
echo             foreach ^(string p in paths^) {
echo                 if ^(!string.IsNullOrEmpty^(p^) ^&^& File.Exists^(p^)^) { browser = p; break; }
echo             }
echo             string profile = Path.Combine^(Path.GetTempPath^(^), "SafeExam_Kiosk_" + Guid.NewGuid^(^).ToString^("N"^)^);
echo             string kioskArgs = string.Format^("--kiosk \"{0}\" --edge-kiosk-type=fullscreen --no-first-run --no-default-browser-check --disable-pinch --disable-translate --user-data-dir=\"{1}\" --app=\"{0}\"", url, profile^);
echo             ProcessStartInfo psi;
echo             if ^(!string.IsNullOrEmpty^(browser^)^) { psi = new ProcessStartInfo^(browser, kioskArgs^); }
echo             else { psi = new ProcessStartInfo^("cmd.exe", "/c start \"\" msedge.exe " + kioskArgs^); psi.CreateNoWindow = true; psi.UseShellExecute = false; }
echo             _browserProcess = Process.Start^(psi^);
echo             if ^(_browserProcess != null^) {
echo                 _browserProcess.EnableRaisingEvents = true;
echo                 _browserProcess.Exited += ^(s, e^) =^> {
echo                     if ^(_hookID != IntPtr.Zero^) { UnhookWindowsHookEx^(_hookID^); _hookID = IntPtr.Zero; }
echo                     Application.Exit^(^);
echo                 };
echo             }
echo         } catch { }
echo     }
echo     private static IntPtr SetHook^(LowLevelKeyboardProc proc^) {
echo         using ^(Process curProcess = Process.GetCurrentProcess^(^)^)
echo         using ^(ProcessModule curModule = curProcess.MainModule^) {
echo             return SetWindowsHookEx^(WH_KEYBOARD_LL, proc, GetModuleHandle^(curModule.ModuleName^), 0^);
echo         }
echo     }
echo     private delegate IntPtr LowLevelKeyboardProc^(int nCode, IntPtr wParam, IntPtr lParam^);
echo     private static IntPtr HookCallback^(int nCode, IntPtr wParam, IntPtr lParam^) {
echo         if ^(nCode ^>= 0^) {
echo             int vkCode = Marshal.ReadInt32^(lParam^);
echo             int flags = Marshal.ReadInt32^(lParam, 8^);
echo             bool alt = ^(flags ^& 0x20^) != 0 ^|^| ^(GetAsyncKeyState^(0x12^) ^& 0x8000^) != 0;
echo             bool ctrl = ^(GetAsyncKeyState^(0x11^) ^& 0x8000^) != 0;
echo             bool shift = ^(GetAsyncKeyState^(0x10^) ^& 0x8000^) != 0;
echo             if ^(ctrl ^&^& alt ^&^& shift ^&^& vkCode == 0x7B^) {
echo                 if ^(_hookID != IntPtr.Zero^) { UnhookWindowsHookEx^(_hookID^); _hookID = IntPtr.Zero; }
echo                 Application.Exit^(^);
echo                 return ^(IntPtr^)1;
echo             }
echo             if ^(ctrl ^&^& shift ^&^& vkCode == 0x1B^) return ^(IntPtr^)1;
echo             if ^(vkCode == 0x5B ^|^| vkCode == 0x5C^) return ^(IntPtr^)1;
echo             if ^(alt ^&^& vkCode == 0x09^) return ^(IntPtr^)1;
echo             if ^(alt ^&^& vkCode == 0x1B^) return ^(IntPtr^)1;
echo             if ^(alt ^&^& vkCode == 0x20^) return ^(IntPtr^)1;
echo             if ^(alt ^&^& vkCode == 0x73^) return ^(IntPtr^)1;
echo             if ^(ctrl ^&^& vkCode == 0x1B^) return ^(IntPtr^)1;
echo             if ^(vkCode == 0x2C^) return ^(IntPtr^)1;
echo             if ^(vkCode ^>= 0x70 ^&^& vkCode ^<= 0x7B^) return ^(IntPtr^)1;
echo         }
echo         return CallNextHookEx^(_hookID, nCode, wParam, lParam^);
echo     }
echo     [DllImport^("user32.dll"^)] private static extern IntPtr SetWindowsHookEx^(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId^);
echo     [DllImport^("user32.dll"^)] private static extern bool UnhookWindowsHookEx^(IntPtr hhk^);
echo     [DllImport^("user32.dll"^)] private static extern IntPtr CallNextHookEx^(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam^);
echo     [DllImport^("kernel32.dll"^)] private static extern IntPtr GetModuleHandle^(string lpModuleName^);
echo     [DllImport^("user32.dll"^)] private static extern short GetAsyncKeyState^(int vKey^);
echo }
) > "%CS_SRC%"

if defined CSC (
    "%CSC%" /nologo /target:winexe /out:"!EXE_FILE!" /r:System.Windows.Forms.dll,System.Drawing.dll "%CS_SRC%" >nul 2>&1
    del /f /q "%CS_SRC%" >nul 2>&1
)

if exist "!EXE_FILE!" (
    start "" "!EXE_FILE!" "%TARGET_URL%"
    exit /b 0
)

REM Fallback Direto caso csc nao esteja no PATH
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
