import { useCallback, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  Code2,
  FileCode2,
  FileText,
  FolderKanban,
  Globe2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/useToast";
import {
  knowledgeApi,
  type KnowledgeEntry,
  type KnowledgeProject,
  type KnowledgeSearchResult,
} from "@/services/tauri";
import { cn } from "@/lib/utils";
import { KnowledgeGraphDialog } from "@/components/knowledge/KnowledgeGraphDialog";

const ENTRY_TYPE_FILTERS = [
  { value: "all", label: "全部" },
  { value: "文档", label: "文档" },
  { value: "代码", label: "代码" },
  { value: "配置", label: "配置" },
  { value: "网页", label: "网页" },
  { value: "开发指南", label: "开发指南" },
  { value: "手动笔记", label: "我的记录" },
] as const;

function formatTime(value?: string | null) {
  if (!value) return "尚未索引";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sourcePreview(entry: KnowledgeEntry, matchLine?: number | null) {
  const lines = entry.content.split("\n");
  const selectedLine = Math.max(1, matchLine || 1);
  const start = Math.max(1, selectedLine - 2);
  const end = Math.min(lines.length, start + 8);
  return lines.slice(start - 1, end).map((line, index) => ({
    number: start + index,
    text: line || " ",
  }));
}

function EntryIcon({ entryType }: { entryType: string }) {
  if (entryType === "代码") return <FileCode2 className="h-4 w-4" />;
  if (entryType === "网页") return <Globe2 className="h-4 w-4" />;
  if (entryType === "文档") return <FileText className="h-4 w-4" />;
  return <BookOpenCheck className="h-4 w-4" />;
}

export default function KnowDomainView() {
  const [projects, setProjects] = useState<KnowledgeProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [entryType, setEntryType] = useState("all");
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isIndexing, setIsIndexing] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isWebCollectionOpen, setIsWebCollectionOpen] = useState(false);
  const [isGraphOpen, setIsGraphOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isWebImporting, setIsWebImporting] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newEntryType, setNewEntryType] = useState("手动笔记");
  const [webCollectionName, setWebCollectionName] = useState("");
  const [webEntryUrl, setWebEntryUrl] = useState("");

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const selectedResult = useMemo(
    () => results.find((result) => result.entry.id === selectedResultId) ?? results[0] ?? null,
    [results, selectedResultId],
  );
  const selectedSource = selectedResult?.entry.source_url ?? selectedResult?.entry.source_path ?? null;

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextProjects = await knowledgeApi.listProjects();
      setProjects(nextProjects);
      setSelectedProjectId((current) =>
        current && nextProjects.some((project) => project.id === current)
          ? current
          : nextProjects[0]?.id ?? null,
      );
    } catch (error) {
      toast({
        variant: "destructive",
        title: "无法读取知识库",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const runSearch = useCallback(
    async (nextQuery: string, nextEntryType = entryType) => {
      if (!selectedProjectId) {
        setResults([]);
        setSelectedResultId(null);
        return;
      }
      setIsLoading(true);
      try {
        const nextResults = await knowledgeApi.search(
          selectedProjectId,
          nextQuery,
          nextEntryType === "all" ? null : nextEntryType,
        );
        setResults(nextResults);
        setSelectedResultId(nextResults[0]?.entry.id ?? null);
      } catch (error) {
        toast({
          variant: "destructive",
          title: "搜索失败",
          description: error instanceof Error ? error.message : "请稍后重试。",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [entryType, selectedProjectId],
  );

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (selectedProjectId) void runSearch("", entryType);
  }, [entryType, selectedProjectId, runSearch]);

  const chooseProjectFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择要建立开发知识库的项目文件夹",
    });
    if (typeof selected !== "string") return;

    setIsIndexing(true);
    try {
      const indexed = await knowledgeApi.indexProject(selected);
      setProjects((current) => {
        const otherProjects = current.filter((project) => project.id !== indexed.project.id);
        return [indexed.project, ...otherProjects];
      });
      setSelectedProjectId(indexed.project.id);
      toast({
        title: "项目已建立索引",
        description: indexed.curated_entries > 0
          ? `已收录 ${indexed.indexed_files} 个项目文件，并加入 ${indexed.curated_entries} 条 sanOmni 精选知识。${indexed.truncated ? " 已达到 2,000 个文件上限。" : ""}`
          : `已收录 ${indexed.indexed_files} 个文档、代码或配置文件。${indexed.truncated ? " 已达到 2,000 个文件上限。" : ""}`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "建立索引失败",
        description: error instanceof Error ? error.message : "请确认所选目录可访问。",
      });
    } finally {
      setIsIndexing(false);
    }
  };

  const refreshIndex = async () => {
    if (!selectedProject) return;
    setIsIndexing(true);
    try {
      const indexed = await knowledgeApi.indexProject(
        selectedProject.root_path,
        selectedProject.name,
      );
      setProjects((current) =>
        current.map((project) => (project.id === indexed.project.id ? indexed.project : project)),
      );
      await runSearch(query, entryType);
      toast({
        title: "索引已更新",
        description: indexed.curated_entries > 0
          ? `已重新读取 ${indexed.indexed_files} 个项目文件，并更新 ${indexed.curated_entries} 条 sanOmni 精选知识。${indexed.truncated ? " 已达到 2,000 个文件上限；未扫描的旧索引已保留。" : ""}`
          : `已重新读取 ${indexed.indexed_files} 个项目文件。${indexed.truncated ? " 已达到 2,000 个文件上限；未扫描的旧索引已保留。" : ""}`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "更新索引失败",
        description: error instanceof Error ? error.message : "请确认项目目录仍可访问。",
      });
    } finally {
      setIsIndexing(false);
    }
  };

  const createEntry = async () => {
    if (!selectedProject || !newTitle.trim() || !newContent.trim()) return;
    setIsSaving(true);
    try {
      const entry = await knowledgeApi.createEntry(
        selectedProject.id,
        newTitle,
        newContent,
        newEntryType,
      );
      setIsCreateOpen(false);
      setNewTitle("");
      setNewContent("");
      setNewEntryType("手动笔记");
      setQuery("");
      await runSearch("", entryType);
      setSelectedResultId(entry.id);
      toast({ title: "知识记录已保存", description: "以后可以直接搜索这条记录。" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "保存失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const importWebCollection = async () => {
    if (!selectedProject || !webCollectionName.trim() || !webEntryUrl.trim()) return;
    setIsWebImporting(true);
    try {
      const imported = await knowledgeApi.importWebCollection(
        selectedProject.id,
        webCollectionName,
        webEntryUrl,
      );
      setIsWebCollectionOpen(false);
      setWebCollectionName("");
      setWebEntryUrl("");
      setQuery("");
      setEntryType("网页");
      await runSearch("", "网页");
      toast({
        title: "网页文档集已收录",
        description: `“${imported.collection_name}”已收录 ${imported.imported_pages} 页${imported.skipped_pages ? `，跳过 ${imported.skipped_pages} 页` : ""}。`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "收录网页失败",
        description: error instanceof Error ? error.message : "请确认网址可访问后重试。",
      });
    } finally {
      setIsWebImporting(false);
    }
  };

  return (
    <div className="san-know flex h-full min-h-0 bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
        <div className="border-b px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-7 w-7 items-center justify-center bg-primary text-primary-foreground">
              <BookOpenCheck className="h-4 w-4" />
            </span>
            <span>sanKnow</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">开发者个人知识库</p>
        </div>

        <div className="space-y-1 border-b p-3">
          <div className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-foreground">
            <Search className="h-4 w-4" />
            搜索与溯源
          </div>
          <p className="px-2 pt-1 text-xs leading-5 text-muted-foreground">
            输入问题，先看可追溯的项目来源，再决定是否修改代码。
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-3">
          <div className="mb-2 flex items-center justify-between px-2 text-xs font-medium text-muted-foreground">
            <span>项目范围</span>
            <FolderKanban className="h-3.5 w-3.5" />
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-1">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setSelectedProjectId(project.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-2 text-left text-sm transition-colors",
                    project.id === selectedProjectId
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <FolderKanban className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  <span className="text-xs tabular-nums">{project.entry_count}</span>
                </button>
              ))}
              {!isLoading && projects.length === 0 && (
                <p className="px-2 py-3 text-xs leading-5 text-muted-foreground">
                  还没有项目。先选择 sanOmni 的项目文件夹建立索引。
                </p>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="border-t p-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={() => void chooseProjectFolder()}
            disabled={isIndexing}
          >
            {isIndexing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            添加项目
          </Button>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            只在本地读取你选择的项目，不会上传项目代码。
          </p>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="border-b bg-card px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">搜索 {selectedProject?.name ?? "项目知识"}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedProject
                  ? `本地索引 · 最近更新 ${formatTime(selectedProject.last_indexed_at)}`
                  : "从一个项目文件夹开始，sanKnow 会收录文档、代码和配置。"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {selectedProject && (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => void refreshIndex()} disabled={isIndexing}>
                  <RefreshCw className={cn("h-4 w-4", isIndexing && "animate-spin")} />
                  更新索引
                </Button>
              )}
              {selectedProject && (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setIsWebCollectionOpen(true)} disabled={isWebImporting}>
                  <Globe2 className="h-4 w-4" />
                  收录网页
                </Button>
              )}
              {selectedProject && (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setIsGraphOpen(true)}>
                  <BookOpenCheck className="h-4 w-4" />
                  关系图谱
                </Button>
              )}
              <Button size="sm" className="gap-2" onClick={() => setIsCreateOpen(true)} disabled={!selectedProject}>
                <Plus className="h-4 w-4" />
                新建记录
              </Button>
            </div>
          </div>
        </div>

        {!selectedProject ? (
          <section className="flex flex-1 items-center justify-center p-8">
            <div className="max-w-xl text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center bg-primary/10 text-primary">
                <Sparkles className="h-6 w-6" />
              </span>
              <h3 className="mt-5 text-xl font-semibold">不需要先学 Obsidian</h3>
              <p className="mt-3 leading-7 text-muted-foreground">
                这里先从你熟悉的项目开始：选择 sanOmni 的文件夹，搜索问题时会返回原始代码和文档来源。你只需要把重要结论补成一条记录。
              </p>
              <ol className="mt-6 grid gap-3 text-left text-sm text-muted-foreground sm:grid-cols-3">
                {[
                  "1. 选择项目文件夹",
                  "2. 输入开发问题",
                  "3. 保存重要结论",
                ].map((step) => (
                  <li key={step} className="border bg-card p-3">{step}</li>
                ))}
              </ol>
              <Button className="mt-6 gap-2" onClick={() => void chooseProjectFolder()} disabled={isIndexing}>
                {isIndexing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderKanban className="h-4 w-4" />}
                选择 sanOmni 项目文件夹
              </Button>
            </div>
          </section>
        ) : (
          <div className="flex min-h-0 flex-1">
            <section className="flex min-w-0 flex-1 flex-col border-r">
              <div className="border-b bg-muted/20 px-6 py-5">
                <form
                  className="mx-auto max-w-3xl"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void runSearch(query, entryType);
                  }}
                >
                  <label className="mb-2 block text-center text-xl font-semibold">搜索 {selectedProject.name} 的代码与文档</label>
                  <div className="flex gap-2 border bg-card p-2 focus-within:ring-1 focus-within:ring-ring">
                    <Search className="mt-2.5 ml-1 h-5 w-5 shrink-0 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="例如：同步删除失败如何处理？"
                      className="h-10 flex-1 border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
                    />
                    <Button type="submit" className="gap-2" disabled={isLoading}>
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      搜索
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {ENTRY_TYPE_FILTERS.map((filter) => (
                      <Button
                        key={filter.value}
                        type="button"
                        size="sm"
                        variant={entryType === filter.value ? "default" : "outline"}
                        onClick={() => setEntryType(filter.value)}
                      >
                        {filter.label}
                      </Button>
                    ))}
                    <span className="ml-auto text-xs text-muted-foreground">来源文件会原样保留，避免无依据结论。</span>
                  </div>
                </form>
              </div>

              <ScrollArea className="min-h-0 flex-1">
                <div className="mx-auto max-w-3xl space-y-2 p-6">
                  {isLoading && results.length === 0 ? (
                    <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在读取知识库…
                    </div>
                  ) : results.length === 0 ? (
                    <div className="border bg-card p-8 text-center">
                      <h3 className="font-medium">没有找到相关来源</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        换一个更接近文件名、模块名或报错文本的词；也可以把确认过的处理方式新建成记录。
                      </p>
                    </div>
                  ) : (
                    results.map((result, index) => (
                      <button
                        key={result.entry.id}
                        type="button"
                        onClick={() => setSelectedResultId(result.entry.id)}
                        className={cn(
                          "w-full border bg-card p-4 text-left transition-colors hover:bg-muted/30",
                          selectedResult?.entry.id === result.entry.id && "border-primary bg-primary/[0.03]",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-muted text-xs font-medium text-muted-foreground">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="gap-1 text-primary">
                                <EntryIcon entryType={result.entry.entry_type} />
                                {result.entry.entry_type}
                              </Badge>
                              {(result.entry.source_url ?? result.entry.source_path) && (
                                <Badge variant="secondary" className="gap-1 text-emerald-700 dark:text-emerald-400">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  原始来源
                                </Badge>
                              )}
                              {result.entry.source_collection_name && (
                                <Badge variant="secondary" className="max-w-full truncate">
                                  {result.entry.source_collection_name}
                                </Badge>
                              )}
                            </div>
                            <h3 className="mt-2 font-semibold">{result.entry.title}</h3>
                            <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{result.snippet}</p>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {(result.entry.source_url ?? result.entry.source_path) && (
                                <span className="inline-flex min-w-0 items-start gap-1 bg-muted px-2 py-1 font-mono break-all">
                                  {result.entry.source_url ? <Globe2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Code2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                                  {result.entry.source_url ?? result.entry.source_path}
                                  {result.match_line ? `:${result.match_line}` : ""}
                                </span>
                              )}
                              <span>{formatTime(result.entry.updated_at)}</span>
                            </div>
                          </div>
                          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </section>

            <aside className="flex w-[360px] shrink-0 flex-col bg-card">
              {selectedResult ? (
                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-6 p-5">
                    <div className="border-b pb-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{selectedResult.entry.entry_type}</Badge>
                        {selectedSource ? (
                          <Badge variant="secondary" className="gap-1 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> 来源可追溯
                          </Badge>
                        ) : (
                          <Badge variant="secondary">个人记录</Badge>
                        )}
                      </div>
                      <h2 className="mt-3 break-words text-lg font-semibold leading-7">{selectedResult.entry.title}</h2>
                    </div>

                    <section>
                      <h3 className="text-sm font-semibold">内容摘要</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedResult.snippet}</p>
                    </section>

                    {selectedSource && (
                      <section>
                        <h3 className="text-sm font-semibold">证据来源</h3>
                        <div className="mt-2 border bg-muted/30 p-3">
                          <div className="flex min-w-0 items-start gap-2 text-sm font-medium">
                            <EntryIcon entryType={selectedResult.entry.entry_type} />
                            <span className="min-w-0 break-all font-mono text-xs">{selectedSource}</span>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {selectedResult.entry.source_collection_name ?? selectedResult.entry.source_language ?? "项目文件"}
                            {selectedResult.match_line ? ` · 第 ${selectedResult.match_line} 行附近` : " · 已索引"}
                          </p>
                        </div>
                      </section>
                    )}

                    <section>
                      <h3 className="text-sm font-semibold">来源片段</h3>
                      <pre className="mt-2 overflow-hidden whitespace-pre-wrap break-words border bg-muted/40 p-3 text-xs leading-5 text-foreground">
                        {sourcePreview(selectedResult.entry, selectedResult.match_line).map((line) => (
                          <div key={line.number} className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] gap-3">
                            <span className="select-none text-right text-muted-foreground">{line.number}</span>
                            <code className="min-w-0 whitespace-pre-wrap break-words">{line.text}</code>
                          </div>
                        ))}
                      </pre>
                    </section>

                    <section className="border-l-2 border-primary/70 bg-primary/[0.03] p-3 text-sm leading-6 text-muted-foreground">
                      这是本地项目的原始内容，不是 AI 自动编造的答案。实际改代码前，建议继续打开完整文件确认上下文。
                    </section>
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-center text-sm leading-6 text-muted-foreground">
                  选择一条搜索结果后，这里会显示它的原始来源和相关片段。
                </div>
              )}
            </aside>
          </div>
        )}
      </main>

      <Dialog open={isWebCollectionOpen} onOpenChange={setIsWebCollectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>通过网址收录文档</DialogTitle>
            <DialogDescription>
              填写文档集名称和入口 URL。sanKnow 会在同域、同级路径或子路径内收录网页，最多向下跟随 3 跳；只保存到本地知识库。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block text-sm font-medium">
              文档集名称
              <Input
                value={webCollectionName}
                onChange={(event) => setWebCollectionName(event.target.value.slice(0, 20))}
                placeholder="例如：Tauri 官方文档"
                maxLength={20}
                className="mt-2"
              />
              <span className="mt-1 block text-right text-xs text-muted-foreground">{webCollectionName.length}/20</span>
            </label>
            <label className="block text-sm font-medium">
              入口 URL
              <Input
                value={webEntryUrl}
                onChange={(event) => setWebEntryUrl(event.target.value)}
                placeholder="https://example.com/docs/"
                type="url"
                className="mt-2"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsWebCollectionOpen(false)} disabled={isWebImporting}>取消</Button>
            <Button onClick={() => void importWebCollection()} disabled={isWebImporting || !webCollectionName.trim() || !webEntryUrl.trim()}>
              {isWebImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              开始收录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>记录一个以后会用到的结论</DialogTitle>
            <DialogDescription>
              例如：某次报错的真正原因、设计取舍，或验证通过的处理步骤。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="标题，例如：同步删除失败的处理方式" />
            <Select value={newEntryType} onValueChange={setNewEntryType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="手动笔记">手动笔记</SelectItem>
                <SelectItem value="问题处理">问题处理</SelectItem>
                <SelectItem value="设计决策">设计决策</SelectItem>
                <SelectItem value="开发规范">开发规范</SelectItem>
              </SelectContent>
            </Select>
            <textarea
              value={newContent}
              onChange={(event) => setNewContent(event.target.value)}
              placeholder="写下结论、原因、复现方式和验证结果。建议同时注明相关文件路径。"
              className="min-h-44 w-full border p-3 text-sm leading-6 outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>取消</Button>
            <Button onClick={() => void createEntry()} disabled={isSaving || !newTitle.trim() || !newContent.trim()}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存记录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <KnowledgeGraphDialog
        project={selectedProject}
        open={isGraphOpen}
        onOpenChange={setIsGraphOpen}
      />
    </div>
  );
}
