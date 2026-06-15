use crate::commands::CommandResult;
use crate::models::{
    IpAsset, IpAssetDetail, IpCharacterSheet, IpCreation, IpEmoji, IpImage, IpImageWithTags,
    IpRelation, IpStickerPack, IpStickerPackPlatform, Tag,
};
use chrono::Utc;
use rusqlite::{params, Connection};
use std::path::Path;
use uuid::Uuid;

// 辅助函数：将选择的图片拷贝到 app_data_dir 的独立子目录中，并返回拷贝后的绝对路径
fn copy_to_ip_archived(
    db_path: &str,
    ip_path: &str,
    subfolder: &str, // "ip_assets" 或 "emojis"
    pack_path: Option<&str>,
    src_file_path: &str,
) -> std::io::Result<String> {
    let db_path_obj = Path::new(db_path);
    let data_dir = db_path_obj.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::NotFound, "Parent folder not found")
    })?;
    let app_data_dir = data_dir.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::NotFound, "App data folder not found")
    })?;

    // 从 settings 表里读取 customIpArchivedPath
    let custom_path: Option<String> = {
        if let Ok(conn) = Connection::open(db_path_obj) {
            conn.query_row(
                "SELECT value FROM settings WHERE key = 'customIpArchivedPath'",
                [],
                |row| row.get(0),
            )
            .ok()
        } else {
            None
        }
    };

    let library_path = if let Some(ref path_str) = custom_path {
        if !path_str.trim().is_empty() {
            Path::new(path_str).to_path_buf()
        } else {
            app_data_dir.to_path_buf()
        }
    } else {
        app_data_dir.to_path_buf()
    };

    // 目标基本目录: library_path/ip_archived/{ip_path}
    let ip_dir = library_path.join("ip_archived").join(ip_path);

    // 决定目标目录
    let dest_dir = if subfolder == "emojis" {
        if let Some(pp) = pack_path {
            ip_dir.join("emojis").join(pp)
        } else {
            ip_dir.join("emojis")
        }
    } else {
        ip_dir.clone()
    };

    std::fs::create_dir_all(&dest_dir)?;

    let src_path = Path::new(src_file_path);
    if src_path.exists() {
        if let Ok(src_abs) = std::fs::canonicalize(src_path) {
            // 检查文件是否已经在 ip_archived/{ip_path}/ 目录树下（包括子目录）
            let ip_dir_abs = std::fs::canonicalize(&ip_dir).ok();
            if let Some(ip_dir_canonical) = ip_dir_abs {
                if src_abs.starts_with(&ip_dir_canonical) {
                    // 文件已在 IP 目录树下，直接返回原路径
                    return Ok(src_file_path.to_string());
                }
            }

            // 兼容旧逻辑：检查文件是否在目标目录的直接子文件
            if let Ok(dest_abs) = std::fs::canonicalize(&dest_dir) {
                if src_abs.parent() == Some(&dest_abs) {
                    return Ok(src_file_path.to_string());
                }
            }
        }
    }

    // Fetch naming template from settings
    let naming_template: String = {
        if let Ok(conn) = Connection::open(db_path_obj) {
            conn.query_row(
                "SELECT value FROM settings WHERE key = 'ipNamingTemplate'",
                [],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "{ip}-{date}-{time}".to_string())
        } else {
            "{ip}-{date}-{time}".to_string()
        }
    };

    let ext = src_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    let original_stem = src_path.file_stem().and_then(|s| s.to_str()).unwrap_or("");

    // 使用当前时间作为基准
    let mut current_time = chrono::Local::now();
    let mut dest_file_path;

    loop {
        let date = current_time.format("%Y%m%d").to_string();
        let time = current_time.format("%H%M%S").to_string();

        let filename_candidate = naming_template
            .replace("{ip}", ip_path)
            .replace("{date}", &date)
            .replace("{time}", &time)
            // 如果用户旧配置里还有 {index}，也用 time 替换掉它，保持兼容
            .replace("{index}", &time)
            .replace("{original}", original_stem);

        let mut path_candidate = dest_dir.join(&filename_candidate);
        if path_candidate.extension().is_none() {
            path_candidate.set_extension(ext);
        }

        dest_file_path = path_candidate;

        if dest_file_path.exists() {
            // Check if it is the exact same file path
            if src_path == dest_file_path {
                return Ok(dest_file_path.to_str().unwrap().to_string());
            }
            // 发生重名冲突，时间加 1 秒后重试
            current_time = current_time + chrono::Duration::seconds(1);
        } else {
            break;
        }
    }

    // 执行本地文件拷贝
    std::fs::copy(src_path, &dest_file_path)?;

    Ok(dest_file_path.to_str().unwrap().to_string())
}

#[tauri::command]
pub fn get_ip_assets(db_path: String) -> CommandResult<Vec<IpAsset>> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let mut stmt = match conn.prepare(
        "SELECT id, name, path, avatar_path, inspiration, description, created_at, updated_at
         FROM ip_assets
         ORDER BY (id = 'unknown') DESC, updated_at DESC",
    ) {
        Ok(s) => s,
        Err(e) => return CommandResult::err(format!("准备查询语句失败: {}", e)),
    };

    let rows = stmt.query_map([], |row| {
        let avatar_path: Option<String> = row.get(3)?;
        let verified_avatar_path = avatar_path.and_then(|p| {
            if Path::new(&p).exists() {
                Some(p)
            } else {
                None
            }
        });
        Ok(IpAsset {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row
                .get(2)
                .unwrap_or_else(|_| row.get::<_, String>(0).unwrap_or_default()),
            avatar_path: verified_avatar_path,
            inspiration: row.get(4)?,
            description: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    });

    match rows {
        Ok(mapped) => {
            let list: Vec<IpAsset> = mapped.filter_map(|r| r.ok()).collect();
            CommandResult::ok(list)
        }
        Err(e) => CommandResult::err(format!("查询 IP 列表失败: {}", e)),
    }
}

fn fetch_ip_image_tags(conn: &Connection, ip_image_id: &str) -> rusqlite::Result<Vec<Tag>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.name_en, t.color, t.parent_id, t.use_count, t.is_builtin, t.created_at
         FROM tags t
         JOIN ip_image_tag_relations r ON t.id = r.tag_id
         WHERE r.ip_image_id = ?"
    )?;

    let rows = stmt.query_map([ip_image_id], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            name_en: row.get(2)?,
            color: row.get(3)?,
            parent_id: row.get(4)?,
            use_count: row.get(5)?,
            is_builtin: row.get::<_, i32>(6)? != 0,
            created_at: row.get(7)?,
        })
    })?;

    let mut tags = Vec::new();
    for r in rows {
        if let Ok(t) = r {
            tags.push(t);
        }
    }
    Ok(tags)
}

