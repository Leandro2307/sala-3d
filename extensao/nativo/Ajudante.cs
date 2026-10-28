// Ajudante nativo da extensão "Sala 3D — controle das abas" (só Windows).
//
// O Chrome só deixa uma extensão clicar dentro de ABAS. Para controlar uma JANELA qualquer ou a
// TELA inteira que você compartilhou, a extensão conversa com este programa (Native Messaging:
// mensagens JSON com 4 bytes de tamanho na frente, por stdin/stdout). Ele move o mouse e aperta
// as teclas de verdade — mas sempre dentro do retângulo da janela/tela compartilhada.
//
// Segurança:
// - o Chrome só deixa a extensão com o ID registrado no instalador abrir este programa;
// - a tecla Windows nunca é enviada (Win+R, Win+L etc. ficam de fora);
// - Ctrl+Alt+End no seu teclado corta o controle na hora (e não pode ser enviado de fora).
//
// Modo jogo (ev.t == "modo", liga/desliga pelo botão "Modo jogo" de quem controla): jogos tipo
// Minecraft leem a câmera pelo movimento RELATIVO do mouse (SetCursorPos não gera isso) e as
// teclas pelo código físico (scancode) — letra mandada como texto Unicode não anda com o
// personagem nem fica pressionada. No modo jogo o mouse vai como delta e as teclas como scancode.
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace Sala3d
{
    public static class Ajudante
    {
        // ------------------------------------------------------------ Win32
        [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
        [StructLayout(LayoutKind.Sequential)] struct PONTO { public int X, Y; }
        [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
        [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
        [StructLayout(LayoutKind.Explicit)] struct UNIAO { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
        [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNIAO u; }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct DISPLAY_DEVICE
        {
            public int cb;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
            public int StateFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
        }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct MONITORINFOEX
        {
            public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szDevice;
        }
        delegate bool EnumWin(IntPtr h, IntPtr l);
        delegate bool EnumMon(IntPtr m, IntPtr dc, ref RECT r, IntPtr l);

        [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
        [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
        [DllImport("user32.dll")] static extern bool GetCursorPos(out PONTO p);
        [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] i, int size);
        [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
        [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
        [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
        [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
        [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
        [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int size);
        [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
        [DllImport("user32.dll")] static extern bool EnumWindows(EnumWin p, IntPtr l);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplayDevices(string dev, uint i, ref DISPLAY_DEVICE d, uint f);
        [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, EnumMon p, IntPtr l);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFOEX mi);
        [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);

        const uint INPUT_MOUSE = 0, INPUT_KEYBOARD = 1;
        const uint MOUSEEVENTF_MOVE = 1, KEYEVENTF_EXTENDEDKEY = 1, KEYEVENTF_KEYUP = 2, KEYEVENTF_UNICODE = 4, KEYEVENTF_SCANCODE = 8;
        const uint MOUSEEVENTF_LEFTDOWN = 2, MOUSEEVENTF_LEFTUP = 4, MOUSEEVENTF_RIGHTDOWN = 8, MOUSEEVENTF_RIGHTUP = 16,
                   MOUSEEVENTF_MIDDLEDOWN = 32, MOUSEEVENTF_MIDDLEUP = 64, MOUSEEVENTF_WHEEL = 0x800, MOUSEEVENTF_HWHEEL = 0x1000;
        const int VK_CONTROL = 0x11, VK_MENU = 0x12, VK_END = 0x23, VK_LWIN = 0x5B, VK_RWIN = 0x5C;

        // ------------------------------------------------------------ estado
        static readonly object trava = new object();
        static readonly object travaEntrada = new object(); // mensagens x atalho de emergência
        static Stream saida;
        static IntPtr janela = IntPtr.Zero; // alvo: janela...
        static RECT tela;                   // ...ou um retângulo da tela
        static bool temAlvo, ehJanela, parado;
        static string rotuloAtual;
        static readonly HashSet<ushort> teclasApertadas = new HashSet<ushort>();
        static readonly HashSet<string> botoesApertados = new HashSet<string>();
        // modo jogo: mouse relativo + teclas por scancode; ctrl/altRemoto seguem o que NÓS apertamos
        static bool jogo, ctrlRemoto, altRemoto;
        static readonly HashSet<int> scansApertados = new HashSet<int>();

        // ------------------------------------------------------------ protocolo
        static string Ler(Stream e)
        {
            var tam = new byte[4];
            if (LerTudo(e, tam) < 4) return null;
            int n = BitConverter.ToInt32(tam, 0);
            if (n <= 0 || n > 1024 * 1024) return null;
            var buf = new byte[n];
            if (LerTudo(e, buf) < n) return null;
            return Encoding.UTF8.GetString(buf);
        }
        static int LerTudo(Stream e, byte[] b)
        {
            int lido = 0;
            while (lido < b.Length) { int r = e.Read(b, lido, b.Length - lido); if (r <= 0) break; lido += r; }
            return lido;
        }
        static void Escrever(Dictionary<string, object> m)
        {
            var bytes = Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(m));
            lock (trava)
            {
                saida.Write(BitConverter.GetBytes(bytes.Length), 0, 4);
                saida.Write(bytes, 0, bytes.Length);
                saida.Flush();
            }
        }

        public static void Rodar()
        {
            try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { } // pixels reais em telas com escala
            saida = Console.OpenStandardOutput();
            var entrada = Console.OpenStandardInput();
            new Thread(VigiarAtalho) { IsBackground = true }.Start();
            Escrever(new Dictionary<string, object> { { "tipo", "oi" }, { "versao", "1.4.1" } });
            var json = new JavaScriptSerializer();
            string txt;
            while ((txt = Ler(entrada)) != null)
            {
                try
                {
                    var m = json.Deserialize<Dictionary<string, object>>(txt);
                    lock (travaEntrada) Tratar(m);
                }
                catch (Exception err)
                {
                    Escrever(new Dictionary<string, object> { { "tipo", "erro" }, { "msg", err.Message } });
                }
            }
            SoltarTudo();
        }

        static string S(Dictionary<string, object> m, string k) { object v; return m.TryGetValue(k, out v) && v != null ? Convert.ToString(v) : ""; }
        static double D(Dictionary<string, object> m, string k) { object v; return m.TryGetValue(k, out v) && v != null ? Convert.ToDouble(v) : 0; }
        static bool B(Dictionary<string, object> m, string k) { object v; return m.TryGetValue(k, out v) && v != null && Convert.ToBoolean(v); }

        static void Tratar(Dictionary<string, object> m)
        {
            string tipo = S(m, "tipo");
            if (tipo == "alvo")
            {
                string rotulo = S(m, "rotulo");
                string sup = S(m, "superficie");
                bool ok = rotulo == rotuloAtual && temAlvo ? true : DefinirAlvo(rotulo, sup);
                if (ok) rotuloAtual = rotulo;
                RECT r; Retangulo(out r);
                Escrever(new Dictionary<string, object> { { "tipo", "alvo" }, { "ok", ok }, { "rotulo", rotulo },
                    { "x", r.Left }, { "y", r.Top }, { "w", r.Right - r.Left }, { "h", r.Bottom - r.Top } });
                return;
            }
            // depois do Ctrl+Alt+End (ou do "Cortar o controle" no ícone da extensão, que manda o
            // "parar"), só volta quando quem compartilha liberar de novo na sala
            if (tipo == "retomar") { parado = false; return; }
            if (tipo == "parar") { lock (travaEntrada) { parado = true; SoltarTudo(); } return; }
            if (tipo == "soltar") { jogo = false; SoltarTudo(); temAlvo = false; rotuloAtual = null; return; }
            if (tipo != "entrada" || !temAlvo || parado) return;
            var ev = m["ev"] as Dictionary<string, object>;
            if (ev == null) return;
            string t = S(ev, "t");
            if (t == "modo") { jogo = B(ev, "jogo"); if (!jogo) SoltarTudo(); return; }
            // o site (1.4+) marca cada evento do modo jogo; o "modo" sozinho se perde se o ajudante
            // reabrir no meio. Movimento só com delta (sem x) também é de jogo.
            if (B(ev, "jogo") || (t == "mouse" && S(ev, "a") == "move" && !ev.ContainsKey("x") && ev.ContainsKey("dx"))) jogo = true;
            if (t == "mouse") { if (jogo) MouseJogo(S(ev, "a"), S(ev, "b"), D(ev, "dx"), D(ev, "dy")); else Mouse(S(ev, "a"), D(ev, "x"), D(ev, "y"), S(ev, "b")); }
            else if (t == "wheel") { if (jogo) RodaJogo(D(ev, "dx"), D(ev, "dy")); else Roda(D(ev, "x"), D(ev, "y"), D(ev, "dx"), D(ev, "dy")); }
            else if (t == "tecla") { if (jogo) TeclaJogo(S(ev, "a"), S(ev, "code")); else Tecla(S(ev, "a"), S(ev, "key"), (int)D(ev, "kc"), (int)D(ev, "mod"), B(ev, "ag")); }
            else if (t == "texto") Texto(S(ev, "s"));
        }

        // ------------------------------------------------------------ alvo
        // O Chrome dá ao vídeo capturado um rótulo como "window:263318:0" (o número é a janela) ou
        // "screen:0:0" (o número é o monitor). Se vier outra coisa, tenta pelo título da janela.
        static bool DefinirAlvo(string rotulo, string sup)
        {
            temAlvo = false;
            var partes = rotulo.Split(':');
            long num;
            if (partes.Length >= 2 && partes[0] == "window" && long.TryParse(partes[1], out num) && IsWindow(new IntPtr(num)))
            {
                janela = new IntPtr(num); ehJanela = true; return temAlvo = true;
            }
            if (partes.Length >= 2 && partes[0] == "screen" && long.TryParse(partes[1], out num))
            {
                ehJanela = false;
                if (num < 0) { tela = TelaVirtual(); return temAlvo = true; }
                // conforme o capturador do Chrome, o número é o índice do monitor ou o próprio HMONITOR
                if (num < 64 && Monitor((uint)num, out tela)) return temAlvo = true;
                var mi = new MONITORINFOEX(); mi.cbSize = Marshal.SizeOf(mi);
                if (GetMonitorInfo(new IntPtr(num), ref mi)) { tela = mi.rcMonitor; return temAlvo = true; }
                if (Monitor(0, out tela)) return temAlvo = true;
                tela = TelaVirtual();
                return temAlvo = true;
            }
            if (sup == "monitor")
            {
                ehJanela = false;
                if (!Monitor(0, out tela)) tela = TelaVirtual();
                return temAlvo = true;
            }
            // pelo título (exato primeiro, depois "contém")
            IntPtr achada = IntPtr.Zero, parecida = IntPtr.Zero;
            EnumWindows((h, l) =>
            {
                if (!IsWindowVisible(h)) return true;
                var sb = new StringBuilder(512);
                GetWindowText(h, sb, 512);
                string titulo = sb.ToString();
                if (titulo.Length == 0) return true;
                if (titulo == rotulo) { achada = h; return false; }
                if (parecida == IntPtr.Zero && (titulo.Contains(rotulo) || rotulo.Contains(titulo))) parecida = h;
                return true;
            }, IntPtr.Zero);
            janela = achada != IntPtr.Zero ? achada : parecida;
            ehJanela = true;
            return temAlvo = janela != IntPtr.Zero;
        }

        static RECT TelaVirtual()
        {
            int x = GetSystemMetrics(76), y = GetSystemMetrics(77), w = GetSystemMetrics(78), h = GetSystemMetrics(79);
            return new RECT { Left = x, Top = y, Right = x + w, Bottom = y + h };
        }

        // o número do monitor é o índice em EnumDisplayDevices (é assim que o WebRTC numera)
        static bool Monitor(uint indice, out RECT r)
        {
            r = new RECT();
            var dd = new DISPLAY_DEVICE(); dd.cb = Marshal.SizeOf(dd);
            if (!EnumDisplayDevices(null, indice, ref dd, 0)) return false;
            string nome = dd.DeviceName;
            RECT achado = new RECT(); bool ok = false;
            EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr mon, IntPtr dc, ref RECT rr, IntPtr l) =>
            {
                var mi = new MONITORINFOEX(); mi.cbSize = Marshal.SizeOf(mi);
                if (GetMonitorInfo(mon, ref mi) && mi.szDevice == nome) { achado = mi.rcMonitor; ok = true; return false; }
                return true;
            }, IntPtr.Zero);
            r = achado;
            return ok;
        }

        static bool Retangulo(out RECT r)
        {
            r = new RECT();
            if (!temAlvo) return false;
            if (!ehJanela) { r = tela; return true; }
            if (!IsWindow(janela)) { temAlvo = false; return false; }
            // contorno visível da janela (sem a sombra invisível do Windows 10/11)
            if (DwmGetWindowAttribute(janela, 9, out r, Marshal.SizeOf(typeof(RECT))) != 0) GetWindowRect(janela, out r);
            return true;
        }

        static bool Ponto(double fx, double fy, out int x, out int y)
        {
            x = y = 0;
            RECT r;
            if (!Retangulo(out r)) return false;
            fx = Math.Max(0, Math.Min(1, fx));
            fy = Math.Max(0, Math.Min(1, fy));
            x = r.Left + (int)Math.Round(fx * (r.Right - r.Left - 1));
            y = r.Top + (int)Math.Round(fy * (r.Bottom - r.Top - 1));
            return true;
        }

        // traz a janela compartilhada para a frente antes do clique (o "Alt" destrava o
        // SetForegroundWindow, que o Windows recusa para quem não está em primeiro plano)
        static void Focar()
        {
            if (!ehJanela || GetForegroundWindow() == janela) return;
            if (IsIconic(janela)) ShowWindow(janela, 9);
            Teclado((ushort)VK_MENU, false, false);
            Teclado((ushort)VK_MENU, true, false);
            SetForegroundWindow(janela);
        }

        // ------------------------------------------------------------ entrada
        static void Enviar(INPUT i) { SendInput(1, new[] { i }, Marshal.SizeOf(typeof(INPUT))); }

        static void MouseFlag(uint f, uint dados = 0)
        {
            var i = new INPUT { type = INPUT_MOUSE };
            i.u.mi = new MOUSEINPUT { dwFlags = f, mouseData = dados };
            Enviar(i);
        }

        static void Mouse(string a, double fx, double fy, string b)
        {
            int x, y;
            if (!Ponto(fx, fy, out x, out y)) return;
            if (a == "down") Focar();
            SetCursorPos(x, y);
            if (a == "move") return;
            uint desce = b == "right" ? MOUSEEVENTF_RIGHTDOWN : b == "middle" ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_LEFTDOWN;
            uint sobe = b == "right" ? MOUSEEVENTF_RIGHTUP : b == "middle" ? MOUSEEVENTF_MIDDLEUP : MOUSEEVENTF_LEFTUP;
            if (a == "down") { MouseFlag(desce); botoesApertados.Add(b); }
            else if (a == "up") { MouseFlag(sobe); botoesApertados.Remove(b); }
        }

        static void Roda(double fx, double fy, double dx, double dy)
        {
            int x, y;
            if (!Ponto(fx, fy, out x, out y)) return;
            SetCursorPos(x, y);
            // no navegador um "dente" da roda é ~100 px; no Windows é 120
            if (dy != 0) MouseFlag(MOUSEEVENTF_WHEEL, unchecked((uint)(int)Math.Round(-dy * 1.2)));
            if (dx != 0) MouseFlag(MOUSEEVENTF_HWHEEL, unchecked((uint)(int)Math.Round(dx * 1.2)));
        }

        // ------------------------------------------------------------ modo jogo
        // Movimento relativo: o que os jogos usam para a câmera. SetCursorPos não serve — jogo com
        // o cursor preso lê o quanto o mouse ANDOU, não onde o cursor está.
        static void MouseJogo(string a, string b, double dx, double dy)
        {
            if (a == "down")
            {
                // o clique cai onde o cursor está: fora da janela/tela compartilhada (no Chrome, na
                // área de trabalho) ele tirava o foco do jogo e o WASD e a câmera iam para lá. Dentro
                // dela o cursor fica onde está (num menu do jogo é ele que aponta o botão).
                RECT r; PONTO c;
                if (Retangulo(out r) && GetCursorPos(out c) && (c.X < r.Left || c.X >= r.Right || c.Y < r.Top || c.Y >= r.Bottom))
                    SetCursorPos((r.Left + r.Right) / 2, (r.Top + r.Bottom) / 2);
                Focar();
            }
            if (a == "move")
            {
                int ix = (int)Math.Round(Math.Max(-4000, Math.Min(4000, dx)));
                int iy = (int)Math.Round(Math.Max(-4000, Math.Min(4000, dy)));
                if (ix == 0 && iy == 0) return;
                var i = new INPUT { type = INPUT_MOUSE };
                i.u.mi = new MOUSEINPUT { dx = ix, dy = iy, dwFlags = MOUSEEVENTF_MOVE };
                Enviar(i);
                return;
            }
            uint desce = b == "right" ? MOUSEEVENTF_RIGHTDOWN : b == "middle" ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_LEFTDOWN;
            uint sobe = b == "right" ? MOUSEEVENTF_RIGHTUP : b == "middle" ? MOUSEEVENTF_MIDDLEUP : MOUSEEVENTF_LEFTUP;
            if (a == "down") { MouseFlag(desce); botoesApertados.Add(b); }
            else if (a == "up") { MouseFlag(sobe); botoesApertados.Remove(b); }
        }

        // roda sem tocar no cursor (no jogo ela troca de item/arma)
        static void RodaJogo(double dx, double dy)
        {
            if (dy != 0) MouseFlag(MOUSEEVENTF_WHEEL, unchecked((uint)(int)Math.Round(-dy * 1.2)));
            if (dx != 0) MouseFlag(MOUSEEVENTF_HWHEEL, unchecked((uint)(int)Math.Round(dx * 1.2)));
        }

        // code do navegador ("KeyW", "Space") -> scancode do Windows; +0x100 marca as estendidas.
        // Pelo code e não pela letra: vale a POSIÇÃO da tecla, igual para qualquer teclado.
        static readonly Dictionary<string, int> SCANS = new Dictionary<string, int>
        {
            { "Escape", 0x01 }, { "Digit1", 0x02 }, { "Digit2", 0x03 }, { "Digit3", 0x04 }, { "Digit4", 0x05 },
            { "Digit5", 0x06 }, { "Digit6", 0x07 }, { "Digit7", 0x08 }, { "Digit8", 0x09 }, { "Digit9", 0x0A },
            { "Digit0", 0x0B }, { "Minus", 0x0C }, { "Equal", 0x0D }, { "Backspace", 0x0E }, { "Tab", 0x0F },
            { "KeyQ", 0x10 }, { "KeyW", 0x11 }, { "KeyE", 0x12 }, { "KeyR", 0x13 }, { "KeyT", 0x14 },
            { "KeyY", 0x15 }, { "KeyU", 0x16 }, { "KeyI", 0x17 }, { "KeyO", 0x18 }, { "KeyP", 0x19 },
            { "BracketLeft", 0x1A }, { "BracketRight", 0x1B }, { "Enter", 0x1C }, { "ControlLeft", 0x1D },
            { "KeyA", 0x1E }, { "KeyS", 0x1F }, { "KeyD", 0x20 }, { "KeyF", 0x21 }, { "KeyG", 0x22 },
            { "KeyH", 0x23 }, { "KeyJ", 0x24 }, { "KeyK", 0x25 }, { "KeyL", 0x26 }, { "Semicolon", 0x27 },
            { "Quote", 0x28 }, { "Backquote", 0x29 }, { "ShiftLeft", 0x2A }, { "Backslash", 0x2B },
            { "KeyZ", 0x2C }, { "KeyX", 0x2D }, { "KeyC", 0x2E }, { "KeyV", 0x2F }, { "KeyB", 0x30 },
            { "KeyN", 0x31 }, { "KeyM", 0x32 }, { "Comma", 0x33 }, { "Period", 0x34 }, { "Slash", 0x35 },
            { "ShiftRight", 0x36 }, { "NumpadMultiply", 0x37 }, { "AltLeft", 0x38 }, { "Space", 0x39 },
            { "CapsLock", 0x3A }, { "F1", 0x3B }, { "F2", 0x3C }, { "F3", 0x3D }, { "F4", 0x3E },
            { "F5", 0x3F }, { "F6", 0x40 }, { "F7", 0x41 }, { "F8", 0x42 }, { "F9", 0x43 }, { "F10", 0x44 },
            { "NumLock", 0x45 }, { "ScrollLock", 0x46 }, { "Numpad7", 0x47 }, { "Numpad8", 0x48 },
            { "Numpad9", 0x49 }, { "NumpadSubtract", 0x4A }, { "Numpad4", 0x4B }, { "Numpad5", 0x4C },
            { "Numpad6", 0x4D }, { "NumpadAdd", 0x4E }, { "Numpad1", 0x4F }, { "Numpad2", 0x50 },
            { "Numpad3", 0x51 }, { "Numpad0", 0x52 }, { "NumpadDecimal", 0x53 }, { "IntlBackslash", 0x56 },
            { "F11", 0x57 }, { "F12", 0x58 }, { "IntlRo", 0x73 }, { "Convert", 0x79 }, { "NonConvert", 0x7B },
            { "IntlYen", 0x7D },
            { "NumpadEnter", 0x11C }, { "ControlRight", 0x11D }, { "NumpadDivide", 0x135 }, { "AltRight", 0x138 },
            { "Home", 0x147 }, { "ArrowUp", 0x148 }, { "PageUp", 0x149 }, { "ArrowLeft", 0x14B },
            { "ArrowRight", 0x14D }, { "End", 0x14F }, { "ArrowDown", 0x150 }, { "PageDown", 0x151 },
            { "Insert", 0x152 }, { "Delete", 0x153 }, { "ContextMenu", 0x15D },
        };

        static void TeclaJogo(string a, string code)
        {
            if (code == "MetaLeft" || code == "MetaRight") return; // tecla Windows: nunca
            bool desce = a != "up";
            if (code == "ControlLeft" || code == "ControlRight") ctrlRemoto = desce;
            else if (code == "AltLeft" || code == "AltRight") altRemoto = desce;
            // Ctrl+Alt+End é o atalho de emergência de quem compartilha: de fora, não
            if (code == "End" && desce && ctrlRemoto && altRemoto) return;
            int scan;
            if (!SCANS.TryGetValue(code ?? "", out scan)) return;
            Scan(scan, !desce);
            if (desce) scansApertados.Add(scan); else scansApertados.Remove(scan);
        }

        static void Scan(int scan, bool sobe)
        {
            var i = new INPUT { type = INPUT_KEYBOARD };
            i.u.ki = new KEYBDINPUT
            {
                wScan = (ushort)(scan & 0xFF),
                dwFlags = KEYEVENTF_SCANCODE | (scan > 0xFF ? KEYEVENTF_EXTENDEDKEY : 0) | (sobe ? KEYEVENTF_KEYUP : 0),
            };
            Enviar(i);
        }

        static readonly HashSet<int> ESTENDIDAS = new HashSet<int> { 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2D, 0x2E, 0x6F, 0x90 };

        static void Teclado(ushort vk, bool sobe, bool registrar = true)
        {
            var i = new INPUT { type = INPUT_KEYBOARD };
            i.u.ki = new KEYBDINPUT { wVk = vk, dwFlags = (sobe ? KEYEVENTF_KEYUP : 0) | (ESTENDIDAS.Contains(vk) ? KEYEVENTF_EXTENDEDKEY : 0) };
            Enviar(i);
            if (!registrar) return;
            if (sobe) teclasApertadas.Remove(vk); else teclasApertadas.Add(vk);
        }

        static void Unicode(char c)
        {
            foreach (var sobe in new[] { false, true })
            {
                var i = new INPUT { type = INPUT_KEYBOARD };
                i.u.ki = new KEYBDINPUT { wScan = c, dwFlags = KEYEVENTF_UNICODE | (sobe ? KEYEVENTF_KEYUP : 0) };
                Enviar(i);
            }
        }

        // ag: a tecla veio com o AltGr (Ctrl+Alt no Windows) e dá um caractere — @, €, °...
        static void Tecla(string a, string key, int kc, int mod, bool ag)
        {
            if (kc == VK_LWIN || kc == VK_RWIN || key == "Meta" || key == "OS") return; // tecla Windows: nunca
            bool ctrl = (mod & 2) != 0, alt = (mod & 1) != 0, meta = (mod & 4) != 0;
            if (meta) return;
            // Ctrl+Alt+End é o atalho de emergência de quem compartilha: de fora, não
            if (kc == VK_END && ctrl && alt) return;
            // letra/símbolo sem Ctrl/Alt (ou do AltGr): vai como caractere — respeita acento e o
            // teclado de quem digita. Emoji são dois "char" (par substituto) e vão os dois.
            bool caractere = key.Length == 1 || (key.Length == 2 && char.IsSurrogatePair(key[0], key[1]));
            if (caractere && ((!ctrl && !alt) || ag))
            {
                if (a == "down") foreach (char c in key) Unicode(c);
                return;
            }
            if (kc <= 0 || kc > 254) return;
            Teclado((ushort)kc, a == "up");
        }

        static void Texto(string s)
        {
            foreach (char c in s) { if (c == '\n') { Teclado(0x0D, false); Teclado(0x0D, true); } else if (c != '\r') Unicode(c); }
        }

        // solta tudo que ficou apertado (quem controlava saiu no meio de um Ctrl, de um arrasto...)
        static void SoltarTudo()
        {
            foreach (var vk in new List<ushort>(teclasApertadas)) Teclado(vk, true);
            foreach (var scan in new List<int>(scansApertados)) Scan(scan, true);
            scansApertados.Clear();
            ctrlRemoto = altRemoto = false;
            foreach (var b in new List<string>(botoesApertados))
                MouseFlag(b == "right" ? MOUSEEVENTF_RIGHTUP : b == "middle" ? MOUSEEVENTF_MIDDLEUP : MOUSEEVENTF_LEFTUP);
            botoesApertados.Clear();
        }

        // Ctrl+Alt+End no teclado de verdade: corta o controle e avisa a sala
        static void VigiarAtalho()
        {
            while (true)
            {
                Thread.Sleep(60);
                bool apertado = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0 && (GetAsyncKeyState(VK_MENU) & 0x8000) != 0 && (GetAsyncKeyState(VK_END) & 0x8000) != 0;
                if (!apertado || parado) continue;
                lock (travaEntrada) { parado = true; SoltarTudo(); }
                Escrever(new Dictionary<string, object> { { "tipo", "parado" } });
            }
        }
    }
}
