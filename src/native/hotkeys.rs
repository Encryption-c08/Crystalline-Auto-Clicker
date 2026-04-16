use std::collections::HashSet;

use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_ADD, VK_BACK, VK_CONTROL, VK_DECIMAL, VK_DELETE, VK_DIVIDE, VK_DOWN,
    VK_END, VK_ESCAPE, VK_F1, VK_HOME, VK_INSERT, VK_LBUTTON, VK_LEFT, VK_MBUTTON, VK_MENU,
    VK_MULTIPLY, VK_NEXT, VK_NUMPAD0, VK_PRIOR, VK_RBUTTON, VK_RETURN, VK_RIGHT, VK_SHIFT,
    VK_SPACE, VK_SUBTRACT, VK_TAB, VK_UP, VK_XBUTTON1, VK_XBUTTON2,
};

#[derive(Clone)]
struct HotkeyPart {
    code: String,
    label: String,
    virtual_key: i32,
    is_modifier: bool,
}

pub(crate) struct ParsedHotkey {
    parts: Vec<HotkeyPart>,
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

pub(crate) fn read_hotkey_state(code: &str) -> Result<bool, String> {
    let Some(parsed_hotkey) = parse_hotkey_code(code)? else {
        return Ok(false);
    };

    for part in parsed_hotkey.parts {
        if unsafe { (GetAsyncKeyState(part.virtual_key) as u16 & 0x8000) == 0 } {
            return Ok(false);
        }
    }

    Ok(true)
}

fn hotkey_code_parts(code: &str) -> impl Iterator<Item = &str> {
    code.split('+').map(str::trim).filter(|part| !part.is_empty())
}

fn hotkey_part_from_code(code: &str) -> Option<HotkeyPart> {
    let trimmed_code = code.trim();

    match trimmed_code {
        "Ctrl" => Some(simple_hotkey_part(trimmed_code, "Ctrl", VK_CONTROL.into(), true)),
        "Shift" => Some(simple_hotkey_part(trimmed_code, "Shift", VK_SHIFT.into(), true)),
        "Alt" => Some(simple_hotkey_part(trimmed_code, "Alt", VK_MENU.into(), true)),
        "Space" => Some(simple_hotkey_part(trimmed_code, "Space", VK_SPACE.into(), false)),
        "Tab" => Some(simple_hotkey_part(trimmed_code, "Tab", VK_TAB.into(), false)),
        "Enter" | "NumpadEnter" => Some(simple_hotkey_part(
            trimmed_code,
            if trimmed_code == "NumpadEnter" {
                "Num Enter"
            } else {
                "Enter"
            },
            VK_RETURN.into(),
            false,
        )),
        "Escape" => Some(simple_hotkey_part(trimmed_code, "Esc", VK_ESCAPE.into(), false)),
        "Backspace" => Some(simple_hotkey_part(
            trimmed_code,
            "Backspace",
            VK_BACK.into(),
            false,
        )),
        "Delete" => Some(simple_hotkey_part(trimmed_code, "Delete", VK_DELETE.into(), false)),
        "Insert" => Some(simple_hotkey_part(trimmed_code, "Insert", VK_INSERT.into(), false)),
        "Home" => Some(simple_hotkey_part(trimmed_code, "Home", VK_HOME.into(), false)),
        "End" => Some(simple_hotkey_part(trimmed_code, "End", VK_END.into(), false)),
        "PageUp" => Some(simple_hotkey_part(trimmed_code, "PgUp", VK_PRIOR.into(), false)),
        "PageDown" => Some(simple_hotkey_part(trimmed_code, "PgDn", VK_NEXT.into(), false)),
        "ArrowUp" => Some(simple_hotkey_part(trimmed_code, "Up", VK_UP.into(), false)),
        "ArrowDown" => Some(simple_hotkey_part(trimmed_code, "Down", VK_DOWN.into(), false)),
        "ArrowLeft" => Some(simple_hotkey_part(trimmed_code, "Left", VK_LEFT.into(), false)),
        "ArrowRight" => Some(simple_hotkey_part(trimmed_code, "Right", VK_RIGHT.into(), false)),
        "NumpadAdd" => Some(simple_hotkey_part(trimmed_code, "Num +", VK_ADD.into(), false)),
        "NumpadSubtract" => Some(simple_hotkey_part(
            trimmed_code,
            "Num -",
            VK_SUBTRACT.into(),
            false,
        )),
        "NumpadMultiply" => Some(simple_hotkey_part(
            trimmed_code,
            "Num *",
            VK_MULTIPLY.into(),
            false,
        )),
        "NumpadDivide" => Some(simple_hotkey_part(trimmed_code, "Num /", VK_DIVIDE.into(), false)),
        "NumpadDecimal" => Some(simple_hotkey_part(
            trimmed_code,
            "Num .",
            VK_DECIMAL.into(),
            false,
        )),
        "Mouse1" => Some(simple_hotkey_part(trimmed_code, "Mouse 1", VK_LBUTTON.into(), false)),
        "Mouse2" => Some(simple_hotkey_part(trimmed_code, "Mouse 2", VK_RBUTTON.into(), false)),
        "Mouse3" => Some(simple_hotkey_part(trimmed_code, "Mouse 3", VK_MBUTTON.into(), false)),
        "Mouse4" => Some(simple_hotkey_part(trimmed_code, "Mouse 4", VK_XBUTTON1.into(), false)),
        "Mouse5" => Some(simple_hotkey_part(trimmed_code, "Mouse 5", VK_XBUTTON2.into(), false)),
        _ => {
            if let Some(letter) = trimmed_code.strip_prefix("Key") {
                let bytes = letter.as_bytes();
                if bytes.len() == 1 && bytes[0].is_ascii_alphabetic() {
                    let uppercase_letter = bytes[0].to_ascii_uppercase() as char;
                    return Some(simple_hotkey_part(
                        &format!("Key{uppercase_letter}"),
                        &uppercase_letter.to_string(),
                        uppercase_letter as i32,
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
                        digit_char as i32,
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
                        VK_NUMPAD0 as i32 + value,
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
                            VK_F1 as i32 + i32::from(value - 1),
                            false,
                        ));
                    }
                }
            }

            None
        }
    }
}

fn simple_hotkey_part(code: &str, label: &str, virtual_key: i32, is_modifier: bool) -> HotkeyPart {
    HotkeyPart {
        code: code.to_string(),
        label: label.to_string(),
        virtual_key,
        is_modifier,
    }
}

fn modifier_sort_index(code: &str) -> usize {
    match code {
        "Ctrl" => 0,
        "Shift" => 1,
        "Alt" => 2,
        _ => usize::MAX,
    }
}
