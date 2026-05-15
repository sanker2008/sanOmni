import { useEffect, useState } from "react";
import { useImageStore, useUIStore, useVendorStore } from "@/stores";
import { imageApi } from "@/services/tauri";
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
  } = useImageStore();

  const { searchQuery, setSearchQuery } = useUIStore();
  const { vendors } = useVendorStore();

  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

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
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !image.filename.toLowerCase().includes(query) &&
        !image.prompt?.toLowerCase().includes(query) &&
        !image.tags.some((tag) => tag.name.toLowerCase().includes(query))
      ) {
        return false;
      }
    }
    if (selectedVendor && image.storage_vendor_id !== selectedVendor) return false;
    if (selectedModel && image.primary_model_id !== selectedModel) return false;
    return true;
  });

  // Count by vendor/model
  const getVendorCount = (vendorId: string) =>
    archivedImages.filter((img) => img.storage_vendor_id === vendorId).length;

  const getModelCount = (modelId: string) =>
    archivedImages.filter((img) => img.primary_model_id === modelId).length;

  const isAllSelected = filteredImages.length > 0 &&
    filteredImages.every((img) => selectedImages.includes(img.id));

  return (
    <div className="flex h-full">
      {/* Sidebar - Vendor Tree */}
      <div className="w-56 border-r bg-muted/20 flex flex-col">
        <div className="p-3 border-b">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FolderTree className="w-4 h-4" />
            厂商分类
          </h3>
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
              if (count === 0) return null;

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
                        if (modelCount === 0) return null;

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
                placeholder="搜索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
          </div>
        </div>

        {/* Toolbar */}
        {filteredImages.length > 0 && (
          <div className="border-b px-4 py-2 flex items-center gap-4 bg-muted/30">
            <button
              onClick={() => isAllSelected ? clearSelection() : selectAll()}
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
            >
              {isAllSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              {isAllSelected ? "取消全选" : "全选"}
            </button>
            {selectedImages.length > 0 && (
              <span className="text-sm text-muted-foreground">
                已选择 {selectedImages.length} 张
              </span>
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
                    在收件箱中标记图片后，点击归档
                  </p>
                </div>
              </div>
            </div>
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
      </div>
    </div>
  );
}
