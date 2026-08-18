@echo off
title ClearCall Server
color 07

echo ================================================
echo.
echo    CLEARCALL — LOCAL SERVER
echo.
echo    Starting backend and frontend...
echo.
echo    DO NOT CLOSE THIS WINDOW
echo.
echo ================================================
echo.

start "ClearCall Backend" cmd /k "cd /d %~dp0backend && node src\server.js"
timeout /t 2 /nobreak >nul

start "ClearCall Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 4 /nobreak >nul

echo ClearCall is ready — opening Chrome
start chrome "http://localhost:5173"

echo.
echo Servers are running. Keep this window open.
echo.
pause >nul
