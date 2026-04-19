use std::{fs, io::ErrorKind, path::PathBuf, sync::Mutex, thread, time::Duration};

use serde::{Deserialize, Serialize};
use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
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
        SetLayeredWindowAttributes, SetWindowLongPtrW, GWL_EXSTYLE, GWLP_WNDPROC, LWA_ALPHA,
        SC_KEYMENU, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
        SM_YVIRTUALSCREEN, WM_SYSCOMMAND, WS_EX_LAYERED,
    },
};

#[path = "../../../src/native/Clicker.rs"]
mod auto_clicker;
#[path = "../../../src/native/edge_stop.rs"]
mod edge_stop;
#[path = "../../../src/native/process_filters.rs"]
mod process_filters;

use auto_clicker::{AutoClickerCommandConfig, AutoClickerController, AutoClickerStatus};
use edge_stop::{edge_stop_runtime, EdgeStopWidths, OverlayRect};
use process_filters::{
    foreground_process_name as resolve_foreground_process_name,
    list_open_app_processes as resolve_open_app_processes, OpenAppProcess,
    list_running_process_names as resolve_running_process_names,
    pick_process_name_from_click as resolve_pick_process_name_from_click,
};

struct AppState {
    auto_clicker: AutoClickerController,
    click_position_overlay: Mutex<ClickPositionOverlayState>,
    click_position_overlay_interactive: Mutex<bool>,
    click_position_overlay_loaded: Mutex<bool>,
    close_to_tray_enabled: Mutex<bool>,
    main_window_hidden_to_tray: Mutex<bool>,
}

