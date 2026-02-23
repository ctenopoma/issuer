use std::fs::OpenOptions;
use std::io::Write;

/// Write a debug log line to issuer_debug.log in the exe's directory.
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
