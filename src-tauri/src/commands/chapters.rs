use std::collections::HashSet;

use chrono::Utc;
use rusqlite::{params, Connection};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::models::{
    Chapter, ChapterCharacterInput, ChapterCharacterRelation, ChapterWithCharacters,
};

fn get_connection(app_handle: &AppHandle) -> Result<Connection, String> {
    let default_app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let app_root = crate::commands::get_app_root_from_handle(app_handle, &default_app_data_dir);
    Connection::open(app_root.join("data").join("database.sqlite")).map_err(|e| e.to_string())
}

fn validate_status(status: &str) -> Result<(), String> {
    match status {
        "outline" | "draft" | "review" | "final" => Ok(()),
        _ => Err("章节状态必须是大纲、草稿、审阅或定稿之一".to_string()),
    }
}

fn validate_target_word_count(target_word_count: Option<i32>) -> Result<(), String> {
    if matches!(target_word_count, Some(value) if value <= 0) {
        return Err("目标字数必须是正整数".to_string());
    }
    Ok(())
}

fn ensure_narrative_work(conn: &Connection, work_id: &str) -> Result<(), String> {
    let structure_mode: String = conn
        .query_row(
            "SELECT structure_mode FROM works WHERE id = ?1 AND deleted_at IS NULL",
            params![work_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if structure_mode != "narrative" {
        return Err("只有启用“叙事结构”的作品可以管理章节".to_string());
    }
    Ok(())
}

fn get_chapter_characters(
    conn: &Connection,
    chapter_id: &str,
) -> Result<Vec<ChapterCharacterRelation>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT character_id, note
             FROM chapter_character_relations
             WHERE chapter_id = ?1
             ORDER BY character_id ASC",
        )
        .map_err(|e| e.to_string())?;

    let result = stmt.query_map(params![chapter_id], |row| {
        Ok(ChapterCharacterRelation {
            character_id: row.get(0)?,
            note: row.get(1)?,
        })
    })
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string());
    result
}

