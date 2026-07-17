use crate::commands::CommandResult;
use crate::models::{Image, ModelInfo, PromptGroup, Tag};
use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::io::ErrorKind;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportImageRequest {
    pub file_path: String,
    pub file_name: String,
    pub file_size: i64,
    pub vendor_id: Option<String>,
    pub model_ids: Vec<String>,
    pub primary_model_id: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateImageRequest {
    pub image_id: String,
    pub model_ids: Vec<String>,
    pub primary_model_id: Option<String>,
    pub tags: Vec<String>,
    pub prompt: Option<String>,
    pub negative_prompt: Option<String>,
    pub has_watermark: Option<bool>,
    pub watermark_platform: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateImageFileRequest {
    pub image_id: String,
    pub new_filename: String,
    pub new_relative_path: String,
    pub new_absolute_path: String,
    pub new_format: String,
    pub new_file_size: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ArchiveRequest {
    pub image_ids: Vec<String>,
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
pub struct ImageResponse {
    #[serde(flatten)]
    pub image: Image,
    pub models: Vec<ModelInfo>,
    pub tags: Vec<Tag>,
    pub prompt_groups: Vec<PromptGroup>,
}

// ==================== Import ====================

#[tauri::command]
pub async fn import_image(
    db_path: String,
    request: ImportImageRequest,
) -> CommandResult<ImageResponse> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    // Ensure "unknown" vendor and model exist
    if let Err(e) = ensure_unknown_vendor_model(&conn) {
        return CommandResult::err(format!("Failed to ensure default vendor/model: {}", e));
    }

    // Check if absolute_path already exists
    let existing_id: Option<String> = conn
        .query_row(
            "SELECT id FROM images WHERE absolute_path = ?",
            [&request.file_path],
            |row| row.get(0),
        )
        .ok();

    if let Some(id) = existing_id {
        return CommandResult::err(format!("Image already exists in database with id: {}", id));
    }

    let uuid_str = Uuid::new_v4().to_string().replace("-", "");
    let image_id = format!("img_{}", &uuid_str[..12]);
    let now = chrono::Utc::now().to_rfc3339();

    let mut valid_model_ids = Vec::new();
    for model_id in &request.model_ids {
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM models WHERE id = ?",
                [model_id],
                |row| {
                    let count: i64 = row.get(0)?;
                    Ok(count > 0)
                },
            )
            .unwrap_or(false);
        if exists {
            valid_model_ids.push(model_id.clone());
        } else {
            eprintln!("Model '{}' not found, ignoring", model_id);
        }
    }

    let primary_model_id = request
        .primary_model_id
        .filter(|id| valid_model_ids.contains(id))
        .or_else(|| valid_model_ids.first().cloned())
        .unwrap_or_else(|| "unknown".to_string());

    let vendor_id: String = conn
        .query_row(
            "SELECT vendor_id FROM models WHERE id = ?",
            [&primary_model_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|e| {
            eprintln!(
                "Failed to get vendor_id for model '{}': {}",
                primary_model_id, e
            );
            "unknown".to_string()
        });

    // Build relative path using Path for cross-platform compatibility
    let relative_path = std::path::Path::new("inbox")
        .join(&vendor_id)
        .join(&request.file_name)
        .to_string_lossy()
        .to_string();

    // Extract format from filename
    let format = std::path::Path::new(&request.file_name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_uppercase());

    let image = Image {
        id: image_id.clone(),
        filename: request.file_name.clone(),
        original_filename: request.file_name,
        storage_vendor_id: vendor_id.clone(),
        storage_model_id: primary_model_id.clone(),
        relative_path,
        absolute_path: request.file_path,
        primary_model_id: primary_model_id.clone(),
        status: "inbox".to_string(),
        prompt: None,
        negative_prompt: None,
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

    eprintln!(
        "Inserting image with vendor_id='{}', storage_model_id='{}', primary_model_id='{}'",
        &image.storage_vendor_id, &image.storage_model_id, &image.primary_model_id
    );

    // Insert required fields first (within 16-param limit)
    if let Err(e) = conn.execute(
        "INSERT INTO images (
            id, filename, original_filename, storage_vendor_id, storage_model_id,
            relative_path, absolute_path, primary_model_id, status, prompt,
            negative_prompt, file_size, width, height, created_at, imported_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![
            &image.id,
            &image.filename,
            &image.original_filename,
            &image.storage_vendor_id,
            &image.storage_model_id,
            &image.relative_path,
            &image.absolute_path,
            &image.primary_model_id,
            &image.status,
            &image.prompt,
            &image.negative_prompt,
            image.file_size,
            image.width,
            image.height,
            &image.created_at,
            &image.imported_at,
        ],
    ) {
        return CommandResult::err(format!("Failed to insert image: {}", e));
    }

    // Update optional fields separately
    if let Err(e) = conn.execute(
        "UPDATE images SET
            has_watermark = ?, watermark_platform = ?,
            watermark_detected = ?, watermark_removed = ?,
            file_hash = ?, format = ?, archived_at = ?
        WHERE id = ?",
        rusqlite::params![
            image.has_watermark as i32,
            &image.watermark_platform,
            image.watermark_detected as i32,
            image.watermark_removed as i32,
            &image.file_hash,
            &image.format,
            &image.archived_at,
            &image.id,
        ],
    ) {
        return CommandResult::err(format!("Failed to update image optional fields: {}", e));
    }

    for model_id in &valid_model_ids {
        let is_primary = model_id == &primary_model_id;
        let _ = conn.execute(
            "INSERT INTO image_model_relations (image_id, model_id, is_primary) VALUES (?, ?, ?)",
            (&image_id, model_id, is_primary as i32),
        );
    }

    // If no valid model_ids provided, insert at least the primary model relation
    if valid_model_ids.is_empty() {
        let _ = conn.execute(
            "INSERT INTO image_model_relations (image_id, model_id, is_primary) VALUES (?, ?, ?)",
            (&image_id, &primary_model_id, 1),
        );
    }

    for tag_name in &request.tags {
        let tag_id = tag_name.to_lowercase().replace(" ", "-");
        let _ = conn.execute(
            "INSERT OR IGNORE INTO tags (id, name, created_at) VALUES (?, ?, ?)",
            (&tag_id, tag_name, &now),
        );
        let _ = conn.execute(
            "INSERT INTO image_tag_relations (image_id, tag_id) VALUES (?, ?)",
            (&image_id, &tag_id),
        );
    }

    let _ = conn.execute(
        "INSERT INTO processing_history (image_id, action, status, details, created_at) VALUES (?, ?, ?, ?, ?)",
        (&image_id, "import", "success", "Image imported to inbox", &now),
    );

    let models = fetch_image_models(&conn, &image_id).unwrap_or_default();
    let tags = fetch_image_tags(&conn, &image_id).unwrap_or_default();
    let prompt_groups = fetch_image_prompt_groups(&conn, &image_id).unwrap_or_default();

    CommandResult::ok(ImageResponse {
        image,
        models,
        tags,
        prompt_groups,
    })
}

// ==================== Get Inbox ====================

#[tauri::command]
pub async fn get_inbox_images(db_path: String) -> CommandResult<Vec<ImageResponse>> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let images = fetch_images_by_status(&conn, &["inbox", "tagged"]);
    CommandResult::ok(images)
}

// ==================== Get Archived ====================

#[tauri::command]
pub async fn get_archived_images(db_path: String) -> CommandResult<Vec<ImageResponse>> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let images = fetch_images_by_status(&conn, &["archived"]);
    CommandResult::ok(images)
}

// ==================== Update Image ====================

#[tauri::command]
pub async fn update_image(
    db_path: String,
    request: UpdateImageRequest,
) -> CommandResult<ImageResponse> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let now = chrono::Utc::now().to_rfc3339();
    let image_id = &request.image_id;

    // Fetch current image info
    let current_image = match fetch_image_by_id(&conn, image_id) {
        Some(img) => img,
        None => return CommandResult::err("Image not found".to_string()),
    };

    // Mark inbox images as tagged once metadata is edited.
    // Archived images must stay archived after edits.
    if current_image.status != "archived" && !request.model_ids.is_empty() {
        let _ = conn.execute(
            "UPDATE images SET status = 'tagged' WHERE id = ?",
            [image_id],
        );
    }

    let _ = conn.execute(
        "UPDATE images SET prompt = ?, negative_prompt = ? WHERE id = ?",
        rusqlite::params![&request.prompt, &request.negative_prompt, image_id],
    );

    if let Some(has_watermark) = request.has_watermark {
        let _ = conn.execute(
            "UPDATE images SET has_watermark = ? WHERE id = ?",
            rusqlite::params![has_watermark as i32, image_id],
        );
        if !has_watermark {
            let _ = conn.execute(
                "UPDATE images SET watermark_platform = NULL WHERE id = ?",
                [image_id],
            );
        }
    }

    if let Some(watermark_platform) = &request.watermark_platform {
        let _ = conn.execute(
            "UPDATE images SET watermark_platform = ? WHERE id = ?",
            rusqlite::params![watermark_platform, image_id],
        );
    }

    // Update model relations
    let mut new_primary_model_id = current_image.primary_model_id.clone();
    let mut new_vendor_id = current_image.storage_vendor_id.clone();

    if !request.model_ids.is_empty() {
        // Delete old relations
        let _ = conn.execute(
            "DELETE FROM image_model_relations WHERE image_id = ?",
            [image_id],
        );

        // Insert new relations
        let primary = request
            .primary_model_id
            .or_else(|| request.model_ids.first().cloned())
            .unwrap_or_else(|| "unknown".to_string());

        for model_id in &request.model_ids {
            let is_primary = model_id == &primary;
            let _ = conn.execute(
                "INSERT INTO image_model_relations (image_id, model_id, is_primary) VALUES (?, ?, ?)",
                (image_id, model_id, is_primary as i32),
            );
        }

        // Get vendor_id for the new primary model
        new_vendor_id = conn
            .query_row(
                "SELECT vendor_id FROM models WHERE id = ?",
                [&primary],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "unknown".to_string());

        new_primary_model_id = primary.clone();

        // Update primary model and storage info
        let _ = conn.execute(
            "UPDATE images SET primary_model_id = ?, storage_vendor_id = ?, storage_model_id = ? WHERE id = ?",
            (&primary, &new_vendor_id, &primary, image_id),
        );
    }

    // Update tags
    // Delete old tag relations
    let _ = conn.execute(
        "DELETE FROM image_tag_relations WHERE image_id = ?",
        [image_id],
    );

    // Insert new tags
    for tag_name in &request.tags {
        let tag_id = tag_name.to_lowercase().replace(" ", "-");
        let _ = conn.execute(
            "INSERT OR IGNORE INTO tags (id, name, created_at) VALUES (?, ?, ?)",
            (&tag_id, tag_name, &now),
        );
        let _ = conn.execute(
            "INSERT INTO image_tag_relations (image_id, tag_id) VALUES (?, ?)",
            (image_id, &tag_id),
        );
    }

    // Fetch vendor and model path
    let vendor_path: String = conn
        .query_row(
            "SELECT path FROM vendors WHERE id = ?",
            [&new_vendor_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| new_vendor_id.clone());

    let model_path: String = conn
        .query_row(
            "SELECT path FROM models WHERE id = ?",
            [&new_primary_model_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| new_primary_model_id.clone());

    let is_vendor_changed = new_vendor_id != current_image.storage_vendor_id;
    let is_model_changed = new_primary_model_id != current_image.primary_model_id;

    // 检查文件名是否包含大写字母、空格、或是非 [a-z0-9_-] 的特殊字符
    let current_filename_stem = std::path::Path::new(&current_image.filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let is_filename_invalid = current_filename_stem.chars().any(|c| {
        c.is_uppercase()
            || c.is_whitespace()
            || (!c.is_ascii_alphanumeric() && c != '-' && c != '_')
    });

    let is_path_mismatched = if current_image.status == "archived" {
        let expected_dir_prefix = format!("archived/{}/{}", vendor_path, model_path);
        let normalized_relative_path = current_image.relative_path.replace("\\", "/");
        !normalized_relative_path.starts_with(&expected_dir_prefix)
    } else {
        let expected_prefix = format!("{}_{}_", new_vendor_id, new_primary_model_id);
        !current_image.filename.starts_with(&expected_prefix)
    };

    let need_rename =
        is_vendor_changed || is_model_changed || is_filename_invalid || is_path_mismatched;

    // Rename file if vendor or model changed, or naming invalidity/path mismatch detected
    if need_rename {
        let old_path = std::path::Path::new(&current_image.absolute_path);
        if old_path.exists() {
            // Get file extension
            let ext = old_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("png");

            let timestamp = chrono::Utc::now().timestamp();

            // Generate new filename and path based on status
            let (new_filename, new_path) = if current_image.status == "archived" {
                // For archived images, move to new vendor/model directory

                // Get library path from old path (go up to archived directory)
                let library_path = if let Some(old_parent) = old_path.parent() {
                    if let Some(model_dir) = old_parent.parent() {
                        if let Some(vendor_dir) = model_dir.parent() {
                            if let Some(archived_dir) = vendor_dir.parent() {
                                archived_dir.to_path_buf()
                            } else {
                                std::path::PathBuf::from(".")
                            }
                        } else {
                            std::path::PathBuf::from(".")
                        }
                    } else {
                        std::path::PathBuf::from(".")
                    }
                } else {
                    std::path::PathBuf::from(".")
                };

                // Build new directory structure
                let target_dir = library_path
                    .join("archived")
                    .join(&vendor_path)
                    .join(&model_path);

                // Create directory if it doesn't exist
                if let Err(e) = std::fs::create_dir_all(&target_dir) {
                    eprintln!("Failed to create directory: {}", e);
                    return CommandResult::err(format!("Failed to create directory: {}", e));
                }

                // Use template: {vendor}-{model}-{date}-{timestamp}
                let date = &current_image.created_at[..10]; // YYYY-MM-DD
                let filename = format!(
                    "{}-{}-{}-{}.{}",
                    vendor_path, model_path, date, timestamp, ext
                );
                let path = target_dir.join(&filename);

                (filename, path)
            } else {
                // For inbox images, stay in same directory with new prefix
                if let Some(parent_dir) = old_path.parent() {
                    let filename = format!(
                        "{}_{}_{}_{}.{}",
                        new_vendor_id,
                        new_primary_model_id,
                        timestamp,
                        current_image
                            .original_filename
                            .replace(&format!(".{}", ext), ""),
                        ext
                    );
                    let path = parent_dir.join(&filename);
                    (filename, path)
                } else {
                    eprintln!("Failed to get parent directory");
                    return CommandResult::err("Failed to get parent directory".to_string());
                }
            };

            let mut final_path = new_path.clone();
            let mut final_filename = new_filename.clone();
            let mut counter = 1;

            let stem = std::path::Path::new(&new_filename)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&new_filename)
                .to_string();

            while ["png", "jpg", "jpeg", "webp", "gif", "bmp"]
                .iter()
                .any(|e| {
                    let check_stem = if counter == 1 {
                        stem.clone()
                    } else {
                        format!("{}_{}", stem, counter - 1)
                    };
                    if let Some(parent) = new_path.parent() {
                        let p = parent.join(format!("{}.{}", check_stem, e));
                        p.exists() && p != std::path::Path::new(&current_image.absolute_path)
                    } else {
                        false
                    }
                })
            {
                final_filename = format!("{}_{}.{}", stem, counter, ext);
                if let Some(parent) = new_path.parent() {
                    final_path = parent.join(&final_filename);
                } else {
                    break;
                }
                counter += 1;
            }

            // Move/rename the file
            if let Err(e) = std::fs::rename(old_path, &final_path).or_else(|_| {
                std::fs::copy(old_path, &final_path).and_then(|_| std::fs::remove_file(old_path))
            }) {
                eprintln!("Failed to move/rename file: {}", e);
                return CommandResult::err(format!("Failed to move/rename file: {}", e));
            }

            // Update database with new filename and path
            let new_relative = if current_image.status == "archived" {
                // For archived, use new vendor/model structure
                let vendor_path: String = conn
                    .query_row(
                        "SELECT path FROM vendors WHERE id = ?",
                        [&new_vendor_id],
                        |row| row.get(0),
                    )
                    .unwrap_or_else(|_| new_vendor_id.clone());

                let model_path: String = conn
                    .query_row(
                        "SELECT path FROM models WHERE id = ?",
                        [&new_primary_model_id],
                        |row| row.get(0),
                    )
                    .unwrap_or_else(|_| new_primary_model_id.clone());

                std::path::Path::new("archived")
                    .join(&vendor_path)
                    .join(&model_path)
                    .join(&final_filename)
                    .to_string_lossy()
                    .to_string()
            } else {
                // For inbox
                std::path::Path::new("inbox")
                    .join(&final_filename)
                    .to_string_lossy()
                    .to_string()
            };

            let new_absolute = final_path.to_string_lossy().to_string();

            if let Err(e) = conn.execute(
                "UPDATE images SET filename = ?, relative_path = ?, absolute_path = ? WHERE id = ?",
                (&final_filename, &new_relative, &new_absolute, image_id),
            ) {
                eprintln!("Failed to update database: {}", e);
                return CommandResult::err(format!("Failed to update database: {}", e));
            }

            // Log the move operation
            let _ = conn.execute(
                "INSERT INTO processing_history (image_id, action, status, details, created_at) VALUES (?, ?, ?, ?, ?)",
                (image_id, "move", "success", &format!("Moved to {}", new_relative), &now),
            );
        }
    }

    // Log history
    let _ = conn.execute(
        "INSERT INTO processing_history (image_id, action, status, details, created_at) VALUES (?, ?, ?, ?, ?)",
        (image_id, "update", "success", "Image metadata updated", &now),
    );

    // Fetch and return updated image
    let image = match fetch_image_by_id(&conn, image_id) {
        Some(img) => img,
        None => return CommandResult::err("Image not found after update".to_string()),
    };
    let models = fetch_image_models(&conn, image_id).unwrap_or_default();
    let tags = fetch_image_tags(&conn, image_id).unwrap_or_default();
    let prompt_groups = fetch_image_prompt_groups(&conn, image_id).unwrap_or_default();

    CommandResult::ok(ImageResponse {
        image,
        models,
        tags,
        prompt_groups,
    })
}

// ==================== Archive ====================

#[tauri::command]
pub async fn archive_images(
    db_path: String,
    library_path: String,
    request: ArchiveRequest,
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
    let default_template = "{vendor}-{model}-{date}-{time}".to_string();
    let template = request.naming_template.unwrap_or(default_template);

    for image_id in &request.image_ids {
        // Fetch image
        let image = match fetch_image_by_id(&conn, image_id) {
            Some(img) => img,
            None => {
                result.skipped_count += 1;
                continue;
            }
        };

        // Skip if already archived
        if image.status == "archived" {
            result.skipped_count += 1;
            continue;
        }

        // Get vendor and model path for prompt images
        let vendor_path: String = conn
            .query_row(
                "SELECT path FROM vendors WHERE id = ?",
                [&image.storage_vendor_id],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| image.storage_vendor_id.clone());

        let model_path: String = conn
            .query_row(
                "SELECT path FROM models WHERE id = ?",
                [&image.storage_model_id],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| image.storage_model_id.clone());

        let target_dir = std::path::Path::new(&library_path)
            .join("archived")
            .join(&vendor_path)
            .join(&model_path);

        // Generate unique filename to prevent overwriting existing files
        let date = &image.created_at[..10].replace("-", ""); // YYYYMMDD
        let ext = std::path::Path::new(&image.filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png");

        let mut current_time = chrono::Local::now().naive_local();

        let (target_path, new_filename) = loop {
            let time_str = current_time.format("%H%M%S").to_string();
            let filename_candidate = template
                .clone()
                .replace("{vendor}", &vendor_path)
                .replace("{model}", &model_path)
                .replace("{date}", date)
                .replace("{time}", &time_str)
                .replace("{index}", &time_str) // 兼容旧配置
                .replace("{original}", &image.original_filename);

            let mut path_file = std::path::PathBuf::from(&filename_candidate);
            if path_file.extension().is_none() {
                path_file.set_extension(ext);
            }

            let final_candidate = path_file
                .file_name()
                .unwrap()
                .to_string_lossy()
                .into_owned();
            let path_candidate = target_dir.join(&final_candidate);

            if !path_candidate.exists() {
                break (path_candidate, final_candidate);
            }

            current_time += chrono::Duration::seconds(1);
        };

        // Move file
        let source = std::path::Path::new(&image.absolute_path);
        if source.exists() {
            if let Err(e) = std::fs::create_dir_all(&target_dir) {
                result.failed_count += 1;
                result
                    .errors
                    .push(format!("{}: Failed to create directory: {}", image_id, e));
                continue;
            }

            if let Err(e) = std::fs::rename(source, &target_path).or_else(|_| {
                std::fs::copy(source, &target_path).and_then(|_| std::fs::remove_file(source))
            }) {
                result.failed_count += 1;
                result
                    .errors
                    .push(format!("{}: Failed to move file: {}", image_id, e));
                continue;
            }
        }

        // Update database
        // Build relative path using Path for cross-platform compatibility
        let relative_path = std::path::Path::new("archived")
            .join(&vendor_path)
            .join(&model_path)
            .join(&new_filename);

        let new_relative = relative_path.to_string_lossy().to_string();
        let new_absolute = target_path.to_string_lossy().to_string();

        if let Err(e) = conn.execute(
            "UPDATE images SET 
                filename = ?, relative_path = ?, absolute_path = ?,
                status = 'archived', archived_at = ?
            WHERE id = ?",
            (&new_filename, &new_relative, &new_absolute, &now, image_id),
        ) {
            result.failed_count += 1;
            result
                .errors
                .push(format!("{}: Failed to update database: {}", image_id, e));
            continue;
        }

        // Log history
        let _ = conn.execute(
            "INSERT INTO processing_history (image_id, action, status, details, created_at) VALUES (?, ?, ?, ?, ?)",
            (image_id, "archive", "success", &format!("Archived to {}", new_relative), &now),
        );

        result.success_count += 1;
    }

    CommandResult::ok(result)
}

// ==================== Delete ====================

#[tauri::command]
pub async fn delete_image(db_path: String, image_id: String) -> CommandResult<bool> {
    let mut conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let image = match fetch_image_by_id(&conn, &image_id) {
        Some(image) => image,
        None => return CommandResult::ok(false),
    };

    let image_path = std::path::Path::new(&image.absolute_path);
    match std::fs::remove_file(image_path) {
        Ok(_) => {}
        Err(e) if e.kind() == ErrorKind::NotFound => {}
        Err(e) => {
            return CommandResult::err(format!(
                "Failed to delete image file '{}': {}",
                image.absolute_path, e
            ))
        }
    }

    let tx = match conn.transaction() {
        Ok(tx) => tx,
        Err(e) => return CommandResult::err(format!("Failed to start transaction: {}", e)),
    };

    let _ = tx.execute(
        "DELETE FROM image_model_relations WHERE image_id = ?",
        [&image_id],
    );
    let _ = tx.execute(
        "DELETE FROM image_tag_relations WHERE image_id = ?",
        [&image_id],
    );
    let _ = tx.execute(
        "DELETE FROM image_prompt_group_relations WHERE image_id = ?",
        [&image_id],
    );
    let _ = tx.execute(
        "DELETE FROM processing_history WHERE image_id = ?",
        [&image_id],
    );

    match tx.execute("DELETE FROM images WHERE id = ?", [&image_id]) {
        Ok(affected) if affected > 0 => {
            if let Err(e) = tx.commit() {
                return CommandResult::err(format!("Failed to commit delete transaction: {}", e));
            }
            CommandResult::ok(true)
        }
        Ok(_) => CommandResult::ok(false),
        Err(e) => CommandResult::err(format!("Failed to delete image: {}", e)),
    }
}

// ==================== Update Missing Formats ====================

#[tauri::command]
pub async fn update_missing_formats(db_path: String) -> CommandResult<usize> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    // Get all images without format
    let mut stmt =
        match conn.prepare("SELECT id, filename FROM images WHERE format IS NULL OR format = ''") {
            Ok(stmt) => stmt,
            Err(e) => return CommandResult::err(format!("Failed to prepare query: {}", e)),
        };

    let images: Vec<(String, String)> =
        match stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?))) {
            Ok(iter) => iter.filter_map(|r| r.ok()).collect(),
            Err(e) => return CommandResult::err(format!("Failed to query images: {}", e)),
        };

    let mut updated_count = 0;

    for (id, filename) in images {
        if let Some(ext) = std::path::Path::new(&filename)
            .extension()
            .and_then(|e| e.to_str())
        {
            let format = ext.to_uppercase();
            if let Ok(_) = conn.execute("UPDATE images SET format = ? WHERE id = ?", (&format, &id))
            {
                updated_count += 1;
            }
        }
    }

    CommandResult::ok(updated_count)
}

