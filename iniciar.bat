@echo off
chcp 65001 > nul
title Loja Dois Irmãos - Casa e Obra
cd /d "%~dp0"

echo ==========================================
echo   Loja Dois Irmãos - Casa e Obra
echo ==========================================
echo.

where node > nul 2>&1
if errorlevel 1 goto sem_node

if exist node_modules goto configurar
echo Instalando as dependências, só na primeira vez...
call npm.cmd install
if errorlevel 1 goto erro

:configurar
node src\configurar.js
if errorlevel 1 goto erro

echo.
echo Preparando o banco de dados...
call npm.cmd run setup
if errorlevel 1 goto erro_banco

echo.
echo Abrindo o site no navegador. Para desligar, feche esta janela.
start "" cmd /c "timeout /t 3 > nul & start http://localhost:3000"
call npm.cmd start
goto fim

:sem_node
echo [ERRO] O Node.js não está instalado.
echo Instale a versão LTS em https://nodejs.org e depois abra este arquivo de novo.
goto fim

:erro_banco
echo.
echo [ERRO] Não foi possível conectar ao banco.
echo Confira o endereço do Neon. Para digitar outro, apague o arquivo .env desta pasta
echo e abra este arquivo de novo.
goto fim

:erro
echo.
echo [ERRO] Algo deu errado. Tire um print desta janela e mande para o Claude.

:fim
echo.
pause
