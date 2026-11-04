@echo off
rem Abre a Sala 3D no app do Chrome e ja compartilha a tela inteira (so neste PC).
rem Para outra sala: troque "principal" abaixo pelo nome da sala.
set SALA=principal
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0abrir-e-compartilhar.ps1" -Sala "%SALA%"
if errorlevel 1 pause
