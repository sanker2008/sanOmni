// IP Character Domain: Image management commands
use crate::commands::CommandResult;
use crate::models::{IpImage, Tag};
use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportIpImageRequest {
    pub file_path: String,
    pub file_name: String,
    pub file_size: i64,
    pub ip_id: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateIpImageRequest {
    pub ip_image_id: String,
    pub ip_ids: Vec<String>,
    pub primary_ip_id: String,
    pub tags: Vec<String>,
    pub has_watermark: Option<bool>,
    pub watermark_platform: Option<String>,
    pub naming_template: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ArchiveIpImagesRequest {
    pub ip_image_ids: Vec<String>,
    pub naming_template: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ArchiveResult {
    pub success_count: usize,
    pub skipped_count: usize,
    pub failed_count: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IpImageResponse {
    #[serde(flatten)]
    pub ip_image: IpImage,
    pub tags: Vec<Tag>,
    pub ip_name: String,
    pub ip_ids: Vec<String>,
    pub primary_ip_id: String,
}

// ==================== Import ====================

#[tauri::command]
pub async fn import_ip_image(
    db_path: String,
    request: ImportIpImageRequest,
) -> CommandResult<IpImageResponse> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    // Verify IP exists
    let ip_exists: bool = conn.query_row(
        "SELECT COUNT(*) FROM ip_assets WHERE id = ?",
        [&request.ip_id],
        |row| {
            let count: i64 = row.get(0)?;
            Ok(count > 0)
        },
    ).unwrap_or(false);

    if !ip_exists {
        return CommandResult::err(format!("IP character '{}' not found", request.ip_id));
    }

    let uuid_str = Uuid::new_v4().to_string().replace("-", "");
    let ip_image_id = format!("ipimg_{}", &uuid_str[..12]);
    let now = chrono::Utc::now().to_rfc3339();

    // Build relative path
    let relative_path = std::path::Path::new("inbox")
        .join(&request.ip_id)
        .join(&request.file_name)
        .to_string_lossy()
        .to_string();

    // Extract format from filename
    let format = std::path::Path::new(&request.file_name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_uppercase());

    let ip_image = IpImage {
        id: ip_image_id.clone(),
        filename: request.file_name.clone(),
        original_filename: request.file_name,
        ip_id: request.ip_id.clone(),
        relative_path,
        absolute_path: request.file_path,
        status: "inbox".to_string(),
        file_size: Some(request.file_size),
        width: None,
        height: None,
        file_hash: None,
        format,
        has_watermark: false,
        watermark_platform: None,
        watermark_detected: false,
        watermark_removed: false,
        created_at: now.clone(),
        imported_at: now.clone(),
        archived_at: None,
    };

    // Insert into database
    if let Err(e) = conn.execute(
        "INSERT INTO ip_images (
            id, filename, original_filename, ip_id, relative_path, absolute_path,
            status, file_size, width, height, file_hash, format,
            has_watermark, watermark_platform, watermark_detected, watermark_removed,
            created_at, imported_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![
            &ip_image.id, &ip_image.filename, &ip_image.original_filename,
            &ip_image.ip_id, &ip_image.relative_path, &ip_image.absolute_path,
            &ip_image.status, ip_image.file_size, ip_image.width, ip_image.height,
            &ip_image.file_hash, &ip_image.format,
            ip_image.has_watermark as i32, &ip_image.watermark_platform,
            ip_image.watermark_detected as i32, ip_image.watermark_removed as i32,
            &ip_image.created_at, &ip_image.imported_at, &ip_image.archived_at,
        ],
    ) {
        return CommandResult::err(format!("Failed to insert IP image: {}", e));
    }

    // Insert primary relation to ip_image_relations
    if let Err(e) = conn.execute(
        "INSERT INTO ip_image_relations (ip_image_id, ip_id, is_primary) VALUES (?, ?, 1)",
        rusqlite::params![&ip_image.id, &ip_image.ip_id],
    ) {
        return CommandResult::err(format!("Failed to insert IP image relation: {}", e));
    }

    // Insert tags
    for tag_name in &request.tags {
        let tag_id = tag_name.to_lowercase().replace(" ", "-");
        let _ = conn.execute(
            "INSERT OR IGNORE INTO tags (id, name, created_at) VALUES (?, ?, ?)",
            (&tag_id, tag_name, &now),
        );
        let _ = conn.execute(
            "INSERT INTO ip_image_tag_relations (ip_image_id, tag_id) VALUES (?, ?)",
            (&ip_image_id, &tag_id),
        );
    }

    let tags = fetch_ip_image_tags(&conn, &ip_image_id).unwrap_or_default();
    let ip_name = fetch_ip_name(&conn, &request.ip_id).unwrap_or_else(|| "Unknown".to_string());
    let ip_ids = vec![request.ip_id.clone()];
    let primary_ip_id = request.ip_id.clone();

    CommandResult::ok(IpImageResponse { 
        ip_image, 
        tags, 
        ip_name,
        ip_ids,
        primary_ip_id,
    })
}

// ==================== Get Inbox ====================

#[tauri::command]
pub async fn get_ip_inbox_images(db_path: String) -> CommandResult<Vec<IpImageResponse>> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let images = fetch_ip_images_by_status(&conn, &["inbox", "tagged"]);
    CommandResult::ok(images)
}

// ==================== Get Archived ====================

#[tauri::command]
pub async fn get_ip_archived_images(db_path: String) -> CommandResult<Vec<IpImageResponse>> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let images = fetch_ip_images_by_status(&conn, &["archived"]);
    CommandResult::ok(images)
}

// ==================== Update ====================

#[tauri::command]
pub async fn update_ip_image(
    db_path: String,
    request: UpdateIpImageRequest,
) -> CommandResult<IpImageResponse> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let now = chrono::Utc::now().to_rfc3339();
    let ip_image_id = &request.ip_image_id;

    // Fetch current image
    let current_image = match fetch_ip_image_by_id(&conn, ip_image_id) {
        Some(img) => img,
        None => return CommandResult::err("IP image not found".to_string()),
    };

    // If the image is already archived and the primary IP has changed, move the physical file and update database paths
    if current_image.status == "archived" && current_image.ip_id != request.primary_ip_id {
        // Get library path by removing relative path suffix from absolute path
        let library_path = if current_image.absolute_path.ends_with(&current_image.relative_path) {
            let len = current_image.absolute_path.len() - current_image.relative_path.len();
            current_image.absolute_path[..len].trim_end_matches('/').trim_end_matches('\\').to_string()
        } else {
            std::path::Path::new(&current_image.absolute_path)
                .parent() // old_ip_path dir
                .and_then(|p| p.parent()) // ip_archived dir
                .and_then(|p| p.parent()) // library_path dir
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default()
        };

        if !library_path.is_empty() {
            let new_ip_path = fetch_ip_path(&conn, &request.primary_ip_id).unwrap_or_else(|| "unknown".to_string());
            let target_dir = std::path::PathBuf::from(&library_path).join("ip_archived").join(&new_ip_path);

            let default_template = "{ip}-{date}-{index}".to_string();
            let template = request.naming_template.clone().unwrap_or(default_template);

            let ext = std::path::Path::new(&current_image.filename)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("png");

            let ip_name = fetch_ip_name(&conn, &request.primary_ip_id).unwrap_or_else(|| "Unknown".to_string());
            let date = if current_image.created_at.len() >= 10 {
                &current_image.created_at[..10]
            } else {
                "unknown"
            };

            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM ip_images WHERE ip_id = ? AND status = 'archived'",
                [&request.primary_ip_id],
                |row| row.get(0),
            ).unwrap_or(0);
            let index = count + 1;

            let filename_candidate = template
                .replace("{ip}", &ip_name)
                .replace("{date}", date)
                .replace("{index}", &format!("{:03}", index))
                .replace("{original}", &current_image.original_filename);

            let mut path_file = std::path::PathBuf::from(&filename_candidate);
            if path_file.extension().is_none() {
                path_file.set_extension(ext);
            }
            let filename = path_file.file_name().and_then(|f| f.to_str()).unwrap_or(&filename_candidate).to_string();

            // Resolve name collision if any
            let stem = std::path::Path::new(&filename)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&filename);

            let mut unique_filename = filename.clone();
            let mut target_path = target_dir.join(&unique_filename);
            let mut counter = 1;

            while target_path.exists() {
                unique_filename = format!("{}_{}.{}", stem, counter, ext);
                target_path = target_dir.join(&unique_filename);
                counter += 1;
            }

            // Perform directory creation and file move
            let source = std::path::Path::new(&current_image.absolute_path);
            if source.exists() {
                if let Ok(_) = std::fs::create_dir_all(&target_dir) {
                    if let Ok(_) = std::fs::rename(source, &target_path) {
                        // Update the database paths
                        let new_relative = std::path::Path::new("ip_archived")
                            .join(&new_ip_path)
                            .join(&unique_filename)
                            .to_string_lossy()
                            .to_string();
                        let new_absolute = target_path.to_string_lossy().to_string();

                        let _ = conn.execute(
                            "UPDATE ip_images SET filename = ?, relative_path = ?, absolute_path = ? WHERE id = ?",
                            rusqlite::params![&unique_filename, &new_relative, &new_absolute, ip_image_id],
                        );
                    }
                }
            }
        }
    }

    // Mark inbox images as tagged once metadata is edited
    if current_image.status != "archived" {
        let _ = conn.execute(
            "UPDATE ip_images SET status = 'tagged' WHERE id = ?",
            [ip_image_id],
        );
    }

    // Update IP association (primary IP in ip_images table)
    let _ = conn.execute(
        "UPDATE ip_images SET ip_id = ? WHERE id = ?",
        rusqlite::params![&request.primary_ip_id, ip_image_id],
    );

    // Update ip_image_relations
    let _ = conn.execute(
        "DELETE FROM ip_image_relations WHERE ip_image_id = ?",
        [ip_image_id],
    );

    for ip_id in &request.ip_ids {
        let is_primary = if ip_id == &request.primary_ip_id { 1 } else { 0 };
        let _ = conn.execute(
            "INSERT OR IGNORE INTO ip_image_relations (ip_image_id, ip_id, is_primary) VALUES (?, ?, ?)",
            rusqlite::params![ip_image_id, ip_id, is_primary],
        );
    }

    // Update watermark info
    if let Some(has_watermark) = request.has_watermark {
        let _ = conn.execute(
            "UPDATE ip_images SET has_watermark = ? WHERE id = ?",
            rusqlite::params![has_watermark as i32, ip_image_id],
        );
        if !has_watermark {
            let _ = conn.execute(
                "UPDATE ip_images SET watermark_platform = NULL WHERE id = ?",
                [ip_image_id],
            );
        }
    }

    if let Some(watermark_platform) = &request.watermark_platform {
        let _ = conn.execute(
            "UPDATE ip_images SET watermark_platform = ? WHERE id = ?",
            rusqlite::params![watermark_platform, ip_image_id],
        );
    }

    // Update tags
    let _ = conn.execute(
        "DELETE FROM ip_image_tag_relations WHERE ip_image_id = ?",
        [ip_image_id],
    );

    for tag_name in &request.tags {
        let tag_id = tag_name.to_lowercase().replace(" ", "-");
        let _ = conn.execute(
            "INSERT OR IGNORE INTO tags (id, name, created_at) VALUES (?, ?, ?)",
            (&tag_id, tag_name, &now),
        );
        let _ = conn.execute(
            "INSERT INTO ip_image_tag_relations (ip_image_id, tag_id) VALUES (?, ?)",
            (ip_image_id, &tag_id),
        );
    }

    // Fetch and return updated image
    let ip_image = match fetch_ip_image_by_id(&conn, ip_image_id) {
        Some(img) => img,
        None => return CommandResult::err("IP image not found after update".to_string()),
    };
    let tags = fetch_ip_image_tags(&conn, ip_image_id).unwrap_or_default();
    let ip_name = fetch_ip_name(&conn, &ip_image.ip_id).unwrap_or_else(|| "Unknown".to_string());
    let ip_ids = fetch_associated_ips(&conn, ip_image_id).unwrap_or_default();
    let ip_ids = if ip_ids.is_empty() { vec![ip_image.ip_id.clone()] } else { ip_ids };
    let primary_ip_id = ip_image.ip_id.clone();

    CommandResult::ok(IpImageResponse { 
        ip_image, 
        tags, 
        ip_name,
        ip_ids,
        primary_ip_id,
    })
}

