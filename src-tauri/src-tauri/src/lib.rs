use std::{fs, io::ErrorKind, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{webview::PageLoadEvent, Manager};
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_opener::OpenerExt;

#[cfg(target_os = "windows")]
use std::sync::atomic::{AtomicIsize, Ordering};
#[cfg(target_os = "windows")]
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    UI::WindowsAndMessaging::{
        CallWindowProcW, DefWindowProcW, GetWindowLongPtrW, SetWindowLongPtrW, GWLP_WNDPROC,
        SC_KEYMENU, WM_SYSCOMMAND,
    },
};

#[path = "../../../src/native/Clicker.rs"]
mod auto_clicker;

use auto_clicker::{AutoClickerCommandConfig, AutoClickerController, AutoClickerStatus};

struct AppState {
    auto_clicker: AutoClickerController,
}

const SETTINGS_FILE_NAME: &str = "settings.json";
const SETTINGS_DIR_NAME: &str = "Crystalline Auto Clicker";

#[cfg(target_os = "windows")]
static MAIN_WINDOW_HWND: AtomicIsize = AtomicIsize::new(0);
#[cfg(target_os = "windows")]
static ORIGINAL_MAIN_WINDOW_PROC: AtomicIsize = AtomicIsize::new(0);

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedHotkey {
    code: Option<String>,
    label: Option<String>,
    source: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedAutoClickerSettings {
    click_mode: Option<String>,
    click_rate: Option<String>,
    click_rate_unit: Option<String>,
    hotkey: Option<PersistedHotkey>,
    mouse_button: Option<String>,
    mouse_action: Option<String>,
    click_limit_enabled: Option<bool>,
    click_limit: Option<String>,
    time_limit_enabled: Option<bool>,
    time_limit: Option<String>,
    time_limit_unit: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HotkeyCaptureResponse {
    code: String,
    label: String,
    source: String,
}

fn settings_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .config_dir()
        .map(|path| path.join(SETTINGS_DIR_NAME).join(SETTINGS_FILE_NAME))
        .map_err(|error| format!("Unable to resolve settings folder: {error}"))
}

fn legacy_settings_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join(SETTINGS_FILE_NAME))
        .map_err(|error| format!("Unable to resolve settings folder: {error}"))
}

#[tauri::command]
fn configure_auto_clicker(
    config: AutoClickerCommandConfig,
    state: tauri::State<'_, AppState>,
) -> Result<AutoClickerStatus, String> {
    state.auto_clicker.configure(config)
}

#[tauri::command]
fn get_auto_clicker_status(
    state: tauri::State<'_, AppState>,
) -> Result<AutoClickerStatus, String> {
    Ok(state.auto_clicker.status())
}

#[tauri::command]
fn load_auto_clicker_settings(
    app: tauri::AppHandle,
) -> Result<Option<PersistedAutoClickerSettings>, String> {
    let path = settings_file_path(&app)?;

    match fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents)
            .map(Some)
            .map_err(|error| format!("Unable to parse saved settings: {error}")),
        Err(error) if error.kind() == ErrorKind::NotFound => {
            let legacy_path = legacy_settings_file_path(&app)?;

            match fs::read_to_string(&legacy_path) {
                Ok(contents) => serde_json::from_str(&contents)
                    .map(Some)
                    .map_err(|error| format!("Unable to parse saved settings: {error}")),
                Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
                Err(error) => Err(format!("Unable to read saved settings: {error}")),
            }
        }
        Err(error) => Err(format!("Unable to read saved settings: {error}")),
    }
}

