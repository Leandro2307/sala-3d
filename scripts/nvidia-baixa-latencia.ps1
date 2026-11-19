# "Modo de baixa latência" da NVIDIA (o do Painel de Controle → Gerenciar configurações 3D → Configurações
# globais), pelo próprio driver (NVAPI, as configurações de perfil — DRS): o mesmo que o painel grava.
#
#   powershell -ExecutionPolicy Bypass -File scripts\nvidia-baixa-latencia.ps1 ler
#   powershell -ExecutionPolicy Bypass -File scripts\nvidia-baixa-latencia.ps1 ligar      (guarda o de antes)
#   powershell -ExecutionPolicy Bypass -File scripts\nvidia-baixa-latencia.ps1 desfazer   (volta o de antes)
#
# Por quê (2026-11-18): com o jogo na placa a 90%+ (RTX 3060 Ti no limite de energia), o driver deixa
# quadros na fila antes de desenhar — cada um é um quadro de atraso a mais para quem joga de longe. Com a
# baixa latência a fila fica em 1 quadro. Vale para jogos DirectX 9/11 (nos de DirectX 12 e Vulkan quem
# manda é o jogo: lá, ligue o NVIDIA Reflex nas opções do jogo).
#
# O que ele grava:
#   0x007BA09E Maximum pre-rendered frames = 1 — o "Ligado" do painel (0 = o jogo decide)
#   0x0005F543 / 0x10835000 (Ultra Low Latency - CPL State = 2 / Enabled = 1) — o "Ultra", só se o driver
#     conhecer: o 610.88 deste PC não conhece mais esses dois (responde -160 ao gravar); aí fica no "Ligado".
param([ValidateSet('ler', 'ligar', 'ultra', 'desfazer')][string]$acao = 'ler')
if ($acao -eq 'ultra') { $acao = 'ligar' }
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NvDrs
{
    [DllImport("nvapi64.dll", EntryPoint = "nvapi_QueryInterface", CallingConvention = CallingConvention.Cdecl)]
    static extern IntPtr QueryInterface(uint id);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FInit();
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FSessao(out IntPtr h);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FComSessao(IntPtr h);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FPerfil(IntPtr h, out IntPtr p);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FLer(IntPtr h, IntPtr p, uint id, IntPtr s);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FGravar(IntPtr h, IntPtr p, IntPtr s);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FApagar(IntPtr h, IntPtr p, uint id);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FNome(uint id, IntPtr nome);

    static T F<T>(uint id) where T : class
    {
        IntPtr p = QueryInterface(id);
        if (p == IntPtr.Zero) throw new Exception("NVAPI sem a função 0x" + id.ToString("X8"));
        return Marshal.GetDelegateForFunctionPointer(p, typeof(T)) as T;
    }

    // NVDRS_SETTING_V1: 12320 bytes (4 + nome 4096 + 5 campos de 4 + dois valores de 4100); versão =
    // tamanho | (1 << 16). Tamanho errado: o driver responde -9 (versão de estrutura incompatível).
    const int TAM = 12320;
    const int ID = 4100, TIPO = 4104, ONDE = 4108, ATUAL_PRE = 4112, PRE_VALIDO = 4116, PRE = 4120, VALOR = 8220;

    static IntPtr sessao, perfil;

    public static void Abrir()
    {
        int r = F<FInit>(0x0150E828)();
        if (r != 0) throw new Exception("NvAPI_Initialize: " + r);
        r = F<FSessao>(0x0694D52E)(out sessao);
        if (r != 0) throw new Exception("NvAPI_DRS_CreateSession: " + r);
        r = F<FComSessao>(0x375DBD6B)(sessao);
        if (r != 0) throw new Exception("NvAPI_DRS_LoadSettings: " + r);
        r = F<FPerfil>(0x617BFF9F)(sessao, out perfil);
        if (r != 0) throw new Exception("NvAPI_DRS_GetCurrentGlobalProfile: " + r);
    }

    public static void Fechar()
    {
        if (sessao != IntPtr.Zero) F<FComSessao>(0xDAD9CFF8)(sessao);
        sessao = IntPtr.Zero;
    }

    public static string Nome(uint id)
    {
        IntPtr b = Marshal.AllocHGlobal(4096);
        try
        {
            for (int i = 0; i < 4096; i++) Marshal.WriteByte(b, i, 0);
            int r = F<FNome>(0xD61CBE6E)(id, b);
            return r == 0 ? Marshal.PtrToStringUni(b) : "(sem nome: " + r + ")";
        }
        finally { Marshal.FreeHGlobal(b); }
    }

    // devolve [status, valor atual, local, é o padrão] (status -160: não está gravado = o padrão do driver)
    public static long[] Ler(uint id)
    {
        IntPtr s = Marshal.AllocHGlobal(TAM);
        try
        {
            for (int i = 0; i < TAM; i++) Marshal.WriteByte(s, i, 0);
            Marshal.WriteInt32(s, 0, TAM | (1 << 16));
            int r = F<FLer>(0x73BF8338)(sessao, perfil, id, s);
            if (r != 0) return new long[] { r, -1, -1, -1 };
            return new long[] { 0, (uint)Marshal.ReadInt32(s, VALOR), Marshal.ReadInt32(s, ONDE), Marshal.ReadInt32(s, ATUAL_PRE) };
        }
        finally { Marshal.FreeHGlobal(s); }
    }

    public static int Gravar(uint id, uint valor)
    {
        IntPtr s = Marshal.AllocHGlobal(TAM);
        try
        {
            for (int i = 0; i < TAM; i++) Marshal.WriteByte(s, i, 0);
            Marshal.WriteInt32(s, 0, TAM | (1 << 16));
            Marshal.WriteInt32(s, ID, (int)id);
            Marshal.WriteInt32(s, TIPO, 0); // NVDRS_DWORD_TYPE
            Marshal.WriteInt32(s, VALOR, (int)valor);
            return F<FGravar>(0x577DD202)(sessao, perfil, s);
        }
        finally { Marshal.FreeHGlobal(s); }
    }

    public static int Apagar(uint id) { return F<FApagar>(0xE4A26362)(sessao, perfil, id); }
    public static int Salvar() { return F<FComSessao>(0xFCBC7E14)(sessao); }
}
'@

