# Registra o ajudante nativo no Chrome e no Edge (só para o seu usuário: não precisa de administrador).
# Para tirar: desinstalar.bat.
$ErrorActionPreference = 'Stop'
$nome = 'com.sala3d.controle'
# ID fixo da extensão (vem da "key" do manifest.json): só ela pode abrir o ajudante
$extensao = 'chrome-extension://jkhkodoicmmglgkjeafogflmpdcaphoo/'

Write-Host ''
Write-Host '  Sala 3D - ajudante para controlar janelas e telas' -ForegroundColor Cyan
Write-Host ''

$pasta = Join-Path $env:LOCALAPPDATA 'Sala3d'
New-Item -ItemType Directory -Force -Path $pasta | Out-Null

# Confere se compila antes de registrar, e já deixa o compilado guardado onde o ajudante.ps1
# procura (o mesmo nome, com a impressão digital do .cs): a primeira abertura pelo Chrome fica rápida.
$cs = Join-Path $PSScriptRoot 'Ajudante.cs'
try {
  $dll = Join-Path $pasta ('ajudante-' + (Get-FileHash -LiteralPath $cs -Algorithm SHA256).Hash.Substring(0, 16) + '.dll')
  if (-not (Test-Path -LiteralPath $dll)) {
    Add-Type -Path $cs -ReferencedAssemblies 'System.Web.Extensions' -OutputAssembly $dll -OutputType Library | Out-Null
  }
} catch {
  Write-Host "  Nao consegui compilar o ajudante: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# Controle virtual (PS5 pelo chiaki-ng, ver Ajudante.cs): a biblioteca que cria o controle de Xbox
# vem do NuGet (Nefarius.ViGEm.Client, a oficial do ViGEm). Opcional: sem ela o resto funciona igual.
$vigem = Join-Path $pasta 'Nefarius.ViGEm.Client.dll'
if (-not (Test-Path -LiteralPath $vigem)) {
  try {
    $zip = Join-Path $env:TEMP 'sala3d-vigem.zip'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -Uri 'https://www.nuget.org/api/v2/package/Nefarius.ViGEm.Client/1.21.256' -OutFile $zip
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $z = [IO.Compression.ZipFile]::OpenRead($zip)
    try {
      $item = $z.Entries | Where-Object { $_.FullName -eq 'lib/netstandard2.0/Nefarius.ViGEm.Client.dll' }
      [IO.Compression.ZipFileExtensions]::ExtractToFile($item, $vigem, $true)
    } finally { $z.Dispose(); Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue }
  } catch {
    Write-Host "  (controle virtual do PS5 ficou de fora: nao consegui baixar a biblioteca - $($_.Exception.Message))" -ForegroundColor DarkYellow
  }
}
$driver = Get-Service -Name 'ViGEmBus' -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath $vigem) {
  if ($driver) { Write-Host '  Controle virtual (PS5): pronto.' -ForegroundColor Green }
  else {
    Write-Host '  Controle virtual (PS5): falta o driver ViGEmBus. Para jogar no PS5 pela sala, instale:' -ForegroundColor Yellow
    Write-Host '     https://github.com/nefarius/ViGEmBus/releases  (ViGEmBus_..._x64_x86_arm64.exe)'
  }
}

$json = Join-Path $pasta "$nome.json"
$manifesto = [ordered]@{
  name = $nome
  description = 'Sala 3D - controle de janelas e telas compartilhadas'
  path = (Join-Path $PSScriptRoot 'ajudante.bat')
  type = 'stdio'
  allowed_origins = @($extensao)
}
# sem BOM: o Chrome não lê o manifesto se o arquivo começar com BOM
[IO.File]::WriteAllText($json, ($manifesto | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))

foreach ($chave in @(
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$nome",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$nome"
)) {
  New-Item -Path $chave -Force | Out-Null
  Set-ItemProperty -Path $chave -Name '(default)' -Value $json
}

Write-Host '  Pronto! Agora:' -ForegroundColor Green
Write-Host '   1. Em chrome://extensions, clique em "Recarregar" na extensao Sala 3D.'
Write-Host '   2. Compartilhe uma janela ou a tela e ligue "permitir controle" nela.'
Write-Host ''
Write-Host '  Atalho de emergencia: Ctrl+Alt+End corta o controle na hora.' -ForegroundColor Yellow
Write-Host '  Se mover esta pasta, rode o instalar.bat de novo.'
Write-Host ''
