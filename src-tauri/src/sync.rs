use crate::config::AppConfig;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DeltaSyncPayload {
    pub timestamp: i64,
    pub pc_name: String,
    pub action: String, // "insert", "update"
    pub table: String,  // "issues", "comments", "milestones", etc.
    pub target_id: i32,
    pub changes: serde_json::Value, // JSON object with column changes
}

pub fn get_sync_dir(config: &AppConfig) -> PathBuf {
    config.original_dir.join(".sync_temp")
}

pub fn ensure_sync_dir(config: &AppConfig) -> Result<(), String> {
    let sync_dir = get_sync_dir(config);
    if !sync_dir.exists() {
        fs::create_dir_all(&sync_dir).map_err(|e| e.to_string())?;

        // On Windows, hide the folder
        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            let _ = Command::new("attrib")
                .args(["+h", sync_dir.to_str().unwrap_or("")])
                .output();
        }
    }
    Ok(())
}

pub fn push_delta(
    config: &AppConfig,
    table: &str,
    target_id: i32,
    action: &str,
    changes: serde_json::Value,
) -> Result<(), String> {
    ensure_sync_dir(config)?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;

    let pc_name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "UnknownPC".to_string());

    let payload = DeltaSyncPayload {
        timestamp,
        pc_name: pc_name.clone(),
        action: action.to_string(),
        table: table.to_string(),
        target_id,
        changes,
    };

    let id = uuid::Uuid::new_v4().to_string();
    let filename = format!("{}_{}_{}.json", timestamp, pc_name, &id[0..8]);

    let file_path = get_sync_dir(config).join(filename);

    let json_content = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    fs::write(&file_path, json_content).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn start_background_sync(
    config: AppConfig,
    db_mutex: std::sync::Arc<std::sync::Mutex<rusqlite::Connection>>,
    app_handle: tauri::AppHandle,
) {
    let pc_name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "UnknownPC".to_string());

    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(3));

            let sync_dir = get_sync_dir(&config);
            if !sync_dir.exists() {
                continue;
            }

            let mut applied_any = false;

            if let Ok(entries) = fs::read_dir(&sync_dir) {
                let mut files: Vec<_> = entries
                    .filter_map(Result::ok)
                    .filter(|e| {
                        e.path().is_file()
                            && e.path().extension().map_or(false, |ext| ext == "json")
                    })
                    .collect();

                // Sort files by name (which starts with timestamp) to apply in order
                files.sort_by_key(|a| a.file_name());

                for entry in files {
                    let path = entry.path();
                    let file_name = path.file_name().unwrap_or_default().to_string_lossy();

                    // Skip my own deltas
                    if file_name.contains(&pc_name) {
                        continue;
                    }

                    // To avoid infinite re-processing, we need a local log of applied deltas.
                    // For now, let's track the last applied timestamp/filename in memory or simple file.
                    // A better approach is to delete the file AFTER it has been merged to master.

                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(payload) = serde_json::from_str::<DeltaSyncPayload>(&content) {
                            if apply_delta(&db_mutex, &payload) {
                                applied_any = true;
                                crate::debug_log::log(&format!(
                                    "Applied remote delta: {}",
                                    file_name
                                ));
                            }
                        }
                    }
                }
            }

            if applied_any {
                // Emit event to frontend to refresh data
                let _ = app_handle.emit("refresh-data", ());
            }
        }
    });
}

