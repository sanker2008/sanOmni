# IP 作品集功能设计文档

## 1. 系统架构

### 1.1 整体架构

作品集功能采用 Tauri 2.0 混合架构，遵循低耦合设计原则：

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
├─────────────────────────────────────────────────────────┤
│  WorksView  │  WorkDetailView  │  CharacterEditModal    │
│  WorkCard   │  CharacterCard   │  WorkEditModal         │
├─────────────────────────────────────────────────────────┤
│              Zustand Stores (State Management)           │
│         useWorksStore  │  useCharactersStore            │
├─────────────────────────────────────────────────────────┤
│              Services Layer (tauri.ts)                   │
│         API Wrappers for Tauri Commands                 │
├─────────────────────────────────────────────────────────┤
│                    IPC (Tauri)                          │
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│                  Backend (Rust)                         │
├─────────────────────────────────────────────────────────┤
│              Commands Layer                             │
│         works.rs  │  characters.rs                      │
├─────────────────────────────────────────────────────────┤
│              Database Layer                             │
│         database/mod.rs (SQLite Operations)             │
├─────────────────────────────────────────────────────────┤
│              Models Layer                               │
│         models/mod.rs (Data Structures)                 │
├─────────────────────────────────────────────────────────┤
│              File System                                │
│         {app_data_dir}/works/                           │
└─────────────────────────────────────────────────────────┘
```

### 1.2 模块依赖关系

```
作品集模块 (独立)
├── 读取 → IP 基本信息 (id, name, avatar_path)
└── 被读取 ← IP 详情页 (可选，通过配置开关)

核心 IP 模块 (表情包)
└── 独立运行，不依赖作品集
```

## 2. 数据库设计

### 2.1 表结构

#### works 表
```sql
CREATE TABLE IF NOT EXISTS works (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    work_type TEXT NOT NULL,
    description TEXT,
    release_date TEXT,
    producer TEXT,
    director_author TEXT,
    status TEXT,
    cover_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX idx_works_work_type ON works(work_type);
CREATE INDEX idx_works_status ON works(status);
CREATE INDEX idx_works_deleted_at ON works(deleted_at);
```

#### characters 表
```sql
CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    work_id TEXT NOT NULL,
    name TEXT NOT NULL,
    character_type TEXT,
    description TEXT,
    appearance_info TEXT,
    image_paths TEXT,
    ip_id TEXT,
    ip_relation_note TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
    FOREIGN KEY (ip_id) REFERENCES ip_assets(id) ON DELETE SET NULL
);

CREATE INDEX idx_characters_work_id ON characters(work_id);
CREATE INDEX idx_characters_ip_id ON characters(ip_id);
CREATE INDEX idx_characters_display_order ON characters(work_id, display_order);
CREATE INDEX idx_characters_deleted_at ON characters(deleted_at);
```

#### work_tags 表
```sql
CREATE TABLE IF NOT EXISTS work_tags (
    work_id TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (work_id, tag_id),
    FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX idx_work_tags_tag_id ON work_tags(tag_id);
```

### 2.2 数据迁移策略

在 `database/mod.rs` 的 `init_database` 函数中添加表创建逻辑：

```rust
pub fn init_database(app_handle: &AppHandle) -> Result<(), String> {
    let conn = get_connection(app_handle)?;
    
    // 现有表创建...
    
    // 作品集表创建
    conn.execute(/* works table */, [])
        .map_err(|e| e.to_string())?;
    conn.execute(/* characters table */, [])
        .map_err(|e| e.to_string())?;
    conn.execute(/* work_tags table */, [])
        .map_err(|e| e.to_string())?;
    
    Ok(())
}
```

## 3. 后端设计

### 3.1 数据模型 (models/mod.rs)

```rust
use serde::{Deserialize, Serialize};

// 作品类型枚举
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkType {
    TvSeries,
    Movie,
    Novel,
    Drama,
    Animation,
    Game,
    Comic,
    Other,
}

// 作品状态枚举
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkStatus {
    Planning,
    InProduction,
    Released,
    Completed,
    Cancelled,
}

// 角色类型枚举
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CharacterType {
    Protagonist,
    Supporting,
    Antagonist,
    Guest,
    Cameo,
    Other,
}

// 作品基础结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Work {
    pub id: String,
    pub name: String,
    pub work_type: String,
    pub description: Option<String>,
    pub release_date: Option<String>,
    pub producer: Option<String>,
    pub director_author: Option<String>,
    pub status: Option<String>,
    pub cover_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

// 作品完整信息（包含关联数据）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkWithRelations {
    #[serde(flatten)]
    pub work: Work,
    pub tags: Vec<Tag>,
    pub characters: Vec<CharacterWithRelations>,
    pub character_count: usize,
}

