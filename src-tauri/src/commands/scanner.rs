use crate::commands::CommandResult;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct ScanResult {
    pub scanned_count: usize,
    pub imported_count: usize,
    pub skipped_count: usize,
    pub renamed_count: usize,
    pub failed_count: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InboxMissingInDbItem {
    pub absolute_path: String,
    pub filename: String,
    pub file_size: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InboxMissingOnDiskItem {
    pub id: String,
    pub absolute_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InboxScanResult {
    pub missing_in_db: Vec<InboxMissingInDbItem>,
    pub missing_on_disk: Vec<InboxMissingOnDiskItem>,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InboxCleanupResult {
    pub removed_count: usize,
    pub failed_count: usize,
    pub errors: Vec<String>,
}

/// 扫描 archived 目录，将未入库的图片重命名后写入数据库（状态直接为 archived）
#[tauri::command]
pub async fn scan_archived_directory(
    db_path: String,
    library_path: String,
    naming_template: Option<String>,
) -> CommandResult<ScanResult> {
    let conn = match Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("无法打开数据库: {}", e)),
    };

    let template = naming_template
        .unwrap_or_else(|| "{vendor}-{model}-{date}-{index}".to_string());

    let archived_root = std::path::Path::new(&library_path);
    if !archived_root.exists() {
        return CommandResult::err(format!(
            "归档目录不存在: {}",
            archived_root.display()
        ));
    }

    let mut result = ScanResult {
        scanned_count: 0,
        imported_count: 0,
        skipped_count: 0,
        renamed_count: 0,
        failed_count: 0,
        errors: Vec::new(),
    };

    // 收集所有已在数据库中的 absolute_path，用于去重
    let existing_paths: std::collections::HashSet<String> = {
        match conn.prepare("SELECT absolute_path FROM images") {
            Ok(mut stmt) => {
                match stmt.query_map([], |row| row.get::<_, String>(0)) {
                    Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
                    Err(_) => std::collections::HashSet::new(),
                }
            }
            Err(e) => return CommandResult::err(format!("查询数据库失败: {}", e)),
        }
    };

    // 遍历 archived/{vendor}/{model}/ 三层目录结构
    let vendor_dirs = match std::fs::read_dir(&archived_root) {
        Ok(d) => d,
        Err(e) => return CommandResult::err(format!("无法读取归档目录: {}", e)),
    };

    // 用于生成 index 的计数器（跨所有目录全局递增）
    let mut global_index: usize = {
        // 从数据库中获取已归档图片数量作为起始 index
        conn.query_row(
            "SELECT COUNT(*) FROM images WHERE status = 'archived'",
            [],
            |row| row.get::<_, usize>(0),
        )
        .unwrap_or(0)
    };

    for vendor_entry in vendor_dirs.flatten() {
        let vendor_dir = vendor_entry.path();
        if !vendor_dir.is_dir() {
            continue;
        }

        let vendor_path_name = vendor_dir
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // 查找数据库中对应的 vendor
        let vendor_id: Option<String> = conn
            .query_row(
                "SELECT id FROM vendors WHERE path = ?",
                [&vendor_path_name],
                |row| row.get(0),
            )
            .ok();

        let model_dirs = match std::fs::read_dir(&vendor_dir) {
            Ok(d) => d,
            Err(_) => continue,
        };

        for model_entry in model_dirs.flatten() {
            let model_dir = model_entry.path();
            if !model_dir.is_dir() {
                continue;
            }

            let model_path_name = model_dir
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            // 查找数据库中对应的 model
            let model_info: Option<(String, String)> = vendor_id.as_ref().and_then(|vid| {
                conn.query_row(
                    "SELECT id, vendor_id FROM models WHERE path = ? AND vendor_id = ?",
                    [&model_path_name, vid.as_str()],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .ok()
            });

            // 如果找不到对应的 vendor/model，使用 unknown
            let (resolved_vendor_id, resolved_model_id) = match &model_info {
                Some((mid, vid)) => (vid.clone(), mid.clone()),
                None => ("unknown".to_string(), "unknown".to_string()),
            };

            // 遍历该目录下的图片文件
            let image_files = match std::fs::read_dir(&model_dir) {
                Ok(d) => d,
                Err(_) => continue,
            };

            for file_entry in image_files.flatten() {
                let file_path = file_entry.path();
                if !file_path.is_file() {
                    continue;
                }

                // 只处理图片文件
                let ext = match file_path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|s| s.to_lowercase())
                {
                    Some(e) if matches!(e.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp") => e,
                    _ => continue,
                };

                result.scanned_count += 1;

                let abs_path_str = file_path.to_string_lossy().to_string();

                // 已在数据库中，跳过
                if existing_paths.contains(&abs_path_str) {
                    result.skipped_count += 1;
                    continue;
                }

                // 获取文件元数据
                let file_size = file_path
                    .metadata()
                    .map(|m| m.len() as i64)
                    .unwrap_or(0);

                let original_filename = file_path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();

                // 生成新文件名（按命名模板）
                global_index += 1;
                let now = chrono::Utc::now();
                let date_str = now.format("%Y-%m-%d").to_string();

                let new_stem = template
                    .replace("{vendor}", &vendor_path_name)
                    .replace("{model}", &model_path_name)
                    .replace("{date}", &date_str)
                    .replace("{index}", &format!("{:03}", global_index))
                    .replace("{original}", &original_filename.replace(&format!(".{}", ext), ""));

                let new_filename = format!("{}.{}", new_stem, ext);

                // 如果文件名已经符合规范（相同），不重命名
                let (final_filename, final_abs_path) = if original_filename == new_filename {
                    (original_filename.clone(), abs_path_str.clone())
                } else {
                    // 重命名文件
                    let new_path = model_dir.join(&new_filename);

                    // 避免目标文件已存在时覆盖
                    let new_path = if new_path.exists() {
                        let unique_stem = format!("{}-{}", new_stem, chrono::Utc::now().timestamp_millis());
                        let unique_name = format!("{}.{}", unique_stem, ext);
                        model_dir.join(&unique_name)
                    } else {
                        new_path
                    };

                    match std::fs::rename(&file_path, &new_path) {
                        Ok(_) => {
                            result.renamed_count += 1;
                            (
                                new_path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                                new_path.to_string_lossy().to_string(),
                            )
                        }
                        Err(e) => {
                            result.failed_count += 1;
                            result.errors.push(format!(
                                "重命名失败 {}: {}",
                                original_filename, e
                            ));
                            continue;
                        }
                    }
                };

                // 构建相对路径
                let relative_path = std::path::Path::new("archived")
                    .join(&vendor_path_name)
                    .join(&model_path_name)
                    .join(&final_filename)
                    .to_string_lossy()
                    .to_string();

                // 生成图片 ID
                let uuid_str = Uuid::new_v4().to_string().replace("-", "");
                let image_id = format!("img_{}", &uuid_str[..12]);
                let now_str = now.to_rfc3339();
                let format_upper = ext.to_uppercase();

                // 写入数据库
                let insert_result = conn.execute(
                    "INSERT INTO images (
                        id, filename, original_filename,
                        storage_vendor_id, storage_model_id,
                        relative_path, absolute_path, primary_model_id,
                        status, file_size, format,
                        has_watermark, watermark_detected, watermark_removed,
                        created_at, imported_at, archived_at
                    ) VALUES (
                        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
                        'archived', ?9, ?10,
                        0, 0, 0,
                        ?11, ?11, ?11
                    )",
                    rusqlite::params![
                        image_id,
                        final_filename,
                        original_filename,
                        resolved_vendor_id,
                        resolved_model_id,
                        relative_path,
                        final_abs_path,
                        resolved_model_id,
                        file_size,
                        format_upper,
                        now_str,
                    ],
                );

                match insert_result {
                    Ok(_) => {
                        // 插入 model 关联
                        let _ = conn.execute(
                            "INSERT OR IGNORE INTO image_model_relations (image_id, model_id, is_primary) VALUES (?, ?, 1)",
                            rusqlite::params![image_id, resolved_model_id],
                        );

                        // 记录处理历史
                        let _ = conn.execute(
                            "INSERT INTO processing_history (image_id, action, status, details, created_at) VALUES (?, 'scan_import', 'success', ?, ?)",
                            rusqlite::params![
                                image_id,
                                format!("扫描导入并重命名: {} -> {}", original_filename, final_filename),
                                now_str,
                            ],
                        );

                        result.imported_count += 1;
                    }
                    Err(e) => {
                        result.failed_count += 1;
                        result.errors.push(format!(
                            "写入数据库失败 {}: {}",
                            final_filename, e
                        ));
                    }
                }
            }
        }
    }

    CommandResult::ok(result)
}

/// 扫描 inbox 目录，返回未入库的文件和已失效的数据库记录
#[tauri::command]
pub async fn scan_inbox_directory(
    db_path: String,
    inbox_path: String,
) -> CommandResult<InboxScanResult> {
    let conn = match Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("无法打开数据库: {}", e)),
    };

    let inbox_root = std::path::Path::new(&inbox_path);
    if !inbox_root.exists() {
        return CommandResult::err(format!(
            "待整理目录不存在: {}",
            inbox_root.display()
        ));
    }

    let mut result = InboxScanResult {
        missing_in_db: Vec::new(),
        missing_on_disk: Vec::new(),
        errors: Vec::new(),
    };

    let mut db_paths = std::collections::HashSet::new();

    // 1. Get DB records
    let mut stmt = match conn.prepare(
        "SELECT id, absolute_path FROM images WHERE status IN ('inbox', 'tagged')"
    ) {
        Ok(stmt) => stmt,
        Err(e) => {
            result.errors.push(format!("查询待整理数据失败: {}", e));
            return CommandResult::ok(result);
        }
    };

    let rows = match stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))) {
        Ok(rows) => rows,
        Err(e) => {
            result.errors.push(format!("读取待整理数据失败: {}", e));
            return CommandResult::ok(result);
        }
    };

    for r in rows.flatten() {
        let (id, absolute_path) = r;
        if !std::path::Path::new(&absolute_path).exists() {
            result.missing_on_disk.push(InboxMissingOnDiskItem {
                id,
                absolute_path: absolute_path.clone(),
            });
        }
        
        db_paths.insert(absolute_path.to_lowercase()); // normalize for comparison
    }

    // 2. Read disk files
    if let Ok(entries) = std::fs::read_dir(inbox_root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() { continue; }
            let _ext = match path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()) {
                Some(e) if matches!(e.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp") => e,
                _ => continue,
            };
            let abs_path = path.to_string_lossy().to_string();
            
            // Check if missing in DB
            if !db_paths.contains(&abs_path.to_lowercase()) {
                let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                let file_size = path.metadata().map(|m| m.len() as i64).unwrap_or(0);
                
                result.missing_in_db.push(InboxMissingInDbItem {
                    absolute_path: abs_path,
                    filename,
                    file_size,
                });
            }
        }
    }

    CommandResult::ok(result)
}

