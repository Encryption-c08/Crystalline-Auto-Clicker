use std::{
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP,
    MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP, SendInput,
    INPUT, INPUT_0, INPUT_MOUSE, MOUSEINPUT,
};

use super::{AutoClickerCommandConfig, ClickRateMode, ClickRateUnit, MouseButton};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct ClickDurationRange {
    pub(crate) min_ms: u64,
    pub(crate) max_ms: u64,
}

impl ClickDurationRange {
    pub(crate) fn from_millis(min_ms: u64, max_ms: u64) -> Self {
        Self {
            min_ms,
            max_ms: max_ms.max(min_ms),
        }
    }
}

pub(crate) struct ClickDurationRng {
    state: u64,
}

impl ClickDurationRng {
    pub(crate) fn new() -> Self {
        let seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos() as u64)
            .unwrap_or(0xA5A5_5A5A_D3C1_B29F);

        Self {
            state: (seed ^ 0x9E37_79B9_7F4A_7C15).max(1),
        }
    }

    fn next_u64(&mut self) -> u64 {
        let mut value = self.state;
        value ^= value << 13;
        value ^= value >> 7;
        value ^= value << 17;

        self.state = if value == 0 {
            0x9E37_79B9_7F4A_7C15
        } else {
            value
        };

        self.state
    }

    fn next_duration(&mut self, range: ClickDurationRange) -> Duration {
        if range.min_ms >= range.max_ms {
            return Duration::from_millis(range.min_ms);
        }

        let span = range.max_ms - range.min_ms + 1;
        Duration::from_millis(range.min_ms + (self.next_u64() % span))
    }
}

#[derive(Clone, Copy)]
pub(crate) struct ClickCadence {
    pub(crate) base_interval_nanos: u64,
    pub(crate) interval_divisor: u64,
    pub(crate) remainder_nanos: u64,
}

const MIN_CLICK_RATE: u64 = 1;
const MAX_CLICK_RATE: u64 = 5_000;
const XBUTTON1_DATA: u32 = 0x0001;
const XBUTTON2_DATA: u32 = 0x0002;

pub(crate) fn click_cadence_from_config(
    config: &AutoClickerCommandConfig,
) -> Result<ClickCadence, String> {
    let click_rate_value = config
        .click_rate
        .trim()
        .parse::<u64>()
        .map_err(|_| "Rate must be a whole number.".to_string())?;

    if !(MIN_CLICK_RATE..=MAX_CLICK_RATE).contains(&click_rate_value) {
        return Err(format!(
            "Rate must be between {MIN_CLICK_RATE} and {MAX_CLICK_RATE}."
        ));
    }

    match config.click_rate_mode {
        ClickRateMode::Per => {
            let total_window_nanos = click_window_nanos(config.click_rate_unit);
            let base_interval_nanos = total_window_nanos / click_rate_value;

            if base_interval_nanos == 0 {
                return Err("The click rate is too fast for the current timer precision.".into());
            }

            Ok(ClickCadence {
                base_interval_nanos,
                interval_divisor: click_rate_value,
                remainder_nanos: total_window_nanos % click_rate_value,
            })
        }
        ClickRateMode::Every => {
            let total_interval_nanos = click_window_nanos(config.click_rate_unit)
                .checked_mul(click_rate_value)
                .ok_or_else(|| "The click interval is too large.".to_string())?;

            Ok(ClickCadence {
                base_interval_nanos: total_interval_nanos.max(1),
                interval_divisor: 1,
                remainder_nanos: 0,
            })
        }
    }
}

pub(crate) fn next_cadence_interval(cadence: ClickCadence, carry_nanos: &mut u64) -> Duration {
    let mut interval_nanos = cadence.base_interval_nanos;
    *carry_nanos += cadence.remainder_nanos;

    if *carry_nanos >= cadence.interval_divisor {
        interval_nanos += 1;
        *carry_nanos -= cadence.interval_divisor;
    }

    Duration::from_nanos(interval_nanos.max(1))
}

pub(crate) fn next_worker_sleep(next_click_at: Instant) -> Duration {
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

pub(crate) fn next_throughput_worker_sleep(next_click_at: Instant) -> Duration {
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

pub(crate) fn wait_until_precise(deadline: Instant) {
    while Instant::now() < deadline {
        if deadline.saturating_duration_since(Instant::now()) > Duration::from_micros(250) {
            thread::yield_now();
        } else {
            std::hint::spin_loop();
        }
    }
}

pub(crate) fn dispatch_mouse_clicks(
    mouse_button: MouseButton,
    count: usize,
    click_duration_range: Option<ClickDurationRange>,
    click_duration_rng: &mut ClickDurationRng,
) -> Result<(), String> {
    if count == 0 {
        return Ok(());
    }

    for _ in 0..count {
        dispatch_mouse_button_event(mouse_button, true)?;
        if let Some(click_duration_range) = click_duration_range {
            thread::sleep(click_duration_rng.next_duration(click_duration_range));
        }
        dispatch_mouse_button_event(mouse_button, false)?;
    }

    Ok(())
}

pub(crate) fn press_mouse_button(mouse_button: MouseButton) -> Result<(), String> {
    dispatch_mouse_button_event(mouse_button, true)
}

pub(crate) fn release_mouse_button(mouse_button: MouseButton) -> Result<(), String> {
    dispatch_mouse_button_event(mouse_button, false)
}

fn click_window_nanos(click_rate_unit: ClickRateUnit) -> u64 {
    match click_rate_unit {
        ClickRateUnit::Ms => 1_000_000,
        ClickRateUnit::S => 1_000_000_000,
        ClickRateUnit::M => 60 * 1_000_000_000,
        ClickRateUnit::H => 60 * 60 * 1_000_000_000,
        ClickRateUnit::D => 24 * 60 * 60 * 1_000_000_000,
    }
}

fn dispatch_mouse_button_event(mouse_button: MouseButton, is_down: bool) -> Result<(), String> {
    let (down, up, mouse_data) = mouse_button_input(mouse_button);
    let input = build_mouse_input(if is_down { down } else { up }, mouse_data);

    let sent = unsafe { SendInput(1, &input, std::mem::size_of::<INPUT>() as i32) };
    if sent != 1 {
        return Err(format!("Windows only accepted {sent} of 1 mouse inputs."));
    }

    Ok(())
}

fn mouse_button_input(mouse_button: MouseButton) -> (u32, u32, u32) {
    match mouse_button {
        MouseButton::Left => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, 0),
        MouseButton::Middle => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, 0),
        MouseButton::Right => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP, 0),
        MouseButton::Mouse4 => (MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP, XBUTTON1_DATA),
        MouseButton::Mouse5 => (MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP, XBUTTON2_DATA),
    }
}

fn build_mouse_input(flags: u32, mouse_data: u32) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: mouse_data,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}
