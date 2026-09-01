using System;
using System.Diagnostics;
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

        [STAThread]
        static void Main(string[] args)
        {
            Console.Title = "SafeExam Blocker — Monitor de Segurança Local";
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("==================================================");
            Console.WriteLine("   SafeExam Online — Bloqueador de Teclado Local   ");
            Console.WriteLine("==================================================");
            Console.ResetColor();

            // 1. Garantir que apenas UMA instância do executável seja executada por vez
            bool createdNew;
            _singleInstanceMutex = new Mutex(true, "SafeExamBlocker_SingleInstance_Mutex", out createdNew);
            if (!createdNew)
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("\n[AVISO] O SafeExam Blocker já está em execução neste computador.");
                Console.WriteLine("Pressione qualquer tecla para fechar esta janela...");
                Console.ResetColor();
                Console.ReadKey();
                return;
            }

            // Registrar manipuladores de encerramento para garantir remoção do hook
            AppDomain.CurrentDomain.ProcessExit += (s, e) => CleanUp();
            Console.CancelKeyPress += (s, e) => { CleanUp(); };

            // 2. Iniciar Servidor WebSocket em Background
            Task.Run(() => StartWebSocketServer());

            // 3. Instalar o Hook de Teclado de Baixo Nível
            _hookID = SetHook(_proc);
            if (_hookID == IntPtr.Zero)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[ERRO] Falha ao instalar o gancho de teclado no Windows.");
                Console.ResetColor();
                return;
            }

            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("\n[ATIVO] Bloqueio de atalhos e teclas de sistema ativado com sucesso!");
            Console.ResetColor();
            Console.WriteLine("\nInstruções:");
            Console.WriteLine(" • Mantenha esta janela aberta durante toda a avaliação.");
            Console.WriteLine(" • Ao finalizar a prova, feche esta janela normalmente.");
            Console.WriteLine(" • Atalho de Emergência do Professor: [Ctrl + Alt + Shift + F12]\n");

            // 4. Iniciar o Loop de Mensagens do Windows (Obrigatório para o Hook e Forms)
            Application.Run();

            // Ao sair do loop, limpa os recursos
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

                // Verificação precisa do estado das teclas modificadoras via API nativa
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
                        Application.Exit();
                    });
                    return (IntPtr)1;
                }

                // 2. BLOQUEIO DE GERENCIADOR DE TAREFAS: Ctrl + Shift + Esc
                if (isCtrlPressed && isShiftPressed && vkCode == VK_ESCAPE)
                {
                    return (IntPtr)1;
                }

                // 3. BLOQUEIO DE TECLAS WINDOWS (Menu Iniciar / Combinações Win)
                if (vkCode == VK_LWIN || vkCode == VK_RWIN)
                {
                    return (IntPtr)1;
                }

                // 4. BLOQUEIO DE FERRAMENTA DE CAPTURA DO WINDOWS: Win + Shift + S
                if (isWinPressed && isShiftPressed && vkCode == VK_S)
                {
                    return (IntPtr)1;
                }

                // 5. BLOQUEIO DE ALTERNÂNCIA DE JANELAS E MENUS DO SISTEMA (Alt + ...)
                if (isAltPressed)
                {
                    if (vkCode == VK_TAB) return (IntPtr)1;       // Alt + Tab
                    if (vkCode == VK_ESCAPE) return (IntPtr)1;    // Alt + Esc
                    if (vkCode == VK_F4) return (IntPtr)1;        // Alt + F4
                    if (vkCode == VK_SPACE) return (IntPtr)1;     // Alt + Space (Menu Janela)
                }

                // 6. BLOQUEIO DE MENU INICIAR ALTERNATIVO: Ctrl + Esc
                if (isCtrlPressed && vkCode == VK_ESCAPE)
                {
                    return (IntPtr)1;
                }

                // 7. BLOQUEIO DE CAPTURA DE TELA (Print Screen / Snapshot)
                if (vkCode == VK_SNAPSHOT)
                {
                    return (IntPtr)1;
                }

                // 8. BLOQUEIO DE F11 (Manipulação de Tela Cheia do Navegador)
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
                Console.WriteLine("[WEBSOCKET] Servidor de integração aguardando conexão do navegador na porta 8765...");
                Console.ResetColor();
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[ERRO WEBSOCKET] Não foi possível iniciar o servidor na porta 8765: " + ex.Message);
                Console.WriteLine("Verifique se outro programa ou instância já está usando a porta.");
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
                    // Listener encerrado
                    break;
                }
                catch (Exception ex)
                {
                    if (_isRunning)
                    {
                        Console.WriteLine("[AVISO] Erro na conexão: " + ex.Message);
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
                try
                {
                    context.Response.StatusCode = 500;
                    context.Response.Close();
                }
                catch { }
                return;
            }

            WebSocket webSocket = webSocketContext.WebSocket;
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("[CONECTADO] Navegador da prova conectado com sucesso!");
            Console.ResetColor();

            try
            {
                byte[] buffer = Encoding.UTF8.GetBytes("alive");
                while (webSocket.State == WebSocketState.Open && _isRunning)
                {
                    await webSocket.SendAsync(new ArraySegment<byte>(buffer), WebSocketMessageType.Text, true, CancellationToken.None);
                    await Task.Delay(2000);
                }
            }
            catch (Exception)
            {
                // Conexão encerrada pelo cliente ou erro de rede local
            }
            finally
            {
                if (webSocket != null)
                {
                    try { webSocket.Dispose(); } catch { }
                }
                Console.ForegroundColor = ConsoleColor.DarkYellow;
                Console.WriteLine("[DESCONECTADO] Navegador da prova desconectado.");
                Console.ResetColor();
            }
        }

        private static void CleanUp()
        {
            _isRunning = false;

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
