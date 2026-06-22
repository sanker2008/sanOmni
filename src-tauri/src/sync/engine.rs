use crate::sync::client::{
    PushRequest, SyncChange, SyncClient, SANIP_SYNC_DOMAIN, SYNC_PROTOCOL_VERSION,
};
use rusqlite::Connection;
use sha2::{Digest, Sha256};
use std::path::Path;
use tauri::Emitter;
use uuid::Uuid;

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

    let client = SyncClient::new(server_url, api_key);

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
        if (change.table == "ip_assets" || change.table == "ip_images" || change.table == "ip_sticker_packs" || change.table == "ip_emojis") && change.operation != "DELETE" {
            if let Some(data_str) = &change.data {
                if let Ok(mut json) = parse_sync_json(data_str) {
                    let path_hash_keys = if change.table == "ip_assets" {
                        vec![("avatar_path", "file_hash")]
                    } else if change.table == "ip_images" {
                        vec![("absolute_path", "file_hash")]
                    } else if change.table == "ip_emojis" {
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
                                if let Ok(data) = tokio::fs::read(&abs_path).await {
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
                let _ = conn.execute("INSERT OR REPLACE INTO sync_config (key, value) VALUES ('last_sync_version', ?)", rusqlite::params![new_server_version.to_string()]);
            }
            Err(e) => return Err(format!("推送失败: {}", e)),
        }
    }
    } // End of should_push

    // 3. Pull 服务器变更
    let mut pulled_count = 0;

    if should_pull {
    // 每次重新查一次最新版本号，以防刚才 Push 修改了它
    let current_version = {
        let conn = Connection::open(Path::new(db_path)).unwrap();
        conn.query_row(
            "SELECT value FROM sync_config WHERE key = 'last_sync_version'",
            [],
            |row| {
                let v: String = row.get(0)?;
                Ok(v.parse::<i64>().unwrap_or(0))
            },
        )
        .unwrap_or(new_server_version)
    };

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
                    let update_sql = match table_name.as_str() {
                        "ip_assets" => format!("UPDATE ip_assets SET {} = ? WHERE id = ?", path_key),
                        "ip_images" => format!("UPDATE ip_images SET {} = ? WHERE id = ?", path_key),
                        "ip_sticker_packs" => format!("UPDATE ip_sticker_packs SET {} = ? WHERE id = ?", path_key),
                        "ip_emojis" => format!("UPDATE ip_emojis SET {} = ? WHERE id = ?", path_key),
                        _ => String::new(),
                    };
                    let upd_conn = Connection::open(Path::new(db_path)).unwrap();
                    if !update_sql.is_empty() {
                        let _ = upd_conn.execute_batch(crate::sync::triggers::DROP_TRIGGERS);
                        let _ = upd_conn.execute(&update_sql, rusqlite::params![local_path, record_id]);
                        let _ = upd_conn.execute_batch(crate::sync::triggers::SYNC_TRIGGERS);
                    }
                    let _ = upd_conn.execute("DELETE FROM sync_pending_downloads WHERE id = ?", rusqlite::params![id]);
                    eprintln!("[Sync] Retry download succeeded: {}", local_path);
                }
            }
        }
    }

    match client.pull(current_version).await {
        // <--- 又一个 .await 点
        Ok(mut resp) => {
            if !resp.changes.is_empty() {
                let mut deleted_records = std::collections::HashSet::new();
                for change in &resp.changes {
                    if change.operation == "DELETE" {
                        deleted_records.insert(change.record_id.clone());
                    }
                }
                resp.changes.retain(|change| {
                    if change.operation != "DELETE" && deleted_records.contains(&change.record_id) {
                        false
                    } else {
                        true
                    }
                });

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
                    if (change.table == "ip_assets"
                        || change.table == "ip_images"
                        || change.table == "ip_sticker_packs"
                        || change.table == "ip_emojis")
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
                                                .map(|p| std::path::Path::new(p).file_name().unwrap_or_default().to_string_lossy().into_owned());
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
                                                .map(|p| std::path::Path::new(p).file_name().unwrap_or_default().to_string_lossy().into_owned());
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
                                                .map(|p| std::path::Path::new(p).file_name().unwrap_or_default().to_string_lossy().into_owned());
                                            
                                            filename.map(|f| {
                                                if let Some(pp) = pack_path_opt {
                                                    format!("ip_archived/{}/emojis/{}/{}", ip_path, pp, f)
                                                } else {
                                                    format!("ip_archived/{}/emojis/{}", ip_path, f)
                                                }
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
                                                    // Record for retry on next sync
                                                    if let Ok(pconn) = Connection::open(Path::new(db_path)) {
                                                        let _ = pconn.execute(
                                                            "INSERT OR IGNORE INTO sync_pending_downloads (file_hash, local_path, table_name, record_id, path_key) VALUES (?, ?, ?, ?, ?)",
                                                            rusqlite::params![hash, local_abs_path.to_string_lossy(), change.table, change.record_id, path_key],
                                                        );
                                                    }
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
                                            "INSERT OR REPLACE INTO ip_assets (id, name, path, avatar_path, inspiration, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
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
                                        let ip_id = json
                                            .get("ip_id")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default();
                                        let relative_path: Option<String> = json
                                            .get("relative_path")
                                            .and_then(|v| v.as_str())
                                            .map(String::from);
                                        let absolute_path: Option<String> = json
                                            .get("absolute_path")
                                            .and_then(|v| v.as_str())
                                            .map(String::from);
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
                                            "INSERT OR REPLACE INTO ip_images (id, filename, original_filename, ip_id, relative_path, absolute_path, status, file_size, width, height, file_hash, format, has_watermark, watermark_platform, watermark_detected, watermark_removed, created_at, imported_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
                                            "INSERT OR REPLACE INTO ip_sticker_packs (id, ip_id, name, path, description, cover_path, banner_path, icon_path, reward_guide_path, reward_thanks_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
                                        let image_path = json.get("image_path").and_then(|v| v.as_str()).unwrap_or_default();
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
                            ("ip_image_relations", "INSERT") | ("ip_image_relations", "UPDATE") => {
                                if let Some(data_str) = &change.data {
                                    if let Ok(json) = parse_sync_json(data_str) {
                                        let ip_image_id = json.get("ip_image_id").and_then(|v| v.as_str()).unwrap_or_default();
                                        let ip_id = json.get("ip_id").and_then(|v| v.as_str()).unwrap_or_default();
                                        let is_primary = json.get("is_primary").and_then(|v| v.as_i64()).unwrap_or(0);
                                        tx.execute(
                                            "INSERT OR IGNORE INTO ip_image_relations (ip_image_id, ip_id, is_primary) VALUES (?, ?, ?)",
                                            rusqlite::params![ip_image_id, ip_id, is_primary],
                                        ).ok()
                                    } else { None }
                                } else { None }
                            }
                            ("ip_image_relations", "DELETE") => {
                                let parts: Vec<&str> = change.record_id.split('_').collect();
                                if parts.len() == 2 {
                                    tx.execute(
                                        "DELETE FROM ip_image_relations WHERE ip_image_id = ? AND ip_id = ?",
                                        rusqlite::params![parts[0], parts[1]],
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
                                let parts: Vec<&str> = change.record_id.split('_').collect();
                                if parts.len() == 2 {
                                    tx.execute(
                                        "DELETE FROM ip_image_tag_relations WHERE ip_image_id = ? AND tag_id = ?",
                                        rusqlite::params![parts[0], parts[1]],
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
                                            "INSERT OR REPLACE INTO tags (id, name, name_en, color, parent_id, use_count, is_builtin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
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

                    // Recreate sync triggers after applying remote changes.
                    let _ = tx.execute_batch(crate::sync::triggers::SYNC_TRIGGERS);

                    if applied != resp.changes.len() {
                        eprintln!(
                            "[Sync] Pull apply partial: applied {} of {} changes (some may have been skipped due to missing data or unknown tables)",
                            applied,
                            resp.changes.len()
                        );
                    }

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
        "pushed_details": {
            "inserts": pushed_inserts,
            "updates": pushed_updates,
            "deletes": pushed_deletes
        }
    }))
}
