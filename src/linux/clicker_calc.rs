use std::{
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use crate::edge_stop::{cursor_hits_edge_stop, EdgeStopRuntime, OverlayRect};
use crate::linux_x11;

use super::{
    AutoClickerCommandConfig, ClickPositionPoint, ClickRateMode, ClickRateUnit, JitterMode,
    MouseButton,
};

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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct CursorJitterConfig {
    pub(crate) mode: JitterMode,
    pub(crate) x_axis_px: i32,
    pub(crate) y_axis_px: i32,
}

impl CursorJitterConfig {
    pub(crate) fn from_pixels(mode: JitterMode, x_axis_px: i32, y_axis_px: i32) -> Self {
        Self {
            mode,
            x_axis_px,
            y_axis_px,
        }
    }
}

pub(crate) struct ClickRandomizer {
    state: u64,
}

impl ClickRandomizer {
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

    fn next_axis_offset(&mut self, axis_px: i32, mode: JitterMode) -> i32 {
        if axis_px == 0 {
            return 0;
        }

        match mode {
            JitterMode::Fixed => axis_px,
            JitterMode::Random => {
                let min_offset = axis_px.min(0);
                let max_offset = axis_px.max(0);
                let span = i64::from(max_offset)
                    .checked_sub(i64::from(min_offset))
                    .and_then(|value| value.checked_add(1))
                    .map(|value| value as u64)
                    .unwrap_or(u64::MAX);

                min_offset + (self.next_u64() % span) as i32
            }
        }
    }

    fn next_jittered_position(
        &mut self,
        base_position: ClickPositionPoint,
        jitter: CursorJitterConfig,
    ) -> ClickPositionPoint {
        ClickPositionPoint {
            id: base_position.id,
            x: base_position
                .x
                .saturating_add(self.next_axis_offset(jitter.x_axis_px, jitter.mode)),
            y: base_position
                .y
                .saturating_add(self.next_axis_offset(jitter.y_axis_px, jitter.mode)),
        }
    }
}

#[derive(Clone, Copy)]
pub(crate) struct ClickCadence {
    pub(crate) base_interval_nanos: u64,
    pub(crate) interval_divisor: u64,
    pub(crate) remainder_nanos: u64,
}

pub(crate) enum DispatchMouseClicksOutcome {
    Completed(usize),
    EdgeStopTriggered(ClickPositionPoint),
}

const MIN_CLICK_RATE: u64 = 1;
const MAX_CLICK_RATE: u64 = 5_000;

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

pub(crate) fn dispatch_mouse_clicks<F>(
    mouse_button: MouseButton,
    count: usize,
    clicks_per_cycle: usize,
    double_click_delay: Option<Duration>,
    click_duration_range: Option<ClickDurationRange>,
    cursor_jitter: Option<CursorJitterConfig>,
    base_position: Option<ClickPositionPoint>,
    click_region: Option<OverlayRect>,
    edge_stop: Option<&EdgeStopRuntime>,
    randomizer: &mut ClickRandomizer,
    should_interrupt: &mut F,
) -> Result<DispatchMouseClicksOutcome, String>
where
    F: FnMut() -> bool,
{
    if count == 0 {
        return Ok(DispatchMouseClicksOutcome::Completed(0));
    }

    let cycle_size = clicks_per_cycle.max(1);
    let mut dispatched_click_count = 0_usize;

    for click_index in 0..count {
        let click_base_position = if let Some(base_position) = base_position {
            Some(base_position)
        } else if cursor_jitter.is_some() || click_region.is_some() {
            Some(current_cursor_position()?)
        } else {
            None
        };
        let mut should_click_on_restore = false;

        if let Some(base_position) = click_base_position {
            if let Some(click_region) = click_region {
                if !click_region_contains_position(click_region, base_position) {
                    return Ok(DispatchMouseClicksOutcome::Completed(
                        dispatched_click_count,
                    ));
                }
            }

            if edge_stop_matches_position(edge_stop, base_position) {
                return Ok(DispatchMouseClicksOutcome::EdgeStopTriggered(base_position));
            }

            let target_position = click_region
                .map(|region| {
                    clamp_position_to_region(
                        cursor_jitter
                            .map(|jitter| randomizer.next_jittered_position(base_position, jitter))
                            .unwrap_or(base_position),
                        region,
                    )
                })
                .unwrap_or_else(|| {
                    cursor_jitter
                        .map(|jitter| randomizer.next_jittered_position(base_position, jitter))
                        .unwrap_or(base_position)
                });
            if edge_stop_matches_position(edge_stop, target_position) {
                return Ok(DispatchMouseClicksOutcome::EdgeStopTriggered(
                    target_position,
                ));
            }
            should_click_on_restore =
                cursor_jitter.is_some() && !click_positions_match(target_position, base_position);
            move_cursor_to_position(target_position)?;
        }

        let interrupted = dispatch_single_mouse_click(
            mouse_button,
            click_duration_range,
            randomizer,
            should_interrupt,
        )?;
        dispatched_click_count += 1;
        if interrupted {
            return Ok(DispatchMouseClicksOutcome::Completed(
                dispatched_click_count,
            ));
        }

        if should_click_on_restore {
            if let Some(base_position) = click_base_position {
                if edge_stop_matches_position(edge_stop, base_position) {
                    return Ok(DispatchMouseClicksOutcome::EdgeStopTriggered(base_position));
                }
                move_cursor_to_position(base_position)?;
                let interrupted = dispatch_single_mouse_click(
                    mouse_button,
                    click_duration_range,
                    randomizer,
                    should_interrupt,
                )?;
                dispatched_click_count += 1;
                if interrupted {
                    return Ok(DispatchMouseClicksOutcome::Completed(
                        dispatched_click_count,
                    ));
                }
            }
        }

        let click_ends_cycle = (click_index + 1) % cycle_size == 0;
        if !click_ends_cycle && click_index + 1 < count {
            if let Some(double_click_delay) = double_click_delay {
                if !double_click_delay.is_zero()
                    && sleep_interruptibly(double_click_delay, should_interrupt)
                {
                    return Ok(DispatchMouseClicksOutcome::Completed(
                        dispatched_click_count,
                    ));
                }
            }
        }
    }

    Ok(DispatchMouseClicksOutcome::Completed(
        dispatched_click_count,
    ))
}

pub(crate) fn press_mouse_button(mouse_button: MouseButton) -> Result<(), String> {
    dispatch_mouse_button_event(mouse_button, true)
}

pub(crate) fn release_mouse_button(mouse_button: MouseButton) -> Result<(), String> {
    dispatch_mouse_button_event(mouse_button, false)
}

pub(crate) fn move_cursor_to_position(position: ClickPositionPoint) -> Result<(), String> {
    linux_x11::warp_pointer(position.x, position.y)
        .map_err(|_| "Unable to move cursor to the recorded click position.".to_string())
}

pub(crate) fn current_cursor_position() -> Result<ClickPositionPoint, String> {
    let (x, y) = linux_x11::pointer_position()
        .map_err(|_| "Unable to read the current cursor position.".to_string())?;

    Ok(ClickPositionPoint { id: 0, x, y })
}

fn click_positions_match(left: ClickPositionPoint, right: ClickPositionPoint) -> bool {
    left.x == right.x && left.y == right.y
}

fn click_region_contains_position(region: OverlayRect, position: ClickPositionPoint) -> bool {
    let right = region.x.saturating_add(region.width.max(0));
    let bottom = region.y.saturating_add(region.height.max(0));

    position.x >= region.x && position.x < right && position.y >= region.y && position.y < bottom
}

fn clamp_position_to_region(
    position: ClickPositionPoint,
    region: OverlayRect,
) -> ClickPositionPoint {
    let max_x = region
        .x
        .saturating_add(region.width.max(1))
        .saturating_sub(1);
    let max_y = region
        .y
        .saturating_add(region.height.max(1))
        .saturating_sub(1);

    ClickPositionPoint {
        id: position.id,
        x: position.x.clamp(region.x, max_x),
        y: position.y.clamp(region.y, max_y),
    }
}

fn edge_stop_matches_position(
    edge_stop: Option<&EdgeStopRuntime>,
    position: ClickPositionPoint,
) -> bool {
    edge_stop
        .map(|runtime| cursor_hits_edge_stop(runtime, position.x, position.y))
        .unwrap_or(false)
}

fn dispatch_single_mouse_click<F>(
    mouse_button: MouseButton,
    click_duration_range: Option<ClickDurationRange>,
    randomizer: &mut ClickRandomizer,
    should_interrupt: &mut F,
) -> Result<bool, String>
where
    F: FnMut() -> bool,
{
    dispatch_mouse_button_event(mouse_button, true)?;
    let interrupted = if let Some(click_duration_range) = click_duration_range {
        sleep_interruptibly(
            randomizer.next_duration(click_duration_range),
            should_interrupt,
        )
    } else {
        false
    };
    dispatch_mouse_button_event(mouse_button, false)?;
    Ok(interrupted)
}

fn sleep_interruptibly<F>(duration: Duration, should_interrupt: &mut F) -> bool
where
    F: FnMut() -> bool,
{
    const INTERRUPT_POLL_SLICE: Duration = Duration::from_millis(1);

    if duration.is_zero() {
        return should_interrupt();
    }

    let deadline = Instant::now() + duration;
    loop {
        if should_interrupt() {
            return true;
        }

        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return false;
        }

        if remaining <= INTERRUPT_POLL_SLICE {
            thread::sleep(remaining);
            return should_interrupt();
        }

        thread::sleep(INTERRUPT_POLL_SLICE);
    }
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
    let button = mouse_button_number(mouse_button);
    linux_x11::fake_button_event(button, is_down)
}

fn mouse_button_number(mouse_button: MouseButton) -> u32 {
    match mouse_button {
        MouseButton::Left => 1,
        MouseButton::Middle => 2,
        MouseButton::Right => 3,
        MouseButton::Mouse4 => 8,
        MouseButton::Mouse5 => 9,
    }
}
