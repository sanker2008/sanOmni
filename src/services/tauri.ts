import { invoke } from "@tauri-apps/api/core";
import type { ImageWithRelations, Vendor, Model, Tag, PromptGroup, IpAsset, IpAssetDetail, IpStickerPack, IpStickerPackPlatform } from "@/stores";

// Types for API requests
interface ImportImageRequest {
  file_path: string;
  file_name: string;
  file_size: number;
  vendor_id?: string;
  model_ids: string[];
  primary_model_id?: string;
  tags: string[];
  image_type?: string;
}

interface UpdateImageRequest {
  image_id: string;
  model_ids: string[];
  primary_model_id?: string;
  tags: string[];
  prompt?: string;
  negative_prompt?: string;
  has_watermark?: boolean;
  watermark_platform?: string;
}

interface ArchiveRequest {
  image_ids: string[];
  naming_template?: string;
  image_type?: string;
}

interface ArchiveResult {
  success_count: number;
  skipped_count: number;
  failed_count: number;
  errors: string[];
}

interface CommandResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Helper to get database path
export async function getDbPath(): Promise<string> {
  const { appDataDir, join } = await import("@tauri-apps/api/path");
  const { exists, mkdir } = await import("@tauri-apps/plugin-fs");
  
  const appDir = await appDataDir();
  const dataDir = await join(appDir, "data");
  
  // Ensure data directory exists
  if (!(await exists(dataDir))) {
    await mkdir(dataDir, { recursive: true });
  }
  
  return await join(dataDir, "database.sqlite");
}

// ==================== Image API ====================

export const imageApi = {
  async import(request: ImportImageRequest): Promise<ImageWithRelations> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<ImageWithRelations>>("import_image", {
      dbPath,
      request,
    });
    if (!result.success || !result.data) {
      throw new Error(result.error || "Failed to import image");
    }
    return result.data;
  },

  async getInboxImages(): Promise<ImageWithRelations[]> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<ImageWithRelations[]>>("get_inbox_images", { dbPath });
    if (!result.success) throw new Error(result.error || "Failed to get inbox images");
    return result.data || [];
  },

  async getArchivedImages(): Promise<ImageWithRelations[]> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<ImageWithRelations[]>>("get_archived_images", { dbPath });
    if (!result.success) throw new Error(result.error || "Failed to get archived images");
    return result.data || [];
  },

  async getIpInboxImages(): Promise<ImageWithRelations[]> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<ImageWithRelations[]>>("get_ip_inbox_images", { dbPath });
    if (!result.success) throw new Error(result.error || "Failed to get IP inbox images");
    return result.data || [];
  },

  async getIpArchivedImages(): Promise<ImageWithRelations[]> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<ImageWithRelations[]>>("get_ip_archived_images", { dbPath });
    if (!result.success) throw new Error(result.error || "Failed to get IP archived images");
    return result.data || [];
  },

  async update(request: UpdateImageRequest): Promise<ImageWithRelations> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<ImageWithRelations>>("update_image", {
      dbPath,
      request,
    });
    if (!result.success || !result.data) {
      throw new Error(result.error || "Failed to update image");
    }
    return result.data;
  },

  async delete(imageId: string): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("delete_image", { dbPath, imageId });
    if (!result.success) throw new Error(result.error || "Failed to delete image");
    return result.data || false;
  },

  async archive(imageIds: string[], libraryPath: string, template?: string, image_type?: string): Promise<ArchiveResult> {
    const dbPath = await getDbPath();
    const request: ArchiveRequest = { image_ids: imageIds, naming_template: template, image_type };
    const result = await invoke<CommandResult<ArchiveResult>>("archive_images", {
      dbPath,
      libraryPath,
      request,
    });
    if (!result.success || !result.data) {
      throw new Error(result.error || "Failed to archive images");
    }
    return result.data;
  },

  async unarchive(imageIds: string[], inboxPath: string): Promise<ArchiveResult> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<ArchiveResult>>("unarchive_images", {
      dbPath,
      inboxPath,
      imageIds,
    });
    if (!result.success || !result.data) {
      throw new Error(result.error || "Failed to unarchive images");
    }
    return result.data;
  },

  async updateMissingFormats(): Promise<number> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<number>>("update_missing_formats", { dbPath });
    if (!result.success) throw new Error(result.error || "Failed to update formats");
    return result.data || 0;
  },
};