// 角色基础结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Character {
    pub id: String,
    pub work_id: String,
    pub name: String,
    pub character_type: Option<String>,
    pub description: Option<String>,
    pub appearance_info: Option<String>,
    pub image_paths: Option<String>, // JSON array
    pub ip_id: Option<String>,
    pub ip_relation_note: Option<String>,
    pub display_order: i32,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

// 角色完整信息（包含关联数据）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterWithRelations {
    #[serde(flatten)]
    pub character: Character,
    pub work_name: String,
    pub work_type: String,
    pub ip_name: Option<String>,
    pub ip_avatar_path: Option<String>,
}

// 筛选参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkFilters {
    pub search: Option<String>,
    pub work_type: Option<String>,
    pub status: Option<String>,
    pub tag_ids: Option<Vec<i32>>,
    pub sort_by: Option<String>, // created_at, updated_at, release_date, name
    pub sort_order: Option<String>, // asc, desc
}
```

### 3.2 作品管理命令 (commands/works.rs)

```rust
use tauri::AppHandle;
use uuid::Uuid;
use chrono::Utc;

// 创建作品
#[tauri::command]
pub async fn create_work(
    app_handle: AppHandle,
    name: String,
    work_type: String,
    description: Option<String>,
    release_date: Option<String>,
    producer: Option<String>,
    director_author: Option<String>,
    status: Option<String>,
) -> Result<Work, String> {
    let conn = get_connection(&app_handle)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    
    conn.execute(
        "INSERT INTO works (id, name, work_type, description, release_date, 
         producer, director_author, status, created_at, updated_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![id, name, work_type, description, release_date, 
                producer, director_author, status, now, now],
    ).map_err(|e| e.to_string())?;
    
    get_work_by_id(app_handle, id).await
}

// 获取作品列表（支持筛选）
#[tauri::command]
pub async fn get_works(
    app_handle: AppHandle,
    filters: Option<WorkFilters>,
) -> Result<Vec<WorkWithRelations>, String> {
    // 实现筛选逻辑
    // 构建动态 SQL 查询
    // 关联查询 tags 和 characters
}

// 获取单个作品
#[tauri::command]
pub async fn get_work_by_id(
    app_handle: AppHandle,
    id: String,
) -> Result<WorkWithRelations, String> {
    // 查询作品基本信息
    // 关联查询 tags
    // 关联查询 characters
}

// 更新作品
#[tauri::command]
pub async fn update_work(
    app_handle: AppHandle,
    id: String,
    name: Option<String>,
    work_type: Option<String>,
    description: Option<String>,
    // ... 其他字段
) -> Result<Work, String> {
    // 更新逻辑
    // 更新 updated_at
}

// 删除作品（软删除）
#[tauri::command]
pub async fn delete_work(
    app_handle: AppHandle,
    id: String,
) -> Result<(), String> {
    let conn = get_connection(&app_handle)?;
    let now = Utc::now().to_rfc3339();
    
    conn.execute(
        "UPDATE works SET deleted_at = ?1 WHERE id = ?2",
        params![now, id],
    ).map_err(|e| e.to_string())?;
    
    // 清理文件
    cleanup_work_files(&app_handle, &id)?;
    
    Ok(())
}
```

// 上传封面图片
#[tauri::command]
pub async fn upload_work_cover(
    app_handle: AppHandle,
    work_id: String,
    image_data: Vec<u8>,
    extension: String,
) -> Result<String, String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| e.to_string())?;
    let work_dir = app_data_dir.join("works").join(&work_id);
    std::fs::create_dir_all(&work_dir).map_err(|e| e.to_string())?;
    
    let cover_path = work_dir.join(format!("cover.{}", extension));
    std::fs::write(&cover_path, image_data).map_err(|e| e.to_string())?;
    
    let relative_path = format!("works/{}/cover.{}", work_id, extension);
    
    // 更新数据库
    let conn = get_connection(&app_handle)?;
    conn.execute(
        "UPDATE works SET cover_path = ?1, updated_at = ?2 WHERE id = ?3",
        params![relative_path, Utc::now().to_rfc3339(), work_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(relative_path)
}

// 作品标签管理
#[tauri::command]
pub async fn add_work_tag(
    app_handle: AppHandle,
    work_id: String,
    tag_id: i32,
) -> Result<(), String> {
    let conn = get_connection(&app_handle)?;
    conn.execute(
        "INSERT OR IGNORE INTO work_tags (work_id, tag_id) VALUES (?1, ?2)",
        params![work_id, tag_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn remove_work_tag(
    app_handle: AppHandle,
    work_id: String,
    tag_id: i32,
) -> Result<(), String> {
    let conn = get_connection(&app_handle)?;
    conn.execute(
        "DELETE FROM work_tags WHERE work_id = ?1 AND tag_id = ?2",
        params![work_id, tag_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
```

