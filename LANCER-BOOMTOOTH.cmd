@echo off
setlocal EnableExtensions
rem BOOMTOOTH (Crownforge) - lance la build de production figee sur http://127.0.0.1:5320/
rem Tout le reste est fait par tools\serve-stable.mjs :
rem  - un ancien serveur BOOMTOOTH encore ouvert est arrete avec sa fenetre (jamais un autre programme) ;
rem  - dependances installees (npm ci) si absentes, incompletes ou si package-lock.json a change ;
rem  - build figee reconstruite quand le code a change (apres un git pull) ;
rem  - le navigateur s'ouvre sur le jeu.
rem La commande node et sa suite tiennent sur UNE ligne : cmd ne relit pas ce fichier apres coup
rem (un git pull peut le modifier pendant que le jeu tourne).
title BOOMTOOTH
cd /d "%~dp0"
where node >nul 2>nul || (echo [BOOMTOOTH] Node.js est introuvable. Installer Node.js 22 LTS ou plus recent ^(https://nodejs.org^) puis relancer. & echo. & pause & exit /b 1)
for /f "delims=" %%v in ('node -v') do echo [BOOMTOOTH] Node %%v
node tools\serve-stable.mjs --open %* && exit /b 0 || (echo. & pause & exit /b 1)
