const fs = require('fs');
const path = require('path');

const files = [
  'src-tauri/src/commands/works.rs',
  'src-tauri/src/commands/characters.rs'
];

for (const rel of files) {
  const file = path.join('/Users/san/dev/sanMediaBox', rel);
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');

  // Replace `let app_data_dir = app_handle.path().app_data_dir()...`
  content = content.replace(/let\s+app_data_dir\s*=\s*app_handle\s*\n\s*\.path\(\)\s*\n\s*\.app_data_dir\(\)\s*\n\s*\.map_err\(\|e\|\s*e\.to_string\(\)\)\?;/g, 
    `let base_app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;\n    let app_data_dir = crate::commands::get_app_root_from_handle(&app_handle, &base_app_data_dir);`);
  
  content = content.replace(/let\s+app_data_dir\s*=\s*app_handle\s*\n\s*\.path\(\)\s*\n\s*\.app_data_dir\(\)\s*\n\s*\.ok_or_else\(\|\|\s*"Failed to get app data directory"\.to_string\(\)\)\?;/g, 
    `let base_app_data_dir = app_handle.path().app_data_dir().ok_or_else(|| "Failed to get app data directory".to_string())?;\n    let app_data_dir = crate::commands::get_app_root_from_handle(&app_handle, &base_app_data_dir);`);
  
  // We MUST restore the original behavior inside `get_connection` so that it uses the actual AppData dir for SQLite.
  content = content.replace(/fn\s+get_connection\(app_handle:\s*&AppHandle\)\s*->\s*Result<Connection,\s*String>\s*\{\s*\n\s*let\s+base_app_data_dir\s*=\s*app_handle\.path\(\)\.app_data_dir\(\)\.map_err\(\|e\|\s*e\.to_string\(\)\)\?;\s*\n\s*let\s+app_data_dir\s*=\s*crate::commands::get_app_root_from_handle\(&app_handle,\s*&base_app_data_dir\);/g,
    `fn get_connection(app_handle: &AppHandle) -> Result<Connection, String> {\n    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;`);
  
  content = content.replace(/fn\s+get_connection\(app_handle:\s*&AppHandle\)\s*->\s*Result<Connection,\s*String>\s*\{\s*\n\s*let\s+base_app_data_dir\s*=\s*app_handle\.path\(\)\.app_data_dir\(\)\.ok_or_else\(\|\|\s*"Failed to get app data directory"\.to_string\(\)\)\?;\s*\n\s*let\s+app_data_dir\s*=\s*crate::commands::get_app_root_from_handle\(&app_handle,\s*&base_app_data_dir\);/g,
    `fn get_connection(app_handle: &AppHandle) -> Result<Connection, String> {\n    let app_data_dir = app_handle.path().app_data_dir().ok_or_else(|| "Failed to get app data directory".to_string())?;`);

  fs.writeFileSync(file, content, 'utf8');
}
console.log('Fixed works.rs and characters.rs correctly');
