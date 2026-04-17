use std::{
    collections::HashSet,
    sync::{Mutex, Once, OnceLock},
    thread,
    time::{Duration, Instant},
};

use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_ADD, VK_BACK, VK_CONTROL, VK_DECIMAL, VK_DELETE, VK_DIVIDE, VK_DOWN,
    VK_END, VK_ESCAPE, VK_F1, VK_HOME, VK_INSERT, VK_LBUTTON, VK_LEFT, VK_MBUTTON, VK_MENU,
    VK_MULTIPLY, VK_NEXT, VK_NUMPAD0, VK_PRIOR, VK_RBUTTON, VK_RETURN, VK_RIGHT, VK_SHIFT,
    VK_SPACE, VK_SUBTRACT, VK_TAB, VK_UP, VK_XBUTTON1, VK_XBUTTON2,
};
use windows_sys::Win32::{
    Foundation::{LPARAM, LRESULT, WPARAM},
    UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage,
        HC_ACTION, LLMHF_INJECTED, MSG, MSLLHOOKSTRUCT, WH_MOUSE_LL, WM_LBUTTONDOWN,
        WM_LBUTTONUP, WM_MBUTTONDOWN, WM_MBUTTONUP, WM_MOUSEWHEEL, WM_RBUTTONDOWN, WM_RBUTTONUP,
        WM_XBUTTONDOWN, WM_XBUTTONUP,
    },
};

use super::ClickMode;

#[derive(Clone)]
struct HotkeyPart {
    code: String,
    label: String,
    is_modifier: bool,
    kind: HotkeyPartKind,
}

pub(crate) struct ParsedHotkey {
    parts: Vec<HotkeyPart>,
}