// ==================== Unarchive ====================

#[tauri::command]
pub async fn unarchive_images(
    db_path: String,
    inbox_path: String,
    image_ids: Vec<String>,
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

    for image_id in &image_ids {
        // Fetch image
        let image = match fetch_image_by_id(&conn, image_id) {
            Some(img) => img,
            None => {
                result.skipped_count += 1;
                continue;
            }
        };

        // Skip if not archived
        if image.status != "archived" {
            result.skipped_count += 1;
            continue;
        }

        // Build target path in inbox
        let inbox_dir = std::path::Path::new(&inbox_path).join("inbox");

        // Ensure inbox directory exists
        if let Err(e) = std::fs::create_dir_all(&inbox_dir) {
            result.failed_count += 1;
            result.errors.push(format!(
                "{}: Failed to create inbox directory: {}",
                image_id, e
            ));
            continue;
        }

        // Generate unique filename with timestamp
        let timestamp = chrono::Utc::now().timestamp();
        let new_filename = format!("{}_{}", timestamp, image.original_filename);
        let target_path = inbox_dir.join(&new_filename);

        let mut final_path = target_path.clone();
        let mut final_filename = new_filename.clone();
        let mut counter = 1;

        let stem = std::path::Path::new(&new_filename)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&new_filename)
            .to_string();
        let ext = std::path::Path::new(&new_filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png")
            .to_string();

        while ["png", "jpg", "jpeg", "webp", "gif", "bmp"]
            .iter()
            .any(|e| {
                let check_stem = if counter == 1 {
                    stem.clone()
                } else {
                    format!("{}_{}", stem, counter - 1)
                };
                inbox_dir.join(format!("{}.{}", check_stem, e)).exists()
            })
        {
            final_filename = format!("{}_{}.{}", stem, counter, ext);
            final_path = inbox_dir.join(&final_filename);
            counter += 1;
        }

        // Move file back to inbox
        let source = std::path::Path::new(&image.absolute_path);
        if source.exists() {
            if let Err(e) = std::fs::rename(source, &final_path).or_else(|_| {
                std::fs::copy(source, &final_path).and_then(|_| std::fs::remove_file(source))
            }) {
                result.failed_count += 1;
                result
                    .errors
                    .push(format!("{}: Failed to move file: {}", image_id, e));
                continue;
            }
        }

        // Update database
        let new_relative = std::path::Path::new("inbox").join(&final_filename);
        let new_relative_str = new_relative.to_string_lossy().to_string();
        let new_absolute = final_path.to_string_lossy().to_string();

        if let Err(e) = conn.execute(
            "UPDATE images SET 
                filename = ?, relative_path = ?, absolute_path = ?,
                status = 'tagged', archived_at = NULL
            WHERE id = ?",
            (&final_filename, &new_relative_str, &new_absolute, image_id),
        ) {
            result.failed_count += 1;
            result
                .errors
                .push(format!("{}: Failed to update database: {}", image_id, e));
            continue;
        }

        // Log history
        let _ = conn.execute(
            "INSERT INTO processing_history (image_id, action, status, details, created_at) VALUES (?, ?, ?, ?, ?)",
            (image_id, "unarchive", "success", "Moved back to inbox", &now),
        );

        result.success_count += 1;
    }

    CommandResult::ok(result)
}