$ids = [ordered]@{ 'Pre-rendered' = [uint32]0x007BA09E; 'CPL State' = [uint32]0x0005F543; 'Enabled' = [uint32]0x10835000 }
$ligado = @{ 'CPL State' = 2; 'Enabled' = 1; 'Pre-rendered' = 1 }
$opcionais = @('CPL State', 'Enabled') # o Ultra: só nos drivers que ainda conhecem
$pasta = Join-Path $env:LOCALAPPDATA 'Sala3d'
$backup = Join-Path $pasta 'nvidia-baixa-latencia-antes.json'

function Mostrar {
  foreach ($k in $ids.Keys) {
    $r = [NvDrs]::Ler($ids[$k])
    $valor = if ($r[0] -eq 0) { $r[1] } elseif ($r[0] -eq -160) { 'padrão do driver' } else { "erro $($r[0])" }
    '{0,-13} 0x{1:X8} = {2,-17} {3}' -f $k, $ids[$k], $valor, [NvDrs]::Nome($ids[$k])
  }
}

[NvDrs]::Abrir()
try {
  if ($acao -eq 'ler') { Mostrar; return }
  if ($acao -eq 'ligar') {
    # o de antes fica guardado (uma vez: rodar de novo não apaga o original)
    if (-not (Test-Path $backup)) {
      $antes = [ordered]@{}
      foreach ($k in $ids.Keys) { $r = [NvDrs]::Ler($ids[$k]); $antes[$k] = if ($r[0] -eq 0) { $r[1] } else { $null } }
      New-Item -ItemType Directory -Force -Path $pasta | Out-Null
      $antes | ConvertTo-Json | Out-File -Encoding utf8 $backup
      "o de antes ficou em $backup"
    }
    $ultra = $true
    foreach ($k in $ids.Keys) {
      $r = [NvDrs]::Gravar($ids[$k], [uint32]$ligado[$k])
      if ($r -eq -160 -and $opcionais -contains $k) { $ultra = $false; continue } # este driver não tem
      if ($r -ne 0) { throw "gravar $k deu $r" }
    }
    if ($ultra) { 'baixa latência: Ultra' } else { 'baixa latência: Ligado (fila de 1 quadro) — este driver não aceita o Ultra pela interface' }
  } else {
    if (-not (Test-Path $backup)) { throw "não achei $backup (nada para desfazer)" }
    $antes = Get-Content $backup -Raw | ConvertFrom-Json
    foreach ($k in $ids.Keys) {
      $v = $antes.$k
      $r = if ($null -eq $v) { [NvDrs]::Apagar($ids[$k]) } else { [NvDrs]::Gravar($ids[$k], [uint32]$v) }
      if ($r -ne 0 -and $r -ne -160) { throw "desfazer $k deu $r" }
    }
  }
  $r = [NvDrs]::Salvar()
  if ($r -eq -137) { throw 'o driver pediu administrador para gravar: rode o PowerShell como administrador' }
  if ($r -ne 0) { throw "NvAPI_DRS_SaveSettings: $r" }
  if ($acao -eq 'desfazer') { Remove-Item $backup -Force }
  "gravado ($acao). Agora:"
  Mostrar
} finally {
  [NvDrs]::Fechar()
}