#[derive(Clone, Debug)]
pub(crate) struct CapturedHotkey {
    pub code: String,
    pub label: String,
    pub source: String,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum HotkeyPartKind {
    VirtualKey(i32),
    Wheel(WheelDirection),
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum WheelDirection {
    Up,
    Down,
}

#[derive(Clone, Copy, Default)]
struct InputSnapshot {
    modifiers: u8,
    mouse_buttons: u8,
}

#[derive(Clone, Copy)]
struct WheelEventRecord {
    occurred_at: Instant,
    snapshot: InputSnapshot,
}

#[derive(Default)]
struct MouseWheelState {
    wheel_down: Option<WheelEventRecord>,
    wheel_up: Option<WheelEventRecord>,
    physical_mouse_buttons: u8,
}

const SNAPSHOT_CTRL_BIT: u8 = 1 << 0;
const SNAPSHOT_SHIFT_BIT: u8 = 1 << 1;
const SNAPSHOT_ALT_BIT: u8 = 1 << 2;
const SNAPSHOT_MOUSE1_BIT: u8 = 1 << 3;
const SNAPSHOT_MOUSE2_BIT: u8 = 1 << 4;
const SNAPSHOT_MOUSE3_BIT: u8 = 1 << 5;
const SNAPSHOT_MOUSE4_BIT: u8 = 1 << 6;
const SNAPSHOT_MOUSE5_BIT: u8 = 1 << 7;
const TOGGLE_WHEEL_PULSE: Duration = Duration::from_millis(40);
const XBUTTON1_DATA: u16 = 0x0001;
const XBUTTON2_DATA: u16 = 0x0002;

static INSTALL_MOUSE_WHEEL_HOOK: Once = Once::new();
static MOUSE_WHEEL_STATE: OnceLock<Mutex<MouseWheelState>> = OnceLock::new();

impl ParsedHotkey {
    fn normalized_code(&self) -> String {
        self.parts
            .iter()
            .map(|part| part.code.as_str())
            .collect::<Vec<_>>()
            .join("+")
    }

    fn label(&self) -> String {
        self.parts
            .iter()
            .map(|part| part.label.as_str())
            .collect::<Vec<_>>()
            .join(" + ")
    }

    fn has_trigger_part(&self) -> bool {
        self.parts.iter().any(|part| !part.is_modifier)
    }

    fn wheel_direction(&self) -> Option<WheelDirection> {
        self.parts.iter().find_map(|part| match part.kind {
            HotkeyPartKind::Wheel(direction) => Some(direction),
            HotkeyPartKind::VirtualKey(_) => None,
        })
    }

    fn non_wheel_parts(&self) -> impl Iterator<Item = &HotkeyPart> {
        self.parts.iter().filter(|part| matches!(part.kind, HotkeyPartKind::VirtualKey(_)))
    }

    fn has_mouse_button_part(&self) -> bool {
        self.parts
            .iter()
            .any(|part| mouse_button_snapshot_bit(&part.code).is_some())
    }
}

pub(crate) fn parse_hotkey_code(code: &str) -> Result<Option<ParsedHotkey>, String> {
    let trimmed_code = code.trim();
    if trimmed_code.is_empty() {
        return Ok(None);
    }

    let mut unique_codes = HashSet::new();
    let mut parsed_parts = Vec::new();

    for raw_part in hotkey_code_parts(trimmed_code) {
        let part = hotkey_part_from_code(raw_part)
            .ok_or_else(|| format!("Unsupported hotkey code: {code}"))?;

        if unique_codes.insert(part.code.clone()) {
            parsed_parts.push(part);
        }
    }

    if parsed_parts.is_empty() {
        return Ok(None);
    }

    let mut modifiers = parsed_parts
        .iter()
        .filter(|part| part.is_modifier)
        .cloned()
        .collect::<Vec<_>>();
    modifiers.sort_by_key(|part| modifier_sort_index(&part.code));

    let triggers = parsed_parts
        .into_iter()
        .filter(|part| !part.is_modifier)
        .collect::<Vec<_>>();

    modifiers.extend(triggers);

    Ok(Some(ParsedHotkey { parts: modifiers }))
}

pub(crate) fn validate_hotkey_code(code: &str) -> Result<(), String> {
    let Some(parsed_hotkey) = parse_hotkey_code(code)? else {
        return Ok(());
    };

    if !parsed_hotkey.has_trigger_part() {
        return Err(format!("Unsupported hotkey code: {code}"));
    }

    Ok(())
}

pub(crate) fn normalize_hotkey_code(code: &str) -> Result<String, String> {
    Ok(parse_hotkey_code(code)?
        .map(|parsed_hotkey| parsed_hotkey.normalized_code())
        .unwrap_or_default())
}

pub(crate) fn format_hotkey_label(code: &str) -> Result<String, String> {
    Ok(parse_hotkey_code(code)?
        .map(|parsed_hotkey| parsed_hotkey.label())
        .unwrap_or_else(|| "Unbound".into()))
}

pub(crate) fn read_hotkey_state(code: &str, click_mode: ClickMode) -> Result<bool, String> {
    let Some(parsed_hotkey) = parse_hotkey_code(code)? else {
        return Ok(false);
    };

    if let Some(wheel_direction) = parsed_hotkey.wheel_direction() {
        ensure_mouse_wheel_hook();

        return Ok(match click_mode {
            ClickMode::Hold => {
                read_hold_wheel_hotkey_state(&parsed_hotkey, wheel_direction)
            }
            ClickMode::Toggle => {
                read_toggle_wheel_hotkey_state(&parsed_hotkey, wheel_direction)
            }
        });
    }

    if parsed_hotkey.has_mouse_button_part() {
        ensure_mouse_wheel_hook();
    }

    for part in parsed_hotkey.non_wheel_parts() {
        if !is_hotkey_part_pressed(part) {
            return Ok(false);
        }
    }

    Ok(true)
}

pub(crate) fn read_pressed_keyboard_hotkey() -> Result<Option<CapturedHotkey>, String> {
    let mut parts = Vec::new();

    if is_virtual_key_pressed(VK_CONTROL as i32) {
        parts.push(simple_hotkey_part(
            "Ctrl",
            "Ctrl",
            HotkeyPartKind::VirtualKey(VK_CONTROL.into()),
            true,
        ));
    }

    if is_virtual_key_pressed(VK_SHIFT as i32) {
        parts.push(simple_hotkey_part(
            "Shift",
            "Shift",
            HotkeyPartKind::VirtualKey(VK_SHIFT.into()),
            true,
        ));
    }

    if is_virtual_key_pressed(VK_MENU as i32) {
        parts.push(simple_hotkey_part(
            "Alt",
            "Alt",
            HotkeyPartKind::VirtualKey(VK_MENU.into()),
            true,
        ));
    }

    push_pressed_key(&mut parts, "Space", "Space", VK_SPACE as i32);
    push_pressed_key(&mut parts, "Tab", "Tab", VK_TAB as i32);
    push_pressed_key(&mut parts, "Enter", "Enter", VK_RETURN as i32);
    push_pressed_key(&mut parts, "Escape", "Esc", VK_ESCAPE as i32);
    push_pressed_key(&mut parts, "Backspace", "Backspace", VK_BACK as i32);
    push_pressed_key(&mut parts, "Delete", "Delete", VK_DELETE as i32);
    push_pressed_key(&mut parts, "Insert", "Insert", VK_INSERT as i32);
    push_pressed_key(&mut parts, "Home", "Home", VK_HOME as i32);
    push_pressed_key(&mut parts, "End", "End", VK_END as i32);
    push_pressed_key(&mut parts, "PageUp", "PgUp", VK_PRIOR as i32);
    push_pressed_key(&mut parts, "PageDown", "PgDn", VK_NEXT as i32);
    push_pressed_key(&mut parts, "ArrowUp", "Up", VK_UP as i32);
    push_pressed_key(&mut parts, "ArrowDown", "Down", VK_DOWN as i32);
    push_pressed_key(&mut parts, "ArrowLeft", "Left", VK_LEFT as i32);
    push_pressed_key(&mut parts, "ArrowRight", "Right", VK_RIGHT as i32);
    push_pressed_key(&mut parts, "NumpadAdd", "Num +", VK_ADD as i32);
    push_pressed_key(&mut parts, "NumpadSubtract", "Num -", VK_SUBTRACT as i32);
    push_pressed_key(&mut parts, "NumpadMultiply", "Num *", VK_MULTIPLY as i32);
    push_pressed_key(&mut parts, "NumpadDivide", "Num /", VK_DIVIDE as i32);
    push_pressed_key(&mut parts, "NumpadDecimal", "Num .", VK_DECIMAL as i32);

    for letter in b'A'..=b'Z' {
        let virtual_key = letter as i32;
        if is_virtual_key_pressed(virtual_key) {
            let letter = letter as char;
            parts.push(simple_hotkey_part(
                &format!("Key{letter}"),
                &letter.to_string(),
                HotkeyPartKind::VirtualKey(virtual_key),
                false,
            ));
        }
    }

    for digit in b'0'..=b'9' {
        let virtual_key = digit as i32;
        if is_virtual_key_pressed(virtual_key) {
            let digit = digit as char;
            parts.push(simple_hotkey_part(
                &format!("Digit{digit}"),
                &digit.to_string(),
                HotkeyPartKind::VirtualKey(virtual_key),
                false,
            ));
        }
    }

    for value in 0..=9 {
        let virtual_key = VK_NUMPAD0 as i32 + value;
        if is_virtual_key_pressed(virtual_key) {
            let digit = char::from(b'0' + value as u8);
            parts.push(simple_hotkey_part(
                &format!("Numpad{digit}"),
                &format!("Num {digit}"),
                HotkeyPartKind::VirtualKey(virtual_key),
                false,
            ));
        }
    }

    for value in 1..=24 {
        let virtual_key = VK_F1 as i32 + (value - 1);
        if is_virtual_key_pressed(virtual_key) {
            parts.push(simple_hotkey_part(
                &format!("F{value}"),
                &format!("F{value}"),
                HotkeyPartKind::VirtualKey(virtual_key),
                false,
            ));
        }
    }

    if !parts.iter().any(|part| !part.is_modifier) {
        return Ok(None);
    }

    Ok(Some(CapturedHotkey {
        code: parts
            .iter()
            .map(|part| part.code.as_str())
            .collect::<Vec<_>>()
            .join("+"),
        label: parts
            .iter()
            .map(|part| part.label.as_str())
            .collect::<Vec<_>>()
            .join(" + "),
        source: "keyboard".to_string(),
    }))
}

fn read_toggle_wheel_hotkey_state(
    parsed_hotkey: &ParsedHotkey,
    wheel_direction: WheelDirection,
) -> bool {
    let Some(record) = latest_wheel_event(wheel_direction) else {
        return false;
    };

    if record.occurred_at.elapsed() > TOGGLE_WHEEL_PULSE {
        return false;
    }

    snapshot_matches_hotkey(record.snapshot, parsed_hotkey)
}

fn read_hold_wheel_hotkey_state(
    parsed_hotkey: &ParsedHotkey,
    wheel_direction: WheelDirection,
) -> bool {
    let Some(record) = latest_wheel_event(wheel_direction) else {
        return false;
    };

    if record.occurred_at.elapsed() > TOGGLE_WHEEL_PULSE {
        return false;
    }

    if !snapshot_matches_hotkey(record.snapshot, parsed_hotkey) {
        return false;
    }

    non_wheel_parts_pressed(parsed_hotkey)
}

fn non_wheel_parts_pressed(parsed_hotkey: &ParsedHotkey) -> bool {
    parsed_hotkey
        .non_wheel_parts()
        .all(is_hotkey_part_pressed)
}

fn snapshot_matches_hotkey(snapshot: InputSnapshot, parsed_hotkey: &ParsedHotkey) -> bool {
    parsed_hotkey.non_wheel_parts().all(|part| snapshot_matches_part(snapshot, part))
}

fn snapshot_matches_part(snapshot: InputSnapshot, part: &HotkeyPart) -> bool {
    match part.code.as_str() {
        "Ctrl" => (snapshot.modifiers & SNAPSHOT_CTRL_BIT) != 0,
        "Shift" => (snapshot.modifiers & SNAPSHOT_SHIFT_BIT) != 0,
        "Alt" => (snapshot.modifiers & SNAPSHOT_ALT_BIT) != 0,
        "Mouse1" => (snapshot.mouse_buttons & SNAPSHOT_MOUSE1_BIT) != 0,
        "Mouse2" => (snapshot.mouse_buttons & SNAPSHOT_MOUSE2_BIT) != 0,
        "Mouse3" => (snapshot.mouse_buttons & SNAPSHOT_MOUSE3_BIT) != 0,
        "Mouse4" => (snapshot.mouse_buttons & SNAPSHOT_MOUSE4_BIT) != 0,
        "Mouse5" => (snapshot.mouse_buttons & SNAPSHOT_MOUSE5_BIT) != 0,
        _ => match part.kind {
            HotkeyPartKind::VirtualKey(virtual_key) => is_virtual_key_pressed(virtual_key),
            HotkeyPartKind::Wheel(_) => true,
        },
    }
}

fn latest_wheel_event(direction: WheelDirection) -> Option<WheelEventRecord> {
    mouse_wheel_state()
        .lock()
        .ok()
        .and_then(|state| match direction {
            WheelDirection::Down => state.wheel_down,
            WheelDirection::Up => state.wheel_up,
        })
}

fn mouse_wheel_state() -> &'static Mutex<MouseWheelState> {
    MOUSE_WHEEL_STATE.get_or_init(|| {
        Mutex::new(MouseWheelState {
            wheel_down: None,
            wheel_up: None,
            physical_mouse_buttons: 0,
        })
    })
}

fn ensure_mouse_wheel_hook() {
    INSTALL_MOUSE_WHEEL_HOOK.call_once(|| {
        thread::spawn(|| unsafe {
            let hook = SetWindowsHookExW(
                WH_MOUSE_LL,
                Some(mouse_hook_proc),
                std::ptr::null_mut(),
                0,
            );

            if hook.is_null() {
                log::warn!("unable to install global mouse hook for wheel hotkeys");
                return;
            }

            let mut message = MSG::default();
            while GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) > 0 {
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }

            let _ = windows_sys::Win32::UI::WindowsAndMessaging::UnhookWindowsHookEx(hook);
        });
    });
}

