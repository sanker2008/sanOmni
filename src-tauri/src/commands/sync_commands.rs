use crate::commands::CommandResult;
use crate::sync;
use rusqlite::Connection;
use std::collections::HashSet;
use std::path::Path;

use crate::sync::identity::creation_record_id;

#[tauri::command]
pub async fn sync_test_connection(
    server_url: String,
    api_key: String,
) -> CommandResult<serde_json::Value> {
    let client = match crate::sync::client::SyncClient::new(server_url, api_key) {
        Ok(client) => client,
        Err(e) => return CommandResult::err(e),
    };
    match client.test_connection().await {
        Ok(result) => CommandResult::ok(result),
        Err(e) => CommandResult::err(format!("连接测试失败: {}", e)),
    }
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
    let server_url = match crate::sync::client::validate_server_url(&server_url) {
        Ok(url) => url,
        Err(e) => return CommandResult::err(e),
    };
    let api_key = api_key.trim();
    if api_key.is_empty() {
        return CommandResult::err("API Key 不能为空".to_string());
    }

    // Ensure sync tables exist before saving config.
    let _ = conn.execute_batch(crate::sync::triggers::SYNC_SCHEMA);

    // 存储 API Key 到 keyring
    let entry = match keyring::Entry::new("sanomni-sync", "api_key") {
        Ok(entry) => entry,
        Err(e) => return CommandResult::err(format!("无法访问系统密钥链: {}", e)),
    };
    if let Err(e) = entry.set_password(api_key) {
        return CommandResult::err(format!("保存 API Key 失败: {}", e));
    }

    if let Err(e) = conn.execute(
        "INSERT OR REPLACE INTO sync_config (key, value) VALUES ('server_url', ?)",
        rusqlite::params![server_url],
    ) {
        return CommandResult::err(format!("保存服务器地址失败: {}", e));
    }

    CommandResult::ok(true)
}

#[tauri::command]
pub async fn sync_now(
    db_path: String,
    direction: Option<String>,
    app: tauri::AppHandle,
) -> CommandResult<serde_json::Value> {
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
    let client = match crate::sync::client::SyncClient::new(server_url, api_key) {
        Ok(client) => client,
        Err(e) => return CommandResult::err(e),
    };
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);
    match client.fetch_sync_history(limit, offset).await {
        Ok(data) => CommandResult::ok(data),
        Err(e) => CommandResult::err(format!("获取同步历史失败: {}", e)),
    }
}

#[tauri::command]
pub async fn sync_get_snapshot(
    server_url: String,
    api_key: String,
) -> CommandResult<serde_json::Value> {
    let client = match crate::sync::client::SyncClient::new(server_url, api_key) {
        Ok(client) => client,
        Err(e) => return CommandResult::err(e),
    };
    match client.fetch_snapshot().await {
        Ok(data) => CommandResult::ok(data),
        Err(e) => CommandResult::err(format!("Fetch sync snapshot failed: {}", e)),
    }
}

fn snapshot_str_field<'a>(
    table: &str,
    value: &'a serde_json::Value,
    field: &str,
) -> Result<&'a str, String> {
    value.get(field).and_then(|v| v.as_str()).ok_or_else(|| {
        format!(
            "Snapshot row for table {} is missing string field {}",
            table, field
        )
    })
}

fn snapshot_record_key(table: &str, value: &serde_json::Value) -> Result<String, String> {
    match table {
        "ip_image_relations" => Ok(format!(
            "{}|{}",
            snapshot_str_field(table, value, "ip_image_id")?,
            snapshot_str_field(table, value, "ip_id")?
        )),
        "ip_image_tag_relations" => Ok(format!(
            "{}|{}",
            snapshot_str_field(table, value, "ip_image_id")?,
            snapshot_str_field(table, value, "tag_id")?
        )),
        "ip_creations" => Ok(creation_record_id(
            snapshot_str_field(table, value, "ip_id")?,
            snapshot_str_field(table, value, "image_path")?,
        )),
        "ip_relations" => Ok(format!(
            "{}|{}|{}",
            snapshot_str_field(table, value, "ip_a_id")?,
            snapshot_str_field(table, value, "ip_b_id")?,
            snapshot_str_field(table, value, "relation_type")?
        )),
        _ => snapshot_str_field(table, value, "id").map(String::from),
    }
}

fn remote_snapshot_keys(table: &str, rows: &serde_json::Value) -> Result<HashSet<String>, String> {
    let rows = rows
        .as_array()
        .ok_or_else(|| format!("Snapshot table {} is not an array", table))?;
    let mut keys = HashSet::new();
    for value in rows {
        keys.insert(snapshot_record_key(table, value)?);
    }
    Ok(keys)
}

