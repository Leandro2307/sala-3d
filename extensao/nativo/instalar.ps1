# Registra o ajudante nativo no Chrome e no Edge (só para o seu usuário: não precisa de administrador).
# Para tirar: desinstalar.bat.
$ErrorActionPreference = 'Stop'
$nome = 'com.sala3d.controle'
# ID fixo da extensão (vem da "key" do manifest.json): só ela pode abrir o ajudante
$extensao = 'chrome-extension://jkhkodoicmmglgkjeafogflmpdcaphoo/'

Write-Host ''
Write-Host '  Sala 3D - ajudante para controlar janelas e telas' -ForegroundColor Cyan
Write-Host ''

# confere se compila antes de registrar
try {
  Add-Type -Path (Join-Path $PSScriptRoot 'Ajudante.cs') -ReferencedAssemblies 'System.Web.Extensions' | Out-Null
} catch {
  Write-Host "  Nao consegui compilar o ajudante: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

$pasta = Join-Path $env:LOCALAPPDATA 'Sala3d'
New-Item -ItemType Directory -Force -Path $pasta | Out-Null
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
Write-Host '   2. Recarregue a pagina da sala.'
Write-Host '   3. Compartilhe uma janela ou a tela e ligue "permitir controle" nela.'
Write-Host ''
Write-Host '  Atalho de emergencia: Ctrl+Alt+End corta o controle na hora.' -ForegroundColor Yellow
Write-Host '  Se mover esta pasta, rode o instalar.bat de novo.'
Write-Host ''
