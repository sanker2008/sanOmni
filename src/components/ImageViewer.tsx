import { useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useImageStore, useUIStore, type ImageWithRelations } from "@/stores";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Edit,
  Download,
  ExternalLink,
} from "lucide-react";

export default function ImageViewer() {
  const { inboxImages, archivedImages } = useImageStore();
  const { 
    isImageViewerOpen, 
    viewingImageId, 
    closeImageViewer,
    openQuickEdit,
    activeTab,
  } = useUIStore();

  // Get current image list based on active tab
  const currentImages = activeTab === "inbox" ? inboxImages : archivedImages;
  const currentIndex = currentImages.findIndex((img) => img.id === viewingImageId);
  const image = currentImages[currentIndex];

  // Navigate to previous/next image
  const goToPrevious = () => {
    if (currentIndex > 0) {
      const prevImage = currentImages[currentIndex - 1];
      useUIStore.getState().setViewingImageId(prevImage.id);
    }
  };

  const goToNext = () => {
    if (currentIndex < currentImages.length - 1) {
      const nextImage = currentImages[currentIndex + 1];
      useUIStore.getState().setViewingImageId(nextImage.id);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isImageViewerOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrevious();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToNext();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeImageViewer();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isImageViewerOpen, currentIndex, currentImages.length]);

  const handleEdit = () => {
    if (image) {
      closeImageViewer();
      openQuickEdit(image.id);
    }
  };

  const handleOpenExternal = async () => {
    if (!image) return;
    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      
      // 根据操作系统打开图片
      if (navigator.platform.toLowerCase().includes('win')) {
        await Command.create('cmd', ['/c', 'start', '', image.absolute_path]).execute();
      } else if (navigator.platform.toLowerCase().includes('mac')) {
        await Command.create('open', [image.absolute_path]).execute();
      } else {
        await Command.create('xdg-open', [image.absolute_path]).execute();
      }
    } catch (error) {
      console.error("Failed to open image:", error);
    }
  };

  const handleDownload = async () => {
    if (!image) return;
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { copyFile } = await import("@tauri-apps/plugin-fs");
      
      const savePath = await save({
        defaultPath: image.filename,
        filters: [{
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "webp", "gif"],
        }],
      });

      if (savePath) {
        await copyFile(image.absolute_path, savePath);
      }
    } catch (error) {
      console.error("Failed to download image:", error);
    }
  };

  if (!image) return null;

  return (
    <Dialog open={isImageViewerOpen} onOpenChange={(open) => !open && closeImageViewer()}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden flex flex-col" hideClose>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate" title={image.filename}>
              {image.filename}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">
                {currentIndex + 1} / {currentImages.length}
              </span>
              {image.width && image.height && (
                <span className="text-sm text-muted-foreground">
                  {image.width} × {image.height}
                </span>
              )}
              {image.file_size && (
                <span className="text-sm text-muted-foreground">
                  {(image.file_size / (1024 * 1024)).toFixed(2)} MB
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleEdit} title="编辑">
              <Edit className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleDownload} title="另存为">
              <Download className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleOpenExternal} title="用外部程序打开">
              <ExternalLink className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={closeImageViewer}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Image and Info */}
        <div className="flex-1 flex overflow-hidden">
          {/* Image Display */}
          <div className="flex-1 relative bg-black/5 dark:bg-black/20 flex items-center justify-center p-4">
            {/* Navigation Buttons */}
            {currentIndex > 0 && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full shadow-lg"
                onClick={goToPrevious}
              >
                <ChevronLeft className="w-6 h-6" />
              </Button>
            )}
            
            {currentIndex < currentImages.length - 1 && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full shadow-lg"
                onClick={goToNext}
              >
                <ChevronRight className="w-6 h-6" />
              </Button>
            )}

            {/* Image */}
            <img
              src={convertFileSrc(image.absolute_path)}
              alt={image.filename}
              className="max-w-full max-h-full object-contain cursor-zoom-in"
              style={{ maxHeight: "calc(95vh - 120px)" }}
              onDoubleClick={handleEdit}
            />
          </div>

          {/* Info Sidebar */}
          <div className="w-80 border-l bg-background flex flex-col">
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {/* Models */}
                {image.models.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">模型</h3>
                    <div className="flex flex-wrap gap-1">
                      {image.models.map((model) => (
                        <Badge key={model.id} variant="secondary" className="text-xs">
                          {model.name}
                          {model.is_primary && " ★"}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {image.tags.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">标签</h3>
                    <div className="flex flex-wrap gap-1">
                      {image.tags.map((tag) => (
                        <Badge key={tag.id} variant="outline" className="text-xs">
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Prompt */}
                {image.prompt && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">Prompt</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {image.prompt}
                    </p>
                  </div>
                )}

                {/* Negative Prompt */}
                {image.negative_prompt && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">Negative Prompt</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {image.negative_prompt}
                    </p>
                  </div>
                )}

                {/* Watermark */}
                {image.has_watermark && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">水印</h3>
                    <Badge variant="destructive" className="text-xs">
                      {image.watermark_platform || "未知"} 水印
                    </Badge>
                  </div>
                )}

                {/* File Info */}
                <div>
                  <h3 className="text-sm font-medium mb-2">文件信息</h3>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex justify-between">
                      <span>格式:</span>
                      <span className="font-mono uppercase">{image.format || "未知"}</span>
                    </div>
                    {image.width && image.height && (
                      <div className="flex justify-between">
                        <span>尺寸:</span>
                        <span>{image.width} × {image.height}</span>
                      </div>
                    )}
                    {image.file_size && (
                      <div className="flex justify-between">
                        <span>大小:</span>
                        <span>{(image.file_size / (1024 * 1024)).toFixed(2)} MB</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>状态:</span>
                      <span>{image.status === "archived" ? "已归档" : "收件箱"}</span>
                    </div>
                  </div>
                </div>

                {/* Path */}
                <div>
                  <h3 className="text-sm font-medium mb-2">路径</h3>
                  <p className="text-xs text-muted-foreground break-all font-mono">
                    {image.absolute_path}
                  </p>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Footer Hint */}
        <div className="px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground text-center">
          使用 ← → 键切换图片 · ESC 关闭 · 双击图片编辑
        </div>
      </DialogContent>
    </Dialog>
  );
}
