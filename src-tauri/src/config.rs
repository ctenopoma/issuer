use std::env;
use std::path::PathBuf;
use directories::BaseDirs;

#[derive(Clone)]
pub struct AppConfig {
    pub original_dir: PathBuf,
    pub local_dir: PathBuf,
    pub db_path: PathBuf,
    pub is_local_relaunch: bool,
}

impl AppConfig {
    pub fn new() -> Self {
        let current_exe = env::current_exe().unwrap();
        let exe_dir = current_exe.parent().unwrap().to_path_buf();
        
        let original_dir = env::var("ISSUER_ORIGINAL_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| exe_dir.clone());
            
        let base_dirs = BaseDirs::new().unwrap();
        let local_dir = base_dirs.data_local_dir().join("Issuer");
        
        let is_local_relaunch = env::var("ISSUER_LOCAL_RELAUNCH").is_ok();
        
        let db_path = if is_local_relaunch {
            local_dir.join("data.db")
        } else {
            original_dir.join("data.db")
        };
        
        Self {
            original_dir,
            local_dir,
            db_path,
            is_local_relaunch,
        }
    }
}
