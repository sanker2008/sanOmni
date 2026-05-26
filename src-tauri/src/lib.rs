pub mod commands;
pub mod database;
pub mod models;

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
            commands::images::get_all_images,
            commands::vendors::get_vendors,
            commands::vendors::add_vendor,
            commands::vendors::update_vendor,
            commands::vendors::delete_vendor,
            commands::vendors::add_model,
            commands::vendors::update_model,
            commands::vendors::delete_model,
            commands::vendors::check_model_usage,
            commands::vendors::delete_model_cascade,
            commands::tags::get_tags,
            commands::tags::add_tag,
            commands::watermark::detect_watermark,
            commands::watermark::batch_detect_watermarks,
            commands::watermark_removal::remove_watermark,
            commands::watermark_removal::batch_remove_watermarks,
            commands::gemini_watermark_removal::remove_gemini_watermark,
            commands::gemini_watermark_removal::batch_remove_gemini_watermarks,
            commands::gemini_watermark_removal::auto_remove_gemini_watermark,
            commands::watcher::start_folder_watcher,
            commands::watcher::stop_folder_watcher,
            commands::watcher::get_active_watchers,
            commands::classifier::classify_image,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::reset_database,
            commands::scanner::scan_archived_directory,
            commands::scanner::cleanup_inbox_directory,
            commands::prompt_groups::create_prompt_group,
            commands::prompt_groups::get_prompt_groups,
            commands::prompt_groups::get_prompt_group_with_images,
            commands::prompt_groups::get_prompt_groups_for_image,
            commands::prompt_groups::add_images_to_prompt_group,
            commands::prompt_groups::remove_images_from_prompt_group,
            commands::prompt_groups::set_prompt_groups_for_image,
            commands::prompt_groups::update_prompt_group,
            commands::prompt_groups::delete_prompt_group,
            commands::prompt_groups::auto_group_by_prompt,
            commands::ip_assets::get_ip_assets,
            commands::ip_assets::get_ip_asset_detail,
            commands::ip_assets::create_ip_asset,
            commands::ip_assets::update_ip_asset,
            commands::ip_assets::delete_ip_asset,
            commands::ip_assets::add_ip_character_sheets,
            commands::ip_assets::remove_ip_character_sheets,
            commands::ip_assets::add_ip_creations,
            commands::ip_assets::remove_ip_creations,
            commands::ip_assets::add_ip_relation,
            commands::ip_assets::remove_ip_relation,
            commands::ip_assets::create_ip_sticker_pack,
            commands::ip_assets::update_ip_sticker_pack,
            commands::ip_assets::delete_ip_sticker_pack,
            commands::ip_assets::add_ip_sticker_pack_platform,
            commands::ip_assets::update_ip_sticker_pack_platform,
            commands::ip_assets::delete_ip_sticker_pack_platform,
            commands::ip_assets::add_ip_emojis,
            commands::ip_assets::update_ip_emoji_trigger_word,
            commands::ip_assets::delete_ip_emojis,
            commands::ip_assets::move_ip_emojis_to_pack,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
