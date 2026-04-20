use std::collections::HashSet;

#[cfg(target_os = "windows")]
use base64::{prelude::BASE64_STANDARD, Engine};
#[cfg(target_os = "windows")]
use image::{codecs::png::PngEncoder, ColorType, ImageEncoder};
#[cfg(target_os = "windows")]
use std::{mem::size_of, ptr::null_mut, thread, time::Duration};

#[cfg(target_os = "windows")]
use windows_sys::Win32::{
    Foundation::{CloseHandle, HWND, INVALID_HANDLE_VALUE, LPARAM, POINT},
    Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC,
        SelectObject, BITMAPINFO, BITMAPV5HEADER, BI_BITFIELDS, DIB_RGB_COLORS,
    },
    System::{
        Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
            TH32CS_SNAPPROCESS,
        },
        Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
        },
    },
    UI::{
        Input::KeyboardAndMouse::{GetAsyncKeyState, VK_ESCAPE, VK_LBUTTON},
        Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON},
        WindowsAndMessaging::{
            DestroyIcon, DrawIconEx, EnumWindows, GetAncestor, GetCursorPos,
            GetForegroundWindow, GetWindow, GetWindowLongW, GetWindowTextLengthW,
            GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible, WindowFromPoint,
            DI_NORMAL, GA_ROOT, GW_OWNER, GWL_EXSTYLE, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
        },
    },
};

#[path = "../shared/process_filters.rs"]
mod process_filters_shared;

pub(crate) use process_filters_shared::OpenAppProcess;

const WINDOWS_EXECUTABLE_SUFFIX: &str = ".exe";

#[cfg(target_os = "windows")]
const OPEN_APP_ICON_SIZE: i32 = 32;

#[cfg(target_os = "windows")]
#[derive(Clone, Debug)]
struct HoveredOpenAppWindow {
    process_name: String,
    title: String,
}

pub(crate) fn normalize_process_name(value: &str) -> Option<String> {
    process_filters_shared::normalize_process_name_with_suffix(
        value,
        Some(WINDOWS_EXECUTABLE_SUFFIX),
    )
}

pub(crate) fn normalize_process_name_list(values: &[String]) -> Vec<String> {
    process_filters_shared::normalize_process_name_list_with_suffix(
        values,
        Some(WINDOWS_EXECUTABLE_SUFFIX),
    )
}

pub(crate) fn is_process_allowed(
    process_name: Option<&str>,
    whitelist: &[String],
    blacklist: &[String],
) -> bool {
    process_filters_shared::is_process_allowed_with_suffix(
        process_name,
        whitelist,
        blacklist,
        Some(WINDOWS_EXECUTABLE_SUFFIX),
    )
}

#[cfg(target_os = "windows")]
fn process_entry_name(entry: &PROCESSENTRY32W) -> Option<String> {
    let name_length = entry
        .szExeFile
        .iter()
        .position(|value| *value == 0)
        .unwrap_or(entry.szExeFile.len());

    if name_length == 0 {
        return None;
    }

    let process_name = String::from_utf16_lossy(&entry.szExeFile[..name_length]);
    normalize_process_name(&process_name)
}

#[cfg(target_os = "windows")]
fn with_process_snapshot<T>(
    mut callback: impl FnMut(&PROCESSENTRY32W) -> Option<T>,
) -> Result<Option<T>, String> {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Err("Unable to create process snapshot.".into());
    }

    let mut entry = unsafe { std::mem::zeroed::<PROCESSENTRY32W>() };
    entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;

    let mut result = None;
    if unsafe { Process32FirstW(snapshot, &mut entry) } != 0 {
        loop {
            if let Some(value) = callback(&entry) {
                result = Some(value);
                break;
            }

            if unsafe { Process32NextW(snapshot, &mut entry) } == 0 {
                break;
            }
        }
    }

    unsafe {
        let _ = CloseHandle(snapshot);
    }

    Ok(result)
}

