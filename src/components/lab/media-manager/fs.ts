import { getLabsRoot, openPath, revealFileInFolder } from "@/lib/pathUtils";
import { authorizeFsPaths, copyFile, exists, readDir, readFile, remove, stat } from "@/services/secureFs";
import { join } from "@tauri-apps/api/path";

export type MediaType = "image" | "video" | "svg" | "other";
export type MediaCategory = "exports" | "temp" | "other";

export interface LabToolInfo {
  id: string;
  name: string;
  folderNames: string[];
  color: string;
}

export const LAB_TOOLS_MAPPING: LabToolInfo[] = [
  {
    id: "ai-image-editor",
    name: "AI P图",
    folderNames: ["ai_image_editor", "ai-image-editor"],
    color: "#ec4899", // pink
  },
  {
    id: "gemini-watermark-lab",
    name: "Gemini 水印高级修复",
    folderNames: ["gemini_watermark_lab", "gemini-watermark-lab"],
    color: "#3b82f6", // blue
  },
  {
    id: "gemini-video-watermark",
    name: "Gemini 视频水印修复",
    folderNames: ["gemini_video_watermark", "gemini-video-watermark", "gemini_video"],
    color: "#8b5cf6", // purple
  },
  {
    id: "gif-decomposer",
    name: "动图拆帧",
    folderNames: ["gif_decomposer", "gif-decomposer"],
    color: "#f59e0b", // amber
  },
  {
    id: "pro-background-removal",
    name: "高级抠图 (Pro)",
    folderNames: ["bg_removal", "pro-background-removal", "bg-removal"],
    color: "#10b981", // emerald
  },
  {
    id: "png-to-svg",
    name: "PNG 转 SVG",
    folderNames: ["png_to_svg", "png-to-svg"],
    color: "#06b6d4", // cyan
  },
  {
    id: "product-image-maker",
    name: "产品图制作",
    folderNames: ["product_image_maker", "product-image-maker"],
    color: "#f97316", // orange
  },
  {
    id: "image-slicer",
    name: "图片切割",
    folderNames: ["image_slicer", "image-slicer"],
    color: "#6366f1", // indigo
  },
  {
    id: "image-compressor",
    name: "图片压缩",
    folderNames: ["image_compressor", "image-compressor"],
    color: "#14b8a6", // teal
  },
  {
    id: "pose-studio",
    name: "3D姿态参考",
    folderNames: ["pose_studio", "pose-studio"],
    color: "#84cc16", // lime
  },
  {
    id: "thought-canvas",
    name: "灵感画布",
    folderNames: ["thought_canvas", "thought-canvas"],
    color: "#eab308", // yellow
  },
];

export interface MediaEntry {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  toolId: string;
  toolName: string;
  category: MediaCategory;
  mediaType: MediaType;
  size: number;
  modifiedAt: number;
  ext: string;
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "apng", "bmp"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "avi", "mkv"]);
const SVG_EXTENSIONS = new Set(["svg"]);

export function getMediaType(ext: string): MediaType {
  const lower = ext.toLowerCase();
  if (SVG_EXTENSIONS.has(lower)) return "svg";
  if (IMAGE_EXTENSIONS.has(lower)) return "image";
  if (VIDEO_EXTENSIONS.has(lower)) return "video";
  return "other";
}

export function detectToolAndCategory(relativePath: string): {
  toolId: string;
  toolName: string;
  category: MediaCategory;
} {
  const parts = relativePath.split(/[/\\]/).filter(Boolean);
  if (parts.length === 0) {
    return { toolId: "other", toolName: "其他文件", category: "other" };
  }

  const firstDir = parts[0].toLowerCase();
  let matchedTool = LAB_TOOLS_MAPPING.find((tool) =>
    tool.folderNames.some((folder) => folder.toLowerCase() === firstDir)
  );

  let category: MediaCategory = "other";
  const lowerRel = relativePath.toLowerCase();

  if (lowerRel.includes("export") || lowerRel.includes("exports")) {
    category = "exports";
  } else if (lowerRel.includes("temp") || lowerRel.includes("cache")) {
    category = "temp";
  }

  if (!matchedTool && parts.length > 1) {
    const secondDir = parts[1].toLowerCase();
    matchedTool = LAB_TOOLS_MAPPING.find((tool) =>
      tool.folderNames.some((folder) => folder.toLowerCase() === secondDir)
    );
  }

  return {
    toolId: matchedTool ? matchedTool.id : "other",
    toolName: matchedTool ? matchedTool.name : "其他/通用",
    category,
  };
}