#[tauri::command]
pub fn get_ip_asset_detail(db_path: String, ip_id: String) -> CommandResult<IpAssetDetail> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    // 1. 获取 IP 基础资料
    let mut stmt = match conn.prepare(
        "SELECT id, name, path, avatar_path, inspiration, description, created_at, updated_at
         FROM ip_assets
         WHERE id = ?",
    ) {
        Ok(s) => s,
        Err(e) => return CommandResult::err(format!("查询准备失败: {}", e)),
    };

    let ip = match stmt.query_row(params![ip_id], |row| {
        let avatar_path: Option<String> = row.get(3)?;
        let verified_avatar_path = avatar_path.and_then(|p| {
            if Path::new(&p).exists() {
                Some(p)
            } else {
                None
            }
        });
        Ok(IpAsset {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row
                .get(2)
                .unwrap_or_else(|_| row.get::<_, String>(0).unwrap_or_default()),
            avatar_path: verified_avatar_path,
            inspiration: row.get(4)?,
            description: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    }) {
        Ok(i) => i,
        Err(e) => return CommandResult::err(format!("未找到该 IP 形象: {}", e)),
    };

    // 2. 获取三视图
    let mut stmt_sheets = match conn.prepare(
        "SELECT id, ip_id, image_path, sheet_type, sort_order, created_at
         FROM ip_character_sheets
         WHERE ip_id = ?
         ORDER BY sort_order ASC, created_at DESC",
    ) {
        Ok(s) => s,
        Err(e) => return CommandResult::err(format!("查询三视图准备失败: {}", e)),
    };
    let sheets_mapped = stmt_sheets.query_map(params![ip_id], |row| {
        Ok(IpCharacterSheet {
            id: row.get(0)?,
            ip_id: row.get(1)?,
            image_path: row.get(2)?,
            sheet_type: row.get(3)?,
            sort_order: row.get(4)?,
            created_at: row.get(5)?,
        })
    });
    let character_sheets: Vec<IpCharacterSheet> = match sheets_mapped {
        Ok(m) => m.filter_map(|r| r.ok()).collect(),
        Err(_) => Vec::new(),
    };

    // 3. 获取创作关联
    let mut stmt_creations = match conn.prepare(
        "SELECT ip_id, image_path, creation_name, created_at
         FROM ip_creations
         WHERE ip_id = ?
         ORDER BY created_at DESC",
    ) {
        Ok(s) => s,
        Err(e) => return CommandResult::err(format!("查询创作准备失败: {}", e)),
    };
    let creations_mapped = stmt_creations.query_map(params![ip_id], |row| {
        Ok(IpCreation {
            ip_id: row.get(0)?,
            image_path: row.get(1)?,
            creation_name: row.get(2)?,
            created_at: row.get(3)?,
        })
    });
    let creations: Vec<IpCreation> = match creations_mapped {
        Ok(m) => m.filter_map(|r| r.ok()).collect(),
        Err(_) => Vec::new(),
    };

    // 4. 获取表情包分组套件
    let mut stmt_packs = match conn.prepare(
        "SELECT id, ip_id, name, path, description, cover_path, banner_path, icon_path, reward_guide_path, reward_thanks_path, created_at, updated_at
         FROM ip_sticker_packs
         WHERE ip_id = ?
         ORDER BY created_at DESC",
    ) {
        Ok(s) => s,
        Err(e) => return CommandResult::err(format!("查询表情包套件准备失败: {}", e)),
    };
    let packs_mapped = stmt_packs.query_map(params![ip_id], |row| {
        Ok(IpStickerPack {
            id: row.get(0)?,
            ip_id: row.get(1)?,
            name: row.get(2)?,
            path: row
                .get(3)
                .unwrap_or_else(|_| row.get::<_, String>(0).unwrap_or_default()),
            description: row.get(4)?,
            cover_path: row.get(5)?,
            banner_path: row.get(6)?,
            icon_path: row.get(7)?,
            reward_guide_path: row.get(8)?,
            reward_thanks_path: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    });
    let sticker_packs: Vec<IpStickerPack> = match packs_mapped {
        Ok(m) => m.filter_map(|r| r.ok()).collect(),
        Err(_) => Vec::new(),
    };

    // 5. 获取该 IP 下的所有表情图片（包含未分组的）
    let mut stmt_emojis = match conn.prepare(
        "SELECT id, ip_id, pack_id, image_path, trigger_word, sort_order, created_at
         FROM ip_emojis
         WHERE ip_id = ?
         ORDER BY sort_order ASC, created_at DESC",
    ) {
        Ok(s) => s,
        Err(e) => return CommandResult::err(format!("查询表情图片准备失败: {}", e)),
    };
    let emojis_mapped = stmt_emojis.query_map(params![ip_id], |row| {
        Ok(IpEmoji {
            id: row.get(0)?,
            ip_id: row.get(1)?,
            pack_id: row.get(2)?,
            image_path: row.get(3)?,
            trigger_word: row.get(4)?,
            sort_order: row.get(5)?,
            created_at: row.get(6)?,
        })
    });
    let emojis: Vec<IpEmoji> = match emojis_mapped {
        Ok(m) => m.filter_map(|r| r.ok()).collect(),
        Err(_) => Vec::new(),
    };

    // 6. 获取发布渠道平台参数
    let mut stmt_platforms = match conn.prepare(
        "SELECT id, pack_id, platform_name, pack_name_on_platform, emoji_size_spec, status, publish_url, downloads_count, updated_at
         FROM ip_sticker_pack_platforms
         WHERE pack_id IN (SELECT id FROM ip_sticker_packs WHERE ip_id = ?)
         ORDER BY platform_name ASC"
    ) {
        Ok(s) => s,
        Err(e) => return CommandResult::err(format!("查询发布平台准备失败: {}", e)),
    };
    let platforms_mapped = stmt_platforms.query_map(params![ip_id], |row| {
        Ok(IpStickerPackPlatform {
            id: row.get(0)?,
            pack_id: row.get(1)?,
            platform_name: row.get(2)?,
            pack_name_on_platform: row.get(3)?,
            emoji_size_spec: row.get(4)?,
            status: row.get(5)?,
            publish_url: row.get(6)?,
            downloads_count: row.get(7)?,
            updated_at: row.get(8)?,
        })
    });
    let platforms: Vec<IpStickerPackPlatform> = match platforms_mapped {
        Ok(m) => m.filter_map(|r| r.ok()).collect(),
        Err(_) => Vec::new(),
    };

    // 7. 获取关系链
    let mut stmt_relations = match conn.prepare(
        "SELECT r.ip_a_id, r.ip_b_id, r.relation_type, r.description, r.created_at, ip.name, ip.avatar_path
         FROM ip_relations r
         JOIN ip_assets ip ON r.ip_b_id = ip.id
         WHERE r.ip_a_id = ?
         ORDER BY r.created_at DESC"
    ) {
        Ok(s) => s,
        Err(e) => return CommandResult::err(format!("查询关系准备失败: {}", e)),
    };
    let relations_mapped = stmt_relations.query_map(params![ip_id], |row| {
        Ok(IpRelation {
            ip_a_id: row.get(0)?,
            ip_b_id: row.get(1)?,
            relation_type: row.get(2)?,
            description: row.get(3)?,
            created_at: row.get(4)?,
            ip_b_name: row.get(5)?,
            ip_b_avatar_path: row.get(6)?,
        })
    });
    let relations: Vec<IpRelation> = match relations_mapped {
        Ok(m) => m.filter_map(|r| r.ok()).collect(),
        Err(_) => Vec::new(),
    };

    // 8. 获取关联的 IP 图片 (ip_images)
    let mut stmt_ip_images = match conn.prepare(
        "SELECT id, filename, original_filename, ip_id, relative_path, absolute_path,
                status, file_size, width, height, file_hash, format,
                has_watermark, watermark_platform, watermark_detected, watermark_removed,
                created_at, imported_at, archived_at
         FROM ip_images
         WHERE ip_id = ? OR id IN (SELECT ip_image_id FROM ip_image_relations WHERE ip_id = ?)
         ORDER BY imported_at DESC",
    ) {
        Ok(s) => s,
        Err(e) => return CommandResult::err(format!("查询关联图片准备失败: {}", e)),
    };
    let ip_images_mapped = stmt_ip_images.query_map(params![ip_id, ip_id], |row| {
        Ok(IpImage {
            id: row.get(0)?,
            filename: row.get(1)?,
            original_filename: row.get(2)?,
            ip_id: row.get(3)?,
            relative_path: row.get(4)?,
            absolute_path: row.get(5)?,
            status: row.get(6)?,
            file_size: row.get(7)?,
            width: row.get(8)?,
            height: row.get(9)?,
            file_hash: row.get(10)?,
            format: row.get(11)?,
            has_watermark: row.get::<_, i32>(12)? != 0,
            watermark_platform: row.get(13)?,
            watermark_detected: row.get::<_, i32>(14)? != 0,
            watermark_removed: row.get::<_, i32>(15)? != 0,
            created_at: row.get(16)?,
            imported_at: row.get(17)?,
            archived_at: row.get(18)?,
        })
    });
    let ip_images: Vec<IpImageWithTags> = match ip_images_mapped {
        Ok(m) => m
            .filter_map(|r| r.ok())
            .map(|ip_image| {
                let tags = fetch_ip_image_tags(&conn, &ip_image.id).unwrap_or_default();
                IpImageWithTags { ip_image, tags }
            })
            .collect(),
        Err(_) => Vec::new(),
    };

    CommandResult::ok(IpAssetDetail {
        ip,
        character_sheets,
        creations,
        sticker_packs,
        emojis,
        platforms,
        relations,
        ip_images,
    })
}

fn sanitize_ip_path(path: &str) -> String {
    let lowercase = path.trim().to_lowercase();
    let mut result = String::new();
    let mut last_was_dash = false;
    for c in lowercase.chars() {
        if c.is_ascii_alphanumeric() || c == '_' {
            result.push(c);
            last_was_dash = false;
        } else if c == '-' || c.is_whitespace() || c == '/' || c == '\\' {
            if !last_was_dash && !result.is_empty() {
                result.push('-');
                last_was_dash = true;
            }
        }
    }
    while result.ends_with('-') {
        result.pop();
    }
    result
}

#[tauri::command]
pub fn create_ip_asset(
    db_path: String,
    name: String,
    path: String,
    inspiration: Option<String>,
    description: Option<String>,
    avatar_path: Option<String>,
    copy_avatar: Option<bool>,
) -> CommandResult<IpAsset> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    // 路径标识清洗
    let path = sanitize_ip_path(&path);
    if path.is_empty() {
        return CommandResult::err(
            "路径标识无可用的合法字符（限小写字母、数字、横杠、下划线组合）".to_string(),
        );
    }

    // 检查 path 唯一性
    let path_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM ip_assets WHERE path = ?",
            params![path],
            |row| Ok(row.get::<_, i64>(0)? > 0),
        )
        .unwrap_or(false);
    if path_exists {
        return CommandResult::err(format!("路径标识 '{}' 已被使用", path));
    }

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    let copied_avatar_path = match avatar_path {
        Some(src) => {
            let should_copy = copy_avatar.unwrap_or(true);
            if src.trim().is_empty() {
                None
            } else if !should_copy {
                Some(src)
            } else {
                match copy_to_ip_archived(&db_path, &path, "root", None, &src) {
                    Ok(dest) => Some(dest),
                    Err(e) => return CommandResult::err(format!("拷贝头像文件失败: {}", e)),
                }
            }
        }
        None => None,
    };

    match conn.execute(
        "INSERT INTO ip_assets (id, name, path, avatar_path, inspiration, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        params![id, name, path, copied_avatar_path, inspiration, description, now, now],
    ) {
        Ok(_) => {
            // Create the ip_archived/{ip_path} directory
            let custom_path: Option<String> = conn.query_row(
                "SELECT value FROM settings WHERE key = 'customIpArchivedPath'",
                [],
                |row| row.get(0),
            ).ok();

            let db_path_obj = Path::new(&db_path);
            if let Some(data_dir) = db_path_obj.parent() {
                if let Some(base_app_data_dir) = data_dir.parent() {
            let app_data_dir = crate::commands::get_app_root(&conn, base_app_data_dir);
                    let library_path = if let Some(ref path_str) = custom_path {
                        if !path_str.trim().is_empty() {
                            Path::new(path_str).to_path_buf()
                        } else {
                            app_data_dir.to_path_buf()
                        }
                    } else {
                        app_data_dir.to_path_buf()
                    };
                    let target_dir = library_path.join("ip_archived").join(&path);
                    let _ = std::fs::create_dir_all(&target_dir);
                }
            }

            CommandResult::ok(IpAsset {
                id,
                name,
                path,
                avatar_path: copied_avatar_path,
                inspiration,
                description,
                created_at: now.clone(),
                updated_at: now,
            })
        }
        Err(e) => CommandResult::err(format!("创建 IP 失败: {}", e)),
    }
}

#[tauri::command]
pub fn update_ip_asset(
    db_path: String,
    ip_id: String,
    name: String,
    path: String,
    inspiration: Option<String>,
    description: Option<String>,
    avatar_path: Option<String>,
    copy_avatar: Option<bool>,
) -> CommandResult<IpAsset> {
    if ip_id == "unknown" {
        return CommandResult::err("系统默认的未知形象不可被编辑".to_string());
    }

    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    // 路径标识清洗
    let path = sanitize_ip_path(&path);
    if path.is_empty() {
        return CommandResult::err(
            "路径标识无可用的合法字符（限小写字母、数字、横杠、下划线组合）".to_string(),
        );
    }

    // 检查 path 唯一性（排除自身）
    let path_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM ip_assets WHERE path = ? AND id != ?",
            params![path, ip_id],
            |row| Ok(row.get::<_, i64>(0)? > 0),
        )
        .unwrap_or(false);
    if path_exists {
        return CommandResult::err(format!("路径标识 '{}' 已被使用", path));
    }

    let now = Utc::now().to_rfc3339();

    let mut old_avatar_path: Option<String> = None;
    let mut old_path: String = String::new();
    let _ = conn.query_row(
        "SELECT avatar_path, path FROM ip_assets WHERE id = ?",
        params![ip_id],
        |row| {
            old_avatar_path = row.get(0).ok();
            old_path = row.get(1).unwrap_or_default();
            Ok(())
        },
    );

    let copied_avatar_path = match avatar_path {
        Some(src) => {
            let should_copy = copy_avatar.unwrap_or(true);
            if src.trim().is_empty() {
                None
            } else if Some(src.clone()) == old_avatar_path {
                old_avatar_path.clone()
            } else if !should_copy {
                Some(src)
            } else {
                match copy_to_ip_archived(&db_path, &path, "root", None, &src) {
                    Ok(dest) => {
                        // If we successfully copied a new avatar, and there was an old one, delete the old one
                        if let Some(ref old) = old_avatar_path {
                            let old_path = Path::new(old);
                            if old_path.exists() && old_path != Path::new(&dest) {
                                let _ = std::fs::remove_file(old_path);
                            }
                        }
                        Some(dest)
                    }
                    Err(e) => return CommandResult::err(format!("拷贝头像文件失败: {}", e)),
                }
            }
        }
        None => None,
    };

    match conn.execute(
        "UPDATE ip_assets 
         SET name = ?, path = ?, avatar_path = ?, inspiration = ?, description = ?, updated_at = ?
         WHERE id = ?",
        params![
            name,
            path,
            copied_avatar_path,
            inspiration,
            description,
            now,
            ip_id
        ],
    ) {
        Ok(_) => {
            // Rename or Create the ip_archived/{ip_path} directory
            let custom_path: Option<String> = conn
                .query_row(
                    "SELECT value FROM settings WHERE key = 'customIpArchivedPath'",
                    [],
                    |row| row.get(0),
                )
                .ok();

            let db_path_obj = Path::new(&db_path);
            if let Some(data_dir) = db_path_obj.parent() {
                if let Some(base_app_data_dir) = data_dir.parent() {
                    let app_data_dir = crate::commands::get_app_root(&conn, base_app_data_dir);
                    let library_path = if let Some(ref path_str) = custom_path {
                        if !path_str.trim().is_empty() {
                            Path::new(path_str).to_path_buf()
                        } else {
                            app_data_dir.to_path_buf()
                        }
                    } else {
                        app_data_dir.to_path_buf()
                    };

                    if !old_path.is_empty() && old_path != path {
                        let old_target_dir = library_path.join("ip_archived").join(&old_path);
                        let new_target_dir = library_path.join("ip_archived").join(&path);
                        if old_target_dir.exists() {
                            let _ = std::fs::rename(&old_target_dir, &new_target_dir);
                        } else {
                            let _ = std::fs::create_dir_all(&new_target_dir);
                        }

                        // 数据库物理路径引用热更新（将包含 /ip_archived/old_path/ 字符的记录全局替换为新 path 结构）
                        let old_pattern = format!("/ip_archived/{}/", old_path);
                        let new_pattern = format!("/ip_archived/{}/", path);
                        let old_pattern_no_slash = format!("ip_archived/{}/", old_path);
                        let new_pattern_no_slash = format!("ip_archived/{}/", path);

                        let _ = conn.execute(
                            "UPDATE ip_assets SET avatar_path = replace(avatar_path, ?, ?) WHERE id = ?",
                            params![old_pattern, new_pattern, ip_id],
                        );
                        let _ = conn.execute(
                            "UPDATE ip_character_sheets SET image_path = replace(image_path, ?, ?) WHERE ip_id = ?",
                            params![old_pattern, new_pattern, ip_id],
                        );
                        let _ = conn.execute(
                            "UPDATE ip_creations SET image_path = replace(image_path, ?, ?) WHERE ip_id = ?",
                            params![old_pattern, new_pattern, ip_id],
                        );
                        let _ = conn.execute(
                            "UPDATE ip_emojis SET image_path = replace(image_path, ?, ?) WHERE ip_id = ?",
                            params![old_pattern, new_pattern, ip_id],
                        );
                        let _ = conn.execute(
                            "UPDATE ip_images SET absolute_path = replace(absolute_path, ?, ?), relative_path = replace(relative_path, ?, ?) WHERE ip_id = ? OR id IN (SELECT ip_image_id FROM ip_image_relations WHERE ip_id = ?)",
                            params![old_pattern, new_pattern, old_pattern_no_slash, new_pattern_no_slash, ip_id, ip_id],
                        );
                    } else {
                        let target_dir = library_path.join("ip_archived").join(&path);
                        let _ = std::fs::create_dir_all(&target_dir);
                    }
                }
            }

            let mut created_at = now.clone();
            let _ = conn.query_row(
                "SELECT created_at FROM ip_assets WHERE id = ?",
                params![ip_id],
                |row| {
                    if let Ok(c) = row.get(0) {
                        created_at = c;
                    }
                    Ok(())
                },
            );

            CommandResult::ok(IpAsset {
                id: ip_id,
                name,
                path,
                avatar_path: copied_avatar_path,
                inspiration,
                description,
                created_at,
                updated_at: now,
            })
        }
        Err(e) => CommandResult::err(format!("更新 IP 失败: {}", e)),
    }
}

