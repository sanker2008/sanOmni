use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Folder watcher configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatcherConfig {
    pub path: String,
    pub recursive: bool,
    pub file_extensions: Vec<String>,
    pub debounce_ms: u64,
    pub watcher_type: Option<String>,
}

/// File event from watcher
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileWatchEvent {
    pub event_type: String,
    pub path: String,
    pub timestamp: String,
    pub watcher_type: String,
}

/// Active watcher info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatcherInfo {
    pub id: String,
    pub path: String,
    pub recursive: bool,
    pub is_active: bool,
    pub created_at: String,
    pub watcher_type: String,
}

/// Global watcher state
pub struct WatcherState {
    pub watchers: Arc<Mutex<HashMap<String, WatcherInfo>>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            watchers: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

/// Start watching a folder for new images
#[tauri::command]
pub async fn start_folder_watcher<R: Runtime>(
    app: AppHandle<R>,
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
    
    let watcher_info = WatcherInfo {
        id: watcher_id.clone(),
        path: config.path.clone(),
        recursive: config.recursive,
        is_active: true,
        created_at: created_at.clone(),
        watcher_type: config.watcher_type.clone().unwrap_or_else(|| "prompt".to_string()),
    };
    
    // Store watcher info
    let state = app.state::<WatcherState>();
    {
        let mut watchers = state.watchers.lock().unwrap();
        watchers.insert(watcher_id.clone(), watcher_info.clone());
    }
    
    // Spawn watcher in background
    let app_clone = app.clone();
    let extensions = config.file_extensions.clone();
    let debounce = config.debounce_ms;
    let w_type = config.watcher_type.unwrap_or_else(|| "prompt".to_string());
    
    std::thread::spawn(move || {
        if let Err(e) = run_watcher(watch_path, app_clone, extensions, debounce, w_type) {
            eprintln!("Watcher error: {}", e);
        }
    });
    
    Ok(watcher_info)
}

/// Run the file watcher
fn run_watcher<R: Runtime>(
    path: PathBuf,
    app: AppHandle<R>,
    extensions: Vec<String>,
    debounce_ms: u64,
    watcher_type: String,
) -> Result<(), String> {
    let app_clone = app.clone();
    let extensions_clone = extensions.clone();
    
    let mut watcher: RecommendedWatcher = Watcher::new(
        move |res: Result<Event, notify::Error>| {
            match res {
                Ok(event) => {
                    // Only handle create and rename events
                    match event.kind {
                        EventKind::Create(_) | EventKind::Modify(notify::event::ModifyKind::Name(_)) => {
                            for path in event.paths {
                                if path.is_file() && is_image_file(&path, &extensions_clone) {
                                    println!("Detected new image: {:?}", path);
                                    
                                    // Wait for debounce to ensure file is fully written
                                    std::thread::sleep(Duration::from_millis(debounce_ms));
                                    
                                    // Emit event to frontend
                                    let event_data = FileWatchEvent {
                                        event_type: "new_image".to_string(),
                                        path: path.to_string_lossy().to_string(),
                                        timestamp: chrono::Utc::now().to_rfc3339(),
                                        watcher_type: watcher_type.clone(),
                                    };
                                    
                                    let _ = app_clone.emit("file-watch-event", event_data);
                                }
                            }
                        }
                        _ => {}
                    }
                }
                Err(e) => eprintln!("Watch error: {:?}", e),
            }
        },
        Config::default()
    ).map_err(|e| format!("Failed to create watcher: {}", e))?;
    
    // Start watching
    let mode = if path.is_dir() {
        RecursiveMode::Recursive
    } else {
        RecursiveMode::NonRecursive
    };
    
    watcher.watch(&path, mode)
        .map_err(|e| format!("Failed to start watching: {}", e))?;
    
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
pub async fn stop_folder_watcher<R: Runtime>(
    app: AppHandle<R>,
    watcher_id: String,
) -> Result<bool, String> {
    let state = app.state::<WatcherState>();
    let mut watchers = state.watchers.lock().unwrap();
    
    if let Some(watcher_info) = watchers.get_mut(&watcher_id) {
        watcher_info.is_active = false;
        println!("Stopped watcher: {}", watcher_id);
        Ok(true)
    } else {
        Err(format!("Watcher not found: {}", watcher_id))
    }
}

/// Get all active watchers
#[tauri::command]
pub async fn get_active_watchers<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<WatcherInfo>, String> {
    let state = app.state::<WatcherState>();
    let watchers = state.watchers.lock().unwrap();
    
    let active: Vec<WatcherInfo> = watchers
        .values()
        .filter(|w| w.is_active)
        .cloned()
        .collect();
    
    Ok(active)
}

/// Check if a file is an image based on extension
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
