import sys
import re

content = open('src-tauri/src/commands/images.rs', 'r', encoding='utf-8').read()

target = '''    let primary_model_id = request.primary_model_id
        .or_else(|| request.model_ids.first().cloned())
        .unwrap_or_else(|| "unknown".to_string());

    // Verify the model exists, if not use "unknown"
    let model_exists: bool = conn.query_row(
        "SELECT COUNT(*) FROM models WHERE id = ?",
        [&primary_model_id],
        |row| {
            let count: i64 = row.get(0)?;
            Ok(count > 0)
        },
    ).unwrap_or(false);

    let primary_model_id = if model_exists {
        primary_model_id
    } else {
        eprintln!("Model '{}' not found, using 'unknown'", primary_model_id);
        "unknown".to_string()
    };'''

replacement = '''    let mut valid_model_ids = Vec::new();
    for model_id in &request.model_ids {
        let exists: bool = conn.query_row(
            "SELECT COUNT(*) FROM models WHERE id = ?",
            [model_id],
            |row| {
                let count: i64 = row.get(0)?;
                Ok(count > 0)
            },
        ).unwrap_or(false);
        if exists {
            valid_model_ids.push(model_id.clone());
        } else {
            eprintln!("Model '{}' not found, ignoring", model_id);
        }
    }

    let primary_model_id = request.primary_model_id
        .filter(|id| valid_model_ids.contains(id))
        .or_else(|| valid_model_ids.first().cloned())
        .unwrap_or_else(|| "unknown".to_string());'''

escaped_target = re.escape(target).replace(r'\n', r'\s+')
new_content = re.sub(escaped_target, replacement, content)
open('src-tauri/src/commands/images.rs', 'w', encoding='utf-8').write(new_content)
print("Replaced")
