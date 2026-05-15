import { invoke } from "@tauri-apps/api/core";
import type { ImageWithRelations, Vendor, Model, Tag } from "@/stores";

// Types for API requests
interface ImportImageRequest {
  file_path: string;
  file_name: string;
  file_size: number;
  vendor_id?: string;
  model_ids: string[];
  primary_model_id?: string;
  prompt?: string;
  tags: string[];
}

interface UpdateImageRequest {
  image_id: string;
  prompt?: string;
  model_ids: string[];
  primary_model_id?: string;
  tags: string[];
}

interface ArchiveRequest {
  image_ids: string[];
  naming_template?: string;
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
async function getDbPath(): Promise<string> {
  const { appDataDir } = await import("@tauri-apps/api/path");
  const appDir = await appDataDir();
  return `${appDir}data/database.sqlite`;
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

  async archive(imageIds: string[], libraryPath: string, template?: string): Promise<ArchiveResult> {
    const dbPath = await getDbPath();
    const request: ArchiveRequest = { image_ids: imageIds, naming_template: template };
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

  async addModel(vendorId: string, name: string, path: string, description?: string): Promise<Model> {
    const dbPath = await getDbPath();
    const result = await invoke<CommandResult<Model>>("add_model", {
      dbPath, vendorId, name, path, description,
    });
    if (!result.success || !result.data) throw new Error(result.error || "Failed to add model");
    return result.data;
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
};
