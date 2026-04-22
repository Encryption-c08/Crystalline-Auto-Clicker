use serde::{Deserialize, Serialize};

use crate::edge_stop::OverlayRect;

pub(crate) const DEFAULT_CLICK_LIMIT: &str = "100";
pub(crate) const MIN_CLICK_LIMIT: u64 = 1;
pub(crate) const MAX_CLICK_LIMIT: u64 = 1_000_000;
pub(crate) const DEFAULT_DOUBLE_CLICK_DELAY: &str = "0";
pub(crate) const MIN_DOUBLE_CLICK_DELAY: u64 = 0;
pub(crate) const DEFAULT_CLICK_DURATION_MAX: &str = "1";
pub(crate) const DEFAULT_CLICK_DURATION_MIN: &str = "1";
pub(crate) const MIN_CLICK_DURATION: u64 = 1;
pub(crate) const DEFAULT_JITTER_AXIS: &str = "0";
pub(crate) const MIN_JITTER_AXIS: i32 = -500;
pub(crate) const MAX_JITTER_AXIS: i32 = 500;
pub(crate) const DEFAULT_TIME_LIMIT: &str = "60";
pub(crate) const MIN_TIME_LIMIT: u64 = 1;
pub(crate) const MAX_TIME_LIMIT: u64 = 1_000_000;
pub(crate) const DEFAULT_EDGE_STOP_WIDTH: &str = "20";
pub(crate) const MIN_EDGE_STOP_WIDTH: u64 = 0;
pub(crate) const MAX_EDGE_STOP_WIDTH: u64 = 500;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClickMode {
    Toggle,
    Hold,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClickEngine {
    Classic,
    Throughput,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClickRateMode {
    Per,
    Every,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClickRateUnit {
    Ms,
    S,
    M,
    H,
    D,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MouseButton {
    Left,
    Middle,
    Right,
    Mouse4,
    Mouse5,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MouseAction {
    Click,
    Hold,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JitterMode {
    Random,
    Fixed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickPositionPoint {
    pub id: u32,
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickPositionNonIntrusiveTarget {
    pub process_name: String,
    pub title: String,
    pub class_name: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeStopFeedback {
    pub id: u64,
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoClickerCommandConfig {
    pub click_mode: ClickMode,
    pub click_rate: String,
    pub click_rate_mode: ClickRateMode,
    pub click_rate_unit: ClickRateUnit,
    pub process_whitelist: Vec<String>,
    pub process_blacklist: Vec<String>,
    pub hotkey_code: String,
    pub hotkey_label: String,
    pub interval_ms: u64,
    pub mouse_button: MouseButton,
    pub mouse_action: MouseAction,
    pub click_position_enabled: bool,
    pub click_positions: Vec<ClickPositionPoint>,
    pub click_position_non_intrusive_enabled: bool,
    pub click_position_non_intrusive_positions: Vec<ClickPositionPoint>,
    pub click_position_non_intrusive_target: Option<ClickPositionNonIntrusiveTarget>,
    pub click_region_enabled: bool,
    pub click_region: Option<OverlayRect>,
    pub jitter_enabled: bool,
    pub jitter_mode: JitterMode,
    pub jitter_x: String,
    pub jitter_y: String,
    pub double_click_enabled: bool,
    pub double_click_delay: String,
    pub click_duration_enabled: bool,
    pub click_duration_min: String,
    pub click_duration_max: String,
    pub click_limit_enabled: bool,
    pub click_limit: String,
    pub time_limit_enabled: bool,
    pub time_limit: String,
    pub time_limit_unit: ClickRateUnit,
    pub edge_stop_enabled: bool,
    pub edge_stop_top_width: String,
    pub edge_stop_right_width: String,
    pub edge_stop_bottom_width: String,
    pub edge_stop_left_width: String,
    pub click_engine: ClickEngine,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoClickerStatus {
    pub click_mode: ClickMode,
    pub clicker_active: bool,
    pub hotkey_label: String,
    pub hotkey_pressed: bool,
    pub interval_ms: u64,
    pub last_error: Option<String>,
    pub edge_stop_feedback: Option<EdgeStopFeedback>,
    pub worker_running: bool,
}

impl Default for AutoClickerCommandConfig {
    fn default() -> Self {
        Self {
            click_mode: ClickMode::Hold,
            click_rate: "25".into(),
            click_rate_mode: ClickRateMode::Per,
            click_rate_unit: ClickRateUnit::S,
            process_whitelist: Vec::new(),
            process_blacklist: Vec::new(),
            hotkey_code: String::new(),
            hotkey_label: "Unbound".into(),
            interval_ms: 40,
            mouse_button: MouseButton::Left,
            mouse_action: MouseAction::Click,
            click_position_enabled: false,
            click_positions: Vec::new(),
            click_position_non_intrusive_enabled: false,
            click_position_non_intrusive_positions: Vec::new(),
            click_position_non_intrusive_target: None,
            click_region_enabled: false,
            click_region: None,
            jitter_enabled: false,
            jitter_mode: JitterMode::Random,
            jitter_x: DEFAULT_JITTER_AXIS.into(),
            jitter_y: DEFAULT_JITTER_AXIS.into(),
            double_click_enabled: false,
            double_click_delay: DEFAULT_DOUBLE_CLICK_DELAY.into(),
            click_duration_enabled: false,
            click_duration_min: DEFAULT_CLICK_DURATION_MIN.into(),
            click_duration_max: DEFAULT_CLICK_DURATION_MAX.into(),
            click_limit_enabled: false,
            click_limit: DEFAULT_CLICK_LIMIT.into(),
            time_limit_enabled: false,
            time_limit: DEFAULT_TIME_LIMIT.into(),
            time_limit_unit: ClickRateUnit::S,
            edge_stop_enabled: false,
            edge_stop_top_width: DEFAULT_EDGE_STOP_WIDTH.into(),
            edge_stop_right_width: DEFAULT_EDGE_STOP_WIDTH.into(),
            edge_stop_bottom_width: DEFAULT_EDGE_STOP_WIDTH.into(),
            edge_stop_left_width: DEFAULT_EDGE_STOP_WIDTH.into(),
            click_engine: ClickEngine::Classic,
        }
    }
}

impl AutoClickerStatus {
    pub(crate) fn from_config(config: &AutoClickerCommandConfig) -> Self {
        Self {
            click_mode: config.click_mode,
            clicker_active: false,
            hotkey_label: config.hotkey_label.clone(),
            hotkey_pressed: false,
            interval_ms: config.interval_ms.max(1),
            last_error: None,
            edge_stop_feedback: None,
            worker_running: true,
        }
    }
}
