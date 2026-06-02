use tauri::{AppHandle, Manager};
use rusqlite::{params, Connection};
use uuid::Uuid;
use chrono::Utc;

use crate::models::{Character, CharacterWithRelations};

fn get_connection(app_handle: &AppHandle) -> Result<Connection, String> {
    let default_app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let app_root = crate::commands::get_app_root_from_handle(app_handle, &default_app_data_dir);
    let db_path = app_root.join("data").join("database.sqlite");
    Connection::open(db_path).map_err(|e| e.to_string())
}

// Path resolver helper
fn resolve_relative_paths_json(app_data_dir: &std::path::Path, paths_json: Option<String>) -> Option<String> {
    if let Some(json_str) = paths_json {
        if let Ok(paths) = serde_json::from_str::<Vec<String>>(&json_str) {
            let abs_paths: Vec<String> = paths.into_iter().map(|p| {
                let normalized = p.replace('/', &std::path::MAIN_SEPARATOR.to_string())
                                  .replace('\\', &std::path::MAIN_SEPARATOR.to_string());
                app_data_dir.join(normalized).to_string_lossy().to_string()
            }).collect();
            serde_json::to_string(&abs_paths).ok()
        } else {
            Some(json_str)
        }
    } else {
        None
    }
}

#[tauri::command]
pub async fn create_character(
    app_handle: AppHandle,
    work_id: String,
    name: String,
    character_type: Option<String>,
    description: Option<String>,
    appearance_info: Option<String>,
    ip_id: Option<String>,
    ip_relation_note: Option<String>,
) -> Result<Character, String> {
    let conn = get_connection(&app_handle)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    
    // Get current max display_order
    let max_order: i32 = conn.query_row(
        "SELECT COALESCE(MAX(display_order), -1) FROM characters WHERE work_id = ?1 AND deleted_at IS NULL",
        params![work_id],
        |row| row.get(0),
    ).unwrap_or(-1);
    
    conn.execute(
        "INSERT INTO characters (id, work_id, name, character_type, description, 
         appearance_info, ip_id, ip_relation_note, display_order, created_at, updated_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![id, work_id, name, character_type, description, 
                appearance_info, ip_id, ip_relation_note, max_order + 1, now, now],
    ).map_err(|e| e.to_string())?;
    
    get_character_by_id(app_handle, id).await.map(|c| c.character)
}

