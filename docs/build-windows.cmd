@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "MODE=%~1"
if "%MODE%"=="" set "MODE=all"

if /i "%MODE%"=="help" goto :usage
if /i not "%MODE%"=="all" if /i not "%MODE%"=="exe" if /i not "%MODE%"=="installer" goto :usage

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
for %%I in ("%SCRIPT_DIR%\..") do set "REPO_ROOT=%%~fI"

set "FRONTEND_DIR=%REPO_ROOT%\src-tauri"
set "TARGET_DIR=%FRONTEND_DIR%\.tauri-target"
set "BIN_DIR=%REPO_ROOT%\bin"
set "PORTABLE_NAME=Crystalline Auto Clicker portable.exe"
set "SETUP_NAME=Crystalline Auto Clicker setup.exe"
set "TAURI_CLI=%FRONTEND_DIR%\node_modules\.bin\tauri.cmd"
set "CHECK_FAILED="

echo [step] Checking Windows build prerequisites...

if not exist "%FRONTEND_DIR%\package.json" (
  call :fail "Could not find src-tauri\package.json. Run this script from the repository clone."
)

where node >nul 2>nul
if errorlevel 1 (
  call :fail "Node.js was not found in PATH."
) else (
  for /f "delims=" %%I in ('node --version 2^>nul') do if not defined NODE_VERSION set "NODE_VERSION=%%I"
  call :ok "Node.js found: !NODE_VERSION!"
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  call :fail "npm was not found in PATH."
) else (
  for /f "delims=" %%I in ('npm.cmd --version 2^>nul') do if not defined NPM_VERSION set "NPM_VERSION=%%I"
  if defined NPM_VERSION (
    call :ok "npm found: !NPM_VERSION!"
  ) else (
    call :fail "npm was found, but its version could not be read."
  )
)

where rustc >nul 2>nul
if errorlevel 1 (
  call :fail "rustc was not found in PATH."
) else (
  for /f "delims=" %%I in ('rustc --version 2^>nul') do if not defined RUSTC_VERSION set "RUSTC_VERSION=%%I"
  call :ok "rustc found: !RUSTC_VERSION!"
)

where cargo >nul 2>nul
if errorlevel 1 (
  call :fail "cargo was not found in PATH."
) else (
  for /f "delims=" %%I in ('cargo --version 2^>nul') do if not defined CARGO_VERSION set "CARGO_VERSION=%%I"
  call :ok "cargo found: !CARGO_VERSION!"
)

where rustup >nul 2>nul
if errorlevel 1 (
  call :fail "rustup was not found in PATH."
) else (
  for /f "delims=" %%I in ('rustup show active-toolchain 2^>nul') do if not defined ACTIVE_RUST_TOOLCHAIN set "ACTIVE_RUST_TOOLCHAIN=%%I"
  if not defined ACTIVE_RUST_TOOLCHAIN (
    call :fail "rustup was found, but the active toolchain could not be read."
  ) else (
    echo !ACTIVE_RUST_TOOLCHAIN! | find /i "msvc" >nul
    if errorlevel 1 (
      call :fail "Rust is installed, but the active toolchain is not MSVC. Set it with: rustup default stable-msvc"
    ) else (
      call :ok "Rust MSVC toolchain is active: !ACTIVE_RUST_TOOLCHAIN!"
    )
  )
)

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" set "VSWHERE=%ProgramFiles%\Microsoft Visual Studio\Installer\vswhere.exe"

if not exist "%VSWHERE%" (
  call :fail "vswhere.exe was not found, so Microsoft C++ Build Tools could not be detected."
) else (
  for /f "usebackq delims=" %%I in (`"%VSWHERE%" -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2^>nul`) do if not defined MSVC_PATH set "MSVC_PATH=%%I"
  if defined MSVC_PATH (
    call :ok "Microsoft C++ Build Tools found: !MSVC_PATH!"
  ) else (
    call :fail "Microsoft C++ Build Tools with 'Desktop development with C++' were not detected."
  )
)

for %%K in (
  "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"
  "HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
  "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"
) do (
  if not defined WEBVIEW2_FOUND (
    reg query %%~K /s /f "Microsoft Edge WebView2 Runtime" >nul 2>nul && set "WEBVIEW2_FOUND=1"
  )
)

if defined WEBVIEW2_FOUND (
  call :ok "WebView2 runtime found."
) else (
  call :fail "Microsoft Edge WebView2 Runtime was not detected."
)

if defined CHECK_FAILED (
  echo.
  echo [fail] One or more prerequisites are missing. Fix them and run this script again.
  exit /b 1
)

if exist "%TAURI_CLI%" (
  call :ok "Local Tauri CLI found."
) else (
  echo [step] Installing frontend dependencies in src-tauri...
  pushd "%FRONTEND_DIR%"
  call npm.cmd install
  set "EXIT_CODE=!errorlevel!"
  popd
  if not "!EXIT_CODE!"=="0" (
    echo.
    echo [fail] npm install failed with exit code !EXIT_CODE!.
    exit /b !EXIT_CODE!
  )

  if exist "%TAURI_CLI%" (
    call :ok "Frontend dependencies installed."
  ) else (
    echo.
    echo [fail] npm install completed, but the local Tauri CLI was still not found.
    exit /b 1
  )
)