// ==================== Helpers ====================

fn ensure_unknown_vendor_model(conn: &Connection) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();

    // Check if unknown vendor exists
    let vendor_exists: bool = conn.query_row(
        "SELECT COUNT(*) FROM vendors WHERE id = 'unknown'",
        [],
        |row| {
            let count: i64 = row.get(0)?;
            Ok(count > 0)
        },
    )?;

    if !vendor_exists {
        conn.execute(
            "INSERT INTO vendors (id, name, path, sort_order, is_active, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("unknown", "Unknown", "unknown", 0, 1, &now, &now),
        )?;
    }

    // Check if unknown model exists
    let model_exists: bool = conn.query_row(
        "SELECT COUNT(*) FROM models WHERE id = 'unknown'",
        [],
        |row| {
            let count: i64 = row.get(0)?;
            Ok(count > 0)
        },
    )?;

    if !model_exists {
        conn.execute(
            "INSERT INTO models (id, vendor_id, name, path, version, description, sort_order, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("unknown", "unknown", "Unknown Model", "unknown", "1", "Fallback for unclassified images", 0, 1, &now, &now),
        )?;
    }

    Ok(())
}

fn fetch_images_by_status(conn: &Connection, statuses: &[&str]) -> Vec<ImageResponse> {
    let placeholders: Vec<&str> = statuses.iter().map(|_| "?").collect();
    let sql = format!(
        "SELECT * FROM images WHERE status IN ({}) ORDER BY imported_at DESC",
        placeholders.join(",")
    );

    let mut stmt = match conn.prepare(&sql) {
        Ok(stmt) => stmt,
        Err(e) => {
            eprintln!("Failed to prepare query: {}", e);
            return Vec::new();
        }
    };

    let params: Vec<&dyn rusqlite::types::ToSql> = statuses
        .iter()
        .map(|s| s as &dyn rusqlite::types::ToSql)
        .collect();

    let image_iter = match stmt.query_map(params.as_slice(), |row| {
        Ok(Image {
            id: row.get(0)?,
            filename: row.get(1)?,
            original_filename: row.get(2)?,
            storage_vendor_id: row.get(3)?,
            storage_model_id: row.get(4)?,
            relative_path: row.get(5)?,
            absolute_path: row.get(6)?,
            primary_model_id: row.get(7)?,
            status: row.get(8)?,
            prompt: row.get(9)?,
            negative_prompt: row.get(10)?,
            file_size: row.get(11)?,
            width: row.get(12)?,
            height: row.get(13)?,
            file_hash: row.get(14)?,
            format: row.get(15)?,
            has_watermark: row.get::<_, Option<i32>>(16)?.unwrap_or(0) != 0,
            watermark_platform: row.get(17)?,
            watermark_detected: row.get::<_, Option<i32>>(18)?.unwrap_or(0) != 0,
            watermark_removed: row.get::<_, Option<i32>>(19)?.unwrap_or(0) != 0,
            created_at: row.get(20)?,
            imported_at: row.get(21)?,
            archived_at: row.get(22)?,
        })
    }) {
        Ok(iter) => iter,
        Err(e) => {
            eprintln!("Failed to query images: {}", e);
            return Vec::new();
        }
    };

    let mut images = Vec::new();
    for image_result in image_iter {
        if let Ok(image) = image_result {
            let models = fetch_image_models(conn, &image.id).unwrap_or_default();
            let tags = fetch_image_tags(conn, &image.id).unwrap_or_default();
            let prompt_groups = fetch_image_prompt_groups(conn, &image.id).unwrap_or_default();
            images.push(ImageResponse {
                image,
                models,
                tags,
                prompt_groups,
            });
        }
    }

    images
}

