import { useState } from "react";
import { useImageStore, useVendorStore } from "@/stores";
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
import {
  CheckCircle2,
  Circle,
  Star,
  X,
  Plus,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BatchEditModalProps {
  open: boolean;
  onClose: () => void;
}

type ModelAction = "replace" | "append" | "none";
type TagAction = "append" | "replace" | "none";

export default function BatchEditModal({ open, onClose }: BatchEditModalProps) {
  const { inboxImages, selectedImages, updateImage } = useImageStore();
  const { vendors } = useVendorStore();

  // Model settings
  const [modelAction, setModelAction] = useState<ModelAction>("none");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [primaryModel, setPrimaryModel] = useState<string | null>(null);

  // Tag settings
  const [tagAction, setTagAction] = useState<TagAction>("none");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const selectedCount = selectedImages.length;

  const toggleModel = (modelId: string) => {
    if (selectedModels.includes(modelId)) {
      const next = selectedModels.filter((id) => id !== modelId);
      setSelectedModels(next);
      if (primaryModel === modelId) setPrimaryModel(next[0] ?? null);
    } else {
      const next = [...selectedModels, modelId];
      setSelectedModels(next);
      if (!primaryModel) setPrimaryModel(modelId);
    }
  };

  const handleAddTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagInput("");
    }
  };

  const handleSave = async () => {
    if (modelAction === "none" && tagAction === "none") return;

    setIsSaving(true);
    setResult(null);

    let successCount = 0;
    let failCount = 0;

    for (const imageId of selectedImages) {
      const image = inboxImages.find((img) => img.id === imageId);
      if (!image) continue;

      try {
        // Compute final model list
        let finalModelIds: string[];
        let finalPrimaryModel: string | undefined;

        if (modelAction === "replace") {
          finalModelIds = selectedModels;
          finalPrimaryModel = primaryModel ?? undefined;
        } else if (modelAction === "append") {
          const existing = image.models.map((m) => m.id);
          finalModelIds = [...new Set([...existing, ...selectedModels])];
          // keep existing primary unless we set a new one
          finalPrimaryModel =
            primaryModel ??
            image.models.find((m) => m.is_primary)?.id ??
            undefined;
        } else {
          finalModelIds = image.models.map((m) => m.id);
          finalPrimaryModel = image.models.find((m) => m.is_primary)?.id ?? undefined;
        }

        // Compute final tag list
        let finalTags: string[];
        if (tagAction === "replace") {
          finalTags = tags;
        } else if (tagAction === "append") {
          const existing = image.tags.map((t) => t.name);
          finalTags = [...new Set([...existing, ...tags])];
        } else {
          finalTags = image.tags.map((t) => t.name);
        }

        const updated = await imageApi.update({
          image_id: imageId,
          prompt: image.prompt,
          model_ids: finalModelIds,
          primary_model_id: finalPrimaryModel,
          tags: finalTags,
        });

        updateImage(imageId, updated);
        successCount++;
      } catch (err) {
        console.error(`Failed to update image ${imageId}:`, err);
        failCount++;
      }
    }

    setIsSaving(false);
    setResult(
      failCount > 0
        ? `完成：成功 ${successCount} 张，失败 ${failCount} 张`
        : `已更新 ${successCount} 张图片`
    );
    setTimeout(() => {
      setResult(null);
      onClose();
    }, 1500);
  };

  const handleClose = () => {
    setModelAction("none");
    setSelectedModels([]);
    setPrimaryModel(null);
    setTagAction("none");
    setTags([]);
    setTagInput("");
    setResult(null);
    onClose();
  };

  const canSave = (modelAction !== "none" || tagAction !== "none") && !isSaving;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>批量编辑 · 已选 {selectedCount} 张</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* ── Models ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">模型</label>
              <div className="flex items-center gap-1 text-xs">
                {(["none", "append", "replace"] as ModelAction[]).map((a) => (
                  <button
                    key={a}
                    onClick={() => setModelAction(a)}
                    className={cn(
                      "px-2 py-0.5 rounded border transition-colors",
                      modelAction === a
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-input hover:bg-muted"
                    )}
                  >
                    {{ none: "不修改", append: "追加", replace: "替换" }[a]}
                  </button>
                ))}
              </div>
            </div>

            {modelAction !== "none" && (
              <div className="space-y-3">
                {vendors.map((vendor) => (
                  <div key={vendor.id} className="space-y-1.5">
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
                                  setPrimaryModel(model.id);
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
            )}
          </div>

          <Separator />

          {/* ── Tags ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">标签</label>
              <div className="flex items-center gap-1 text-xs">
                {(["none", "append", "replace"] as TagAction[]).map((a) => (
                  <button
                    key={a}
                    onClick={() => setTagAction(a)}
                    className={cn(
                      "px-2 py-0.5 rounded border transition-colors",
                      tagAction === a
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-input hover:bg-muted"
                    )}
                  >
                    {{ none: "不修改", append: "追加", replace: "替换" }[a]}
                  </button>
                ))}
              </div>
            </div>

            {tagAction !== "none" && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button
                        onClick={() => setTags(tags.filter((t) => t !== tag))}
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
            )}
          </div>
        </div>

        {result && (
          <p className="text-sm text-center text-green-600 dark:text-green-400">{result}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                保存中...
              </>
            ) : (
              `应用到 ${selectedCount} 张图片`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
