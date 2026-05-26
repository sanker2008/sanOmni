import { useEffect, useState, useMemo } from "react";
import { useIpImageStore, useUIStore } from "@/stores";
import { ipImageApi } from "@/services/tauri";
import { toast } from "@/hooks/useToast";
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
  Image as ImageIcon,
  Undo2,
  Loader2,
  Edit2,
  LayoutGrid,
  List,
  Filter,
  Trash2,
  Check,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import ImageCard from "./ImageCard";
import BatchEditModal from "./BatchEditModal";
import ConfirmDialog from "./ConfirmDialog";

import IpSidebar from "./IpSidebar";

export default function IpArchivedView() {
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
    updateImage,
  } = useIpImageStore();

  const { searchQuery, setSearchQuery, viewMode, setViewMode } = useUIStore();

  const [selectedIpId, setSelectedIpId] = useState<string | null>(null);
  const [isUnarchiving, setIsUnarchiving] = useState(false);
  const [unarchiveResult, setUnarchiveResult] = useState<string | null>(null);
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [isUpdatingWatermark, setIsUpdatingWatermark] = useState(false);
  const [batchDeleteStep, setBatchDeleteStep] = useState(0);
  const [sortBy, setSortBy] = useState<"time" | "size">("time");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const handleBatchSetWatermark = async (hasWatermark: boolean) => {
    if (selectedImages.length === 0) return;

    setIsUpdatingWatermark(true);
    let successCount = 0;
    let failCount = 0;

    for (const imageId of selectedImages) {
      const image = archivedImages.find((img) => img.id === imageId);
      if (!image) continue;

      try {
        const updated = await ipImageApi.update({
          ip_image_id: imageId,
          ip_id: image.ip_id,
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
      const images = await ipImageApi.getArchivedImages();
      setArchivedImages(images);
    } catch (error) {
      console.error("Failed to load archived images:", error);
    } finally {
      setLoading(false);
    }
  };



  // Filter images
  const filteredImages = archivedImages.filter((image) => {
    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase().trim();
      const keywords = query.split(/\s+/).filter(k => k.length > 0);
      
      const matchesSearch = keywords.every(keyword => {
        return (
          image.filename.toLowerCase().includes(keyword) ||
          image.format?.toLowerCase().includes(keyword) ||
          image.watermark_platform?.toLowerCase().includes(keyword) ||
          image.tags.some((tag) => tag.name.toLowerCase().includes(keyword)) ||
          image.ip_name?.toLowerCase().includes(keyword)
        );
      });
      
      if (!matchesSearch) return false;
    }
    
    // IP 筛选（按 ip_id 过滤）
    if (selectedIpId) {
      if (selectedIpId === "unknown") {
        if (image.ip_id !== "unknown") return false;
      } else {
        if (image.ip_id !== selectedIpId) return false;
      }
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

      const result = await ipImageApi.archive(selectedImages, inboxPath);

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

      const result = await ipImageApi.archive([imageId], inboxPath);

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
      const success = await ipImageApi.delete(imageId);
      if (success) {
        removeImage(imageId);
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
        const success = await ipImageApi.delete(imageId);
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

  return (
    <div className="flex h-full">
      {/* Sidebar - IP Tree */}
      <IpSidebar
        onIpSelect={setSelectedIpId}
        selectedIpId={selectedIpId}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b px-4 py-3 flex items-center justify-between bg-card shadow-sm z-10">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Archive className="w-5 h-5" />
              已归档
            </h2>
            <Badge variant="secondary">{filteredImages.length} 张图片</Badge>
            <Button variant="outline" size="sm" className="gap-2" onClick={loadArchivedImages} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              刷新
            </Button>
            {selectedIpId && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedIpId(null)}>
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

        {/* Toolbar - Always reserve space */}
        <div className="border-b px-4 py-2 bg-muted/30 min-h-[44px] flex items-center">
          {filteredImages.length > 0 ? (
            <div className="flex items-center gap-4">
              <button
                onClick={() =>
                  isAllSelected ? clearSelection() : selectAll(sortedImages.map((img) => img.id))
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
                  <Button variant="ghost" size="sm" className="gap-1 h-7"
                    onClick={() => setShowBatchEdit(true)}>
                    <Edit2 className="w-3 h-3" />
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
                  {sortedImages.map((image) => (
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
                  {sortedImages.map((image) => (
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
      {/* Batch Edit Modal */}
      <BatchEditModal open={showBatchEdit} onClose={() => setShowBatchEdit(false)} isIpMode={true} />

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
    </div>
  );
}