unsafe extern "system" fn mouse_hook_proc(
    code: i32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if code == HC_ACTION as i32 {
        let mouse_info = &*(lparam as *const MSLLHOOKSTRUCT);
        if (mouse_info.flags & LLMHF_INJECTED) == 0 {
            match wparam as u32 {
                WM_LBUTTONDOWN => set_physical_mouse_button_state(SNAPSHOT_MOUSE1_BIT, true),
                WM_LBUTTONUP => set_physical_mouse_button_state(SNAPSHOT_MOUSE1_BIT, false),
                WM_RBUTTONDOWN => set_physical_mouse_button_state(SNAPSHOT_MOUSE2_BIT, true),
                WM_RBUTTONUP => set_physical_mouse_button_state(SNAPSHOT_MOUSE2_BIT, false),
                WM_MBUTTONDOWN => set_physical_mouse_button_state(SNAPSHOT_MOUSE3_BIT, true),
                WM_MBUTTONUP => set_physical_mouse_button_state(SNAPSHOT_MOUSE3_BIT, false),
                WM_XBUTTONDOWN | WM_XBUTTONUP => {
                    let xbutton = ((mouse_info.mouseData >> 16) & 0xffff) as u16;
                    let button_bit = match xbutton {
                        XBUTTON1_DATA => Some(SNAPSHOT_MOUSE4_BIT),
                        XBUTTON2_DATA => Some(SNAPSHOT_MOUSE5_BIT),
                        _ => None,
                    };

                    if let Some(button_bit) = button_bit {
                        set_physical_mouse_button_state(
                            button_bit,
                            (wparam as u32) == WM_XBUTTONDOWN,
                        );
                    }
                }
                WM_MOUSEWHEEL => {
                    let delta = ((mouse_info.mouseData >> 16) & 0xffff) as u16 as i16;

                    if delta != 0 {
                        record_wheel_event(if delta > 0 {
                            WheelDirection::Up
                        } else {
                            WheelDirection::Down
                        });
                    }
                }
                _ => {}
            }
        }
    }

    CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
}