### 3.3 角色管理命令 (commands/characters.rs)

```rust
// 创建角色
#[tauri::command]
pub async fn create_character(
    app_handle: AppHandle,
    work_id: String,
    name: String,
    character_type: Option<String>,
    description: Option<String>,
    appearance_info: Option<String>,
    ip_id: Option<String>,
    ip_relation_note: Option<String>,
) -> Result<Character, String> {
    let conn = get_connection(&app_handle)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    
    // 获取当前最大 display_order
    let max_order: i32 = conn.query_row(
        "SELECT COALESCE(MAX(display_order), -1) FROM characters WHERE work_id = ?1",
        params![work_id],
        |row| row.get(0),
    ).unwrap_or(0);
    
    conn.execute(
        "INSERT INTO characters (id, work_id, name, character_type, description, 
         appearance_info, ip_id, ip_relation_note, display_order, created_at, updated_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![id, work_id, name, character_type, description, 
                appearance_info, ip_id, ip_relation_note, max_order + 1, now, now],
    ).map_err(|e| e.to_string())?;
    
    get_character_by_id(app_handle, id).await
}

// 获取角色列表
#[tauri::command]
pub async fn get_characters(
    app_handle: AppHandle,
    work_id: String,
) -> Result<Vec<CharacterWithRelations>, String> {
    // 查询角色并关联 IP 信息
}

// 更新角色
#[tauri::command]
pub async fn update_character(
    app_handle: AppHandle,
    id: String,
    name: Option<String>,
    character_type: Option<String>,
    // ... 其他字段
) -> Result<Character, String> {
    // 更新逻辑
}

// 删除角色
#[tauri::command]
pub async fn delete_character(
    app_handle: AppHandle,
    id: String,
) -> Result<(), String> {
    // 软删除
    // 清理图片文件
}

// 更新角色顺序
#[tauri::command]
pub async fn update_character_order(
    app_handle: AppHandle,
    character_ids: Vec<String>,
) -> Result<(), String> {
    let conn = get_connection(&app_handle)?;
    for (index, id) in character_ids.iter().enumerate() {
        conn.execute(
            "UPDATE characters SET display_order = ?1 WHERE id = ?2",
            params![index as i32, id],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

// 上传角色图片
#[tauri::command]
pub async fn upload_character_images(
    app_handle: AppHandle,
    character_id: String,
    work_id: String,
    images: Vec<(Vec<u8>, String)>, // (data, extension)
) -> Result<Vec<String>, String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| e.to_string())?;
    let char_dir = app_data_dir.join("works").join(&work_id)
        .join("characters");
    std::fs::create_dir_all(&char_dir).map_err(|e| e.to_string())?;
    
    let mut paths = Vec::new();
    for (index, (data, ext)) in images.iter().enumerate() {
        let filename = format!("{}_{}.{}", character_id, index, ext);
        let file_path = char_dir.join(&filename);
        std::fs::write(&file_path, data).map_err(|e| e.to_string())?;
        
        let relative_path = format!("works/{}/characters/{}", work_id, filename);
        paths.push(relative_path);
    }
    
    // 更新数据库
    let conn = get_connection(&app_handle)?;
    let paths_json = serde_json::to_string(&paths).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE characters SET image_paths = ?1, updated_at = ?2 WHERE id = ?3",
        params![paths_json, Utc::now().to_rfc3339(), character_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(paths)
}

// 获取 IP 的所有角色
#[tauri::command]
pub async fn get_ip_characters(
    app_handle: AppHandle,
    ip_id: String,
) -> Result<Vec<CharacterWithRelations>, String> {
    // 查询该 IP 关联的所有角色（跨作品）
}
```

