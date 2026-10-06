@echo off
title Detener Boquita Come POS
chcp 65001 > nul

echo ========================================================
echo   DETENIENDO SERVIDOR BOQUITA COME POS...
echo ========================================================

:: Detener proceso de uvicorn en puerto 8000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do taskkill /PID %%a /F > nul 2>&1
taskkill /FI "WINDOWTITLE eq Boquita Come POS - Servidor*" /F > nul 2>&1

echo.
echo Servidor detenido correctamente.
ping 127.0.0.1 -n 3 > nul
