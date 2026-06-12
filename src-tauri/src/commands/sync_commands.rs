use crate::commands::CommandResult;
use crate::sync;
use rusqlite::Connection;
use std::path::Path;

#[tauri::command]
pub async fn sync_test_connection(
    server_url: String,
    api_key: String,
) -> CommandResult<serde_json::Value> {
    let start = std::time::Instant::now();
    let server_url = server_url.trim_end_matches('/');
    let health_url = format!("{}/api/health", server_url);

    let client = reqwest::Client::new();
    let reach_resp = client.get(&health_url).send().await;
    let reachable = reach_resp.is_ok() && reach_resp.unwrap().status().is_success();

    let mut auth_ok = false;
    let mut db_stats = serde_json::Value::Null;

    if reachable {
        if let Ok(resp) = client
            .get(&format!("{}/api/auth/test", server_url))
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .await
        {
            if resp.status() == 200 {
                auth_ok = true;
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    db_stats = json
                        .get("db_stats")
                        .cloned()
                        .unwrap_or(serde_json::Value::Null);
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
pub async fn sync_now(db_path: String, direction: Option<String>, app: tauri::AppHandle) -> CommandResult<serde_json::Value> {
    match sync::engine::run_sync(&db_path, direction.as_deref(), &app).await {
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
    let server_url: Option<String> = conn
        .query_row(
            "SELECT value FROM sync_config WHERE key = 'server_url'",
            [],
            |row| row.get(0),
        )
        .ok();
    let pending_changes: i64 = if enabled {
        conn.query_row("SELECT COUNT(*) FROM sync_changelog", [], |r| r.get(0))
            .unwrap_or(0)
    } else {
        0
    };

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

#[tauri::command]
pub async fn sync_get_history(
    server_url: String,
    api_key: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> CommandResult<serde_json::Value> {
    let client = crate::sync::client::SyncClient::new(server_url, api_key);
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);
    match client.fetch_sync_history(limit, offset).await {
        Ok(data) => CommandResult::ok(data),
        Err(e) => CommandResult::err(format!("获取同步历史失败: {}", e)),
    }
}

#[tauri::command]
pub fn sync_force_repush(db_path: String) -> CommandResult<bool> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let sql = r#"
        BEGIN;
        
        -- 清空现有的变更记录避免重复
        DELETE FROM sync_changelog;
        
        INSERT INTO sync_changelog (table_name, record_id, operation, data_json)
        SELECT 'ip_assets', id, 'INSERT', json_object('id', id, 'name', name, 'path', path, 'avatar_path', avatar_path, 'inspiration', inspiration, 'description', description, 'created_at', created_at, 'updated_at', updated_at) FROM ip_assets;

        INSERT INTO sync_changelog (table_name, record_id, operation, data_json)
        SELECT 'ip_images', id, 'INSERT', json_object('id', id, 'filename', filename, 'original_filename', original_filename, 'ip_id', ip_id, 'relative_path', relative_path, 'absolute_path', absolute_path, 'status', status, 'file_size', file_size, 'width', width, 'height', height, 'file_hash', file_hash, 'format', format, 'has_watermark', has_watermark, 'watermark_platform', watermark_platform, 'watermark_detected', watermark_detected, 'watermark_removed', watermark_removed, 'created_at', created_at, 'imported_at', imported_at, 'archived_at', archived_at) FROM ip_images;
        
        INSERT INTO sync_changelog (table_name, record_id, operation, data_json)
        SELECT 'ip_image_relations', ip_image_id || '_' || ip_id, 'INSERT', json_object('ip_image_id', ip_image_id, 'ip_id', ip_id, 'is_primary', is_primary) FROM ip_image_relations;

        INSERT INTO sync_changelog (table_name, record_id, operation, data_json)
        SELECT 'ip_image_tag_relations', ip_image_id || '_' || tag_id, 'INSERT', json_object('ip_image_id', ip_image_id, 'tag_id', tag_id) FROM ip_image_tag_relations;

        INSERT INTO sync_changelog (table_name, record_id, operation, data_json)
        SELECT 'tags', id, 'INSERT', json_object('id', id, 'name', name, 'name_en', name_en, 'color', color, 'parent_id', parent_id, 'use_count', use_count, 'is_builtin', is_builtin, 'created_at', created_at) FROM tags;
        
        COMMIT;
    "#;

    match conn.execute_batch(sql) {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("执行重推语句失败: {}", e)),
    }
}