#[tauri::command]
pub fn delete_ip_asset(db_path: String, ip_id: String, keep_images: bool) -> CommandResult<bool> {
    if ip_id == "unknown" {
        return CommandResult::err("系统默认的未知形象不可删除".to_string());
    }

    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    // 获取 library_path 以便做文件移动或彻底删除
    let custom_path: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'customIpArchivedPath'",
            [],
            |row| row.get(0),
        )
        .ok();

    let db_path_buf = Path::new(&db_path);
    let base_app_data_dir = match db_path_buf.parent().and_then(|d| d.parent()) {
        Some(dir) => dir.to_path_buf(),
        None => return CommandResult::err("获取应用程序数据目录失败".to_string()),
    };
    let app_data_dir = crate::commands::get_app_root(&conn, &base_app_data_dir);

    let library_path = if let Some(ref path_str) = custom_path {
        if !path_str.trim().is_empty() {
            Path::new(path_str).to_path_buf()
        } else {
            app_data_dir
        }
    } else {
        app_data_dir
    };

    let ip_path: Option<String> = conn
        .query_row(
            "SELECT path FROM ip_assets WHERE id = ?",
            params![ip_id],
            |row| row.get(0),
        )
        .ok();

    if keep_images {
        // 1. 查询该 IP 下的所有图片，准备迁移
        let mut stmt = match conn
            .prepare("SELECT id, filename, absolute_path FROM ip_images WHERE ip_id = ?")
        {
            Ok(s) => s,
            Err(e) => return CommandResult::err(format!("准备迁移查询失败: {}", e)),
        };
        let rows = match stmt.query_map(params![ip_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        }) {
            Ok(r) => r,
            Err(e) => return CommandResult::err(format!("查询图片记录失败: {}", e)),
        };

        // 获取自定义 IP inbox 目录
        let custom_inbox_path: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'customIpInboxPath'",
                [],
                |row| row.get(0),
            )
            .ok();

        let ip_inbox_dir = if let Some(ref path_str) = custom_inbox_path {
            if !path_str.trim().is_empty() {
                Path::new(path_str).to_path_buf()
            } else {
                library_path.join("ip_inbox")
            }
        } else {
            library_path.join("ip_inbox")
        };

        // 目标移动目录：ip_inbox/unknown
        let inbox_dir = ip_inbox_dir.join("unknown");
        let _ = std::fs::create_dir_all(&inbox_dir);

        for row_res in rows {
            if let Ok((img_id, filename, old_abs_path)) = row_res {
                let old_path_buf = Path::new(&old_abs_path);

                // 处理重名，如果有重名文件则自动递增追加后缀
                let mut target_filename = filename.clone();
                let mut target_path = inbox_dir.join(&target_filename);
                let mut counter = 1;

                let file_stem = Path::new(&filename)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("image");
                let file_ext = Path::new(&filename)
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("png");

                while target_path.exists() {
                    target_filename = format!("{}_{}.{}", file_stem, counter, file_ext);
                    target_path = inbox_dir.join(&target_filename);
                    counter += 1;
                }

                // 在磁盘上进行重命名与移动
                if old_path_buf.exists() {
                    let _ = std::fs::rename(old_path_buf, &target_path);
                }

                let new_relative = Path::new("inbox")
                    .join("unknown")
                    .join(&target_filename)
                    .to_string_lossy()
                    .to_string();
                let new_absolute = target_path.to_string_lossy().to_string();

                // 更新数据库状态：将该图归属移回默认角色 unknown，并且设为 inbox（待整理）状态，重置归档时间
                let _ = conn.execute(
                    "UPDATE ip_images SET ip_id = 'unknown', status = 'inbox', relative_path = ?, absolute_path = ?, archived_at = NULL WHERE id = ?",
                    params![new_relative, new_absolute, img_id],
                );

                // 更新多 IP 关联记录中的本条记录，归属迁移到 unknown
                let _ = conn.execute(
                    "UPDATE ip_image_relations SET ip_id = 'unknown' WHERE ip_image_id = ? AND ip_id = ?",
                    params![img_id, ip_id],
                );
            }
        }
    }

    // 2. 清理 ip_archived/{ip_path} 目录
    if let Some(ref path) = ip_path {
        let ip_dir = library_path.join("ip_archived").join(path);
        if ip_dir.exists() {
            let _ = std::fs::remove_dir_all(ip_dir);
        }
    }

    // 3. 执行删除 IP
    match conn.execute("DELETE FROM ip_assets WHERE id = ?", params![ip_id]) {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("删除 IP 失败: {}", e)),
    }
}

