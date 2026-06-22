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
    pub fn new(server_url: String, api_key: String) -> Self {
        let server_url = server_url.trim().trim_end_matches('/').to_string();
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            server_url,
            api_key,
            client,
        }
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
