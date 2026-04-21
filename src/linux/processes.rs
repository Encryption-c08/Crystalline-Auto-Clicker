use std::{
    collections::HashMap,
    ffi::{CStr, CString},
    fs,
    os::raw::{c_long, c_ulong},
    thread,
    time::Duration,
};

use base64::{prelude::BASE64_STANDARD, Engine};
use image::{codecs::png::PngEncoder, ColorType, ImageEncoder};
use x11::xlib;

use crate::linux_x11;

#[path = "../shared/process_filters.rs"]
mod process_filters_shared;

#[derive(Clone, Debug)]
struct WindowProcessInfo {
    icon_data_url: Option<String>,
    process_name: String,
    title: String,
}

const PICK_PROCESS_POLL_INTERVAL: Duration = Duration::from_millis(8);
const MAX_WINDOW_PROPERTY_ITEMS: c_long = 4096;
const MAX_NET_WM_ICON_DIMENSION: u32 = 512;
const CURRENT_APP_PROCESS_NAME: &str = "crystalline auto clicker";
const TAURI_NATIVE_PROCESS_NAME: &str = "tauri-native";

pub(crate) fn current_cursor_position() -> Result<(i32, i32), String> {
    linux_x11::pointer_position()
}

pub(crate) fn list_running_process_names() -> Result<Vec<String>, String> {
    let mut process_names = Vec::new();
    let mut seen_process_names = std::collections::HashSet::new();

    for entry in fs::read_dir("/proc").map_err(|error| format!("Unable to read /proc: {error}"))? {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        let Some(file_name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };

        let Ok(process_id) = file_name.parse::<u32>() else {
            continue;
        };

        let Some(process_name) = process_name_by_id(process_id)? else {
            continue;
        };

        if seen_process_names.insert(process_name.clone()) {
            process_names.push(process_name);
        }
    }

    process_names.sort_unstable();
    Ok(process_names)
}

pub(crate) fn list_open_app_process_names() -> Result<Vec<String>, String> {
    list_open_app_processes()
        .map(|processes| processes.into_iter().map(|process| process.name).collect())
}

pub(crate) fn list_open_app_processes(
) -> Result<Vec<crate::process_filters::OpenAppProcess>, String> {
    linux_x11::with_display(|display| {
        let mut processes_by_name = HashMap::<String, Option<String>>::new();

        for window in open_app_windows(display)? {
            let Some(process_info) = open_app_process_by_window(display, window)? else {
                continue;
            };
            let WindowProcessInfo {
                icon_data_url: next_icon_data_url,
                process_name,
                ..
            } = process_info;

            processes_by_name
                .entry(process_name)
                .and_modify(|icon_data_url| {
                    if icon_data_url.is_none() {
                        *icon_data_url = next_icon_data_url.clone();
                    }
                })
                .or_insert(next_icon_data_url);
        }

        let mut processes = processes_by_name
            .into_iter()
            .map(
                |(name, icon_data_url)| crate::process_filters::OpenAppProcess {
                    icon_data_url,
                    name,
                },
            )
            .collect::<Vec<_>>();

        processes.sort_by(|left, right| left.name.cmp(&right.name));
        Ok(processes)
    })
}

pub(crate) fn process_name_by_id(process_id: u32) -> Result<Option<String>, String> {
    if process_id == 0 {
        return Ok(None);
    }

    if let Some(process_name) = process_executable_name_by_id(process_id) {
        return Ok(Some(alias_current_app_process_name(
            process_id,
            process_name,
        )));
    }

    let comm_path = format!("/proc/{process_id}/comm");
    match fs::read_to_string(&comm_path) {
        Ok(contents) => Ok(normalize_process_name(&contents)
            .map(|process_name| alias_current_app_process_name(process_id, process_name))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!(
            "Unable to read process name for PID {process_id}: {error}"
        )),
    }
}

pub(crate) fn foreground_process_id() -> Option<u32> {
    linux_x11::with_display(|display| {
        Ok(active_window(display).and_then(|window| window_process_id(display, window)))
    })
    .ok()
    .flatten()
}

