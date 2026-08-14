/**
 * mediaUtils.ts — Utilities for handling image and video media extensions & file types.
 */

export const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v", "avi", "mkv"];
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "svg"];
export const ALL_MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS];

/**
 * Checks if a given file path or URL represents a video file.
 */
export function isVideoFile(filePath?: string | null): boolean {
  if (!filePath) return false;
  // Remove query parameters or hash if any
  const cleanPath = filePath.split("?")[0].split("#")[0];
  const ext = cleanPath.split(".").pop()?.toLowerCase() || "";
  return VIDEO_EXTENSIONS.includes(ext);
}
