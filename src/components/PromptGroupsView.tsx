import { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useUIStore, useImageStore, type ImageWithRelations, type PromptGroup } from "@/stores";
import { promptApi, imageApi } from "@/services/tauri";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sparkles, Plus, Trash2, Eye, RefreshCw, Pencil, Copy, Check, Search, X, ChevronLeft, ChevronRight, LayoutGrid, List } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { TemplateVariableEditor } from "./TemplateVariableEditor";
import { SmartPromptRenderer } from "./SmartPromptRenderer";
import { getPublishStatus, type PublishConfig } from "@/services/publish";
import { PublishModal } from "./PublishModal";
import {
  DEFAULT_PROMPT_TEMPLATE_CATEGORY,
  PROMPT_TEMPLATE_CATEGORIES,
  getPromptCategoryLabel,
} from "@/lib/promptTaxonomy";

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
    role?: string;
    is_cover?: boolean;
    sort_order?: number;
    caption?: string;
    variant_key?: string;
    variant_json?: string;
    is_sync_enabled?: boolean;
    sync_status?: string;
    remote_url?: string;
  }>;
}

interface PromptFormState {
  id?: string;
  prompt: string;
  negative_prompt: string;
  name: string;
  description: string;
  template_schema: string;
  category: string;
  tags: string;
  price: string;
  imageIds: string[];
}

const EMPTY_FORM: PromptFormState = {
  prompt: "",
  negative_prompt: "",
  name: "",
  description: "",
  template_schema: "",
  category: DEFAULT_PROMPT_TEMPLATE_CATEGORY,
  tags: "",
  price: "",
  imageIds: [],
};

const splitPromptTags = (tags?: string) =>
  (tags || "")
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

const formatPromptPrice = (price?: number) => {
  if (price === undefined || price === null || Number.isNaN(price)) return "";
  return `$${price.toFixed(2)}`;
};

