# Clica sozinho no seletor de compartilhamento do Chrome: escolhe a tela, liga o áudio do sistema
# e aperta "Compartilhar". Quem roda: o abrir-e-compartilhar.ps1 (depois de abrir a sala) e o
# ajudante nativo, quando alguém manda /tela para este PC na sala.
# (Antes era o --auto-select-desktop-capture-source, mas com ele o Chrome não carrega extensões
# sem compactação: a extensão da Sala 3D sumia.)
param(
  [string]$Tela = 'Tela 1',     # "Tela 1", "Tela 2"... (um monitor só: "Tela inteira")
  [int]$Espera = 90             # segundos esperando o seletor aparecer
)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
# com um monitor só não existe "Tela 1" no seletor
if ($Tela -like 'Tela [0-9]*' -and [System.Windows.Forms.Screen]::AllScreens.Count -lt 2) { $Tela = 'Tela inteira' }
$P  = [System.Windows.Automation.AutomationElement]::NameProperty
$CT = [System.Windows.Automation.AutomationElement]::ControlTypeProperty
$Botao = [System.Windows.Automation.ControlType]::Button
$Janela = [System.Windows.Automation.ControlType]::Window

function Achar($raiz, $nome, $tipo) {
  # o diálogo é pequeno: filtrar aqui evita as sobrecargas do PropertyCondition no PowerShell
  foreach ($e in $raiz.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
    if ($e.Current.Name -eq $nome -and $e.Current.ControlType -eq $tipo) { return $e }
  }
  return $null
}

function Apertar($el) {
  $p = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$p)) { $p.Invoke(); return $true }
  if ($el.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$p)) { $p.Select(); return $true }
  return $false
}

# o seletor: um diálogo "Escolha o que compartilhar com ..." dentro de uma janela do Chrome
# Antes dele, o botão "Compartilhar a tela inteira" da sala (?compartilhar=tela): o Chrome só abre o
# seletor depois de um clique na página, e o Invoke do UI Automation conta como clique. (A política
# ScreenCaptureWithoutGestureAllowedForOrigins dispensaria o clique, mas com qualquer política o
# Chrome passa a não carregar a extensão sem compactação.)
$fim = (Get-Date).AddSeconds($Espera)
$dialogo = $null
$apertouSala = $false
while (-not $dialogo -and (Get-Date) -lt $fim) {
  $pids = @((Get-Process chrome -ErrorAction SilentlyContinue).Id)
  foreach ($w in [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
    if ($pids -notcontains $w.Current.ProcessId) { continue }
    foreach ($d in $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
      if (-not $apertouSala -and $d.Current.Name -eq 'Compartilhar a tela inteira' -and $d.Current.ControlType -eq $Botao) {
        $apertouSala = Apertar $d
        continue
      }
      if ($d.Current.ControlType -ne $Janela) { continue }
      # os botões do seletor não ficam "dentro" deste elemento na árvore: procura na janela toda
      if ($d.Current.Name -like 'Escolha o que compartilhar*' -or $d.Current.Name -like 'Choose what to share*') { $dialogo = $w; break }
    }
    if ($dialogo) { break }
  }
  if (-not $dialogo) { Start-Sleep -Milliseconds 500 }
}
if (-not $dialogo) { Write-Host '  O seletor do Chrome nao apareceu.' -ForegroundColor Yellow; exit 1 }

# a aba "Tela inteira" (a sala já pede com displaySurface: 'monitor', mas por garantia)
$aba = Achar $dialogo 'Tela inteira' ([System.Windows.Automation.ControlType]::TabItem)
if ($aba) { Apertar $aba | Out-Null; Start-Sleep -Milliseconds 300 }

# a tela; um monitor só: o Chrome já deixa escolhida (e o nome pode ser outro)
$fonte = $null
for ($i = 0; $i -lt 20 -and -not $fonte; $i++) {
  $fonte = Achar $dialogo $Tela $Botao
  if (-not $fonte) { Start-Sleep -Milliseconds 250 }
}
# (o Chrome escolhe a tela quando ela recebe o foco; o Invoke dela não escolhe)
if ($fonte) {
  $fonte.SetFocus()
  Start-Sleep -Milliseconds 300
}

# áudio do sistema ligado
$audio = Achar $dialogo 'Compartilhar com áudio do sistema' $Botao
if ($audio) {
  $p = $null
  if ($audio.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$p)) {
    if ($p.Current.ToggleState -ne [System.Windows.Automation.ToggleState]::On) { $p.Toggle() }
  }
}

# Compartilhar (fica cinza até ter uma tela escolhida)
$ok = $false
for ($i = 0; $i -lt 20 -and -not $ok; $i++) {
  # o nome muda com o áudio: "Compartilhar" ou "Compartilhar com áudio"
  $b = $null
  foreach ($e in $dialogo.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
    if ($e.Current.ClassName -eq 'MdTextButton' -and ($e.Current.Name -like 'Compartilhar*' -or $e.Current.Name -like 'Share*')) { $b = $e; break }
  }
  if ($b -and $b.Current.IsEnabled) { $ok = Apertar $b }
  if (-not $ok) { Start-Sleep -Milliseconds 250 }
}
if ($ok) { Write-Host "  Compartilhando: $Tela" -ForegroundColor Green; exit 0 }
Write-Host '  Nao consegui apertar Compartilhar: escolha a tela no seletor.' -ForegroundColor Yellow
exit 1
