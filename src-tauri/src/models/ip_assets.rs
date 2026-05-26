use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpAsset {
    pub id: String,
    pub name: String,
    pub avatar_path: Option<String>,
    pub inspiration: Option<String>,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpCharacterSheet {
    pub id: String,
    pub ip_id: String,
    pub image_path: String,
    pub sheet_type: String,
    pub sort_order: i32,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpCreation {
    pub ip_id: String,
    pub image_path: String,
    pub creation_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpStickerPack {
    pub id: String,
    pub ip_id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpEmoji {
    pub id: String,
    pub ip_id: String,
    pub pack_id: Option<String>,
    pub image_path: String,
    pub trigger_word: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpStickerPackPlatform {
    pub id: String,
    pub pack_id: String,
    pub platform_name: String,
    pub pack_name_on_platform: Option<String>,
    pub emoji_size_spec: Option<String>,
    pub status: String,
    pub publish_url: Option<String>,
    pub downloads_count: i32,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpRelation {
    pub ip_a_id: String,
    pub ip_b_id: String,
    pub relation_type: String,
    pub description: Option<String>,
    pub created_at: String,
    pub ip_b_name: Option<String>,
    pub ip_b_avatar_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpAssetDetail {
    pub ip: IpAsset,
    pub character_sheets: Vec<IpCharacterSheet>,
    pub creations: Vec<IpCreation>,
    pub sticker_packs: Vec<IpStickerPack>,
    pub emojis: Vec<IpEmoji>,
    pub platforms: Vec<IpStickerPackPlatform>,
    pub relations: Vec<IpRelation>,
}
