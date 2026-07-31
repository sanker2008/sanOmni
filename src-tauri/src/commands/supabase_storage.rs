use super::CommandResult;
use crate::commands::settings::get_sanprompt_supabase_storage_key;
use reqwest::{Client, Url};
use rusqlite::Connection;
use serde::Serialize;

const BUCKET: &str = "prompt-images";

#[derive(Serialize)]
pub struct SupabaseStorageConfig {
    pub configured: bool,
    pub base_url: Option<String>,
}

struct StorageCredentials {
    base_url: String,
    key: String,
}

fn normalise_base_url(raw_url: &str) -> Result<String, String> {
    let mut url = raw_url.trim().trim_end_matches('/').to_string();
    if let Some(without_rest) = url.strip_suffix("/rest/v1") {
        url = without_rest.trim_end_matches('/').to_string();
    }

    let parsed = Url::parse(&url).map_err(|error| format!("Supabase URL 无效: {}", error))?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err("Supabase URL 必须是完整的 http(s) 地址。".to_string());
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err("Supabase URL 不应包含查询参数或片段。".to_string());
    }
    if parsed.path() != "/" && !parsed.path().is_empty() {
        return Err(
            "Supabase URL 不应包含路径；请填写项目根地址，例如 https://xxxx.supabase.co。"
                .to_string(),
        );
    }

    Ok(url)
}

fn load_credentials(db_path: &str) -> Result<Option<StorageCredentials>, String> {
    let conn =
        Connection::open(db_path).map_err(|error| format!("Failed to open database: {}", error))?;
    let raw_url: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'sanPromptSupabaseUrl'",
            [],
            |row| row.get(0),
        )
        .ok();
    let key = get_sanprompt_supabase_storage_key(&conn)?;

    let Some(raw_url) = raw_url.filter(|url| !url.trim().is_empty()) else {
        return Ok(None);
    };
    let Some(key) = key.filter(|key| !key.trim().is_empty()) else {
        return Ok(None);
    };

    Ok(Some(StorageCredentials {
        base_url: normalise_base_url(&raw_url)?,
        key,
    }))
}

fn append_path_segment(url: &mut Url, segment: &str) -> Result<(), String> {
    url.path_segments_mut()
        .map_err(|_| "Supabase URL 不能作为 Storage 上传地址。".to_string())?
        .push(segment);
    Ok(())
}

fn object_url(base_url: &str, storage_path: &str, is_public: bool) -> Result<Url, String> {
    let mut url = Url::parse(base_url).map_err(|error| format!("Supabase URL 无效: {}", error))?;
    for segment in ["storage", "v1", "object"] {
        append_path_segment(&mut url, segment)?;
    }
    if is_public {
        append_path_segment(&mut url, "public")?;
    }
    append_path_segment(&mut url, BUCKET)?;
    for segment in storage_path.split('/') {
        if segment.is_empty() || matches!(segment, "." | "..") {
            return Err("图片存储路径无效。".to_string());
        }
        append_path_segment(&mut url, segment)?;
    }
    Ok(url)
}

fn response_summary(body: &str) -> String {
    let summary = body.trim();
    if summary.is_empty() {
        "无响应详情".to_string()
    } else {
        summary.chars().take(300).collect()
    }
}

fn network_error_summary(error: &reqwest::Error) -> String {
    let mut messages = vec![error.to_string()];
    let mut cause = std::error::Error::source(error);
    while let Some(error) = cause {
        messages.push(error.to_string());
        cause = error.source();
    }
    messages.join(": ")
}

#[tauri::command]
pub fn get_supabase_storage_config(db_path: String) -> CommandResult<SupabaseStorageConfig> {
    match load_credentials(&db_path) {
        Ok(Some(credentials)) => CommandResult::ok(SupabaseStorageConfig {
            configured: true,
            base_url: Some(credentials.base_url),
        }),
        Ok(None) => CommandResult::ok(SupabaseStorageConfig {
            configured: false,
            base_url: None,
        }),
        Err(error) => CommandResult::err(error),
    }
}

#[tauri::command]
pub async fn upload_supabase_storage_object(
    db_path: String,
    storage_path: String,
    file_bytes: Vec<u8>,
    content_type: String,
) -> CommandResult<String> {
    let credentials = match load_credentials(&db_path) {
        Ok(Some(credentials)) => credentials,
        Ok(None) => {
            return CommandResult::err(
                "Supabase Storage 未配置。请在设置 → sanPrompt 中填写 URL 和 Storage Key。"
                    .to_string(),
            )
        }
        Err(error) => return CommandResult::err(error),
    };

    let upload_url = match object_url(&credentials.base_url, &storage_path, false) {
        Ok(url) => url,
        Err(error) => return CommandResult::err(error),
    };
    let public_url = match object_url(&credentials.base_url, &storage_path, true) {
        Ok(url) => url.to_string(),
        Err(error) => return CommandResult::err(error),
    };

    let response = match Client::new()
        .put(upload_url)
        .header("apikey", &credentials.key)
        .bearer_auth(&credentials.key)
        .header("x-upsert", "true")
        .header("content-type", content_type)
        .body(file_bytes)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            return CommandResult::err(format!(
                "Supabase 图片上传请求失败: {}",
                network_error_summary(&error)
            ))
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return CommandResult::err(format!(
            "Supabase 图片上传失败 (HTTP {}): {}",
            status,
            response_summary(&body)
        ));
    }

    CommandResult::ok(public_url)
}

#[cfg(test)]
mod tests {
    use super::object_url;

    #[test]
    fn builds_encoded_upload_and_public_urls() {
        let upload_url = object_url(
            "https://project.supabase.co",
            "group-id/portrait with space.webp",
            false,
        )
        .expect("valid upload URL");
        let public_url = object_url(
            "https://project.supabase.co",
            "group-id/portrait with space.webp",
            true,
        )
        .expect("valid public URL");

        assert_eq!(
            upload_url.as_str(),
            "https://project.supabase.co/storage/v1/object/prompt-images/group-id/portrait%20with%20space.webp"
        );
        assert_eq!(
            public_url.as_str(),
            "https://project.supabase.co/storage/v1/object/public/prompt-images/group-id/portrait%20with%20space.webp"
        );
    }

    #[test]
    fn rejects_path_traversal_segments() {
        assert!(object_url(
            "https://project.supabase.co",
            "group-id/../image.webp",
            false
        )
        .is_err());
    }
}
