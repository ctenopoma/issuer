pub mod commands;
mod config;
pub mod db;
pub mod debug_log;
pub mod lock;
mod relaunch;
pub mod settings;
pub mod sync;

use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: std::sync::Arc<Mutex<rusqlite::Connection>>,
    pub config: config::AppConfig,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_config = config::AppConfig::new();

    debug_log::log(&format!(
        "App starting. db_path={:?}, is_local_relaunch={}",
        app_config.db_path, app_config.is_local_relaunch
    ));

    // 1. Local relaunch check
    if relaunch::ensure_local_execution(&app_config) {
        std::process::exit(0);
    }

    // Clean up legacy app.lock if it exists
    let _ = std::fs::remove_file(app_config.original_dir.join("app.lock"));

    // 2. Database connection
    let db_conn =
        db::establish_connection(&app_config.db_path).expect("Failed to connect to database");
    debug_log::log("Database connection established");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let app_handle = app.handle();
            let db_mutex = std::sync::Arc::new(Mutex::new(db_conn));

            crate::sync::start_background_sync(
                app_config.clone(),
                db_mutex.clone(),
                app_handle.clone(),
            );

            app.manage(AppState {
                db: db_mutex,
                config: app_config,
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<AppState>();
                let _ = crate::sync::merge_sync_temp_to_master(&state.config);

                // Clean up local DB if this is a local copy created from a different original location
                // Avoid deleting DB when original_dir and local_dir are the same (e.g. installed in LocalAppData)
                if state.config.is_local_relaunch && state.config.original_dir != state.config.local_dir {
                    // Only remove local files if we actually created a local copy (marker exists)
                    let marker_path = state.config.local_dir.join("local_copy.marker");
                    if !marker_path.exists() {
                        return;
                    }
                    // Force close the DB by replacing it with an in-memory dummy connection
                    if let Ok(mut guard) = state.db.lock() {
                        if let Ok(dummy) = rusqlite::Connection::open_in_memory() {
                            let _ = std::mem::replace(&mut *guard, dummy);
                        }
                    }

                    // Remove the local DB files
                    for file in ["data.db", "data.db-wal", "data.db-shm"] {
                        let _ = std::fs::remove_file(state.config.local_dir.join(file));
                    }
                    // Remove version marker
                    let _ = std::fs::remove_file(state.config.local_dir.join("issuer_version.txt"));
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
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
            settings::get_os_username,
            settings::get_user_display_name,
            settings::set_user_display_name,
            commands::themes::get_installed_themes,
            commands::themes::get_active_theme,
            commands::themes::set_active_theme,
            commands::themes::read_theme_file,
            commands::themes::get_theme_asset_path,
            commands::themes::delete_theme,
            commands::themes::list_remote_themes,
            commands::themes::download_theme,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
