# Abre a Sala 3D no app (PWA) do Chrome, entra na sala e já compartilha a tela inteira.
# Só para este PC. Quem chama é o abrir-e-compartilhar.bat (dois cliques nele).
param(
  [string]$Sala = 'principal'
)
$ErrorActionPreference = 'Stop'

# ------------------------------------------------------------------ ajustes
$Site      = 'https://sala-3d.onrender.com'
$AppId     = 'jlpfflhghmbbgdhgfibeljnhndgmffhe'   # o app "Sala 3D" instalado no Chrome
$Perfil    = 'Default'
$Extensao  = 'jkhkodoicmmglgkjeafogflmpdcaphoo'   # a "key" do extensao\manifest.json
# Nome da tela no seletor do Chrome (em português). Um monitor: "Tela inteira"; mais de um: "Tela 1", "Tela 2"...
Add-Type -AssemblyName System.Windows.Forms
$Fonte = if ([System.Windows.Forms.Screen]::AllScreens.Count -gt 1) { 'Tela 1' } else { 'Tela inteira' }

$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
            "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
            "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { Write-Host '  Nao achei o Chrome.' -ForegroundColor Red; exit 1 }
$dados = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'
$pastaPerfil = Join-Path $dados $Perfil

Write-Host ''
Write-Host '  Sala 3D - abrir e compartilhar a tela inteira' -ForegroundColor Cyan
Write-Host ''

function Fechar-Chrome {
  $p = Get-Process chrome -ErrorAction SilentlyContinue
  if (-not $p) { return }
  Write-Host '  Fechando o Chrome...'
  & taskkill.exe /im chrome.exe 2>$null | Out-Null   # pede para fechar (como clicar no X)
  for ($i = 0; $i -lt 16 -and (Get-Process chrome -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 500 }
  if (Get-Process chrome -ErrorAction SilentlyContinue) {
    & taskkill.exe /f /im chrome.exe 2>$null | Out-Null   # o que ficou rodando em segundo plano
    Start-Sleep -Seconds 1
  }
}

function Extensao-Instalada {
  foreach ($arq in 'Secure Preferences', 'Preferences') {
    $f = Join-Path $pastaPerfil $arq
    if (-not (Test-Path -LiteralPath $f)) { continue }
    try {
      $j = Get-Content -LiteralPath $f -Raw -Encoding UTF8 | ConvertFrom-Json
      $e = $j.extensions.settings.$Extensao
      if ($e -and $e.path) { return $true }
    } catch { }
  }
  return $false
}

# ------------------------------------------------------------------ 1. extensão
if (Extensao-Instalada) {
  Write-Host '  Extensao: instalada.' -ForegroundColor Green
} else {
  # O Chrome nao deixa instalar extensao "sem compactacao" sozinho (o --load-extension nao vale
  # mais no Chrome oficial): abre a pagina e a pasta, e espera os tres cliques.
  $pasta = Join-Path $PSScriptRoot 'extensao'
  Write-Host '  A extensao nao esta instalada. Vou abrir as extensoes do Chrome e a pasta dela:' -ForegroundColor Yellow
  Write-Host '    1. Ligue o "Modo do desenvolvedor" (canto de cima, a direita).'
  Write-Host '    2. Clique em "Carregar sem compactacao" e escolha a pasta:'
  Write-Host "       $pasta"
  Set-Clipboard -Value $pasta
  Write-Host '       (o caminho ja esta copiado: e so colar na barra de endereco da janela)' -ForegroundColor DarkGray
  Start-Process $chrome -ArgumentList "--profile-directory=$Perfil", 'chrome://extensions'
  Start-Process explorer.exe -ArgumentList "`"$pasta`""
  while (-not (Extensao-Instalada)) {
    Write-Host ''
    Read-Host '  Depois de carregar, aperte Enter'
    Start-Sleep -Seconds 1
    if (-not (Extensao-Instalada)) { Write-Host '  Ainda nao achei a extensao no Chrome. Confira e aperte Enter de novo.' -ForegroundColor Yellow }
  }
  Write-Host '  Extensao: instalada.' -ForegroundColor Green
  Write-Host '  (na sala, clique no icone da extensao e em "Liberar este site" uma vez)' -ForegroundColor DarkGray
}

# ------------------------------------------------------------------ 2. ajudante do Windows
# deixa os amigos mexerem na tela inteira (mouse e teclado de verdade); ver extensao\LEIA-ME.md
$chave = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.sala3d.controle'
if (Test-Path $chave) {
  Write-Host '  Ajudante do Windows: instalado.' -ForegroundColor Green
} else {
  Write-Host '  Instalando o ajudante do Windows (para o controle da tela inteira)...'
  & powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'extensao\nativo\instalar.ps1')
}

# ------------------------------------------------------------------ 3. compartilhar sem clique
# Sem um clique na pagina o Chrome recusa o getDisplayMedia; esta politica libera so o site da sala.
# (Com ela o Chrome mostra "gerenciado pela organizacao" nas configuracoes: e so isso.)
$pol = 'HKCU:\Software\Policies\Google\Chrome\ScreenCaptureWithoutGestureAllowedForOrigins'
$jaTem = (Test-Path $pol) -and ((Get-ItemProperty $pol).PSObject.Properties | Where-Object { $_.Value -eq $Site })
if (-not $jaTem) {
  New-Item -Path $pol -Force | Out-Null
  $n = 1; while ((Get-ItemProperty $pol -ErrorAction SilentlyContinue).PSObject.Properties.Name -contains "$n") { $n++ }
  New-ItemProperty -Path $pol -Name "$n" -Value $Site -PropertyType String -Force | Out-Null
  Write-Host '  Politica do Chrome: liberado compartilhar sem clique no site da sala.' -ForegroundColor Green
}

# ------------------------------------------------------------------ 4. abrir o app
# O --auto-select-desktop-capture-source escolhe a tela sem o seletor, mas o Chrome so le essa opcao
# quando abre do zero: com ele aberto, ela seria ignorada.
$automatico = $true
if (Get-Process chrome -ErrorAction SilentlyContinue) {
  Write-Host ''
  Write-Host '  O Chrome esta aberto. Para compartilhar sem o seletor ele precisa abrir do zero.' -ForegroundColor Yellow
  $r = Read-Host '  Fechar o Chrome agora? (S = fecha / N = deixa aberto e mostra o seletor) [S]'
  if ($r -match '^[nN]') { $automatico = $false } else { Fechar-Chrome }
}

$url = "$Site/?sala=$([uri]::EscapeDataString($Sala))&entrar=1&compartilhar=tela"
$argumentos = @("--profile-directory=$Perfil", "--app-id=$AppId", "--app-launch-url-for-shortcuts-menu-item=$url")
if ($automatico) { $argumentos += "--auto-select-desktop-capture-source=`"$Fonte`"" }
Start-Process $chrome -ArgumentList $argumentos

Write-Host ''
if ($automatico) {
  Write-Host "  Abrindo a sala '$Sala' e compartilhando: $Fonte" -ForegroundColor Green
} else {
  Write-Host "  Abrindo a sala '$Sala'. No seletor, a 'Tela inteira' ja vem escolhida: clique em Compartilhar." -ForegroundColor Green
}
Start-Sleep -Seconds 3
