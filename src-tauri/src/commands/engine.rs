use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::fs::File;
use tokio::io::AsyncWriteExt;

#[derive(Clone, Serialize)]
pub struct DownloadProgress {
    pub progress: f64,
    pub status: String,
}

#[tauri::command]
pub async fn download_and_extract_engine(
    app_handle: AppHandle,
    url: String,
) -> Result<String, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let engine_dir = app_data_dir.join("engine");
    if !engine_dir.exists() {
        std::fs::create_dir_all(&engine_dir).map_err(|e| e.to_string())?;
    }

    let temp_zip_path = engine_dir.join("engine_temp.zip");

    // 1. Download the zip
    let client = Client::new();
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to download: {}", e))?;

    let total_size = res.content_length().unwrap_or(0);

    let mut file = File::create(&temp_zip_path)
        .await
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut stream = res.bytes_stream();

    let mut last_progress_report = 0.0;

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| format!("Error while reading stream: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Error while writing to file: {}", e))?;

        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let progress = (downloaded as f64 / total_size as f64) * 100.0;
            // Only emit every 1% to avoid overwhelming the frontend
            if progress - last_progress_report >= 1.0 || progress == 100.0 {
                last_progress_report = progress;
                let _ = app_handle.emit(
                    "engine-download-progress",
                    DownloadProgress {
                        progress,
                        status: "Downloading...".to_string(),
                    },
                );
            }
        }
    }

    // 2. Extract the zip
    let _ = app_handle.emit(
        "engine-download-progress",
        DownloadProgress {
            progress: 100.0,
            status: "Extracting...".to_string(),
        },
    );

    let file_bytes =
        std::fs::read(&temp_zip_path).map_err(|e| format!("Failed to read zip: {}", e))?;
    let cursor = std::io::Cursor::new(file_bytes);

    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| format!("Failed to parse zip: {}", e))?;
    archive.extract(&engine_dir)
        .map_err(|e| format!("Failed to extract zip: {}", e))?;

    // 3. Cleanup
    let _ = std::fs::remove_file(&temp_zip_path);

    let _ = app_handle.emit(
        "engine-download-progress",
        DownloadProgress {
            progress: 100.0,
            status: "Complete".to_string(),
        },
    );

    Ok(engine_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn ensure_pose_model(
    app_handle: AppHandle,
    file_name: String,
    url: String,
) -> Result<String, String> {
    if !is_safe_pose_model_file_name(&file_name) {
        return Err("Invalid model file name".to_string());
    }

    if !url.starts_with("https://github.com/sanker2008/sanOmni/releases/download/") {
        return Err("Invalid model download URL".to_string());
    }

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let models_dir = app_data_dir.join("pose-models");
    if !models_dir.exists() {
        std::fs::create_dir_all(&models_dir).map_err(|e| e.to_string())?;
    }

    let target_path = models_dir.join(&file_name);
    if target_path.exists() {
        return Ok(target_path.to_string_lossy().to_string());
    }

    let temp_path = models_dir.join(format!("{}.download", file_name));
    let client = Client::new();
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to download model: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Model download failed: HTTP {}", res.status()));
    }

    let mut file = File::create(&temp_path)
        .await
        .map_err(|e| format!("Failed to create model file: {}", e))?;

    let mut stream = res.bytes_stream();
    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| format!("Error while reading model stream: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Error while writing model file: {}", e))?;
    }

    file.flush()
        .await
        .map_err(|e| format!("Failed to flush model file: {}", e))?;

    tokio::fs::rename(&temp_path, &target_path)
        .await
        .map_err(|e| format!("Failed to finalize model file: {}", e))?;

    Ok(target_path.to_string_lossy().to_string())
}

fn is_safe_pose_model_file_name(file_name: &str) -> bool {
    let has_supported_extension = file_name.ends_with(".glb") || file_name.ends_with(".gltf");
    has_supported_extension
        && !file_name.contains('/')
        && !file_name.contains('\\')
        && !file_name.contains("..")
}