pub(crate) fn pick_process_name_from_click(
    mut on_hover: impl FnMut(i32, i32, Option<&str>) -> Result<(), String>,
) -> Result<Option<String>, String> {
    while left_mouse_pressed()? {
        thread::sleep(PICK_PROCESS_POLL_INTERVAL);
    }

    let mut last_cursor = (i32::MIN, i32::MIN);
    let mut last_hovered_title: Option<String> = None;

    loop {
        let (cursor_x, cursor_y, escape_pressed, left_pressed, hovered_window) =
            linux_x11::with_display(|display| {
                let keymap = linux_x11::query_keymap(display);
                let pointer = linux_x11::query_pointer(display)?;
                let hovered_window = hovered_open_app_at_window(display, pointer.child_window)?;

                Ok((
                    pointer.x,
                    pointer.y,
                    linux_x11::keysym_name_pressed(display, &keymap, "Escape"),
                    (pointer.mask & xlib::Button1Mask) != 0,
                    hovered_window,
                ))
            })?;

        let hovered_title = hovered_window.as_ref().map(|window| window.title.as_str());
        if (cursor_x, cursor_y) != last_cursor || hovered_title != last_hovered_title.as_deref() {
            on_hover(cursor_x, cursor_y, hovered_title)?;
            last_cursor = (cursor_x, cursor_y);
            last_hovered_title = hovered_title.map(ToOwned::to_owned);
        }

        if escape_pressed {
            return Ok(None);
        }

        if left_pressed {
            if let Some(window) = hovered_window {
                return Ok(Some(window.process_name));
            }
        }

        thread::sleep(PICK_PROCESS_POLL_INTERVAL);
    }
}

fn left_mouse_pressed() -> Result<bool, String> {
    linux_x11::with_display(|display| {
        let pointer = linux_x11::query_pointer(display)?;
        Ok((pointer.mask & xlib::Button1Mask) != 0)
    })
}

fn process_executable_name_by_id(process_id: u32) -> Option<String> {
    let executable_path = fs::read_link(format!("/proc/{process_id}/exe")).ok()?;
    let executable_name = executable_path.file_name()?.to_string_lossy();
    normalize_process_name(&executable_name)
}

fn normalize_process_name(value: &str) -> Option<String> {
    process_filters_shared::normalize_process_name_with_suffix(value, None)
}

fn alias_current_app_process_name(process_id: u32, process_name: String) -> String {
    if process_id == std::process::id() && process_name == TAURI_NATIVE_PROCESS_NAME {
        CURRENT_APP_PROCESS_NAME.to_string()
    } else {
        process_name
    }
}

fn open_app_windows(display: *mut xlib::Display) -> Result<Vec<xlib::Window>, String> {
    if let Some(windows) = root_window_list_property(display, "_NET_CLIENT_LIST_STACKING")? {
        return Ok(windows);
    }

    if let Some(windows) = root_window_list_property(display, "_NET_CLIENT_LIST")? {
        return Ok(windows);
    }

    root_window_children(display)
}

fn open_app_process_by_window(
    display: *mut xlib::Display,
    window: xlib::Window,
) -> Result<Option<WindowProcessInfo>, String> {
    if window == 0 || !window_is_open_app_candidate(display, window)? {
        return Ok(None);
    }

    let Some(process_info) = window_process_info(display, window)? else {
        return Ok(None);
    };

    if process_info.title.trim().is_empty() {
        return Ok(None);
    }

    Ok(Some(process_info))
}

fn hovered_open_app_at_window(
    display: *mut xlib::Display,
    window: xlib::Window,
) -> Result<Option<WindowProcessInfo>, String> {
    if window == 0 {
        return Ok(None);
    }

    let Some(process_info) = window_process_info(display, window)? else {
        return Ok(None);
    };

    Ok(Some(process_info))
}

