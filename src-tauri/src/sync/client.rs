use serde::{Deserialize, Serialize};

pub const SYNC_PROTOCOL_VERSION: i64 = 1;
pub const SANIP_SYNC_DOMAIN: &str = "sanIP";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SyncChange {
    #[serde(default = "default_sync_domain")]
    pub domain: String,
    pub table: String,
    pub record_id: String,
    pub operation: String,
    pub data: Option<String>,
    pub changed_at: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PushRequest {
    #[serde(default = "default_sync_domain")]
    pub domain: String,
    pub protocol_version: i64,
    pub device_id: String,
    pub changes: Vec<SyncChange>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PushResponse {
    pub applied_count: usize,
    pub server_version: i64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PullResponse {
    pub changes: Vec<SyncChange>,
    pub latest_version: i64,
}

fn default_sync_domain() -> String {
    SANIP_SYNC_DOMAIN.to_string()
}

pub struct SyncClient {
    pub server_url: String,
    pub api_key: String,
    client: reqwest::Client,
}

impl SyncClient {
    pub fn new(server_url: String, api_key: String) -> Result<Self, String> {
        let server_url = validate_server_url(&server_url)?;
        let api_key = api_key.trim().to_string();
        if api_key.is_empty() {
            return Err("API Key 不能为空".to_string());
        }

        let client = reqwest::Client::builder()
            .no_proxy()
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .map_err(|e| format!("创建同步客户端失败: {}", e))?;

        Ok(Self {
            server_url,
            api_key,
            client,
        })
    }

    pub async fn test_connection(
        &self,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let start = std::time::Instant::now();
        let health_url = format!("{}/api/health", self.server_url);
        let reachable = match self.client.get(&health_url).send().await {
            Ok(resp) => resp.status().is_success(),
            Err(_) => false,
        };

        let mut authenticated = false;
        let mut db_stats = serde_json::Value::Null;
        if reachable {
            let auth_url = format!("{}/api/auth/test", self.server_url);
            if let Ok(resp) = self
                .client
                .get(&auth_url)
                .header("Authorization", format!("Bearer {}", self.api_key))
                .send()
                .await
            {
                if resp.status().is_success() {
                    authenticated = true;
                    if let Ok(json) = resp.json::<serde_json::Value>().await {
                        db_stats = json
                            .get("db_stats")
                            .cloned()
                            .unwrap_or(serde_json::Value::Null);
                    }
                }
            }
        }

        Ok(serde_json::json!({
            "reachable": reachable,
            "authenticated": authenticated,
            "latency_ms": start.elapsed().as_millis() as u64,
            "db_stats": db_stats
        }))
    }

    pub async fn push(
        &self,
        req: PushRequest,
    ) -> Result<PushResponse, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/api/sync/push", self.server_url);
        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&req)
            .send()
            .await?;

        if resp.status().is_success() {
            let data = resp.json::<PushResponse>().await?;
            Ok(data)
        } else {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            Err(format!("Push failed with status: {} {}", status, body).into())
        }
    }

    pub async fn pull(
        &self,
        since_version: i64,
    ) -> Result<PullResponse, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!(
            "{}/api/sync/pull?domain={}&since_version={}",
            self.server_url, SANIP_SYNC_DOMAIN, since_version
        );
        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await?;

        if resp.status().is_success() {
            let data = resp.json::<PullResponse>().await?;
            Ok(data)
        } else {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            Err(format!("Pull failed with status: {} {}", status, body).into())
        }
    }

    pub async fn check_files(
        &self,
        hashes: Vec<String>,
    ) -> Result<Vec<String>, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/api/files/check", self.server_url);
        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&serde_json::json!({ "hashes": hashes }))
            .send()
            .await?;

        if resp.status().is_success() {
            let data: serde_json::Value = resp.json().await?;
            let missing = data
                .get("missing_hashes")
                .and_then(|v| v.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            Ok(missing)
        } else {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            Err(format!("Check files failed: {} {}", status, body).into())
        }
    }

    pub async fn upload_file(
        &self,
        path: impl AsRef<std::path::Path>,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/api/files/upload", self.server_url);
        let path_ref = path.as_ref();
        let data = tokio::fs::read(path_ref).await?;
        let filename = path_ref
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("file");
        let part = reqwest::multipart::Part::bytes(data).file_name(filename.to_string());
        let form = reqwest::multipart::Form::new().part("file", part);

        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .multipart(form)
            .send()
            .await?;

        if resp.status().is_success() {
            let res: serde_json::Value = resp.json().await?;
            let hash = res
                .get("hash")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Ok(hash)
        } else {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            Err(format!("Upload failed: {} {}", status, body).into())
        }
    }

    pub async fn download_file(
        &self,
        hash: &str,
        target_path: impl AsRef<std::path::Path>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/api/files/download/{}", self.server_url, hash);
        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await?;

        if resp.status().is_success() {
            let bytes = resp.bytes().await?;
            let target = target_path.as_ref();
            let temp_path =
                target.with_extension(format!("{}.tmp", uuid::Uuid::new_v4().to_string()));
            tokio::fs::write(&temp_path, &bytes).await?;
            tokio::fs::rename(&temp_path, target).await?;
            Ok(())
        } else {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            Err(format!("Download failed: {} {}", status, body).into())
        }
    }

    pub async fn fetch_sync_history(
        &self,
        limit: i64,
        offset: i64,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!(
            "{}/api/sync/history?limit={}&offset={}",
            self.server_url, limit, offset
        );
        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await?;

        if resp.status().is_success() {
            let data: serde_json::Value = resp.json().await?;
            Ok(data)
        } else {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            Err(format!("Fetch history failed: {} {}", status, body).into())
        }
    }

    pub async fn fetch_snapshot(
        &self,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!(
            "{}/api/sync/snapshot?domain={}",
            self.server_url, SANIP_SYNC_DOMAIN
        );
        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await?;

        if resp.status().is_success() {
            let data: serde_json::Value = resp.json().await?;
            Ok(data)
        } else {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            Err(format!("Fetch snapshot failed: {} {}", status, body).into())
        }
    }
}

