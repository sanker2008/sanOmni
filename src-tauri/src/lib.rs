mod commands;
mod database;
mod models;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Use user's home directory for data storage
            let home = std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .unwrap_or_else(|_| ".".to_string());
            let data_dir = std::path::PathBuf::from(home)
                .join(".sanmediabox");
            std::fs::create_dir_all(&data_dir)
                .map_err(|e| format!("Failed to create data dir: {}", e))?;
            
            let db_path = data_dir.join("database.sqlite");
            database::init_database(&db_path)
                .map_err(|e| format!("Failed to init database: {}", e))?;
            
            app.manage(DbPath(db_path));
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::images::import_image,
            commands::images::get_inbox_images,
            commands::images::get_archived_images,
            commands::images::update_image,
            commands::images::delete_image,
            commands::images::archive_images,
            commands::vendors::get_vendors,
            commands::vendors::add_vendor,
            commands::vendors::add_model,
            commands::tags::get_tags,
            commands::tags::add_tag,
            commands::watermark::detect_watermark,
            commands::watermark::batch_detect_watermarks,
            commands::watermark_removal::remove_watermark,
            commands::watermark_removal::batch_remove_watermarks,
            commands::watcher::start_folder_watcher,
            commands::watcher::stop_folder_watcher,
            commands::watcher::get_active_watchers,
            commands::classifier::classify_image,
            commands::settings::get_settings,
            commands::settings::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[derive(Clone)]
struct DbPath(std::path::PathBuf);
