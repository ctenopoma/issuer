#[cfg(debug_assertions)]
use std::fs::OpenOptions;
#[cfg(debug_assertions)]
use std::io::Write;

/// Write a debug log line to issuer_debug.log in the exe's directory.
#[cfg(debug_assertions)]
pub fn log(msg: &str) {
    let log_path = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("issuer_debug.log")))
        .unwrap_or_else(|| std::path::PathBuf::from("issuer_debug.log"));

    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&log_path) {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let _ = writeln!(f, "[{}] {}", now, msg);
    }
}

/// Release ビルドでは何もしないスタブを用意して呼び出し側の変更不要にする。
#[cfg(not(debug_assertions))]
pub fn log(_msg: &str) {}