#[cfg(target_os = "windows")]
fn root_window(window: HWND) -> HWND {
    let root = unsafe { GetAncestor(window, GA_ROOT) };
    if root.is_null() { window } else { root }
}

#[cfg(target_os = "windows")]
fn is_open_app_window(window: HWND) -> bool {
    if window.is_null() {
        return false;
    }

    if root_window(window) != window {
        return false;
    }

    if unsafe { IsWindowVisible(window) } == 0 {
        return false;
    }

    if unsafe { GetWindowTextLengthW(window) } == 0 {
        return false;
    }

    let extended_style = unsafe { GetWindowLongW(window, GWL_EXSTYLE) } as u32;
    if extended_style & WS_EX_TOOLWINDOW != 0 {
        return false;
    }

    let owner = unsafe { GetWindow(window, GW_OWNER) };
    owner.is_null() || extended_style & WS_EX_APPWINDOW != 0
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
fn window_title_by_window(window: HWND) -> Option<String> {
    if window.is_null() {
        return None;
    }

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
    if title.is_empty() {
        None
    } else {
        Some(title)
    }
}

#[cfg(target_os = "windows")]
fn process_executable_path_by_id(process_id: u32) -> Result<Option<String>, String> {
    let process_handle =
        unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id) };
    if process_handle.is_null() {
        return Ok(None);
    }

    let mut path_buffer = vec![0u16; 1024];
    let mut path_length = path_buffer.len() as u32;
    let query_succeeded = unsafe {
        QueryFullProcessImageNameW(
            process_handle,
            0,
            path_buffer.as_mut_ptr(),
            &mut path_length,
        )
    } != 0;

    unsafe {
        let _ = CloseHandle(process_handle);
    }

    if !query_succeeded {
        return Ok(None);
    }

    path_buffer.truncate(path_length as usize);
    if path_buffer.is_empty() {
        return Ok(None);
    }

    Ok(Some(String::from_utf16_lossy(&path_buffer)))
}

#[cfg(target_os = "windows")]
fn process_executable_path_by_window(window: HWND) -> Result<Option<String>, String> {
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

    process_executable_path_by_id(process_id)
}

#[cfg(target_os = "windows")]
fn icon_data_url_for_executable_path(executable_path: &str) -> Option<String> {
    let wide_path: Vec<u16> = executable_path.encode_utf16().chain([0]).collect();
    let mut file_info = unsafe { std::mem::zeroed::<SHFILEINFOW>() };

    let result = unsafe {
        SHGetFileInfoW(
            wide_path.as_ptr(),
            0,
            &mut file_info,
            size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        )
    };
    if result == 0 || file_info.hIcon.is_null() {
        return None;
    }

    let icon_data_url = icon_data_url_from_hicon(file_info.hIcon);

    unsafe {
        let _ = DestroyIcon(file_info.hIcon);
    }

    icon_data_url
}

