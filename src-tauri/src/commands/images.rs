use crate::commands::CommandResult;
use crate::models::{Image, ModelInfo, Tag};
use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportImageRequest {
    pub file_path: String,
    pub file_name: String,
    pub file_size: i64,
    pub vendor_id: Option<String>,
    pub model_ids: Vec<String>,
    pub primary_model_id: Option<String>,
    pub prompt: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateImageRequest {
    pub image_id: String,
    pub prompt: Option<String>,
    pub model_ids: Vec<String>,
    pub primary_model_id: Option<String>,
    pub tags: Vec<String>,
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

    let uuid_str = Uuid::new_v4().to_string().replace("-", "");
    let image_id = format!("img_{}", &uuid_str[..12]);
    let now = chrono::Utc::now().to_rfc3339();

    let primary_model_id = request.primary_model_id
        .or_else(|| request.model_ids.first().cloned())
        .unwrap_or_else(|| "unknown".to_string());

    let vendor_id: String = conn.query_row(
        "SELECT vendor_id FROM models WHERE id = ?",
        [&primary_model_id],
        |row| row.get(0),
    ).unwrap_or_else(|_| "unknown".to_string());

    let relative_path = format!("inbox/{}/{}", vendor_id, request.file_name);

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
        prompt: request.prompt,
        negative_prompt: None,
        file_size: Some(request.file_size),
        width: None,
        height: None,
        file_hash: None,
        format: None,
        has_watermark: false,
        watermark_platform: None,
        watermark_detected: false,
        watermark_removed: false,
        created_at: now.clone(),
        imported_at: now.clone(),
        archived_at: None,
    };

    // Insert required fields first (within 16-param limit)
    if let Err(e) = conn.execute(
        "INSERT INTO images (
            id, filename, original_filename, storage_vendor_id, storage_model_id,
            relative_path, absolute_path, primary_model_id, status, prompt,
            negative_prompt, file_size, width, height, file_hash, format
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![
            &image.id, &image.filename, &image.original_filename,
            &image.storage_vendor_id, &image.storage_model_id,
            &image.relative_path, &image.absolute_path, &image.primary_model_id,
            &image.status, &image.prompt, &image.negative_prompt,
            image.file_size, image.width, image.height, &image.file_hash, &image.format,
        ],
    ) {
        return CommandResult::err(format!("Failed to insert image: {}", e));
    }

    // Update optional fields separately
    if let Err(e) = conn.execute(
        "UPDATE images SET
            has_watermark = ?, watermark_platform = ?,
            watermark_detected = ?, watermark_removed = ?,
            created_at = ?, imported_at = ?, archived_at = ?
        WHERE id = ?",
        rusqlite::params![
            image.has_watermark as i32, &image.watermark_platform,
            image.watermark_detected as i32, image.watermark_removed as i32,
            &image.created_at, &image.imported_at, &image.archived_at,
            &image.id,
        ],
    ) {
        return CommandResult::err(format!("Failed to update image optional fields: {}", e));
    }

    for model_id in &request.model_ids {
        let is_primary = model_id == &primary_model_id;
        let _ = conn.execute(
            "INSERT INTO image_model_relations (image_id, model_id, is_primary) VALUES (?, ?, ?)",
            (&image_id, model_id, is_primary as i32),
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

    CommandResult::ok(ImageResponse { image, models, tags })
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

    // Update prompt
    if let Some(ref prompt) = request.prompt {
        let _ = conn.execute(
            "UPDATE images SET prompt = ?, status = 'tagged' WHERE id = ?",
            (prompt, image_id),
        );
    } else {
        // Even without prompt change, mark as tagged if we have models
        if !request.model_ids.is_empty() {
            let _ = conn.execute(
                "UPDATE images SET status = 'tagged' WHERE id = ?",
                [image_id],
            );
        }
    }

    // Update model relations
    if !request.model_ids.is_empty() {
        // Delete old relations
        let _ = conn.execute(
            "DELETE FROM image_model_relations WHERE image_id = ?",
            [image_id],
        );

        // Insert new relations
        let primary = request.primary_model_id
            .or_else(|| request.model_ids.first().cloned())
            .unwrap_or_else(|| "unknown".to_string());

        for model_id in &request.model_ids {
            let is_primary = model_id == &primary;
            let _ = conn.execute(
                "INSERT INTO image_model_relations (image_id, model_id, is_primary) VALUES (?, ?, ?)",
                (image_id, model_id, is_primary as i32),
            );
        }

        // Update primary model and storage info
        let vendor_id: String = conn.query_row(
            "SELECT vendor_id FROM models WHERE id = ?",
            [&primary],
            |row| row.get(0),
        ).unwrap_or_else(|_| "unknown".to_string());

        let _ = conn.execute(
            "UPDATE images SET primary_model_id = ?, storage_vendor_id = ?, storage_model_id = ? WHERE id = ?",
            (&primary, &vendor_id, &primary, image_id),
        );
    }

    // Update tags
    if !request.tags.is_empty() {
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

    CommandResult::ok(ImageResponse { image, models, tags })
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
    let template = request.naming_template.unwrap_or_else(|| "{vendor}-{model}-{date}-{index}".to_string());

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

        // Get vendor and model path
        let vendor_path: String = conn.query_row(
            "SELECT path FROM vendors WHERE id = ?",
            [&image.storage_vendor_id],
            |row| row.get(0),
        ).unwrap_or_else(|_| image.storage_vendor_id.clone());

        let model_path: String = conn.query_row(
            "SELECT path FROM models WHERE id = ?",
            [&image.storage_model_id],
            |row| row.get(0),
        ).unwrap_or_else(|_| image.storage_model_id.clone());

        // Build target directory
        let target_dir = std::path::Path::new(&library_path)
            .join("archived")
            .join(&vendor_path)
            .join(&model_path);

        // Generate new filename
        let date = &image.created_at[..10]; // YYYY-MM-DD
        let new_filename = template
            .replace("{vendor}", &vendor_path)
            .replace("{model}", &model_path)
            .replace("{date}", date)
            .replace("{index}", &format!("{:03}", result.success_count + 1))
            .replace("{original}", &image.original_filename);

        // Ensure extension
        let ext = std::path::Path::new(&image.filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png");
        let new_filename = if new_filename.contains('.') {
            new_filename
        } else {
            format!("{}.{}", new_filename, ext)
        };

        let target_path = target_dir.join(&new_filename);

        // Move file
        let source = std::path::Path::new(&image.absolute_path);
        if source.exists() {
            if let Err(e) = std::fs::create_dir_all(&target_dir) {
                result.failed_count += 1;
                result.errors.push(format!("{}: Failed to create directory: {}", image_id, e));
                continue;
            }

            if let Err(e) = std::fs::rename(source, &target_path) {
                result.failed_count += 1;
                result.errors.push(format!("{}: Failed to move file: {}", image_id, e));
                continue;
            }
        }

        // Update database
        let new_relative = format!("archived/{}/{}{}", vendor_path, model_path, new_filename);
        let new_absolute = target_path.to_string_lossy().to_string();

        if let Err(e) = conn.execute(
            "UPDATE images SET 
                filename = ?, relative_path = ?, absolute_path = ?,
                status = 'archived', archived_at = ?
            WHERE id = ?",
            (&new_filename, &new_relative, &new_absolute, &now, image_id),
        ) {
            result.failed_count += 1;
            result.errors.push(format!("{}: Failed to update database: {}", image_id, e));
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
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    // Delete relations first
    let _ = conn.execute("DELETE FROM image_model_relations WHERE image_id = ?", [&image_id]);
    let _ = conn.execute("DELETE FROM image_tag_relations WHERE image_id = ?", [&image_id]);
    let _ = conn.execute("DELETE FROM processing_history WHERE image_id = ?", [&image_id]);

    // Delete image record
    match conn.execute("DELETE FROM images WHERE id = ?", [&image_id]) {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("Failed to delete image: {}", e)),
    }
}

// ==================== Helpers ====================

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

    let params: Vec<&dyn rusqlite::types::ToSql> = statuses.iter().map(|s| s as &dyn rusqlite::types::ToSql).collect();

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
            has_watermark: row.get::<_, i32>(16)? != 0,
            watermark_platform: row.get(17)?,
            watermark_detected: row.get::<_, i32>(18)? != 0,
            watermark_removed: row.get::<_, i32>(19)? != 0,
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
            images.push(ImageResponse { image, models, tags });
        }
    }

    images
}

fn fetch_image_by_id(conn: &Connection, image_id: &str) -> Option<Image> {
    conn.query_row(
        "SELECT * FROM images WHERE id = ?",
        [image_id],
        |row| {
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
                has_watermark: row.get::<_, i32>(16)? != 0,
                watermark_platform: row.get(17)?,
                watermark_detected: row.get::<_, i32>(18)? != 0,
                watermark_removed: row.get::<_, i32>(19)? != 0,
                created_at: row.get(20)?,
                imported_at: row.get(21)?,
                archived_at: row.get(22)?,
            })
        },
    ).ok()
}

fn fetch_image_models(conn: &Connection, image_id: &str) -> Result<Vec<ModelInfo>> {
    let mut stmt = conn.prepare(
        "SELECT m.id, m.name, r.is_primary 
         FROM models m 
         JOIN image_model_relations r ON m.id = r.model_id 
         WHERE r.image_id = ?"
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

fn fetch_image_tags(conn: &Connection, image_id: &str) -> Result<Vec<Tag>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.name_en, t.color 
         FROM tags t 
         JOIN image_tag_relations r ON t.id = r.tag_id 
         WHERE r.image_id = ?"
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
