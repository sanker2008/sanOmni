use std::collections::HashMap;
use std::path::PathBuf;
use rusqlite::Connection;
use super::CommandResult;

#[tauri::command]
pub fn get_settings(db_path: String) -> CommandResult<HashMap<String, String>> {
    let conn = match Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let _ = crate::database::init_database(std::path::Path::new(&db_path));

    let mut stmt = match conn.prepare("SELECT key, value FROM settings") {
        Ok(s) => s,
        Err(e) => return CommandResult::err(format!("Failed to prepare query: {}", e)),
    };

    let rows = match stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
        ))
    }) {
        Ok(r) => r,
        Err(e) => return CommandResult::err(format!("Failed to query settings: {}", e)),
    };

    let mut settings: HashMap<String, String> = HashMap::new();
    for row in rows {
        match row {
            Ok((key, value)) => {
                settings.insert(key, value);
            }
            Err(e) => return CommandResult::err(format!("Failed to read setting row: {}", e)),
        }
    }

    CommandResult::ok(settings)
}

#[tauri::command]
pub fn save_settings(
    db_path: String,
    settings: HashMap<String, String>,
) -> CommandResult<bool> {
    let conn = match Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let _ = crate::database::init_database(std::path::Path::new(&db_path));

    let now = chrono::Utc::now().to_rfc3339();

    match conn.execute_batch("BEGIN TRANSACTION") {
        Ok(_) => {},
        Err(e) => return CommandResult::err(format!("Failed to begin transaction: {}", e)),
    }

    for (key, value) in &settings {
        // 使用 UPSERT (INSERT OR REPLACE) 语法
        let sql = "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
                   ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3";

        match conn.execute(sql, rusqlite::params![key, value, now]) {
            Ok(_) => {},
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK");
                return CommandResult::err(format!("Failed to save setting '{}': {}", key, e));
            }
        }
    }

    match conn.execute_batch("COMMIT") {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("Failed to commit transaction: {}", e)),
    }
}

#[tauri::command]
pub fn reset_database(db_path: String) -> CommandResult<bool> {
    let path = PathBuf::from(&db_path);
    
    match crate::database::reset_database(&path) {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("Failed to reset database: {}", e)),
    }
}

#[tauri::command]
pub fn reset_general_settings(db_path: String) -> CommandResult<bool> {
    let conn = match Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let _ = crate::database::init_database(std::path::Path::new(&db_path));

    match conn.execute("DELETE FROM settings", []) {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("重置设置失败: {}", e)),
    }
}

#[tauri::command]
pub fn reset_prompt_data(db_path: String, delete_files: bool) -> CommandResult<bool> {
    let conn = match Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let _ = crate::database::init_database(std::path::Path::new(&db_path));

    if delete_files {
        // 1. 获取自定义目录设置
        let custom_inbox: Option<String> = conn.query_row(
            "SELECT value FROM settings WHERE key = 'customInboxPath'",
            [],
            |row| row.get(0),
        ).ok();

        let custom_archived: Option<String> = conn.query_row(
            "SELECT value FROM settings WHERE key = 'customArchivedPath'",
            [],
            |row| row.get(0),
        ).ok();

        let db_path_buf = std::path::Path::new(&db_path);
        if let Some(app_data_dir) = db_path_buf.parent().and_then(|p| p.parent()) {
            let inbox_dir = if let Some(ref path_str) = custom_inbox {
                if !path_str.trim().is_empty() {
                    std::path::Path::new(path_str).to_path_buf()
                } else {
                    app_data_dir.join("inbox")
                }
            } else {
                app_data_dir.join("inbox")
            };

            let archived_dir = if let Some(ref path_str) = custom_archived {
                if !path_str.trim().is_empty() {
                    std::path::Path::new(path_str).to_path_buf()
                } else {
                    app_data_dir.join("archived")
                }
            } else {
                app_data_dir.join("archived")
            };

            // 彻底删除这两个文件夹
            if inbox_dir.exists() {
                let _ = std::fs::remove_dir_all(inbox_dir);
            }
            if archived_dir.exists() {
                let _ = std::fs::remove_dir_all(archived_dir);
            }
        }
    }

    // 2. 清理数据库记录
    let queries = [
        "DELETE FROM image_model_relations",
        "DELETE FROM image_tag_relations",
        "DELETE FROM processing_history",
        "DELETE FROM image_prompt_group_relations",
        "DELETE FROM prompt_groups",
        "DELETE FROM images",
    ];

    for query in &queries {
        if let Err(e) = conn.execute(query, []) {
            return CommandResult::err(format!("清理数据库失败 ({}): {}", query, e));
        }
    }

    CommandResult::ok(true)
}

#[tauri::command]
pub fn reset_ip_data(db_path: String, delete_files: bool) -> CommandResult<bool> {
    let conn = match Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let _ = crate::database::init_database(std::path::Path::new(&db_path));

    if delete_files {
        // 1. 获取自定义目录设置
        let custom_inbox: Option<String> = conn.query_row(
            "SELECT value FROM settings WHERE key = 'customIpInboxPath'",
            [],
            |row| row.get(0),
        ).ok();

        let custom_archived: Option<String> = conn.query_row(
            "SELECT value FROM settings WHERE key = 'customIpArchivedPath'",
            [],
            |row| row.get(0),
        ).ok();

        let db_path_buf = std::path::Path::new(&db_path);
        if let Some(app_data_dir) = db_path_buf.parent().and_then(|p| p.parent()) {
            let inbox_dir = if let Some(ref path_str) = custom_inbox {
                if !path_str.trim().is_empty() {
                    std::path::Path::new(path_str).to_path_buf()
                } else {
                    app_data_dir.join("ip_inbox")
                }
            } else {
                app_data_dir.join("ip_inbox")
            };

            let archived_dir = if let Some(ref path_str) = custom_archived {
                if !path_str.trim().is_empty() {
                    std::path::Path::new(path_str).to_path_buf()
                } else {
                    app_data_dir.join("ip_archived")
                }
            } else {
                app_data_dir.join("ip_archived")
            };

            // 彻底删除这两个文件夹
            if inbox_dir.exists() {
                let _ = std::fs::remove_dir_all(inbox_dir);
            }
            if archived_dir.exists() {
                let _ = std::fs::remove_dir_all(archived_dir);
            }
        }
    }

    // 2. 清理数据库记录 (保留系统默认未知形象 'unknown')
    let queries = [
        "DELETE FROM ip_creations",
        "DELETE FROM ip_character_sheets",
        "DELETE FROM ip_emojis",
        "DELETE FROM ip_sticker_pack_platforms",
        "DELETE FROM ip_sticker_packs",
        "DELETE FROM ip_relations",
        "DELETE FROM ip_image_tag_relations",
        "DELETE FROM ip_image_relations",
        "DELETE FROM ip_images",
        "DELETE FROM ip_assets WHERE id != 'unknown'",
    ];

    for query in &queries {
        if let Err(e) = conn.execute(query, []) {
            return CommandResult::err(format!("清理数据库失败 ({}): {}", query, e));
        }
    }

    CommandResult::ok(true)
}
