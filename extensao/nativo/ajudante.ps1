# Abre o ajudante nativo. Quem chama é o Chrome (Native Messaging), pelo ajudante.bat.
# Compila o Ajudante.cs na hora com o compilador do próprio Windows (.NET Framework):
# não precisa instalar nada. Nada pode ser escrito na saída padrão além das mensagens.
$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'Ajudante.cs') -ReferencedAssemblies 'System.Web.Extensions' | Out-Null
[Sala3d.Ajudante]::Rodar()