#[tauri::command]
pub async fn get_characters(
    app_handle: AppHandle,
    work_id: String,
) -> Result<Vec<CharacterWithRelations>, String> {
    let conn = get_connection(&app_handle)?;
    let base_app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let app_data_dir = crate::commands::get_works_root_from_handle(&app_handle, &base_app_data_dir);
    
    let mut stmt = conn.prepare(
        "SELECT c.id, c.work_id, c.name, c.character_type, c.description, c.appearance_info,
         c.image_paths, c.ip_id, c.ip_relation_note, c.display_order, c.created_at, c.updated_at, c.deleted_at,
         w.name as work_name, w.work_type, ip.name as ip_name, ip.avatar_path as ip_avatar_path
         FROM characters c
         INNER JOIN works w ON c.work_id = w.id
         LEFT JOIN ip_assets ip ON c.ip_id = ip.id
         WHERE c.work_id = ? AND c.deleted_at IS NULL
         ORDER BY c.display_order ASC"
    ).map_err(|e| e.to_string())?;
    
    let characters = stmt.query_map(params![work_id], |row| {
        let image_paths_raw: Option<String> = row.get(6)?;
        let resolved_image_paths = resolve_relative_paths_json(&app_data_dir, image_paths_raw);
        Ok(CharacterWithRelations {
            character: Character {
                id: row.get(0)?,
                work_id: row.get(1)?,
                name: row.get(2)?,
                character_type: row.get(3)?,
                description: row.get(4)?,
                appearance_info: row.get(5)?,
                image_paths: resolved_image_paths,
                ip_id: row.get(7)?,
                ip_relation_note: row.get(8)?,
                display_order: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                deleted_at: row.get(12)?,
            },
            work_name: row.get(13)?,
            work_type: row.get(14)?,
            ip_name: row.get(15)?,
            ip_avatar_path: row.get(16)?,
        })
    }).map_err(|e| e.to_string())?;
    
    characters.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_characters(app_handle: AppHandle) -> Result<Vec<CharacterWithRelations>, String> {
    let conn = get_connection(&app_handle)?;
    let base_app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let app_data_dir = crate::commands::get_works_root_from_handle(&app_handle, &base_app_data_dir);
    
    let mut stmt = conn.prepare(
        "SELECT c.id, c.work_id, c.name, c.character_type, c.description, c.appearance_info,
         c.image_paths, c.ip_id, c.ip_relation_note, c.display_order, c.created_at, c.updated_at, c.deleted_at,
         w.name as work_name, w.work_type, ip.name as ip_name, ip.avatar_path as ip_avatar_path
         FROM characters c
         INNER JOIN works w ON c.work_id = w.id
         LEFT JOIN ip_assets ip ON c.ip_id = ip.id
         WHERE c.deleted_at IS NULL
         ORDER BY w.created_at DESC, c.display_order ASC"
    ).map_err(|e| e.to_string())?;

    let characters = stmt.query_map([], |row| {
        let image_paths_raw: Option<String> = row.get(6)?;
        let resolved_image_paths = resolve_relative_paths_json(&app_data_dir, image_paths_raw);
        
        Ok(CharacterWithRelations {
            character: Character {
                id: row.get(0)?,
                work_id: row.get(1)?,
                name: row.get(2)?,
                character_type: row.get(3)?,
                description: row.get(4)?,
                appearance_info: row.get(5)?,
                image_paths: resolved_image_paths,
                ip_id: row.get(7)?,
                ip_relation_note: row.get(8)?,
                display_order: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                deleted_at: row.get(12)?,
            },
            work_name: row.get(13)?,
            work_type: row.get(14)?,
            ip_name: row.get(15)?,
            ip_avatar_path: row.get(16)?,
        })
    }).map_err(|e| e.to_string())?;
    
    characters.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_character_by_id(
    app_handle: AppHandle,
    id: String,
) -> Result<CharacterWithRelations, String> {
    let conn = get_connection(&app_handle)?;
    let base_app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let app_data_dir = crate::commands::get_works_root_from_handle(&app_handle, &base_app_data_dir);
    
    conn.query_row(
        "SELECT c.id, c.work_id, c.name, c.character_type, c.description, c.appearance_info,
         c.image_paths, c.ip_id, c.ip_relation_note, c.display_order, c.created_at, c.updated_at, c.deleted_at,
         w.name as work_name, w.work_type, ip.name as ip_name, ip.avatar_path as ip_avatar_path
         FROM characters c
         INNER JOIN works w ON c.work_id = w.id
         LEFT JOIN ip_assets ip ON c.ip_id = ip.id
         WHERE c.id = ? AND c.deleted_at IS NULL",
        params![id],
        |row| {
            let image_paths_raw: Option<String> = row.get(6)?;
            let resolved_image_paths = resolve_relative_paths_json(&app_data_dir, image_paths_raw);
            Ok(CharacterWithRelations {
                character: Character {
                    id: row.get(0)?,
                    work_id: row.get(1)?,
                    name: row.get(2)?,
                    character_type: row.get(3)?,
                    description: row.get(4)?,
                    appearance_info: row.get(5)?,
                    image_paths: resolved_image_paths,
                    ip_id: row.get(7)?,
                    ip_relation_note: row.get(8)?,
                    display_order: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                    deleted_at: row.get(12)?,
                },
                work_name: row.get(13)?,
                work_type: row.get(14)?,
                ip_name: row.get(15)?,
                ip_avatar_path: row.get(16)?,
            })
        },
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_character(
    app_handle: AppHandle,
    id: String,
    name: Option<String>,
    character_type: Option<String>,
    description: Option<String>,
    appearance_info: Option<String>,
    ip_id: Option<String>,
    ip_relation_note: Option<String>,
) -> Result<Character, String> {
    {
        let conn = get_connection(&app_handle)?;
        let now = Utc::now().to_rfc3339();
        
        // Build update query
        let mut query = String::from("UPDATE characters SET updated_at = ?1");
        let mut param_index = 2;
        
        if name.is_some() { query.push_str(&format!(", name = ?{}", param_index)); param_index += 1; }
        if character_type.is_some() { query.push_str(&format!(", character_type = ?{}", param_index)); param_index += 1; }
        if description.is_some() { query.push_str(&format!(", description = ?{}", param_index)); param_index += 1; }
        if appearance_info.is_some() { query.push_str(&format!(", appearance_info = ?{}", param_index)); param_index += 1; }
        if ip_id.is_some() { query.push_str(&format!(", ip_id = ?{}", param_index)); param_index += 1; }
        if ip_relation_note.is_some() { query.push_str(&format!(", ip_relation_note = ?{}", param_index)); param_index += 1; }
        
        query.push_str(&format!(" WHERE id = ?{}", param_index));
        
        // Execute with proper parameter binding
        let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
        let mut params_vec: Vec<&dyn rusqlite::ToSql> = vec![&now];
        
        if let Some(ref v) = name { params_vec.push(v); }
        if let Some(ref v) = character_type { params_vec.push(v); }
        if let Some(ref v) = description { params_vec.push(v); }
        if let Some(ref v) = appearance_info { params_vec.push(v); }
        if let Some(ref v) = ip_id { params_vec.push(v); }
        if let Some(ref v) = ip_relation_note { params_vec.push(v); }
        params_vec.push(&id);
        
        stmt.execute(params_vec.as_slice()).map_err(|e| e.to_string())?;
    } // conn and stmt dropped here
    
    get_character_by_id(app_handle, id).await.map(|c| c.character)
}

#[tauri::command]
pub async fn delete_character(
    app_handle: AppHandle,
    id: String,
) -> Result<(), String> {
    let conn = get_connection(&app_handle)?;
    let now = Utc::now().to_rfc3339();
    
    // Get character info before deletion
    let (work_id, image_paths): (String, Option<String>) = conn.query_row(
        "SELECT work_id, image_paths FROM characters WHERE id = ?",
        params![id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?;
    
    // Soft delete
    conn.execute(
        "UPDATE characters SET deleted_at = ?1 WHERE id = ?2",
        params![now, id],
    ).map_err(|e| e.to_string())?;
    
    // Clean up files
    cleanup_character_files(&app_handle, &work_id, &id, image_paths)?;
    
    Ok(())
}

#[tauri::command]
pub async fn update_character_order(
    app_handle: AppHandle,
    character_ids: Vec<String>,
) -> Result<(), String> {
    let conn = get_connection(&app_handle)?;
    
    for (index, id) in character_ids.iter().enumerate() {
        conn.execute(
            "UPDATE characters SET display_order = ?1, updated_at = ?2 WHERE id = ?3",
            params![index as i32, Utc::now().to_rfc3339(), id],
        ).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn upload_character_images(
    app_handle: AppHandle,
    character_id: String,
    work_id: String,
    images: Vec<(Vec<u8>, String)>, // (data, extension)
) -> Result<Vec<String>, String> {
    let base_app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let app_data_dir = crate::commands::get_works_root_from_handle(&app_handle, &base_app_data_dir);
    
    // Resolve path identifier
    let conn = get_connection(&app_handle)?;
    let path_ident: String = conn.query_row(
        "SELECT path FROM works WHERE id = ?",
        params![work_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    
    let char_dir = app_data_dir.join("works").join(&path_ident).join("characters");
    std::fs::create_dir_all(&char_dir).map_err(|e| e.to_string())?;
    
    let mut paths_rel = Vec::new();
    let mut paths_abs = Vec::new();
    for (index, (data, ext)) in images.iter().enumerate() {
        let filename = format!("{}_{}.{}", character_id, index, ext);
        let file_path = char_dir.join(&filename);
        std::fs::write(&file_path, data).map_err(|e| e.to_string())?;
        
        let relative_path = format!("works/{}/characters/{}", path_ident, filename);
        paths_rel.push(relative_path.clone());
        
        let absolute_path = app_data_dir.join(&relative_path).to_string_lossy().to_string();
        paths_abs.push(absolute_path);
    }
    
    // Update database (still stores relative paths for portability)
    let paths_json = serde_json::to_string(&paths_rel).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE characters SET image_paths = ?1, updated_at = ?2 WHERE id = ?3",
        params![paths_json, Utc::now().to_rfc3339(), character_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(paths_abs)
}

#[tauri::command]
pub async fn get_ip_characters(
    app_handle: AppHandle,
    ip_id: String,
) -> Result<Vec<CharacterWithRelations>, String> {
    let conn = get_connection(&app_handle)?;
    let base_app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let app_data_dir = crate::commands::get_works_root_from_handle(&app_handle, &base_app_data_dir);
    
    let mut stmt = conn.prepare(
        "SELECT c.id, c.work_id, c.name, c.character_type, c.description, c.appearance_info,
         c.image_paths, c.ip_id, c.ip_relation_note, c.display_order, c.created_at, c.updated_at, c.deleted_at,
         w.name as work_name, w.work_type, ip.name as ip_name, ip.avatar_path as ip_avatar_path
         FROM characters c
         INNER JOIN works w ON c.work_id = w.id
         LEFT JOIN ip_assets ip ON c.ip_id = ip.id
         WHERE c.ip_id = ? AND c.deleted_at IS NULL
         ORDER BY c.display_order ASC"
    ).map_err(|e| e.to_string())?;
    
    let characters = stmt.query_map(params![ip_id], |row| {
        let image_paths_raw: Option<String> = row.get(6)?;
        let resolved_image_paths = resolve_relative_paths_json(&app_data_dir, image_paths_raw);
        Ok(CharacterWithRelations {
            character: Character {
                id: row.get(0)?,
                work_id: row.get(1)?,
                name: row.get(2)?,
                character_type: row.get(3)?,
                description: row.get(4)?,
                appearance_info: row.get(5)?,
                image_paths: resolved_image_paths,
                ip_id: row.get(7)?,
                ip_relation_note: row.get(8)?,
                display_order: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                deleted_at: row.get(12)?,
            },
            work_name: row.get(13)?,
            work_type: row.get(14)?,
            ip_name: row.get(15)?,
            ip_avatar_path: row.get(16)?,
        })
    }).map_err(|e| e.to_string())?;
    
    characters.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// Helper functions
fn cleanup_character_files(
    app_handle: &AppHandle,
    _work_id: &str,
    _character_id: &str,
    image_paths: Option<String>,
) -> Result<(), String> {
    if let Some(paths_json) = image_paths {
        if let Ok(paths) = serde_json::from_str::<Vec<String>>(&paths_json) {
            let base_app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let app_data_dir = crate::commands::get_works_root_from_handle(&app_handle, &base_app_data_dir);
            
            for path in paths {
                let file_path = app_data_dir.join(&path);
                if file_path.exists() {
                    let _ = std::fs::remove_file(&file_path);
                }
            }
        }
    }
    Ok(())
}
