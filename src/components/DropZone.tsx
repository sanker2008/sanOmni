import { useState, useCallback } from "react";
import { useImageStore } from "@/stores";
import { imageApi, classifyApi } from "@/services/tauri";
import { Button } from "@/components/ui/button";
import { Upload, Image as ImageIcon, FolderOpen, Loader2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

interface DropZoneProps {
  onImportComplete?: () => void;
}

export default function DropZone({ onImportComplete }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const { addImage } = useImageStore();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith("image/")
    );

    if (files.length === 0) {
      return;
    }

    await importFiles(files);
  }, []);

  const handleSelectFiles = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
          },
        ],
      });

      if (selected) {
        const files = Array.isArray(selected) ? selected : [selected];
        // Convert paths to File objects for processing
        // In Tauri, we get paths, so we need to handle them differently
        await importPaths(files as string[]);
      }
    } catch (error) {
      console.error("Failed to select files:", error);
    }
  };

  const importFiles = async (files: File[]) => {
    setIsImporting(true);
    try {
      for (const file of files) {
        // 自动分类：根据文件名推断 vendor/model
        let vendorId: string | undefined;
        let modelIds: string[] = [];
        try {
          const classification = await classifyApi.classify(file.name);
          if (classification.confidence > 0.5) {
            vendorId = classification.vendor_id;
            if (classification.model_id) {
              modelIds = [classification.model_id];
            }
          }
        } catch {
          // 分类失败时静默忽略，继续导入
        }

        const result = await imageApi.import({
          file_path: file.name, // This would be the actual path in Tauri
          file_name: file.name,
          file_size: file.size,
          vendor_id: vendorId,
          model_ids: modelIds,
          tags: [],
        });
        addImage(result);
      }
      onImportComplete?.();
    } catch (error) {
      console.error("Failed to import files:", error);
    } finally {
      setIsImporting(false);
    }
  };

  const importPaths = async (paths: string[]) => {
    setIsImporting(true);
    try {
      for (const path of paths) {
        const fileName = path.split(/[/\\]/).pop() || "unknown";

        // 自动分类：根据文件名推断 vendor/model
        let vendorId: string | undefined;
        let modelIds: string[] = [];
        try {
          const classification = await classifyApi.classify(fileName);
          if (classification.confidence > 0.5) {
            vendorId = classification.vendor_id;
            if (classification.model_id) {
              modelIds = [classification.model_id];
            }
          }
        } catch {
          // 分类失败时静默忽略，继续导入
        }

        const result = await imageApi.import({
          file_path: path,
          file_name: fileName,
          file_size: 0, // We'd get this from fs metadata
          vendor_id: vendorId,
          model_ids: modelIds,
          tags: [],
        });
        addImage(result);
      }
      onImportComplete?.();
    } catch (error) {
      console.error("Failed to import files:", error);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      className={`flex-1 flex items-center justify-center p-8 ${
        isDragging ? "bg-primary/5" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
              <Button variant="outline" className="gap-2">
                <FolderOpen className="w-4 h-4" />
                选择文件夹
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              图片将导入到收件箱，你可以稍后打标签并归档
            </p>
          </>
        )}
      </div>
    </div>
  );
}
