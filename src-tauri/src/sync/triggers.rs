pub const SYNC_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS sync_changelog (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name   TEXT NOT NULL,
    record_id    TEXT NOT NULL,
    operation    TEXT NOT NULL,   -- 'INSERT' | 'UPDATE' | 'DELETE'
    data_json    TEXT,
    changed_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_config (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);
"#;

pub const SYNC_TRIGGERS: &str = r#"
-- ip_assets
CREATE TRIGGER IF NOT EXISTS sync_ip_assets_insert AFTER INSERT ON ip_assets BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_assets', NEW.id, 'INSERT', json_object('id', NEW.id, 'name', NEW.name, 'path', NEW.path, 'avatar_path', NEW.avatar_path, 'inspiration', NEW.inspiration, 'description', NEW.description, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_ip_assets_update AFTER UPDATE ON ip_assets BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_assets', NEW.id, 'UPDATE', json_object('id', NEW.id, 'name', NEW.name, 'path', NEW.path, 'avatar_path', NEW.avatar_path, 'inspiration', NEW.inspiration, 'description', NEW.description, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_ip_assets_delete AFTER DELETE ON ip_assets BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_assets', OLD.id, 'DELETE', json_object('id', OLD.id));
END;

-- ip_images
CREATE TRIGGER IF NOT EXISTS sync_ip_images_insert AFTER INSERT ON ip_images BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_images', NEW.id, 'INSERT', json_object('id', NEW.id, 'filename', NEW.filename, 'original_filename', NEW.original_filename, 'ip_id', NEW.ip_id, 'relative_path', NEW.relative_path, 'absolute_path', NEW.absolute_path, 'status', NEW.status, 'file_size', NEW.file_size, 'width', NEW.width, 'height', NEW.height, 'file_hash', NEW.file_hash, 'format', NEW.format, 'has_watermark', NEW.has_watermark, 'watermark_platform', NEW.watermark_platform, 'watermark_detected', NEW.watermark_detected, 'watermark_removed', NEW.watermark_removed, 'created_at', NEW.created_at, 'imported_at', NEW.imported_at, 'archived_at', NEW.archived_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_ip_images_update AFTER UPDATE ON ip_images BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_images', NEW.id, 'UPDATE', json_object('id', NEW.id, 'filename', NEW.filename, 'original_filename', NEW.original_filename, 'ip_id', NEW.ip_id, 'relative_path', NEW.relative_path, 'absolute_path', NEW.absolute_path, 'status', NEW.status, 'file_size', NEW.file_size, 'width', NEW.width, 'height', NEW.height, 'file_hash', NEW.file_hash, 'format', NEW.format, 'has_watermark', NEW.has_watermark, 'watermark_platform', NEW.watermark_platform, 'watermark_detected', NEW.watermark_detected, 'watermark_removed', NEW.watermark_removed, 'created_at', NEW.created_at, 'imported_at', NEW.imported_at, 'archived_at', NEW.archived_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_ip_images_delete AFTER DELETE ON ip_images BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_images', OLD.id, 'DELETE', json_object('id', OLD.id));
END;
"#;

pub const DROP_TRIGGERS: &str = r#"
DROP TRIGGER IF EXISTS sync_ip_assets_insert;
DROP TRIGGER IF EXISTS sync_ip_assets_update;
DROP TRIGGER IF EXISTS sync_ip_assets_delete;
DROP TRIGGER IF EXISTS sync_ip_images_insert;
DROP TRIGGER IF EXISTS sync_ip_images_update;
DROP TRIGGER IF EXISTS sync_ip_images_delete;
"#;
