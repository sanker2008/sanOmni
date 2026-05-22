import sys
import re

content = open('src-tauri/src/commands/images.rs', 'r', encoding='utf-8').read()

target = '''    for model_id in &request.model_ids {
        let is_primary = model_id == &primary_model_id;
        let _ = conn.execute(
            "INSERT INTO image_model_relations (image_id, model_id, is_primary) VALUES (?, ?, ?)",
            (&image_id, model_id, is_primary as i32),
        );
    }
    
    // If no model_ids provided, insert at least the primary model relation
    if request.model_ids.is_empty() {
        let _ = conn.execute(
            "INSERT INTO image_model_relations (image_id, model_id, is_primary) VALUES (?, ?, ?)",
            (&image_id, &primary_model_id, 1),
        );
    }'''

replacement = '''    for model_id in &valid_model_ids {
        let is_primary = model_id == &primary_model_id;
        let _ = conn.execute(
            "INSERT INTO image_model_relations (image_id, model_id, is_primary) VALUES (?, ?, ?)",
            (&image_id, model_id, is_primary as i32),
        );
    }
    
    // If no valid model_ids provided, insert at least the primary model relation
    if valid_model_ids.is_empty() {
        let _ = conn.execute(
            "INSERT INTO image_model_relations (image_id, model_id, is_primary) VALUES (?, ?, ?)",
            (&image_id, &primary_model_id, 1),
        );
    }'''

escaped_target = re.escape(target).replace(r'\n', r'\s+')
new_content = re.sub(escaped_target, replacement, content)
open('src-tauri/src/commands/images.rs', 'w', encoding='utf-8').write(new_content)
print("Replaced 2")
