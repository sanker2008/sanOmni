use std::path::Path;
use rusqlite::{params, Connection};
use uuid::Uuid;
use chrono::Utc;
use crate::commands::CommandResult;
use crate::models::{
    IpAsset, IpCharacterSheet, IpCreation, IpStickerPack, IpEmoji,
    IpStickerPackPlatform, IpRelation, IpAssetDetail
};

// 辅助函数：将选择的图片拷贝到 app_data_dir 的独立子目录中，并返回拷贝后的绝对路径
fn copy_to_ip_assets_dir(db_path: &str, ip_id: &str, subfolder: &str, src_file_path: &str) -> std::io::Result<String> {
    let db_path = Path::new(db_path);
    let data_dir = db_path.parent().ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "Parent folder not found"))?;
    let app_data_dir = data_dir.parent().ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "App data folder not found"))?;
    
    // 目标子路径：{app_data_dir}/ip_assets/{ip_id}/{subfolder}/
    let dest_dir = app_data_dir.join("ip_assets").join(ip_id).join(subfolder);
    std::fs::create_dir_all(&dest_dir)?;
    
    let src_path = Path::new(src_file_path);
    let file_name = src_path.file_name().ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "Invalid file name"))?;
    let dest_file_path = dest_dir.join(file_name);
    
    // 如果源文件与目标文件路径完全一致，则直接返回
    if src_path == dest_file_path {
        return Ok(dest_file_path.to_str().unwrap().to_string());
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
        "SELECT id, name, avatar_path, inspiration, description, created_at, updated_at
         FROM ip_assets
         ORDER BY updated_at DESC"
    ) {
        Ok(s) => s,
        Err(e) => return CommandResult::err(format!("准备查询语句失败: {}", e)),
    };

    let rows = stmt.query_map([], |row| {
        Ok(IpAsset {
            id: row.get(0)?,
            name: row.get(1)?,
            avatar_path: row.get(2)?,
            inspiration: row.get(3)?,
            description: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
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

#[tauri::command]
pub fn get_ip_asset_detail(db_path: String, ip_id: String) -> CommandResult<IpAssetDetail> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    // 1. 获取 IP 基础资料
    let mut stmt = match conn.prepare(
        "SELECT id, name, avatar_path, inspiration, description, created_at, updated_at
         FROM ip_assets
         WHERE id = ?"
    ) {
        Ok(s) => s,
        Err(e) => return CommandResult::err(format!("查询准备失败: {}", e)),
    };

    let ip = match stmt.query_row(params![ip_id], |row| {
        Ok(IpAsset {
            id: row.get(0)?,
            name: row.get(1)?,
            avatar_path: row.get(2)?,
            inspiration: row.get(3)?,
            description: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
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
         ORDER BY sort_order ASC, created_at DESC"
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
         ORDER BY created_at DESC"
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
        "SELECT id, ip_id, name, description, created_at, updated_at
         FROM ip_sticker_packs
         WHERE ip_id = ?
         ORDER BY created_at DESC"
    ) {
        Ok(s) => s,
        Err(e) => return CommandResult::err(format!("查询表情包套件准备失败: {}", e)),
    };
    let packs_mapped = stmt_packs.query_map(params![ip_id], |row| {
        Ok(IpStickerPack {
            id: row.get(0)?,
            ip_id: row.get(1)?,
            name: row.get(2)?,
            description: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
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
         ORDER BY sort_order ASC, created_at DESC"
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

    CommandResult::ok(IpAssetDetail {
        ip,
        character_sheets,
        creations,
        sticker_packs,
        emojis,
        platforms,
        relations,
    })
}

#[tauri::command]
pub fn create_ip_asset(
    db_path: String,
    name: String,
    inspiration: Option<String>,
    description: Option<String>,
    avatar_path: Option<String>,
) -> CommandResult<IpAsset> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    // 如果前端提供了本地头像文件地址，则拷贝至 IP 私有资源目录中
    let copied_avatar_path = match avatar_path {
        Some(src) => {
            if src.trim().is_empty() {
                None
            } else {
                match copy_to_ip_assets_dir(&db_path, &id, "avatar", &src) {
                    Ok(dest) => Some(dest),
                    Err(e) => return CommandResult::err(format!("拷贝头像文件失败: {}", e)),
                }
            }
        }
        None => None,
    };

    match conn.execute(
        "INSERT INTO ip_assets (id, name, avatar_path, inspiration, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        params![id, name, copied_avatar_path, inspiration, description, now, now],
    ) {
        Ok(_) => {
            CommandResult::ok(IpAsset {
                id,
                name,
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
    inspiration: Option<String>,
    description: Option<String>,
    avatar_path: Option<String>,
) -> CommandResult<IpAsset> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let now = Utc::now().to_rfc3339();

    // 读取当前已有的 avatar_path 属性
    let mut old_avatar_path: Option<String> = None;
    let _ = conn.query_row(
        "SELECT avatar_path FROM ip_assets WHERE id = ?",
        params![ip_id],
        |row| {
            old_avatar_path = row.get(0).ok();
            Ok(())
        }
    );

    // 如果有变动则执行覆盖拷贝
    let copied_avatar_path = match avatar_path {
        Some(src) => {
            if src.trim().is_empty() {
                None
            } else if Some(src.clone()) == old_avatar_path {
                old_avatar_path
            } else {
                match copy_to_ip_assets_dir(&db_path, &ip_id, "avatar", &src) {
                    Ok(dest) => Some(dest),
                    Err(e) => return CommandResult::err(format!("拷贝头像文件失败: {}", e)),
                }
            }
        }
        None => None,
    };

    match conn.execute(
        "UPDATE ip_assets 
         SET name = ?, avatar_path = ?, inspiration = ?, description = ?, updated_at = ?
         WHERE id = ?",
        params![name, copied_avatar_path, inspiration, description, now, ip_id],
    ) {
        Ok(_) => {
            let mut created_at = now.clone();
            let _ = conn.query_row(
                "SELECT created_at FROM ip_assets WHERE id = ?",
                params![ip_id],
                |row| {
                    if let Ok(c) = row.get(0) {
                        created_at = c;
                    }
                    Ok(())
                }
            );

            CommandResult::ok(IpAsset {
                id: ip_id,
                name,
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
pub fn delete_ip_asset(db_path: String, ip_id: String) -> CommandResult<bool> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    // 在删除数据库项前，先删除磁盘上的 ip_assets 目录
    let db_path_buf = Path::new(&db_path);
    if let Some(data_dir) = db_path_buf.parent() {
        if let Some(app_data_dir) = data_dir.parent() {
            let ip_dir = app_data_dir.join("ip_assets").join(&ip_id);
            if ip_dir.exists() {
                let _ = std::fs::remove_dir_all(ip_dir);
            }
        }
    }

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

    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(e) => return CommandResult::err(format!("开启事务失败: {}", e)),
    };

    let now = Utc::now().to_rfc3339();

    for src_path in image_paths {
        // 拷贝至设定图目录
        let copied_path = match copy_to_ip_assets_dir(&db_path, &ip_id, "sheets", &src_path) {
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

    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(e) => return CommandResult::err(format!("开启事务失败: {}", e)),
    };

    let now = Utc::now().to_rfc3339();

    for (idx, src_path) in image_paths.iter().enumerate() {
        // 拷贝至创作图片目录
        let copied_path = match copy_to_ip_assets_dir(&db_path, &ip_id, "creations", src_path) {
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
    description: Option<String>,
) -> CommandResult<IpStickerPack> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    match conn.execute(
        "INSERT INTO ip_sticker_packs (id, ip_id, name, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)",
        params![id, ip_id, name, description, now, now],
    ) {
        Ok(_) => CommandResult::ok(IpStickerPack {
            id,
            ip_id,
            name,
            description,
            created_at: now.clone(),
            updated_at: now,
        }),
        Err(e) => CommandResult::err(format!("创建表情包套件失败: {}", e)),
    }
}

#[tauri::command]
pub fn update_ip_sticker_pack(
    db_path: String,
    pack_id: String,
    name: String,
    description: Option<String>,
) -> CommandResult<bool> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    let now = Utc::now().to_rfc3339();

    match conn.execute(
        "UPDATE ip_sticker_packs SET name = ?, description = ?, updated_at = ? WHERE id = ?",
        params![name, description, now, pack_id],
    ) {
        Ok(_) => CommandResult::ok(true),
        Err(e) => CommandResult::err(format!("修改表情包套件失败: {}", e)),
    }
}

#[tauri::command]
pub fn delete_ip_sticker_pack(db_path: String, pack_id: String) -> CommandResult<bool> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    // 删除磁盘上表情包套件内所有的图片
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

    match conn.execute("DELETE FROM ip_sticker_packs WHERE id = ?", params![pack_id]) {
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
pub fn delete_ip_sticker_pack_platform(db_path: String, platform_id: String) -> CommandResult<bool> {
    let conn = match Connection::open(Path::new(&db_path)) {
        Ok(c) => c,
        Err(e) => return CommandResult::err(format!("打开数据库失败: {}", e)),
    };

    match conn.execute("DELETE FROM ip_sticker_pack_platforms WHERE id = ?", params![platform_id]) {
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

    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(e) => return CommandResult::err(format!("开启事务失败: {}", e)),
    };

    let now = Utc::now().to_rfc3339();

    for (idx, src_path) in image_paths.iter().enumerate() {
        // 拷贝至表情包目录
        let copied_path = match copy_to_ip_assets_dir(&db_path, &ip_id, "emojis", src_path) {
            Ok(p) => p,
            Err(e) => return CommandResult::err(format!("复制表情图片失败 {}: {}", src_path, e)),
        };

        let trigger_word = trigger_words.get(idx).cloned().flatten();
        let id = Uuid::new_v4().to_string();

        if let Err(e) = tx.execute(
            "INSERT INTO ip_emojis (id, ip_id, pack_id, image_path, trigger_word, sort_order, created_at)
             VALUES (?, ?, ?, ?, ?, 0, ?)",
             params![id, ip_id, pack_id, copied_path, trigger_word, now],
        ) {
            return CommandResult::err(format!("添加表情图片失败: {}", e));
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
pub fn delete_ip_emojis(
    db_path: String,
    emoji_ids: Vec<String>,
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
        // 先查询对应的物理路径，以便后面清理文件
        let mut stmt = match tx.prepare("SELECT image_path FROM ip_emojis WHERE id = ?") {
            Ok(s) => s,
            Err(e) => return CommandResult::err(format!("查询准备失败: {}", e)),
        };
        let image_path: Option<String> = stmt.query_row(params![id], |row| row.get(0)).ok();

        if let Err(e) = tx.execute(
            "DELETE FROM ip_emojis WHERE id = ?",
            params![id],
        ) {
            return CommandResult::err(format!("彻底删除表情记录失败: {}", e));
        }

        // 删除物理磁盘文件
        if let Some(path) = image_path {
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