#[tauri::command]
pub async fn execute_inbox_cleanup(
    db_path: String,
    image_ids: Vec<String>,
) -> CommandResult<InboxCleanupResult> {
    let mut conn = match Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("无法打开数据库: {}", e)),
    };

    let mut result = InboxCleanupResult {
        removed_count: 0,
        failed_count: 0,
        errors: Vec::new(),
    };

    let tx = match conn.transaction() {
        Ok(tx) => tx,
        Err(e) => return CommandResult::err(format!("无法开启事务: {}", e)),
    };

    for image_id in image_ids {
        if let Err(e) = tx.execute("DELETE FROM image_model_relations WHERE image_id = ?", [&image_id]) {
            result.failed_count += 1;
            result.errors.push(format!("{}: 删除模型关联失败: {}", image_id, e));
            continue;
        }
        if let Err(e) = tx.execute("DELETE FROM image_tag_relations WHERE image_id = ?", [&image_id]) {
            result.failed_count += 1;
            result.errors.push(format!("{}: 删除标签关联失败: {}", image_id, e));
            continue;
        }
        if let Err(e) = tx.execute("DELETE FROM image_prompt_group_relations WHERE image_id = ?", [&image_id]) {
            result.failed_count += 1;
            result.errors.push(format!("{}: 删除提示词组关联失败: {}", image_id, e));
            continue;
        }
        if let Err(e) = tx.execute("DELETE FROM processing_history WHERE image_id = ?", [&image_id]) {
            result.failed_count += 1;
            result.errors.push(format!("{}: 删除处理历史失败: {}", image_id, e));
            continue;
        }
        if let Err(e) = tx.execute("DELETE FROM images WHERE id = ?", [&image_id]) {
            result.failed_count += 1;
            result.errors.push(format!("{}: 删除图片记录失败: {}", image_id, e));
            continue;
        }

        result.removed_count += 1;
    }

    if let Err(e) = tx.commit() {
        return CommandResult::err(format!("提交清理结果失败: {}", e));
    }

    CommandResult::ok(result)
}

