use super::CommandResult;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::Path;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::Manager;

#[derive(Default)]
pub struct FsAccessState {
    authorized_roots: Mutex<HashSet<PathBuf>>,
}

#[derive(Serialize)]
pub struct SecureDirEntry {
    name: String,
    path: String,
    is_file: bool,
    is_directory: bool,
}

#[derive(Serialize)]
pub struct SecureFileStat {
    is_file: bool,
    is_directory: bool,
    size: u64,
    modified_at: Option<u128>,
}

fn validate_os_path_arg(path: &str) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("Path is empty".to_string());
    }
    if path.contains('\0') {
        return Err("Path contains invalid null byte".to_string());
    }
    Ok(())
}

fn canonicalize_access_root(path: &Path) -> Result<PathBuf, String> {
    let canonical = fs::canonicalize(path)
        .map_err(|e| format!("Failed to resolve path '{}': {}", path.display(), e))?;
    if canonical.is_file() {
        Ok(canonical
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or(canonical))
    } else {
        Ok(canonical)
    }
}

fn canonicalize_existing_parent(path: &Path) -> Result<PathBuf, String> {
    let mut current = path;
    loop {
        if current.exists() {
            return fs::canonicalize(current)
                .map_err(|e| format!("Failed to resolve path '{}': {}", current.display(), e));
        }
        current = current
            .parent()
            .ok_or_else(|| format!("Path has no existing parent: {}", path.display()))?;
    }
}

fn app_data_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))
        .and_then(|p| canonicalize_access_root(&p))
}

fn is_authorized_path(
    app: &tauri::AppHandle,
    state: &tauri::State<FsAccessState>,
    path: &Path,
) -> Result<bool, String> {
    let target = canonicalize_existing_parent(path)?;
    let app_root = app_data_root(app)?;
    if target.starts_with(&app_root) {
        return Ok(true);
    }

    let roots = state
        .authorized_roots
        .lock()
        .map_err(|_| "Failed to lock authorized path state".to_string())?;

    Ok(roots.iter().any(|root| target.starts_with(root)))
}

fn require_authorized_path(
    app: &tauri::AppHandle,
    state: &tauri::State<FsAccessState>,
    path: &str,
) -> Result<PathBuf, String> {
    validate_os_path_arg(path)?;
    let path_buf = PathBuf::from(path);
    if is_authorized_path(app, state, &path_buf)? {
        Ok(path_buf)
    } else {
        Err(format!("Path is not authorized: {}", path))
    }
}

fn require_authorized_paths(
    app: &tauri::AppHandle,
    state: &tauri::State<FsAccessState>,
    paths: &[&str],
) -> Result<Vec<PathBuf>, String> {
    paths
        .iter()
        .map(|path| require_authorized_path(app, state, path))
        .collect()
}

