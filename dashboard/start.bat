@echo off
echo ====================================
echo   EduDashboard - Starting App
echo ====================================

:: Kill anything on port 5000 and 5173
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do taskkill /PID %%a /F >nul 2>&1

echo [1/2] Starting Backend on port 5000...
start "Backend" cmd /k "cd /d %~dp0backend && npm run dev"

timeout /t 3 /nobreak >nul

echo [2/2] Starting Frontend on port 5173...
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ====================================
echo  Backend  →  http://localhost:5000
echo  Frontend →  http://localhost:5173
echo ====================================
echo Both servers started in new windows.
pause
