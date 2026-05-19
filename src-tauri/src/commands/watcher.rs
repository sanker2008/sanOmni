use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Runtime};

/// Folder watcher configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatcherConfig {
    pub path: String,
    pub recursive: bool,
    pub file_extensions: Vec<String>,
    pub debounce_ms: u64,
}

/// File event from watcher
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileWatchEvent {
    pub event_type: String,
    pub path: String,
    pub timestamp: String,
}

/// Active watcher info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatcherInfo {
    pub id: String,
    pub path: String,
    pub recursive: bool,
    pub is_active: bool,
    pub created_at: String,
}

/// Start watching a folder for new images
#[tauri::command]
pub async fn start_folder_watcher(
    _app: AppHandle<impl Runtime>,
    config: WatcherConfig,
) -> Result<WatcherInfo, String> {
    let watch_path = PathBuf::from(&config.path);
    
    if !watch_path.exists() {
        return Err(format!("Path does not exist: {}", config.path));
    }
    
    if !watch_path.is_dir() {
        return Err(format!("Path is not a directory: {}", config.path));
    }
    
    let watcher_id = generate_watcher_id(&config.path);
    let created_at = chrono::Utc::now().to_rfc3339();
    
    // Spawn watcher in background
    let path_clone = watch_path.clone();
    
    std::thread::spawn(move || {
        run_watcher(path_clone);
    });
    
    // Store watcher info in app state
    // Note: In a real implementation, you'd use Tauri's state management
    
    Ok(WatcherInfo {
        id: watcher_id,
        path: config.path,
        recursive: config.recursive,
        is_active: true,
        created_at,
    })
}

/// Run the file watcher
fn run_watcher(
    path: PathBuf,
) {
    let mut watcher: RecommendedWatcher = match Watcher::new(
        move |_res: Result<Event, notify::Error>| {
            // Handle file system events
            // In a full implementation, this would auto-import new images
        },
        Config::default()
    ) {
        Ok(w) => w,
        Err(e) => {
            eprintln!("Failed to create watcher: {}", e);
            return;
        }
    };
    
    // Start watching
    let mode = RecursiveMode::Recursive;
    if let Err(e) = watcher.watch(&path, mode) {
        eprintln!("Failed to start watching: {}", e);
        return;
    }
    
    println!("Started watching: {:?}", path);
    
    // Keep the watcher alive
    loop {
        std::thread::sleep(Duration::from_secs(1));
    }
}

/// Generate unique watcher ID
fn generate_watcher_id(path: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(path.as_bytes());
    hasher.update(chrono::Utc::now().timestamp().to_string().as_bytes());
    let result = hasher.finalize();
    hex::encode(&result[..8])
}

/// Stop watching a folder
#[tauri::command]
pub async fn stop_folder_watcher(watcher_id: String) -> Result<bool, String> {
    // In a real implementation, you'd look up the watcher by ID and stop it
    println!("Stopping watcher: {}", watcher_id);
    Ok(true)
}

/// Get all active watchers
#[tauri::command]
pub async fn get_active_watchers() -> Result<Vec<WatcherInfo>, String> {
    // In a real implementation, you'd return actual active watchers
    Ok(vec![])
}

/// Check if a file is an image based on extension
#[allow(dead_code)]
fn is_image_file(path: &PathBuf, extensions: &[String]) -> bool {
    if let Some(ext) = path.extension() {
        let ext_str = ext.to_string_lossy().to_lowercase();
        return extensions.iter().any(|e| e.to_lowercase() == ext_str);
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_watcher_id_generation() {
        let id1 = generate_watcher_id("/path/to/folder");
        let id2 = generate_watcher_id("/path/to/folder");
        // IDs should be different due to timestamp
        assert_ne!(id1, id2);
        assert_eq!(id1.len(), 16);
    }
    
    #[test]
    fn test_is_image_file() {
        let extensions = vec!["png".to_string(), "jpg".to_string(), "webp".to_string()];
        let png_path = PathBuf::from("image.png");
        let txt_path = PathBuf::from("file.txt");
        
        assert!(is_image_file(&png_path, &extensions));
        assert!(!is_image_file(&txt_path, &extensions));
    }
}
