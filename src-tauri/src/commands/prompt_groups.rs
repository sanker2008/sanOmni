use crate::models::{PromptGroup, PromptGroupWithImages};
use rusqlite::Connection;
use std::path::PathBuf;
use uuid::Uuid;

/// 创建 Prompt 组
#[tauri::command]
pub async fn create_prompt_group(
    db_path: PathBuf,
    prompt: String,
    negative_prompt: Option<String>,
    name: Option<String>,
    description: Option<String>,
    template_schema: Option<String>,
    category: Option<String>,
    tags: Option<String>,
    price: Option<f64>,
    is_published: Option<bool>,
    image_ids: Vec<String>,
) -> Result<PromptGroup, String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let category = category.unwrap_or_else(|| "Product & Ecommerce".to_string());
    let tags = tags.unwrap_or_else(|| "[]".to_string());
    let price = price.unwrap_or(4.99);
    let is_published = is_published.unwrap_or(false);
    let publish_status = if is_published { "published" } else { "draft" }.to_string();

    // 插入 prompt 组
    conn.execute(
        "INSERT INTO prompt_groups (id, prompt, negative_prompt, name, description, template_schema, category, tags, price, is_published, publish_status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        rusqlite::params![
            &id,
            &prompt,
            &negative_prompt,
            &name,
            &description,
            &template_schema,
            &category,
            &tags,
            price,
            is_published,
            &publish_status,
            &now,
            &now
        ],
    )
    .map_err(|e| e.to_string())?;

    // 关联图片
    for image_id in &image_ids {
        conn.execute(
            "INSERT OR IGNORE INTO image_prompt_group_relations (image_id, prompt_group_id)
             VALUES (?1, ?2)",
            rusqlite::params![image_id, &id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(PromptGroup {
        id,
        prompt,
        negative_prompt,
        name,
        description,
        template_schema,
        category,
        tags,
        price,
        is_published,
        publish_status,
        remote_slug: None,
        remote_url: None,
        last_published_at: None,
        image_count: image_ids.len() as i32,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// 获取所有 Prompt 组
#[tauri::command]
pub async fn get_prompt_groups(db_path: PathBuf) -> Result<Vec<PromptGroup>, String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT
                pg.id,
                pg.prompt,
                pg.negative_prompt,
                pg.name,
                pg.description,
                pg.template_schema,
                pg.category,
                pg.tags,
                pg.price,
                pg.is_published,
                pg.publish_status,
                pg.remote_slug,
                pg.remote_url,
                pg.last_published_at,
                COUNT(ipgr.image_id) as image_count,
                pg.created_at,
                pg.updated_at
             FROM prompt_groups pg
             LEFT JOIN image_prompt_group_relations ipgr ON pg.id = ipgr.prompt_group_id
             GROUP BY pg.id, pg.prompt, pg.negative_prompt, pg.name, pg.description, pg.template_schema, pg.category, pg.tags, pg.price, pg.is_published, pg.publish_status, pg.remote_slug, pg.remote_url, pg.last_published_at, pg.created_at, pg.updated_at
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let groups = stmt
        .query_map([], |row| {
            Ok(PromptGroup {
                id: row.get(0)?,
                prompt: row.get(1)?,
                negative_prompt: row.get(2)?,
                name: row.get(3)?,
                description: row.get(4)?,
                template_schema: row.get(5)?,
                category: row.get(6)?,
                tags: row.get(7)?,
                price: row.get(8)?,
                is_published: row.get(9)?,
                publish_status: row.get(10)?,
                remote_slug: row.get(11)?,
                remote_url: row.get(12)?,
                last_published_at: row.get(13)?,
                image_count: row.get(14)?,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(groups)
}

/// 获取 Prompt 组详情（包含关联的图片）
#[tauri::command]
pub async fn get_prompt_group_with_images(
    db_path: PathBuf,
    group_id: String,
) -> Result<PromptGroupWithImages, String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // 获取 prompt 组信息
    let group: PromptGroup = conn
        .query_row(
            "SELECT id, prompt, negative_prompt, name, description, template_schema, category, tags, price, is_published, publish_status, remote_slug, remote_url, last_published_at, created_at, updated_at
             FROM prompt_groups
             WHERE id = ?1",
            [&group_id],
            |row| {
                Ok(PromptGroup {
                    id: row.get(0)?,
                    prompt: row.get(1)?,
                    negative_prompt: row.get(2)?,
                    name: row.get(3)?,
                    description: row.get(4)?,
                    template_schema: row.get(5)?,
                    category: row.get(6)?,
                    tags: row.get(7)?,
                    price: row.get(8)?,
                    is_published: row.get(9)?,
                    publish_status: row.get(10)?,
                    remote_slug: row.get(11)?,
                    remote_url: row.get(12)?,
                    last_published_at: row.get(13)?,
                    image_count: 0,
                    created_at: row.get(14)?,
                    updated_at: row.get(15)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    // 获取关联的图片（包含模型信息）
    let mut stmt = conn
        .prepare(
            "SELECT 
                i.id, i.filename, i.absolute_path, i.primary_model_id,
                m.name as model_name, v.name as vendor_name,
                i.width, i.height, i.created_at,
                ipgr.role, ipgr.is_cover, ipgr.sort_order, ipgr.caption,
                ipgr.variant_key, ipgr.variant_json, ipgr.is_sync_enabled,
                ipgr.sync_status, ipgr.remote_url
             FROM images i
             INNER JOIN image_prompt_group_relations ipgr ON i.id = ipgr.image_id
             INNER JOIN models m ON i.primary_model_id = m.id
             INNER JOIN vendors v ON m.vendor_id = v.id
             WHERE ipgr.prompt_group_id = ?1
             ORDER BY ipgr.sort_order, v.name, m.name, i.created_at",
        )
        .map_err(|e| e.to_string())?;

    let images = stmt
        .query_map([&group_id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "filename": row.get::<_, String>(1)?,
                "absolute_path": row.get::<_, String>(2)?,
                "primary_model_id": row.get::<_, String>(3)?,
                "model_name": row.get::<_, String>(4)?,
                "vendor_name": row.get::<_, String>(5)?,
                "width": row.get::<_, Option<i32>>(6)?,
                "height": row.get::<_, Option<i32>>(7)?,
                "created_at": row.get::<_, String>(8)?,
                "role": row.get::<_, Option<String>>(9)?.unwrap_or_else(|| "gallery".to_string()),
                "is_cover": row.get::<_, bool>(10)?,
                "sort_order": row.get::<_, i32>(11)?,
                "caption": row.get::<_, Option<String>>(12)?,
                "variant_key": row.get::<_, Option<String>>(13)?,
                "variant_json": row.get::<_, Option<String>>(14)?,
                "is_sync_enabled": row.get::<_, bool>(15)?,
                "sync_status": row.get::<_, Option<String>>(16)?.unwrap_or_else(|| "local".to_string()),
                "remote_url": row.get::<_, Option<String>>(17)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut group = group;
    group.image_count = images.len() as i32;

    Ok(PromptGroupWithImages { group, images })
}

/// 添加图片到 Prompt 组
#[tauri::command]
pub async fn add_images_to_prompt_group(
    db_path: PathBuf,
    group_id: String,
    image_ids: Vec<String>,
) -> Result<(), String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    for image_id in image_ids {
        conn.execute(
            "INSERT OR IGNORE INTO image_prompt_group_relations (image_id, prompt_group_id)
             VALUES (?1, ?2)",
            rusqlite::params![&image_id, &group_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // 更新 prompt 组的更新时间
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE prompt_groups SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![&now, &group_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// 获取图片已关联的 Prompt 组
#[tauri::command]
pub async fn get_prompt_groups_for_image(
    db_path: PathBuf,
    image_id: String,
) -> Result<Vec<PromptGroup>, String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT
                pg.id,
                pg.prompt,
                pg.negative_prompt,
                pg.name,
                pg.description,
                pg.template_schema,
                pg.category,
                pg.tags,
                pg.price,
                pg.is_published,
                pg.publish_status,
                pg.remote_slug,
                pg.remote_url,
                pg.last_published_at,
                (
                    SELECT COUNT(*)
                    FROM image_prompt_group_relations ipgr2
                    WHERE ipgr2.prompt_group_id = pg.id
                ) as image_count,
                pg.created_at,
                pg.updated_at
             FROM prompt_groups pg
             INNER JOIN image_prompt_group_relations ipgr ON pg.id = ipgr.prompt_group_id
             WHERE ipgr.image_id = ?1
             ORDER BY pg.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let groups = stmt
        .query_map([&image_id], |row| {
            Ok(PromptGroup {
                id: row.get(0)?,
                prompt: row.get(1)?,
                negative_prompt: row.get(2)?,
                name: row.get(3)?,
                description: row.get(4)?,
                template_schema: row.get(5)?,
                category: row.get(6)?,
                tags: row.get(7)?,
                price: row.get(8)?,
                is_published: row.get(9)?,
                publish_status: row.get(10)?,
                remote_slug: row.get(11)?,
                remote_url: row.get(12)?,
                last_published_at: row.get(13)?,
                image_count: row.get(14)?,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(groups)
}

/// 直接设置图片关联的 Prompt 组
#[tauri::command]
pub async fn set_prompt_groups_for_image(
    db_path: PathBuf,
    image_id: String,
    group_ids: Vec<String>,
) -> Result<(), String> {
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    tx.execute(
        "DELETE FROM image_prompt_group_relations WHERE image_id = ?1",
        [&image_id],
    )
    .map_err(|e| e.to_string())?;

    for group_id in &group_ids {
        tx.execute(
            "INSERT OR IGNORE INTO image_prompt_group_relations (image_id, prompt_group_id)
             VALUES (?1, ?2)",
            rusqlite::params![&image_id, group_id],
        )
        .map_err(|e| e.to_string())?;

        tx.execute(
            "UPDATE prompt_groups SET updated_at = ?1 WHERE id = ?2",
            rusqlite::params![&now, group_id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// 从 Prompt 组移除图片
#[tauri::command]
pub async fn remove_images_from_prompt_group(
    db_path: PathBuf,
    group_id: String,
    image_ids: Vec<String>,
) -> Result<(), String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    for image_id in image_ids {
        conn.execute(
            "DELETE FROM image_prompt_group_relations 
             WHERE image_id = ?1 AND prompt_group_id = ?2",
            rusqlite::params![&image_id, &group_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // 更新 prompt 组的更新时间
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE prompt_groups SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![&now, &group_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// 更新 Prompt 组
#[tauri::command]
pub async fn update_prompt_group_image_meta(
    db_path: PathBuf,
    group_id: String,
    image_id: String,
    role: Option<String>,
    is_cover: Option<bool>,
    sort_order: Option<i32>,
    caption: Option<String>,
    variant_key: Option<String>,
    variant_json: Option<String>,
    is_sync_enabled: Option<bool>,
) -> Result<(), String> {
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    if is_cover.unwrap_or(false) {
        tx.execute(
            "UPDATE image_prompt_group_relations SET is_cover = 0, role = CASE WHEN role = 'cover' THEN 'gallery' ELSE role END WHERE prompt_group_id = ?1",
            [&group_id],
        )
        .map_err(|e| e.to_string())?;
    }

    let current_role = role.unwrap_or_else(|| {
        if is_cover.unwrap_or(false) {
            "cover".to_string()
        } else {
            "gallery".to_string()
        }
    });

    tx.execute(
        "UPDATE image_prompt_group_relations
         SET role = ?1,
             is_cover = ?2,
             sort_order = ?3,
             caption = ?4,
             variant_key = ?5,
             variant_json = ?6,
             is_sync_enabled = ?7
         WHERE prompt_group_id = ?8 AND image_id = ?9",
        rusqlite::params![
            current_role,
            is_cover.unwrap_or(false),
            sort_order.unwrap_or(0),
            caption,
            variant_key,
            variant_json,
            is_sync_enabled.unwrap_or(true),
            &group_id,
            &image_id
        ],
    )
    .map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();
    tx.execute(
        "UPDATE prompt_groups SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![&now, &group_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_prompt_group(
    db_path: PathBuf,
    group_id: String,
    prompt: Option<String>,
    negative_prompt: Option<String>,
    name: Option<String>,
    description: Option<String>,
    template_schema: Option<String>,
    category: Option<String>,
    tags: Option<String>,
    price: Option<f64>,
    is_published: Option<bool>,
    publish_status: Option<String>,
    remote_slug: Option<String>,
    remote_url: Option<String>,
    last_published_at: Option<String>,
) -> Result<(), String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    // 构建动态更新语句
    let mut updates = vec!["updated_at = ?1"];
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(now)];

    if let Some(p) = prompt {
        updates.push("prompt = ?");
        params.push(Box::new(p));
    }

    if let Some(np) = negative_prompt {
        updates.push("negative_prompt = ?");
        params.push(Box::new(np));
    }

    if let Some(n) = name {
        updates.push("name = ?");
        params.push(Box::new(n));
    }

    if let Some(d) = description {
        updates.push("description = ?");
        params.push(Box::new(d));
    }

    if let Some(ts) = template_schema {
        updates.push("template_schema = ?");
        params.push(Box::new(ts));
    }

    if let Some(c) = category {
        updates.push("category = ?");
        params.push(Box::new(c));
    }

    if let Some(t) = tags {
        updates.push("tags = ?");
        params.push(Box::new(t));
    }

    if let Some(p) = price {
        updates.push("price = ?");
        params.push(Box::new(p));
    }

    if let Some(ip) = is_published {
        updates.push("is_published = ?");
        params.push(Box::new(ip));
    }

    if let Some(ps) = publish_status {
        updates.push("publish_status = ?");
        params.push(Box::new(ps));
    }

    if let Some(rs) = remote_slug {
        updates.push("remote_slug = ?");
        params.push(Box::new(rs));
    }

    if let Some(ru) = remote_url {
        updates.push("remote_url = ?");
        params.push(Box::new(ru));
    }

    if let Some(lpa) = last_published_at {
        updates.push("last_published_at = ?");
        params.push(Box::new(lpa));
    }

    let sql = format!(
        "UPDATE prompt_groups SET {} WHERE id = ?",
        updates.join(", ")
    );
    params.push(Box::new(group_id));

    conn.execute(&sql, rusqlite::params_from_iter(params.iter()))
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 删除 Prompt 组
#[tauri::command]
pub async fn delete_prompt_group(db_path: PathBuf, group_id: String) -> Result<(), String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM prompt_groups WHERE id = ?1", [&group_id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 自动检测并创建 Prompt 组（基于相同的 prompt）
#[tauri::command]
pub async fn auto_group_by_prompt(db_path: PathBuf) -> Result<Vec<PromptGroup>, String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // 查找有相同 prompt 的图片（至少 2 张）
    let mut stmt = conn
        .prepare(
            "SELECT prompt, negative_prompt, GROUP_CONCAT(id) as image_ids, COUNT(*) as count
             FROM images
             WHERE prompt IS NOT NULL AND prompt != ''
             GROUP BY prompt, negative_prompt
             HAVING count >= 2",
        )
        .map_err(|e| e.to_string())?;

    let mut created_groups = Vec::new();
    let now = chrono::Utc::now().to_rfc3339();

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (prompt, negative_prompt, image_ids_str) = row.map_err(|e| e.to_string())?;
        let image_ids: Vec<String> = image_ids_str.split(',').map(|s| s.to_string()).collect();

        // 检查是否已存在相同的 prompt 组
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM prompt_groups WHERE prompt = ?1 AND negative_prompt IS ?2)",
                rusqlite::params![&prompt, &negative_prompt],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        if !exists {
            let id = Uuid::new_v4().to_string();

            // 创建 prompt 组
            conn.execute(
                "INSERT INTO prompt_groups (id, prompt, negative_prompt, name, description, template_schema, category, tags, price, is_published, publish_status, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                rusqlite::params![
                    &id,
                    &prompt,
                    &negative_prompt,
                    None::<String>,
                    Some(format!("自动创建 - {} 张图片", image_ids.len())),
                    None::<String>,
                    "Product & Ecommerce",
                    "[]",
                    4.99,
                    false,
                    "draft",
                    &now,
                    &now
                ],
            )
            .map_err(|e| e.to_string())?;

            // 关联图片
            for image_id in &image_ids {
                conn.execute(
                    "INSERT OR IGNORE INTO image_prompt_group_relations (image_id, prompt_group_id)
                     VALUES (?1, ?2)",
                    rusqlite::params![image_id, &id],
                )
                .map_err(|e| e.to_string())?;
            }

            created_groups.push(PromptGroup {
                id,
                prompt: prompt.clone(),
                negative_prompt: negative_prompt.clone(),
                name: None,
                description: Some(format!("自动创建 - {} 张图片", image_ids.len())),
                template_schema: None,
                category: "Product & Ecommerce".to_string(),
                tags: "[]".to_string(),
                price: 4.99,
                is_published: false,
                publish_status: "draft".to_string(),
                remote_slug: None,
                remote_url: None,
                last_published_at: None,
                image_count: image_ids.len() as i32,
                created_at: now.clone(),
                updated_at: now.clone(),
            });
        }
    }

    Ok(created_groups)
}