// ==================== Vendor API ====================

interface VendorWithModels {
  id: string;
  name: string;
  path: string;
  icon?: string;
  sort_order: number;
  is_active: boolean;
  models: Model[];
}

export const vendorApi = {
  async getAll(): Promise<VendorWithModels[]> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<VendorWithModels[]>>("get_vendors", { dbPath });
    if (!result.success) throw new Error(result.error || "Failed to get vendors");
    return result.data || [];
  },

  async add(name: string, path: string): Promise<Vendor> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<Vendor>>("add_vendor", { dbPath, name, path });
    if (!result.success || !result.data) throw new Error(result.error || "Failed to add vendor");
    return result.data;
  },

  async update(vendorId: string, name: string, path: string): Promise<Vendor> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<Vendor>>("update_vendor", { dbPath, vendorId, name, path });
    if (!result.success || !result.data) throw new Error(result.error || "Failed to update vendor");
    return result.data;
  },

  async delete(vendorId: string): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("delete_vendor", { dbPath, vendorId });
    if (!result.success) throw new Error(result.error || "Failed to delete vendor");
    return result.data || false;
  },

  async addModel(vendorId: string, name: string, path: string, description?: string): Promise<Model> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<Model>>("add_model", {
      dbPath, vendorId, name, path, description,
    });
    if (!result.success || !result.data) throw new Error(result.error || "Failed to add model");
    return result.data;
  },

  async updateModel(modelId: string, name: string, path: string, description?: string): Promise<Model> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<Model>>("update_model", {
      dbPath, modelId, name, path, description,
    });
    if (!result.success || !result.data) throw new Error(result.error || "Failed to update model");
    return result.data;
  },

  async deleteModel(modelId: string): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("delete_model", { dbPath, modelId });
    if (!result.success) throw new Error(result.error || "Failed to delete model");
    return result.data || false;
  },

  async checkModelUsage(modelId: string): Promise<number> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<number>>("check_model_usage", { dbPath, modelId });
    if (!result.success) throw new Error(result.error || "Failed to check model usage");
    return result.data || 0;
  },

  async deleteModelCascade(modelId: string, action: "delete_images" | "move_to_unknown" | "none"): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("delete_model_cascade", { dbPath, modelId, action });
    if (!result.success) throw new Error(result.error || "Failed to delete model cascade");
    return result.data || false;
  },
};

// ==================== Tag API ====================

export const tagApi = {
  async getAll(): Promise<Tag[]> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<Tag[]>>("get_tags", { dbPath });
    if (!result.success) throw new Error(result.error || "Failed to get tags");
    return result.data || [];
  },

  async add(name: string, nameEn?: string, color?: string): Promise<Tag> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<Tag>>("add_tag", {
      dbPath, name, nameEn, color,
    });
    if (!result.success || !result.data) throw new Error(result.error || "Failed to add tag");
    return result.data;
  },
};

// ==================== Prompt API ====================

interface PromptGroupWithImages {
  group: PromptGroup;
  images: Array<{
    id: string;
    filename: string;
    absolute_path: string;
    primary_model_id: string;
    model_name: string;
    vendor_name: string;
    width?: number;
    height?: number;
    created_at: string;
  }>;
}

