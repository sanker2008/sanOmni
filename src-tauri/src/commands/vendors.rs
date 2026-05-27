use crate::commands::CommandResult;
use crate::models::{Vendor, Model};
use rusqlite::{Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct VendorWithModels {
    #[serde(flatten)]
    pub vendor: Vendor,
    pub models: Vec<Model>,
}

#[tauri::command]
pub async fn get_vendors(db_path: String) -> CommandResult<Vec<VendorWithModels>> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let mut stmt = match conn.prepare(
        "SELECT id, name, path, icon, sort_order, is_active, created_at, updated_at 
         FROM vendors WHERE is_active = 1 ORDER BY sort_order ASC, name ASC"
    ) {
        Ok(stmt) => stmt,
        Err(e) => return CommandResult::err(format!("Failed to prepare query: {}", e)),
    };

    let vendor_iter = stmt.query_map([], |row| {
        Ok(Vendor {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            icon: row.get(3)?,
            sort_order: row.get(4)?,
            is_active: row.get::<_, i32>(5)? != 0,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    }).unwrap();

    let mut vendors = Vec::new();
    for vendor_result in vendor_iter {
        if let Ok(vendor) = vendor_result {
            let models = fetch_models_by_vendor(&conn, &vendor.id).unwrap_or_default();
            vendors.push(VendorWithModels { vendor, models });
        }
    }

    CommandResult::ok(vendors)
}

fn fetch_models_by_vendor(conn: &Connection, vendor_id: &str) -> rusqlite::Result<Vec<Model>> {
    let mut stmt = conn.prepare(
        "SELECT id, vendor_id, name, path, version, description, sort_order, is_active, created_at, updated_at 
         FROM models WHERE vendor_id = ? AND is_active = 1 ORDER BY sort_order ASC, name ASC"
    )?;

    let models = stmt.query_map([vendor_id], |row| {
        Ok(Model {
            id: row.get(0)?,
            vendor_id: row.get(1)?,
            name: row.get(2)?,
            path: row.get(3)?,
            version: row.get(4)?,
            description: row.get(5)?,
            sort_order: row.get(6)?,
            is_active: row.get::<_, i32>(7)? != 0,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    })?;

    models.collect()
}

#[tauri::command]
pub async fn add_vendor(db_path: String, name: String, path: String) -> CommandResult<Vendor> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let id = path.to_lowercase().replace(" ", "-");
    let now = chrono::Utc::now().to_rfc3339();

    match conn.execute(
        "INSERT INTO vendors (id, name, path, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
        (&id, &name, &path, &now, &now),
    ) {
        Ok(_) => CommandResult::ok(Vendor {
            id,
            name,
            path,
            icon: None,
            sort_order: 0,
            is_active: true,
            created_at: now.clone(),
            updated_at: now,
        }),
        Err(e) => CommandResult::err(format!("Failed to add vendor: {}", e)),
    }
}

#[tauri::command]
pub async fn update_vendor(
    db_path: String,
    vendor_id: String,
    name: String,
    path: String,
) -> CommandResult<Vendor> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let now = chrono::Utc::now().to_rfc3339();

    match conn.execute(
        "UPDATE vendors SET name = ?, path = ?, updated_at = ? WHERE id = ?",
        (&name, &path, &now, &vendor_id),
    ) {
        Ok(rows) => {
            if rows == 0 {
                return CommandResult::err("Vendor not found".to_string());
            }
            
            // Fetch the updated vendor
            let mut stmt = match conn.prepare(
                "SELECT id, name, path, icon, sort_order, is_active, created_at, updated_at FROM vendors WHERE id = ?"
            ) {
                Ok(stmt) => stmt,
                Err(e) => return CommandResult::err(format!("Failed to fetch updated vendor: {}", e)),
            };

            match stmt.query_row([&vendor_id], |row| {
                Ok(Vendor {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    path: row.get(2)?,
                    icon: row.get(3)?,
                    sort_order: row.get(4)?,
                    is_active: row.get::<_, i32>(5)? != 0,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            }) {
                Ok(vendor) => CommandResult::ok(vendor),
                Err(e) => CommandResult::err(format!("Failed to fetch updated vendor: {}", e)),
            }
        }
        Err(e) => CommandResult::err(format!("Failed to update vendor: {}", e)),
    }
}

#[tauri::command]
pub async fn delete_vendor(db_path: String, vendor_id: String) -> CommandResult<bool> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    // Soft delete by setting is_active to 0
    match conn.execute(
        "UPDATE vendors SET is_active = 0 WHERE id = ?",
        [&vendor_id],
    ) {
        Ok(rows) => {
            if rows == 0 {
                CommandResult::err("Vendor not found".to_string())
            } else {
                CommandResult::ok(true)
            }
        }
        Err(e) => CommandResult::err(format!("Failed to delete vendor: {}", e)),
    }
}

#[tauri::command]
pub async fn add_model(
    db_path: String,
    vendor_id: String,
    name: String,
    path: String,
    description: Option<String>,
) -> CommandResult<Model> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let id = format!("{}-{}", vendor_id, path.to_lowercase().replace(" ", "-"));
    let now = chrono::Utc::now().to_rfc3339();

    match conn.execute(
        "INSERT INTO models (id, vendor_id, name, path, description, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
        (&id, &vendor_id, &name, &path, &description, &now, &now),
    ) {
        Ok(_) => CommandResult::ok(Model {
            id,
            vendor_id,
            name,
            path,
            version: None,
            description,
            sort_order: 0,
            is_active: true,
            created_at: now.clone(),
            updated_at: now,
        }),
        Err(e) => CommandResult::err(format!("Failed to add model: {}", e)),
    }
}

#[tauri::command]
pub async fn update_model(
    db_path: String,
    model_id: String,
    name: String,
    path: String,
    description: Option<String>,
) -> CommandResult<Model> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let now = chrono::Utc::now().to_rfc3339();

    match conn.execute(
        "UPDATE models SET name = ?, path = ?, description = ?, updated_at = ? WHERE id = ?",
        (&name, &path, &description, &now, &model_id),
    ) {
        Ok(rows) => {
            if rows == 0 {
                return CommandResult::err("Model not found".to_string());
            }
            
            // Fetch the updated model
            let mut stmt = match conn.prepare(
                "SELECT id, vendor_id, name, path, version, description, sort_order, is_active, created_at, updated_at FROM models WHERE id = ?"
            ) {
                Ok(stmt) => stmt,
                Err(e) => return CommandResult::err(format!("Failed to fetch updated model: {}", e)),
            };

            match stmt.query_row([&model_id], |row| {
                Ok(Model {
                    id: row.get(0)?,
                    vendor_id: row.get(1)?,
                    name: row.get(2)?,
                    path: row.get(3)?,
                    version: row.get(4)?,
                    description: row.get(5)?,
                    sort_order: row.get(6)?,
                    is_active: row.get::<_, i32>(7)? != 0,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            }) {
                Ok(model) => CommandResult::ok(model),
                Err(e) => CommandResult::err(format!("Failed to fetch updated model: {}", e)),
            }
        }
        Err(e) => CommandResult::err(format!("Failed to update model: {}", e)),
    }
}

#[tauri::command]
pub async fn delete_model(db_path: String, model_id: String) -> CommandResult<bool> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    // Soft delete by setting is_active to 0
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
            
            let new_vendor = if new_primary == "unknown" {
                "unknown".to_string()
            } else {
                conn.query_row(
                    "SELECT vendor_id FROM models WHERE id = ?",
                    [&new_primary],
                    |row| row.get::<_, String>(0)
                ).unwrap_or_else(|_| "unknown".to_string())
            };
            
            let _ = conn.execute(
                "UPDATE images SET primary_model_id = ?, storage_model_id = ?, storage_vendor_id = ? WHERE id = ?",
                [&new_primary, &new_primary, &new_vendor, &img_id]
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
}

#[tauri::command]
pub async fn check_vendor_usage(db_path: String, vendor_id: String) -> CommandResult<i64> {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(e) => return CommandResult::err(format!("Failed to open database: {}", e)),
    };

    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM images WHERE storage_vendor_id = ?",
        [&vendor_id],
        |row| row.get(0),
    ).unwrap_or(0);

    CommandResult::ok(count)
}




