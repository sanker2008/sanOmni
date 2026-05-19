import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useImageStore, useUIStore, type ImageWithRelations } from "@/stores";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Circle,
  Edit,
  Archive,
  Image as ImageIcon,
  Scan,
  Loader2,
  Eraser,
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
}

export default function ImageCard({ image, onWatermarkDetected, onWatermarkRemoved }: ImageCardProps) {
  const { selectedImages, selectImage, deselectImage } = useImageStore();
  const { openQuickEdit } = useUIStore();
  const showMenu = false;
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [watermarkResult, setWatermarkResult] = useState<{
    has_watermark: boolean;
    platform?: string;
    confidence: number;
    watermark_region?: { x: number; y: number; width: number; height: number };
  } | null>(null);

  const isSelected = selectedImages.includes(image.id);

  const handleClick = () => {
    if (isSelected) {
      deselectImage(image.id);
    } else {
      selectImage(image.id);
    }
  };

  const handleDoubleClick = () => {
    openQuickEdit(image.id);
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

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = () => {
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

  return (
    <Card
      className={`group relative overflow-hidden cursor-pointer transition-all hover:shadow-md ${
        isSelected ? "ring-2 ring-primary" : ""
      }`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* Selection indicator */}
      <div className="absolute top-2 left-2 z-10">
        <button
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
          <TooltipProvider>
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
          </TooltipProvider>
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
              <Badge variant="secondary" className="text-xs">
                +{image.models.length - 2}
              </Badge>
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
              <Badge variant="outline" className="text-xs">
                +{image.tags.length - 3}
              </Badge>
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
        <div className="flex items-center gap-1 bg-white rounded-md shadow-sm border p-1">
          <TooltipProvider>
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
          </TooltipProvider>

          <TooltipProvider>
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
          </TooltipProvider>

          {showWatermarkBadge && (
            <TooltipProvider>
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
            </TooltipProvider>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    // TODO: Archive
                  }}
                >
                  <Archive className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>归档</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </Card>
  );
}
