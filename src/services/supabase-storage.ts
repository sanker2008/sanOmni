/**
 * Supabase Storage upload service for sanPrompt image publishing.
 *
 * Reads image files from the local filesystem via the secure FS API and
 * uploads them to a Supabase Storage bucket, returning public URLs.
 */

import { readFile } from "./secureFs";
import { supabaseStorageApi } from "./tauri";

/**
 * Infer a MIME content-type from a filename extension.
 */
function inferContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    avif: "image/avif",
  };
  return map[ext] || "application/octet-stream";
}

/**
 * Compresses an image using Canvas, converting it to WebP and resizing if needed.
 * Max dimension is 1920px.
 */
async function compressImageToWebP(fileBytes: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    try {
      const blob = new Blob([Uint8Array.from(fileBytes)]);
      const url = URL.createObjectURL(blob);
      const img = new Image();
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        
        let { width, height } = img;
        const maxDimension = 1920;
        
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        
        if (!ctx) {
          return reject(new Error("Failed to get 2d context for canvas"));
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          async (compressedBlob) => {
            if (!compressedBlob) {
              return reject(new Error("Canvas toBlob failed"));
            }
            const buffer = await compressedBlob.arrayBuffer();
            resolve(new Uint8Array(buffer));
          },
          "image/webp",
          0.85 // 85% quality
        );
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image for compression"));
      };
      
      img.src = url;
    } catch (err) {
      reject(err);
    }
  });
}

export interface UploadResult {
  /** The public URL that can be used in <Image> tags. */
  publicUrl: string;
  /** The path inside the bucket. */
  storagePath: string;
}

/**
 * Upload a single image file to Supabase Storage.
 *
 * @param absolutePath  Full local path to the image file.
 * @param groupId       The prompt-group ID, used as the storage folder.
 * @param filename      Desired filename inside the bucket folder.
 * @returns             The public URL of the uploaded image.
 */
export async function uploadPromptImage(
  absolutePath: string,
  groupId: string,
  filename: string,
): Promise<UploadResult> {
  const rawBytes = await readFile(absolutePath);
  
  // Compress to WebP
  let fileBytes: Uint8Array;
  let finalFilename = filename;
  
  try {
    fileBytes = await compressImageToWebP(rawBytes);
    // Change extension to .webp
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf(".")) || filename;
    finalFilename = `${nameWithoutExt}.webp`;
  } catch (err) {
    console.warn(`[supabase-storage] Failed to compress image ${filename}, falling back to original:`, err);
    fileBytes = rawBytes;
  }

  const storagePath = `${groupId}/${finalFilename}`;
  const contentType = inferContentType(finalFilename);
  let publicUrl: string;
  try {
    publicUrl = await supabaseStorageApi.uploadObject(storagePath, fileBytes, contentType);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`图片上传失败 (${filename}): ${message}`);
  }

  return { publicUrl, storagePath };
}

/**
 * Upload multiple images for a prompt group, returning a map from
 * local image ID to its new public URL.
 *
 * Images that already have a valid `remote_url` pointing to the
 * same Supabase bucket are skipped to avoid redundant uploads.
 */
export async function uploadPromptImages(
  images: Array<{
    id: string;
    filename: string;
    absolute_path: string;
    remote_url?: string;
  }>,
  groupId: string,
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();
  const config = await supabaseStorageApi.getConfig();
  const baseUrl = config.base_url;

  // If Supabase is not configured, skip upload silently
  if (!config.configured || !baseUrl) {
    console.info("[supabase-storage] Supabase not configured, skipping image upload.");
    return urlMap;
  }

  const uploadTasks = images.map(async (image) => {
    // Skip if already uploaded to our Supabase bucket
    if (
      image.remote_url &&
      image.remote_url.includes(baseUrl)
    ) {
      urlMap.set(image.id, image.remote_url);
      return;
    }

    // This will throw if upload fails, bubbling up and blocking publish, which is the desired secure behavior.
    const { publicUrl } = await uploadPromptImage(
      image.absolute_path,
      groupId,
      image.filename,
    );
    urlMap.set(image.id, publicUrl);
  });

  await Promise.all(uploadTasks);

  return urlMap;
}