fn local_record_keys(conn: &Connection, table: &str) -> Result<HashSet<String>, String> {
    let sql = match table {
        "ip_image_relations" => "SELECT ip_image_id || '|' || ip_id FROM ip_image_relations",
        "ip_image_tag_relations" => {
            "SELECT ip_image_id || '|' || tag_id FROM ip_image_tag_relations"
        }
        "ip_creations" => "SELECT ip_id, image_path FROM ip_creations",
        "ip_relations" => {
            "SELECT ip_a_id || '|' || ip_b_id || '|' || relation_type FROM ip_relations"
        }
        "ip_character_sheets" => "SELECT id FROM ip_character_sheets",
        "ip_assets" => "SELECT id FROM ip_assets",
        "ip_images" => "SELECT id FROM ip_images",
        "ip_sticker_packs" => "SELECT id FROM ip_sticker_packs",
        "ip_sticker_pack_platforms" => "SELECT id FROM ip_sticker_pack_platforms",
        "ip_emojis" => "SELECT id FROM ip_emojis",
        "tags" => "SELECT id FROM tags",
        _ => return Ok(HashSet::new()),
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let mut keys = HashSet::new();
    if table == "ip_creations" {
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (ip_id, image_path) = row.map_err(|e| e.to_string())?;
            keys.insert(creation_record_id(&ip_id, &image_path));
        }
    } else {
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        for row in rows {
            keys.insert(row.map_err(|e| e.to_string())?);
        }
    }
    Ok(keys)
}

