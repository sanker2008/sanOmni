import { useState, useEffect } from "react";
import { useImageStore, useIpImageStore, useUIStore } from "@/stores";
import { imageApi, ipImageApi, classifyApi } from "@/services/tauri";
import { Button } from "@/components/ui/button";
import { Upload, Image as ImageIcon, FolderOpen, Loader2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { authorizeFsPaths, copyFile, exists, mkdir, readDir, stat } from "@/services/secureFs";
import { toast } from "@/hooks/useToast";

interface DropZoneProps {
  onImportComplete?: () => void;
  imageType?: "prompt" | "ip";
  ipId?: string; // required when imageType === "ip"
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];

function isImageFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  return IMAGE_EXTENSIONS.includes(ext);
}

export default function DropZone({ onImportComplete, imageType = "prompt", ipId }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const { addImage: addPromptImage } = useImageStore();
  const { addImage: addIpImage } = useIpImageStore();
  const { settings } = useUIStore();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let isMounted = true;

    async function setupDragDrop() {
      try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const listener = await getCurrentWebviewWindow().onDragDropEvent((event) => {
          if (event.payload.type === 'enter') {
            setIsDragging(true);
          } else if (event.payload.type === 'leave') {
            setIsDragging(false);
          } else if (event.payload.type === 'drop') {
            setIsDragging(false);
            const paths = event.payload.paths.filter(p => isImageFile(p));
            if (paths.length > 0) {
              authorizeFsPaths(paths).catch(error => console.error("Failed to authorize dropped paths:", error));
              importPaths(paths);
            } else {
              console.warn("No valid image files in drop");
            }
          }
        });
        
        if (isMounted) {
          unlisten = listener;
        } else {
          listener(); // unlisten immediately if component unmounted
        }
      } catch (error) {
        console.error("Failed to setup Tauri drag drop event:", error);
      }
    }

    setupDragDrop();

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const handleSelectFiles = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Images",
            extensions: IMAGE_EXTENSIONS,
          },
        ],
      });

      if (selected) {
        const files = Array.isArray(selected) ? selected : [selected];
        await authorizeFsPaths(files as string[]);
        await importPaths(files as string[]);
      }
    } catch (error) {
      console.error("Failed to select files:", error);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const selectedFolder = await open({
        directory: true,
        multiple: false,
      });

      if (!selectedFolder || typeof selectedFolder !== "string") {
        return;
      }

      await authorizeFsPaths([selectedFolder]);
      // Read all files in the selected folder
      const entries = await readDirRecursive(selectedFolder);
      const imagePaths = entries.filter(isImageFile);

      if (imagePaths.length === 0) {
        console.warn("No image files found in the selected folder");
        return;
      }

      await importPaths(imagePaths);
    } catch (error) {
      console.error("Failed to select folder:", error);
    }
  };

  // Helper function to recursively read directory
  const readDirRecursive = async (dirPath: string): Promise<string[]> => {
    const results: string[] = [];

    try {
      const entries = await readDir(dirPath);

      for (const entry of entries) {
        const fullPath = `${dirPath}/${entry.name}`;
        if (entry.isDirectory) {
          const subEntries = await readDirRecursive(fullPath);
          results.push(...subEntries);
        } else {
          results.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Failed to read directory ${dirPath}:`, error);
    }

    return results;
  };

  // This function is no longer needed, removed in favor of importPaths

  const importPaths = async (paths: string[]) => {
    console.log("importPaths called with:", paths);
    setIsImporting(true);
    try {
      await authorizeFsPaths(paths);
      const { join } = await import("@tauri-apps/api/path");
      const { getAppRoot } = await import("@/lib/pathUtils");
      
      // 使用自定义路径或默认路径
      let inboxDir: string;
      if (imageType === "ip") {
        if (settings.customIpInboxPath) {
          inboxDir = settings.customIpInboxPath;
          console.log("Using custom ip inbox path:", inboxDir);
        } else {
          const appDir = await getAppRoot();
          inboxDir = await join(appDir, "ip_inbox");
          console.log("Using default ip inbox path:", inboxDir);
        }
      } else {
        if (settings.customInboxPath) {
          inboxDir = settings.customInboxPath;
          console.log("Using custom prompt inbox path:", inboxDir);
        } else {
          const appDir = await getAppRoot();
          inboxDir = await join(appDir, "inbox");
          console.log("Using default prompt inbox path:", inboxDir);
        }
      }
      
      // Ensure inbox directory exists
      if (!(await exists(inboxDir))) {
        await mkdir(inboxDir, { recursive: true });
      }

      for (const path of paths) {
        console.log("Processing path:", path);
        const fileName = path.split(/[/\\]/).pop() || "unknown";
        console.log("Extracted filename:", fileName);

        // Get file metadata using Tauri's fs API
        let fileSize = 0;
        try {
          const fileMeta = await stat(path);
          fileSize = fileMeta.size;
          console.log("File size:", fileSize);
        } catch (error) {
          console.error(`Failed to get metadata for ${path}:`, error);
          // Continue with size 0 if metadata fails
        }

        // 自动分类：根据文件名推断 vendor/model
        let vendorId: string | undefined;
        let modelIds: string[] = [];
        try {
          const classification = await classifyApi.classify(fileName);
          console.log("Classification result:", classification);
          if (classification.confidence > 0.5) {
            vendorId = classification.vendor_id;
            if (classification.model_id) {
              modelIds = [classification.model_id];
            }
          }
        } catch (error) {
          console.error("Classification failed:", error);
          // 分类失败时静默忽略，继续导入
        }

        // Copy file to inbox directory with unique name to avoid conflicts
        const timestamp = Date.now();
        const uniqueFileName = `${timestamp}_${fileName}`;
        const targetPath = await join(inboxDir, uniqueFileName);
        console.log("Copying file from:", path);
        console.log("Copying file to:", targetPath);
        
        try {
          await copyFile(path, targetPath);
          console.log("File copied successfully");
        } catch (error) {
          console.error("Failed to copy file:", error);
          toast({
            title: "✗ 复制文件失败",
            description: `${fileName}: ${String(error)}`,
            variant: "destructive",
          });
          continue; // Skip this file and continue with next
        }

        console.log("Calling imageApi.import with:", {
          file_path: targetPath,
          file_name: fileName,
          file_size: fileSize,
          vendor_id: vendorId,
          model_ids: modelIds,
        });

        try {
          if (imageType === "ip") {
            const result = await ipImageApi.import({
              file_path: targetPath,
              file_name: fileName,
              file_size: fileSize,
              ip_id: ipId || "unknown",
              tags: [],
            });
            addIpImage(result);
          } else {
            const result = await imageApi.import({
              file_path: targetPath,
              file_name: fileName,
              file_size: fileSize,
              vendor_id: vendorId,
              model_ids: modelIds,
              tags: [],
            });
            addPromptImage(result);
          }
        } catch (error) {
          console.error("Failed to import image:", error);
          toast({
            title: "✗ 导入图片失败",
            description: `${fileName}: ${String(error)}`,
            variant: "destructive",
          });
        }
      }
      onImportComplete?.();
    } catch (error) {
      console.error("Failed to import files:", error);
      toast({
        title: "✗ 导入失败",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      className={`flex-1 flex items-center justify-center p-8 ${
        isDragging ? "bg-primary/5" : ""
      }`}
    >
      <div
        className={`max-w-md text-center space-y-6 p-12 border-2 border-dashed rounded-xl transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        }`}
      >
        {isImporting ? (
          <>
            <Loader2 className="w-16 h-16 mx-auto text-primary animate-spin" />
            <div>
              <p className="text-lg font-medium">正在导入...</p>
              <p className="text-sm text-muted-foreground mt-1">
                请稍候，正在处理图片
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center">
              {isDragging ? (
                <FolderOpen className="w-10 h-10 text-primary" />
              ) : (
                <ImageIcon className="w-10 h-10 text-muted-foreground" />
              )}
            </div>

            <div>
              <p className="text-lg font-medium">
                {isDragging ? "松开即可导入" : "拖放图片到此处"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                支持 PNG、JPG、WEBP、GIF 格式
              </p>
            </div>

            <div className="flex items-center justify-center gap-4">
              <Button onClick={handleSelectFiles} className="gap-2">
                <Upload className="w-4 h-4" />
                选择图片
              </Button>
              <Button variant="outline" className="gap-2" onClick={handleSelectFolder}>
                <FolderOpen className="w-4 h-4" />
                选择文件夹
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              图片将导入到待整理，你可以稍后打标签并归档
            </p>
          </>
        )}
      </div>
    </div>
  );
}
