const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src-tauri/src/commands/vendors.rs');
let content = fs.readFileSync(filePath, 'utf8');
content = content.replace(/\r\n/g, '\n');

const startStr = `#[tauri::command]
pub async fn delete_model_cascade(
    db_path: String,
    model_id: String,
    action: String,
) -> CommandResult<bool> {`;

const endStr = `        Err(e) => CommandResult::err(format!("Failed to delete model: {}", e)),
    }
}`;

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr) + endStr.length;

if (startIndex === -1 || endIndex < startStr.length) {
    console.error("Could not find the function block!");
    process.exit(1);
}

const newFunction = `#[tauri::command]
pub async fn delete_model_cascade(
    db_path: String,
    model_id: String,
    action: String,
) -> CommandResult<bool> {
    
    let mut image_ids_to_delete = Vec::new();
    
    if action == "delete_images" {
        let conn = match Connection::open(&db_path) {
            Ok(conn) => conn,
            Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
        };
        let mut stmt = match conn.prepare("SELECT image_id FROM image_model_relations WHERE model_id = ?") {
            Ok(stmt) => stmt,
            Err(e) => return CommandResult::err(format!("Failed to prepare query: {}", e)),
        };
        image_ids_to_delete = stmt.query_map([&model_id], |row| row.get(0))
            .map(|iter| iter.filter_map(Result::ok).collect())
            .unwrap_or_default();
    }
    
    // Now no DB connection is open across the .await!
    if action == "delete_images" {
        for img_id in image_ids_to_delete {
            let _ = super::images::delete_image(db_path.clone(), img_id).await;
        }
    } else if action == "move_to_unknown" {
        let conn = match Connection::open(&db_path) {
            Ok(conn) => conn,
            Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
        };
        let mut stmt = match conn.prepare("SELECT id FROM images WHERE primary_model_id = ?") {
            Ok(stmt) => stmt,
            Err(e) => return CommandResult::err(format!("Failed to prepare query: {}", e)),
        };
        let image_ids: Vec<String> = stmt.query_map([&model_id], |row| row.get(0))
            .map(|iter| iter.filter_map(Result::ok).collect())
            .unwrap_or_default();
            
        for img_id in image_ids {
            let mut other_models_stmt = conn.prepare(
                "SELECT model_id FROM image_model_relations WHERE image_id = ? AND model_id != ?"
            ).unwrap();
            let other_models: Vec<String> = other_models_stmt.query_map([&img_id, &model_id], |row| row.get(0))
                .map(|iter| iter.filter_map(Result::ok).collect())
                .unwrap_or_default();
                
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
        let _ = conn.execute("DELETE FROM image_model_relations WHERE model_id = ?", [&model_id]);
    }
    
    // Finally soft delete the model
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };
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
}`;

content = content.slice(0, startIndex) + newFunction + content.slice(endIndex);

fs.writeFileSync(filePath, content, 'utf8');
console.log("Successfully fixed delete_model_cascade in vendors.rs");
