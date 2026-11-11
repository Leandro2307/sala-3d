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
# Jogo em tela cheia (F11) na frente: a janela da sala fica atrás dele, e janela do Chrome coberta não
# mostra a página ao UI Automation (o botão da sala "some") nem deixa escolher a tela no seletor (o
# Compartilhar fica cinza). Traz a janela para a frente (o Alt solto destrava o SetForegroundWindow).
Add-Type -Namespace Sala3d -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte sc, uint f, UIntPtr x);
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
'@
function Frente($w) {
  $h = [IntPtr]$w.Current.NativeWindowHandle
  if ($h -eq [IntPtr]::Zero) { return }
  if ([Sala3d.Win]::IsIconic($h)) { [Sala3d.Win]::ShowWindow($h, 9) | Out-Null } # SW_RESTORE
  [Sala3d.Win]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero) # Alt
  [Sala3d.Win]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
  [Sala3d.Win]::SetForegroundWindow($h) | Out-Null
  Start-Sleep -Milliseconds 400
}

$fim = (Get-Date).AddSeconds($Espera)
$dialogo = $null
$apertouSala = $false
$volta = 0
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
  if (-not $dialogo) {
    # o botão da sala não apareceu: a janela dela está coberta (jogo em tela cheia). Traz para a frente.
    $volta++
    if (-not $apertouSala -and ($volta % 4) -eq 2) {
      foreach ($w in [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
        if ($pids -contains $w.Current.ProcessId -and $w.Current.Name -like '*Sala 3D*') { Frente $w; break }
      }
    }
    Start-Sleep -Milliseconds 500
  }
}
if (-not $dialogo) { Write-Host '  O seletor do Chrome nao apareceu.' -ForegroundColor Yellow; exit 1 }

Frente $dialogo

# a aba "Tela inteira" (a sala já pede com displaySurface: 'monitor', mas por garantia)
$aba = Achar $dialogo 'Tela inteira' ([System.Windows.Automation.ControlType]::TabItem)
if (-not $aba) { $aba = Achar $dialogo 'Entire screen' ([System.Windows.Automation.ControlType]::TabItem) }
if ($aba) { Apertar $aba | Out-Null; Start-Sleep -Milliseconds 300 }

# A tela. O nome muda com o Chrome e o número de monitores: "Tela 1", "Tela 2"... com dois ou mais;
# "Tela inteira" ou "Tela cheia" com um só (em inglês "Screen 1", "Entire screen"). Procura a pedida,
# depois os nomes de monitor único e, por fim, qualquer botão com cara de tela.
$nomes = @($Tela, 'Tela 1', 'Tela inteira', 'Tela cheia', 'Screen 1', 'Entire screen', 'Full screen') | Select-Object -Unique
function AcharFonte {
  $todos = @($dialogo.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition))
  foreach ($n in $nomes) {
    foreach ($e in $todos) { if ($e.Current.Name -eq $n -and $e.Current.ControlType -eq $Botao) { return $e } }
  }
  foreach ($e in $todos) {
    if ($e.Current.ControlType -eq $Botao -and $e.Current.Name -match '^(Tela|Screen|Monitor)\s*\d*$|^Tela (inteira|cheia)$|^(Entire|Full) screen$') { return $e }
  }
  return $null
}
$fonte = $null
for ($i = 0; $i -lt 20 -and -not $fonte; $i++) {
  $fonte = AcharFonte
  if (-not $fonte) { Start-Sleep -Milliseconds 250 }
}
if ($fonte) { $Tela = $fonte.Current.Name }

# Escolhe a tela. O Chrome escolhe quando ela recebe o foco (o Invoke dela não escolhe); não deu,
# traz a janela para a frente de novo e clica com o mouse no meio dela.
function Escolher($vez) {
  if (-not $fonte) { return }
  if ($vez -ge 2) { Frente $dialogo }
  try { $fonte.SetFocus() } catch { }
  if ($vez -ge 3) {
    try {
      $r = $fonte.Current.BoundingRectangle
      [Sala3d.Win]::SetCursorPos([int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2)) | Out-Null
      [Sala3d.Win]::mouse_event(0x2, 0, 0, 0, [UIntPtr]::Zero) # botão esquerdo
      [Sala3d.Win]::mouse_event(0x4, 0, 0, 0, [UIntPtr]::Zero)
    } catch { }
  }
  Start-Sleep -Milliseconds 300
}
Escolher 1

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
  if (-not $ok) {
    # cinza: a tela não ficou escolhida (jogo na frente, nome novo): tenta de novo, mais forte
    if ($i -eq 3 -or $i -eq 7 -or $i -eq 11) {
      if (-not $fonte) { $fonte = AcharFonte }
      Escolher ([Math]::Min(3, [int](($i + 1) / 4) + 1))
    }
    Start-Sleep -Milliseconds 250
  }
}
if ($ok) { Write-Host "  Compartilhando: $Tela" -ForegroundColor Green; exit 0 }
Write-Host '  Nao consegui apertar Compartilhar: escolha a tela no seletor.' -ForegroundColor Yellow
exit 1
