import { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useUIStore, useImageStore, type ImageWithRelations, type PromptGroup } from "@/stores";
import { promptApi, imageApi } from "@/services/tauri";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, Plus, Trash2, Eye, RefreshCw, Pencil, Copy, Check, Search, X, ChevronLeft, ChevronRight, LayoutGrid, List, AlertTriangle, Activity, Loader2, Upload, Download, Image as ImageIcon } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { TemplateVariableEditor } from "./TemplateVariableEditor";
import { SmartPromptRenderer } from "./SmartPromptRenderer";
import { getPublishStatus, type PublishConfig, testPublishConnection } from "@/services/publish";
import { PublishModal } from "./PublishModal";
import {
  DEFAULT_PROMPT_TEMPLATE_CATEGORY,
  PROMPT_TEMPLATE_CATEGORIES,
  getPromptCategoryLabel,
} from "@/lib/promptTaxonomy";
import {
  getPromptTemplateImportExample,
  parsePromptTemplateImport,
  promptTemplateImportToFormData,
  PromptTemplateImportError,
  type ParsedPromptTemplateImport,
} from "@/lib/promptTemplateImport";
import { authorizeFsPaths, readTextFile, writeTextFile } from "@/services/secureFs";
import { dirname } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";

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
    status: "inbox" | "tagged" | "archived";
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

interface ImportSuccessNotice {
  fileName: string;
  templateName: string;
  tagCount: number;
  variableCount: number;
}

