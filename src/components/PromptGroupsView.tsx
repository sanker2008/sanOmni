import { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useImageStore, type ImageWithRelations, type PromptGroup } from "@/stores";
import { promptApi, imageApi } from "@/services/tauri";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sparkles, Plus, Trash2, Eye, RefreshCw, Pencil, Copy, Check } from "lucide-react";
import { toast } from "@/hooks/useToast";

interface PromptGroupWithImages {
  group: PromptGroup;
  images: Array<{
    id: string;
    filename: string;
    absolute_path: string;
    primary_model_id: string;
    model_name: string;
    vendor_name: string;
    width?: number;
    height?: number;
    created_at: string;
  }>;
}

interface PromptFormState {
  id?: string;
  prompt: string;
  negative_prompt: string;
  description: string;
  imageIds: string[];
}

const EMPTY_FORM: PromptFormState = {
  prompt: "",
  negative_prompt: "",
  description: "",
  imageIds: [],
};

export function PromptGroupsView() {
  const { inboxImages, archivedImages, setInboxImages, setArchivedImages } = useImageStore();
  const allImages = useMemo(() => [...inboxImages, ...archivedImages], [inboxImages, archivedImages]);

  const [groups, setGroups] = useState<PromptGroup[]>([]);
  const [groupImages, setGroupImages] = useState<Map<string, Array<{ id: string; absolute_path: string }>>>(new Map());
  const [selectedGroup, setSelectedGroup] = useState<PromptGroupWithImages | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<PromptFormState>(EMPTY_FORM);
  const [imageSearch, setImageSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "linked" | "unlinked">("all");
  const [copiedGroupId, setCopiedGroupId] = useState<string | null>(null);

  useEffect(() => {
    void loadGroups();
    void loadImages();
  }, []);

  const loadImages = async () => {
    try {
      const [inbox, archived] = await Promise.all([
        imageApi.getInboxImages(),
        imageApi.getArchivedImages(),
      ]);
      setInboxImages(inbox);
      setArchivedImages(archived);
    } catch (error) {
      console.error("加载图片失败:", error);
    }
  };

  const loadGroups = async () => {
    try {
      setIsLoading(true);
      const allGroups = await promptApi.getAll();
      setGroups(allGroups);
      
      // 加载每个组的前几张图片
      const imagesMap = new Map();
      await Promise.all(
        allGroups.map(async (group) => {
          try {
            const detail = await promptApi.getOne(group.id);
            // 只取前 4 张图片
            imagesMap.set(group.id, detail.images.slice(0, 4).map(img => ({
              id: img.id,
              absolute_path: img.absolute_path
            })));
          } catch (error) {
            console.error(`加载组 ${group.id} 的图片失败:`, error);
          }
        })
      );
      setGroupImages(imagesMap);
    } catch (error) {
      console.error("加载 Prompt 失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const viewGroupDetails = async (groupId: string) => {
    try {
      setIsLoading(true);
      const result = await promptApi.getOne(groupId);
      setSelectedGroup(result);
      setIsDetailOpen(true);
    } catch (error) {
      console.error("加载 Prompt 详情失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateDialog = () => {
    setForm(EMPTY_FORM);
    setImageSearch("");
    setIsFormOpen(true);
  };

  const openEditDialog = async (groupId: string) => {
    try {
      setIsLoading(true);
      const result = await promptApi.getOne(groupId);
      setForm({
        id: result.group.id,
        prompt: result.group.prompt,
        negative_prompt: result.group.negative_prompt || "",
        description: result.group.description || "",
        imageIds: result.images.map((image) => image.id),
      });
      setImageSearch("");
      setIsFormOpen(true);
    } catch (error) {
      console.error("加载 Prompt 编辑信息失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const savePrompt = async () => {
    const prompt = form.prompt.trim();
    if (!prompt) {
      toast({
        title: "✗ Prompt 不能为空",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);

      if (form.id) {
        const existing = await promptApi.getOne(form.id);
        const previousIds = new Set(existing.images.map((image) => image.id));
        const nextIds = new Set(form.imageIds);

        await promptApi.update(form.id, {
          prompt,
          negativePrompt: form.negative_prompt.trim() || undefined,
          description: form.description.trim() || undefined,
        });

        const toAdd = form.imageIds.filter((id) => !previousIds.has(id));
        const toRemove = existing.images
          .map((image) => image.id)
          .filter((id) => !nextIds.has(id));

        if (toAdd.length > 0) {
          await promptApi.addImages(form.id, toAdd);
        }
        if (toRemove.length > 0) {
          await promptApi.removeImages(form.id, toRemove);
        }
      } else {
        await promptApi.create({
          prompt,
          negativePrompt: form.negative_prompt.trim() || undefined,
          description: form.description.trim() || undefined,
          imageIds: form.imageIds,
        });
      }

      setIsFormOpen(false);
      setForm(EMPTY_FORM);
      await loadGroups();
      if (selectedGroup?.group.id === form.id && form.id) {
        await viewGroupDetails(form.id);
      }
    } catch (error) {
      console.error("保存 Prompt 失败:", error);
      toast({
        title: "✗ 保存失败",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteGroup = async (groupId: string) => {
    if (!confirm("确定要删除这个 Prompt 吗？这不会删除图片。")) {
      return;
    }

    try {
      await promptApi.delete(groupId);
      if (selectedGroup?.group.id === groupId) {
        setIsDetailOpen(false);
        setSelectedGroup(null);
      }
      await loadGroups();
    } catch (error) {
      console.error("删除 Prompt 失败:", error);
      toast({
        title: "✗ 删除失败",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const buildFullPromptText = (group: PromptGroup) => {
    const sections = [`Prompt:\n${group.prompt.trim()}`];

    if (group.negative_prompt?.trim()) {
      sections.push(`反向提示词:\n${group.negative_prompt.trim()}`);
    }

    if (group.description?.trim()) {
      sections.push(`说明:\n${group.description.trim()}`);
    }

    return sections.join("\n\n");
  };

  const handleCopyFullPrompt = async (group: PromptGroup) => {
    try {
      await navigator.clipboard.writeText(buildFullPromptText(group));
      setCopiedGroupId(group.id);
      window.setTimeout(() => {
        setCopiedGroupId((current) => (current === group.id ? null : current));
      }, 1500);
    } catch (error) {
      console.error("复制完整 Prompt 失败:", error);
      toast({
        title: "✗ 复制失败",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const toggleImage = (imageId: string) => {
    setForm((current) => ({
      ...current,
      imageIds: current.imageIds.includes(imageId)
        ? current.imageIds.filter((id) => id !== imageId)
        : [...current.imageIds, imageId],
    }));
  };

  const groupImagesByModel = (images: PromptGroupWithImages["images"]) => {
    const grouped = new Map<string, typeof images>();

    images.forEach((image) => {
      const key = `${image.vendor_name} - ${image.model_name}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(image);
    });

    return Array.from(grouped.entries());
  };

  const renderImageSelector = (images: ImageWithRelations[]) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">关联图片</label>
        <span className="text-xs text-muted-foreground">已选 {form.imageIds.length} 张</span>
      </div>
      
      {/* 筛选按钮 */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant={filterMode === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterMode("all")}
          className="flex-1"
        >
          全部
        </Button>
        <Button
          type="button"
          variant={filterMode === "linked" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterMode("linked")}
          className="flex-1"
        >
          已关联
        </Button>
        <Button
          type="button"
          variant={filterMode === "unlinked" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterMode("unlinked")}
          className="flex-1"
        >
          未关联
        </Button>
      </div>
      
      <Input
        value={imageSearch}
        onChange={(event) => setImageSearch(event.target.value)}
        placeholder="搜索文件名或模型..."
      />
      <div className="text-xs text-muted-foreground">
        共 {images.length} 张图片
      </div>
      <ScrollArea className="h-[400px] rounded-md border p-3">
        <div className="space-y-2">
          {images.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {filterMode === "linked" 
                ? "没有已关联的图片" 
                : filterMode === "unlinked" 
                ? "没有未关联的图片" 
                : "当前没有可关联的图片"}
            </p>
          ) : (
            images.map((image) => {
              const selected = form.imageIds.includes(image.id);
              const primaryModel = image.models.find((model) => model.is_primary)?.name || "未设置模型";
              const hasGroups = image.prompt_groups && image.prompt_groups.length > 0;
              
              return (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => toggleImage(image.id)}
                  className={`w-full rounded-md border text-left transition-colors ${
                    selected ? "border-primary bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-start gap-3 px-3 py-2">
                    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                      <img
                        src={convertFileSrc(image.absolute_path)}
                        alt={image.filename}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{image.filename}</p>
                          <p className="truncate text-xs text-muted-foreground">{primaryModel}</p>
                        </div>
                        <div className="flex gap-1">
                          {selected && <Badge>已选中</Badge>}
                          {hasGroups && !selected && (
                            <Badge variant="secondary">
                              {image.prompt_groups.length} 个组
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );

  const filteredImages = useMemo(() => {
    const keyword = imageSearch.trim().toLowerCase();
    let images = allImages;

    // 根据筛选模式过滤
    if (filterMode === "linked") {
      images = images.filter((image) => image.prompt_groups && image.prompt_groups.length > 0);
    } else if (filterMode === "unlinked") {
      images = images.filter((image) => !image.prompt_groups || image.prompt_groups.length === 0);
    }

    // 根据搜索关键词过滤
    if (!keyword) {
      return images;
    }

    return images.filter((image) => {
      const primaryModel = image.models.find((model) => model.is_primary)?.name || "";
      return (
        image.filename.toLowerCase().includes(keyword) ||
        primaryModel.toLowerCase().includes(keyword)
      );
    });
  }, [allImages, imageSearch, filterMode]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-4 bg-card shadow-sm z-10">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-semibold">Prompt 管理</h2>
          <Badge variant="secondary">{groups.length} 个 Prompt</Badge>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadGroups()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            刷新
          </Button>
          <Button size="sm" onClick={openCreateDialog} disabled={isLoading}>
            <Plus className="mr-2 h-4 w-4" />
            添加 Prompt
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {groups.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                <Sparkles className="mx-auto mb-3 h-12 w-12 opacity-50" />
                <p>还没有 Prompt</p>
                <p className="mt-2 text-sm">创建一个 Prompt，并直接关联已有图片。</p>
              </CardContent>
            </Card>
          ) : (
            groups.map((group) => (
              <Card key={group.id} className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="line-clamp-2 text-sm font-medium">{group.prompt}</CardTitle>
                      {group.description && (
                        <CardDescription className="mt-1 text-xs">{group.description}</CardDescription>
                      )}
                    </div>
                    <Badge variant="outline">{group.image_count} 张</Badge>
                  </div>
                </CardHeader>

                <CardContent className="pt-0 space-y-3">
                  {group.negative_prompt && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">负面提示词：</span>
                      <span className="line-clamp-1">{group.negative_prompt}</span>
                    </div>
                  )}

                  {/* 图片缩略图 */}
                  {groupImages.get(group.id) && groupImages.get(group.id)!.length > 0 && (
                    <div className="flex gap-2">
                      {groupImages.get(group.id)!.map((img) => (
                        <div key={img.id} className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                          <img
                            src={convertFileSrc(img.absolute_path)}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ))}
                      {group.image_count > 4 && (
                        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                          +{group.image_count - 4}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      更新于 {new Date(group.updated_at).toLocaleDateString("zh-CN")}
                    </span>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => void handleCopyFullPrompt(group)}>
                        {copiedGroupId === group.id ? (
                          <Check className="mr-1 h-3 w-3" />
                        ) : (
                          <Copy className="mr-1 h-3 w-3" />
                        )}
                        {copiedGroupId === group.id ? "已复制" : "完整复制"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void viewGroupDetails(group.id)}>
                        <Eye className="mr-1 h-3 w-3" />
                        查看
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void openEditDialog(group.id)}>
                        <Pencil className="mr-1 h-3 w-3" />
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void deleteGroup(group.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-h-[90vh] max-w-6xl">
          <DialogHeader>
            <DialogTitle>Prompt 详情</DialogTitle>
          </DialogHeader>

          {selectedGroup && (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-6">
                <div>
                  <span className="text-sm font-medium">提示词：</span>
                  <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedGroup.group.prompt}
                  </p>
                </div>

                {selectedGroup.group.negative_prompt && (
                  <div>
                    <span className="text-sm font-medium">负面提示词：</span>
                    <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedGroup.group.negative_prompt}
                    </p>
                  </div>
                )}

                {selectedGroup.group.description && (
                  <div>
                    <span className="text-sm font-medium">说明：</span>
                    <p className="mt-1 text-sm text-muted-foreground">{selectedGroup.group.description}</p>
                  </div>
                )}

                <Separator />

                {groupImagesByModel(selectedGroup.images).map(([modelKey, images]) => (
                  <div key={modelKey} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{modelKey}</Badge>
                      <span className="text-sm text-muted-foreground">{images.length} 张图片</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                      {images.map((image) => (
                        <Card key={image.id} className="overflow-hidden">
                          <div className="relative aspect-square">
                            <img
                              src={convertFileSrc(image.absolute_path)}
                              alt={image.filename}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <CardContent className="p-2">
                            <p className="truncate text-xs text-muted-foreground">{image.filename}</p>
                            {image.width && image.height && (
                              <p className="text-xs text-muted-foreground">
                                {image.width} × {image.height}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "编辑 Prompt" : "添加 Prompt"}</DialogTitle>
            <DialogDescription>
              独立管理 Prompt，并手动关联已有图片。
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">Prompt</label>
                <textarea
                  value={form.prompt}
                  onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
                  className="min-h-[120px] w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="输入 Prompt..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">负面提示词</label>
                <textarea
                  value={form.negative_prompt}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, negative_prompt: event.target.value }))
                  }
                  className="min-h-[90px] w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="可选"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">说明</label>
                <Input
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="可选"
                />
              </div>

              <Separator />

              {renderImageSelector(filteredImages)}
            </div>
          </ScrollArea>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void savePrompt()} disabled={isLoading}>
              {form.id ? "保存修改" : "创建 Prompt"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
