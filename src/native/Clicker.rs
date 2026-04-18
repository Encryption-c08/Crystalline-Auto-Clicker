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

#[cfg(target_os = "windows")]
mod clicker_calc;
#[cfg(target_os = "windows")]
mod hotkeys;
#[cfg(target_os = "windows")]
pub(crate) use hotkeys::read_pressed_keyboard_hotkey;

#[cfg(target_os = "windows")]
use clicker_calc::{
    click_cadence_from_config, current_cursor_position, dispatch_mouse_clicks, next_cadence_interval,
    next_throughput_worker_sleep, next_worker_sleep, press_mouse_button, release_mouse_button,
    wait_until_precise, ClickDurationRange, ClickRandomizer, CursorJitterConfig,
};
#[cfg(target_os = "windows")]
pub(crate) use hotkeys::read_hotkey_state;
#[cfg(target_os = "windows")]
use crate::process_filters::{
    foreground_process_id, is_process_allowed, normalize_process_name_list, process_name_by_id,
};
#[cfg(target_os = "windows")]
use hotkeys::{format_hotkey_label, normalize_hotkey_code, validate_hotkey_code};

const DEFAULT_CLICK_LIMIT: &str = "100";
const MIN_CLICK_LIMIT: u64 = 1;
const MAX_CLICK_LIMIT: u64 = 1_000_000;
const DEFAULT_DOUBLE_CLICK_DELAY: &str = "0";
const MIN_DOUBLE_CLICK_DELAY: u64 = 0;
const DEFAULT_CLICK_DURATION_MAX: &str = "1";
const DEFAULT_CLICK_DURATION_MIN: &str = "1";
const MIN_CLICK_DURATION: u64 = 1;
const DEFAULT_JITTER_AXIS: &str = "0";
const MIN_JITTER_AXIS: i32 = -500;
const MAX_JITTER_AXIS: i32 = 500;
const DEFAULT_TIME_LIMIT: &str = "60";
const MIN_TIME_LIMIT: u64 = 1;
const MAX_TIME_LIMIT: u64 = 1_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClickMode {
    Toggle,
    Hold,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClickEngine {
    Classic,
    Throughput,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClickRateMode {
    Per,
    Every,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClickRateUnit {
    Ms,
    S,
    M,
    H,
    D,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MouseButton {
    Left,
    Middle,
    Right,
    Mouse4,
    Mouse5,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MouseAction {
    Click,
    Hold,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JitterMode {
    Random,
    Fixed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickPositionPoint {
    pub id: u32,
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoClickerCommandConfig {
    pub click_mode: ClickMode,
    pub click_rate: String,
    pub click_rate_mode: ClickRateMode,
    pub click_rate_unit: ClickRateUnit,
    pub process_whitelist: Vec<String>,
    pub process_blacklist: Vec<String>,
    pub hotkey_code: String,
    pub hotkey_label: String,
    pub interval_ms: u64,
    pub mouse_button: MouseButton,
    pub mouse_action: MouseAction,
    pub click_position_enabled: bool,
    pub click_positions: Vec<ClickPositionPoint>,
    pub jitter_enabled: bool,
    pub jitter_mode: JitterMode,
    pub jitter_x: String,
    pub jitter_y: String,
    pub double_click_enabled: bool,
    pub double_click_delay: String,
    pub click_duration_enabled: bool,
    pub click_duration_min: String,
    pub click_duration_max: String,
    pub click_limit_enabled: bool,
    pub click_limit: String,
    pub time_limit_enabled: bool,
    pub time_limit: String,
    pub time_limit_unit: ClickRateUnit,
    pub click_engine: ClickEngine,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoClickerStatus {
    pub click_mode: ClickMode,
    pub clicker_active: bool,
    pub hotkey_label: String,
    pub hotkey_pressed: bool,
    pub interval_ms: u64,
    pub last_error: Option<String>,
    pub worker_running: bool,
}

impl Default for AutoClickerCommandConfig {
    fn default() -> Self {
        Self {
            click_mode: ClickMode::Hold,
            click_rate: "25".into(),
            click_rate_mode: ClickRateMode::Per,
            click_rate_unit: ClickRateUnit::S,
            process_whitelist: Vec::new(),
            process_blacklist: Vec::new(),
            hotkey_code: String::new(),
            hotkey_label: "Unbound".into(),
            interval_ms: 40,
            mouse_button: MouseButton::Left,
            mouse_action: MouseAction::Click,
            click_position_enabled: false,
            click_positions: Vec::new(),
            jitter_enabled: false,
            jitter_mode: JitterMode::Random,
            jitter_x: DEFAULT_JITTER_AXIS.into(),
            jitter_y: DEFAULT_JITTER_AXIS.into(),
            double_click_enabled: false,
            double_click_delay: DEFAULT_DOUBLE_CLICK_DELAY.into(),
            click_duration_enabled: false,
            click_duration_min: DEFAULT_CLICK_DURATION_MIN.into(),
            click_duration_max: DEFAULT_CLICK_DURATION_MAX.into(),
            click_limit_enabled: false,
            click_limit: DEFAULT_CLICK_LIMIT.into(),
            time_limit_enabled: false,
            time_limit: DEFAULT_TIME_LIMIT.into(),
            time_limit_unit: ClickRateUnit::S,
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

#[cfg(target_os = "windows")]
pub struct AutoClickerController {
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
    pub fn new() -> Self {
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

    pub fn configure(&self, config: AutoClickerCommandConfig) -> Result<AutoClickerStatus, String> {
        let config = normalize_auto_clicker_config(config)?;

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

    pub fn set_main_window_handle(&self, hwnd: isize) {
        self.shared.main_window_hwnd.store(hwnd, Ordering::Relaxed);
    }

    pub fn status(&self) -> AutoClickerStatus {
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
pub struct AutoClickerController {
    status: Mutex<AutoClickerStatus>,
}

#[cfg(not(target_os = "windows"))]
impl AutoClickerController {
    pub fn new() -> Self {
        let config = AutoClickerCommandConfig::default();
        Self {
            status: Mutex::new(AutoClickerStatus::from_config(&config)),
        }
    }

    pub fn configure(
        &self,
        _config: AutoClickerCommandConfig,
    ) -> Result<AutoClickerStatus, String> {
        Err("The auto clicker backend is only implemented on Windows.".into())
    }

    pub fn set_main_window_handle(&self, _hwnd: isize) {}

    pub fn status(&self) -> AutoClickerStatus {
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
        let mut limit_locked_until_release = false;
        let mut hotkey_was_pressed = false;
        let mut held_mouse_button: Option<MouseButton> = None;
        let mut remaining_click_limit: Option<u64> = None;
        let mut remaining_time_limit: Option<Duration> = None;
        let mut last_time_limit_tick: Option<Instant> = None;
        let mut cadence_carry_nanos = 0_u64;
        let mut click_randomizer = ClickRandomizer::new();
        let mut jitter_anchor_position: Option<ClickPositionPoint> = None;
        let mut next_click_position_index = 0_usize;
        let mut last_schedule_config: Option<AutoClickerCommandConfig> = None;
        let mut next_click_at: Option<Instant> = None;
        let mut last_process_filter_process_id: Option<u32> = None;
        let mut last_process_filter_allowed = true;

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

            let config_changed = last_schedule_config.as_ref() != Some(&config);

            if config_changed {
                cadence_carry_nanos = 0;
                limit_locked_until_release = false;
                remaining_click_limit = None;
                remaining_time_limit = None;
                last_time_limit_tick = None;
                jitter_anchor_position = None;
                next_click_position_index = 0;
                last_schedule_config = Some(config.clone());
                next_click_at = None;
                last_process_filter_process_id = None;
                last_process_filter_allowed = true;
            }

            let cadence_result = match config.mouse_action {
                MouseAction::Click => click_cadence_from_config(&config).map(Some),
                MouseAction::Hold => Ok(None),
            };
            let cadence = cadence_result.as_ref().ok().copied().flatten();
            let clicks_per_cycle = clicks_per_cycle_from_config(&config);
            let double_click_delay_result = double_click_delay_from_config(&config);
            let double_click_delay = double_click_delay_result
                .as_ref()
                .ok()
                .copied()
                .flatten();
            let click_duration_range_result = click_duration_range_from_config(&config);
            let click_duration_range = click_duration_range_result
                .as_ref()
                .ok()
                .copied()
                .flatten();
            let jitter_range_result = jitter_range_from_config(&config);
            let jitter_range = jitter_range_result.as_ref().ok().copied().flatten();
            let click_limit_result = click_limit_from_config(&config);
            let click_limit = click_limit_result.as_ref().ok().and_then(|limit| *limit);
            let time_limit_result = time_limit_from_config(&config);
            let time_limit = time_limit_result.as_ref().ok().copied().flatten();
            let hotkey_result = read_hotkey_state(&config.hotkey_code, config.click_mode);
            let hotkey_pressed = hotkey_result
                .as_ref()
                .map(|pressed| *pressed)
                .unwrap_or(false);
            let was_clicker_enabled = clicker_enabled;

            if !hotkey_pressed {
                limit_locked_until_release = false;
            }

            if hotkey_result.is_err()
                || cadence_result.is_err()
                || double_click_delay_result.is_err()
                || click_duration_range_result.is_err()
                || jitter_range_result.is_err()
                || click_limit_result.is_err()
                || time_limit_result.is_err()
            {
                clicker_enabled = false;
                limit_locked_until_release = false;
                hotkey_was_pressed = false;
                remaining_click_limit = None;
                remaining_time_limit = None;
                last_time_limit_tick = None;
                jitter_anchor_position = None;
                cadence_carry_nanos = 0;
                next_click_at = None;
            } else {
                match config.click_mode {
                    ClickMode::Hold => {
                        clicker_enabled = hotkey_pressed && !limit_locked_until_release;
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

                if !was_clicker_enabled && clicker_enabled {
                    remaining_click_limit = click_limit;
                    remaining_time_limit = time_limit;
                    last_time_limit_tick = None;
                    jitter_anchor_position = None;
                    next_click_position_index = 0;
                }

                if config_changed && clicker_enabled {
                    remaining_click_limit = click_limit;
                    remaining_time_limit = time_limit;
                    last_time_limit_tick = None;
                    jitter_anchor_position = None;
                    next_click_position_index = 0;
                }

                if was_clicker_enabled && !clicker_enabled {
                    remaining_click_limit = None;
                    remaining_time_limit = None;
                    last_time_limit_tick = None;
                    jitter_anchor_position = None;
                    next_click_position_index = 0;
                }
            }

            let app_window_active_result = is_app_window_active(&shared);
            let paused_for_app_window = app_window_active_result
                .as_ref()
                .map(|active| *active)
                .unwrap_or(false);
            let process_filter_result = if paused_for_app_window
                || !process_filters_active_from_config(&config)
            {
                Ok(true)
            } else {
                process_filters_allow_foreground_process(
                    &config,
                    &mut last_process_filter_process_id,
                    &mut last_process_filter_allowed,
                    config_changed,
                )
            };
            let process_filter_allowed = process_filter_result.as_ref().copied().unwrap_or(false);
            let hotkey_uses_output_mouse_button =
                hotkey_includes_mouse_button(&config.hotkey_code, config.mouse_button);
            let waiting_for_hotkey_release = clicker_enabled
                && hotkey_pressed
                && hotkey_uses_output_mouse_button
                && matches!(config.click_mode, ClickMode::Toggle);
            let can_dispatch_clicks = clicker_enabled
                && !paused_for_app_window
                && process_filter_allowed
                && !waiting_for_hotkey_release;

            let time_limit_expired = if can_dispatch_clicks {
                if let Some(remaining_time_limit) = remaining_time_limit.as_mut() {
                    let now = Instant::now();
                    if let Some(last_tick) = last_time_limit_tick.replace(now) {
                        match remaining_time_limit.checked_sub(now.saturating_duration_since(last_tick)) {
                            Some(next_remaining) => {
                                *remaining_time_limit = next_remaining;
                                false
                            }
                            None => true,
                        }
                    } else {
                        false
                    }
                } else {
                    false
                }
            } else {
                last_time_limit_tick = None;
                false
            };

            if time_limit_expired {
                clicker_enabled = false;
                limit_locked_until_release = true;
                remaining_click_limit = None;
                remaining_time_limit = None;
                last_time_limit_tick = None;
                jitter_anchor_position = None;
                cadence_carry_nanos = 0;
                next_click_at = None;
            }

            let click_result = if can_dispatch_clicks {
                match config.mouse_action {
                    MouseAction::Click => {
                        if let Err(error) =
                            ensure_mouse_button_released(&mut held_mouse_button)
                        {
                            clicker_enabled = false;
                            cadence_carry_nanos = 0;
                            next_click_at = None;
                            remaining_time_limit = None;
                            last_time_limit_tick = None;
                            jitter_anchor_position = None;
                            Some(error)
                        } else if let Some(cadence) = cadence {
                            if next_click_at.is_none() {
                                next_click_at = Some(
                                    Instant::now()
                                        + next_cadence_interval(
                                            cadence,
                                            &mut cadence_carry_nanos,
                                        ),
                                );
                                None
                            } else {
                                let scheduled_at =
                                    next_click_at.expect("checked is_some above");
                                let now = Instant::now();

                                if now < scheduled_at
                                    && matches!(config.click_engine, ClickEngine::Classic)
                                {
                                    wait_until_precise(scheduled_at);
                                }

                                let now_after_wait = Instant::now();
                                if now_after_wait >= scheduled_at {
                                    let mut due_cycles = 0_usize;
                                    let mut next_scheduled_at = scheduled_at;

                                    while next_scheduled_at <= now_after_wait
                                        && due_cycles < MAX_CATCH_UP_CLICKS_PER_LOOP
                                    {
                                        due_cycles += 1;
                                        next_scheduled_at += next_cadence_interval(
                                            cadence,
                                            &mut cadence_carry_nanos,
                                        );
                                    }

                                    let requested_click_count =
                                        due_cycles.saturating_mul(clicks_per_cycle);
                                    let click_count = remaining_click_limit
                                        .map(|remaining| requested_click_count.min(remaining as usize))
                                        .unwrap_or(requested_click_count);

                                    if click_count == 0 {
                                        clicker_enabled = false;
                                        limit_locked_until_release = true;
                                        remaining_click_limit = None;
                                        remaining_time_limit = None;
                                        last_time_limit_tick = None;
                                        jitter_anchor_position = None;
                                        cadence_carry_nanos = 0;
                                        next_click_at = None;
                                        None
                                    } else {
                                        let jitter_anchor_for_dispatch_result = if jitter_range.is_some()
                                            && !click_positions_active_from_config(&config)
                                        {
                                            if jitter_anchor_position.is_none() {
                                                match current_cursor_position() {
                                                    Ok(position) => {
                                                        jitter_anchor_position = Some(position);
                                                        Ok(jitter_anchor_position)
                                                    }
                                                    Err(error) => Err(error),
                                                }
                                            } else {
                                                Ok(jitter_anchor_position)
                                            }
                                        } else {
                                            Ok(None)
                                        };
                                        match jitter_anchor_for_dispatch_result {
                                            Ok(jitter_anchor_for_dispatch) => {
                                                let result = if click_positions_active_from_config(&config)
                                                {
                                                    let mut executed_click_count = 0_usize;
                                                    let mut dispatch_error = None;

                                                    for _ in 0..due_cycles {
                                                        let cycle_click_count = remaining_click_limit
                                                            .map(|remaining| {
                                                                clicks_per_cycle.min(remaining as usize)
                                                            })
                                                            .unwrap_or(clicks_per_cycle);

                                                        if cycle_click_count == 0 {
                                                            break;
                                                        }

                                                        if let Some(position) = next_click_position(
                                                            &config,
                                                            &mut next_click_position_index,
                                                        ) {
                                                            match dispatch_mouse_clicks(
                                                                config.mouse_button,
                                                                cycle_click_count,
                                                                clicks_per_cycle,
                                                                double_click_delay,
                                                                click_duration_range,
                                                                jitter_range,
                                                                Some(position),
                                                                &mut click_randomizer,
                                                            ) {
                                                                Ok(dispatched_click_count) => {
                                                                    executed_click_count +=
                                                                        dispatched_click_count;

                                                                    if let Some(remaining) =
                                                                        remaining_click_limit
                                                                            .as_mut()
                                                                    {
                                                                        *remaining = remaining
                                                                            .saturating_sub(
                                                                                dispatched_click_count
                                                                                    as u64,
                                                                            );
                                                                        if *remaining == 0 {
                                                                            break;
                                                                        }
                                                                    }
                                                                }
                                                                Err(error) => {
                                                                    dispatch_error = Some(error);
                                                                    break;
                                                                }
                                                            }
                                                        }
                                                    }

                                                    dispatch_error.map(Err).unwrap_or_else(|| {
                                                        Ok(executed_click_count)
                                                    })
                                                } else {
                                                    dispatch_mouse_clicks(
                                                        config.mouse_button,
                                                        click_count,
                                                        clicks_per_cycle,
                                                        double_click_delay,
                                                        click_duration_range,
                                                        jitter_range,
                                                        jitter_anchor_for_dispatch,
                                                        &mut click_randomizer,
                                                    )
                                                };

                                                if let Ok(executed_click_count) = result {
                                                    if let Some(remaining) =
                                                        remaining_click_limit.as_mut()
                                                    {
                                                        if !click_positions_active_from_config(&config) {
                                                            *remaining = remaining
                                                                .saturating_sub(executed_click_count as u64);
                                                        }

                                                        if *remaining == 0 {
                                                            clicker_enabled = false;
                                                            limit_locked_until_release = true;
                                                            remaining_click_limit = None;
                                                            remaining_time_limit = None;
                                                            last_time_limit_tick = None;
                                                            jitter_anchor_position = None;
                                                            cadence_carry_nanos = 0;
                                                            next_click_at = None;
                                                        } else {
                                                            next_click_at = Some(next_scheduled_at);
                                                        }
                                                    } else {
                                                        next_click_at = Some(next_scheduled_at);
                                                    }
                                                } else {
                                                    clicker_enabled = false;
                                                    remaining_click_limit = None;
                                                    remaining_time_limit = None;
                                                    last_time_limit_tick = None;
                                                    jitter_anchor_position = None;
                                                    cadence_carry_nanos = 0;
                                                    next_click_at = None;
                                                }

                                                result.err()
                                            }
                                            Err(error) => {
                                                clicker_enabled = false;
                                                remaining_click_limit = None;
                                                remaining_time_limit = None;
                                                last_time_limit_tick = None;
                                                jitter_anchor_position = None;
                                                cadence_carry_nanos = 0;
                                                next_click_at = None;
                                                Some(error)
                                            }
                                        }
                                    }
                                } else {
                                    None
                                }
                            }
                        } else {
                            clicker_enabled = false;
                            remaining_click_limit = None;
                            remaining_time_limit = None;
                            last_time_limit_tick = None;
                            jitter_anchor_position = None;
                            cadence_carry_nanos = 0;
                            next_click_at = None;
                            None
                        }
                    }
                    MouseAction::Hold => {
                        cadence_carry_nanos = 0;
                        next_click_at = None;

                        match ensure_mouse_button_held(
                            &mut held_mouse_button,
                            config.mouse_button,
                        ) {
                            Ok(()) => None,
                            Err(error) => {
                                clicker_enabled = false;
                                remaining_click_limit = None;
                                remaining_time_limit = None;
                                last_time_limit_tick = None;
                                jitter_anchor_position = None;
                                Some(error)
                            }
                        }
                    }
                }
            } else {
                cadence_carry_nanos = 0;
                next_click_at = None;
                jitter_anchor_position = None;

                match ensure_mouse_button_released(&mut held_mouse_button) {
                    Ok(()) => None,
                    Err(error) => {
                        clicker_enabled = false;
                        remaining_click_limit = None;
                        remaining_time_limit = None;
                        last_time_limit_tick = None;
                        jitter_anchor_position = None;
                        Some(error)
                    }
                }
            };

            if let Ok(mut status) = shared.status.lock() {
                status.worker_running = true;
                status.click_mode = config.click_mode;
                status.hotkey_label = config.hotkey_label.clone();
                status.hotkey_pressed = hotkey_pressed;
                status.clicker_active = can_dispatch_clicks;
                status.interval_ms = config.interval_ms.max(1);
                status.last_error = hotkey_result
                    .err()
                    .or_else(|| cadence_result.err())
                    .or_else(|| double_click_delay_result.err())
                    .or_else(|| click_duration_range_result.err())
                    .or_else(|| jitter_range_result.err())
                    .or_else(|| click_limit_result.err())
                    .or_else(|| time_limit_result.err())
                    .or_else(|| app_window_active_result.err())
                    .or_else(|| process_filter_result.err())
                    .or(click_result);
            }

            let sleep_for = if can_dispatch_clicks
                && matches!(config.mouse_action, MouseAction::Click)
            {
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
                && can_dispatch_clicks
                && matches!(config.click_engine, ClickEngine::Classic)
                && matches!(config.mouse_action, MouseAction::Click)
            {
                thread::yield_now();
            }
        }

        let _ = ensure_mouse_button_released(&mut held_mouse_button);

        if timer_resolution_enabled {
            unsafe {
                timeEndPeriod(1);
            }
        }
    });
}

#[cfg(target_os = "windows")]
fn ensure_mouse_button_held(
    held_mouse_button: &mut Option<MouseButton>,
    mouse_button: MouseButton,
) -> Result<(), String> {
    if *held_mouse_button == Some(mouse_button) {
        return Ok(());
    }

    ensure_mouse_button_released(held_mouse_button)?;
    press_mouse_button(mouse_button)?;
    *held_mouse_button = Some(mouse_button);
    Ok(())
}

#[cfg(target_os = "windows")]
fn ensure_mouse_button_released(
    held_mouse_button: &mut Option<MouseButton>,
) -> Result<(), String> {
    let Some(mouse_button) = *held_mouse_button else {
        return Ok(());
    };

    release_mouse_button(mouse_button)?;
    *held_mouse_button = None;
    Ok(())
}

#[cfg(target_os = "windows")]
fn validate_auto_clicker_config(config: &AutoClickerCommandConfig) -> Result<(), String> {
    if matches!(config.mouse_action, MouseAction::Click) && config.click_rate.trim().is_empty() {
        return Err("Click rate cannot be empty.".into());
    }

    validate_hotkey_code(&config.hotkey_code)
        .map_err(|_| format!("Unsupported hotkey: {}", config.hotkey_label))?;

    if matches!(config.mouse_action, MouseAction::Click) {
        click_cadence_from_config(config)?;
    }

    double_click_delay_from_config(config)?;
    jitter_range_from_config(config)?;
    click_duration_range_from_config(config)?;
    click_limit_from_config(config)?;
    time_limit_from_config(config)?;

    Ok(())
}

#[cfg(target_os = "windows")]
fn normalize_auto_clicker_config(
    mut config: AutoClickerCommandConfig,
) -> Result<AutoClickerCommandConfig, String> {
    config.hotkey_code = normalize_hotkey_code(&config.hotkey_code)?;
    config.hotkey_label = format_hotkey_label(&config.hotkey_code)?;
    config.process_whitelist = normalize_process_name_list(&config.process_whitelist);
    config.process_blacklist = normalize_process_name_list(&config.process_blacklist);
    config
        .process_blacklist
        .retain(|rule| !config.process_whitelist.iter().any(|item| item == rule));
    config.jitter_x = normalize_jitter_axis_value(&config.jitter_x, "Jitter X axis")?;
    config.jitter_y = normalize_jitter_axis_value(&config.jitter_y, "Jitter Y axis")?;
    if config.double_click_enabled && matches!(config.mouse_action, MouseAction::Click) {
        config.double_click_delay = normalize_double_click_delay_value(&config.double_click_delay)?;
    }
    if config.click_duration_enabled && matches!(config.mouse_action, MouseAction::Click) {
        let (normalized_min, normalized_max) = normalize_click_duration_range_values(
            &config.click_duration_min,
            &config.click_duration_max,
        )?;
        config.click_duration_min = normalized_min;
        config.click_duration_max = normalized_max;
    }
    config.click_limit = normalize_click_limit_value(&config.click_limit)?;
    config.time_limit = normalize_time_limit_value(&config.time_limit)?;
    validate_auto_clicker_config(&config)?;
    Ok(config)
}

#[cfg(target_os = "windows")]
fn clicks_per_cycle_from_config(config: &AutoClickerCommandConfig) -> usize {
    if config.double_click_enabled && matches!(config.mouse_action, MouseAction::Click) {
        2
    } else {
        1
    }
}

#[cfg(target_os = "windows")]
fn process_filters_active_from_config(config: &AutoClickerCommandConfig) -> bool {
    !config.process_whitelist.is_empty() || !config.process_blacklist.is_empty()
}

#[cfg(target_os = "windows")]
fn process_filters_allow_foreground_process(
    config: &AutoClickerCommandConfig,
    last_process_id: &mut Option<u32>,
    last_process_allowed: &mut bool,
    force_refresh: bool,
) -> Result<bool, String> {
    if !process_filters_active_from_config(config) {
        *last_process_id = None;
        *last_process_allowed = true;
        return Ok(true);
    }

    let foreground_process_id = foreground_process_id();
    if !force_refresh && foreground_process_id == *last_process_id {
        return Ok(*last_process_allowed);
    }

    let foreground_process_name = match foreground_process_id {
        Some(process_id) => process_name_by_id(process_id)?,
        None => None,
    };
    let process_allowed = is_process_allowed(
        foreground_process_name.as_deref(),
        &config.process_whitelist,
        &config.process_blacklist,
    );

    *last_process_id = foreground_process_id;
    *last_process_allowed = process_allowed;

    Ok(process_allowed)
}

#[cfg(target_os = "windows")]
fn click_positions_active_from_config(config: &AutoClickerCommandConfig) -> bool {
    config.click_position_enabled
        && matches!(config.mouse_action, MouseAction::Click)
        && !config.click_positions.is_empty()
}

#[cfg(target_os = "windows")]
fn next_click_position(
    config: &AutoClickerCommandConfig,
    next_click_position_index: &mut usize,
) -> Option<ClickPositionPoint> {
    if config.click_positions.is_empty() {
        return None;
    }

    let position = config.click_positions[*next_click_position_index % config.click_positions.len()];
    *next_click_position_index = (*next_click_position_index + 1) % config.click_positions.len();
    Some(position)
}

#[cfg(target_os = "windows")]
fn double_click_delay_from_config(
    config: &AutoClickerCommandConfig,
) -> Result<Option<Duration>, String> {
    if !config.double_click_enabled || !matches!(config.mouse_action, MouseAction::Click) {
        return Ok(None);
    }

    Ok(Some(Duration::from_millis(parse_double_click_delay_value(
        &config.double_click_delay,
    )?)))
}

#[cfg(target_os = "windows")]
fn normalize_double_click_delay_value(value: &str) -> Result<String, String> {
    Ok(parse_double_click_delay_value(value)?.to_string())
}

#[cfg(target_os = "windows")]
fn parse_double_click_delay_value(value: &str) -> Result<u64, String> {
    let trimmed_value = value.trim();
    let normalized_value = if trimmed_value.is_empty() {
        DEFAULT_DOUBLE_CLICK_DELAY
    } else {
        trimmed_value
    };

    let double_click_delay = normalized_value
        .parse::<u64>()
        .map_err(|_| "Double click delay must be a whole number.".to_string())?;

    if double_click_delay < MIN_DOUBLE_CLICK_DELAY {
        return Err(format!(
            "Double click delay must be at least {MIN_DOUBLE_CLICK_DELAY} ms."
        ));
    }

    Ok(double_click_delay)
}

#[cfg(target_os = "windows")]
fn jitter_range_from_config(
    config: &AutoClickerCommandConfig,
) -> Result<Option<CursorJitterConfig>, String> {
    if !config.jitter_enabled || !matches!(config.mouse_action, MouseAction::Click) {
        return Ok(None);
    }

    let (jitter_x, jitter_y) = parse_jitter_axis_values(&config.jitter_x, &config.jitter_y)?;
    if jitter_x == 0 && jitter_y == 0 {
        return Ok(None);
    }

    Ok(Some(CursorJitterConfig::from_pixels(
        config.jitter_mode,
        jitter_x as i32,
        jitter_y as i32,
    )))
}

#[cfg(target_os = "windows")]
fn normalize_jitter_axis_value(value: &str, label: &str) -> Result<String, String> {
    Ok(parse_jitter_axis_value(value, label)?.to_string())
}

#[cfg(target_os = "windows")]
fn parse_jitter_axis_values(x_value: &str, y_value: &str) -> Result<(i32, i32), String> {
    Ok((
        parse_jitter_axis_value(x_value, "Jitter X axis")?,
        parse_jitter_axis_value(y_value, "Jitter Y axis")?,
    ))
}

#[cfg(target_os = "windows")]
fn parse_jitter_axis_value(value: &str, label: &str) -> Result<i32, String> {
    let trimmed_value = value.trim();
    let normalized_value = if trimmed_value.is_empty() {
        DEFAULT_JITTER_AXIS
    } else {
        trimmed_value
    };

    let jitter_axis = normalized_value
        .parse::<i32>()
        .map_err(|_| format!("{label} must be a whole number."))?;

    if !(MIN_JITTER_AXIS..=MAX_JITTER_AXIS).contains(&jitter_axis) {
        return Err(format!(
            "{label} must be between {MIN_JITTER_AXIS} and {MAX_JITTER_AXIS} px."
        ));
    }

    Ok(jitter_axis)
}

#[cfg(target_os = "windows")]
fn click_duration_range_from_config(
    config: &AutoClickerCommandConfig,
) -> Result<Option<ClickDurationRange>, String> {
    if !config.click_duration_enabled || !matches!(config.mouse_action, MouseAction::Click) {
        return Ok(None);
    }

    let (min_duration_ms, max_duration_ms) = parse_click_duration_range_values(
        &config.click_duration_min,
        &config.click_duration_max,
    )?;

    Ok(Some(ClickDurationRange::from_millis(
        min_duration_ms,
        max_duration_ms,
    )))
}

#[cfg(target_os = "windows")]
fn normalize_click_duration_range_values(
    min_value: &str,
    max_value: &str,
) -> Result<(String, String), String> {
    let (min_duration_ms, max_duration_ms) = parse_click_duration_range_values(min_value, max_value)?;
    Ok((min_duration_ms.to_string(), max_duration_ms.to_string()))
}

#[cfg(target_os = "windows")]
fn parse_click_duration_range_values(min_value: &str, max_value: &str) -> Result<(u64, u64), String> {
    let min_fallback = min_value.trim();
    let min_duration_ms =
        parse_click_duration_value(min_value, "Click duration minimum", DEFAULT_CLICK_DURATION_MIN)?;
    let max_duration_ms = parse_click_duration_value(
        max_value,
        "Click duration maximum",
        if min_fallback.is_empty() {
            DEFAULT_CLICK_DURATION_MAX
        } else {
            min_fallback
        },
    )?
    .max(min_duration_ms);

    Ok((min_duration_ms, max_duration_ms))
}

#[cfg(target_os = "windows")]
fn parse_click_duration_value(value: &str, label: &str, fallback: &str) -> Result<u64, String> {
    let trimmed_value = value.trim();
    let normalized_value = if trimmed_value.is_empty() {
        fallback
    } else {
        trimmed_value
    };

    let click_duration = normalized_value
        .parse::<u64>()
        .map_err(|_| format!("{label} must be a whole number."))?;

    if click_duration < MIN_CLICK_DURATION {
        return Err(format!("{label} must be at least {MIN_CLICK_DURATION} ms."));
    }

    Ok(click_duration)
}

#[cfg(target_os = "windows")]
fn click_limit_from_config(config: &AutoClickerCommandConfig) -> Result<Option<u64>, String> {
    if !config.click_limit_enabled || !matches!(config.mouse_action, MouseAction::Click) {
        return Ok(None);
    }

    Ok(Some(parse_click_limit_value(&config.click_limit)?))
}

#[cfg(target_os = "windows")]
fn normalize_click_limit_value(value: &str) -> Result<String, String> {
    Ok(parse_click_limit_value(value)?.to_string())
}

#[cfg(target_os = "windows")]
fn parse_click_limit_value(value: &str) -> Result<u64, String> {
    let trimmed_value = value.trim();
    let normalized_value = if trimmed_value.is_empty() {
        DEFAULT_CLICK_LIMIT
    } else {
        trimmed_value
    };

    let click_limit = normalized_value
        .parse::<u64>()
        .map_err(|_| "Click limit must be a whole number.".to_string())?;

    if !(MIN_CLICK_LIMIT..=MAX_CLICK_LIMIT).contains(&click_limit) {
        return Err(format!(
            "Click limit must be between {MIN_CLICK_LIMIT} and {MAX_CLICK_LIMIT}."
        ));
    }

    Ok(click_limit)
}

#[cfg(target_os = "windows")]
fn time_limit_from_config(config: &AutoClickerCommandConfig) -> Result<Option<Duration>, String> {
    if !config.time_limit_enabled || !matches!(config.click_mode, ClickMode::Toggle) {
        return Ok(None);
    }

    let time_limit_value = parse_time_limit_value(&config.time_limit)?;
    let time_limit_ms = time_limit_value
        .checked_mul(time_limit_unit_ms(config.time_limit_unit))
        .ok_or_else(|| "Time limit is too large.".to_string())?;

    Ok(Some(Duration::from_millis(time_limit_ms)))
}

#[cfg(target_os = "windows")]
fn normalize_time_limit_value(value: &str) -> Result<String, String> {
    Ok(parse_time_limit_value(value)?.to_string())
}

#[cfg(target_os = "windows")]
fn parse_time_limit_value(value: &str) -> Result<u64, String> {
    let trimmed_value = value.trim();
    let normalized_value = if trimmed_value.is_empty() {
        DEFAULT_TIME_LIMIT
    } else {
        trimmed_value
    };

    let time_limit = normalized_value
        .parse::<u64>()
        .map_err(|_| "Time limit must be a whole number.".to_string())?;

    if !(MIN_TIME_LIMIT..=MAX_TIME_LIMIT).contains(&time_limit) {
        return Err(format!(
            "Time limit must be between {MIN_TIME_LIMIT} and {MAX_TIME_LIMIT}."
        ));
    }

    Ok(time_limit)
}

#[cfg(target_os = "windows")]
fn time_limit_unit_ms(unit: ClickRateUnit) -> u64 {
    match unit {
        ClickRateUnit::Ms => 1,
        ClickRateUnit::S => 1_000,
        ClickRateUnit::M => 60_000,
        ClickRateUnit::H => 3_600_000,
        ClickRateUnit::D => 86_400_000,
    }
}

#[cfg(target_os = "windows")]
fn hotkey_includes_mouse_button(code: &str, mouse_button: MouseButton) -> bool {
    let target_code = mouse_button_hotkey_code(mouse_button);

    code.split('+')
        .map(str::trim)
        .any(|part| part.eq_ignore_ascii_case(target_code))
}

#[cfg(target_os = "windows")]
fn mouse_button_hotkey_code(mouse_button: MouseButton) -> &'static str {
    match mouse_button {
        MouseButton::Left => "Mouse1",
        MouseButton::Right => "Mouse2",
        MouseButton::Middle => "Mouse3",
        MouseButton::Mouse4 => "Mouse4",
        MouseButton::Mouse5 => "Mouse5",
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
