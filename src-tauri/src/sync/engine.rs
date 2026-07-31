use crate::sync::client::{
    PushRequest, SyncChange, SyncClient, SANIP_SYNC_DOMAIN, SYNC_PROTOCOL_VERSION,
};
use rusqlite::Connection;
use sha2::{Digest, Sha256};
use std::path::Path;
use tauri::Emitter;
use uuid::Uuid;

use crate::sync::identity::{
    creation_record_id, portable_file_name, split_creation_record_id,
};

fn escape_legacy_backslashes(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\\' {
            match chars.peek() {
                Some('"') | Some('\\') | Some('/') | Some('b') | Some('f') | Some('n') | Some('r') | Some('t') => {
                    output.push(ch);
                    if let Some(next) = chars.next() {
                        output.push(next);
                    }
                }
                Some('u') => {
                    output.push(ch);
                    if let Some(next) = chars.next() {
                        output.push(next);
                    }
                    for _ in 0..4 {
                        if let Some(next) = chars.next() {
                            output.push(next);
                        }
                    }
                }
                _ => output.push_str("\\\\"),
            }
        } else {
            output.push(ch);
        }
    }

    output
}

fn parse_sync_json(data_str: &str) -> Result<serde_json::Value, serde_json::Error> {
    serde_json::from_str::<serde_json::Value>(data_str)
        .or_else(|_| serde_json::from_str::<serde_json::Value>(&escape_legacy_backslashes(data_str)))
}

fn change_pair(change: &SyncChange, first: &str, second: &str) -> Option<(String, String)> {
    change
        .data
        .as_deref()
        .and_then(|data| parse_sync_json(data).ok())
        .and_then(|json| {
            Some((
                json.get(first)?.as_str()?.to_string(),
                json.get(second)?.as_str()?.to_string(),
            ))
        })
        .or_else(|| {
            change
                .record_id
                .split_once('|')
                .or_else(|| change.record_id.split_once('_'))
                .map(|(left, right)| (left.to_string(), right.to_string()))
        })
}

fn queue_pending_download(
    db_path: &str,
    file_hash: &str,
    local_path: &std::path::Path,
    change: &SyncChange,
    path_key: &str,
) {
    if let Ok(conn) = Connection::open(Path::new(db_path)) {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO sync_pending_downloads (file_hash, local_path, table_name, record_id, path_key) VALUES (?, ?, ?, ?, ?)",
            rusqlite::params![
                file_hash,
                local_path.to_string_lossy(),
                change.table,
                change.record_id,
                path_key
            ],
        );
    }
}

