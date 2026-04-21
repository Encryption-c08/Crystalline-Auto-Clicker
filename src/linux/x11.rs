use std::{cell::RefCell, ffi::CString, ptr, sync::Once};

use x11::{xlib, xtest};

pub(crate) struct PointerState {
    pub(crate) child_window: xlib::Window,
    pub(crate) x: i32,
    pub(crate) y: i32,
    pub(crate) mask: u32,
}

struct ThreadDisplay(*mut xlib::Display);

impl Drop for ThreadDisplay {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                xlib::XCloseDisplay(self.0);
            }
        }
    }
}

thread_local! {
    static THREAD_DISPLAY: RefCell<Option<ThreadDisplay>> = const { RefCell::new(None) };
}

static INIT_X11_THREADS: Once = Once::new();

pub(crate) fn with_display<T>(
    callback: impl FnOnce(*mut xlib::Display) -> Result<T, String>,
) -> Result<T, String> {
    INIT_X11_THREADS.call_once(|| unsafe {
        xlib::XInitThreads();
    });

    THREAD_DISPLAY.with(|slot| {
        if slot.borrow().is_none() {
            let display = unsafe { xlib::XOpenDisplay(ptr::null()) };
            if display.is_null() {
                return Err("Unable to connect to the X11 display.".into());
            }

            *slot.borrow_mut() = Some(ThreadDisplay(display));
        }

        let display = slot
            .borrow()
            .as_ref()
            .map(|thread_display| thread_display.0)
            .ok_or_else(|| "Unable to connect to the X11 display.".to_string())?;

        callback(display)
    })
}

pub(crate) fn query_keymap(display: *mut xlib::Display) -> [u8; 32] {
    let mut raw_keymap = [0_i8; 32];
    unsafe {
        xlib::XQueryKeymap(display, raw_keymap.as_mut_ptr());
    }

    let mut keymap = [0_u8; 32];
    for (index, value) in raw_keymap.into_iter().enumerate() {
        keymap[index] = value as u8;
    }

    keymap
}

pub(crate) fn keysym_name_pressed(
    display: *mut xlib::Display,
    keymap: &[u8; 32],
    keysym_name: &str,
) -> bool {
    let Some(keycode) = keycode_from_keysym_name(display, keysym_name) else {
        return false;
    };

    let key_index = usize::from(keycode / 8);
    let key_mask = 1_u8 << (keycode % 8);

    keymap
        .get(key_index)
        .map(|pressed_byte| (*pressed_byte & key_mask) != 0)
        .unwrap_or(false)
}

pub(crate) fn any_keysym_name_pressed(
    display: *mut xlib::Display,
    keymap: &[u8; 32],
    keysym_names: &[&str],
) -> bool {
    keysym_names
        .iter()
        .copied()
        .any(|keysym_name| keysym_name_pressed(display, keymap, keysym_name))
}

pub(crate) fn query_pointer(display: *mut xlib::Display) -> Result<PointerState, String> {
    let root_window = unsafe { xlib::XDefaultRootWindow(display) };
    let mut root_return: xlib::Window = 0;
    let mut child_return: xlib::Window = 0;
    let mut root_x = 0;
    let mut root_y = 0;
    let mut window_x = 0;
    let mut window_y = 0;
    let mut mask_return = 0_u32;

    let query_succeeded = unsafe {
        xlib::XQueryPointer(
            display,
            root_window,
            &mut root_return,
            &mut child_return,
            &mut root_x,
            &mut root_y,
            &mut window_x,
            &mut window_y,
            &mut mask_return,
        )
    } != 0;

    if !query_succeeded {
        return Err("Unable to query the X11 pointer state.".into());
    }

    Ok(PointerState {
        child_window: child_return,
        x: root_x,
        y: root_y,
        mask: mask_return,
    })
}

pub(crate) fn pointer_position() -> Result<(i32, i32), String> {
    with_display(|display| {
        let pointer = query_pointer(display)?;
        Ok((pointer.x, pointer.y))
    })
}

pub(crate) fn warp_pointer(x: i32, y: i32) -> Result<(), String> {
    with_display(|display| {
        let root_window = unsafe { xlib::XDefaultRootWindow(display) };

        unsafe {
            xlib::XWarpPointer(display, 0, root_window, 0, 0, 0, 0, x, y);
            xlib::XFlush(display);
        }

        Ok(())
    })
}

pub(crate) fn fake_button_event(button: u32, pressed: bool) -> Result<(), String> {
    with_display(|display| {
        let sent = unsafe {
            xtest::XTestFakeButtonEvent(
                display,
                button,
                if pressed { 1 } else { 0 },
                xlib::CurrentTime,
            )
        };

        unsafe {
            xlib::XFlush(display);
        }

        if sent == 0 {
            return Err(format!("Unable to inject X11 mouse button {button} event."));
        }

        Ok(())
    })
}

pub(crate) fn display_size() -> Result<(i32, i32), String> {
    with_display(|display| {
        let screen = unsafe { xlib::XDefaultScreen(display) };
        let width = unsafe { xlib::XDisplayWidth(display, screen) };
        let height = unsafe { xlib::XDisplayHeight(display, screen) };
        Ok((width.max(1), height.max(1)))
    })
}

fn keycode_from_keysym_name(display: *mut xlib::Display, keysym_name: &str) -> Option<u8> {
    let keysym_name = CString::new(keysym_name).ok()?;
    let keysym = unsafe { xlib::XStringToKeysym(keysym_name.as_ptr()) };
    if keysym == xlib::NoSymbol as xlib::KeySym {
        return None;
    }

    let keycode = unsafe { xlib::XKeysymToKeycode(display, keysym as _) };
    if keycode == 0 {
        None
    } else {
        Some(keycode)
    }
}
