#[cfg(target_os = "windows")]
use std::mem::size_of;

#[cfg(target_os = "windows")]
use windows_sys::Win32::{
    Foundation::{LPARAM, RECT},
    Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO},
    UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
        SM_YVIRTUALSCREEN,
    },
};

#[cfg(target_os = "linux")]
use crate::linux_x11;

#[path = "../shared/edge_stop.rs"]
mod edge_stop_shared;

use edge_stop_shared::build_edge_stop_zones;
pub use edge_stop_shared::{cursor_hits_edge_stop, EdgeStopRuntime, EdgeStopWidths, OverlayRect};

#[cfg(target_os = "windows")]
pub fn edge_stop_runtime(widths: EdgeStopWidths) -> EdgeStopRuntime {
    if !widths.any_active() {
        return EdgeStopRuntime::default();
    }

    let mut monitors = enumerate_monitor_rectangles();
    if monitors.is_empty() {
        monitors.push(virtual_screen_rect());
    }

    let zones = build_edge_stop_zones(&monitors, widths);

    EdgeStopRuntime { monitors, zones }
}

#[cfg(target_os = "linux")]
pub fn edge_stop_runtime(widths: EdgeStopWidths) -> EdgeStopRuntime {
    if !widths.any_active() {
        return EdgeStopRuntime::default();
    }

    let Ok((width, height)) = linux_x11::display_size() else {
        return EdgeStopRuntime::default();
    };

    let monitors = vec![OverlayRect {
        x: 0,
        y: 0,
        width,
        height,
    }];
    let zones = build_edge_stop_zones(&monitors, widths);

    EdgeStopRuntime { monitors, zones }
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
pub fn edge_stop_runtime(_widths: EdgeStopWidths) -> EdgeStopRuntime {
    EdgeStopRuntime::default()
}

#[cfg(target_os = "windows")]
fn enumerate_monitor_rectangles() -> Vec<OverlayRect> {
    let mut monitors = Vec::new();

    unsafe {
        let _ = EnumDisplayMonitors(
            std::ptr::null_mut(),
            std::ptr::null(),
            Some(collect_monitor_rectangles),
            &mut monitors as *mut Vec<OverlayRect> as LPARAM,
        );
    }

    monitors
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn collect_monitor_rectangles(
    monitor: HMONITOR,
    _hdc: HDC,
    _clip_rect: *mut RECT,
    data: LPARAM,
) -> i32 {
    let monitors = &mut *(data as *mut Vec<OverlayRect>);
    let mut info = MONITORINFO {
        cbSize: size_of::<MONITORINFO>() as u32,
        rcMonitor: RECT::default(),
        rcWork: RECT::default(),
        dwFlags: 0,
    };

    if GetMonitorInfoW(monitor, &mut info as *mut MONITORINFO) != 0 {
        let rect = rect_to_overlay_rect(info.rcMonitor);
        if rect.width > 0 && rect.height > 0 {
            monitors.push(rect);
        }
    }

    1
}

#[cfg(target_os = "windows")]
fn rect_to_overlay_rect(rect: RECT) -> OverlayRect {
    OverlayRect {
        x: rect.left,
        y: rect.top,
        width: rect.right.saturating_sub(rect.left),
        height: rect.bottom.saturating_sub(rect.top),
    }
}

#[cfg(target_os = "windows")]
fn virtual_screen_rect() -> OverlayRect {
    OverlayRect {
        x: unsafe { GetSystemMetrics(SM_XVIRTUALSCREEN) },
        y: unsafe { GetSystemMetrics(SM_YVIRTUALSCREEN) },
        width: unsafe { GetSystemMetrics(SM_CXVIRTUALSCREEN) }.max(1),
        height: unsafe { GetSystemMetrics(SM_CYVIRTUALSCREEN) }.max(1),
    }
}
