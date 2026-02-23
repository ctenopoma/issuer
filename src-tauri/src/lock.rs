use crate::config::AppConfig;
use std::fs;
use std::path::PathBuf;

/// Merge-phase-only lock.
/// Used only during merge_sync_temp_to_master to prevent concurrent merges.
/// NOT for editing exclusion — all users can always edit.

fn merge_lock_path(config: &AppConfig) -> PathBuf {
    config.original_dir.join("merge.lock")
}

pub fn acquire_merge_lock(config: &AppConfig) -> Result<(), String> {
    let lock_path = merge_lock_path(config);
    let max_retries = 10;
    let retry_delay = std::time::Duration::from_millis(500);

    for attempt in 0..max_retries {
        if lock_path.exists() {
            // 60秒以上古いロックは失効とみなして削除
            if let Ok(metadata) = fs::metadata(&lock_path) {
                if let Ok(modified) = metadata.modified() {
                    if modified.elapsed().unwrap_or_default() > std::time::Duration::from_secs(60)
                    {
                        crate::debug_log::log("Removing stale merge lock");
                        let _ = fs::remove_file(&lock_path);
                    }
                }
            }
        }

        if !lock_path.exists() {
            let pc_name =
                std::env::var("COMPUTERNAME").unwrap_or_else(|_| "UnknownPC".to_string());
            if fs::write(&lock_path, &pc_name).is_ok() {
                return Ok(());
            }
        }

        if attempt < max_retries - 1 {
            std::thread::sleep(retry_delay);
        }
    }

    Err("マージロックの取得に失敗しました".to_string())
}

pub fn release_merge_lock(config: &AppConfig) {
    let _ = fs::remove_file(merge_lock_path(config));
}
