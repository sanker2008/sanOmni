import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, FileText, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/useToast";
import { type ChapterWithCharacters, useChaptersStore } from "@/stores";
import ConfirmDialog from "./ConfirmDialog";
import ChapterEditModal from "./ChapterEditModal";

interface NarrativeChaptersPanelProps {
  workId: string;
}

const STATUS_LABELS: Record<string, string> = {
  outline: "大纲",
  draft: "草稿",
  review: "审阅",
  final: "定稿",
};

const STATUS_STYLES: Record<string, string> = {
  outline: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300",
  draft: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  review: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
  final: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
};

function wordCount(content?: string) {
  return Array.from((content || "").replace(/\s/g, "")).length;
}

export default function NarrativeChaptersPanel({ workId }: NarrativeChaptersPanelProps) {
  const { chapters, loading, fetchChapters, deleteChapter, updateOrder } = useChaptersStore();
  const { toast } = useToast();
  const [editingChapter, setEditingChapter] = useState<ChapterWithCharacters | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [chapterToDelete, setChapterToDelete] = useState<ChapterWithCharacters | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchChapters(workId);
  }, [fetchChapters, workId]);

  const openCreate = () => {
    setEditingChapter(null);
    setIsEditorOpen(true);
  };

  const openEdit = (chapter: ChapterWithCharacters) => {
    setEditingChapter(chapter);
    setIsEditorOpen(true);
  };

  const moveChapter = async (currentIndex: number, offset: -1 | 1) => {
    const targetIndex = currentIndex + offset;
    if (targetIndex < 0 || targetIndex >= chapters.length) return;

    const reordered = [...chapters];
    [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
    try {
      await updateOrder(reordered.map((chapter) => chapter.id));
      toast({ title: "章节顺序已保存" });
    } catch (error) {
      console.error("Failed to reorder chapters:", error);
      toast({ title: "排序保存失败", description: "请重试", variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    if (!chapterToDelete) return;
    setIsDeleting(true);
    try {
      await deleteChapter(chapterToDelete.id);
      toast({ title: "章节已删除", description: `《${chapterToDelete.title}》已移出当前剧本` });
      setChapterToDelete(null);
    } catch (error) {
      console.error("Failed to delete chapter:", error);
      toast({ title: "删除失败", description: "无法删除章节，请重试", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b flex items-center justify-between bg-card/25 flex-shrink-0">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          章节
          <Badge variant="secondary" className="font-normal px-2 py-0.5 text-xs">{chapters.length} 章</Badge>
        </h2>
        <Button size="sm" onClick={openCreate} className="gap-1.5 shadow-sm">
          <Plus className="w-4 h-4" />
          添加章节
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6">
          {loading ? (
            <div className="flex flex-col gap-4 py-8 items-center justify-center text-muted-foreground text-sm">
              <span className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              <span>加载章节中…</span>
            </div>
          ) : chapters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-xl text-muted-foreground">
              <FileText className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-sm font-medium">这个叙事作品还没有章节</p>
              <p className="text-xs opacity-75 mt-1">点击右上角“添加章节”开始写梗概与正文</p>
              <Button variant="outline" size="sm" className="mt-5 gap-1.5" onClick={openCreate}>
                <Plus className="w-4 h-4" /> 添加第一章
              </Button>
            </div>
          ) : (
            <div className="space-y-3 max-w-4xl">
              {chapters.map((chapter, index) => {
                const charactersCount = chapter.characters.length;
                const actualWords = wordCount(chapter.content);
                return (
                  <article key={chapter.id} className="rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/35">
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                      <button type="button" onClick={() => openEdit(chapter)} className="min-w-0 flex-1 text-left">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold truncate">{chapter.title}</h3>
                          <Badge variant="outline" className={STATUS_STYLES[chapter.status]}>{STATUS_LABELS[chapter.status] || chapter.status}</Badge>
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground line-clamp-2">
                          {chapter.summary || "尚未填写本章梗概"}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>正文 {actualWords} 字{chapter.target_word_count ? ` / 目标 ${chapter.target_word_count} 字` : ""}</span>
                          <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {charactersCount} 位登场人物</span>
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveChapter(index, -1)} disabled={index === 0} title="上移章节"><ArrowUp className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveChapter(index, 1)} disabled={index === chapters.length - 1} title="下移章节"><ArrowDown className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(chapter)} title="编辑章节"><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setChapterToDelete(chapter)} title="删除章节"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      <ChapterEditModal workId={workId} chapter={editingChapter} open={isEditorOpen} onOpenChange={setIsEditorOpen} />
      <ConfirmDialog
        open={Boolean(chapterToDelete)}
        title="删除章节？"
        description={chapterToDelete ? `章节《${chapterToDelete.title}》将从当前剧本中移除。` : ""}
        confirmText={isDeleting ? "删除中…" : "删除章节"}
        variant="destructive"
        onConfirm={confirmDelete}
        onCancel={() => !isDeleting && setChapterToDelete(null)}
      />
    </div>
  );
}