#[tauri::command]
pub async fn sync_reconcile_snapshot(db_path: String) -> CommandResult<serde_json::Value> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("Open database failed: {}", e)),
    };

    let server_url: String = match conn.query_row(
        "SELECT value FROM sync_config WHERE key = 'server_url'",
        [],
        |row| row.get(0),
    ) {
        Ok(v) => v,
        Err(_) => return CommandResult::err("Sync server URL is not configured".to_string()),
    };

    let api_key = match keyring::Entry::new("sanomni-sync", "api_key")
        .and_then(|entry| entry.get_password())
    {
        Ok(v) => v,
        Err(_) => return CommandResult::err("Sync API key is not configured".to_string()),
    };

    let client = match crate::sync::client::SyncClient::new(server_url, api_key) {
        Ok(client) => client,
        Err(e) => return CommandResult::err(e),
    };
    let snapshot = match client.fetch_snapshot().await {
        Ok(v) => v,
        Err(e) => return CommandResult::err(format!("Fetch sync snapshot failed: {}", e)),
    };

    let tables = match snapshot.get("tables").and_then(|v| v.as_object()) {
        Some(tables) => tables,
        None => return CommandResult::err("Snapshot response has no tables object".to_string()),
    };

    let mut table_reports = serde_json::Map::new();
    for (table, rows) in tables {
        let remote_keys = match remote_snapshot_keys(table, rows) {
            Ok(keys) => keys,
            Err(e) => return CommandResult::err(e),
        };
        let local_keys = match local_record_keys(&conn, table) {
            Ok(keys) => keys,
            Err(e) => return CommandResult::err(format!("Read local {} failed: {}", table, e)),
        };
        let missing_local = remote_keys.difference(&local_keys).count();
        let extra_local = local_keys.difference(&remote_keys).count();

        table_reports.insert(
            table.clone(),
            serde_json::json!({
                "remote_count": remote_keys.len(),
                "local_count": local_keys.len(),
                "missing_local": missing_local,
                "extra_local": extra_local,
            }),
        );
    }

    CommandResult::ok(serde_json::json!({
        "latest_version": snapshot.get("latest_version").cloned().unwrap_or(serde_json::Value::Null),
        "generated_at": snapshot.get("generated_at").cloned().unwrap_or(serde_json::Value::Null),
        "tables": table_reports,
        "remote_object_count": snapshot.get("objects").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn snapshot_record_key_uses_client_composite_key_for_ip_creations() {
        let row = json!({
            "id": "server-only-id",
            "ip_id": "ip-1",
            "image_path": "archive/ip-1/front.png"
        });

        assert_eq!(
            snapshot_record_key("ip_creations", &row).unwrap(),
            "ip-1|front.png"
        );
    }

    #[test]
    fn remote_snapshot_keys_rejects_missing_required_field() {
        let rows = json!([{ "id": "relation-1", "ip_image_id": "image-1" }]);

        let err = remote_snapshot_keys("ip_image_relations", &rows).unwrap_err();
        assert!(err.contains("ip_id"));
    }

    #[test]
    fn remote_snapshot_keys_rejects_non_array_table_payload() {
        let rows = json!({ "id": "ip-1" });

        let err = remote_snapshot_keys("ip_assets", &rows).unwrap_err();
        assert!(err.contains("not an array"));
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
        SELECT 'tags', id, 'INSERT', json_object('id', id, 'name', name, 'name_en', name_en, 'color', color, 'parent_id', parent_id, 'use_count', use_count, 'is_builtin', is_builtin, 'created_at', created_at) FROM tags;

        INSERT INTO sync_changelog (table_name, record_id, operation, data_json)
        SELECT 'ip_images', id, 'INSERT', json_object('id', id, 'filename', filename, 'original_filename', original_filename, 'ip_id', ip_id, 'relative_path', relative_path, 'absolute_path', absolute_path, 'status', status, 'file_size', file_size, 'width', width, 'height', height, 'file_hash', file_hash, 'format', format, 'has_watermark', has_watermark, 'watermark_platform', watermark_platform, 'watermark_detected', watermark_detected, 'watermark_removed', watermark_removed, 'created_at', created_at, 'imported_at', imported_at, 'archived_at', archived_at) FROM ip_images;

        INSERT INTO sync_changelog (table_name, record_id, operation, data_json)
        SELECT 'ip_character_sheets', id, 'INSERT', json_object('id', id, 'ip_id', ip_id, 'image_path', image_path, 'sheet_type', sheet_type, 'sort_order', sort_order, 'created_at', created_at) FROM ip_character_sheets;

        INSERT INTO sync_changelog (table_name, record_id, operation, data_json)
        SELECT 'ip_creations', ip_id || '|' || image_path, 'INSERT', json_object('ip_id', ip_id, 'image_path', image_path, 'creation_name', creation_name, 'created_at', created_at) FROM ip_creations;

        INSERT INTO sync_changelog (table_name, record_id, operation, data_json)
        SELECT 'ip_sticker_packs', id, 'INSERT', json_object('id', id, 'ip_id', ip_id, 'name', name, 'path', path, 'description', description, 'cover_path', cover_path, 'banner_path', banner_path, 'icon_path', icon_path, 'reward_guide_path', reward_guide_path, 'reward_thanks_path', reward_thanks_path, 'created_at', created_at, 'updated_at', updated_at) FROM ip_sticker_packs;

        INSERT INTO sync_changelog (table_name, record_id, operation, data_json)
        SELECT 'ip_sticker_pack_platforms', id, 'INSERT', json_object('id', id, 'pack_id', pack_id, 'platform_name', platform_name, 'pack_name_on_platform', pack_name_on_platform, 'emoji_size_spec', emoji_size_spec, 'status', status, 'publish_url', publish_url, 'downloads_count', downloads_count, 'updated_at', updated_at) FROM ip_sticker_pack_platforms;

        INSERT INTO sync_changelog (table_name, record_id, operation, data_json)
        SELECT 'ip_emojis', id, 'INSERT', json_object('id', id, 'ip_id', ip_id, 'pack_id', pack_id, 'image_path', image_path, 'trigger_word', trigger_word, 'sort_order', sort_order, 'created_at', created_at) FROM ip_emojis;

        INSERT INTO sync_changelog (table_name, record_id, operation, data_json)
        SELECT 'ip_relations', ip_a_id || '|' || ip_b_id || '|' || relation_type, 'INSERT', json_object('ip_a_id', ip_a_id, 'ip_b_id', ip_b_id, 'relation_type', relation_type, 'description', description, 'created_at', created_at) FROM ip_relations;

        INSERT INTO sync_changelog (table_name, record_id, operation, data_json)
        SELECT 'ip_image_relations', ip_image_id || '|' || ip_id, 'INSERT', json_object('ip_image_id', ip_image_id, 'ip_id', ip_id, 'is_primary', is_primary) FROM ip_image_relations;

        INSERT INTO sync_changelog (table_name, record_id, operation, data_json)
        SELECT 'ip_image_tag_relations', ip_image_id || '|' || tag_id, 'INSERT', json_object('ip_image_id', ip_image_id, 'tag_id', tag_id) FROM ip_image_tag_relations;

        COMMIT;
    "#;

    match conn.execute_batch(sql) {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("执行重推语句失败: {}", e)),
    }
}
