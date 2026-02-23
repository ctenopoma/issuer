use std::process::Command;

fn main() {
    // Prefer VERSION env (set by CI). Fallback to git tag, then Cargo package version.
    let ver = std::env::var("VERSION").ok().or_else(|| {
        Command::new("git")
            .args(["describe", "--tags", "--abbrev=0"]) 
            .output()
            .ok()
            .and_then(|o| if o.status.success() { Some(String::from_utf8_lossy(&o.stdout).trim().to_string()) } else { None })
    }).unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string());

    println!("cargo:rustc-env=ISSUER_VERSION={}", ver);
    println!("cargo:rerun-if-env-changed=VERSION");
}
fn main() {
    tauri_build::build()
}
