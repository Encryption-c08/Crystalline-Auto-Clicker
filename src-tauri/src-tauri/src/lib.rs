use std::{fs, io::ErrorKind, path::PathBuf, sync::Mutex, thread, time::Duration};

use serde::{Deserialize, Serialize};
use tauri::{
    webview::PageLoadEvent, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, Size,
    WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_opener::OpenerExt;

#[cfg(target_os = "windows")]
use std::sync::atomic::{AtomicIsize, Ordering};
#[cfg(target_os = "windows")]
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM},
    Media::{timeBeginPeriod, timeEndPeriod, TIMERR_NOERROR},
    UI::WindowsAndMessaging::{
        CallWindowProcW, DefWindowProcW, GetCursorPos, GetSystemMetrics, GetWindowLongPtrW,
        SetWindowLongPtrW, GWLP_WNDPROC, SC_KEYMENU, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
        SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, WM_SYSCOMMAND,
    },
};

#[path = "../../../src/native/Clicker.rs"]
mod auto_clicker;

use auto_clicker::{AutoClickerCommandConfig, AutoClickerController, AutoClickerStatus};

struct AppState {
    auto_clicker: AutoClickerController,
    click_position_overlay: Mutex<ClickPositionOverlayState>,
    click_position_overlay_loaded: Mutex<bool>,
}

const SETTINGS_FILE_NAME: &str = "settings.json";
const SETTINGS_DIR_NAME: &str = "Crystalline Auto Clicker";
const CLICK_POSITION_OVERLAY_EVENT: &str = "click-position-overlay:update";
const CLICK_POSITION_OVERLAY_WINDOW_LABEL: &str = "click-position-overlay";

#[cfg(target_os = "windows")]
static MAIN_WINDOW_HWND: AtomicIsize = AtomicIsize::new(0);
#[cfg(target_os = "windows")]
static ORIGINAL_MAIN_WINDOW_PROC: AtomicIsize = AtomicIsize::new(0);

#[cfg(target_os = "windows")]
struct TimerResolutionGuard {
    enabled: bool,
    period_ms: u32,
}

#[cfg(target_os = "windows")]
impl TimerResolutionGuard {
    fn new(period_ms: u32) -> Self {
        let enabled = unsafe { timeBeginPeriod(period_ms) == TIMERR_NOERROR };

        Self { enabled, period_ms }
    }
}

