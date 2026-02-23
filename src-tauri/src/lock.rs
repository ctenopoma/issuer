use crate::config::AppConfig;
use chrono::{DateTime, Duration, Local};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Read;

#[derive(Serialize, Deserialize, Debug)]
pub struct LockData {
    pub user: String,
    pub locked_at: String,
    pub updated_at: String,
}

#[derive(Clone, Serialize, Debug)]
pub enum LockStatus {
    Edit,
    ReadOnly(String),
    Zombie(String),
}

/// Frontend-friendly lock info
#[derive(Clone, Serialize, Debug)]
pub struct LockInfo {
    pub mode: String, // "edit" | "readonly" | "zombie"
    pub locked_by: Option<String>,
    pub current_user: String,
    pub display_name: String,
}

impl LockInfo {
    pub fn from_status(status: &LockStatus, config: &crate::config::AppConfig) -> Self {
        let current_user = whoami::username();
        let settings = crate::settings::read_settings(config);
        let display_name = settings.display_name.unwrap_or_else(|| whoami::realname());
        match status {
            LockStatus::Edit => LockInfo {
                mode: "edit".into(),
                locked_by: None,
                current_user,
                display_name,
            },
            LockStatus::ReadOnly(u) => LockInfo {
                mode: "readonly".into(),
                locked_by: Some(u.clone()),
                current_user,
                display_name,
            },
            LockStatus::Zombie(u) => LockInfo {
                mode: "zombie".into(),
                locked_by: Some(u.clone()),
                current_user,
                display_name,
            },
        }
    }
}

pub fn check_lock_on_startup(config: &AppConfig) -> LockStatus {
    if !config.lock_path.exists() {
        write_lock(config);
        return LockStatus::Edit;
    }

    if let Ok(mut file) = File::open(&config.lock_path) {
        let mut content = String::new();
        if file.read_to_string(&mut content).is_ok() {
            if let Ok(lock_data) = serde_json::from_str::<LockData>(&content) {
                if is_zombie_lock(&lock_data) {
                    return LockStatus::Zombie(lock_data.user);
                }
                if lock_data.user == whoami::username() {
                    update_lock_timestamp(config);
                    return LockStatus::Edit;
                }
                return LockStatus::ReadOnly(lock_data.user);
            }
        }
    }
    LockStatus::ReadOnly("Unknown".to_string())
}

pub fn write_lock(config: &AppConfig) {
    let now = Local::now().to_rfc3339();
    let data = LockData {
        user: whoami::username(),
        locked_at: now.clone(),
        updated_at: now,
    };
    if let Ok(json) = serde_json::to_string_pretty(&data) {
        let _ = fs::write(&config.lock_path, json);
    }
}

pub fn update_lock_timestamp(config: &AppConfig) {
    if let Ok(mut file) = File::open(&config.lock_path) {
        let mut content = String::new();
        if file.read_to_string(&mut content).is_ok() {
            if let Ok(mut lock_data) = serde_json::from_str::<LockData>(&content) {
                if lock_data.user == whoami::username() {
                    lock_data.updated_at = Local::now().to_rfc3339();
                    let _ = fs::write(
                        &config.lock_path,
                        serde_json::to_string_pretty(&lock_data).unwrap_or_default(),
                    );
                }
            }
        }
    }
}

pub fn release_lock(config: &AppConfig) {
    if let Ok(mut file) = File::open(&config.lock_path) {
        let mut content = String::new();
        if file.read_to_string(&mut content).is_ok() {
            if let Ok(lock_data) = serde_json::from_str::<LockData>(&content) {
                if lock_data.user == whoami::username() {
                    let _ = fs::remove_file(&config.lock_path);
                }
            }
        }
    }
}

/// Get current lock info for the frontend
#[tauri::command]
pub fn get_lock_info(state: tauri::State<'_, crate::AppState>) -> Result<LockInfo, String> {
    let status = state.lock_status.lock().map_err(|e| e.to_string())?;
    Ok(LockInfo::from_status(&status, &state.config))
}

/// Heartbeat: update the lock timestamp (called periodically from frontend)
#[tauri::command]
pub fn update_heartbeat(state: tauri::State<'_, crate::AppState>) -> Result<(), String> {
    let status = state.lock_status.lock().map_err(|e| e.to_string())?;
    if matches!(*status, LockStatus::Edit) {
        update_lock_timestamp(&state.config);
    }
    Ok(())
}

/// Internal force acquire
pub fn force_acquire_lock_internal(config: &AppConfig) -> Result<(), String> {
    let _ = fs::remove_file(&config.lock_path);
    write_lock(config);
    Ok(())
}

/// Force acquire for Zombie scenario
#[tauri::command]
pub fn force_acquire_lock(state: tauri::State<'_, crate::AppState>) -> Result<(), String> {
    force_acquire_lock_internal(&state.config)?;
    let mut status = state.lock_status.lock().map_err(|e| e.to_string())?;
    *status = LockStatus::Edit;
    Ok(())
}

fn is_zombie_lock(data: &LockData) -> bool {
    let timestamp_str = if !data.updated_at.is_empty() {
        &data.updated_at
    } else {
        &data.locked_at
    };
    if let Ok(last_active) = DateTime::parse_from_rfc3339(timestamp_str) {
        let now = Local::now();
        return now.signed_duration_since(last_active) > Duration::hours(1);
    }
    true
}
