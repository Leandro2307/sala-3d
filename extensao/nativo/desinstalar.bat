@echo off
rem Tira o ajudante do Chrome e do Edge. A extensao continua controlando so abas.
reg delete "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.sala3d.controle" /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.sala3d.controle" /f >nul 2>&1
del "%LOCALAPPDATA%\Sala3d\com.sala3d.controle.json" >nul 2>&1
del "%LOCALAPPDATA%\Sala3d\ajudante-*.dll" >nul 2>&1
echo Ajudante removido.
pause
