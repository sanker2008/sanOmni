use crate::commands::CommandResult;
use crate::models::Tag;
use rusqlite::Connection;

#[tauri::command]
pub async fn get_tags(db_path: String) -> CommandResult<Vec<Tag>> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let mut stmt = match conn.prepare(
        "SELECT id, name, name_en, color, parent_id, use_count, is_builtin, created_at 
         FROM tags ORDER BY use_count DESC"
    ) {
        Ok(stmt) => stmt,
        Err(e) => return CommandResult::err(format!("Failed to prepare query: {}", e)),
    };

    let tags = stmt.query_map([], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            name_en: row.get(2)?,
            color: row.get(3)?,
            parent_id: row.get(4)?,
            use_count: row.get(5)?,
            is_builtin: row.get::<_, i32>(6)? != 0,
            created_at: row.get(7)?,
        })
    }).unwrap();

    let result: Vec<Tag> = tags.filter_map(|t| t.ok()).collect();
    CommandResult::ok(result)
}

#[tauri::command]
pub async fn add_tag(db_path: String, name: String, name_en: Option<String>, color: Option<String>) -> CommandResult<Tag> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let id = name.to_lowercase().replace(" ", "-");
    let now = chrono::Utc::now().to_rfc3339();

    match conn.execute(
        "INSERT OR IGNORE INTO tags (id, name, name_en, color, created_at) VALUES (?, ?, ?, ?, ?)",
        (&id, &name, &name_en, &color, &now),
    ) {
        Ok(_) => CommandResult::ok(Tag {
            id,
            name,
            name_en,
            color,
            parent_id: None,
            use_count: 0,
            is_builtin: false,
            created_at: now,
        }),
        Err(e) => CommandResult::err(format!("Failed to add tag: {}", e)),
    }
}
