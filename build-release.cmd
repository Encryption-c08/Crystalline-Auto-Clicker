@echo off
setlocal

set "REPO_ROOT=%~dp0"
if "%REPO_ROOT:~-1%"=="\" set "REPO_ROOT=%REPO_ROOT:~0,-1%"

set "BIN_DIR=%REPO_ROOT%\bin"
set "BUILD_SCRIPT=%REPO_ROOT%\src-tauri\scripts\build-desktop.ps1"

if not exist "%BUILD_SCRIPT%" (
  echo Could not find build script at "%BUILD_SCRIPT%".
  goto :error
)

if not exist "%BIN_DIR%" (
  mkdir "%BIN_DIR%"
  if errorlevel 1 goto :error
)

echo Building desktop exe...
powershell -ExecutionPolicy Bypass -File "%BUILD_SCRIPT%" -Mode exe
if errorlevel 1 goto :error

echo Building NSIS installer...
powershell -ExecutionPolicy Bypass -File "%BUILD_SCRIPT%" -Mode installer
if errorlevel 1 goto :error

echo.
echo Finished. Artifacts are available in:
echo   "%BIN_DIR%"

endlocal
exit /b 0

:error
set "EXIT_CODE=%errorlevel%"
echo.
echo Build failed with exit code %EXIT_CODE%.
pause
endlocal
exit /b %EXIT_CODE%
