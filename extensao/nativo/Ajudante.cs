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
//
// Wi-Fi deste PC ({ tipo: "wifi", ... }, 1.11+): no modo jogo, a cada WIFI_MS, o sinal, a faixa, o
// canal e a velocidade do Wi-Fi, pela API do Windows (wlanapi: não depende do idioma, como o netsh).
// Vai para o relatório do modo jogo: a maior causa de engasgo nos testes era o Wi-Fi de quem compartilha.
//
// Memória deste PC (no mesmo pacote do Wi-Fi, em "pc", 1.12+: a extensão já repassa o pacote
// inteiro): a confirmada livre e o limite (RAM + arquivo de paginação) e a RAM livre. O emulador de
// Switch 2 (lichii) segura ~17 GB sozinho; com o Chrome compartilhando, a conta passava do limite e o
// Windows negava memória enquanto aumentava o arquivo de paginação — o jogo, o Chrome ou o PC
// inteiro travavam. A sala avisa quem compartilha.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
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
        [StructLayout(LayoutKind.Sequential)]
        class MEMORYSTATUSEX
        {
            public uint dwLength = 64; public uint dwMemoryLoad;
            public ulong ullTotalPhys, ullAvailPhys, ullTotalPageFile, ullAvailPageFile, ullTotalVirtual, ullAvailVirtual, ullAvailExtendedVirtual;
        }
        delegate bool EnumWin(IntPtr h, IntPtr l);
        delegate bool EnumMon(IntPtr m, IntPtr dc, ref RECT r, IntPtr l);

        [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
        [DllImport("kernel32.dll")] static extern uint SetThreadExecutionState(uint estado);
        [DllImport("wlanapi.dll")] static extern int WlanOpenHandle(uint versao, IntPtr r, out uint negociada, out IntPtr h);
        [DllImport("wlanapi.dll")] static extern int WlanCloseHandle(IntPtr h, IntPtr r);
        [DllImport("wlanapi.dll")] static extern int WlanEnumInterfaces(IntPtr h, IntPtr r, out IntPtr lista);
        [DllImport("wlanapi.dll")] static extern int WlanQueryInterface(IntPtr h, ref Guid g, int op, IntPtr r, out int tam, out IntPtr dados, IntPtr tipo);
        [DllImport("wlanapi.dll")] static extern void WlanFreeMemory(IntPtr p);
        [DllImport("kernel32.dll")] static extern bool GlobalMemoryStatusEx([In, Out] MEMORYSTATUSEX m);
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
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
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
            LerTrava();
            new Thread(VigiarAtalho) { IsBackground = true }.Start();
            new Thread(VigiarJogo) { IsBackground = true }.Start();
            new Thread(VigiarWifi) { IsBackground = true }.Start();
            Escrever(new Dictionary<string, object> { { "tipo", "oi" }, { "versao", "1.25.0" } });
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
            if (tipo == "seletor") { Seletor(S(m, "tela")); return; }
            // 1.15+: enquanto este PC compartilha, o Windows não dorme nem apaga/bloqueia a tela
            // (bloqueada, a captura vira imagem parada e a conexão cai). Vale para esta linha, que é
            // a que lê as mensagens e vive enquanto o Chrome tiver o ajudante aberto.
            if (tipo == "acordado")
            {
                uint r = SetThreadExecutionState(B(m, "on") ? 0x80000003u : 0x80000000u); // CONTINUOUS (+ SYSTEM + DISPLAY)
                Escrever(new Dictionary<string, object> { { "tipo", "acordado" }, { "pid", S(m, "pid") }, { "ok", r != 0 } });
                return;
            }
            if (tipo == "jogos" || tipo == "jogo-abrir" || tipo == "jogo-fechar" || tipo == "obs") { PedidoJogo(m); return; }
            if (tipo == "ps5" || tipo == "pc-ponte") { PedidoPs5(S(m, "pid"), tipo); return; }
            if (tipo == "lossless") { PedidoLossless(S(m, "pid")); return; }
            if (tipo == "voz") { PedidoVoz(S(m, "pid")); return; }
            if (tipo == "carga") { PedidoCarga(S(m, "pid")); return; }
            if (tipo == "obs-ps5") { PedidoObsPs5(S(m, "pid"), S(m, "alvo")); return; }
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
            // a sala abriu um jogo: fora dele, nada (ver Liberado)
            if (jogoTrava != null && !B(ev, "livre") && !Liberado(t, ev)) return; // livre: de quem hospeda
            if (t == "mouse")
            {
                if (!jogo) Mouse(S(ev, "a"), D(ev, "x"), D(ev, "y"), S(ev, "b"));
                else if (B(ev, "abs")) MouseNoPonto(S(ev, "a"), S(ev, "b"), D(ev, "x"), D(ev, "y"));
                else MouseJogo(S(ev, "a"), S(ev, "b"), D(ev, "dx"), D(ev, "dy"));
            }
            else if (t == "wheel") { if (jogo) RodaJogo(D(ev, "dx"), D(ev, "dy")); else Roda(D(ev, "x"), D(ev, "y"), D(ev, "dx"), D(ev, "dy")); }
            else if (t == "tecla") { if (jogo) TeclaJogo(S(ev, "a"), S(ev, "code")); else Tecla(S(ev, "a"), S(ev, "key"), (int)D(ev, "kc"), (int)D(ev, "mod"), B(ev, "ag")); }
            else if (t == "texto") Texto(S(ev, "s"));
            else if (t == "pad") Pad(ev);
        }

        // ------------------------------------------------------------ /tela
        // Alguém mandou /tela para este PC (1.13+): a sala já veio para a frente com o botão
        // "Compartilhar a tela inteira". O clicar-seletor.ps1 (ao lado deste arquivo) aperta esse
        // botão pelo UI Automation (o Chrome conta como clique) e depois escolhe a tela, liga o áudio
        // do sistema e aperta Compartilhar no seletor. Roda em outra linha: o seletor leva segundos e
        // a entrada não pode parar. Responde { tipo: "seletor", ok, msg }.
        static int seletorRodando;
        static void Seletor(string tela)
        {
            if (Interlocked.Exchange(ref seletorRodando, 1) == 1) return; // um de cada vez
            new Thread(() =>
            {
                bool ok = false; string msg = "";
                try
                {
                    string pasta = Environment.GetEnvironmentVariable("SALA3D_NATIVO") ?? "";
                    string ps1 = Path.Combine(pasta, "clicar-seletor.ps1");
                    if (!File.Exists(ps1)) msg = "sem-script";
                    else
                    {
                        var info = new System.Diagnostics.ProcessStartInfo("powershell.exe",
                            "-NoLogo -NoProfile -ExecutionPolicy Bypass -File \"" + ps1 + "\" -Tela \"" + tela.Replace("\"", "") + "\" -Espera 40")
                        { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardInput = true };
                        using (var p = System.Diagnostics.Process.Start(info))
                        {
                            // a saída dele não pode cair na deste programa (é o canal com o Chrome)
                            msg = p.StandardOutput.ReadToEnd().Trim();
                            if (!p.WaitForExit(60000)) { try { p.Kill(); } catch { } msg = "demorou"; }
                            else ok = p.ExitCode == 0;
                        }
                    }
                }
                catch (Exception err) { msg = err.Message; }
                finally { Interlocked.Exchange(ref seletorRodando, 0); }
                if (msg.Length > 200) msg = msg.Substring(msg.Length - 200);
                Escrever(new Dictionary<string, object> { { "tipo", "seletor" }, { "ok", ok }, { "msg", msg } });
            }) { IsBackground = true }.Start();
        }

        // ------------------------------------------------------------ jogos do PC (1.14+)
        // Este PC é o "hub" de jogos da sala: o catálogo são os atalhos (.lnk e .url) da pasta
        // "Jogos da Sala 3D" na área de trabalho. A sala só fica sabendo o nome do atalho, o ícone e a
        // capa (nunca o caminho do jogo) e só consegue abrir um atalho que está nessa pasta.
        // Pedidos (cada um com "pid", que volta na resposta):
        //   { tipo: "jogos" }                -> { tipo: "jogos", jogos: [{ id, nome, icone, capa, steam }], atual }
        //   { tipo: "jogo-abrir", id }       -> fecha o jogo de antes, abre este: { tipo: "jogo", ok, msg, nome, atual }
        //     (1.20+) com "monitor": N (o índice do EnumDisplayDevices, o do PC direto), o jogo abre
        //     nesse monitor e a janela dele vai para lá em tela cheia sem bordas (ver VigiarTelaCheia)
        //   { tipo: "jogo-fechar" }          -> { tipo: "jogo", ok, msg, atual }
        //   { tipo: "obs" }                  -> abre o OBS com a câmera virtual, se não estiver aberto: { tipo: "obs", ok, msg, ja }
        // O jogo abre pelo explorer.exe (como um clique duplo no atalho), fora da árvore de processos
        // do Chrome. "Fechar" fecha as janelas dos programas que abriram depois do clique (tirando
        // o Windows, o Chrome, o OBS e os lançadores, ver NAO_FECHAR) e, se não fecharem, encerra.
        static string PastaJogos()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Jogos da Sala 3D");
        }
        static readonly object travaJogo = new object();
        static string jogoAtual;        // o atalho aberto pela sala (null: nenhum)
        static DateTime jogoDesde;      // quando abriu (hora local, como o StartTime dos processos)
        static bool jogoLido;
        static int monitorDoJogo = -1;  // o monitor onde o jogo tem que ficar (-1: o que ele escolher)
        static readonly Dictionary<string, Dictionary<string, object>> cacheJogos = new Dictionary<string, Dictionary<string, object>>();

        static readonly HashSet<string> NAO_FECHAR = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            "chrome", "msedge", "obs64", "obs32", "obs-browser-page", "explorer", "powershell", "pwsh", "cmd", "conhost",
            "WindowsTerminal", "OpenConsole", "Taskmgr", "steam", "steamwebhelper", "steamservice", "EpicGamesLauncher",
            "EpicWebHelper", "Discord", "AnyDesk", "RvRvpnGui", "RvControlSvc", "MSIAfterburner", "RTSS", "LosslessScaling",
            "NVIDIA App", "nvcontainer", "NVIDIA Overlay", "GameBar", "GameBarFTServer", "SearchHost", "StartMenuExperienceHost",
            "ShellExperienceHost", "TextInputHost", "ApplicationFrameHost", "SystemSettings", "Code", "claude", "node",
        };

        // PS5 nativo (1.16+): a ponte ps5\sala3d-ps5.exe (Remote Play pela biblioteca do chiaki-ng, ver
        // ps5\ponte.c) abre na primeira vez que a sala pede e fica aberta enquanto este ajudante viver
        // (ela sai sozinha quando ele sai: --pai). A sala fala com ela direto por um WebSocket em
        // 127.0.0.1, na porta que ela escolheu, com um token aleatório que só a sala fica sabendo.
        //   { tipo: "ps5" } -> { tipo: "ps5", ok, porta, token, versao } ou { ok: false, msg }
        // PC direto (1.19+): { tipo: "pc-ponte" } abre pc\sala3d-pc.exe do mesmo jeito (ver pc\ponte-pc.c)
        static readonly object travaPs5 = new object();
        // Lossless Scaling (1.17+): aperta o atalho dele (o do Settings.xml do Lossless, Ctrl+Alt+S de
        // fábrica), que liga ou desliga a escala na janela da frente — a sala em tela cheia. Devolve
        // também como ele está configurado (geração, modo, multiplicador, alvo), para a sala explicar.
        //   { tipo: "lossless" } -> { tipo: "lossless", ok, rodando, atalho, geracao, modo, multiplicador, alvo, msg }
        static void PedidoLossless(string pid)
        {
            new Thread(() =>
            {
                var r = new Dictionary<string, object> { { "tipo", "lossless" }, { "pid", pid } };
                try
                {
                    // vai ligar (não está escalando): antes, o modo de vários monitores (ver LosslessMultiMonitor)
                    if (!LosslessEscalando())
                    {
                        IntPtr frente = GetForegroundWindow();
                        if (LosslessMultiMonitor(r) && frente != IntPtr.Zero) { Frente(frente); Thread.Sleep(400); }
                    }
                    AtalhoLossless(r);
                }
                catch (Exception err) { r["ok"] = false; r["msg"] = err.Message; }
                Escrever(r);
            }) { IsBackground = true }.Start();
        }

        // lê a configuração do Lossless em r e, se ele estiver aberto, aperta o atalho (r["ok"])
        static bool AtalhoLossless(Dictionary<string, object> r)
        {
            bool rodando = System.Diagnostics.Process.GetProcessesByName("LosslessScaling").Length > 0;
            r["rodando"] = rodando;
            string tecla = "S", mods = "Alt Control";
            string arq = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Lossless Scaling", "Settings.xml");
            if (File.Exists(arq))
            {
                string x = File.ReadAllText(arq);
                Func<string, string> campo = (n) =>
                {
                    var mt = System.Text.RegularExpressions.Regex.Match(x, "<" + n + ">([^<]*)</" + n + ">");
                    return mt.Success ? mt.Groups[1].Value.Trim() : null;
                };
                tecla = campo("Hotkey") ?? tecla;
                mods = campo("HotkeyModifierKeys") ?? mods;
                r["geracao"] = campo("FrameGeneration");
                r["modo"] = campo("LSFG3Mode1");
                r["multiplicador"] = campo("LSFG3Multiplier");
                r["alvo"] = campo("LSFG3Target");
            }
            var nomes = new List<string>();
            foreach (var md in new[] { "Control", "Alt", "Shift", "Windows" })
                if (mods.Contains(md)) nomes.Add(md == "Control" ? "Ctrl" : md == "Windows" ? "Win" : md);
            nomes.Add(tecla.StartsWith("D") && tecla.Length == 2 ? tecla.Substring(1) : tecla);
            r["atalho"] = string.Join("+", nomes);
            if (!rodando) { r["ok"] = false; r["msg"] = "fechado"; return false; }
            var vks = new List<ushort>();
            foreach (var md in mods.Split(new[] { ' ', ',' }, StringSplitOptions.RemoveEmptyEntries))
            {
                if (md == "Control") vks.Add(0x11);
                else if (md == "Alt") vks.Add(0x12);
                else if (md == "Shift") vks.Add(0x10);
                else if (md == "Windows") vks.Add(0x5B);
            }
            ushort vk;
            int nF;
            if (tecla.Length == 1) vk = (ushort)char.ToUpperInvariant(tecla[0]);
            else if (tecla.StartsWith("F") && int.TryParse(tecla.Substring(1), out nF) && nF >= 1 && nF <= 24) vk = (ushort)(0x70 + nF - 1);
            else if (tecla.StartsWith("D") && tecla.Length == 2 && char.IsDigit(tecla[1])) vk = (ushort)tecla[1];
            else { r["ok"] = false; r["msg"] = "atalho-desconhecido"; return false; }
            lock (travaEntrada)
            {
                foreach (var m in vks) Teclado(m, false, false);
                Teclado(vk, false, false);
                Thread.Sleep(40);
                Teclado(vk, true, false);
                for (int i = vks.Count - 1; i >= 0; i--) Teclado(vks[i], true, false);
            }
            r["ok"] = true;
            return true;
        }

        // Lossless em vários monitores (ajudante 1.25+). De fábrica o Lossless só escala a janela da
        // FRENTE: clicou na sala (no outro monitor) ou em qualquer outra janela, ele pausa e só volta com a
        // janela do PS5 na frente de novo (teste de 2026-11-19: "só entra quando fica na janela que abriu").
        // O "Multi display mode" dele (MultiDisplayMode no Settings.xml) segue escalando com o foco em
        // outra janela; e o "Clip cursor" desligado deixa o mouse sair da janela escalada para a sala.
        // Só esses dois campos mudam (em todos os perfis); o resto da configuração fica como está, e a
        // de antes fica guardada em Settings.antes-sala3d.xml (uma vez). O Lossless só lê o arquivo ao
        // abrir: se precisou mudar com ele aberto, fecha, grava e abre de novo (minimizado).
        // Devolve true quando reabriu o Lossless (a janela da frente pode ter mudado). r["multiMonitor"]:
        // "ja" | "ligado" | "sem-opcao" (Lossless antigo, sem o campo) | "erro: ..."
        static bool LosslessMultiMonitor(Dictionary<string, object> r)
        {
            try
            {
                string pasta = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Lossless Scaling");
                string arq = Path.Combine(pasta, "Settings.xml");
                if (!File.Exists(arq)) { r["multiMonitor"] = "sem-opcao"; return false; }
                string x = File.ReadAllText(arq);
                if (!x.Contains("<MultiDisplayMode>")) { r["multiMonitor"] = "sem-opcao"; return false; }
                if (!x.Contains("<MultiDisplayMode>false</MultiDisplayMode>") && !x.Contains("<ClipCursor>true</ClipCursor>")) { r["multiMonitor"] = "ja"; return false; }

                // aberto: fecha (pela janela, ele grava a dele; não fechou em 6 s, encerra) e guarda o caminho
                var ps = System.Diagnostics.Process.GetProcessesByName("LosslessScaling");
                string exe = null;
                foreach (var p in ps) { try { exe = exe ?? p.MainModule.FileName; } catch { } }
                foreach (var p in ps)
                {
                    try { p.CloseMainWindow(); } catch { }
                    try { if (!p.WaitForExit(6000)) { p.Kill(); p.WaitForExit(3000); } } catch { }
                }
                // relê: fechando, o Lossless grava a configuração dele por cima
                x = File.ReadAllText(arq);
                string antes = Path.Combine(pasta, "Settings.antes-sala3d.xml");
                if (!File.Exists(antes)) File.WriteAllText(antes, x);
                x = x.Replace("<MultiDisplayMode>false</MultiDisplayMode>", "<MultiDisplayMode>true</MultiDisplayMode>")
                     .Replace("<ClipCursor>true</ClipCursor>", "<ClipCursor>false</ClipCursor>");
                File.WriteAllText(arq, x, new UTF8Encoding(false));
                r["multiMonitor"] = "ligado";
                if (ps.Length == 0) return false; // fechado: vale quando abrir

                // abre de novo, como estava (pelo exe; sem ele, pela Steam) e minimizado
                if (exe != null && File.Exists(exe))
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(exe) { WorkingDirectory = Path.GetDirectoryName(exe), UseShellExecute = true, WindowStyle = System.Diagnostics.ProcessWindowStyle.Minimized });
                else
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("steam://rungameid/993090") { UseShellExecute = true });
                IntPtr janela = IntPtr.Zero;
                for (int t = 0; t < 60 && janela == IntPtr.Zero; t++)
                {
                    Thread.Sleep(250);
                    foreach (var p in System.Diagnostics.Process.GetProcessesByName("LosslessScaling"))
                    {
                        try { p.Refresh(); if (p.MainWindowHandle != IntPtr.Zero) janela = p.MainWindowHandle; } catch { }
                    }
                }
                if (janela != IntPtr.Zero) { Thread.Sleep(800); ShowWindow(janela, 6); } // minimizada (o atalho vale com ela assim)
                else r["multiMonitor"] = "ligado (o Lossless não reabriu: abra ele de novo)";
                Thread.Sleep(500);
                return true;
            }
            catch (Exception err) { r["multiMonitor"] = "erro: " + err.Message; return false; }
        }

        // ------------------------------------------------------------ PS5 + Lossless para todos (1.18+)
        // O PS5 a 30 qps, o Lossless dobra para 60 e todo mundo recebe os 60 pela câmera do OBS:
        //   { tipo: "obs-ps5", alvo: "<título da janela do PS5>" } -> a janela do PS5 (aberta pela sala) vai
        //     maximizada para o monitor em que a sala NÃO está; o OBS (aberto com a câmera virtual se
        //     estiver fechado) ganha a cena CENA_PS5 com a captura desse monitor, no ar; o Lossless liga
        //     na janela. { ok, msg, monitor, umMonitor, cenaAntes, + o que AtalhoLossless conta }
        //   { tipo: "obs-ps5", alvo: "__parar__" } -> a cena de antes volta ao ar (a sala fecha a janela,
        //     e o Lossless para sozinho com ela)
        // O OBS é comandado pelo WebSocket dele (ligado em Ferramentas → Configurações do servidor
        // WebSocket; a senha vem do config.json do plugin).
        // Testado em 2026-11-16 (página a 30 qps, Lossless adaptativo 165, OBS a 60 pelo WGC): a câmera do
        // OBS deu 55 quadros diferentes por segundo; pela Duplicação DXGI só 30 (ela não vê os quadros do
        // Lossless). O Lossless só escala a janela da frente: outra janela ganhou o foco, ele pausou (31);
        // a janela do PS5 voltou para a frente, ele retomou sozinho (55), sem apertar o atalho de novo.
        const string CENA_PS5 = "Sala 3D · PS5";
        const string FONTE_PS5 = "Sala 3D · monitor do PS5";
        // a cena que estava no ar antes: num arquivo (o ajudante fecha junto com o Chrome, e o "parar"
        // pode vir de um ajudante novo)
        static string cenaAntesPs5
        {
            get
            {
                try { string f = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Sala3d", "obs-cena-antes.txt"); return File.Exists(f) ? File.ReadAllText(f).Trim() : null; }
                catch { return null; }
            }
            set
            {
                try { string d = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Sala3d"); Directory.CreateDirectory(d); File.WriteAllText(Path.Combine(d, "obs-cena-antes.txt"), value ?? ""); }
                catch { }
            }
        }

        static void PedidoObsPs5(string pid, string alvo)
        {
            new Thread(() =>
            {
                var r = new Dictionary<string, object> { { "tipo", "obs-ps5" }, { "pid", pid } };
                try
                {
                    if (alvo == "__parar__") ObsPs5Parar(r);
                    else ObsPs5Ligar(string.IsNullOrEmpty(alvo) ? "PS5 · Lossless" : alvo, r);
                }
                catch (Exception err) { r["ok"] = false; if (!r.ContainsKey("msg")) r["msg"] = err.Message; }
                Escrever(r);
            }) { IsBackground = true }.Start();
        }

        // a janela visível cujo título CONTÉM o texto (na sala instalada o título vem com o nome do app
        // na frente: "Sala 3D - PS5 · Lossless"), sem conter o "evitar"
        static IntPtr JanelaComTitulo(string trecho, string evitar = null)
        {
            IntPtr achada = IntPtr.Zero;
            EnumWindows((h, l) =>
            {
                if (!IsWindowVisible(h)) return true;
                var sb = new StringBuilder(512);
                GetWindowText(h, sb, 512);
                string t = sb.ToString();
                if (t.Contains(trecho) && (evitar == null || !t.Contains(evitar))) { achada = h; return false; }
                return true;
            }, IntPtr.Zero);
            return achada;
        }

        static void ObsPs5Ligar(string titulo, Dictionary<string, object> r)
        {
            // a janela acabou de abrir: o título dela pode levar um instante para aparecer
            IntPtr janela = IntPtr.Zero;
            for (int t = 0; t < 20 && janela == IntPtr.Zero; t++) { janela = JanelaComTitulo(titulo); if (janela == IntPtr.Zero) Thread.Sleep(200); }
            if (janela == IntPtr.Zero)
            {
                // para o relatório: os títulos das janelas do Chrome que existiam
                var titulos = new List<string>();
                EnumWindows((h, l) => { if (!IsWindowVisible(h)) return true; var sb = new StringBuilder(200); GetWindowText(h, sb, 200); if (sb.ToString().Contains("Sala") || sb.ToString().Contains("PS5")) titulos.Add(sb.ToString()); return true; }, IntPtr.Zero);
                r["janelas"] = titulos;
                r["ok"] = false; r["msg"] = "sem-janela"; return;
            }
            // os monitores; o da sala é o da janela "Sala 3D" (a janela do PS5 vai para outro)
            var monitores = new List<MONITORINFOEX>();
            EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr mon, IntPtr dc, ref RECT rr, IntPtr l) =>
            {
                var mi = new MONITORINFOEX(); mi.cbSize = Marshal.SizeOf(mi);
                if (GetMonitorInfo(mon, ref mi)) monitores.Add(mi);
                return true;
            }, IntPtr.Zero);
            IntPtr sala = JanelaComTitulo("Sala 3D", titulo);
            string devSala = null;
            if (sala != IntPtr.Zero)
            {
                var ms = new MONITORINFOEX(); ms.cbSize = Marshal.SizeOf(ms);
                if (GetMonitorInfo(MonitorFromWindow(sala, 2), ref ms)) devSala = ms.szDevice;
            }
            var alvoMon = monitores.FirstOrDefault(m => m.szDevice != devSala);
            if (alvoMon.cbSize == 0) alvoMon = monitores.First();
            r["umMonitor"] = monitores.Count < 2;
            var rc = alvoMon.rcMonitor;
            r["monitor"] = alvoMon.szDevice + " @ " + rc.Left + "," + rc.Top;

            // o OBS: aberto (com a câmera virtual), a cena do PS5 capturando aquele monitor, no ar
            var obs = GarantirObs();
            if (!(obs["ok"] is bool && (bool)obs["ok"])) { r["ok"] = false; r["msg"] = "obs: " + obs["msg"]; return; }
            using (var ws = ObsWs.Abrir(r))
            {
                if (ws == null) return;
                string noAr = Txt(ws.Pedir("GetCurrentProgramScene"), "currentProgramSceneName");
                if (noAr != null && noAr != CENA_PS5) cenaAntesPs5 = noAr;
                r["cenaAntes"] = cenaAntesPs5;
                var cenas = Lista(ws.Pedir("GetSceneList"), "scenes").Select(c => Txt(c, "sceneName")).ToList();
                if (!cenas.Contains(CENA_PS5)) ws.Pedir("CreateScene", new Dictionary<string, object> { { "sceneName", CENA_PS5 } });
                var fontes = Lista(ws.Pedir("GetInputList", new Dictionary<string, object> { { "inputKind", "monitor_capture" } }), "inputs").Select(c => Txt(c, "inputName")).ToList();
                if (!fontes.Contains(FONTE_PS5))
                    ws.Pedir("CreateInput", new Dictionary<string, object> { { "sceneName", CENA_PS5 }, { "inputName", FONTE_PS5 }, { "inputKind", "monitor_capture" },
                        { "inputSettings", new Dictionary<string, object> { { "capture_cursor", false } } }, { "sceneItemEnabled", true } });
                // o monitor pelo nome que o OBS dá: "...: 1920x1080 @ -1920,0"
                string pos = "@ " + rc.Left + "," + rc.Top;
                string idMon = null;
                foreach (var it in Lista(ws.Pedir("GetInputPropertiesListPropertyItems", new Dictionary<string, object> { { "inputName", FONTE_PS5 }, { "propertyName", "monitor_id" } }), "propertyItems"))
                {
                    string nome = Txt(it, "itemName") ?? "";
                    if (nome.Contains(pos + " ") || nome.EndsWith(pos)) { idMon = Txt(it, "itemValue"); r["monitorObs"] = nome; break; }
                }
                if (idMon == null) { r["ok"] = false; r["msg"] = "obs: monitor " + pos + " não achado"; return; }
                ws.Pedir("SetInputSettings", new Dictionary<string, object> { { "inputName", FONTE_PS5 },
                    { "inputSettings", new Dictionary<string, object> { { "monitor_id", idMon }, { "method", 2 }, { "capture_cursor", false } } } });
                ws.Pedir("SetCurrentProgramScene", new Dictionary<string, object> { { "sceneName", CENA_PS5 } });
                var cam = ws.Pedir("GetVirtualCamStatus");
                var dados = cam != null && cam.ContainsKey("responseData") ? cam["responseData"] as Dictionary<string, object> : null;
                if (dados == null || !(dados["outputActive"] is bool && (bool)dados["outputActive"])) ws.Pedir("StartVirtualCam");
                r["qpsObs"] = Txt(ws.Pedir("GetVideoSettings"), "fpsNumerator");
            }

            // o Lossless seguindo com o foco na sala (antes de levar a janela para a frente: reabrir o
            // Lossless muda a janela da frente)
            if (!LosslessEscalando()) LosslessMultiMonitor(r);
            // a janela do PS5 maximizada no outro monitor, na frente, e o Lossless nela
            ShowWindow(janela, 9);
            SetWindowPos(janela, IntPtr.Zero, rc.Left + 40, rc.Top + 40, 1280, 720, 0x0040);
            ShowWindow(janela, 3);
            Thread.Sleep(500);
            for (int t = 0; t < 5 && GetForegroundWindow() != janela; t++) { Frente(janela); Thread.Sleep(200); }
            r["frente"] = GetForegroundWindow() == janela;
            Thread.Sleep(300);
            // só aperta o atalho se o Lossless ainda não estiver escalando (o atalho liga E desliga)
            if (!LosslessEscalando()) AtalhoLossless(r);
            else LerLossless(r);
            for (int t = 0; t < 15 && !LosslessEscalando(); t++) Thread.Sleep(100);
            r["lossless"] = LosslessEscalando();
            if (r.ContainsKey("msg") && (r["msg"] as string) == "fechado") { r["ok"] = false; r["msg"] = "lossless-fechado"; return; }
            r["ok"] = true; // a imagem do OBS já vale (30 sem o Lossless, mais com ele)
        }

        // o Lossless está escalando: a janela dele de classe "LosslessScaling" (a que cobre o monitor)
        static bool LosslessEscalando()
        {
            var ps = System.Diagnostics.Process.GetProcessesByName("LosslessScaling");
            if (ps.Length == 0) return false;
            var pids = new HashSet<uint>(ps.Select(x => (uint)x.Id));
            bool achou = false;
            EnumWindows((h, l) =>
            {
                uint pid;
                GetWindowThreadProcessId(h, out pid);
                if (!pids.Contains(pid) || !IsWindowVisible(h)) return true;
                var c = new StringBuilder(64);
                GetClassName(h, c, 64);
                if (c.ToString() == "LosslessScaling") { achou = true; return false; }
                return true;
            }, IntPtr.Zero);
            return achou;
        }

        // só a configuração (sem apertar nada)
        static void LerLossless(Dictionary<string, object> r)
        {
            string arq = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Lossless Scaling", "Settings.xml");
            r["rodando"] = true;
            if (!File.Exists(arq)) return;
            string x = File.ReadAllText(arq);
            foreach (var par in new[] { new[] { "geracao", "FrameGeneration" }, new[] { "modo", "LSFG3Mode1" }, new[] { "multiplicador", "LSFG3Multiplier" }, new[] { "alvo", "LSFG3Target" } })
            {
                var mt = System.Text.RegularExpressions.Regex.Match(x, "<" + par[1] + ">([^<]*)</" + par[1] + ">");
                if (mt.Success) r[par[0]] = mt.Groups[1].Value.Trim();
            }
        }

        static void ObsPs5Parar(Dictionary<string, object> r)
        {
            using (var ws = ObsWs.Abrir(r))
            {
                if (ws == null) return;
                if (!string.IsNullOrEmpty(cenaAntesPs5) && Txt(ws.Pedir("GetCurrentProgramScene"), "currentProgramSceneName") == CENA_PS5)
                    ws.Pedir("SetCurrentProgramScene", new Dictionary<string, object> { { "sceneName", cenaAntesPs5 } });
                r["cenaAntes"] = cenaAntesPs5;
                r["ok"] = true;
            }
        }

        // um campo de texto da resposta (responseData) de um pedido ao OBS, ou de um item de lista
        static string Txt(Dictionary<string, object> d, string k)
        {
            if (d == null) return null;
            if (d.ContainsKey("responseData")) d = d["responseData"] as Dictionary<string, object>;
            return d != null && d.ContainsKey(k) && d[k] != null ? Convert.ToString(d[k], System.Globalization.CultureInfo.InvariantCulture) : null;
        }

        static List<Dictionary<string, object>> Lista(Dictionary<string, object> resp, string k)
        {
            var d = resp != null && resp.ContainsKey("responseData") ? resp["responseData"] as Dictionary<string, object> : null;
            var r = new List<Dictionary<string, object>>();
            if (d == null || !d.ContainsKey(k) || !(d[k] is System.Collections.IEnumerable)) return r;
            foreach (var o in (System.Collections.IEnumerable)d[k]) { var x = o as Dictionary<string, object>; if (x != null) r.Add(x); }
            return r;
        }

        // O WebSocket do OBS (protocolo 5): conecta, autentica com a senha do config.json e faz pedidos
        class ObsWs : IDisposable
        {
            System.Net.WebSockets.ClientWebSocket ws = new System.Net.WebSockets.ClientWebSocket();
            static readonly JavaScriptSerializer json = new JavaScriptSerializer();

            // null (com r["msg"]) quando não dá: o servidor desligado, a senha, o OBS ainda abrindo
            public static ObsWs Abrir(Dictionary<string, object> r)
            {
                string arq = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "obs-studio", "plugin_config", "obs-websocket", "config.json");
                if (!File.Exists(arq)) { r["ok"] = false; r["msg"] = "obs-websocket"; return null; }
                var cfg = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(arq));
                if (!(cfg.ContainsKey("server_enabled") && cfg["server_enabled"] is bool && (bool)cfg["server_enabled"])) { r["ok"] = false; r["msg"] = "obs-websocket"; return null; }
                int porta = cfg.ContainsKey("server_port") ? Convert.ToInt32(cfg["server_port"]) : 4455;
                string senha = cfg.ContainsKey("server_password") ? Convert.ToString(cfg["server_password"]) : "";
                // o OBS recém-aberto leva uns segundos para abrir o WebSocket
                for (int t = 0; t < 10; t++)
                {
                    var o = new ObsWs();
                    try { o.Conectar(porta, senha); return o; }
                    catch (Exception err) { o.Dispose(); r["msg"] = "obs-websocket: " + err.Message; Thread.Sleep(1000); }
                }
                r["ok"] = false;
                return null;
            }

            static string Sha(string s)
            {
                using (var h = System.Security.Cryptography.SHA256.Create()) return Convert.ToBase64String(h.ComputeHash(Encoding.UTF8.GetBytes(s)));
            }

            void Conectar(int porta, string senha)
            {
                ws.Options.AddSubProtocol("obswebsocket.json");
                if (!ws.ConnectAsync(new Uri("ws://127.0.0.1:" + porta), CancellationToken.None).Wait(4000)) throw new Exception("não conectou");
                var ola = Ler();
                var d = ola["d"] as Dictionary<string, object>;
                var ident = new Dictionary<string, object> { { "rpcVersion", 1 }, { "eventSubscriptions", 0 } };
                var a = d != null && d.ContainsKey("authentication") ? d["authentication"] as Dictionary<string, object> : null;
                if (a != null) ident["authentication"] = Sha(Sha(senha + a["salt"]) + a["challenge"]);
                Mandar(new Dictionary<string, object> { { "op", 1 }, { "d", ident } });
                var ok = Ler();
                if (Convert.ToInt32(ok["op"]) != 2) throw new Exception("senha recusada");
            }

            void Mandar(object m)
            {
                var b = Encoding.UTF8.GetBytes(json.Serialize(m));
                ws.SendAsync(new ArraySegment<byte>(b), System.Net.WebSockets.WebSocketMessageType.Text, true, CancellationToken.None).Wait(4000);
            }

            Dictionary<string, object> Ler()
            {
                var buf = new byte[65536];
                var tudo = new MemoryStream();
                while (true)
                {
                    var t = ws.ReceiveAsync(new ArraySegment<byte>(buf), CancellationToken.None);
                    if (!t.Wait(6000)) throw new Exception("o OBS não respondeu");
                    if (t.Result.MessageType == System.Net.WebSockets.WebSocketMessageType.Close) throw new Exception("o OBS fechou a conexão");
                    tudo.Write(buf, 0, t.Result.Count);
                    if (t.Result.EndOfMessage) break;
                }
                return json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(tudo.ToArray()));
            }

            public Dictionary<string, object> Pedir(string tipo, Dictionary<string, object> dados = null)
            {
                string id = Guid.NewGuid().ToString();
                Mandar(new Dictionary<string, object> { { "op", 6 }, { "d", new Dictionary<string, object> { { "requestType", tipo }, { "requestId", id }, { "requestData", dados ?? new Dictionary<string, object>() } } } });
                for (int i = 0; i < 20; i++)
                {
                    var m = Ler();
                    var d = m["d"] as Dictionary<string, object>;
                    if (Convert.ToInt32(m["op"]) == 7 && d != null && Convert.ToString(d["requestId"]) == id) return d;
                }
                return null;
            }

            public void Dispose()
            {
                try { if (ws.State == System.Net.WebSockets.WebSocketState.Open) ws.CloseAsync(System.Net.WebSockets.WebSocketCloseStatus.NormalClosure, "", CancellationToken.None).Wait(1000); } catch { }
                ws.Dispose();
            }
        }

        // uma ponte aberta por este ajudante: a do PS5 (ps5\sala3d-ps5.exe) ou a do PC (pc\sala3d-pc.exe)
        class Ponte { public System.Diagnostics.Process p; public int porta; public string token, versao; }
        static readonly Dictionary<string, Ponte> pontes = new Dictionary<string, Ponte>();

        // tipo "ps5" ou "pc-ponte" (1.19+: o PC direto, a tela deste PC codificada pela placa)
        static void PedidoPs5(string pid, string tipo = "ps5")
        {
            new Thread(() =>
            {
                Dictionary<string, object> r;
                try { r = tipo == "pc-ponte" ? AbrirPonte("pc", "sala3d-pc.exe") : AbrirPonte("ps5", "sala3d-ps5.exe"); }
                catch (Exception err) { r = new Dictionary<string, object> { { "ok", false }, { "msg", err.Message } }; }
                r["tipo"] = tipo;
                r["pid"] = pid;
                Escrever(r);
            }) { IsBackground = true }.Start();
        }

        static Dictionary<string, object> AbrirPonte(string nome, string arquivo)
        {
            lock (travaPs5)
            {
                Ponte ponte;
                pontes.TryGetValue(nome, out ponte);
                if (ponte == null || ponte.p.HasExited)
                {
                    string pasta = Environment.GetEnvironmentVariable("SALA3D_NATIVO") ?? "";
                    string exe = Path.Combine(pasta, nome, arquivo);
                    if (!File.Exists(exe)) return new Dictionary<string, object> { { "ok", false }, { "msg", "sem-ponte" } };
                    var rnd = new byte[18];
                    using (var g = System.Security.Cryptography.RandomNumberGenerator.Create()) g.GetBytes(rnd);
                    string token = BitConverter.ToString(rnd).Replace("-", "").ToLowerInvariant();
                    var info = new System.Diagnostics.ProcessStartInfo(exe,
                        "--porta 0 --token " + token + " --pai " + System.Diagnostics.Process.GetCurrentProcess().Id)
                    {
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        RedirectStandardInput = true, // não herda a entrada do Chrome (as mensagens são deste ajudante)
                        RedirectStandardError = true,
                        CreateNoWindow = true,
                    };
                    var p = System.Diagnostics.Process.Start(info);
                    // a 1ª linha: {"porta":N,"versao":"..."} (ou {"erro":...})
                    var linha = p.StandardOutput.ReadLineAsync();
                    if (!linha.Wait(10000) || linha.Result == null)
                    {
                        try { p.Kill(); } catch { }
                        return new Dictionary<string, object> { { "ok", false }, { "msg", "ponte-calada" } };
                    }
                    var m = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(linha.Result);
                    if (!m.ContainsKey("porta"))
                    {
                        try { p.Kill(); } catch { }
                        return new Dictionary<string, object> { { "ok", false }, { "msg", "ponte-" + S(m, "erro") } };
                    }
                    ponte = new Ponte { p = p, porta = Convert.ToInt32(m["porta"]), token = token, versao = S(m, "versao") };
                    pontes[nome] = ponte;
                }
                return new Dictionary<string, object> { { "ok", true }, { "porta", ponte.porta }, { "token", ponte.token }, { "versao", ponte.versao } };
            }
        }

        // ------------------------------------------------------------ Voz Universal (1.21+)
        // A dublagem das legendas (o projeto VozUniversal) lendo o PS5 direto: a sala manda a imagem e o
        // som do PS5 por um WebSocket e recebe a voz de volta. O Voz Universal aberto escreve a porta, o
        // token e o pid dele em %LOCALAPPDATA%\Sala3d\voz-universal.json; fechado, este ajudante abre
        // ele (minimizado) da pasta onde estiver: o instalado (%LOCALAPPDATA%\VozUniversal) ou o clonado
        // (Área de Trabalho, pasta do usuário, Documentos; ou a variável VOZ_UNIVERSAL).
        //   { tipo: "voz" } -> { tipo: "voz", ok, porta, token, abriu } ou { ok: false, msg: "sem-voz-universal" | "nao-abriu" | ... }
        static readonly object travaVoz = new object();
        static string ArquivoVoz()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Sala3d", "voz-universal.json");
        }

        static void PedidoVoz(string pid)
        {
            new Thread(() =>
            {
                Dictionary<string, object> r;
                try { r = AbrirVoz(); }
                catch (Exception err) { r = new Dictionary<string, object> { { "ok", false }, { "msg", err.Message } }; }
                r["tipo"] = "voz";
                r["pid"] = pid;
                Escrever(r);
            }) { IsBackground = true }.Start();
        }

        // o Voz Universal que está aberto (o arquivo dele, com o processo vivo), ou null
        static Dictionary<string, object> VozAberta()
        {
            string arq = ArquivoVoz();
            if (!File.Exists(arq)) return null;
            try
            {
                var m = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(arq));
                using (var p = System.Diagnostics.Process.GetProcessById(Convert.ToInt32(m["pid"])))
                    if (p.HasExited) return null;
                return new Dictionary<string, object> { { "ok", true }, { "porta", Convert.ToInt32(m["porta"]) }, { "token", S(m, "token") } };
            }
            catch { return null; } // processo que não existe mais, ou arquivo pela metade
        }

        static IEnumerable<string> PastasVoz()
        {
            string env = Environment.GetEnvironmentVariable("VOZ_UNIVERSAL");
            if (!string.IsNullOrEmpty(env)) yield return env;
            string casa = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            yield return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "VozUniversal");
            yield return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "VozUniversal");
            yield return Path.Combine(casa, "Desktop", "VozUniversal");
            yield return Path.Combine(casa, "VozUniversal");
            yield return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "VozUniversal");
        }

        // o pythonw que roda o Voz Universal desta pasta: o .venv do instalador ou, no clonado, o que o
        // "Iniciar Voz Universal.bat" usa
        static string PythonDaVoz(string pasta)
        {
            string venv = Path.Combine(pasta, ".venv", "Scripts", "pythonw.exe");
            if (File.Exists(venv)) return venv;
            foreach (var bat in Directory.GetFiles(pasta, "*.bat"))
            {
                try
                {
                    foreach (System.Text.RegularExpressions.Match mt in System.Text.RegularExpressions.Regex.Matches(File.ReadAllText(bat), "\"([^\"]*pythonw?\\.exe)\"", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                    {
                        string py = mt.Groups[1].Value;
                        if (!Path.IsPathRooted(py)) py = Path.Combine(pasta, py);
                        if (File.Exists(py)) return py;
                    }
                }
                catch { }
            }
            return null;
        }

        static Dictionary<string, object> AbrirVoz()
        {
            lock (travaVoz)
            {
                var aberta = VozAberta();
                if (aberta != null) { aberta["abriu"] = false; return aberta; }
                string pasta = null, py = null;
                foreach (var p in PastasVoz())
                {
                    if (!File.Exists(Path.Combine(p, "app.py"))) continue;
                    py = PythonDaVoz(p);
                    if (py != null) { pasta = p; break; }
                }
                if (pasta == null) return new Dictionary<string, object> { { "ok", false }, { "msg", "sem-voz-universal" } };
                try { File.Delete(ArquivoVoz()); } catch { } // o de antes, de um que fechou travado
                // pelo shell: o Voz Universal não herda o canal com o Chrome (a entrada e a saída deste programa)
                var info = new System.Diagnostics.ProcessStartInfo(py, "app.py --minimizada")
                {
                    WorkingDirectory = pasta,
                    UseShellExecute = true,
                    WindowStyle = System.Diagnostics.ProcessWindowStyle.Minimized,
                };
                System.Diagnostics.Process.Start(info);
                // ele escreve o arquivo quando o servidor dele sobe (as vozes terminam de carregar depois)
                var fim = DateTime.UtcNow.AddSeconds(90);
                while (DateTime.UtcNow < fim)
                {
                    Thread.Sleep(500);
                    aberta = VozAberta();
                    if (aberta != null) { aberta["abriu"] = true; return aberta; }
                }
                return new Dictionary<string, object> { { "ok", false }, { "msg", "nao-abriu" } };
            }
        }

        static void PedidoJogo(Dictionary<string, object> m)
        {
            string tipo = S(m, "tipo"), pid = S(m, "pid"), id = S(m, "id");
            int monitor;
            if (!int.TryParse(S(m, "monitor"), out monitor)) monitor = -1;
            var t = new Thread(() =>
            {
                Dictionary<string, object> r;
                try
                {
                    lock (travaJogo)
                    {
                        LerJogoAtual();
                        if (tipo == "jogos") r = ListarJogos();
                        else if (tipo == "obs") r = GarantirObs();
                        else if (tipo == "jogo-fechar") r = FecharJogo();
                        else r = AbrirJogo(id, monitor);
                    }
                }
                catch (Exception err) { r = new Dictionary<string, object> { { "ok", false }, { "msg", err.Message } }; }
                if (!r.ContainsKey("tipo")) r["tipo"] = tipo == "obs" ? "obs" : tipo == "jogos" ? "jogos" : "jogo";
                r["pid"] = pid;
                Escrever(r);
            }) { IsBackground = true };
            t.SetApartmentState(ApartmentState.STA); // o WScript.Shell (ler os atalhos) gosta de STA
            t.Start();
        }

        // o jogo aberto sobrevive ao ajudante fechar (o Chrome reabre ele): fica num arquivo
        static string ArquivoJogoAtual() { return Path.Combine(Environment.GetEnvironmentVariable("LOCALAPPDATA") ?? "", "Sala3d", "jogo-atual.txt"); }
        static void LerJogoAtual()
        {
            if (jogoLido) return;
            jogoLido = true;
            try
            {
                var l = File.ReadAllLines(ArquivoJogoAtual());
                if (l.Length >= 2) { jogoAtual = l[0]; jogoDesde = new DateTime(long.Parse(l[1])); }
            }
            catch { }
        }
        static void GuardarJogoAtual()
        {
            try
            {
                if (jogoAtual == null) { File.Delete(ArquivoJogoAtual()); return; }
                Directory.CreateDirectory(Path.GetDirectoryName(ArquivoJogoAtual()));
                File.WriteAllLines(ArquivoJogoAtual(), new[] { jogoAtual, jogoDesde.Ticks.ToString() });
            }
            catch { }
        }

        // ------------------------------------------------------------ controle travado no jogo (1.23+)
        // A sala abriu um jogo do catálogo: o mouse, o teclado e o controle de quem joga só valem nas
        // janelas desse jogo (os programas abertos desde o clique, ver ProcessosDesde). Fora dele — a
        // área de trabalho, a barra de tarefas, o Chrome, outro programa, ou o jogo já fechado — o
        // clique e a tecla somem e o jogo volta para a frente se ainda estiver aberto. Alt+Tab,
        // Alt+Esc, Ctrl+Esc, Alt+Espaço e o botão Guia do controle (Game Bar, Steam) não vão nunca.
        // Só a sala destrava: fechando o jogo pelo catálogo ou abrindo outro. O mouse e o teclado
        // deste PC continuam livres (só a entrada que vem da sala passa por aqui). Sobrevive ao
        // ajudante reabrir: fica em jogo-trava.txt.
        static volatile string jogoTrava;   // o atalho do jogo que trava (null: livre)
        static DateTime travaDesde;
        static string ArquivoTrava() { return Path.Combine(Environment.GetEnvironmentVariable("LOCALAPPDATA") ?? "", "Sala3d", "jogo-trava.txt"); }
        static void LerTrava()
        {
            try
            {
                var l = File.ReadAllLines(ArquivoTrava());
                if (l.Length >= 2) { travaDesde = new DateTime(long.Parse(l[1])); jogoTrava = l[0]; }
            }
            catch { }
        }
        static void DefinirTrava(string jogo, DateTime desde)
        {
            travaDesde = desde;
            jogoTrava = jogo;
            janelaConferida = IntPtr.Zero;
            try
            {
                if (jogo == null) { File.Delete(ArquivoTrava()); return; }
                Directory.CreateDirectory(Path.GetDirectoryName(ArquivoTrava()));
                File.WriteAllLines(ArquivoTrava(), new[] { jogo, desde.Ticks.ToString() });
            }
            catch { }
        }

        // a janela é do jogo? (a de cima de tudo: a raiz). Cada janela é conferida no máximo 1 vez por segundo.
        static IntPtr janelaConferida; static bool janelaEhDoJogo; static int janelaQuando;
        static bool DoJogo(IntPtr h)
        {
            if (h == IntPtr.Zero) return false;
            IntPtr raiz = GetAncestor(h, 2 /* GA_ROOT */);
            if (raiz != IntPtr.Zero) h = raiz;
            int agora = Environment.TickCount;
            if (h == janelaConferida && unchecked(agora - janelaQuando) < 1000) return janelaEhDoJogo;
            bool r = false;
            try
            {
                uint pid;
                GetWindowThreadProcessId(h, out pid);
                var eu = System.Diagnostics.Process.GetCurrentProcess();
                if (pid != 0 && pid != (uint)eu.Id)
                {
                    using (var p = System.Diagnostics.Process.GetProcessById((int)pid))
                    {
                        string win = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
                        r = p.SessionId == eu.SessionId && !NAO_FECHAR.Contains(p.ProcessName)
                            && p.StartTime >= travaDesde.AddSeconds(-2)
                            && !p.MainModule.FileName.StartsWith(win, StringComparison.OrdinalIgnoreCase);
                    }
                }
            }
            catch { r = false; }
            janelaConferida = h; janelaEhDoJogo = r; janelaQuando = agora;
            return r;
        }

        static IntPtr JanelaEm(int x, int y) { return GetAncestor(WindowFromPoint(new PONTO { X = x, Y = y }), 2 /* GA_ROOT */); }

        // barrado: o jogo, se ainda estiver aberto, volta para a frente (no máximo a cada 1,5 s, fora
        // desta linha: procurar os programas leva um tempo e a entrada não pode parar)
        static int chamouJogo;
        // reabrir: no aluguel (lan house) o jogo não pode ser fechado — se quem alugou fechou (pelo menu
        // do jogo), ele abre de novo, no máximo uma vez por minuto
        static int reabriuJogo = Environment.TickCount - 600000;
        static void ChamarJogo(bool reabrir = false)
        {
            int agora = Environment.TickCount;
            if (unchecked(agora - chamouJogo) < 1500) return;
            chamouJogo = agora;
            DateTime desde = travaDesde;
            string jogo = jogoTrava;
            new Thread(() =>
            {
                try
                {
                    var procs = ProcessosDesde(desde);
                    IntPtr h = MaiorJanela(procs, true);
                    if (h != IntPtr.Zero) { Frente(h); return; }
                    if (!reabrir || jogo == null || procs.Count > 0 || unchecked(Environment.TickCount - reabriuJogo) < 60000) return;
                    lock (travaJogo)
                    {
                        if (jogoTrava != jogo) return;
                        string arq = Atalhos().FirstOrDefault(f => string.Equals(Path.GetFileName(f), jogo, StringComparison.OrdinalIgnoreCase));
                        if (arq == null) return;
                        reabriuJogo = Environment.TickCount;
                        jogoAtual = jogo;
                        jogoDesde = desde;
                        GuardarJogoAtual();
                        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("explorer.exe", "\"" + arq + "\"") { UseShellExecute = false });
                        VigiarTelaCheia(jogo);
                    }
                    Escrever(new Dictionary<string, object> { { "tipo", "jogo-reaberto" }, { "jogo", Path.GetFileNameWithoutExtension(jogo) } });
                }
                catch { }
            }) { IsBackground = true }.Start();
        }

        // o evento pode ir? (só com a trava ligada; soltar o que já estava apertado sempre pode)
        static bool Liberado(string t, Dictionary<string, object> ev)
        {
            string a = S(ev, "a");
            bool aluguel = B(ev, "aluguel"); // a sala marca: o PC está alugado (lan house) com este jogo
            IntPtr alvo;
            if (t == "mouse")
            {
                if (a == "move") return true;
                if (a == "up") return botoesApertados.Contains(S(ev, "b"));
                int x, y;
                if (ehJanela) alvo = janela; // vem para a frente (Focar) e o clique fica dentro dela
                else if (!jogo || B(ev, "abs")) alvo = Ponto(D(ev, "x"), D(ev, "y"), out x, out y) ? JanelaEm(x, y) : IntPtr.Zero;
                else
                {
                    // no modo jogo o clique cai onde o cursor está (ou no meio da tela, se ele estiver fora)
                    RECT r; PONTO c;
                    if (!GetCursorPos(out c)) c = new PONTO();
                    if (Retangulo(out r) && (c.X < r.Left || c.X >= r.Right || c.Y < r.Top || c.Y >= r.Bottom))
                        c = new PONTO { X = (r.Left + r.Right) / 2, Y = (r.Top + r.Bottom) / 2 };
                    alvo = JanelaEm(c.X, c.Y);
                }
            }
            else if (t == "wheel")
            {
                int x, y;
                alvo = jogo || ehJanela ? GetForegroundWindow() : Ponto(D(ev, "x"), D(ev, "y"), out x, out y) ? JanelaEm(x, y) : IntPtr.Zero;
            }
            else if (t == "tecla")
            {
                if (a == "up") return true;
                string code = S(ev, "code"), key = S(ev, "key");
                int mod = (int)D(ev, "mod");
                bool alt = (mod & 1) != 0 || (jogo && altRemoto), ctrl = (mod & 2) != 0 || (jogo && ctrlRemoto);
                bool tab = code == "Tab" || key == "Tab", esc = code == "Escape" || key == "Escape", espaco = code == "Space" || key == " ";
                // trocar de janela, abrir o Iniciar ou o menu da janela: nunca
                if ((alt && (tab || esc || espaco)) || (ctrl && esc)) return false;
                // aluguel: o Alt+F4 também não (fechar o jogo)
                if (aluguel && alt && (code == "F4" || key == "F4")) return false;
                alvo = GetForegroundWindow();
            }
            else if (t == "texto" || t == "pad") alvo = GetForegroundWindow();
            else return true;
            if (DoJogo(alvo)) return true;
            ChamarJogo(aluguel);
            if (t == "pad") PadNeutro();
            return false;
        }

        static string[] Atalhos()
        {
            string pasta = PastaJogos();
            if (!Directory.Exists(pasta)) return new string[0];
            return Directory.GetFiles(pasta).Where(f => f.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase) || f.EndsWith(".url", StringComparison.OrdinalIgnoreCase))
                .OrderBy(f => Path.GetFileNameWithoutExtension(f), StringComparer.CurrentCultureIgnoreCase).ToArray();
        }

        // o jogo aberto ainda está aberto? Nos primeiros 2 minutos conta como aberto mesmo sem janela
        // (o lançador da Steam/Epic/Hydra ainda está subindo o jogo)
        static string AtualAinda()
        {
            if (jogoAtual == null) return null;
            if ((DateTime.Now - jogoDesde).TotalSeconds < 120 || ProcessosDoJogo().Count > 0) return jogoAtual;
            jogoAtual = null;
            GuardarJogoAtual();
            return null;
        }

        static Dictionary<string, object> ListarJogos()
        {
            var lista = new List<object>();
            foreach (string f in Atalhos())
            {
                string chave = f + "|" + File.GetLastWriteTimeUtc(f).Ticks;
                foreach (string ext in new[] { ".jpg", ".jpeg", ".png" })
                {
                    string capa = Path.ChangeExtension(f, ext);
                    if (File.Exists(capa)) chave += "|" + File.GetLastWriteTimeUtc(capa).Ticks;
                }
                Dictionary<string, object> j;
                if (!cacheJogos.TryGetValue(chave, out j))
                {
                    j = DescreverJogo(f);
                    cacheJogos[chave] = j;
                }
                lista.Add(j);
            }
            return new Dictionary<string, object> { { "ok", true }, { "jogos", lista }, { "atual", AtualAinda() }, { "pasta", Directory.Exists(PastaJogos()) } };
        }

        static Dictionary<string, object> DescreverJogo(string f)
        {
            var j = new Dictionary<string, object> { { "id", Path.GetFileName(f) }, { "nome", Path.GetFileNameWithoutExtension(f) } };
            string iconeArq = "", alvo = "", args = "", url = "";
            int iconeIdx = 0;
            try
            {
                if (f.EndsWith(".url", StringComparison.OrdinalIgnoreCase))
                {
                    foreach (string linha in File.ReadAllLines(f))
                    {
                        if (linha.StartsWith("URL=", StringComparison.OrdinalIgnoreCase)) url = linha.Substring(4);
                        else if (linha.StartsWith("IconFile=", StringComparison.OrdinalIgnoreCase)) iconeArq = linha.Substring(9);
                        else if (linha.StartsWith("IconIndex=", StringComparison.OrdinalIgnoreCase)) int.TryParse(linha.Substring(10), out iconeIdx);
                    }
                }
                else
                {
                    var tipoShell = Type.GetTypeFromProgID("WScript.Shell");
                    object shell = Activator.CreateInstance(tipoShell);
                    object lnk = tipoShell.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { f });
                    var tl = lnk.GetType();
                    alvo = Convert.ToString(tl.InvokeMember("TargetPath", BindingFlags.GetProperty, null, lnk, null));
                    args = Convert.ToString(tl.InvokeMember("Arguments", BindingFlags.GetProperty, null, lnk, null));
                    string loc = Convert.ToString(tl.InvokeMember("IconLocation", BindingFlags.GetProperty, null, lnk, null));
                    int v = loc.LastIndexOf(',');
                    iconeArq = v >= 0 ? loc.Substring(0, v) : loc;
                    if (v >= 0) int.TryParse(loc.Substring(v + 1), out iconeIdx);
                    if (iconeArq.Trim() == "") { iconeArq = alvo; iconeIdx = 0; }
                }
            }
            catch { }
            // jogo da Steam (steam://rungameid/N, ou pelo Hydra com shop=steam&objectId=N): a sala
            // busca a capa na loja pelo número
            var mSteam = System.Text.RegularExpressions.Regex.Match(url, @"^steam://(?:rungameid|run)/(\d+)");
            if (!mSteam.Success) mSteam = System.Text.RegularExpressions.Regex.Match(args, @"shop=steam&objectId=(\d+)");
            if (mSteam.Success) j["steam"] = mSteam.Groups[1].Value;
            string icone = Icone(Environment.ExpandEnvironmentVariables(iconeArq), iconeIdx);
            if (icone == null) icone = IconeAssociado(f);
            if (icone != null) j["icone"] = icone;
            // capa própria: uma imagem com o mesmo nome do atalho, na mesma pasta
            foreach (string ext in new[] { ".jpg", ".jpeg", ".png" })
            {
                string capa = Path.ChangeExtension(f, ext);
                if (!File.Exists(capa)) continue;
                string c = Capa(capa);
                if (c != null) { j["capa"] = c; break; }
            }
            return j;
        }

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        static extern uint PrivateExtractIcons(string arquivo, int indice, int cx, int cy, IntPtr[] icones, uint[] ids, uint n, uint flags);
        [DllImport("user32.dll")]
        static extern bool DestroyIcon(IntPtr icone);

        static string Icone(string arq, int idx)
        {
            if (string.IsNullOrEmpty(arq) || !File.Exists(arq)) return null;
            try
            {
                if (arq.EndsWith(".ico", StringComparison.OrdinalIgnoreCase))
                {
                    foreach (int tam in new[] { 256, 128, 64, 48, 32 })
                    {
                        try { using (var ic = new System.Drawing.Icon(arq, tam, tam)) using (var b = ic.ToBitmap()) return Png(b); }
                        catch { }
                    }
                    return null;
                }
                foreach (int tam in new[] { 128, 64, 48 })
                {
                    var hs = new IntPtr[1];
                    var ids = new uint[1];
                    if (PrivateExtractIcons(arq, idx, tam, tam, hs, ids, 1, 0) == 0 || hs[0] == IntPtr.Zero) continue;
                    try { using (var ic = System.Drawing.Icon.FromHandle(hs[0])) using (var b = ic.ToBitmap()) return Png(b); }
                    catch { }
                    finally { DestroyIcon(hs[0]); }
                }
            }
            catch { }
            return null;
        }
        static string IconeAssociado(string arq)
        {
            try { using (var ic = System.Drawing.Icon.ExtractAssociatedIcon(arq)) using (var b = ic.ToBitmap()) return Png(b); }
            catch { return null; }
        }
        // o ícone vai com 64 px (cabe uma porção deles na mensagem para o servidor)
        static string Png(System.Drawing.Bitmap b)
        {
            using (var r = new System.Drawing.Bitmap(64, 64, System.Drawing.Imaging.PixelFormat.Format32bppArgb))
            {
                using (var g = System.Drawing.Graphics.FromImage(r))
                {
                    g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                    g.DrawImage(b, 0, 0, 64, 64);
                }
                using (var ms = new MemoryStream())
                {
                    r.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
                    return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
                }
            }
        }
        // a capa vai com até 200x300, em JPEG
        static string Capa(string arq)
        {
            try
            {
                using (var img = System.Drawing.Image.FromFile(arq))
                {
                    double k = Math.Min(1, Math.Min(200.0 / img.Width, 300.0 / img.Height));
                    int w = Math.Max(1, (int)(img.Width * k)), h = Math.Max(1, (int)(img.Height * k));
                    using (var r = new System.Drawing.Bitmap(w, h))
                    {
                        using (var g = System.Drawing.Graphics.FromImage(r))
                        {
                            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                            g.DrawImage(img, 0, 0, w, h);
                        }
                        var cod = System.Drawing.Imaging.ImageCodecInfo.GetImageEncoders().First(c => c.MimeType == "image/jpeg");
                        var pars = new System.Drawing.Imaging.EncoderParameters(1);
                        pars.Param[0] = new System.Drawing.Imaging.EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 80L);
                        using (var ms = new MemoryStream())
                        {
                            r.Save(ms, cod, pars);
                            return "data:image/jpeg;base64," + Convert.ToBase64String(ms.ToArray());
                        }
                    }
                }
            }
            catch { return null; }
        }

        // os programas que abriram depois do clique no atalho e têm janela (o jogo, e o lançador
        // dele, se não estava aberto antes)
        static List<System.Diagnostics.Process> ProcessosDoJogo()
        {
            if (jogoAtual == null) return new List<System.Diagnostics.Process>();
            return ProcessosDesde(jogoDesde);
        }

        // os programas com janela abertos desde "desde" (tirando o Windows e os de NAO_FECHAR): o jogo
        static List<System.Diagnostics.Process> ProcessosDesde(DateTime desde)
        {
            var lista = new List<System.Diagnostics.Process>();
            var jogoDesde = desde;
            string win = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            var eu = System.Diagnostics.Process.GetCurrentProcess();
            foreach (var p in System.Diagnostics.Process.GetProcesses())
            {
                try
                {
                    if (p.Id == eu.Id || p.SessionId != eu.SessionId || NAO_FECHAR.Contains(p.ProcessName)) continue;
                    if (p.MainWindowHandle == IntPtr.Zero) continue;
                    if (p.StartTime < jogoDesde.AddSeconds(-2)) continue;
                    string exe = p.MainModule.FileName; // como administrador: dá erro (e nem daria para fechar)
                    if (exe.StartsWith(win, StringComparison.OrdinalIgnoreCase)) continue;
                    lista.Add(p);
                }
                catch { }
            }
            return lista;
        }

        static Dictionary<string, object> FecharJogo()
        {
            if (jogoAtual == null) return new Dictionary<string, object> { { "ok", true }, { "msg", "nenhum jogo aberto" }, { "atual", null } };
            string nome = Path.GetFileNameWithoutExtension(jogoAtual);
            var procs = ProcessosDoJogo();
            foreach (var p in procs) { try { p.CloseMainWindow(); } catch { } }
            // espera fechar sozinho (salvar, sair do jogo); depois encerra
            var fim = DateTime.Now.AddSeconds(8);
            while (DateTime.Now < fim && procs.Any(p => { try { return !p.HasExited; } catch { return false; } })) Thread.Sleep(250);
            int encerrados = 0;
            foreach (var p in procs.Concat(ProcessosDoJogo()))
            {
                try { if (!p.HasExited) { p.Kill(); encerrados++; } } catch { }
            }
            jogoAtual = null;
            GuardarJogoAtual();
            DefinirTrava(null, DateTime.MinValue); // a sala fechou o jogo: o controle volta a valer na tela toda
            return new Dictionary<string, object> { { "ok", true }, { "msg", procs.Count == 0 ? nome + " já estava fechado" : "fechou " + nome }, { "atual", null } };
        }

        static Dictionary<string, object> AbrirJogo(string id, int monitor = -1)
        {
            string arq = Atalhos().FirstOrDefault(f => string.Equals(Path.GetFileName(f), id, StringComparison.OrdinalIgnoreCase));
            if (arq == null) return new Dictionary<string, object> { { "ok", false }, { "msg", "esse jogo não está mais na pasta Jogos da Sala 3D" }, { "atual", AtualAinda() } };
            string nome = Path.GetFileNameWithoutExtension(arq);
            RECT alvo;
            monitorDoJogo = monitor >= 0 && Monitor((uint)monitor, out alvo) ? monitor : -1;
            if (jogoAtual != null && string.Equals(jogoAtual, Path.GetFileName(arq), StringComparison.OrdinalIgnoreCase) && AtualAinda() != null)
            {
                if (!string.Equals(jogoTrava, jogoAtual, StringComparison.OrdinalIgnoreCase)) DefinirTrava(jogoAtual, jogoDesde);
                TrazerJogo(jogoAtual);
                // aberto noutro monitor: vai para o do PC direto
                if (monitorDoJogo >= 0) { IntPtr h = JanelaDoJogo(true); if (h != IntPtr.Zero) PorNoMonitor(h, monitorDoJogo); }
                return new Dictionary<string, object> { { "ok", true }, { "msg", nome + " já estava aberto: veio para a frente" }, { "nome", nome }, { "atual", jogoAtual } };
            }
            if (jogoAtual != null) FecharJogo();
            jogoDesde = DateTime.Now;
            jogoAtual = Path.GetFileName(arq);
            GuardarJogoAtual();
            DefinirTrava(jogoAtual, jogoDesde);
            // o mouse no monitor do jogo: muitos jogos abrem no monitor onde o ponteiro está
            if (monitorDoJogo >= 0 && Monitor((uint)monitorDoJogo, out alvo)) SetCursorPos((alvo.Left + alvo.Right) / 2, (alvo.Top + alvo.Bottom) / 2);
            // pelo explorer: o jogo não fica pendurado no Chrome (nem no job dele)
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("explorer.exe", "\"" + arq + "\"") { UseShellExecute = false });
            VigiarTelaCheia(jogoAtual);
            return new Dictionary<string, object> { { "ok", true }, { "msg", "abrindo " + nome }, { "nome", nome }, { "atual", jogoAtual } };
        }

        // Sempre em tela cheia: por 2 minutos depois de abrir, a janela da frente que for do jogo e
        // ainda estiver em janela (com barra de título) vira tela cheia sem bordas no monitor dela.
        // Jogo já em tela cheia não tem barra de título e fica como está. Os lançadores (Hydra) não.
        [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
        [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);
        [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr depois, int x, int y, int w, int hh, uint flags);
        [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
        static readonly HashSet<string> LANCADORES = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Hydra", "TLauncher", "RobloxPlayerLauncher", "RobloxPlayerInstaller" };
        // O controle segue o jogo: compartilhando a tela inteira (o OBS conta como o monitor dos
        // Ajustes), o mouse de quem joga vale no monitor onde a janela do jogo está — o jogo abre no
        // monitor principal, que pode não ser o dos Ajustes. Fechou o jogo, volta para o de antes.
        static RECT? telaAntesDoJogo;

        // a janela do jogo: a maior janela visível dos programas dele (sem os lançadores).
        // minimizada: vale também a minimizada (para trazer de volta)
        static IntPtr JanelaDoJogo(bool minimizada = false)
        {
            List<System.Diagnostics.Process> procs;
            lock (travaJogo) procs = ProcessosDoJogo();
            return MaiorJanela(procs, minimizada);
        }
        static IntPtr MaiorJanela(List<System.Diagnostics.Process> procs, bool minimizada)
        {
            IntPtr maior = IntPtr.Zero, mini = IntPtr.Zero; long area = 0;
            foreach (var p in procs)
            {
                if (LANCADORES.Contains(p.ProcessName)) continue;
                IntPtr h = p.MainWindowHandle;
                RECT r;
                if (!IsWindowVisible(h)) continue;
                if (IsIconic(h)) { mini = h; continue; }
                if (!GetWindowRect(h, out r)) continue;
                long a = (long)(r.Right - r.Left) * (r.Bottom - r.Top);
                if (a > area) { area = a; maior = h; }
            }
            return maior != IntPtr.Zero ? maior : minimizada ? mini : IntPtr.Zero;
        }

        // primeiro plano: o "Alt" destrava o SetForegroundWindow (o Windows recusa para quem não
        // está na frente), como no Focar()
        static void Frente(IntPtr h)
        {
            if (h == IntPtr.Zero) return;
            if (IsIconic(h)) ShowWindow(h, 9);
            if (GetForegroundWindow() == h) return;
            Teclado((ushort)VK_MENU, false, false);
            Teclado((ushort)VK_MENU, true, false);
            SetForegroundWindow(h);
        }

        // o jogo que já estava aberto ficou atrás (a sala veio para a frente para compartilhar):
        // traz de volta, tentando por uns segundos (o Chrome ainda pode estar se ajeitando)
        static void TrazerJogo(string jogo)
        {
            new Thread(() =>
            {
                for (int i = 0; i < 6 && jogoAtual == jogo; i++)
                {
                    try
                    {
                        IntPtr h = JanelaDoJogo(true);
                        if (h != IntPtr.Zero && GetForegroundWindow() == h && i >= 2) return;
                        Frente(h);
                    }
                    catch { }
                    Thread.Sleep(1000);
                }
            }) { IsBackground = true }.Start();
        }

        static void SeguirJogo(string jogo)
        {
            new Thread(() =>
            {
                bool trouxe = false;
                try
                {
                    while (jogoAtual == jogo)
                    {
                        Thread.Sleep(2000);
                        IntPtr maior = JanelaDoJogo();
                        if (maior == IntPtr.Zero) continue;
                        // a janela do jogo apareceu: vem para o primeiro plano (uma vez)
                        if (!trouxe) { trouxe = true; Frente(maior); }
                        var mi = new MONITORINFOEX(); mi.cbSize = Marshal.SizeOf(mi);
                        if (!GetMonitorInfo(MonitorFromWindow(maior, 2), ref mi)) continue;
                        lock (travaEntrada)
                        {
                            if (!temAlvo || ehJanela) continue;
                            var m = mi.rcMonitor;
                            if (m.Left == tela.Left && m.Top == tela.Top && m.Right == tela.Right && m.Bottom == tela.Bottom) continue;
                            if (telaAntesDoJogo == null) telaAntesDoJogo = tela;
                            tela = m;
                            // o cursor vai junto (senão o primeiro clique cai no outro monitor)
                            SetCursorPos((m.Left + m.Right) / 2, (m.Top + m.Bottom) / 2);
                        }
                    }
                }
                catch { }
                finally
                {
                    lock (travaEntrada)
                    {
                        if (telaAntesDoJogo != null && temAlvo && !ehJanela) tela = telaAntesDoJogo.Value;
                        telaAntesDoJogo = null;
                    }
                }
            }) { IsBackground = true }.Start();
        }

        const int GWL_STYLE = -16;
        const long WS_CAPTION = 0x00C00000, WS_THICKFRAME = 0x00040000, WS_POPUP = 0x80000000L;
        [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);

        static bool MesmoRet(RECT a, RECT b) { return a.Left == b.Left && a.Top == b.Top && a.Right == b.Right && a.Bottom == b.Bottom; }

        // a janela do jogo em tela cheia sem bordas no monitor indicado (-1: no monitor onde ela já está).
        // Devolve false se não precisou mexer.
        static bool PorNoMonitor(IntPtr h, int monitor)
        {
            RECT r;
            var mi = new MONITORINFOEX(); mi.cbSize = Marshal.SizeOf(mi);
            if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return false;
            if (monitor < 0 || !Monitor((uint)monitor, out r)) r = mi.rcMonitor;
            long estilo = GetWindowLongPtr(h, GWL_STYLE).ToInt64();
            bool comBorda = (estilo & WS_CAPTION) == WS_CAPTION;
            // já sem bordas / tela cheia no monitor certo: fica como está
            if (!comBorda && MesmoRet(mi.rcMonitor, r)) return false;
            if (IsZoomed(h)) ShowWindow(h, 9); // maximizada não muda de monitor: restaura antes
            if (comBorda) SetWindowLongPtr(h, GWL_STYLE, new IntPtr((estilo & ~(WS_CAPTION | WS_THICKFRAME)) | WS_POPUP));
            // SWP_FRAMECHANGED | SWP_SHOWWINDOW | SWP_NOOWNERZORDER
            SetWindowPos(h, IntPtr.Zero, r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top, 0x0020 | 0x0040 | 0x0200);
            return true;
        }

        static void VigiarTelaCheia(string jogo)
        {
            SeguirJogo(jogo);
            new Thread(() =>
            {
                // cada janela: quantas vezes já foi acertada (o jogo que insiste em voltar para o outro
                // monitor não fica num cabo de guerra)
                var feitas = new Dictionary<IntPtr, int>();
                var fim = DateTime.Now.AddMinutes(3);
                while (DateTime.Now < fim)
                {
                    Thread.Sleep(1000);
                    try
                    {
                        if (jogoAtual != jogo) return; // fecharam ou trocaram de jogo
                        int monitor = monitorDoJogo;
                        // com o monitor do PC direto: a janela do jogo, esteja ou não na frente (aberto
                        // pela lan house, ninguém clica nele, e a janela na frente é a da sala); sem
                        // monitor fixo: a que está na frente, como antes
                        IntPtr h = monitor >= 0 ? JanelaDoJogo() : GetForegroundWindow();
                        if (h == IntPtr.Zero || !IsWindowVisible(h) || IsIconic(h)) continue;
                        int vezes;
                        feitas.TryGetValue(h, out vezes);
                        // sem monitor fixo, uma olhada basta; com o do PC direto, confere sempre
                        if (vezes >= (monitor >= 0 ? 3 : 1)) continue;
                        uint pid;
                        GetWindowThreadProcessId(h, out pid);
                        System.Diagnostics.Process p;
                        lock (travaJogo) p = ProcessosDoJogo().FirstOrDefault(x => x.Id == pid);
                        if (p == null || LANCADORES.Contains(p.ProcessName)) continue;
                        if (monitor < 0) feitas[h] = 1;
                        if (PorNoMonitor(h, monitor) && monitor >= 0) feitas[h] = vezes + 1;
                    }
                    catch { }
                }
            }) { IsBackground = true }.Start();
        }

        static Dictionary<string, object> GarantirObs()
        {
            if (System.Diagnostics.Process.GetProcessesByName("obs64").Length > 0)
                return new Dictionary<string, object> { { "ok", true }, { "ja", true }, { "msg", "o OBS já estava aberto" } };
            string exe = null;
            foreach (string pf in new[] { Environment.GetEnvironmentVariable("ProgramW6432"), Environment.GetEnvironmentVariable("ProgramFiles") })
            {
                if (string.IsNullOrEmpty(pf)) continue;
                string c = Path.Combine(pf, "obs-studio", "bin", "64bit", "obs64.exe");
                if (File.Exists(c)) { exe = c; break; }
            }
            if (exe == null) return new Dictionary<string, object> { { "ok", false }, { "msg", "o OBS Studio não está instalado" } };
            // a pasta de trabalho tem que ser a do obs64.exe (senão ele não acha os arquivos dele)
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(exe, "--startvirtualcam --minimize-to-tray --disable-shutdown-check")
            { UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(exe) });
            // a câmera virtual liga uns segundos depois de o OBS abrir
            Thread.Sleep(7000);
            bool aberto = System.Diagnostics.Process.GetProcessesByName("obs64").Length > 0;
            return new Dictionary<string, object> { { "ok", aberto }, { "ja", false }, { "msg", aberto ? "abriu o OBS" : "o OBS não abriu" } };
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
            PadNeutro();
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
                        // controle virtual: o "vivo" de quem joga vale também para ele (analógico parado
                        // num lugar não manda estado novo); sem notícia, tudo solto e no centro
                        if (!padNeutro && unchecked(Environment.TickCount - ultimaEntrada) > SEM_NOTICIA_MS) PadNeutro();
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

        // ------------------------------------------------------------ Wi-Fi
        const int WIFI_MS = 2000; // o mesmo passo das amostras do relatório (2 s)
        static readonly object travaCarga = new object(); // os contadores da carga guardam a leitura anterior
        static void VigiarWifi()
        {
            int ultimo = 0;
            while (true)
            {
                Thread.Sleep(500);
                try
                {
                    if (!jogo || !temAlvo) { ultimo = 0; continue; }
                    if (ultimo != 0 && unchecked(Environment.TickCount - ultimo) < WIFI_MS) continue;
                    ultimo = Environment.TickCount;
                    Escrever(LerWifiECarga());
                }
                catch { /* a saída fechou */ }
            }
        }

        // O Wi-Fi, a memória, a carga do PC (1.20+) e as placas de rede ligadas, num pacote só
        static Dictionary<string, object> LerWifiECarga()
        {
            lock (travaCarga)
            {
                Dictionary<string, object> r;
                try { r = LerWifi(); }
                catch { r = new Dictionary<string, object> { { "tipo", "wifi" }, { "conectado", false }, { "erro", "wlan" } }; } // sem wlanapi (Windows Server)
                var pc = LerMemoria();
                if (pc != null) r["pc"] = pc;
                try { var c = LerCarga(); if (c != null) r["carga"] = c; } catch { }
                try { r["redes"] = LerRedes(); } catch { }
                return r;
            }
        }

        // 1.22+: { tipo: "carga" } -> o mesmo pacote do Wi-Fi, na hora. No PS5 direto a entrada de quem joga
        // vai pela ponte do PS5 (o ajudante não fica sabendo do modo jogo) e o relatório ficava sem o Wi-Fi e
        // a carga deste PC — justo quando o Wi-Fi caiu (2026-11-18). A sala pede a cada 2 s nessas sessões.
        static void PedidoCarga(string pid)
        {
            new Thread(() =>
            {
                Dictionary<string, object> r;
                try { r = LerWifiECarga(); }
                catch (Exception err) { r = new Dictionary<string, object> { { "ok", false }, { "msg", err.Message } }; }
                r["tipo"] = "carga";
                r["pid"] = pid;
                Escrever(r);
            }) { IsBackground = true }.Start();
        }

        // a memória deste PC em GB (ver o começo do arquivo); null se o Windows não disser
        static Dictionary<string, object> LerMemoria()
        {
            var m = new MEMORYSTATUSEX();
            if (!GlobalMemoryStatusEx(m)) return null;
            const double GB = 1024.0 * 1024 * 1024;
            return new Dictionary<string, object>
            {
                { "livreGb", Math.Round(m.ullAvailPageFile / GB, 1) }, { "limiteGb", Math.Round(m.ullTotalPageFile / GB, 1) },
                { "ramLivreGb", Math.Round(m.ullAvailPhys / GB, 1) }, { "ramGb", Math.Round(m.ullTotalPhys / GB, 1) },
            };
        }

        // O Wi-Fi conectado agora. Os números saem das estruturas do wlanapi pelas posições (64 bits ou
        // 32, as mesmas): WLAN_INTERFACE_INFO tem 532 bytes (GUID, nome, estado) depois de 8 de
        // cabeçalho; em WLAN_CONNECTION_ATTRIBUTES, a parte da associação começa em 520 — SSID (36),
        // tipo (4), BSSID (6 + 2), tipo de rádio em 568, sinal (0–100) em 576, recepção e envio em kbps
        // em 580 e 584. Canal: opcode 8; RSSI em dBm: opcode 0x10000102.
        static Dictionary<string, object> LerWifi()
        {
            var r = new Dictionary<string, object> { { "tipo", "wifi" }, { "conectado", false } };
            IntPtr h; uint neg;
            if (WlanOpenHandle(2, IntPtr.Zero, out neg, out h) != 0) { r["erro"] = "wlan"; return r; }
            IntPtr lista = IntPtr.Zero;
            try
            {
                if (WlanEnumInterfaces(h, IntPtr.Zero, out lista) != 0) return r;
                int n = Marshal.ReadInt32(lista, 0);
                for (int i = 0; i < n; i++)
                {
                    IntPtr item = new IntPtr(lista.ToInt64() + 8 + i * 532);
                    if (Marshal.ReadInt32(item, 528) != 1) continue; // wlan_interface_state_connected
                    var bytes = new byte[16];
                    Marshal.Copy(item, bytes, 0, 16);
                    var g = new Guid(bytes);
                    int tam; IntPtr d;
                    if (WlanQueryInterface(h, ref g, 7, IntPtr.Zero, out tam, out d, IntPtr.Zero) != 0) continue;
                    try
                    {
                        r["conectado"] = true;
                        r["adaptador"] = Marshal.PtrToStringUni(new IntPtr(item.ToInt64() + 16));
                        int fis = Marshal.ReadInt32(d, 568);
                        r["radio"] = fis == 4 ? "802.11a" : fis == 5 ? "802.11b" : fis == 6 ? "802.11g" : fis == 7 ? "802.11n (Wi-Fi 4)" : fis == 8 ? "802.11ac (Wi-Fi 5)" : fis == 10 ? "802.11ax (Wi-Fi 6)" : fis == 11 ? "802.11be (Wi-Fi 7)" : "tipo " + fis;
                        r["sinal"] = Marshal.ReadInt32(d, 576);
                        r["recebeMbps"] = Marshal.ReadInt32(d, 580) / 1000;
                        r["enviaMbps"] = Marshal.ReadInt32(d, 584) / 1000;
                    }
                    finally { WlanFreeMemory(d); }
                    if (WlanQueryInterface(h, ref g, 8, IntPtr.Zero, out tam, out d, IntPtr.Zero) == 0)
                    {
                        int canal = Marshal.ReadInt32(d, 0);
                        WlanFreeMemory(d);
                        r["canal"] = canal;
                        // canais até 14 são da faixa de 2,4 GHz; acima, 5 GHz (o 6 GHz usa os mesmos números)
                        r["faixa"] = canal <= 14 ? "2.4 GHz" : "5 GHz";
                    }
                    if (WlanQueryInterface(h, ref g, 0x10000102, IntPtr.Zero, out tam, out d, IntPtr.Zero) == 0)
                    {
                        r["rssi"] = Marshal.ReadInt32(d, 0);
                        WlanFreeMemory(d);
                    }
                    break;
                }
            }
            finally
            {
                if (lista != IntPtr.Zero) WlanFreeMemory(lista);
                WlanCloseHandle(h, IntPtr.Zero);
            }
            return r;
        }

        // ------------------------------------------------------------ carga do PC (1.20+)
        // Os engasgos de 2026-11-17 pioraram com o jogo rodando neste PC, e o relatório não tinha
        // como mostrar isso. A cada WIFI_MS vai junto do Wi-Fi, em "carga":
        // - cpu: uso total (%), dpc e interrupção (% do total e o pior núcleo). O Wi-Fi USB trabalha
        //   em DPC: um núcleo preso nisso atrasa os pacotes mesmo com a média baixa.
        // - gpu: uso por tipo de motor (3D, codificação, decodificação, cópia), pelos contadores do
        //   Windows (vale para qualquer placa), a memória de vídeo e quem mais usa o 3D (o jogo?).
        // - nv: da placa NVIDIA (nvml.dll, vem com o driver): uso, NVENC (uso, sessões, qps,
        //   latência), temperatura, clock, consumo e por que o clock está segurado.
        // - rede: por placa de rede, Mbps enviados/recebidos, fila de saída e pacotes descartados.
        // Os contadores são lidos pelo nome em inglês (o .NET acha mesmo no Windows em português) e
        // cada categoria sai de uma leitura só (ReadCategory, ~13 ms a do GPU Engine).
        static readonly Dictionary<string, System.Diagnostics.CounterSample> contAntes = new Dictionary<string, System.Diagnostics.CounterSample>();
        static readonly HashSet<string> contVistos = new HashSet<string>();

        // a taxa entre esta leitura e a anterior do mesmo contador; NaN na primeira
        static double Taxa(string chave, System.Diagnostics.CounterSample agora)
        {
            contVistos.Add(chave);
            System.Diagnostics.CounterSample antes;
            double v = double.NaN;
            if (contAntes.TryGetValue(chave, out antes)) v = System.Diagnostics.CounterSample.Calculate(antes, agora);
            contAntes[chave] = agora;
            return v;
        }

        static object R1(double v) { if (double.IsNaN(v) || double.IsInfinity(v)) return null; return Math.Round(v, 1); }

        static System.Diagnostics.InstanceDataCollectionCollection LerCategoria(string nome)
        {
            try { return new System.Diagnostics.PerformanceCounterCategory(nome).ReadCategory(); }
            catch { return null; }
        }

        static System.Diagnostics.InstanceDataCollection Contador(System.Diagnostics.InstanceDataCollectionCollection cat, string nome)
        {
            if (cat == null) return null;
            try { return cat.Contains(nome) ? cat[nome] : null; } catch { return null; }
        }

        static Dictionary<string, object> LerCarga()
        {
            contVistos.Clear();
            var r = new Dictionary<string, object>();
            try { r["cpu"] = LerCpu(); } catch { }
            try { r["gpu"] = LerGpu(); } catch { }
            try { var nv = LerNvidia(); if (nv != null) r["nv"] = nv; } catch { }
            try { r["rede"] = LerRedeCarga(); } catch { }
            // instâncias que sumiram (processos que fecharam) não ficam guardadas para sempre
            foreach (var k in contAntes.Keys.Where(k => !contVistos.Contains(k)).ToList()) contAntes.Remove(k);
            return r;
        }

        static Dictionary<string, object> LerCpu()
        {
            var cat = LerCategoria("Processor Information");
            var r = new Dictionary<string, object>();
            var util = Contador(cat, "% Processor Utility") ?? Contador(cat, "% Processor Time");
            var dpc = Contador(cat, "% DPC Time");
            var irq = Contador(cat, "% Interrupt Time");
            var perf = Contador(cat, "% Processor Performance");
            double piorDpc = double.NaN, piorIrq = double.NaN, piorUso = double.NaN;
            if (util != null)
                foreach (System.Diagnostics.InstanceData i in util.Values)
                {
                    double v = Taxa("cpu|" + i.InstanceName, i.Sample);
                    if (i.InstanceName == "_Total") r["usoPct"] = R1(Math.Min(100, v));
                    else if (!i.InstanceName.EndsWith("_Total") && !double.IsNaN(v)) piorUso = double.IsNaN(piorUso) ? v : Math.Max(piorUso, v);
                }
            if (dpc != null)
                foreach (System.Diagnostics.InstanceData i in dpc.Values)
                {
                    double v = Taxa("dpc|" + i.InstanceName, i.Sample);
                    if (i.InstanceName == "_Total") r["dpcPct"] = R1(v);
                    else if (!i.InstanceName.EndsWith("_Total") && !double.IsNaN(v)) piorDpc = double.IsNaN(piorDpc) ? v : Math.Max(piorDpc, v);
                }
            if (irq != null)
                foreach (System.Diagnostics.InstanceData i in irq.Values)
                {
                    double v = Taxa("irq|" + i.InstanceName, i.Sample);
                    if (i.InstanceName == "_Total") r["interrupcaoPct"] = R1(v);
                    else if (!i.InstanceName.EndsWith("_Total") && !double.IsNaN(v)) piorIrq = double.IsNaN(piorIrq) ? v : Math.Max(piorIrq, v);
                }
            if (perf != null)
                foreach (System.Diagnostics.InstanceData i in perf.Values)
                    if (i.InstanceName == "_Total") r["desempenhoPct"] = R1(Taxa("perf|_Total", i.Sample)); // abaixo de ~100: o processador está segurado (calor, energia)
            r["piorNucleoPct"] = R1(Math.Min(100, piorUso));
            r["piorNucleoDpcPct"] = R1(piorDpc);
            r["piorNucleoInterrupcaoPct"] = R1(piorIrq);
            return r;
        }

        // GPU Engine: uma instância por processo e motor ("pid_1234_luid_..._phys_0_eng_3_engtype_3D").
        // O uso de um motor é a soma dos processos nele; o de um tipo, o motor mais usado desse tipo.
        static Dictionary<string, object> LerGpu()
        {
            var r = new Dictionary<string, object>();
            var uso = Contador(LerCategoria("GPU Engine"), "Utilization Percentage");
            if (uso != null)
            {
                var porMotor = new Dictionary<string, double>();
                var tipoDoMotor = new Dictionary<string, string>();
                var porPid3d = new Dictionary<int, double>();
                foreach (System.Diagnostics.InstanceData i in uso.Values)
                {
                    string n = i.InstanceName;
                    double v = Taxa("gpu|" + n, i.Sample);
                    if (double.IsNaN(v)) continue;
                    int pe = n.IndexOf("_luid_"), te = n.IndexOf("_engtype_");
                    if (pe < 0 || te < 0) continue;
                    string motor = n.Substring(pe + 1, te - pe - 1); // luid_..._phys_0_eng_3
                    string tipo = n.Substring(te + 9).ToLowerInvariant();
                    double s; porMotor.TryGetValue(motor, out s); porMotor[motor] = s + v;
                    tipoDoMotor[motor] = tipo;
                    int pid;
                    if (tipo == "3d" && n.StartsWith("pid_") && int.TryParse(n.Substring(4, n.IndexOf('_', 4) - 4), out pid))
                    {
                        double p; porPid3d.TryGetValue(pid, out p); porPid3d[pid] = p + v;
                    }
                }
                var porTipo = new Dictionary<string, double>();
                foreach (var kv in porMotor)
                {
                    string t = tipoDoMotor[kv.Key];
                    double s; porTipo.TryGetValue(t, out s);
                    porTipo[t] = Math.Max(s, Math.Min(100, kv.Value));
                }
                double x;
                if (porTipo.TryGetValue("3d", out x)) r["tresDPct"] = R1(x);
                if (porTipo.TryGetValue("videoencode", out x)) r["codificaPct"] = R1(x);
                if (porTipo.TryGetValue("videodecode", out x)) r["decodificaPct"] = R1(x);
                if (porTipo.TryGetValue("copy", out x)) r["copiaPct"] = R1(x);
                // quem mais usa o 3D: o jogo, o Chrome (a sala desenhando), o OBS...
                var top = new List<object>();
                foreach (var kv in porPid3d.OrderByDescending(k => k.Value).Take(3))
                {
                    if (kv.Value < 1) break;
                    string nome = "pid " + kv.Key;
                    try { using (var p = System.Diagnostics.Process.GetProcessById(kv.Key)) nome = p.ProcessName; } catch { }
                    top.Add(new Dictionary<string, object> { { "programa", nome }, { "pct", R1(Math.Min(100, kv.Value)) } });
                }
                r["quemUsa3d"] = top;
            }
            var mem = Contador(LerCategoria("GPU Adapter Memory"), "Dedicated Usage");
            if (mem != null)
            {
                double maior = 0;
                foreach (System.Diagnostics.InstanceData i in mem.Values) maior = Math.Max(maior, i.RawValue);
                r["memoriaGb"] = Math.Round(maior / (1024.0 * 1024 * 1024), 2);
            }
            return r;
        }

        static Dictionary<string, object> LerRedeCarga()
        {
            var cat = LerCategoria("Network Interface");
            var r = new Dictionary<string, object>();
            var env = Contador(cat, "Bytes Sent/sec");
            var rec = Contador(cat, "Bytes Received/sec");
            var fila = Contador(cat, "Output Queue Length");
            var descS = Contador(cat, "Packets Outbound Discarded");
            var errS = Contador(cat, "Packets Outbound Errors");
            var descE = Contador(cat, "Packets Received Discarded");
            if (env == null) return r;
            foreach (System.Diagnostics.InstanceData i in env.Values)
            {
                string n = i.InstanceName;
                if (n.IndexOf("Teredo", StringComparison.OrdinalIgnoreCase) >= 0 || n.IndexOf("isatap", StringComparison.OrdinalIgnoreCase) >= 0 || n.IndexOf("Loopback", StringComparison.OrdinalIgnoreCase) >= 0) continue;
                var d = new Dictionary<string, object>();
                double e = Taxa("redeE|" + n, i.Sample);
                d["enviaMbps"] = R1(e * 8 / 1e6);
                if (rec != null && rec.Contains(n)) d["recebeMbps"] = R1(Taxa("redeR|" + n, rec[n].Sample) * 8 / 1e6);
                if (fila != null && fila.Contains(n)) d["filaSaida"] = fila[n].RawValue;
                // somas desde que o Windows ligou: a diferença desde a última leitura
                if (descS != null && descS.Contains(n)) d["descartadosSaida"] = Diferenca("dS|" + n, descS[n].RawValue);
                if (errS != null && errS.Contains(n)) d["errosSaida"] = Diferenca("eS|" + n, errS[n].RawValue);
                if (descE != null && descE.Contains(n)) d["descartadosEntrada"] = Diferenca("dE|" + n, descE[n].RawValue);
                r[n] = d;
            }
            return r;
        }

        static readonly Dictionary<string, long> brutoAntes = new Dictionary<string, long>();
        static object Diferenca(string chave, long agora)
        {
            long antes;
            object v = brutoAntes.TryGetValue(chave, out antes) ? (object)Math.Max(0, agora - antes) : null;
            brutoAntes[chave] = agora;
            return v;
        }

        // As placas de rede ligadas agora (cabo, Wi-Fi, VPN) e por qual sai a internet (a que tem gateway)
        static List<object> LerRedes()
        {
            var lista = new List<object>();
            foreach (var ni in System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus != System.Net.NetworkInformation.OperationalStatus.Up) continue;
                var t = ni.NetworkInterfaceType;
                if (t == System.Net.NetworkInformation.NetworkInterfaceType.Loopback || t == System.Net.NetworkInformation.NetworkInterfaceType.Tunnel) continue;
                bool gateway = false;
                try { gateway = ni.GetIPProperties().GatewayAddresses.Any(g => g.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork && !g.Address.Equals(System.Net.IPAddress.Any)); } catch { }
                lista.Add(new Dictionary<string, object> {
                    { "nome", ni.Name }, { "placa", ni.Description },
                    // a Radmin VPN e afins se dizem "Ethernet": não são o cabo
                    { "tipo", (ni.Description + " " + ni.Name).IndexOf("VPN", StringComparison.OrdinalIgnoreCase) >= 0 || ni.Description.IndexOf("Virtual", StringComparison.OrdinalIgnoreCase) >= 0 ? "vpn"
                        : t == System.Net.NetworkInformation.NetworkInterfaceType.Wireless80211 ? "wifi" : t == System.Net.NetworkInformation.NetworkInterfaceType.Ethernet ? "cabo" : t.ToString() },
                    { "mbps", ni.Speed / 1000000 }, { "internet", gateway },
                });
            }
            return lista;
        }

        // NVIDIA (nvml.dll, do driver). Sem placa NVIDIA ou sem a dll: null e não tenta de novo.
        [StructLayout(LayoutKind.Sequential)] struct NvmlUso { public uint gpu, memoria; }
        [DllImport("nvml.dll", EntryPoint = "nvmlInit_v2")] static extern int nvmlInit();
        [DllImport("nvml.dll", EntryPoint = "nvmlDeviceGetHandleByIndex_v2")] static extern int nvmlDeviceGetHandleByIndex(uint i, out IntPtr d);
        [DllImport("nvml.dll")] static extern int nvmlDeviceGetUtilizationRates(IntPtr d, out NvmlUso u);
        [DllImport("nvml.dll")] static extern int nvmlDeviceGetEncoderUtilization(IntPtr d, out uint uso, out uint periodoUs);
        [DllImport("nvml.dll")] static extern int nvmlDeviceGetDecoderUtilization(IntPtr d, out uint uso, out uint periodoUs);
        [DllImport("nvml.dll")] static extern int nvmlDeviceGetEncoderStats(IntPtr d, out uint sessoes, out uint qps, out uint latenciaUs);
        [DllImport("nvml.dll")] static extern int nvmlDeviceGetTemperature(IntPtr d, int sensor, out uint c);
        [DllImport("nvml.dll")] static extern int nvmlDeviceGetClockInfo(IntPtr d, int tipo, out uint mhz);
        [DllImport("nvml.dll")] static extern int nvmlDeviceGetPowerUsage(IntPtr d, out uint mw);
        [DllImport("nvml.dll")] static extern int nvmlDeviceGetCurrentClocksThrottleReasons(IntPtr d, out ulong motivos);
        static int nvEstado; // 0: não tentou; 1: ok; -1: sem NVIDIA
        static IntPtr nvPlaca;

        static Dictionary<string, object> LerNvidia()
        {
            if (nvEstado < 0) return null;
            if (nvEstado == 0)
            {
                try { nvEstado = nvmlInit() == 0 && nvmlDeviceGetHandleByIndex(0, out nvPlaca) == 0 ? 1 : -1; }
                catch { nvEstado = -1; } // DllNotFoundException: placa de outra marca
                if (nvEstado < 0) return null;
            }
            var r = new Dictionary<string, object>();
            NvmlUso u; uint a, b, c;
            if (nvmlDeviceGetUtilizationRates(nvPlaca, out u) == 0) { r["usoPct"] = (int)u.gpu; r["memoriaUsoPct"] = (int)u.memoria; }
            if (nvmlDeviceGetEncoderUtilization(nvPlaca, out a, out b) == 0) r["nvencPct"] = (int)a;
            if (nvmlDeviceGetDecoderUtilization(nvPlaca, out a, out b) == 0) r["nvdecPct"] = (int)a;
            if (nvmlDeviceGetEncoderStats(nvPlaca, out a, out b, out c) == 0) { r["nvencSessoes"] = (int)a; r["nvencQps"] = (int)b; r["nvencLatenciaMs"] = Math.Round(c / 1000.0, 1); }
            if (nvmlDeviceGetTemperature(nvPlaca, 0, out a) == 0) r["tempC"] = (int)a;
            if (nvmlDeviceGetClockInfo(nvPlaca, 0, out a) == 0) r["clockMhz"] = (int)a;
            if (nvmlDeviceGetPowerUsage(nvPlaca, out a) == 0) r["watts"] = (int)Math.Round(a / 1000.0);
            ulong m;
            try
            {
                if (nvmlDeviceGetCurrentClocksThrottleReasons(nvPlaca, out m) == 0)
                {
                    var motivos = new List<string>();
                    if ((m & 0x4) != 0) motivos.Add("limite de energia");
                    if ((m & 0x8) != 0) motivos.Add("freio do hardware");
                    if ((m & 0x20) != 0) motivos.Add("calor (driver)");
                    if ((m & 0x40) != 0) motivos.Add("calor (hardware)");
                    if ((m & 0x80) != 0) motivos.Add("freio de energia");
                    if ((m & 0x100) != 0) motivos.Add("clock da tela");
                    r["segurada"] = motivos;
                }
            }
            catch (EntryPointNotFoundException) { }
            return r;
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

        // ------------------------------------------------------------ controle virtual (PS5)
        // ev.t == "pad": o estado inteiro de um controle (botões + analógicos + gatilhos), vindo do
        // controle de verdade de quem joga (Gamepad API) ou do controle de toque do celular. Aqui
        // vira um controle de Xbox virtual no Windows (driver ViGEmBus + Nefarius.ViGEm.Client.dll,
        // que o instalar.bat baixa). O chiaki-ng (Remote Play do PS5 no PC) vê esse controle como
        // um de verdade e repassa para o PS5. A biblioteca é carregada só aqui, por reflexão: sem
        // ela o ajudante compila e funciona igual, só sem controle.
        static object padCliente, pad;
        static Type tipoPad;
        static string padErro;
        static bool padNeutro = true;
        static int padUltimo; // Environment.TickCount do último estado recebido
        // mesma ordem dos botões da Gamepad API ("standard"): o bit i é o botão i
        static readonly string[] BOTOES_PAD = { "A", "B", "X", "Y", "LeftShoulder", "RightShoulder", null, null,
            "Back", "Start", "LeftThumb", "RightThumb", "Up", "Down", "Left", "Right", "Guide" };
        static object[] botoesPad;
        static object eixoLX, eixoLY, eixoRX, eixoRY, gatilhoL, gatilhoR;
        static MethodInfo mBotao, mEixo, mGatilho, mEnviar;

        static object Estatico(Type t, string nome)
        {
            var p = t.GetProperty(nome, BindingFlags.Public | BindingFlags.Static);
            if (p != null) return p.GetValue(null, null);
            var f = t.GetField(nome, BindingFlags.Public | BindingFlags.Static);
            return f != null ? f.GetValue(null) : null;
        }

        // o método pode estar na interface do controle ou numa das que ela herda
        static MethodInfo MetodoPad(string nome, params Type[] tipos)
        {
            var m = tipoPad.GetMethod(nome, tipos);
            if (m != null) return m;
            foreach (var i in tipoPad.GetInterfaces()) { m = i.GetMethod(nome, tipos); if (m != null) return m; }
            throw new MissingMethodException("IXbox360Controller", nome);
        }

        static bool AbrirPad()
        {
            if (pad != null) return true;
            if (padErro != null) return false;
            try
            {
                string dll = null;
                foreach (var p in new[] { Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Sala3d", "Nefarius.ViGEm.Client.dll"),
                                          Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Nefarius.ViGEm.Client.dll") })
                    if (File.Exists(p)) { dll = p; break; }
                if (dll == null) throw new FileNotFoundException("sem-biblioteca");
                var a = Assembly.LoadFrom(dll);
                var tCli = a.GetType("Nefarius.ViGEm.Client.ViGEmClient", true);
                tipoPad = a.GetType("Nefarius.ViGEm.Client.Targets.IXbox360Controller", true);
                var tBotao = a.GetType("Nefarius.ViGEm.Client.Targets.Xbox360.Xbox360Button", true);
                var tEixo = a.GetType("Nefarius.ViGEm.Client.Targets.Xbox360.Xbox360Axis", true);
                var tGatilho = a.GetType("Nefarius.ViGEm.Client.Targets.Xbox360.Xbox360Slider", true);
                padCliente = Activator.CreateInstance(tCli); // sem o driver: VigemBusNotFoundException
                object c = tCli.GetMethod("CreateXbox360Controller", Type.EmptyTypes).Invoke(padCliente, null);
                MetodoPad("Connect").Invoke(c, null);
                foreach (var i in new[] { tipoPad }.Concat(tipoPad.GetInterfaces()))
                {
                    var auto = i.GetProperty("AutoSubmitReport");
                    if (auto != null) { auto.SetValue(c, false, null); break; }
                }
                botoesPad = BOTOES_PAD.Select(n => n == null ? null : Estatico(tBotao, n)).ToArray();
                eixoLX = Estatico(tEixo, "LeftThumbX"); eixoLY = Estatico(tEixo, "LeftThumbY");
                eixoRX = Estatico(tEixo, "RightThumbX"); eixoRY = Estatico(tEixo, "RightThumbY");
                gatilhoL = Estatico(tGatilho, "LeftTrigger"); gatilhoR = Estatico(tGatilho, "RightTrigger");
                mBotao = MetodoPad("SetButtonState", tBotao, typeof(bool));
                mEixo = MetodoPad("SetAxisValue", tEixo, typeof(short));
                mGatilho = MetodoPad("SetSliderValue", tGatilho, typeof(byte));
                mEnviar = MetodoPad("SubmitReport");
                OuvirTremor(c);
                pad = c;
                Escrever(new Dictionary<string, object> { { "tipo", "pad" }, { "ok", true } });
                return true;
            }
            catch (Exception err)
            {
                var raiz = err is TargetInvocationException && err.InnerException != null ? err.InnerException : err;
                padErro = raiz.GetType().Name.Contains("BusNotFound") ? "sem-driver" : raiz.Message;
                Escrever(new Dictionary<string, object> { { "tipo", "pad" }, { "ok", false }, { "erro", padErro } });
                return false;
            }
        }

        // Vibração (ajudante 1.10+): o jogo do PS5 manda tremer, o chiaki-ng repassa ao controle
        // (que ele acha que é um de Xbox) e o ViGEm avisa aqui pelo FeedbackReceived — motor grande e
        // pequeno, de 0 a 255. Vai para a sala (e de lá para quem joga) só quando muda, em 16
        // degraus: o chiaki-ng repete o mesmo valor dezenas de vezes por segundo.
        static int tremorEnviado = -1;
        static void OuvirTremor(object c)
        {
            try
            {
                EventInfo ev = tipoPad.GetEvent("FeedbackReceived");
                if (ev == null) foreach (var i in tipoPad.GetInterfaces()) { ev = i.GetEvent("FeedbackReceived"); if (ev != null) break; }
                if (ev == null) return;
                var m = typeof(Ajudante).GetMethod("AoTremor", BindingFlags.NonPublic | BindingFlags.Static);
                ev.AddEventHandler(c, Delegate.CreateDelegate(ev.EventHandlerType, m));
            }
            catch { } // sem vibração, o controle funciona igual
        }

        static void AoTremor(object quem, object e)
        {
            try
            {
                var t = e.GetType();
                int g = Convert.ToInt32(t.GetProperty("LargeMotor").GetValue(e, null)) >> 4;
                int p = Convert.ToInt32(t.GetProperty("SmallMotor").GetValue(e, null)) >> 4;
                int v = (g << 4) | p;
                if (Interlocked.Exchange(ref tremorEnviado, v) == v) return;
                Escrever(new Dictionary<string, object> { { "tipo", "tremor" }, { "g", g / 15.0 }, { "p", p / 15.0 } });
            }
            catch { }
        }

        static short Eixo(double v) { return (short)Math.Round(Math.Max(-1, Math.Min(1, v)) * 32767); }
        static byte Gatilho(double v) { return (byte)Math.Round(Math.Max(0, Math.Min(1, v)) * 255); }

        static void AplicarPad(int b, double lx, double ly, double rx, double ry, double lt, double rt)
        {
            for (int i = 0; i < botoesPad.Length; i++)
                if (botoesPad[i] != null) mBotao.Invoke(pad, new object[] { botoesPad[i], (b & (1 << i)) != 0 });
            // na Gamepad API o "para baixo" é positivo; no controle de Xbox, o "para cima"
            mEixo.Invoke(pad, new object[] { eixoLX, Eixo(lx) });
            mEixo.Invoke(pad, new object[] { eixoLY, Eixo(-ly) });
            mEixo.Invoke(pad, new object[] { eixoRX, Eixo(rx) });
            mEixo.Invoke(pad, new object[] { eixoRY, Eixo(-ry) });
            mGatilho.Invoke(pad, new object[] { gatilhoL, Gatilho(lt) });
            mGatilho.Invoke(pad, new object[] { gatilhoR, Gatilho(rt) });
            mEnviar.Invoke(pad, null);
            padNeutro = b == 0 && lx == 0 && ly == 0 && rx == 0 && ry == 0 && lt == 0 && rt == 0;
        }

        static void Pad(Dictionary<string, object> ev)
        {
            if (!AbrirPad()) return;
            int agora = Environment.TickCount;
            // controle voltando depois de um tempo parado: o chiaki-ng na frente (o controle virtual
            // vale para a janela em foco, como um de verdade)
            if (unchecked(agora - padUltimo) > 5000) Focar();
            padUltimo = agora;
            int b = (int)D(ev, "b");
            if (jogoTrava != null && !B(ev, "livre")) b &= ~(1 << 16); // o Guia (Game Bar, Steam) não sai do jogo
            AplicarPad(b,D(ev, "lx"), D(ev, "ly"), D(ev, "rx"), D(ev, "ry"), D(ev, "lt"), D(ev, "rt"));
        }

        // tudo solto e no centro (quem jogava saiu, a conexão caiu, Ctrl+Alt+End)
        static void PadNeutro()
        {
            if (pad == null || padNeutro) return;
            try { AplicarPad(0, 0, 0, 0, 0, 0, 0); } catch { }
            padNeutro = true;
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