#[tauri::command]
pub fn add_ip_character_sheets(
    db_path: String,
    ip_id: String,
    image_paths: Vec<String>,
    sheet_type: String,
) -> CommandResult<bool> {
    let mut conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let ip_path: String = match conn.query_row(
        "SELECT path FROM ip_assets WHERE id = ?",
        params![ip_id],
        |row| row.get(0),
    ) {
        Ok(p) => p,
        Err(_) => return CommandResult::err("未找到关联的 IP 形象".to_string()),
    };

    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(e) => return CommandResult::err(format!("开启事务失败: {}", e)),
    };

    let now = Utc::now().to_rfc3339();

    for src_path in image_paths {
        // 拷贝至设定图目录 ip_archived/{ip_path}/
        let copied_path = match copy_to_ip_archived(&db_path, &ip_path, "root", None, &src_path) {
            Ok(p) => p,
            Err(e) => return CommandResult::err(format!("复制设定图失败 {}: {}", src_path, e)),
        };

        let id = Uuid::new_v4().to_string();
        if let Err(e) = tx.execute(
            "INSERT INTO ip_character_sheets (id, ip_id, image_path, sheet_type, sort_order, created_at)
             VALUES (?, ?, ?, ?, 0, ?)",
            params![id, ip_id, copied_path, sheet_type, now],
        ) {
            return CommandResult::err(format!("插入三视图记录失败: {}", e));
        }
    }

    match tx.commit() {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("提交事务失败: {}", e)),
    }
}

