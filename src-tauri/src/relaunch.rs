use std::env;
use std::fs;
use std::process::Command;
use crate::config::AppConfig;

pub fn ensure_local_execution(config: &AppConfig) -> bool {
    // 開発環境や既にローカル実行中の場合はスキップ
    if config.is_local_relaunch || cfg!(debug_assertions) {
        return false;
    }

    let current_exe = env::current_exe().unwrap();
    let exe_name = current_exe.file_name().unwrap();
    let local_exe = config.local_dir.join(exe_name);

    let _ = fs::create_dir_all(&config.local_dir);

    let mut need_copy = true;
    if local_exe.exists() {
        if let (Ok(src_meta), Ok(dst_meta)) = (fs::metadata(&current_exe), fs::metadata(&local_exe)) {
            if src_meta.len() == dst_meta.len() && src_meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH) <= dst_meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH) {
                need_copy = false;
            }
        }
    }

    if need_copy {
        let _ = fs::copy(&current_exe, &local_exe);
    }

    // DB関連ファイルのコピー
    let db_files = ["data.db", "data.db-wal", "data.db-shm"];
    for file in db_files {
        let src = config.original_dir.join(file);
        let dst = config.local_dir.join(file);
        if src.exists() {
            let _ = fs::copy(&src, &dst);
        }
    }

    // 環境変数を設定してリランチ
    let status = Command::new(&local_exe)
        .env("ISSUER_LOCAL_RELAUNCH", "1")
        .env("ISSUER_ORIGINAL_DIR", &config.original_dir)
        .spawn();
        
    if status.is_err() {
        return false;
    }

    true // リランチ対象だったため、呼び出し元でプロセスを終了させる
}