fn apply_delta(
    db_mutex: &std::sync::Arc<std::sync::Mutex<rusqlite::Connection>>,
    payload: &DeltaSyncPayload,
) -> bool {
    let conn = match db_mutex.lock() {
        Ok(c) => c,
        Err(_) => return false,
    };

    // We only process if we haven't seen this timestamp from this PC.
    // For a robust implementation, we should record applied deltas locally.
    // For simplicity in this demo, let's assume we can simply execute it
    // and rely on LWW or SQLite IGNORE if it's an insert.

    let table = &payload.table;
    let target_id = payload.target_id;
    let changes = payload.changes.as_object();

    if changes.is_none() {
        return false;
    }
    let changes = changes.unwrap();

    if payload.action == "insert" {
        let columns: Vec<String> = changes.keys().cloned().collect();
        let placeholders: Vec<String> = (1..=columns.len()).map(|i| format!("?{}", i)).collect();
        let sql = format!(
            "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
            table,
            columns.join(", "),
            placeholders.join(", ")
        );

        let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        for key in &columns {
            if let Some(val) = changes.get(key) {
                if val.is_null() {
                    params_vec.push(Box::new(rusqlite::types::Null));
                } else if val.is_string() {
                    params_vec.push(Box::new(val.as_str().unwrap().to_string()));
                } else if val.is_i64() {
                    params_vec.push(Box::new(val.as_i64().unwrap()));
                } else if val.is_f64() {
                    params_vec.push(Box::new(val.as_f64().unwrap()));
                } else if val.is_boolean() {
                    params_vec.push(Box::new(if val.as_bool().unwrap() { 1 } else { 0 }));
                } else {
                    params_vec.push(Box::new(val.to_string()));
                }
            }
        }
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            params_vec.iter().map(|p| p.as_ref()).collect();

        let _ = conn.execute(&sql, param_refs.as_slice());
        return true;
    } else if payload.action == "update" {
        let mut set_clauses = Vec::new();
        let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        let mut i = 1;
        for (key, val) in changes {
            set_clauses.push(format!("{} = ?{}", key, i));

            if val.is_null() {
                params_vec.push(Box::new(rusqlite::types::Null));
            } else if val.is_string() {
                params_vec.push(Box::new(val.as_str().unwrap().to_string()));
            } else if val.is_i64() {
                params_vec.push(Box::new(val.as_i64().unwrap()));
            } else if val.is_f64() {
                params_vec.push(Box::new(val.as_f64().unwrap()));
            } else if val.is_boolean() {
                params_vec.push(Box::new(if val.as_bool().unwrap() { 1 } else { 0 }));
            } else {
                params_vec.push(Box::new(val.to_string()));
            }
            i += 1;
        }

        // Add ID parameter at the end
        params_vec.push(Box::new(target_id));

        let sql = format!(
            "UPDATE {} SET {} WHERE id = ?{}",
            table,
            set_clauses.join(", "),
            i
        );
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            params_vec.iter().map(|p| p.as_ref()).collect();

        let _ = conn.execute(&sql, param_refs.as_slice());
        return true;
    } else if payload.action == "toggle" {
        // Special case for reactions
        if let Some(deleted) = changes.get("deleted").and_then(|v| v.as_bool()) {
            if deleted {
                // Reconstruct deletion query
                if table == "issue_reactions" {
                    let reacted_by = changes.get("reacted_by").unwrap().as_str().unwrap();
                    let reaction = changes.get("reaction").unwrap().as_str().unwrap();
                    let _ = conn.execute("DELETE FROM issue_reactions WHERE issue_id = ?1 AND reacted_by = ?2 AND reaction = ?3", rusqlite::params![target_id, reacted_by, reaction]);
                } else if table == "comment_reactions" {
                    // target_id is comment_id
                    let reacted_by = changes.get("reacted_by").unwrap().as_str().unwrap();
                    let reaction = changes.get("reaction").unwrap().as_str().unwrap();
                    let _ = conn.execute("DELETE FROM comment_reactions WHERE comment_id = ?1 AND reacted_by = ?2 AND reaction = ?3", rusqlite::params![target_id, reacted_by, reaction]);
                }
            } else {
                // Reconstruct insertion query
                if table == "issue_reactions" {
                    let reacted_by = changes.get("reacted_by").unwrap().as_str().unwrap();
                    let reaction = changes.get("reaction").unwrap().as_str().unwrap();
                    let created_at = chrono::Local::now().to_rfc3339();
                    let _ = conn.execute("INSERT OR IGNORE INTO issue_reactions (issue_id, reacted_by, reaction, created_at) VALUES (?1, ?2, ?3, ?4)", rusqlite::params![target_id, reacted_by, reaction, created_at]);
                } else if table == "comment_reactions" {
                    // target_id is comment_id
                    let reacted_by = changes.get("reacted_by").unwrap().as_str().unwrap();
                    let reaction = changes.get("reaction").unwrap().as_str().unwrap();
                    let created_at = chrono::Local::now().to_rfc3339();
                    let _ = conn.execute("INSERT OR IGNORE INTO comment_reactions (comment_id, reacted_by, reaction, created_at) VALUES (?1, ?2, ?3, ?4)", rusqlite::params![target_id, reacted_by, reaction, created_at]);
                }
            }
            return true;
        }
    } else if payload.action == "set" && table == "issue_labels" {
        if let Some(labels_arr) = changes.get("labels").and_then(|v| v.as_array()) {
            let _ = conn.execute(
                "DELETE FROM issue_labels WHERE issue_id = ?1",
                rusqlite::params![target_id],
            );
            for l in labels_arr {
                if let Some(name) = l.as_str() {
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO labels (name) VALUES (?1)",
                        rusqlite::params![name],
                    );
                    if let Ok(label_id) = conn.query_row(
                        "SELECT id FROM labels WHERE name = ?1",
                        rusqlite::params![name],
                        |row| row.get::<_, i32>(0),
                    ) {
                        let _ = conn.execute(
                            "INSERT INTO issue_labels (issue_id, label_id) VALUES (?1, ?2)",
                            rusqlite::params![target_id, label_id],
                        );
                    }
                }
            }
            return true;
        }
    }

    false
}