#[cfg(target_os = "windows")]
fn icon_data_url_from_hicon(icon_handle: windows_sys::Win32::UI::WindowsAndMessaging::HICON) -> Option<String> {
    let screen_dc = unsafe { GetDC(null_mut()) };
    if screen_dc.is_null() {
        return None;
    }

    let memory_dc = unsafe { CreateCompatibleDC(screen_dc) };
    if memory_dc.is_null() {
        unsafe {
            let _ = ReleaseDC(null_mut(), screen_dc);
        }
        return None;
    }

    let mut bitmap_header = unsafe { std::mem::zeroed::<BITMAPV5HEADER>() };
    bitmap_header.bV5Size = size_of::<BITMAPV5HEADER>() as u32;
    bitmap_header.bV5Width = OPEN_APP_ICON_SIZE;
    bitmap_header.bV5Height = -OPEN_APP_ICON_SIZE;
    bitmap_header.bV5Planes = 1;
    bitmap_header.bV5BitCount = 32;
    bitmap_header.bV5Compression = BI_BITFIELDS;
    bitmap_header.bV5RedMask = 0x00FF_0000;
    bitmap_header.bV5GreenMask = 0x0000_FF00;
    bitmap_header.bV5BlueMask = 0x0000_00FF;
    bitmap_header.bV5AlphaMask = 0xFF00_0000;

    let mut bitmap_bits = std::ptr::null_mut();
    let color_bitmap = unsafe {
        CreateDIBSection(
            screen_dc,
            &bitmap_header as *const BITMAPV5HEADER as *const BITMAPINFO,
            DIB_RGB_COLORS,
            &mut bitmap_bits,
            null_mut(),
            0,
        )
    };
    if color_bitmap.is_null() || bitmap_bits.is_null() {
        unsafe {
            let _ = DeleteDC(memory_dc);
            let _ = ReleaseDC(null_mut(), screen_dc);
        }
        return None;
    }

    let previous_bitmap = unsafe { SelectObject(memory_dc, color_bitmap) };
    let draw_succeeded = unsafe {
        DrawIconEx(
            memory_dc,
            0,
            0,
            icon_handle,
            OPEN_APP_ICON_SIZE,
            OPEN_APP_ICON_SIZE,
            0,
            null_mut(),
            DI_NORMAL,
        )
    } != 0;

    let rgba_bytes = if draw_succeeded {
        let bitmap_length = (OPEN_APP_ICON_SIZE * OPEN_APP_ICON_SIZE * 4) as usize;
        let bgra_bytes =
            unsafe { std::slice::from_raw_parts(bitmap_bits as *const u8, bitmap_length) };
        let mut rgba_bytes = Vec::with_capacity(bitmap_length);

        for chunk in bgra_bytes.chunks_exact(4) {
            rgba_bytes.extend_from_slice(&[chunk[2], chunk[1], chunk[0], chunk[3]]);
        }

        Some(rgba_bytes)
    } else {
        None
    };

    unsafe {
        let _ = SelectObject(memory_dc, previous_bitmap);
        let _ = DeleteObject(color_bitmap);
        let _ = DeleteDC(memory_dc);
        let _ = ReleaseDC(null_mut(), screen_dc);
    }

    let rgba_bytes = rgba_bytes?;
    let mut png_bytes = Vec::new();
    let png_encoder = PngEncoder::new(&mut png_bytes);
    png_encoder
        .write_image(
            &rgba_bytes,
            OPEN_APP_ICON_SIZE as u32,
            OPEN_APP_ICON_SIZE as u32,
            ColorType::Rgba8.into(),
        )
        .ok()?;

    Some(format!(
        "data:image/png;base64,{}",
        BASE64_STANDARD.encode(png_bytes)
    ))
}

#[cfg(target_os = "windows")]
fn open_app_process_by_window(window: HWND) -> Result<Option<OpenAppProcess>, String> {
    let Some(name) = process_name_by_window(window)? else {
        return Ok(None);
    };

    let icon_data_url = process_executable_path_by_window(window)?
        .as_deref()
        .and_then(icon_data_url_for_executable_path);

    Ok(Some(OpenAppProcess { icon_data_url, name }))
}

#[cfg(target_os = "windows")]
#[derive(Default)]
struct OpenAppProcessEnumState {
    first_error: Option<String>,
    processes: Vec<OpenAppProcess>,
    seen_process_names: HashSet<String>,
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn collect_open_app_processes(window: HWND, lparam: LPARAM) -> i32 {
    let state = unsafe { &mut *(lparam as *mut OpenAppProcessEnumState) };

    if !is_open_app_window(window) {
        return 1;
    }

    match open_app_process_by_window(window) {
        Ok(Some(process)) => {
            if state.seen_process_names.insert(process.name.clone()) {
                state.processes.push(process);
            }
        }
        Ok(None) => {}
        Err(error) => {
            if state.first_error.is_none() {
                state.first_error = Some(error);
            }
        }
    }

    1
}

#[cfg(target_os = "windows")]
fn is_virtual_key_pressed(virtual_key: i32) -> bool {
    unsafe { (GetAsyncKeyState(virtual_key) as u16 & 0x8000) != 0 }
}

#[cfg(target_os = "windows")]
fn hovered_open_app_at_point(point: POINT) -> Result<Option<HoveredOpenAppWindow>, String> {
    let window = unsafe { WindowFromPoint(point) };
    if window.is_null() {
        return Ok(None);
    }

    let window = root_window(window);
    if !is_open_app_window(window) {
        return Ok(None);
    }

    let Some(process_name) = process_name_by_window(window)? else {
        return Ok(None);
    };

    let title = window_title_by_window(window).unwrap_or_else(|| process_name.clone());

    Ok(Some(HoveredOpenAppWindow { process_name, title }))
}

#[cfg(target_os = "windows")]
pub(crate) fn list_running_process_names() -> Result<Vec<String>, String> {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Err("Unable to create process snapshot.".into());
    }