#[tauri::command]
pub fn remove_ip_character_sheets(
    db_path: String,
    ip_id: String,
    image_paths: Vec<String>,
) -> CommandResult<bool> {
    let mut conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(e) => return CommandResult::err(format!("开启事务失败: {}", e)),
    };

    for path in image_paths {
        if let Err(e) = tx.execute(
            "DELETE FROM ip_character_sheets WHERE ip_id = ? AND image_path = ?",
            params![ip_id, path],
        ) {
            return CommandResult::err(format!("删除三视图数据库记录失败: {}", e));
        }

        // 删除磁盘上的对应文件
        let fs_path = Path::new(&path);
        if fs_path.exists() {
            let _ = std::fs::remove_file(fs_path);
        }
    }

    match tx.commit() {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("提交事务失败: {}", e)),
    }
}

#[tauri::command]
pub fn add_ip_creations(
    db_path: String,
    ip_id: String,
    image_paths: Vec<String>,
    creation_names: Vec<Option<String>>,
) -> CommandResult<bool> {
    let mut conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let ip_path: String = match conn.query_row(
        "SELECT path FROM ip_assets WHERE id = ?",
        params![ip_id],
        |row| row.get(0),
    ) {
        Ok(p) => p,
        Err(_) => return CommandResult::err("未找到关联的 IP 形象".to_string()),
    };

    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(e) => return CommandResult::err(format!("开启事务失败: {}", e)),
    };

    let now = Utc::now().to_rfc3339();

    for (idx, src_path) in image_paths.iter().enumerate() {
        // 拷贝至创作图片目录 ip_archived/{ip_path}/
        let copied_path = match copy_to_ip_archived(&db_path, &ip_path, "root", None, src_path) {
            Ok(p) => p,
            Err(e) => return CommandResult::err(format!("复制创作图片失败 {}: {}", src_path, e)),
        };

        let creation_name = creation_names.get(idx).cloned().flatten();
        if let Err(e) = tx.execute(
            "INSERT OR REPLACE INTO ip_creations (ip_id, image_path, creation_name, created_at)
             VALUES (?, ?, ?, ?)",
            params![ip_id, copied_path, creation_name, now],
        ) {
            return CommandResult::err(format!("添加创作关联失败: {}", e));
        }
    }

    match tx.commit() {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("提交事务失败: {}", e)),
    }
}

