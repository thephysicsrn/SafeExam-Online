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
        private const int WH_KEYBOARD_LL = 13;
        private const int WM_KEYDOWN = 0x0100;
        private const int WM_SYSKEYDOWN = 0x0104;
        private const int WM_KEYUP = 0x0101;
        private const int WM_SYSKEYUP = 0x0105;

        private static LowLevelKeyboardProc _proc = HookCallback;
        private static IntPtr _hookID = IntPtr.Zero;

        static void Main(string[] args)
        {
            Console.WriteLine("Iniciando SafeExam Blocker...");

            // 1. Iniciar Servidor WebSocket em Background
            Task.Run(() => StartWebSocketServer());

            // 2. Instalar o Hook de Teclado
            _hookID = SetHook(_proc);
            Console.WriteLine("Bloqueio de teclado ativado. Deixe esta janela aberta durante a prova.");
            Console.WriteLine("Para sair, feche esta janela.");

            // 3. Iniciar o Loop de Mensagens do Windows (Necessário para o Hook funcionar)
            Application.Run();

            // Ao fechar, remove o hook
            UnhookWindowsHookEx(_hookID);
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
                int vkCode = Marshal.ReadInt32(lParam);
                Keys key = (Keys)vkCode;

                bool alt = (Control.ModifierKeys & Keys.Alt) != 0;
                bool ctrl = (Control.ModifierKeys & Keys.Control) != 0;

                // Bloqueios
                if (key == Keys.LWin || key == Keys.RWin) return (IntPtr)1; // Tecla Windows
                if (alt && key == Keys.Tab) return (IntPtr)1; // Alt + Tab
                if (alt && key == Keys.Escape) return (IntPtr)1; // Alt + Esc
                if (ctrl && key == Keys.Escape) return (IntPtr)1; // Ctrl + Esc
                if (alt && key == Keys.F4) return (IntPtr)1; // Alt + F4
                if (key == Keys.PrintScreen) return (IntPtr)1; // Print Screen

                // Pode adicionar mais bloqueios se necessário (Ex: Ctrl+C, Ctrl+V)
            }
            return CallNextHookEx(_hookID, nCode, wParam, lParam);
        }

        private static async Task StartWebSocketServer()
        {
            HttpListener listener = new HttpListener();
            listener.Prefixes.Add("http://127.0.0.1:8765/");
            
            try
            {
                listener.Start();
                Console.WriteLine("Servidor de integração aguardando o site na porta 8765...");
            }
            catch (Exception ex)
            {
                Console.WriteLine("Erro ao iniciar o servidor: " + ex.Message);
                return;
            }

            while (true)
            {
                HttpListenerContext context = await listener.GetContextAsync();
                if (context.Request.IsWebSocketRequest)
                {
                    ProcessWebSocketRequest(context);
                }
                else
                {
                    context.Response.StatusCode = 400;
                    context.Response.Close();
                }
            }
        }

        private static async void ProcessWebSocketRequest(HttpListenerContext context)
        {
            HttpListenerWebSocketContext webSocketContext = null;
            try
            {
                webSocketContext = await context.AcceptWebSocketAsync(subProtocol: null);
            }
            catch (Exception)
            {
                context.Response.StatusCode = 500;
                context.Response.Close();
                return;
            }

            WebSocket webSocket = webSocketContext.WebSocket;
            Console.WriteLine("Site conectado ao bloqueador!");

            try
            {
                // Envia "ping" a cada 2 segundos para o site saber que está vivo
                while (webSocket.State == WebSocketState.Open)
                {
                    byte[] buffer = Encoding.UTF8.GetBytes("alive");
                    await webSocket.SendAsync(new ArraySegment<byte>(buffer), WebSocketMessageType.Text, true, CancellationToken.None);
                    await Task.Delay(2000);
                }
            }
            catch (Exception)
            {
                // Conexão caiu
            }
            finally
            {
                if (webSocket != null) webSocket.Dispose();
                Console.WriteLine("Site desconectado.");
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
    }
}
