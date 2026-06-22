use chrono::Utc;
use rusqlite::{Connection, params};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::models::{CharacterWithRelations, Tag, Work, WorkFilters, WorkWithRelations};

fn get_connection(app_handle: &AppHandle) -> Result<Connection, String> {
    let default_app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let app_root = crate::commands::get_app_root_from_handle(app_handle, &default_app_data_dir);
    let db_path = app_root.join("data").join("database.sqlite");
    Connection::open(db_path).map_err(|e| e.to_string())
}

fn work_sort_clause(sort_by: Option<&str>, sort_order: Option<&str>) -> &'static str {
    let column = match sort_by.unwrap_or("created_at") {
        "name" => "name",
        "path" => "path",
        "work_type" => "work_type",
        "release_date" => "release_date",
        "producer" => "producer",
        "director_author" => "director_author",
        "status" => "status",
        "updated_at" => "updated_at",
        "created_at" => "created_at",
        _ => return " ORDER BY created_at DESC",
    };

    let direction = match sort_order.unwrap_or("desc").to_ascii_lowercase().as_str() {
        "asc" => "ASC",
        _ => "DESC",
    };

    match (column, direction) {
        ("name", "ASC") => " ORDER BY name ASC",
        ("name", "DESC") => " ORDER BY name DESC",
        ("path", "ASC") => " ORDER BY path ASC",
        ("path", "DESC") => " ORDER BY path DESC",
        ("work_type", "ASC") => " ORDER BY work_type ASC",
        ("work_type", "DESC") => " ORDER BY work_type DESC",
        ("release_date", "ASC") => " ORDER BY release_date ASC",
        ("release_date", "DESC") => " ORDER BY release_date DESC",
        ("producer", "ASC") => " ORDER BY producer ASC",
        ("producer", "DESC") => " ORDER BY producer DESC",
        ("director_author", "ASC") => " ORDER BY director_author ASC",
        ("director_author", "DESC") => " ORDER BY director_author DESC",
        ("status", "ASC") => " ORDER BY status ASC",
        ("status", "DESC") => " ORDER BY status DESC",
        ("updated_at", "ASC") => " ORDER BY updated_at ASC",
        ("updated_at", "DESC") => " ORDER BY updated_at DESC",
        ("created_at", "ASC") => " ORDER BY created_at ASC",
        _ => " ORDER BY created_at DESC",
    }
}

// Path resolver helpers
fn resolve_relative_path(
    app_data_dir: &std::path::Path,
    relative_path: Option<String>,
) -> Option<String> {
    relative_path.map(|p| {
        let normalized = p
            .replace('/', &std::path::MAIN_SEPARATOR.to_string())
            .replace('\\', &std::path::MAIN_SEPARATOR.to_string());
        app_data_dir.join(normalized).to_string_lossy().to_string()
    })
}

fn resolve_relative_paths_json(
    app_data_dir: &std::path::Path,
    paths_json: Option<String>,
) -> Option<String> {
    if let Some(json_str) = paths_json {
        if let Ok(paths) = serde_json::from_str::<Vec<String>>(&json_str) {
            let abs_paths: Vec<String> = paths
                .into_iter()
                .map(|p| {
                    let normalized = p
                        .replace('/', &std::path::MAIN_SEPARATOR.to_string())
                        .replace('\\', &std::path::MAIN_SEPARATOR.to_string());
                    app_data_dir.join(normalized).to_string_lossy().to_string()
                })
                .collect();
            serde_json::to_string(&abs_paths).ok()
        } else {
            Some(json_str)
        }
    } else {
        None
    }
}

