import { useEffect, useState } from "react";
import { useWorksStore, useCharactersStore, useUIStore, type CharacterWithRelations } from "@/stores";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/useToast";
import { ArrowLeft, Edit, Plus, Users, Film, Calendar, User, Building, Trash2 } from "lucide-react";
import WorkEditModal from "./WorkEditModal";
import CharacterEditModal from "./CharacterEditModal";
import CharacterCard from "./CharacterCard";
import ConfirmDialog from "./ConfirmDialog";

interface WorkDetailViewProps {
  onIpSelect?: (ipId: string | null) => void;
}

const WORK_TYPE_LABELS: Record<string, string> = {
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

export default function WorkDetailView({ onIpSelect }: WorkDetailViewProps) {
  const { selectedWork, selectWork, deleteWork } = useWorksStore();
  const { characters, loading, fetchCharacters, updateOrder } = useCharactersStore();
  const { toast } = useToast();
  const settings = useUIStore((state) => state.settings);
  const showFullImage = settings.showFullImage ?? false;
  
  const [isEditWorkOpen, setIsEditWorkOpen] = useState(false);
  const [isEditCharOpen, setIsEditCharOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<CharacterWithRelations | null>(null);
  
  const [showDeleteWorkConfirm, setShowDeleteWorkConfirm] = useState(false);
  const [isDeletingWork, setIsDeletingWork] = useState(false);
  
  // Drag and drop sorting states
  const [draggedId, setDraggedId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedWork) {
      fetchCharacters(selectedWork.id);
    }
  }, [selectedWork]);

  if (!selectedWork) return null;

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
        <div className="w-[300px] border-r bg-muted/20 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-5 space-y-6 flex flex-col">
              {/* Cover Large view */}
              <div className="aspect-[3/4] w-full bg-muted rounded-xl overflow-hidden shadow-md border relative flex items-center justify-center">
                {selectedWork.cover_path ? (
                  <img
                    src={convertFileSrc(selectedWork.cover_path)}
                    alt={selectedWork.name}
                    className={`w-full h-full ${showFullImage ? "object-contain bg-background/50" : "object-cover"}`}
                  />
                ) : (
                  <Film className="w-16 h-16 text-muted-foreground opacity-30" />
                )}
              </div>

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
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">故事大纲 / 特征设定</p>
                    <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line bg-card/40 p-3 rounded-lg border border-dashed">
                      {selectedWork.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Right pane: Characters lists */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* List Toolbar */}
          <div className="px-6 py-4 border-b flex items-center justify-between bg-card/25 flex-shrink-0">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              登场角色列表
              <Badge variant="secondary" className="font-normal px-2 py-0.5 text-xs">
                {characters.length} 个角色
              </Badge>
            </h2>

            <Button size="sm" onClick={handleOpenCreateCharacter} className="gap-1.5 shadow-sm">
              <Plus className="w-4 h-4" />
              添加角色
            </Button>
          </div>

          {/* List Content */}
          <ScrollArea className="flex-1">
            <div className="p-6">
              {loading ? (
                <div className="flex flex-col gap-4 py-8 items-center justify-center text-muted-foreground text-sm">
                  <span className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  <span>加载角色列表中...</span>
                </div>
              ) : characters.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-xl text-muted-foreground">
                  <Users className="w-16 h-16 mb-4 opacity-30" />
                  <p className="text-sm font-medium">该作品暂无角色设定</p>
                  <p className="text-xs opacity-75 mt-1">点击右上角“添加角色”录入角色形象及演员关联</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4 w-full">
                  {characters.map((char) => (
                    <div
                      key={char.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, char.id)}
                      onDragOver={(e) => handleDragOver(e, char.id)}
                      onDragEnd={handleDragEnd}
                      className={`transition-opacity duration-200 ${
                        draggedId === char.id ? "opacity-40" : ""
                      }`}
                    >
                      <CharacterCard
                        character={char}
                        onEdit={handleOpenEditCharacter}
                        onIpSelect={onIpSelect}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
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
    </div>
  );
}
