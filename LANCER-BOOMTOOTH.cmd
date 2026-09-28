@echo off
setlocal EnableExtensions
rem BOOMTOOTH (Crownforge) - lance la build figee dist-stable sur http://127.0.0.1:5320/
rem Premier lancement : npm ci si node_modules manque, puis construction de dist-stable (production).
rem Pour reconstruire la build figee : supprimer le dossier dist-stable puis relancer ce fichier.
title BOOMTOOTH
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [BOOMTOOTH] Node.js est introuvable. Installer Node.js 20 ou plus recent ^(https://nodejs.org^) puis relancer.
  goto :fail
)
for /f "delims=" %%v in ('node -v') do set "NODEV=%%v"
echo [BOOMTOOTH] Node %NODEV%

if not exist "node_modules\" (
  echo [BOOMTOOTH] Installation des dependances ^(npm ci^)...
  call npm ci
  if errorlevel 1 goto :fail
)

set "VER="
for /f "usebackq delims=" %%v in (`node -p "require('./package.json').version"`) do set "VER=%%v"
if not defined VER set "VER=dev"

if not exist "dist-stable\index.html" (
  echo [BOOMTOOTH] Construction de la build figee dist-stable...
  call npx vite build --mode production --outDir dist-stable
  if errorlevel 1 goto :fail
)

set "URL=http://127.0.0.1:5320/?v=%VER%"
echo.
echo [BOOMTOOTH] v%VER% : %URL%
echo [BOOMTOOTH] Le navigateur s'ouvre des que le serveur est pret. Ctrl+C ou fermer la fenetre pour arreter.
echo.
call npx vite preview --outDir dist-stable --port 5320 --strictPort --host 127.0.0.1 --open "/?v=%VER%"
if errorlevel 1 (
  echo [BOOMTOOTH] Le serveur n'a pas demarre : le port 5320 est peut-etre deja utilise.
  echo [BOOMTOOTH] Si BOOMTOOTH tourne deja, ouvrir %URL%
  goto :fail
)
exit /b 0

:fail
echo.
pause
exit /b 1
