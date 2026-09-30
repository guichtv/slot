@echo off
rem CYBER CAT - lance la build figee (port 5344) et ouvre le navigateur
cd /d "%~dp0"
where node >/dev/null 2>/dev/null || (echo Node.js introuvable : installe Node 20.19+ ou 22.12+ & pause & exit /b 1)
if not exist node_modules\ (
  echo Installation des dependances...
  call npm ci || (pause & exit /b 1)
)
node tools\serve-stable.mjs --open %*
pause
