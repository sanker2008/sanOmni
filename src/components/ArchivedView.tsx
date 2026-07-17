import { useEffect, useState, useMemo } from "react";
import { useImageStore, useUIStore, useVendorStore } from "@/stores";
import { imageApi, vendorApi } from "@/services/tauri";
import { authorizeFsPaths, copyFile, exists, mkdir, stat } from "@/services/secureFs";
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
  Trash2,
  Check,
  AlertCircle,
  RefreshCw,
  Settings,
  X,
  Plus,
} from "lucide-react";
import ImageCard from "./ImageCard";
import BatchEditModal from "./BatchEditModal";
import ConfirmDialog from "./ConfirmDialog";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import VendorsView from "./VendorsView";

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
    updateImage,
  } = useImageStore();

  const { searchQuery, setSearchQuery, viewMode, setViewMode } = useUIStore();
  const { vendors } = useVendorStore();

  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [isConvertingWebp, setIsConvertingWebp] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [isUnarchiving, setIsUnarchiving] = useState(false);
  const [unarchiveResult, setUnarchiveResult] = useState<string | null>(null);
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [isUpdatingWatermark, setIsUpdatingWatermark] = useState(false);
  const [batchDeleteStep, setBatchDeleteStep] = useState(0);
  const [sortBy, setSortBy] = useState<"time" | "size">("time");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isVendorsDialogOpen, setIsVendorsDialogOpen] = useState(false);
  const [isQuickImporting, setIsQuickImporting] = useState(false);

  useEffect(() => {
    void loadVendors();
  }, []);

  const loadVendors = async () => {
    try {
      const data = await vendorApi.getAll();
      useVendorStore.getState().setVendors(data);
    } catch (error) {
      console.error("Failed to load vendors:", error);
    }
  };

  const handleQuickUpload = async () => {
    if (!selectedModel || !selectedVendor) {
      toast({
        title: "无法归档",
        description: "请先在左侧选择一个具体模型",
        variant: "destructive",
      });
      return;
    }

    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
          },
        ],
      });

      if (!selected) return;

      const files = Array.isArray(selected) ? selected : [selected];
      await authorizeFsPaths(files as string[]);
      setIsQuickImporting(true);

      const { join } = await import("@tauri-apps/api/path");
      const { getAppRoot } = await import("@/lib/pathUtils");

      const customInboxPath = useUIStore.getState().settings.customInboxPath;
      const customArchivedPath = useUIStore.getState().settings.customArchivedPath;

      let inboxDir: string;
      if (customInboxPath) {
        inboxDir = customInboxPath;
      } else {
        const appDir = await getAppRoot();
        inboxDir = await join(appDir, "inbox");
      }

      let libraryPath: string;
      if (customArchivedPath) {
        libraryPath = customArchivedPath;
      } else {
        libraryPath = await getAppRoot();
      }

      if (!(await exists(inboxDir))) {
        await mkdir(inboxDir, { recursive: true });
      }

      let successCount = 0;
      let failCount = 0;

      for (const filePath of files) {
        const fileName = filePath.split(/[/\\]/).pop() || "unknown";
        
        let fileSize = 0;
        try {
          const fileMeta = await stat(filePath);
          fileSize = fileMeta.size;
        } catch (error) {
          console.error(`Failed to get metadata for ${filePath}:`, error);
        }

        const timestamp = Date.now();
        const uniqueFileName = `${timestamp}_${fileName}`;
        const targetInboxPath = await join(inboxDir, uniqueFileName);

        try {
          await copyFile(filePath, targetInboxPath);
        } catch (error) {
          console.error(`Failed to copy file ${fileName}:`, error);
          failCount++;
          continue;
        }

        try {
          const imported = await imageApi.import({
            file_path: targetInboxPath,
            file_name: fileName,
            file_size: fileSize,
            vendor_id: selectedVendor,
            model_ids: [selectedModel],
            primary_model_id: selectedModel,
            tags: [],
          });

          const archiveResult = await imageApi.archive([imported.id], libraryPath);
          if (archiveResult.success_count > 0) {
            successCount++;
          } else {
            console.error(`Failed to archive image ${imported.id}:`, archiveResult.errors);
            failCount++;
          }
        } catch (error) {
          console.error(`Failed to import/archive ${fileName}:`, error);
          failCount++;
        }
      }

      setIsQuickImporting(false);

      if (successCount > 0) {
        toast({
          title: `✓ 成功归档 ${successCount} 张图片`,
          description: `已直接归档至当前模型。`,
        });
        await loadArchivedImages();
      }

      if (failCount > 0) {
        toast({
          title: "✗ 归档失败",
          description: `有 ${failCount} 张图片归档失败，请检查文件或重试。`,
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error("Quick upload and archive failed:", error);
      setIsQuickImporting(false);
      toast({
        title: "✗ 操作失败",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const handleBatchSetWatermark = async (hasWatermark: boolean) => {
    if (selectedImages.length === 0) return;

    setIsUpdatingWatermark(true);
    let successCount = 0;
    let failCount = 0;

    for (const imageId of selectedImages) {
      const image = archivedImages.find((img) => img.id === imageId);
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
  const [filterHasPrompt, setFilterHasPrompt] = useState<boolean | null>(null);
  const [filterHasTags, setFilterHasTags] = useState<boolean | null>(null);
  const [filterHasWatermark, setFilterHasWatermark] = useState<boolean | null>(null);
  const activeFilterCount = [filterHasPrompt, filterHasTags, filterHasWatermark].filter(
    (filter) => filter !== null
  ).length;

  useEffect(() => {
    loadArchivedImages();

    const handleSyncComplete = () => {
      loadArchivedImages();
    };
    window.addEventListener("sync-completed", handleSyncComplete);
    return () => {
      window.removeEventListener("sync-completed", handleSyncComplete);
    };
  }, []);

  // Clear selection when vendor/model tab changes
  useEffect(() => {
    clearSelection();
  }, [selectedVendor, selectedModel, clearSelection]);

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

  const headerTitle = useMemo(() => {
    if (selectedModel && selectedVendor) {
      const vendorName = selectedVendor === "unknown"
        ? "未知厂商"
        : vendors.find((v) => v.id === selectedVendor)?.name || selectedVendor;
        
      let modelName = "";
      if (selectedModel === "unknown") {
        modelName = "未知模型";
      } else {
        const vendor = vendors.find((v) => v.id === selectedVendor);
        modelName = vendor?.models.find((m) => m.id === selectedModel)?.name || selectedModel;
      }
      
      return `${vendorName} / ${modelName}`;
    }
    if (selectedVendor) {
      const vendorName = selectedVendor === "unknown"
        ? "未知厂商"
        : vendors.find((v) => v.id === selectedVendor)?.name || selectedVendor;
      return vendorName;
    }
    return "全部";
  }, [selectedVendor, selectedModel, vendors]);

  // Count by vendor/model
  const getVendorCount = (vendorId: string) =>
    archivedImages.filter((img) => img.storage_vendor_id === vendorId).length;

  const getModelCount = (modelId: string) =>
    archivedImages.filter((img) => img.primary_model_id === modelId).length;

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
        const { getAppRoot } = await import("@/lib/pathUtils");
        inboxPath = await getAppRoot();
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
        const { getAppRoot } = await import("@/lib/pathUtils");
        inboxPath = await getAppRoot();
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
      
      const currentImages = archivedImages;

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

  return (
    <div className="flex h-full">
      {/* Sidebar - Vendor Tree */}
      <div className="w-56 border-r bg-muted/50 flex flex-col z-10 shadow-[1px_0_2px_rgba(0,0,0,0.02)]">
        <div className="p-3 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FolderTree className="w-4 h-4" />
            厂商库
          </h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsVendorsDialogOpen(true)}
            title="管理厂商"
          >
            <Settings className="w-3.5 h-3.5" />
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
                            onClick={() => {
                              if (model.id === selectedModel) {
                                setSelectedModel(null);
                              } else {
                                setSelectedModel(model.id);
                                setSelectedVendor(vendor.id);
                              }
                            }}
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
        <div className="border-b px-4 py-3 flex items-center justify-between bg-card shadow-sm z-10">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Archive className="w-5 h-5" />
              {headerTitle}
            </h2>
            <Badge variant="secondary">{filteredImages.length} 张图片</Badge>
            <Button variant="outline" size="sm" className="gap-2" onClick={loadArchivedImages} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              刷新
            </Button>
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
                  <span className="text-sm text-muted-foreground flex items-center gap-1 border-r pr-3 mr-1">
                    已选择 {selectedImages.length} 张
                    <button onClick={clearSelection} className="text-muted-foreground hover:text-foreground p-0.5 rounded-md hover:bg-muted transition-colors" title="清空选中">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                  <Button variant="ghost" size="sm" className="gap-1 h-7"
                    onClick={() => setShowBatchEdit(true)}>
                    <Edit2 className="w-3 h-3" />
                    批量编辑
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

      {/* Vendors and Models Management Dialog */}
      <Dialog open={isVendorsDialogOpen} onOpenChange={setIsVendorsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader className="pb-2 border-b">
            <DialogTitle className="text-lg font-semibold">厂商与模型管理</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-1">
            <VendorsView />
          </div>
        </DialogContent>
      </Dialog>
      {/* Floating Action Button for Quick Upload & Archive */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={handleQuickUpload}
          disabled={isQuickImporting}
          className={cn(
            "w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95 p-0 bg-primary text-primary-foreground hover:bg-primary/90",
            (!selectedModel || !selectedVendor) && "opacity-60 bg-muted hover:bg-muted text-muted-foreground cursor-not-allowed"
          )}
          title={(!selectedModel || !selectedVendor) ? "请先选择具体模型再上传" : "快速上传并归档至当前模型"}
        >
          {isQuickImporting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Plus className="w-5 h-5" />
          )}
        </Button>
      </div>
    </div>
  );
}
