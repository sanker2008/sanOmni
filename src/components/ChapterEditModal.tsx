import { useEffect, useMemo, useState } from "react";
import { Check, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/useToast";
import {
  type ChapterStatus,
  type ChapterWithCharacters,
  type CharacterWithRelations,
  useChaptersStore,
} from "@/stores";
import { getCharacters } from "@/services/tauri";

interface ChapterEditModalProps {
  workId: string;
  chapter: ChapterWithCharacters | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CHAPTER_STATUSES: Array<{ value: ChapterStatus; label: string }> = [
  { value: "outline", label: "大纲" },
  { value: "draft", label: "草稿" },
  { value: "review", label: "审阅" },
  { value: "final", label: "定稿" },
];

function countCharacters(text: string) {
  return Array.from(text.replace(/\s/g, "")).length;
}

export default function ChapterEditModal({ workId, chapter, open, onOpenChange }: ChapterEditModalProps) {
  const { toast } = useToast();
  const { createChapter, updateChapter, setChapterCharacters } = useChaptersStore();
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<ChapterStatus>("outline");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [targetWordCount, setTargetWordCount] = useState("");
  const [characters, setCharacters] = useState<CharacterWithRelations[]>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [characterNotes, setCharacterNotes] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    getCharacters(workId)
      .then(setCharacters)
      .catch((error) => {
        console.error("Failed to load chapter characters:", error);
        setCharacters([]);
      });
  }, [open, workId]);

  useEffect(() => {
    if (!open) return;
    setTitle(chapter?.title || "");
    setStatus(chapter?.status || "outline");
    setSummary(chapter?.summary || "");
    setContent(chapter?.content || "");
    setTargetWordCount(chapter?.target_word_count?.toString() || "");
    setSelectedCharacterIds(chapter?.characters.map((item) => item.character_id) || []);
    setCharacterNotes(
      Object.fromEntries(
        (chapter?.characters || []).map((item) => [item.character_id, item.note || ""]),
      ),
    );
  }, [open, chapter]);

  const wordCount = useMemo(() => countCharacters(content), [content]);

  const toggleCharacter = (characterId: string) => {
    setSelectedCharacterIds((current) => (
      current.includes(characterId)
        ? current.filter((id) => id !== characterId)
        : [...current, characterId]
    ));
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "验证失败", description: "章节标题不能为空", variant: "destructive" });
      return;
    }

    const target = targetWordCount.trim() ? Number(targetWordCount) : null;
    if (target !== null && (!Number.isInteger(target) || target <= 0)) {
      toast({ title: "验证失败", description: "目标字数必须是正整数", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        title: title.trim(),
        summary: summary.trim() || null,
        content: content || null,
        status,
        target_word_count: target,
      };
      const saved = chapter
        ? await updateChapter({ id: chapter.id, ...payload })
        : await createChapter({ work_id: workId, ...payload });

      await setChapterCharacters(
        saved.id,
        selectedCharacterIds.map((character_id) => ({
          character_id,
          note: characterNotes[character_id]?.trim() || null,
        })),
      );

      toast({
        title: chapter ? "章节已更新" : "章节已创建",
        description: `《${title.trim()}》已保存${wordCount > 0 ? `，正文 ${wordCount} 字` : ""}`,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save chapter:", error);
      toast({
        title: "保存失败",
        description: error instanceof Error ? error.message : "无法保存章节，请重试",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{chapter ? "编辑章节" : "添加章节"}</DialogTitle>
          <DialogDescription>
            章节只属于当前叙事作品；可在此维护正文、梗概和登场人物。
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_150px] gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">章节标题 *</label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：第一章 · 重逢" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">进度状态</label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as ChapterStatus)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {CHAPTER_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">目标字数</label>
            <Input type="number" min="1" inputMode="numeric" value={targetWordCount} onChange={(event) => setTargetWordCount(event.target.value)} placeholder="选填" />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-muted-foreground">本章梗概</label>
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="用几句话记录本章的冲突、转折或目标……"
            className="min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-semibold text-muted-foreground">章节正文</label>
            <span className="text-[11px] text-muted-foreground">当前 {wordCount} 字</span>
          </div>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="开始写这一章的正文……"
            className="min-h-64 rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-7 shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Users className="w-4 h-4 text-primary" />
            本章登场人物
          </div>
          {characters.length === 0 ? (
            <p className="text-xs text-muted-foreground">还没有人物设定。可先在“人物设定”标签页添加人物，再回到这里关联。</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {characters.map((character) => {
                const selected = selectedCharacterIds.includes(character.id);
                return (
                  <div key={character.id} className={`rounded-md border p-2.5 ${selected ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={selected} onChange={() => toggleCharacter(character.id)} />
                      <Check className={`w-3.5 h-3.5 text-primary ${selected ? "opacity-100" : "opacity-0"}`} />
                      <span className="truncate">{character.name}</span>
                    </label>
                    {selected && (
                      <Input
                        className="mt-2 h-8 text-xs"
                        value={characterNotes[character.id] || ""}
                        onChange={(event) => setCharacterNotes((current) => ({ ...current, [character.id]: event.target.value }))}
                        placeholder="本章出场备注（选填）"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>取消</Button>
          <Button onClick={handleSave} disabled={isSaving}>{isSaving ? "保存中…" : "保存章节"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
