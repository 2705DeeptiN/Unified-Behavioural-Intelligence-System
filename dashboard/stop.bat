@echo off
echo ====================================
echo   EduDashboard - Stopping App
echo ====================================

:: Kill port 5000 (backend)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do (
    taskkill /PID %%a /F >nul 2>&1
    echo [STOPPED] Backend (port 5000)
)

:: Kill port 5173 (frontend)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do (
    taskkill /PID %%a /F >nul 2>&1
    echo [STOPPED] Frontend (port 5173)
)

echo.
echo All servers stopped.
pause