export const promptApi = {
  async getAll(): Promise<PromptGroup[]> {
    const dbPath = await getDbPath();
    return invoke<PromptGroup[]>("get_prompt_groups", { dbPath });
  },

  async getOne(groupId: string): Promise<PromptGroupWithImages> {
    const dbPath = await getDbPath();
    return invoke<PromptGroupWithImages>("get_prompt_group_with_images", { dbPath, groupId });
  },

  async create(params: {
    prompt: string;
    negativePrompt?: string;
    name?: string;
    description?: string;
    templateSchema?: string;
    imageIds: string[];
  }): Promise<PromptGroup> {
    const dbPath = await getDbPath();
    return invoke<PromptGroup>("create_prompt_group", { 
      dbPath, 
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      name: params.name,
      description: params.description,
      templateSchema: params.templateSchema,
      imageIds: params.imageIds,
    });
  },

  async update(
    groupId: string,
    payload: { prompt?: string; negativePrompt?: string; name?: string; description?: string; templateSchema?: string }
  ): Promise<void> {
    const dbPath = await getDbPath();
    return invoke("update_prompt_group", { 
      dbPath, 
      groupId, 
      prompt: payload.prompt,
      negativePrompt: payload.negativePrompt,
      name: payload.name,
      description: payload.description,
      templateSchema: payload.templateSchema,
    });
  },

  async delete(groupId: string): Promise<void> {
    const dbPath = await getDbPath();
    return invoke("delete_prompt_group", { dbPath, groupId });
  },

  async addImages(groupId: string, imageIds: string[]): Promise<void> {
    const dbPath = await getDbPath();
    return invoke("add_images_to_prompt_group", { dbPath, groupId, imageIds });
  },

  async removeImages(groupId: string, imageIds: string[]): Promise<void> {
    const dbPath = await getDbPath();
    return invoke("remove_images_from_prompt_group", { dbPath, groupId, imageIds });
  },

  async getForImage(imageId: string): Promise<PromptGroup[]> {
    const dbPath = await getDbPath();
    return invoke<PromptGroup[]>("get_prompt_groups_for_image", { dbPath, imageId });
  },

  async setForImage(imageId: string, groupIds: string[]): Promise<void> {
    const dbPath = await getDbPath();
    return invoke("set_prompt_groups_for_image", { dbPath, imageId, groupIds });
  },
};

// ==================== Watermark API ====================

export interface WatermarkRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WatermarkDetectionResult {
  has_watermark: boolean;
  platform?: string;
  confidence: number;
  watermark_region?: WatermarkRegion;
  detection_method: string;
}

export const watermarkApi = {
  async detect(imagePath: string): Promise<WatermarkDetectionResult> {
    const result = await invoke<WatermarkDetectionResult>("detect_watermark", {
      imagePath,
    });
    return result;
  },

  async batchDetect(imagePaths: string[]): Promise<WatermarkDetectionResult[]> {
    const result = await invoke<WatermarkDetectionResult[]>("batch_detect_watermarks", {
      imagePaths,
    });
    return result;
  },

  async remove(
    imagePath: string,
    outputPath: string,
    region?: WatermarkRegion
  ): Promise<WatermarkRemovalResult> {
    const result = await invoke<WatermarkRemovalResult>("remove_watermark", {
      imagePath,
      outputPath,
      region,
    });
    return result;
  },

  async batchRemove(
    requests: WatermarkRemovalRequest[]
  ): Promise<WatermarkRemovalResult[]> {
    const result = await invoke<WatermarkRemovalResult[]>("batch_remove_watermarks", {
      requests,
    });
    return result;
  },
};

export interface WatermarkRemovalResult {
  success: boolean;
  output_path: string;
  method: string;
  processing_time_ms: number;
}

export interface WatermarkRemovalRequest {
  image_path: string;
  output_path: string;
  region?: WatermarkRegion;
}

// ==================== Gemini Watermark Removal API ====================

export interface GeminiWatermarkColor {
  r: number;
  g: number;
  b: number;
}

export interface GeminiWatermarkRemovalResult {
  success: boolean;
  output_path: string;
  method: string;
  processing_time_ms: number;
  watermark_detected: boolean;
  alpha_value: number;
}

export interface GeminiWatermarkRemovalRequest {
  image_path: string;
  output_path: string;
  watermark_color?: GeminiWatermarkColor;
  alpha?: number;
  region?: WatermarkRegion;
}