pub fn validate_server_url(server_url: &str) -> Result<String, String> {
    let trimmed = server_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("服务器 URL 不能为空".to_string());
    }

    let parsed = reqwest::Url::parse(trimmed)
        .map_err(|_| "服务器 URL 格式无效，请填写完整的 http:// 或 https:// 地址".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("服务器 URL 仅支持 http:// 或 https://".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("服务器 URL 不能包含用户名或密码".to_string());
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err("服务器 URL 不能包含查询参数或锚点".to_string());
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| "服务器 URL 缺少主机地址".to_string())?;
    if parsed.scheme() == "http" && !is_local_or_private_host(host) {
        return Err(
            "公网同步地址必须使用 HTTPS；HTTP 仅允许 localhost、回环地址或私网 IP".to_string(),
        );
    }

    Ok(trimmed.to_string())
}

fn is_local_or_private_host(host: &str) -> bool {
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }

    let host = host
        .strip_prefix('[')
        .and_then(|h| h.strip_suffix(']'))
        .unwrap_or(host);
    match host.parse::<std::net::IpAddr>() {
        Ok(std::net::IpAddr::V4(ip)) => ip.is_loopback() || ip.is_private(),
        Ok(std::net::IpAddr::V6(ip)) => ip.is_loopback() || ip.is_unique_local(),
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::validate_server_url;

    #[test]
    fn http_is_limited_to_local_and_private_addresses() {
        assert!(validate_server_url("http://127.0.0.1:3080").is_ok());
        assert!(validate_server_url("http://[::1]:3080").is_ok());
        assert!(validate_server_url("http://192.168.1.10:3080").is_ok());
        assert!(validate_server_url("http://8.8.8.8:3080").is_err());
        assert!(validate_server_url("http://sync.example.com").is_err());
    }

    #[test]
    fn https_allows_public_hosts_and_normalizes_trailing_slash() {
        assert_eq!(
            validate_server_url(" https://sync.example.com/ ").unwrap(),
            "https://sync.example.com"
        );
    }
}
