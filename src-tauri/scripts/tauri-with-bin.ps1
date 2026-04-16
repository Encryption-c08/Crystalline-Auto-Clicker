param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CliArgs
)

$ErrorActionPreference = "Stop"

if (-not $CliArgs -or $CliArgs.Count -eq 0) {
  throw "No Tauri CLI arguments were provided."
}

function Copy-ArtifactToBin {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePath,
    [Parameter(Mandatory = $true)]
    [string]$BinDir
  )

  $fileName = [System.IO.Path]::GetFileName($SourcePath)
  $destination = Join-Path $BinDir $fileName

  try {
    Copy-Item -LiteralPath $SourcePath -Destination $destination -Force
  } catch {
    $fallbackName =
      "{0}.updated{1}" -f
      [System.IO.Path]::GetFileNameWithoutExtension($fileName),
      [System.IO.Path]::GetExtension($fileName)
    $fallbackDestination = Join-Path $BinDir $fallbackName
    Copy-Item -LiteralPath $SourcePath -Destination $fallbackDestination -Force
    Write-Warning "Could not overwrite $destination. Copied latest artifact to $fallbackDestination instead."
  }
}

function Copy-BuildArtifactsToBin {
  param(
    [Parameter(Mandatory = $true)]
    [string]$TargetDir,
    [Parameter(Mandatory = $true)]
    [string]$BinDir,
    [Parameter(Mandatory = $true)]
    [datetime]$BuildStartedAt,
    [Parameter(Mandatory = $true)]
    [string[]]$CliArgs
  )

  $freshEnoughAt = $BuildStartedAt.AddSeconds(-5)
  $artifacts = New-Object System.Collections.Generic.List[string]

  $rawExe = Join-Path $TargetDir "release\tauri-native.exe"
  if (Test-Path $rawExe) {
    $artifacts.Add($rawExe)
  }

  $didRequestNoBundle = $CliArgs -contains "--no-bundle"
  if (-not $didRequestNoBundle) {
    Get-ChildItem -Path $BinDir -File -Filter *.msi -ErrorAction SilentlyContinue |
      Remove-Item -Force

    $bundleGlobs = @(
      (Join-Path $TargetDir "release\bundle\nsis\*.exe")
    )

    foreach ($bundleGlob in $bundleGlobs) {
      Get-ChildItem -Path $bundleGlob -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -ge $freshEnoughAt } |
        Sort-Object LastWriteTime -Descending |
        ForEach-Object { $artifacts.Add($_.FullName) }
    }
  }

  foreach ($artifact in $artifacts | Select-Object -Unique) {
    Copy-ArtifactToBin -SourcePath $artifact -BinDir $BinDir
  }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Resolve-Path (Join-Path $scriptDir "..")
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")
$binDir = Join-Path $repoRoot "bin"
$defaultTargetDir = Join-Path $repoRoot ".tauri-target"

New-Item -ItemType Directory -Force -Path $binDir | Out-Null
New-Item -ItemType Directory -Force -Path $defaultTargetDir | Out-Null

try {
  & attrib +h $defaultTargetDir 2>$null | Out-Null
} catch {
}

if (-not $env:CARGO_TARGET_DIR) {
  $env:CARGO_TARGET_DIR = $defaultTargetDir
}

$env:PATH = "$HOME\.cargo\bin;$env:PATH"
$tauriCliCandidates = @(
  (Join-Path $frontendDir "node_modules\.bin\tauri.exe"),
  (Join-Path $frontendDir "node_modules\.bin\tauri.cmd"),
  (Join-Path $frontendDir "node_modules\.bin\tauri")
)
$tauriCli = $tauriCliCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $tauriCli) {
  throw "Could not find the local Tauri CLI in node_modules/.bin."
}

$buildStartedAt = Get-Date

Push-Location $frontendDir
try {
  & $tauriCli @CliArgs
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}

if ($exitCode -ne 0) {
  exit $exitCode
}

if ($CliArgs[0] -eq "build") {
  Copy-BuildArtifactsToBin `
    -TargetDir $env:CARGO_TARGET_DIR `
    -BinDir $binDir `
    -BuildStartedAt $buildStartedAt `
    -CliArgs $CliArgs
}
