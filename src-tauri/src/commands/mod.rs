use serde::Serialize;

#[derive(Serialize)]
pub struct CommandResult<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> CommandResult<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(msg: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(msg),
        }
    }
}

pub fn get_app_root(
    conn: &rusqlite::Connection,
    default_app_data_dir: &std::path::Path,
) -> std::path::PathBuf {
    if let Ok(unified) = conn.query_row(
        "SELECT value FROM settings WHERE key = 'unifiedRootPath'",
        [],
        |row| row.get::<_, String>(0),
    ) {
        if !unified.trim().is_empty() {
            return std::path::PathBuf::from(unified.trim());
        }
    }
    default_app_data_dir.to_path_buf()
}

pub fn get_app_root_from_handle(
    _app_handle: &tauri::AppHandle,
    default_app_data_dir: &std::path::Path,
) -> std::path::PathBuf {
    if let Ok(conn) =
        rusqlite::Connection::open(default_app_data_dir.join("data").join("database.sqlite"))
    {
        return get_app_root(&conn, default_app_data_dir);
    }
    default_app_data_dir.to_path_buf()
}

pub fn get_works_base_path(
    conn: &rusqlite::Connection,
    default_app_data_dir: &std::path::Path,
) -> std::path::PathBuf {
    if let Ok(works_path) = conn.query_row(
        "SELECT value FROM settings WHERE key = 'customWorksPath'",
        [],
        |row| row.get::<_, String>(0),
    ) {
        if !works_path.trim().is_empty() {
            return std::path::PathBuf::from(works_path.trim());
        }
    }
    get_app_root(conn, default_app_data_dir)
}

pub fn get_works_root_from_handle(
    _app_handle: &tauri::AppHandle,
    default_app_data_dir: &std::path::Path,
) -> std::path::PathBuf {
    if let Ok(conn) =
        rusqlite::Connection::open(default_app_data_dir.join("data").join("database.sqlite"))
    {
        return get_works_base_path(&conn, default_app_data_dir);
    }
    default_app_data_dir.to_path_buf()
}

pub mod gemini_watermark_removal;
pub mod images;
pub mod tags;
pub mod vendors;
pub mod watermark;
pub mod watermark_removal;

pub mod characters;
pub mod classifier;
pub mod fs;
pub mod ip_assets;
pub mod ip_images;
pub mod prompt_groups;
pub mod scanner;
pub mod settings;
pub mod sync_commands;
pub mod works;
