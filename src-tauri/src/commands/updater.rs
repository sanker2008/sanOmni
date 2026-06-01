use serde::{Deserialize, Serialize};
use super::CommandResult;

#[derive(Serialize, Deserialize, Debug)]
pub struct UpdateInfo {
    pub has_update: bool,
    pub latest_version: String,
    pub current_version: String,
    pub download_url: String,
    pub release_notes: String,
    pub published_at: String,
}

#[derive(Deserialize, Debug)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    published_at: Option<String>,
}

const GITHUB_REPO: &str = "sanker2008/sanOmni";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[tauri::command]
pub async fn check_for_update() -> CommandResult<UpdateInfo> {
    let url = format!("https://api.github.com/repos/{}/releases/latest", GITHUB_REPO);
    
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("sanOmni-updater")
        .build() {
        Ok(c) => c,
        Err(_) => return CommandResult::ok(UpdateInfo {
            has_update: false,
            latest_version: String::new(),
            current_version: CURRENT_VERSION.to_string(),
            download_url: String::new(),
            release_notes: String::new(),
            published_at: String::new(),
        }),
    };
    
    let response = match client.get(&url).send().await {
        Ok(r) => r,
        Err(_) => return CommandResult::ok(UpdateInfo {
            has_update: false,
            latest_version: String::new(),
            current_version: CURRENT_VERSION.to_string(),
            download_url: String::new(),
            release_notes: String::new(),
            published_at: String::new(),
        }),
    };
    
    if !response.status().is_success() {
        // 404 means no releases yet, other errors also handled gracefully
        return CommandResult::ok(UpdateInfo {
            has_update: false,
            latest_version: String::new(),
            current_version: CURRENT_VERSION.to_string(),
            download_url: String::new(),
            release_notes: String::new(),
            published_at: String::new(),
        });
    }
    
    let release: GitHubRelease = match response.json().await {
        Ok(r) => r,
        Err(_) => return CommandResult::ok(UpdateInfo {
            has_update: false,
            latest_version: String::new(),
            current_version: CURRENT_VERSION.to_string(),
            download_url: String::new(),
            release_notes: String::new(),
            published_at: String::new(),
        }),
    };
    
    // Strip 'v' prefix if present
    let latest = release.tag_name.trim_start_matches('v').to_string();
    
    // Compare versions using semver
    let has_update = match (semver::Version::parse(&latest), semver::Version::parse(CURRENT_VERSION)) {
        (Ok(latest_ver), Ok(current_ver)) => latest_ver > current_ver,
        _ => false, // If parsing fails, assume no update
    };
    
    CommandResult::ok(UpdateInfo {
        has_update,
        latest_version: latest,
        current_version: CURRENT_VERSION.to_string(),
        download_url: release.html_url,
        release_notes: release.body.unwrap_or_default(),
        published_at: release.published_at.unwrap_or_default(),
    })
}

#[tauri::command]
pub fn get_current_version() -> CommandResult<String> {
    CommandResult::ok(CURRENT_VERSION.to_string())
}