// ==================== Archive ====================

#[tauri::command]
pub async fn archive_ip_images(
    db_path: String,
    library_path: String,
    request: ArchiveIpImagesRequest,
) -> CommandResult<ArchiveResult> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let mut result = ArchiveResult {
        success_count: 0,
        skipped_count: 0,
        failed_count: 0,
        errors: Vec::new(),
    };

    let now = chrono::Utc::now().to_rfc3339();
    let default_template = "{ip}-{date}-{index}".to_string();
    let template = request.naming_template.unwrap_or(default_template);

    for ip_image_id in &request.ip_image_ids {
        // Fetch image
        let ip_image = match fetch_ip_image_by_id(&conn, ip_image_id) {
            Some(img) => img,
            None => {
                result.skipped_count += 1;
                continue;
            }
        };

        // Skip if already archived
        if ip_image.status == "archived" {
            result.skipped_count += 1;
            continue;
        }

        // Get IP name & path
        let ip_name = fetch_ip_name(&conn, &ip_image.ip_id).unwrap_or_else(|| "Unknown".to_string());
        let ip_path = fetch_ip_path(&conn, &ip_image.ip_id).unwrap_or_else(|| "unknown".to_string());

        // Target directory: library_path/ip_archived/ip_path/
        let target_dir = std::path::PathBuf::from(&library_path).join("ip_archived").join(&ip_path);

        // Generate unique filename
        let date = &ip_image.created_at[..10]; // YYYY-MM-DD
        let ext = std::path::Path::new(&ip_image.filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png");

        let mut index = result.success_count + 1;
        let mut suffix_counter = 1;

        let (target_path, new_filename) = loop {
            let mut filename_candidate = template.clone()
                .replace("{ip}", &ip_name)
                .replace("{date}", date)
                .replace("{index}", &format!("{:03}", index))
                .replace("{original}", &ip_image.original_filename);

            let mut path_file = std::path::PathBuf::from(&filename_candidate);
            if path_file.extension().is_none() {
                path_file.set_extension(ext);
            }

            let stem = path_file.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&filename_candidate)
                .to_string();
            let current_ext = path_file.extension()
                .and_then(|e| e.to_str())
                .unwrap_or(ext)
                .to_string();

            let final_candidate = if !template.contains("{index}") && suffix_counter > 1 {
                format!("{}_{}.{}", stem, suffix_counter - 1, current_ext)
            } else {
                format!("{}.{}", stem, current_ext)
            };

            let path_candidate = target_dir.join(&final_candidate);
            if !path_candidate.exists() {
                break (path_candidate, final_candidate);
            }

            if template.contains("{index}") {
                index += 1;
            } else {
                suffix_counter += 1;
            }
        };

        // Move file
        let source = std::path::Path::new(&ip_image.absolute_path);
        if source.exists() {
            if let Err(e) = std::fs::create_dir_all(&target_dir) {
                result.failed_count += 1;
                result.errors.push(format!("{}: Failed to create directory: {}", ip_image_id, e));
                continue;
            }

            if let Err(e) = std::fs::rename(source, &target_path) {
                result.failed_count += 1;
                result.errors.push(format!("{}: Failed to move file: {}", ip_image_id, e));
                continue;
            }
        }

        // Update database
        let new_relative = std::path::Path::new("ip_archived")
            .join(&ip_path)
            .join(&new_filename)
            .to_string_lossy()
            .to_string();
        let new_absolute = target_path.to_string_lossy().to_string();

        if let Err(e) = conn.execute(
            "UPDATE ip_images SET 
                filename = ?, relative_path = ?, absolute_path = ?,
                status = 'archived', archived_at = ?
            WHERE id = ?",
            (&new_filename, &new_relative, &new_absolute, &now, ip_image_id),
        ) {
            result.failed_count += 1;
            result.errors.push(format!("{}: Failed to update database: {}", ip_image_id, e));
            continue;
        }

        result.success_count += 1;
    }

    CommandResult::ok(result)
}