/// 扫描 IP inbox 目录，返回未入库的文件和已失效的数据库记录
#[tauri::command]
pub async fn scan_ip_inbox_directory(
    db_path: String,
    inbox_path: String,
) -> CommandResult<InboxScanResult> {
    let conn = match Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("无法打开数据库: {}", e)),
    };

    let inbox_root = std::path::Path::new(&inbox_path);
    if !inbox_root.exists() {
        return CommandResult::err(format!(
            "待整理目录不存在: {}",
            inbox_root.display()
        ));
    }

    let mut result = InboxScanResult {
        missing_in_db: Vec::new(),
        missing_on_disk: Vec::new(),
        errors: Vec::new(),
    };

    let mut db_paths = std::collections::HashSet::new();

    let mut stmt = match conn.prepare(
        "SELECT id, absolute_path FROM ip_images WHERE status IN ('inbox', 'tagged')"
    ) {
        Ok(stmt) => stmt,
        Err(e) => {
            result.errors.push(format!("查询待整理数据失败: {}", e));
            return CommandResult::ok(result);
        }
    };

    let rows = match stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))) {
        Ok(rows) => rows,
        Err(e) => {
            result.errors.push(format!("读取待整理数据失败: {}", e));
            return CommandResult::ok(result);
        }
    };

    for r in rows.flatten() {
        let (id, absolute_path) = r;
        if !std::path::Path::new(&absolute_path).exists() {
            result.missing_on_disk.push(InboxMissingOnDiskItem {
                id,
                absolute_path: absolute_path.clone(),
            });
        }
        
        db_paths.insert(absolute_path.to_lowercase());
    }

    if let Ok(entries) = std::fs::read_dir(inbox_root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() { continue; }
            let _ext = match path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()) {
                Some(e) if matches!(e.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp") => e,
                _ => continue,
            };
            let abs_path = path.to_string_lossy().to_string();
            
            if !db_paths.contains(&abs_path.to_lowercase()) {
                let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                let file_size = path.metadata().map(|m| m.len() as i64).unwrap_or(0);
                
                result.missing_in_db.push(InboxMissingInDbItem {
                    absolute_path: abs_path,
                    filename,
                    file_size,
                });
            }
        }
    }

    CommandResult::ok(result)
}

