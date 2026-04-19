use serde::{Deserialize, Serialize};

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

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OverlayRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

impl OverlayRect {
    fn bottom(self) -> i32 {
        self.y.saturating_add(self.height.max(0))
    }

    fn contains(self, x: i32, y: i32) -> bool {
        x >= self.x && x < self.right() && y >= self.y && y < self.bottom()
    }

    fn right(self) -> i32 {
        self.x.saturating_add(self.width.max(0))
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct EdgeStopWidths {
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
    pub left: i32,
}

impl EdgeStopWidths {
    pub fn any_active(self) -> bool {
        self.top > 0 || self.right > 0 || self.bottom > 0 || self.left > 0
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct EdgeStopRuntime {
    pub monitors: Vec<OverlayRect>,
    pub zones: Vec<OverlayRect>,
}

pub fn cursor_hits_edge_stop(runtime: &EdgeStopRuntime, x: i32, y: i32) -> bool {
    if runtime.zones.iter().copied().any(|zone| zone.contains(x, y)) {
        return true;
    }

    !runtime.monitors.is_empty()
        && !runtime
            .monitors
            .iter()
            .copied()
            .any(|monitor| monitor.contains(x, y))
}

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

#[cfg(not(target_os = "windows"))]
pub fn edge_stop_runtime(_widths: EdgeStopWidths) -> EdgeStopRuntime {
    EdgeStopRuntime::default()
}

#[cfg(target_os = "windows")]
fn build_edge_stop_zones(monitors: &[OverlayRect], widths: EdgeStopWidths) -> Vec<OverlayRect> {
    let mut zones = Vec::new();

    for monitor in monitors.iter().copied() {
        if widths.top > 0 {
            let mut segments = vec![(monitor.x, monitor.right())];
            for other in monitors.iter().copied() {
                if other.bottom() == monitor.y {
                    subtract_interval(&mut segments, other.x, other.right());
                }
            }

            for (start, end) in segments {
                let width = end.saturating_sub(start);
                let height = widths.top.min(monitor.height);
                if width > 0 && height > 0 {
                    zones.push(OverlayRect {
                        x: start,
                        y: monitor.y,
                        width,
                        height,
                    });
                }
            }
        }

        if widths.bottom > 0 {
            let mut segments = vec![(monitor.x, monitor.right())];
            for other in monitors.iter().copied() {
                if other.y == monitor.bottom() {
                    subtract_interval(&mut segments, other.x, other.right());
                }
            }

            for (start, end) in segments {
                let width = end.saturating_sub(start);
                let height = widths.bottom.min(monitor.height);
                if width > 0 && height > 0 {
                    zones.push(OverlayRect {
                        x: start,
                        y: monitor.bottom().saturating_sub(height),
                        width,
                        height,
                    });
                }
            }
        }

        if widths.left > 0 {
            let mut segments = vec![(monitor.y, monitor.bottom())];
            for other in monitors.iter().copied() {
                if other.right() == monitor.x {
                    subtract_interval(&mut segments, other.y, other.bottom());
                }
            }

            for (start, end) in segments {
                let width = widths.left.min(monitor.width);
                let height = end.saturating_sub(start);
                if width > 0 && height > 0 {
                    zones.push(OverlayRect {
                        x: monitor.x,
                        y: start,
                        width,
                        height,
                    });
                }
            }
        }

        if widths.right > 0 {
            let mut segments = vec![(monitor.y, monitor.bottom())];
            for other in monitors.iter().copied() {
                if other.x == monitor.right() {
                    subtract_interval(&mut segments, other.y, other.bottom());
                }
            }

            for (start, end) in segments {
                let width = widths.right.min(monitor.width);
                let height = end.saturating_sub(start);
                if width > 0 && height > 0 {
                    zones.push(OverlayRect {
                        x: monitor.right().saturating_sub(width),
                        y: start,
                        width,
                        height,
                    });
                }
            }
        }
    }

    zones
}

#[cfg(target_os = "windows")]
fn subtract_interval(segments: &mut Vec<(i32, i32)>, cut_start: i32, cut_end: i32) {
    if cut_start >= cut_end {
        return;
    }

    let mut next_segments = Vec::with_capacity(segments.len());
    for (segment_start, segment_end) in segments.drain(..) {
        let overlap_start = segment_start.max(cut_start);
        let overlap_end = segment_end.min(cut_end);

        if overlap_start >= overlap_end {
            next_segments.push((segment_start, segment_end));
            continue;
        }

        if segment_start < overlap_start {
            next_segments.push((segment_start, overlap_start));
        }

        if overlap_end < segment_end {
            next_segments.push((overlap_end, segment_end));
        }
    }

    *segments = next_segments;
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
