@echo off
REM Auto-commit and push script for PDA System
echo.
echo ===== PDA System Git Auto-Push =====
echo.

REM Navigate to project directory
cd /d "c:\Users\ioann\Desktop\pda system"

REM Check if there are changes
git status --porcelain > nul
if %errorlevel% neq 0 (
    echo ERROR: Git not working
    pause
    exit /b 1
)

REM Add all changes
git add .

REM Get current timestamp
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c-%%a-%%b)
for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a-%%b)
set timestamp=%mydate%_%mytime%

REM Commit with timestamp
git commit -m "Auto update - %timestamp%" 2>nul

REM Push to GitHub
git push origin main

echo.
echo ===== Push Complete =====
echo.
pause