export function PromptGroupsView() {
  const { settings } = useUIStore();
  const showFullImage = settings.showFullImage ?? false;
  const { inboxImages, archivedImages, setInboxImages, setArchivedImages } = useImageStore();
  const allImages = useMemo(() => [...inboxImages, ...archivedImages], [inboxImages, archivedImages]);

  const [groups, setGroups] = useState<PromptGroup[]>([]);
  const [groupImages, setGroupImages] = useState<Map<string, Array<{ id: string; absolute_path: string }>>>(new Map());
  const [selectedGroup, setSelectedGroup] = useState<PromptGroupWithImages | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formTab, setFormTab] = useState<"base" | "template">("base");
  const [form, setForm] = useState<PromptFormState>(EMPTY_FORM);
  const [imageSearch, setImageSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "linked" | "unlinked">("all");
  const [copiedGroupId, setCopiedGroupId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupFilterMode, setGroupFilterMode] = useState<"all" | "linked" | "unlinked">("all");
  const [publishFilterMode, setPublishFilterMode] = useState<"all" | "published" | "unpublished">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Publish Status State
  const [publishStatuses, setPublishStatuses] = useState<Map<string, PublishConfig>>(new Map());
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [publishingGroup, setPublishingGroup] = useState<PromptGroup | null>(null);

  const openPublishModal = (group: PromptGroup) => {
    setPublishingGroup(group);
    setIsPublishModalOpen(true);
  };

  const handlePublishSuccess = () => {
    // Refresh statuses after publish
    fetchPublishStatuses();
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, groupFilterMode, publishFilterMode, categoryFilter]);

  const filteredGroups = useMemo(() => {
    let result = groups;

    // Filter by association status
    if (groupFilterMode === "linked") {
      result = result.filter((group) => group.image_count > 0);
    } else if (groupFilterMode === "unlinked") {
      result = result.filter((group) => group.image_count === 0);
    }

    if (publishFilterMode === "published") {
      result = result.filter((group) => publishStatuses.get(group.id)?.is_published === true);
    } else if (publishFilterMode === "unpublished") {
      result = result.filter((group) => publishStatuses.get(group.id)?.is_published !== true);
    }

    if (categoryFilter !== "all") {
      result = result.filter((group) => (group.category || DEFAULT_PROMPT_TEMPLATE_CATEGORY) === categoryFilter);
    }

    // Filter by search query
    const query = searchQuery.trim().toLowerCase();
    if (!query) return result;

    return result.filter((group) => {
      return (
        group.prompt.toLowerCase().includes(query) ||
        (group.name && group.name.toLowerCase().includes(query)) ||
        (group.category && getPromptCategoryLabel(group.category).toLowerCase().includes(query)) ||
        (group.tags && group.tags.toLowerCase().includes(query)) ||
        (group.description && group.description.toLowerCase().includes(query)) ||
        (group.negative_prompt && group.negative_prompt.toLowerCase().includes(query))
      );
    });
  }, [groups, searchQuery, groupFilterMode, publishFilterMode, categoryFilter, publishStatuses]);

  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredGroups.slice(start, start + pageSize);
  }, [filteredGroups, currentPage, pageSize]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredGroups.length / pageSize));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [filteredGroups.length, currentPage, pageSize]);

  const fetchPublishStatuses = async (targetGroups: PromptGroup[] = paginatedGroups) => {
    if (targetGroups.length === 0) return;
    const ids = targetGroups.map(g => g.id);
    const statuses = await getPublishStatus(ids);
    setPublishStatuses(current => {
      const next = new Map(current);
      let changed = false;
      statuses.forEach(s => {
        const previous = current.get(s.id);
        if (
          !previous ||
          previous.price !== s.price ||
          previous.category !== s.category ||
          previous.is_published !== s.is_published
        ) {
          next.set(s.id, { price: s.price, category: s.category, is_published: s.is_published });
          changed = true;
        }
      });
      return changed ? next : current;
    });
  };

  useEffect(() => {
    fetchPublishStatuses();
  }, [paginatedGroups]);

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
      void fetchPublishStatuses(allGroups);
      
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
    setFormTab("base");
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
        name: result.group.name || "",
        description: result.group.description || "",
        template_schema: result.group.template_schema || "",
        category: result.group.category || DEFAULT_PROMPT_TEMPLATE_CATEGORY,
        tags: result.group.tags || "",
        price: result.group.price?.toString() || "",
        imageIds: result.images.map((image) => image.id),
      });
      setImageSearch("");
      setFormTab("base");
      setIsFormOpen(true);
    } catch (error) {
      console.error("加载 Prompt 编辑信息失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFieldChange = (field: keyof PromptFormState, value: string) => {
    setForm((current) => {
      let newSchema = current.template_schema;
      if (newSchema) {
        try {
          const parsed = JSON.parse(newSchema);
          if (field === "prompt") parsed.raw_prompt = value;
          if (field === "negative_prompt") parsed.negative_prompt = value;
          if (field === "description") parsed.description = value;
        if (field === "name") parsed.name = value;
          newSchema = JSON.stringify(parsed, null, 2);
        } catch (e) {
          // ignore parsing error during typing
        }
      }
      return { ...current, [field]: value, template_schema: newSchema };
    });
  };

  const handleSchemaChange = (value: string) => {
    setForm((current) => {
      let newPrompt = current.prompt;
      let newNegative = current.negative_prompt;
      let newName = current.name;
      let newDesc = current.description;

      try {
        const parsed = JSON.parse(value);
        if (parsed.raw_prompt !== undefined) newPrompt = parsed.raw_prompt;
        if (parsed.negative_prompt !== undefined) newNegative = parsed.negative_prompt;
        if (parsed.description !== undefined) newDesc = parsed.description;
        if (parsed.name !== undefined) newName = parsed.name;
      } catch (e) {
        // ignore
      }

      return {
        ...current,
        template_schema: value,
        prompt: newPrompt,
        negative_prompt: newNegative,
        name: newName,
        description: newDesc,
      };
    });
  };

  const savePrompt = async () => {
    let prompt = form.prompt.trim();
    let negativePrompt = form.negative_prompt.trim();
    let name = form.name.trim();
    let description = form.description.trim();
    const templateSchema = form.template_schema.trim() || undefined;
    const category = form.category || DEFAULT_PROMPT_TEMPLATE_CATEGORY;
    const tags = form.tags.trim();
    const parsedPrice = Number.parseFloat(form.price);
    const price = Number.isFinite(parsedPrice) ? parsedPrice : undefined;

    // 如果用户没有填某些字段，但填了 Template JSON，尝试从 JSON 中提取
    if (templateSchema) {
      try {
        const parsed = JSON.parse(templateSchema);
        if (!prompt && parsed.raw_prompt) {
          prompt = parsed.raw_prompt.trim();
        }
        if (!negativePrompt && parsed.negative_prompt) {
          negativePrompt = parsed.negative_prompt.trim();
        }
        if (!name && parsed.name) {
          name = parsed.name.trim();
        }
        if (!description && parsed.description) {
          description = parsed.description.trim();
        }
      } catch (e) {
        console.warn("解析 Template JSON 失败", e);
      }
    }

    if (!prompt) {
      toast({
        title: "✗ Prompt 不能为空",
        description: "如果您使用了模板，请确保 JSON 中包含 raw_prompt 字段。",
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
          negativePrompt: negativePrompt || undefined,
          name: name || undefined,
          description: description || undefined,
          templateSchema: templateSchema,
          category,
          tags,
          price,
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
          negativePrompt: negativePrompt || undefined,
          name: name || undefined,
          description: description || undefined,
          templateSchema: templateSchema,
          category,
          tags,
          price,
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
    let finalPrompt = group.prompt.trim();

    if (group.template_schema) {
      try {
        const parsed = JSON.parse(group.template_schema);
        if (parsed && Array.isArray(parsed.variables)) {
          let result = parsed.raw_prompt || finalPrompt;
          parsed.variables.forEach((v: any) => {
            let val = "";
            if (v.default !== undefined) {
              val = v.default;
            } else if (v.options && v.options.length > 0) {
              val = v.options[0].value;
            }
            const regex = new RegExp(`\\{\\{${v.key}\\}\\}`, "g");
            result = result.replace(regex, val);
          });
          finalPrompt = result.trim();
        }
      } catch (e) {
        // ignore
      }
    }

    const sections = [];
    sections.push(finalPrompt);

    if (group.negative_prompt?.trim()) {
      sections.push(`反向提示词:\n${group.negative_prompt.trim()}`);
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

  const handleCopyText = async (text: string, fieldName: string) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text.trim());
      toast({
        title: `✓ 已复制${fieldName}`,
      });
    } catch (error) {
      console.error(`复制${fieldName}失败:`, error);
      toast({
        title: `✗ 复制${fieldName}失败`,
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
      
      <div className="relative">
        <Input
          value={imageSearch}
          onChange={(event) => setImageSearch(event.target.value)}
          placeholder="搜索文件名或模型..."
          className="pr-9"
        />
        {imageSearch && (
          <button
            type="button"
            onClick={() => setImageSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
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
                    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted flex items-center justify-center">
                      <img
                        src={convertFileSrc(image.absolute_path)}
                        alt={image.filename}
                        className={`h-full w-full ${showFullImage ? "object-contain" : "object-cover"}`}
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
          <h2 className="text-lg font-semibold">sanPrompt</h2>
          <Badge variant="secondary">
            {searchQuery || groupFilterMode !== "all" || publishFilterMode !== "all" || categoryFilter !== "all"
              ? `${filteredGroups.length} / ${groups.length}` 
              : groups.length} 个 Prompt
          </Badge>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center rounded-md border bg-muted/50 p-0.5">
            <button
              onClick={() => setViewMode("list")}
              className={`flex h-8 items-center justify-center rounded-sm px-2.5 transition-colors ${
                viewMode === "list"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
              }`}
              title="列表视图"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`flex h-8 items-center justify-center rounded-sm px-2.5 transition-colors ${
                viewMode === "grid"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
              }`}
              title="网格视图"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索 Prompt/描述/负面提示..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 w-64 h-9"
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

          <select
            value={groupFilterMode}
            onChange={(e) => setGroupFilterMode(e.target.value as "all" | "linked" | "unlinked")}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground focus:text-foreground cursor-pointer"
          >
            <option value="all">全部关联状态</option>
            <option value="linked">已关联图片</option>
            <option value="unlinked">未关联图片</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground focus:text-foreground cursor-pointer"
          >
            <option value="all">全部分类</option>
            {PROMPT_TEMPLATE_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>

          <select
            value={publishFilterMode}
            onChange={(e) => setPublishFilterMode(e.target.value as "all" | "published" | "unpublished")}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground focus:text-foreground cursor-pointer"
          >
            <option value="all">全部上架状态</option>
            <option value="published">已上架</option>
            <option value="unpublished">未上架</option>
          </select>

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
        <div className={`p-4 ${viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" : "space-y-3"}`}>
          {filteredGroups.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                <Sparkles className="mx-auto mb-3 h-12 w-12 opacity-50" />
                <p>
                  {searchQuery 
                    ? "没有找到匹配的 Prompt" 
                    : groupFilterMode === "linked"
                    ? "没有已关联图片的 Prompt"
                    : groupFilterMode === "unlinked"
                    ? "没有未关联图片的 Prompt"
                    : categoryFilter !== "all"
                    ? "没有该分类下的 Prompt"
                    : "还没有 Prompt"}
                </p>
                <p className="mt-2 text-sm">
                  {searchQuery 
                    ? "请尝试更改搜索关键词" 
                    : groupFilterMode !== "all"
                    ? "请尝试更改筛选条件"
                    : categoryFilter !== "all"
                    ? "请尝试更改筛选条件"
                    : "创建一个 Prompt，并直接关联已有图片。"}
                </p>
              </CardContent>
            </Card>
          ) : (
            paginatedGroups.map((group) => (
              <Card 
                key={group.id} 
                className={`transition-shadow hover:shadow-md cursor-pointer select-none flex flex-col ${viewMode === "grid" ? "h-full" : ""}`}
                onDoubleClick={() => void openEditDialog(group.id)}
              >
                <CardHeader className="pb-3">
                  <div className={`flex ${viewMode === "grid" ? "flex-col gap-2" : "items-start justify-between gap-3"}`}>
                    <div className="min-w-0 flex-1">
                      <CardTitle className={`font-medium ${viewMode === "grid" ? "line-clamp-3 text-sm" : "line-clamp-2 text-sm"}`}>
                        {group.name ? (
                          <span className="font-bold text-primary mr-2">{group.name}</span>
                        ) : null}
                        {group.prompt}
                      </CardTitle>
                      {group.description && (
                        <CardDescription className="mt-1 text-xs">{group.description}</CardDescription>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="secondary" className="font-normal">
                          {getPromptCategoryLabel(group.category)}
                        </Badge>
                        {splitPromptTags(group.tags).slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="outline" className="font-normal">
                            {tag}
                          </Badge>
                        ))}
                        {splitPromptTags(group.tags).length > 3 && (
                          <Badge variant="outline" className="font-normal">
                            +{splitPromptTags(group.tags).length - 3}
                          </Badge>
                        )}
                        {group.price !== undefined && group.price !== null && (
                          <Badge variant="outline" className="font-normal">
                            {formatPromptPrice(group.price)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <Badge variant="outline">{group.image_count} 张</Badge>
                      {publishStatuses.get(group.id)?.is_published && (
                        <Badge variant="default" className="bg-green-600 hover:bg-green-700 whitespace-nowrap">
                          售卖中: ${publishStatuses.get(group.id)?.price}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0 flex flex-col flex-1">
                  <div className="space-y-3 flex-1">
                    {group.negative_prompt && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium">负面提示词：</span>
                        <span className={`line-clamp-1`}>{group.negative_prompt}</span>
                      </div>
                    )}

                    {/* 图片缩略图 */}
                    {groupImages.get(group.id) && groupImages.get(group.id)!.length > 0 && (
                      <div className="flex gap-2">
                        {groupImages.get(group.id)!.map((img) => (
                          <div key={img.id} className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted flex items-center justify-center">
                            <img
                               src={convertFileSrc(img.absolute_path)}
                              alt=""
                              className={`h-full w-full ${showFullImage ? "object-contain" : "object-cover"}`}
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
                  </div>

                  <div className={`flex items-center justify-between mt-4 ${viewMode === "grid" ? "flex-col items-start gap-3" : ""}`}>
                    <span className="text-xs text-muted-foreground">
                      更新于 {new Date(group.updated_at).toLocaleDateString("zh-CN")}
                    </span>

                    <div className={`flex gap-2 ${viewMode === "grid" ? "w-full justify-between" : ""}`} onDoubleClick={(e) => e.stopPropagation()}>
                      <Button variant="outline" size="sm" onClick={() => void handleCopyFullPrompt(group)} title="完整复制">
                        {copiedGroupId === group.id ? (
                          <Check className={viewMode === "grid" ? "h-3 w-3" : "mr-1 h-3 w-3"} />
                        ) : (
                          <Copy className={viewMode === "grid" ? "h-3 w-3" : "mr-1 h-3 w-3"} />
                        )}
                        {viewMode === "list" && (copiedGroupId === group.id ? "已复制" : "完整复制")}
                      </Button>
                      <Button 
                        variant={publishStatuses.get(group.id)?.is_published ? "outline" : "default"} 
                        size="sm" 
                        onClick={() => openPublishModal(group)} 
                        title="商城管理"
                        className={!publishStatuses.get(group.id)?.is_published ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-green-600 text-green-600 hover:bg-green-50"}
                      >
                        <Sparkles className={`h-3 w-3 ${viewMode === "list" ? "mr-1" : ""}`} />
                        {viewMode === "list" && (publishStatuses.get(group.id)?.is_published ? "管理商城" : "一键上架")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void viewGroupDetails(group.id)} title="查看">
                        <Eye className={viewMode === "grid" ? "h-3 w-3" : "mr-1 h-3 w-3"} />
                        {viewMode === "list" && "查看"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void openEditDialog(group.id)} title="编辑">
                        <Pencil className={viewMode === "grid" ? "h-3 w-3" : "mr-1 h-3 w-3"} />
                        {viewMode === "list" && "编辑"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void deleteGroup(group.id)} title="删除">
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

      {filteredGroups.length > 0 && (
        <div className="flex items-center justify-between border-t p-3 bg-card shadow-sm z-10 text-sm">
          <div className="text-muted-foreground flex items-center gap-3">
            <span>共 {filteredGroups.length} 条记录</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="h-7 rounded-md border border-input bg-background px-2 py-0.5 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground focus:text-foreground cursor-pointer"
            >
              <option value={12}>12 条/页</option>
              <option value={24}>24 条/页</option>
              <option value={48}>48 条/页</option>
              <option value={96}>96 条/页</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              上一页
            </Button>
            <div className="text-muted-foreground px-2">
              第 {currentPage} / {Math.max(1, Math.ceil(filteredGroups.length / pageSize))} 页
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(Math.ceil(filteredGroups.length / pageSize), p + 1))}
              disabled={currentPage >= Math.ceil(filteredGroups.length / pageSize) || Math.ceil(filteredGroups.length / pageSize) === 0}
              className="h-8"
            >
              下一页
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-h-[90vh] max-w-6xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-primary">
              {selectedGroup?.group.name || "Prompt 详情"}
            </DialogTitle>
            {selectedGroup?.group.description && (
              <DialogDescription className="text-sm mt-3 bg-muted/40 p-3 rounded-md border text-left text-muted-foreground">
                {selectedGroup.group.description}
              </DialogDescription>
            )}
          </DialogHeader>

          {selectedGroup && (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-6 pt-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{getPromptCategoryLabel(selectedGroup.group.category)}</Badge>
                  {splitPromptTags(selectedGroup.group.tags).map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                  {selectedGroup.group.price !== undefined && selectedGroup.group.price !== null && (
                    <Badge variant="outline">{formatPromptPrice(selectedGroup.group.price)}</Badge>
                  )}
                </div>

                <SmartPromptRenderer 
                  templateSchemaStr={selectedGroup.group.template_schema || ""} 
                  basePrompt={selectedGroup.group.prompt} 
                />

                {selectedGroup.group.negative_prompt && (
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">负面提示词：</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 px-2 text-xs" 
                        onClick={() => void handleCopyText(selectedGroup.group.negative_prompt || "", "负面提示词")}
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        复制
                      </Button>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap bg-muted/40 p-2.5 rounded border">
                      {selectedGroup.group.negative_prompt}
                    </p>
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
                          <div className="relative aspect-square bg-muted/40 flex items-center justify-center">
                            <img
                              src={convertFileSrc(image.absolute_path)}
                              alt={image.filename}
                              className={`h-full w-full ${showFullImage ? "object-contain" : "object-cover"}`}
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
        <DialogContent className="max-h-[90vh] max-w-4xl flex flex-col">
          <DialogHeader>
            <DialogTitle>{form.id ? "编辑 Prompt" : "添加 Prompt"}</DialogTitle>
            <DialogDescription>
              独立管理 Prompt，并手动关联已有图片。
            </DialogDescription>
          </DialogHeader>

          <div className="flex space-x-4 border-b mb-4 mt-2">
            <button
              type="button"
              className={`pb-2 text-sm font-medium transition-colors border-b-2 ${
                formTab === "base" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setFormTab("base")}
            >
              基础信息编辑
            </button>
            <button
              type="button"
              className={`pb-2 text-sm font-medium transition-colors border-b-2 ${
                formTab === "template" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setFormTab("template")}
            >
              Template JSON & 变量
            </button>
          </div>

          <div className="flex-1 pr-4 overflow-y-auto min-h-0">
            <div className="space-y-5">
              {formTab === "base" && (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Prompt</label>
                      {form.prompt && (
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="sm" 
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" 
                          onClick={() => void handleCopyText(form.prompt, "Prompt")}
                        >
                          <Copy className="mr-1 h-3 w-3" />
                          复制
                        </Button>
                      )}
                    </div>
                    <textarea
                      value={form.prompt}
                      onChange={(e) => handleFieldChange("prompt", e.target.value)}
                      className="min-h-[120px] w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="输入 Prompt..."
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">负面提示词</label>
                      {form.negative_prompt && (
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="sm" 
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" 
                          onClick={() => void handleCopyText(form.negative_prompt, "负面提示词")}
                        >
                          <Copy className="mr-1 h-3 w-3" />
                          复制
                        </Button>
                      )}
                    </div>
                    <textarea
                      value={form.negative_prompt}
                      onChange={(e) => handleFieldChange("negative_prompt", e.target.value)}
                      className="min-h-[90px] w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="可选"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">模板名称</label>
                    </div>
                    <Input
                      value={form.name}
                      onChange={(e) => handleFieldChange("name" as any, e.target.value)}
                      placeholder="可选，例如: 极简摄影"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">分类</label>
                      <select
                        value={form.category}
                        onChange={(e) => handleFieldChange("category", e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {PROMPT_TEMPLATE_CATEGORIES.map((category) => (
                          <option key={category.value} value={category.value}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">标签</label>
                      <Input
                        value={form.tags}
                        onChange={(e) => handleFieldChange("tags", e.target.value)}
                        placeholder="逗号分隔，例如: 写实, 海报"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">价格</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.price}
                        onChange={(e) => handleFieldChange("price", e.target.value)}
                        placeholder="例如: 4.99"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">说明</label>
                      {form.description && (
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="sm" 
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" 
                          onClick={() => void handleCopyText(form.description, "说明")}
                        >
                          <Copy className="mr-1 h-3 w-3" />
                          复制
                        </Button>
                      )}
                    </div>
                    <Input
                      value={form.description}
                      onChange={(e) => handleFieldChange("description", e.target.value)}
                      placeholder="可选"
                    />
                  </div>

                  <Separator />

                  {renderImageSelector(filteredImages)}
                </>
              )}

              {formTab === "template" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Template JSON 代码</label>
                      {form.template_schema && (
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="sm" 
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" 
                          onClick={() => void handleCopyText(form.template_schema, "Template JSON")}
                        >
                          <Copy className="mr-1 h-3 w-3" />
                          复制
                        </Button>
                      )}
                    </div>
                    <textarea
                      value={form.template_schema}
                      onChange={(e) => handleSchemaChange(e.target.value)}
                      className="min-h-[250px] w-full rounded-md border px-3 py-2 text-xs font-mono"
                      placeholder='可选，用于智能表单渲染。示例：{"variables": [...]}'
                    ></textarea>
                  </div>
                  
                  <TemplateVariableEditor 
                    value={form.template_schema} 
                    onChange={handleSchemaChange} 
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 mt-auto">
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void savePrompt()} disabled={isLoading}>
              {form.id ? "保存修改" : "创建 Prompt"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {publishingGroup && (
        <PublishModal
          group={publishingGroup}
          initialStatus={publishStatuses.get(publishingGroup.id)}
          isOpen={isPublishModalOpen}
          onClose={() => setIsPublishModalOpen(false)}
          onSuccess={handlePublishSuccess}
        />
      )}
    </div>
  );
}
