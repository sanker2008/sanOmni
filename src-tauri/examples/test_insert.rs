use rusqlite::Connection;
use serde_json::Value;
use std::fs;

fn main() {
    let data = fs::read_to_string("out2.json").unwrap();
    let json: Value = serde_json::from_str(&data).unwrap();
    let conn = Connection::open("D:\\sanomnidata\\data\\database.sqlite").unwrap();

    let changes = json["changes"].as_array().unwrap();
    let mut success = 0;
    let mut failed = 0;

    for change in changes {
        let op = change["operation"].as_str().unwrap();
        let table = change["table"].as_str().unwrap();

        if (table == "ip_images") && (op == "INSERT" || op == "UPDATE") {
            let data_str = change["data"].as_str().unwrap();
            let json_data: Value = serde_json::from_str(data_str).unwrap();

            let id = json_data.get("id").and_then(|v| v.as_str()).unwrap_or_default();
            let filename = json_data.get("filename").and_then(|v| v.as_str()).unwrap_or_default();
            let original_filename: Option<String> = json_data.get("original_filename").and_then(|v| v.as_str()).map(String::from);
            let ip_id = json_data.get("ip_id").and_then(|v| v.as_str()).unwrap_or_default();
            let relative_path: Option<String> = json_data.get("relative_path").and_then(|v| v.as_str()).map(String::from);
            let absolute_path: Option<String> = json_data.get("absolute_path").and_then(|v| v.as_str()).map(String::from);
            let status = json_data.get("status").and_then(|v| v.as_str()).unwrap_or("inbox");
            let file_size: i64 = json_data.get("file_size").and_then(|v| v.as_i64()).unwrap_or(0);
            let width: i64 = json_data.get("width").and_then(|v| v.as_i64()).unwrap_or(0);
            let height: i64 = json_data.get("height").and_then(|v| v.as_i64()).unwrap_or(0);
            let file_hash: Option<String> = json_data.get("file_hash").and_then(|v| v.as_str()).map(String::from);
            let format: Option<String> = json_data.get("format").and_then(|v| v.as_str()).map(String::from);
            let has_watermark: i64 = json_data.get("has_watermark").and_then(|v| v.as_i64()).unwrap_or(0);
            let watermark_platform: Option<String> = json_data.get("watermark_platform").and_then(|v| v.as_str()).map(String::from);
            let watermark_detected: Option<String> = json_data.get("watermark_detected").and_then(|v| v.as_str()).map(String::from);
            let watermark_removed: Option<String> = json_data.get("watermark_removed").and_then(|v| v.as_str()).map(String::from);
            let created_at = json_data.get("created_at").and_then(|v| v.as_str()).unwrap_or_default();
            let imported_at: Option<String> = json_data.get("imported_at").and_then(|v| v.as_str()).map(String::from);
            let archived_at: Option<String> = json_data.get("archived_at").and_then(|v| v.as_str()).map(String::from);

            let res = conn.execute(
                "INSERT OR REPLACE INTO ip_images (id, filename, original_filename, ip_id, relative_path, absolute_path, status, file_size, width, height, file_hash, format, has_watermark, watermark_platform, watermark_detected, watermark_removed, created_at, imported_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                rusqlite::params![id, filename, original_filename, ip_id, relative_path, absolute_path, status, file_size, width, height, file_hash, format, has_watermark, watermark_platform, watermark_detected, watermark_removed, created_at, imported_at, archived_at],
            );
            
            match res {
                Ok(_) => success += 1,
                Err(e) => {
                    failed += 1;
                    if failed <= 5 {
                        println!("Error inserting {}: {:?}", id, e);
                    }
                }
            }
        }
    }
    println!("Success: {}, Failed: {}", success, failed);
}
