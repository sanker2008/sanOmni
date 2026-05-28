import { useState, useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Check, X } from "lucide-react";
import { useImageStore } from "@/stores";

interface IPImagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (imageIds: string[]) => void;
  title: string;
  description: string;
  multiSelect?: boolean;
}

export default function IPImagePickerModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  multiSelect = true,
}: IPImagePickerModalProps) {
  const { inboxImages, archivedImages } = useImageStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 合并库中所有图片
  const allImages = useMemo(() => {
    // 根据哈希排重或简单合并
    const map = new Map();
    for (const img of [...inboxImages, ...archivedImages]) {
      map.set(img.id, img);
    }
    return Array.from(map.values());
  }, [inboxImages, archivedImages]);

  // 根据搜索条件过滤
  const filteredImages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return allImages;
    return allImages.filter(
      (img) =>
        (img.prompt && img.prompt.toLowerCase().includes(query)) ||
        img.filename.toLowerCase().includes(query)
    );
  }, [allImages, searchQuery]);

  const handleToggleSelect = (id: string) => {
    if (multiSelect) {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    } else {
      setSelectedIds((prev) => (prev.includes(id) ? [] : [id]));
    }
  };

  const handleConfirm = () => {
    onConfirm(selectedIds);
    setSelectedIds([]);
    onClose();
  };

  const handleClose = () => {
    setSelectedIds([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6 gap-4">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索提示词 (Prompt) 或文件名..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9"
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

        {/* 图片选择区域 */}
        <ScrollArea className="flex-1 border rounded-md p-4 bg-muted/20">
          {filteredImages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <span className="text-sm">未找到匹配的图片</span>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
              {filteredImages.map((image) => {
                const isSelected = selectedIds.includes(image.id);
                return (
                  <div
                    key={image.id}
                    onClick={() => handleToggleSelect(image.id)}
                    className={`relative aspect-square rounded-md overflow-hidden border-2 cursor-pointer transition-all duration-200 group hover:shadow-md ${
                      isSelected
                        ? "border-primary ring-2 ring-primary/20 scale-[0.98]"
                        : "border-border hover:border-muted-foreground/50"
                    }`}
                  >
                    <img
                      src={convertFileSrc(image.absolute_path)}
                      alt={image.filename}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />

                    {/* 选择标记 */}
                    {isSelected && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <div className="bg-primary text-primary-foreground rounded-full p-1 shadow-lg animate-in scale-in-50 duration-150">
                          <Check className="w-4 h-4 stroke-[3px]" />
                        </div>
                      </div>
                    )}

                    {/* 提示词 Hover 浮层 */}
                    {image.prompt && (
                      <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <p className="text-[10px] text-white line-clamp-2 leading-tight">
                          {image.prompt}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* 底部操作 */}
        <div className="flex justify-end gap-3 border-t pt-4">
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={selectedIds.length === 0}>
            确认选择 ({selectedIds.length})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
