import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useImageStore, useUIStore, type ImageWithRelations } from "@/stores";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "./ConfirmDialog";
import {
  CheckCircle2,
  Circle,
  Edit,
  Archive,
  Image as ImageIcon,
  Scan,
  Loader2,
  Eraser,
  Trash2,
  FolderOpen,
  Undo2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { watermarkApi } from "@/services/tauri";

interface ImageCardProps {
  image: ImageWithRelations;
  onWatermarkDetected?: (imageId: string, result: { has_watermark: boolean; platform?: string }) => void;
  onWatermarkRemoved?: (imageId: string, outputPath: string) => void;
  onDelete?: (imageId: string) => void;
  onArchive?: (imageId: string) => void;
  listMode?: boolean;
}

export default function ImageCard({ image, onWatermarkDetected, onWatermarkRemoved, onDelete, onArchive, listMode = false }: ImageCardProps) {
  const { selectedImages, selectImage, deselectImage } = useImageStore();
  const { openQuickEdit, openImageViewer } = useUIStore();
  const showMenu = false;
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [clickTimeout, setClickTimeout] = useState<NodeJS.Timeout | null>(null);
  const [watermarkResult, setWatermarkResult] = useState<{
    has_watermark: boolean;
    platform?: string;
    confidence: number;
    watermark_region?: { x: number; y: number; width: number; height: number };
  } | null>(null);

  const isSelected = selectedImages.includes(image.id);

  const handleToggleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSelected) {
      deselectImage(image.id);
    } else {
      selectImage(image.id);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    // 如果点击的是按钮或其他交互元素，不处理
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }

    // 清除之前的超时
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      setClickTimeout(null);
    }

    // 设置新的超时，延迟执行单击操作
    const timeout = setTimeout(() => {
      if (isSelected) {
        deselectImage(image.id);
      } else {
        selectImage(image.id);
      }
      setClickTimeout(null);
    }, 200);

    setClickTimeout(timeout);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    // 清除单击的超时
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      setClickTimeout(null);
    }

    // 如果点击的是按钮或其他交互元素，不处理
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }

    // 双击打开查看器
    openImageViewer(image.id);
  };

  const handleDetectWatermark = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (detecting) return;

    setDetecting(true);
    try {
      const result = await watermarkApi.detect(image.absolute_path);
      setWatermarkResult(result);
      onWatermarkDetected?.(image.id, {
        has_watermark: result.has_watermark,
        platform: result.platform,
      });
    } catch (error) {
      console.error("Watermark detection failed:", error);
    } finally {
      setDetecting(false);
    }
  };

  const handleRemoveWatermark = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (removing) return;

    // If we haven't detected watermark yet, detect first
    if (!watermarkResult?.has_watermark) {
      console.log("Detecting watermark first...");
      return;
    }

    setRemoving(true);
    try {
      // Generate output path (same directory, with "_cleaned" suffix)
      const ext = image.filename.split('.').pop() || 'png';
      const baseName = image.filename.replace(/\.[^/.]+$/, '');
      // Use cross-platform path separator detection
      const lastSeparator = Math.max(
        image.absolute_path.lastIndexOf('/'),
        image.absolute_path.lastIndexOf('\\')
      );
      const outputDir = image.absolute_path.substring(0, lastSeparator + 1);
      const outputPath = `${outputDir}${baseName}_cleaned.${ext}`;

      const result = await watermarkApi.remove(
        image.absolute_path,
        outputPath,
        watermarkResult.watermark_region
      );

      if (result.success) {
        console.log(`Watermark removed: ${result.output_path} (${result.processing_time_ms}ms)`);
        onWatermarkRemoved?.(image.id, result.output_path);
        // Clear watermark badge since it's been removed
        setWatermarkResult(null);
      }
    } catch (error) {
      console.error("Watermark removal failed:", error);
    } finally {
      setRemoving(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleting) return;
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await onDelete?.(image.id);
    } catch (error) {
      console.error("Delete failed:", error);
    } finally {
      setDeleting(false);
    }
  };

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    onArchive?.(image.id);
  };

  const handleOpenFolder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      
      // 获取文件所在目录
      const dirPath = image.absolute_path.substring(0, Math.max(
        image.absolute_path.lastIndexOf('/'),
        image.absolute_path.lastIndexOf('\\')
      ));

      // 根据操作系统打开文件管理器
      if (navigator.platform.toLowerCase().includes('win')) {
        // Windows: 使用 explorer 并选中文件
        await Command.create('explorer', ['/select,', image.absolute_path]).execute();
      } else if (navigator.platform.toLowerCase().includes('mac')) {
        // macOS: 使用 open 并选中文件
        await Command.create('open', ['-R', image.absolute_path]).execute();
      } else {
        // Linux: 打开文件夹（不同发行版可能不同）
        await Command.create('xdg-open', [dirPath]).execute();
      }
    } catch (error) {
      console.error("Failed to open folder:", error);
      alert("打开文件夹失败");
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    handleOpenFolder(e);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = () => {
    if (image.status === "archived") {
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
          已归档
        </Badge>
      );
    }
    if (image.status === "tagged") {
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          已标记
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
        未标记
      </Badge>
    );
  };

  // Use detected result or stored watermark info
  const showWatermarkBadge = watermarkResult?.has_watermark ?? image.has_watermark;
  const watermarkPlatform = watermarkResult?.platform ?? image.watermark_platform;

  // ── List mode ──────────────────────────────────────────────────────────────
  if (listMode) {
    return (
      <>
        <TooltipProvider>
        <Card
          className={`group relative flex items-center gap-3 px-3 py-2 cursor-pointer transition-all hover:shadow-sm ${
            isSelected ? "!shadow-[0_0_0_2px_hsl(var(--primary))]" : ""
          }`}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
        >
          {/* Checkbox */}
          <button
            onClick={handleToggleSelect}
            className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
              isSelected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground/40 hover:text-muted-foreground"
            }`}
          >
            {isSelected ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
          </button>

          {/* Thumbnail */}
          <div className="flex-shrink-0 w-12 h-12 rounded-md overflow-hidden bg-muted relative">
            {imageError ? (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-muted-foreground" />
              </div>
            ) : (
              <img
                src={convertFileSrc(image.absolute_path)}
                alt={image.filename}
                className={`w-full h-full object-cover transition-opacity ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
            )}
          </div>

          {/* Filename + meta */}
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="text-sm font-medium truncate" title={image.filename}>
              {image.filename}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {getStatusBadge()}
              {image.format && (
                <Badge variant="secondary" className="text-xs font-mono uppercase">
                  {image.format}
                </Badge>
              )}
              {image.models.slice(0, 2).map((model) => (
                <Badge key={model.id} variant="secondary" className="text-xs">
                  {model.name}{model.is_primary && " ★"}
                </Badge>
              ))}
              {image.tags.slice(0, 3).map((tag) => (
                <Badge key={tag.id} variant="outline" className="text-xs">
                  {tag.name}
                </Badge>
              ))}
              {showWatermarkBadge && (
                <Badge variant="destructive" className="text-xs">水印</Badge>
              )}
            </div>
          </div>

          {/* File size */}
          {image.file_size && (
            <span className="flex-shrink-0 text-xs text-muted-foreground w-16 text-right">
              {formatFileSize(image.file_size)}
            </span>
          )}

          {/* Action buttons */}
          <div className="flex-shrink-0 flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={(e) => { e.stopPropagation(); openQuickEdit(image.id); }}>
                  <Edit className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>编辑</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={handleDetectWatermark} disabled={detecting}>
                  {detecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scan className="w-3 h-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>检测水印</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={handleOpenFolder}>
                  <FolderOpen className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>打开文件夹</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon"
                  className={`h-7 w-7 ${image.status === "archived" ? "text-blue-500 hover:text-blue-600" : ""}`}
                  onClick={handleArchive}>
                  {image.status === "archived" ? <Undo2 className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{image.status === "archived" ? "撤销归档" : "归档"}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon"
                  className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                  onClick={handleDelete} disabled={deleting}>
                  {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>删除</TooltipContent>
            </Tooltip>
          </div>
        </Card>
        <ConfirmDialog
          open={showDeleteConfirm}
          title="确认删除"
          description={`确定要删除图片 "${image.filename}" 吗？此操作不可恢复。`}
          confirmText="删除"
          cancelText="取消"
          variant="destructive"
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      </TooltipProvider>
      </>
    );
  }

  // ── Grid mode (default) ────────────────────────────────────────────────────
  return (
    <>
      <TooltipProvider>
      <Card
        className={`group relative overflow-hidden cursor-pointer transition-all hover:shadow-md shadow-[0_0_0_2px_transparent] ${
          isSelected ? "!shadow-[0_0_0_2px_hsl(var(--primary))]" : ""
        }`}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
      {/* Selection indicator */}
      <div className="absolute top-2 left-2 z-10">
        <button
          onClick={handleToggleSelect}
          className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
            isSelected
              ? "bg-primary text-primary-foreground"
              : "bg-white/80 text-muted-foreground opacity-0 group-hover:opacity-100"
          }`}
        >
          {isSelected ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <Circle className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Watermark indicator */}
      {showWatermarkBadge && (
        <div className="absolute top-2 right-2 z-10">
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="destructive" className="text-xs">
                水印
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>检测到 {watermarkPlatform || "未知"} 水印</p>
              {watermarkResult && (
                <p className="text-xs text-muted-foreground">
                  置信度: {(watermarkResult.confidence * 100).toFixed(0)}%
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Image preview */}
      <div className="aspect-square bg-muted relative">
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
          </div>
        )}
        {imageError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <ImageIcon className="w-8 h-8 text-muted-foreground" />
          </div>
        ) : (
          <img
            src={convertFileSrc(image.absolute_path)}
            alt={image.filename}
            className={`w-full h-full object-cover transition-opacity ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        )}
        
        {/* Format badge */}
        {image.format && (
          <div className="absolute bottom-2 left-2 z-10">
            <Badge variant="secondary" className="text-xs font-mono uppercase bg-black/70 text-white border-0 hover:bg-black/70">
              {image.format}
            </Badge>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        {/* Filename */}
        <p className="text-sm font-medium truncate" title={image.filename}>
          {image.filename}
        </p>

        {/* Models */}
        {image.models.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {image.models.slice(0, 2).map((model) => (
              <Badge key={model.id} variant="secondary" className="text-xs">
                {model.name}
                {model.is_primary && " ★"}
              </Badge>
            ))}
            {image.models.length > 2 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="text-xs cursor-help">
                    +{image.models.length - 2}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1">
                    <p className="font-medium text-xs">其他模型：</p>
                    {image.models.slice(2).map((model) => (
                      <p key={model.id} className="text-xs">
                        {model.name}
                        {model.is_primary && " ★"}
                      </p>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* Tags */}
        {image.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {image.tags.slice(0, 3).map((tag) => (
              <Badge key={tag.id} variant="outline" className="text-xs">
                {tag.name}
              </Badge>
            ))}
            {image.tags.length > 3 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs cursor-help">
                    +{image.tags.length - 3}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1">
                    <p className="font-medium text-xs">其他标签：</p>
                    {image.tags.slice(3).map((tag) => (
                      <p key={tag.id} className="text-xs">
                        {tag.name}
                      </p>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* Status & Size */}
        <div className="flex items-center justify-between">
          {getStatusBadge()}
          {image.file_size && (
            <span className="text-xs text-muted-foreground">
              {formatFileSize(image.file_size)}
            </span>
          )}
        </div>
      </div>

      {/* Hover menu */}
      <div
        className={`absolute bottom-3 right-3 transition-opacity ${
          showMenu ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <div className="flex items-center gap-1 bg-background/95 dark:bg-background/95 rounded-md shadow-lg border p-1 backdrop-blur-sm">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  openQuickEdit(image.id);
                }}
              >
                <Edit className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>编辑</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleDetectWatermark}
                disabled={detecting}
              >
                {detecting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Scan className="w-3 h-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>检测水印</TooltipContent>
          </Tooltip>

          {showWatermarkBadge && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-500 hover:text-red-600"
                  onClick={handleRemoveWatermark}
                  disabled={removing || !watermarkResult?.has_watermark}
                >
                  {removing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Eraser className="w-3 h-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>去除水印</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleOpenFolder}
              >
                <FolderOpen className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>打开文件夹</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 ${
                  image.status === "archived" 
                    ? "text-blue-500 hover:text-blue-600 hover:bg-blue-50" 
                    : ""
                }`}
                onClick={handleArchive}
              >
                {image.status === "archived" ? (
                  <Undo2 className="w-3 h-3" />
                ) : (
                  <Archive className="w-3 h-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {image.status === "archived" ? "撤销归档" : "归档"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>删除</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </Card>
    <ConfirmDialog
      open={showDeleteConfirm}
      title="确认删除"
      description={`确定要删除图片 "${image.filename}" 吗？此操作不可恢复。`}
      confirmText="删除"
      cancelText="取消"
      variant="destructive"
      onConfirm={confirmDelete}
      onCancel={() => setShowDeleteConfirm(false)}
    />
    </TooltipProvider>
    </>
  );
}
