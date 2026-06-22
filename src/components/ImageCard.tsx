import { useState, useEffect, type CSSProperties } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useImageStore, useIpImageStore, useUIStore, type ImageWithRelations, type IpImageWithRelations } from "@/stores";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/useToast";
import ConfirmDialog from "./ConfirmDialog";
import { CheckCircle2, Circle, Eye, Edit, Archive, Image as ImageIcon, Loader2, Eraser, Trash2, FolderOpen, Undo2, Minimize } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { watermarkApi, geminiWatermarkApi, imageApi, ipImageApi, ipApi } from "@/services/tauri";
import { convertIpImageToWebp, convertIpImageToPng } from "@/lib/webpConverter";
import { revealFileInFolder } from "@/lib/pathUtils";
import { exists, mkdir, rename } from "@/services/secureFs";

type AnyImage = ImageWithRelations | IpImageWithRelations;
const isPromptImage = (img: AnyImage): img is ImageWithRelations => "models" in img;

interface ImageCardProps {
  image: AnyImage;
  onWatermarkRemoved?: (imageId: string, outputPath: string) => void;
  onDelete?: (imageId: string) => void;
  onArchive?: (imageId: string) => void;
  listMode?: boolean;
}

export default function ImageCard({ image, onWatermarkRemoved, onDelete, onArchive, listMode = false }: ImageCardProps) {
  const promptStore = useImageStore();
  const ipStore = useIpImageStore();
  const isPrompt = isPromptImage(image);

  const selectedImages = isPrompt ? promptStore.selectedImages : ipStore.selectedImages;
  const selectImage = isPrompt ? promptStore.selectImage : ipStore.selectImage;
  const deselectImage = isPrompt ? promptStore.deselectImage : ipStore.deselectImage;
  const { openQuickEdit, openImageViewer, settings } = useUIStore();
  const showFullImage = settings.showFullImage ?? false;
  const showMenu = false;
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [naturalDisplaySize, setNaturalDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [clickTimeout, setClickTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [isUpdatingWatermark, setIsUpdatingWatermark] = useState(false);
  const [imageTimestamp, setImageTimestamp] = useState(Date.now());
  const [convertingToWebp, setConvertingToWebp] = useState(false);

  const handleConvertFormat = async (e: React.MouseEvent, format: 'webp' | 'png') => {
    e.stopPropagation();
    if (convertingToWebp || isPrompt) return;
    setConvertingToWebp(true);
    const loadingToast = toast({
      title: `正在转为 ${format.toUpperCase()}`,
      description: "图片压缩优化中...",
      duration: 100000,
    });
    try {
      if (format === 'webp') {
        await convertIpImageToWebp(image as import("@/stores").IpImageWithRelations);
      } else {
        await convertIpImageToPng(image as import("@/stores").IpImageWithRelations);
      }
      setImageTimestamp(Date.now());
      toast({ title: "✓ 转换成功", description: `已成功转为 ${format.toUpperCase()} 格式` });
    } catch (err) {
      toast({ title: "✗ 转换失败", description: String(err), variant: "destructive" });
    } finally {
      setConvertingToWebp(false);
      loadingToast.dismiss();
    }
  };

  const [isAvatar, setIsAvatar] = useState(false);
  const [isEmoji, setIsEmoji] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isPrompt) {
      const ipImage = image as IpImageWithRelations;
      const ipId = ipImage.ip_id || ipImage.primary_ip_id;
      if (ipId && ipId !== "unknown") {
        ipApi.getDetail(ipId).then((detail) => {
          if (!cancelled) {
            const isSamePath = (p1?: string, p2?: string) => {
              if (!p1 || !p2) return false;
              return p1.replace(/\\/g, "/").toLowerCase() === p2.replace(/\\/g, "/").toLowerCase();
            };
            const avatarMatch = isSamePath(image.absolute_path, detail.ip.avatar_path);
            console.log('[ImageCard] 头像检查:', {
              imageId: image.id,
              imagePath: image.absolute_path,
              avatarPath: detail.ip.avatar_path,
              isMatch: avatarMatch
            });
            setIsAvatar(avatarMatch);
            setIsEmoji((detail.emojis || []).some((emoji) => isSamePath(image.absolute_path, emoji.image_path)));
          }
        }).catch((e) => {
          console.error("加载 IP 详情判定头像/表情失败:", e);
        });
      } else {
        setIsAvatar(false);
        setIsEmoji(false);
      }
    } else {
      setIsAvatar(false);
      setIsEmoji(false);
    }
    return () => {
      cancelled = true;
    };
  }, [image.absolute_path, isPrompt, image]);

  const handleWatermarkToggle = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening full view or selecting card
    if (isUpdatingWatermark) return;

    setIsUpdatingWatermark(true);
    const currentHasWatermark = image.has_watermark;
    const nextHasWatermark = !currentHasWatermark; 

    try {
      const updated = isPromptImage(image)
        ? await imageApi.update({
            image_id: image.id,
            model_ids: image.models.map((m) => m.id),
            primary_model_id: image.models.find((m) => m.is_primary)?.id || undefined,
            tags: image.tags.map((t) => t.name),
            has_watermark: nextHasWatermark,
            watermark_platform: nextHasWatermark ? "unknown" : undefined,
          })
        : await ipImageApi.update({
            ip_image_id: image.id,
            ip_ids: image.ip_ids || [image.ip_id],
            primary_ip_id: image.primary_ip_id || image.ip_id,
            tags: image.tags.map((t) => t.name),
            has_watermark: nextHasWatermark,
            watermark_platform: nextHasWatermark ? "unknown" : undefined,
          });

      // Update in the appropriate store
      if (isPromptImage(image)) {
        useImageStore.getState().updateImage(image.id, updated as ImageWithRelations);
      } else {
        const { useIpImageStore } = await import("@/stores");
        useIpImageStore.getState().updateImage(image.id, updated as IpImageWithRelations);
      }
      
      toast({
        title: `水印标记已更新`,
        description: nextHasWatermark ? `已标记为 [有水印]` : `已标记为 [无水印]`,
        variant: "default",
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

  const getWatermarkBadge = () => {
    const hasWatermark = image.has_watermark;

    if (hasWatermark === true) {
      const hasSpecificPlatform = image.watermark_platform && 
        image.watermark_platform !== "unknown" && 
        image.watermark_platform !== "未知";
      return (
        <button
          onClick={handleWatermarkToggle}
          disabled={isUpdatingWatermark}
          className="inline-flex items-center"
        >
          <Badge
            variant="outline"
            className="bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200 cursor-pointer select-none transition-colors"
          >
            {isUpdatingWatermark ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : null}
            有水印{hasSpecificPlatform ? ` (${image.watermark_platform})` : ""}
          </Badge>
        </button>
      );
    }

    if (hasWatermark === false) {
      return (
        <button
          onClick={handleWatermarkToggle}
          disabled={isUpdatingWatermark}
          className="inline-flex items-center"
        >
          <Badge
            variant="outline"
            className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200 cursor-pointer select-none transition-colors"
          >
            {isUpdatingWatermark ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : null}
            无水印
          </Badge>
        </button>
      );
    }

    // Unset / unknown
    return (
      <button
        onClick={handleWatermarkToggle}
        disabled={isUpdatingWatermark}
        className="inline-flex items-center"
      >
        <Badge
          variant="outline"
          className="bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200 cursor-pointer select-none border-dashed transition-colors"
        >
          {isUpdatingWatermark ? (
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
          ) : null}
          未标注水印
        </Badge>
      </button>
    );
  };

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

    // 双击直接编辑
    openQuickEdit(image.id);
  };

  const handleView = (e: React.MouseEvent) => {
    e.stopPropagation();
    openImageViewer(image.id);
  };

  const handleRemoveWatermark = async (e: React.MouseEvent, algorithm: 'gemini' | 'general' = 'gemini') => {
    e.stopPropagation();
    if (removing) return;

    setRemoving(true);
    const loadingToast = toast({
      title: "正在去除水印",
      description: (
        <div className="flex items-center gap-2 mt-1 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>正在使用 {algorithm === 'gemini' ? 'Gemini' : '通用'} 算法处理图片...</span>
        </div>
      ),
      duration: 1000000,
    });

    try {
      const ext = image.filename.split('.').pop() || 'png';
      const baseName = image.filename.replace(/\.[^/.]+$/, '');
      const lastSeparator = Math.max(
        image.absolute_path.lastIndexOf('/'),
        image.absolute_path.lastIndexOf('\\')
      );
      const outputDir = image.absolute_path.substring(0, lastSeparator + 1);
      
      // 临时文件名
      const tempPath = `${outputDir}${baseName}_temp_${Date.now()}.${ext}`;

      let success = false;

      // 使用选择的算法移除水印
      if (algorithm === 'gemini') {
        const result = await geminiWatermarkApi.autoRemove(
          image.absolute_path,
          tempPath
        );
        success = result.success;
      } else {
        // 其他情况使用通用算法
        const result = await watermarkApi.remove(
          image.absolute_path,
          tempPath,
          undefined
        );
        success = result.success;
      }

      if (success) {
        try {
          // 移动原图到应用回收站
          const { join } = await import("@tauri-apps/api/path");
      const { getAppRoot } = await import("@/lib/pathUtils");
          
          const appDir = await getAppRoot();
          const trashDir = await join(appDir, "trash");
          
          // 确保回收站目录存在
          if (!(await exists(trashDir))) {
            await mkdir(trashDir, { recursive: true });
          }
          
          // 生成回收站中的文件名（带时间戳避免冲突）
          const timestamp = Date.now();
          const trashFileName = `${baseName}_${timestamp}.${ext}`;
          const trashPath = await join(trashDir, trashFileName);
          
          // 移动原图到回收站
          await rename(image.absolute_path, trashPath);
          
          // 重命名临时文件为原文件名
          await rename(tempPath, image.absolute_path);
          
          setImageTimestamp(Date.now());

          toast({
            title: "✓ 水印移除成功",
            description: "原图已移至回收站",
          });
          onWatermarkRemoved?.(image.id, image.absolute_path);
        } catch (error) {
          console.error("Failed to replace file:", error);
          toast({
            title: "✗ 替换文件失败",
            description: String(error),
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "✗ 水印移除失败",
          description: "水印移除算法未能成功处理图片",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Watermark removal failed:", error);
      toast({
        title: "✗ 水印移除失败",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setRemoving(false);
      loadingToast.dismiss();
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleting) return;
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
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
      await revealFileInFolder(image.absolute_path);
    } catch (error) {
      console.error("Failed to open folder:", error);
      toast({
        title: "✗ 打开文件夹失败",
        description: String(error),
        variant: "destructive",
      });
    }
  };



  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    const container = target.parentElement;
    setImageLoaded(true);

    if (
      container &&
      target.naturalWidth > 0 &&
      target.naturalHeight > 0 &&
      (target.naturalWidth < container.clientWidth || target.naturalHeight < container.clientHeight)
    ) {
      setNaturalDisplaySize({
        width: target.naturalWidth,
        height: target.naturalHeight,
      });
    } else {
      setNaturalDisplaySize(null);
    }
  };

  const imageSizingClass = naturalDisplaySize
    ? "max-w-full max-h-full w-auto h-auto object-contain"
    : `w-full h-full ${showFullImage ? "object-contain" : "object-cover"}`;
  const naturalImageStyle: CSSProperties | undefined = naturalDisplaySize
    ? {
        maxWidth: `min(100%, ${naturalDisplaySize.width}px)`,
        maxHeight: `min(100%, ${naturalDisplaySize.height}px)`,
      }
    : undefined;

  const getStatusBadge = () => {
    if (image.status === "archived") {
      return null;
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
  const watermarkPlatform = image.watermark_platform;

  // ── List mode ──────────────────────────────────────────────────────────────
  if (listMode) {
    return (
      <>
        <TooltipProvider>
        <Card
          className={`group relative flex items-center gap-3 px-3 py-2 cursor-pointer transition-all hover:shadow-sm shadow-[0_1px_0_0_hsl(var(--border))] ${
            isSelected ? "!shadow-[0_0_0_2px_hsl(var(--primary))]" : ""
          }`}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
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
          <div className="flex-shrink-0 w-12 h-12 rounded-md overflow-hidden bg-muted relative flex items-center justify-center">
            {imageError ? (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-muted-foreground" />
              </div>
            ) : (
              <img
                src={`${convertFileSrc(image.absolute_path)}?t=${imageTimestamp}`}
                alt={image.filename}
                className={`${imageSizingClass} transition-opacity ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                style={naturalImageStyle}
                onLoad={handleImageLoad}
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
              {isAvatar && (
                <Badge className="bg-primary text-primary-foreground font-semibold text-[10px] py-0.5 px-2 shadow-sm pointer-events-none select-none">
                  头像
                </Badge>
              )}
              {isEmoji && (
                <Badge className="bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[10px] py-0.5 px-2 shadow-sm pointer-events-none select-none border-none">
                  表情
                </Badge>
              )}
              {image.format && (
                <Badge variant="secondary" className="text-xs font-mono uppercase">
                  {image.format}
                </Badge>
              )}
              {isPromptImage(image) && image.models.slice(0, 2).map((model) => (
                <Badge key={model.id} variant="secondary" className="text-xs">
                  {model.name}{model.is_primary && " ★"}
                </Badge>
              ))}
              {image.tags.slice(0, 3).map((tag) => (
                <Badge key={tag.id} variant="outline" className="text-xs">
                  {tag.name}
                </Badge>
              ))}
              {getWatermarkBadge()}
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
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleView}>
                  <Eye className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>查看</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={(e) => { e.stopPropagation(); openQuickEdit(image.id); }}>
                  <Edit className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>编辑</TooltipContent>
            </Tooltip>



            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={removing} onClick={(e) => e.stopPropagation()}>
                      {removing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eraser className="w-3 h-3" />}
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>去除水印</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={(e) => handleRemoveWatermark(e, 'gemini')}>
                  去除 Gemini 水印 (精确反算)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => handleRemoveWatermark(e, 'general')}>
                  通用算法移除 (模糊擦除)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {!isPrompt && image.format?.toLowerCase() !== 'webp' && (
              <TooltipProvider delayDuration={200}>
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={convertingToWebp} onClick={(e) => e.stopPropagation()}>
                          {convertingToWebp ? <Loader2 className="w-3 h-3 animate-spin" /> : <Minimize className="w-3 h-3" />}
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>图片优化</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={(e) => handleConvertFormat(e as any, 'webp')}>
                      转为 WebP
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => handleConvertFormat(e as any, 'png')}>
                      转为 PNG-24
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TooltipProvider>
            )}


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
                  className={`h-7 w-7 ${image.status === "archived" ? "text-blue-500 hover:text-blue-600 hover:bg-blue-50" : ""}`}
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
        className={`group relative overflow-hidden cursor-pointer transition-all hover:shadow-md shadow-[0_0_0_1px_hsl(var(--border))] ${
          isSelected ? "!shadow-[0_0_0_2px_hsl(var(--primary))]" : ""
        }`}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
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

      {/* Watermark and Avatar indicators */}
      <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1.5">
        {isAvatar && (
          <Badge className="bg-primary hover:bg-primary text-primary-foreground pointer-events-none select-none text-[10px] py-0.5 px-2 shadow-sm font-semibold">
            头像
          </Badge>
        )}
        {isEmoji && (
          <Badge className="bg-orange-500 hover:bg-orange-600 text-white pointer-events-none select-none text-[10px] py-0.5 px-2 shadow-sm font-semibold border-none animate-in fade-in zoom-in-95 duration-150">
            表情
          </Badge>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleWatermarkToggle}
              disabled={isUpdatingWatermark}
              className={`cursor-pointer transition-opacity duration-200 ${
                image.has_watermark
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100"
              }`}
            >
              {image.has_watermark ? (
                <Badge variant="destructive" className="text-xs hover:bg-red-600 transition-colors shadow-sm">
                  {isUpdatingWatermark ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    "水印"
                  )}
                </Badge>
              ) : image.has_watermark === false ? (
                <Badge
                  variant="outline"
                  className="text-xs bg-green-50 hover:bg-green-100 text-green-700 border-green-200 transition-colors shadow-sm"
                >
                  {isUpdatingWatermark ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : null}
                  无水印
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-xs bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200 border-dashed transition-colors shadow-sm"
                >
                  {isUpdatingWatermark ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : null}
                  未标注
                </Badge>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end">
            <p>
              {image.has_watermark
                ? `点击切换为无水印状态 (检测到 ${watermarkPlatform || "未知"} 水印)`
                : image.has_watermark === false
                ? "点击切换为有水印状态"
                : "点击标记为有水印状态"}
            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Image preview */}
      <div className="w-full pb-[100%] h-0 bg-muted relative">
        <div className="absolute inset-0 flex items-center justify-center">
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
              src={`${convertFileSrc(image.absolute_path)}?t=${imageTimestamp}`}
              alt={image.filename}
              className={`${imageSizingClass} transition-opacity ${
                imageLoaded ? "opacity-100" : "opacity-0"
              }`}
              style={naturalImageStyle}
              onLoad={handleImageLoad}
              onError={() => setImageError(true)}
            />
          )}
          
          {/* Format, Models & Tags badges */}
          <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-end gap-1.5 z-10 pointer-events-none px-1">
            {image.format && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono uppercase bg-black/70 text-white border-0">
                {image.format}
              </Badge>
            )}
            {isPromptImage(image) && image.models.slice(0, 2).map((model) => (
              <Badge key={model.id} variant="secondary" className="text-[10px] px-1.5 py-0 bg-black/70 text-white border-0 pointer-events-auto shadow-sm backdrop-blur-sm">
                {model.name}
                {model.is_primary && " ★"}
              </Badge>
            ))}
            {isPromptImage(image) && image.models.length > 2 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-black/70 text-white border-0 cursor-help pointer-events-auto shadow-sm backdrop-blur-sm">
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
            {image.tags.slice(0, 3).map((tag) => (
              <Badge 
                key={tag.id} 
                className="text-[9px] px-1.5 py-0 bg-primary/90 text-primary-foreground border-none shadow-sm pointer-events-auto"
              >
                {tag.name}
              </Badge>
            ))}
            {image.tags.length > 3 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge 
                    className="text-[9px] px-1.5 py-0 bg-primary/90 text-primary-foreground border-none cursor-help pointer-events-auto shadow-sm"
                  >
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
        </div>
      </div>

      {/* Hover overlay - covers entire card */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10" />

      {/* Info */}
      <div className="p-3 space-y-2">
        {/* Filename */}
        <p className="text-sm font-medium truncate" title={image.filename}>
          {image.filename}
        </p>




        {/* Status & Size */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {getStatusBadge()}
          </div>
          {image.file_size && (
            <span className="text-xs text-muted-foreground">
              {formatFileSize(image.file_size)}
            </span>
          )}
        </div>
      </div>

      {/* Hover menu */}
      <div
        className={`absolute bottom-3 left-3 right-3 z-20 transition-opacity pointer-events-none ${
          showMenu ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <div className="ml-auto flex flex-col w-fit max-w-full items-end gap-1.5 pointer-events-auto">
          {/* 上组：内容操作 */}
          <div className="flex gap-1 bg-background/95 dark:bg-background/95 rounded-md shadow-lg border p-1 backdrop-blur-sm">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleView}
                >
                  <Eye className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>查看</TooltipContent>
            </Tooltip>

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



            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={removing}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {removing ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Eraser className="w-3 h-3" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>去除水印</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={(e) => handleRemoveWatermark(e, 'gemini')}>
                  去除 Gemini 水印 (精确反算)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => handleRemoveWatermark(e, 'general')}>
                  通用算法移除 (模糊擦除)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* 下组：管理操作 */}
          <div className="flex gap-1 bg-background/95 dark:bg-background/95 rounded-md shadow-lg border p-1 backdrop-blur-sm">
            {!isPrompt && image.format?.toLowerCase() !== 'webp' && (
              <TooltipProvider delayDuration={200}>
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={convertingToWebp} onClick={(e) => e.stopPropagation()}>
                          {convertingToWebp ? <Loader2 className="w-3 h-3 animate-spin" /> : <Minimize className="w-3 h-3" />}
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>图片优化</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={(e) => handleConvertFormat(e as any, 'webp')}>
                      转为 WebP
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => handleConvertFormat(e as any, 'png')}>
                      转为 PNG-24
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TooltipProvider>
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