#[tauri::command]
pub async fn create_work(
    app_handle: AppHandle,
    name: String,
    path: Option<String>,
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

    let final_path = match path {
        Some(ref p) if !p.trim().is_empty() => p.trim().to_lowercase().replace(' ', "-"),
        _ => id.clone(),
    };

    conn.execute(
        "INSERT INTO works (id, name, path, work_type, description, release_date, 
         producer, director_author, status, created_at, updated_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            id,
            name,
            final_path.clone(),
            work_type,
            description,
            release_date,
            producer,
            director_author,
            status,
            now,
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    // Create the works/{path} directory
    let base_app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let app_data_dir = crate::commands::get_works_root_from_handle(&app_handle, &base_app_data_dir);
    let target_dir = app_data_dir.join("works").join(&final_path);
    let _ = std::fs::create_dir_all(&target_dir);

    get_work_by_id(app_handle, id).await.map(|w| w.work)
}

#[tauri::command]
pub async fn get_works(
    app_handle: AppHandle,
    filters: Option<WorkFilters>,
) -> Result<Vec<WorkWithRelations>, String> {
    let conn = get_connection(&app_handle)?;
    let base_app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let app_data_dir = crate::commands::get_works_root_from_handle(&app_handle, &base_app_data_dir);

    let mut query = String::from(
        "SELECT id, name, path, work_type, description, release_date, producer, 
         director_author, status, cover_path, created_at, updated_at, deleted_at
         FROM works WHERE deleted_at IS NULL",
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
        query.push_str(work_sort_clause(
            f.sort_by.as_deref(),
            f.sort_order.as_deref(),
        ));
    } else {
        query.push_str(work_sort_clause(None, None));
    }

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let works = stmt
        .query_map(param_refs.as_slice(), |row| {
            let cover_raw: Option<String> = row.get(9)?;
            let resolved_cover = resolve_relative_path(&app_data_dir, cover_raw);
            Ok(Work {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                work_type: row.get(3)?,
                description: row.get(4)?,
                release_date: row.get(5)?,
                producer: row.get(6)?,
                director_author: row.get(7)?,
                status: row.get(8)?,
                cover_path: resolved_cover,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                deleted_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for work in works {
        let work = work.map_err(|e| e.to_string())?;
        let tags = get_work_tags(&conn, &work.id)?;
        let characters = get_work_characters_internal(&conn, &work.id, &app_data_dir)?;
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
    let base_app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let app_data_dir = crate::commands::get_works_root_from_handle(&app_handle, &base_app_data_dir);

    let work = conn
        .query_row(
            "SELECT id, name, path, work_type, description, release_date, producer, 
         director_author, status, cover_path, created_at, updated_at, deleted_at
         FROM works WHERE id = ? AND deleted_at IS NULL",
            params![id],
            |row| {
                let cover_raw: Option<String> = row.get(9)?;
                let resolved_cover = resolve_relative_path(&app_data_dir, cover_raw);
                Ok(Work {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    path: row.get(2)?,
                    work_type: row.get(3)?,
                    description: row.get(4)?,
                    release_date: row.get(5)?,
                    producer: row.get(6)?,
                    director_author: row.get(7)?,
                    status: row.get(8)?,
                    cover_path: resolved_cover,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                    deleted_at: row.get(12)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    let tags = get_work_tags(&conn, &id)?;
    let characters = get_work_characters_internal(&conn, &id, &app_data_dir)?;
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
    path: Option<String>,
    work_type: Option<String>,
    description: Option<String>,
    release_date: Option<String>,
    producer: Option<String>,
    director_author: Option<String>,
    status: Option<String>,
) -> Result<Work, String> {
    let base_app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let app_data_dir = crate::commands::get_works_root_from_handle(&app_handle, &base_app_data_dir);

    {
        let conn = get_connection(&app_handle)?;
        let now = Utc::now().to_rfc3339();

        // 1. Get old path and cover path
        let (old_path, old_cover_path): (String, Option<String>) = conn
            .query_row(
                "SELECT path, cover_path FROM works WHERE id = ?",
                params![id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;

        // Determine final path
        let final_path = match path {
            Some(ref p) if !p.trim().is_empty() => p.trim().to_lowercase().replace(' ', "-"),
            Some(_) => id.clone(),
            None => old_path.clone(),
        };

        // 2. If path changed, physically rename folder and update db references
        if final_path != old_path {
            let old_dir = app_data_dir.join("works").join(&old_path);
            let new_dir = app_data_dir.join("works").join(&final_path);

            if old_dir.exists() {
                std::fs::rename(&old_dir, &new_dir).map_err(|e| e.to_string())?;
            } else {
                std::fs::create_dir_all(&new_dir).map_err(|e| e.to_string())?;
            }

            // Update works table cover_path references
            if let Some(ref cover) = old_cover_path {
                let new_cover_path = cover.replace(
                    &format!("works/{}/", old_path),
                    &format!("works/{}/", final_path),
                );
                conn.execute(
                    "UPDATE works SET cover_path = ?1 WHERE id = ?2",
                    params![new_cover_path, id],
                )
                .map_err(|e| e.to_string())?;
            }

            // Update characters table image_paths references
            let mut stmt = conn.prepare("SELECT id, image_paths FROM characters WHERE work_id = ? AND deleted_at IS NULL").map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
                })
                .map_err(|e| e.to_string())?;

            let mut char_updates = Vec::new();
            for r in rows {
                if let Ok((char_id, Some(img_paths_json))) = r {
                    let new_json = img_paths_json.replace(
                        &format!("works/{}/", old_path),
                        &format!("works/{}/", final_path),
                    );
                    char_updates.push((char_id, new_json));
                }
            }

            for (char_id, new_json) in char_updates {
                conn.execute(
                    "UPDATE characters SET image_paths = ?1 WHERE id = ?2",
                    params![new_json, char_id],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        // Build update query
        let mut query = String::from("UPDATE works SET updated_at = ?1");
        let mut param_index = 2;

        if name.is_some() {
            query.push_str(&format!(", name = ?{}", param_index));
            param_index += 1;
        }
        query.push_str(&format!(", path = ?{}", param_index));
        param_index += 1;
        if work_type.is_some() {
            query.push_str(&format!(", work_type = ?{}", param_index));
            param_index += 1;
        }
        if description.is_some() {
            query.push_str(&format!(", description = ?{}", param_index));
            param_index += 1;
        }
        if release_date.is_some() {
            query.push_str(&format!(", release_date = ?{}", param_index));
            param_index += 1;
        }
        if producer.is_some() {
            query.push_str(&format!(", producer = ?{}", param_index));
            param_index += 1;
        }
        if director_author.is_some() {
            query.push_str(&format!(", director_author = ?{}", param_index));
            param_index += 1;
        }
        if status.is_some() {
            query.push_str(&format!(", status = ?{}", param_index));
            param_index += 1;
        }

        query.push_str(&format!(" WHERE id = ?{}", param_index));

        // Execute with proper parameter binding
        let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
        let mut params_vec: Vec<&dyn rusqlite::ToSql> = vec![&now];

        if let Some(ref v) = name {
            params_vec.push(v);
        }
        params_vec.push(&final_path);
        if let Some(ref v) = work_type {
            params_vec.push(v);
        }
        if let Some(ref v) = description {
            params_vec.push(v);
        }
        if let Some(ref v) = release_date {
            params_vec.push(v);
        }
        if let Some(ref v) = producer {
            params_vec.push(v);
        }
        if let Some(ref v) = director_author {
            params_vec.push(v);
        }
        if let Some(ref v) = status {
            params_vec.push(v);
        }
        params_vec.push(&id);

        stmt.execute(params_vec.as_slice())
            .map_err(|e| e.to_string())?;
    }

    get_work_by_id(app_handle, id).await.map(|w| w.work)
}

#[tauri::command]
pub async fn delete_work(app_handle: AppHandle, id: String) -> Result<(), String> {
    let conn = get_connection(&app_handle)?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE works SET deleted_at = ?1 WHERE id = ?2",
        params![now, id],
    )
    .map_err(|e| e.to_string())?;

    // Soft delete characters as well
    conn.execute(
        "UPDATE characters SET deleted_at = ?1 WHERE work_id = ?2",
        params![now, id],
    )
    .map_err(|e| e.to_string())?;

    // Clean up files
    cleanup_work_files(&app_handle, &id)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::work_sort_clause;

    #[test]
    fn work_sort_clause_accepts_allowlisted_columns_and_directions() {
        assert_eq!(
            work_sort_clause(Some("name"), Some("asc")),
            " ORDER BY name ASC"
        );
        assert_eq!(
            work_sort_clause(Some("updated_at"), Some("DESC")),
            " ORDER BY updated_at DESC"
        );
    }

    #[test]
    fn work_sort_clause_rejects_sql_fragments() {
        assert_eq!(
            work_sort_clause(Some("created_at; DROP TABLE works"), Some("asc")),
            " ORDER BY created_at DESC"
        );
        assert_eq!(
            work_sort_clause(Some("name"), Some("DESC; DROP TABLE works")),
            " ORDER BY name DESC"
        );
    }
}

#[tauri::command]
pub async fn upload_work_cover(
    app_handle: AppHandle,
    work_id: String,
    image_data: Vec<u8>,
    extension: String,
) -> Result<String, String> {
    let base_app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let app_data_dir = crate::commands::get_works_root_from_handle(&app_handle, &base_app_data_dir);

    // Resolve path identifier
    let conn = get_connection(&app_handle)?;
    let (path_ident, old_cover_path): (String, Option<String>) = conn
        .query_row(
            "SELECT path, cover_path FROM works WHERE id = ?",
            params![work_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let work_dir = app_data_dir.join("works").join(&path_ident);
    std::fs::create_dir_all(&work_dir).map_err(|e| e.to_string())?;

    // Delete old cover file if it exists and has a different extension
    if let Some(ref path) = old_cover_path {
        let abs_old_path = app_data_dir.join(
            &path
                .replace('/', &std::path::MAIN_SEPARATOR.to_string())
                .replace('\\', &std::path::MAIN_SEPARATOR.to_string()),
        );
        if abs_old_path.exists() {
            let _ = std::fs::remove_file(&abs_old_path);
        }
    }

    // Check if there are other cover files in the directory and delete them (e.g. cover.png, cover.jpg)
    // This handles the case where we convert to webp and need to delete the original png
    if let Ok(entries) = std::fs::read_dir(&work_dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    let path = entry.path();
                    if let Some(file_name) = path.file_stem().and_then(|s| s.to_str()) {
                        if file_name == "cover" {
                            let _ = std::fs::remove_file(&path);
                        }
                    }
                }
            }
        }
    }

    let cover_path = work_dir.join(format!("cover.{}", extension));
    std::fs::write(&cover_path, image_data).map_err(|e| e.to_string())?;

    let relative_path = format!("works/{}/cover.{}", path_ident, extension);

    // Update database
    conn.execute(
        "UPDATE works SET cover_path = ?1, updated_at = ?2 WHERE id = ?3",
        params![relative_path, Utc::now().to_rfc3339(), work_id],
    )
    .map_err(|e| e.to_string())?;

    let absolute_path = app_data_dir
        .join(&relative_path)
        .to_string_lossy()
        .to_string();
    Ok(absolute_path)
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
    )
    .map_err(|e| e.to_string())?;
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
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_work_cover(app_handle: AppHandle, work_id: String) -> Result<(), String> {
    let conn = get_connection(&app_handle)?;
    let base_app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let app_data_dir = crate::commands::get_works_root_from_handle(&app_handle, &base_app_data_dir);

    let cover_raw: Option<String> = conn
        .query_row(
            "SELECT cover_path FROM works WHERE id = ?",
            params![work_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    if let Some(ref path) = cover_raw {
        let abs_path = app_data_dir.join(
            &path
                .replace('/', &std::path::MAIN_SEPARATOR.to_string())
                .replace('\\', &std::path::MAIN_SEPARATOR.to_string()),
        );
        if abs_path.exists() {
            let _ = std::fs::remove_file(&abs_path);
        }
    }

    conn.execute(
        "UPDATE works SET cover_path = NULL, updated_at = ?1 WHERE id = ?2",
        params![Utc::now().to_rfc3339(), work_id],
    )
    .map_err(|e| e.to_string())?;

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

    let tags = stmt
        .query_map(params![work_id], |row| {
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
        })
        .map_err(|e| e.to_string())?;

    tags.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn get_work_characters_internal(
    conn: &Connection,
    work_id: &str,
    app_data_dir: &std::path::Path,
) -> Result<Vec<CharacterWithRelations>, String> {
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

    let characters = stmt
        .query_map(params![work_id], |row| {
            let image_paths_raw: Option<String> = row.get(6)?;
            let resolved_image_paths = resolve_relative_paths_json(app_data_dir, image_paths_raw);
            Ok(CharacterWithRelations {
                character: crate::models::Character {
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
        })
        .map_err(|e| e.to_string())?;

    characters
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn cleanup_work_files(app_handle: &AppHandle, work_id: &str) -> Result<(), String> {
    let base_app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let app_data_dir = crate::commands::get_works_root_from_handle(&app_handle, &base_app_data_dir);

    let conn = get_connection(app_handle)?;
    let path_ident: Option<String> = conn
        .query_row(
            "SELECT path FROM works WHERE id = ?",
            params![work_id],
            |row| row.get(0),
        )
        .ok();

    if let Some(ident) = path_ident {
        let work_dir = app_data_dir.join("works").join(ident);
        if work_dir.exists() {
            std::fs::remove_dir_all(&work_dir).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}
