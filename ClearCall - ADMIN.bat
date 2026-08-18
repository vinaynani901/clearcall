@echo off
title ClearCall - Admin
color 04

echo ================================================
echo.
echo    CLEARCALL — ADMIN PANEL
echo.
echo    Opening admin panel...
echo.
echo ================================================
echo.

timeout /t 1 /nobreak >nul
start chrome "http://localhost:5173/quick-login/admin"
exit