fn record_wheel_event(direction: WheelDirection) {
    let snapshot = capture_input_snapshot();
    let state = mouse_wheel_state();
    let Ok(mut state) = state.lock() else {
        return;
    };

    let record = WheelEventRecord {
        occurred_at: Instant::now(),
        snapshot,
    };

    match direction {
        WheelDirection::Down => state.wheel_down = Some(record),
        WheelDirection::Up => state.wheel_up = Some(record),
    }
}

fn set_physical_mouse_button_state(button_bit: u8, pressed: bool) {
    let state = mouse_wheel_state();
    let Ok(mut state) = state.lock() else {
        return;
    };

    if pressed {
        state.physical_mouse_buttons |= button_bit;
    } else {
        state.physical_mouse_buttons &= !button_bit;
    }
}

fn physical_mouse_buttons() -> Option<u8> {
    mouse_wheel_state()
        .lock()
        .ok()
        .map(|state| state.physical_mouse_buttons)
}

fn capture_input_snapshot() -> InputSnapshot {
    let mut snapshot = InputSnapshot::default();

    if is_virtual_key_pressed(VK_CONTROL as i32) {
        snapshot.modifiers |= SNAPSHOT_CTRL_BIT;
    }

    if is_virtual_key_pressed(VK_SHIFT as i32) {
        snapshot.modifiers |= SNAPSHOT_SHIFT_BIT;
    }

    if is_virtual_key_pressed(VK_MENU as i32) {
        snapshot.modifiers |= SNAPSHOT_ALT_BIT;
    }

    if is_virtual_key_pressed(VK_LBUTTON as i32) {
        snapshot.mouse_buttons |= SNAPSHOT_MOUSE1_BIT;
    }

    if is_virtual_key_pressed(VK_RBUTTON as i32) {
        snapshot.mouse_buttons |= SNAPSHOT_MOUSE2_BIT;
    }

    if is_virtual_key_pressed(VK_MBUTTON as i32) {
        snapshot.mouse_buttons |= SNAPSHOT_MOUSE3_BIT;
    }

    if is_virtual_key_pressed(VK_XBUTTON1 as i32) {
        snapshot.mouse_buttons |= SNAPSHOT_MOUSE4_BIT;
    }

    if is_virtual_key_pressed(VK_XBUTTON2 as i32) {
        snapshot.mouse_buttons |= SNAPSHOT_MOUSE5_BIT;
    }

    snapshot
}

