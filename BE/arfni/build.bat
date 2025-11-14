@echo off
REM Arfni Build Script for Windows
REM Date: 2025-10-30

echo ================================================
echo   Arfni Build Script
echo ================================================
echo.

REM 1. Build ic.exe (Deployment Engine)
echo [1/2] Building ic.exe...
cd cmd\ic
go build -o ..\..\bin\ic.exe .
if %errorlevel% neq 0 (
    echo [ERROR] Failed to build ic.exe
    exit /b 1
)
echo [SUCCESS] ic.exe built successfully
cd ..\..
echo.

REM 2. Build arfni-go.exe (Deploy Wrapper)
echo [2/2] Building arfni-go.exe...
cd cmd\arfni-go
go build -o ..\..\bin\arfni-go.exe .
if %errorlevel% neq 0 (
    echo [ERROR] Failed to build arfni-go.exe
    exit /b 1
)
echo [SUCCESS] arfni-go.exe built successfully
cd ..\..
echo.

echo ================================================
echo   Build Completed Successfully!
echo ================================================
echo.
echo Output files:
echo   - bin\ic.exe
echo   - bin\arfni-go.exe
echo.
