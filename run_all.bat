@echo off
title Esamyak Security System Starter
echo ===================================================
echo   Starting Esamyak Jewelry Store Security System
echo ===================================================

:: Start Backend in a new window
echo [1/2] Launching Backend Server on http://localhost:8000...
start "Esamyak Backend" cmd /k "cd backend && venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"

:: Start Frontend in a new window
echo [2/2] Launching Frontend Server on http://localhost:3000...
start "Esamyak Frontend" cmd /k "cd frontend && npm run dev"

echo ===================================================
echo   Both services are starting up!
echo   - Backend Docs: http://localhost:8000/docs
echo   - Frontend Panel: http://localhost:3000
echo ===================================================
pause
