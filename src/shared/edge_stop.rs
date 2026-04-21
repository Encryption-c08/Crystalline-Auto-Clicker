use serde::{Deserialize, Serialize};

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
    if runtime
        .zones
        .iter()
        .copied()
        .any(|zone| zone.contains(x, y))
    {
        return true;
    }

    !runtime.monitors.is_empty()
        && !runtime
            .monitors
            .iter()
            .copied()
            .any(|monitor| monitor.contains(x, y))
}

pub(crate) fn build_edge_stop_zones(
    monitors: &[OverlayRect],
    widths: EdgeStopWidths,
) -> Vec<OverlayRect> {
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
