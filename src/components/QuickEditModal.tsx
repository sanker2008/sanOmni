import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useImageStore, useIpImageStore, useUIStore, useVendorStore } from "@/stores";
import type { PromptGroup, IpAsset } from "@/stores";
import { imageApi, ipImageApi, promptApi } from "@/services/tauri";
import { toast } from "@/hooks/useToast";
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
  Pencil,
} from "lucide-react";
import { TemplateVariableEditor } from "./TemplateVariableEditor";
import { cn } from "@/lib/utils";

export default function QuickEditModal() {
  const { inboxImages, archivedImages, updateImage: updatePromptImage, removeImage: removePromptImage } = useImageStore();
  const { inboxImages: ipInboxImages, archivedImages: ipArchivedImages, updateImage: updateIpImage, removeImage: removeIpImage } = useIpImageStore();
  const { isQuickEditOpen, editingImageId, closeQuickEdit } = useUIStore();
  const { vendors } = useVendorStore();

  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [primaryModel, setPrimaryModel] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [availablePromptGroups, setAvailablePromptGroups] = useState<PromptGroup[]>([]);
  const [selectedPromptGroupIds, setSelectedPromptGroupIds] = useState<string[]>([]);
  const [availableIps, setAvailableIps] = useState<IpAsset[]>([]);
  const [selectedIpIds, setSelectedIpIds] = useState<string[]>([]);
  const [newPromptText, setNewPromptText] = useState("");
  const [newNegativePrompt, setNewNegativePrompt] = useState("");
  const [newPromptName, setNewPromptName] = useState("");
  const [newPromptDescription, setNewPromptDescription] = useState("");
  const [newTemplateSchema, setNewTemplateSchema] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingAndArchiving, setIsSavingAndArchiving] = useState(false);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const [loadedDimensions, setLoadedDimensions] = useState<{ width: number; height: number } | null>(null);
  const [hasWatermark, setHasWatermark] = useState<boolean>(false);
  const [watermarkPlatform, setWatermarkPlatform] = useState<string>("");

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editPromptText, setEditPromptText] = useState("");
  const [editNegativePrompt, setEditNegativePrompt] = useState("");
  const [editPromptName, setEditPromptName] = useState("");
  const [editPromptDescription, setEditPromptDescription] = useState("");
  const [editTemplateSchema, setEditTemplateSchema] = useState("");

  const [searchPromptQuery, setSearchPromptQuery] = useState("");
  const [isAddingNewPrompt, setIsAddingNewPrompt] = useState(false);
  const [isAddPromptOpen, setIsAddPromptOpen] = useState(false);
  
  const [editPromptTab, setEditPromptTab] = useState<"base" | "template">("base");
  const [addPromptTab, setAddPromptTab] = useState<"base" | "template">("base");

  const isIpImage = ipInboxImages.some(img => img.id === editingImageId) || ipArchivedImages.some(img => img.id === editingImageId);
  const promptImage =
    inboxImages.find((img) => img.id === editingImageId) ||
    archivedImages.find((img) => img.id === editingImageId);
  const ipImage =
    ipInboxImages.find((img) => img.id === editingImageId) ||
    ipArchivedImages.find((img) => img.id === editingImageId);
  const image = promptImage || ipImage;

  useEffect(() => {
    if (!image) {
      return;
    }

    setSelectedModels(promptImage?.models?.map((model) => model.id) || []);
    setPrimaryModel(promptImage?.models?.find((model) => model.is_primary)?.id || null);
    setTags(image.tags?.map((tag) => tag.name) || []);
    setSelectedIpIds(ipImage ? [ipImage.ip_id] : []);
    setHasWatermark(image.has_watermark);
    setWatermarkPlatform(image.watermark_platform || "");
    setNewPromptText("");
    setNewNegativePrompt("");
    setNewPromptName("");
    setNewPromptDescription("");
    setNewTemplateSchema("");
    setLoadedDimensions(null);
    setEditingGroupId(null);
    setEditPromptText("");
    setEditNegativePrompt("");
    setEditPromptName("");
    setEditPromptDescription("");
    setEditTemplateSchema("");
    setSearchPromptQuery("");
    setIsAddPromptOpen(false);

    let cancelled = false;
    void (async () => {
      try {
        if (isIpImage) {
          const { ipApi } = await import("@/services/tauri");
          const ips = await ipApi.getAll();
          if (!cancelled) setAvailableIps(ips);
        } else {
          const [groups, linkedGroups] = await Promise.all([
            promptApi.getAll(),
            promptApi.getForImage(image.id),
          ]);

          if (!cancelled) {
            setAvailablePromptGroups(groups);
            setSelectedPromptGroupIds(linkedGroups.map((group) => group.id));
          }
        }
      } catch (error) {
        console.error("加载关联数据失败:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [image]);

  const persistChanges = async (archiveAfterSave: boolean) => {
    if (!image) return;

    const nextPromptGroupIds = selectedPromptGroupIds;

    if (isIpImage && ipImage) {
      // IP 图片：使用 ipImageApi.update
      const updatedIp = await ipImageApi.update({
        ip_image_id: image.id,
        ip_id: selectedIpIds[0] || ipImage.ip_id,
        tags,
        has_watermark: hasWatermark,
        watermark_platform: watermarkPlatform || undefined,
      });
      updateIpImage(image.id, updatedIp);

      if (archiveAfterSave) {
        const settings = useUIStore.getState().settings;
        const { appDataDir } = await import("@tauri-apps/api/path");
        const customPath = settings.customIpArchivedPath;
        const libraryPath = customPath || await appDataDir();
        const namingTemplate = settings.ipNamingTemplate || "{ip}-{date}-{index}";
        const result = await ipImageApi.archive([image.id], libraryPath, namingTemplate);
        if (result.success_count > 0) {
          removeIpImage(image.id);
        }
      }
    } else if (promptImage) {
      // Prompt 图片：使用 imageApi.update
      const updated = await imageApi.update({
        image_id: image.id,
        model_ids: selectedModels,
        primary_model_id: primaryModel || undefined,
        tags,
        has_watermark: hasWatermark,
        watermark_platform: watermarkPlatform || undefined,
      });

      await promptApi.setForImage(image.id, nextPromptGroupIds);
      try {
        const finalPrompts = await promptApi.getForImage(image.id);
        updated.prompt_groups = finalPrompts;
      } catch (error) {
        console.error("加载关联 Prompt 失败:", error);
      }
      updatePromptImage(image.id, updated);

      if (archiveAfterSave) {
        const settings = useUIStore.getState().settings;
        const { appDataDir } = await import("@tauri-apps/api/path");
        const customPath = settings.customArchivedPath;
        const libraryPath = customPath || await appDataDir();
        const result = await imageApi.archive([image.id], libraryPath);
        if (result.success_count > 0) {
          removePromptImage(image.id);
        }
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
      let nextModels = selectedModels.filter((id) => id !== modelId);
      if (nextModels.length === 0) {
        nextModels = ["unknown"];
      }
      setSelectedModels(nextModels);
      if (primaryModel === modelId) {
        setPrimaryModel(nextModels[0] || null);
      } else if (nextModels.length === 1) {
        setPrimaryModel(nextModels[0]);
      }
    } else {
      let nextModels: string[];
      if (modelId === "unknown") {
        nextModels = ["unknown"];
      } else {
        nextModels = [...selectedModels.filter((id) => id !== "unknown"), modelId];
      }
      setSelectedModels(nextModels);
      if (nextModels.length === 1 || !primaryModel || primaryModel === "unknown") {
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
      current.includes(groupId) ? [] : [groupId]
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

  const handleStartEdit = (group: PromptGroup) => {
    setEditingGroupId(group.id);
    setEditPromptText(group.prompt);
    setEditNegativePrompt(group.negative_prompt || "");
    setEditPromptName(group.name || "");
    setEditPromptDescription(group.description || "");
    setEditTemplateSchema(group.template_schema || "");
    setEditPromptTab("base");
  };

  const handleEditFieldChange = (field: "prompt" | "negative_prompt" | "description" | "name", value: string) => {
    if (field === "prompt") setEditPromptText(value);
    if (field === "negative_prompt") setEditNegativePrompt(value);
    if (field === "description") setEditPromptDescription(value);
    if (field === "name") setEditPromptName(value);

    let newSchema = editTemplateSchema;
    if (newSchema) {
      try {
        const parsed = JSON.parse(newSchema);
        if (field === "prompt") parsed.raw_prompt = value;
        if (field === "negative_prompt") parsed.negative_prompt = value;
        if (field === "description") parsed.description = value;
        if (field === "name") parsed.name = value;
        newSchema = JSON.stringify(parsed, null, 2);
        setEditTemplateSchema(newSchema);
      } catch (e) {}
    }
  };

  const handleEditSchemaChange = (value: string) => {
    setEditTemplateSchema(value);
    try {
      const parsed = JSON.parse(value);
      if (parsed.raw_prompt !== undefined) setEditPromptText(parsed.raw_prompt);
      if (parsed.negative_prompt !== undefined) setEditNegativePrompt(parsed.negative_prompt);
      if (parsed.description !== undefined) setEditPromptDescription(parsed.description);
      if (parsed.name !== undefined) setEditPromptName(parsed.name);
    } catch (e) {}
  };

  const handleAddFieldChange = (field: "prompt" | "negative_prompt" | "description" | "name", value: string) => {
    if (field === "prompt") setNewPromptText(value);
    if (field === "negative_prompt") setNewNegativePrompt(value);
    if (field === "description") setNewPromptDescription(value);
    if (field === "name") setNewPromptName(value);

    let newSchema = newTemplateSchema;
    if (newSchema) {
      try {
        const parsed = JSON.parse(newSchema);
        if (field === "prompt") parsed.raw_prompt = value;
        if (field === "negative_prompt") parsed.negative_prompt = value;
        if (field === "description") parsed.description = value;
        if (field === "name") parsed.name = value;
        newSchema = JSON.stringify(parsed, null, 2);
        setNewTemplateSchema(newSchema);
      } catch (e) {}
    }
  };

  const handleAddSchemaChange = (value: string) => {
    setNewTemplateSchema(value);
    try {
      const parsed = JSON.parse(value);
      if (parsed.raw_prompt !== undefined) setNewPromptText(parsed.raw_prompt);
      if (parsed.negative_prompt !== undefined) setNewNegativePrompt(parsed.negative_prompt);
      if (parsed.description !== undefined) setNewPromptDescription(parsed.description);
      if (parsed.name !== undefined) setNewPromptName(parsed.name);
    } catch (e) {}
  };

  const handleSaveEditedPrompt = async (groupId: string) => {
    let finalPromptText = editPromptText.trim();
    let finalNegativePrompt = editNegativePrompt.trim();
    let finalName = editPromptName.trim();
    let finalDescription = editPromptDescription.trim();
    const finalTemplateSchema = editTemplateSchema.trim() || undefined;

    if (finalTemplateSchema) {
      try {
        const parsed = JSON.parse(finalTemplateSchema);
        if (!finalPromptText && parsed.raw_prompt) {
          finalPromptText = parsed.raw_prompt.trim();
        }
        if (!finalNegativePrompt && parsed.negative_prompt) {
          finalNegativePrompt = parsed.negative_prompt.trim();
        }
        if (!finalName && parsed.name) {
          finalName = parsed.name.trim();
        }
        if (!finalDescription && parsed.description) {
          finalDescription = parsed.description.trim();
        }
      } catch (e) {
        console.warn("解析 Template JSON 失败", e);
      }
    }

    if (!finalPromptText) {
      toast({
        title: "✗ Prompt 不能为空",
        description: "如果您使用了模板，请确保 JSON 中包含 raw_prompt 字段。",
        variant: "destructive",
      });
      return;
    }
    try {
      await promptApi.update(groupId, {
        prompt: finalPromptText,
        negativePrompt: finalNegativePrompt || undefined,
        name: finalName || undefined,
        description: finalDescription || undefined,
        templateSchema: finalTemplateSchema,
      });

      setAvailablePromptGroups((current) =>
        current.map((g) =>
          g.id === groupId
            ? {
                ...g,
                prompt: finalPromptText,
                negative_prompt: finalNegativePrompt || undefined,
                name: finalName || undefined,
                description: finalDescription || undefined,
                template_schema: finalTemplateSchema,
              }
            : g
        )
      );

      toast({
        title: "✓ Prompt 已更新",
      });

      setEditingGroupId(null);
    } catch (error) {
      console.error("更新 Prompt 失败:", error);
      toast({
        title: "✗ 更新 Prompt 失败",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const handleAddNewPrompt = async () => {
    if (!image) return;

    let finalPromptText = newPromptText.trim();
    let finalNegativePrompt = newNegativePrompt.trim();
    let finalName = newPromptName.trim();
    let finalDescription = newPromptDescription.trim();
    const finalTemplateSchema = newTemplateSchema.trim() || undefined;

    if (finalTemplateSchema) {
      try {
        const parsed = JSON.parse(finalTemplateSchema);
        if (!finalPromptText && parsed.raw_prompt) {
          finalPromptText = parsed.raw_prompt.trim();
        }
        if (!finalNegativePrompt && parsed.negative_prompt) {
          finalNegativePrompt = parsed.negative_prompt.trim();
        }
        if (!finalName && parsed.name) {
          finalName = parsed.name.trim();
        }
        if (!finalDescription && parsed.description) {
          finalDescription = parsed.description.trim();
        }
      } catch (e) {
        console.warn("解析 Template JSON 失败", e);
      }
    }

    if (!finalPromptText) {
      toast({
        title: "✗ Prompt 不能为空",
        description: "如果您使用了模板，请确保 JSON 中包含 raw_prompt 字段。",
        variant: "destructive",
      });
      return;
    }

    setIsAddingNewPrompt(true);
    try {
      const created = await promptApi.create({
        prompt: finalPromptText,
        negativePrompt: finalNegativePrompt || undefined,
        name: finalName || undefined,
        description: finalDescription || undefined,
        templateSchema: finalTemplateSchema,
        imageIds: [],
      });

      // Add to available prompt groups
      setAvailablePromptGroups((current) => [created, ...current]);
      
      // Auto-select/associate (single-selection)
      setSelectedPromptGroupIds([created.id]);

      // Clear inputs
      setNewPromptText("");
      setNewNegativePrompt("");
      setNewPromptDescription("");
      setNewTemplateSchema("");

      toast({
        title: "✓ 新增并关联成功",
      });

      setIsAddPromptOpen(false);
    } catch (error) {
      console.error("创建 Prompt 失败:", error);
      toast({
        title: "✗ 创建 Prompt 失败",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsAddingNewPrompt(false);
    }
  };

  const selectedGroupId = selectedPromptGroupIds[0];
  const selectedPromptGroup = availablePromptGroups.find((g) => g.id === selectedGroupId);

  const filteredPromptGroups = availablePromptGroups.filter((group) => {
    if (group.id === selectedGroupId) return false;
    
    const query = searchPromptQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      group.prompt.toLowerCase().includes(query) ||
      group.negative_prompt?.toLowerCase().includes(query) ||
      group.description?.toLowerCase().includes(query)
    );
  });

  if (!image) return null;

  const displayWidth = image.width || loadedDimensions?.width;
  const displayHeight = image.height || loadedDimensions?.height;

  return (
    <>
      <Dialog open={isQuickEditOpen} onOpenChange={(open) => !open && closeQuickEdit()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>编辑图片信息</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 gap-4 overflow-hidden">
          <div className="w-1/3 flex-shrink-0">
            <div className="bg-muted rounded-lg overflow-hidden flex items-center justify-center max-h-[50vh]">
              <img
                src={convertFileSrc(image.absolute_path)}
                alt={image.filename}
                className="max-w-full max-h-[50vh] object-contain"
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
              {!isIpImage && (
                <>
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
                    {selectedPromptGroup ? "已关联" : "未关联"}
                  </span>
                </div>

                {/* 当前已关联的 Prompt 置顶显示 */}
                {selectedPromptGroup && (
                  <div className="border border-primary bg-primary/5 rounded-md p-3 transition-all">
                    {editingGroupId === selectedPromptGroup.id ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold text-primary">编辑当前关联 Prompt</div>
                          <div className="flex space-x-2 border-b">
                            <button
                              type="button"
                              className={`pb-1 px-1 text-[11px] font-medium transition-colors border-b-2 ${
                                editPromptTab === "base" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                              }`}
                              onClick={() => setEditPromptTab("base")}
                            >
                              基础信息
                            </button>
                            <button
                              type="button"
                              className={`pb-1 px-1 text-[11px] font-medium transition-colors border-b-2 ${
                                editPromptTab === "template" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                              }`}
                              onClick={() => setEditPromptTab("template")}
                            >
                              Template JSON
                            </button>
                          </div>
                        </div>

                        {editPromptTab === "base" && (
                          <div className="space-y-2">
                            <textarea
                              value={editPromptText}
                              onChange={(e) => handleEditFieldChange("prompt", e.target.value)}
                              className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                              placeholder="Prompt"
                            />
                            <Input
                              value={editNegativePrompt}
                              onChange={(e) => handleEditFieldChange("negative_prompt", e.target.value)}
                              placeholder="负面提示词，可选"
                              className="h-8 text-xs bg-background text-foreground"
                            />
                            <Input
                              value={editPromptName}
                              onChange={(e) => handleEditFieldChange("name" as any, e.target.value)}
                              placeholder="模板名称，可选"
                              className="h-8 text-xs bg-background text-foreground"
                            />
                            <Input
                              value={editPromptDescription}
                              onChange={(e) => handleEditFieldChange("description", e.target.value)}
                              placeholder="说明，可选"
                              className="h-8 text-xs bg-background text-foreground"
                            />
                          </div>
                        )}

                        {editPromptTab === "template" && (
                          <div className="space-y-2">
                            <textarea
                              value={editTemplateSchema}
                              onChange={(e) => handleEditSchemaChange(e.target.value)}
                              className="w-full min-h-[100px] px-3 py-2 text-xs border rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground font-mono"
                              placeholder="Template JSON 数据 (可选，用于前台渲染表单)"
                            ></textarea>
                            
                            <TemplateVariableEditor 
                              value={editTemplateSchema} 
                              onChange={handleEditSchemaChange} 
                            />
                          </div>
                        )}
                        
                        <div className="flex justify-end gap-2 mt-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingGroupId(null)}
                            className="h-7 px-2 text-xs"
                          >
                            取消
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleSaveEditedPrompt(selectedPromptGroup.id)}
                            className="h-7 px-2 text-xs"
                          >
                            保存
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-xs font-semibold text-primary mb-2 flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5 fill-current animate-pulse" />
                            当前已关联 Prompt
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setSelectedPromptGroupIds([])}
                          >
                            取消关联
                          </Button>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="flex-1 text-left">
                            <div className="whitespace-pre-wrap break-words text-sm font-medium text-foreground">
                              {selectedPromptGroup.name && <span className="font-bold text-primary mr-2">{selectedPromptGroup.name}</span>}
                              {selectedPromptGroup.prompt}
                            </div>
                            {selectedPromptGroup.negative_prompt && (
                              <div className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                                负面提示词：{selectedPromptGroup.negative_prompt}
                              </div>
                            )}
                            {selectedPromptGroup.description && (
                              <div className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground/80 italic">
                                说明：{selectedPromptGroup.description}
                              </div>
                            )}
                            <div className="mt-2 text-xs text-muted-foreground">{selectedPromptGroup.image_count} 张图片</div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary hover:bg-primary/5"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleCopyPrompt(selectedPromptGroup.id, selectedPromptGroup.prompt, selectedPromptGroup.negative_prompt);
                              }}
                              title={copiedPromptId === selectedPromptGroup.id ? "已复制" : "复制 Prompt"}
                            >
                              {copiedPromptId === selectedPromptGroup.id ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary hover:bg-primary/5"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleStartEdit(selectedPromptGroup);
                              }}
                              title="编辑 Prompt"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {availablePromptGroups.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    <label className="text-xs text-muted-foreground">
                      {selectedPromptGroup ? "切换关联其他已有 Prompt" : "选择关联已有 Prompt"}
                    </label>
                    <Input
                      type="text"
                      placeholder="搜索其他 Prompt..."
                      value={searchPromptQuery}
                      onChange={(e) => setSearchPromptQuery(e.target.value)}
                      className="h-8 text-xs bg-background text-foreground"
                    />
                  </div>
                )}

                <div className="max-h-[200px] overflow-y-auto pr-1 space-y-2">
                  {filteredPromptGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2 text-center">
                      {availablePromptGroups.length === 0 ? "还没有可关联的 Prompt" : "没有找到匹配的 Prompt"}
                    </p>
                  ) : (
                    filteredPromptGroups.map((group, index) => {
                      const selected = selectedPromptGroupIds.includes(group.id);
                      const isEditing = editingGroupId === group.id;
                      return (
                        <div
                          key={group.id}
                          className={cn(
                            "rounded-md border p-3 transition-colors",
                            selected && !isEditing 
                              ? "border-primary bg-primary/10 text-primary" 
                              : cn(index % 2 === 0 ? "bg-background" : "bg-muted/30", "hover:bg-muted")
                          )}
                        >
                          {isEditing ? (
                            <div className="space-y-3 mt-3 border border-border bg-muted/20 rounded-md p-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-between">
                                <div className="text-xs font-semibold">编辑 Prompt</div>
                                <div className="flex space-x-2 border-b">
                                  <button
                                    type="button"
                                    className={`pb-1 px-1 text-[11px] font-medium transition-colors border-b-2 ${
                                      editPromptTab === "base" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                                    }`}
                                    onClick={() => setEditPromptTab("base")}
                                  >
                                    基础信息
                                  </button>
                                  <button
                                    type="button"
                                    className={`pb-1 px-1 text-[11px] font-medium transition-colors border-b-2 ${
                                      editPromptTab === "template" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                                    }`}
                                    onClick={() => setEditPromptTab("template")}
                                  >
                                    Template JSON
                                  </button>
                                </div>
                              </div>
                              {editPromptTab === "base" && (
                                <div className="space-y-2">
                                  <textarea
                                    value={editPromptText}
                                    onChange={(e) => handleEditFieldChange("prompt", e.target.value)}
                                    className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                                    placeholder="Prompt"
                                  />
                                  <Input
                                    value={editNegativePrompt}
                                    onChange={(e) => handleEditFieldChange("negative_prompt", e.target.value)}
                                    placeholder="负面提示词，可选"
                                    className="h-8 text-xs bg-background text-foreground"
                                  />
                                  <Input
                                    value={editPromptDescription}
                                    onChange={(e) => handleEditFieldChange("description", e.target.value)}
                                    placeholder="说明，可选"
                                    className="h-8 text-xs bg-background text-foreground"
                                  />
                                </div>
                              )}
                              {editPromptTab === "template" && (
                                <div className="space-y-2">
                                  <textarea
                                    value={editTemplateSchema}
                                    onChange={(e) => handleEditSchemaChange(e.target.value)}
                                    className="w-full min-h-[100px] px-3 py-2 text-xs border rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground font-mono"
                                    placeholder="Template JSON 数据 (可选)"
                                  ></textarea>
                                  
                                  <TemplateVariableEditor 
                                    value={editTemplateSchema} 
                                    onChange={handleEditSchemaChange} 
                                  />
                                </div>
                              )}
                              <div className="flex justify-end gap-2 mt-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingGroupId(null)}
                                  className="h-7 px-2 text-xs"
                                >
                                  取消
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => handleSaveEditedPrompt(group.id)}
                                  className="h-7 px-2 text-xs"
                                >
                                  保存
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-3">
                              <div className="mt-1 flex-shrink-0 cursor-pointer" onClick={() => togglePromptGroup(group.id)}>
                                {selected ? (
                                  <CheckCircle2 className="w-4 h-4 text-primary" />
                                ) : (
                                  <Circle className="w-4 h-4 text-muted-foreground" />
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => togglePromptGroup(group.id)}
                                className="flex-1 text-left"
                                title={group.prompt}
                              >
                                <div className="whitespace-pre-wrap break-words text-sm">
                                  {group.name && <span className="font-bold text-primary mr-2">{group.name}</span>}
                                  {group.prompt}
                                </div>
                                {group.negative_prompt && (
                                  <div className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                                    负面提示词：{group.negative_prompt}
                                  </div>
                                )}
                                {group.description && (
                                  <div className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground/80 italic">
                                    说明：{group.description}
                                  </div>
                                )}
                                <div className="mt-2 text-xs text-muted-foreground">{group.image_count} 张图片</div>
                              </button>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
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
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleStartEdit(group);
                                  }}
                                  title="编辑 Prompt"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full flex items-center justify-center gap-1.5 py-4 border-dashed text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setIsAddPromptOpen(true)}
                >
                  <Plus className="w-4 h-4" />
                  新增并关联 Prompt
                </Button>
              </div>

              <Separator />
              </>
            )}

            {isIpImage && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">关联 IP 形象</label>
                  <div className="flex flex-wrap gap-2">
                    {availableIps.map((ip) => {
                      const isSelected = selectedIpIds.includes(ip.id);
                      return (
                        <button
                          key={ip.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedIpIds(selectedIpIds.filter(id => id !== ip.id));
                            } else {
                              setSelectedIpIds([...selectedIpIds, ip.id]);
                            }
                          }}
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
                          {ip.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Separator />
              </>
            )}

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
                    <input 
                      type="radio" 
                      name="watermark" 
                      checked={!hasWatermark} 
                      onChange={() => {
                        setHasWatermark(false);
                      }} 
                      className="w-4 h-4" 
                    />
                    <span className="text-sm">无水印</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="watermark" 
                      checked={hasWatermark} 
                      onChange={() => {
                        setHasWatermark(true);
                        if (!watermarkPlatform) {
                          setWatermarkPlatform("unknown");
                        }
                      }} 
                      className="w-4 h-4" 
                    />
                    <span className="text-sm">有水印</span>
                  </label>
                </div>
                {hasWatermark && (
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">平台:</label>
                    <select
                      value={watermarkPlatform}
                      onChange={(e) => setWatermarkPlatform(e.target.value)}
                      className="text-xs border rounded p-1 bg-background"
                    >
                      <option value="unknown">未知</option>
                      <option value="gemini">gemini</option>
                      <option value="dalle">dalle</option>
                      <option value="midjourney">midjourney</option>
                    </select>
                  </div>
                )}
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

    <Dialog open={isAddPromptOpen} onOpenChange={setIsAddPromptOpen}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>新增并关联 Prompt</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4 flex-1 overflow-y-auto min-h-0 pr-2">
          <div className="flex space-x-4 border-b">
            <button
              type="button"
              className={`pb-2 text-sm font-medium transition-colors border-b-2 ${
                addPromptTab === "base" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setAddPromptTab("base")}
            >
              基础信息
            </button>
            <button
              type="button"
              className={`pb-2 text-sm font-medium transition-colors border-b-2 ${
                addPromptTab === "template" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setAddPromptTab("template")}
            >
              Template JSON
            </button>
          </div>

          {addPromptTab === "base" && (
            <div className="space-y-3">
              <textarea
                value={newPromptText}
                onChange={(e) => handleAddFieldChange("prompt", e.target.value)}
                placeholder="在此输入新的 Prompt..."
                className="w-full min-h-[120px] px-3 py-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
              />
              <Input
                value={newNegativePrompt}
                onChange={(e) => handleAddFieldChange("negative_prompt", e.target.value)}
                placeholder="负面提示词，可选"
                className="bg-background text-foreground"
              />
              <Input
                value={newPromptName}
                onChange={(e) => handleAddFieldChange("name" as any, e.target.value)}
                placeholder="模板名称，可选"
                className="bg-background text-foreground"
              />
              <Input
                value={newPromptDescription}
                onChange={(e) => handleAddFieldChange("description", e.target.value)}
                placeholder="简短说明（如：赛博朋克风格），可选"
                className="bg-background text-foreground"
              />
            </div>
          )}

          {addPromptTab === "template" && (
            <div className="space-y-3">
              <textarea
                value={newTemplateSchema}
                onChange={(e) => handleAddSchemaChange(e.target.value)}
                placeholder='提供 JSON 数据以支持智能表单填词。示例：{"variables": [...]}'
                className="w-full min-h-[120px] px-3 py-2 text-xs border rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground font-mono"
              ></textarea>
              
              <TemplateVariableEditor 
                value={newTemplateSchema} 
                onChange={handleAddSchemaChange} 
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setIsAddPromptOpen(false);
              setNewPromptText("");
              setNewNegativePrompt("");
              setNewPromptDescription("");
              setNewTemplateSchema("");
            }}
            disabled={isAddingNewPrompt}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={!newPromptText.trim() || isAddingNewPrompt}
            onClick={handleAddNewPrompt}
            className="flex items-center gap-1.5"
          >
            {isAddingNewPrompt && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            确认新增并关联
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  );
}
