param(
  [ValidateSet("exe", "installer")]
  [string]$Mode = "exe"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")
$frontendDir = Resolve-Path (Join-Path $scriptDir "..")
$targetDir = Join-Path $frontendDir ".tauri-target"
$binDir = Join-Path $repoRoot "bin"

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

try {
  & attrib +h $targetDir 2>$null | Out-Null
} catch {
}

$env:PATH = "$HOME\.cargo\bin;$env:PATH"
$env:CARGO_TARGET_DIR = $targetDir

Push-Location $frontendDir
try {
  $tauriArgs = @("run", "tauri", "build")

  if ($Mode -eq "exe") {
    $tauriArgs += "--no-bundle"
  } else {
    $tauriArgs += "--bundles"
    $tauriArgs += "nsis"
  }

  & bun.cmd @tauriArgs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}

$artifacts = New-Object System.Collections.Generic.List[string]
$rawExe = Join-Path $targetDir "release\tauri-native.exe"
if (Test-Path $rawExe) {
  $artifacts.Add($rawExe)
}

if ($Mode -eq "installer") {
  Get-ChildItem -Path $binDir -File -Filter *.msi -ErrorAction SilentlyContinue |
    Remove-Item -Force

  $nsisDir = Join-Path $targetDir "release\bundle\nsis"
  if (Test-Path $nsisDir) {
    Get-ChildItem -Path $nsisDir -File -Filter *.exe |
      Sort-Object LastWriteTime -Descending |
      ForEach-Object { $artifacts.Add($_.FullName) }
  }
}

foreach ($artifact in $artifacts | Select-Object -Unique) {
  $destination = Join-Path $binDir ([System.IO.Path]::GetFileName($artifact))
  Copy-Item -LiteralPath $artifact -Destination $destination -Force
}
