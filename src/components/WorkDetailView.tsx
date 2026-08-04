import { useEffect, useState } from "react";
import { useWorksStore, useCharactersStore, useUIStore, type CharacterWithRelations, type WorkImage } from "@/stores";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/useToast";
import { ArrowLeft, Edit, Plus, Users, Film, Calendar, User, Building, Trash2, FolderOpen, Minimize, Loader2, RefreshCw, ImagePlus, Star } from "lucide-react";
import WorkEditModal from "./WorkEditModal";
import CharacterEditModal from "./CharacterEditModal";
import ConfirmDialog from "./ConfirmDialog";
import NarrativeChaptersPanel from "./NarrativeChaptersPanel";
import { pickFiles } from "@/lib/tauriFilePicker";


interface WorkDetailViewProps {
  onIpSelect?: (ipId: string | null) => void;
}

const WORK_TYPE_LABELS: Record<string, string> = {
  image: "图片",
  song: "歌曲",
  album: "专辑",
  screenplay: "剧本",
  tv_series: "电视剧",
  movie: "电影",
  short_drama: "微短剧",
  novel: "小说",
  drama: "话剧",
  animation: "动画",
  game: "游戏",
  comic: "漫画",
  other: "其他",
};

const WORK_STATUS_LABELS: Record<string, string> = {
  planning: "筹备中",
  in_production: "制作中",
  released: "已发布",
  completed: "已完结",
  cancelled: "已取消",
};

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900",
  in_production: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-900",
  released: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-900",
  completed: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-900",
  cancelled: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-900",
};

function getCharacterThumbnail(imagePaths?: string | null) {
  try {
    const paths = JSON.parse(imagePaths || "[]");
    return Array.isArray(paths) && typeof paths[0] === "string" ? paths[0] : null;
  } catch {
    return null;
  }
}

