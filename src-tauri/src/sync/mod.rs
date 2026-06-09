pub mod client;
pub mod engine;
pub mod triggers;

use rusqlite::Connection;

/// 检查同步是否启用
pub fn is_sync_enabled(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT value FROM sync_config WHERE key = 'sync_enabled'",
        [],
        |row| row.get::<_, String>(0),
    )
    .unwrap_or_else(|_| "false".to_string())
        == "true"
}

/// 启用同步追踪
pub fn enable_sync(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(triggers::SYNC_SCHEMA)?;
    conn.execute_batch(triggers::SYNC_TRIGGERS)?;

    conn.execute(
        "INSERT OR REPLACE INTO sync_config (key, value) VALUES ('sync_enabled', 'true')",
        [],
    )?;
    Ok(())
}

/// 禁用同步追踪
pub fn disable_sync(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(triggers::DROP_TRIGGERS)?;
    conn.execute(
        "INSERT OR REPLACE INTO sync_config (key, value) VALUES ('sync_enabled', 'false')",
        [],
    )?;
    Ok(())
}