if not exist "%BIN_DIR%" (
  mkdir "%BIN_DIR%"
  if errorlevel 1 (
    echo.
    echo [fail] Could not create "%BIN_DIR%".
    exit /b 1
  )
)

if not exist "%TARGET_DIR%" (
  mkdir "%TARGET_DIR%"
  if errorlevel 1 (
    echo.
    echo [fail] Could not create "%TARGET_DIR%".
    exit /b 1
  )
)

attrib +h "%TARGET_DIR%" >nul 2>nul

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
set "CARGO_TARGET_DIR=%TARGET_DIR%"

call :prune_bin "%MODE%"
if errorlevel 1 exit /b 1

if /i "%MODE%"=="all" (
  echo [step] Building the portable exe and NSIS installer...
  call :build_tauri "Building desktop exe..." --no-bundle
  if errorlevel 1 exit /b 1
  call :copy_portable
  if errorlevel 1 exit /b 1
  call :build_tauri "Building NSIS installer..." --bundles nsis
  if errorlevel 1 exit /b 1
  call :copy_setup
  if errorlevel 1 exit /b 1
) else if /i "%MODE%"=="exe" (
  echo [step] Building the portable exe...
  call :build_tauri "Building desktop exe..." --no-bundle
  if errorlevel 1 exit /b 1
  call :copy_portable
  if errorlevel 1 exit /b 1
) else (
  echo [step] Building the NSIS installer...
  call :build_tauri "Building NSIS installer..." --bundles nsis
  if errorlevel 1 exit /b 1
  call :copy_setup
  if errorlevel 1 exit /b 1
)

echo.
echo [ok] Build finished successfully.
echo [ok] Artifacts are available in "%BIN_DIR%"
exit /b 0

:build_tauri
echo %~1
pushd "%FRONTEND_DIR%"
call "%TAURI_CLI%" build %~2 %~3
set "EXIT_CODE=%errorlevel%"
popd
if not "%EXIT_CODE%"=="0" (
  echo.
  echo [fail] %~1 failed with exit code %EXIT_CODE%.
  exit /b %EXIT_CODE%
)
exit /b 0

:copy_portable
set "PORTABLE_SOURCE=%TARGET_DIR%\release\Crystalline Auto Clicker.exe"
set "PORTABLE_DEST=%BIN_DIR%\%PORTABLE_NAME%"

if not exist "%PORTABLE_SOURCE%" (
  echo.
  echo [fail] Could not find the built portable executable at "%PORTABLE_SOURCE%".
  exit /b 1
)

copy /y "%PORTABLE_SOURCE%" "%PORTABLE_DEST%" >nul
if errorlevel 1 (
  echo.
  echo [fail] Unable to update "%PORTABLE_DEST%". Close any running copy of Crystalline Auto Clicker and try again.
  exit /b 1
)
exit /b 0

:copy_setup
set "SETUP_SOURCE="
for /f "delims=" %%F in ('dir /b /a-d /o-d "%TARGET_DIR%\release\bundle\nsis\*-setup.exe" 2^>nul') do (
  if not defined SETUP_SOURCE set "SETUP_SOURCE=%TARGET_DIR%\release\bundle\nsis\%%F"
)

if not defined SETUP_SOURCE (
  echo.
  echo [fail] Could not find the built setup executable in "%TARGET_DIR%\release\bundle\nsis".
  exit /b 1
)

set "SETUP_DEST=%BIN_DIR%\%SETUP_NAME%"
copy /y "%SETUP_SOURCE%" "%SETUP_DEST%" >nul
if errorlevel 1 (
  echo.
  echo [fail] Unable to update "%SETUP_DEST%". Close any running copy of Crystalline Auto Clicker and try again.
  exit /b 1
)
exit /b 0

:prune_bin
for /f "delims=" %%F in ('dir /b /a-d "%BIN_DIR%\*.exe" 2^>nul') do (
  call :maybe_delete "%BIN_DIR%\%%F" "%~1"
  if errorlevel 1 exit /b 1
)

for /f "delims=" %%F in ('dir /b /a-d "%BIN_DIR%\*.msi" 2^>nul') do (
  call :maybe_delete "%BIN_DIR%\%%F" "%~1"
  if errorlevel 1 exit /b 1
)
exit /b 0

:maybe_delete
set "FILE_NAME=%~nx1"

if /i "%~2"=="all" (
  if /i "!FILE_NAME!"=="%PORTABLE_NAME%" exit /b 0
  if /i "!FILE_NAME!"=="%SETUP_NAME%" exit /b 0
) else if /i "%~2"=="exe" (
  if /i "!FILE_NAME!"=="%PORTABLE_NAME%" exit /b 0
) else if /i "%~2"=="installer" (
  if /i "!FILE_NAME!"=="%SETUP_NAME%" exit /b 0
)

del /f /q "%~1" >nul 2>nul
if errorlevel 1 (
  echo.
  echo [fail] Unable to remove "%~1". Close any running copy of Crystalline Auto Clicker and try again.
  exit /b 1
)
exit /b 0

:ok
echo [ok] %~1
exit /b 0

:fail
echo [fail] %~1
set "CHECK_FAILED=1"
exit /b 0

:usage
echo Usage: docs\build-windows.cmd [all^|exe^|installer]
echo.
echo   all        Check prerequisites, then build both the portable exe and setup exe. Default.
echo   exe        Check prerequisites, then build only the portable exe.
echo   installer  Check prerequisites, then build only the setup exe.
exit /b 1