fn active_window(display: *mut xlib::Display) -> Option<xlib::Window> {
    let root_window = unsafe { xlib::XDefaultRootWindow(display) };

    if let Some(window) = root_window_property_window(display, root_window, "_NET_ACTIVE_WINDOW") {
        if window != 0 {
            return Some(window);
        }
    }

    let mut focused_window: xlib::Window = 0;
    let mut revert_to = xlib::RevertToNone;
    unsafe {
        xlib::XGetInputFocus(display, &mut focused_window, &mut revert_to);
    }

    (focused_window != 0).then_some(focused_window)
}

fn window_process_info(
    display: *mut xlib::Display,
    window: xlib::Window,
) -> Result<Option<WindowProcessInfo>, String> {
    let mut title_fallback = None;
    let mut icon_fallback = None;
    let mut current_window = Some(window);
    let root_window = unsafe { xlib::XDefaultRootWindow(display) };

    while let Some(candidate_window) = current_window {
        title_fallback =
            title_fallback.or_else(|| window_title_by_window(display, candidate_window));
        if icon_fallback.is_none() {
            icon_fallback = window_icon_data_url(display, candidate_window);
        }

        let Some(process_id) = window_process_id_direct(display, candidate_window) else {
            current_window = parent_window(display, candidate_window)?;
            continue;
        };

        let Some(process_name) = process_name_by_id(process_id)? else {
            current_window = parent_window(display, candidate_window)?;
            continue;
        };

        let title = window_title_by_window(display, candidate_window)
            .or_else(|| title_fallback.clone())
            .unwrap_or_else(|| process_name.clone());
        let icon_data_url =
            window_icon_data_url(display, candidate_window).or_else(|| icon_fallback.clone());

        return Ok(Some(WindowProcessInfo {
            icon_data_url,
            process_name,
            title,
        }));
    }

    if window != root_window {
        if let Some(process_id) = window_process_id_direct(display, root_window) {
            if let Some(process_name) = process_name_by_id(process_id)? {
                return Ok(Some(WindowProcessInfo {
                    icon_data_url: icon_fallback,
                    title: process_name.clone(),
                    process_name,
                }));
            }
        }
    }

    Ok(None)
}

fn window_process_id(display: *mut xlib::Display, window: xlib::Window) -> Option<u32> {
    let mut current_window = Some(window);

    while let Some(candidate_window) = current_window {
        if let Some(process_id) = window_process_id_direct(display, candidate_window) {
            return Some(process_id);
        }

        current_window = parent_window(display, candidate_window).ok().flatten();
    }

    None
}

fn window_process_id_direct(display: *mut xlib::Display, window: xlib::Window) -> Option<u32> {
    let property = intern_atom(display, "_NET_WM_PID")?;
    let values = read_window_property_ulongs(display, window, property, Some(xlib::XA_CARDINAL))?;
    values
        .first()
        .copied()
        .map(|value| value as u32)
        .filter(|value| *value != 0)
}

fn window_title_by_window(display: *mut xlib::Display, window: xlib::Window) -> Option<String> {
    if let Some(net_wm_name) = intern_atom(display, "_NET_WM_NAME") {
        let utf8_string = intern_atom(display, "UTF8_STRING");
        if let Some(title) = read_window_property_string(display, window, net_wm_name, utf8_string)
        {
            let title = title.trim().to_string();
            if !title.is_empty() {
                return Some(title);
            }
        }
    }

    let mut name_ptr = std::ptr::null_mut();
    let fetched = unsafe { xlib::XFetchName(display, window, &mut name_ptr) } != 0;
    if !fetched || name_ptr.is_null() {
        return None;
    }

    let title = unsafe { CStr::from_ptr(name_ptr) }
        .to_string_lossy()
        .trim()
        .to_string();

    unsafe {
        xlib::XFree(name_ptr as *mut _);
    }

    (!title.is_empty()).then_some(title)
}

fn window_is_open_app_candidate(
    display: *mut xlib::Display,
    window: xlib::Window,
) -> Result<bool, String> {
    let mut attributes = unsafe { std::mem::zeroed::<xlib::XWindowAttributes>() };
    if unsafe { xlib::XGetWindowAttributes(display, window, &mut attributes) } == 0 {
        return Ok(false);
    }

    Ok(attributes.map_state == xlib::IsViewable && attributes.override_redirect == 0)
}