/// Detect whether an image container has more than one frame without decoding
/// the image pixels.  This keeps the asset-grid fast when it only needs to
/// decide whether to request a static first-frame preview.
fn is_animated_image_file(path: &Path) -> Result<bool, String> {
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    let mut file = fs::File::open(path)
        .map_err(|e| format!("Failed to open image '{}': {}", path.display(), e))?;

    match extension.as_str() {
        "webp" => {
            let mut header = [0u8; 12];
            file.read_exact(&mut header)
                .map_err(|e| format!("Failed to read WebP header: {}", e))?;
            if &header[..4] != b"RIFF" || &header[8..] != b"WEBP" {
                return Ok(false);
            }

            loop {
                let mut chunk_header = [0u8; 8];
                match file.read_exact(&mut chunk_header) {
                    Ok(()) => {}
                    Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => return Ok(false),
                    Err(error) => return Err(format!("Failed to inspect WebP chunks: {}", error)),
                }

                if &chunk_header[..4] == b"ANIM" || &chunk_header[..4] == b"ANMF" {
                    return Ok(true);
                }

                let chunk_size = u32::from_le_bytes(chunk_header[4..8].try_into().unwrap()) as i64;
                // RIFF chunks are padded to an even byte boundary.
                file.seek(SeekFrom::Current(chunk_size + (chunk_size % 2)))
                    .map_err(|e| format!("Failed to skip WebP chunk: {}", e))?;
            }
        }
        "png" | "apng" => {
            let mut signature = [0u8; 8];
            file.read_exact(&mut signature)
                .map_err(|e| format!("Failed to read PNG header: {}", e))?;
            if signature != [137, 80, 78, 71, 13, 10, 26, 10] {
                return Ok(false);
            }

            loop {
                let mut chunk_header = [0u8; 8];
                match file.read_exact(&mut chunk_header) {
                    Ok(()) => {}
                    Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => return Ok(false),
                    Err(error) => return Err(format!("Failed to inspect PNG chunks: {}", error)),
                }

                let chunk_size = u32::from_be_bytes(chunk_header[..4].try_into().unwrap()) as i64;
                if &chunk_header[4..] == b"acTL" {
                    return Ok(true);
                }
                if &chunk_header[4..] == b"IEND" {
                    return Ok(false);
                }

                // Skip chunk payload and its CRC.
                file.seek(SeekFrom::Current(chunk_size + 4))
                    .map_err(|e| format!("Failed to skip PNG chunk: {}", e))?;
            }
        }
        "gif" => {
            let mut header = [0u8; 13];
            file.read_exact(&mut header)
                .map_err(|e| format!("Failed to read GIF header: {}", e))?;
            if &header[..6] != b"GIF87a" && &header[..6] != b"GIF89a" {
                return Ok(false);
            }

            // Skip the global color table when present.
            if header[10] & 0b1000_0000 != 0 {
                let table_size = 3_i64 * (1_i64 << ((header[10] & 0b0000_0111) + 1));
                file.seek(SeekFrom::Current(table_size))
                    .map_err(|e| format!("Failed to skip GIF global color table: {}", e))?;
            }

            let mut frame_count = 0;
            loop {
                let mut marker = [0u8; 1];
                match file.read_exact(&mut marker) {
                    Ok(()) => {}
                    Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => return Ok(false),
                    Err(error) => return Err(format!("Failed to inspect GIF blocks: {}", error)),
                }

                match marker[0] {
                    0x2C => {
                        // Image descriptor, optional local color table, LZW data sub-blocks.
                        let mut descriptor = [0u8; 9];
                        file.read_exact(&mut descriptor)
                            .map_err(|e| format!("Failed to read GIF image descriptor: {}", e))?;
                        if descriptor[8] & 0b1000_0000 != 0 {
                            let table_size = 3_i64 * (1_i64 << ((descriptor[8] & 0b0000_0111) + 1));
                            file.seek(SeekFrom::Current(table_size)).map_err(|e| {
                                format!("Failed to skip GIF local color table: {}", e)
                            })?;
                        }
                        // LZW minimum code size, then data sub-blocks.
                        file.seek(SeekFrom::Current(1))
                            .map_err(|e| format!("Failed to skip GIF LZW size: {}", e))?;
                        skip_gif_sub_blocks(&mut file)?;
                        frame_count += 1;
                        if frame_count > 1 {
                            return Ok(true);
                        }
                    }
                    0x21 => {
                        // Extension label, followed by one or more data sub-blocks.
                        file.seek(SeekFrom::Current(1))
                            .map_err(|e| format!("Failed to skip GIF extension label: {}", e))?;
                        skip_gif_sub_blocks(&mut file)?;
                    }
                    0x3B => return Ok(false),
                    _ => return Ok(false),
                }
            }
        }
        _ => Ok(false),
    }
}

