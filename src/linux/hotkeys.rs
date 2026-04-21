use std::collections::HashSet;

use x11::xlib;

use crate::{linux_input_monitor, linux_x11};

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
    Standard,
    Wheel(WheelDirection),
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum WheelDirection {
    Up,
    Down,
}

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
            HotkeyPartKind::Standard => None,
            HotkeyPartKind::Wheel(direction) => Some(direction),
        })
    }

    fn non_wheel_parts(&self) -> impl Iterator<Item = &HotkeyPart> {
        self.parts
            .iter()
            .filter(|part| matches!(part.kind, HotkeyPartKind::Standard))
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

pub(crate) fn read_hotkey_state(code: &str, _click_mode: ClickMode) -> Result<bool, String> {
    let Some(parsed_hotkey) = parse_hotkey_code(code)? else {
        return Ok(false);
    };

    if let Some(wheel_direction) = parsed_hotkey.wheel_direction() {
        linux_input_monitor::ensure_raw_mouse_monitor();

        return Ok(match _click_mode {
            ClickMode::Hold => read_hold_wheel_hotkey_state(&parsed_hotkey, wheel_direction),
            ClickMode::Toggle => read_toggle_wheel_hotkey_state(&parsed_hotkey, wheel_direction),
        });
    }

    if parsed_hotkey.has_mouse_button_part() {
        linux_input_monitor::ensure_raw_mouse_monitor();
    }

    linux_x11::with_display(|display| {
        let keymap = linux_x11::query_keymap(display);
        let pointer = linux_x11::query_pointer(display)?;

        for part in &parsed_hotkey.parts {
            if !is_hotkey_part_pressed(display, &keymap, pointer.mask, part) {
                return Ok(false);
            }
        }

        Ok(true)
    })
}

fn read_toggle_wheel_hotkey_state(
    parsed_hotkey: &ParsedHotkey,
    wheel_direction: WheelDirection,
) -> bool {
    let Some(record) = latest_wheel_event(wheel_direction) else {
        return false;
    };

    if record.occurred_at.elapsed() > linux_input_monitor::TOGGLE_WHEEL_PULSE {
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

    if record.occurred_at.elapsed() > linux_input_monitor::TOGGLE_WHEEL_PULSE {
        return false;
    }

    if !snapshot_matches_hotkey(record.snapshot, parsed_hotkey) {
        return false;
    }

    non_wheel_parts_pressed(parsed_hotkey)
}

fn non_wheel_parts_pressed(parsed_hotkey: &ParsedHotkey) -> bool {
    linux_x11::with_display(|display| {
        let keymap = linux_x11::query_keymap(display);
        let pointer = linux_x11::query_pointer(display)?;

        Ok(parsed_hotkey
            .non_wheel_parts()
            .all(|part| is_hotkey_part_pressed(display, &keymap, pointer.mask, part)))
    })
    .unwrap_or(false)
}

fn snapshot_matches_hotkey(
    snapshot: linux_input_monitor::InputSnapshot,
    parsed_hotkey: &ParsedHotkey,
) -> bool {
    linux_x11::with_display(|display| {
        let keymap = linux_x11::query_keymap(display);
        Ok(parsed_hotkey
            .non_wheel_parts()
            .all(|part| snapshot_matches_part(display, &keymap, snapshot, part)))
    })
    .unwrap_or(false)
}

fn snapshot_matches_part(
    display: *mut xlib::Display,
    keymap: &[u8; 32],
    snapshot: linux_input_monitor::InputSnapshot,
    part: &HotkeyPart,
) -> bool {
    match part.code.as_str() {
        "Ctrl" => (snapshot.modifiers & linux_input_monitor::SNAPSHOT_CTRL_BIT) != 0,
        "Shift" => (snapshot.modifiers & linux_input_monitor::SNAPSHOT_SHIFT_BIT) != 0,
        "Alt" => (snapshot.modifiers & linux_input_monitor::SNAPSHOT_ALT_BIT) != 0,
        "Mouse1" => (snapshot.mouse_buttons & linux_input_monitor::SNAPSHOT_MOUSE1_BIT) != 0,
        "Mouse2" => (snapshot.mouse_buttons & linux_input_monitor::SNAPSHOT_MOUSE2_BIT) != 0,
        "Mouse3" => (snapshot.mouse_buttons & linux_input_monitor::SNAPSHOT_MOUSE3_BIT) != 0,
        "Mouse4" => (snapshot.mouse_buttons & linux_input_monitor::SNAPSHOT_MOUSE4_BIT) != 0,
        "Mouse5" => (snapshot.mouse_buttons & linux_input_monitor::SNAPSHOT_MOUSE5_BIT) != 0,
        _ => is_keyboard_hotkey_part_pressed(display, keymap, part),
    }
}

fn latest_wheel_event(direction: WheelDirection) -> Option<linux_input_monitor::WheelEventRecord> {
    match direction {
        WheelDirection::Up => linux_input_monitor::latest_wheel_up_event(),
        WheelDirection::Down => linux_input_monitor::latest_wheel_down_event(),
    }
}

pub(crate) fn read_pressed_keyboard_hotkey() -> Result<Option<CapturedHotkey>, String> {
    linux_x11::with_display(|display| {
        let keymap = linux_x11::query_keymap(display);
        let mut parts = Vec::new();

        if linux_x11::any_keysym_name_pressed(display, &keymap, &["Control_L", "Control_R"]) {
            parts.push(simple_hotkey_part(
                "Ctrl",
                "Ctrl",
                HotkeyPartKind::Standard,
                true,
            ));
        }

        if linux_x11::any_keysym_name_pressed(display, &keymap, &["Shift_L", "Shift_R"]) {
            parts.push(simple_hotkey_part(
                "Shift",
                "Shift",
                HotkeyPartKind::Standard,
                true,
            ));
        }

        if linux_x11::any_keysym_name_pressed(
            display,
            &keymap,
            &["Alt_L", "Alt_R", "Meta_L", "Meta_R"],
        ) {
            parts.push(simple_hotkey_part(
                "Alt",
                "Alt",
                HotkeyPartKind::Standard,
                true,
            ));
        }

        push_pressed_key(&mut parts, display, &keymap, "Space", "Space", &["space"]);
        push_pressed_key(&mut parts, display, &keymap, "Tab", "Tab", &["Tab"]);
        push_pressed_key(&mut parts, display, &keymap, "Enter", "Enter", &["Return"]);
        push_pressed_key(&mut parts, display, &keymap, "Escape", "Esc", &["Escape"]);
        push_pressed_key(
            &mut parts,
            display,
            &keymap,
            "Backspace",
            "Backspace",
            &["BackSpace"],
        );
        push_pressed_key(
            &mut parts,
            display,
            &keymap,
            "Delete",
            "Delete",
            &["Delete"],
        );
        push_pressed_key(
            &mut parts,
            display,
            &keymap,
            "Insert",
            "Insert",
            &["Insert"],
        );
        push_pressed_key(&mut parts, display, &keymap, "Home", "Home", &["Home"]);
        push_pressed_key(&mut parts, display, &keymap, "End", "End", &["End"]);
        push_pressed_key(&mut parts, display, &keymap, "PageUp", "PgUp", &["Page_Up"]);
        push_pressed_key(
            &mut parts,
            display,
            &keymap,
            "PageDown",
            "PgDn",
            &["Page_Down"],
        );
        push_pressed_key(&mut parts, display, &keymap, "ArrowUp", "Up", &["Up"]);
        push_pressed_key(&mut parts, display, &keymap, "ArrowDown", "Down", &["Down"]);
        push_pressed_key(&mut parts, display, &keymap, "ArrowLeft", "Left", &["Left"]);
        push_pressed_key(
            &mut parts,
            display,
            &keymap,
            "ArrowRight",
            "Right",
            &["Right"],
        );
        push_pressed_key(
            &mut parts,
            display,
            &keymap,
            "NumpadAdd",
            "Num +",
            &["KP_Add"],
        );
        push_pressed_key(
            &mut parts,
            display,
            &keymap,
            "NumpadSubtract",
            "Num -",
            &["KP_Subtract"],
        );
        push_pressed_key(
            &mut parts,
            display,
            &keymap,
            "NumpadMultiply",
            "Num *",
            &["KP_Multiply"],
        );
        push_pressed_key(
            &mut parts,
            display,
            &keymap,
            "NumpadDivide",
            "Num /",
            &["KP_Divide"],
        );
        push_pressed_key(
            &mut parts,
            display,
            &keymap,
            "NumpadDecimal",
            "Num .",
            &["KP_Decimal"],
        );

        for letter in b'A'..=b'Z' {
            let letter_code = format!("Key{}", letter as char);
            let label = (letter as char).to_string();
            let keysym_name = (letter as char).to_ascii_lowercase().to_string();
            if linux_x11::keysym_name_pressed(display, &keymap, &keysym_name) {
                parts.push(simple_hotkey_part(
                    &letter_code,
                    &label,
                    HotkeyPartKind::Standard,
                    false,
                ));
            }
        }

        for digit in b'0'..=b'9' {
            let digit_char = digit as char;
            let digit_code = format!("Digit{digit_char}");
            let digit_label = digit_char.to_string();
            let keysym_name = digit_label.clone();
            if linux_x11::keysym_name_pressed(display, &keymap, &keysym_name) {
                parts.push(simple_hotkey_part(
                    &digit_code,
                    &digit_label,
                    HotkeyPartKind::Standard,
                    false,
                ));
            }
        }

        for value in 0..=9 {
            let digit_char = char::from(b'0' + value as u8);
            let keysym_name = format!("KP_{digit_char}");
            if linux_x11::keysym_name_pressed(display, &keymap, &keysym_name) {
                parts.push(simple_hotkey_part(
                    &format!("Numpad{digit_char}"),
                    &format!("Num {digit_char}"),
                    HotkeyPartKind::Standard,
                    false,
                ));
            }
        }

        for value in 1..=24 {
            let function_name = format!("F{value}");
            if linux_x11::keysym_name_pressed(display, &keymap, &function_name) {
                parts.push(simple_hotkey_part(
                    &function_name,
                    &function_name,
                    HotkeyPartKind::Standard,
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
    })
}

fn is_hotkey_part_pressed(
    display: *mut xlib::Display,
    keymap: &[u8; 32],
    pointer_mask: u32,
    part: &HotkeyPart,
) -> bool {
    if let Some(button_bit) = mouse_button_snapshot_bit(&part.code) {
        return linux_input_monitor::physical_mouse_buttons()
            .map(|pressed_buttons| (pressed_buttons & button_bit) != 0)
            .unwrap_or_else(|| fallback_mouse_button_pressed(pointer_mask, &part.code));
    }

    is_keyboard_hotkey_part_pressed(display, keymap, part)
}

fn fallback_mouse_button_pressed(pointer_mask: u32, code: &str) -> bool {
    match code {
        "Mouse1" => (pointer_mask & xlib::Button1Mask) != 0,
        "Mouse2" => (pointer_mask & xlib::Button3Mask) != 0,
        "Mouse3" => (pointer_mask & xlib::Button2Mask) != 0,
        "Mouse4" | "Mouse5" => false,
        _ => false,
    }
}

fn is_keyboard_hotkey_part_pressed(
    display: *mut xlib::Display,
    keymap: &[u8; 32],
    part: &HotkeyPart,
) -> bool {
    match part.code.as_str() {
        "Ctrl" => linux_x11::any_keysym_name_pressed(display, keymap, &["Control_L", "Control_R"]),
        "Shift" => linux_x11::any_keysym_name_pressed(display, keymap, &["Shift_L", "Shift_R"]),
        "Alt" => linux_x11::any_keysym_name_pressed(
            display,
            keymap,
            &["Alt_L", "Alt_R", "Meta_L", "Meta_R"],
        ),
        "Space" => linux_x11::keysym_name_pressed(display, keymap, "space"),
        "Tab" => linux_x11::keysym_name_pressed(display, keymap, "Tab"),
        "Enter" => linux_x11::keysym_name_pressed(display, keymap, "Return"),
        "NumpadEnter" => linux_x11::keysym_name_pressed(display, keymap, "KP_Enter"),
        "Escape" => linux_x11::keysym_name_pressed(display, keymap, "Escape"),
        "Backspace" => linux_x11::keysym_name_pressed(display, keymap, "BackSpace"),
        "Delete" => linux_x11::keysym_name_pressed(display, keymap, "Delete"),
        "Insert" => linux_x11::keysym_name_pressed(display, keymap, "Insert"),
        "Home" => linux_x11::keysym_name_pressed(display, keymap, "Home"),
        "End" => linux_x11::keysym_name_pressed(display, keymap, "End"),
        "PageUp" => linux_x11::keysym_name_pressed(display, keymap, "Page_Up"),
        "PageDown" => linux_x11::keysym_name_pressed(display, keymap, "Page_Down"),
        "ArrowUp" => linux_x11::keysym_name_pressed(display, keymap, "Up"),
        "ArrowDown" => linux_x11::keysym_name_pressed(display, keymap, "Down"),
        "ArrowLeft" => linux_x11::keysym_name_pressed(display, keymap, "Left"),
        "ArrowRight" => linux_x11::keysym_name_pressed(display, keymap, "Right"),
        "NumpadAdd" => linux_x11::keysym_name_pressed(display, keymap, "KP_Add"),
        "NumpadSubtract" => linux_x11::keysym_name_pressed(display, keymap, "KP_Subtract"),
        "NumpadMultiply" => linux_x11::keysym_name_pressed(display, keymap, "KP_Multiply"),
        "NumpadDivide" => linux_x11::keysym_name_pressed(display, keymap, "KP_Divide"),
        "NumpadDecimal" => linux_x11::keysym_name_pressed(display, keymap, "KP_Decimal"),
        _ => {
            if let Some(letter) = part.code.strip_prefix("Key") {
                let keysym_name = letter.to_ascii_lowercase();
                return linux_x11::keysym_name_pressed(display, keymap, &keysym_name);
            }

            if let Some(digit) = part.code.strip_prefix("Digit") {
                return linux_x11::keysym_name_pressed(display, keymap, digit);
            }

            if let Some(digit) = part.code.strip_prefix("Numpad") {
                if digit.len() == 1 && digit.as_bytes()[0].is_ascii_digit() {
                    let keysym_name = format!("KP_{digit}");
                    return linux_x11::keysym_name_pressed(display, keymap, &keysym_name);
                }
            }

            if let Some(function_key) = part.code.strip_prefix('F') {
                if let Ok(value) = function_key.parse::<u8>() {
                    if (1..=24).contains(&value) {
                        let function_name = format!("F{value}");
                        return linux_x11::keysym_name_pressed(display, keymap, &function_name);
                    }
                }
            }

            false
        }
    }
}

fn mouse_button_snapshot_bit(code: &str) -> Option<u8> {
    match code {
        "Mouse1" => Some(linux_input_monitor::SNAPSHOT_MOUSE1_BIT),
        "Mouse2" => Some(linux_input_monitor::SNAPSHOT_MOUSE2_BIT),
        "Mouse3" => Some(linux_input_monitor::SNAPSHOT_MOUSE3_BIT),
        "Mouse4" => Some(linux_input_monitor::SNAPSHOT_MOUSE4_BIT),
        "Mouse5" => Some(linux_input_monitor::SNAPSHOT_MOUSE5_BIT),
        _ => None,
    }
}

fn hotkey_code_parts(code: &str) -> impl Iterator<Item = &str> {
    code.split('+')
        .map(str::trim)
        .filter(|part| !part.is_empty())
}

fn hotkey_part_from_code(code: &str) -> Option<HotkeyPart> {
    let trimmed_code = code.trim();

    match trimmed_code {
        "Ctrl" => Some(simple_hotkey_part(
            trimmed_code,
            "Ctrl",
            HotkeyPartKind::Standard,
            true,
        )),
        "Shift" => Some(simple_hotkey_part(
            trimmed_code,
            "Shift",
            HotkeyPartKind::Standard,
            true,
        )),
        "Alt" => Some(simple_hotkey_part(
            trimmed_code,
            "Alt",
            HotkeyPartKind::Standard,
            true,
        )),
        "Space" => Some(simple_hotkey_part(
            trimmed_code,
            "Space",
            HotkeyPartKind::Standard,
            false,
        )),
        "Tab" => Some(simple_hotkey_part(
            trimmed_code,
            "Tab",
            HotkeyPartKind::Standard,
            false,
        )),
        "Enter" | "NumpadEnter" => Some(simple_hotkey_part(
            trimmed_code,
            if trimmed_code == "NumpadEnter" {
                "Num Enter"
            } else {
                "Enter"
            },
            HotkeyPartKind::Standard,
            false,
        )),
        "Escape" => Some(simple_hotkey_part(
            trimmed_code,
            "Esc",
            HotkeyPartKind::Standard,
            false,
        )),
        "Backspace" => Some(simple_hotkey_part(
            trimmed_code,
            "Backspace",
            HotkeyPartKind::Standard,
            false,
        )),
        "Delete" => Some(simple_hotkey_part(
            trimmed_code,
            "Delete",
            HotkeyPartKind::Standard,
            false,
        )),
        "Insert" => Some(simple_hotkey_part(
            trimmed_code,
            "Insert",
            HotkeyPartKind::Standard,
            false,
        )),
        "Home" => Some(simple_hotkey_part(
            trimmed_code,
            "Home",
            HotkeyPartKind::Standard,
            false,
        )),
        "End" => Some(simple_hotkey_part(
            trimmed_code,
            "End",
            HotkeyPartKind::Standard,
            false,
        )),
        "PageUp" => Some(simple_hotkey_part(
            trimmed_code,
            "PgUp",
            HotkeyPartKind::Standard,
            false,
        )),
        "PageDown" => Some(simple_hotkey_part(
            trimmed_code,
            "PgDn",
            HotkeyPartKind::Standard,
            false,
        )),
        "ArrowUp" => Some(simple_hotkey_part(
            trimmed_code,
            "Up",
            HotkeyPartKind::Standard,
            false,
        )),
        "ArrowDown" => Some(simple_hotkey_part(
            trimmed_code,
            "Down",
            HotkeyPartKind::Standard,
            false,
        )),
        "ArrowLeft" => Some(simple_hotkey_part(
            trimmed_code,
            "Left",
            HotkeyPartKind::Standard,
            false,
        )),
        "ArrowRight" => Some(simple_hotkey_part(
            trimmed_code,
            "Right",
            HotkeyPartKind::Standard,
            false,
        )),
        "NumpadAdd" => Some(simple_hotkey_part(
            trimmed_code,
            "Num +",
            HotkeyPartKind::Standard,
            false,
        )),
        "NumpadSubtract" => Some(simple_hotkey_part(
            trimmed_code,
            "Num -",
            HotkeyPartKind::Standard,
            false,
        )),
        "NumpadMultiply" => Some(simple_hotkey_part(
            trimmed_code,
            "Num *",
            HotkeyPartKind::Standard,
            false,
        )),
        "NumpadDivide" => Some(simple_hotkey_part(
            trimmed_code,
            "Num /",
            HotkeyPartKind::Standard,
            false,
        )),
        "NumpadDecimal" => Some(simple_hotkey_part(
            trimmed_code,
            "Num .",
            HotkeyPartKind::Standard,
            false,
        )),
        "Mouse1" => Some(simple_hotkey_part(
            trimmed_code,
            "Mouse 1",
            HotkeyPartKind::Standard,
            false,
        )),
        "Mouse2" => Some(simple_hotkey_part(
            trimmed_code,
            "Mouse 2",
            HotkeyPartKind::Standard,
            false,
        )),
        "Mouse3" => Some(simple_hotkey_part(
            trimmed_code,
            "Mouse 3",
            HotkeyPartKind::Standard,
            false,
        )),
        "Mouse4" => Some(simple_hotkey_part(
            trimmed_code,
            "Mouse 4",
            HotkeyPartKind::Standard,
            false,
        )),
        "Mouse5" => Some(simple_hotkey_part(
            trimmed_code,
            "Mouse 5",
            HotkeyPartKind::Standard,
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
                        HotkeyPartKind::Standard,
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
                        HotkeyPartKind::Standard,
                        false,
                    ));
                }
            }

            if let Some(digit) = trimmed_code.strip_prefix("Numpad") {
                let bytes = digit.as_bytes();
                if bytes.len() == 1 && bytes[0].is_ascii_digit() {
                    let digit_char = bytes[0] as char;
                    return Some(simple_hotkey_part(
                        &format!("Numpad{digit_char}"),
                        &format!("Num {digit_char}"),
                        HotkeyPartKind::Standard,
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
                            HotkeyPartKind::Standard,
                            false,
                        ));
                    }
                }
            }

            None
        }
    }
}

fn simple_hotkey_part(
    code: &str,
    label: &str,
    kind: HotkeyPartKind,
    is_modifier: bool,
) -> HotkeyPart {
    HotkeyPart {
        code: code.to_string(),
        label: label.to_string(),
        is_modifier,
        kind,
    }
}

fn push_pressed_key(
    parts: &mut Vec<HotkeyPart>,
    display: *mut xlib::Display,
    keymap: &[u8; 32],
    code: &str,
    label: &str,
    keysym_names: &[&str],
) {
    if !linux_x11::any_keysym_name_pressed(display, keymap, keysym_names) {
        return;
    }

    parts.push(simple_hotkey_part(
        code,
        label,
        HotkeyPartKind::Standard,
        false,
    ));
}

fn modifier_sort_index(code: &str) -> usize {
    match code {
        "Ctrl" => 0,
        "Shift" => 1,
        "Alt" => 2,
        _ => usize::MAX,
    }
}
