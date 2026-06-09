use crate::sync::client::{PushRequest, SyncChange, SyncClient};
use rusqlite::Connection;
use sha2::{Digest, Sha256};
use std::path::Path;
use tauri::Emitter;
use uuid::Uuid;

pub async fn run_sync(db_path: &str, app: &tauri::AppHandle) -> Result<serde_json::Value, String> {
    // 1. 读库，收集待推送的变更（放入独立的代码块中，确保 Connection 及时被释放）
    let (server_url, api_key, device_id, last_sync_version, pending_ids, mut changes) = {
        let conn =
            Connection::open(Path::new(db_path)).map_err(|e| format!("打开数据库失败: {}", e))?;

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

    // 1.5 提取需要上传的文件
    let mut file_hashes_to_check = Vec::new();
    let mut files_to_upload = Vec::new(); // (hash, absolute_path, i)

    for (i, change) in changes.iter_mut().enumerate() {
        if (change.table == "images" || change.table == "ip_assets" || change.table == "ip_images")
            && change.operation != "DELETE"
        {
            if let Some(data_str) = &change.data {
                if let Ok(mut json) = serde_json::from_str::<serde_json::Value>(data_str) {
                    if let Some(abs_path) = json
                        .get("absolute_path")
                        .and_then(|v| v.as_str())
                        .map(String::from)
                    {
                        if let Ok(data) = tokio::fs::read(&abs_path).await {
                            let mut hasher = Sha256::new();
                            hasher.update(&data);
                            let hash = format!("{:x}", hasher.finalize());

                            file_hashes_to_check.push(hash.clone());
                            files_to_upload.push((hash.clone(), abs_path, i));

                            // 更新 json 里的 file_hash，确保推送给服务端的是有哈希的数据
                            if let Some(obj) = json.as_object_mut() {
                                obj.insert(
                                    "file_hash".to_string(),
                                    serde_json::Value::String(hash.clone()),
                                );
                                change.data = Some(serde_json::to_string(&json).unwrap());
                            }
                        }
                    }
                }
            }
        }
    }

    if !file_hashes_to_check.is_empty() {
        if let Ok(missing_hashes) = client.check_files(file_hashes_to_check).await {
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
                    let _ = client.upload_file(&abs_path).await; // 忽略单个失败，尽量传
                }
            }
        }
    }

    if !changes.is_empty() {
        let req = PushRequest {
            device_id: device_id.clone(),
            changes: changes.clone(),
        };
        match client.push(req).await {
            // <--- 这是一个 .await 点
            Ok(resp) => {
                pushed_count = resp.applied_count;
                new_server_version = resp.server_version;

                // 写库清理已推送日志
                let conn = Connection::open(Path::new(db_path)).unwrap();
                for id in pending_ids {
                    let _ = conn.execute(
                        "DELETE FROM sync_changelog WHERE id = ?",
                        rusqlite::params![id],
                    );
                }
                let _ = conn.execute("INSERT OR REPLACE INTO sync_config (key, value) VALUES ('last_sync_version', ?)", rusqlite::params![new_server_version.to_string()]);
            }
            Err(e) => return Err(format!("推送失败: {}", e)),
        }
    }

    // 3. Pull 服务器变更
    let mut pulled_count = 0;

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

    match client.pull(current_version).await {
        // <--- 又一个 .await 点
        Ok(mut resp) => {
            if !resp.changes.is_empty() {
                let total = resp.changes.len();
                let mut current = 0;

                // 下载文件并修正 absolute_path
                for change in &mut resp.changes {
                    if (change.table == "images"
                        || change.table == "ip_assets"
                        || change.table == "ip_images")
                        && change.operation != "DELETE"
                    {
                        if let Some(data_str) = &change.data {
                            if let Ok(mut json) =
                                serde_json::from_str::<serde_json::Value>(data_str)
                            {
                                if let (Some(hash), Some(rel_path)) = (
                                    json.get("file_hash")
                                        .and_then(|v| v.as_str())
                                        .map(String::from),
                                    json.get("relative_path").and_then(|v| v.as_str()),
                                ) {
                                    let rel_path_normalized = rel_path.replace("\\", "/");
                                    let local_abs_path = app_root.join(&rel_path_normalized);

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
                                        if let Err(e) = tokio::fs::create_dir_all(parent).await {
                                            eprintln!("[Sync] Failed to create directory {}: {}", parent.display(), e);
                                        }
                                    }

                                    if !local_abs_path.exists() {
                                        if let Err(e) = client.download_file(&hash, &local_abs_path).await {
                                            eprintln!("[Sync] Failed to download file to {}: {}", local_abs_path.display(), e);
                                        }
                                    }

                                    if let Some(obj) = json.as_object_mut() {
                                        obj.insert(
                                            "absolute_path".to_string(),
                                            serde_json::Value::String(
                                                local_abs_path.to_string_lossy().into_owned(),
                                            ),
                                        );
                                        change.data = Some(serde_json::to_string(&json).unwrap());
                                    }
                                }
                            }
                        }
                    }
                }

                // 写库应用变更
                {
                    let conn = Connection::open(Path::new(db_path))
                        .map_err(|e| format!("打开数据库失败: {}", e))?;

                    // 临时移除同步触发器，防止写库时产生循环 changelog
                    let _ = conn.execute_batch(crate::sync::triggers::DROP_TRIGGERS);

                    let mut applied = 0usize;
                    for change in &resp.changes {
                        let result = match (change.table.as_str(), change.operation.as_str()) {
                            ("ip_assets", "INSERT") | ("ip_assets", "UPDATE") => {
                                if let Some(data_str) = &change.data {
                                    if let Ok(json) =
                                        serde_json::from_str::<serde_json::Value>(data_str)
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
                                        conn.execute(
                                            "INSERT OR REPLACE INTO ip_assets (id, name, path, avatar_path, inspiration, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                                            rusqlite::params![id, name, path, avatar_path, inspiration, description, created_at, updated_at],
                                        ).ok()
                                    } else {
                                        None
                                    }
                                } else {
                                    None
                                }
                            }
                            ("ip_assets", "DELETE") => conn
                                .execute(
                                    "DELETE FROM ip_assets WHERE id = ?",
                                    rusqlite::params![change.record_id],
                                )
                                .ok(),
                            ("ip_images", "INSERT") | ("ip_images", "UPDATE") => {
                                if let Some(data_str) = &change.data {
                                    if let Ok(json) =
                                        serde_json::from_str::<serde_json::Value>(data_str)
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
                                        let watermark_detected: Option<String> = json
                                            .get("watermark_detected")
                                            .and_then(|v| v.as_str())
                                            .map(String::from);
                                        let watermark_removed: Option<String> = json
                                            .get("watermark_removed")
                                            .and_then(|v| v.as_str())
                                            .map(String::from);
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
                                        conn.execute(
                                            "INSERT OR REPLACE INTO ip_images (id, filename, original_filename, ip_id, relative_path, absolute_path, status, file_size, width, height, file_hash, format, has_watermark, watermark_platform, watermark_detected, watermark_removed, created_at, imported_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                            rusqlite::params![id, filename, original_filename, ip_id, relative_path, absolute_path, status, file_size, width, height, file_hash, format, has_watermark, watermark_platform, watermark_detected, watermark_removed, created_at, imported_at, archived_at],
                                        ).ok()
                                    } else {
                                        None
                                    }
                                } else {
                                    None
                                }
                            }
                            ("ip_images", "DELETE") => conn
                                .execute(
                                    "DELETE FROM ip_images WHERE id = ?",
                                    rusqlite::params![change.record_id],
                                )
                                .ok(),
                            _ => None,
                        };
                        if result.is_some() {
                            applied += 1;
                        }
                    }

                    // 重新创建同步触发器
                    let _ = conn.execute_batch(crate::sync::triggers::SYNC_TRIGGERS);

                    pulled_count = applied;
                }
            }
            if resp.latest_version > current_version {
                let conn = Connection::open(Path::new(db_path)).unwrap();
                let _ = conn.execute("INSERT OR REPLACE INTO sync_config (key, value) VALUES ('last_sync_version', ?)", rusqlite::params![resp.latest_version.to_string()]);
            }
        }
        Err(e) => return Err(format!("拉取失败: {}", e)),
    }

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
