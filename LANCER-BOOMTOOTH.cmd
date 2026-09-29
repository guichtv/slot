@echo off
setlocal EnableExtensions
rem BOOMTOOTH (Crownforge) - lance la build de production figee sur http://127.0.0.1:5320/
rem Tout le reste est fait par tools\serve-stable.mjs :
rem  - un ancien serveur BOOMTOOTH encore ouvert est arrete (jamais un autre programme) ;
rem  - dependances installees (npm ci) si absentes ou si package-lock.json a change ;
rem  - build figee reconstruite quand le code a change (apres un git pull) ;
rem  - le navigateur s'ouvre sur le jeu.
title BOOMTOOTH
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [BOOMTOOTH] Node.js est introuvable. Installer Node.js 20 ou plus recent ^(https://nodejs.org^) puis relancer.
  goto :fail
)
for /f "delims=" %%v in ('node -v') do set "NODEV=%%v"
echo [BOOMTOOTH] Node %NODEV%

node tools\serve-stable.mjs --open %*
if errorlevel 1 goto :fail
exit /b 0

:fail
echo.
pause
exit /b 1