#[tauri::command]
pub async fn execute_ip_inbox_cleanup(
    db_path: String,
    image_ids: Vec<String>,
) -> CommandResult<InboxCleanupResult> {
    let mut conn = match Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("无法打开数据库: {}", e)),
    };

    let mut result = InboxCleanupResult {
        removed_count: 0,
        failed_count: 0,
        errors: Vec::new(),
    };

    let tx = match conn.transaction() {
        Ok(tx) => tx,
        Err(e) => return CommandResult::err(format!("无法开启事务: {}", e)),
    };

    for ip_image_id in image_ids {
        if let Err(e) = tx.execute("DELETE FROM ip_image_tag_relations WHERE ip_image_id = ?", [&ip_image_id]) {
            result.failed_count += 1;
            result.errors.push(format!("{}: 删除标签关联失败: {}", ip_image_id, e));
            continue;
        }
        if let Err(e) = tx.execute("DELETE FROM ip_images WHERE id = ?", [&ip_image_id]) {
            result.failed_count += 1;
            result.errors.push(format!("{}: 删除图片记录失败: {}", ip_image_id, e));
            continue;
        }

        result.removed_count += 1;
    }

    if let Err(e) = tx.commit() {
        return CommandResult::err(format!("提交清理结果失败: {}", e));
    }

    CommandResult::ok(result)
}