fn skip_gif_sub_blocks(file: &mut fs::File) -> Result<(), String> {
    loop {
        let mut size = [0u8; 1];
        file.read_exact(&mut size)
            .map_err(|e| format!("Failed to read GIF sub-block size: {}", e))?;
        if size[0] == 0 {
            return Ok(());
        }
        file.seek(SeekFrom::Current(i64::from(size[0])))
            .map_err(|e| format!("Failed to skip GIF sub-block: {}", e))?;
    }
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
        ("ip_sticker_packs", "cover_path"),
        ("ip_sticker_packs", "banner_path"),
        ("ip_sticker_packs", "icon_path"),
        ("ip_sticker_packs", "reward_guide_path"),
        ("ip_sticker_packs", "reward_thanks_path"),
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
        ("ip_sticker_packs", "id", "cover_path"),
        ("ip_sticker_packs", "id", "banner_path"),
        ("ip_sticker_packs", "id", "icon_path"),
        ("ip_sticker_packs", "id", "reward_guide_path"),
        ("ip_sticker_packs", "id", "reward_thanks_path"),
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

#[tauri::command]
pub fn authorize_fs_paths(
    paths: Vec<String>,
    state: tauri::State<FsAccessState>,
) -> CommandResult<bool> {
    let mut roots = match state.authorized_roots.lock() {
        Ok(roots) => roots,
        Err(_) => return CommandResult::err("Failed to lock authorized path state".to_string()),
    };

    for path in paths {
        if path.trim().is_empty() {
            continue;
        }
        match canonicalize_access_root(Path::new(&path)) {
            Ok(root) => {
                roots.insert(root);
            }
            Err(e) => return CommandResult::err(e),
        }
    }

    CommandResult::ok(true)
}

#[tauri::command]
pub fn secure_fs_exists(
    app: tauri::AppHandle,
    state: tauri::State<FsAccessState>,
    path: String,
) -> CommandResult<bool> {
    match require_authorized_path(&app, &state, &path) {
        Ok(path) => CommandResult::ok(path.exists()),
        Err(e) => CommandResult::err(e),
    }
}

#[tauri::command]
pub fn secure_fs_mkdir(
    app: tauri::AppHandle,
    state: tauri::State<FsAccessState>,
    path: String,
    recursive: bool,
) -> CommandResult<bool> {
    match require_authorized_path(&app, &state, &path) {
        Ok(path) => {
            let result = if recursive {
                fs::create_dir_all(path)
            } else {
                fs::create_dir(path)
            };
            match result {
                Ok(_) => CommandResult::ok(true),
                Err(e) => CommandResult::err(format!("Failed to create directory: {}", e)),
            }
        }
        Err(e) => CommandResult::err(e),
    }
}

#[tauri::command]
pub fn secure_fs_read_file(
    app: tauri::AppHandle,
    state: tauri::State<FsAccessState>,
    path: String,
) -> CommandResult<Vec<u8>> {
    match require_authorized_path(&app, &state, &path) {
        Ok(path) => match fs::read(path) {
            Ok(data) => CommandResult::ok(data),
            Err(e) => CommandResult::err(format!("Failed to read file: {}", e)),
        },
        Err(e) => CommandResult::err(e),
    }
}

#[tauri::command]
pub fn secure_fs_is_animated_image(
    app: tauri::AppHandle,
    state: tauri::State<FsAccessState>,
    path: String,
) -> CommandResult<bool> {
    match require_authorized_path(&app, &state, &path) {
        Ok(path) => match is_animated_image_file(&path) {
            Ok(is_animated) => CommandResult::ok(is_animated),
            Err(error) => CommandResult::err(error),
        },
        Err(error) => CommandResult::err(error),
    }
}

#[tauri::command]
pub fn secure_fs_write_file(
    app: tauri::AppHandle,
    state: tauri::State<FsAccessState>,
    path: String,
    data: Vec<u8>,
) -> CommandResult<bool> {
    match require_authorized_path(&app, &state, &path) {
        Ok(path) => match fs::write(path, data) {
            Ok(_) => CommandResult::ok(true),
            Err(e) => CommandResult::err(format!("Failed to write file: {}", e)),
        },
        Err(e) => CommandResult::err(e),
    }
}

#[tauri::command]
pub fn secure_fs_append_file(
    app: tauri::AppHandle,
    state: tauri::State<FsAccessState>,
    path: String,
    data: Vec<u8>,
) -> CommandResult<bool> {
    match require_authorized_path(&app, &state, &path) {
        Ok(path) => {
            let mut file = match fs::OpenOptions::new().create(true).append(true).open(path) {
                Ok(file) => file,
                Err(e) => {
                    return CommandResult::err(format!("Failed to open file for append: {}", e))
                }
            };

            match file.write_all(&data) {
                Ok(_) => CommandResult::ok(true),
                Err(e) => CommandResult::err(format!("Failed to append file: {}", e)),
            }
        }
        Err(e) => CommandResult::err(e),
    }
}

#[tauri::command]
pub fn secure_fs_copy_file(
    app: tauri::AppHandle,
    state: tauri::State<FsAccessState>,
    source: String,
    target: String,
) -> CommandResult<bool> {
    match require_authorized_paths(&app, &state, &[&source, &target]) {
        Ok(paths) => match fs::copy(&paths[0], &paths[1]) {
            Ok(_) => CommandResult::ok(true),
            Err(e) => CommandResult::err(format!("Failed to copy file: {}", e)),
        },
        Err(e) => CommandResult::err(e),
    }
}

#[tauri::command]
pub fn secure_fs_rename(
    app: tauri::AppHandle,
    state: tauri::State<FsAccessState>,
    source: String,
    target: String,
) -> CommandResult<bool> {
    match require_authorized_paths(&app, &state, &[&source, &target]) {
        Ok(paths) => match fs::rename(&paths[0], &paths[1]) {
            Ok(_) => CommandResult::ok(true),
            Err(e) => CommandResult::err(format!("Failed to rename path: {}", e)),
        },
        Err(e) => CommandResult::err(e),
    }
}

#[tauri::command]
pub fn secure_fs_remove(
    app: tauri::AppHandle,
    state: tauri::State<FsAccessState>,
    path: String,
    recursive: bool,
) -> CommandResult<bool> {
    match require_authorized_path(&app, &state, &path) {
        Ok(path) => {
            let result = if path.is_dir() {
                if recursive {
                    fs::remove_dir_all(path)
                } else {
                    fs::remove_dir(path)
                }
            } else {
                fs::remove_file(path)
            };
            match result {
                Ok(_) => CommandResult::ok(true),
                Err(e) => CommandResult::err(format!("Failed to remove path: {}", e)),
            }
        }
        Err(e) => CommandResult::err(e),
    }
}

#[tauri::command]
pub fn secure_fs_read_dir(
    app: tauri::AppHandle,
    state: tauri::State<FsAccessState>,
    path: String,
) -> CommandResult<Vec<SecureDirEntry>> {
    match require_authorized_path(&app, &state, &path) {
        Ok(path) => {
            let entries = match fs::read_dir(&path) {
                Ok(entries) => entries,
                Err(e) => return CommandResult::err(format!("Failed to read directory: {}", e)),
            };
            let mut result = Vec::new();
            for entry in entries.flatten() {
                let file_type = match entry.file_type() {
                    Ok(file_type) => file_type,
                    Err(_) => continue,
                };
                result.push(SecureDirEntry {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: entry.path().to_string_lossy().to_string(),
                    is_file: file_type.is_file(),
                    is_directory: file_type.is_dir(),
                });
            }
            CommandResult::ok(result)
        }
        Err(e) => CommandResult::err(e),
    }
}

#[tauri::command]
pub fn secure_fs_stat(
    app: tauri::AppHandle,
    state: tauri::State<FsAccessState>,
    path: String,
) -> CommandResult<SecureFileStat> {
    match require_authorized_path(&app, &state, &path) {
        Ok(path) => match fs::metadata(path) {
            Ok(metadata) => CommandResult::ok(SecureFileStat {
                is_file: metadata.is_file(),
                is_directory: metadata.is_dir(),
                size: metadata.len(),
                modified_at: metadata
                    .modified()
                    .ok()
                    .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                    .map(|duration| duration.as_millis()),
            }),
            Err(e) => CommandResult::err(format!("Failed to stat path: {}", e)),
        },
        Err(e) => CommandResult::err(e),
    }
}