#[tauri::command]
pub fn remove_ip_creations(
    db_path: String,
    ip_id: String,
    image_paths: Vec<String>,
) -> CommandResult<bool> {
    let mut conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(e) => return CommandResult::err(format!("开启事务失败: {}", e)),
    };

    for path in image_paths {
        if let Err(e) = tx.execute(
            "DELETE FROM ip_creations WHERE ip_id = ? AND image_path = ?",
            params![ip_id, path],
        ) {
            return CommandResult::err(format!("删除创作关联失败: {}", e));
        }

        // 删除磁盘上的对应文件
        let fs_path = Path::new(&path);
        if fs_path.exists() {
            let _ = std::fs::remove_file(fs_path);
        }
    }

    match tx.commit() {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("提交事务失败: {}", e)),
    }
}

#[tauri::command]
pub fn add_ip_relation(
    db_path: String,
    ip_a_id: String,
    ip_b_id: String,
    relation_type: String,
    description: Option<String>,
) -> CommandResult<bool> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let now = Utc::now().to_rfc3339();

    match conn.execute(
        "INSERT OR REPLACE INTO ip_relations (ip_a_id, ip_b_id, relation_type, description, created_at)
         VALUES (?, ?, ?, ?, ?)",
        params![ip_a_id, ip_b_id, relation_type, description, now],
    ) {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("建立关系失败: {}", e)),
    }
}

#[tauri::command]
pub fn remove_ip_relation(
    db_path: String,
    ip_a_id: String,
    ip_b_id: String,
    relation_type: String,
) -> CommandResult<bool> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    match conn.execute(
        "DELETE FROM ip_relations WHERE ip_a_id = ? AND ip_b_id = ? AND relation_type = ?",
        params![ip_a_id, ip_b_id, relation_type],
    ) {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("解除关系失败: {}", e)),
    }
}

#[tauri::command]
pub fn create_ip_sticker_pack(
    db_path: String,
    ip_id: String,
    name: String,
    path: String,
    description: Option<String>,
    cover_path: Option<String>,
    banner_path: Option<String>,
    icon_path: Option<String>,
    reward_guide_path: Option<String>,
    reward_thanks_path: Option<String>,
) -> CommandResult<IpStickerPack> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let path = path.trim().to_string();
    if path.is_empty() {
        return CommandResult::err("路径标识不能为空".to_string());
    }

    // 检查在当前 IP 下 path 是否重复
    let path_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM ip_sticker_packs WHERE ip_id = ? AND path = ?",
            params![ip_id, path],
            |row| Ok(row.get::<_, i64>(0)? > 0),
        )
        .unwrap_or(false);
    if path_exists {
        return CommandResult::err(format!("在此 IP 下，路径标识 '{}' 已被使用", path));
    }

    // 获取 IP 的 path 标识
    let ip_path: String = match conn.query_row(
        "SELECT path FROM ip_assets WHERE id = ?",
        params![ip_id],
        |row| row.get(0),
    ) {
        Ok(p) => p,
        Err(_) => return CommandResult::err("未找到表情包套件关联的 IP 形象".to_string()),
    };

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    match conn.execute(
        "INSERT INTO ip_sticker_packs (id, ip_id, name, path, description, cover_path, banner_path, icon_path, reward_guide_path, reward_thanks_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![id, ip_id, name, path, description, cover_path, banner_path, icon_path, reward_guide_path, reward_thanks_path, now, now],
    ) {
        Ok(_) => {
            // Create target pack directory under the IP archived folder:
            // library_path/ip_archived/{ip_path}/emojis/{pack_path}
            let custom_path: Option<String> = conn
                .query_row(
                    "SELECT value FROM settings WHERE key = 'customIpArchivedPath'",
                    [],
                    |row| row.get(0),
                )
                .ok();

            let db_path_obj = Path::new(&db_path);
            if let Some(data_dir) = db_path_obj.parent() {
                if let Some(base_app_data_dir) = data_dir.parent() {
                    let app_data_dir = crate::commands::get_app_root(&conn, base_app_data_dir);
                    let library_path = if let Some(ref path_str) = custom_path {
                        if !path_str.trim().is_empty() {
                            Path::new(path_str).to_path_buf()
                        } else {
                            app_data_dir.to_path_buf()
                        }
                    } else {
                        app_data_dir.to_path_buf()
                    };

                    let pack_dir = library_path
                        .join("ip_archived")
                        .join(&ip_path)
                        .join("emojis")
                        .join(&path);
                    let _ = std::fs::create_dir_all(&pack_dir);
                }
            }

            CommandResult::ok(IpStickerPack {
                id,
                ip_id,
                name,
                path,
                description,
                cover_path,
                banner_path,
                icon_path,
                reward_guide_path,
                reward_thanks_path,
                created_at: now.clone(),
                updated_at: now,
            })
        }
        Err(e) => CommandResult::err(format!("创建表情包套件失败: {}", e)),
    }
}

