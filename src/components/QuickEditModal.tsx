import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useImageStore, useUIStore, useVendorStore, type PromptGroup } from "@/stores";
import { imageApi, promptApi } from "@/services/tauri";
import { appDataDir } from "@tauri-apps/api/path";
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
  Archive,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function QuickEditModal() {
  const { inboxImages, archivedImages, updateImage, removeImage } = useImageStore();
  const { isQuickEditOpen, editingImageId, closeQuickEdit } = useUIStore();
  const { vendors } = useVendorStore();

  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [primaryModel, setPrimaryModel] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [availablePromptGroups, setAvailablePromptGroups] = useState<PromptGroup[]>([]);
  const [selectedPromptGroupIds, setSelectedPromptGroupIds] = useState<string[]>([]);
  const [newPromptText, setNewPromptText] = useState("");
  const [newNegativePrompt, setNewNegativePrompt] = useState("");
  const [newPromptDescription, setNewPromptDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingAndArchiving, setIsSavingAndArchiving] = useState(false);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const [loadedDimensions, setLoadedDimensions] = useState<{ width: number; height: number } | null>(null);

  const image =
    inboxImages.find((img) => img.id === editingImageId) ||
    archivedImages.find((img) => img.id === editingImageId);

  useEffect(() => {
    if (!image) {
      return;
    }

    setSelectedModels(image.models.map((model) => model.id));
    setPrimaryModel(image.models.find((model) => model.is_primary)?.id || null);
    setTags(image.tags.map((tag) => tag.name));
    setNewPromptText("");
    setNewNegativePrompt("");
    setNewPromptDescription("");
    setLoadedDimensions(null);

    let cancelled = false;
    void (async () => {
      try {
        const [groups, linkedGroups] = await Promise.all([
          promptApi.getAll(),
          promptApi.getForImage(image.id),
        ]);

        if (!cancelled) {
          setAvailablePromptGroups(groups);
          setSelectedPromptGroupIds(linkedGroups.map((group) => group.id));
        }
      } catch (error) {
        console.error("加载 Prompt 关联失败:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [image]);

  const persistChanges = async (archiveAfterSave: boolean) => {
    if (!image) return;

    const createdPrompt = newPromptText.trim()
      ? await promptApi.create({
          prompt: newPromptText.trim(),
          negativePrompt: newNegativePrompt.trim() || undefined,
          description: newPromptDescription.trim() || undefined,
          imageIds: [image.id],
        })
      : null;

    const nextPromptGroupIds = createdPrompt
      ? Array.from(new Set([...selectedPromptGroupIds, createdPrompt.id]))
      : selectedPromptGroupIds;

    const updated = await imageApi.update({
      image_id: image.id,
      model_ids: selectedModels,
      primary_model_id: primaryModel || undefined,
      tags,
    });

    await promptApi.setForImage(image.id, nextPromptGroupIds);

    updateImage(image.id, updated);

    if (archiveAfterSave) {
      const customPath = useUIStore.getState().settings.customArchivedPath;
      const libraryPath = customPath || (await appDataDir());
      const result = await imageApi.archive([image.id], libraryPath);

      if (result.success_count > 0) {
        removeImage(image.id);
      }
    }

    closeQuickEdit();
  };

  const handleSave = async () => {
    if (!image) return;

    setIsSaving(true);
    try {
      await persistChanges(false);
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndArchive = async () => {
    if (!image) return;

    setIsSavingAndArchiving(true);
    try {
      await persistChanges(true);
    } catch (error) {
      console.error("Failed to save and archive:", error);
    } finally {
      setIsSavingAndArchiving(false);
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

  const togglePromptGroup = (groupId: string) => {
    setSelectedPromptGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
    );
  };

  const handleCopyPrompt = async (groupId: string, prompt: string, negativePrompt?: string) => {
    try {
      const text = negativePrompt
        ? `${prompt}\n\n负面提示词:\n${negativePrompt}`
        : prompt;
      await navigator.clipboard.writeText(text);
      setCopiedPromptId(groupId);
      window.setTimeout(() => {
        setCopiedPromptId((current) => (current === groupId ? null : current));
      }, 1500);
    } catch (error) {
      console.error("复制 Prompt 失败:", error);
    }
  };

  if (!image) return null;

  const displayWidth = image.width || loadedDimensions?.width;
  const displayHeight = image.height || loadedDimensions?.height;

  return (
    <Dialog open={isQuickEditOpen} onOpenChange={(open) => !open && closeQuickEdit()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>编辑图片信息</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 gap-4 overflow-hidden">
          <div className="w-1/3 flex-shrink-0">
            <div className="aspect-square bg-muted rounded-lg overflow-hidden flex items-center justify-center">
              <img
                src={convertFileSrc(image.absolute_path)}
                alt={image.filename}
                className="w-full h-full object-cover"
                onLoad={(e) => {
                  const target = e.currentTarget;
                  setLoadedDimensions({
                    width: target.naturalWidth,
                    height: target.naturalHeight,
                  });
                }}
                onError={(e) => {
                  console.error("Failed to load image:", image.absolute_path);
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
            <p className="mt-2 break-words text-sm text-muted-foreground" title={image.filename}>
              {image.filename}
            </p>
            {displayWidth && displayHeight && (
              <p className="mt-1 text-xs text-muted-foreground">
                {displayWidth} × {displayHeight}
              </p>
            )}
          </div>

          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6">
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
                                  <Star className={cn("w-3 h-3", isPrimary && "fill-current")} />
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

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    关联已有 Prompt
                  </label>
                  <span className="text-xs text-muted-foreground">
                    已选 {selectedPromptGroupIds.length} 个
                  </span>
                </div>
                <div className="space-y-2">
                  {availablePromptGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">还没有可关联的 Prompt</p>
                  ) : (
                    availablePromptGroups.map((group) => {
                      const selected = selectedPromptGroupIds.includes(group.id);
                      return (
                        <div
                          key={group.id}
                          className={cn(
                            "rounded-md border p-3 transition-colors",
                            selected ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              onClick={() => togglePromptGroup(group.id)}
                              className="flex-1 text-left"
                              title={group.prompt}
                            >
                              <div className="whitespace-pre-wrap break-words text-sm">{group.prompt}</div>
                              {group.negative_prompt && (
                                <div className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                                  负面提示词：{group.negative_prompt}
                                </div>
                              )}
                              <div className="mt-2 text-xs text-muted-foreground">{group.image_count} 张图片</div>
                            </button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 flex-shrink-0"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleCopyPrompt(group.id, group.prompt, group.negative_prompt);
                              }}
                              title={copiedPromptId === group.id ? "已复制" : "复制 Prompt"}
                            >
                              {copiedPromptId === group.id ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">新增并关联 Prompt</label>
                <textarea
                  value={newPromptText}
                  onChange={(e) => setNewPromptText(e.target.value)}
                  placeholder="如果需要，可在保存时顺手创建一个新的 Prompt"
                  className="w-full min-h-[90px] px-3 py-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Input
                  value={newNegativePrompt}
                  onChange={(e) => setNewNegativePrompt(e.target.value)}
                  placeholder="负面提示词，可选"
                />
                <Input
                  value={newPromptDescription}
                  onChange={(e) => setNewPromptDescription(e.target.value)}
                  placeholder="说明，可选"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <label className="text-sm font-medium">标签</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button onClick={() => handleRemoveTag(tag)} className="ml-1 hover:text-destructive">
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

              <div className="space-y-2">
                <label className="text-sm font-medium">水印</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="watermark" checked={!image.has_watermark} readOnly className="w-4 h-4" />
                    <span className="text-sm">无水印</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="watermark" checked={image.has_watermark} readOnly className="w-4 h-4" />
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
          <Button variant="outline" onClick={handleSaveAndArchive} disabled={isSaving || isSavingAndArchiving}>
            {isSavingAndArchiving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存并归档中...
              </>
            ) : (
              <>
                <Archive className="mr-2 h-4 w-4" />
                保存并归档
              </>
            )}
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isSavingAndArchiving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