// ==================== Delete ====================

#[tauri::command]
pub async fn delete_ip_image(db_path: String, ip_image_id: String) -> CommandResult<bool> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let ip_image = match fetch_ip_image_by_id(&conn, &ip_image_id) {
        Some(image) => image,
        None => return CommandResult::ok(false),
    };

    let image_path = std::path::Path::new(&ip_image.absolute_path);
    if image_path.exists() {
        if let Err(e) = std::fs::remove_file(image_path) {
            return CommandResult::err(format!("Failed to delete file: {}", e));
        }
    }

    if let Err(e) = conn.execute("DELETE FROM ip_images WHERE id = ?", [&ip_image_id]) {
        return CommandResult::err(format!("Failed to delete from database: {}", e));
    }

    CommandResult::ok(true)
}

// ==================== Helper Functions ====================

fn fetch_ip_image_by_id(conn: &Connection, ip_image_id: &str) -> Option<IpImage> {
    let mut stmt = conn.prepare(
        "SELECT id, filename, original_filename, ip_id, relative_path, absolute_path,
                status, file_size, width, height, file_hash, format,
                has_watermark, watermark_platform, watermark_detected, watermark_removed,
                created_at, imported_at, archived_at
         FROM ip_images WHERE id = ?"
    ).ok()?;

    stmt.query_row([ip_image_id], |row| {
        Ok(IpImage {
            id: row.get(0)?,
            filename: row.get(1)?,
            original_filename: row.get(2)?,
            ip_id: row.get(3)?,
            relative_path: row.get(4)?,
            absolute_path: row.get(5)?,
            status: row.get(6)?,
            file_size: row.get(7)?,
            width: row.get(8)?,
            height: row.get(9)?,
            file_hash: row.get(10)?,
            format: row.get(11)?,
            has_watermark: row.get::<_, i32>(12)? != 0,
            watermark_platform: row.get(13)?,
            watermark_detected: row.get::<_, i32>(14)? != 0,
            watermark_removed: row.get::<_, i32>(15)? != 0,
            created_at: row.get(16)?,
            imported_at: row.get(17)?,
            archived_at: row.get(18)?,
        })
    }).ok()
}

