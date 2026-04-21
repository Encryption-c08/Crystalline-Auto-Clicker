use std::{
    ffi::CString,
    ptr,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex, Once, OnceLock,
    },
    thread,
    time::{Duration, Instant},
};

use x11::{xinput2, xlib};

use crate::linux_x11;

#[derive(Clone, Copy, Default)]
pub(crate) struct InputSnapshot {
    pub(crate) modifiers: u8,
    pub(crate) mouse_buttons: u8,
}

#[derive(Clone, Copy)]
pub(crate) struct WheelEventRecord {
    pub(crate) occurred_at: Instant,
    pub(crate) snapshot: InputSnapshot,
}

#[derive(Default)]
struct RawMouseState {
    wheel_down: Option<WheelEventRecord>,
    wheel_up: Option<WheelEventRecord>,
    physical_mouse_buttons: u8,
}

pub(crate) const SNAPSHOT_CTRL_BIT: u8 = 1 << 0;
pub(crate) const SNAPSHOT_SHIFT_BIT: u8 = 1 << 1;
pub(crate) const SNAPSHOT_ALT_BIT: u8 = 1 << 2;
pub(crate) const SNAPSHOT_MOUSE1_BIT: u8 = 1 << 3;
pub(crate) const SNAPSHOT_MOUSE2_BIT: u8 = 1 << 4;
pub(crate) const SNAPSHOT_MOUSE3_BIT: u8 = 1 << 5;
pub(crate) const SNAPSHOT_MOUSE4_BIT: u8 = 1 << 6;
pub(crate) const SNAPSHOT_MOUSE5_BIT: u8 = 1 << 7;
pub(crate) const TOGGLE_WHEEL_PULSE: Duration = Duration::from_millis(40);

const XI_RAW_EVENT_MASK_SIZE: usize = ((xinput2::XI_RawButtonRelease as usize) / 8) + 1;

static INSTALL_RAW_MOUSE_MONITOR: Once = Once::new();
static RAW_MOUSE_STATE: OnceLock<Mutex<RawMouseState>> = OnceLock::new();
static RAW_MOUSE_MONITOR_READY: AtomicBool = AtomicBool::new(false);

pub(crate) fn ensure_raw_mouse_monitor() {
    INSTALL_RAW_MOUSE_MONITOR.call_once(|| {
        thread::spawn(|| unsafe {
            run_raw_mouse_monitor();
        });
    });
}

pub(crate) fn latest_wheel_up_event() -> Option<WheelEventRecord> {
    raw_mouse_state()
        .lock()
        .ok()
        .and_then(|state| state.wheel_up)
}

pub(crate) fn latest_wheel_down_event() -> Option<WheelEventRecord> {
    raw_mouse_state()
        .lock()
        .ok()
        .and_then(|state| state.wheel_down)
}

pub(crate) fn physical_mouse_buttons() -> Option<u8> {
    if !RAW_MOUSE_MONITOR_READY.load(Ordering::Relaxed) {
        return None;
    }

    raw_mouse_state()
        .lock()
        .ok()
        .map(|state| state.physical_mouse_buttons)
}

pub(crate) fn capture_input_snapshot() -> InputSnapshot {
    let mut snapshot = InputSnapshot::default();

    if let Ok(mouse_buttons) = current_mouse_buttons() {
        snapshot.mouse_buttons = mouse_buttons;
    }

    let _ = linux_x11::with_display(|display| {
        let keymap = linux_x11::query_keymap(display);

        if linux_x11::any_keysym_name_pressed(display, &keymap, &["Control_L", "Control_R"]) {
            snapshot.modifiers |= SNAPSHOT_CTRL_BIT;
        }

        if linux_x11::any_keysym_name_pressed(display, &keymap, &["Shift_L", "Shift_R"]) {
            snapshot.modifiers |= SNAPSHOT_SHIFT_BIT;
        }

        if linux_x11::any_keysym_name_pressed(
            display,
            &keymap,
            &["Alt_L", "Alt_R", "Meta_L", "Meta_R"],
        ) {
            snapshot.modifiers |= SNAPSHOT_ALT_BIT;
        }

        Ok(())
    });

    snapshot
}

fn raw_mouse_state() -> &'static Mutex<RawMouseState> {
    RAW_MOUSE_STATE.get_or_init(|| Mutex::new(RawMouseState::default()))
}

fn current_mouse_buttons() -> Result<u8, String> {
    let tracked_buttons = physical_mouse_buttons().unwrap_or_default();
    linux_x11::with_display(|display| {
        let pointer = linux_x11::query_pointer(display)?;
        let mut buttons = tracked_buttons;

        if (pointer.mask & xlib::Button1Mask) != 0 {
            buttons |= SNAPSHOT_MOUSE1_BIT;
        } else {
            buttons &= !SNAPSHOT_MOUSE1_BIT;
        }

        if (pointer.mask & xlib::Button3Mask) != 0 {
            buttons |= SNAPSHOT_MOUSE2_BIT;
        } else {
            buttons &= !SNAPSHOT_MOUSE2_BIT;
        }

        if (pointer.mask & xlib::Button2Mask) != 0 {
            buttons |= SNAPSHOT_MOUSE3_BIT;
        } else {
            buttons &= !SNAPSHOT_MOUSE3_BIT;
        }

        Ok(buttons)
    })
}