fn fetch_image_by_id(conn: &Connection, image_id: &str) -> Option<Image> {
    conn.query_row("SELECT * FROM images WHERE id = ?", [image_id], |row| {
        Ok(Image {
            id: row.get(0)?,
            filename: row.get(1)?,
            original_filename: row.get(2)?,
            storage_vendor_id: row.get(3)?,
            storage_model_id: row.get(4)?,
            relative_path: row.get(5)?,
            absolute_path: row.get(6)?,
            primary_model_id: row.get(7)?,
            status: row.get(8)?,
            prompt: row.get(9)?,
            negative_prompt: row.get(10)?,
            file_size: row.get(11)?,
            width: row.get(12)?,
            height: row.get(13)?,
            file_hash: row.get(14)?,
            format: row.get(15)?,
            has_watermark: row.get::<_, Option<i32>>(16)?.unwrap_or(0) != 0,
            watermark_platform: row.get(17)?,
            watermark_detected: row.get::<_, Option<i32>>(18)?.unwrap_or(0) != 0,
            watermark_removed: row.get::<_, Option<i32>>(19)?.unwrap_or(0) != 0,
            created_at: row.get(20)?,
            imported_at: row.get(21)?,
            archived_at: row.get(22)?,
        })
    })
    .ok()
}

fn fetch_image_models(conn: &Connection, image_id: &str) -> Result<Vec<ModelInfo>> {
    let mut stmt = conn.prepare(
        "SELECT m.id, m.name, r.is_primary 
         FROM models m 
         JOIN image_model_relations r ON m.id = r.model_id 
         WHERE r.image_id = ?",
    )?;

    let models = stmt.query_map([image_id], |row| {
        Ok(ModelInfo {
            id: row.get(0)?,
            name: row.get(1)?,
            is_primary: row.get::<_, i32>(2)? != 0,
        })
    })?;

    models.collect()
}

