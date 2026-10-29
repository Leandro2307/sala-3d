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
// No menu do jogo, o celular aponta o lugar com o dedo (ev.abs, com x e y): o cursor vai até lá
// antes do clique, como numa tela de toque.
//
// Programa aberto como administrador: o Windows não deixa um programa comum (este, aberto pelo
// Chrome) mandar mouse e teclado para ele. O SendInput "dá certo" e o evento some, sem erro
// nenhum. Por isso o ajudante confere a janela que recebe a entrada e avisa a extensão
// ({ tipo: "admin" }): a sala diz a quem compartilha e a quem controla o que está acontecendo.
//
// Que programa está lá ({ tipo: "qual", titulo, programa }): o da janela compartilhada, ou o da
// frente na tela inteira. A sala reconhece o jogo (Minecraft, God of War...) e o celular de quem
// controla troca para os botões dele. Vai ao achar o alvo, ao ligar o modo jogo e, na tela
// inteira, quando a janela que recebe a entrada muda.
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
        [StructLayout(LayoutKind.Sequential)] struct CURSORINFO { public int cbSize; public int flags; public IntPtr hCursor; public PONTO pt; }
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
        [DllImport("user32.dll")] static extern bool GetCursorInfo(ref CURSORINFO ci);
        [DllImport("user32.dll")] static extern bool GetClipCursor(out RECT r);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
        [DllImport("user32.dll")] static extern bool EnumWindows(EnumWin p, IntPtr l);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplayDevices(string dev, uint i, ref DISPLAY_DEVICE d, uint f);
        [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, EnumMon p, IntPtr l);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFOEX mi);
        [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
        [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(PONTO p);
        [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint f);
        [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint acesso, bool herdar, uint pid);
        [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr p, int flags, StringBuilder nome, ref int tam);
        [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr p, uint acesso, out IntPtr token);
        [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr token, int classe, out int valor, int tam, out int devolvido);

        const uint INPUT_MOUSE = 0, INPUT_KEYBOARD = 1;
        const uint MOUSEEVENTF_MOVE = 1, KEYEVENTF_EXTENDEDKEY = 1, KEYEVENTF_KEYUP = 2, KEYEVENTF_UNICODE = 4, KEYEVENTF_SCANCODE = 8;
        const uint MOUSEEVENTF_LEFTDOWN = 2, MOUSEEVENTF_LEFTUP = 4, MOUSEEVENTF_RIGHTDOWN = 8, MOUSEEVENTF_RIGHTUP = 16,
                   MOUSEEVENTF_MIDDLEDOWN = 32, MOUSEEVENTF_MIDDLEUP = 64, MOUSEEVENTF_WHEEL = 0x800, MOUSEEVENTF_HWHEEL = 0x1000,
                   MOUSEEVENTF_VIRTUALDESK = 0x4000, MOUSEEVENTF_ABSOLUTE = 0x8000, MOUSEEVENTF_XDOWN = 0x80, MOUSEEVENTF_XUP = 0x100;
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
        // administrador: se este programa é (null = ainda não viu), a última janela conferida e o
        // último aviso mandado à extensão
        static bool? euAdmin;
        static IntPtr conferida = IntPtr.Zero;
        static bool avisouAdmin;
        static string qualEnviado; // título + programa do último "qual" mandado
        // Quem joga manda um "vivo" a cada meio segundo (site novo: vivoVisto). Sem nenhuma mensagem
        // por SEM_NOTICIA_MS com tecla ou botão apertado, solta tudo: quem jogava fechou a aba, o
        // celular bloqueou ou a rede caiu, e o personagem ficava andando sozinho.
        const int SEM_NOTICIA_MS = 1500;
        static int ultimaEntrada;
        static bool vivoVisto;
        // o cursor do jogo à mostra (menu) ou escondido: o último mandado (null = nenhum ainda)
        static bool? cursorEnviado;

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
            new Thread(VigiarJogo) { IsBackground = true }.Start();
            Escrever(new Dictionary<string, object> { { "tipo", "oi" }, { "versao", "1.8.0" } });
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
                // janela: já diz se ela está como administrador (antes da resposta, para a extensão
                // saber junto). Tela inteira: quem conta é a janela que recebe cada clique e tecla.
                if (ok) ConferirAdmin(ehJanela ? janela : IntPtr.Zero, true);
                if (ok) EscreverQual(ehJanela ? janela : GetForegroundWindow(), true);
                RECT r; Retangulo(out r);
                Escrever(new Dictionary<string, object> { { "tipo", "alvo" }, { "ok", ok }, { "rotulo", rotulo },
                    { "x", r.Left }, { "y", r.Top }, { "w", r.Right - r.Left }, { "h", r.Bottom - r.Top } });
                return;
            }
            // depois do Ctrl+Alt+End (ou do "Cortar o controle" no ícone da extensão, que manda o
            // "parar"), só volta quando quem compartilha liberar de novo na sala
            if (tipo == "retomar") { parado = false; return; }
            if (tipo == "parar") { lock (travaEntrada) { parado = true; SoltarTudo(); } return; }
            if (tipo == "soltar") { jogo = false; vivoVisto = false; cursorEnviado = null; SoltarTudo(); temAlvo = false; rotuloAtual = null; qualEnviado = null; return; }
            if (tipo != "entrada" || !temAlvo || parado) return;
            var ev = m["ev"] as Dictionary<string, object>;
            if (ev == null) return;
            string t = S(ev, "t");
            ultimaEntrada = Environment.TickCount;
            if (t == "vivo") { vivoVisto = true; return; }
            if (t == "modo")
            {
                jogo = B(ev, "jogo");
                cursorEnviado = null; // o jogo conta de novo se o cursor está à mostra
                if (!jogo) { vivoVisto = false; SoltarTudo(); }
                else EscreverQual(ehJanela ? janela : GetForegroundWindow()); // na tela inteira, o jogo já está na frente
                return;
            }
            // o site (1.4+) marca cada evento do modo jogo; o "modo" sozinho se perde se o ajudante
            // reabrir no meio. Movimento só com delta (sem x) também é de jogo.
            if (B(ev, "jogo") || (t == "mouse" && S(ev, "a") == "move" && !ev.ContainsKey("x") && ev.ContainsKey("dx"))) jogo = true;
            if (t == "mouse")
            {
                if (!jogo) Mouse(S(ev, "a"), D(ev, "x"), D(ev, "y"), S(ev, "b"));
                else if (B(ev, "abs")) MouseNoPonto(S(ev, "a"), S(ev, "b"), D(ev, "x"), D(ev, "y"));
                else MouseJogo(S(ev, "a"), S(ev, "b"), D(ev, "dx"), D(ev, "dy"));
            }
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

        // ------------------------------------------------------------ administrador
        static bool Elevado(IntPtr processo)
        {
            IntPtr token;
            if (!OpenProcessToken(processo, 8 /* TOKEN_QUERY */, out token)) return false;
            try { int v, r; return GetTokenInformation(token, 20 /* TokenElevation */, out v, 4, out r) && v != 0; }
            finally { CloseHandle(token); }
        }

        // a entrada que este programa manda não chega nessa janela? (dele como administrador, e
        // este não). Sem como saber (processo protegido), não avisa.
        static bool JanelaDeAdmin(IntPtr h)
        {
            if (euAdmin == null) euAdmin = Elevado(GetCurrentProcess());
            if (euAdmin == true || h == IntPtr.Zero) return false;
            uint pid;
            GetWindowThreadProcessId(h, out pid);
            if (pid == 0) return false;
            IntPtr p = OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, false, pid);
            if (p == IntPtr.Zero) return false;
            try { return Elevado(p); } finally { CloseHandle(p); }
        }

        // Avisa a extensão quando muda (sempre: avisa de qualquer jeito, para um alvo novo). Cada
        // janela é conferida uma vez: no WASD de um jogo isso roda a cada tecla.
        static void ConferirAdmin(IntPtr h, bool sempre = false)
        {
            if (!sempre && h == conferida) return;
            conferida = h;
            if (!ehJanela) EscreverQual(h);
            bool admin = JanelaDeAdmin(h);
            if (!sempre && admin == avisouAdmin) return;
            avisouAdmin = admin;
            var titulo = new StringBuilder(256);
            if (admin) GetWindowText(h, titulo, 256);
            Escrever(new Dictionary<string, object> { { "tipo", "admin" }, { "admin", admin }, { "titulo", titulo.ToString() } });
        }

        // ------------------------------------------------------------ que programa
        // Conta à extensão o título e o programa (o .exe, sem a extensão) da janela — só quando mudam.
        static void EscreverQual(IntPtr h, bool sempre = false)
        {
            if (h == IntPtr.Zero) return;
            var sb = new StringBuilder(256);
            GetWindowText(h, sb, 256);
            string titulo = sb.ToString(), programa = Programa(h);
            string chave = titulo + "|" + programa;
            if (!sempre && chave == qualEnviado) return;
            qualEnviado = chave;
            Escrever(new Dictionary<string, object> { { "tipo", "qual" }, { "titulo", titulo }, { "programa", programa } });
        }

        static string Programa(IntPtr h)
        {
            uint pid;
            GetWindowThreadProcessId(h, out pid);
            if (pid == 0) return "";
            IntPtr p = OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, false, pid);
            if (p == IntPtr.Zero) return "";
            try
            {
                var nome = new StringBuilder(1024);
                int tam = nome.Capacity;
                return QueryFullProcessImageName(p, 0, nome, ref tam) ? Path.GetFileNameWithoutExtension(nome.ToString()) : "";
            }
            catch { return ""; }
            finally { CloseHandle(p); }
        }

        // tela inteira: o clique cai na janela embaixo do cursor, e as teclas na da frente
        static void ConferirSob()
        {
            PONTO c;
            if (!ehJanela && GetCursorPos(out c)) ConferirAdmin(GetAncestor(WindowFromPoint(c), 2 /* GA_ROOT */));
        }
        static void ConferirFrente() { if (!ehJanela) ConferirAdmin(GetForegroundWindow()); }

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
            if (a == "down") ConferirSob();
            if (a == "down" || a == "up") Botao(b, a == "down");
        }

        // aperta ou solta um botão: left, right, middle, ou x1/x2 (os do lado do mouse: voltar e avançar)
        static void Botao(string b, bool desce)
        {
            if (b == "x1" || b == "x2") MouseFlag(desce ? MOUSEEVENTF_XDOWN : MOUSEEVENTF_XUP, b == "x1" ? 1u : 2u);
            else if (b == "right") MouseFlag(desce ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP);
            else if (b == "middle") MouseFlag(desce ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP);
            else MouseFlag(desce ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP);
            if (desce) botoesApertados.Add(b); else botoesApertados.Remove(b);
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
                ConferirSob();
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
            if (a == "down" || a == "up") Botao(b, a == "down");
        }

        // Menu do jogo pelo celular: o dedo aponta o lugar (x, y de 0 a 1 na janela/tela, como no
        // controle comum) e o cursor vai para lá antes do clique. O movimento vai pela fila de
        // entrada (SendInput absoluto), na mesma ordem do clique que vem logo atrás.
        static void MouseNoPonto(string a, string b, double fx, double fy)
        {
            int x, y;
            if (!Ponto(fx, fy, out x, out y)) return;
            if (a == "down") Focar();
            MoverPara(x, y);
            if (a == "move") return;
            if (a == "down" && !ehJanela) ConferirAdmin(GetAncestor(WindowFromPoint(new PONTO { X = x, Y = y }), 2 /* GA_ROOT */));
            if (a == "down" || a == "up") Botao(b, a == "down");
        }

        // pixel da área de trabalho -> 0..65535 da tela virtual (todos os monitores juntos)
        static void MoverPara(int x, int y)
        {
            RECT v = TelaVirtual();
            double w = Math.Max(1, v.Right - v.Left - 1), h = Math.Max(1, v.Bottom - v.Top - 1);
            var i = new INPUT { type = INPUT_MOUSE };
            i.u.mi = new MOUSEINPUT
            {
                dx = (int)Math.Round((x - v.Left) * 65535 / w),
                dy = (int)Math.Round((y - v.Top) * 65535 / h),
                dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK,
            };
            Enviar(i);
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
            { "IntlYen", 0x7D }, { "NumpadComma", 0x7E }, { "NumpadEqual", 0x59 },
            { "F13", 0x64 }, { "F14", 0x65 }, { "F15", 0x66 }, { "F16", 0x67 }, { "F17", 0x68 }, { "F18", 0x69 },
            { "F19", 0x6A }, { "F20", 0x6B }, { "F21", 0x6C }, { "F22", 0x6D }, { "F23", 0x6E }, { "F24", 0x76 },
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
            if (desce) ConferirFrente();
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
            if (a == "down") ConferirFrente();
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
            foreach (var b in new List<string>(botoesApertados)) Botao(b, false);
            botoesApertados.Clear();
        }

        // ------------------------------------------------------------ vigia do modo jogo
        // A cada 100 ms: (1) sem notícia de quem joga, com tecla apertada, solta tudo; (2) o cursor do
        // jogo apareceu (menu, inventário, pausa) ou sumiu — 3 leituras iguais seguidas antes de
        // avisar, e quem joga troca o mouse entre câmera (delta) e menu (posição).
        static void VigiarJogo()
        {
            bool? candidato = null;
            int iguais = 0;
            while (true)
            {
                Thread.Sleep(100);
                try
                {
                    lock (travaEntrada)
                    {
                        if (jogo && vivoVisto && !parado && (scansApertados.Count > 0 || botoesApertados.Count > 0)
                            && unchecked(Environment.TickCount - ultimaEntrada) > SEM_NOTICIA_MS)
                        {
                            SoltarTudo();
                            Escrever(new Dictionary<string, object> { { "tipo", "soltou" } });
                        }
                    }
                    if (!jogo || !temAlvo || parado) { candidato = null; iguais = 0; continue; }
                    // janela: só vale com ela na frente (fora dela o cursor é o da área de trabalho)
                    if (ehJanela && GetForegroundWindow() != janela) continue;
                    bool livre = CursorLivre();
                    if (livre == candidato) iguais++; else { candidato = livre; iguais = 1; }
                    if (iguais < 3 || cursorEnviado == livre) continue;
                    cursorEnviado = livre;
                    Escrever(new Dictionary<string, object> { { "tipo", "cursor" }, { "livre", livre } });
                }
                catch { /* a saída fechou: o Rodar termina sozinho */ }
            }
        }

        // O cursor está à mostra e solto? Jogo com a câmera no mouse esconde o cursor (ShowCursor ou
        // cursor nulo) e alguns o prendem num ponto: preso numa área pequena conta como escondido.
        static bool CursorLivre()
        {
            var ci = new CURSORINFO(); ci.cbSize = Marshal.SizeOf(ci);
            if (!GetCursorInfo(ref ci)) return false;
            bool visivel = (ci.flags & 1) != 0 && ci.hCursor != IntPtr.Zero; // CURSOR_SHOWING
            RECT c;
            bool preso = GetClipCursor(out c) && (c.Right - c.Left < 64 || c.Bottom - c.Top < 64);
            return visivel && !preso;
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
