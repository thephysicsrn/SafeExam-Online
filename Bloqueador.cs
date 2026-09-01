using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace SafeExamBlocker
{
    class Program
    {
        // Constantes do Windows Hook
        private const int WH_KEYBOARD_LL = 13;
        private const int WM_KEYDOWN = 0x0100;
        private const int WM_KEYUP = 0x0101;
        private const int WM_SYSKEYDOWN = 0x0104;
        private const int WM_SYSKEYUP = 0x0105;

        // Virtual Keys (VK)
        private const int VK_TAB = 0x09;
        private const int VK_ESCAPE = 0x1B;
        private const int VK_SPACE = 0x20;
        private const int VK_SNAPSHOT = 0x2C; // Print Screen
        private const int VK_LWIN = 0x5B;
        private const int VK_RWIN = 0x5C;
        private const int VK_F4 = 0x73;
        private const int VK_F11 = 0x7A;
        private const int VK_F12 = 0x7B;
        private const int VK_S = 0x53;
        private const int VK_SHIFT = 0x10;
        private const int VK_CONTROL = 0x11;
        private const int VK_MENU = 0x12; // Alt key

        private const uint LLKHF_ALTDOWN = 0x20;

        [StructLayout(LayoutKind.Sequential)]
        private struct KBDLLHOOKSTRUCT
        {
            public uint vkCode;
            public uint scanCode;
            public uint flags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        private static LowLevelKeyboardProc _proc = HookCallback;
        private static IntPtr _hookID = IntPtr.Zero;
        private static Mutex _singleInstanceMutex = null;
        private static HttpListener _httpListener = null;
        private static bool _isRunning = true;
        private static Process _kioskBrowserProcess = null;
        private static WebSocket _activeWebSocket = null;
        private static string _tempProfileDir = null;

        [STAThread]
        static void Main(string[] args)
        {
            Console.Title = "SafeExam Secure Browser — SESI Escola";
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("==========================================================");
            Console.WriteLine("   SafeExam Secure Browser — Ambiente Seguro de Prova     ");
            Console.WriteLine("==========================================================");
            Console.ResetColor();

            // 1. Instância Única
            bool createdNew;
            _singleInstanceMutex = new Mutex(true, "SafeExamBlocker_SingleInstance_Mutex", out createdNew);
            if (!createdNew)
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("\n[AVISO] O SafeExam já está em execução neste computador.");
                Console.WriteLine("Pressione qualquer tecla para fechar esta janela...");
                Console.ResetColor();
                Console.ReadKey();
                return;
            }

            // Tratamento de encerramento do processo
            AppDomain.CurrentDomain.ProcessExit += (s, e) => CleanUp();
            Console.CancelKeyPress += (s, e) => { CleanUp(); };

            // 2. Instalar o Hook de Teclado
            _hookID = SetHook(_proc);
            if (_hookID == IntPtr.Zero)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[ERRO] Falha ao instalar o gancho de teclado no Windows.");
                Console.ResetColor();
                return;
            }

            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("\n[STATUS] Blindagem de teclado ativada com sucesso.");
            Console.ResetColor();
            Console.WriteLine(" • Bloqueio de Alt+Tab, Windows, Ctrl+Shift+Esc, PrintScreen ativo.");
            Console.WriteLine(" • Atalho de Emergência do Professor: [Ctrl + Alt + Shift + F12]\n");

            // 3. Iniciar Servidor WebSocket em Background
            Task.Run(() => StartWebSocketServer());

            // 4. Iniciar Loop de Mensagens do Windows
            Application.Run();

            // Limpeza ao sair
            CleanUp();
        }

        private static IntPtr SetHook(LowLevelKeyboardProc proc)
        {
            using (Process curProcess = Process.GetCurrentProcess())
            using (ProcessModule curModule = curProcess.MainModule)
            {
                return SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(curModule.ModuleName), 0);
            }
        }

        private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

        private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN || wParam == (IntPtr)WM_KEYUP || wParam == (IntPtr)WM_SYSKEYUP))
            {
                KBDLLHOOKSTRUCT hookStruct = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
                uint vkCode = hookStruct.vkCode;

                bool isAltPressed = (hookStruct.flags & LLKHF_ALTDOWN) != 0 || (GetAsyncKeyState(VK_MENU) & 0x8000) != 0;
                bool isCtrlPressed = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0;
                bool isShiftPressed = (GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0;
                bool isWinPressed = (GetAsyncKeyState(VK_LWIN) & 0x8000) != 0 || (GetAsyncKeyState(VK_RWIN) & 0x8000) != 0;

                // 1. ATALHO DE EMERGÊNCIA DO PROFESSOR: Ctrl + Alt + Shift + F12
                if (isCtrlPressed && isAltPressed && isShiftPressed && vkCode == VK_F12)
                {
                    Console.ForegroundColor = ConsoleColor.Yellow;
                    Console.WriteLine("\n[EMERGÊNCIA] Desbloqueio emergencial acionado pelo aplicador. Encerrando...");
                    Console.ResetColor();
                    Task.Run(() => {
                        Thread.Sleep(300);
                        CleanUp();
                        Application.Exit();
                    });
                    return (IntPtr)1;
                }

                // 2. BLOQUEIO DO GERENCIADOR DE TAREFAS: Ctrl + Shift + Esc
                if (isCtrlPressed && isShiftPressed && vkCode == VK_ESCAPE)
                {
                    return (IntPtr)1;
                }

                // 3. BLOQUEIO DE TECLAS WINDOWS
                if (vkCode == VK_LWIN || vkCode == VK_RWIN)
                {
                    return (IntPtr)1;
                }

                // 4. BLOQUEIO DE CAPTURA DO WINDOWS: Win + Shift + S
                if (isWinPressed && isShiftPressed && vkCode == VK_S)
                {
                    return (IntPtr)1;
                }

                // 5. BLOQUEIO DE COMBINAÇÕES COM ALT
                if (isAltPressed)
                {
                    if (vkCode == VK_TAB) return (IntPtr)1;       // Alt + Tab
                    if (vkCode == VK_ESCAPE) return (IntPtr)1;    // Alt + Esc
                    if (vkCode == VK_F4) return (IntPtr)1;        // Alt + F4
                    if (vkCode == VK_SPACE) return (IntPtr)1;     // Alt + Space
                }

                // 6. BLOQUEIO DE MENU INICIAR ALTERNATIVO: Ctrl + Esc
                if (isCtrlPressed && vkCode == VK_ESCAPE)
                {
                    return (IntPtr)1;
                }

                // 7. BLOQUEIO DE PRINT SCREEN
                if (vkCode == VK_SNAPSHOT)
                {
                    return (IntPtr)1;
                }

                // 8. BLOQUEIO DE F11 (Manipulação de Tela Cheia)
                if (vkCode == VK_F11)
                {
                    return (IntPtr)1;
                }
            }

            return CallNextHookEx(_hookID, nCode, wParam, lParam);
        }

        private static async Task StartWebSocketServer()
        {
            _httpListener = new HttpListener();
            _httpListener.Prefixes.Add("http://127.0.0.1:8765/");

            try
            {
                _httpListener.Start();
                Console.ForegroundColor = ConsoleColor.DarkCyan;
                Console.WriteLine("[WEBSOCKET] Servidor de integração aguardando o navegador na porta 8765...");
                Console.ResetColor();
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[ERRO WEBSOCKET] Erro ao iniciar servidor na porta 8765: " + ex.Message);
                Console.ResetColor();
                return;
            }

            while (_isRunning && _httpListener != null && _httpListener.IsListening)
            {
                try
                {
                    HttpListenerContext context = await _httpListener.GetContextAsync();
                    if (context.Request.IsWebSocketRequest)
                        _ = Task.Run(async () => await ProcessWebSocketRequest(context));
                    else
                    {
                        context.Response.StatusCode = 400;
                        context.Response.Close();
                    }
                }
                catch (HttpListenerException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    if (_isRunning)
                    {
                        Console.WriteLine("[AVISO] " + ex.Message);
                    }
                }
            }
        }

        private static async Task ProcessWebSocketRequest(HttpListenerContext context)
        {
            HttpListenerWebSocketContext webSocketContext = null;
            try
            {
                webSocketContext = await context.AcceptWebSocketAsync(subProtocol: null);
            }
            catch (Exception)
            {
                try { context.Response.StatusCode = 500; context.Response.Close(); } catch { }
                return;
            }

            WebSocket webSocket = webSocketContext.WebSocket;
            _activeWebSocket = webSocket;
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("[CONECTADO] Site da prova conectado ao SafeExam Blocker!");
            Console.ResetColor();

            // Task para enviar pings a cada 2 segundos
            _ = Task.Run(async () =>
            {
                byte[] pingBytes = Encoding.UTF8.GetBytes("{\"status\":\"alive\"}");
                while (webSocket.State == WebSocketState.Open && _isRunning)
                {
                    try
                    {
                        await webSocket.SendAsync(new ArraySegment<byte>(pingBytes), WebSocketMessageType.Text, true, CancellationToken.None);
                        await Task.Delay(2000);
                    }
                    catch { break; }
                }
            });

            // Loop de recepção de comandos do site
            byte[] receiveBuffer = new byte[4096];
            try
            {
                while (webSocket.State == WebSocketState.Open && _isRunning)
                {
                    WebSocketReceiveResult result = await webSocket.ReceiveAsync(new ArraySegment<byte>(receiveBuffer), CancellationToken.None);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        break;
                    }
                    else if (result.MessageType == WebSocketMessageType.Text)
                    {
                        string message = Encoding.UTF8.GetString(receiveBuffer, 0, result.Count);
                        HandleClientMessage(message);
                    }
                }
            }
            catch (Exception) { }
            finally
            {
                if (_activeWebSocket == webSocket) _activeWebSocket = null;
                try { webSocket.Dispose(); } catch { }
                Console.ForegroundColor = ConsoleColor.DarkYellow;
                Console.WriteLine("[DESCONECTADO] Site desconectado.");
                Console.ResetColor();
            }
        }

        private static void HandleClientMessage(string message)
        {
            try
            {
                if (message.Contains("\"action\":\"launch_kiosk\"") || message.Contains("\"action\": \"launch_kiosk\""))
                {
                    // Extrai a URL
                    string url = ExtractJsonValue(message, "url");
                    if (!string.IsNullOrEmpty(url))
                    {
                        Console.ForegroundColor = ConsoleColor.Cyan;
                        Console.WriteLine($"\n[LANÇANDO NAVEGADOR SEGURO] Abrindo avaliação: {url}");
                        Console.ResetColor();
                        LaunchKioskBrowser(url);
                    }
                }
                else if (message.Contains("\"action\":\"close_kiosk\""))
                {
                    CloseKioskBrowser();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[ERRO COMANDO] " + ex.Message);
            }
        }

        private static string ExtractJsonValue(string json, string key)
        {
            int keyIdx = json.IndexOf($"\"{key}\"");
            if (keyIdx == -1) return null;
            int colonIdx = json.IndexOf(":", keyIdx);
            if (colonIdx == -1) return null;
            int startQuote = json.IndexOf("\"", colonIdx);
            if (startQuote == -1) return null;
            int endQuote = json.IndexOf("\"", startQuote + 1);
            if (endQuote == -1) return null;
            return json.Substring(startQuote + 1, endQuote - startQuote - 1);
        }

        private static void LaunchKioskBrowser(string url)
        {
            try
            {
                CloseKioskBrowser();

                _tempProfileDir = Path.Combine(Path.GetTempPath(), "SafeExam_Profile_" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(_tempProfileDir);

                // Localiza o executável do Microsoft Edge ou Google Chrome no Windows
                string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe");
                if (!File.Exists(edgePath))
                {
                    edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe");
                }
                if (!File.Exists(edgePath))
                {
                    edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
                }
                if (!File.Exists(edgePath))
                {
                    edgePath = @"C:\Program Files\Google\Chrome\Application\chrome.exe";
                }

                // Argumentos do Chromium Kiosk Mode: Top-level Window com tela cheia
                string args = $"--kiosk \"{url}\" --edge-kiosk-type=fullscreen --no-first-run --no-default-browser-check --disable-pinch --disable-translate --user-data-dir=\"{_tempProfileDir}\" --app=\"{url}\"";

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = File.Exists(edgePath) ? edgePath : "msedge.exe",
                    Arguments = args,
                    UseShellExecute = false
                };

                _kioskBrowserProcess = Process.Start(psi);
                if (_kioskBrowserProcess != null)
                {
                    _kioskBrowserProcess.EnableRaisingEvents = true;
                    _kioskBrowserProcess.Exited += (s, e) =>
                    {
                        Console.ForegroundColor = ConsoleColor.Yellow;
                        Console.WriteLine("[AVISO] O aluno fechou a janela da avaliação.");
                        Console.ResetColor();
                        NotifyWebSocket("{\"event\":\"kiosk_closed\"}");
                    };
                }
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[ERRO AO ABRIR BROWSER] " + ex.Message);
                Console.ResetColor();
            }
        }

        private static void CloseKioskBrowser()
        {
            if (_kioskBrowserProcess != null)
            {
                try
                {
                    if (!_kioskBrowserProcess.HasExited)
                    {
                        _kioskBrowserProcess.Kill();
                    }
                }
                catch { }
                _kioskBrowserProcess = null;
            }

            if (!string.IsNullOrEmpty(_tempProfileDir) && Directory.Exists(_tempProfileDir))
            {
                try { Directory.Delete(_tempProfileDir, true); } catch { }
                _tempProfileDir = null;
            }
        }

        private static async void NotifyWebSocket(string message)
        {
            if (_activeWebSocket != null && _activeWebSocket.State == WebSocketState.Open)
            {
                try
                {
                    byte[] bytes = Encoding.UTF8.GetBytes(message);
                    await _activeWebSocket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
                }
                catch { }
            }
        }

        private static void CleanUp()
        {
            _isRunning = false;
            CloseKioskBrowser();

            if (_hookID != IntPtr.Zero)
            {
                UnhookWindowsHookEx(_hookID);
                _hookID = IntPtr.Zero;
            }

            if (_httpListener != null)
            {
                try
                {
                    _httpListener.Stop();
                    _httpListener.Close();
                }
                catch { }
                _httpListener = null;
            }

            if (_singleInstanceMutex != null)
            {
                try
                {
                    _singleInstanceMutex.ReleaseMutex();
                    _singleInstanceMutex.Dispose();
                }
                catch { }
                _singleInstanceMutex = null;
            }
        }

        // --- Importações das APIs do Windows (User32.dll e Kernel32.dll) ---
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string lpModuleName);

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);
    }
}