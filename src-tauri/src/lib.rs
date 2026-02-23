pub mod commands;
mod config;
pub mod db;
pub mod lock;
mod relaunch;
pub mod debug_log;

use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub config: config::AppConfig,
    pub lock_status: Mutex<lock::LockStatus>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_config = config::AppConfig::new();

    debug_log::log(&format!("App starting. db_path={:?}, is_local_relaunch={}", app_config.db_path, app_config.is_local_relaunch));

    // 1. Local relaunch check
    if relaunch::ensure_local_execution(&app_config) {
        std::process::exit(0);
    }

    // 2. Lock check
    let lock_status = lock::check_lock_on_startup(&app_config);
    debug_log::log(&format!("Lock status: {:?}", lock_status));

    // 3. Database connection
    let db_conn =
        db::establish_connection(&app_config.db_path).expect("Failed to connect to database");
    debug_log::log("Database connection established");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            app.manage(AppState {
                db: Mutex::new(db_conn),
                config: app_config,
                lock_status: Mutex::new(lock_status),
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<AppState>();
                lock::release_lock(&state.config);
                db::sync_db_back(&state.config);
            }
        })
        .invoke_handler(tauri::generate_handler![
            lock::force_acquire_lock,
            lock::get_lock_info,
            lock::update_heartbeat,
            commands::issues::get_issues,
            commands::issues::get_issue,
            commands::issues::create_issue,
            commands::issues::update_issue,
            commands::issues::delete_issue,
            commands::comments::get_comments,
            commands::comments::create_comment,
            commands::comments::update_comment,
            commands::comments::delete_comment,
            commands::attachments::paste_image,
            commands::attachments::get_assets_dir,
            commands::outlook::create_outlook_draft,
            commands::milestones::get_milestones,
            commands::milestones::create_milestone,
            commands::milestones::update_milestone,
            commands::milestones::delete_milestone,
            commands::milestones::get_milestone_progress,
            commands::reactions::get_issue_reactions,
            commands::reactions::toggle_issue_reaction,
            commands::reactions::get_comment_reactions,
            commands::reactions::toggle_comment_reaction,
            commands::labels::list_all_labels,
            commands::labels::get_issue_labels,
            commands::labels::get_labels_map,
            commands::labels::set_issue_labels,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