const SETTINGS_FILE_NAME: &str = "settings.json";
const SETTINGS_DIR_NAME: &str = "Crystalline Auto Clicker";
const CLICK_POSITION_OVERLAY_EVENT: &str = "click-position-overlay:update";
const CLICK_POSITION_OVERLAY_WINDOW_LABEL: &str = "click-position-overlay";
const MAIN_TRAY_ICON_ID: &str = "main-tray";
const MAIN_TRAY_OPEN_ID: &str = "main-tray-open";
const MAIN_TRAY_QUIT_ID: &str = "main-tray-quit";
const DEFAULT_WINDOW_OPACITY_PERCENT: f64 = 100.0;
const MIN_WINDOW_OPACITY_PERCENT: f64 = 40.0;
const MAX_WINDOW_OPACITY_PERCENT: f64 = 100.0;

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
struct PersistedClickRegion {
    x: Option<i32>,
    y: Option<i32>,
    width: Option<i32>,
    height: Option<i32>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedThemeColors {
    background: Option<String>,
    panel: Option<String>,
    panel_border: Option<String>,
    text: Option<String>,
    muted_text: Option<String>,
    accent: Option<String>,
    edge_stop_fill: Option<String>,
    edge_stop_line: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedAutoClickerSettings {
    theme: Option<String>,
    theme_preset: Option<String>,
    theme_custom_colors_enabled: Option<bool>,
    theme_colors: Option<PersistedThemeColors>,
    window_opacity: Option<f64>,
    close_to_tray: Option<bool>,
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
    click_region_enabled: Option<bool>,
    click_region: Option<PersistedClickRegion>,
    double_click_enabled: Option<bool>,
    double_click_delay: Option<String>,
    click_duration_enabled: Option<bool>,
    click_duration_min: Option<String>,
    click_duration_max: Option<String>,
    click_duration: Option<String>,
    jitter_enabled: Option<bool>,
    jitter_mode: Option<String>,
    jitter_x: Option<String>,
    jitter_y: Option<String>,
    click_limit_enabled: Option<bool>,
    click_limit: Option<String>,
    time_limit_enabled: Option<bool>,
    time_limit: Option<String>,
    time_limit_unit: Option<String>,
    edge_stop_enabled: Option<bool>,
    edge_stop_top_width: Option<String>,
    edge_stop_right_width: Option<String>,
    edge_stop_bottom_width: Option<String>,
    edge_stop_left_width: Option<String>,
    process_whitelist_enabled: Option<bool>,
    process_whitelist: Option<Vec<String>>,
    process_blacklist_enabled: Option<bool>,
    process_blacklist: Option<Vec<String>>,
}

fn normalize_window_opacity_percent(opacity: Option<f64>) -> f64 {
    opacity
        .filter(|value| value.is_finite())
        .unwrap_or(DEFAULT_WINDOW_OPACITY_PERCENT)
        .clamp(MIN_WINDOW_OPACITY_PERCENT, MAX_WINDOW_OPACITY_PERCENT)
}

fn resolve_window_opacity_percent(settings: Option<&PersistedAutoClickerSettings>) -> f64 {
    normalize_window_opacity_percent(settings.and_then(|saved_settings| saved_settings.window_opacity))
}

fn load_saved_window_opacity_percent(app: &tauri::AppHandle) -> f64 {
    match load_auto_clicker_settings(app.clone()) {
        Ok(settings) => resolve_window_opacity_percent(settings.as_ref()),
        Err(error) => {
            log::warn!("unable to load saved window opacity: {error}");
            DEFAULT_WINDOW_OPACITY_PERCENT
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowFrameRequest {
    animate: Option<bool>,
    width: f64,
    height: f64,
    min_width: Option<f64>,
    min_height: Option<f64>,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MainWindowAlwaysOnTopRequest {
    always_on_top: bool,
    opacity: f64,
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
    click_region: Option<OverlayRect>,
    edge_stop: EdgeStopOverlayRequest,
    editable: bool,
    positions: Vec<ClickPositionPointDto>,
    theme: OverlayVisualTheme,
    visible: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct EdgeStopOverlayRequest {
    enabled: bool,
    top_width: String,
    right_width: String,
    bottom_width: String,
    left_width: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct EdgeStopOverlayState {
    enabled: bool,
    zones: Vec<OverlayRect>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessPickerOverlayState {
    active: bool,
    cursor_x: i32,
    cursor_y: i32,
    label: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct OverlayVisualTheme {
    edge_stop_fill: String,
    edge_stop_line: String,
    process_picker_background: String,
    process_picker_border: String,
    process_picker_text: String,
}

impl Default for OverlayVisualTheme {
    fn default() -> Self {
        Self {
            edge_stop_fill: "#8ED8FF".to_string(),
            edge_stop_line: "#ECF7FF".to_string(),
            process_picker_background: "#1C2430".to_string(),
            process_picker_border: "#334155".to_string(),
            process_picker_text: "#E8EDF6".to_string(),
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClickPositionOverlayState {
    click_region: Option<OverlayRect>,
    edge_stop: EdgeStopOverlayState,
    editable: bool,
    height: i32,
    origin_x: i32,
    origin_y: i32,
    positions: Vec<ClickPositionPointDto>,
    process_picker: ProcessPickerOverlayState,
    theme: OverlayVisualTheme,
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

fn destroy_click_position_overlay_window(app: &tauri::AppHandle) {
    if let Some(overlay_window) = app.get_webview_window(CLICK_POSITION_OVERLAY_WINDOW_LABEL) {
        let _ = overlay_window.destroy();
    }
}

fn main_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Main window is not available.".to_string())
}

fn update_close_to_tray_enabled(state: &AppState, enabled: bool) -> Result<(), String> {
    let mut close_to_tray_enabled = state
        .close_to_tray_enabled
        .lock()
        .map_err(|_| "Failed to lock close-to-tray state".to_string())?;
    *close_to_tray_enabled = enabled;
    Ok(())
}

fn is_close_to_tray_enabled(state: &AppState) -> bool {
    state
        .close_to_tray_enabled
        .lock()
        .map(|enabled| *enabled)
        .unwrap_or(false)
}

fn set_main_window_hidden_to_tray(state: &AppState, hidden: bool) -> Result<(), String> {
    let mut main_window_hidden_to_tray = state
        .main_window_hidden_to_tray
        .lock()
        .map_err(|_| "Failed to lock tray visibility state".to_string())?;
    *main_window_hidden_to_tray = hidden;
    Ok(())
}

fn is_main_window_hidden_to_tray(state: &AppState) -> bool {
    state
        .main_window_hidden_to_tray
        .lock()
        .map(|hidden| *hidden)
        .unwrap_or(false)
}

fn update_click_position_overlay_interactive_state(
    state: &AppState,
    interactive: bool,
) -> Result<(), String> {
    let mut click_position_overlay_interactive = state
        .click_position_overlay_interactive
        .lock()
        .map_err(|_| "Failed to lock click position overlay interactivity state".to_string())?;
    *click_position_overlay_interactive = interactive;
    Ok(())
}

fn is_click_position_overlay_interactive(state: &AppState) -> bool {
    state
        .click_position_overlay_interactive
        .lock()
        .map(|interactive| *interactive)
        .unwrap_or(false)
}

fn sync_main_tray_icon_visibility(app: &tauri::AppHandle, state: &AppState) -> Result<(), String> {
    let hidden_to_tray = is_main_window_hidden_to_tray(state);
    let Some(tray_icon) = app.tray_by_id(MAIN_TRAY_ICON_ID) else {
        return if hidden_to_tray {
            Err("System tray is not available.".to_string())
        } else {
            Ok(())
        };
    };

    tray_icon
        .set_visible(hidden_to_tray)
        .map_err(|error| format!("Unable to update tray icon visibility: {error}"))
}

fn hide_main_window_to_tray_inner(app: &tauri::AppHandle, state: &AppState) -> Result<(), String> {
    if is_main_window_hidden_to_tray(state) {
        return Ok(());
    }

    set_main_window_hidden_to_tray(state, true)?;

    let result = (|| {
        sync_main_tray_icon_visibility(app, state)?;

        let window = main_window(app)?;
        window
            .hide()
            .map_err(|error| format!("Unable to hide main window: {error}"))?;

        if matches!(window.is_minimized(), Ok(true)) {
            let _ = window.unminimize();
        }

        Ok(())
    })();

    if result.is_err() {
        let _ = set_main_window_hidden_to_tray(state, false);
        let _ = sync_main_tray_icon_visibility(app, state);
    }

    result
}

fn restore_main_window_from_tray_inner(
    app: &tauri::AppHandle,
    state: &AppState,
) -> Result<(), String> {
    let window = main_window(app)?;

    if matches!(window.is_minimized(), Ok(true)) {
        let _ = window.unminimize();
    }

    window
        .show()
        .map_err(|error| format!("Unable to show main window: {error}"))?;

    set_main_window_hidden_to_tray(state, false)?;
    sync_main_tray_icon_visibility(app, state)?;

    window
        .set_focus()
        .map_err(|error| format!("Unable to focus main window: {error}"))?;

    Ok(())
}

fn setup_main_tray_icon(app: &tauri::AppHandle) -> Result<(), String> {
    if app.tray_by_id(MAIN_TRAY_ICON_ID).is_some() {
        return Ok(());
    }

    let tray_menu = MenuBuilder::new(app)
        .text(MAIN_TRAY_OPEN_ID, "Open Crystalline Auto Clicker")
        .separator()
        .text(MAIN_TRAY_QUIT_ID, "Quit")
        .build()
        .map_err(|error| format!("Unable to build tray menu: {error}"))?;

    let mut tray_builder = TrayIconBuilder::with_id(MAIN_TRAY_ICON_ID)
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .tooltip("Crystalline Auto Clicker")
        .on_menu_event(|app, event| match event.id() {
            id if id == MAIN_TRAY_OPEN_ID => {
                if let Err(error) = restore_main_window_from_tray_inner(app, app.state::<AppState>().inner()) {
                    log::error!("unable to restore main window from tray: {error}");
                }
            }
            id if id == MAIN_TRAY_QUIT_ID => {
                destroy_click_position_overlay_window(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => {
                let app = tray.app_handle();
                if let Err(error) =
                    restore_main_window_from_tray_inner(app, app.state::<AppState>().inner())
                {
                    log::error!("unable to restore main window from tray: {error}");
                }
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    let tray_icon = tray_builder
        .build(app)
        .map_err(|error| format!("Unable to create tray icon: {error}"))?;

    tray_icon
        .set_visible(false)
        .map_err(|error| format!("Unable to hide tray icon: {error}"))?;

    Ok(())
}

fn initialize_close_to_tray_state(
    app: &tauri::AppHandle,
    state: &AppState,
    settings: Option<&PersistedAutoClickerSettings>,
) {
    let close_to_tray_enabled = settings
        .and_then(|saved_settings| saved_settings.close_to_tray)
        .unwrap_or(false);

    if let Err(error) = update_close_to_tray_enabled(state, close_to_tray_enabled) {
        log::warn!("unable to initialize close-to-tray state: {error}");
    }

    if let Err(error) = sync_main_tray_icon_visibility(app, state) {
        log::warn!("unable to initialize tray visibility: {error}");
    }
}

#[cfg(target_os = "windows")]
fn apply_window_opacity(hwnd: HWND, opacity_percent: f64) -> Result<(), String> {
    let current_ex_style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) };
    let layered_ex_style = current_ex_style | WS_EX_LAYERED as isize;

    if layered_ex_style != current_ex_style {
        unsafe {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, layered_ex_style);
        }
    }

    let alpha = ((opacity_percent / 100.0) * 255.0).round() as u8;
    if unsafe { SetLayeredWindowAttributes(hwnd, 0, alpha, LWA_ALPHA) } == 0 {
        return Err("Unable to apply main window opacity.".to_string());
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn set_main_window_opacity_inner(window: &WebviewWindow, opacity_percent: f64) -> Result<(), String> {
    let normalized_opacity = normalize_window_opacity_percent(Some(opacity_percent));
    let hwnd = window
        .hwnd()
        .map_err(|error| format!("Unable to access main window handle: {error}"))?;

    apply_window_opacity(hwnd.0 as HWND, normalized_opacity)
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

    configure_click_position_overlay_window(&window, &ClickPositionOverlayState::default(), false)?;

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
    interactive: bool,
) -> Result<(), String> {
    sync_click_position_overlay_window_bounds(window)?;
    window
        .set_resizable(false)
        .map_err(|error| format!("Unable to disable click position overlay resizing: {error}"))?;
    window
        .set_focusable(false)
        .map_err(|error| format!("Unable to disable click position overlay focus: {error}"))?;

    let accepts_cursor_events = overlay_state.editable || interactive;
    window
        .set_ignore_cursor_events(!accepts_cursor_events)
        .map_err(|error| format!("Unable to configure click position overlay: {error}"))?;

    Ok(())
}

fn click_position_overlay_state(
    overlay: ClickPositionOverlayRequest,
    process_picker: ProcessPickerOverlayState,
) -> ClickPositionOverlayState {
    #[cfg(target_os = "windows")]
    let (origin_x, origin_y, width, height) = {
        let bounds = virtual_screen_bounds();
        (bounds.x, bounds.y, bounds.width, bounds.height)
    };

    #[cfg(not(target_os = "windows"))]
    let (origin_x, origin_y, width, height) = (0, 0, 0, 0);

    ClickPositionOverlayState {
        click_region: overlay.click_region,
        edge_stop: edge_stop_overlay_state(&overlay.edge_stop),
        editable: overlay.editable,
        height,
        origin_x,
        origin_y,
        positions: overlay.positions,
        process_picker,
        theme: overlay.theme,
        visible: overlay.visible,
        width,
    }
}

fn parse_edge_stop_overlay_width(value: &str) -> i32 {
    value.trim().parse::<i32>().unwrap_or(0).max(0)
}

fn edge_stop_widths_from_overlay(request: &EdgeStopOverlayRequest) -> EdgeStopWidths {
    if !request.enabled {
        return EdgeStopWidths::default();
    }

    EdgeStopWidths {
        top: parse_edge_stop_overlay_width(&request.top_width),
        right: parse_edge_stop_overlay_width(&request.right_width),
        bottom: parse_edge_stop_overlay_width(&request.bottom_width),
        left: parse_edge_stop_overlay_width(&request.left_width),
    }
}

fn edge_stop_overlay_state(request: &EdgeStopOverlayRequest) -> EdgeStopOverlayState {
    #[cfg(target_os = "windows")]
    {
        let runtime = edge_stop_runtime(edge_stop_widths_from_overlay(request));

        return EdgeStopOverlayState {
            enabled: request.enabled && !runtime.zones.is_empty(),
            zones: runtime.zones,
        };
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = request;
        EdgeStopOverlayState::default()
    }
}

fn stored_click_position_overlay_state(state: &AppState) -> Result<ClickPositionOverlayState, String> {
    state
        .click_position_overlay
        .lock()
        .map(|overlay| overlay.clone())
        .map_err(|_| "Failed to lock click position overlay state".to_string())
}

fn overlay_should_be_visible(overlay_state: &ClickPositionOverlayState) -> bool {
    overlay_state.visible || overlay_state.process_picker.active
}

#[cfg(target_os = "windows")]
fn apply_click_position_overlay_state(
    app: &tauri::AppHandle,
    state: &AppState,
    overlay_state: &ClickPositionOverlayState,
) -> Result<(), String> {
    if !overlay_should_be_visible(overlay_state) {
        let _ = update_click_position_overlay_interactive_state(state, false);

        if let Some(window) = app.get_webview_window(CLICK_POSITION_OVERLAY_WINDOW_LABEL) {
            let overlay_loaded = state
                .click_position_overlay_loaded
                .lock()
                .map(|loaded| *loaded)
                .unwrap_or(false);

            let _ = configure_click_position_overlay_window(&window, overlay_state, false);
            if overlay_loaded {
                let _ = window.emit(CLICK_POSITION_OVERLAY_EVENT, overlay_state);
            }
            let _ = window.hide();
        }

        return Ok(());
    }

    let (window, created) = ensure_click_position_overlay_window(app)?;
    let overlay_loaded = state
        .click_position_overlay_loaded
        .lock()
        .map(|loaded| *loaded)
        .unwrap_or(false);
    let interactive = is_click_position_overlay_interactive(state);

    configure_click_position_overlay_window(&window, overlay_state, interactive)?;

    if created || !overlay_loaded {
        return Ok(());
    }

    let _ = window.emit(CLICK_POSITION_OVERLAY_EVENT, overlay_state);
    window
        .show()
        .map_err(|error| format!("Unable to show click position overlay: {error}"))?;

    Ok(())
}

fn sync_click_position_overlay_state(
    app: &tauri::AppHandle,
    state: &AppState,
    overlay_state: ClickPositionOverlayState,
) -> Result<(), String> {
    {
        let mut current = state
            .click_position_overlay
            .lock()
            .map_err(|_| "Failed to lock click position overlay state".to_string())?;
        *current = overlay_state.clone();
    }

    #[cfg(target_os = "windows")]
    {
        apply_click_position_overlay_state(app, state, &overlay_state)?;
    }

    Ok(())
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
fn get_foreground_process_name() -> Result<Option<String>, String> {
    resolve_foreground_process_name()
}

#[tauri::command]
fn list_open_app_processes() -> Result<Vec<OpenAppProcess>, String> {
    resolve_open_app_processes()
}

#[tauri::command]
fn list_running_process_names() -> Result<Vec<String>, String> {
    resolve_running_process_names()
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn pick_process_name_from_click(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, String> {
    let window = main_window(&app)?;
    window
        .hide()
        .map_err(|error| format!("Unable to hide main window for process picking: {error}"))?;

    thread::sleep(Duration::from_millis(120));

    let mut overlay_state = stored_click_position_overlay_state(state.inner())?;
    overlay_state.process_picker.active = true;
    overlay_state.process_picker.label = None;

    let mut cursor = POINT { x: 0, y: 0 };
    if unsafe { GetCursorPos(&mut cursor) } != 0 {
        overlay_state.process_picker.cursor_x = cursor.x;
        overlay_state.process_picker.cursor_y = cursor.y;
    }

    let selection = (|| {
        sync_click_position_overlay_state(&app, state.inner(), overlay_state.clone())?;

        resolve_pick_process_name_from_click(|cursor, label| {
            let next_label = label
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned);

            if overlay_state.process_picker.cursor_x == cursor.x
                && overlay_state.process_picker.cursor_y == cursor.y
                && overlay_state.process_picker.label.as_deref() == next_label.as_deref()
            {
                return Ok(());
            }

            overlay_state.process_picker.active = true;
            overlay_state.process_picker.cursor_x = cursor.x;
            overlay_state.process_picker.cursor_y = cursor.y;
            overlay_state.process_picker.label = next_label;

            sync_click_position_overlay_state(&app, state.inner(), overlay_state.clone())
        })
    })();

    overlay_state.process_picker = ProcessPickerOverlayState::default();
    if let Err(error) = sync_click_position_overlay_state(&app, state.inner(), overlay_state) {
        log::warn!("unable to clear process picker overlay: {error}");
    }

    let restore_result = window
        .show()
        .map_err(|error| format!("Unable to restore main window after process picking: {error}"));
    if let Err(error) = window.set_focus() {
        log::warn!("unable to focus main window after process picking: {error}");
    }

    match (selection, restore_result) {
        (Ok(value), Ok(())) => Ok(value),
        (Err(error), _) => Err(error),
        (Ok(_), Err(error)) => Err(error),
    }
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn pick_process_name_from_click() -> Result<Option<String>, String> {
    Ok(None)
}

#[tauri::command]
fn save_auto_clicker_settings(
    app: tauri::AppHandle,
    settings: PersistedAutoClickerSettings,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let path = settings_file_path(&app)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Unable to create settings folder: {error}"))?;
    }

    let contents = serde_json::to_string_pretty(&settings)
        .map_err(|error| format!("Unable to serialize settings: {error}"))?;

    fs::write(&path, contents).map_err(|error| format!("Unable to write settings: {error}"))?;

    update_close_to_tray_enabled(state.inner(), settings.close_to_tray.unwrap_or(false))?;
    sync_main_tray_icon_visibility(&app, state.inner())?;

    Ok(())
}

#[tauri::command]
fn get_click_position_overlay_state(
    state: tauri::State<'_, AppState>,
) -> Result<ClickPositionOverlayState, String> {
    stored_click_position_overlay_state(state.inner())
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
    let process_picker = stored_click_position_overlay_state(state.inner())?.process_picker;
    let overlay_state = click_position_overlay_state(overlay, process_picker);

    sync_click_position_overlay_state(&app, state.inner(), overlay_state)
}

#[tauri::command]
fn notify_webview_ready(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    if window.label() == "main" {
        #[cfg(target_os = "windows")]
        {
            if let Err(error) =
                set_main_window_opacity_inner(&window, load_saved_window_opacity_percent(&window.app_handle()))
            {
                log::warn!("unable to apply main window opacity when webview became ready: {error}");
            }
        }

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
            let interactive = is_click_position_overlay_interactive(state.inner());

            configure_click_position_overlay_window(&window, &overlay_state, interactive)?;
            let _ = window.emit(CLICK_POSITION_OVERLAY_EVENT, &overlay_state);

            if overlay_should_be_visible(&overlay_state) {
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
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    update_click_position_overlay_interactive_state(state.inner(), interactive)?;

    let Some(window) = app.get_webview_window(CLICK_POSITION_OVERLAY_WINDOW_LABEL) else {
        return Ok(());
    };

    let overlay_state = stored_click_position_overlay_state(state.inner())?;
    configure_click_position_overlay_window(&window, &overlay_state, interactive)
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
        animate,
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
    let should_animate = animate.unwrap_or(true);
    let needs_animation = should_animate
        && ((start_size.width - target_size.width).abs() >= 1.0
            || (start_size.height - target_size.height).abs() >= 1.0);
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
#[tauri::command]
fn set_main_window_opacity(app: tauri::AppHandle, opacity: f64) -> Result<(), String> {
    let window = main_window(&app)?;
    set_main_window_opacity_inner(&window, opacity)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn set_main_window_opacity(_app: tauri::AppHandle, _opacity: f64) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn set_main_window_always_on_top(
    app: tauri::AppHandle,
    request: MainWindowAlwaysOnTopRequest,
) -> Result<(), String> {
    let window = main_window(&app)?;
    window
        .set_always_on_top(request.always_on_top)
        .map_err(|error| format!("Unable to update always-on-top state: {error}"))?;

    #[cfg(target_os = "windows")]
    {
        // Windows can drop layered alpha when the topmost state changes.
        set_main_window_opacity_inner(&window, request.opacity)?;
    }

    Ok(())
}

#[tauri::command]
fn hide_main_window_to_tray(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    hide_main_window_to_tray_inner(&app, state.inner())
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
            click_position_overlay_interactive: Mutex::new(false),
            click_position_overlay_loaded: Mutex::new(false),
            close_to_tray_enabled: Mutex::new(false),
            main_window_hidden_to_tray: Mutex::new(false),
        })
        .setup(|app| {
            let startup_settings = match load_auto_clicker_settings(app.handle().clone()) {
                Ok(settings) => settings,
                Err(error) => {
                    log::warn!("unable to load saved settings during startup: {error}");
                    None
                }
            };

            if let Err(error) = setup_main_tray_icon(&app.handle()) {
                log::warn!("unable to initialize tray icon: {error}");
            }

            initialize_close_to_tray_state(
                &app.handle(),
                app.state::<AppState>().inner(),
                startup_settings.as_ref(),
            );

            #[cfg(target_os = "windows")]
            {
                if let Some(main_window) = app.get_webview_window("main") {
                    if let Ok(hwnd) = main_window.hwnd() {
                        install_main_window_proc(hwnd.0 as isize);
                        app.state::<AppState>()
                            .auto_clicker
                            .set_main_window_handle(hwnd.0 as isize);
                    }

                    if let Err(error) = set_main_window_opacity_inner(
                        &main_window,
                        resolve_window_opacity_percent(startup_settings.as_ref()),
                    ) {
                        log::warn!("unable to initialize main window opacity: {error}");
                    }
                }

                if let Some(overlay_window) =
                    app.get_webview_window(CLICK_POSITION_OVERLAY_WINDOW_LABEL)
                {
                    let _ = configure_click_position_overlay_window(
                        &overlay_window,
                        &ClickPositionOverlayState::default(),
                        false,
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
            get_foreground_process_name,
            list_open_app_processes,
            get_click_position_overlay_state,
            get_current_cursor_position,
            list_running_process_names,
            pick_process_name_from_click,
            sync_click_position_overlay,
            notify_webview_ready,
            set_click_position_overlay_interactive,
            read_pressed_keyboard_hotkey,
            read_global_hotkey_state,
            sync_main_window_frame,
            set_main_window_opacity,
            set_main_window_always_on_top,
            hide_main_window_to_tray
        ])
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }

            match event {
                WindowEvent::Resized(_) => {
                    let app = window.app_handle();
                    let state = app.state::<AppState>();

                    if !is_close_to_tray_enabled(state.inner())
                        || is_main_window_hidden_to_tray(state.inner())
                    {
                        return;
                    }

                    match window.is_minimized() {
                        Ok(true) => {
                            if let Err(error) = hide_main_window_to_tray_inner(&app, state.inner()) {
                                log::error!("unable to send main window to tray: {error}");
                            }
                        }
                        Ok(false) => {}
                        Err(error) => {
                            log::warn!("unable to read minimized state: {error}");
                        }
                    }
                }
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    destroy_click_position_overlay_window(&window.app_handle());
                    window.app_handle().exit(0);
                }
                WindowEvent::Destroyed => {
                    destroy_click_position_overlay_window(&window.app_handle());
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

                if let Ok(window) = main_window(&webview.app_handle()) {
                    if let Err(error) = set_main_window_opacity_inner(
                        &window,
                        load_saved_window_opacity_percent(&webview.app_handle()),
                    ) {
                        log::warn!("unable to reapply main window opacity after page load: {error}");
                    }
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
                            false,
                        );
                        let _ = window.hide();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
