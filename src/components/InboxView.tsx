import { useEffect, useState } from "react";
import { useImageStore, useUIStore, useVendorStore } from "@/stores";
import { imageApi, vendorApi, watermarkApi } from "@/services/tauri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Inbox, 
  Archive, 
  Upload, 
  Search, 
  CheckSquare, 
  Square,
  Tag,
  FolderOpen,
  Loader2,
  Scan,
} from "lucide-react";
import ImageCard from "./ImageCard";
import DropZone from "./DropZone";

export default function InboxView() {
  const { 
    inboxImages, 
    selectedImages, 
    isLoading, 
    setInboxImages, 
    setLoading,
    selectAll,
    clearSelection,
    removeImage,
  } = useImageStore();

  const { searchQuery, setSearchQuery } = useUIStore();
  const { setVendors } = useVendorStore();

  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveResult, setArchiveResult] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionProgress, setDetectionProgress] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  useEffect(() => {
    loadInboxImages();
    loadVendors();
  }, []);

  const loadInboxImages = async () => {
    setLoading(true);
    try {
      const images = await imageApi.getInboxImages();
      setInboxImages(images);
    } catch (error) {
      console.error("Failed to load inbox images:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadVendors = async () => {
    try {
      const data = await vendorApi.getAll();
      setVendors(data);
    } catch (error) {
      console.error("Failed to load vendors:", error);
    }
  };

  const handleArchive = async () => {
    if (selectedImages.length === 0) return;

    setIsArchiving(true);
    setArchiveResult(null);

    try {
      // Get library path from app data dir
      const { appDataDir } = await import("@tauri-apps/api/path");
      const appDir = await appDataDir();
      const libraryPath = appDir;

      const result = await imageApi.archive(selectedImages, libraryPath);

      if (result.success_count > 0) {
        // Remove archived images from inbox
        for (const id of selectedImages) {
          removeImage(id);
        }
        clearSelection();

        let msg = `成功归档 ${result.success_count} 张图片`;
        if (result.skipped_count > 0) msg += `，跳过 ${result.skipped_count} 张`;
        if (result.failed_count > 0) msg += `，失败 ${result.failed_count} 张`;
        setArchiveResult(msg);
      } else if (result.skipped_count > 0) {
        setArchiveResult(`跳过了 ${result.skipped_count} 张图片（已归档或缺少信息）`);
      }

      // Clear message after 5 seconds
      setTimeout(() => setArchiveResult(null), 5000);
    } catch (error) {
      console.error("Archive failed:", error);
      setArchiveResult("归档失败，请检查图片是否已标记厂商和模型");
      setTimeout(() => setArchiveResult(null), 5000);
    } finally {
      setIsArchiving(false);
    }
  };

  // Handle import button click
  const handleImportClick = () => {
    setShowImportDialog(true);
  };

  // Batch watermark detection
  const handleBatchDetect = async () => {
    if (selectedImages.length === 0) return;

    setIsDetecting(true);
    setDetectionProgress("正在检测水印...");

    try {
      const selectedImagePaths = inboxImages
        .filter((img) => selectedImages.includes(img.id))
        .map((img) => img.absolute_path);

      const results = await watermarkApi.batchDetect(selectedImagePaths);

      let watermarkCount = 0;
      results.forEach((result, index) => {
        if (result.has_watermark) {
          watermarkCount++;
          console.log(
            `Image ${index + 1}: Watermark detected - ${result.platform} (${(result.confidence * 100).toFixed(0)}%)`
          );
        }
      });

      setDetectionProgress(`检测完成！发现 ${watermarkCount}/${results.length} 张图片有水印`);
      setTimeout(() => setDetectionProgress(null), 5000);
    } catch (error) {
      console.error("Batch detection failed:", error);
      setDetectionProgress("批量检测失败");
      setTimeout(() => setDetectionProgress(null), 3000);
    } finally {
      setIsDetecting(false);
    }
  };

  // Filter images by search query
  const filteredImages = inboxImages.filter((image) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      image.filename.toLowerCase().includes(query) ||
      image.prompt?.toLowerCase().includes(query) ||
      image.tags.some((tag) => tag.name.toLowerCase().includes(query))
    );
  });

  const isAllSelected = filteredImages.length > 0 && 
    filteredImages.every((img) => selectedImages.includes(img.id));

  const handleSelectAll = () => {
    if (isAllSelected) {
      clearSelection();
    } else {
      selectAll();
    }
  };

  // Stats
  const inboxCount = inboxImages.length;
  const taggedCount = inboxImages.filter((img) => img.status === "tagged").length;
  const untaggedCount = inboxImages.filter((img) => img.status === "inbox").length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center justify-between bg-background">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Inbox className="w-5 h-5" />
            收件箱
          </h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{inboxCount} 张图片</Badge>
            {taggedCount > 0 && (
              <Badge variant="outline" className="text-green-600">已标记 {taggedCount}</Badge>
            )}
            {untaggedCount > 0 && (
              <Badge variant="outline" className="text-orange-600">未标记 {untaggedCount}</Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索图片..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-64"
            />
          </div>

          <Button variant="outline" size="sm" className="gap-2" onClick={handleImportClick}>
            <Upload className="w-4 h-4" />
            导入
          </Button>
          {selectedImages.length > 0 && (
            <Button
              size="sm"
              className="gap-2"
              onClick={handleArchive}
              disabled={isArchiving}
            >
              {isArchiving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Archive className="w-4 h-4" />
              )}
              归档 ({selectedImages.length})
            </Button>
          )}
        </div>
      </div>

      {/* Archive result notification */}
      {archiveResult && (
        <div className="px-4 py-2 bg-green-50 border-b border-green-200 text-green-800 text-sm">
          {archiveResult}
        </div>
      )}

      {/* Detection progress notification */}
      {detectionProgress && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 text-blue-800 text-sm">
          {detectionProgress}
        </div>
      )}

      {/* Toolbar */}
      {filteredImages.length > 0 && (
        <div className="border-b px-4 py-2 flex items-center gap-4 bg-muted/30">
          <button
            onClick={handleSelectAll}
            className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
          >
            {isAllSelected ? (
              <CheckSquare className="w-4 h-4" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            {isAllSelected ? "取消全选" : "全选"}
          </button>

          {selectedImages.length > 0 && (
            <>
              <span className="text-sm text-muted-foreground">
                已选择 {selectedImages.length} 张
              </span>
              <Button variant="ghost" size="sm" className="gap-1 h-7">
                <Tag className="w-3 h-3" />
                批量打标签
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 h-7"
                onClick={handleBatchDetect}
                disabled={isDetecting}
              >
                {isDetecting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Scan className="w-3 h-3" />
                )}
                批量检测水印
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 h-7"
                onClick={handleArchive}
                disabled={isArchiving}
              >
                {isArchiving ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <FolderOpen className="w-3 h-3" />
                )}
                批量归档
              </Button>
            </>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-square rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : filteredImages.length === 0 ? (
          <DropZone onImportComplete={loadInboxImages} />
        ) : (
          <ScrollArea className="h-full">
            <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredImages.map((image) => (
                <ImageCard key={image.id} image={image} />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Import Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowImportDialog(false)} />
          <div className="relative z-10 bg-background rounded-lg border shadow-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">导入图片</h3>
            <div className="space-y-3">
              <DropZone onImportComplete={() => {
                loadInboxImages();
                setShowImportDialog(false);
              }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