fn fetch_image_prompt_groups(conn: &Connection, image_id: &str) -> Result<Vec<PromptGroup>> {
    let mut stmt = conn.prepare(
        "SELECT
            pg.id,
            pg.prompt,
            pg.negative_prompt,
            pg.name,
            pg.description,
            pg.template_schema,
            pg.category,
            pg.tags,
            pg.price,
            pg.is_published,
            pg.publish_status,
            pg.remote_slug,
            pg.remote_url,
            pg.last_published_at,
            (
                SELECT COUNT(*)
                FROM image_prompt_group_relations ipgr2
                WHERE ipgr2.prompt_group_id = pg.id
            ) as image_count,
            pg.created_at,
            pg.updated_at
         FROM prompt_groups pg
         INNER JOIN image_prompt_group_relations ipgr ON pg.id = ipgr.prompt_group_id
         WHERE ipgr.image_id = ?
         ORDER BY pg.updated_at DESC",
    )?;

    let groups = stmt.query_map([image_id], |row| {
        Ok(PromptGroup {
            id: row.get(0)?,
            prompt: row.get(1)?,
            negative_prompt: row.get(2)?,
            name: row.get(3)?,
            description: row.get(4)?,
            template_schema: row.get(5)?,
            category: row.get(6)?,
            tags: row.get(7)?,
            price: row.get(8)?,
            is_published: row.get(9)?,
            publish_status: row.get(10)?,
            remote_slug: row.get(11)?,
            remote_url: row.get(12)?,
            last_published_at: row.get(13)?,
            image_count: row.get(14)?,
            created_at: row.get(15)?,
            updated_at: row.get(16)?,
        })
    })?;

    groups.collect()
}

