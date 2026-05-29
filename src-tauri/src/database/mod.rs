use rusqlite::{Connection, Result};
use std::path::Path;

pub fn init_database(db_path: &Path) -> Result<()> {
    let conn = Connection::open(db_path)?;

    // Create tables
    conn.execute_batch(SCHEMA)?;
    
    // Add template_schema column if not exists
    let _ = conn.execute(
        "ALTER TABLE prompt_groups ADD COLUMN template_schema TEXT",
        [],
    );

    // Add name column if not exists
    let _ = conn.execute(
        "ALTER TABLE prompt_groups ADD COLUMN name TEXT",
        [],
    );
    
    // Migration: Move IP images from images table to ip_images table
    migrate_ip_images(&conn)?;

    // Add path column to ip_assets if not exists (migration for existing DBs)
    let _ = conn.execute(
        "ALTER TABLE ip_assets ADD COLUMN path TEXT",
        [],
    );
    // Backfill path from name for existing rows that have no path
    let _ = conn.execute(
        "UPDATE ip_assets SET path = id WHERE path IS NULL OR path = ''",
        [],
    );

    // Add path column to ip_sticker_packs if not exists (migration for existing DBs)
    let _ = conn.execute(
        "ALTER TABLE ip_sticker_packs ADD COLUMN path TEXT",
        [],
    );
    // Backfill path from id for existing rows that have no path
    let _ = conn.execute(
        "UPDATE ip_sticker_packs SET path = id WHERE path IS NULL OR path = ''",
        [],
    );
    
    // Add path column to works if not exists (migration for existing DBs)
    let _ = conn.execute(
        "ALTER TABLE works ADD COLUMN path TEXT",
        [],
    );
    // Backfill path from id for existing works that have no path
    let _ = conn.execute(
        "UPDATE works SET path = id WHERE path IS NULL OR path = ''",
        [],
    );

    // Backfill existing ip_images records to ip_image_relations
    let _ = conn.execute(
        "INSERT OR IGNORE INTO ip_image_relations (ip_image_id, ip_id, is_primary)
         SELECT id, ip_id, 1 FROM ip_images WHERE ip_id IS NOT NULL",
        [],
    );
    
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

-- Images table (Prompt Template Domain)
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

-- IP Images table (IP Character Domain)
CREATE TABLE IF NOT EXISTS ip_images (
    id                  TEXT PRIMARY KEY,
    filename            TEXT NOT NULL,
    original_filename   TEXT NOT NULL,
    ip_id               TEXT NOT NULL,
    relative_path       TEXT NOT NULL,
    absolute_path       TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'inbox',
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
    FOREIGN KEY (ip_id) REFERENCES ip_assets(id) ON DELETE CASCADE
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
    name                TEXT,
    description         TEXT,
    template_schema     TEXT,
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

-- AI IP Assets table
CREATE TABLE IF NOT EXISTS ip_assets (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    path                TEXT NOT NULL UNIQUE,
    avatar_path         TEXT,
    inspiration         TEXT,
    description         TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

-- IP Character Sheets
CREATE TABLE IF NOT EXISTS ip_character_sheets (
    id                  TEXT PRIMARY KEY,
    ip_id               TEXT NOT NULL,
    image_path          TEXT NOT NULL,
    sheet_type          TEXT NOT NULL,
    sort_order          INTEGER DEFAULT 0,
    created_at          TEXT NOT NULL,
    FOREIGN KEY (ip_id) REFERENCES ip_assets(id) ON DELETE CASCADE
);

-- IP Creations mapping
CREATE TABLE IF NOT EXISTS ip_creations (
    ip_id               TEXT NOT NULL,
    image_path          TEXT NOT NULL,
    creation_name       TEXT,
    created_at          TEXT NOT NULL,
    PRIMARY KEY (ip_id, image_path),
    FOREIGN KEY (ip_id) REFERENCES ip_assets(id) ON DELETE CASCADE
);

-- IP Sticker Packs table
CREATE TABLE IF NOT EXISTS ip_sticker_packs (
    id                  TEXT PRIMARY KEY,
    ip_id               TEXT NOT NULL,
    name                TEXT NOT NULL,
    path                TEXT NOT NULL,
    description         TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    FOREIGN KEY (ip_id) REFERENCES ip_assets(id) ON DELETE CASCADE
);

-- IP Emojis table
CREATE TABLE IF NOT EXISTS ip_emojis (
    id                  TEXT PRIMARY KEY,
    ip_id               TEXT NOT NULL,
    pack_id             TEXT,
    image_path          TEXT NOT NULL,
    trigger_word        TEXT,
    sort_order          INTEGER DEFAULT 0,
    created_at          TEXT NOT NULL,
    FOREIGN KEY (ip_id) REFERENCES ip_assets(id) ON DELETE CASCADE,
    FOREIGN KEY (pack_id) REFERENCES ip_sticker_packs(id) ON DELETE SET NULL
);

-- IP Sticker Pack Platforms table
CREATE TABLE IF NOT EXISTS ip_sticker_pack_platforms (
    id                      TEXT PRIMARY KEY,
    pack_id                 TEXT NOT NULL,
    platform_name           TEXT NOT NULL,
    pack_name_on_platform   TEXT,
    emoji_size_spec         TEXT,
    status                  TEXT DEFAULT 'Draft',
    publish_url             TEXT,
    downloads_count         INTEGER DEFAULT 0,
    updated_at              TEXT NOT NULL,
    FOREIGN KEY (pack_id) REFERENCES ip_sticker_packs(id) ON DELETE CASCADE
);

-- IP Relations table
CREATE TABLE IF NOT EXISTS ip_relations (
    ip_a_id             TEXT NOT NULL,
    ip_b_id             TEXT NOT NULL,
    relation_type       TEXT NOT NULL,
    description         TEXT,
    created_at          TEXT NOT NULL,
    PRIMARY KEY (ip_a_id, ip_b_id, relation_type),
    FOREIGN KEY (ip_a_id) REFERENCES ip_assets(id) ON DELETE CASCADE,
    FOREIGN KEY (ip_b_id) REFERENCES ip_assets(id) ON DELETE CASCADE
);

-- IP Image-Tag relations
CREATE TABLE IF NOT EXISTS ip_image_tag_relations (
    ip_image_id  TEXT NOT NULL,
    tag_id       TEXT NOT NULL,
    PRIMARY KEY (ip_image_id, tag_id),
    FOREIGN KEY (ip_image_id) REFERENCES ip_images(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- IP Image-IP relations (Multi-IP support)
CREATE TABLE IF NOT EXISTS ip_image_relations (
    ip_image_id  TEXT NOT NULL,
    ip_id        TEXT NOT NULL,
    is_primary   INTEGER DEFAULT 0,
    PRIMARY KEY (ip_image_id, ip_id),
    FOREIGN KEY (ip_image_id) REFERENCES ip_images(id) ON DELETE CASCADE,
    FOREIGN KEY (ip_id) REFERENCES ip_assets(id) ON DELETE CASCADE
);

-- Indexes for Prompt Domain
CREATE INDEX IF NOT EXISTS idx_images_status ON images(status);
CREATE INDEX IF NOT EXISTS idx_images_storage ON images(storage_vendor_id, storage_model_id);
CREATE INDEX IF NOT EXISTS idx_images_primary_model ON images(primary_model_id);
CREATE INDEX IF NOT EXISTS idx_images_imported ON images(imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_prompt ON images(prompt);
CREATE INDEX IF NOT EXISTS idx_imr_model ON image_model_relations(model_id);
CREATE INDEX IF NOT EXISTS idx_itr_tag ON image_tag_relations(tag_id);
CREATE INDEX IF NOT EXISTS idx_ipgr_group ON image_prompt_group_relations(prompt_group_id);

-- Indexes for IP Domain
CREATE INDEX IF NOT EXISTS idx_ip_images_status ON ip_images(status);
CREATE INDEX IF NOT EXISTS idx_ip_images_ip ON ip_images(ip_id);
CREATE INDEX IF NOT EXISTS idx_ip_images_imported ON ip_images(imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_ip_itr_tag ON ip_image_tag_relations(tag_id);

-- Indexes for IP assets
CREATE INDEX IF NOT EXISTS idx_ip_character_sheets_ip ON ip_character_sheets(ip_id);
CREATE INDEX IF NOT EXISTS idx_ip_sticker_packs_ip ON ip_sticker_packs(ip_id);
CREATE INDEX IF NOT EXISTS idx_ip_emojis_pack ON ip_emojis(pack_id);
CREATE INDEX IF NOT EXISTS idx_ip_spp_pack ON ip_sticker_pack_platforms(pack_id);
CREATE INDEX IF NOT EXISTS idx_ip_ir_ip ON ip_image_relations(ip_id);

-- Works Collection tables
CREATE TABLE IF NOT EXISTS works (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    path                TEXT,
    work_type           TEXT NOT NULL,
    description         TEXT,
    release_date        TEXT,
    producer            TEXT,
    director_author     TEXT,
    status              TEXT,
    cover_path          TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    deleted_at          TEXT
);

CREATE TABLE IF NOT EXISTS characters (
    id                  TEXT PRIMARY KEY,
    work_id             TEXT NOT NULL,
    name                TEXT NOT NULL,
    character_type      TEXT,
    description         TEXT,
    appearance_info     TEXT,
    image_paths         TEXT,
    ip_id               TEXT,
    ip_relation_note    TEXT,
    display_order       INTEGER DEFAULT 0,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    deleted_at          TEXT,
    FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
    FOREIGN KEY (ip_id) REFERENCES ip_assets(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS work_tags (
    work_id             TEXT NOT NULL,
    tag_id              TEXT NOT NULL,
    PRIMARY KEY (work_id, tag_id),
    FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Indexes for Works Collection
CREATE INDEX IF NOT EXISTS idx_works_work_type ON works(work_type);
CREATE INDEX IF NOT EXISTS idx_works_status ON works(status);
CREATE INDEX IF NOT EXISTS idx_works_deleted_at ON works(deleted_at);
CREATE INDEX IF NOT EXISTS idx_characters_work_id ON characters(work_id);
CREATE INDEX IF NOT EXISTS idx_characters_ip_id ON characters(ip_id);
CREATE INDEX IF NOT EXISTS idx_characters_display_order ON characters(work_id, display_order);
CREATE INDEX IF NOT EXISTS idx_characters_deleted_at ON characters(deleted_at);
CREATE INDEX IF NOT EXISTS idx_work_tags_tag_id ON work_tags(tag_id);
"#;

fn migrate_ip_images(conn: &Connection) -> Result<()> {
    // Check if image_type column exists in images table
    let has_image_type: bool = conn
        .prepare("SELECT image_type FROM images LIMIT 1")
        .is_ok();
    
    if !has_image_type {
        // No migration needed - fresh install
        return Ok(());
    }
    
    // Check if image_ip_relations table exists
    let has_ip_relations: bool = conn
        .prepare("SELECT * FROM image_ip_relations LIMIT 1")
        .is_ok();
    
    if !has_ip_relations {
        // No migration needed
        return Ok(());
    }
    
    // Migrate images with image_type = 'ip' to ip_images table
    let mut stmt = conn.prepare(
        "SELECT i.id, i.filename, i.original_filename, i.relative_path, i.absolute_path,
                i.status, i.file_size, i.width, i.height, i.file_hash, i.format,
                i.has_watermark, i.watermark_platform, i.watermark_detected, i.watermark_removed,
                i.created_at, i.imported_at, i.archived_at, r.ip_id
         FROM images i
         LEFT JOIN image_ip_relations r ON i.id = r.image_id
         WHERE i.image_type = 'ip'"
    )?;
    
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,  // id
            row.get::<_, String>(1)?,  // filename
            row.get::<_, String>(2)?,  // original_filename
            row.get::<_, String>(3)?,  // relative_path
            row.get::<_, String>(4)?,  // absolute_path
            row.get::<_, String>(5)?,  // status
            row.get::<_, Option<i64>>(6)?,  // file_size
            row.get::<_, Option<i32>>(7)?,  // width
            row.get::<_, Option<i32>>(8)?,  // height
            row.get::<_, Option<String>>(9)?,  // file_hash
            row.get::<_, Option<String>>(10)?,  // format
            row.get::<_, i32>(11)?,  // has_watermark
            row.get::<_, Option<String>>(12)?,  // watermark_platform
            row.get::<_, i32>(13)?,  // watermark_detected
            row.get::<_, i32>(14)?,  // watermark_removed
            row.get::<_, String>(15)?,  // created_at
            row.get::<_, String>(16)?,  // imported_at
            row.get::<_, Option<String>>(17)?,  // archived_at
            row.get::<_, Option<String>>(18)?,  // ip_id
        ))
    })?;
    
    for row_result in rows {
        if let Ok((id, filename, original_filename, relative_path, absolute_path,
                   status, file_size, width, height, file_hash, format,
                   has_watermark, watermark_platform, watermark_detected, watermark_removed,
                   created_at, imported_at, archived_at, ip_id)) = row_result {
            
            let ip_id = ip_id.unwrap_or_else(|| "unknown".to_string());
            
            // Insert into ip_images
            let _ = conn.execute(
                "INSERT OR IGNORE INTO ip_images 
                 (id, filename, original_filename, ip_id, relative_path, absolute_path,
                  status, file_size, width, height, file_hash, format,
                  has_watermark, watermark_platform, watermark_detected, watermark_removed,
                  created_at, imported_at, archived_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                rusqlite::params![
                    id, filename, original_filename, ip_id, relative_path, absolute_path,
                    status, file_size, width, height, file_hash, format,
                    has_watermark, watermark_platform, watermark_detected, watermark_removed,
                    created_at, imported_at, archived_at
                ],
            );
            
            // Migrate tags
            let _ = conn.execute(
                "INSERT OR IGNORE INTO ip_image_tag_relations (ip_image_id, tag_id)
                 SELECT image_id, tag_id FROM image_tag_relations WHERE image_id = ?",
                [&id],
            );
        }
    }
    
    // Delete migrated images from images table
    let _ = conn.execute("DELETE FROM images WHERE image_type = 'ip'", []);
    
    // Drop old tables and columns
    let _ = conn.execute("DROP TABLE IF EXISTS image_ip_relations", []);
    
    Ok(())
}

fn insert_defaults(conn: &Connection) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    
    // Insert default unknown IP asset
    let ip_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM ip_assets WHERE id = 'unknown'",
        [],
        |row| row.get(0)
    )?;
    
    if ip_count == 0 {
        conn.execute(
            "INSERT INTO ip_assets (id, name, path, description, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?)",
            ("unknown", "Unknown", "unknown", "Default unknown IP character", &now, &now),
        )?;
    }
    
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