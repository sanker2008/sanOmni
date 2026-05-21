use rusqlite::{Connection, Result};
use std::path::Path;

pub fn init_database(db_path: &Path) -> Result<()> {
    let conn = Connection::open(db_path)?;
    
    // Create tables
    conn.execute_batch(SCHEMA)?;
    
    // Insert default vendors and models
    insert_defaults(&conn)?;
    
    Ok(())
}

pub fn reset_database(db_path: &Path) -> Result<()> {
    // Delete the database file if it exists
    if db_path.exists() {
        std::fs::remove_file(db_path)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    }
    
    // Reinitialize
    init_database(db_path)
}

const SCHEMA: &str = r#"
-- Vendors table
CREATE TABLE IF NOT EXISTS vendors (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    path        TEXT NOT NULL UNIQUE,
    icon        TEXT,
    sort_order  INTEGER DEFAULT 0,
    is_active   INTEGER DEFAULT 1,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- Models table
CREATE TABLE IF NOT EXISTS models (
    id          TEXT PRIMARY KEY,
    vendor_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    path        TEXT NOT NULL,
    version     TEXT,
    description TEXT,
    sort_order  INTEGER DEFAULT 0,
    is_active   INTEGER DEFAULT 1,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

-- Images table
CREATE TABLE IF NOT EXISTS images (
    id                  TEXT PRIMARY KEY,
    filename            TEXT NOT NULL,
    original_filename   TEXT NOT NULL,
    storage_vendor_id   TEXT NOT NULL,
    storage_model_id    TEXT NOT NULL,
    relative_path       TEXT NOT NULL,
    absolute_path       TEXT NOT NULL,
    primary_model_id    TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'inbox',
    prompt              TEXT,
    negative_prompt     TEXT,
    file_size           INTEGER,
    width               INTEGER,
    height              INTEGER,
    file_hash           TEXT,
    format              TEXT,
    has_watermark       INTEGER DEFAULT 0,
    watermark_platform  TEXT,
    watermark_detected  INTEGER DEFAULT 0,
    watermark_removed   INTEGER DEFAULT 0,
    created_at          TEXT NOT NULL,
    imported_at         TEXT NOT NULL,
    archived_at         TEXT,
    FOREIGN KEY (storage_vendor_id) REFERENCES vendors(id),
    FOREIGN KEY (storage_model_id) REFERENCES models(id),
    FOREIGN KEY (primary_model_id) REFERENCES models(id)
);

-- Image-Model relations
CREATE TABLE IF NOT EXISTS image_model_relations (
    image_id     TEXT NOT NULL,
    model_id     TEXT NOT NULL,
    is_primary   INTEGER DEFAULT 0,
    PRIMARY KEY (image_id, model_id),
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    name_en     TEXT,
    color       TEXT,
    parent_id   TEXT,
    use_count   INTEGER DEFAULT 0,
    is_builtin  INTEGER DEFAULT 0,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES tags(id) ON DELETE SET NULL
);

-- Image-Tag relations
CREATE TABLE IF NOT EXISTS image_tag_relations (
    image_id     TEXT NOT NULL,
    tag_id       TEXT NOT NULL,
    PRIMARY KEY (image_id, tag_id),
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Processing history
CREATE TABLE IF NOT EXISTS processing_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id    TEXT NOT NULL,
    action      TEXT NOT NULL,
    status      TEXT NOT NULL,
    details     TEXT,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- Prompt Groups (for comparing same prompt across different models)
CREATE TABLE IF NOT EXISTS prompt_groups (
    id                  TEXT PRIMARY KEY,
    prompt              TEXT NOT NULL,
    negative_prompt     TEXT,
    description         TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

-- Image-PromptGroup relations
CREATE TABLE IF NOT EXISTS image_prompt_group_relations (
    image_id            TEXT NOT NULL,
    prompt_group_id     TEXT NOT NULL,
    PRIMARY KEY (image_id, prompt_group_id),
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
    FOREIGN KEY (prompt_group_id) REFERENCES prompt_groups(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_images_status ON images(status);
CREATE INDEX IF NOT EXISTS idx_images_storage ON images(storage_vendor_id, storage_model_id);
CREATE INDEX IF NOT EXISTS idx_images_primary_model ON images(primary_model_id);
CREATE INDEX IF NOT EXISTS idx_images_imported ON images(imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_prompt ON images(prompt);
CREATE INDEX IF NOT EXISTS idx_imr_model ON image_model_relations(model_id);
CREATE INDEX IF NOT EXISTS idx_itr_tag ON image_tag_relations(tag_id);
CREATE INDEX IF NOT EXISTS idx_ipgr_group ON image_prompt_group_relations(prompt_group_id);
"#;

fn insert_defaults(conn: &Connection) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    
    // Check if vendors already exist
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM vendors",
        [],
        |row| row.get(0)
    )?;
    
    if count > 0 {
        return Ok(());
    }
    
    // Insert Unknown vendor and model as fallback
    conn.execute(
        "INSERT INTO vendors (id, name, path, sort_order, is_active, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("unknown", "Unknown", "unknown", 0, 1, &now, &now),
    )?;
    
    conn.execute(
        "INSERT INTO models (id, vendor_id, name, path, version, description, sort_order, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("unknown", "unknown", "Unknown Model", "unknown", "1", "Fallback for unclassified images", 0, 1, &now, &now),
    )?;
    
    // Insert OpenAI
    conn.execute(
        "INSERT INTO vendors (id, name, path, sort_order, is_active, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("openai", "OpenAI", "openai", 1, 1, &now, &now),
    )?;
    
    conn.execute(
        "INSERT INTO models (id, vendor_id, name, path, version, description, sort_order, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("gpt-image-2", "openai", "GPT Image 2", "gpt-image-2", "2", "OpenAI image generation model", 1, 1, &now, &now),
    )?;
    
    conn.execute(
        "INSERT INTO models (id, vendor_id, name, path, version, description, sort_order, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("dalle-3", "openai", "DALL-E 3", "dalle-3", "3", "OpenAI DALL-E 3 model", 2, 1, &now, &now),
    )?;
    
    // Insert Google
    conn.execute(
        "INSERT INTO vendors (id, name, path, sort_order, is_active, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("google", "Google", "google", 2, 1, &now, &now),
    )?;
    
    conn.execute(
        "INSERT INTO models (id, vendor_id, name, path, version, description, sort_order, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("nano-banana", "google", "Nano Banana", "nano-banana", "2.5", "Gemini 2.5 Flash Image", 1, 1, &now, &now),
    )?;
    
    conn.execute(
        "INSERT INTO models (id, vendor_id, name, path, version, description, sort_order, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("nano-banana-pro", "google", "Nano Banana Pro", "nano-banana-pro", "3", "Gemini 3 Flash Image", 2, 1, &now, &now),
    )?;
    
    conn.execute(
        "INSERT INTO models (id, vendor_id, name, path, version, description, sort_order, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("imagen-3", "google", "Imagen 3", "imagen-3", "3", "Professional API model", 3, 1, &now, &now),
    )?;
    
    // Insert Midjourney
    conn.execute(
        "INSERT INTO vendors (id, name, path, sort_order, is_active, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("midjourney", "Midjourney", "midjourney", 3, 1, &now, &now),
    )?;
    
    conn.execute(
        "INSERT INTO models (id, vendor_id, name, path, version, description, sort_order, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("midjourney-v6", "midjourney", "Midjourney v6", "midjourney-v6", "6", "Midjourney v6 model", 1, 1, &now, &now),
    )?;
    
    // Insert default tags
    let default_tags: &[(&str, &str, Option<&str>, Option<&str>)] = &[
        ("landscape", "风景", None, Some("#22c55e")),
        ("portrait", "人像", None, Some("#3b82f6")),
        ("abstract", "抽象", None, Some("#a855f7")),
        ("anime", "动漫", None, Some("#f43f5e")),
        ("realistic", "写实", None, Some("#f97316")),
    ];
    
    for (id, name, parent, color) in default_tags {
        conn.execute(
            "INSERT OR IGNORE INTO tags (id, name, name_en, color, is_builtin, created_at)
             VALUES (?, ?, ?, ?, 1, ?)",
            (id, name, parent, color, &now),
        )?;
    }
    
    Ok(())
}