use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SyncChange {
    pub table: String,
    pub record_id: String,
    pub operation: String,
    pub data: Option<String>,
    pub changed_at: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PushRequest {
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

pub struct SyncClient {
    pub server_url: String,
    pub api_key: String,
    client: reqwest::Client,
}

impl SyncClient {
    pub fn new(server_url: String, api_key: String) -> Self {
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

    pub async fn push(&self, req: PushRequest) -> Result<PushResponse, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/api/sync/push", self.server_url);
        let resp = self.client.post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&req)
            .send()
            .await?;
            
        if resp.status().is_success() {
            let data = resp.json::<PushResponse>().await?;
            Ok(data)
        } else {
            Err(format!("Push failed with status: {}", resp.status()).into())
        }
    }

    pub async fn pull(&self, since_version: i64) -> Result<PullResponse, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/api/sync/pull?since_version={}", self.server_url, since_version);
        let resp = self.client.get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await?;
            
        if resp.status().is_success() {
            let data = resp.json::<PullResponse>().await?;
            Ok(data)
        } else {
            Err(format!("Pull failed with status: {}", resp.status()).into())
        }
    }

    pub async fn check_files(&self, hashes: Vec<String>) -> Result<Vec<String>, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/api/files/check", self.server_url);
        let resp = self.client.post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&serde_json::json!({ "hashes": hashes }))
            .send()
            .await?;
            
        if resp.status().is_success() {
            let data: serde_json::Value = resp.json().await?;
            let missing = data.get("missing_hashes")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();
            Ok(missing)
        } else {
            Err(format!("Check files failed: {}", resp.status()).into())
        }
    }

    pub async fn upload_file(&self, path: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/api/files/upload", self.server_url);
        let data = tokio::fs::read(path).await?;
        let filename = std::path::Path::new(path).file_name().and_then(|s| s.to_str()).unwrap_or("file");
        let part = reqwest::multipart::Part::bytes(data).file_name(filename.to_string());
        let form = reqwest::multipart::Form::new().part("file", part);
        
        let resp = self.client.post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .multipart(form)
            .send()
            .await?;
            
        if resp.status().is_success() {
            let res: serde_json::Value = resp.json().await?;
            let hash = res.get("hash").and_then(|v| v.as_str()).unwrap_or("").to_string();
            Ok(hash)
        } else {
            Err(format!("Upload failed: {}", resp.status()).into())
        }
    }
    
    pub async fn download_file(&self, hash: &str, target_path: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/api/files/download/{}", self.server_url, hash);
        let resp = self.client.get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await?;
            
        if resp.status().is_success() {
            let bytes = resp.bytes().await?;
            tokio::fs::write(target_path, &bytes).await?;
            Ok(())
        } else {
            Err(format!("Download failed: {}", resp.status()).into())
        }
    }

    pub async fn fetch_sync_history(&self, limit: i64, offset: i64) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/api/sync/history?limit={}&offset={}", self.server_url, limit, offset);
        let resp = self.client.get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await?;
            
        if resp.status().is_success() {
            let data: serde_json::Value = resp.json().await?;
            Ok(data)
        } else {
            Err(format!("Fetch history failed: {}", resp.status()).into())
        }
    }
}
