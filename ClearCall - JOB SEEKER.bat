@echo off
title ClearCall - Job Seeker
color 2F

echo ================================================
echo.
echo    CLEARCALL — JOB SEEKER DASHBOARD
echo.
echo    Opening job seeker login...
echo.
echo ================================================
echo.

timeout /t 1 /nobreak >nul
start chrome "http://localhost:5173/quick-login/jobseeker"
exit