fn is_hotkey_part_pressed(part: &HotkeyPart) -> bool {
    if let Some(button_bit) = mouse_button_snapshot_bit(&part.code) {
        return physical_mouse_buttons()
            .map(|pressed_buttons| (pressed_buttons & button_bit) != 0)
            .unwrap_or_else(|| match part.kind {
                HotkeyPartKind::VirtualKey(virtual_key) => is_virtual_key_pressed(virtual_key),
                HotkeyPartKind::Wheel(_) => true,
            });
    }

    match part.kind {
        HotkeyPartKind::VirtualKey(virtual_key) => is_virtual_key_pressed(virtual_key),
        HotkeyPartKind::Wheel(_) => true,
    }
}

fn mouse_button_snapshot_bit(code: &str) -> Option<u8> {
    match code {
        "Mouse1" => Some(SNAPSHOT_MOUSE1_BIT),
        "Mouse2" => Some(SNAPSHOT_MOUSE2_BIT),
        "Mouse3" => Some(SNAPSHOT_MOUSE3_BIT),
        "Mouse4" => Some(SNAPSHOT_MOUSE4_BIT),
        "Mouse5" => Some(SNAPSHOT_MOUSE5_BIT),
        _ => None,
    }
}

fn hotkey_code_parts(code: &str) -> impl Iterator<Item = &str> {
    code.split('+').map(str::trim).filter(|part| !part.is_empty())
}

