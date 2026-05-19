import { useState, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useImageStore, useUIStore, useVendorStore } from "@/stores";
import { imageApi } from "@/services/tauri";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  Circle,
  X,
  Plus,
  Star,
  Loader2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function QuickEditModal() {
  const { inboxImages, updateImage } = useImageStore();
  const { isQuickEditOpen, editingImageId, closeQuickEdit } = useUIStore();
  const { vendors } = useVendorStore();

  const [prompt, setPrompt] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [primaryModel, setPrimaryModel] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Find the editing image
  const image = inboxImages.find((img) => img.id === editingImageId);

  // Initialize form when image changes
  useEffect(() => {
    if (image) {
      setPrompt(image.prompt || "");
      setSelectedModels(image.models.map((m) => m.id));
      setPrimaryModel(image.models.find((m) => m.is_primary)?.id || null);
      setTags(image.tags.map((t) => t.name));
    }
  }, [image]);

  const handleSave = async () => {
    if (!image) return;

    setIsSaving(true);
    try {
      const updated = await imageApi.update({
        image_id: image.id,
        prompt: prompt || undefined,
        model_ids: selectedModels,
        primary_model_id: primaryModel || undefined,
        tags,
      });
      updateImage(image.id, updated);
      closeQuickEdit();
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const toggleModel = (modelId: string) => {
    if (selectedModels.includes(modelId)) {
      setSelectedModels(selectedModels.filter((id) => id !== modelId));
      if (primaryModel === modelId) {
        setPrimaryModel(selectedModels[0] || null);
      }
    } else {
      setSelectedModels([...selectedModels, modelId]);
      if (!primaryModel) {
        setPrimaryModel(modelId);
      }
    }
  };

  const setAsPrimary = (modelId: string) => {
    if (selectedModels.includes(modelId)) {
      setPrimaryModel(modelId);
    }
  };

  if (!image) return null;

  return (
    <Dialog open={isQuickEditOpen} onOpenChange={(open) => !open && closeQuickEdit()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>编辑图片信息</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex gap-4">
          {/* Image Preview */}
          <div className="w-1/3 flex-shrink-0">
            <div className="aspect-square bg-muted rounded-lg overflow-hidden flex items-center justify-center">
              <img
                src={`asset://localhost/${image.absolute_path}`}
                alt={image.filename}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
            <p className="text-sm text-muted-foreground mt-2 truncate" title={image.filename}>
              {image.filename}
            </p>
          </div>

          {/* Form */}
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6">
              {/* Vendor & Model Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">模型选择</label>
                <div className="space-y-3">
                  {vendors.map((vendor) => (
                    <div key={vendor.id} className="space-y-2">
                      <p className="text-xs text-muted-foreground">{vendor.name}</p>
                      <div className="flex flex-wrap gap-2">
                        {vendor.models.map((model) => {
                          const isSelected = selectedModels.includes(model.id);
                          const isPrimary = primaryModel === model.id;
                          return (
                            <button
                              key={model.id}
                              onClick={() => toggleModel(model.id)}
                              className={cn(
                                "flex items-center gap-1 px-3 py-1.5 rounded-md text-sm border transition-colors",
                                isSelected
                                  ? "bg-primary/10 border-primary text-primary"
                                  : "bg-background border-input hover:bg-muted"
                              )}
                            >
                              {isSelected ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : (
                                <Circle className="w-3 h-3" />
                              )}
                              {model.name}
                              {isSelected && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAsPrimary(model.id);
                                  }}
                                  className={cn(
                                    "ml-1 p-0.5 rounded",
                                    isPrimary
                                      ? "text-yellow-500"
                                      : "text-muted-foreground hover:text-yellow-500"
                                  )}
                                  title={isPrimary ? "主模型" : "设为主模型"}
                                >
                                  <Star
                                    className={cn("w-3 h-3", isPrimary && "fill-current")}
                                  />
                                </button>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Prompt */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="输入生成提示词..."
                  className="w-full min-h-[100px] px-3 py-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <Separator />

              {/* Tags */}
              <div className="space-y-2">
                <label className="text-sm font-medium">标签</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="输入标签..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                  />
                  <Button variant="outline" size="icon" onClick={handleAddTag}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Watermark */}
              <div className="space-y-2">
                <label className="text-sm font-medium">水印</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="watermark"
                      checked={!image.has_watermark}
                      readOnly
                      className="w-4 h-4"
                    />
                    <span className="text-sm">无水印</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="watermark"
                      checked={image.has_watermark}
                      readOnly
                      className="w-4 h-4"
                    />
                    <span className="text-sm">有水印 ({image.watermark_platform || "未知"})</span>
                  </label>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={closeQuickEdit}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                保存中...
              </>
            ) : (
              "保存"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
