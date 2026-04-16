use std::{
    thread,
    time::{Duration, Instant},
};

use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP,
    MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP, SendInput,
    INPUT, INPUT_0, INPUT_MOUSE, MOUSEINPUT,
};

use super::{AutoClickerCommandConfig, ClickRateUnit, MouseButton};

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
) -> Result<(), String> {
    if count == 0 {
        return Ok(());
    }

    const MAX_MOUSE_INPUTS_PER_BATCH: usize = 64;
    let (down, up, mouse_data) = mouse_button_input(mouse_button);

    let click_count = count.min(MAX_MOUSE_INPUTS_PER_BATCH / 2);
    let mut inputs = [INPUT::default(); MAX_MOUSE_INPUTS_PER_BATCH];

    for click_index in 0..click_count {
        let input_offset = click_index * 2;
        inputs[input_offset] = build_mouse_input(down, mouse_data);
        inputs[input_offset + 1] = build_mouse_input(up, mouse_data);
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

pub(crate) fn press_mouse_button(mouse_button: MouseButton) -> Result<(), String> {
    dispatch_mouse_button_event(mouse_button, true)
}

pub(crate) fn release_mouse_button(mouse_button: MouseButton) -> Result<(), String> {
    dispatch_mouse_button_event(mouse_button, false)
}

fn click_window_nanos(click_rate_unit: ClickRateUnit) -> u64 {
    match click_rate_unit {
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
