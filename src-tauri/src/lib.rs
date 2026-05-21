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
        .manage(commands::watcher::WatcherState::new())
        .setup(|app| {
            // Use Tauri's app data directory
            let app_data_dir = app.path().app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            
            let data_dir = app_data_dir.join("data");
            std::fs::create_dir_all(&data_dir)
                .map_err(|e| format!("Failed to create data dir: {}", e))?;
            
            let db_path = data_dir.join("database.sqlite");
            database::init_database(&db_path)
                .map_err(|e| format!("Failed to init database: {}", e))?;
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::images::import_image,
            commands::images::get_inbox_images,
            commands::images::get_archived_images,
            commands::images::update_image,
            commands::images::delete_image,
            commands::images::archive_images,
            commands::images::unarchive_images,
            commands::images::update_missing_formats,
            commands::vendors::get_vendors,
            commands::vendors::add_vendor,
            commands::vendors::update_vendor,
            commands::vendors::delete_vendor,
            commands::vendors::add_model,
            commands::vendors::update_model,
            commands::vendors::delete_model,
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
            commands::settings::reset_database,
            commands::scanner::scan_archived_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