fn fetch_ip_images_by_status(conn: &Connection, statuses: &[&str]) -> Vec<IpImageResponse> {
    let placeholders: Vec<&str> = statuses.iter().map(|_| "?").collect();
    let sql = format!(
        "SELECT * FROM ip_images WHERE status IN ({}) ORDER BY imported_at DESC",
        placeholders.join(",")
    );

    let mut stmt = match conn.prepare(&sql) {
        Ok(stmt) => stmt,
        Err(_) => return Vec::new(),
    };

    let params: Vec<&dyn rusqlite::ToSql> = statuses.iter().map(|s| s as &dyn rusqlite::ToSql).collect();

    let rows = stmt.query_map(params.as_slice(), |row| {
        Ok(IpImage {
            id: row.get(0)?,
            filename: row.get(1)?,
            original_filename: row.get(2)?,
            ip_id: row.get(3)?,
            relative_path: row.get(4)?,
            absolute_path: row.get(5)?,
            status: row.get(6)?,
            file_size: row.get(7)?,
            width: row.get(8)?,
            height: row.get(9)?,
            file_hash: row.get(10)?,
            format: row.get(11)?,
            has_watermark: row.get::<_, i32>(12)? != 0,
            watermark_platform: row.get(13)?,
            watermark_detected: row.get::<_, i32>(14)? != 0,
            watermark_removed: row.get::<_, i32>(15)? != 0,
            created_at: row.get(16)?,
            imported_at: row.get(17)?,
            archived_at: row.get(18)?,
        })
    });

    match rows {
        Ok(mapped) => {
            mapped.filter_map(|r| r.ok()).map(|ip_image| {
                let tags = fetch_ip_image_tags(conn, &ip_image.id).unwrap_or_default();
                let ip_name = fetch_ip_name(conn, &ip_image.ip_id).unwrap_or_else(|| "Unknown".to_string());
                let ip_ids = fetch_associated_ips(conn, &ip_image.id).unwrap_or_default();
                let ip_ids = if ip_ids.is_empty() { vec![ip_image.ip_id.clone()] } else { ip_ids };
                let primary_ip_id = ip_image.ip_id.clone();
                IpImageResponse { 
                    ip_image, 
                    tags, 
                    ip_name,
                    ip_ids,
                    primary_ip_id,
                }
            }).collect()
        }
        Err(_) => Vec::new(),
    }
}