export const geminiWatermarkApi = {
  /**
   * 使用反向透明度混合算法移除 Gemini 水印
   * @param imagePath 输入图片路径
   * @param outputPath 输出图片路径
   * @param watermarkColor 水印颜色（可选，自动检测）
   * @param alpha 透明度值（可选，自动检测）
   * @param region 水印区域（可选，默认右下角）
   */
  async remove(
    imagePath: string,
    outputPath: string,
    watermarkColor?: GeminiWatermarkColor,
    alpha?: number,
    region?: WatermarkRegion
  ): Promise<GeminiWatermarkRemovalResult> {
    const result = await invoke<GeminiWatermarkRemovalResult>("remove_gemini_watermark", {
      imagePath,
      outputPath,
      watermarkColor,
      alpha,
      region,
    });
    return result;
  },

  /**
   * 自动检测并移除 Gemini 水印（一键操作）
   * @param imagePath 输入图片路径
   * @param outputPath 输出图片路径
   */
  async autoRemove(
    imagePath: string,
    outputPath: string
  ): Promise<GeminiWatermarkRemovalResult> {
    const result = await invoke<GeminiWatermarkRemovalResult>("auto_remove_gemini_watermark", {
      imagePath,
      outputPath,
    });
    return result;
  },

  /**
   * 批量移除 Gemini 水印
   * @param requests 批量请求列表
   */
  async batchRemove(
    requests: GeminiWatermarkRemovalRequest[]
  ): Promise<GeminiWatermarkRemovalResult[]> {
    const result = await invoke<GeminiWatermarkRemovalResult[]>("batch_remove_gemini_watermarks", {
      requests,
    });
    return result;
  },
};

// ==================== Watcher API ====================

export interface WatcherConfig {
  path: string;
  recursive: boolean;
  file_extensions: string[];
  debounce_ms: number;
}

export interface WatcherInfo {
  id: string;
  path: string;
  recursive: boolean;
  is_active: boolean;
  created_at: string;
}

export const watcherApi = {
  async start(config: WatcherConfig): Promise<WatcherInfo> {
    const result = await invoke<WatcherInfo>("start_folder_watcher", {
      config,
    });
    return result;
  },

  async stop(watcherId: string): Promise<boolean> {
    const result = await invoke<boolean>("stop_folder_watcher", {
      watcherId,
    });
    return result;
  },

  async getActive(): Promise<WatcherInfo[]> {
    const result = await invoke<WatcherInfo[]>("get_active_watchers");
    return result;
  },
};

// ==================== Classifier API ====================

export interface ClassificationResult {
  vendor_id?: string;
  model_id?: string;
  confidence: number;
  matched_pattern?: string;
}

export const classifyApi = {
  async classify(filename: string): Promise<ClassificationResult> {
    return invoke<ClassificationResult>("classify_image", { filename });
  },
};

// ==================== Scanner API ====================

export interface ScanResult {
  scanned_count: number;
  imported_count: number;
  skipped_count: number;
  renamed_count: number;
  failed_count: number;
  errors: string[];
}

export interface InboxCleanupResult {
  scanned_count: number;
  kept_count: number;
  removed_count: number;
  failed_count: number;
  errors: string[];
}

export const scannerApi = {
  async scanArchived(libraryPath: string, namingTemplate?: string): Promise<ScanResult> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<ScanResult>>("scan_archived_directory", {
      dbPath,
      libraryPath,
      namingTemplate,
    });
    if (!result.success || !result.data) {
      throw new Error(result.error || "扫描失败");
    }
    return result.data;
  },

  async cleanupInbox(inboxPath: string): Promise<InboxCleanupResult> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<InboxCleanupResult>>("cleanup_inbox_directory", {
      dbPath,
      inboxPath,
    });
    if (!result.success || !result.data) {
      throw new Error(result.error || "扫描失败");
    }
    return result.data;
  },

  async cleanupIpInbox(inboxPath: string): Promise<InboxCleanupResult> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<InboxCleanupResult>>("cleanup_ip_inbox_directory", {
      dbPath,
      inboxPath,
    });
    if (!result.success || !result.data) {
      throw new Error(result.error || "扫描失败");
    }
    return result.data;
  },

  async scanIpArchived(libraryPath: string, namingTemplate?: string): Promise<ScanResult> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<ScanResult>>("scan_ip_archived_directory", {
      dbPath,
      libraryPath,
      namingTemplate,
    });
    if (!result.success || !result.data) {
      throw new Error(result.error || "扫描失败");
    }
    return result.data;
  },
};

