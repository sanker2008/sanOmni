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
