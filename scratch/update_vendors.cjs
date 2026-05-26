const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src-tauri/src/commands/vendors.rs');
let content = fs.readFileSync(filePath, 'utf8');
content = content.replace(/\r\n/g, '\n');

// 1. Fix get_vendors
content = content.replace(
  'SELECT id, name, path, icon, sort_order, is_active, created_at, updated_at \n         FROM vendors ORDER BY sort_order ASC, name ASC',
  'SELECT id, name, path, icon, sort_order, is_active, created_at, updated_at \n         FROM vendors WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'
);

// 2. Fix fetch_models_by_vendor
content = content.replace(
  'SELECT id, vendor_id, name, path, version, description, sort_order, is_active, created_at, updated_at \n         FROM models WHERE vendor_id = ? ORDER BY sort_order ASC, name ASC',
  'SELECT id, vendor_id, name, path, version, description, sort_order, is_active, created_at, updated_at \n         FROM models WHERE vendor_id = ? AND is_active = 1 ORDER BY sort_order ASC, name ASC'
);

// 3. Append new commands
const appendStr = `

// ==================== Cascade Deletion ====================

#[tauri::command]
pub async fn check_model_usage(db_path: String, model_id: String) -> CommandResult<i64> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM image_model_relations WHERE model_id = ?",
        [&model_id],
        |row| row.get(0),
    ).unwrap_or(0);

    CommandResult::ok(count)
}

#[tauri::command]
pub async fn delete_model_cascade(
    db_path: String,
    model_id: String,
    action: String,
) -> CommandResult<bool> {
    let mut conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    if action == "delete_images" {
        // Find all images that have this model
        let mut stmt = match conn.prepare("SELECT image_id FROM image_model_relations WHERE model_id = ?") {
            Ok(stmt) => stmt,
            Err(e) => return CommandResult::err(format!("Failed to prepare query: {}", e)),
        };
        
        let image_ids: Vec<String> = stmt.query_map([&model_id], |row| row.get(0))
            .unwrap_or_default()
            .filter_map(Result::ok)
            .collect();
            
        // Call delete_image for each
        for img_id in image_ids {
            let _ = super::images::delete_image(db_path.clone(), img_id).await;
        }
    } else if action == "move_to_unknown" {
        // Find all images where this is the primary model
        let mut stmt = match conn.prepare("SELECT id FROM images WHERE primary_model_id = ?") {
            Ok(stmt) => stmt,
            Err(e) => return CommandResult::err(format!("Failed to prepare query: {}", e)),
        };
        
        let image_ids: Vec<String> = stmt.query_map([&model_id], |row| row.get(0))
            .unwrap_or_default()
            .filter_map(Result::ok)
            .collect();
            
        for img_id in image_ids {
            // Check if it has other models
            let mut other_models_stmt = conn.prepare(
                "SELECT model_id FROM image_model_relations WHERE image_id = ? AND model_id != ?"
            ).unwrap();
            
            let other_models: Vec<String> = other_models_stmt.query_map([&img_id, &model_id], |row| row.get(0))
                .unwrap_or_default()
                .filter_map(Result::ok)
                .collect();
                
            let new_primary = if !other_models.is_empty() {
                other_models[0].clone()
            } else {
                "unknown".to_string()
            };
            
            let _ = conn.execute(
                "UPDATE images SET primary_model_id = ? WHERE id = ?",
                [&new_primary, &img_id]
            );
            
            if new_primary == "unknown" {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO image_model_relations (image_id, model_id, is_primary) VALUES (?, 'unknown', 1)",
                    [&img_id]
                );
            } else {
                let _ = conn.execute(
                    "UPDATE image_model_relations SET is_primary = 1 WHERE image_id = ? AND model_id = ?",
                    [&img_id, &new_primary]
                );
            }
        }
        
        // Remove the relations for the deleted model
        let _ = conn.execute("DELETE FROM image_model_relations WHERE model_id = ?", [&model_id]);
    }

    // Finally, soft delete the model
    match conn.execute(
        "UPDATE models SET is_active = 0 WHERE id = ?",
        [&model_id],
    ) {
        Ok(rows) => {
            if rows == 0 {
                CommandResult::err("Model not found".to_string())
            } else {
                CommandResult::ok(true)
            }
        }
        Err(e) => CommandResult::err(format!("Failed to delete model: {}", e)),
    }
}
`;

content += appendStr;
fs.writeFileSync(filePath, content, 'utf8');
console.log("Successfully updated vendors.rs");
