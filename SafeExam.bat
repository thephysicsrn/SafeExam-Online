@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title SafeExam Online - SESI Escola

set "TARGET_URL=https://adaptativo-sesi.educat.net.br"
if not "%~1"=="" set "TARGET_URL=%~1"

set "EXE_FILE=%TEMP%\SafeExamGuard_SESI.exe"
set "CS_FILE=%TEMP%\SafeExamGuard_SESI.cs"

REM 1. Localiza o Compilador C# do Windows (Pre-instalado)
set "CSC="
if exist "%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" set "CSC=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not defined CSC if exist "%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\csc.exe" set "CSC=%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\csc.exe"

if not exist "!EXE_FILE!" (
    (
        echo using System;
        echo using System.Diagnostics;
        echo using System.Drawing;
        echo using System.IO;
        echo using System.Runtime.InteropServices;
        echo using System.Windows.Forms;
        echo.
        echo class SafeExamGuard : Form
        echo {
        echo     private const int WH_KEYBOARD_LL = 13;
        echo     private const int WM_KEYDOWN = 0x0100;
        echo     private const int WM_SYSKEYDOWN = 0x0104;
        echo     private const int VK_TAB = 0x09;
        echo     private const int VK_ESCAPE = 0x1B;
        echo     private const int VK_SPACE = 0x20;
        echo     private const int VK_SNAPSHOT = 0x2C;
        echo     private const int VK_LWIN = 0x5B;
        echo     private const int VK_RWIN = 0x5C;
        echo     private const int VK_F4 = 0x73;
        echo     private const int VK_F12 = 0x7B;
        echo     private const int VK_SHIFT = 0x10;
        echo     private const int VK_CONTROL = 0x11;
        echo     private const int VK_MENU = 0x12;
        echo.
        echo     private static IntPtr _hookID = IntPtr.Zero;
        echo     private static LowLevelKeyboardProc _proc = HookCallback;
        echo     private static SafeExamGuard _instance = null;
        echo     private static bool _isBlocked = false;
        echo     private static string _blockReason = "";
        echo.
        echo     private Label lblTitle;
        echo     private Label lblReason;
        echo     private Label lblInstruction;
        echo     private TextBox txtPassword;
        echo     private Button btnUnlock;
        echo     private Label lblError;
        echo.
        echo     public SafeExamGuard^(string targetUrl^)
        echo     {
        echo         _instance = this;
        echo         this.FormBorderStyle = FormBorderStyle.None;
        echo         this.WindowState = FormWindowState.Maximized;
        echo         this.TopMost = true;
        echo         this.BackColor = Color.FromArgb^(20, 20, 25^);
        echo         this.ShowInTaskbar = false;
        echo         this.Opacity = 0.98;
        echo.
        echo         Panel panel = new Panel^(^);
        echo         panel.Size = new Size^(600, 420^);
        echo         panel.Location = new Point^(^(Screen.PrimaryScreen.Bounds.Width - 600^) / 2, ^(Screen.PrimaryScreen.Bounds.Height - 420^) / 2^);
        echo         panel.BackColor = Color.FromArgb^(30, 30, 38^);
        echo         panel.BorderStyle = BorderStyle.FixedSingle;
        echo.
        echo         lblTitle = new Label^(^);
        echo         lblTitle.Text = "[!] PROVA BLOQUEADA";
        echo         lblTitle.ForeColor = Color.FromArgb^(239, 68, 68^);
        echo         lblTitle.Font = new Font^("Arial", 22, FontStyle.Bold^);
        echo         lblTitle.TextAlign = ContentAlignment.MiddleCenter;
        echo         lblTitle.Size = new Size^(580, 50^);
        echo         lblTitle.Location = new Point^(10, 25^);
        echo.
        echo         lblReason = new Label^(^);
        echo         lblReason.Text = "Infracao detectada: Tentativa de usar atalho proibido.";
        echo         lblReason.ForeColor = Color.White;
        echo         lblReason.Font = new Font^("Arial", 12, FontStyle.Regular^);
        echo         lblReason.TextAlign = ContentAlignment.MiddleCenter;
        echo         lblReason.Size = new Size^(580, 45^);
        echo         lblReason.Location = new Point^(10, 85^);
        echo.
        echo         lblInstruction = new Label^(^);
        echo         lblInstruction.Text = "Aguarde o aplicador vir ate sua mesa para realizar o desbloqueio.";
        echo         lblInstruction.ForeColor = Color.FromArgb^(160, 160, 175^);
        echo         lblInstruction.Font = new Font^("Arial", 11, FontStyle.Regular^);
        echo         lblInstruction.TextAlign = ContentAlignment.MiddleCenter;
        echo         lblInstruction.Size = new Size^(580, 35^);
        echo         lblInstruction.Location = new Point^(10, 140^);
        echo.
        echo         Label lblPass = new Label^(^);
        echo         lblPass.Text = "Senha do Aplicador:";
        echo         lblPass.ForeColor = Color.White;
        echo         lblPass.Font = new Font^("Arial", 11, FontStyle.Bold^);
        echo         lblPass.Location = new Point^(100, 200^);
        echo         lblPass.Size = new Size^(400, 25^);
        echo.
        echo         txtPassword = new TextBox^(^);
        echo         txtPassword.PasswordChar = '*';
        echo         txtPassword.Font = new Font^("Arial", 14^);
        echo         txtPassword.Location = new Point^(100, 230^);
        echo         txtPassword.Size = new Size^(400, 35^);
        echo.
        echo         btnUnlock = new Button^(^);
        echo         btnUnlock.Text = "[*] Desbloquear Prova";
        echo         btnUnlock.Font = new Font^("Arial", 12, FontStyle.Bold^);
        echo         btnUnlock.BackColor = Color.FromArgb^(239, 68, 68^);
        echo         btnUnlock.ForeColor = Color.White;
        echo         btnUnlock.FlatStyle = FlatStyle.Flat;
        echo         btnUnlock.Location = new Point^(100, 285^);
        echo         btnUnlock.Size = new Size^(400, 45^);
        echo         btnUnlock.Click += BtnUnlock_Click;
        echo.
        echo         lblError = new Label^(^);
        echo         lblError.Text = "";
        echo         lblError.ForeColor = Color.FromArgb^(239, 68, 68^);
        echo         lblError.Font = new Font^("Arial", 10, FontStyle.Bold^);
        echo         lblError.TextAlign = ContentAlignment.MiddleCenter;
        echo         lblError.Location = new Point^(100, 345^);
        echo         lblError.Size = new Size^(400, 30^);
        echo.
        echo         panel.Controls.Add^(lblTitle^);
        echo         panel.Controls.Add^(lblReason^);
        echo         panel.Controls.Add^(lblInstruction^);
        echo         panel.Controls.Add^(lblPass^);
        echo         panel.Controls.Add^(txtPassword^);
        echo         panel.Controls.Add^(btnUnlock^);
        echo         panel.Controls.Add^(lblError^);
        echo.
        echo         this.Controls.Add^(panel^);
        echo         this.Visible = false;
        echo.
        echo         LaunchBrowser^(targetUrl^);
        echo     }
        echo.
        echo     private void BtnUnlock_Click^(object sender, EventArgs e^)
        echo     {
        echo         string pwd = txtPassword.Text.Trim^(^);
        echo         if ^(pwd.Length ^>= 4^)
        echo         {
        echo             _isBlocked = false;
        echo             this.Hide^(^);
        echo             txtPassword.Text = "";
        echo             lblError.Text = "";
        echo         }
        echo         else
        echo         {
        echo             lblError.Text = "Senha incorreta!";
        echo         }
        echo     }
        echo.
        echo     public static void TriggerLock^(string reason^)
        echo     {
        echo         if ^(_instance == null^) return;
        echo         _isBlocked = true;
        echo         _blockReason = reason;
        echo.        
        echo         try
        echo         {
        echo             _instance.Invoke^(^(MethodInvoker^)delegate {
        echo                 _instance.lblReason.Text = "Infracao detectada: " + reason;
        echo                 _instance.Show^(^);
        echo                 _instance.BringToFront^(^);
        echo                 _instance.TopMost = true;
        echo                 _instance.txtPassword.Focus^(^);
        echo             }^);
        echo         }
        echo         catch { }
        echo     }
        echo.
        echo     private static IntPtr SetHook^(LowLevelKeyboardProc proc^)
        echo     {
        echo         using ^(Process curProcess = Process.GetCurrentProcess^(^)^)
        echo         using ^(ProcessModule curModule = curProcess.MainModule^)
        echo         {
        echo             return SetWindowsHookEx^(WH_KEYBOARD_LL, proc, GetModuleHandle^(curModule.ModuleName^), 0^);
        echo         }
        echo     }
        echo.
        echo     private delegate IntPtr LowLevelKeyboardProc^(int nCode, IntPtr wParam, IntPtr lParam^);
        echo.
        echo     private static IntPtr HookCallback^(int nCode, IntPtr wParam, IntPtr lParam^)
        echo     {
        echo         if ^(nCode ^>= 0^)
        echo         {
        echo             int vkCode = Marshal.ReadInt32^(lParam^);
        echo             int flags = Marshal.ReadInt32^(lParam, 8^);
        echo             bool alt = ^(flags ^& 0x20^) != 0 ^|^| ^(GetAsyncKeyState^(VK_MENU^) ^& 0x8000^) != 0;
        echo             bool ctrl = ^(GetAsyncKeyState^(VK_CONTROL^) ^& 0x8000^) != 0;
        echo             bool shift = ^(GetAsyncKeyState^(VK_SHIFT^) ^& 0x8000^) != 0;
        echo.
        echo             if ^(ctrl ^&^& alt ^&^& shift ^&^& vkCode == VK_F12^)
        echo             {
        echo                 if ^(_hookID != IntPtr.Zero^) UnhookWindowsHookEx^(_hookID^);
        echo                 Application.Exit^(^);
        echo                 return ^(IntPtr^)1;
        echo             }
        echo.
        echo             if ^(_isBlocked^)
        echo             {
        echo                 if ^(alt ^|^| ^(ctrl ^&^& shift ^&^& vkCode == VK_ESCAPE^) ^|^| vkCode == VK_LWIN ^|^| vkCode == VK_RWIN^)
        echo                 {
        echo                     return ^(IntPtr^)1;
        echo                 }
        echo                 return CallNextHookEx^(_hookID, nCode, wParam, lParam^);
        echo             }
        echo.
        echo             bool isInfraction = false;
        echo             string reason = "";
        echo.
        echo             if ^(alt ^&^& vkCode == VK_TAB^) { isInfraction = true; reason = "Tentativa de Alt + Tab"; }
        echo             else if ^(alt ^&^& vkCode == VK_ESCAPE^) { isInfraction = true; reason = "Tentativa de Alt + Esc"; }
        echo             else if ^(alt ^&^& vkCode == VK_SPACE^) { isInfraction = true; reason = "Tentativa de Alt + Espaco"; }
        echo             else if ^(alt ^&^& vkCode == VK_F4^) { isInfraction = true; reason = "Tentativa de Alt + F4"; }
        echo             else if ^(vkCode == VK_LWIN ^|^| vkCode == VK_RWIN^) { isInfraction = true; reason = "Tentativa de Tecla Windows"; }
        echo             else if ^(ctrl ^&^& shift ^&^& vkCode == VK_ESCAPE^) { isInfraction = true; reason = "Tentativa de Gerenciador de Tarefas"; }
        echo             else if ^(ctrl ^&^& vkCode == VK_ESCAPE^) { isInfraction = true; reason = "Tentativa de Ctrl + Esc"; }
        echo             else if ^(vkCode == VK_SNAPSHOT^) { isInfraction = true; reason = "Tentativa de PrintScreen"; }
        echo             else if ^(vkCode ^>= 0x70 ^&^& vkCode ^<= 0x7B^) { isInfraction = true; reason = "Tentativa de Tecla F" + ^(vkCode - 0x6F^); }
        echo.
        echo             if ^(isInfraction^)
        echo             {
        echo                 TriggerLock^(reason^);
        echo                 return ^(IntPtr^)1;
        echo             }
        echo         }
        echo         return CallNextHookEx^(_hookID, nCode, wParam, lParam^);
        echo     }
        echo.
        echo     private static void LaunchBrowser^(string url^)
        echo     {
        echo         try
        echo         {
        echo             string browser = null;
        echo             string progX86 = Environment.GetEnvironmentVariable^("ProgramFiles(x86)"^);
        echo             string prog = Environment.GetEnvironmentVariable^("ProgramFiles"^);
        echo             string localApp = Environment.GetFolderPath^(Environment.SpecialFolder.LocalApplicationData^);
        echo.
        echo             string[] paths = new string[]
        echo             {
        echo                 Path.Combine^(progX86 ?? "", @"Microsoft\Edge\Application\msedge.exe"^),
        echo                 Path.Combine^(prog ?? "", @"Microsoft\Edge\Application\msedge.exe"^),
        echo                 Path.Combine^(localApp ?? "", @"Microsoft\Edge\Application\msedge.exe"^),
        echo                 Path.Combine^(prog ?? "", @"Google\Chrome\Application\chrome.exe"^),
        echo                 Path.Combine^(progX86 ?? "", @"Google\Chrome\Application\chrome.exe"^),
        echo                 Path.Combine^(localApp ?? "", @"Google\Chrome\Application\chrome.exe"^)
        echo             };
        echo.
        echo             foreach ^(string p in paths^)
        echo             {
        echo                 if ^(!string.IsNullOrEmpty^(p^) ^&^& File.Exists^(p^)^) { browser = p; break; }
        echo             }
        echo.
        echo             string profile = Path.Combine^(Path.GetTempPath^(^), "SafeExam_Kiosk_" + Guid.NewGuid^(^).ToString^("N"^)^);
        echo             string kioskArgs = string.Format^("--kiosk \"{0}\" --edge-kiosk-type=fullscreen --no-first-run --no-default-browser-check --disable-pinch --disable-translate --user-data-dir=\"{1}\" --app=\"{0}\"", url, profile^);
        echo.
        echo             ProcessStartInfo psi;
        echo             if ^(!string.IsNullOrEmpty^(browser^)^)
        echo             {
        echo                 psi = new ProcessStartInfo^(browser, kioskArgs^);
        echo             }
        echo             else
        echo             {
        echo                 psi = new ProcessStartInfo^("cmd.exe", "/c start \"\" msedge.exe " + kioskArgs^);
        echo                 psi.CreateNoWindow = true;
        echo                 psi.UseShellExecute = false;
        echo             }
        echo.
        echo             Process pProc = Process.Start^(psi^);
        echo             if ^(pProc != null^)
        echo             {
        echo                 pProc.EnableRaisingEvents = true;
        echo                 pProc.Exited += ^(s, e^) =^>
        echo                 {
        echo                     if ^(_hookID != IntPtr.Zero^) UnhookWindowsHookEx^(_hookID^);
        echo                     Application.Exit^(^);
        echo                 };
        echo             }
        echo         }
        echo         catch { }
        echo     }
        echo.
        echo     [STAThread]
        echo     static void Main^(string[] args^)
        echo     {
        echo         string targetUrl = ^(args != null ^&^& args.Length ^> 0 ^&^& !string.IsNullOrEmpty^(args[0]^)^) ? args[0] : "https://adaptativo-sesi.educat.net.br";
        echo.        
        echo         _hookID = SetHook^(_proc^);
        echo         Application.EnableVisualStyles^(^);
        echo         Application.Run^(new SafeExamGuard^(targetUrl^)^);
        echo.
        echo         if ^(_hookID != IntPtr.Zero^)
        echo         {
        echo             UnhookWindowsHookEx^(_hookID^);
        echo             _hookID = IntPtr.Zero;
        echo         }
        echo     }
        echo.
        echo     [DllImport^("user32.dll"^)] private static extern IntPtr SetWindowsHookEx^(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId^);
        echo     [DllImport^("user32.dll"^)] private static extern bool UnhookWindowsHookEx^(IntPtr hhk^);
        echo     [DllImport^("user32.dll"^)] private static extern IntPtr CallNextHookEx^(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam^);
        echo     [DllImport^("kernel32.dll"^)] private static extern IntPtr GetModuleHandle^(string lpModuleName^);
        echo     [DllImport^("user32.dll"^)] private static extern short GetAsyncKeyState^(int vKey^);
        echo }
    ) > "!CS_FILE!"
    if defined CSC (
        "!CSC!" /nologo /target:winexe /out:"!EXE_FILE!" /r:System.Windows.Forms.dll,System.Drawing.dll "!CS_FILE!" >nul 2>&1
        del /f /q "!CS_FILE!" >nul 2>&1
    )
)

if exist "!EXE_FILE!" (
    start "" "!EXE_FILE!" "%TARGET_URL%"
    exit /b 0
)

REM Fallback se csc nao estiver disponivel
set "BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

set "PROFILE=%TEMP%\SafeExam_Session_%RANDOM%"
if defined BROWSER (
    start "" /max "!BROWSER!" --kiosk "%TARGET_URL%" --edge-kiosk-type=fullscreen --no-first-run --no-default-browser-check --disable-pinch --disable-translate --user-data-dir="%PROFILE%" --app="%TARGET_URL%"
) else (
    start "" /max msedge.exe --kiosk "%TARGET_URL%" --edge-kiosk-type=fullscreen --no-first-run --no-default-browser-check --disable-pinch --disable-translate --user-data-dir="%PROFILE%" --app="%TARGET_URL%"
)
exit /b 0