fn get_chapter_by_id_with_conn(
    conn: &Connection,
    id: &str,
) -> Result<ChapterWithCharacters, String> {
    let chapter = conn
        .query_row(
            "SELECT id, work_id, title, summary, content, status, target_word_count,
                    sort_order, created_at, updated_at, deleted_at
             FROM work_chapters
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id],
            |row| {
                Ok(Chapter {
                    id: row.get(0)?,
                    work_id: row.get(1)?,
                    title: row.get(2)?,
                    summary: row.get(3)?,
                    content: row.get(4)?,
                    status: row.get(5)?,
                    target_word_count: row.get(6)?,
                    sort_order: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                    deleted_at: row.get(10)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;
    let characters = get_chapter_characters(conn, id)?;

    Ok(ChapterWithCharacters {
        chapter,
        characters,
    })
}

#[tauri::command]
pub async fn create_chapter(
    app_handle: AppHandle,
    work_id: String,
    title: String,
    summary: Option<String>,
    content: Option<String>,
    status: String,
    target_word_count: Option<i32>,
) -> Result<ChapterWithCharacters, String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("章节标题不能为空".to_string());
    }
    validate_status(&status)?;
    validate_target_word_count(target_word_count)?;

    let conn = get_connection(&app_handle)?;
    ensure_narrative_work(&conn, &work_id)?;

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let sort_order: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1
             FROM work_chapters
             WHERE work_id = ?1 AND deleted_at IS NULL",
            params![work_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO work_chapters
         (id, work_id, title, summary, content, status, target_word_count, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            id,
            work_id,
            title,
            summary,
            content,
            status,
            target_word_count,
            sort_order,
            now,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    get_chapter_by_id_with_conn(&conn, &id)
}

#[tauri::command]
pub async fn get_chapters(
    app_handle: AppHandle,
    work_id: String,
) -> Result<Vec<ChapterWithCharacters>, String> {
    let conn = get_connection(&app_handle)?;
    let mut stmt = conn
        .prepare(
            "SELECT id
             FROM work_chapters
             WHERE work_id = ?1 AND deleted_at IS NULL
             ORDER BY sort_order ASC, created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let ids = stmt
        .query_map(params![work_id], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    ids.iter()
        .map(|id| get_chapter_by_id_with_conn(&conn, id))
        .collect()
}

#[tauri::command]
pub async fn get_chapter_by_id(
    app_handle: AppHandle,
    id: String,
) -> Result<ChapterWithCharacters, String> {
    let conn = get_connection(&app_handle)?;
    get_chapter_by_id_with_conn(&conn, &id)
}

#[tauri::command]
pub async fn update_chapter(
    app_handle: AppHandle,
    id: String,
    title: String,
    summary: Option<String>,
    content: Option<String>,
    status: String,
    target_word_count: Option<i32>,
) -> Result<ChapterWithCharacters, String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("章节标题不能为空".to_string());
    }
    validate_status(&status)?;
    validate_target_word_count(target_word_count)?;

    let conn = get_connection(&app_handle)?;
    let now = Utc::now().to_rfc3339();
    let changed = conn
        .execute(
            "UPDATE work_chapters
             SET title = ?1, summary = ?2, content = ?3, status = ?4,
                 target_word_count = ?5, updated_at = ?6
             WHERE id = ?7 AND deleted_at IS NULL",
            params![title, summary, content, status, target_word_count, now, id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("章节不存在或已删除".to_string());
    }

    get_chapter_by_id_with_conn(&conn, &id)
}

#[tauri::command]
pub async fn delete_chapter(app_handle: AppHandle, id: String) -> Result<(), String> {
    let conn = get_connection(&app_handle)?;
    let now = Utc::now().to_rfc3339();
    let changed = conn
        .execute(
            "UPDATE work_chapters SET deleted_at = ?1, updated_at = ?1
             WHERE id = ?2 AND deleted_at IS NULL",
            params![now, id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("章节不存在或已删除".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn update_chapter_order(
    app_handle: AppHandle,
    chapter_ids: Vec<String>,
) -> Result<(), String> {
    if chapter_ids.is_empty() {
        return Ok(());
    }

    let mut seen = HashSet::new();
    if chapter_ids.iter().any(|id| !seen.insert(id)) {
        return Err("章节排序包含重复项".to_string());
    }

    let mut conn = get_connection(&app_handle)?;
    let expected_work_id: String = conn
        .query_row(
            "SELECT work_id FROM work_chapters WHERE id = ?1 AND deleted_at IS NULL",
            params![chapter_ids[0]],
            |row| row.get(0),
        )
        .map_err(|_| "章节不存在或已删除".to_string())?;

    for chapter_id in &chapter_ids {
        let work_id: String = conn
            .query_row(
                "SELECT work_id FROM work_chapters WHERE id = ?1 AND deleted_at IS NULL",
                params![chapter_id],
                |row| row.get(0),
            )
            .map_err(|_| "章节不存在或已删除".to_string())?;
        if work_id != expected_work_id {
            return Err("只能对同一部作品的章节排序".to_string());
        }
    }

    let now = Utc::now().to_rfc3339();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for (index, chapter_id) in chapter_ids.iter().enumerate() {
        tx.execute(
            "UPDATE work_chapters SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
            params![index as i32, now, chapter_id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn set_chapter_characters(
    app_handle: AppHandle,
    chapter_id: String,
    characters: Vec<ChapterCharacterInput>,
) -> Result<ChapterWithCharacters, String> {
    let mut seen = HashSet::new();
    if characters
        .iter()
        .any(|character| !seen.insert(character.character_id.as_str()))
    {
        return Err("同一角色只能关联一次".to_string());
    }

    let mut conn = get_connection(&app_handle)?;
    let work_id: String = conn
        .query_row(
            "SELECT work_id FROM work_chapters WHERE id = ?1 AND deleted_at IS NULL",
            params![chapter_id],
            |row| row.get(0),
        )
        .map_err(|_| "章节不存在或已删除".to_string())?;

    for character in &characters {
        let exists: i64 = conn
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM characters
                    WHERE id = ?1 AND work_id = ?2 AND deleted_at IS NULL
                 )",
                params![character.character_id, work_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if exists != 1 {
            return Err("只能关联当前作品中未删除的人物".to_string());
        }
    }

    let now = Utc::now().to_rfc3339();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM chapter_character_relations WHERE chapter_id = ?1",
        params![chapter_id],
    )
    .map_err(|e| e.to_string())?;

    for character in &characters {
        tx.execute(
            "INSERT INTO chapter_character_relations
             (chapter_id, character_id, note, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![chapter_id, character.character_id, character.note, now, now,],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;

    get_chapter_by_id_with_conn(&conn, &chapter_id)
}

#[cfg(test)]
mod tests {
    use super::{validate_status, validate_target_word_count};

    #[test]
    fn accepts_known_chapter_statuses_only() {
        assert!(validate_status("outline").is_ok());
        assert!(validate_status("final").is_ok());
        assert!(validate_status("published").is_err());
    }

    #[test]
    fn rejects_non_positive_word_targets() {
        assert!(validate_target_word_count(None).is_ok());
        assert!(validate_target_word_count(Some(1)).is_ok());
        assert!(validate_target_word_count(Some(0)).is_err());
    }
}
