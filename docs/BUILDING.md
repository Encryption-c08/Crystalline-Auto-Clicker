# Building Crystalline Auto Clicker on Windows

## Requirements

- `Node.js` 20 or newer
- `Rust` via `rustup`
- Microsoft C++ Build Tools / Visual Studio Build Tools
- Microsoft Edge `WebView2` runtime

Official Tauri prerequisite reference: <https://v2.tauri.app/start/prerequisites/>

## Manual Setup

```bat
git clone https://github.com/Encryption-c08/Crystalline-Auto-Clicker.git
cd Crystalline-Auto-Clicker
cd src-tauri
npm.cmd install
rustup default stable-x86_64-pc-windows-msvc
```

## Run The App In Development

```bat
cd src-tauri
npm.cmd exec tauri dev
```

## Build A Release Bundle

```bat
cd src-tauri
npm.cmd run build
npm.cmd run desktop:exe
npm.cmd run desktop:installer
```

## Useful Validation Commands

```bat
cd src-tauri
npm.cmd run lint
npm.cmd run build
cd ..
cargo test --manifest-path src-tauri/src-tauri/Cargo.toml
```

## Build Outputs

Successful release builds are copied into the repository `bin` folder:

- `bin/Crystalline Auto Clicker portable.exe`
- `bin/Crystalline Auto Clicker setup.exe`

## Optional Build Helper

If you want one command that checks the Windows prerequisites and then builds both release artifacts, run:

```bat
.\docs\build-windows.cmd
```

That script:

- Checks `Node.js`, `npm`, `rustc`, `cargo`, `rustup`, the active Rust `MSVC` toolchain, Microsoft C++ Build Tools, `WebView2`, and the local Tauri CLI
- Runs `npm install` in `src-tauri` if dependencies are missing
- Builds both the portable exe and the NSIS setup exe

You can also call it directly for one artifact:

```bat
.\docs\build-windows.cmd exe
.\docs\build-windows.cmd installer
```