fn fetch_ip_image_tags(conn: &Connection, ip_image_id: &str) -> Result<Vec<Tag>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.name_en, t.color, t.parent_id, t.use_count, t.is_builtin, t.created_at
         FROM tags t
         JOIN ip_image_tag_relations r ON t.id = r.tag_id
         WHERE r.ip_image_id = ?"
    )?;

    let rows = stmt.query_map([ip_image_id], |row| {
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
    })?;

    rows.collect()
}

fn fetch_ip_name(conn: &Connection, ip_id: &str) -> Option<String> {
    conn.query_row(
        "SELECT name FROM ip_assets WHERE id = ?",
        [ip_id],
        |row| row.get(0),
    ).ok()
}

fn fetch_ip_path(conn: &Connection, ip_id: &str) -> Option<String> {
    conn.query_row(
        "SELECT path FROM ip_assets WHERE id = ?",
        [ip_id],
        |row| row.get(0),
    ).ok()
}

fn fetch_associated_ips(conn: &Connection, ip_image_id: &str) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT ip_id FROM ip_image_relations WHERE ip_image_id = ?"
    )?;
    let rows = stmt.query_map([ip_image_id], |row| row.get(0))?;
    let mut ips = Vec::new();
    for r in rows {
        if let Ok(ip) = r {
            ips.push(ip);
        }
    }
    Ok(ips)
}
