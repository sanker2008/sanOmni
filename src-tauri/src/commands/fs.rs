use super::CommandResult;
use std::fs;
use std::io;
use std::path::Path;
use std::path::PathBuf;

fn validate_os_path_arg(path: &str) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("Path is empty".to_string());
    }
    if path.contains('\0') {
        return Err("Path contains invalid null byte".to_string());
    }
    Ok(())
}

fn copy_dir_all(src: impl AsRef<Path>, dst: impl AsRef<Path>) -> io::Result<()> {
    fs::create_dir_all(&dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(entry.path(), dst.as_ref().join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.as_ref().join(entry.file_name()))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn migrate_directory(old_path: String, new_path: String) -> CommandResult<bool> {
    let old_p = PathBuf::from(&old_path);
    let new_p = PathBuf::from(&new_path);

    if !old_p.exists() {
        return CommandResult::ok(true); // Nothing to migrate
    }

    if old_p == new_p {
        return CommandResult::ok(true);
    }

    // Try rename first
    if fs::rename(&old_p, &new_p).is_err() {
        // Fallback to copy then remove
        if let Err(e) = copy_dir_all(&old_p, &new_p) {
            return CommandResult::err(format!("Failed to copy directory: {}", e));
        }
        if let Err(e) = fs::remove_dir_all(&old_p) {
            println!("Warning: Failed to remove old directory after copy: {}", e);
            // Return ok anyway because the copy succeeded, but the caller might want to know.
            // Currently CommandResult::ok just returns true. We will just return true for now.
        }
    }

    CommandResult::ok(true)
}

#[tauri::command]
pub fn update_database_paths(
    db_path: String,
    old_path: String,
    new_path: String,
) -> CommandResult<bool> {
    let mut conn = match rusqlite::Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("Failed to open DB: {}", e)),
    };

    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(e) => return CommandResult::err(format!("Failed to start transaction: {}", e)),
    };

    let old_dir = if old_path.ends_with('/') || old_path.ends_with('\\') {
        old_path.clone()
    } else {
        format!("{}\\", old_path)
    };
    let new_dir = if new_path.ends_with('/') || new_path.ends_with('\\') {
        new_path.clone()
    } else {
        format!("{}\\", new_path)
    };

    let old_dir_fwd = old_dir.replace("\\", "/");
    let new_dir_fwd = new_dir.replace("\\", "/");

    let old_dir_json = old_dir.replace("\\", "\\\\");
    let new_dir_json = new_dir.replace("\\", "\\\\");

    let tables_cols = vec![
        ("images", "absolute_path"),
        ("ip_images", "absolute_path"),
        ("ip_character_sheets", "image_path"),
        ("ip_creations", "image_path"),
        ("ip_emojis", "image_path"),
        ("works", "cover_path"),
        ("works", "path"),
        ("ip_assets", "path"),
        ("ip_assets", "avatar_path"),
        ("ip_sticker_packs", "path"),
    ];

    for (table, col) in tables_cols {
        let sql = format!("UPDATE {} SET {} = REPLACE(REPLACE({}, ?1, ?2), ?3, ?4) WHERE {} LIKE ?1 || '%' OR {} LIKE ?3 || '%'", table, col, col, col, col);
        if let Err(e) = tx.execute(
            &sql,
            rusqlite::params![old_dir, new_dir, old_dir_fwd, new_dir_fwd],
        ) {
            return CommandResult::err(format!("Failed to update {} in {}: {}", col, table, e));
        }
    }

    let sql_char = "UPDATE characters SET image_paths = REPLACE(REPLACE(REPLACE(REPLACE(image_paths, ?1, ?2), ?3, ?4), ?5, ?6), ?7, ?8)";
    if let Err(e) = tx.execute(
        sql_char,
        rusqlite::params![
            old_dir,
            new_dir,
            old_dir_fwd,
            new_dir_fwd,
            old_dir_json,
            new_dir_json,
            old_dir_fwd.replace("/", "\\/"),
            new_dir_fwd.replace("/", "\\/")
        ],
    ) {
        return CommandResult::err(format!("Failed to update characters.image_paths: {}", e));
    }

    if let Err(e) = tx.commit() {
        return CommandResult::err(format!("Failed to commit transaction: {}", e));
    }

    CommandResult::ok(true)
}

#[derive(serde::Serialize)]
pub struct DirectoryStatus {
    exists: bool,
    is_empty: bool,
}

