#[cfg(target_os = "windows")]
use std::{thread, time::Duration};

#[cfg(target_os = "windows")]
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, POINT, RECT},
    UI::{
        Input::KeyboardAndMouse::{GetAsyncKeyState, VK_ESCAPE, VK_LBUTTON},
        WindowsAndMessaging::{
            EnumWindows, GA_ROOT, GetAncestor, GetClassNameW, GetClientRect, GetCursorPos,
            GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
            WindowFromPoint,
        },
    },
};

#[cfg(target_os = "windows")]
use crate::process_filters::process_name_by_id;

#[cfg(target_os = "windows")]
#[link(name = "User32")]
unsafe extern "system" {
    fn ScreenToClient(hWnd: HWND, lpPoint: *mut POINT) -> i32;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct NonIntrusiveClickPosition {
    pub(crate) id: u32,
    pub(crate) x: i32,
    pub(crate) y: i32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct NonIntrusiveTargetWindow {
    pub(crate) class_name: String,
    pub(crate) process_name: String,
    pub(crate) title: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct PickNonIntrusiveTargetResult {
    pub(crate) positions: Vec<NonIntrusiveClickPosition>,
    pub(crate) target: NonIntrusiveTargetWindow,
}

#[cfg(target_os = "windows")]
#[derive(Clone)]
struct ResolvedTargetWindow {
    hwnd: HWND,
    target: NonIntrusiveTargetWindow,
}

#[cfg(target_os = "windows")]
fn is_virtual_key_pressed(key_code: i32) -> bool {
    (unsafe { GetAsyncKeyState(key_code) } as u16 & 0x8000) != 0
}

#[cfg(target_os = "windows")]
fn root_window(window: HWND) -> HWND {
    let root = unsafe { GetAncestor(window, GA_ROOT) };
    if root.is_null() { window } else { root }
}

#[cfg(target_os = "windows")]
fn window_title(window: HWND) -> Option<String> {
    let title_length = unsafe { GetWindowTextLengthW(window) };
    if title_length <= 0 {
        return None;
    }

    let mut title_buffer = vec![0u16; title_length as usize + 1];
    let copied_length =
        unsafe { GetWindowTextW(window, title_buffer.as_mut_ptr(), title_buffer.len() as i32) };
    if copied_length <= 0 {
        return None;
    }

    title_buffer.truncate(copied_length as usize);
    let title = String::from_utf16_lossy(&title_buffer).trim().to_string();
    if title.is_empty() { None } else { Some(title) }
}

#[cfg(target_os = "windows")]
fn window_class_name(window: HWND) -> Option<String> {
    let mut class_buffer = [0u16; 256];
    let copied_length =
        unsafe { GetClassNameW(window, class_buffer.as_mut_ptr(), class_buffer.len() as i32) };
    if copied_length <= 0 {
        return None;
    }

    let class_name = String::from_utf16_lossy(&class_buffer[..copied_length as usize])
        .trim()
        .to_string();
    if class_name.is_empty() {
        None
    } else {
        Some(class_name)
    }
}

#[cfg(target_os = "windows")]
fn process_name_by_window(window: HWND) -> Result<Option<String>, String> {
    if window.is_null() {
        return Ok(None);
    }

    let mut process_id = 0;
    unsafe {
        GetWindowThreadProcessId(window, &mut process_id);
    }

    if process_id == 0 {
        return Ok(None);
    }

    process_name_by_id(process_id)
}

#[cfg(target_os = "windows")]
fn target_window_from_root_window(window: HWND) -> Result<Option<NonIntrusiveTargetWindow>, String> {
    let process_name = process_name_by_window(window)?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let title = window_title(window);
    let class_name = window_class_name(window);

    let (Some(process_name), Some(title), Some(class_name)) = (process_name, title, class_name)
    else {
        return Ok(None);
    };

    Ok(Some(NonIntrusiveTargetWindow {
        class_name,
        process_name,
        title,
    }))
}

#[cfg(target_os = "windows")]
fn hovered_target_window_at_point(point: POINT) -> Result<Option<ResolvedTargetWindow>, String> {
    let hovered_window = unsafe { WindowFromPoint(point) };
    if hovered_window.is_null() {
        return Ok(None);
    }

    let root = root_window(hovered_window);
    if root.is_null() {
        return Ok(None);
    }

    let Some(target) = target_window_from_root_window(root)? else {
        return Ok(None);
    };

    Ok(Some(ResolvedTargetWindow { hwnd: root, target }))
}

#[cfg(target_os = "windows")]
fn client_rect(window: HWND) -> Result<RECT, String> {
    let mut rect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };

    if unsafe { GetClientRect(window, &mut rect) } == 0 {
        return Err("Unable to read the target window bounds.".into());
    }

    Ok(rect)
}

#[cfg(target_os = "windows")]
fn point_inside_client_rect(point: POINT, rect: RECT) -> bool {
    point.x >= rect.left && point.x < rect.right && point.y >= rect.top && point.y < rect.bottom
}

#[cfg(target_os = "windows")]
fn screen_position_to_client_position(
    window: HWND,
    position: NonIntrusiveClickPosition,
) -> Result<NonIntrusiveClickPosition, String> {
    let mut point = POINT {
        x: position.x,
        y: position.y,
    };
    if unsafe { ScreenToClient(window, &mut point) } == 0 {
        return Err("Unable to translate a click position into the locked window.".into());
    }

    if !point_inside_client_rect(point, client_rect(window)?) {
        return Err(
            "At least one saved click position falls outside the locked target window.".into(),
        );
    }

    Ok(NonIntrusiveClickPosition {
        id: position.id,
        x: point.x,
        y: point.y,
    })
}

#[cfg(target_os = "windows")]
fn map_positions_to_window_handle(
    window: HWND,
    positions: &[NonIntrusiveClickPosition],
) -> Result<Vec<NonIntrusiveClickPosition>, String> {
    positions
        .iter()
        .copied()
        .map(|position| screen_position_to_client_position(window, position))
        .collect()
}

#[cfg(target_os = "windows")]
fn target_matches_window(window: HWND, target: &NonIntrusiveTargetWindow) -> Result<bool, String> {
    let Some(current_target) = target_window_from_root_window(window)? else {
        return Ok(false);
    };

    Ok(
        current_target.process_name == target.process_name
            && current_target.title == target.title
            && current_target.class_name == target.class_name,
    )
}

#[cfg(target_os = "windows")]
struct EnumTargetSearch<'a> {
    error: Option<String>,
    found: Option<HWND>,
    target: &'a NonIntrusiveTargetWindow,
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn enum_target_windows_proc(window: HWND, lparam: LPARAM) -> i32 {
    let state = unsafe { &mut *(lparam as *mut EnumTargetSearch<'_>) };

    if root_window(window) != window {
        return 1;
    }

    match target_matches_window(window, state.target) {
        Ok(true) => {
            state.found = Some(window);
            0
        }
        Ok(false) => 1,
        Err(error) => {
            state.error = Some(error);
            0
        }
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn resolve_non_intrusive_target_window(
    target: &NonIntrusiveTargetWindow,
) -> Result<Option<HWND>, String> {
    let mut state = EnumTargetSearch {
        error: None,
        found: None,
        target,
    };

    unsafe {
        EnumWindows(
            Some(enum_target_windows_proc),
            &mut state as *mut EnumTargetSearch<'_> as LPARAM,
        );
    }

    if let Some(error) = state.error {
        return Err(error);
    }

    Ok(state.found)
}

#[cfg(target_os = "windows")]
pub(crate) fn map_click_positions_to_non_intrusive_positions(
    target: &NonIntrusiveTargetWindow,
    positions: &[NonIntrusiveClickPosition],
) -> Result<Vec<NonIntrusiveClickPosition>, String> {
    let Some(window) = resolve_non_intrusive_target_window(target)? else {
        return Err("The locked target window could not be found.".into());
    };

    map_positions_to_window_handle(window, positions)
}

#[cfg(target_os = "windows")]
pub(crate) fn pick_non_intrusive_target_from_click(
    mut on_hover: impl FnMut(POINT, Option<&str>) -> Result<(), String>,
    positions: &[NonIntrusiveClickPosition],
) -> Result<Option<PickNonIntrusiveTargetResult>, String> {
    if positions.is_empty() {
        return Err("Add at least one click position before enabling non-intrusive mode.".into());
    }

    while is_virtual_key_pressed(VK_LBUTTON as i32) {
        thread::sleep(Duration::from_millis(8));
    }

    let mut last_cursor = POINT {
        x: i32::MIN,
        y: i32::MIN,
    };
    let mut last_hovered_title: Option<String> = None;

    loop {
        let mut cursor = POINT { x: 0, y: 0 };
        if unsafe { GetCursorPos(&mut cursor) } == 0 {
            return Err("Unable to read cursor position.".into());
        }

        let hovered_target = hovered_target_window_at_point(cursor)?;
        let hovered_title = hovered_target.as_ref().map(|window| window.target.title.as_str());

        if cursor.x != last_cursor.x
            || cursor.y != last_cursor.y
            || hovered_title != last_hovered_title.as_deref()
        {
            on_hover(cursor, hovered_title)?;
            last_cursor = cursor;
            last_hovered_title = hovered_title.map(ToOwned::to_owned);
        }

        if is_virtual_key_pressed(VK_ESCAPE as i32) {
            return Ok(None);
        }

        if is_virtual_key_pressed(VK_LBUTTON as i32) {
            if let Some(hovered_target) = hovered_target {
                let mapped_positions = map_positions_to_window_handle(hovered_target.hwnd, positions)?;

                return Ok(Some(PickNonIntrusiveTargetResult {
                    positions: mapped_positions,
                    target: hovered_target.target,
                }));
            }
        }

        thread::sleep(Duration::from_millis(8));
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn process_name_for_non_intrusive_position(
    position: NonIntrusiveClickPosition,
) -> Result<Option<String>, String> {
    let point = POINT {
        x: position.x,
        y: position.y,
    };

    Ok(hovered_target_window_at_point(point)?.map(|window| window.target.process_name))
}

#[cfg(target_os = "windows")]
pub(crate) fn resolve_non_intrusive_dispatch_window_at_position(
    position: NonIntrusiveClickPosition,
) -> Result<(HWND, POINT), String> {
    let mut screen_point = POINT {
        x: position.x,
        y: position.y,
    };

    let hovered_window = unsafe { WindowFromPoint(screen_point) };
    if hovered_window.is_null() {
        return Err("Unable to find a window at the saved click position.".into());
    }

    if unsafe { ScreenToClient(hovered_window, &mut screen_point) } == 0 {
        return Err("Unable to translate the saved click position into a target window.".into());
    }

    Ok((hovered_window, screen_point))
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn resolve_non_intrusive_target_window(
    _target: &NonIntrusiveTargetWindow,
) -> Result<Option<isize>, String> {
    Ok(None)
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn map_click_positions_to_non_intrusive_positions(
    _target: &NonIntrusiveTargetWindow,
    _positions: &[NonIntrusiveClickPosition],
) -> Result<Vec<NonIntrusiveClickPosition>, String> {
    Ok(Vec::new())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn process_name_for_non_intrusive_position(
    _position: NonIntrusiveClickPosition,
) -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn resolve_non_intrusive_dispatch_window_at_position(
    _position: NonIntrusiveClickPosition,
) -> Result<(isize, ()), String> {
    Err("Non-intrusive clicks are only available on Windows.".into())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn pick_non_intrusive_target_from_click(
    _on_hover: impl FnMut((), Option<&str>) -> Result<(), String>,
    _positions: &[NonIntrusiveClickPosition],
) -> Result<Option<PickNonIntrusiveTargetResult>, String> {
    Ok(None)
}