#[cfg(target_os = "windows")]
impl Drop for TimerResolutionGuard {
    fn drop(&mut self) {
        if self.enabled {
            unsafe {
                timeEndPeriod(self.period_ms);
            }
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedHotkey {
    code: Option<String>,
    label: Option<String>,
    source: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedClickPosition {
    id: Option<u32>,
    x: Option<i32>,
    y: Option<i32>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedAutoClickerSettings {
    theme: Option<String>,
    click_mode: Option<String>,
    click_rate: Option<String>,
    click_rate_mode: Option<String>,
    click_rate_unit: Option<String>,
    hotkey: Option<PersistedHotkey>,
    mouse_button: Option<String>,
    mouse_action: Option<String>,
    click_position_enabled: Option<bool>,
    click_position_dots_visible: Option<bool>,
    click_position_hotkey: Option<PersistedHotkey>,
    click_positions: Option<Vec<PersistedClickPosition>>,
    double_click_enabled: Option<bool>,
    double_click_delay: Option<String>,
    click_duration_enabled: Option<bool>,
    click_duration_min: Option<String>,
    click_duration_max: Option<String>,
    click_duration: Option<String>,
    click_limit_enabled: Option<bool>,
    click_limit: Option<String>,
    time_limit_enabled: Option<bool>,
    time_limit: Option<String>,
    time_limit_unit: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowFrameRequest {
    width: f64,
    height: f64,
    min_width: Option<f64>,
    min_height: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HotkeyCaptureResponse {
    code: String,
    label: String,
    source: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClickPositionPointDto {
    id: u32,
    x: i32,
    y: i32,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClickPositionOverlayRequest {
    editable: bool,
    positions: Vec<ClickPositionPointDto>,
    visible: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClickPositionOverlayState {
    editable: bool,
    height: i32,
    origin_x: i32,
    origin_y: i32,
    positions: Vec<ClickPositionPointDto>,
    visible: bool,
    width: i32,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CursorPositionResponse {
    x: i32,
    y: i32,
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

#[cfg(target_os = "windows")]
#[derive(Clone, Copy, Debug)]
struct VirtualScreenBounds {
    height: i32,
    width: i32,
    x: i32,
    y: i32,
}

#[cfg(target_os = "windows")]
fn virtual_screen_bounds() -> VirtualScreenBounds {
    let x = unsafe { GetSystemMetrics(SM_XVIRTUALSCREEN) };
    let y = unsafe { GetSystemMetrics(SM_YVIRTUALSCREEN) };
    let width = unsafe { GetSystemMetrics(SM_CXVIRTUALSCREEN) }.max(1);
    let height = unsafe { GetSystemMetrics(SM_CYVIRTUALSCREEN) }.max(1);

    VirtualScreenBounds {
        height,
        width,
        x,
        y,
    }
}

#[cfg(target_os = "windows")]
fn ensure_click_position_overlay_window(
    app: &tauri::AppHandle,
) -> Result<(WebviewWindow, bool), String> {
    if let Some(window) = app.get_webview_window(CLICK_POSITION_OVERLAY_WINDOW_LABEL) {
        return Ok((window, false));
    }

    let bounds = virtual_screen_bounds();
    let window = WebviewWindowBuilder::new(
        app,
        CLICK_POSITION_OVERLAY_WINDOW_LABEL,
        WebviewUrl::App("overlay.html".into()),
    )
    .title("Crystalline Auto Clicker Overlay")
    .decorations(false)
    .transparent(true)
    .resizable(false)
    .visible(false)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focusable(false)
    .focused(false)
    .position(bounds.x as f64, bounds.y as f64)
    .inner_size(bounds.width as f64, bounds.height as f64)
    .build()
    .map_err(|error| format!("Unable to create click position overlay: {error}"))?;

    configure_click_position_overlay_window(&window, &ClickPositionOverlayState::default())?;

    Ok((window, true))
}

#[cfg(target_os = "windows")]
fn sync_click_position_overlay_window_bounds(window: &WebviewWindow) -> Result<(), String> {
    let bounds = virtual_screen_bounds();

    window
        .set_position(PhysicalPosition::new(bounds.x, bounds.y))
        .map_err(|error| format!("Unable to position click position overlay: {error}"))?;
    window
        .set_size(PhysicalSize::new(bounds.width as u32, bounds.height as u32))
        .map_err(|error| format!("Unable to size click position overlay: {error}"))?;

    Ok(())
}

#[cfg(target_os = "windows")]
fn configure_click_position_overlay_window(
    window: &WebviewWindow,
    overlay_state: &ClickPositionOverlayState,
) -> Result<(), String> {
    sync_click_position_overlay_window_bounds(window)?;
    window
        .set_focusable(false)
        .map_err(|error| format!("Unable to disable click position overlay focus: {error}"))?;
    window
        .set_ignore_cursor_events(!overlay_state.editable)
        .map_err(|error| format!("Unable to configure click position overlay: {error}"))?;

    Ok(())
}

fn click_position_overlay_state(
    overlay: ClickPositionOverlayRequest,
) -> ClickPositionOverlayState {
    #[cfg(target_os = "windows")]
    let (origin_x, origin_y, width, height) = {
        let bounds = virtual_screen_bounds();
        (bounds.x, bounds.y, bounds.width, bounds.height)
    };

    #[cfg(not(target_os = "windows"))]
    let (origin_x, origin_y, width, height) = (0, 0, 0, 0);

    ClickPositionOverlayState {
        editable: overlay.editable,
        height,
        origin_x,
        origin_y,
        positions: overlay.positions,
        visible: overlay.visible,
        width,
    }
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

#[tauri::command]
fn get_click_position_overlay_state(
    state: tauri::State<'_, AppState>,
) -> Result<ClickPositionOverlayState, String> {
    state
        .click_position_overlay
        .lock()
        .map(|overlay| overlay.clone())
        .map_err(|_| "Failed to lock click position overlay state".to_string())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn get_current_cursor_position() -> Result<CursorPositionResponse, String> {
    let mut point = POINT { x: 0, y: 0 };

    if unsafe { GetCursorPos(&mut point) } == 0 {
        return Err("Unable to read cursor position.".into());
    }

    Ok(CursorPositionResponse {
        x: point.x,
        y: point.y,
    })
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn get_current_cursor_position() -> Result<CursorPositionResponse, String> {
    Ok(CursorPositionResponse::default())
}

#[tauri::command]
fn sync_click_position_overlay(
    app: tauri::AppHandle,
    overlay: ClickPositionOverlayRequest,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let overlay_state = click_position_overlay_state(overlay);

    {
        let mut current = state
            .click_position_overlay
            .lock()
            .map_err(|_| "Failed to lock click position overlay state".to_string())?;
        *current = overlay_state.clone();
    }

    #[cfg(target_os = "windows")]
    {
        if !overlay_state.visible {
            if let Some(window) = app.get_webview_window(CLICK_POSITION_OVERLAY_WINDOW_LABEL) {
                let overlay_loaded = state
                    .click_position_overlay_loaded
                    .lock()
                    .map(|loaded| *loaded)
                    .unwrap_or(false);

                let _ = configure_click_position_overlay_window(&window, &overlay_state);
                if overlay_loaded {
                    let _ = window.emit(CLICK_POSITION_OVERLAY_EVENT, &overlay_state);
                }
                let _ = window.hide();
            }

            return Ok(());
        }

        let (window, created) = ensure_click_position_overlay_window(&app)?;
        let overlay_loaded = state
            .click_position_overlay_loaded
            .lock()
            .map(|loaded| *loaded)
            .unwrap_or(false);

        configure_click_position_overlay_window(&window, &overlay_state)?;

        if created || !overlay_loaded {
            return Ok(());
        }

        let _ = window.emit(CLICK_POSITION_OVERLAY_EVENT, &overlay_state);
        window
            .show()
            .map_err(|error| format!("Unable to show click position overlay: {error}"))?;
    }

    Ok(())
}

#[tauri::command]
fn notify_webview_ready(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    if window.label() == "main" {
        return window
            .show()
            .map_err(|error| format!("Unable to show main window: {error}"));
    }

    if window.label() == CLICK_POSITION_OVERLAY_WINDOW_LABEL {
        #[cfg(target_os = "windows")]
        {
            if let Ok(mut loaded) = state.click_position_overlay_loaded.lock() {
                *loaded = true;
            }

            let overlay_state = state
                .click_position_overlay
                .lock()
                .map(|overlay| overlay.clone())
                .unwrap_or_default();

            configure_click_position_overlay_window(&window, &overlay_state)?;
            let _ = window.emit(CLICK_POSITION_OVERLAY_EVENT, &overlay_state);

            if overlay_state.visible {
                window
                    .show()
                    .map_err(|error| format!("Unable to show click position overlay: {error}"))?;
            } else {
                window
                    .hide()
                    .map_err(|error| format!("Unable to hide click position overlay: {error}"))?;
            }
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn set_click_position_overlay_interactive(
    app: tauri::AppHandle,
    interactive: bool,
) -> Result<(), String> {
    let Some(window) = app.get_webview_window(CLICK_POSITION_OVERLAY_WINDOW_LABEL) else {
        return Ok(());
    };

    sync_click_position_overlay_window_bounds(&window)?;
    window
        .set_focusable(false)
        .map_err(|error| format!("Unable to disable click position overlay focus: {error}"))?;
    window
        .set_ignore_cursor_events(!interactive)
        .map_err(|error| format!("Unable to update click position overlay interactivity: {error}"))
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn set_click_position_overlay_interactive(_interactive: bool) -> Result<(), String> {
    Ok(())
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
#[tauri::command]
fn read_global_hotkey_state(code: String) -> Result<bool, String> {
    auto_clicker::read_hotkey_state(&code, auto_clicker::ClickMode::Hold)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn read_global_hotkey_state(_code: String) -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
fn sync_main_window_frame(
    app: tauri::AppHandle,
    frame: WindowFrameRequest,
) -> Result<(), String> {
    let WindowFrameRequest {
        width,
        height,
        min_width,
        min_height,
    } = frame;

    if !width.is_finite() || !height.is_finite() || width <= 0.0 || height <= 0.0 {
        return Err("Window size must be positive.".into());
    }

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is not available.".to_string())?;

    let target_size = LogicalSize::new(width, height);
    let target_min_size = match (min_width, min_height) {
        (Some(min_width), Some(min_height))
            if min_width.is_finite()
                && min_height.is_finite()
                && min_width > 0.0
                && min_height > 0.0 =>
        {
            Some(LogicalSize::new(min_width, min_height))
        }
        _ => None,
    };
    let scale_factor = window
        .scale_factor()
        .map_err(|error| format!("Unable to read window scale factor: {error}"))?;
    let start_size = window
        .inner_size()
        .map_err(|error| format!("Unable to read window size: {error}"))?
        .to_logical::<f64>(scale_factor);
    let needs_animation = (start_size.width - target_size.width).abs() >= 1.0
        || (start_size.height - target_size.height).abs() >= 1.0;
    const RESIZE_STEPS: u32 = 10;
    const RESIZE_FRAME_MS: u64 = 10;

    window
        .set_min_size(None::<Size>)
        .map_err(|error| format!("Unable to clear minimum window size: {error}"))?;

    if needs_animation {
        #[cfg(target_os = "windows")]
        let _timer_resolution_guard = TimerResolutionGuard::new(1);

        for step in 1..=RESIZE_STEPS {
            let progress = step as f64 / RESIZE_STEPS as f64;
            let eased_progress = 1.0 - (1.0 - progress).powi(3);
            let next_width =
                (start_size.width + (target_size.width - start_size.width) * eased_progress)
                    .round()
                    .max(1.0);
            let next_height =
                (start_size.height + (target_size.height - start_size.height) * eased_progress)
                    .round()
                    .max(1.0);

            window
                .set_size(LogicalSize::new(next_width, next_height))
                .map_err(|error| format!("Unable to animate main window resize: {error}"))?;

            if step < RESIZE_STEPS {
                thread::sleep(Duration::from_millis(RESIZE_FRAME_MS));
            }
        }
    } else {
        window
            .set_size(target_size)
            .map_err(|error| format!("Unable to resize main window: {error}"))?;
    }

    window
        .set_min_size(target_min_size)
        .map_err(|error| format!("Unable to apply minimum window size: {error}"))?;
    window
        .set_size(target_size)
        .map_err(|error| format!("Unable to finalize main window size: {error}"))?;

    Ok(())
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
            click_position_overlay: Mutex::new(ClickPositionOverlayState::default()),
            click_position_overlay_loaded: Mutex::new(false),
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

                if let Some(overlay_window) =
                    app.get_webview_window(CLICK_POSITION_OVERLAY_WINDOW_LABEL)
                {
                    let _ = configure_click_position_overlay_window(
                        &overlay_window,
                        &ClickPositionOverlayState::default(),
                    );
                    let _ = overlay_window.hide();
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
            get_click_position_overlay_state,
            get_current_cursor_position,
            sync_click_position_overlay,
            notify_webview_ready,
            set_click_position_overlay_interactive,
            read_pressed_keyboard_hotkey,
            read_global_hotkey_state,
            sync_main_window_frame
        ])
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }

            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();

                    if let Some(overlay_window) =
                        window.app_handle().get_webview_window(CLICK_POSITION_OVERLAY_WINDOW_LABEL)
                    {
                        let _ = overlay_window.destroy();
                    }

                    window.app_handle().exit(0);
                }
                WindowEvent::Destroyed => {
                    if let Some(overlay_window) =
                        window.app_handle().get_webview_window(CLICK_POSITION_OVERLAY_WINDOW_LABEL)
                    {
                        let _ = overlay_window.destroy();
                    }
                }
                _ => {}
            }
        })
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
            }

            if webview.label() == CLICK_POSITION_OVERLAY_WINDOW_LABEL
                && matches!(payload.event(), PageLoadEvent::Finished)
            {
                #[cfg(target_os = "windows")]
                {
                    if let Some(window) = webview
                        .app_handle()
                        .get_webview_window(CLICK_POSITION_OVERLAY_WINDOW_LABEL)
                    {
                        let _ = configure_click_position_overlay_window(
                            &window,
                            &ClickPositionOverlayState::default(),
                        );
                        let _ = window.hide();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
