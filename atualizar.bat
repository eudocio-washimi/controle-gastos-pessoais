@echo off
chcp 65001 >nul
title Atualizar Meus Gastos
cd /d "%~dp0"

echo ==== Baixando a versao mais nova ====
call git pull
echo.
echo ==== Atualizando dependencias ====
call npm install
echo.
echo ==== Gerando o aplicativo ====
call npm run build
echo.
echo ==== Pronto! Ja pode abrir o Meus Gastos. ====
pause