fn hotkey_part_from_code(code: &str) -> Option<HotkeyPart> {
    let trimmed_code = code.trim();

    match trimmed_code {
        "Ctrl" => Some(simple_hotkey_part(
            trimmed_code,
            "Ctrl",
            HotkeyPartKind::VirtualKey(VK_CONTROL.into()),
            true,
        )),
        "Shift" => Some(simple_hotkey_part(
            trimmed_code,
            "Shift",
            HotkeyPartKind::VirtualKey(VK_SHIFT.into()),
            true,
        )),
        "Alt" => Some(simple_hotkey_part(
            trimmed_code,
            "Alt",
            HotkeyPartKind::VirtualKey(VK_MENU.into()),
            true,
        )),
        "Space" => Some(simple_hotkey_part(
            trimmed_code,
            "Space",
            HotkeyPartKind::VirtualKey(VK_SPACE.into()),
            false,
        )),
        "Tab" => Some(simple_hotkey_part(
            trimmed_code,
            "Tab",
            HotkeyPartKind::VirtualKey(VK_TAB.into()),
            false,
        )),
        "Enter" | "NumpadEnter" => Some(simple_hotkey_part(
            trimmed_code,
            if trimmed_code == "NumpadEnter" {
                "Num Enter"
            } else {
                "Enter"
            },
            HotkeyPartKind::VirtualKey(VK_RETURN.into()),
            false,
        )),
        "Escape" => Some(simple_hotkey_part(
            trimmed_code,
            "Esc",
            HotkeyPartKind::VirtualKey(VK_ESCAPE.into()),
            false,
        )),
        "Backspace" => Some(simple_hotkey_part(
            trimmed_code,
            "Backspace",
            HotkeyPartKind::VirtualKey(VK_BACK.into()),
            false,
        )),
        "Delete" => Some(simple_hotkey_part(
            trimmed_code,
            "Delete",
            HotkeyPartKind::VirtualKey(VK_DELETE.into()),
            false,
        )),
        "Insert" => Some(simple_hotkey_part(
            trimmed_code,
            "Insert",
            HotkeyPartKind::VirtualKey(VK_INSERT.into()),
            false,
        )),
        "Home" => Some(simple_hotkey_part(
            trimmed_code,
            "Home",
            HotkeyPartKind::VirtualKey(VK_HOME.into()),
            false,
        )),
        "End" => Some(simple_hotkey_part(
            trimmed_code,
            "End",
            HotkeyPartKind::VirtualKey(VK_END.into()),
            false,
        )),
        "PageUp" => Some(simple_hotkey_part(
            trimmed_code,
            "PgUp",
            HotkeyPartKind::VirtualKey(VK_PRIOR.into()),
            false,
        )),
        "PageDown" => Some(simple_hotkey_part(
            trimmed_code,
            "PgDn",
            HotkeyPartKind::VirtualKey(VK_NEXT.into()),
            false,
        )),
        "ArrowUp" => Some(simple_hotkey_part(
            trimmed_code,
            "Up",
            HotkeyPartKind::VirtualKey(VK_UP.into()),
            false,
        )),
        "ArrowDown" => Some(simple_hotkey_part(
            trimmed_code,
            "Down",
            HotkeyPartKind::VirtualKey(VK_DOWN.into()),
            false,
        )),
        "ArrowLeft" => Some(simple_hotkey_part(
            trimmed_code,
            "Left",
            HotkeyPartKind::VirtualKey(VK_LEFT.into()),
            false,
        )),
        "ArrowRight" => Some(simple_hotkey_part(
            trimmed_code,
            "Right",
            HotkeyPartKind::VirtualKey(VK_RIGHT.into()),
            false,
        )),
        "NumpadAdd" => Some(simple_hotkey_part(
            trimmed_code,
            "Num +",
            HotkeyPartKind::VirtualKey(VK_ADD.into()),
            false,
        )),
        "NumpadSubtract" => Some(simple_hotkey_part(
            trimmed_code,
            "Num -",
            HotkeyPartKind::VirtualKey(VK_SUBTRACT.into()),
            false,
        )),
        "NumpadMultiply" => Some(simple_hotkey_part(
            trimmed_code,
            "Num *",
            HotkeyPartKind::VirtualKey(VK_MULTIPLY.into()),
            false,
        )),
        "NumpadDivide" => Some(simple_hotkey_part(
            trimmed_code,
            "Num /",
            HotkeyPartKind::VirtualKey(VK_DIVIDE.into()),
            false,
        )),
        "NumpadDecimal" => Some(simple_hotkey_part(
            trimmed_code,
            "Num .",
            HotkeyPartKind::VirtualKey(VK_DECIMAL.into()),
            false,
        )),
        "Mouse1" => Some(simple_hotkey_part(
            trimmed_code,
            "Mouse 1",
            HotkeyPartKind::VirtualKey(VK_LBUTTON.into()),
            false,
        )),
        "Mouse2" => Some(simple_hotkey_part(
            trimmed_code,
            "Mouse 2",
            HotkeyPartKind::VirtualKey(VK_RBUTTON.into()),
            false,
        )),
        "Mouse3" => Some(simple_hotkey_part(
            trimmed_code,
            "Mouse 3",
            HotkeyPartKind::VirtualKey(VK_MBUTTON.into()),
            false,
        )),
        "Mouse4" => Some(simple_hotkey_part(
            trimmed_code,
            "Mouse 4",
            HotkeyPartKind::VirtualKey(VK_XBUTTON1.into()),
            false,
        )),
        "Mouse5" => Some(simple_hotkey_part(
            trimmed_code,
            "Mouse 5",
            HotkeyPartKind::VirtualKey(VK_XBUTTON2.into()),
            false,
        )),
        "WheelUp" => Some(simple_hotkey_part(
            trimmed_code,
            "Wheel Up",
            HotkeyPartKind::Wheel(WheelDirection::Up),
            false,
        )),
        "WheelDown" => Some(simple_hotkey_part(
            trimmed_code,
            "Wheel Down",
            HotkeyPartKind::Wheel(WheelDirection::Down),
            false,
        )),
        _ => {
            if let Some(letter) = trimmed_code.strip_prefix("Key") {
                let bytes = letter.as_bytes();
                if bytes.len() == 1 && bytes[0].is_ascii_alphabetic() {
                    let uppercase_letter = bytes[0].to_ascii_uppercase() as char;
                    return Some(simple_hotkey_part(
                        &format!("Key{uppercase_letter}"),
                        &uppercase_letter.to_string(),
                        HotkeyPartKind::VirtualKey(uppercase_letter as i32),
                        false,
                    ));
                }
            }

            if let Some(digit) = trimmed_code.strip_prefix("Digit") {
                let bytes = digit.as_bytes();
                if bytes.len() == 1 && bytes[0].is_ascii_digit() {
                    let digit_char = bytes[0] as char;
                    return Some(simple_hotkey_part(
                        &format!("Digit{digit_char}"),
                        &digit_char.to_string(),
                        HotkeyPartKind::VirtualKey(digit_char as i32),
                        false,
                    ));
                }
            }

            if let Some(digit) = trimmed_code.strip_prefix("Numpad") {
                let bytes = digit.as_bytes();
                if bytes.len() == 1 && bytes[0].is_ascii_digit() {
                    let digit_char = bytes[0] as char;
                    let value = (bytes[0] - b'0') as i32;
                    return Some(simple_hotkey_part(
                        &format!("Numpad{digit_char}"),
                        &format!("Num {digit_char}"),
                        HotkeyPartKind::VirtualKey(VK_NUMPAD0 as i32 + value),
                        false,
                    ));
                }
            }

            if let Some(function_key) = trimmed_code.strip_prefix('F') {
                if let Ok(value) = function_key.parse::<u8>() {
                    if (1..=24).contains(&value) {
                        let normalized_code = format!("F{value}");
                        return Some(simple_hotkey_part(
                            &normalized_code,
                            &normalized_code,
                            HotkeyPartKind::VirtualKey(VK_F1 as i32 + i32::from(value - 1)),
                            false,
                        ));
                    }
                }
            }

            None
        }
    }
}

fn simple_hotkey_part(code: &str, label: &str, kind: HotkeyPartKind, is_modifier: bool) -> HotkeyPart {
    HotkeyPart {
        code: code.to_string(),
        label: label.to_string(),
        is_modifier,
        kind,
    }
}

fn push_pressed_key(parts: &mut Vec<HotkeyPart>, code: &str, label: &str, virtual_key: i32) {
    if !is_virtual_key_pressed(virtual_key) {
        return;
    }

    parts.push(simple_hotkey_part(
        code,
        label,
        HotkeyPartKind::VirtualKey(virtual_key),
        false,
    ));
}

fn is_virtual_key_pressed(virtual_key: i32) -> bool {
    unsafe { (GetAsyncKeyState(virtual_key) as u16 & 0x8000) != 0 }
}

fn modifier_sort_index(code: &str) -> usize {
    match code {
        "Ctrl" => 0,
        "Shift" => 1,
        "Alt" => 2,
        _ => usize::MAX,
    }
}