### 3.4 命令注册 (lib.rs)

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // 现有命令...
            
            // 作品管理命令
            commands::works::create_work,
            commands::works::get_works,
            commands::works::get_work_by_id,
            commands::works::update_work,
            commands::works::delete_work,
            commands::works::upload_work_cover,
            commands::works::add_work_tag,
            commands::works::remove_work_tag,
            
            // 角色管理命令
            commands::characters::create_character,
            commands::characters::get_characters,
            commands::characters::get_character_by_id,
            commands::characters::update_character,
            commands::characters::delete_character,
            commands::characters::update_character_order,
            commands::characters::upload_character_images,
            commands::characters::get_ip_characters,
        ])
        .setup(|app| {
            database::init_database(&app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## 4. 前端设计

### 4.1 类型定义 (stores/index.ts)

```typescript
// 作品类型枚举
export type WorkType = 
  | 'tv_series' | 'movie' | 'novel' | 'drama' 
  | 'animation' | 'game' | 'comic' | 'other';

export type WorkStatus = 
  | 'planning' | 'in_production' | 'released' 
  | 'completed' | 'cancelled';

export type CharacterType = 
  | 'protagonist' | 'supporting' | 'antagonist' 
  | 'guest' | 'cameo' | 'other';

// 作品接口
export interface Work {
  id: string;
  name: string;
  work_type: WorkType;
  description?: string;
  release_date?: string;
  producer?: string;
  director_author?: string;
  status?: WorkStatus;
  cover_path?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface WorkWithRelations extends Work {
  tags: Tag[];
  characters: CharacterWithRelations[];
  character_count: number;
}

// 角色接口
export interface Character {
  id: string;
  work_id: string;
  name: string;
  character_type?: CharacterType;
  description?: string;
  appearance_info?: string;
  image_paths?: string[];
  ip_id?: string;
  ip_relation_note?: string;
  display_order: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface CharacterWithRelations extends Character {
  work_name: string;
  work_type: WorkType;
  ip_name?: string;
  ip_avatar_path?: string;
}

// 筛选参数
export interface WorkFilters {
  search?: string;
  work_type?: WorkType;
  status?: WorkStatus;
  tag_ids?: number[];
  sort_by?: 'created_at' | 'updated_at' | 'release_date' | 'name';
  sort_order?: 'asc' | 'desc';
}
```

### 4.2 Zustand Store (stores/index.ts)

```typescript
// Works Store
interface WorksStore {
  works: WorkWithRelations[];
  selectedWork: WorkWithRelations | null;
  filters: WorkFilters;
  loading: boolean;
  
  // Actions
  fetchWorks: () => Promise<void>;
  createWork: (work: Partial<Work>) => Promise<WorkWithRelations>;
  updateWork: (id: string, work: Partial<Work>) => Promise<WorkWithRelations>;
  deleteWork: (id: string) => Promise<void>;
  selectWork: (work: WorkWithRelations | null) => void;
  setFilters: (filters: Partial<WorkFilters>) => void;
  uploadCover: (workId: string, file: File) => Promise<string>;
  addTag: (workId: string, tagId: number) => Promise<void>;
  removeTag: (workId: string, tagId: number) => Promise<void>;
}

export const useWorksStore = create<WorksStore>((set, get) => ({
  works: [],
  selectedWork: null,
  filters: {},
  loading: false,
  
  fetchWorks: async () => {
    set({ loading: true });
    try {
      const works = await getWorks(get().filters);
      set({ works, loading: false });
    } catch (error) {
      console.error('Failed to fetch works:', error);
      set({ loading: false });
    }
  },
  
  createWork: async (work) => {
    const newWork = await createWork(work);
    set((state) => ({ works: [...state.works, newWork] }));
    return newWork;
  },
  
  updateWork: async (id, work) => {
    const updated = await updateWork(id, work);
    set((state) => ({
      works: state.works.map((w) => w.id === id ? updated : w),
      selectedWork: state.selectedWork?.id === id ? updated : state.selectedWork,
    }));
    return updated;
  },
  
  deleteWork: async (id) => {
    await deleteWork(id);
    set((state) => ({
      works: state.works.filter((w) => w.id !== id),
      selectedWork: state.selectedWork?.id === id ? null : state.selectedWork,
    }));
  },
  
  selectWork: (work) => set({ selectedWork: work }),
  
  setFilters: (filters) => {
    set((state) => ({ filters: { ...state.filters, ...filters } }));
    get().fetchWorks();
  },
  
  uploadCover: async (workId, file) => {
    const arrayBuffer = await file.arrayBuffer();
    const data = Array.from(new Uint8Array(arrayBuffer));
    const ext = file.name.split('.').pop() || 'jpg';
    return await uploadWorkCover(workId, data, ext);
  },
  
  addTag: async (workId, tagId) => {
    await addWorkTag(workId, tagId);
    await get().fetchWorks();
  },
  
  removeTag: async (workId, tagId) => {
    await removeWorkTag(workId, tagId);
    await get().fetchWorks();
  },
}));
```

// Characters Store
interface CharactersStore {
  characters: CharacterWithRelations[];
  loading: boolean;
  
  // Actions
  fetchCharacters: (workId: string) => Promise<void>;
  createCharacter: (character: Partial<Character>) => Promise<Character>;
  updateCharacter: (id: string, character: Partial<Character>) => Promise<Character>;
  deleteCharacter: (id: string) => Promise<void>;
  updateOrder: (characterIds: string[]) => Promise<void>;
  uploadImages: (characterId: string, workId: string, files: File[]) => Promise<string[]>;
}

export const useCharactersStore = create<CharactersStore>((set, get) => ({
  characters: [],
  loading: false,
  
  fetchCharacters: async (workId) => {
    set({ loading: true });
    try {
      const characters = await getCharacters(workId);
      set({ characters, loading: false });
    } catch (error) {
      console.error('Failed to fetch characters:', error);
      set({ loading: false });
    }
  },
  
  createCharacter: async (character) => {
    const newChar = await createCharacter(character);
    set((state) => ({ characters: [...state.characters, newChar] }));
    return newChar;
  },
  
  updateCharacter: async (id, character) => {
    const updated = await updateCharacter(id, character);
    set((state) => ({
      characters: state.characters.map((c) => c.id === id ? updated : c),
    }));
    return updated;
  },
  
  deleteCharacter: async (id) => {
    await deleteCharacter(id);
    set((state) => ({
      characters: state.characters.filter((c) => c.id !== id),
    }));
  },
  
  updateOrder: async (characterIds) => {
    await updateCharacterOrder(characterIds);
    await get().fetchCharacters(get().characters[0]?.work_id);
  },
  
  uploadImages: async (characterId, workId, files) => {
    const images = await Promise.all(
      files.map(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const data = Array.from(new Uint8Array(arrayBuffer));
        const ext = file.name.split('.').pop() || 'jpg';
        return [data, ext] as [number[], string];
      })
    );
    return await uploadCharacterImages(characterId, workId, images);
  },
}));
```

### 4.3 服务层 (services/tauri.ts)

```typescript
import { invoke } from '@tauri-apps/api/core';

// 作品管理 API
export async function createWork(work: Partial<Work>): Promise<WorkWithRelations> {
  return await invoke('create_work', { ...work });
}

export async function getWorks(filters?: WorkFilters): Promise<WorkWithRelations[]> {
  return await invoke('get_works', { filters });
}

export async function getWorkById(id: string): Promise<WorkWithRelations> {
  return await invoke('get_work_by_id', { id });
}

export async function updateWork(id: string, work: Partial<Work>): Promise<WorkWithRelations> {
  return await invoke('update_work', { id, ...work });
}

export async function deleteWork(id: string): Promise<void> {
  return await invoke('delete_work', { id });
}

export async function uploadWorkCover(
  workId: string, 
  imageData: number[], 
  extension: string
): Promise<string> {
  return await invoke('upload_work_cover', { workId, imageData, extension });
}

export async function addWorkTag(workId: string, tagId: number): Promise<void> {
  return await invoke('add_work_tag', { workId, tagId });
}

export async function removeWorkTag(workId: string, tagId: number): Promise<void> {
  return await invoke('remove_work_tag', { workId, tagId });
}

// 角色管理 API
export async function createCharacter(character: Partial<Character>): Promise<Character> {
  return await invoke('create_character', { ...character });
}

export async function getCharacters(workId: string): Promise<CharacterWithRelations[]> {
  return await invoke('get_characters', { workId });
}

export async function getCharacterById(id: string): Promise<CharacterWithRelations> {
  return await invoke('get_character_by_id', { id });
}

export async function updateCharacter(
  id: string, 
  character: Partial<Character>
): Promise<Character> {
  return await invoke('update_character', { id, ...character });
}

export async function deleteCharacter(id: string): Promise<void> {
  return await invoke('delete_character', { id });
}

export async function updateCharacterOrder(characterIds: string[]): Promise<void> {
  return await invoke('update_character_order', { characterIds });
}

export async function uploadCharacterImages(
  characterId: string,
  workId: string,
  images: [number[], string][]
): Promise<string[]> {
  return await invoke('upload_character_images', { characterId, workId, images });
}

export async function getIpCharacters(ipId: string): Promise<CharacterWithRelations[]> {
  return await invoke('get_ip_characters', { ipId });
}
```

### 4.4 组件设计

#### WorksView.tsx (作品列表视图)

```tsx
export function WorksView() {
  const { works, filters, loading, fetchWorks, setFilters } = useWorksStore();
  const [showEditModal, setShowEditModal] = useState(false);
  
  useEffect(() => {
    fetchWorks();
  }, []);
  
  return (
    <div className="flex flex-col h-full">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-4 p-4 border-b">
        <Input
          placeholder="搜索作品..."
          value={filters.search || ''}
          onChange={(e) => setFilters({ search: e.target.value })}
        />
        <Select
          value={filters.work_type}
          onValueChange={(value) => setFilters({ work_type: value })}
        >
          <SelectTrigger><SelectValue placeholder="作品类型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tv_series">电视剧</SelectItem>
            <SelectItem value="movie">电影</SelectItem>
            {/* ... 其他类型 */}
          </SelectContent>
        </Select>
        <Select
          value={filters.status}
          onValueChange={(value) => setFilters({ status: value })}
        >
          <SelectTrigger><SelectValue placeholder="状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="planning">筹备中</SelectItem>
            <SelectItem value="in_production">制作中</SelectItem>
            {/* ... 其他状态 */}
          </SelectContent>
        </Select>
        <Button onClick={() => setShowEditModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          新建作品
        </Button>
      </div>
      
      {/* 作品网格 */}
      <ScrollArea className="flex-1 p-4">
        {loading ? (
          <div className="grid grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-64" />)}
          </div>
        ) : works.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <FileText className="w-16 h-16 mb-4" />
            <p>暂无作品</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {works.map((work) => (
              <WorkCard key={work.id} work={work} />
            ))}
          </div>
        )}
      </ScrollArea>
      
      {showEditModal && (
        <WorkEditModal
          onClose={() => setShowEditModal(false)}
          onSave={() => {
            setShowEditModal(false);
            fetchWorks();
          }}
        />
      )}
    </div>
  );
}
```

#### WorkCard.tsx (作品卡片)

```tsx
interface WorkCardProps {
  work: WorkWithRelations;
}

