import { useEffect, useState } from "react";
import { useImageStore, useUIStore, useVendorStore } from "@/stores";
import { imageApi, vendorApi, watermarkApi } from "@/services/tauri";
import { toast } from "@/hooks/useToast";
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
  Edit,
  Loader2,
  Scan,
  Trash2,
  LayoutGrid,
  List,
  Filter,
  Check,
  AlertCircle,
} from "lucide-react";
import ImageCard from "./ImageCard";
import DropZone from "./DropZone";
import BatchEditModal from "./BatchEditModal";
import ConfirmDialog from "./ConfirmDialog";

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
    deselectImage,
    updateImage,
  } = useImageStore();

  const { searchQuery, setSearchQuery, viewMode, setViewMode } = useUIStore();
  const { setVendors } = useVendorStore();

  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveResult, setArchiveResult] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [isUpdatingWatermark, setIsUpdatingWatermark] = useState(false);
  const [batchDeleteStep, setBatchDeleteStep] = useState(0);

  const handleBatchSetWatermark = async (hasWatermark: boolean) => {
    if (selectedImages.length === 0) return;

    setIsUpdatingWatermark(true);
    let successCount = 0;
    let failCount = 0;

    for (const imageId of selectedImages) {
      const image = inboxImages.find((img) => img.id === imageId);
      if (!image) continue;

      try {
        const updated = await imageApi.update({
          image_id: imageId,
          model_ids: image.models.map((m) => m.id),
          primary_model_id: image.models.find((m) => m.is_primary)?.id || undefined,
          tags: image.tags.map((t) => t.name),
          has_watermark: hasWatermark,
          watermark_platform: hasWatermark ? "unknown" : undefined,
        });

        updateImage(imageId, updated);
        successCount++;
      } catch (err) {
        console.error(`Failed to update watermark for image ${imageId}:`, err);
        failCount++;
      }
    }

    setIsUpdatingWatermark(false);
    clearSelection();
    
    toast({
      title: `✓ 批量修改水印完成`,
      description: `已成功标记 ${successCount} 张图片，失败 ${failCount} 张`,
      variant: failCount > 0 ? "destructive" : "default",
    });
  };

  // 筛选器状态
  const [showFilters, setShowFilters] = useState(false);
  const [filterHasPrompt, setFilterHasPrompt] = useState<boolean | null>(null); // null = 不筛选
  const [filterHasTags, setFilterHasTags] = useState<boolean | null>(null);
  const [filterHasWatermark, setFilterHasWatermark] = useState<boolean | null>(null);
  const activeFilterCount = [filterHasPrompt, filterHasTags, filterHasWatermark].filter(
    (filter) => filter !== null
  ).length;

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
      // 使用自定义归档路径或默认路径
      let libraryPath: string;
      const customPath = useUIStore.getState().settings.customArchivedPath;
      
      if (customPath) {
        libraryPath = customPath;
        console.log("Using custom archived path:", libraryPath);
      } else {
        const { appDataDir } = await import("@tauri-apps/api/path");
        libraryPath = await appDataDir();
        console.log("Using default archived path:", libraryPath);
      }

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

    try {
      const selectedImagePaths = inboxImages
        .filter((img) => selectedImages.includes(img.id))
        .map((img) => img.absolute_path);

      const results = await watermarkApi.batchDetect(selectedImagePaths);

      let watermarkCount = 0;
      const detectedPlatforms: { [key: string]: number } = {};
      
      results.forEach((result, index) => {
        if (result.has_watermark) {
          watermarkCount++;
          const platform = result.platform || "未知";
          detectedPlatforms[platform] = (detectedPlatforms[platform] || 0) + 1;
          console.log(
            `Image ${index + 1}: Watermark detected - ${result.platform} (${(result.confidence * 100).toFixed(0)}%)`
          );
        }
      });

      // 显示汇总结果
      if (watermarkCount > 0) {
        const platformSummary = Object.entries(detectedPlatforms)
          .map(([platform, count]) => `${platform}: ${count}`)
          .join(", ");
        
        toast({
          title: `✓ 批量检测完成`,
          description: `发现 ${watermarkCount}/${results.length} 张图片有水印\n${platformSummary}`,
          variant: "default",
        });
      } else {
        toast({
          title: "✓ 批量检测完成",
          description: `检测了 ${results.length} 张图片，未发现水印`,
          variant: "success",
        });
      }
    } catch (error) {
      console.error("Batch detection failed:", error);
      toast({
        title: "✗ 批量检测失败",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsDetecting(false);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    try {
      const success = await imageApi.delete(imageId);
      if (success) {
        removeImage(imageId);
        // If the image was selected, deselect it
        if (selectedImages.includes(imageId)) {
          deselectImage(imageId);
        }
      }
    } catch (error) {
      console.error("Failed to delete image:", error);
      toast({
        title: "✗ 删除图片失败",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const handleBatchDelete = () => {
    if (selectedImages.length === 0) return;
    setBatchDeleteStep(1);
  };

  const executeBatchDelete = async () => {
    setBatchDeleteStep(0);

    let successCount = 0;
    let failCount = 0;

    for (const imageId of selectedImages) {
      try {
        const success = await imageApi.delete(imageId);
        if (success) {
          removeImage(imageId);
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error(`Failed to delete image ${imageId}:`, error);
        failCount++;
      }
    }

    clearSelection();

    if (failCount > 0) {
      toast({
        title: "删除完成",
        description: `成功 ${successCount} 张，失败 ${failCount} 张`,
        variant: failCount === selectedImages.length ? "destructive" : "default",
      });
    }
  };

  const handleArchiveSingle = async (imageId: string) => {
    setIsArchiving(true);
    setArchiveResult(null);

    try {
      // 使用自定义归档路径或默认路径
      let libraryPath: string;
      const customPath = useUIStore.getState().settings.customArchivedPath;
      
      if (customPath) {
        libraryPath = customPath;
      } else {
        const { appDataDir } = await import("@tauri-apps/api/path");
        libraryPath = await appDataDir();
      }

      const result = await imageApi.archive([imageId], libraryPath);

      if (result.success_count > 0) {
        removeImage(imageId);
        deselectImage(imageId);
        setArchiveResult(`成功归档 1 张图片`);
      } else if (result.skipped_count > 0) {
        setArchiveResult(`图片已归档或缺少信息（厂商/模型）`);
      } else {
        setArchiveResult(`归档失败：${result.errors.join(', ')}`);
      }

      // Clear message after 3 seconds
      setTimeout(() => setArchiveResult(null), 3000);
    } catch (error) {
      console.error("Archive failed:", error);
      setArchiveResult("归档失败，请检查图片是否已标记厂商和模型");
      setTimeout(() => setArchiveResult(null), 3000);
    } finally {
      setIsArchiving(false);
    }
  };

  // Filter images by search query
  const filteredImages = inboxImages.filter((image) => {
    // 搜索关键词过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase().trim();
      const keywords = query.split(/\s+/).filter(k => k.length > 0);
      
      const matchesSearch = keywords.every(keyword => {
        return (
          image.filename.toLowerCase().includes(keyword) ||
          image.format?.toLowerCase().includes(keyword) ||
          image.watermark_platform?.toLowerCase().includes(keyword) ||
          image.models.some((m) => m.name.toLowerCase().includes(keyword)) ||
          image.tags.some((tag) => tag.name.toLowerCase().includes(keyword)) ||
          image.prompt_groups.some((group) => group.prompt.toLowerCase().includes(keyword))
        );
      });
      
      if (!matchesSearch) return false;
    }
    
    // Prompt 筛选
    if (filterHasPrompt !== null) {
      const hasPrompt = image.prompt_groups.length > 0;
      if (hasPrompt !== filterHasPrompt) return false;
    }
    
    // Tags 筛选
    if (filterHasTags !== null) {
      const hasTags = image.tags.length > 0;
      if (hasTags !== filterHasTags) return false;
    }
    
    // 水印筛选
    if (filterHasWatermark !== null) {
      if (image.has_watermark !== filterHasWatermark) return false;
    }
    
    return true;
  });

  const isAllSelected = filteredImages.length > 0 && 
    filteredImages.every((img) => selectedImages.includes(img.id));

  const handleSelectAll = () => {
    if (isAllSelected) {
      clearSelection();
    } else {
      selectAll(filteredImages.map((img) => img.id));
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
            待整理
          </h2>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleImportClick}>
            <Upload className="w-4 h-4" />
            导入
          </Button>
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
              placeholder="搜索图片（文件名/模型/标签/格式...）"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-64"
            />
          </div>

          <Button
            variant={showFilters ? "default" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <Filter className="w-4 h-4" />
            筛选
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </Button>

          {/* 视图切换 */}
          <div className="flex items-center border rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              title="网格视图"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              title="列表视图"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

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

      {/* 筛选面板 */}
      {showFilters && (
        <div className="border-b px-4 py-3 bg-muted/20 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">筛选条件</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterHasPrompt(null);
                setFilterHasTags(null);
                setFilterHasWatermark(null);
              }}
              className="h-7 text-xs"
            >
              清除全部
            </Button>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            {/* Prompt 关联筛选 */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Prompt 关联</label>
              <div className="flex items-center gap-2">
                <Button
                  variant={filterHasPrompt === true ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterHasPrompt(filterHasPrompt === true ? null : true)}
                  className="flex-1 h-8 text-xs"
                >
                  已关联
                </Button>
                <Button
                  variant={filterHasPrompt === false ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterHasPrompt(filterHasPrompt === false ? null : false)}
                  className="flex-1 h-8 text-xs"
                >
                  未关联
                </Button>
              </div>
            </div>

            {/* Tags 筛选 */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">标签</label>
              <div className="flex items-center gap-2">
                <Button
                  variant={filterHasTags === true ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterHasTags(filterHasTags === true ? null : true)}
                  className="flex-1 h-8 text-xs"
                >
                  有标签
                </Button>
                <Button
                  variant={filterHasTags === false ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterHasTags(filterHasTags === false ? null : false)}
                  className="flex-1 h-8 text-xs"
                >
                  无标签
                </Button>
              </div>
            </div>

            {/* 水印筛选 */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">水印</label>
              <div className="flex items-center gap-2">
                <Button
                  variant={filterHasWatermark === true ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterHasWatermark(filterHasWatermark === true ? null : true)}
                  className="flex-1 h-8 text-xs"
                >
                  有水印
                </Button>
                <Button
                  variant={filterHasWatermark === false ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterHasWatermark(filterHasWatermark === false ? null : false)}
                  className="flex-1 h-8 text-xs"
                >
                  无水印
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Archive result notification */}
      {archiveResult && (
        <div className="px-4 py-2 bg-green-50 border-b border-green-200 text-green-800 text-sm">
          {archiveResult}
        </div>
      )}

      {/* Toolbar - Always reserve space */}
      <div className="border-b px-4 py-2 bg-muted/30 min-h-[44px] flex items-center">
        {filteredImages.length > 0 ? (
          <div className="flex items-center gap-4">
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
                <Button variant="ghost" size="sm" className="gap-1 h-7"
                  onClick={() => setShowBatchEdit(true)}>
                  <Edit className="w-3 h-3" />
                  批量编辑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 h-7 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                  onClick={() => handleBatchSetWatermark(false)}
                  disabled={isUpdatingWatermark}
                >
                  {isUpdatingWatermark ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Check className="w-3 h-3" />
                  )}
                  标记无水印
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 h-7 text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
                  onClick={() => handleBatchSetWatermark(true)}
                  disabled={isUpdatingWatermark}
                >
                  {isUpdatingWatermark ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <AlertCircle className="w-3 h-3" />
                  )}
                  标记有水印
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
                  onClick={handleBatchDelete}
                >
                  <Trash2 className="w-3 h-3" />
                  批量删除
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="h-[28px]" /> // Empty placeholder to maintain height
        )}
      </div>

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
            {viewMode === "grid" ? (
              <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredImages.map((image) => (
                  <ImageCard 
                    key={image.id} 
                    image={image}
                    onDelete={handleDeleteImage}
                    onArchive={handleArchiveSingle}
                  />
                ))}
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {filteredImages.map((image) => (
                  <ImageCard
                    key={image.id}
                    image={image}
                    onDelete={handleDeleteImage}
                    onArchive={handleArchiveSingle}
                    listMode
                  />
                ))}
              </div>
            )}
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

      {/* Batch Edit Modal */}
      <BatchEditModal open={showBatchEdit} onClose={() => setShowBatchEdit(false)} />

      {/* Batch Delete Confirmation - Step 1 */}
      <ConfirmDialog
        open={batchDeleteStep === 1}
        title="确认批量删除"
        description={`确定要删除选中的 ${selectedImages.length} 张图片吗？此操作不可恢复。`}
        confirmText="继续"
        cancelText="取消"
        variant="destructive"
        onConfirm={() => setBatchDeleteStep(2)}
        onCancel={() => setBatchDeleteStep(0)}
      />

      {/* Batch Delete Confirmation - Step 2 */}
      <ConfirmDialog
        open={batchDeleteStep === 2}
        title="⚠️ 最终确认"
        description={`【警告】您正在批量删除 ${selectedImages.length} 张图片！此操作将永久删除这些图片记录及源文件，无法撤销！`}
        confirmText="确认删除"
        cancelText="取消"
        variant="destructive"
        onConfirm={executeBatchDelete}
        onCancel={() => setBatchDeleteStep(0)}
      />
    </div>
  );
}