#[tauri::command]
pub fn update_ip_sticker_pack(
    db_path: String,
    pack_id: String,
    name: String,
    path: String,
    description: Option<String>,
    cover_path: Option<String>,
    banner_path: Option<String>,
    icon_path: Option<String>,
    reward_guide_path: Option<String>,
    reward_thanks_path: Option<String>,
) -> CommandResult<bool> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let path = path.trim().to_string();
    if path.is_empty() {
        return CommandResult::err("路径标识不能为空".to_string());
    }

    // 获取 ip_id, old_path 和 ip_path
    let (ip_id, old_path, ip_path): (String, String, String) = match conn.query_row(
        "SELECT pg.ip_id, pg.path, ip.path 
         FROM ip_sticker_packs pg 
         JOIN ip_assets ip ON pg.ip_id = ip.id 
         WHERE pg.id = ?",
        params![pack_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        },
    ) {
        Ok(res) => res,
        Err(e) => return CommandResult::err(format!("获取表情包套件关联 IP 失败: {}", e)),
    };

    // 检查在当前 IP 下 path 是否重复（排除自身）
    let path_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM ip_sticker_packs WHERE ip_id = ? AND path = ? AND id != ?",
            params![ip_id, path, pack_id],
            |row| Ok(row.get::<_, i64>(0)? > 0),
        )
        .unwrap_or(false);
    if path_exists {
        return CommandResult::err(format!("在此 IP 下，路径标识 '{}' 已被使用", path));
    }

    let now = Utc::now().to_rfc3339();

    match conn.execute(
        "UPDATE ip_sticker_packs SET name = ?, path = ?, description = ?, cover_path = ?, banner_path = ?, icon_path = ?, reward_guide_path = ?, reward_thanks_path = ?, updated_at = ? WHERE id = ?",
        params![name, path, description, cover_path, banner_path, icon_path, reward_guide_path, reward_thanks_path, now, pack_id],
    ) {
        Ok(_) => {
            // Rename or Create the directories under the IP archived folder:
            // library_path/ip_archived/{ip_path}/emojis/{pack_path}
            let custom_path: Option<String> = conn.query_row(
                "SELECT value FROM settings WHERE key = 'customIpArchivedPath'",
                [],
                |row| row.get(0),
            ).ok();

            let db_path_obj = Path::new(&db_path);
            if let Some(data_dir) = db_path_obj.parent() {
                if let Some(base_app_data_dir) = data_dir.parent() {
            let app_data_dir = crate::commands::get_app_root(&conn, base_app_data_dir);
                    let library_path = if let Some(ref path_str) = custom_path {
                        if !path_str.trim().is_empty() {
                            Path::new(path_str).to_path_buf()
                        } else {
                            app_data_dir.to_path_buf()
                        }
                    } else {
                        app_data_dir.to_path_buf()
                    };
                    
                    let emojis_base = library_path.join("ip_archived").join(&ip_path).join("emojis");
                    
                    if !old_path.is_empty() && old_path != path {
                        // Rename the emojis/ folder
                        let old_emojis_dir = emojis_base.join(&old_path);
                        let new_emojis_dir = emojis_base.join(&path);
                        if old_emojis_dir.exists() {
                            let _ = std::fs::rename(&old_emojis_dir, &new_emojis_dir);
                        } else {
                            let _ = std::fs::create_dir_all(&new_emojis_dir);
                        }

                        // 热更新数据库中该表情分组下表情的绝对物理路径引用
                        let old_pattern = format!("/emojis/{}/", old_path);
                        let new_pattern = format!("/emojis/{}/", path);
                        let _ = conn.execute(
                            "UPDATE ip_emojis SET image_path = replace(image_path, ?, ?) WHERE pack_id = ?",
                            params![old_pattern, new_pattern, pack_id],
                        );
                    } else {
                        let _ = std::fs::create_dir_all(emojis_base.join(&path));
                    }
                }
            }

            CommandResult::ok(true)
        }
        Err(e) => CommandResult::err(format!("修改表情包套件失败: {}", e)),
    }
}

#[tauri::command]
pub fn delete_ip_sticker_pack(db_path: String, pack_id: String) -> CommandResult<bool> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    // 获取 pack_path, _ip_id, ip_path 并删除其专属子文件夹
    let (_ip_id, pack_path, ip_path): (String, String, String) = match conn.query_row(
        "SELECT pg.ip_id, pg.path, ip.path 
         FROM ip_sticker_packs pg 
         JOIN ip_assets ip ON pg.ip_id = ip.id 
         WHERE pg.id = ?",
        params![pack_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        },
    ) {
        Ok(res) => res,
        Err(_) => ("".to_string(), "".to_string(), "".to_string()),
    };

    if !ip_path.is_empty() && !pack_path.is_empty() {
        let custom_path: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'customIpArchivedPath'",
                [],
                |row| row.get(0),
            )
            .ok();

        let db_path_obj = Path::new(&db_path);
        if let Some(data_dir) = db_path_obj.parent() {
            if let Some(base_app_data_dir) = data_dir.parent() {
                let app_data_dir = crate::commands::get_app_root(&conn, base_app_data_dir);
                let library_path = if let Some(ref path_str) = custom_path {
                    if !path_str.trim().is_empty() {
                        Path::new(path_str).to_path_buf()
                    } else {
                        app_data_dir.to_path_buf()
                    }
                } else {
                    app_data_dir.to_path_buf()
                };
                let pack_dir = library_path
                    .join("ip_archived")
                    .join(&ip_path)
                    .join("emojis")
                    .join(&pack_path);
                if pack_dir.exists() {
                    let _ = std::fs::remove_dir_all(pack_dir);
                }
            }
        }
    }

    // 删除磁盘上表情包套件内所有的图片（作为备用，确保清理干净）
    let mut stmt = match conn.prepare("SELECT image_path FROM ip_emojis WHERE pack_id = ?") {
        Ok(s) => s,
        Err(_) => return CommandResult::err("查询表情包关联失败".to_string()),
    };
    if let Ok(mut rows) = stmt.query(params![pack_id]) {
        while let Ok(Some(row)) = rows.next() {
            if let Ok(path) = row.get::<_, String>(0) {
                let fs_path = Path::new(&path);
                if fs_path.exists() {
                    let _ = std::fs::remove_file(fs_path);
                }
            }
        }
    }

    match conn.execute(
        "DELETE FROM ip_sticker_packs WHERE id = ?",
        params![pack_id],
    ) {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("删除表情包套件失败: {}", e)),
    }
}

#[tauri::command]
pub fn add_ip_sticker_pack_platform(
    db_path: String,
    pack_id: String,
    platform_name: String,
    pack_name_on_platform: Option<String>,
    emoji_size_spec: Option<String>,
    status: String,
    publish_url: Option<String>,
) -> CommandResult<IpStickerPackPlatform> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    match conn.execute(
        "INSERT INTO ip_sticker_pack_platforms (id, pack_id, platform_name, pack_name_on_platform, emoji_size_spec, status, publish_url, downloads_count, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
        params![id, pack_id, platform_name, pack_name_on_platform, emoji_size_spec, status, publish_url, now],
    ) {
        Ok(_) => CommandResult::ok(IpStickerPackPlatform {
            id,
            pack_id,
            platform_name,
            pack_name_on_platform,
            emoji_size_spec,
            status,
            publish_url,
            downloads_count: 0,
            updated_at: now,
        }),
        Err(e) => CommandResult::err(format!("添加发布平台信息失败: {}", e)),
    }
}

#[tauri::command]
pub fn update_ip_sticker_pack_platform(
    db_path: String,
    platform_id: String,
    platform_name: String,
    pack_name_on_platform: Option<String>,
    emoji_size_spec: Option<String>,
    status: String,
    publish_url: Option<String>,
    downloads_count: i32,
) -> CommandResult<bool> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let now = Utc::now().to_rfc3339();

    match conn.execute(
        "UPDATE ip_sticker_pack_platforms 
         SET platform_name = ?, pack_name_on_platform = ?, emoji_size_spec = ?, status = ?, publish_url = ?, downloads_count = ?, updated_at = ?
         WHERE id = ?",
        params![platform_name, pack_name_on_platform, emoji_size_spec, status, publish_url, downloads_count, now, platform_id],
    ) {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("更新发布平台信息失败: {}", e)),
    }
}