export function WorkCard({ work }: WorkCardProps) {
  const navigate = useNavigate();
  const { deleteWork } = useWorksStore();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  const handleDelete = async () => {
    await deleteWork(work.id);
    toast({ title: '作品已删除' });
  };
  
  return (
    <Card className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow">
      <div onClick={() => navigate(`/works/${work.id}`)}>
        {/* 封面图片 */}
        <div className="aspect-video bg-muted relative">
          {work.cover_path ? (
            <img
              src={convertFileSrc(work.cover_path)}
              alt={work.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <FileText className="w-12 h-12 text-muted-foreground" />
            </div>
          )}
        </div>
        
        {/* 作品信息 */}
        <CardContent className="p-4">
          <h3 className="font-semibold truncate mb-2">{work.name}</h3>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary">{getWorkTypeLabel(work.work_type)}</Badge>
            {work.status && (
              <Badge variant="outline">{getWorkStatusLabel(work.status)}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {work.character_count} 个角色
          </p>
        </CardContent>
      </div>
      
      {/* 操作按钮 */}
      <CardFooter className="p-2 border-t flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/works/${work.id}/edit`);
          }}
        >
          <Edit className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setShowDeleteDialog(true);
          }}
        >
          <Trash className="w-4 h-4" />
        </Button>
      </CardFooter>
      
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDelete}
        title="删除作品"
        description={`确定要删除作品"${work.name}"吗？此操作将同时删除所有关联的角色。`}
      />
    </Card>
  );
}
```

#### WorkDetailView.tsx (作品详情视图)

```tsx
export function WorkDetailView() {
  const { id } = useParams();
  const { selectedWork, selectWork } = useWorksStore();
  const { characters, fetchCharacters } = useCharactersStore();
  const [showCharacterModal, setShowCharacterModal] = useState(false);
  
  useEffect(() => {
    if (id) {
      getWorkById(id).then(selectWork);
      fetchCharacters(id);
    }
  }, [id]);
  
  if (!selectedWork) return <div>加载中...</div>;
  
  return (
    <div className="flex h-full">
      {/* 左侧：作品信息 */}
      <div className="w-1/3 border-r p-6 overflow-y-auto">
        <div className="space-y-6">
          {/* 封面 */}
          <div className="aspect-video bg-muted rounded-lg overflow-hidden">
            {selectedWork.cover_path ? (
              <img
                src={convertFileSrc(selectedWork.cover_path)}
                alt={selectedWork.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <FileText className="w-16 h-16 text-muted-foreground" />
              </div>
            )}
          </div>
          
          {/* 基本信息 */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">作品名称</label>
              <p className="text-lg">{selectedWork.name}</p>
            </div>
            
            <div>
              <label className="text-sm font-medium">类型</label>
              <div className="mt-1">
                <Badge>{getWorkTypeLabel(selectedWork.work_type)}</Badge>
              </div>
            </div>
            
            {selectedWork.status && (
              <div>
                <label className="text-sm font-medium">状态</label>
                <div className="mt-1">
                  <Badge variant="outline">
                    {getWorkStatusLabel(selectedWork.status)}
                  </Badge>
                </div>
              </div>
            )}
            
            {selectedWork.description && (
              <div>
                <label className="text-sm font-medium">简介</label>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedWork.description}
                </p>
              </div>
            )}
            
            {/* 标签 */}
            <div>
              <label className="text-sm font-medium">标签</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {selectedWork.tags.map((tag) => (
                  <Badge key={tag.id} variant="secondary">{tag.name}</Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* 右侧：角色列表 */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">角色列表</h2>
          <Button onClick={() => setShowCharacterModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            添加角色
          </Button>
        </div>
        
        <ScrollArea className="flex-1 p-4">
          {characters.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Users className="w-16 h-16 mb-4" />
              <p>暂无角色</p>
            </div>
          ) : (
            <div className="space-y-4">
              {characters.map((character) => (
                <CharacterCard key={character.id} character={character} />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
      
      {showCharacterModal && (
        <CharacterEditModal
          workId={id!}
          onClose={() => setShowCharacterModal(false)}
          onSave={() => {
            setShowCharacterModal(false);
            fetchCharacters(id!);
          }}
        />
      )}
    </div>
  );
}
```

## 5. 文件存储结构

```
{app_data_dir}/
└── works/
    ├── {work_id_1}/
    │   ├── cover.jpg                    # 作品封面
    │   └── characters/
    │       ├── {char_id_1}_0.jpg       # 角色图片
    │       ├── {char_id_1}_1.jpg
    │       └── {char_id_2}_0.png
    ├── {work_id_2}/
    │   ├── cover.png
    │   └── characters/
    │       └── {char_id_3}_0.jpg
    └── ...
```

## 6. 路由设计

```typescript
// App.tsx
<Routes>
  {/* 现有路由... */}
  
  {/* 作品集路由 */}
  <Route path="/works" element={<WorksView />} />
  <Route path="/works/:id" element={<WorkDetailView />} />
</Routes>
```

## 7. 导航集成

在 IP 侧边栏 (IpSidebar.tsx) 中添加作品集导航项：

```tsx
<nav className="space-y-1">
  <NavItem to="/ip/inbox" icon={Inbox}>收件箱</NavItem>
  <NavItem to="/ip/archived" icon={Archive}>已归档</NavItem>
  <NavItem to="/works" icon={Film}>作品集</NavItem>  {/* 新增 */}
</nav>
```

## 8. 性能优化

### 8.1 图片懒加载

```tsx
// 使用 Intersection Observer 实现懒加载
const LazyImage = ({ src, alt }: { src: string; alt: string }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsLoaded(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    
    if (imgRef.current) {
      observer.observe(imgRef.current);
    }
    
    return () => observer.disconnect();
  }, []);
  
  return (
    <img
      ref={imgRef}
      src={isLoaded ? src : undefined}
      alt={alt}
      className="w-full h-full object-cover"
    />
  );
};
```

### 8.2 数据库查询优化

- 使用索引加速查询
- 分页加载（如果作品数量很大）
- 缓存常用查询结果

### 8.3 虚拟滚动（可选）

如果作品数量超过 100 个，考虑使用虚拟滚动：

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

// 在 WorksView 中使用虚拟滚动
const parentRef = useRef<HTMLDivElement>(null);
const virtualizer = useVirtualizer({
  count: works.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 300,
  overscan: 5,
});
```

## 9. 错误处理

### 9.1 后端错误处理

```rust
// 统一错误处理
pub fn handle_db_error(e: rusqlite::Error) -> String {
    match e {
        rusqlite::Error::QueryReturnedNoRows => "未找到记录".to_string(),
        rusqlite::Error::SqliteFailure(err, _) => {
            if err.code == rusqlite::ErrorCode::ConstraintViolation {
                "数据约束冲突".to_string()
            } else {
                format!("数据库错误: {}", err)
            }
        }
        _ => format!("操作失败: {}", e),
    }
}
```

### 9.2 前端错误处理

```typescript
// 在 Store 中统一处理错误
const handleError = (error: unknown, operation: string) => {
  console.error(`${operation} failed:`, error);
  toast({
    title: '操作失败',
    description: error instanceof Error ? error.message : '未知错误',
    variant: 'destructive',
  });
};

// 使用示例
try {
  await createWork(work);
  toast({ title: '作品创建成功' });
} catch (error) {
  handleError(error, '创建作品');
}
```

## 10. 测试策略

### 10.1 后端测试

```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_create_work() {
        // 测试作品创建
    }
    
    #[test]
    fn test_work_character_cascade_delete() {
        // 测试级联删除
    }
    
    #[test]
    fn test_ip_delete_set_null() {
        // 测试 IP 删除时角色保留
    }
}
```

### 10.2 前端测试

```typescript
// 使用 React Testing Library
describe('WorksView', () => {
  it('should display works list', async () => {
    render(<WorksView />);
    await waitFor(() => {
      expect(screen.getByText('作品1')).toBeInTheDocument();
    });
  });
  
  it('should filter works by type', async () => {
    render(<WorksView />);
    const typeSelect = screen.getByRole('combobox');
    fireEvent.change(typeSelect, { target: { value: 'movie' } });
    // 验证筛选结果
  });
});
```

### 10.3 集成测试场景

1. **完整工作流测试**
   - 创建作品 → 添加角色 → 关联 IP → 编辑 → 删除

2. **数据完整性测试**
   - 删除作品时角色被级联删除
   - 删除 IP 时角色保留但清除关联

3. **文件管理测试**
   - 上传图片 → 验证文件存在
   - 删除作品 → 验证文件被清理

## 11. 部署和迁移

### 11.1 数据库迁移

首次启动时自动创建表：

```rust
pub fn init_database(app_handle: &AppHandle) -> Result<(), String> {
    let conn = get_connection(app_handle)?;
    
    // 检查表是否存在
    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='works'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0) > 0;
    
    if !table_exists {
        // 创建表
        create_works_tables(&conn)?;
    }
    
    Ok(())
}
```

### 11.2 版本升级

如果需要修改表结构，使用迁移脚本：

```rust
pub fn migrate_database(conn: &Connection) -> Result<(), String> {
    let version = get_db_version(conn)?;
    
    if version < 2 {
        // 添加新字段
        conn.execute(
            "ALTER TABLE characters ADD COLUMN display_order INTEGER DEFAULT 0",
            [],
        ).map_err(|e| e.to_string())?;
        
        set_db_version(conn, 2)?;
    }
    
    Ok(())
}
```

## 12. 配置开关

在设置中添加作品集功能开关：

```typescript
// settings store
interface Settings {
  // ... 现有设置
  enableWorksCollection: boolean;
}

// 在 App.tsx 中根据设置显示/隐藏作品集路由
{settings.enableWorksCollection && (
  <>
    <Route path="/works" element={<WorksView />} />
    <Route path="/works/:id" element={<WorkDetailView />} />
  </>
)}
```

## 13. 未来扩展接口

为未来功能预留接口：

```typescript
// 导出作品数据
export async function exportWork(workId: string): Promise<string> {
  // 返回 JSON 格式的作品数据
}

// 导入作品数据
export async function importWork(data: string): Promise<WorkWithRelations> {
  // 从 JSON 导入作品
}

// 作品统计
export async function getWorkStats(): Promise<{
  totalWorks: number;
  worksByType: Record<WorkType, number>;
  totalCharacters: number;
  ipUsageCount: number;
}> {
  // 返回统计数据
}
```

## 14. 总结

本设计文档详细描述了 IP 作品集功能的技术实现方案，包括：

- **低耦合架构**：作品集功能独立，可以轻松拆分
- **完整的数据模型**：支持作品、角色、IP 关联
- **前后端分离**：清晰的 API 接口和状态管理
- **用户友好**：直观的界面和流畅的交互
- **可扩展性**：为未来功能预留空间

实现时应遵循以下原则：

1. **渐进式开发**：先实现核心功能（MVP），再添加增强功能
2. **测试驱动**：每个功能都应有相应的测试
3. **性能优先**：注意数据库查询和图片加载的性能
4. **用户体验**：提供及时的反馈和友好的错误提示
5. **代码质量**：保持代码整洁、可维护
