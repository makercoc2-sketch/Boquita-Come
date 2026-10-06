@echo off
title Boquita Come POS - Servidor
chcp 65001 > nul

cd /d "%~dp0"
cd /d "%~dp0backend"

:: Liberar puerto 8000 si ya estuviera ocupado por un proceso previo
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do taskkill /PID %%a /F > nul 2>&1

:: Determinar ejecutable de Python
if exist ".venv\Scripts\python.exe" (
    set "PYTHON_EXE=.venv\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

:: Iniciar servidor FastAPI/Uvicorn en puerto 8000
"%PYTHON_EXE%" -m uvicorn main:app --host 0.0.0.0 --port 8000
