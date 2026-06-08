use crate::commands::CommandResult;
use std::path::Path;
use rusqlite::Connection;
use crate::sync;

#[tauri::command]
pub async fn sync_test_connection(server_url: String, api_key: String) -> CommandResult<serde_json::Value> {
    let start = std::time::Instant::now();
    let server_url = server_url.trim_end_matches('/');
    let health_url = format!("{}/api/health", server_url);
    
    let client = reqwest::Client::new();
    let reach_resp = client.get(&health_url).send().await;
    let reachable = reach_resp.is_ok() && reach_resp.unwrap().status().is_success();
    
    let mut auth_ok = false;
    let mut db_stats = serde_json::Value::Null;
    
    if reachable {
        if let Ok(resp) = client.get(&format!("{}/api/auth/test", server_url))
            .header("Authorization", format!("Bearer {}", api_key))
            .send().await 
        {
            if resp.status() == 200 {
                auth_ok = true;
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    db_stats = json.get("db_stats").cloned().unwrap_or(serde_json::Value::Null);
                }
            }
        }
    }
    
    let latency_ms = start.elapsed().as_millis() as u64;
    
    CommandResult::ok(serde_json::json!({
        "reachable": reachable,
        "authenticated": auth_ok,
        "latency_ms": latency_ms,
        "db_stats": db_stats
    }))
}

#[tauri::command]
pub fn sync_enable(db_path: String) -> CommandResult<bool> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };
    match sync::enable_sync(&conn) {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("启用同步失败: {}", e)),
    }
}

#[tauri::command]
pub fn sync_disable(db_path: String) -> CommandResult<bool> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };
    match sync::disable_sync(&conn) {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("禁用同步失败: {}", e)),
    }
}

#[tauri::command]
pub fn sync_configure(db_path: String, server_url: String, api_key: String) -> CommandResult<bool> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };
    
    // 确保同步表存在，否则还没开启引擎时直接保存配置会报错
    let _ = conn.execute_batch(crate::sync::triggers::SYNC_SCHEMA);
    
    if let Err(e) = conn.execute(
        "INSERT OR REPLACE INTO sync_config (key, value) VALUES ('server_url', ?)",
        rusqlite::params![server_url],
    ) {
        return CommandResult::err(format!("保存失败: {}", e));
    }
    
    // 存储 API Key 到 keyring
    if let Ok(entry) = keyring::Entry::new("sanomni-sync", "api_key") {
        let _ = entry.set_password(&api_key);
    }
    
    CommandResult::ok(true)
}

#[tauri::command]
pub async fn sync_now(db_path: String, app: tauri::AppHandle) -> CommandResult<serde_json::Value> {
    match sync::engine::run_sync(&db_path, &app).await {
        Ok(res) => CommandResult::ok(res),
        Err(e) => CommandResult::err(e),
    }
}

#[tauri::command]
pub fn sync_get_status(db_path: String) -> CommandResult<serde_json::Value> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };
    let enabled = sync::is_sync_enabled(&conn);
    let server_url: Option<String> = conn.query_row("SELECT value FROM sync_config WHERE key = 'server_url'", [], |row| row.get(0)).ok();
    let pending_changes: i64 = if enabled {
        conn.query_row("SELECT COUNT(*) FROM sync_changelog", [], |r| r.get(0)).unwrap_or(0)
    } else { 0 };

    let api_key: Option<String> = keyring::Entry::new("sanomni-sync", "api_key")
        .and_then(|entry| entry.get_password())
        .ok();

    CommandResult::ok(serde_json::json!({
        "enabled": enabled,
        "server_url": server_url,
        "api_key": api_key,
        "pending_changes": pending_changes
    }))
}