unsafe fn run_raw_mouse_monitor() {
    let display = xlib::XOpenDisplay(ptr::null());
    if display.is_null() {
        log::warn!("unable to connect to the X11 display for raw mouse monitoring");
        return;
    }

    let extension_name =
        CString::new("XInputExtension").expect("XInput extension name should be valid");
    let mut xi_opcode = 0;
    let mut first_event = 0;
    let mut first_error = 0;
    if xlib::XQueryExtension(
        display,
        extension_name.as_ptr(),
        &mut xi_opcode,
        &mut first_event,
        &mut first_error,
    ) == 0
    {
        log::warn!("XInput2 is unavailable; extra mouse-button and wheel hotkeys will be limited");
        xlib::XCloseDisplay(display);
        return;
    }

    let mut major = xinput2::XI_2_Major;
    let mut minor = 0;
    if xinput2::XIQueryVersion(display, &mut major, &mut minor) != xlib::Success as i32 {
        log::warn!(
            "unable to initialize XInput2; extra mouse-button and wheel hotkeys will be limited"
        );
        xlib::XCloseDisplay(display);
        return;
    }

    let root_window = xlib::XDefaultRootWindow(display);
    let mut mask = [0_u8; XI_RAW_EVENT_MASK_SIZE];
    xinput2::XISetMask(&mut mask, xinput2::XI_RawButtonPress);
    xinput2::XISetMask(&mut mask, xinput2::XI_RawButtonRelease);

    let mut event_mask = xinput2::XIEventMask {
        deviceid: xinput2::XIAllMasterDevices,
        mask_len: mask.len() as i32,
        mask: mask.as_mut_ptr(),
    };

    if xinput2::XISelectEvents(display, root_window, &mut event_mask, 1) != xlib::Success as i32 {
        log::warn!("unable to register XInput2 raw button monitoring");
        xlib::XCloseDisplay(display);
        return;
    }

    if let Ok(pointer) = linux_x11::query_pointer(display) {
        let mut buttons = 0_u8;
        if (pointer.mask & xlib::Button1Mask) != 0 {
            buttons |= SNAPSHOT_MOUSE1_BIT;
        }
        if (pointer.mask & xlib::Button3Mask) != 0 {
            buttons |= SNAPSHOT_MOUSE2_BIT;
        }
        if (pointer.mask & xlib::Button2Mask) != 0 {
            buttons |= SNAPSHOT_MOUSE3_BIT;
        }
        set_physical_mouse_buttons(buttons);
    }

    RAW_MOUSE_MONITOR_READY.store(true, Ordering::Relaxed);
    xlib::XFlush(display);

    loop {
        let mut event = std::mem::zeroed::<xlib::XEvent>();
        xlib::XNextEvent(display, &mut event);

        if event.type_ != xlib::GenericEvent {
            continue;
        }

        let cookie = &mut event.generic_event_cookie;
        if cookie.extension != xi_opcode || xlib::XGetEventData(display, cookie) == 0 {
            continue;
        }

        if cookie.evtype == xinput2::XI_RawButtonPress
            || cookie.evtype == xinput2::XI_RawButtonRelease
        {
            let raw_event = &*(cookie.data as *const xinput2::XIRawEvent);
            handle_raw_button_event(
                raw_event.detail as u32,
                cookie.evtype == xinput2::XI_RawButtonPress,
            );
        }

        xlib::XFreeEventData(display, cookie);
    }
}

fn handle_raw_button_event(button: u32, pressed: bool) {
    match button {
        1 => set_physical_mouse_button_state(SNAPSHOT_MOUSE1_BIT, pressed),
        2 => set_physical_mouse_button_state(SNAPSHOT_MOUSE3_BIT, pressed),
        3 => set_physical_mouse_button_state(SNAPSHOT_MOUSE2_BIT, pressed),
        4 if pressed => record_wheel_up_event(),
        5 if pressed => record_wheel_down_event(),
        8 => set_physical_mouse_button_state(SNAPSHOT_MOUSE4_BIT, pressed),
        9 => set_physical_mouse_button_state(SNAPSHOT_MOUSE5_BIT, pressed),
        _ => {}
    }
}

fn record_wheel_up_event() {
    record_wheel_event(true);
}

fn record_wheel_down_event() {
    record_wheel_event(false);
}

fn record_wheel_event(is_up: bool) {
    let snapshot = capture_input_snapshot();
    let record = WheelEventRecord {
        occurred_at: Instant::now(),
        snapshot,
    };

    let Ok(mut state) = raw_mouse_state().lock() else {
        return;
    };

    if is_up {
        state.wheel_up = Some(record);
    } else {
        state.wheel_down = Some(record);
    }
}

fn set_physical_mouse_buttons(buttons: u8) {
    let Ok(mut state) = raw_mouse_state().lock() else {
        return;
    };

    state.physical_mouse_buttons = buttons;
}

fn set_physical_mouse_button_state(button_bit: u8, pressed: bool) {
    let Ok(mut state) = raw_mouse_state().lock() else {
        return;
    };

    if pressed {
        state.physical_mouse_buttons |= button_bit;
    } else {
        state.physical_mouse_buttons &= !button_bit;
    }
}
