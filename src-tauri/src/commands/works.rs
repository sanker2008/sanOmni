use tauri::{AppHandle, Manager};
use rusqlite::{params, Connection};
use uuid::Uuid;
use chrono::Utc;

use crate::models::{Work, WorkWithRelations, WorkFilters, Tag, CharacterWithRelations};

fn get_connection(app_handle: &AppHandle) -> Result<Connection, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("data").join("database.sqlite");
    Connection::open(db_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_work(
    app_handle: AppHandle,
    name: String,
    work_type: String,
    description: Option<String>,
    release_date: Option<String>,
    producer: Option<String>,
    director_author: Option<String>,
    status: Option<String>,
) -> Result<Work, String> {
    let conn = get_connection(&app_handle)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    
    conn.execute(
        "INSERT INTO works (id, name, work_type, description, release_date, 
         producer, director_author, status, created_at, updated_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![id, name, work_type, description, release_date, 
                producer, director_author, status, now, now],
    ).map_err(|e| e.to_string())?;
    
    get_work_by_id(app_handle, id).await.map(|w| w.work)
}

#[tauri::command]
pub async fn get_works(
    app_handle: AppHandle,
    filters: Option<WorkFilters>,
) -> Result<Vec<WorkWithRelations>, String> {
    let conn = get_connection(&app_handle)?;
    
    let mut query = String::from(
        "SELECT id, name, work_type, description, release_date, producer, 
         director_author, status, cover_path, created_at, updated_at, deleted_at
         FROM works WHERE deleted_at IS NULL"
    );
    
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    
    if let Some(f) = filters {
        if let Some(search) = f.search {
            query.push_str(" AND name LIKE ?");
            params.push(Box::new(format!("%{}%", search)));
        }
        if let Some(work_type) = f.work_type {
            query.push_str(" AND work_type = ?");
            params.push(Box::new(work_type));
        }
        if let Some(status) = f.status {
            query.push_str(" AND status = ?");
            params.push(Box::new(status));
        }
        
        // Sorting
        let sort_by = f.sort_by.unwrap_or_else(|| "created_at".to_string());
        let sort_order = f.sort_order.unwrap_or_else(|| "desc".to_string());
        query.push_str(&format!(" ORDER BY {} {}", sort_by, sort_order));
    } else {
        query.push_str(" ORDER BY created_at DESC");
    }
    
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    
    let works = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(Work {
            id: row.get(0)?,
            name: row.get(1)?,
            work_type: row.get(2)?,
            description: row.get(3)?,
            release_date: row.get(4)?,
            producer: row.get(5)?,
            director_author: row.get(6)?,
            status: row.get(7)?,
            cover_path: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
            deleted_at: row.get(11)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for work in works {
        let work = work.map_err(|e| e.to_string())?;
        let tags = get_work_tags(&conn, &work.id)?;
        let characters = get_work_characters_internal(&conn, &work.id)?;
        let character_count = characters.len();
        
        result.push(WorkWithRelations {
            work,
            tags,
            characters,
            character_count,
        });
    }
    
    Ok(result)
}

#[tauri::command]
pub async fn get_work_by_id(
    app_handle: AppHandle,
    id: String,
) -> Result<WorkWithRelations, String> {
    let conn = get_connection(&app_handle)?;
    
    let work = conn.query_row(
        "SELECT id, name, work_type, description, release_date, producer, 
         director_author, status, cover_path, created_at, updated_at, deleted_at
         FROM works WHERE id = ? AND deleted_at IS NULL",
        params![id],
        |row| {
            Ok(Work {
                id: row.get(0)?,
                name: row.get(1)?,
                work_type: row.get(2)?,
                description: row.get(3)?,
                release_date: row.get(4)?,
                producer: row.get(5)?,
                director_author: row.get(6)?,
                status: row.get(7)?,
                cover_path: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                deleted_at: row.get(11)?,
            })
        },
    ).map_err(|e| e.to_string())?;
    
    let tags = get_work_tags(&conn, &work.id)?;
    let characters = get_work_characters_internal(&conn, &work.id)?;
    let character_count = characters.len();
    
    Ok(WorkWithRelations {
        work,
        tags,
        characters,
        character_count,
    })
}

#[tauri::command]
pub async fn update_work(
    app_handle: AppHandle,
    id: String,
    name: Option<String>,
    work_type: Option<String>,
    description: Option<String>,
    release_date: Option<String>,
    producer: Option<String>,
    director_author: Option<String>,
    status: Option<String>,
) -> Result<Work, String> {
    {
        let conn = get_connection(&app_handle)?;
        let now = Utc::now().to_rfc3339();
        
        // Build update query
        let mut query = String::from("UPDATE works SET updated_at = ?1");
        let mut param_index = 2;
        
        if name.is_some() { query.push_str(&format!(", name = ?{}", param_index)); param_index += 1; }
        if work_type.is_some() { query.push_str(&format!(", work_type = ?{}", param_index)); param_index += 1; }
        if description.is_some() { query.push_str(&format!(", description = ?{}", param_index)); param_index += 1; }
        if release_date.is_some() { query.push_str(&format!(", release_date = ?{}", param_index)); param_index += 1; }
        if producer.is_some() { query.push_str(&format!(", producer = ?{}", param_index)); param_index += 1; }
        if director_author.is_some() { query.push_str(&format!(", director_author = ?{}", param_index)); param_index += 1; }
        if status.is_some() { query.push_str(&format!(", status = ?{}", param_index)); param_index += 1; }
        
        query.push_str(&format!(" WHERE id = ?{}", param_index));
        
        // Execute with proper parameter binding
        let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
        let mut params_vec: Vec<&dyn rusqlite::ToSql> = vec![&now];
        
        if let Some(ref v) = name { params_vec.push(v); }
        if let Some(ref v) = work_type { params_vec.push(v); }
        if let Some(ref v) = description { params_vec.push(v); }
        if let Some(ref v) = release_date { params_vec.push(v); }
        if let Some(ref v) = producer { params_vec.push(v); }
        if let Some(ref v) = director_author { params_vec.push(v); }
        if let Some(ref v) = status { params_vec.push(v); }
        params_vec.push(&id);
        
        stmt.execute(params_vec.as_slice()).map_err(|e| e.to_string())?;
    } // conn and stmt dropped here
    
    get_work_by_id(app_handle, id).await.map(|w| w.work)
}

#[tauri::command]
pub async fn delete_work(
    app_handle: AppHandle,
    id: String,
) -> Result<(), String> {
    let conn = get_connection(&app_handle)?;
    let now = Utc::now().to_rfc3339();
    
    conn.execute(
        "UPDATE works SET deleted_at = ?1 WHERE id = ?2",
        params![now, id],
    ).map_err(|e| e.to_string())?;
    
    // Soft delete characters as well
    conn.execute(
        "UPDATE characters SET deleted_at = ?1 WHERE work_id = ?2",
        params![now, id],
    ).map_err(|e| e.to_string())?;
    
    // Clean up files
    cleanup_work_files(&app_handle, &id)?;
    
    Ok(())
}

#[tauri::command]
pub async fn upload_work_cover(
    app_handle: AppHandle,
    work_id: String,
    image_data: Vec<u8>,
    extension: String,
) -> Result<String, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let work_dir = app_data_dir.join("works").join(&work_id);
    std::fs::create_dir_all(&work_dir).map_err(|e| e.to_string())?;
    
    let cover_path = work_dir.join(format!("cover.{}", extension));
    std::fs::write(&cover_path, image_data).map_err(|e| e.to_string())?;
    
    let relative_path = format!("works/{}/cover.{}", work_id, extension);
    
    // Update database
    let conn = get_connection(&app_handle)?;
    conn.execute(
        "UPDATE works SET cover_path = ?1, updated_at = ?2 WHERE id = ?3",
        params![relative_path, Utc::now().to_rfc3339(), work_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(relative_path)
}

#[tauri::command]
pub async fn add_work_tag(
    app_handle: AppHandle,
    work_id: String,
    tag_id: String,
) -> Result<(), String> {
    let conn = get_connection(&app_handle)?;
    conn.execute(
        "INSERT OR IGNORE INTO work_tags (work_id, tag_id) VALUES (?1, ?2)",
        params![work_id, tag_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn remove_work_tag(
    app_handle: AppHandle,
    work_id: String,
    tag_id: String,
) -> Result<(), String> {
    let conn = get_connection(&app_handle)?;
    conn.execute(
        "DELETE FROM work_tags WHERE work_id = ?1 AND tag_id = ?2",
        params![work_id, tag_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// Helper functions
fn get_work_tags(conn: &Connection, work_id: &str) -> Result<Vec<Tag>, String> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.name_en, t.color, t.parent_id, t.use_count, t.is_builtin, t.created_at
         FROM tags t
         INNER JOIN work_tags wt ON t.id = wt.tag_id
         WHERE wt.work_id = ?"
    ).map_err(|e| e.to_string())?;
    
    let tags = stmt.query_map(params![work_id], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            name_en: row.get(2)?,
            color: row.get(3)?,
            parent_id: row.get(4)?,
            use_count: row.get(5)?,
            is_builtin: row.get(6)?,
            created_at: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;
    
    tags.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn get_work_characters_internal(conn: &Connection, work_id: &str) -> Result<Vec<CharacterWithRelations>, String> {
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
        Ok(CharacterWithRelations {
            character: crate::models::Character {
                id: row.get(0)?,
                work_id: row.get(1)?,
                name: row.get(2)?,
                character_type: row.get(3)?,
                description: row.get(4)?,
                appearance_info: row.get(5)?,
                image_paths: row.get(6)?,
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

fn cleanup_work_files(app_handle: &AppHandle, work_id: &str) -> Result<(), String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let work_dir = app_data_dir.join("works").join(work_id);
    
    if work_dir.exists() {
        std::fs::remove_dir_all(&work_dir).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}