export async function scanLabsMedia(): Promise<{
  labsRoot: string;
  entries: MediaEntry[];
}> {
  const labsRoot = await getLabsRoot();

  if (!(await exists(labsRoot))) {
    return { labsRoot, entries: [] };
  }

  await authorizeFsPaths([labsRoot]).catch((err) =>
    console.error("Failed to authorize labsRoot:", err)
  );

  const entries: MediaEntry[] = [];

  async function walkDir(currentPath: string, relativeDir: string) {
    try {
      const items = await readDir(currentPath);

      for (const item of items) {
        const itemRelativePath = relativeDir
          ? `${relativeDir}/${item.name}`
          : item.name;

        if (item.isDirectory) {
          await walkDir(item.path, itemRelativePath);
        } else if (item.isFile) {
          const ext = item.name.split(".").pop()?.toLowerCase() || "";
          const mediaType = getMediaType(ext);

          if (mediaType !== "other") {
            const fileStat = await stat(item.path).catch(() => null);
            const { toolId, toolName, category } =
              detectToolAndCategory(itemRelativePath);

            entries.push({
              id: item.path,
              name: item.name,
              path: item.path,
              relativePath: itemRelativePath,
              toolId,
              toolName,
              category,
              mediaType,
              size: fileStat?.size ?? 0,
              modifiedAt: fileStat?.modifiedAt ?? fileStat?.mtime?.getTime() ?? 0,
              ext,
            });
          }
        }
      }
    } catch (e) {
      console.warn("Failed to walk dir:", currentPath, e);
    }
  }

  await walkDir(labsRoot, "");

  entries.sort((a, b) => b.modifiedAt - a.modifiedAt);

  return { labsRoot, entries };
}

export async function deleteMediaFiles(paths: string[]): Promise<number> {
  let deletedCount = 0;
  for (const path of paths) {
    try {
      await remove(path);
      deletedCount++;
    } catch (e) {
      console.error("Failed to remove file:", path, e);
    }
  }
  return deletedCount;
}

export async function batchExportFiles(sourcePaths: string[], targetDir: string): Promise<number> {
  await authorizeFsPaths([targetDir]).catch(() => null);
  let exportedCount = 0;
  for (const src of sourcePaths) {
    try {
      const fileName = src.split(/[/\\]/).pop() || "file";
      const targetPath = await join(targetDir, fileName);
      await copyFile(src, targetPath);
      exportedCount++;
    } catch (e) {
      console.error("Failed to export file:", src, e);
    }
  }
  return exportedCount;
}

export async function copyImageToClipboard(filePath: string): Promise<boolean> {
  try {
    const data = await readFile(filePath);
    const ext = filePath.split(".").pop()?.toLowerCase() || "png";
    let mimeType = "image/png";
    if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
    if (ext === "webp") mimeType = "image/webp";

    const blob = new Blob([data.buffer as ArrayBuffer], { type: mimeType });

    if (navigator.clipboard && typeof (window as any).ClipboardItem !== "undefined") {
      // Direct clipboard item write
      await navigator.clipboard.write([
        new (window as any).ClipboardItem({ [mimeType]: blob }),
      ]);
      return true;
    } else {
      // Fallback using canvas if ClipboardItem is strictly png-only
      const img = new Image();
      const url = URL.createObjectURL(blob);
      return await new Promise<boolean>((resolve) => {
        img.onload = async () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0);
          canvas.toBlob(async (pngBlob) => {
            if (pngBlob) {
              await navigator.clipboard.write([
                new (window as any).ClipboardItem({ "image/png": pngBlob }),
              ]);
              resolve(true);
            } else {
              resolve(false);
            }
            URL.revokeObjectURL(url);
          }, "image/png");
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(false);
        };
        img.src = url;
      });
    }
  } catch (e) {
    console.error("Failed to copy image to clipboard:", e);
    return false;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export { revealFileInFolder, openPath };
