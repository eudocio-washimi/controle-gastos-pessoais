@echo off
chcp 65001 >nul
title Meus Gastos
cd /d "%~dp0"

rem Gera o app na primeira vez (ou se a pasta dist tiver sido apagada)
if not exist "dist\index.html" (
  echo Preparando o aplicativo pela primeira vez, aguarde...
  call npm run build
)

rem Abre o navegador alguns segundos depois que o servidor sobe
start "" /min cmd /c "timeout /t 5 >nul & start http://localhost:3001"

echo.
echo  Meus Gastos esta rodando em http://localhost:3001
echo  Feche esta janela para parar o aplicativo.
echo.
call npm start