export default function WorkDetailView({ onIpSelect }: WorkDetailViewProps) {
  const { selectedWork, selectWork, deleteWork, fetchWorks } = useWorksStore();
  const { characters, loading, fetchCharacters, updateOrder } = useCharactersStore();
  const { toast } = useToast();
  const settings = useUIStore((state) => state.settings);
  const showFullImage = settings.showFullImage ?? false;
  
  const [isEditWorkOpen, setIsEditWorkOpen] = useState(false);
  const [isEditCharOpen, setIsEditCharOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<CharacterWithRelations | null>(null);
  
  const [showDeleteWorkConfirm, setShowDeleteWorkConfirm] = useState(false);
  const [isDeletingWork, setIsDeletingWork] = useState(false);
  const [convertingToWebp, setConvertingToWebp] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [chaptersRefreshToken, setChaptersRefreshToken] = useState(0);
  const [workImages, setWorkImages] = useState<WorkImage[]>([]);
  const [isLoadingWorkImages, setIsLoadingWorkImages] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<WorkImage | null>(null);
  const [isDeletingImage, setIsDeletingImage] = useState(false);
  
  // Drag and drop sorting states
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const refreshWorkImages = async (workId = selectedWork?.id) => {
    if (!workId) {
      setWorkImages([]);
      setIsLoadingWorkImages(false);
      return;
    }
    setIsLoadingWorkImages(true);
    try {
      const { getWorkImages } = await import("@/services/tauri");
      setWorkImages(await getWorkImages(workId));
    } finally {
      setIsLoadingWorkImages(false);
    }
  };

  useEffect(() => {
    if (selectedWork) {
      fetchCharacters(selectedWork.id);
    }
  }, [fetchCharacters, selectedWork?.id]);

  useEffect(() => {
    void refreshWorkImages().catch((error) => {
      console.error("Failed to load work images:", error);
      setWorkImages([]);
    });
  }, [selectedWork?.id, selectedWork?.updated_at]);

  if (!selectedWork) return null;
  const isNarrativeWork = selectedWork.structure_mode === "narrative";

  const handleDeleteWork = async () => {
    setIsDeletingWork(true);
    try {
      await deleteWork(selectedWork.id);
      toast({
        title: "删除成功",
        description: `作品《${selectedWork.name}》已成功删除`,
      });
      selectWork(null);
    } catch (e) {
      console.error(e);
      toast({
        title: "删除失败",
        description: "无法删除该作品，请重试",
        variant: "destructive",
      });
    } finally {
      setIsDeletingWork(false);
      setShowDeleteWorkConfirm(false);
    }
  };

  const handleRefresh = async () => {
    if (!selectedWork || isRefreshing) return;

    const workId = selectedWork.id;
    setIsRefreshing(true);
    try {
      const { getWorkById } = await import("@/services/tauri");
      const refreshedWork = await getWorkById(workId);
      await Promise.all([fetchWorks(), fetchCharacters(workId), refreshWorkImages(workId)]);
      selectWork(refreshedWork);
      setChaptersRefreshToken((token) => token + 1);
      toast({ title: "已刷新", description: `作品《${refreshedWork.name}》的最新内容已加载` });
    } catch (error) {
      console.error("Failed to refresh work:", error);
      toast({ title: "刷新失败", description: "无法获取作品最新内容，请重试", variant: "destructive" });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleUploadWorkImages = async () => {
    if (!selectedWork || isUploadingImages) return;

    const picked = await pickFiles({
      multiple: true,
      extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
      filterName: "作品图片",
    });
    if (picked.length === 0) return;

    const workId = selectedWork.id;
    setIsUploadingImages(true);
    try {
      const { convertFileToWebp } = await import("@/lib/webpConverter");
      const { getWorkById, uploadWorkImage } = await import("@/services/tauri");
      await Promise.all(picked.map(async ({ file }) => {
        const webpFile = await convertFileToWebp(file);
        const imageData = Array.from(new Uint8Array(await webpFile.arrayBuffer()));
        await uploadWorkImage(workId, imageData, "webp", file.name);
      }));
      const refreshedWork = await getWorkById(workId);
      await Promise.all([fetchWorks(), refreshWorkImages(workId)]);
      selectWork(refreshedWork);
      toast({ title: "图片已添加", description: `已加入 ${picked.length} 张作品图片，可在章节中关联使用` });
    } catch (error) {
      console.error("Failed to upload work images:", error);
      toast({ title: "上传失败", description: "无法添加作品图片，请重试", variant: "destructive" });
    } finally {
      setIsUploadingImages(false);
    }
  };

  const handleSetCover = async (image: WorkImage) => {
    if (!selectedWork || image.is_cover) return;

    try {
      const { getWorkById, setWorkImageAsCover } = await import("@/services/tauri");
      await setWorkImageAsCover(selectedWork.id, image.id);
      const refreshedWork = await getWorkById(selectedWork.id);
      await Promise.all([fetchWorks(), refreshWorkImages(selectedWork.id)]);
      selectWork(refreshedWork);
      toast({ title: "封面已更新", description: `已将「${image.original_name || "作品图片"}」设为作品封面` });
    } catch (error) {
      console.error("Failed to set work cover:", error);
      toast({ title: "设置失败", description: "无法更新作品封面，请重试", variant: "destructive" });
    }
  };

  const handleDeleteWorkImage = async () => {
    if (!selectedWork || !imageToDelete || isDeletingImage) return;

    const workId = selectedWork.id;
    setIsDeletingImage(true);
    try {
      const { deleteWorkImage, getWorkById } = await import("@/services/tauri");
      await deleteWorkImage(imageToDelete.id);
      const refreshedWork = await getWorkById(workId);
      await Promise.all([fetchWorks(), refreshWorkImages(workId)]);
      selectWork(refreshedWork);
      setChaptersRefreshToken((token) => token + 1);
      toast({ title: "图片已删除", description: "已同步移除所有章节中的该图片关联" });
      setImageToDelete(null);
    } catch (error) {
      console.error("Failed to delete work image:", error);
      toast({ title: "删除失败", description: "无法删除作品图片，请重试", variant: "destructive" });
    } finally {
      setIsDeletingImage(false);
    }
  };

  const handleConvertToWebp = async () => {
    if (convertingToWebp || !selectedWork.cover_path) return;
    
    setConvertingToWebp(true);
    toast({ title: "正在转为 WebP", description: "转换中..." });
    
    try {
      const src = convertFileSrc(selectedWork.cover_path);
      const response = await fetch(src);
      const blob = await response.blob();
      const filename = selectedWork.cover_path.split(/[/\\]/).pop() || 'cover.png';
      const file = new File([blob], filename, { type: blob.type });
      
      const { uploadCover } = useWorksStore.getState();
      await uploadCover(selectedWork.id, file);
      
      toast({ title: "✓ 转换成功", description: "已成功转为 WebP 格式" });
    } catch (error: any) {
      console.error("WebP conversion failed:", error);
      toast({ title: "转换失败", description: error.message || "未知错误", variant: "destructive" });
    } finally {
      setConvertingToWebp(false);
    }
  };

  const handleOpenCreateCharacter = () => {
    setEditingCharacter(null);
    setIsEditCharOpen(true);
  };

  const handleOpenEditCharacter = (char: CharacterWithRelations) => {
    setEditingCharacter(char);
    setIsEditCharOpen(true);
  };

  // Drag and Drop implementation
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === id) return;
    
    // Smooth ordering swapping
    const dragIndex = characters.findIndex(c => c.id === draggedId);
    const hoverIndex = characters.findIndex(c => c.id === id);
    if (dragIndex === -1 || hoverIndex === -1) return;

    const reordered = [...characters];
    const [draggedItem] = reordered.splice(dragIndex, 1);
    reordered.splice(hoverIndex, 0, draggedItem);
    
    // Instantly apply locally
    useCharactersStore.getState().setCharacters(reordered);
  };

  const handleDragEnd = async () => {
    if (!draggedId) return;
    setDraggedId(null);
    
    try {
      const orderIds = characters.map(c => c.id);
      await updateOrder(orderIds);
      toast({
        title: "排序已保存",
        description: "角色展示顺序已成功更新",
      });
    } catch (e) {
      console.error("Failed to save drag order:", e);
      toast({
        title: "排序保存失败",
        description: "无法保存角色新顺序",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Detail header toolbar */}
      <div className="flex items-center justify-between p-4 border-b bg-card/40 backdrop-blur supports-[backdrop-filter]:bg-card/20 flex-shrink-0 z-10 shadow-sm">
        <Button variant="ghost" size="sm" onClick={() => selectWork(null)} className="gap-1">
          <ArrowLeft className="w-4 h-4" />
          返回列表
        </Button>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="gap-1.5">
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsEditWorkOpen(true)} className="gap-1.5">
            <Edit className="w-4 h-4" />
            编辑作品
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteWorkConfirm(true)} className="gap-1.5">
            <Trash2 className="w-4 h-4" />
            删除作品
          </Button>
        </div>
      </div>

      {/* Main body: Left/Right panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left pane: Work Details */}
        <div className="w-[clamp(400px,36vw,560px)] shrink-0 border-r bg-muted/20 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-5 space-y-6 flex flex-col">
              {/* Cover Large view */}
              <div className="aspect-[3/4] w-full bg-muted rounded-xl overflow-hidden shadow-md border relative flex items-center justify-center group">
                {selectedWork.cover_path ? (
                  <>
                    <img
                      src={`${convertFileSrc(selectedWork.cover_path)}?t=${new Date(selectedWork.updated_at).getTime()}`}
                      alt={selectedWork.name}
                      className={`w-full h-full ${showFullImage ? "object-contain bg-background/50" : "object-cover"}`}
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="gap-1.5"
                        onClick={async () => {
                          const { revealFileInFolder } = await import("@/lib/pathUtils");
                          revealFileInFolder(selectedWork.cover_path!);
                        }}
                      >
                        <FolderOpen className="w-4 h-4" />
                        打开目录
                      </Button>
                      {!selectedWork.cover_path.toLowerCase().endsWith('.webp') && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="gap-1.5 ml-2"
                          onClick={handleConvertToWebp}
                          disabled={convertingToWebp}
                        >
                          {convertingToWebp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Minimize className="w-4 h-4" />}
                          转为 WebP
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <Film className="w-16 h-16 text-muted-foreground opacity-30" />
                )}
              </div>

              <section className="space-y-3 border-t pt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <ImagePlus className="h-4 w-4 text-primary" />
                      作品图片
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">{workImages.length}</Badge>
                    </h2>
                    <p className="mt-1 text-[11px] text-muted-foreground">可复用于不同章节</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={handleUploadWorkImages} disabled={isUploadingImages}>
                    <ImagePlus className={`h-3.5 w-3.5 ${isUploadingImages ? "animate-pulse" : ""}`} />
                    {isUploadingImages ? "添加中…" : "添加图片"}
                  </Button>
                </div>

                {isLoadingWorkImages ? (
                  <div className="grid grid-cols-3 gap-2" aria-busy="true" aria-label="正在加载作品图片">
                    {Array.from({ length: 3 }).map((_, index) => <div key={index} className="aspect-square animate-pulse rounded-lg bg-muted" />)}
                  </div>
                ) : workImages.length === 0 ? (
                  <button
                    type="button"
                    onClick={handleUploadWorkImages}
                    className="flex w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 py-7 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    <ImagePlus className="mb-2 h-5 w-5" />
                    添加概念图、分镜或剧照
                  </button>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {workImages.map((image) => (
                      <div key={image.id} className="group/image relative aspect-square overflow-hidden rounded-lg border bg-muted">
                        <img
                          src={`${convertFileSrc(image.file_path)}?t=${new Date(image.updated_at).getTime()}`}
                          alt={image.original_name || "作品图片"}
                          className="h-full w-full object-cover"
                        />
                        {image.is_cover && (
                          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium shadow-sm">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-500" /> 封面
                          </span>
                        )}
                        <div className="absolute inset-x-1.5 bottom-1.5 flex justify-end gap-1 opacity-0 transition-opacity group-hover/image:opacity-100 focus-within:opacity-100">
                          {!image.is_cover && (
                            <Button
                              variant="secondary"
                              size="icon"
                              className="h-7 w-7 shadow-sm"
                              onClick={() => handleSetCover(image)}
                              title="设为封面"
                              aria-label="设为封面"
                            >
                              <Star className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-7 w-7 shadow-sm"
                            onClick={() => setImageToDelete(image)}
                            title="删除图片"
                            aria-label="删除图片"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Title details */}
              <div className="space-y-3">
                <div>
                  <h1 className="text-xl font-bold leading-tight">{selectedWork.name}</h1>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Badge variant="secondary">
                      {WORK_TYPE_LABELS[selectedWork.work_type] || selectedWork.work_type}
                    </Badge>
                    {selectedWork.status && (
                      <Badge variant="outline" className={STATUS_COLORS[selectedWork.status]}>
                        {WORK_STATUS_LABELS[selectedWork.status]}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-2.5 pt-4 border-t text-xs text-foreground/80">
                  <div className="flex items-start gap-2">
                    <Calendar className="w-4 h-4 opacity-70 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-muted-foreground">首发/发布时间</p>
                      <p className="mt-0.5">{selectedWork.release_date || "未知"}</p>
                    </div>
                  </div>

                  {selectedWork.director_author && (
                    <div className="flex items-start gap-2">
                      <User className="w-4 h-4 opacity-70 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-muted-foreground">导演 / 作者</p>
                        <p className="mt-0.5">{selectedWork.director_author}</p>
                      </div>
                    </div>
                  )}

                  {selectedWork.producer && (
                    <div className="flex items-start gap-2">
                      <Building className="w-4 h-4 opacity-70 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-muted-foreground">出品/制作方</p>
                        <p className="mt-0.5">{selectedWork.producer}</p>
                      </div>
                    </div>
                  )}
                </div>

                {selectedWork.tags && selectedWork.tags.length > 0 && (
                  <div className="pt-4 border-t space-y-1.5">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">关联标签</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedWork.tags.map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="outline"
                          className="text-[9px] font-normal py-0.5 px-2"
                          style={{ color: tag.color, borderColor: tag.color ? `${tag.color}40` : undefined }}
                        >
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {selectedWork.description && (
                  <div className="pt-4 border-t space-y-1.5">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      {isNarrativeWork ? "剧本总纲 / 世界观" : "作品简介 / 特征设定"}
                    </p>
                    <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line bg-card/40 p-3 rounded-lg border border-dashed">
                      {selectedWork.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Work content remains the primary area; characters are supporting context. */}
        <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
          {isNarrativeWork ? (
            <NarrativeChaptersPanel workId={selectedWork.id} workImages={workImages} refreshToken={chaptersRefreshToken} />
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-6 py-4 border-b flex items-center gap-2 bg-card/25 flex-shrink-0">
                <Film className="w-5 h-5 text-primary" />
                <h2 className="text-base font-semibold">作品内容</h2>
              </div>
              <ScrollArea className="flex-1">
                <div className="mx-auto max-w-4xl space-y-6 p-6">
                  {selectedWork.cover_path && (
                    <div className="flex min-h-72 items-center justify-center overflow-hidden rounded-xl border bg-muted/30 p-4">
                      <img
                        src={`${convertFileSrc(selectedWork.cover_path)}?t=${new Date(selectedWork.updated_at).getTime()}`}
                        alt={selectedWork.name}
                        className={`max-h-[60vh] max-w-full ${showFullImage ? "object-contain" : "object-cover"}`}
                      />
                    </div>
                  )}
                  <section className="rounded-xl border bg-card p-5">
                    <h3 className="font-semibold">{isNarrativeWork ? "剧本总纲 / 世界观" : "作品简介 / 创作说明"}</h3>
                    <p className="mt-3 whitespace-pre-line text-sm leading-7 text-muted-foreground">
                      {selectedWork.description || "暂未填写作品内容说明。"}
                    </p>
                  </section>
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        {/* Supporting character sidebar */}
        <aside className="w-60 shrink-0 border-l bg-card/30 flex flex-col overflow-hidden">
          <div className="px-4 py-4 border-b flex items-center justify-between flex-shrink-0">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                人物设定
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">{characters.length}</Badge>
              </h2>
              <p className="mt-1 text-[11px] text-muted-foreground">辅助当前作品创作</p>
            </div>
            <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={handleOpenCreateCharacter} title="添加角色">
              <Plus className="w-4 h-4" />
              <span className="sr-only">添加角色</span>
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-2 p-3">
              {loading ? (
                <div className="flex flex-col items-center gap-3 py-8 text-xs text-muted-foreground">
                  <span className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary" />
                  加载角色中…
                </div>
              ) : characters.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">
                  <Users className="mx-auto mb-3 h-7 w-7 opacity-30" />
                  暂无人物设定
                </div>
              ) : (
                characters.map((char) => {
                  const thumbnail = getCharacterThumbnail(char.image_paths);
                  return (
                    <div
                      key={char.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, char.id)}
                      onDragOver={(e) => handleDragOver(e, char.id)}
                      onDragEnd={handleDragEnd}
                      className={`rounded-lg border bg-background p-2 transition-opacity ${draggedId === char.id ? "opacity-40" : ""}`}
                    >
                      <button type="button" onClick={() => handleOpenEditCharacter(char)} className="flex w-full items-center gap-2.5 text-left">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                          {thumbnail ? <img src={convertFileSrc(thumbnail)} alt="" className="h-full w-full object-cover" /> : <Users className="h-4 w-4 text-muted-foreground/50" />}
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{char.name}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{char.appearance_info || "未填写出场信息"}</span>
                        </span>
                      </button>
                      {char.ip_id && onIpSelect && (
                        <button type="button" onClick={() => onIpSelect(char.ip_id ?? null)} className="mt-2 max-w-full truncate text-[11px] text-primary hover:underline">
                          演员：{char.ip_name || "已关联 IP"}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </aside>
      </div>

      {/* Edit Work Dialog */}
      <WorkEditModal
        work={selectedWork}
        open={isEditWorkOpen}
        onOpenChange={setIsEditWorkOpen}
      />

      {/* Create / Edit Character Dialog */}
      <CharacterEditModal
        workId={selectedWork.id}
        character={editingCharacter}
        open={isEditCharOpen}
        onOpenChange={setIsEditCharOpen}
      />

      {/* Confirm Delete Work Dialog */}
      <ConfirmDialog
        open={showDeleteWorkConfirm}
        onCancel={() => setShowDeleteWorkConfirm(false)}
        variant="destructive"
        title="确认删除作品？"
        description={`⚠️ 警告：确定要彻底删除作品《${selectedWork.name}》吗？这将导致此作品及关联的所有登场角色被软删除，此操作不可恢复！`}
        confirmText={isDeletingWork ? "正在删除..." : "确认删除"}
        cancelText="取消"
        onConfirm={handleDeleteWork}
      />

      <ConfirmDialog
        open={Boolean(imageToDelete)}
        onCancel={() => !isDeletingImage && setImageToDelete(null)}
        variant="destructive"
        title="删除作品图片？"
        description={imageToDelete?.is_cover
          ? "这张图片同时是当前封面。删除后将移除封面及所有章节中的该图片关联，文件无法恢复。"
          : "删除后将同步移除所有章节中的该图片关联，文件无法恢复。"}
        confirmText={isDeletingImage ? "正在删除…" : "删除图片"}
        cancelText="取消"
        onConfirm={handleDeleteWorkImage}
      />
    </div>
  );
}
