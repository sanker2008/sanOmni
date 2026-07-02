pub mod commands;
pub mod database;
pub mod models;
pub mod sync;

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

const CLOSE_TO_TRAY_SETTING_KEY: &str = "closeToTray";
const TRAY_SHOW_MENU_ID: &str = "tray_show";
const TRAY_QUIT_MENU_ID: &str = "tray_quit";

fn should_close_to_tray(db_path: &std::path::Path) -> bool {
    let Ok(conn) = rusqlite::Connection::open(db_path) else {
        return false;
    };

    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        rusqlite::params![CLOSE_TO_TRAY_SETTING_KEY],
        |row| row.get::<_, String>(0),
    )
    .map(|value| value == "true" || value == "1")
    .unwrap_or(true)
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let is_quitting = Arc::new(AtomicBool::new(false));
    let close_event_is_quitting = Arc::clone(&is_quitting);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(commands::fs::FsAccessState::default())
        .setup(|app| {
            // Use Tauri's app data directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;

            let data_dir = app_data_dir.join("data");
            std::fs::create_dir_all(&data_dir)
                .map_err(|e| format!("Failed to create data dir: {}", e))?;

            let db_path = data_dir.join("database.sqlite");
            database::init_database(&db_path)
                .map_err(|e| format!("Failed to init database: {}", e))?;

            let show_item =
                MenuItem::with_id(app, TRAY_SHOW_MENU_ID, "显示 sanOmni", true, None::<&str>)?;
            let quit_item =
                MenuItem::with_id(app, TRAY_QUIT_MENU_ID, "退出 sanOmni", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            let mut tray_builder = TrayIconBuilder::new()
                .menu(&tray_menu)
                .tooltip("sanOmni")
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    }
                    | TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } => show_main_window(tray.app_handle()),
                    _ => {}
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            tray_builder.build(app)?;

            Ok(())
        })
        .on_menu_event(move |app, event| match event.id().as_ref() {
            TRAY_SHOW_MENU_ID => show_main_window(app),
            TRAY_QUIT_MENU_ID => {
                is_quitting.store(true, Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
        })
        .on_window_event(move |window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if close_event_is_quitting.load(Ordering::SeqCst) {
                    return;
                }

                let Ok(app_data_dir) = window.app_handle().path().app_data_dir() else {
                    return;
                };
                let db_path = app_data_dir.join("data").join("database.sqlite");
                if should_close_to_tray(&db_path) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
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
            commands::ip_images::import_ip_image,
            commands::ip_images::get_ip_inbox_images,
            commands::ip_images::get_ip_archived_images,
            commands::ip_images::update_ip_image,
            commands::ip_images::update_ip_image_file,
            commands::ip_images::delete_ip_image,
            commands::ip_images::archive_ip_images,
            commands::vendors::get_vendors,
            commands::vendors::add_vendor,
            commands::vendors::update_vendor,
            commands::vendors::delete_vendor,
            commands::vendors::add_model,
            commands::vendors::update_model,
            commands::vendors::delete_model,
            commands::vendors::check_model_usage,
            commands::vendors::check_vendor_usage,
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
            commands::gemini_watermark_removal::advanced_remove_gemini_watermark,
            commands::classifier::classify_image,
            commands::settings::get_settings,
            commands::settings::get_sanprompt_publish_secret,
            commands::settings::save_settings,
            commands::settings::set_sanprompt_publish_secret,
            commands::settings::reset_database,
            commands::settings::reset_general_settings,
            commands::settings::reset_prompt_data,
            commands::settings::reset_ip_data,
            commands::scanner::scan_archived_directory,
            commands::scanner::scan_inbox_directory,
            commands::scanner::scan_ip_inbox_directory,
            commands::scanner::scan_ip_archived_directory,
            commands::scanner::execute_inbox_cleanup,
            commands::scanner::execute_ip_inbox_cleanup,
            commands::prompt_groups::create_prompt_group,
            commands::prompt_groups::get_prompt_groups,
            commands::prompt_groups::get_prompt_group_with_images,
            commands::prompt_groups::get_prompt_groups_for_image,
            commands::prompt_groups::add_images_to_prompt_group,
            commands::prompt_groups::remove_images_from_prompt_group,
            commands::prompt_groups::set_prompt_groups_for_image,
            commands::prompt_groups::update_prompt_group_image_meta,
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
            commands::ip_assets::remove_ip_emojis_keep_image,
            commands::ip_assets::move_ip_emojis_to_pack,
            commands::works::create_work,
            commands::works::get_works,
            commands::works::get_work_by_id,
            commands::works::update_work,
            commands::works::delete_work,
            commands::works::upload_work_cover,
            commands::works::delete_work_cover,
            commands::works::add_work_tag,
            commands::works::remove_work_tag,
            commands::characters::create_character,
            commands::characters::get_characters,
            commands::characters::get_all_characters,
            commands::characters::get_character_by_id,
            commands::characters::update_character,
            commands::characters::delete_character,
            commands::characters::update_character_order,
            commands::characters::upload_character_images,
            commands::characters::get_ip_characters,
            commands::fs::migrate_directory,
            commands::fs::update_database_paths,
            commands::fs::check_directory_status,
            commands::fs::repair_database_paths,
            commands::fs::show_in_folder,
            commands::fs::open_path,
            commands::fs::authorize_fs_paths,
            commands::fs::secure_fs_exists,
            commands::fs::secure_fs_mkdir,
            commands::fs::secure_fs_read_file,
            commands::fs::secure_fs_write_file,
            commands::fs::secure_fs_copy_file,
            commands::fs::secure_fs_rename,
            commands::fs::secure_fs_remove,
            commands::fs::secure_fs_read_dir,
            commands::fs::secure_fs_stat,
            // Sync Commands
            commands::sync_commands::sync_test_connection,
            commands::sync_commands::sync_enable,
            commands::sync_commands::sync_disable,
            commands::sync_commands::sync_configure,
            commands::sync_commands::sync_now,
            commands::sync_commands::sync_get_status,
            commands::sync_commands::sync_get_history,
            commands::sync_commands::sync_get_snapshot,
            commands::sync_commands::sync_reconcile_snapshot,
            commands::sync_commands::sync_force_repush,
            commands::engine::download_and_extract_engine,
            commands::engine::ensure_pose_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
