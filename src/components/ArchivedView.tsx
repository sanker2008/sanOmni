import { useEffect, useState } from "react";
import { useImageStore, useUIStore, useVendorStore } from "@/stores";
import { imageApi, watermarkApi } from "@/services/tauri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Archive, 
  Search, 
  CheckSquare, 
  Square,
  FolderTree,
  ChevronRight,
  ChevronDown,
  Image as ImageIcon,
  Undo2,
  Loader2,
  Edit2,
  LayoutGrid,
  List,
  Filter,
  Scan,
  Trash2,
} from "lucide-react";
import ImageCard from "./ImageCard";
import { cn } from "@/lib/utils";

export default function ArchivedView() {
  const { 
    archivedImages, 
    selectedImages, 
    isLoading, 
    setArchivedImages, 
    setLoading,
    selectAll,
    clearSelection,
    removeImage,
    deselectImage,
  } = useImageStore();

  const { searchQuery, setSearchQuery, openSettings, setSettingsTab, viewMode, setViewMode } = useUIStore();
  const { vendors } = useVendorStore();

  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [isUnarchiving, setIsUnarchiving] = useState(false);
  const [unarchiveResult, setUnarchiveResult] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionProgress, setDetectionProgress] = useState<string | null>(null);

  // 筛选器状态
  const [showFilters, setShowFilters] = useState(false);
  const [filterHasPrompt, setFilterHasPrompt] = useState<boolean | null>(null);
  const [filterHasTags, setFilterHasTags] = useState<boolean | null>(null);
  const [filterHasWatermark, setFilterHasWatermark] = useState<boolean | null>(null);
  const activeFilterCount = [filterHasPrompt, filterHasTags, filterHasWatermark].filter(
    (filter) => filter !== null
  ).length;

  useEffect(() => {
    loadArchivedImages();
  }, []);

  const loadArchivedImages = async () => {
    setLoading(true);
    try {
      const images = await imageApi.getArchivedImages();
      setArchivedImages(images);
    } catch (error) {
      console.error("Failed to load archived images:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleVendor = (vendorId: string) => {
    const next = new Set(expandedVendors);
    if (next.has(vendorId)) {
      next.delete(vendorId);
    } else {
      next.add(vendorId);
    }
    setExpandedVendors(next);
  };

  // Filter images
  const filteredImages = archivedImages.filter((image) => {
    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase().trim();
      const keywords = query.split(/\s+/).filter(k => k.length > 0);
      
      const matchesSearch = keywords.every(keyword => {
        // 查找厂商名
        const vendor = vendors.find(v => v.id === image.storage_vendor_id);
        const vendorName = vendor?.name.toLowerCase() || "";
        
        return (
          image.filename.toLowerCase().includes(keyword) ||
          image.format?.toLowerCase().includes(keyword) ||
          image.watermark_platform?.toLowerCase().includes(keyword) ||
          vendorName.includes(keyword) ||
          image.models.some((m) => m.name.toLowerCase().includes(keyword)) ||
          image.tags.some((tag) => tag.name.toLowerCase().includes(keyword)) ||
          image.prompt_groups.some((group) => group.prompt.toLowerCase().includes(keyword))
        );
      });
      
      if (!matchesSearch) return false;
    }
    
    // 厂商/模型筛选
    if (selectedVendor && image.storage_vendor_id !== selectedVendor) return false;
    if (selectedModel && image.primary_model_id !== selectedModel) return false;
    
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

  // Count by vendor/model
  const getVendorCount = (vendorId: string) =>
    archivedImages.filter((img) => img.storage_vendor_id === vendorId).length;

  const getModelCount = (modelId: string) =>
    archivedImages.filter((img) => img.primary_model_id === modelId).length;

  const isAllSelected = filteredImages.length > 0 &&
    filteredImages.every((img) => selectedImages.includes(img.id));

  const handleUnarchive = async () => {
    if (selectedImages.length === 0) return;

    setIsUnarchiving(true);
    setUnarchiveResult(null);

    try {
      // 使用自定义 inbox 路径或默认路径
      let inboxPath: string;
      const customPath = useUIStore.getState().settings.customInboxPath;
      
      if (customPath) {
        inboxPath = customPath;
      } else {
        const { appDataDir } = await import("@tauri-apps/api/path");
        inboxPath = await appDataDir();
      }

      const result = await imageApi.unarchive(selectedImages, inboxPath);

      if (result.success_count > 0) {
        // Remove unarchived images from archived view
        for (const id of selectedImages) {
          removeImage(id);
        }
        clearSelection();

        let msg = `成功撤销归档 ${result.success_count} 张图片`;
        if (result.skipped_count > 0) msg += `，跳过 ${result.skipped_count} 张`;
        if (result.failed_count > 0) msg += `，失败 ${result.failed_count} 张`;
        setUnarchiveResult(msg);
      } else if (result.skipped_count > 0) {
        setUnarchiveResult(`跳过了 ${result.skipped_count} 张图片（未归档）`);
      }

      // Clear message after 5 seconds
      setTimeout(() => setUnarchiveResult(null), 5000);
    } catch (error) {
      console.error("Unarchive failed:", error);
      setUnarchiveResult("撤销归档失败");
      setTimeout(() => setUnarchiveResult(null), 5000);
    } finally {
      setIsUnarchiving(false);
    }
  };

  const handleUnarchiveSingle = async (imageId: string) => {
    setIsUnarchiving(true);
    setUnarchiveResult(null);

    try {
      // 使用自定义 inbox 路径或默认路径
      let inboxPath: string;
      const customPath = useUIStore.getState().settings.customInboxPath;
      
      if (customPath) {
        inboxPath = customPath;
      } else {
        const { appDataDir } = await import("@tauri-apps/api/path");
        inboxPath = await appDataDir();
      }

      const result = await imageApi.unarchive([imageId], inboxPath);

      if (result.success_count > 0) {
        removeImage(imageId);
        deselectImage(imageId);
        setUnarchiveResult(`成功撤销归档 1 张图片`);
      } else {
        setUnarchiveResult(`撤销归档失败：${result.errors.join(', ')}`);
      }

      // Clear message after 3 seconds
      setTimeout(() => setUnarchiveResult(null), 3000);
    } catch (error) {
      console.error("Unarchive failed:", error);
      setUnarchiveResult("撤销归档失败");
      setTimeout(() => setUnarchiveResult(null), 3000);
    } finally {
      setIsUnarchiving(false);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    try {
      const success = await imageApi.delete(imageId);
      if (success) {
        removeImage(imageId);
        if (selectedImages.includes(imageId)) {
          deselectImage(imageId);
        }
      }
    } catch (error) {
      console.error("Failed to delete image:", error);
      alert("删除图片失败");
    }
  };

  const handleBatchDetect = async () => {
    if (selectedImages.length === 0) return;

    setIsDetecting(true);
    setDetectionProgress("正在检测水印...");

    try {
      const selectedImagePaths = archivedImages
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

  const handleBatchDelete = async () => {
    if (selectedImages.length === 0) return;

    if (!confirm(`确定要删除选中的 ${selectedImages.length} 张图片吗？此操作不可恢复。`)) {
      return;
    }

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
      alert(`删除完成：成功 ${successCount} 张，失败 ${failCount} 张`);
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar - Vendor Tree */}
      <div className="w-56 border-r bg-muted/20 flex flex-col">
        <div className="p-3 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FolderTree className="w-4 h-4" />
            厂商分类
          </h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              setSettingsTab("vendors");
              openSettings();
            }}
            title="管理厂商"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            {/* All */}
            <button
              onClick={() => { setSelectedVendor(null); setSelectedModel(null); }}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                !selectedVendor ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
              )}
            >
              <span>全部</span>
              <Badge variant="secondary" className="text-xs">{archivedImages.length}</Badge>
            </button>

            {/* Vendor list */}
            {vendors.map((vendor) => {
              const isExpanded = expandedVendors.has(vendor.id);
              const count = getVendorCount(vendor.id);

              return (
                <div key={vendor.id}>
                  <button
                    onClick={() => {
                      toggleVendor(vendor.id);
                      setSelectedVendor(vendor.id === selectedVendor ? null : vendor.id);
                      setSelectedModel(null);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors mt-1",
                      selectedVendor === vendor.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      {vendor.name}
                    </span>
                    <Badge variant="secondary" className="text-xs">{count}</Badge>
                  </button>

                  {isExpanded && (
                    <div className="ml-4 mt-1 space-y-1">
                      {vendor.models.map((model) => {
                        const modelCount = getModelCount(model.id);

                        return (
                          <button
                            key={model.id}
                            onClick={() => setSelectedModel(model.id === selectedModel ? null : model.id)}
                            className={cn(
                              "w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs transition-colors",
                              selectedModel === model.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                            )}
                          >
                            <span>{model.name}</span>
                            <Badge variant="outline" className="text-xs">{modelCount}</Badge>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Archive className="w-5 h-5" />
              已归档
            </h2>
            <Badge variant="secondary">{filteredImages.length} 张图片</Badge>
            {selectedVendor && (
              <Button variant="ghost" size="sm" onClick={() => { setSelectedVendor(null); setSelectedModel(null); }}>
                清除筛选
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索（文件名/厂商/模型/标签/格式...）"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64"
              />
            </div>

            {/* 筛选按钮 */}
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

        {/* Unarchive result notification */}
        {unarchiveResult && (
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 text-blue-800 text-sm">
            {unarchiveResult}
          </div>
        )}

        {detectionProgress && (
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 text-blue-800 text-sm">
            {detectionProgress}
          </div>
        )}

        {/* Toolbar - Always reserve space */}
        <div className="border-b px-4 py-2 bg-muted/30 min-h-[44px] flex items-center">
          {filteredImages.length > 0 ? (
            <div className="flex items-center gap-4">
              <button
                onClick={() =>
                  isAllSelected ? clearSelection() : selectAll(filteredImages.map((img) => img.id))
                }
                className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
              >
                {isAllSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                {isAllSelected ? "取消全选" : "全选"}
              </button>
              {selectedImages.length > 0 && (
                <>
                  <span className="text-sm text-muted-foreground">
                    已选择 {selectedImages.length} 张
                  </span>
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
                    onClick={handleUnarchive}
                    disabled={isUnarchiving}
                  >
                    {isUnarchiving ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Undo2 className="w-3 h-3" />
                    )}
                    撤销归档
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
                </div>
              ))}
            </div>
          ) : filteredImages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4">
                <ImageIcon className="w-16 h-16 mx-auto text-muted-foreground/30" />
                <div>
                  <p className="text-muted-foreground">暂无归档图片</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    在待整理中标记图片后，点击归档
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-full">
              {viewMode === "grid" ? (
                <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {filteredImages.map((image) => (
                    <ImageCard 
                      key={image.id} 
                      image={image}
                      onDelete={handleDeleteImage}
                      onArchive={handleUnarchiveSingle}
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
                      onArchive={handleUnarchiveSingle}
                      listMode
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