// ==================== Settings API ====================

export const settingsApi = {
  async getAll(): Promise<Record<string, string>> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<Record<string, string>>>("get_settings", { dbPath });
    if (!result.success) throw new Error(result.error || "Failed to get settings");
    return result.data || {};
  },

  async save(settings: Record<string, string>): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("save_settings", {
      dbPath,
      settings,
    });
    if (!result.success) throw new Error(result.error || "Failed to save settings");
    return result.data || false;
  },

  async resetDatabase(): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("reset_database", { dbPath });
    if (!result.success) throw new Error(result.error || "Failed to reset database");
    return result.data || false;
  },
};

// ==================== IP Asset API ====================

export const ipApi = {
  async getAll(): Promise<IpAsset[]> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<IpAsset[]>>("get_ip_assets", { dbPath });
    if (!result.success || !result.data) {
      throw new Error(result.error || "获取 IP 列表失败");
    }
    return result.data;
  },

  async getDetail(ipId: string): Promise<IpAssetDetail> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<IpAssetDetail>>("get_ip_asset_detail", { dbPath, ipId });
    if (!result.success || !result.data) {
      throw new Error(result.error || "获取 IP 详情失败");
    }
    return result.data;
  },

  async create(name: string, inspiration?: string, description?: string, avatarPath?: string): Promise<IpAsset> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<IpAsset>>("create_ip_asset", {
      dbPath,
      name,
      inspiration,
      description,
      avatarPath,
    });
    if (!result.success || !result.data) {
      throw new Error(result.error || "创建 IP 失败");
    }
    return result.data;
  },

  async update(ipId: string, name: string, inspiration?: string, description?: string, avatarPath?: string): Promise<IpAsset> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<IpAsset>>("update_ip_asset", {
      dbPath,
      ipId,
      name,
      inspiration,
      description,
      avatarPath,
    });
    if (!result.success || !result.data) {
      throw new Error(result.error || "更新 IP 失败");
    }
    return result.data;
  },

  async delete(ipId: string): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("delete_ip_asset", { dbPath, ipId });
    if (!result.success) {
      throw new Error(result.error || "删除 IP 失败");
    }
    return result.data || false;
  },

  async addCharacterSheets(ipId: string, imagePaths: string[], sheetType: string): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("add_ip_character_sheets", {
      dbPath,
      ipId,
      imagePaths,
      sheetType,
    });
    if (!result.success) {
      throw new Error(result.error || "添加三视图失败");
    }
    return result.data || false;
  },

  async removeCharacterSheets(ipId: string, imagePaths: string[]): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("remove_ip_character_sheets", {
      dbPath,
      ipId,
      imagePaths,
    });
    if (!result.success) {
      throw new Error(result.error || "移除三视图失败");
    }
    return result.data || false;
  },

  async addCreations(ipId: string, imagePaths: string[], creationNames: Array<string | null>): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("add_ip_creations", {
      dbPath,
      ipId,
      imagePaths,
      creationNames,
    });
    if (!result.success) {
      throw new Error(result.error || "添加创作关联失败");
    }
    return result.data || false;
  },

  async removeCreations(ipId: string, imagePaths: string[]): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("remove_ip_creations", {
      dbPath,
      ipId,
      imagePaths,
    });
    if (!result.success) {
      throw new Error(result.error || "移除创作关联失败");
    }
    return result.data || false;
  },

  async addRelation(ipAId: string, ipBId: string, relationType: string, description?: string): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("add_ip_relation", {
      dbPath,
      ipAId,
      ipBId,
      relationType,
      description,
    });
    if (!result.success) {
      throw new Error(result.error || "添加关系失败");
    }
    return result.data || false;
  },

  async removeRelation(ipAId: string, ipBId: string, relationType: string): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("remove_ip_relation", {
      dbPath,
      ipAId,
      ipBId,
      relationType,
    });
    if (!result.success) {
      throw new Error(result.error || "解除关系失败");
    }
    return result.data || false;
  },

  async createStickerPack(ipId: string, name: string, description?: string): Promise<IpStickerPack> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<IpStickerPack>>("create_ip_sticker_pack", {
      dbPath,
      ipId,
      name,
      description,
    });
    if (!result.success || !result.data) {
      throw new Error(result.error || "创建表情包套件失败");
    }
    return result.data;
  },

  async updateStickerPack(packId: string, name: string, description?: string): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("update_ip_sticker_pack", {
      dbPath,
      packId,
      name,
      description,
    });
    if (!result.success) {
      throw new Error(result.error || "修改表情包套件失败");
    }
    return result.data || false;
  },

  async deleteStickerPack(packId: string): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("delete_ip_sticker_pack", { dbPath, packId });
    if (!result.success) {
      throw new Error(result.error || "删除表情包套件失败");
    }
    return result.data || false;
  },

  async addStickerPackPlatform(
    packId: string,
    platformName: string,
    packNameOnPlatform?: string,
    emojiSizeSpec?: string,
    status: string = "Draft",
    publishUrl?: string
  ): Promise<IpStickerPackPlatform> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<IpStickerPackPlatform>>("add_ip_sticker_pack_platform", {
      dbPath,
      packId,
      platformName,
      packNameOnPlatform,
      emojiSizeSpec,
      status,
      publishUrl,
    });
    if (!result.success || !result.data) {
      throw new Error(result.error || "添加发布渠道失败");
    }
    return result.data;
  },

  async updateStickerPackPlatform(
    platformId: string,
    platformName: string,
    packNameOnPlatform?: string,
    emojiSizeSpec?: string,
    status: string = "Draft",
    publishUrl?: string,
    downloadsCount: number = 0
  ): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("update_ip_sticker_pack_platform", {
      dbPath,
      platformId,
      platformName,
      packNameOnPlatform,
      emojiSizeSpec,
      status,
      publishUrl,
      downloadsCount,
    });
    if (!result.success) {
      throw new Error(result.error || "更新发布渠道失败");
    }
    return result.data || false;
  },

  async deleteStickerPackPlatform(platformId: string): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("delete_ip_sticker_pack_platform", { dbPath, platformId });
    if (!result.success) {
      throw new Error(result.error || "删除发布渠道记录失败");
    }
    return result.data || false;
  },

  async addEmojis(ipId: string, packId: string | null, imagePaths: string[], triggerWords: Array<string | null>): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("add_ip_emojis", {
      dbPath,
      ipId,
      packId,
      imagePaths,
      triggerWords,
    });
    if (!result.success) {
      throw new Error(result.error || "添加表情图片失败");
    }
    return result.data || false;
  },

  async updateEmojiTriggerWord(emojiId: string, triggerWord?: string): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("update_ip_emoji_trigger_word", {
      dbPath,
      emojiId,
      triggerWord,
    });
    if (!result.success) {
      throw new Error(result.error || "更新表情快捷词失败");
    }
    return result.data || false;
  },

  async deleteEmojis(emojiIds: string[]): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("delete_ip_emojis", {
      dbPath,
      emojiIds,
    });
    if (!result.success) {
      throw new Error(result.error || "彻底删除表情图片失败");
    }
    return result.data || false;
  },

  async moveEmojisToPack(emojiIds: string[], packId: string | null): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("move_ip_emojis_to_pack", {
      dbPath,
      emojiIds,
      packId,
    });
    if (!result.success) {
      throw new Error(result.error || "移动表情套件失败");
    }
    return result.data || false;
  },

  async getCharactersForImage(imageId: string): Promise<IpAsset[]> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<IpAsset[]>>("get_ip_characters_for_image", { dbPath, imageId });
    if (!result.success || !result.data) {
      throw new Error(result.error || "获取图片关联 IP 失败");
    }
    return result.data;
  },

  async setCharactersForImage(imageId: string, ipIds: string[]): Promise<boolean> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<boolean>>("set_ip_characters_for_image", {
      dbPath,
      imageId,
      ipIds,
    });
    if (!result.success) {
      throw new Error(result.error || "设置图片关联 IP 失败");
    }
    return result.data || false;
  },
};

