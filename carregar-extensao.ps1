# Carrega a extensão da Sala 3D pelo "Carregar sem compactação" do Chrome, sozinho (UI Automation).
# Desde o Chrome 157 ele descarta a extensão sem compactação toda vez que abre (o log diz só
# "Falha ao carregar a extensão a partir de: ...", sem motivo), mesmo com o modo do desenvolvedor
# ligado. Carregar de novo pela página de extensões funciona até o Chrome fechar: este script faz
# isso. Sai 0 se a extensão já estava ou foi carregada; 1 se não deu (aí carregue à mão).
param(
  [string]$Pasta = (Join-Path $PSScriptRoot 'extensao'),
  [string]$Perfil = 'Default'
)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$Escopo = [System.Windows.Automation.TreeScope]
$Tudo = [System.Windows.Automation.Condition]::TrueCondition
$NomeExt = 'Sala 3D — controle das abas'

function Janelas-Chrome {
  $pids = @((Get-Process chrome -ErrorAction SilentlyContinue).Id)
  [System.Windows.Automation.AutomationElement]::RootElement.FindAll($Escopo::Children, $Tudo) |
    Where-Object { $pids -contains $_.Current.ProcessId }
}
function Achar($raiz, [scriptblock]$teste) {
  foreach ($e in $raiz.FindAll($Escopo::Descendants, $Tudo)) { if (& $teste $e.Current) { return $e } }
  return $null
}
function Apertar($el) {
  $p = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$p)) { $p.Invoke(); return $true }
  return $false
}

$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
            "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
Start-Process $chrome -ArgumentList "--profile-directory=$Perfil", 'chrome://extensions'

# a janela da página de extensões (o título é "Extensões - Google Chrome")
$janela = $null; $botao = $null
$fim = (Get-Date).AddSeconds(30)
while (-not $botao -and (Get-Date) -lt $fim) {
  foreach ($w in Janelas-Chrome) {
    if ($w.Current.Name -notlike 'Extens*') { continue }
    # a primeira leitura liga a acessibilidade da página: as seguintes já veem os botões
    $ext = Achar $w { param($c) $c.Name -eq $NomeExt }
    if ($ext) { Write-Host '  Extensao: carregada.' -ForegroundColor Green; $janela = $w; break }
    $botao = Achar $w { param($c) $c.Name -eq 'Carregar sem compactação' -and $c.ControlType.ProgrammaticName -eq 'ControlType.Button' }
    if ($botao) { $janela = $w; break }
  }
  if ($janela -and -not $botao) { break }   # já estava carregada
  if (-not $botao) { Start-Sleep -Milliseconds 700 }
}
if ($janela -and -not $botao) { exit 0 }
if (-not $botao) { Write-Host '  Nao achei o botao "Carregar sem compactacao" (o modo do desenvolvedor esta ligado?).' -ForegroundColor Yellow; exit 1 }

Write-Host '  Carregando a extensao...'
[void](Apertar $botao)

# a janela de escolher pasta do Windows: escreve o caminho no campo "Pasta:" e aperta "Selecionar pasta"
$dlg = $null
$fim = (Get-Date).AddSeconds(15)
while (-not $dlg -and (Get-Date) -lt $fim) {
  foreach ($w in Janelas-Chrome) {
    $d = Achar $w { param($c) $c.ClassName -eq '#32770' }
    if ($d) { $dlg = $d; break }
    if ($w.Current.ClassName -eq '#32770') { $dlg = $w; break }
  }
  if (-not $dlg) { Start-Sleep -Milliseconds 300 }
}
if (-not $dlg) { Write-Host '  A janela de escolher pasta nao abriu.' -ForegroundColor Yellow; exit 1 }

$campo = Achar $dlg { param($c) $c.ControlType.ProgrammaticName -eq 'ControlType.Edit' -and $c.Name -like 'Pasta*' }
if (-not $campo) { $campo = Achar $dlg { param($c) $c.ControlType.ProgrammaticName -eq 'ControlType.Edit' } }
$p = $null
if ($campo -and $campo.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p)) { $p.SetValue($Pasta) }
else { Write-Host '  Nao achei o campo da pasta.' -ForegroundColor Yellow; exit 1 }
Start-Sleep -Milliseconds 300
$ok = Achar $dlg { param($c) $c.ControlType.ProgrammaticName -eq 'ControlType.Button' -and ($c.Name -eq 'Selecionar pasta' -or $c.Name -eq 'Select Folder') }
if (-not $ok -or -not (Apertar $ok)) { Write-Host '  Nao achei o botao "Selecionar pasta".' -ForegroundColor Yellow; exit 1 }

# confere se apareceu na lista
$fim = (Get-Date).AddSeconds(10)
while ((Get-Date) -lt $fim) {
  Start-Sleep -Milliseconds 500
  if (Achar $janela { param($c) $c.Name -eq $NomeExt }) {
    Write-Host '  Extensao: carregada.' -ForegroundColor Green
    exit 0
  }
}
Write-Host '  A extensao nao apareceu na lista: confira em chrome://extensions.' -ForegroundColor Yellow
exit 1