fn fetch_image_tags(conn: &Connection, image_id: &str) -> Result<Vec<Tag>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.name_en, t.color 
         FROM tags t 
         JOIN image_tag_relations r ON t.id = r.tag_id 
         WHERE r.image_id = ?",
    )?;

    let tags = stmt.query_map([image_id], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            name_en: row.get(2)?,
            color: row.get(3)?,
            parent_id: None,
            use_count: 0,
            is_builtin: false,
            created_at: String::new(),
        })
    })?;

    tags.collect()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SimpleImageInfo {
    pub filename: String,
    pub absolute_path: String,
}

#[tauri::command]
pub fn get_all_images(db_path: String) -> CommandResult<Vec<SimpleImageInfo>> {
    let conn = match Connection::open(std::path::Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let mut all_images = Vec::new();

    // 1. 查询 images 表
    if let Ok(mut stmt) = conn.prepare("SELECT filename, absolute_path FROM images") {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok(SimpleImageInfo {
                filename: row.get(0)?,
                absolute_path: row.get(1)?,
            })
        }) {
            for row in rows {
                if let Ok(info) = row {
                    all_images.push(info);
                }
            }
        }
    }

    // Helper closure to extract filename from absolute path
    let get_filename = |path: &str| -> String {
        std::path::Path::new(path)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string()
    };

    // 2. 查询 ip_character_sheets 表
    if let Ok(mut stmt) = conn.prepare("SELECT image_path FROM ip_character_sheets") {
        if let Ok(rows) = stmt.query_map([], |row| {
            let path: String = row.get(0)?;
            Ok(SimpleImageInfo {
                filename: get_filename(&path),
                absolute_path: path,
            })
        }) {
            for row in rows {
                if let Ok(info) = row {
                    all_images.push(info);
                }
            }
        }
    }

    // 3. 查询 ip_creations 表
    if let Ok(mut stmt) = conn.prepare("SELECT image_path FROM ip_creations") {
        if let Ok(rows) = stmt.query_map([], |row| {
            let path: String = row.get(0)?;
            Ok(SimpleImageInfo {
                filename: get_filename(&path),
                absolute_path: path,
            })
        }) {
            for row in rows {
                if let Ok(info) = row {
                    all_images.push(info);
                }
            }
        }
    }

    // 4. 查询 ip_emojis 表
    if let Ok(mut stmt) = conn.prepare("SELECT image_path FROM ip_emojis") {
        if let Ok(rows) = stmt.query_map([], |row| {
            let path: String = row.get(0)?;
            Ok(SimpleImageInfo {
                filename: get_filename(&path),
                absolute_path: path,
            })
        }) {
            for row in rows {
                if let Ok(info) = row {
                    all_images.push(info);
                }
            }
        }
    }

    CommandResult::ok(all_images)
}

#[tauri::command]
pub async fn update_image_file(
    db_path: String,
    request: UpdateImageFileRequest,
) -> CommandResult<ImageResponse> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    if let Err(e) = conn.execute(
        "UPDATE images SET 
            filename = ?, relative_path = ?, absolute_path = ?, format = ?, file_size = ?
        WHERE id = ?",
        rusqlite::params![
            &request.new_filename,
            &request.new_relative_path,
            &request.new_absolute_path,
            &request.new_format,
            request.new_file_size,
            &request.image_id
        ],
    ) {
        return CommandResult::err(format!("Failed to update database: {}", e));
    }

    let image = match fetch_image_by_id(&conn, &request.image_id) {
        Some(img) => img,
        None => return CommandResult::err("Failed to fetch updated image".to_string()),
    };

    let models = fetch_image_models(&conn, &request.image_id).unwrap_or_default();
    let tags = fetch_image_tags(&conn, &request.image_id).unwrap_or_default();
    let prompt_groups = fetch_image_prompt_groups(&conn, &request.image_id).unwrap_or_default();

    CommandResult::ok(ImageResponse {
        image,
        models,
        tags,
        prompt_groups,
    })
}

