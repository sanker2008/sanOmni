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
         FROM vendors ORDER BY sort_order ASC, name ASC"
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
         FROM models WHERE vendor_id = ? ORDER BY sort_order ASC, name ASC"
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

