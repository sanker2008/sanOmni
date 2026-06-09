import { useEffect, useState, useRef } from "react";
import { type WorkWithRelations, useWorksStore, useTagStore, useUIStore } from "@/stores";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/useToast";
import { Upload, X, Check } from "lucide-react";
import { tagApi } from "@/services/tauri";

interface WorkEditModalProps {
  work: WorkWithRelations | null; // null for creating
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const WORK_TYPES = [
  { value: "tv_series", label: "电视剧" },
  { value: "movie", label: "电影" },
  { value: "short_drama", label: "微短剧" },
  { value: "novel", label: "小说" },
  { value: "drama", label: "话剧" },
  { value: "animation", label: "动画" },
  { value: "game", label: "游戏" },
  { value: "comic", label: "漫画" },
  { value: "other", label: "其他" },
];

const WORK_STATUSES = [
  { value: "planning", label: "筹备中" },
  { value: "in_production", label: "制作中" },
  { value: "released", label: "已发布" },
  { value: "completed", label: "已完结" },
  { value: "cancelled", label: "已取消" },
];

export default function WorkEditModal({ work, open, onOpenChange }: WorkEditModalProps) {
  const { createWork, updateWork, uploadCover, deleteCover, addTag, removeTag } = useWorksStore();
  const settings = useUIStore((state) => state.settings);
  const showFullImage = settings.showFullImage ?? false;
  const { tags: allTags, setTags } = useTagStore();
  const { toast } = useToast();
  
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [workType, setWorkType] = useState("tv_series");
  const [status, setStatus] = useState("planning");
  const [releaseDate, setReleaseDate] = useState("");
  const [producer, setProducer] = useState("");
  const [directorAuthor, setDirectorAuthor] = useState("");
  const [description, setDescription] = useState("");
  
  // Cover file
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selected tag IDs
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Load all system tags if not loaded
  useEffect(() => {
    if (open) {
      loadSystemTags();
    }
  }, [open]);

  const loadSystemTags = async () => {
    try {
      const data = await tagApi.getAll();
      setTags(data);
    } catch (e) {
      console.error("Failed to load tags:", e);
    }
  };

  // Populate data when editing
  useEffect(() => {
    if (open) {
      if (work) {
        setName(work.name);
        setPath(work.path || "");
        setWorkType(work.work_type);
        setStatus(work.status || "planning");
        setReleaseDate(work.release_date || "");
        setProducer(work.producer || "");
        setDirectorAuthor(work.director_author || "");
        setDescription(work.description || "");
        setCoverPreview(work.cover_path ? `${convertFileSrc(work.cover_path)}?t=${new Date(work.updated_at).getTime()}` : null);
        setCoverFile(null);
        setSelectedTagIds(work.tags?.map((t) => t.id) || []);
      } else {
        // Reset for creating
        setName("");
        setPath("");
        setWorkType("tv_series");
        setStatus("planning");
        setReleaseDate("");
        setProducer("");
        setDirectorAuthor("");
        setDescription("");
        setCoverPreview(null);
        setCoverFile(null);
        setSelectedTagIds([]);
      }
    }
  }, [open, work]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleToggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "验证失败",
        description: "作品名称为必填项",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      let savedWork;
      
      const payload = {
        name: name.trim(),
        path: path.trim() || null,
        work_type: workType,
        status: status || null,
        release_date: releaseDate.trim() || null,
        producer: producer.trim() || null,
        director_author: directorAuthor.trim() || null,
        description: description.trim() || null,
      };

      if (work) {
        // Edit mode
        savedWork = await updateWork(work.id, payload);
        
        // Handle tags differential changes
        const existingTagIds = work.tags?.map((t) => t.id) || [];
        
        // Tags to add
        for (const tagId of selectedTagIds) {
          if (!existingTagIds.includes(tagId)) {
            await addTag(work.id, tagId);
          }
        }
        
        // Tags to remove
        for (const tagId of existingTagIds) {
          if (!selectedTagIds.includes(tagId)) {
            await removeTag(work.id, tagId);
          }
        }

        // Handle cover change/removal
        if (work.cover_path && !coverPreview) {
          await deleteCover(work.id);
        } else if (coverFile) {
          await uploadCover(work.id, coverFile);
        }

        toast({
          title: "更新成功",
          description: `作品《${name}》信息已成功更新`,
        });
      } else {
        // Create mode
        savedWork = await createWork(payload);
        
        // Handle tags
        for (const tagId of selectedTagIds) {
          await addTag(savedWork.id, tagId);
        }

        // Upload cover if present
        if (coverFile) {
          await uploadCover(savedWork.id, coverFile);
        }

        toast({
          title: "创建成功",
          description: `已成功创建新作品《${name}》`,
        });
      }

      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast({
        title: "保存失败",
        description: "保存作品时发生错误，请重试",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border shadow-xl">
        <DialogHeader>
          <DialogTitle>{work ? "编辑作品信息" : "新建作品"}</DialogTitle>
          <DialogDescription>
            编辑或录入作品的核心设定，并可以为此作品上传精美封面。
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4">
          {/* Cover image upload pane */}
          <div className="flex flex-col items-center justify-center gap-3 border rounded-lg p-4 bg-muted/40 aspect-[3/4] max-w-[200px] mx-auto md:mx-0 w-full relative">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
            {coverPreview ? (
              <div className="w-full h-full relative group rounded overflow-hidden border bg-background flex items-center justify-center">
                <img src={coverPreview} className={`w-full h-full ${showFullImage ? "object-contain bg-background/50" : "object-cover"}`} alt="Cover Preview" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button variant="secondary" size="sm" className="h-8 text-xs" onClick={triggerFileSelect}>
                    更换
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => {
                      setCoverPreview(null);
                      setCoverFile(null);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onClick={triggerFileSelect}
                className="w-full h-full border-2 border-dashed border-muted-foreground/35 rounded-lg flex flex-col items-center justify-center p-2 gap-1.5 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all text-muted-foreground text-center"
              >
                <Upload className="w-7 h-7 opacity-60" />
                <span className="text-xs font-medium">选择本地封面</span>
                <span className="text-[10px] opacity-60">支持 PNG, JPG, WEBP</span>
                <span className="text-[10px] text-primary/80 font-medium mt-0.5">建议比例 16:9</span>
                <span className="text-[9px] opacity-50">（如 1920×1080）</span>
              </div>
            )}
          </div>

          {/* Form details pane */}
          <div className="md:col-span-2 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">作品名称 *</label>
                <Input
                  placeholder="例如: 流浪地球 2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">目录路径标识</label>
                <Input
                  placeholder="例如: wandering-earth-2 (选填)"
                  value={path}
                  onChange={(e) => setPath(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))}
                  disabled={!!work}
                />
                {work ? (
                  <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium">
                    ⚠️ 为保证关联和同步安全，作品创建后路径标识不可修改
                  </p>
                ) : (
                  <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium mt-0.5">
                    ⚠️ 注意：为保证数据安全，创建后将不可修改
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">作品类型</label>
                <select
                  value={workType}
                  onChange={(e) => setWorkType(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-zinc-950"
                >
                  {WORK_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">制作状态</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-zinc-950"
                >
                  {WORK_STATUSES.map((st) => (
                    <option key={st.value} value={st.value}>
                      {st.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">发布日期</label>
                <Input
                  placeholder="例如: 2023-01-22"
                  value={releaseDate}
                  onChange={(e) => setReleaseDate(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">导演 / 原作者</label>
                <Input
                  placeholder="例如: 郭帆 / 刘慈欣"
                  value={directorAuthor}
                  onChange={(e) => setDirectorAuthor(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">出品方 / 制作公司</label>
              <Input
                placeholder="例如: 中影股份, 郭帆影业"
                value={producer}
                onChange={(e) => setProducer(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Description textarea */}
        <div className="flex flex-col gap-1.5 py-1">
          <label className="text-xs font-semibold text-muted-foreground">简要故事梗概 / 背景特征描述</label>
          <textarea
            placeholder="输入作品的简要大纲、核心故事背景或其它详细特征设定描述..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-zinc-950"
          />
        </div>

        {/* Tags management */}
        <div className="flex flex-col gap-2 py-2">
          <label className="text-xs font-semibold text-muted-foreground">作品标签关联</label>
          <div className="flex flex-wrap gap-1.5 border rounded-lg p-3 bg-muted/20 min-h-[60px] max-h-[140px] overflow-y-auto">
            {allTags.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">暂无系统预设标签</span>
            ) : (
              allTags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.id);
                return (
                  <Badge
                    key={tag.id}
                    variant={isSelected ? "default" : "outline"}
                    className="cursor-pointer transition-all hover:scale-105 active:scale-95 flex items-center gap-1 select-none"
                    style={{
                      backgroundColor: isSelected && tag.color ? tag.color : undefined,
                      borderColor: !isSelected && tag.color ? `${tag.color}60` : undefined,
                      color: !isSelected && tag.color ? tag.color : undefined,
                    }}
                    onClick={() => handleToggleTag(tag.id)}
                  >
                    {tag.name}
                    {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                  </Badge>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "正在保存..." : "确认保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