fn root_window_property_window(
    display: *mut xlib::Display,
    root_window: xlib::Window,
    property_name: &str,
) -> Option<xlib::Window> {
    let property = intern_atom(display, property_name)?;
    let values =
        read_window_property_ulongs(display, root_window, property, Some(xlib::XA_WINDOW))?;
    values.first().copied().map(|value| value as xlib::Window)
}

fn root_window_list_property(
    display: *mut xlib::Display,
    property_name: &str,
) -> Result<Option<Vec<xlib::Window>>, String> {
    let root_window = unsafe { xlib::XDefaultRootWindow(display) };
    let Some(property) = intern_atom(display, property_name) else {
        return Ok(None);
    };

    Ok(
        read_window_property_ulongs(display, root_window, property, Some(xlib::XA_WINDOW)).map(
            |windows| {
                windows
                    .into_iter()
                    .map(|window| window as xlib::Window)
                    .collect()
            },
        ),
    )
}

fn root_window_children(display: *mut xlib::Display) -> Result<Vec<xlib::Window>, String> {
    let root_window = unsafe { xlib::XDefaultRootWindow(display) };
    let mut root_return = 0;
    let mut parent_return = 0;
    let mut children_ptr = std::ptr::null_mut();
    let mut children_count = 0_u32;

    if unsafe {
        xlib::XQueryTree(
            display,
            root_window,
            &mut root_return,
            &mut parent_return,
            &mut children_ptr,
            &mut children_count,
        )
    } == 0
    {
        return Err("Unable to enumerate X11 windows.".into());
    }

    let windows = if children_ptr.is_null() || children_count == 0 {
        Vec::new()
    } else {
        let children = unsafe { std::slice::from_raw_parts(children_ptr, children_count as usize) };
        children.to_vec()
    };

    if !children_ptr.is_null() {
        unsafe {
            xlib::XFree(children_ptr as *mut _);
        }
    }

    Ok(windows)
}

fn parent_window(
    display: *mut xlib::Display,
    window: xlib::Window,
) -> Result<Option<xlib::Window>, String> {
    let mut root_return = 0;
    let mut parent_return = 0;
    let mut children_ptr = std::ptr::null_mut();
    let mut children_count = 0_u32;

    if unsafe {
        xlib::XQueryTree(
            display,
            window,
            &mut root_return,
            &mut parent_return,
            &mut children_ptr,
            &mut children_count,
        )
    } == 0
    {
        return Ok(None);
    }

    if !children_ptr.is_null() {
        unsafe {
            xlib::XFree(children_ptr as *mut _);
        }
    }

    if parent_return == 0 || parent_return == window {
        Ok(None)
    } else {
        Ok(Some(parent_return))
    }
}

fn intern_atom(display: *mut xlib::Display, name: &str) -> Option<xlib::Atom> {
    let name = CString::new(name).ok()?;
    let atom = unsafe { xlib::XInternAtom(display, name.as_ptr(), 0) };
    (atom != 0).then_some(atom)
}

fn read_window_property_ulongs(
    display: *mut xlib::Display,
    window: xlib::Window,
    property: xlib::Atom,
    expected_type: Option<xlib::Atom>,
) -> Option<Vec<c_ulong>> {
    let mut actual_type = 0;
    let mut actual_format = 0;
    let mut item_count = 0;
    let mut bytes_after = 0;
    let mut data = std::ptr::null_mut();

    let status = unsafe {
        xlib::XGetWindowProperty(
            display,
            window,
            property,
            0,
            MAX_WINDOW_PROPERTY_ITEMS,
            0,
            expected_type.unwrap_or(xlib::AnyPropertyType as xlib::Atom),
            &mut actual_type,
            &mut actual_format,
            &mut item_count,
            &mut bytes_after,
            &mut data,
        )
    };

    if status != xlib::Success as i32
        || data.is_null()
        || actual_format != 32
        || item_count == 0
        || expected_type
            .map(|expected_type| actual_type != expected_type)
            .unwrap_or(false)
    {
        if !data.is_null() {
            unsafe {
                xlib::XFree(data as *mut _);
            }
        }
        return None;
    }

    let values =
        unsafe { std::slice::from_raw_parts(data as *const c_ulong, item_count as usize) }.to_vec();

    unsafe {
        xlib::XFree(data as *mut _);
    }

    Some(values)
}