#[tauri::command]
pub fn delete_ip_sticker_pack_platform(
    db_path: String,
    platform_id: String,
) -> CommandResult<bool> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    match conn.execute(
        "DELETE FROM ip_sticker_pack_platforms WHERE id = ?",
        params![platform_id],
    ) {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("删除发布平台记录失败: {}", e)),
    }
}

#[tauri::command]
pub fn add_ip_emojis(
    db_path: String,
    ip_id: String,
    pack_id: Option<String>,
    image_paths: Vec<String>,
    trigger_words: Vec<Option<String>>,
) -> CommandResult<bool> {
    let mut conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let ip_path: String = match conn.query_row(
        "SELECT path FROM ip_assets WHERE id = ?",
        params![ip_id],
        |row| row.get(0),
    ) {
        Ok(p) => p,
        Err(_) => return CommandResult::err("未找到关联的 IP 形象".to_string()),
    };

    let pack_path: Option<String> = if let Some(ref pid) = pack_id {
        conn.query_row(
            "SELECT path FROM ip_sticker_packs WHERE id = ?",
            params![pid],
            |row| row.get(0),
        )
        .ok()
    } else {
        None
    };

    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(e) => return CommandResult::err(format!("开启事务失败: {}", e)),
    };

    let now = Utc::now().to_rfc3339();

    for (idx, src_path) in image_paths.iter().enumerate() {
        // 拷贝至表情包目录 ip_archived/{ip_path}/emojis/{pack_path}/
        let copied_path =
            match copy_to_ip_archived(&db_path, &ip_path, "emojis", pack_path.as_deref(), src_path)
            {
                Ok(p) => p,
                Err(e) => {
                    return CommandResult::err(format!("复制表情图片失败 {}: {}", src_path, e))
                }
            };

        let trigger_word = trigger_words.get(idx).cloned().flatten();
        let id = Uuid::new_v4().to_string();

        if let Err(e) = tx.execute(
            "INSERT INTO ip_emojis (id, ip_id, pack_id, image_path, trigger_word, sort_order, created_at)
             VALUES (?, ?, ?, ?, ?, 0, ?)",
             params![id, ip_id, pack_id, &copied_path, trigger_word, &now],
        ) {
            return CommandResult::err(format!("添加表情图片失败: {}", e));
        }

        // 自动入库到 ip_images 表作为 IP 的核心资产
        let uuid_str = Uuid::new_v4().to_string().replace("-", "");
        let ip_image_id = format!("ipimg_{}", &uuid_str[..12]);
        let copied_path_buf = Path::new(&copied_path);
        let filename = copied_path_buf
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("")
            .to_string();
        let original_filename = Path::new(src_path)
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("")
            .to_string();

        let relative_path = if let Some(ref pp) = pack_path {
            Path::new("ip_archived")
                .join(&ip_path)
                .join("emojis")
                .join(pp)
                .join(&filename)
        } else {
            Path::new("ip_archived")
                .join(&ip_path)
                .join("emojis")
                .join(&filename)
        };
        let relative_path_str = relative_path.to_string_lossy().to_string();
        let file_size = copied_path_buf
            .metadata()
            .map(|m| m.len() as i64)
            .unwrap_or(0);
        let format_upper = copied_path_buf
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png")
            .to_uppercase();

        if let Err(e) = tx.execute(
            "INSERT INTO ip_images (
                id, filename, original_filename, ip_id,
                relative_path, absolute_path,
                status, file_size, format,
                has_watermark, watermark_detected, watermark_removed,
                created_at, imported_at, archived_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'archived', ?, ?, 0, 0, 0, ?, ?, ?)",
            params![
                ip_image_id,
                filename,
                original_filename,
                ip_id,
                relative_path_str,
                copied_path,
                file_size,
                format_upper,
                now,
                now,
                now
            ],
        ) {
            return CommandResult::err(format!("同步导入表情为 IP 资产失败: {}", e));
        }
    }

    match tx.commit() {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("提交事务失败: {}", e)),
    }
}

#[tauri::command]
pub fn update_ip_emoji_trigger_word(
    db_path: String,
    emoji_id: String,
    trigger_word: Option<String>,
) -> CommandResult<bool> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    match conn.execute(
        "UPDATE ip_emojis SET trigger_word = ? WHERE id = ?",
        params![trigger_word, emoji_id],
    ) {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("更新表情快捷词失败: {}", e)),
    }
}

#[tauri::command]
pub fn delete_ip_emojis(db_path: String, emoji_ids: Vec<String>) -> CommandResult<bool> {
    let mut conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(e) => return CommandResult::err(format!("开启事务失败: {}", e)),
    };

    for id in emoji_ids {
        // 先查询对应的物理路径，以便后面清理文件
        let mut stmt = match tx.prepare("SELECT image_path FROM ip_emojis WHERE id = ?") {
            Ok(s) => s,
            Err(e) => return CommandResult::err(format!("查询准备失败: {}", e)),
        };
        let image_path: Option<String> = stmt.query_row(params![id], |row| row.get(0)).ok();

        if let Err(e) = tx.execute("DELETE FROM ip_emojis WHERE id = ?", params![id]) {
            return CommandResult::err(format!("彻底删除表情记录失败: {}", e));
        }

        // 删除物理磁盘文件
        if let Some(path) = image_path {
            // 同时清理关联的 ip_images 图片资产表中的记录
            let _ = tx.execute(
                "DELETE FROM ip_images WHERE absolute_path = ?",
                params![&path],
            );

            let fs_path = Path::new(&path);
            if fs_path.exists() {
                let _ = std::fs::remove_file(fs_path);
            }
        }
    }

    match tx.commit() {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("提交事务失败: {}", e)),
    }
}

#[tauri::command]
pub fn remove_ip_emojis_keep_image(db_path: String, emoji_ids: Vec<String>) -> CommandResult<bool> {
    let mut conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(e) => return CommandResult::err(format!("开启事务失败: {}", e)),
    };

    for id in emoji_ids {
        if let Err(e) = tx.execute("DELETE FROM ip_emojis WHERE id = ?", params![id]) {
            return CommandResult::err(format!("删除表情记录失败: {}", e));
        }
    }

    match tx.commit() {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("提交事务失败: {}", e)),
    }
}

#[tauri::command]
pub fn move_ip_emojis_to_pack(
    db_path: String,
    emoji_ids: Vec<String>,
    pack_id: Option<String>,
) -> CommandResult<bool> {
    let mut conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(e) => return CommandResult::err(format!("开启事务失败: {}", e)),
    };

    for id in emoji_ids {
        if let Err(e) = tx.execute(
            "UPDATE ip_emojis SET pack_id = ? WHERE id = ?",
            params![pack_id, id],
        ) {
            return CommandResult::err(format!("移动表情套件记录失败: {}", e));
        }
    }

    match tx.commit() {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("提交事务失败: {}", e)),
    }
}

// ==================== IP Image Relations ====================
