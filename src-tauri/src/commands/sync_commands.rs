use crate::commands::CommandResult;
use crate::sync;
use rusqlite::Connection;
use std::collections::{HashMap, HashSet};
use std::path::Path;

use crate::sync::client::SyncChange;
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

pub(crate) struct SnapshotGap {
    pub missing_total: usize,
    pub missing_keys: HashMap<String, HashSet<String>>,
}

fn snapshot_table_reports(
    conn: &Connection,
    snapshot: &serde_json::Value,
) -> Result<(serde_json::Map<String, serde_json::Value>, SnapshotGap), String> {
    let tables = snapshot
        .get("tables")
        .and_then(|v| v.as_object())
        .ok_or_else(|| "Snapshot response has no tables object".to_string())?;

    let mut table_reports = serde_json::Map::new();
    let mut missing_local_total = 0usize;
    let mut missing_keys = HashMap::new();
    for (table, rows) in tables {
        let remote_keys = remote_snapshot_keys(table, rows)?;
        let local_keys = local_record_keys(conn, table)
            .map_err(|e| format!("Read local {} failed: {}", table, e))?;
        let table_missing_keys: HashSet<String> =
            remote_keys.difference(&local_keys).cloned().collect();
        let missing_local = table_missing_keys.len();
        let extra_local = local_keys.difference(&remote_keys).count();
        missing_local_total += missing_local;
        if !table_missing_keys.is_empty() {
            missing_keys.insert(table.clone(), table_missing_keys);
        }

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

    Ok((
        table_reports,
        SnapshotGap {
            missing_total: missing_local_total,
            missing_keys,
        },
    ))
}

pub(crate) fn snapshot_missing_local_count(
    conn: &Connection,
    snapshot: &serde_json::Value,
) -> Result<usize, String> {
    snapshot_table_reports(conn, snapshot).map(|(_, gap)| gap.missing_total)
}

pub(crate) fn snapshot_gap(
    conn: &Connection,
    snapshot: &serde_json::Value,
) -> Result<SnapshotGap, String> {
    snapshot_table_reports(conn, snapshot).map(|(_, gap)| gap)
}

fn recovery_table_priority(table: &str) -> usize {
    match table {
        "ip_assets" => 0,
        "tags" => 1,
        "ip_images" => 2,
        "ip_character_sheets" => 3,
        "ip_creations" => 4,
        "ip_sticker_packs" => 5,
        "ip_sticker_pack_platforms" => 6,
        "ip_emojis" => 7,
        "ip_image_relations" => 8,
        "ip_image_tag_relations" => 9,
        "ip_relations" => 10,
        _ => usize::MAX,
    }
}

fn history_change_key(change: &SyncChange) -> Result<String, String> {
    if let Some(data) = change.data.as_deref() {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(data) {
            if let Ok(key) = snapshot_record_key(&change.table, &value) {
                return Ok(key);
            }
        }
    }

    match change.table.as_str() {
        "ip_image_relations" | "ip_image_tag_relations" | "ip_creations" | "ip_relations" => {
            Err(format!(
                "完整历史中的 {} 记录 {} 缺少可解析的复合业务键",
                change.table, change.record_id
            ))
        }
        _ => Ok(change.record_id.clone()),
    }
}

pub(crate) fn select_snapshot_recovery_changes(
    history: &[SyncChange],
    gap: &SnapshotGap,
) -> Result<Vec<SyncChange>, String> {
    let mut latest = HashMap::<(String, String), (usize, SyncChange)>::new();

    for (index, change) in history.iter().enumerate() {
        let Some(table_missing_keys) = gap.missing_keys.get(&change.table) else {
            continue;
        };
        let key = history_change_key(change)?;
        if !table_missing_keys.contains(&key) {
            continue;
        }

        match change.operation.as_str() {
            "INSERT" | "UPDATE" => {
                latest.insert((change.table.clone(), key), (index, change.clone()));
            }
            "DELETE" => {
                latest.remove(&(change.table.clone(), key));
            }
            operation => {
                return Err(format!(
                    "完整历史包含不支持的同步操作 {}: {} {}",
                    operation, change.table, change.record_id
                ));
            }
        }
    }

    if latest.len() != gap.missing_total {
        return Err(format!(
            "服务端快照有 {} 条本机缺失记录，但完整历史只能恢复 {} 条",
            gap.missing_total,
            latest.len()
        ));
    }

    let mut selected: Vec<(usize, SyncChange)> = latest.into_values().collect();
    selected.sort_by_key(|(history_index, change)| {
        (recovery_table_priority(&change.table), *history_index)
    });
    Ok(selected.into_iter().map(|(_, change)| change).collect())
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

    let (table_reports, gap) = match snapshot_table_reports(&conn, &snapshot) {
        Ok(report) => report,
        Err(e) => return CommandResult::err(e),
    };

    CommandResult::ok(serde_json::json!({
        "latest_version": snapshot.get("latest_version").cloned().unwrap_or(serde_json::Value::Null),
        "generated_at": snapshot.get("generated_at").cloned().unwrap_or(serde_json::Value::Null),
        "tables": table_reports,
        "missing_local_total": gap.missing_total,
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

    #[test]
    fn snapshot_reconciliation_detects_remote_ip_missing_locally() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE ip_assets (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL);",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO ip_assets (id, name, path) VALUES ('local-ip', '本机 IP', 'local')",
            [],
        )
        .unwrap();

        let snapshot = json!({
            "tables": {
                "ip_assets": [
                    { "id": "local-ip", "name": "本机 IP", "path": "local" },
                    { "id": "remote-ip", "name": "黑炭头", "path": "heitantou" }
                ]
            }
        });

        assert_eq!(snapshot_missing_local_count(&conn, &snapshot).unwrap(), 1);
    }

    #[test]
    fn snapshot_recovery_selects_latest_missing_rows_in_dependency_order() {
        let gap = SnapshotGap {
            missing_total: 2,
            missing_keys: HashMap::from([
                (
                    "ip_assets".to_string(),
                    HashSet::from(["remote-ip".to_string()]),
                ),
                (
                    "ip_images".to_string(),
                    HashSet::from(["remote-image".to_string()]),
                ),
            ]),
        };
        let history = vec![
            SyncChange {
                domain: "sanIP".to_string(),
                table: "ip_assets".to_string(),
                record_id: "remote-ip".to_string(),
                operation: "INSERT".to_string(),
                data: Some(json!({ "id": "remote-ip", "name": "旧名称" }).to_string()),
                changed_at: "1".to_string(),
            },
            SyncChange {
                domain: "sanIP".to_string(),
                table: "ip_images".to_string(),
                record_id: "remote-image".to_string(),
                operation: "INSERT".to_string(),
                data: Some(
                    json!({ "id": "remote-image", "ip_id": "remote-ip", "file_hash": "hash" })
                        .to_string(),
                ),
                changed_at: "2".to_string(),
            },
            SyncChange {
                domain: "sanIP".to_string(),
                table: "ip_assets".to_string(),
                record_id: "remote-ip".to_string(),
                operation: "UPDATE".to_string(),
                data: Some(json!({ "id": "remote-ip", "name": "黑炭头" }).to_string()),
                changed_at: "3".to_string(),
            },
            SyncChange {
                domain: "sanIP".to_string(),
                table: "ip_assets".to_string(),
                record_id: "unrelated-ip".to_string(),
                operation: "INSERT".to_string(),
                data: Some(json!({ "id": "unrelated-ip" }).to_string()),
                changed_at: "4".to_string(),
            },
        ];

        let selected = select_snapshot_recovery_changes(&history, &gap).unwrap();

        assert_eq!(selected.len(), 2);
        assert_eq!(selected[0].table, "ip_assets");
        assert!(selected[0].data.as_deref().unwrap().contains("黑炭头"));
        assert_eq!(selected[1].table, "ip_images");
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
