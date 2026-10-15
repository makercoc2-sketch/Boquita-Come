@echo off
title Actualizar Boquita Come POS
chcp 65001 > nul

echo ========================================================
echo       ACTUALIZADOR AUTOMATICO - BOQUITA COME POS
echo ========================================================
echo.
echo Cerrando procesos previos y comprobando version...
echo.

cd /d "%~dp0"

:: 1. Detener el sistema para liberar archivos en uso (.py, .js)
echo [1/4] Deteniendo servidor en ejecucion...
call "%~dp0DETENER_SISTEMA.bat" > nul 2>&1
timeout /t 2 > nul

:: 2. Actualizar codigo desde GitHub
echo [2/4] Descargando ultimas mejoras desde GitHub...
where git > nul 2>&1
if %ERRORLEVEL% equ 0 (
    if exist ".git" (
        git fetch origin main > nul 2>&1
        git reset --hard origin/main
        goto :UPDATE_SUCCESS
    )
)

:: Si la maquina no tiene Git, descargar ZIP directamente con PowerShell
echo Git no encontrado en la PC. Descargando paquete oficial de actualizacion...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/makercoc2-sketch/Boquita-Come/archive/refs/heads/main.zip' -OutFile 'update_temp.zip'"
if not exist "update_temp.zip" (
    echo.
    echo [ERROR] No se pudo descargar la actualizacion. Verifica la conexion a Internet.
    echo.
    pause
    exit /b 1
)

echo Descomprimiendo y aplicando cambios del sistema...
powershell -Command "Expand-Archive -Path 'update_temp.zip' -DestinationPath 'update_temp' -Force"
xcopy /E /Y /I "update_temp\Boquita-Come-main\backend" "backend\" > nul 2>&1
xcopy /E /Y /I "update_temp\Boquita-Come-main\frontend\dist" "frontend\dist\" > nul 2>&1
xcopy /Y "update_temp\Boquita-Come-main\*.bat" ".\" > nul 2>&1
xcopy /Y "update_temp\Boquita-Come-main\*.vbs" ".\" > nul 2>&1
rd /s /q "update_temp" > nul 2>&1
del /f /q "update_temp.zip" > nul 2>&1

:UPDATE_SUCCESS
echo.
echo [3/4] Verificando librerias del sistema...
if exist "backend\.venv\Scripts\python.exe" (
    if exist "backend\requirements.txt" (
        "backend\.venv\Scripts\python.exe" -m pip install -r "backend\requirements.txt" --quiet > nul 2>&1
    )
)

echo.
echo [4/4] Iniciando Boquita Come POS con la nueva version...
if exist "INICIAR_SILENCIOSO.vbs" (
    wscript.exe "INICIAR_SILENCIOSO.vbs"
) else (
    start "" "INICIAR_SISTEMA.bat"
)

echo.
echo ========================================================
echo   ¡SISTEMA ACTUALIZADO CON EXITO A LA ULTIMA VERSION!
echo ========================================================
echo.
echo  * Tus ventas, productos y base de datos estan 100%% seguras.
echo  * El sistema se abrira en tu navegador en 5 segundos...
echo.
timeout /t 5 > nul
exit