/// 扫描 IP archived 目录，将未入库的图片写入 ip_images 表
#[tauri::command]
pub async fn scan_ip_archived_directory(
    db_path: String,
    library_path: String,
    naming_template: Option<String>,
) -> CommandResult<ScanResult> {
    let conn = match Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("无法打开数据库: {}", e)),
    };

    let template = naming_template
        .unwrap_or_else(|| "{ip}-{date}-{index}".to_string());

    let archived_root = std::path::Path::new(&library_path);
    if !archived_root.exists() {
        return CommandResult::err(format!(
            "归档目录不存在: {}",
            archived_root.display()
        ));
    }

    let mut result = ScanResult {
        scanned_count: 0,
        imported_count: 0,
        skipped_count: 0,
        renamed_count: 0,
        failed_count: 0,
        errors: Vec::new(),
    };

    // 收集所有已在数据库中的 absolute_path，用于去重
    let existing_paths: std::collections::HashSet<String> = {
        match conn.prepare("SELECT absolute_path FROM ip_images") {
            Ok(mut stmt) => {
                match stmt.query_map([], |row| row.get::<_, String>(0)) {
                    Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
                    Err(_) => std::collections::HashSet::new(),
                }
            }
            Err(e) => return CommandResult::err(format!("查询数据库失败: {}", e)),
        }
    };

    let mut global_index: usize = conn.query_row(
        "SELECT COUNT(*) FROM ip_images WHERE status = 'archived'",
        [],
        |row| row.get::<_, usize>(0),
    ).unwrap_or(0);

    // 遍历 IP 子目录（按 IP 形象的 path 字段匹配）
    let ip_dirs = match std::fs::read_dir(&archived_root) {
        Ok(d) => d,
        Err(e) => return CommandResult::err(format!("无法读取归档目录: {}", e)),
    };

    for ip_entry in ip_dirs.flatten() {
        let ip_dir = ip_entry.path();
        if !ip_dir.is_dir() {
            continue;
        }

        let dir_name = ip_dir
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // 优先按 path 字段匹配，其次按 name 匹配
        let resolved_ip_id: Option<String> = conn
            .query_row(
                "SELECT id FROM ip_assets WHERE path = ? OR name = ? LIMIT 1",
                rusqlite::params![dir_name, dir_name],
                |row| row.get(0),
            )
            .ok();

        let resolved_ip_id = match resolved_ip_id {
            Some(id) => id,
            None => {
                // IP 不存在则自动创建，path 和 name 都用目录名
                let new_id = format!("ip_{}", &Uuid::new_v4().to_string().replace("-", "")[..12]);
                let now = chrono::Utc::now().to_rfc3339();
                match conn.execute(
                    "INSERT INTO ip_assets (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                    rusqlite::params![new_id, dir_name, dir_name, now, now],
                ) {
                    Ok(_) => new_id,
                    Err(e) => {
                        result.failed_count += 1;
                        result.errors.push(format!("创建 IP {} 失败: {}", dir_name, e));
                        continue;
                    }
                }
            }
        };

        // 遍历 IP 目录下的图片
        let image_entries = match std::fs::read_dir(&ip_dir) {
            Ok(d) => d,
            Err(_) => continue,
        };

        for entry in image_entries.flatten() {
            let file_path = entry.path();
            if file_path.is_dir() {
                continue;
            }

            let ext = match file_path.extension().and_then(|e| e.to_str()) {
                Some(e) => e.to_lowercase(),
                None => continue,
            };
            if !["png", "jpg", "jpeg", "webp", "gif"].contains(&ext.as_str()) {
                continue;
            }

            result.scanned_count += 1;

            let abs_path_str = file_path.to_string_lossy().to_string();
            if existing_paths.contains(&abs_path_str) {
                result.skipped_count += 1;
                continue;
            }

            let file_size = file_path.metadata().map(|m| m.len() as i64).unwrap_or(0);
            let original_filename = file_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            let now = chrono::Utc::now();
            let date_str = now.format("%Y%m%d").to_string();
            global_index += 1;

            let new_stem = template
                .replace("{ip}", &dir_name)
                .replace("{date}", &date_str)
                .replace("{index}", &format!("{:03}", global_index));
            let new_filename = format!("{}.{}", new_stem, ext);

            let (final_filename, final_abs_path) = if original_filename == new_filename {
                (original_filename.clone(), abs_path_str.clone())
            } else {
                let new_path = ip_dir.join(&new_filename);
                let new_path = if new_path.exists() {
                    let unique_stem = format!("{}-{}", new_stem, now.timestamp_millis());
                    ip_dir.join(format!("{}.{}", unique_stem, ext))
                } else {
                    new_path
                };

                match std::fs::rename(&file_path, &new_path) {
                    Ok(_) => {
                        result.renamed_count += 1;
                        (
                            new_path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                            new_path.to_string_lossy().to_string(),
                        )
                    }
                    Err(e) => {
                        result.failed_count += 1;
                        result.errors.push(format!("重命名失败 {}: {}", original_filename, e));
                        continue;
                    }
                }
            };

            let relative_path = std::path::Path::new("ip_archived")
                .join(&dir_name)
                .join(&final_filename)
                .to_string_lossy()
                .to_string();

            let uuid_str = Uuid::new_v4().to_string().replace("-", "");
            let ip_image_id = format!("ipimg_{}", &uuid_str[..12]);
            let now_str = now.to_rfc3339();
            let format_upper = ext.to_uppercase();

            let insert_result = conn.execute(
                "INSERT INTO ip_images (
                    id, filename, original_filename, ip_id,
                    relative_path, absolute_path,
                    status, file_size, format,
                    has_watermark, watermark_detected, watermark_removed,
                    created_at, imported_at, archived_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'archived', ?, ?, 0, 0, 0, ?, ?, ?)",
                rusqlite::params![
                    ip_image_id, final_filename, original_filename, resolved_ip_id,
                    relative_path, final_abs_path,
                    file_size, format_upper,
                    now_str, now_str, now_str,
                ],
            );

            match insert_result {
                Ok(_) => result.imported_count += 1,
                Err(e) => {
                    result.failed_count += 1;
                    result.errors.push(format!("写入数据库失败 {}: {}", final_filename, e));
                }
            }
        }
    }

    CommandResult::ok(result)
}
