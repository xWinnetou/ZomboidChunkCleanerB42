@echo off
setlocal
cd /d "%~dp0"

echo ================================================
echo  Zomboid Chunk Cleaner B42 - arranque local
echo ================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] No se encuentra Node.js.
    echo Instalalo desde https://nodejs.org (version LTS^) y vuelve a ejecutar este fichero.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Instalando dependencias, esto tarda un par de minutos la primera vez...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo [ERROR] Ha fallado "npm install".
        pause
        exit /b 1
    )
)

echo.
echo Abriendo http://localhost:3000 en el navegador.
echo IMPORTANTE: usa Chrome o Edge; Firefox no soporta showDirectoryPicker.
echo Para cerrar la herramienta, cierra esta ventana.
echo.

call npm run dev
pause
