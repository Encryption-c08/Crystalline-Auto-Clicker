use std::collections::HashSet;

use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAppProcess {
    pub icon_data_url: Option<String>,
    pub name: String,
}

pub(crate) fn normalize_process_name_with_suffix(
    value: &str,
    executable_suffix: Option<&str>,
) -> Option<String> {
    let trimmed_value = value.trim();
    if trimmed_value.is_empty() {
        return None;
    }

    let basename = trimmed_value
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or(trimmed_value)
        .trim()
        .to_ascii_lowercase();

    if basename.is_empty() {
        return None;
    }

    if basename.contains('.') {
        Some(basename)
    } else {
        Some(match executable_suffix {
            Some(suffix) => format!("{basename}{suffix}"),
            None => basename,
        })
    }
}

pub(crate) fn normalize_process_name_list_with_suffix(
    values: &[String],
    executable_suffix: Option<&str>,
) -> Vec<String> {
    let mut normalized_values = Vec::new();
    let mut seen_values = HashSet::new();

    for value in values {
        let Some(normalized_value) =
            normalize_process_name_with_suffix(value, executable_suffix)
        else {
            continue;
        };

        if seen_values.insert(normalized_value.clone()) {
            normalized_values.push(normalized_value);
        }
    }

    normalized_values
}

pub(crate) fn is_process_allowed_with_suffix(
    process_name: Option<&str>,
    whitelist: &[String],
    blacklist: &[String],
    executable_suffix: Option<&str>,
) -> bool {
    let normalized_process_name =
        process_name.and_then(|value| normalize_process_name_with_suffix(value, executable_suffix));

    if !whitelist.is_empty() {
        return normalized_process_name
            .as_deref()
            .map(|name| whitelist.iter().any(|rule| rule == name))
            .unwrap_or(false);
    }

    normalized_process_name
        .as_deref()
        .map(|name| !blacklist.iter().any(|rule| rule == name))
        .unwrap_or(true)
}
