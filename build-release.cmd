@echo off
setlocal EnableExtensions

set "MODE=%~1"
if "%MODE%"=="" set "MODE=all"

if /i "%MODE%"=="help" goto :usage
if /i not "%MODE%"=="all" ^
if /i not "%MODE%"=="portable" ^
if /i not "%MODE%"=="exe" ^
if /i not "%MODE%"=="installer" ^
if /i not "%MODE%"=="linux" goto :usage

set "REPO_ROOT=%~dp0"
if "%REPO_ROOT:~-1%"=="\" set "REPO_ROOT=%REPO_ROOT:~0,-1%"

set "WINDOWS_BUILDER=%REPO_ROOT%\docs\build-windows.cmd"
set "LINUX_BUILDER=%REPO_ROOT%\docs\build-linux-wsl.cmd"

if not exist "%WINDOWS_BUILDER%" (
  echo Could not find "%WINDOWS_BUILDER%".
  goto :error
)

if not exist "%LINUX_BUILDER%" (
  echo Could not find "%LINUX_BUILDER%".
  goto :error
)

if /i "%MODE%"=="all" (
  call :run_linux portable
  if errorlevel 1 goto :error

  call :run_windows exe
  if errorlevel 1 goto :error

  call :run_linux packages
  if errorlevel 1 goto :error

  call :run_windows stage-installer
  if errorlevel 1 goto :error
) else if /i "%MODE%"=="portable" (
  call :run_linux portable
  if errorlevel 1 goto :error

  call :run_windows exe
  if errorlevel 1 goto :error
) else if /i "%MODE%"=="installer" (
  call :run_linux packages
  if errorlevel 1 goto :error

  call :run_windows installer
  if errorlevel 1 goto :error
) else if /i "%MODE%"=="linux" (
  call :run_linux all
  if errorlevel 1 goto :error
) else (
  call :run_windows "%MODE%"
  if errorlevel 1 goto :error
)

echo.
echo Finished. Artifacts are available in:
echo   "%REPO_ROOT%\bin"

endlocal
exit /b 0

:run_linux
echo [step] Building the Linux artifacts in WSL...
call "%LINUX_BUILDER%" %~1
exit /b %errorlevel%

:run_windows
echo [step] Building the Windows artifacts...
call "%WINDOWS_BUILDER%" %~1
exit /b %errorlevel%

:usage
echo Usage: build-release.cmd [all^|portable^|exe^|installer^|linux]
echo.
echo   all        Build the Linux AppImage, Windows portable exe, Linux deb/rpm packages, then Windows installer. Default.
echo   portable   Build the Linux AppImage and Windows portable exe only.
echo   exe        Build only the Windows portable exe.
echo   installer  Build the Linux deb/rpm packages and the Windows NSIS installer.
echo   linux      Build the Linux AppImage, deb, and rpm artifacts in WSL.
exit /b 1

:error
set "EXIT_CODE=%errorlevel%"
if "%EXIT_CODE%"=="0" set "EXIT_CODE=1"
echo.
echo Build failed with exit code %EXIT_CODE%.
pause
endlocal
exit /b %EXIT_CODE%
