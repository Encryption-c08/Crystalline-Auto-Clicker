use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[cfg(target_os = "windows")]
use std::{
    sync::{
        atomic::{AtomicBool, AtomicIsize, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

use tauri::{webview::PageLoadEvent, Manager};
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_opener::OpenerExt;

#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN,
    MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP, SendInput, INPUT,
    INPUT_0, INPUT_MOUSE, MOUSEINPUT, VK_ADD, VK_BACK, VK_CONTROL, VK_DECIMAL, VK_DELETE,
    VK_DIVIDE, VK_DOWN, VK_END, VK_ESCAPE, VK_F1, VK_HOME, VK_INSERT, VK_LBUTTON, VK_LEFT,
    VK_MBUTTON, VK_MENU, VK_MULTIPLY, VK_NEXT, VK_NUMPAD0, VK_PRIOR, VK_RBUTTON, VK_RETURN,
    VK_RIGHT, VK_SHIFT, VK_SPACE, VK_SUBTRACT, VK_TAB, VK_UP, VK_XBUTTON1, VK_XBUTTON2,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::{
    Media::{timeBeginPeriod, timeEndPeriod, TIMERR_NOERROR},
    System::Threading::{
        GetCurrentProcessId, GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_HIGHEST,
    },
    UI::WindowsAndMessaging::{
        GetAncestor, GetForegroundWindow, GetWindowThreadProcessId, IsChild, GA_ROOT,
        GA_ROOTOWNER,
    },
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum ClickMode {
    Toggle,
    Hold,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum ClickEngine {
    Classic,
    Throughput,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum ClickRateUnit {
    S,
    M,
    H,
    D,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum MouseButton {
    Left,
    Middle,
    Right,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AutoClickerCommandConfig {
    click_mode: ClickMode,
    click_rate: String,
    click_rate_unit: ClickRateUnit,
    hotkey_code: String,
    hotkey_label: String,
    interval_ms: u64,
    mouse_button: MouseButton,
    click_engine: ClickEngine,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AutoClickerStatus {
    click_mode: ClickMode,
    clicker_active: bool,
    hotkey_label: String,
    hotkey_pressed: bool,
    interval_ms: u64,
    last_error: Option<String>,
    worker_running: bool,
}

#[cfg(target_os = "windows")]
#[derive(Clone, Copy)]
struct ClickCadence {
    base_interval_nanos: u64,
    interval_divisor: u64,
    remainder_nanos: u64,
}

#[cfg(target_os = "windows")]
const MIN_CLICK_RATE: u64 = 1;
#[cfg(target_os = "windows")]
const MAX_CLICK_RATE: u64 = 5_000;

impl Default for AutoClickerCommandConfig {
    fn default() -> Self {
        Self {
            click_mode: ClickMode::Hold,
            click_rate: "25".into(),
            click_rate_unit: ClickRateUnit::S,
            hotkey_code: String::new(),
            hotkey_label: "Unbound".into(),
            interval_ms: 40,
            mouse_button: MouseButton::Left,
            click_engine: ClickEngine::Classic,
        }
    }
}

impl AutoClickerStatus {
    fn from_config(config: &AutoClickerCommandConfig) -> Self {
        Self {
            click_mode: config.click_mode,
            clicker_active: false,
            hotkey_label: config.hotkey_label.clone(),
            hotkey_pressed: false,
            interval_ms: config.interval_ms.max(1),
            last_error: None,
            worker_running: true,
        }
    }
}

struct AppState {
    auto_clicker: AutoClickerController,
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

#[cfg(target_os = "windows")]
struct AutoClickerController {
    shared: Arc<AutoClickerShared>,
}

#[cfg(target_os = "windows")]
struct AutoClickerShared {
    config: Mutex<AutoClickerCommandConfig>,
    main_window_hwnd: AtomicIsize,
    shutdown: AtomicBool,
    status: Mutex<AutoClickerStatus>,
}

#[cfg(target_os = "windows")]
impl AutoClickerController {
    fn new() -> Self {
        let config = AutoClickerCommandConfig::default();
        let shared = Arc::new(AutoClickerShared {
            config: Mutex::new(config.clone()),
            main_window_hwnd: AtomicIsize::new(0),
            shutdown: AtomicBool::new(false),
            status: Mutex::new(AutoClickerStatus::from_config(&config)),
        });

        spawn_auto_clicker_worker(Arc::clone(&shared));

        Self { shared }
    }

    fn configure(&self, config: AutoClickerCommandConfig) -> Result<AutoClickerStatus, String> {
        validate_auto_clicker_config(&config)?;

        {
            let mut current = self
                .shared
                .config
                .lock()
                .map_err(|_| "Failed to lock clicker config".to_string())?;
            *current = config.clone();
        }

        let mut status = self
            .shared
            .status
            .lock()
            .map_err(|_| "Failed to lock clicker status".to_string())?;
        status.click_mode = config.click_mode;
        status.hotkey_label = config.hotkey_label;
        status.interval_ms = config.interval_ms.max(1);
        status.last_error = None;

        Ok(status.clone())
    }

    fn set_main_window_handle(&self, hwnd: isize) {
        self.shared.main_window_hwnd.store(hwnd, Ordering::Relaxed);
    }

    fn status(&self) -> AutoClickerStatus {
        self.shared
            .status
            .lock()
            .map(|status| status.clone())
            .unwrap_or_else(|_| AutoClickerStatus {
                click_mode: ClickMode::Hold,
                clicker_active: false,
                hotkey_label: "Unavailable".into(),
                hotkey_pressed: false,
                interval_ms: 1,
                last_error: Some("Failed to read clicker status".into()),
                worker_running: false,
            })
    }
}

#[cfg(target_os = "windows")]
impl Drop for AutoClickerController {
    fn drop(&mut self) {
        self.shared.shutdown.store(true, Ordering::Relaxed);
    }
}

#[cfg(not(target_os = "windows"))]
struct AutoClickerController {
    status: Mutex<AutoClickerStatus>,
}

#[cfg(not(target_os = "windows"))]
impl AutoClickerController {
    fn new() -> Self {
        let config = AutoClickerCommandConfig::default();
        Self {
            status: Mutex::new(AutoClickerStatus::from_config(&config)),
        }
    }

    fn configure(&self, _config: AutoClickerCommandConfig) -> Result<AutoClickerStatus, String> {
        Err("The auto clicker backend is only implemented on Windows.".into())
    }

    fn set_main_window_handle(&self, _hwnd: isize) {}

    fn status(&self) -> AutoClickerStatus {
        self.status
            .lock()
            .map(|status| status.clone())
            .unwrap_or_else(|_| AutoClickerStatus {
                click_mode: ClickMode::Hold,
                clicker_active: false,
                hotkey_label: "Unavailable".into(),
                hotkey_pressed: false,
                interval_ms: 1,
                last_error: Some("Failed to read clicker status".into()),
                worker_running: false,
            })
    }
}

#[cfg(target_os = "windows")]
fn spawn_auto_clicker_worker(shared: Arc<AutoClickerShared>) {
    thread::spawn(move || {
        const MAX_CATCH_UP_CLICKS_PER_LOOP: usize = 32;

        let timer_resolution_enabled = unsafe { timeBeginPeriod(1) == TIMERR_NOERROR };
        unsafe {
            let _ = SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_HIGHEST);
        }
        let mut clicker_enabled = false;
        let mut hotkey_was_pressed = false;
        let mut cadence_carry_nanos = 0_u64;
        let mut last_schedule_config: Option<AutoClickerCommandConfig> = None;
        let mut next_click_at: Option<Instant> = None;

        loop {
            if shared.shutdown.load(Ordering::Relaxed) {
                break;
            }

            let config = match shared.config.lock() {
                Ok(config) => config.clone(),
                Err(_) => {
                    thread::sleep(Duration::from_millis(8));
                    continue;
                }
            };

            if last_schedule_config.as_ref() != Some(&config) {
                cadence_carry_nanos = 0;
                last_schedule_config = Some(config.clone());
                next_click_at = None;
            }

            let cadence_result = click_cadence_from_config(&config);
            let cadence = cadence_result.as_ref().ok().copied();
            let hotkey_result = read_hotkey_state(&config.hotkey_code);
            let hotkey_pressed = hotkey_result
                .as_ref()
                .map(|pressed| *pressed)
                .unwrap_or(false);

            if hotkey_result.is_err() || cadence.is_none() {
                clicker_enabled = false;
                hotkey_was_pressed = false;
                cadence_carry_nanos = 0;
                next_click_at = None;
            } else {
                match config.click_mode {
                    ClickMode::Hold => {
                        clicker_enabled = hotkey_pressed;
                        if !clicker_enabled {
                            cadence_carry_nanos = 0;
                            next_click_at = None;
                        }
                    }
                    ClickMode::Toggle => {
                        if hotkey_pressed && !hotkey_was_pressed {
                            clicker_enabled = !clicker_enabled;
                            cadence_carry_nanos = 0;
                            next_click_at = None;
                        }
                    }
                }

                hotkey_was_pressed = hotkey_pressed;
            }

            let app_window_active_result = is_app_window_active(&shared);
            let paused_for_app_window = app_window_active_result
                .as_ref()
                .map(|active| *active)
                .unwrap_or(false);

            let click_result = if clicker_enabled && !paused_for_app_window {
                if let Some(cadence) = cadence {
                    if next_click_at.is_none() {
                        next_click_at =
                            Some(Instant::now() + next_cadence_interval(cadence, &mut cadence_carry_nanos));
                        None
                    } else {
                        let scheduled_at = next_click_at.expect("checked is_some above");
                        let now = Instant::now();

                        if now < scheduled_at && matches!(config.click_engine, ClickEngine::Classic)
                        {
                            wait_until_precise(scheduled_at);
                        }

                        let now_after_wait = Instant::now();
                        if now_after_wait >= scheduled_at {
                            let mut due_clicks = 0_usize;
                            let mut next_scheduled_at = scheduled_at;

                            while next_scheduled_at <= now_after_wait
                                && due_clicks < MAX_CATCH_UP_CLICKS_PER_LOOP
                            {
                                due_clicks += 1;
                                next_scheduled_at +=
                                    next_cadence_interval(cadence, &mut cadence_carry_nanos);
                            }

                            let result =
                                dispatch_mouse_clicks(config.mouse_button, due_clicks);
                            if result.is_ok() {
                                next_click_at = Some(next_scheduled_at);
                            } else {
                                clicker_enabled = false;
                                cadence_carry_nanos = 0;
                                next_click_at = None;
                            }

                            result.err()
                        } else {
                            None
                        }
                    }
                } else {
                    clicker_enabled = false;
                    cadence_carry_nanos = 0;
                    next_click_at = None;
                    None
                }
            } else {
                cadence_carry_nanos = 0;
                next_click_at = None;
                None
            };

            if let Ok(mut status) = shared.status.lock() {
                status.worker_running = true;
                status.click_mode = config.click_mode;
                status.hotkey_label = config.hotkey_label.clone();
                status.hotkey_pressed = hotkey_pressed;
                status.clicker_active = clicker_enabled && !paused_for_app_window;
                status.interval_ms = config.interval_ms.max(1);
                status.last_error = hotkey_result
                    .err()
                    .or_else(|| cadence_result.err())
                    .or_else(|| app_window_active_result.err())
                    .or(click_result);
            }

            let sleep_for = if clicker_enabled && !paused_for_app_window {
                next_click_at
                    .map(|next_click_at| match config.click_engine {
                        ClickEngine::Classic => next_worker_sleep(next_click_at),
                        ClickEngine::Throughput => next_throughput_worker_sleep(next_click_at),
                    })
                    .unwrap_or_else(|| Duration::from_micros(250))
            } else {
                Duration::from_millis(4)
            };

            if !sleep_for.is_zero() {
                thread::sleep(sleep_for);
            } else if clicker_enabled
                && !paused_for_app_window
                && matches!(config.click_engine, ClickEngine::Classic)
            {
                thread::yield_now();
            }
        }

        if timer_resolution_enabled {
            unsafe {
                timeEndPeriod(1);
            }
        }
    });
}

#[cfg(target_os = "windows")]
fn validate_auto_clicker_config(config: &AutoClickerCommandConfig) -> Result<(), String> {
    if config.click_rate.trim().is_empty() {
        return Err("Click rate cannot be empty.".into());
    }

    if !config.hotkey_code.trim().is_empty() {
        let mut hotkey_parts = hotkey_code_parts(&config.hotkey_code).peekable();
        let mut has_trigger_part = false;

        if hotkey_parts.peek().is_none() {
            return Err(format!("Unsupported hotkey: {}", config.hotkey_label));
        }

        for part in hotkey_parts {
            if hotkey_part_to_vk(part).is_none() {
                return Err(format!("Unsupported hotkey: {}", config.hotkey_label));
            }

            if !is_modifier_hotkey_part(part) {
                has_trigger_part = true;
            }
        }

        if !has_trigger_part {
            return Err(format!("Unsupported hotkey: {}", config.hotkey_label));
        }
    }

    click_cadence_from_config(config)?;

    Ok(())
}

#[cfg(target_os = "windows")]
fn click_window_nanos(click_rate_unit: ClickRateUnit) -> u64 {
    match click_rate_unit {
        ClickRateUnit::S => 1_000_000_000,
        ClickRateUnit::M => 60 * 1_000_000_000,
        ClickRateUnit::H => 60 * 60 * 1_000_000_000,
        ClickRateUnit::D => 24 * 60 * 60 * 1_000_000_000,
    }
}

#[cfg(target_os = "windows")]
fn click_cadence_from_config(config: &AutoClickerCommandConfig) -> Result<ClickCadence, String> {
    let clicks_per_window = config
        .click_rate
        .trim()
        .parse::<u64>()
        .map_err(|_| "Click rate must be a whole number.".to_string())?;

    if !(MIN_CLICK_RATE..=MAX_CLICK_RATE).contains(&clicks_per_window) {
        return Err(format!(
            "Click rate must be between {MIN_CLICK_RATE} and {MAX_CLICK_RATE}."
        ));
    }

    let total_window_nanos = click_window_nanos(config.click_rate_unit);
    let base_interval_nanos = total_window_nanos / clicks_per_window;

    if base_interval_nanos == 0 {
        return Err("The click rate is too fast for the current timer precision.".into());
    }

    Ok(ClickCadence {
        base_interval_nanos,
        interval_divisor: clicks_per_window,
        remainder_nanos: total_window_nanos % clicks_per_window,
    })
}

#[cfg(target_os = "windows")]
fn next_cadence_interval(cadence: ClickCadence, carry_nanos: &mut u64) -> Duration {
    let mut interval_nanos = cadence.base_interval_nanos;
    *carry_nanos += cadence.remainder_nanos;

    if *carry_nanos >= cadence.interval_divisor {
        interval_nanos += 1;
        *carry_nanos -= cadence.interval_divisor;
    }

    Duration::from_nanos(interval_nanos.max(1))
}

#[cfg(target_os = "windows")]
fn next_worker_sleep(next_click_at: Instant) -> Duration {
    const ACTIVE_MAX_SLEEP: Duration = Duration::from_millis(4);
    const NO_SLEEP_MARGIN: Duration = Duration::from_millis(2);
    const SLEEP_BUFFER: Duration = Duration::from_millis(1);

    let remaining = next_click_at.saturating_duration_since(Instant::now());

    if remaining <= NO_SLEEP_MARGIN {
        Duration::ZERO
    } else {
        (remaining - SLEEP_BUFFER).min(ACTIVE_MAX_SLEEP)
    }
}

#[cfg(target_os = "windows")]
fn next_throughput_worker_sleep(next_click_at: Instant) -> Duration {
    const ACTIVE_MAX_SLEEP: Duration = Duration::from_millis(4);
    const MIN_BATCH_SLEEP: Duration = Duration::from_millis(1);
    const SLEEP_BUFFER: Duration = Duration::from_millis(1);

    let remaining = next_click_at.saturating_duration_since(Instant::now());

    if remaining <= MIN_BATCH_SLEEP {
        MIN_BATCH_SLEEP
    } else {
        (remaining - SLEEP_BUFFER).min(ACTIVE_MAX_SLEEP)
    }
}

#[cfg(target_os = "windows")]
fn wait_until_precise(deadline: Instant) {
    while Instant::now() < deadline {
        if deadline.saturating_duration_since(Instant::now()) > Duration::from_micros(250) {
            thread::yield_now();
        } else {
            std::hint::spin_loop();
        }
    }
}

#[cfg(target_os = "windows")]
fn read_hotkey_state(code: &str) -> Result<bool, String> {
    if code.trim().is_empty() {
        return Ok(false);
    }

    let mut hotkey_parts = hotkey_code_parts(code).peekable();
    if hotkey_parts.peek().is_none() {
        return Ok(false);
    }

    for part in hotkey_parts {
        let virtual_key =
            hotkey_part_to_vk(part).ok_or_else(|| format!("Unsupported hotkey code: {code}"))?;

        if unsafe { (GetAsyncKeyState(virtual_key) as u16 & 0x8000) == 0 } {
            return Ok(false);
        }
    }

    Ok(true)
}

#[cfg(target_os = "windows")]
fn dispatch_mouse_clicks(mouse_button: MouseButton, count: usize) -> Result<(), String> {
    if count == 0 {
        return Ok(());
    }

    const MAX_MOUSE_INPUTS_PER_BATCH: usize = 64;
    let (down, up) = match mouse_button {
        MouseButton::Left => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
        MouseButton::Middle => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
        MouseButton::Right => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
    };

    let click_count = count.min(MAX_MOUSE_INPUTS_PER_BATCH / 2);
    let mut inputs = [INPUT::default(); MAX_MOUSE_INPUTS_PER_BATCH];

    for click_index in 0..click_count {
        let input_offset = click_index * 2;
        inputs[input_offset] = build_mouse_input(down);
        inputs[input_offset + 1] = build_mouse_input(up);
    }

    let sent = unsafe {
        SendInput(
            (click_count * 2) as u32,
            inputs.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        )
    };

    if sent != (click_count * 2) as u32 {
        return Err(format!(
            "Windows only accepted {sent} of {} mouse inputs.",
            click_count * 2
        ));
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn build_mouse_input(flags: u32) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

#[cfg(target_os = "windows")]
fn is_app_window_active(shared: &AutoClickerShared) -> Result<bool, String> {
    let app_window_hwnd = shared.main_window_hwnd.load(Ordering::Relaxed);
    if app_window_hwnd == 0 {
        return Ok(false);
    }

    let foreground_window = unsafe { GetForegroundWindow() };
    if foreground_window.is_null() {
        return Ok(false);
    }

    let app_window = app_window_hwnd as _;
    if foreground_window == app_window {
        return Ok(true);
    }

    let root_window = unsafe { GetAncestor(foreground_window, GA_ROOT) };
    if !root_window.is_null() && root_window == app_window {
        return Ok(true);
    }

    let root_owner_window = unsafe { GetAncestor(foreground_window, GA_ROOTOWNER) };
    if !root_owner_window.is_null() && root_owner_window == app_window {
        return Ok(true);
    }

    if unsafe { IsChild(app_window, foreground_window) } != 0 {
        return Ok(true);
    }

    let mut foreground_process_id = 0;
    unsafe {
        GetWindowThreadProcessId(foreground_window, &mut foreground_process_id);
    }

    Ok(foreground_process_id != 0 && foreground_process_id == unsafe { GetCurrentProcessId() })
}

#[cfg(target_os = "windows")]
fn hotkey_code_parts(code: &str) -> impl Iterator<Item = &str> {
    code.split('+').map(str::trim).filter(|part| !part.is_empty())
}

#[cfg(target_os = "windows")]
fn is_modifier_hotkey_part(code: &str) -> bool {
    matches!(code, "Ctrl" | "Shift" | "Alt")
}

#[cfg(target_os = "windows")]
fn hotkey_part_to_vk(code: &str) -> Option<i32> {
    match code {
        "Ctrl" => Some(VK_CONTROL.into()),
        "Shift" => Some(VK_SHIFT.into()),
        "Alt" => Some(VK_MENU.into()),
        "Space" => Some(VK_SPACE.into()),
        "Tab" => Some(VK_TAB.into()),
        "Enter" | "NumpadEnter" => Some(VK_RETURN.into()),
        "Escape" => Some(VK_ESCAPE.into()),
        "Backspace" => Some(VK_BACK.into()),
        "Delete" => Some(VK_DELETE.into()),
        "Insert" => Some(VK_INSERT.into()),
        "Home" => Some(VK_HOME.into()),
        "End" => Some(VK_END.into()),
        "PageUp" => Some(VK_PRIOR.into()),
        "PageDown" => Some(VK_NEXT.into()),
        "ArrowUp" => Some(VK_UP.into()),
        "ArrowDown" => Some(VK_DOWN.into()),
        "ArrowLeft" => Some(VK_LEFT.into()),
        "ArrowRight" => Some(VK_RIGHT.into()),
        "NumpadAdd" => Some(VK_ADD.into()),
        "NumpadSubtract" => Some(VK_SUBTRACT.into()),
        "NumpadMultiply" => Some(VK_MULTIPLY.into()),
        "NumpadDivide" => Some(VK_DIVIDE.into()),
        "NumpadDecimal" => Some(VK_DECIMAL.into()),
        "Mouse1" => Some(VK_LBUTTON.into()),
        "Mouse2" => Some(VK_RBUTTON.into()),
        "Mouse3" => Some(VK_MBUTTON.into()),
        "Mouse4" => Some(VK_XBUTTON1.into()),
        "Mouse5" => Some(VK_XBUTTON2.into()),
        _ => {
            if let Some(letter) = code.strip_prefix("Key") {
                let bytes = letter.as_bytes();
                if bytes.len() == 1 && bytes[0].is_ascii_alphabetic() {
                    return Some(bytes[0].to_ascii_uppercase() as i32);
                }
            }

            if let Some(digit) = code.strip_prefix("Digit") {
                let bytes = digit.as_bytes();
                if bytes.len() == 1 && bytes[0].is_ascii_digit() {
                    return Some(bytes[0] as i32);
                }
            }

            if let Some(digit) = code.strip_prefix("Numpad") {
                let bytes = digit.as_bytes();
                if bytes.len() == 1 && bytes[0].is_ascii_digit() {
                    let value = (bytes[0] - b'0') as i32;
                    return Some(VK_NUMPAD0 as i32 + value);
                }
            }

            if let Some(function_key) = code.strip_prefix('F') {
                if let Ok(value) = function_key.parse::<u8>() {
                    if (1..=24).contains(&value) {
                        return Some(VK_F1 as i32 + i32::from(value - 1));
                    }
                }
            }

            None
        }
    }
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
            get_auto_clicker_status
        ])
        .on_page_load(|webview, payload| {
            if webview.label() == "main" && matches!(payload.event(), PageLoadEvent::Finished) {
                log::info!("main webview finished loading");
                #[cfg(target_os = "windows")]
                if let Ok(hwnd) = webview.window().hwnd() {
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
