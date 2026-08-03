use chrono::Utc;
use futures_util::StreamExt;
use rusqlite::{params, Connection, Transaction};
use scraper::{Html, Selector};
use serde::Serialize;
use std::collections::{HashSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use url::Url;
use uuid::Uuid;

const MAX_INDEXED_FILE_SIZE: u64 = 2 * 1024 * 1024;
const MAX_INDEXED_FILES: usize = 2_000;
const MAX_WEB_COLLECTION_PAGES: usize = 50;
const MAX_WEB_PAGE_SIZE: usize = 2 * 1024 * 1024;
const MAX_WEB_CRAWL_DEPTH: usize = 3;

struct CuratedKnowledgeEntry {
    key: &'static str,
    title: &'static str,
    content: &'static str,
    source_path: &'static str,
}

const SANOMNI_CURATED_KNOWLEDGE: &[CuratedKnowledgeEntry] = &[
    CuratedKnowledgeEntry {
        key: "domain-boundaries",
        title: "模块边界：sanPrompt、sanIP、sanLabs 与 sanKnow",
        content: "结论\nsanPrompt、sanIP 和 sanLabs 是独立业务领域；sanKnow 也应保持独立。可以复用应用外壳、设置、数据库基础和 UI 组件，但不要与既有业务表建立交叉外键或把知识库塞进某个业务域。\n\n何时查阅\n新增功能、迁移数据或接入同步前，先判断功能归属，避免把领域边界重新耦合。\n\n主要来源\ndocs/architecture/ARCHITECTURE.md；README.md；src-tauri/src/database/mod.rs（schema v5 注释）",
        source_path: "docs/architecture/ARCHITECTURE.md",
    },
    CuratedKnowledgeEntry {
        key: "database-migrations",
        title: "数据库迁移：以 settings.db_version 做增量升级",
        content: "结论\n数据库结构升级由 settings 表的 db_version 驱动。每个版本迁移完成后必须写回版本号；新安装会创建完整表结构，旧安装依次补齐迁移。sanKnow 的表和索引是 schema v5。\n\n何时查阅\n新增字段、数据表、索引或升级已有用户数据库时，按现有 run_migrations 模式扩展，不要只修改初始建表 SQL。\n\n主要来源\nsrc-tauri/src/database/mod.rs（get_db_version、run_migrations、v5）",
        source_path: "src-tauri/src/database/mod.rs",
    },
    CuratedKnowledgeEntry {
        key: "unified-root-database",
        title: "统一根目录会改变实际业务数据库的位置",
        content: "结论\n应用会先从默认应用数据目录的数据库读取 unifiedRootPath；配置了统一根目录后，实际业务数据应使用 {统一根目录}/data/database.sqlite。\n\n何时查阅\n排查“数据不见了”、迁移数据库或写新的 Tauri 命令时，先统一通过 get_app_root_from_handle / get_app_root 解析根目录。不要在不确认根目录的环境中直接写 SQLite 文件。\n\n主要来源\nsrc-tauri/src/commands/mod.rs；docs/features/supabase-image-upload.md",
        source_path: "src-tauri/src/commands/mod.rs",
    },
    CuratedKnowledgeEntry {
        key: "works-structure",
        title: "作品结构：single、collection、narrative",
        content: "结论\n作品类型描述媒介，structure_mode 决定额外内容能力：single 用于独立作品，collection 用于专辑或系列，narrative 才拥有章节、正文、进度和人物出场管理。已有作品迁移后保持 single，只有 narrative 应展示或允许章节操作。\n\n何时查阅\n修改作品详情、章节命令或作品迁移时，先检查 structure_mode；不要把章节能力开放给所有作品。\n\n主要来源\ndocs/features/WORKS_COLLECTION_STRUCTURE.md；src-tauri/src/commands/works.rs；src-tauri/src/commands/chapters.rs",
        source_path: "docs/features/WORKS_COLLECTION_STRUCTURE.md",
    },
    CuratedKnowledgeEntry {
        key: "sync-correctness",
        title: "sanIP 同步：游标、事务与文件一致性不变量",
        content: "结论\nPush 成功不等于已消费远端变更；last_sync_version 只能在远端数据库变更完整应用且本地事务提交成功后推进。含文件的数据还必须上传或下载后重新计算 SHA-256 验证，失败的文件要保留为可重试任务。\n\n何时查阅\n改动客户端 Pull/Push、服务端同步协议或新增可同步表时，先逐项核对游标、事务、文件、快照和回归测试覆盖。\n\n主要来源\ndocs/architecture/SYNC_CORRECTNESS.md",
        source_path: "docs/architecture/SYNC_CORRECTNESS.md",
    },
    CuratedKnowledgeEntry {
        key: "sync-deletion-queue",
        title: "同步删除：上传前先合并本地待推送变更",
        content: "结论\n一张已删除的图片可能还留有早期 INSERT 或 UPDATE 同步日志。Push 前必须按记录的最终状态合并待推送变更；否则旧日志会继续读取已被删除的本地文件，导致上传失败。\n\n何时查阅\n出现“删除后同步失败”、调整 sync_changelog 队列或选择性推送逻辑时，检查 collapse_pending_changes 和对应删除回归测试。\n\n主要来源\nsrc-tauri/src/sync/engine.rs（collapse_pending_changes、deletion_supersedes_stale_image_change_before_file_upload）",
        source_path: "src-tauri/src/sync/engine.rs",
    },
    CuratedKnowledgeEntry {
        key: "path-immutability",
        title: "存储路径标识：创建后不可变",
        content: "结论\nip_path、pack_path 及其他用于物理目录命名的 path 标识，一旦实体创建就必须锁定。仅修改数据库字段而不迁移文件会造成文件断链；多设备路径分歧还会破坏同步。\n\n何时查阅\n编辑 IP、表情包、作品、厂商或模型的 path 字段前，确认不会绕过创建后锁定规则；若确需重命名，必须先设计完整的文件与同步迁移。\n\n主要来源\ndocs/architecture/STORAGE_STRUCTURE.md；docs/release-notes/2026-06-09_PATH_IMMUTABILITY.md",
        source_path: "docs/release-notes/2026-06-09_PATH_IMMUTABILITY.md",
    },
    CuratedKnowledgeEntry {
        key: "cross-platform-verification",
        title: "跨平台开发：路径 API 与目标平台验收",
        content: "结论\n跨平台文件路径应使用 Rust 的 Path::join 或 Tauri 路径 API，而不是硬编码 Windows 或 Unix 分隔符。Windows、macOS、Linux 有各自的原生依赖和打包目标，因此目标平台的运行或构建结果才构成该平台的验收证据。\n\n何时查阅\n处理文件路径、Tauri 编译失败或发布包验证时，区分 WSL/Linux 检查与 Windows 原生检查，分别记录结论。\n\n主要来源\ndocs/dev/CROSS_PLATFORM.md；README.md",
        source_path: "docs/dev/CROSS_PLATFORM.md",
    },
    CuratedKnowledgeEntry {
        key: "knowledge-base-boundary",
        title: "sanKnow 首版：本地开发知识，不进入 sanIP 云同步",
        content: "结论\nsanKnow 使用 knowledge_projects 和 knowledge_entries 保存本地项目索引与手动记录。首版没有加入既有 sanIP 云同步触发器；重新索引会更新来源文件记录，但保留 source_path 为空的手动笔记。当前索引上限为 2,000 个文件、单文件 2 MiB，并跳过 node_modules、target、dist 等生成或依赖目录。\n\n何时查阅\n讨论知识库同步、索引覆盖范围或“我的记录为什么还在”时，先确认这些本地优先边界。\n\n主要来源\nsrc-tauri/src/database/mod.rs；src-tauri/src/commands/knowledge.rs",
        source_path: "src-tauri/src/commands/knowledge.rs",
    },
];

const SKIPPED_DIRECTORIES: &[&str] = &[
    ".git",
    ".next",
    ".turbo",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
];

#[derive(Debug, Serialize)]
pub struct KnowledgeProject {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub last_indexed_at: Option<String>,
    pub entry_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct KnowledgeEntry {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub content: String,
    pub entry_type: String,
    pub source_path: Option<String>,
    pub source_url: Option<String>,
    pub source_collection_id: Option<String>,
    pub source_collection_name: Option<String>,
    pub source_language: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct KnowledgeSearchResult {
    pub entry: KnowledgeEntry,
    pub snippet: String,
    pub match_line: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct KnowledgeIndexResult {
    pub project: KnowledgeProject,
    pub indexed_files: usize,
    pub skipped_files: usize,
    pub curated_entries: usize,
}

#[derive(Debug, Serialize)]
pub struct KnowledgeWebCollectionImportResult {
    pub collection_name: String,
    pub imported_pages: usize,
    pub skipped_pages: usize,
}

struct CrawledWebPage {
    url: String,
    title: String,
    content: String,
}

fn get_connection(app_handle: &AppHandle) -> Result<Connection, String> {
    let default_app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let app_root = crate::commands::get_app_root_from_handle(app_handle, &default_app_data_dir);
    Connection::open(app_root.join("data").join("database.sqlite")).map_err(|e| e.to_string())
}

fn project_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeProject> {
    Ok(KnowledgeProject {
        id: row.get(0)?,
        name: row.get(1)?,
        root_path: row.get(2)?,
        last_indexed_at: row.get(3)?,
        entry_count: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn entry_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeEntry> {
    Ok(KnowledgeEntry {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        content: row.get(3)?,
        entry_type: row.get(4)?,
        source_path: row.get(5)?,
        source_url: row.get(6)?,
        source_collection_id: row.get(7)?,
        source_collection_name: row.get(8)?,
        source_language: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn get_project(conn: &Connection, project_id: &str) -> Result<KnowledgeProject, String> {
    conn.query_row(
        "SELECT p.id, p.name, p.root_path, p.last_indexed_at, COUNT(e.id), p.created_at, p.updated_at
         FROM knowledge_projects p
         LEFT JOIN knowledge_entries e ON e.project_id = p.id
         WHERE p.id = ?1
         GROUP BY p.id",
        [project_id],
        project_from_row,
    )
    .map_err(|e| e.to_string())
}

fn indexable_extension(path: &Path) -> Option<(&'static str, &'static str)> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    match extension.as_str() {
        "md" | "mdx" => Some(("文档", "Markdown")),
        "rs" => Some(("代码", "Rust")),
        "ts" | "tsx" => Some(("代码", "TypeScript")),
        "js" | "jsx" | "mjs" | "cjs" => Some(("代码", "JavaScript")),
        "json" => Some(("配置", "JSON")),
        "toml" => Some(("配置", "TOML")),
        "yml" | "yaml" => Some(("配置", "YAML")),
        "css" | "scss" => Some(("代码", "Stylesheet")),
        _ => None,
    }
}

fn collect_indexable_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    let mut pending = vec![root.to_path_buf()];

    while let Some(directory) = pending.pop() {
        let entries = fs::read_dir(&directory)
            .map_err(|e| format!("无法读取目录 {}: {}", directory.display(), e))?;

        for entry in entries.flatten() {
            if files.len() >= MAX_INDEXED_FILES {
                return Ok(files);
            }

            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => continue,
            };
            if file_type.is_symlink() {
                continue;
            }

            let path = entry.path();
            if file_type.is_dir() {
                let should_skip = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| SKIPPED_DIRECTORIES.contains(&name));
                if !should_skip {
                    pending.push(path);
                }
                continue;
            }

            if !file_type.is_file() || indexable_extension(&path).is_none() {
                continue;
            }
            if entry
                .metadata()
                .map(|metadata| metadata.len())
                .unwrap_or(u64::MAX)
                <= MAX_INDEXED_FILE_SIZE
            {
                files.push(path);
            }
        }
    }

    Ok(files)
}

fn source_title(path: &Path, content: &str) -> String {
    if matches!(
        path.extension().and_then(|extension| extension.to_str()),
        Some("md" | "mdx")
    ) {
        if let Some(heading) = content
            .lines()
            .map(str::trim)
            .find_map(|line| line.strip_prefix("# "))
        {
            if !heading.trim().is_empty() {
                return heading.trim().to_string();
            }
        }
    }

    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("未命名来源")
        .to_string()
}

fn source_excerpt(content: &str, query: &str) -> (String, Option<usize>) {
    let query = query.trim();
    for (index, line) in content.lines().enumerate() {
        if !query.is_empty() && line.contains(query) {
            return (line.trim().chars().take(220).collect(), Some(index + 1));
        }
    }

    let snippet = content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("暂无可展示内容")
        .chars()
        .take(220)
        .collect();
    (snippet, None)
}

fn is_sanomni_project(root: &Path) -> bool {
    root.join("src-tauri").join("Cargo.toml").is_file()
        && root.join("src").join("App.tsx").is_file()
        && root
            .join("src-tauri")
            .join("src")
            .join("database")
            .join("mod.rs")
            .is_file()
}

fn seed_sanomni_curated_knowledge(
    transaction: &Transaction<'_>,
    project_id: &str,
    now: &str,
) -> Result<usize, String> {
    let id_prefix = format!("sanomni-curated:{}:", project_id);
    transaction
        .execute(
            "DELETE FROM knowledge_entries WHERE project_id = ?1 AND id LIKE ?2",
            params![project_id, format!("{}%", id_prefix)],
        )
        .map_err(|e| e.to_string())?;

    for entry in SANOMNI_CURATED_KNOWLEDGE {
        transaction
            .execute(
                "INSERT INTO knowledge_entries (id, project_id, title, content, entry_type, source_path, source_language, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, '开发指南', ?5, 'sanOmni 精选', ?6, ?6)",
                params![
                    format!("{}{}", id_prefix, entry.key),
                    project_id,
                    entry.title,
                    entry.content,
                    entry.source_path,
                    now,
                ],
            )
            .map_err(|e| e.to_string())?;
    }

    Ok(SANOMNI_CURATED_KNOWLEDGE.len())
}

fn normalize_web_url(mut url: Url) -> Url {
    url.set_fragment(None);
    url
}

fn parse_web_collection_entry_url(value: &str) -> Result<Url, String> {
    let url =
        Url::parse(value.trim()).map_err(|_| "请输入有效的 HTTP 或 HTTPS 网址".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("网页文档集只支持 HTTP 或 HTTPS 网址".to_string());
    }
    Ok(normalize_web_url(url))
}

fn collection_scope_path(entry_url: &Url) -> String {
    let path = entry_url.path();
    if path.ends_with('/') {
        return path.to_string();
    }

    match path.rsplit_once('/') {
        Some(("", _)) | None => "/".to_string(),
        Some((parent, _)) => format!("{}/", parent),
    }
}

fn is_in_web_collection_scope(entry_url: &Url, candidate_url: &Url) -> bool {
    entry_url.origin() == candidate_url.origin()
        && candidate_url
            .path()
            .starts_with(&collection_scope_path(entry_url))
}

fn is_text_document(content_type: Option<&str>) -> bool {
    let Some(content_type) = content_type else {
        return true;
    };
    let content_type = content_type.to_ascii_lowercase();
    content_type.contains("text/html")
        || content_type.contains("application/xhtml+xml")
        || content_type.contains("text/plain")
        || content_type.contains("text/markdown")
}

async fn fetch_web_document(client: &reqwest::Client, url: &Url) -> Result<(Url, String), String> {
    let response = client
        .get(url.clone())
        .send()
        .await
        .map_err(|e| format!("读取 {} 失败: {}", url, e))?
        .error_for_status()
        .map_err(|e| format!("读取 {} 失败: {}", url, e))?;
    let final_url = normalize_web_url(response.url().clone());
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok());
    if !is_text_document(content_type) {
        return Err(format!("{} 不是可收录的网页或文本内容", final_url));
    }
    if response
        .content_length()
        .is_some_and(|size| size as usize > MAX_WEB_PAGE_SIZE)
    {
        return Err(format!("{} 超过单页 2 MiB 的收录上限", final_url));
    }

    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("读取 {} 内容失败: {}", final_url, e))?;
        if body.len() + chunk.len() > MAX_WEB_PAGE_SIZE {
            return Err(format!("{} 超过单页 2 MiB 的收录上限", final_url));
        }
        body.extend_from_slice(&chunk);
    }

    Ok((final_url, String::from_utf8_lossy(&body).into_owned()))
}

fn extract_web_page(url: &Url, body: &str, fetched_at: &str) -> (String, String, Vec<Url>) {
    let looks_like_html = body.trim_start().starts_with('<') || body.contains("<html");
    if !looks_like_html {
        let title = url
            .path_segments()
            .and_then(|mut segments| segments.next_back())
            .filter(|segment| !segment.is_empty())
            .unwrap_or(url.as_str())
            .to_string();
        let content = format!(
            "# {}\n\n来源网址: {}\n抓取时间: {}\n\n{}",
            title,
            url,
            fetched_at,
            body.trim()
        );
        return (title, content, Vec::new());
    }

    let document = Html::parse_document(body);
    let title_selector = Selector::parse("title").expect("固定 title 选择器必须有效");
    let content_selector =
        Selector::parse("main, article, [role='main'], .markdown-body, .documentation, .content")
            .expect("固定正文选择器必须有效");
    let body_selector = Selector::parse("body").expect("固定 body 选择器必须有效");
    let link_selector = Selector::parse("a[href]").expect("固定链接选择器必须有效");

    let title = document
        .select(&title_selector)
        .next()
        .map(|node| node.text().collect::<String>())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| url.as_str().to_string());
    let content_node = document
        .select(&content_selector)
        .next()
        .or_else(|| document.select(&body_selector).next());
    let text = content_node
        .map(|node| {
            node.text()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();
    let links = document
        .select(&link_selector)
        .filter_map(|link| link.value().attr("href"))
        .filter_map(|href| url.join(href).ok())
        .map(normalize_web_url)
        .collect();
    let content = format!(
        "# {}\n\n来源网址: {}\n抓取时间: {}\n\n{}",
        title, url, fetched_at, text
    );

    (title, content, links)
}

async fn crawl_web_collection(
    entry_url: Url,
    fetched_at: &str,
) -> Result<(Vec<CrawledWebPage>, usize), String> {
    // reqwest 0.12 supports a bounded redirect policy; the crawler's own
    // URL scope check then prevents redirects or links from escaping the set.
    // Source: https://docs.rs/reqwest/0.12.28/reqwest/redirect/struct.Policy.html#method.limited
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| format!("无法初始化网页抓取器: {}", e))?;
    let mut queued_urls = HashSet::from([entry_url.as_str().to_string()]);
    let mut visited_urls = HashSet::new();
    let mut pending = VecDeque::from([(entry_url.clone(), 0usize)]);
    let mut pages = Vec::new();
    let mut skipped_pages = 0;

    while let Some((url, depth)) = pending.pop_front() {
        if pages.len() >= MAX_WEB_COLLECTION_PAGES {
            skipped_pages += pending.len();
            break;
        }

        let (final_url, body) = match fetch_web_document(&client, &url).await {
            Ok(page) => page,
            Err(_) => {
                skipped_pages += 1;
                continue;
            }
        };
        if !is_in_web_collection_scope(&entry_url, &final_url) {
            skipped_pages += 1;
            continue;
        }
        if !visited_urls.insert(final_url.as_str().to_string()) {
            continue;
        }

        let (title, content, links) = extract_web_page(&final_url, &body, fetched_at);
        if content.trim().is_empty() {
            skipped_pages += 1;
            continue;
        }
        pages.push(CrawledWebPage {
            url: final_url.as_str().to_string(),
            title,
            content,
        });

        if depth >= MAX_WEB_CRAWL_DEPTH {
            continue;
        }
        for candidate_url in links {
            if !is_in_web_collection_scope(&entry_url, &candidate_url) {
                continue;
            }
            let candidate_key = candidate_url.as_str().to_string();
            if queued_urls.insert(candidate_key) {
                pending.push_back((candidate_url, depth + 1));
            }
        }
    }

    if pages.is_empty() {
        return Err("未能从入口网址收录任何可用网页，请确认网址可访问且正文不是登录页".to_string());
    }
    Ok((pages, skipped_pages))
}

#[tauri::command]
pub async fn list_knowledge_projects(
    app_handle: AppHandle,
) -> Result<Vec<KnowledgeProject>, String> {
    let conn = get_connection(&app_handle)?;
    let mut statement = conn
        .prepare(
            "SELECT p.id, p.name, p.root_path, p.last_indexed_at, COUNT(e.id), p.created_at, p.updated_at
             FROM knowledge_projects p
             LEFT JOIN knowledge_entries e ON e.project_id = p.id
             GROUP BY p.id
             ORDER BY p.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = statement
        .query_map([], project_from_row)
        .map_err(|e| e.to_string())?;
    let projects = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(projects)
}

#[tauri::command]
pub async fn index_knowledge_project(
    app_handle: AppHandle,
    root_path: String,
    display_name: Option<String>,
) -> Result<KnowledgeIndexResult, String> {
    let canonical_root =
        fs::canonicalize(root_path.trim()).map_err(|e| format!("无法访问所选项目目录: {}", e))?;
    if !canonical_root.is_dir() {
        return Err("请选择一个项目文件夹，而不是文件".to_string());
    }

    let root_path = canonical_root.to_string_lossy().to_string();
    let fallback_name = canonical_root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("未命名项目")
        .to_string();
    let project_name = display_name
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or(fallback_name);

    let files = collect_indexable_files(&canonical_root)?;
    let mut conn = get_connection(&app_handle)?;
    let now = Utc::now().to_rfc3339();

    let existing_project_id = conn
        .query_row(
            "SELECT id FROM knowledge_projects WHERE root_path = ?1",
            [&root_path],
            |row| row.get::<_, String>(0),
        )
        .ok();
    let project_id = existing_project_id.unwrap_or_else(|| Uuid::new_v4().to_string());

    let transaction = conn.transaction().map_err(|e| e.to_string())?;
    transaction
        .execute(
            "INSERT INTO knowledge_projects (id, name, root_path, last_indexed_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4, ?4)
             ON CONFLICT(root_path) DO UPDATE SET name = excluded.name, last_indexed_at = excluded.last_indexed_at, updated_at = excluded.updated_at",
            params![project_id, project_name, root_path, now],
        )
        .map_err(|e| e.to_string())?;
    transaction
        .execute(
            "DELETE FROM knowledge_entries WHERE project_id = ?1 AND source_path IS NOT NULL",
            [&project_id],
        )
        .map_err(|e| e.to_string())?;

    let mut indexed_files = 0;
    let mut skipped_files = 0;
    for path in files {
        let content = match fs::read_to_string(&path) {
            Ok(content) if !content.trim().is_empty() => content,
            _ => {
                skipped_files += 1;
                continue;
            }
        };
        let Some((entry_type, source_language)) = indexable_extension(&path) else {
            skipped_files += 1;
            continue;
        };
        let source_path = path
            .strip_prefix(&canonical_root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");

        transaction
            .execute(
                "INSERT INTO knowledge_entries (id, project_id, title, content, entry_type, source_path, source_language, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
                params![
                    Uuid::new_v4().to_string(),
                    project_id,
                    source_title(&path, &content),
                    content,
                    entry_type,
                    source_path,
                    source_language,
                    now,
                ],
            )
            .map_err(|e| e.to_string())?;
        indexed_files += 1;
    }

    let curated_entries = if is_sanomni_project(&canonical_root) {
        seed_sanomni_curated_knowledge(&transaction, &project_id, &now)?
    } else {
        0
    };

    transaction.commit().map_err(|e| e.to_string())?;
    let project = get_project(&conn, &project_id)?;
    Ok(KnowledgeIndexResult {
        project,
        indexed_files,
        skipped_files,
        curated_entries,
    })
}

#[tauri::command]
pub async fn import_knowledge_web_collection(
    app_handle: AppHandle,
    project_id: String,
    collection_name: String,
    entry_url: String,
) -> Result<KnowledgeWebCollectionImportResult, String> {
    let collection_name = collection_name.trim().to_string();
    if collection_name.is_empty() {
        return Err("文档集名称不能为空".to_string());
    }
    if collection_name.chars().count() > 20 {
        return Err("文档集名称最多 20 个字符".to_string());
    }
    let entry_url = parse_web_collection_entry_url(&entry_url)?;
    let entry_url_text = entry_url.as_str().to_string();

    {
        let conn = get_connection(&app_handle)?;
        get_project(&conn, &project_id)?;
    }

    let now = Utc::now().to_rfc3339();
    let (pages, skipped_pages) = crawl_web_collection(entry_url, &now).await?;

    let mut conn = get_connection(&app_handle)?;
    get_project(&conn, &project_id)?;
    let existing_collection_id = conn
        .query_row(
            "SELECT id FROM knowledge_web_collections WHERE project_id = ?1 AND entry_url = ?2",
            params![project_id, entry_url_text],
            |row| row.get::<_, String>(0),
        )
        .ok();
    let collection_id = existing_collection_id.unwrap_or_else(|| Uuid::new_v4().to_string());

    let transaction = conn.transaction().map_err(|e| e.to_string())?;
    transaction
        .execute(
            "INSERT INTO knowledge_web_collections (id, project_id, name, entry_url, last_crawled_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?5)
             ON CONFLICT(project_id, entry_url) DO UPDATE SET
               name = excluded.name,
               last_crawled_at = excluded.last_crawled_at,
               updated_at = excluded.updated_at",
            params![collection_id, project_id, collection_name, entry_url_text, now],
        )
        .map_err(|e| e.to_string())?;
    transaction
        .execute(
            "DELETE FROM knowledge_entries WHERE project_id = ?1 AND source_collection_id = ?2",
            params![project_id, collection_id],
        )
        .map_err(|e| e.to_string())?;

    for page in &pages {
        transaction
            .execute(
                "INSERT INTO knowledge_entries (id, project_id, title, content, entry_type, source_path, source_url, source_collection_id, source_language, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, '网页', NULL, ?5, ?6, '网页文档', ?7, ?7)",
                params![
                    Uuid::new_v4().to_string(),
                    project_id,
                    page.title,
                    page.content,
                    page.url,
                    collection_id,
                    now,
                ],
            )
            .map_err(|e| e.to_string())?;
    }

    transaction.commit().map_err(|e| e.to_string())?;
    Ok(KnowledgeWebCollectionImportResult {
        collection_name,
        imported_pages: pages.len(),
        skipped_pages,
    })
}

#[tauri::command]
pub async fn search_knowledge(
    app_handle: AppHandle,
    project_id: Option<String>,
    query: String,
    entry_type: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<KnowledgeSearchResult>, String> {
    let conn = get_connection(&app_handle)?;
    let query = query.trim().to_string();
    let needle = format!("%{}%", query);
    let limit = limit.unwrap_or(30).clamp(1, 100);
    let mut statement = conn
        .prepare(
            "SELECT e.id, e.project_id, e.title, e.content, e.entry_type, e.source_path, e.source_url, e.source_collection_id, c.name, e.source_language, e.created_at, e.updated_at
             FROM knowledge_entries e
             LEFT JOIN knowledge_web_collections c ON c.id = e.source_collection_id
             WHERE (?1 IS NULL OR e.project_id = ?1)
               AND (?2 IS NULL OR e.entry_type = ?2)
               AND (?3 = '' OR e.title LIKE ?4 OR e.content LIKE ?4 OR e.source_path LIKE ?4 OR e.source_url LIKE ?4)
             ORDER BY CASE WHEN e.title LIKE ?4 THEN 0 ELSE 1 END, e.updated_at DESC
             LIMIT ?5",
        )
        .map_err(|e| e.to_string())?;

    let entries = statement
        .query_map(
            params![project_id, entry_type, query, needle, limit],
            entry_from_row,
        )
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(entries
        .into_iter()
        .map(|entry| {
            let (snippet, match_line) = source_excerpt(&entry.content, &query);
            KnowledgeSearchResult {
                entry,
                snippet,
                match_line,
            }
        })
        .collect())
}

#[tauri::command]
pub async fn get_knowledge_entry(
    app_handle: AppHandle,
    entry_id: String,
) -> Result<KnowledgeEntry, String> {
    let conn = get_connection(&app_handle)?;
    conn.query_row(
        "SELECT e.id, e.project_id, e.title, e.content, e.entry_type, e.source_path, e.source_url, e.source_collection_id, c.name, e.source_language, e.created_at, e.updated_at
         FROM knowledge_entries e
         LEFT JOIN knowledge_web_collections c ON c.id = e.source_collection_id
         WHERE e.id = ?1",
        [entry_id],
        entry_from_row,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_knowledge_entry(
    app_handle: AppHandle,
    project_id: String,
    title: String,
    content: String,
    entry_type: Option<String>,
) -> Result<KnowledgeEntry, String> {
    let title = title.trim();
    let content = content.trim();
    if title.is_empty() || content.is_empty() {
        return Err("标题和内容都不能为空".to_string());
    }

    let conn = get_connection(&app_handle)?;
    get_project(&conn, &project_id)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let entry_type = entry_type
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "手动笔记".to_string());

    conn.execute(
        "INSERT INTO knowledge_entries (id, project_id, title, content, entry_type, source_path, source_language, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, ?6, ?6)",
        params![id, project_id, title, content, entry_type, now],
    )
    .map_err(|e| e.to_string())?;

    get_knowledge_entry(app_handle, id).await
}