fn read_window_property_string(
    display: *mut xlib::Display,
    window: xlib::Window,
    property: xlib::Atom,
    expected_type: Option<xlib::Atom>,
) -> Option<String> {
    let mut actual_type = 0;
    let mut actual_format = 0;
    let mut item_count = 0;
    let mut bytes_after = 0;
    let mut data = std::ptr::null_mut();

    let status = unsafe {
        xlib::XGetWindowProperty(
            display,
            window,
            property,
            0,
            MAX_WINDOW_PROPERTY_ITEMS,
            0,
            expected_type.unwrap_or(xlib::AnyPropertyType as xlib::Atom),
            &mut actual_type,
            &mut actual_format,
            &mut item_count,
            &mut bytes_after,
            &mut data,
        )
    };

    if status != xlib::Success as i32
        || data.is_null()
        || actual_format != 8
        || item_count == 0
        || expected_type
            .map(|expected_type| actual_type != expected_type)
            .unwrap_or(false)
    {
        if !data.is_null() {
            unsafe {
                xlib::XFree(data as *mut _);
            }
        }
        return None;
    }

    let bytes = unsafe { std::slice::from_raw_parts(data as *const u8, item_count as usize) };
    let value = String::from_utf8_lossy(bytes).to_string();

    unsafe {
        xlib::XFree(data as *mut _);
    }

    let value = value.trim_matches('\0').trim().to_string();
    (!value.is_empty()).then_some(value)
}

fn window_icon_data_url(display: *mut xlib::Display, window: xlib::Window) -> Option<String> {
    let property = intern_atom(display, "_NET_WM_ICON")?;
    let values = read_window_property_ulongs(display, window, property, Some(xlib::XA_CARDINAL))?;
    let (width, height, rgba_bytes) = best_net_wm_icon_rgba(&values)?;

    let mut png_bytes = Vec::new();
    PngEncoder::new(&mut png_bytes)
        .write_image(&rgba_bytes, width, height, ColorType::Rgba8.into())
        .ok()?;

    Some(format!(
        "data:image/png;base64,{}",
        BASE64_STANDARD.encode(png_bytes)
    ))
}

fn best_net_wm_icon_rgba(values: &[c_ulong]) -> Option<(u32, u32, Vec<u8>)> {
    let mut offset = 0_usize;
    let mut best_icon: Option<(u64, u32, u32, Vec<u8>)> = None;

    while offset + 1 < values.len() {
        let width = u32::try_from(values[offset]).ok()?;
        let height = u32::try_from(values[offset + 1]).ok()?;
        offset += 2;

        let pixel_count = usize::try_from(width.checked_mul(height)?).ok()?;
        if width == 0 || height == 0 || offset + pixel_count > values.len() {
            break;
        }

        if width > MAX_NET_WM_ICON_DIMENSION || height > MAX_NET_WM_ICON_DIMENSION {
            offset += pixel_count;
            continue;
        }

        let mut rgba_bytes = Vec::with_capacity(pixel_count.saturating_mul(4));
        for pixel in &values[offset..offset + pixel_count] {
            let pixel = *pixel as u32;
            rgba_bytes.extend_from_slice(&[
                ((pixel >> 16) & 0xFF) as u8,
                ((pixel >> 8) & 0xFF) as u8,
                (pixel & 0xFF) as u8,
                ((pixel >> 24) & 0xFF) as u8,
            ]);
        }

        let score = u64::from(width).saturating_mul(u64::from(height));
        let replace_best = best_icon
            .as_ref()
            .map(|(best_score, ..)| score > *best_score)
            .unwrap_or(true);
        if replace_best {
            best_icon = Some((score, width, height, rgba_bytes));
        }

        offset += pixel_count;
    }

    best_icon.map(|(_, width, height, rgba_bytes)| (width, height, rgba_bytes))
}
