@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo.
echo =====================================================
echo   Java Local Run Server
echo =====================================================
echo.
echo   Starting server...
echo   Open browser: http://localhost:5000
echo   Press Ctrl+C to stop
echo =====================================================
echo.
python server.py
pause