    let mut entry = unsafe { std::mem::zeroed::<PROCESSENTRY32W>() };
    entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;

    let mut process_names = Vec::new();
    let mut seen_process_names = HashSet::new();

    if unsafe { Process32FirstW(snapshot, &mut entry) } != 0 {
        loop {
            if let Some(process_name) = process_entry_name(&entry) {
                if seen_process_names.insert(process_name.clone()) {
                    process_names.push(process_name);
                }
            }

            if unsafe { Process32NextW(snapshot, &mut entry) } == 0 {
                break;
            }
        }
    }

    unsafe {
        let _ = CloseHandle(snapshot);
    }

    process_names.sort_unstable();
    Ok(process_names)
}

#[cfg(target_os = "windows")]
pub(crate) fn list_open_app_processes() -> Result<Vec<OpenAppProcess>, String> {
    let mut state = OpenAppProcessEnumState::default();

    if unsafe {
        EnumWindows(
            Some(collect_open_app_processes),
            &mut state as *mut OpenAppProcessEnumState as LPARAM,
        )
    } == 0
    {
        return Err("Unable to enumerate open app windows.".into());
    }

    if let Some(error) = state.first_error {
        return Err(error);
    }

    state.processes.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(state.processes)
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn list_running_process_names() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn list_open_app_processes() -> Result<Vec<OpenAppProcess>, String> {
    Ok(Vec::new())
}

#[cfg(target_os = "windows")]
pub(crate) fn process_name_by_id(process_id: u32) -> Result<Option<String>, String> {
    with_process_snapshot(|entry| {
        if entry.th32ProcessID == process_id {
            process_entry_name(entry)
        } else {
            None
        }
    })
}

#[cfg(target_os = "windows")]
pub(crate) fn foreground_process_id() -> Option<u32> {
    let foreground_window = unsafe { GetForegroundWindow() };
    if foreground_window.is_null() {
        return None;
    }

    let mut process_id = 0;
    unsafe {
        GetWindowThreadProcessId(foreground_window, &mut process_id);
    }

    if process_id == 0 {
        None
    } else {
        Some(process_id)
    }
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn foreground_process_id() -> Option<u32> {
    None
}

#[cfg(target_os = "windows")]
pub(crate) fn foreground_process_name() -> Result<Option<String>, String> {
    let Some(process_id) = foreground_process_id() else {
        return Ok(None);
    };

    process_name_by_id(process_id)
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn foreground_process_name() -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(target_os = "windows")]
pub(crate) fn pick_process_name_from_click(
    mut on_hover: impl FnMut(POINT, Option<&str>) -> Result<(), String>,
) -> Result<Option<String>, String> {
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

        let hovered_window = hovered_open_app_at_point(cursor)?;
        let hovered_title = hovered_window.as_ref().map(|window| window.title.as_str());

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
            if let Some(window) = hovered_window {
                return Ok(Some(window.process_name));
            }
        }

        thread::sleep(Duration::from_millis(8));
    }
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn pick_process_name_from_click() -> Result<Option<String>, String> {
    Ok(None)
}