interface BatchImportResult {
  index: number;
  name: string;
  status: "pending" | "success" | "error";
  message?: string;
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

const splitPromptTags = (tags?: string): string[] => {
  if (!tags) return [];
  const trimmed = tags.trim();
  if (!trimmed) return [];

  // Try parsing as JSON array
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(t => String(t).trim()).filter(Boolean);
      }
    } catch (e) {
      // If parsing fails (e.g. invalid JSON due to single quotes like python list representation: ['a', 'b'])
      // Clean up brackets, split by comma, and remove outer quotes.
      const content = trimmed.slice(1, -1).trim();
      if (!content) return [];
      return content
        .split(/[,，]/)
        .map(tag => tag.trim().replace(/^['"]|['"]$/g, "").trim())
        .filter(Boolean);
    }
  }

  // Fallback to comma-separated string
  return trimmed
    .split(/[,，]/)
    .map(tag => tag.trim())
    .filter(Boolean);
};

const formatPromptPrice = (price?: number) => {
  if (price === undefined || price === null || Number.isNaN(price)) return "";
  return `$${price.toFixed(2)}`;
};

export function PromptGroupsView() {
  const { settings, openImageViewer } = useUIStore();
  const showFullImage = settings.showFullImage ?? false;
  const { inboxImages, archivedImages, setInboxImages, setArchivedImages } = useImageStore();
  const allImages = useMemo(() => [...inboxImages, ...archivedImages], [inboxImages, archivedImages]);

  const [groups, setGroups] = useState<PromptGroup[]>([]);
  const [groupImages, setGroupImages] = useState<Map<string, any[]>>(new Map());
  const [selectedGroup, setSelectedGroup] = useState<PromptGroupWithImages | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importCandidate, setImportCandidate] = useState<ParsedPromptTemplateImport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isBatchImporting, setIsBatchImporting] = useState(false);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [batchImportResults, setBatchImportResults] = useState<BatchImportResult[]>([]);
  const [importSuccess, setImportSuccess] = useState<ImportSuccessNotice | null>(null);
  const [formTab, setFormTab] = useState<"base" | "template">("base");
  const [form, setForm] = useState<PromptFormState>(EMPTY_FORM);
  const [imageSearch, setImageSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "linked" | "unlinked">("all");
  const [copiedGroupId, setCopiedGroupId] = useState<string | null>(null);
  const [publishConfigError, setPublishConfigError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupFilterMode, setGroupFilterMode] = useState<"all" | "linked" | "unlinked">("all");
  const [publishFilterMode, setPublishFilterMode] = useState<"all" | "published" | "unpublished">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const validImportTemplates = importCandidate?.items.flatMap((item) => (
    item.template ? [{ index: item.index, template: item.template }] : []
  )) ?? [];
  const invalidImportCount = importCandidate
    ? importCandidate.items.length - validImportTemplates.length
    : 0;
  const isSingleTemplateImport = importCandidate?.items.length === 1 && validImportTemplates.length === 1;
  const isImportBusy = isImporting || isBatchImporting;

  // Publish Status State
  const [publishStatuses, setPublishStatuses] = useState<Map<string, PublishConfig>>(new Map());
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [publishingGroup, setPublishingGroup] = useState<PromptGroup | null>(null);

  // Connection Status
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "error">("idle");

  const handleTestConnection = async () => {
    setConnectionStatus("testing");
    const result = await testPublishConnection();
    if (result.success) {
      setConnectionStatus("success");
      toast({ title: "连接成功", description: "已成功连接到 sanPrompt", variant: "default" });
      setTimeout(() => setConnectionStatus("idle"), 5000);
    } else {
      setConnectionStatus("error");
      toast({ title: "连接失败", description: result.message, variant: "destructive" });
      setTimeout(() => setConnectionStatus("idle"), 8000);
    }
  };

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
    try {
      const statuses = await getPublishStatus(ids);
      setPublishConfigError(null);
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
    } catch (error: any) {
      if (error.message && error.message.includes("sanPrompt publish secret is not configured")) {
        setPublishConfigError("发布密钥未配置。请前往左下角设置中心 -> 【提示词库与同步】中配置密钥，以便正常拉取线上在售状态和发布内容。");
      } else {
        console.error("fetchPublishStatuses error:", error);
      }
    }
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

  const loadGroups = async (showToast = false) => {
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
            // 存储完整图片数据以支持大图浏览
            imagesMap.set(group.id, detail.images);
          } catch (error) {
            console.error(`加载组 ${group.id} 的图片失败:`, error);
          }
        })
      );
      setGroupImages(imagesMap);

      if (showToast) {
        toast({ title: "刷新成功", description: "数据已更新", duration: 2000 });
      }
    } catch (error: any) {
      console.error("加载 Prompt 失败:", error);
      if (showToast) {
        toast({ title: "刷新失败", description: error.message || "未知错误", variant: "destructive" });
      }
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
    setImportSuccess(null);
    setForm(EMPTY_FORM);
    setImageSearch("");
    setFormTab("base");
    setIsFormOpen(true);
  };

  const openImportDialog = () => {
    setImportCandidate(null);
    setImportError(null);
    setImportFileName(null);
    setBatchImportResults([]);
    setIsImportDialogOpen(true);
  };

  const closeImportDialog = () => {
    if (isImportBusy) return;
    setIsImportDialogOpen(false);
    setImportCandidate(null);
    setImportError(null);
    setImportFileName(null);
    setBatchImportResults([]);
  };

  const handleSelectImportFile = async () => {
    try {
      setImportError(null);
      const selectedPath = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "sanOmni Prompt 模板", extensions: ["json"] }],
      });
      if (!selectedPath || Array.isArray(selectedPath)) return;

      setIsImporting(true);
      setImportFileName(selectedPath.split(/[\\/]/).pop() || selectedPath);
      setImportCandidate(null);
      setBatchImportResults([]);
      await authorizeFsPaths([selectedPath]);
      const imported = parsePromptTemplateImport(await readTextFile(selectedPath));
      setImportCandidate(imported);
    } catch (error) {
      const description = error instanceof PromptTemplateImportError
        ? error.issues.join("；")
        : String(error);
      console.error("导入 Prompt 模板失败:", error);
      setImportCandidate(null);
      setImportError(description);
    } finally {
      setIsImporting(false);
    }
  };

  const handleConfirmSingleImport = () => {
    const imported = validImportTemplates[0];
    if (!importCandidate || !imported || !isSingleTemplateImport) return;

    setForm({
      ...EMPTY_FORM,
      ...promptTemplateImportToFormData(imported.template),
    });
    setImageSearch("");
    setFormTab("base");
    setImportSuccess({
      fileName: importFileName || "已选择的 JSON 文件",
      templateName: imported.template.name,
      tagCount: imported.template.tags.length,
      variableCount: imported.template.template_schema.variables.length,
    });
    setIsImportDialogOpen(false);
    setImportCandidate(null);
    setImportError(null);
    setImportFileName(null);
    setBatchImportResults([]);
    setIsFormOpen(true);
    toast({
      title: "✓ 模板已导入",
      description: "请确认内容并按需要关联图片后，创建 Prompt。",
    });
  };

  const handleConfirmBatchImport = async () => {
    if (!importCandidate || validImportTemplates.length === 0) return;

    const templatesToImport = validImportTemplates;
    setBatchImportResults(templatesToImport.map(({ index, template }) => ({
      index,
      name: template.name,
      status: "pending",
    })));
    setIsBatchImporting(true);

    let successCount = 0;
    await Promise.all(templatesToImport.map(async ({ index, template }) => {
      try {
        await promptApi.create({
          prompt: template.prompt,
          negativePrompt: template.negative_prompt,
          name: template.name,
          description: template.description,
          templateSchema: JSON.stringify(template.template_schema, null, 2),
          category: template.category,
          tags: JSON.stringify(template.tags),
          price: template.price,
          imageIds: [],
        });
        successCount += 1;
        setBatchImportResults((current) => current.map((result) => (
          result.index === index ? { ...result, status: "success" } : result
        )));
      } catch (error) {
        console.error(`批量导入模板 ${template.name} 失败:`, error);
        setBatchImportResults((current) => current.map((result) => (
          result.index === index
            ? { ...result, status: "error", message: String(error) }
            : result
        )));
      }
    }));

    try {
      if (successCount > 0) await loadGroups();
      toast({
        title: successCount === templatesToImport.length ? "✓ 批量导入完成" : "批量导入完成，部分模板失败",
        description: `成功 ${successCount} 个，失败 ${templatesToImport.length - successCount} 个。详情请查看本窗口。`,
        variant: successCount === templatesToImport.length ? "default" : "destructive",
      });
    } finally {
      setIsBatchImporting(false);
    }
  };

  const handleDownloadImportExample = async () => {
    try {
      const savePath = await save({
        defaultPath: "sanomni-prompt-template.v1.example.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!savePath) return;

      await authorizeFsPaths([await dirname(savePath)]);
      await writeTextFile(savePath, `${JSON.stringify(getPromptTemplateImportExample(), null, 2)}\n`);
      toast({
        title: "✓ 已保存导入示例",
        description: "将该 JSON 交给 Agent 按相同结构生成新模板即可。",
      });
    } catch (error) {
      console.error("保存 Prompt 导入示例失败:", error);
      toast({
        title: "✗ 保存示例失败",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const openEditDialog = async (groupId: string) => {
    try {
      setIsLoading(true);
      setImportSuccess(null);
      const result = await promptApi.getOne(groupId);
      setForm({
        id: result.group.id,
        prompt: result.group.prompt,
        negative_prompt: result.group.negative_prompt || "",
        name: result.group.name || "",
        description: result.group.description || "",
        template_schema: result.group.template_schema || "",
        category: result.group.category || DEFAULT_PROMPT_TEMPLATE_CATEGORY,
        tags: splitPromptTags(result.group.tags).join(", "),
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
    
    // Parse form input (comma-separated) to a JSON array string for DB storage
    const parsedTags = form.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    const tags = JSON.stringify(parsedTags);

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

      {/* 已经绑定的图片展示区域 */}
      {form.imageIds.length > 0 && (
        <div className="space-y-2 p-3 border rounded-md bg-muted/30">
          <label className="text-xs font-semibold text-muted-foreground">已绑定的图片 ({form.imageIds.length})</label>
          <div className="flex flex-wrap gap-2">
            {form.imageIds.map(id => {
              const image = allImages.find(img => img.id === id);
              if (!image) return null;
              return (
                <div key={id} className="relative group rounded-md overflow-hidden h-24 w-24 border bg-muted flex-shrink-0">
                  <img
                    src={convertFileSrc(image.absolute_path)}
                    alt={image.filename}
                    className={`h-full w-full ${showFullImage ? "object-contain" : "object-cover"}`}
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const boundImages = form.imageIds.map(imgId => allImages.find(i => i.id === imgId)).filter(Boolean);
                        openImageViewer(id, boundImages as any);
                      }}
                      className="text-white hover:text-primary bg-black/40 hover:bg-black/60 rounded-full p-2 transition-colors"
                      title="查看大图"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleImage(id);
                      }}
                      className="text-white hover:text-destructive bg-black/40 hover:bg-black/60 rounded-full p-2 transition-colors"
                      title="移除关联"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
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

  const currentGroupIndex = selectedGroup ? filteredGroups.findIndex(g => g.id === selectedGroup.group.id) : -1;
  const hasPrevious = currentGroupIndex > 0;
  const hasNext = currentGroupIndex !== -1 && currentGroupIndex < filteredGroups.length - 1;

  const navigateToPrevious = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasPrevious) {
      void viewGroupDetails(filteredGroups[currentGroupIndex - 1].id);
    }
  };

  const navigateToNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasNext) {
      void viewGroupDetails(filteredGroups[currentGroupIndex + 1].id);
    }
  };

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

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={handleTestConnection} disabled={connectionStatus === "testing"} className={`w-9 h-9 shrink-0 ${connectionStatus === "success" ? "border-green-500/50 text-green-600 dark:text-green-500 bg-green-500/10 hover:bg-green-500/20" : connectionStatus === "error" ? "border-destructive/50 text-destructive bg-destructive/10 hover:bg-destructive/20" : ""}`}>
                  {connectionStatus === "testing" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Activity className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{connectionStatus === "testing" ? "测试中..." : connectionStatus === "success" ? "连接正常" : connectionStatus === "error" ? "连接失败" : "测试连接"}</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={() => void loadGroups(true)} disabled={isLoading} className="w-9 h-9 shrink-0">
                  <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>刷新</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={openImportDialog} disabled={isLoading} className="h-9 shrink-0 gap-1.5">
                  <Upload className="h-4 w-4" />
                  导入模板
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>导入模板</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" onClick={openCreateDialog} disabled={isLoading} className="w-9 h-9 shrink-0">
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>添加 Prompt</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {publishConfigError && (
        <div className="bg-destructive/10 border-b border-destructive/20 text-destructive text-sm px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>{publishConfigError}</p>
        </div>
      )}

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
            paginatedGroups.map((group) => {
              const images = groupImages.get(group.id) || [];
              const firstImg = images[0];

              if (viewMode === "grid") {
                return (
                  <Card 
                    key={group.id} 
                    className="transition-all hover:shadow-md cursor-pointer select-none flex flex-col h-full overflow-hidden group border border-border/60"
                    onDoubleClick={() => void openEditDialog(group.id)}
                  >
                    {/* Cover Image Block */}
                    <div className="relative aspect-[4/3] w-full bg-muted/30 overflow-hidden flex items-center justify-center border-b">
                      {firstImg ? (
                        <img
                          src={convertFileSrc(firstImg.absolute_path)}
                          alt={group.name || group.prompt}
                          className={`w-full h-full ${showFullImage ? "object-contain" : "object-cover"} group-hover:scale-105 transition-transform duration-300`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const fullImages = images.map(img => allImages.find(i => i.id === img.id) || img);
                            openImageViewer(firstImg.id, fullImages as any);
                          }}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-muted-foreground/40 gap-1 p-2">
                          <ImageIcon className="w-8 h-8 opacity-40" />
                          <span className="text-xs">暂无示例图</span>
                        </div>
                      )}
                      <div className="absolute top-2 right-2 flex gap-1">
                        <Badge variant="outline" className="bg-background/80 backdrop-blur-sm text-xs font-normal">
                          {group.image_count} 张
                        </Badge>
                        {publishStatuses.get(group.id)?.is_published && (
                          <Badge variant="default" className="bg-green-600/90 backdrop-blur-sm text-xs whitespace-nowrap">
                            售卖中: ${publishStatuses.get(group.id)?.price}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <CardHeader className="p-3 pb-2 space-y-1">
                      <CardTitle className="font-medium line-clamp-1 text-sm flex items-center gap-1.5">
                        {group.name ? (
                          <span className="font-bold text-primary">{group.name}</span>
                        ) : (
                          <span className="line-clamp-1">{group.prompt}</span>
                        )}
                      </CardTitle>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary" className="font-normal text-[11px] px-1.5 py-0">
                          {getPromptCategoryLabel(group.category)}
                        </Badge>
                        {splitPromptTags(group.tags).slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="outline" className="font-normal text-[11px] px-1.5 py-0">
                            {tag}
                          </Badge>
                        ))}
                        {group.price !== undefined && group.price !== null && (
                          <Badge variant="outline" className="font-normal text-[11px] px-1.5 py-0">
                            {formatPromptPrice(group.price)}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="p-3 pt-0 flex flex-col flex-1 justify-between gap-3 text-xs">
                      <div className="space-y-1.5">
                        <p className="line-clamp-2 text-muted-foreground leading-relaxed">
                          {group.prompt}
                        </p>
                        {group.negative_prompt && (
                          <p className="line-clamp-1 text-muted-foreground/70 text-[11px]">
                            <span className="font-medium">负面: </span>{group.negative_prompt}
                          </p>
                        )}
                      </div>

                      <div className="pt-2 border-t flex flex-col gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          更新于 {new Date(group.updated_at).toLocaleDateString("zh-CN")}
                        </span>
                        <div className="flex gap-1 justify-between" onDoubleClick={(e) => e.stopPropagation()}>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => void handleCopyFullPrompt(group)} title="完整复制">
                            {copiedGroupId === group.id ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                          </Button>
                          <Button 
                            variant={publishStatuses.get(group.id)?.is_published ? "outline" : "default"} 
                            size="sm" 
                            className={`h-7 px-2 text-xs ${!publishStatuses.get(group.id)?.is_published ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-green-600 text-green-600 hover:bg-green-50"}`}
                            onClick={() => openPublishModal(group)} 
                            title="商城管理"
                          >
                            <Sparkles className="h-3 w-3" />
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => void viewGroupDetails(group.id)} title="查看">
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => void openEditDialog(group.id)} title="编辑">
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-1.5 text-xs text-muted-foreground hover:text-destructive" onClick={() => void deleteGroup(group.id)} title="删除">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              }

              // List Mode (Left-Right Split Layout)
              return (
                <Card 
                  key={group.id} 
                  className="transition-all hover:shadow-md cursor-pointer select-none flex flex-row overflow-hidden group min-h-[160px] border border-border/60"
                  onDoubleClick={() => void openEditDialog(group.id)}
                >
                  {/* Left Column: Hero Image Preview (180px - 224px width) */}
                  <div className="w-44 sm:w-52 md:w-60 flex-shrink-0 bg-muted/20 border-r border-border/50 p-2.5 flex flex-col justify-between">
                    <div 
                      className="relative w-full aspect-square rounded-lg overflow-hidden bg-muted flex items-center justify-center cursor-pointer group/img shadow-inner"
                      onClick={(e) => {
                        if (!firstImg) return;
                        e.stopPropagation();
                        const fullImages = images.map(img => allImages.find(i => i.id === img.id) || img);
                        openImageViewer(firstImg.id, fullImages as any);
                      }}
                    >
                      {firstImg ? (
                        <>
                          <img
                            src={convertFileSrc(firstImg.absolute_path)}
                            alt={group.name || group.prompt}
                            className={`w-full h-full ${showFullImage ? "object-contain" : "object-cover"} group-hover/img:scale-105 transition-transform duration-300`}
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white text-xs gap-1 font-medium backdrop-blur-[1px]">
                            <Eye className="w-3.5 h-3.5" />
                            <span>放大预览</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-muted-foreground/40 gap-1.5 p-2 text-center">
                          <ImageIcon className="w-7 h-7 opacity-40" />
                          <span className="text-[11px]">暂无示例图</span>
                        </div>
                      )}
                    </div>

                    {/* Thumbnail strip if multiple images exist */}
                    {images.length > 1 && (
                      <div className="flex gap-1.5 mt-2 overflow-x-auto pb-0.5 scrollbar-none">
                        {images.slice(1, 4).map((img) => (
                          <div 
                            key={img.id}
                            className="w-9 h-9 rounded overflow-hidden bg-muted flex-shrink-0 border border-border/60 hover:border-primary cursor-pointer hover:opacity-90 transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              const fullImages = images.map(i => allImages.find(x => x.id === i.id) || i);
                              openImageViewer(img.id, fullImages as any);
                            }}
                          >
                            <img src={convertFileSrc(img.absolute_path)} alt="" className="w-full h-full object-cover" />
                          </div>
                        ))}
                        {group.image_count > 4 && (
                          <div className="w-9 h-9 rounded bg-muted/80 flex items-center justify-center text-[10px] text-muted-foreground font-semibold flex-shrink-0 border">
                            +{group.image_count - 4}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Info & Actions */}
                  <div className="flex-1 p-3.5 sm:p-4 flex flex-col justify-between min-w-0 gap-2">
                    {/* Header: Title & Badges */}
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-sm sm:text-base text-foreground line-clamp-1">
                            {group.name ? (
                              <span className="text-primary font-bold mr-2">{group.name}</span>
                            ) : null}
                            <span className={group.name ? "text-muted-foreground font-normal text-xs" : "font-semibold"}>
                              {group.prompt}
                            </span>
                          </h3>
                          {group.description && (
                            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{group.description}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Badge variant="outline" className="text-xs font-normal">
                            {group.image_count} 张
                          </Badge>
                          {publishStatuses.get(group.id)?.is_published && (
                            <Badge variant="default" className="bg-green-600 hover:bg-green-700 whitespace-nowrap text-xs">
                              售卖中: ${publishStatuses.get(group.id)?.price}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Category & Tag Pills */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <Badge variant="secondary" className="font-normal text-xs">
                          {getPromptCategoryLabel(group.category)}
                        </Badge>
                        {splitPromptTags(group.tags).slice(0, 4).map((tag) => (
                          <Badge key={tag} variant="outline" className="font-normal text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {splitPromptTags(group.tags).length > 4 && (
                          <Badge variant="outline" className="font-normal text-xs">
                            +{splitPromptTags(group.tags).length - 4}
                          </Badge>
                        )}
                        {group.price !== undefined && group.price !== null && (
                          <Badge variant="outline" className="font-normal text-xs">
                            {formatPromptPrice(group.price)}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Middle: Prompt Content & Negative Prompt */}
                    <div className="space-y-1.5 my-1">
                      <div className="text-xs sm:text-sm text-foreground/90 font-normal line-clamp-2 leading-relaxed bg-muted/30 p-2.5 rounded-md border border-border/40">
                        <span className="font-semibold text-[11px] text-primary/80 mr-2 uppercase tracking-wider select-none">Prompt</span>
                        {group.prompt}
                      </div>

                      {group.negative_prompt && (
                        <div className="text-xs text-muted-foreground line-clamp-1 px-1">
                          <span className="font-medium text-muted-foreground/80 mr-1">负面提示词：</span>
                          <span>{group.negative_prompt}</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom: Timestamp & Action Buttons */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                      <span className="text-xs text-muted-foreground">
                        更新于 {new Date(group.updated_at).toLocaleDateString("zh-CN")}
                      </span>

                      <div className="flex items-center gap-2" onDoubleClick={(e) => e.stopPropagation()}>
                        <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs gap-1" onClick={() => void handleCopyFullPrompt(group)} title="完整复制">
                          {copiedGroupId === group.id ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                          <span>{copiedGroupId === group.id ? "已复制" : "完整复制"}</span>
                        </Button>
                        <Button 
                          variant={publishStatuses.get(group.id)?.is_published ? "outline" : "default"} 
                          size="sm" 
                          className={`h-8 px-2.5 text-xs gap-1 ${!publishStatuses.get(group.id)?.is_published ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-green-600 text-green-600 hover:bg-green-50"}`}
                          onClick={() => openPublishModal(group)} 
                          title="商城管理"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>{publishStatuses.get(group.id)?.is_published ? "管理商城" : "一键上架"}</span>
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs gap-1" onClick={() => void viewGroupDetails(group.id)} title="查看">
                          <Eye className="h-3.5 w-3.5" />
                          <span>查看</span>
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs gap-1" onClick={() => void openEditDialog(group.id)} title="编辑">
                          <Pencil className="h-3.5 w-3.5" />
                          <span>编辑</span>
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => void deleteGroup(group.id)} title="删除">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })
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
            <div className="flex items-center text-muted-foreground px-2 text-sm">
              第
              <input
                key={currentPage}
                type="number"
                min={1}
                max={Math.max(1, Math.ceil(filteredGroups.length / pageSize))}
                defaultValue={currentPage}
                onBlur={(e) => {
                  let val = parseInt(e.target.value);
                  const maxPage = Math.max(1, Math.ceil(filteredGroups.length / pageSize));
                  if (isNaN(val)) val = currentPage;
                  if (val < 1) val = 1;
                  if (val > maxPage) val = maxPage;
                  setCurrentPage(val);
                  e.target.value = val.toString();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                className="mx-1 h-7 w-12 rounded-md border border-input bg-background px-1 py-0.5 text-center text-foreground focus:outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              / {Math.max(1, Math.ceil(filteredGroups.length / pageSize))} 页
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

      <Dialog open={isImportDialogOpen} onOpenChange={(open) => (open ? setIsImportDialogOpen(true) : closeImportDialog())}>
        <DialogContent className="max-h-[90vh] max-w-2xl flex flex-col">
          <DialogHeader>
            <DialogTitle>导入 Prompt 模板</DialogTitle>
            <DialogDescription>
              选择一个 JSON 文件。文件可包含多个模板；每项都会先校验，批量导入时逐项显示写入结果。
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[64vh] pr-4">
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <p className="font-medium">导入进度</p>
                <div className="mt-3 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-start gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${importFileName ? "bg-primary text-primary-foreground" : "bg-muted-foreground/15 text-muted-foreground"}`}>
                        {importFileName ? <Check className="h-3.5 w-3.5" /> : "1"}
                      </span>
                      <span className="font-medium">选择文件</span>
                    </div>
                    <p className="text-xs text-muted-foreground break-all">{importFileName ? `已选择：${importFileName}` : "选择 Agent 生成的 JSON 文件"}</p>
                  </div>
                  <div className="mt-3 h-px w-5 bg-border" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isImporting ? "bg-primary text-primary-foreground" : importCandidate && invalidImportCount === 0 ? "bg-primary text-primary-foreground" : importCandidate ? "bg-amber-500 text-white" : importError ? "bg-destructive text-destructive-foreground" : "bg-muted-foreground/15 text-muted-foreground"}`}>
                        {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : importCandidate && invalidImportCount === 0 ? <Check className="h-3.5 w-3.5" /> : importCandidate || importError ? <AlertTriangle className="h-3.5 w-3.5" /> : "2"}
                      </span>
                      <span className="font-medium">完整性校验</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isImporting
                        ? "正在读取并校验字段"
                        : importCandidate
                          ? `通过 ${validImportTemplates.length} 个，需修正 ${invalidImportCount} 个`
                          : importError ? "文件格式需要修正" : "等待选择文件"}
                    </p>
                  </div>
                  <div className="mt-3 h-px w-5 bg-border" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isBatchImporting ? "bg-primary text-primary-foreground" : batchImportResults.length > 0 && batchImportResults.every((result) => result.status === "success") ? "bg-primary text-primary-foreground" : batchImportResults.length > 0 ? "bg-amber-500 text-white" : validImportTemplates.length > 0 ? "bg-primary text-primary-foreground" : "bg-muted-foreground/15 text-muted-foreground"}`}>
                        {isBatchImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : batchImportResults.length > 0 && batchImportResults.every((result) => result.status === "success") ? <Check className="h-3.5 w-3.5" /> : batchImportResults.length > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : "3"}
                      </span>
                      <span className="font-medium">确认导入</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isBatchImporting ? "正在逐个写入模板库" : batchImportResults.length > 0 ? "写入结果已显示在下方" : isSingleTemplateImport ? "确认后进入编辑器" : validImportTemplates.length > 0 ? "确认后逐项写入模板库" : "没有可导入模板"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void handleDownloadImportExample()} disabled={isImportBusy}>
                  <Download className="mr-1.5 h-4 w-4" />
                  下载 JSON 示例
                </Button>
                <Button type="button" onClick={() => void handleSelectImportFile()} disabled={isImportBusy}>
                  {isImporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
                  {isImporting ? "校验中..." : "选择 JSON 文件"}
                </Button>
              </div>

              {importError && (
                <div role="alert" className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">文件格式未通过校验</p>
                    <p className="mt-1 break-words text-xs leading-relaxed">{importError}</p>
                  </div>
                </div>
              )}

              {importCandidate && (
                <div className={`rounded-lg border p-4 ${invalidImportCount > 0 ? "border-amber-500/40 bg-amber-500/10" : "border-primary/30 bg-primary/5"}`}>
                  <div className={`flex items-center gap-2 text-sm font-medium ${invalidImportCount > 0 ? "text-amber-700 dark:text-amber-400" : "text-primary"}`}>
                    {invalidImportCount > 0 ? <AlertTriangle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                    文件共 {importCandidate.items.length} 个模板，{validImportTemplates.length} 个可导入，{invalidImportCount} 个需要修正
                  </div>
                  {importCandidate.sourceFormat === "legacy-template" && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      这是旧版单模板文件，已兼容读取；下次请让 Agent 使用新版 <code>templates</code> 数组格式。
                    </p>
                  )}
                  {importCandidate.items.length > 1 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      批量导入会直接写入模板库，不关联图片；可在导入完成后逐个编辑关联图片。
                    </p>
                  )}
                  <div className="mt-3 space-y-2">
                    {importCandidate.items.map((item) => item.template ? (
                      <div key={item.index} className="rounded-md border border-primary/20 bg-background/70 p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium break-words">#{item.index + 1} {item.template.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{getPromptCategoryLabel(item.template.category)} · {item.template.template_schema.variables.length} 个变量 · {formatPromptPrice(item.template.price)}</p>
                          </div>
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.template.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                        </div>
                      </div>
                    ) : (
                      <div key={item.index} className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium">#{item.index + 1} 模板未通过校验，不会导入</p>
                            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed">
                              {item.issues.map((issue) => <li key={issue} className="break-words">{issue}</li>)}
                            </ul>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {batchImportResults.length > 0 && (
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium">写入结果</p>
                  {invalidImportCount > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">另有 {invalidImportCount} 个模板未通过校验，未进入写入步骤。</p>
                  )}
                  <div className="mt-3 space-y-2">
                    {batchImportResults.map((result) => (
                      <div key={result.index} className="flex items-start gap-2 rounded-md bg-muted/40 p-2.5 text-sm">
                        {result.status === "pending" ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" /> : result.status === "success" ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                        <div className="min-w-0">
                          <p className="font-medium break-words">#{result.index + 1} {result.name}</p>
                          <p className={`mt-0.5 text-xs ${result.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                            {result.status === "pending" ? "正在写入模板库..." : result.status === "success" ? "已写入模板库" : `写入失败：${result.message || "未知错误"}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeImportDialog} disabled={isImportBusy}>
              {batchImportResults.length > 0 ? "关闭" : "取消"}
            </Button>
            {isSingleTemplateImport ? (
              <Button type="button" onClick={handleConfirmSingleImport} disabled={isImportBusy}>
                导入到编辑器
              </Button>
            ) : (
              <Button type="button" onClick={() => void handleConfirmBatchImport()} disabled={validImportTemplates.length === 0 || isImportBusy || batchImportResults.length > 0}>
                {isBatchImporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                {isBatchImporting ? "正在批量导入..." : validImportTemplates.length === 0 ? "没有可导入模板" : `批量导入 ${validImportTemplates.length} 个模板`}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-h-[90vh] max-w-6xl">
          <DialogHeader className="pr-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <DialogTitle className="text-xl font-bold text-primary">
                  {selectedGroup?.group.name || "Prompt 详情"}
                </DialogTitle>
                {selectedGroup?.group.description && (
                  <DialogDescription className="text-sm mt-3 bg-muted/40 p-3 rounded-md border text-left text-muted-foreground">
                    {selectedGroup.group.description}
                  </DialogDescription>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8" 
                  onClick={navigateToPrevious} 
                  disabled={!hasPrevious}
                  title="上一个"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8" 
                  onClick={navigateToNext} 
                  disabled={!hasNext}
                  title="下一个"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
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
                        <Card 
                          key={image.id} 
                          className="overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            const fullImages = selectedGroup.images.map(img => allImages.find(i => i.id === img.id) || img);
                            openImageViewer(image.id, fullImages as any);
                          }}
                        >
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

          {importSuccess && (
            <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="font-medium text-primary">已导入到编辑器：{importSuccess.templateName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  来源 {importSuccess.fileName} · {importSuccess.tagCount} 个标签 · {importSuccess.variableCount} 个变量。请确认内容并按需要关联图片后创建。
                </p>
              </div>
            </div>
          )}

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
