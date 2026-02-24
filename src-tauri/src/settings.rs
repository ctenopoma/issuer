use crate::config::AppConfig;
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Serialize, Deserialize, Default)]
pub struct UserSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_theme: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proxy_url: Option<String>,
}

fn settings_path(config: &AppConfig) -> std::path::PathBuf {
    config.local_dir.join("settings.json")
}

pub fn read_settings(config: &AppConfig) -> UserSettings {
    let path = settings_path(config);
    if let Ok(content) = fs::read_to_string(&path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        UserSettings::default()
    }
}

pub fn write_settings_pub(config: &AppConfig, settings: &UserSettings) -> Result<(), String> {
    let path = settings_path(config);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_os_username() -> String {
    whoami::username()
}

#[tauri::command]
pub fn get_user_display_name(state: tauri::State<'_, crate::AppState>) -> Result<Option<String>, String> {
    let settings = read_settings(&state.config);
    Ok(settings.display_name)
}

#[tauri::command]
pub fn set_user_display_name(name: Option<String>, state: tauri::State<'_, crate::AppState>) -> Result<(), String> {
    let mut settings = read_settings(&state.config);
    settings.display_name = name.filter(|n| !n.trim().is_empty());
    write_settings_pub(&state.config, &settings)
}

#[tauri::command]
pub fn get_proxy_url(state: tauri::State<'_, crate::AppState>) -> Result<Option<String>, String> {
    let settings = read_settings(&state.config);
    Ok(settings.proxy_url)
}

#[tauri::command]
pub fn set_proxy_url(url: Option<String>, state: tauri::State<'_, crate::AppState>) -> Result<(), String> {
    let mut settings = read_settings(&state.config);
    settings.proxy_url = url.filter(|u| !u.trim().is_empty());
    write_settings_pub(&state.config, &settings)
}