#[tauri::command]
pub async fn check_directory_status(path: String) -> CommandResult<DirectoryStatus> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return CommandResult::ok(DirectoryStatus {
            exists: false,
            is_empty: true,
        });
    }
    if !p.is_dir() {
        return CommandResult::err("Path exists but is not a directory".to_string());
    }

    let mut is_empty = true;
    if let Ok(mut entries) = fs::read_dir(&p) {
        if entries.next().is_some() {
            is_empty = false;
        }
    }

    CommandResult::ok(DirectoryStatus {
        exists: true,
        is_empty,
    })
}

#[derive(serde::Serialize)]
pub struct RepairReport {
    total_records: usize,
    valid_count: usize,
    broken_count: usize,
    fixable_count: usize,
    fixed_count: usize,
    unfixable_paths: Vec<String>,
}

#[tauri::command]
pub fn repair_database_paths(
    db_path: String,
    search_dirs: Vec<String>,
    auto_fix: bool,
) -> CommandResult<RepairReport> {
    let mut conn = match rusqlite::Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("Failed to open DB: {}", e)),
    };

    let mut total_records = 0;
    let mut valid_count = 0;
    let mut broken_count = 0;
    let mut fixable_count = 0;
    let mut fixed_count = 0;
    let mut unfixable_paths = Vec::new();

    let tables_cols = vec![
        ("images", "id", "absolute_path"),
        ("ip_images", "id", "absolute_path"),
        ("ip_character_sheets", "id", "image_path"),
        ("ip_creations", "ip_id", "image_path"),
        ("ip_emojis", "id", "image_path"),
        ("works", "id", "cover_path"),
        ("works", "id", "path"),
        ("ip_assets", "id", "path"),
        ("ip_assets", "id", "avatar_path"),
        ("ip_sticker_packs", "id", "path"),
    ];

    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(e) => return CommandResult::err(format!("Failed to start transaction: {}", e)),
    };

    for (table, id_col, path_col) in tables_cols {
        let sql = format!(
            "SELECT {}, {} FROM {} WHERE {} IS NOT NULL AND {} != ''",
            id_col, path_col, table, path_col, path_col
        );

        let mut rows_to_update = Vec::new();
        {
            let mut stmt = match tx.prepare(&sql) {
                Ok(s) => s,
                Err(_) => continue,
            };

            let mut rows = match stmt.query([]) {
                Ok(r) => r,
                Err(_) => continue,
            };

            while let Ok(Some(row)) = rows.next() {
                total_records += 1;
                let id: String = row.get(0).unwrap_or_default();
                let path: String = row.get(1).unwrap_or_default();

                let p = PathBuf::from(&path);
                if p.exists() {
                    valid_count += 1;
                } else {
                    broken_count += 1;
                    let file_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");

                    let mut found_path = None;
                    if !file_name.is_empty() {
                        for sdir in &search_dirs {
                            if sdir.is_empty() {
                                continue;
                            }

                            let spath = PathBuf::from(sdir).join(file_name);
                            if spath.exists() {
                                found_path = Some(spath.to_string_lossy().to_string());
                                break;
                            }
                        }
                    }

                    if let Some(new_path) = found_path {
                        fixable_count += 1;
                        if auto_fix {
                            rows_to_update.push((table, id_col, path_col, id, new_path));
                        }
                    } else {
                        if unfixable_paths.len() < 50 {
                            unfixable_paths.push(path.clone());
                        }
                    }
                }
            }
        }

        for (t, i_c, p_c, id, new_path) in rows_to_update {
            let update_sql = format!("UPDATE {} SET {} = ?1 WHERE {} = ?2", t, p_c, i_c);
            if let Ok(_) = tx.execute(&update_sql, rusqlite::params![new_path, id]) {
                fixed_count += 1;
            }
        }
    }

    if auto_fix {
        let _ = tx.commit();
    }

    CommandResult::ok(RepairReport {
        total_records,
        valid_count,
        broken_count,
        fixable_count,
        fixed_count,
        unfixable_paths,
    })
}

#[tauri::command]
pub fn show_in_folder(path: String) -> Result<(), String> {
    validate_os_path_arg(&path)?;

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        use std::fs::metadata;
        use std::process::Command;
        if metadata(&path).map(|m| m.is_dir()).unwrap_or(false) {
            Command::new("xdg-open")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open folder: {}", e))?;
        } else {
            let mut path2 = std::path::PathBuf::from(&path);
            path2.pop();
            Command::new("xdg-open")
                .arg(&path2)
                .spawn()
                .map_err(|e| format!("Failed to open folder: {}", e))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    validate_os_path_arg(&path)?;

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open path: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open path: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open path: {}", e))?;
    }

    Ok(())
}