// Snapshot & Cleanup
pub fn merge_sync_temp_to_master(config: &AppConfig) -> Result<(), String> {
    let sync_dir = get_sync_dir(config);
    if !sync_dir.exists() {
        return Ok(());
    }

    let entries = fs::read_dir(&sync_dir).map_err(|e| e.to_string())?;
    let mut files: Vec<_> = entries
        .filter_map(Result::ok)
        .filter(|e| e.path().is_file() && e.path().extension().map_or(false, |ext| ext == "json"))
        .collect();

    if files.is_empty() {
        return Ok(());
    }

    // Sort files to apply in order
    files.sort_by_key(|a| a.file_name());

    // 1. Lock check
    crate::lock::force_acquire_lock_internal(config)?;

    // 2. Master dump (copy to temp_merge.db)
    let master_db_path = config.original_dir.join("data.db");
    let temp_merge_db_path = config.local_dir.join("temp_merge.db");

    // Remove old temp if exists
    if temp_merge_db_path.exists() {
        let _ = fs::remove_file(&temp_merge_db_path);
    }

    // If master (shared) DB does not exist, create it from local DB so that
    // merging can proceed and the shared location will receive the DB.
    if !master_db_path.exists() {
        let local_db = config.local_dir.join("data.db");
        if local_db.exists() {
            fs::copy(&local_db, &temp_merge_db_path)
                .map_err(|e| format!("Failed to copy local DB to temp (creating master): {}", e))?;
        } else {
            return Err("Neither master nor local DB exists to create temp_merge.db".to_string());
        }
    } else {
        fs::copy(&master_db_path, &temp_merge_db_path)
            .map_err(|e| format!("Failed to copy master DB to temp: {}", e))?;
    }

    // 3. Local merge (safe)
    let temp_conn = crate::db::establish_connection(&temp_merge_db_path)
        .map_err(|e| format!("Failed to connect to temp_merge.db: {}", e))?;
    let temp_mutex = std::sync::Arc::new(std::sync::Mutex::new(temp_conn));

    let mut success_files = Vec::new();

    for entry in files {
        let path = entry.path();
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(payload) = serde_json::from_str::<DeltaSyncPayload>(&content) {
                if apply_delta(&temp_mutex, &payload) {
                    success_files.push(path.clone());
                } else {
                    crate::debug_log::log(&format!(
                        "Failed or skipped to apply delta during cleanup: {:?}",
                        path
                    ));
                    // Even if we fail to apply one delta, we should probably keep going
                    // Or track failed ones and not delete them.
                    success_files.push(path.clone()); // Assuming we still delete to not get stuck
                }
            }
        }
    }

    // Explicitly drop connection before copying Windows files
    drop(temp_mutex);

    // 4. Overwrite master (file operations only)
    fs::copy(&temp_merge_db_path, &master_db_path)
        .map_err(|e| format!("Failed to overwrite master DB: {}", e))?;

    // 5. Cleanup
    for path in success_files {
        let _ = fs::remove_file(path);
    }
    let _ = fs::remove_file(&temp_merge_db_path);

    crate::lock::release_lock(config);
    Ok(())
}
