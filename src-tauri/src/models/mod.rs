use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vendor {
    pub id: String,
    pub name: String,
    pub path: String,
    pub icon: Option<String>,
    pub sort_order: i32,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Model {
    pub id: String,
    pub vendor_id: String,
    pub name: String,
    pub path: String,
    pub version: Option<String>,
    pub description: Option<String>,
    pub sort_order: i32,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

// Prompt Template Domain: Image with vendor/model metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Image {
    pub id: String,
    pub filename: String,
    pub original_filename: String,
    pub storage_vendor_id: String,
    pub storage_model_id: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub primary_model_id: String,
    pub status: String,
    pub prompt: Option<String>,
    pub negative_prompt: Option<String>,
    pub file_size: Option<i64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub file_hash: Option<String>,
    pub format: Option<String>,
    pub has_watermark: bool,
    pub watermark_platform: Option<String>,
    pub watermark_detected: bool,
    pub watermark_removed: bool,
    pub created_at: String,
    pub imported_at: String,
    pub archived_at: Option<String>,
}

// IP Character Domain: Image associated with IP character
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpImage {
    pub id: String,
    pub filename: String,
    pub original_filename: String,
    pub ip_id: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub status: String,
    pub file_size: Option<i64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub file_hash: Option<String>,
    pub format: Option<String>,
    pub has_watermark: bool,
    pub watermark_platform: Option<String>,
    pub watermark_detected: bool,
    pub watermark_removed: bool,
    pub created_at: String,
    pub imported_at: String,
    pub archived_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub name_en: Option<String>,
    pub color: Option<String>,
    pub parent_id: Option<String>,
    pub use_count: i32,
    pub is_builtin: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptGroup {
    pub id: String,
    pub prompt: String,
    pub negative_prompt: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub template_schema: Option<String>,
    pub image_count: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptGroupWithImages {
    pub group: PromptGroup,
    pub images: Vec<serde_json::Value>,
}

pub mod ip_assets;
pub use ip_assets::*;

// Works Collection Domain
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkWithRelations {
    #[serde(flatten)]
    pub work: Work,
    pub tags: Vec<Tag>,
    pub characters: Vec<CharacterWithRelations>,
    pub character_count: usize,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterWithRelations {
    #[serde(flatten)]
    pub character: Character,
    pub work_name: String,
    pub work_type: String,
    pub ip_name: Option<String>,
    pub ip_avatar_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkFilters {
    pub search: Option<String>,
    pub work_type: Option<String>,
    pub status: Option<String>,
    pub tag_ids: Option<Vec<String>>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}
