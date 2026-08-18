@echo off
title ClearCall - Employer
color 19

echo ================================================
echo.
echo    CLEARCALL — EMPLOYER DASHBOARD
echo.
echo    Opening employer login...
echo.
echo ================================================
echo.

timeout /t 1 /nobreak >nul
start chrome "http://localhost:5173/quick-login/employer"
exit