#[tauri::command]
fn save_auto_clicker_settings(
    app: tauri::AppHandle,
    settings: PersistedAutoClickerSettings,
) -> Result<(), String> {
    let path = settings_file_path(&app)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Unable to create settings folder: {error}"))?;
    }

    let contents = serde_json::to_string_pretty(&settings)
        .map_err(|error| format!("Unable to serialize settings: {error}"))?;

    fs::write(&path, contents).map_err(|error| format!("Unable to write settings: {error}"))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn read_pressed_keyboard_hotkey() -> Result<Option<HotkeyCaptureResponse>, String> {
    Ok(auto_clicker::read_pressed_keyboard_hotkey()?.map(|hotkey| HotkeyCaptureResponse {
        code: hotkey.code,
        label: hotkey.label,
        source: hotkey.source,
    }))
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn read_pressed_keyboard_hotkey() -> Result<Option<HotkeyCaptureResponse>, String> {
    Ok(None)
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn main_window_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == WM_SYSCOMMAND && (wparam & 0xFFF0usize) == SC_KEYMENU as usize {
        return 0;
    }

    let original_proc = ORIGINAL_MAIN_WINDOW_PROC.load(Ordering::Relaxed);
    if original_proc != 0 {
        let original_proc = unsafe {
            std::mem::transmute::<
                isize,
                unsafe extern "system" fn(HWND, u32, WPARAM, LPARAM) -> LRESULT,
            >(original_proc)
        };

        return unsafe { CallWindowProcW(Some(original_proc), hwnd, msg, wparam, lparam) };
    }

    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

#[cfg(target_os = "windows")]
fn install_main_window_proc(hwnd: isize) {
    if hwnd == 0 || MAIN_WINDOW_HWND.load(Ordering::Relaxed) == hwnd {
        return;
    }

    let hwnd = hwnd as HWND;
    let original_proc = unsafe { GetWindowLongPtrW(hwnd, GWLP_WNDPROC) };
    if original_proc == 0 {
        log::warn!("unable to read main window procedure for Alt+Space suppression");
        return;
    }

    let replaced_proc = unsafe {
        SetWindowLongPtrW(
            hwnd,
            GWLP_WNDPROC,
            main_window_proc as *const () as isize,
        )
    };
    let previous_proc = if replaced_proc == 0 {
        original_proc
    } else {
        replaced_proc
    };

    ORIGINAL_MAIN_WINDOW_PROC.store(previous_proc, Ordering::Relaxed);
    MAIN_WINDOW_HWND.store(hwnd as isize, Ordering::Relaxed);
}

fn external_navigation_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::<R>::new("external-navigation")
        .on_navigation(|webview, url| {
            let is_internal_host = matches!(
                url.host_str(),
                Some("localhost") | Some("127.0.0.1") | Some("tauri.localhost") | Some("::1")
            );

            let is_internal = url.scheme() == "tauri" || is_internal_host;

            if is_internal {
                return true;
            }

            let is_external_link = matches!(url.scheme(), "http" | "https" | "mailto" | "tel");

            if is_external_link {
                log::info!("opening external link in system browser: {}", url);
                let _ = webview.opener().open_url(url.as_str(), None::<&str>);
                return false;
            }

            true
        })
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            auto_clicker: AutoClickerController::new(),
        })
        .setup(|app| {
            #[cfg(target_os = "windows")]
            {
                if let Some(main_window) = app.get_webview_window("main") {
                    if let Ok(hwnd) = main_window.hwnd() {
                        install_main_window_proc(hwnd.0 as isize);
                        app.state::<AppState>()
                            .auto_clicker
                            .set_main_window_handle(hwnd.0 as isize);
                    }
                }
            }

            Ok(())
        })
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                    Target::new(TargetKind::Webview),
                ])
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(external_navigation_plugin())
        .invoke_handler(tauri::generate_handler![
            configure_auto_clicker,
            get_auto_clicker_status,
            load_auto_clicker_settings,
            save_auto_clicker_settings,
            read_pressed_keyboard_hotkey
        ])
        .on_page_load(|webview, payload| {
            if webview.label() == "main" && matches!(payload.event(), PageLoadEvent::Finished) {
                log::info!("main webview finished loading");
                #[cfg(target_os = "windows")]
                if let Ok(hwnd) = webview.window().hwnd() {
                    install_main_window_proc(hwnd.0 as isize);
                    webview
                        .app_handle()
                        .state::<AppState>()
                        .auto_clicker
                        .set_main_window_handle(hwnd.0 as isize);
                }
                let _ = webview.window().show();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
