import { useEffect, useState, useMemo } from "react";
import { useImageStore, useUIStore, useVendorStore } from "@/stores";
import { imageApi, vendorApi } from "@/services/tauri";
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
  Trash2,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Filter,
  Check,
  AlertCircle,
  RefreshCw,
  X,
  ChevronDown,
} from "lucide-react";
import ImageCard from "./ImageCard";
import DropZone from "./DropZone";
import BatchEditModal from "./BatchEditModal";
import ConfirmDialog from "./ConfirmDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
  const [isConvertingWebp, setIsConvertingWebp] = useState(false);
  const [archiveResult, setArchiveResult] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [isUpdatingWatermark, setIsUpdatingWatermark] = useState(false);
  const [batchDeleteStep, setBatchDeleteStep] = useState(0);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

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

  const executeArchive = async () => {
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
        const { getAppRoot } = await import("@/lib/pathUtils");
        libraryPath = await getAppRoot();
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
      setShowArchiveConfirm(false);
    }
  };

  const handleArchive = () => {
    if (selectedImages.length > 10) {
      setShowArchiveConfirm(true);
    } else {
      void executeArchive();
    }
  };

  // Handle import button click
  const handleImportClick = () => {
    setShowImportDialog(true);
  };

  // Batch watermark detection
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

    const handleBatchConvertFormat = async (format: 'webp' | 'png') => {
    if (selectedImages.length === 0) return;
    setIsConvertingWebp(true);
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    const formatName = format === 'webp' ? 'WebP' : 'PNG';
    const loadingToast = toast({
      title: `正在批量转为 ${formatName}`,
      description: "图片压缩优化中...",
      duration: 100000,
    });

    try {
      const { convertImageToWebp, convertImageToPng } = await import("@/lib/webpConverter");
      
      const currentImages = inboxImages;

      for (const imageId of selectedImages) {
        const image = currentImages.find((img) => img.id === imageId);
        if (!image) continue;
        
        if (image.format?.toLowerCase() === format) {
          skippedCount++;
          continue;
        }

        try {
          if (format === 'webp') {
            await convertImageToWebp(image as any);
          } else {
            await convertImageToPng(image as any);
          }
          successCount++;
        } catch (error) {
          console.error(`Failed to convert ${imageId} to ${format}:`, error);
          failCount++;
        }
      }

      toast({
        title: successCount > 0 ? "✓ 转换完成" : "转换结果",
        description: `成功: ${successCount} | 跳过: ${skippedCount} | 失败: ${failCount}`,
        variant: failCount > 0 ? "destructive" : "default",
      });
    } catch (error) {
      toast({
        title: "✗ 批量转换失败",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsConvertingWebp(false);
      loadingToast.dismiss();
      clearSelection();
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
        const { getAppRoot } = await import("@/lib/pathUtils");
        libraryPath = await getAppRoot();
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

  const [sortBy, setSortBy] = useState<"time" | "size">("time");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const sortedImages = useMemo(() => {
    const result = [...filteredImages];
    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "time") {
        const dateA = a.created_at || "";
        const dateB = b.created_at || "";
        comparison = dateA.localeCompare(dateB);
      } else if (sortBy === "size") {
        const sizeA = a.file_size || 0;
        const sizeB = b.file_size || 0;
        comparison = sizeA - sizeB;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
    return result;
  }, [filteredImages, sortBy, sortOrder]);

  const isAllSelected = sortedImages.length > 0 && 
    sortedImages.every((img) => selectedImages.includes(img.id));

  const handleSelectAll = () => {
    if (isAllSelected) {
      clearSelection();
    } else {
      selectAll(sortedImages.map((img) => img.id));
    }
  };

  // Stats
  const inboxCount = inboxImages.length;
  const taggedCount = inboxImages.filter((img) => img.status === "tagged").length;
  const untaggedCount = inboxImages.filter((img) => img.status === "inbox").length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center justify-between bg-card shadow-sm z-10">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Inbox className="w-5 h-5" />
            待整理
          </h2>
          <Button variant="default" size="sm" className="gap-2" onClick={handleImportClick}>
            <Upload className="w-4 h-4" />
            导入
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={loadInboxImages} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            刷新
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
              className="pl-9 pr-9 w-80"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
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

          {/* 排序 */}
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [by, order] = e.target.value.split("-") as [("time" | "size"), ("asc" | "desc")];
              setSortBy(by);
              setSortOrder(order);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground focus:text-foreground cursor-pointer"
          >
            <option value="time-desc">时间降序 (最新)</option>
            <option value="time-asc">时间升序 (最早)</option>
            <option value="size-desc">大小降序 (从大到小)</option>
            <option value="size-asc">大小升序 (从小到大)</option>
          </select>

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
              <label className="text-xs font-medium text-muted-foreground">Prompt 模板关联</label>
              <select
                value={filterHasPrompt === null ? "" : String(filterHasPrompt)}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilterHasPrompt(val === "" ? null : val === "true");
                }}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground focus:text-foreground cursor-pointer"
              >
                <option value="">全部</option>
                <option value="true">已关联</option>
                <option value="false">未关联</option>
              </select>
            </div>

            {/* Tags 筛选 */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">标签</label>
              <select
                value={filterHasTags === null ? "" : String(filterHasTags)}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilterHasTags(val === "" ? null : val === "true");
                }}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground focus:text-foreground cursor-pointer"
              >
                <option value="">全部</option>
                <option value="false">无标签</option>
                <option value="true">有标签</option>
              </select>
            </div>

            {/* 水印筛选 */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">水印</label>
              <select
                value={filterHasWatermark === null ? "" : String(filterHasWatermark)}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilterHasWatermark(val === "" ? null : val === "true");
                }}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground focus:text-foreground cursor-pointer"
              >
                <option value="">全部</option>
                <option value="true">有水印</option>
                <option value="false">无水印</option>
              </select>
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
                <span className="text-sm text-muted-foreground flex items-center gap-1 border-r pr-3 mr-1">
                  已选择 {selectedImages.length} 张
                  <button onClick={clearSelection} className="text-muted-foreground hover:text-foreground p-0.5 rounded-md hover:bg-muted transition-colors" title="清空选中">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
                <Button variant="ghost" size="sm" className="gap-1 h-7"
                  onClick={() => setShowBatchEdit(true)}>
                  <Edit className="w-3 h-3" />
                  批量编辑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 h-7 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  onClick={handleArchive}
                  disabled={isArchiving}
                >
                  {isArchiving ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Archive className="w-3 h-3" />
                  )}
                  批量归档
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 h-7"
                      disabled={isUpdatingWatermark}
                    >
                      {isUpdatingWatermark ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <AlertCircle className="w-3 h-3 text-orange-500" />
                      )}
                      标记水印
                      <ChevronDown className="w-3 h-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      onClick={() => handleBatchSetWatermark(true)}
                      className="text-orange-600 dark:text-orange-400 cursor-pointer"
                    >
                      <AlertCircle className="w-3.5 h-3.5 mr-2" />
                      标记有水印
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleBatchSetWatermark(false)}
                      className="text-green-600 dark:text-green-400 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 mr-2" />
                      标记无水印
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 h-7"
                      disabled={isConvertingWebp}
                    >
                      {isConvertingWebp ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ImageIcon className="w-3 h-3" />
                      )}
                      批量图片优化
                      <ChevronDown className="w-3 h-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => handleBatchConvertFormat('webp')}>转为 WebP</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBatchConvertFormat('png')}>转为 PNG-24</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
                {sortedImages.map((image) => (
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
                {sortedImages.map((image) => (
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
        confirmText={selectedImages.length > 10 ? "继续" : "确认删除"}
        cancelText="取消"
        variant="destructive"
        onConfirm={() => {
          if (selectedImages.length > 10) {
            setBatchDeleteStep(2);
          } else {
            void executeBatchDelete();
          }
        }}
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

      {/* Batch Archive Confirmation */}
      <ConfirmDialog
        open={showArchiveConfirm}
        title="确认批量归档"
        description={`您选择了一次性归档 ${selectedImages.length} 张图片。请确认这些图片已正确标记了“厂商”与“模型”。是否继续归档？`}
        confirmText="确认归档"
        cancelText="取消"
        onConfirm={executeArchive}
        onCancel={() => setShowArchiveConfirm(false)}
      />
    </div>
  );
}
