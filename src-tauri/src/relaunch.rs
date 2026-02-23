use std::env;
use std::fs;
use std::io::{Read, Write};
use std::process::Command;
use crate::config::AppConfig;

fn parse_version(s: &str) -> Vec<u64> {
    s.split('.')
        .map(|p| p.parse::<u64>().unwrap_or(0))
        .collect()
}

fn version_ge(a: &str, b: &str) -> bool {
    let va = parse_version(a);
    let vb = parse_version(b);
    let n = va.len().max(vb.len());
    for i in 0..n {
        let ai = *va.get(i).unwrap_or(&0);
        let bi = *vb.get(i).unwrap_or(&0);
        if ai > bi {
            return true;
        } else if ai < bi {
            return false;
        }
    }
    true
}

pub fn ensure_local_execution(config: &AppConfig) -> bool {
    // 開発環境や既にローカル実行中の場合はスキップ
    if config.is_local_relaunch || cfg!(debug_assertions) {
        return false;
    }

    let current_exe = env::current_exe().unwrap();
    let exe_name = current_exe.file_name().unwrap();
    let local_exe = config.local_dir.join(exe_name);

    let _ = fs::create_dir_all(&config.local_dir);

    // Decide whether to copy based on embedded package version if available;
    // fallback to existing size/mtime heuristic.
    let mut need_copy = true;

    // Current binary's compile-time package version. Prefer ISSUER_VERSION set by build.rs/CI.
    let current_version = option_env!("ISSUER_VERSION")
        .or(option_env!("CARGO_PKG_VERSION"))
        .unwrap_or("0.0.0");
    let local_version_file = config.local_dir.join("issuer_version.txt");

    if local_exe.exists() {
        // 1) If local has a version file, compare semantic version.
        if let Ok(mut f) = fs::File::open(&local_version_file) {
            let mut buf = String::new();
            if f.read_to_string(&mut buf).is_ok() {
                let local_ver = buf.trim();
                if !local_ver.is_empty() && version_ge(local_ver, current_version) {
                    // local is same or newer; no copy needed
                    need_copy = false;
                }
            }
        }

        // 2) Fallback: existing size & mtime heuristic (previous behavior)
        if need_copy {
            if let (Ok(src_meta), Ok(dst_meta)) = (fs::metadata(&current_exe), fs::metadata(&local_exe)) {
                if src_meta.len() == dst_meta.len() && src_meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH) <= dst_meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH) {
                    need_copy = false;
                }
            }
        }
    }

    if need_copy {
        if let Ok(_) = fs::create_dir_all(&config.local_dir) {
            if let Ok(_) = fs::copy(&current_exe, &local_exe) {
                // After successful copy, write version marker so subsequent runs can compare
                let _ = fs::File::create(&local_version_file).and_then(|mut f| f.write_all(current_version.as_bytes()));
            }
        }
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
        .env("ISSUER_VERSION", current_version)
        .spawn();
        
    if status.is_err() {
        return false;
    }

    true // リランチ対象だったため、呼び出し元でプロセスを終了させる
}
