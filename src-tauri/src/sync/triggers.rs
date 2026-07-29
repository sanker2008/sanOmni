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

CREATE TABLE IF NOT EXISTS sync_pending_downloads (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    file_hash    TEXT NOT NULL,
    local_path   TEXT NOT NULL,
    table_name   TEXT NOT NULL,
    record_id    TEXT NOT NULL,
    path_key     TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(file_hash, local_path)
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

-- ip_image_relations
CREATE TRIGGER IF NOT EXISTS sync_ip_image_relations_insert AFTER INSERT ON ip_image_relations BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_image_relations', NEW.ip_image_id || '_' || NEW.ip_id, 'INSERT', json_object('ip_image_id', NEW.ip_image_id, 'ip_id', NEW.ip_id, 'is_primary', NEW.is_primary));
END;
CREATE TRIGGER IF NOT EXISTS sync_ip_image_relations_update AFTER UPDATE ON ip_image_relations BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_image_relations', NEW.ip_image_id || '_' || NEW.ip_id, 'UPDATE', json_object('ip_image_id', NEW.ip_image_id, 'ip_id', NEW.ip_id, 'is_primary', NEW.is_primary));
END;
CREATE TRIGGER IF NOT EXISTS sync_ip_image_relations_delete AFTER DELETE ON ip_image_relations BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_image_relations', OLD.ip_image_id || '_' || OLD.ip_id, 'DELETE', json_object('ip_image_id', OLD.ip_image_id, 'ip_id', OLD.ip_id));
END;

-- ip_image_tag_relations
CREATE TRIGGER IF NOT EXISTS sync_ip_image_tag_relations_insert AFTER INSERT ON ip_image_tag_relations BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_image_tag_relations', NEW.ip_image_id || '_' || NEW.tag_id, 'INSERT', json_object('ip_image_id', NEW.ip_image_id, 'tag_id', NEW.tag_id));
END;
CREATE TRIGGER IF NOT EXISTS sync_ip_image_tag_relations_delete AFTER DELETE ON ip_image_tag_relations BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_image_tag_relations', OLD.ip_image_id || '_' || OLD.tag_id, 'DELETE', json_object('ip_image_id', OLD.ip_image_id, 'tag_id', OLD.tag_id));
END;

-- tags
CREATE TRIGGER IF NOT EXISTS sync_tags_insert AFTER INSERT ON tags BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('tags', NEW.id, 'INSERT', json_object('id', NEW.id, 'name', NEW.name, 'name_en', NEW.name_en, 'color', NEW.color, 'parent_id', NEW.parent_id, 'use_count', NEW.use_count, 'is_builtin', NEW.is_builtin, 'created_at', NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_tags_update AFTER UPDATE ON tags BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('tags', NEW.id, 'UPDATE', json_object('id', NEW.id, 'name', NEW.name, 'name_en', NEW.name_en, 'color', NEW.color, 'parent_id', NEW.parent_id, 'use_count', NEW.use_count, 'is_builtin', NEW.is_builtin, 'created_at', NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_tags_delete AFTER DELETE ON tags BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('tags', OLD.id, 'DELETE', json_object('id', OLD.id));
END;

-- ip_sticker_packs
CREATE TRIGGER IF NOT EXISTS sync_ip_sticker_packs_insert AFTER INSERT ON ip_sticker_packs BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_sticker_packs', NEW.id, 'INSERT', json_object('id', NEW.id, 'ip_id', NEW.ip_id, 'name', NEW.name, 'path', NEW.path, 'description', NEW.description, 'cover_path', NEW.cover_path, 'banner_path', NEW.banner_path, 'icon_path', NEW.icon_path, 'reward_guide_path', NEW.reward_guide_path, 'reward_thanks_path', NEW.reward_thanks_path, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_ip_sticker_packs_update AFTER UPDATE ON ip_sticker_packs BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_sticker_packs', NEW.id, 'UPDATE', json_object('id', NEW.id, 'ip_id', NEW.ip_id, 'name', NEW.name, 'path', NEW.path, 'description', NEW.description, 'cover_path', NEW.cover_path, 'banner_path', NEW.banner_path, 'icon_path', NEW.icon_path, 'reward_guide_path', NEW.reward_guide_path, 'reward_thanks_path', NEW.reward_thanks_path, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_ip_sticker_packs_delete AFTER DELETE ON ip_sticker_packs BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_sticker_packs', OLD.id, 'DELETE', json_object('id', OLD.id));
END;

-- ip_sticker_pack_platforms
CREATE TRIGGER IF NOT EXISTS sync_ip_sticker_pack_platforms_insert AFTER INSERT ON ip_sticker_pack_platforms BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_sticker_pack_platforms', NEW.id, 'INSERT', json_object('id', NEW.id, 'pack_id', NEW.pack_id, 'platform_name', NEW.platform_name, 'pack_name_on_platform', NEW.pack_name_on_platform, 'emoji_size_spec', NEW.emoji_size_spec, 'status', NEW.status, 'publish_url', NEW.publish_url, 'downloads_count', NEW.downloads_count, 'updated_at', NEW.updated_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_ip_sticker_pack_platforms_update AFTER UPDATE ON ip_sticker_pack_platforms BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_sticker_pack_platforms', NEW.id, 'UPDATE', json_object('id', NEW.id, 'pack_id', NEW.pack_id, 'platform_name', NEW.platform_name, 'pack_name_on_platform', NEW.pack_name_on_platform, 'emoji_size_spec', NEW.emoji_size_spec, 'status', NEW.status, 'publish_url', NEW.publish_url, 'downloads_count', NEW.downloads_count, 'updated_at', NEW.updated_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_ip_sticker_pack_platforms_delete AFTER DELETE ON ip_sticker_pack_platforms BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_sticker_pack_platforms', OLD.id, 'DELETE', json_object('id', OLD.id));
END;

-- ip_emojis
CREATE TRIGGER IF NOT EXISTS sync_ip_emojis_insert AFTER INSERT ON ip_emojis BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_emojis', NEW.id, 'INSERT', json_object('id', NEW.id, 'ip_id', NEW.ip_id, 'pack_id', NEW.pack_id, 'image_path', NEW.image_path, 'trigger_word', NEW.trigger_word, 'sort_order', NEW.sort_order, 'created_at', NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_ip_emojis_update AFTER UPDATE ON ip_emojis BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_emojis', NEW.id, 'UPDATE', json_object('id', NEW.id, 'ip_id', NEW.ip_id, 'pack_id', NEW.pack_id, 'image_path', NEW.image_path, 'trigger_word', NEW.trigger_word, 'sort_order', NEW.sort_order, 'created_at', NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_ip_emojis_delete AFTER DELETE ON ip_emojis BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_emojis', OLD.id, 'DELETE', json_object('id', OLD.id));
END;

-- ip_character_sheets
CREATE TRIGGER IF NOT EXISTS sync_ip_character_sheets_insert AFTER INSERT ON ip_character_sheets BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_character_sheets', NEW.id, 'INSERT', json_object('id', NEW.id, 'ip_id', NEW.ip_id, 'image_path', NEW.image_path, 'sheet_type', NEW.sheet_type, 'sort_order', NEW.sort_order, 'created_at', NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_ip_character_sheets_update AFTER UPDATE ON ip_character_sheets BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_character_sheets', NEW.id, 'UPDATE', json_object('id', NEW.id, 'ip_id', NEW.ip_id, 'image_path', NEW.image_path, 'sheet_type', NEW.sheet_type, 'sort_order', NEW.sort_order, 'created_at', NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_ip_character_sheets_delete AFTER DELETE ON ip_character_sheets BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_character_sheets', OLD.id, 'DELETE', json_object('id', OLD.id, 'ip_id', OLD.ip_id, 'image_path', OLD.image_path));
END;

-- ip_creations. A path change modifies the composite key, so represent it as
-- DELETE + INSERT rather than an UPDATE that cannot identify the old row.
CREATE TRIGGER IF NOT EXISTS sync_ip_creations_insert AFTER INSERT ON ip_creations BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_creations', NEW.ip_id || '|' || NEW.image_path, 'INSERT', json_object('ip_id', NEW.ip_id, 'image_path', NEW.image_path, 'creation_name', NEW.creation_name, 'created_at', NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_ip_creations_update AFTER UPDATE ON ip_creations BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_creations', OLD.ip_id || '|' || OLD.image_path, 'DELETE', json_object('ip_id', OLD.ip_id, 'image_path', OLD.image_path));
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_creations', NEW.ip_id || '|' || NEW.image_path, 'INSERT', json_object('ip_id', NEW.ip_id, 'image_path', NEW.image_path, 'creation_name', NEW.creation_name, 'created_at', NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_ip_creations_delete AFTER DELETE ON ip_creations BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_creations', OLD.ip_id || '|' || OLD.image_path, 'DELETE', json_object('ip_id', OLD.ip_id, 'image_path', OLD.image_path));
END;

-- ip_relations
CREATE TRIGGER IF NOT EXISTS sync_ip_relations_insert AFTER INSERT ON ip_relations BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_relations', NEW.ip_a_id || '|' || NEW.ip_b_id || '|' || NEW.relation_type, 'INSERT', json_object('ip_a_id', NEW.ip_a_id, 'ip_b_id', NEW.ip_b_id, 'relation_type', NEW.relation_type, 'description', NEW.description, 'created_at', NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_ip_relations_update AFTER UPDATE ON ip_relations BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_relations', NEW.ip_a_id || '|' || NEW.ip_b_id || '|' || NEW.relation_type, 'UPDATE', json_object('ip_a_id', NEW.ip_a_id, 'ip_b_id', NEW.ip_b_id, 'relation_type', NEW.relation_type, 'description', NEW.description, 'created_at', NEW.created_at));
END;
CREATE TRIGGER IF NOT EXISTS sync_ip_relations_delete AFTER DELETE ON ip_relations BEGIN
    INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_relations', OLD.ip_a_id || '|' || OLD.ip_b_id || '|' || OLD.relation_type, 'DELETE', json_object('ip_a_id', OLD.ip_a_id, 'ip_b_id', OLD.ip_b_id, 'relation_type', OLD.relation_type));
END;
"#;

pub const DROP_TRIGGERS: &str = r#"
DROP TRIGGER IF EXISTS sync_ip_assets_insert;
DROP TRIGGER IF EXISTS sync_ip_assets_update;
DROP TRIGGER IF EXISTS sync_ip_assets_delete;
DROP TRIGGER IF EXISTS sync_ip_images_insert;
DROP TRIGGER IF EXISTS sync_ip_images_update;
DROP TRIGGER IF EXISTS sync_ip_images_delete;
DROP TRIGGER IF EXISTS sync_ip_image_relations_insert;
DROP TRIGGER IF EXISTS sync_ip_image_relations_update;
DROP TRIGGER IF EXISTS sync_ip_image_relations_delete;
DROP TRIGGER IF EXISTS sync_ip_image_tag_relations_insert;
DROP TRIGGER IF EXISTS sync_ip_image_tag_relations_delete;
DROP TRIGGER IF EXISTS sync_tags_insert;
DROP TRIGGER IF EXISTS sync_tags_update;
DROP TRIGGER IF EXISTS sync_tags_delete;
DROP TRIGGER IF EXISTS sync_ip_sticker_packs_insert;
DROP TRIGGER IF EXISTS sync_ip_sticker_packs_update;
DROP TRIGGER IF EXISTS sync_ip_sticker_packs_delete;
DROP TRIGGER IF EXISTS sync_ip_sticker_pack_platforms_insert;
DROP TRIGGER IF EXISTS sync_ip_sticker_pack_platforms_update;
DROP TRIGGER IF EXISTS sync_ip_sticker_pack_platforms_delete;
DROP TRIGGER IF EXISTS sync_ip_emojis_insert;
DROP TRIGGER IF EXISTS sync_ip_emojis_update;
DROP TRIGGER IF EXISTS sync_ip_emojis_delete;
DROP TRIGGER IF EXISTS sync_ip_character_sheets_insert;
DROP TRIGGER IF EXISTS sync_ip_character_sheets_update;
DROP TRIGGER IF EXISTS sync_ip_character_sheets_delete;
DROP TRIGGER IF EXISTS sync_ip_creations_insert;
DROP TRIGGER IF EXISTS sync_ip_creations_update;
DROP TRIGGER IF EXISTS sync_ip_creations_delete;
DROP TRIGGER IF EXISTS sync_ip_relations_insert;
DROP TRIGGER IF EXISTS sync_ip_relations_update;
DROP TRIGGER IF EXISTS sync_ip_relations_delete;
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_triggers_cover_all_mutable_sanip_child_tables() {
        for table in ["ip_character_sheets", "ip_creations", "ip_relations"] {
            assert!(
                SYNC_TRIGGERS.contains(&format!("sync_{}_insert", table)),
                "missing INSERT trigger for {}",
                table
            );
            assert!(
                SYNC_TRIGGERS.contains(&format!("sync_{}_delete", table)),
                "missing DELETE trigger for {}",
                table
            );
            assert!(
                DROP_TRIGGERS.contains(&format!("sync_{}_insert", table)),
                "missing DROP statement for {}",
                table
            );
        }
    }
}