pub async fn run_sync(db_path: &str, direction: Option<&str>, app: &tauri::AppHandle) -> Result<serde_json::Value, String> {
    // 1. 读库，收集待推送的变更（放入独立的代码块中，确保 Connection 及时被释放）
    let (server_url, api_key, device_id, last_sync_version, pending_ids, mut changes) = {
        let conn =
            Connection::open(Path::new(db_path)).map_err(|e| format!("打开数据库失败: {}", e))?;

        // 确保表结构是最新的
        let _ = conn.execute_batch(crate::sync::triggers::SYNC_SCHEMA);

        let server_url: String = conn
            .query_row(
                "SELECT value FROM sync_config WHERE key = 'server_url'",
                [],
                |row| row.get(0),
            )
            .map_err(|_| "未配置服务器地址".to_string())?;

        let api_key = keyring::Entry::new("sanomni-sync", "api_key")
            .map_err(|_| "无法访问密钥链")?
            .get_password()
            .map_err(|_| "未配置 API Key".to_string())?;

        let device_id: String = conn
            .query_row(
                "SELECT value FROM sync_config WHERE key = 'device_id'",
                [],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| {
                let id = Uuid::new_v4().to_string();
                let _ = conn.execute(
                    "INSERT INTO sync_config (key, value) VALUES ('device_id', ?)",
                    rusqlite::params![id],
                );
                id
            });

        let last_sync_version: i64 = conn
            .query_row(
                "SELECT value FROM sync_config WHERE key = 'last_sync_version'",
                [],
                |row| {
                    let v: String = row.get(0)?;
                    Ok(v.parse::<i64>().unwrap_or(0))
                },
            )
            .unwrap_or(0);

        let mut stmt = conn.prepare("SELECT id, table_name, record_id, operation, data_json, changed_at FROM sync_changelog ORDER BY id ASC").unwrap();
        let mut pending_ids = Vec::new();
        let changes: Vec<SyncChange> = stmt
            .query_map([], |row| {
                let id: i64 = row.get(0)?;
                pending_ids.push(id);
                Ok(SyncChange {
                    domain: SANIP_SYNC_DOMAIN.to_string(),
                    table: row.get(1)?,
                    record_id: row.get(2)?,
                    operation: row.get(3)?,
                    data: row.get(4)?,
                    changed_at: row.get(5)?,
                })
            })
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        (
            server_url,
            api_key,
            device_id,
            last_sync_version,
            pending_ids,
            changes,
        )
    }; // <--- conn 在这里被 Drop，不再跨越 .await

    let client = SyncClient::new(server_url, api_key)?;

    // 2. Push 到服务器
    let mut pushed_count = 0;
    let mut new_server_version = last_sync_version;

    let should_push = direction.unwrap_or("both") != "pull";
    let should_pull = direction.unwrap_or("both") != "push";

    // 1.5 提取需要上传的文件
    let mut file_hashes_to_check = Vec::new();
    let mut files_to_upload = Vec::new(); // (hash, absolute_path, i)

    if should_push {

    for (i, change) in changes.iter_mut().enumerate() {
        if change.table == "ip_creations" {
            if let Some(data_str) = &change.data {
                if let Ok(json) = parse_sync_json(data_str) {
                    if let (Some(ip_id), Some(image_path)) = (
                        json.get("ip_id").and_then(|v| v.as_str()),
                        json.get("image_path").and_then(|v| v.as_str()),
                    ) {
                        change.record_id = creation_record_id(ip_id, image_path);
                    }
                }
            }
        }

        if matches!(
            change.table.as_str(),
            "ip_assets"
                | "ip_images"
                | "ip_sticker_packs"
                | "ip_emojis"
                | "ip_character_sheets"
                | "ip_creations"
        ) && change.operation != "DELETE"
        {
            if let Some(data_str) = &change.data {
                if let Ok(mut json) = parse_sync_json(data_str) {
                    let path_hash_keys = if change.table == "ip_assets" {
                        vec![("avatar_path", "file_hash")]
                    } else if change.table == "ip_images" {
                        vec![("absolute_path", "file_hash")]
                    } else if change.table == "ip_emojis" {
                        vec![("image_path", "file_hash")]
                    } else if change.table == "ip_character_sheets"
                        || change.table == "ip_creations"
                    {
                        vec![("image_path", "file_hash")]
                    } else if change.table == "ip_sticker_packs" {
                        vec![
                            ("cover_path", "cover_hash"),
                            ("banner_path", "banner_hash"),
                            ("icon_path", "icon_hash"),
                            ("reward_guide_path", "reward_guide_hash"),
                            ("reward_thanks_path", "reward_thanks_hash"),
                        ]
                    } else {
                        vec![]
                    };

                    let mut updated = false;
                    for (path_key, hash_key) in path_hash_keys {
                        if let Some(abs_path) = json.get(path_key).and_then(|v| v.as_str()).map(String::from) {
                            if !abs_path.is_empty() {
                                let data = tokio::fs::read(&abs_path).await.map_err(|e| {
                                    format!("读取待同步文件失败 {}: {}", abs_path, e)
                                })?;
                                let mut hasher = Sha256::new();
                                hasher.update(&data);
                                let hash = format!("{:x}", hasher.finalize());

                                file_hashes_to_check.push(hash.clone());
                                files_to_upload.push((hash.clone(), abs_path, i));

                                if let Some(obj) = json.as_object_mut() {
                                    obj.insert(
                                        hash_key.to_string(),
                                        serde_json::Value::String(hash.clone()),
                                    );
                                    updated = true;
                                }
                            }
                        }
                    }
                    if updated {
                        change.data = Some(serde_json::to_string(&json).unwrap());
                    }
                }
            }
        }
    }

    if !file_hashes_to_check.is_empty() {
        let missing_hashes = client
            .check_files(file_hashes_to_check)
            .await
            .map_err(|e| format!("Check remote files failed: {}", e))?;
        let total = files_to_upload.len();
        let mut current = 0;
        for (hash, abs_path, _) in files_to_upload {
            if missing_hashes.contains(&hash) {
                current += 1;
                let _ = app.emit(
                    "sync-progress",
                    serde_json::json!({
                        "phase": "upload",
                        "current": current,
                        "total": total,
                        "path": abs_path
                    }),
                );
                let uploaded_hash = client
                    .upload_file(&abs_path)
                    .await
                    .map_err(|e| format!("Upload file failed {}: {}", abs_path, e))?;
                if uploaded_hash != hash {
                    return Err(format!(
                        "Uploaded file hash mismatch: {} expected {} got {}",
                        abs_path, hash, uploaded_hash
                    ));
                }
            }
        }
    }

    if !changes.is_empty() {
        let req = PushRequest {
            domain: SANIP_SYNC_DOMAIN.to_string(),
            protocol_version: SYNC_PROTOCOL_VERSION,
            device_id: device_id.clone(),
            changes: changes.clone(),
        };
        match client.push(req).await {
            // <--- 这是一个 .await 点
            Ok(resp) => {
                pushed_count = resp.applied_count;
                new_server_version = resp.server_version;

                // 写库清理已推送日志
                let mut conn = Connection::open(Path::new(db_path)).unwrap();
                let tx = conn.transaction().unwrap();
                for id in pending_ids {
                    let _ = tx.execute(
                        "DELETE FROM sync_changelog WHERE id = ?",
                        rusqlite::params![id],
                    );
                }
                let _ = tx.commit();
            }
            Err(e) => return Err(format!("推送失败: {}", e)),
        }
    }
    } // End of should_push

    // 3. Pull 服务器变更
    let mut pulled_count = 0;
    let mut recovered_missing_records = 0usize;

    if should_pull {
    // Push 只代表服务端接收了本地变更，并不代表本机已经消费了此前的远端版本。
    // 拉取必须继续使用上一次成功 Pull 的游标，否则会跳过其他设备先写入的变更。
    let current_version = crate::sync::cursor::pull_start_after_push(
        last_sync_version,
        new_server_version,
    );

    let app_root = {
        let conn = Connection::open(Path::new(db_path)).unwrap();
        let unified_root: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'unifiedRootPath'",
                [],
                |r| r.get(0),
            )
            .unwrap_or_default();
        if unified_root.is_empty() {
            Path::new(db_path).parent().unwrap().to_path_buf()
        } else {
            std::path::PathBuf::from(unified_root)
        }
    };

    // Retry previously failed downloads
    let pendings: Vec<(i64, String, String, String, String, String)> = {
        let retry_conn = Connection::open(Path::new(db_path)).unwrap();
        let mut stmt = retry_conn.prepare(
            "SELECT id, file_hash, local_path, table_name, record_id, path_key FROM sync_pending_downloads"
        ).unwrap();
        let result = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
            })
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        result
    }; // stmt and retry_conn dropped here before any .await

    for (id, file_hash, local_path, table_name, record_id, path_key) in &pendings {
        let target = std::path::PathBuf::from(local_path);
        if let Some(parent) = target.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        if let Ok(()) = client.download_file(file_hash, &target).await {
            if let Ok(data) = tokio::fs::read(&target).await {
                let mut hasher = Sha256::new();
                hasher.update(&data);
                let dl_hash = format!("{:x}", hasher.finalize());
                if dl_hash == *file_hash {
                    let upd_conn = Connection::open(Path::new(db_path)).unwrap();
                    let _ = upd_conn.execute_batch(crate::sync::triggers::DROP_TRIGGERS);
                    let update_result = match table_name.as_str() {
                        "ip_assets" | "ip_images" | "ip_sticker_packs" | "ip_emojis"
                        | "ip_character_sheets" => {
                            let update_sql = format!(
                                "UPDATE {} SET {} = ? WHERE id = ?",
                                table_name, path_key
                            );
                            upd_conn.execute(
                                &update_sql,
                                rusqlite::params![local_path, record_id],
                            )
                        }
                        "ip_creations" => {
                            if let Some((ip_id, file_name)) =
                                split_creation_record_id(record_id)
                            {
                                let existing_path = upd_conn
                                    .prepare(
                                        "SELECT image_path FROM ip_creations WHERE ip_id = ?",
                                    )
                                    .and_then(|mut stmt| {
                                        let paths = stmt.query_map(
                                            rusqlite::params![ip_id],
                                            |row| row.get::<_, String>(0),
                                        )?;
                                        for path in paths {
                                            let path = path?;
                                            if portable_file_name(&path) == file_name {
                                                return Ok(Some(path));
                                            }
                                        }
                                        Ok(None)
                                    });
                                match existing_path {
                                    Ok(Some(existing_path)) => upd_conn.execute(
                                        "UPDATE ip_creations SET image_path = ? WHERE ip_id = ? AND image_path = ?",
                                        rusqlite::params![local_path, ip_id, existing_path],
                                    ),
                                    Ok(None) => Ok(0),
                                    Err(e) => Err(e),
                                }
                            } else {
                                Ok(0)
                            }
                        }
                        _ => Ok(0),
                    };
                    let _ = upd_conn.execute_batch(crate::sync::triggers::SYNC_TRIGGERS);
                    if matches!(update_result, Ok(count) if count > 0) {
                        let _ = upd_conn.execute(
                            "DELETE FROM sync_pending_downloads WHERE id = ?",
                            rusqlite::params![id],
                        );
                        eprintln!("[Sync] Retry download succeeded: {}", local_path);
                    }
                }
            }
        }
    }

    match client.pull(current_version).await {
        // <--- 又一个 .await 点
        Ok(mut resp) => {
            // An empty incremental response is not sufficient proof that the local
            // database is complete: an older buggy client may already have advanced
            // its cursor past unapplied rows. Compare the current server snapshot and
            // replay retained history only when a real remote-only gap is detected.
            if resp.changes.is_empty() {
                let snapshot = client
                    .fetch_snapshot()
                    .await
                    .map_err(|e| format!("同步快照对账失败: {}", e))?;
                let gap = {
                    let reconcile_conn = Connection::open(Path::new(db_path))
                        .map_err(|e| format!("打开数据库进行同步对账失败: {}", e))?;
                    crate::commands::sync_commands::snapshot_gap(&reconcile_conn, &snapshot)?
                };
                let recovery_version = crate::sync::cursor::pull_start_after_reconciliation(
                    current_version,
                    gap.missing_total,
                );

                if recovery_version < current_version {
                    let history = client
                        .pull(recovery_version)
                        .await
                        .map_err(|e| format!("同步历史缺口恢复失败: {}", e))?;
                    resp.changes =
                        crate::commands::sync_commands::select_snapshot_recovery_changes(
                            &history.changes,
                            &gap,
                        )?;
                    resp.latest_version = history.latest_version;
                    recovered_missing_records = gap.missing_total;
                } else if gap.missing_total > 0 {
                    return Err(
                        "服务器快照存在本机缺失记录，但完整历史无法继续回放；同步游标未推进"
                            .to_string(),
                    );
                }
            }

            if !resp.changes.is_empty() {
                let mut pulled_ip_paths = std::collections::HashMap::<String, String>::new();
                let mut pulled_pack_paths = std::collections::HashMap::<String, String>::new();
                for change in &resp.changes {
                    if change.operation == "DELETE" {
                        continue;
                    }
                    let Some(data_str) = &change.data else {
                        continue;
                    };
                    let Ok(json) = parse_sync_json(data_str) else {
                        continue;
                    };

                    match change.table.as_str() {
                        "ip_assets" => {
                            if let (Some(id), Some(path)) = (
                                json.get("id").and_then(|v| v.as_str()),
                                json.get("path").and_then(|v| v.as_str()),
                            ) {
                                pulled_ip_paths.insert(id.to_string(), path.to_string());
                            }
                        }
                        "ip_sticker_packs" => {
                            if let (Some(id), Some(path)) = (
                                json.get("id").and_then(|v| v.as_str()),
                                json.get("path").and_then(|v| v.as_str()),
                            ) {
                                pulled_pack_paths.insert(id.to_string(), path.to_string());
                            }
                        }
                        _ => {}
                    }
                }

                let total = resp.changes.len();
                let mut current = 0;

                // 下载文件并修正本地文件路径
                let db_conn = Connection::open(Path::new(db_path)).unwrap();
                for change in &mut resp.changes {
                    if matches!(
                        change.table.as_str(),
                        "ip_assets"
                            | "ip_images"
                            | "ip_sticker_packs"
                            | "ip_emojis"
                            | "ip_character_sheets"
                            | "ip_creations"
                    )
                        && change.operation != "DELETE"
                    {
                        if let Some(data_str) = &change.data {
                            if let Ok(mut json) =
                                parse_sync_json(data_str)
                            {
                                let file_tasks = if change.table == "ip_assets" {
                                    vec![("avatar_path", "file_hash")]
                                } else if change.table == "ip_images" {
                                    vec![("absolute_path", "file_hash")]
                                } else if change.table == "ip_sticker_packs" {
                                    vec![
                                        ("cover_path", "cover_hash"),
                                        ("banner_path", "banner_hash"),
                                        ("icon_path", "icon_hash"),
                                        ("reward_guide_path", "reward_guide_hash"),
                                        ("reward_thanks_path", "reward_thanks_hash"),
                                    ]
                                } else if change.table == "ip_emojis" {
                                    vec![("image_path", "file_hash")]
                                } else if change.table == "ip_character_sheets"
                                    || change.table == "ip_creations"
                                {
                                    vec![("image_path", "file_hash")]
                                } else {
                                    vec![]
                                };

                                let mut updated = false;
                                for (path_key, hash_key) in file_tasks {
                                    if let Some(hash) = json.get(hash_key).and_then(|v| v.as_str()).map(String::from) {
                                        let rel_path_normalized = if change.table == "ip_images" {
                                            json.get("relative_path")
                                                .and_then(|v| v.as_str())
                                                .map(|s| s.replace("\\", "/"))
                                        } else if change.table == "ip_assets" {
                                            let ip_path = json.get("path").and_then(|v| v.as_str()).unwrap_or("unknown");
                                            let filename = json.get(path_key)
                                                .and_then(|v| v.as_str())
                                                .map(|p| portable_file_name(p).to_string());
                                            filename.map(|f| format!("ip_archived/{}/{}", ip_path, f))
                                        } else if change.table == "ip_sticker_packs" {
                                            let ip_id = json.get("ip_id").and_then(|v| v.as_str()).unwrap_or_default();
                                            let ip_path = pulled_ip_paths
                                                .get(ip_id)
                                                .cloned()
                                                .or_else(|| {
                                                    db_conn.query_row("SELECT path FROM ip_assets WHERE id = ?", rusqlite::params![ip_id], |row| row.get(0)).ok()
                                                })
                                                .unwrap_or_else(|| ip_id.to_string());
                                            let pack_path = json.get("path").and_then(|v| v.as_str()).unwrap_or("unknown");
                                            let filename = json.get(path_key)
                                                .and_then(|v| v.as_str())
                                                .map(|p| portable_file_name(p).to_string());
                                            filename.map(|f| format!("ip_archived/{}/packs/{}/{}", ip_path, pack_path, f))
                                        } else if change.table == "ip_emojis" {
                                            let ip_id = json.get("ip_id").and_then(|v| v.as_str()).unwrap_or_default();
                                            let ip_path = pulled_ip_paths
                                                .get(ip_id)
                                                .cloned()
                                                .or_else(|| {
                                                    db_conn.query_row("SELECT path FROM ip_assets WHERE id = ?", rusqlite::params![ip_id], |row| row.get(0)).ok()
                                                })
                                                .unwrap_or_else(|| ip_id.to_string());
                                            let pack_id_opt = json.get("pack_id").and_then(|v| v.as_str());
                                            let pack_path_opt: Option<String> = if let Some(pid) = pack_id_opt {
                                                pulled_pack_paths
                                                    .get(pid)
                                                    .cloned()
                                                    .or_else(|| {
                                                        db_conn.query_row("SELECT path FROM ip_sticker_packs WHERE id = ?", rusqlite::params![pid], |row| row.get(0)).ok()
                                                    })
                                            } else { None };
                                            let filename = json.get(path_key)
                                                .and_then(|v| v.as_str())
                                                .map(|p| portable_file_name(p).to_string());
                                            
                                            filename.map(|f| {
                                                if let Some(pp) = pack_path_opt {
                                                    format!("ip_archived/{}/emojis/{}/{}", ip_path, pp, f)
                                                } else {
                                                    format!("ip_archived/{}/emojis/{}", ip_path, f)
                                                }
                                            })
                                        } else if change.table == "ip_character_sheets"
                                            || change.table == "ip_creations"
                                        {
                                            let ip_id = json
                                                .get("ip_id")
                                                .and_then(|v| v.as_str())
                                                .unwrap_or_default();
                                            let ip_path = pulled_ip_paths
                                                .get(ip_id)
                                                .cloned()
                                                .or_else(|| {
                                                    db_conn
                                                        .query_row(
                                                            "SELECT path FROM ip_assets WHERE id = ?",
                                                            rusqlite::params![ip_id],
                                                            |row| row.get(0),
                                                        )
                                                        .ok()
                                                })
                                                .unwrap_or_else(|| ip_id.to_string());
                                            let filename = json
                                                .get(path_key)
                                                .and_then(|v| v.as_str())
                                                .map(|p| portable_file_name(p).to_string());
                                            filename.map(|name| {
                                                format!("ip_archived/{}/{}", ip_path, name)
                                            })
                                        } else {
                                            None
                                        };

                                        if let Some(rel_path) = rel_path_normalized {
                                            let local_abs_path = app_root.join(&rel_path);

                                            current += 1;
                                            let _ = app.emit(
                                                "sync-progress",
                                                serde_json::json!({
                                                    "phase": "download",
                                                    "current": current,
                                                    "total": total,
                                                    "path": local_abs_path.to_string_lossy()
                                                }),
                                            );

                                            if let Some(parent) = local_abs_path.parent() {
                                                tokio::fs::create_dir_all(parent).await.map_err(|e| {
                                                    format!(
                                                        "Create directory failed {}: {}",
                                                        parent.display(),
                                                        e
                                                    )
                                                })?;
                                            }

                                            let mut needs_download = true;
                                            if local_abs_path.exists() {
                                                if let Ok(existing) = tokio::fs::read(&local_abs_path).await {
                                                    let mut hasher = Sha256::new();
                                                    hasher.update(&existing);
                                                    let existing_hash = format!("{:x}", hasher.finalize());
                                                    needs_download = existing_hash != hash;
                                                }
                                            }

                                            if needs_download {
                                                if let Err(e) = client
                                                    .download_file(&hash, &local_abs_path)
                                                    .await
                                                {
                                                    eprintln!(
                                                        "[Sync] Download file skipped {}: {}",
                                                        local_abs_path.display(),
                                                        e
                                                    );
                                                    queue_pending_download(
                                                        db_path,
                                                        &hash,
                                                        &local_abs_path,
                                                        change,
                                                        path_key,
                                                    );
                                                    continue;
                                                }
                                            }

                                            let downloaded = match tokio::fs::read(&local_abs_path).await {
                                                Ok(data) => data,
                                                Err(e) => {
                                                    eprintln!(
                                                        "[Sync] Read downloaded file skipped {}: {}",
                                                        local_abs_path.display(),
                                                        e
                                                    );
                                                    queue_pending_download(
                                                        db_path,
                                                        &hash,
                                                        &local_abs_path,
                                                        change,
                                                        path_key,
                                                    );
                                                    continue;
                                                }
                                            };
                                            let mut hasher = Sha256::new();
                                            hasher.update(&downloaded);
                                            let downloaded_hash = format!("{:x}", hasher.finalize());
                                            if downloaded_hash != hash {
                                                eprintln!(
                                                    "[Sync] Hash mismatch skipped {}: expected {} got {}",
                                                    local_abs_path.display(),
                                                    hash,
                                                    downloaded_hash
                                                );
                                                queue_pending_download(
                                                    db_path,
                                                    &hash,
                                                    &local_abs_path,
                                                    change,
                                                    path_key,
                                                );
                                                continue;
                                            }

                                            if let Some(obj) = json.as_object_mut() {
                                                obj.insert(
                                                    path_key.to_string(),
                                                    serde_json::Value::String(
                                                        local_abs_path.to_string_lossy().into_owned(),
                                                    ),
                                                );
                                                updated = true;
                                            }
                                        }
                                    }
                                }
                                if updated {
                                    change.data = Some(serde_json::to_string(&json).unwrap());
                                }
                            }
                        }
                    }
                }

                // 写库应用变更
                {
                    let mut conn = Connection::open(Path::new(db_path))
                        .map_err(|e| format!("打开数据库失败: {}", e))?;

                    let tx = conn.transaction().map_err(|e| format!("启动事务失败: {}", e))?;

                    // 临时移除同步触发器，防止写库时产生循环 changelog
                    let _ = tx.execute_batch(crate::sync::triggers::DROP_TRIGGERS);

                    let mut applied = 0usize;
                    for change in &resp.changes {
                        let result = match (change.table.as_str(), change.operation.as_str()) {
                            ("ip_assets", "INSERT") | ("ip_assets", "UPDATE") => {
                                if let Some(data_str) = &change.data {
                                    if let Ok(json) =
                                        parse_sync_json(data_str)
                                    {
                                        let id = json
                                            .get("id")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let name = json
                                            .get("name")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let path = json
                                            .get("path")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let avatar_path: Option<String> = json
                                            .get("avatar_path")
                                            .and_then(|v| v.as_str())
                                            .map(String::from);
                                        let inspiration: Option<String> = json
                                            .get("inspiration")
                                            .and_then(|v| v.as_str())
                                            .map(String::from);
                                        let description: Option<String> = json
                                            .get("description")
                                            .and_then(|v| v.as_str())
                                            .map(String::from);
                                        let created_at = json
                                            .get("created_at")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let updated_at = json
                                            .get("updated_at")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let res = tx.execute(
                                            "INSERT INTO ip_assets (id, name, path, avatar_path, inspiration, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, path = excluded.path, avatar_path = excluded.avatar_path, inspiration = excluded.inspiration, description = excluded.description, created_at = excluded.created_at, updated_at = excluded.updated_at",
                                            rusqlite::params![id, name, path, avatar_path, inspiration, description, created_at, updated_at],
                                        );
                                        if let Err(ref e) = res {
                                            eprintln!("[Sync] Failed to insert ip_asset: {:?}", e);
                                        }
                                        if res.is_ok() {
                                            let custom_path: Option<String> = tx.query_row(
                                                "SELECT value FROM settings WHERE key = 'customIpArchivedPath'",
                                                [],
                                                |row| row.get(0),
                                            ).ok();
                                            let library_path = if let Some(ref path_str) = custom_path {
                                                if !path_str.trim().is_empty() {
                                                    std::path::PathBuf::from(path_str)
                                                } else {
                                                    app_root.clone()
                                                }
                                            } else {
                                                app_root.clone()
                                            };
                                            let target_dir = library_path.join("ip_archived").join(path);
                                            let _ = std::fs::create_dir_all(&target_dir);
                                        }
                                        res.ok()
                                    } else {
                                        None
                                    }
                                } else {
                                    None
                                }
                            }
                            ("ip_assets", "DELETE") => {
                                        let asset_info: Option<(String, Option<String>)> = tx.query_row(
                                            "SELECT path, avatar_path FROM ip_assets WHERE id = ?",
                                            rusqlite::params![change.record_id],
                                            |row| Ok((row.get(0)?, row.get(1)?)),
                                        ).ok();
                                        
                                        if let Some((p, avatar_opt)) = asset_info {
                                            if let Some(avatar_path) = avatar_opt {
                                                let _ = std::fs::remove_file(&avatar_path);
                                            }
                                            let custom_path: Option<String> = tx.query_row(
                                                "SELECT value FROM settings WHERE key = 'customIpArchivedPath'",
                                                [],
                                                |row| row.get(0),
                                            ).ok();
                                            let library_path = if let Some(ref path_str) = custom_path {
                                                if !path_str.trim().is_empty() {
                                                    std::path::PathBuf::from(path_str)
                                                } else {
                                                    app_root.clone()
                                                }
                                            } else {
                                                app_root.clone()
                                            };
                                            let target_dir = library_path.join("ip_archived").join(p);
                                            // Only attempt to remove the directory if it's empty
                                            let _ = std::fs::remove_dir(&target_dir);
                                        }
                                        tx.execute(
                                            "DELETE FROM ip_assets WHERE id = ?",
                                            rusqlite::params![change.record_id],
                                        )
                                        .ok()
                                    }
                            ("ip_images", "INSERT") | ("ip_images", "UPDATE") => {
                                if let Some(data_str) = &change.data {
                                    if let Ok(json) =
                                        parse_sync_json(data_str)
                                    {
                                        let id = json
                                            .get("id")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let filename = json
                                            .get("filename")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let original_filename: Option<String> = json
                                            .get("original_filename")
                                            .and_then(|v| v.as_str())
                                            .map(String::from);
                                        let relative_path = json
                                            .get("relative_path")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let mut absolute_path = json
                                            .get("absolute_path")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default()
                                            .to_string();

                                        let custom_path: Option<String> = tx.query_row(
                                            "SELECT value FROM settings WHERE key = 'custom_library_path'",
                                            [],
                                            |row| row.get(0),
                                        ).ok();
                                        let library_path = if let Some(ref path_str) = custom_path {
                                            if !path_str.trim().is_empty() {
                                                std::path::PathBuf::from(path_str)
                                            } else {
                                                app_root.clone()
                                            }
                                        } else {
                                            app_root.clone()
                                        };
                                        if !relative_path.is_empty() {
                                            absolute_path = library_path.join(relative_path).to_string_lossy().to_string();
                                        }
                                        let ip_id = json
                                            .get("ip_id")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let status = json
                                            .get("status")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("inbox");
                                        let file_size: i64 = json
                                            .get("file_size")
                                            .and_then(|v| v.as_i64())
                                            .unwrap_or(0);
                                        let width: i64 =
                                            json.get("width").and_then(|v| v.as_i64()).unwrap_or(0);
                                        let height: i64 = json
                                            .get("height")
                                            .and_then(|v| v.as_i64())
                                            .unwrap_or(0);
                                        let file_hash: Option<String> = json
                                            .get("file_hash")
                                            .and_then(|v| v.as_str())
                                            .map(String::from);
                                        let format: Option<String> = json
                                            .get("format")
                                            .and_then(|v| v.as_str())
                                            .map(String::from);
                                        let has_watermark: i64 = json
                                            .get("has_watermark")
                                            .and_then(|v| v.as_i64())
                                            .unwrap_or(0);
                                        let watermark_platform: Option<String> = json
                                            .get("watermark_platform")
                                            .and_then(|v| v.as_str())
                                            .map(String::from);
                                        let watermark_detected: i64 = json
                                            .get("watermark_detected")
                                            .and_then(|v| v.as_i64())
                                            .unwrap_or(0);
                                        let watermark_removed: i64 = json
                                            .get("watermark_removed")
                                            .and_then(|v| v.as_i64())
                                            .unwrap_or(0);
                                        let created_at = json
                                            .get("created_at")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let imported_at: Option<String> = json
                                            .get("imported_at")
                                            .and_then(|v| v.as_str())
                                            .map(String::from);
                                        let archived_at: Option<String> = json
                                            .get("archived_at")
                                            .and_then(|v| v.as_str())
                                            .map(String::from);
                                        let res = tx.execute(
                                            "INSERT INTO ip_images (id, filename, original_filename, ip_id, relative_path, absolute_path, status, file_size, width, height, file_hash, format, has_watermark, watermark_platform, watermark_detected, watermark_removed, created_at, imported_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET filename = excluded.filename, original_filename = excluded.original_filename, ip_id = excluded.ip_id, relative_path = excluded.relative_path, absolute_path = excluded.absolute_path, status = excluded.status, file_size = excluded.file_size, width = excluded.width, height = excluded.height, file_hash = excluded.file_hash, format = excluded.format, has_watermark = excluded.has_watermark, watermark_platform = excluded.watermark_platform, watermark_detected = excluded.watermark_detected, watermark_removed = excluded.watermark_removed, created_at = excluded.created_at, imported_at = excluded.imported_at, archived_at = excluded.archived_at",
                                            rusqlite::params![id, filename, original_filename, ip_id, relative_path, absolute_path, status, file_size, width, height, file_hash, format, has_watermark, watermark_platform, watermark_detected, watermark_removed, created_at, imported_at, archived_at],
                                        );
                                        if let Err(ref e) = res {
                                            eprintln!("[Sync] Failed to insert ip_image: {:?}", e);
                                        }
                                        res.ok()
                                    } else {
                                        None
                                    }
                                } else {
                                    None
                                }
                            }
                            ("ip_images", "DELETE") => {
                                        let path: Option<String> = tx.query_row(
                                            "SELECT absolute_path FROM ip_images WHERE id = ?",
                                            rusqlite::params![change.record_id],
                                            |row| row.get(0),
                                        ).ok();
                                        if let Some(p) = path {
                                            if p.contains("ip_archived") {
                                                let _ = std::fs::remove_file(&p);
                                            }
                                        }
                                        tx.execute(
                                            "DELETE FROM ip_images WHERE id = ?",
                                            rusqlite::params![change.record_id],
                                        )
                                        .ok()
                                    }
                            ("ip_character_sheets", "INSERT")
                            | ("ip_character_sheets", "UPDATE") => {
                                if let Some(data_str) = &change.data {
                                    if let Ok(json) = parse_sync_json(data_str) {
                                        let id = json
                                            .get("id")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let ip_id = json
                                            .get("ip_id")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let image_path = json
                                            .get("image_path")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let sheet_type = json
                                            .get("sheet_type")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let sort_order = json
                                            .get("sort_order")
                                            .and_then(|v| v.as_i64())
                                            .unwrap_or(0);
                                        let created_at = json
                                            .get("created_at")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        tx.execute(
                                            "INSERT INTO ip_character_sheets (id, ip_id, image_path, sheet_type, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET ip_id = excluded.ip_id, image_path = excluded.image_path, sheet_type = excluded.sheet_type, sort_order = excluded.sort_order, created_at = excluded.created_at",
                                            rusqlite::params![id, ip_id, image_path, sheet_type, sort_order, created_at],
                                        )
                                        .ok()
                                    } else {
                                        None
                                    }
                                } else {
                                    None
                                }
                            }
                            ("ip_character_sheets", "DELETE") => {
                                let path = tx
                                    .query_row(
                                        "SELECT image_path FROM ip_character_sheets WHERE id = ?",
                                        rusqlite::params![change.record_id],
                                        |row| row.get::<_, String>(0),
                                    )
                                    .ok();
                                if let Some(path) = path {
                                    if path.contains("ip_archived") {
                                        let _ = std::fs::remove_file(path);
                                    }
                                }
                                tx.execute(
                                    "DELETE FROM ip_character_sheets WHERE id = ?",
                                    rusqlite::params![change.record_id],
                                )
                                .ok()
                            }
                            ("ip_creations", "INSERT") | ("ip_creations", "UPDATE") => {
                                if let Some(data_str) = &change.data {
                                    if let Ok(json) = parse_sync_json(data_str) {
                                        let ip_id = json
                                            .get("ip_id")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let image_path = json
                                            .get("image_path")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let creation_name = json
                                            .get("creation_name")
                                            .and_then(|v| v.as_str())
                                            .map(String::from);
                                        let created_at = json
                                            .get("created_at")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        tx.execute(
                                            "INSERT INTO ip_creations (ip_id, image_path, creation_name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(ip_id, image_path) DO UPDATE SET creation_name = excluded.creation_name, created_at = excluded.created_at",
                                            rusqlite::params![ip_id, image_path, creation_name, created_at],
                                        )
                                        .ok()
                                    } else {
                                        None
                                    }
                                } else {
                                    None
                                }
                            }
                            ("ip_creations", "DELETE") => {
                                let keys = change
                                    .data
                                    .as_deref()
                                    .and_then(|data| parse_sync_json(data).ok())
                                    .and_then(|json| {
                                        Some((
                                            json.get("ip_id")?.as_str()?.to_string(),
                                            portable_file_name(
                                                json.get("image_path")?.as_str()?,
                                            )
                                            .to_string(),
                                        ))
                                    })
                                    .or_else(|| {
                                        split_creation_record_id(&change.record_id).map(
                                            |(ip_id, file_name)| {
                                                (ip_id.to_string(), file_name.to_string())
                                            },
                                        )
                                    });
                                if let Some((ip_id, file_name)) = keys {
                                    let existing_path = tx
                                        .prepare(
                                            "SELECT image_path FROM ip_creations WHERE ip_id = ?",
                                        )
                                        .and_then(|mut stmt| {
                                            let paths = stmt.query_map(
                                                rusqlite::params![ip_id],
                                                |row| row.get::<_, String>(0),
                                            )?;
                                            for path in paths {
                                                let path = path?;
                                                if portable_file_name(&path) == file_name {
                                                    return Ok(Some(path));
                                                }
                                            }
                                            Ok(None)
                                        })
                                        .ok()
                                        .flatten();
                                    if let Some(image_path) = existing_path {
                                        let result = tx
                                            .execute(
                                                "DELETE FROM ip_creations WHERE ip_id = ? AND image_path = ?",
                                                rusqlite::params![ip_id, image_path],
                                            )
                                            .ok();
                                        if image_path.contains("ip_archived") {
                                            let _ = std::fs::remove_file(&image_path);
                                        }
                                        result
                                    } else {
                                        Some(0)
                                    }
                                } else {
                                    None
                                }
                            }
                            ("ip_sticker_packs", "INSERT") | ("ip_sticker_packs", "UPDATE") => {
                                if let Some(data_str) = &change.data {
                                    if let Ok(json) = parse_sync_json(data_str) {
                                        let id = json.get("id").and_then(|v| v.as_str()).unwrap_or_default();
                                        let ip_id = json.get("ip_id").and_then(|v| v.as_str()).unwrap_or_default();
                                        let name = json.get("name").and_then(|v| v.as_str()).unwrap_or_default();
                                        let path = json.get("path").and_then(|v| v.as_str()).unwrap_or_default();
                                        let description = json.get("description").and_then(|v| v.as_str()).map(String::from);
                                        let cover_path = json.get("cover_path").and_then(|v| v.as_str()).map(String::from);
                                        let banner_path = json.get("banner_path").and_then(|v| v.as_str()).map(String::from);
                                        let icon_path = json.get("icon_path").and_then(|v| v.as_str()).map(String::from);
                                        let reward_guide_path = json.get("reward_guide_path").and_then(|v| v.as_str()).map(String::from);
                                        let reward_thanks_path = json.get("reward_thanks_path").and_then(|v| v.as_str()).map(String::from);
                                        let created_at = json.get("created_at").and_then(|v| v.as_str()).unwrap_or_default();
                                        let updated_at = json.get("updated_at").and_then(|v| v.as_str()).unwrap_or_default();
                                        tx.execute(
                                            "INSERT INTO ip_sticker_packs (id, ip_id, name, path, description, cover_path, banner_path, icon_path, reward_guide_path, reward_thanks_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET ip_id = excluded.ip_id, name = excluded.name, path = excluded.path, description = excluded.description, cover_path = excluded.cover_path, banner_path = excluded.banner_path, icon_path = excluded.icon_path, reward_guide_path = excluded.reward_guide_path, reward_thanks_path = excluded.reward_thanks_path, created_at = excluded.created_at, updated_at = excluded.updated_at",
                                            rusqlite::params![id, ip_id, name, path, description, cover_path, banner_path, icon_path, reward_guide_path, reward_thanks_path, created_at, updated_at],
                                        ).ok()
                                    } else { None }
                                } else { None }
                            }
                            ("ip_sticker_packs", "DELETE") => {
                                tx.execute("DELETE FROM ip_sticker_packs WHERE id = ?", rusqlite::params![change.record_id]).ok()
                            }
                            ("ip_sticker_pack_platforms", "INSERT") | ("ip_sticker_pack_platforms", "UPDATE") => {
                                if let Some(data_str) = &change.data {
                                    if let Ok(json) = parse_sync_json(data_str) {
                                        let id = json.get("id").and_then(|v| v.as_str()).unwrap_or_default();
                                        let pack_id = json.get("pack_id").and_then(|v| v.as_str()).unwrap_or_default();
                                        let platform_name = json.get("platform_name").and_then(|v| v.as_str()).unwrap_or_default();
                                        let pack_name_on_platform = json.get("pack_name_on_platform").and_then(|v| v.as_str()).map(String::from);
                                        let emoji_size_spec = json.get("emoji_size_spec").and_then(|v| v.as_str()).map(String::from);
                                        let status = json.get("status").and_then(|v| v.as_str()).unwrap_or("draft");
                                        let publish_url = json.get("publish_url").and_then(|v| v.as_str()).map(String::from);
                                        let downloads_count = json.get("downloads_count").and_then(|v| v.as_i64()).unwrap_or(0);
                                        let updated_at = json.get("updated_at").and_then(|v| v.as_str()).unwrap_or_default();
                                        tx.execute(
                                            "INSERT OR REPLACE INTO ip_sticker_pack_platforms (id, pack_id, platform_name, pack_name_on_platform, emoji_size_spec, status, publish_url, downloads_count, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                            rusqlite::params![id, pack_id, platform_name, pack_name_on_platform, emoji_size_spec, status, publish_url, downloads_count, updated_at],
                                        ).ok()
                                    } else { None }
                                } else { None }
                            }
                            ("ip_sticker_pack_platforms", "DELETE") => {
                                tx.execute("DELETE FROM ip_sticker_pack_platforms WHERE id = ?", rusqlite::params![change.record_id]).ok()
                            }
                            ("ip_emojis", "INSERT") | ("ip_emojis", "UPDATE") => {
                                if let Some(data_str) = &change.data {
                                    if let Ok(json) = parse_sync_json(data_str) {
                                        let id = json.get("id").and_then(|v| v.as_str()).unwrap_or_default();
                                        let ip_id = json.get("ip_id").and_then(|v| v.as_str()).unwrap_or_default();
                                        let pack_id = json.get("pack_id").and_then(|v| v.as_str()).map(String::from);
                                        let mut image_path = json.get("image_path").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                                        
                                        let custom_path: Option<String> = tx.query_row(
                                            "SELECT value FROM settings WHERE key = 'custom_library_path'",
                                            [],
                                            |row| row.get(0),
                                        ).ok();
                                        let library_path = if let Some(ref path_str) = custom_path {
                                            if !path_str.trim().is_empty() { std::path::PathBuf::from(path_str) } else { app_root.clone() }
                                        } else { app_root.clone() };
                                        
                                        if let Some(idx) = image_path.find("ip_archived") {
                                            let rel = &image_path[idx..];
                                            image_path = library_path.join(rel).to_string_lossy().to_string();
                                        }
                                        let trigger_word = json.get("trigger_word").and_then(|v| v.as_str()).map(String::from);
                                        let sort_order = json.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(0);
                                        let created_at = json.get("created_at").and_then(|v| v.as_str()).unwrap_or_default();
                                        tx.execute(
                                            "INSERT OR REPLACE INTO ip_emojis (id, ip_id, pack_id, image_path, trigger_word, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                                            rusqlite::params![id, ip_id, pack_id, image_path, trigger_word, sort_order, created_at],
                                        ).ok()
                                    } else { None }
                                } else { None }
                            }
                            ("ip_emojis", "DELETE") => {
                                let path: Option<String> = tx.query_row("SELECT image_path FROM ip_emojis WHERE id = ?", rusqlite::params![change.record_id], |row| row.get(0)).ok();
                                if let Some(p) = path {
                                    if p.contains("ip_archived") {
                                        let _ = std::fs::remove_file(&p);
                                    }
                                }
                                tx.execute("DELETE FROM ip_emojis WHERE id = ?", rusqlite::params![change.record_id]).ok()
                            }
                            ("ip_relations", "INSERT") | ("ip_relations", "UPDATE") => {
                                if let Some(data_str) = &change.data {
                                    if let Ok(json) = parse_sync_json(data_str) {
                                        let ip_a_id = json
                                            .get("ip_a_id")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let ip_b_id = json
                                            .get("ip_b_id")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let relation_type = json
                                            .get("relation_type")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let description = json
                                            .get("description")
                                            .and_then(|v| v.as_str())
                                            .map(String::from);
                                        let created_at = json
                                            .get("created_at")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        tx.execute(
                                            "INSERT INTO ip_relations (ip_a_id, ip_b_id, relation_type, description, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(ip_a_id, ip_b_id, relation_type) DO UPDATE SET description = excluded.description, created_at = excluded.created_at",
                                            rusqlite::params![ip_a_id, ip_b_id, relation_type, description, created_at],
                                        )
                                        .ok()
                                    } else {
                                        None
                                    }
                                } else {
                                    None
                                }
                            }
                            ("ip_relations", "DELETE") => {
                                let keys = change
                                    .data
                                    .as_deref()
                                    .and_then(|data| parse_sync_json(data).ok())
                                    .and_then(|json| {
                                        Some((
                                            json.get("ip_a_id")?.as_str()?.to_string(),
                                            json.get("ip_b_id")?.as_str()?.to_string(),
                                            json.get("relation_type")?.as_str()?.to_string(),
                                        ))
                                    })
                                    .or_else(|| {
                                        let mut parts = change.record_id.splitn(3, '|');
                                        Some((
                                            parts.next()?.to_string(),
                                            parts.next()?.to_string(),
                                            parts.next()?.to_string(),
                                        ))
                                    });
                                if let Some((ip_a_id, ip_b_id, relation_type)) = keys {
                                    tx.execute(
                                        "DELETE FROM ip_relations WHERE ip_a_id = ? AND ip_b_id = ? AND relation_type = ?",
                                        rusqlite::params![ip_a_id, ip_b_id, relation_type],
                                    )
                                    .ok()
                                } else {
                                    None
                                }
                            }
                            ("ip_image_relations", "INSERT") | ("ip_image_relations", "UPDATE") => {
                                if let Some(data_str) = &change.data {
                                    if let Ok(json) = parse_sync_json(data_str) {
                                        let ip_image_id = json.get("ip_image_id").and_then(|v| v.as_str()).unwrap_or_default();
                                        let ip_id = json.get("ip_id").and_then(|v| v.as_str()).unwrap_or_default();
                                        let is_primary = json.get("is_primary").and_then(|v| v.as_i64()).unwrap_or(0);
                                        tx.execute(
                                            "INSERT INTO ip_image_relations (ip_image_id, ip_id, is_primary) VALUES (?, ?, ?) ON CONFLICT(ip_image_id, ip_id) DO UPDATE SET is_primary = excluded.is_primary",
                                            rusqlite::params![ip_image_id, ip_id, is_primary],
                                        ).ok()
                                    } else { None }
                                } else { None }
                            }
                            ("ip_image_relations", "DELETE") => {
                                if let Some((ip_image_id, ip_id)) =
                                    change_pair(change, "ip_image_id", "ip_id")
                                {
                                    tx.execute(
                                        "DELETE FROM ip_image_relations WHERE ip_image_id = ? AND ip_id = ?",
                                        rusqlite::params![ip_image_id, ip_id],
                                    ).ok()
                                } else { None }
                            }
                            ("ip_image_tag_relations", "INSERT") | ("ip_image_tag_relations", "UPDATE") => {
                                if let Some(data_str) = &change.data {
                                    if let Ok(json) = parse_sync_json(data_str) {
                                        let ip_image_id = json.get("ip_image_id").and_then(|v| v.as_str()).unwrap_or_default();
                                        let tag_id = json.get("tag_id").and_then(|v| v.as_str()).unwrap_or_default();
                                        tx.execute(
                                            "INSERT OR IGNORE INTO ip_image_tag_relations (ip_image_id, tag_id) VALUES (?, ?)",
                                            rusqlite::params![ip_image_id, tag_id],
                                        ).ok()
                                    } else { None }
                                } else { None }
                            }
                            ("ip_image_tag_relations", "DELETE") => {
                                if let Some((ip_image_id, tag_id)) =
                                    change_pair(change, "ip_image_id", "tag_id")
                                {
                                    tx.execute(
                                        "DELETE FROM ip_image_tag_relations WHERE ip_image_id = ? AND tag_id = ?",
                                        rusqlite::params![ip_image_id, tag_id],
                                    ).ok()
                                } else { None }
                            }
                            ("tags", "INSERT") | ("tags", "UPDATE") => {
                                if let Some(data_str) = &change.data {
                                    if let Ok(json) = parse_sync_json(data_str) {
                                        let id = json.get("id").and_then(|v| v.as_str()).unwrap_or_default();
                                        let name = json.get("name").and_then(|v| v.as_str()).unwrap_or_default();
                                        let name_en = json.get("name_en").and_then(|v| v.as_str()).map(String::from);
                                        let color = json.get("color").and_then(|v| v.as_str()).map(String::from);
                                        let parent_id = json.get("parent_id").and_then(|v| v.as_str()).map(String::from);
                                        let use_count = json.get("use_count").and_then(|v| v.as_i64()).unwrap_or(0);
                                        let is_builtin = json.get("is_builtin").and_then(|v| v.as_i64()).unwrap_or(0);
                                        let created_at = json.get("created_at").and_then(|v| v.as_str()).unwrap_or_default();
                                        tx.execute(
                                            "INSERT INTO tags (id, name, name_en, color, parent_id, use_count, is_builtin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, name_en = excluded.name_en, color = excluded.color, parent_id = excluded.parent_id, use_count = excluded.use_count, is_builtin = excluded.is_builtin, created_at = excluded.created_at",
                                            rusqlite::params![id, name, name_en, color, parent_id, use_count, is_builtin, created_at],
                                        ).ok()
                                    } else { None }
                                } else { None }
                            }
                            ("tags", "DELETE") => {
                                tx.execute(
                                    "DELETE FROM tags WHERE id = ?",
                                    rusqlite::params![change.record_id],
                                ).ok()
                            }
                            _ => None,
                        };
                        if result.is_some() {
                            applied += 1;
                        }
                    }

                    crate::sync::cursor::ensure_complete_pull(applied, resp.changes.len())?;

                    // Recreate sync triggers after applying remote changes.
                    tx.execute_batch(crate::sync::triggers::SYNC_TRIGGERS)
                        .map_err(|e| format!("恢复同步触发器失败: {}", e))?;

                    if tx.commit().is_ok() {
                        pulled_count = applied;
                        // Only advance cursor after successful commit
                        if resp.latest_version > current_version {
                            let cursor_conn = Connection::open(Path::new(db_path)).unwrap();
                            let _ = cursor_conn.execute("INSERT OR REPLACE INTO sync_config (key, value) VALUES ('last_sync_version', ?)", rusqlite::params![resp.latest_version.to_string()]);
                        }
                    } else {
                        return Err("本地数据库应用拉取变更失败，事务已回滚".to_string());
                    }
                }
            }
        }
        Err(e) => return Err(format!("拉取失败: {}", e)),
    }
    } // End of should_pull

    let mut pushed_inserts = 0;
    let mut pushed_updates = 0;
    let mut pushed_deletes = 0;

    // 只有在成功推送到服务器并且清理了本地 changelog 的情况下，才统计这些具体明细
    // (pushed_count 表示服务器成功应用的条数，如果它大于0，或者哪怕是假数据，我们也根据本地的 changes 列表给出明细)
    if pushed_count > 0 || !changes.is_empty() {
        for change in &changes {
            match change.operation.as_str() {
                "INSERT" => pushed_inserts += 1,
                "UPDATE" => pushed_updates += 1,
                "DELETE" => pushed_deletes += 1,
                _ => {}
            }
        }
    }

    Ok(serde_json::json!({
        "status": "success",
        "pushed": pushed_count,
        "pulled": pulled_count,
        "recovered_missing_records": recovered_missing_records,
        "pushed_details": {
            "inserts": pushed_inserts,
            "updates": pushed_updates,
            "deletes": pushed_deletes
        }
    }))
}
