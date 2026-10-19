# Abre o ajudante nativo. Quem chama é o Chrome (Native Messaging), pelo ajudante.bat.
# O Ajudante.cs é compilado com o compilador do próprio Windows (.NET Framework): não precisa
# instalar nada. O compilado fica guardado em %LOCALAPPDATA%\Sala3d, com a impressão digital do .cs
# no nome: só a primeira abertura depois de o .cs mudar compila de novo (1-3 s); as outras pulam essa
# parte. Nada pode ser escrito na saída padrão além das mensagens.
$ErrorActionPreference = 'Stop'
$cs = Join-Path $PSScriptRoot 'Ajudante.cs'
$pasta = Join-Path $env:LOCALAPPDATA 'Sala3d'
try {
  $dll = Join-Path $pasta ('ajudante-' + (Get-FileHash -LiteralPath $cs -Algorithm SHA256).Hash.Substring(0, 16) + '.dll')
  if (-not (Test-Path -LiteralPath $dll)) {
    New-Item -ItemType Directory -Force -Path $pasta | Out-Null
    Add-Type -Path $cs -ReferencedAssemblies 'System.Web.Extensions' -OutputAssembly $dll -OutputType Library | Out-Null
    # as versões de antes não servem mais (a que estiver aberta noutro Chrome fica para a próxima)
    Get-ChildItem -LiteralPath $pasta -Filter 'ajudante-*.dll' | Where-Object { $_.FullName -ne $dll } | Remove-Item -Force -ErrorAction SilentlyContinue
  }
  if (-not ('Sala3d.Ajudante' -as [type])) { Add-Type -Path $dll }
} catch {
  # compilado estragado (ou pasta sem permissão): apaga e compila na memória, como antes
  if ($dll) { Remove-Item -LiteralPath $dll -Force -ErrorAction SilentlyContinue }
  if (-not ('Sala3d.Ajudante' -as [type])) { Add-Type -Path $cs -ReferencedAssemblies 'System.Web.Extensions' | Out-Null }
}
[Sala3d.Ajudante]::Rodar()
