import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useImageStore, useUIStore } from "@/stores";
import { toast } from "@/hooks/useToast";
import { imageApi } from "@/services/tauri";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Edit,
  Download,
  ExternalLink,
  Copy,
  Check,
  Loader2,
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
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const [loadedDimensions, setLoadedDimensions] = useState<{ width: number; height: number } | null>(null);
  const [imageTimestamp, setImageTimestamp] = useState(Date.now());
  const [isUpdatingWatermark, setIsUpdatingWatermark] = useState(false);

  // Update timestamp when image changes
  useEffect(() => {
    setImageTimestamp(Date.now());
  }, [viewingImageId]);

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

  const handleWatermarkToggle = async () => {
    if (!image || isUpdatingWatermark) return;
    setIsUpdatingWatermark(true);
    const nextHasWatermark = !image.has_watermark;
    try {
      const updated = await imageApi.update({
        image_id: image.id,
        model_ids: image.models.map((m) => m.id),
        primary_model_id: image.models.find((m) => m.is_primary)?.id || undefined,
        tags: image.tags.map((t) => t.name),
        has_watermark: nextHasWatermark,
        watermark_platform: nextHasWatermark ? "unknown" : undefined,
      });

      useImageStore.getState().updateImage(image.id, updated);
      toast({
        title: "水印标记已更新",
        description: nextHasWatermark ? "已标记为 [有水印]" : "已标记为 [无水印]",
      });
    } catch (error) {
      console.error("Failed to toggle watermark:", error);
      toast({
        title: "标记水印失败",
        description: "更新数据库时发生错误",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingWatermark(false);
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
      } else if (e.key.toLowerCase() === "w") {
        e.preventDefault();
        handleWatermarkToggle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isImageViewerOpen, currentIndex, currentImages.length, image?.id, isUpdatingWatermark]);

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
        await Command.create('explorer', [image.absolute_path]).execute();
      } else if (navigator.platform.toLowerCase().includes('mac')) {
        await Command.create('open', [image.absolute_path]).execute();
      } else {
        await Command.create('xdg-open', [image.absolute_path]).execute();
      }
    } catch (error) {
      console.error("Failed to open image:", error);
      toast({
        title: "✗ 打开图片失败",
        description: String(error),
        variant: "destructive",
      });
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

  const handleCopyPrompt = async (groupId: string, prompt: string, negativePrompt?: string) => {
    try {
      const text = negativePrompt
        ? `${prompt}\n\n负面提示词:\n${negativePrompt}`
        : prompt;
      await navigator.clipboard.writeText(text);
      setCopiedPromptId(groupId);
      window.setTimeout(() => {
        setCopiedPromptId((current) => (current === groupId ? null : current));
      }, 1500);
    } catch (error) {
      console.error("Failed to copy prompt:", error);
    }
  };

  useEffect(() => {
    setLoadedDimensions(null);
  }, [image?.id]);

  if (!image) return null;

  const displayWidth = image.width || loadedDimensions?.width;
  const displayHeight = image.height || loadedDimensions?.height;

  return (
    <Dialog open={isImageViewerOpen} onOpenChange={(open) => !open && closeImageViewer()}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden flex flex-col" hideClose>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-card shadow-sm z-10">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate" title={image.filename}>
              {image.filename}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">
                {currentIndex + 1} / {currentImages.length}
              </span>
              {displayWidth && displayHeight && (
                <span className="text-sm text-muted-foreground">
                  {displayWidth} × {displayHeight}
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
              src={`${convertFileSrc(image.absolute_path)}?t=${imageTimestamp}`}
              alt={image.filename}
              className="max-w-full max-h-full object-contain cursor-zoom-in"
              style={{ maxHeight: "calc(95vh - 120px)" }}
              onLoad={(e) => {
                const target = e.currentTarget;
                setLoadedDimensions({
                  width: target.naturalWidth,
                  height: target.naturalHeight,
                });
              }}
              onDoubleClick={handleEdit}
            />
          </div>

          {/* Info Sidebar */}
          <div className="w-80 border-l bg-card flex flex-col z-10 shadow-[-1px_0_2px_rgba(0,0,0,0.02)]">
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
                <div>
                  <h3 className="text-sm font-medium mb-2">标签</h3>
                  {image.tags && image.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {image.tags.map((tag) => (
                        <Badge key={tag.id} variant="outline" className="text-xs">
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">暂无标签</p>
                  )}
                </div>

                {/* Prompt Groups */}
                {image.prompt_groups.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">关联 Prompt</h3>
                    <div className="space-y-3">
                      {image.prompt_groups.map((group) => (
                        <div key={group.id} className="rounded-md border p-3">
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm whitespace-pre-wrap break-words">{group.prompt}</p>
                              {group.negative_prompt && (
                                <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                                  负面提示词：{group.negative_prompt}
                                </p>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 flex-shrink-0"
                              onClick={() => void handleCopyPrompt(group.id, group.prompt, group.negative_prompt)}
                              title={copiedPromptId === group.id ? "已复制" : "复制 Prompt"}
                            >
                              {copiedPromptId === group.id ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Watermark */}
                <div>
                  <h3 className="text-sm font-medium mb-2">水印状态</h3>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleWatermarkToggle}
                        disabled={isUpdatingWatermark}
                        className="inline-flex items-center text-left"
                      >
                        {image.has_watermark ? (
                          <Badge
                            variant="outline"
                            className="bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200 cursor-pointer select-none transition-colors"
                          >
                            {isUpdatingWatermark ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                            ) : null}
                            {(() => {
                              const hasSpecificPlatform = image.watermark_platform && 
                                image.watermark_platform !== "unknown" && 
                                image.watermark_platform !== "未知";
                              return `有水印${hasSpecificPlatform ? ` (${image.watermark_platform})` : ""}`;
                            })()}
                          </Badge>
                        ) : image.has_watermark === false ? (
                          <Badge
                            variant="outline"
                            className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200 cursor-pointer select-none transition-colors"
                          >
                            {isUpdatingWatermark ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                            ) : null}
                            无水印
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200 cursor-pointer select-none border-dashed transition-colors"
                          >
                            {isUpdatingWatermark ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                            ) : null}
                            未标注水印
                          </Badge>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="start">
                      <p>点击切换水印状态 (快捷键: W)</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* File Info */}
                <div>
                  <h3 className="text-sm font-medium mb-2">文件信息</h3>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex justify-between">
                      <span>格式:</span>
                      <span className="font-mono uppercase">{image.format || "未知"}</span>
                    </div>
                    {displayWidth && displayHeight && (
                      <div className="flex justify-between">
                        <span>尺寸:</span>
                        <span>{displayWidth} × {displayHeight}</span>
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
                      <span>{image.status === "archived" ? "已归档" : "待整理"}</span>
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
          使用 ← → 键切换图片 · W 键切换水印 · ESC 关闭 · 双击图片编辑
        </div>
      </DialogContent>
    </Dialog>
  );
}
