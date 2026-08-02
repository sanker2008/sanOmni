import { useState, useEffect, useMemo, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  FolderKanban,
  RefreshCw,
  FolderOpen,
  Search,
  LayoutGrid,
  List,
  FolderTree,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  Eye,
  FileImage,
  FileVideo,
  FileCode,
  HardDrive,
  Filter,
  CheckSquare,
  Square,
  X,
  ChevronDown,
  ChevronRight,
  Info,
  Eraser,
  Download,
  ClipboardCheck,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/useToast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  scanLabsMedia,
  deleteMediaFiles,
  batchExportFiles,
  copyImageToClipboard,
  formatBytes,
  revealFileInFolder,
  openPath,
  type MediaEntry,
  type MediaType,
  type MediaCategory,
  LAB_TOOLS_MAPPING,
} from "./fs";

type ViewMode = "grid" | "list" | "grouped";
type SortOption = "date-desc" | "date-asc" | "size-desc" | "size-asc" | "name-asc";

interface ContextMenuState {
  x: number;
  y: number;
  entry: MediaEntry;
}

const PAGE_SIZE = 48;

export default function LabsMediaManager() {
  const [labsRoot, setLabsRoot] = useState<string>("");
  const [entries, setEntries] = useState<MediaEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [selectedToolId, setSelectedToolId] = useState<string>("ALL");
  const [selectedCategory, setSelectedCategory] = useState<MediaCategory | "ALL">("ALL");
  const [selectedMediaType, setSelectedMediaType] = useState<MediaType | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortOption>("date-desc");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Selection
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // Copy feedback state
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [copiedImage, setCopiedImage] = useState<string | null>(null);

  // Modals
  const [previewEntry, setPreviewEntry] = useState<MediaEntry | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<MediaEntry[] | null>(null);
  const [showClearTempConfirm, setShowClearTempConfirm] = useState<boolean>(false);

  // Context Menu
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Collapsed sections for grouped view
  const [collapsedTools, setCollapsedTools] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await scanLabsMedia();
      setLabsRoot(result.labsRoot);
      setEntries(result.entries);
      setSelectedPaths(new Set());
    } catch (e) {
      console.error("Failed to scan labs media:", e);
      toast({
        title: "扫描失败",
        description: "读取 sanLabs 媒体目录时出错",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Close context menu on global click or scroll
  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("scroll", handleGlobalClick, true);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("scroll", handleGlobalClick, true);
    };
  }, []);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedToolId, selectedCategory, selectedMediaType, searchQuery, sortBy]);

  // Tool counts & Storage distribution breakdown
  const toolStats = useMemo(() => {
    const counts: Record<string, number> = { ALL: entries.length };
    const sizes: Record<string, number> = {};

    entries.forEach((item) => {
      counts[item.toolId] = (counts[item.toolId] || 0) + 1;
      sizes[item.toolId] = (sizes[item.toolId] || 0) + item.size;
    });

    const totalSize = entries.reduce((acc, item) => acc + item.size, 0);

    return { counts, sizes, totalSize };
  }, [entries]);

  // Temp files stats
  const tempStats = useMemo(() => {
    const tempEntries = entries.filter((e) => e.category === "temp");
    const tempSize = tempEntries.reduce((acc, e) => acc + e.size, 0);
    return {
      entries: tempEntries,
      count: tempEntries.length,
      sizeFormatted: formatBytes(tempSize),
    };
  }, [entries]);

  // Filtered & sorted entries
  const filteredEntries = useMemo(() => {
    return entries
      .filter((item) => {
        if (selectedToolId !== "ALL" && item.toolId !== selectedToolId) return false;
        if (selectedCategory !== "ALL" && item.category !== selectedCategory) return false;
        if (selectedMediaType !== "ALL" && item.mediaType !== selectedMediaType) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          if (!item.name.toLowerCase().includes(q) && !item.relativePath.toLowerCase().includes(q)) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "date-desc":
            return b.modifiedAt - a.modifiedAt;
          case "date-asc":
            return a.modifiedAt - b.modifiedAt;
          case "size-desc":
            return b.size - a.size;
          case "size-asc":
            return a.size - b.size;
          case "name-asc":
            return a.name.localeCompare(b.name, "zh-CN");
          default:
            return 0;
        }
      });
  }, [entries, selectedToolId, selectedCategory, selectedMediaType, searchQuery, sortBy]);

  // Paginated entries
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const paginatedEntries = useMemo(() => {
    if (viewMode === "grouped") return filteredEntries; // Grouped view handles its own sections
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredEntries.slice(start, start + PAGE_SIZE);
  }, [filteredEntries, currentPage, viewMode]);

  // Grouped entries by toolId for grouped view
  const groupedEntries = useMemo(() => {
    const groups: Record<string, { toolName: string; items: MediaEntry[]; totalSize: number }> = {};

    filteredEntries.forEach((item) => {
      if (!groups[item.toolId]) {
        groups[item.toolId] = {
          toolName: item.toolName,
          items: [],
          totalSize: 0,
        };
      }
      groups[item.toolId].items.push(item);
      groups[item.toolId].totalSize += item.size;
    });

    return groups;
  }, [filteredEntries]);

  // Selection handlers
  const toggleSelect = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPaths.size === filteredEntries.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(filteredEntries.map((item) => item.path)));
    }
  };

  // Copy path & Copy image handlers
  const handleCopyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPath(path);
      toast({ title: "已复制路径", description: path });
      setTimeout(() => setCopiedPath(null), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopyImage = async (entry: MediaEntry) => {
    if (entry.mediaType === "video") {
      toast({ title: "复制失败", description: "暂不支持将视频二进制写入剪贴板", variant: "destructive" });
      return;
    }
    const success = await copyImageToClipboard(entry.path);
    if (success) {
      setCopiedImage(entry.path);
      toast({ title: "复制图片成功", description: "图片已写入剪贴板，可直接粘贴使用" });
      setTimeout(() => setCopiedImage(null), 2000);
    } else {
      toast({ title: "复制失败", description: "剪贴板写入受限", variant: "destructive" });
    }
  };

  // Batch Export Handler
  const handleBatchExport = async () => {
    if (selectedPaths.size === 0) return;

    try {
      const selectedDir = await openDialog({
        directory: true,
        multiple: false,
        title: "选择目标导出文件夹",
      });

      if (!selectedDir || typeof selectedDir !== "string") return;

      const sourcePaths = Array.from(selectedPaths);
      const count = await batchExportFiles(sourcePaths, selectedDir);

      toast({
        title: "批量导出成功",
        description: `已成功导出 ${count} 个文件至：${selectedDir}`,
      });
    } catch (e) {
      console.error(e);
      toast({ title: "导出失败", description: String(e), variant: "destructive" });
    }
  };

  // Confirm delete handler
  const handleExecuteDelete = async () => {
    if (!deleteTargets || deleteTargets.length === 0) return;
    const paths = deleteTargets.map((t) => t.path);
    const count = await deleteMediaFiles(paths);

    toast({
      title: "删除成功",
      description: `已清理 ${count} 个媒体文件`,
    });

    setDeleteTargets(null);
    if (previewEntry && paths.includes(previewEntry.path)) {
      setPreviewEntry(null);
    }
    loadData();
  };

  // Clear temp handler
  const handleExecuteClearTemp = async () => {
    if (tempStats.count === 0) return;
    const paths = tempStats.entries.map((e) => e.path);
    const count = await deleteMediaFiles(paths);

    toast({
      title: "缓存清理成功",
      description: `已释放 ${tempStats.sizeFormatted} 存储空间（共 ${count} 个临时文件）`,
    });

    setShowClearTempConfirm(false);
    loadData();
  };

  // Context Menu trigger
  const handleContextMenu = (e: React.MouseEvent, entry: MediaEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      entry,
    });
  };

  const getMediaIcon = (type: MediaType) => {
    switch (type) {
      case "image":
        return <FileImage className="w-4 h-4 text-blue-500" />;
      case "video":
        return <FileVideo className="w-4 h-4 text-purple-500" />;
      case "svg":
        return <FileCode className="w-4 h-4 text-emerald-500" />;
      default:
        return <Info className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-background text-foreground overflow-hidden">
      {/* ─── Header Stats & Action Bar ───────────────────────────── */}
      <div className="px-4 py-3 border-b border-border bg-card/60 backdrop-blur flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              sanLabs 媒体管理器
              <Badge variant="outline" className="font-mono text-xs">
                {entries.length} 个文件 / {formatBytes(toolStats.totalSize)}
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground truncate max-w-md" title={labsRoot}>
              根目录：{labsRoot || "解析中..."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {tempStats.count > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowClearTempConfirm(true)}
              className="gap-1.5 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
            >
              <Eraser className="w-3.5 h-3.5" />
              清理缓存 ({tempStats.sizeFormatted})
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData()}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => openPath(labsRoot)}
            disabled={!labsRoot}
            className="gap-1.5"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            在文件夹中打开
          </Button>

          {selectedPaths.size > 0 && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleBatchExport}
                className="gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                导出选中 ({selectedPaths.size})
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  const targets = entries.filter((e) => selectedPaths.has(e.path));
                  setDeleteTargets(targets);
                }}
                className="gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                删除选中 ({selectedPaths.size})
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ─── Visual Storage Distribution Progress Bar (占比图表) ──── */}
      {toolStats.totalSize > 0 && (
        <div className="px-4 py-2 border-b border-border bg-muted/20 flex flex-col gap-1.5 shrink-0">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
            <span>磁盘空间占用分布</span>
            <span>总计：{formatBytes(toolStats.totalSize)}</span>
          </div>

          <div className="w-full h-2 rounded-full bg-muted overflow-hidden flex shadow-inner">
            {LAB_TOOLS_MAPPING.map((tool) => {
              const size = toolStats.sizes[tool.id] || 0;
              if (size === 0) return null;
              const percent = (size / toolStats.totalSize) * 100;
              return (
                <div
                  key={tool.id}
                  style={{ width: `${percent}%`, backgroundColor: tool.color }}
                  className="h-full transition-all duration-300 relative group cursor-pointer"
                  title={`${tool.name}: ${formatBytes(size)} (${percent.toFixed(1)}%)`}
                />
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground pt-0.5">
            {LAB_TOOLS_MAPPING.map((tool) => {
              const size = toolStats.sizes[tool.id] || 0;
              if (size === 0) return null;
              return (
                <span key={tool.id} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tool.color }} />
                  <span>{tool.name}:</span>
                  <span className="font-mono text-foreground/80">{formatBytes(size)}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Sub-tool Filter Pills (小工具筛选栏) ──────────────────── */}
      <div className="px-4 py-2.5 border-b border-border bg-muted/30 overflow-x-auto flex items-center gap-1.5 shrink-0 scrollbar-none">
        <span className="text-xs font-medium text-muted-foreground mr-1 flex items-center gap-1 shrink-0">
          <Filter className="w-3 h-3" />
          小工具筛选：
        </span>

        <button
          type="button"
          onClick={() => setSelectedToolId("ALL")}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 ${
            selectedToolId === "ALL"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          全部工具
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full ${
              selectedToolId === "ALL" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background/80"
            }`}
          >
            {toolStats.counts["ALL"] || 0}
          </span>
        </button>

        {LAB_TOOLS_MAPPING.map((tool) => {
          const count = toolStats.counts[tool.id] || 0;
          if (count === 0 && selectedToolId !== tool.id) return null;

          const isSelected = selectedToolId === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => setSelectedToolId(tool.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                isSelected
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tool.color }} />
              {tool.name}
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background/80"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}

        {toolStats.counts["other"] > 0 && (
          <button
            type="button"
            onClick={() => setSelectedToolId("other")}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 ${
              selectedToolId === "other"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            其他/通用
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                selectedToolId === "other" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background/80"
              }`}
            >
              {toolStats.counts["other"]}
            </span>
          </button>
        )}
      </div>

      {/* ─── Search, Sorting & Controls ───────────────────────────── */}
      <div className="px-4 py-2.5 border-b border-border flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="搜索文件名..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-muted/40"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Category Selector */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as any)}
            className="h-8 px-2.5 text-xs bg-muted/40 border border-input rounded-md focus:outline-none focus:border-primary"
          >
            <option value="ALL">全部目录</option>
            <option value="exports">导出目录 (exports)</option>
            <option value="temp">临时缓存 (temp)</option>
            <option value="other">其他位置</option>
          </select>

          {/* Media Type Selector */}
          <select
            value={selectedMediaType}
            onChange={(e) => setSelectedMediaType(e.target.value as any)}
            className="h-8 px-2.5 text-xs bg-muted/40 border border-input rounded-md focus:outline-none focus:border-primary"
          >
            <option value="ALL">全部媒体类型</option>
            <option value="image">图片 (PNG/JPG/WebP/GIF)</option>
            <option value="video">视频 (MP4/WebM/MOV)</option>
            <option value="svg">矢量图 (SVG)</option>
          </select>

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-8 px-2.5 text-xs bg-muted/40 border border-input rounded-md focus:outline-none focus:border-primary"
          >
            <option value="date-desc">修改时间 (最新优先)</option>
            <option value="date-asc">修改时间 (最早优先)</option>
            <option value="size-desc">文件大小 (从大到小)</option>
            <option value="size-asc">文件大小 (从小到大)</option>
            <option value="name-asc">文件名 (A-Z)</option>
          </select>
        </div>

        {/* View Mode Switches & Select All */}
        <div className="flex items-center gap-2">
          {filteredEntries.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSelectAll}
              className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            >
              {selectedPaths.size === filteredEntries.length ? (
                <CheckSquare className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              全选 ({selectedPaths.size}/{filteredEntries.length})
            </Button>
          )}

          <div className="flex items-center border border-border rounded-md bg-muted/30 p-0.5">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode("grid")}
              title="网格视图"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode("list")}
              title="列表视图"
            >
              <List className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant={viewMode === "grouped" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode("grouped")}
              title="工具分组视图"
            >
              <FolderTree className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Main Content View ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <RefreshCw className="w-8 h-8 animate-spin mb-3 text-primary" />
            <p className="text-sm">正在深度扫描 sanLabs 媒体文件...</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-16">
            <HardDrive className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">未找到符合条件的媒体文件</p>
            <p className="text-xs mt-1 text-muted-foreground/70">
              请检查顶部过滤规则，或在 sanLabs 小工具中生成导出文件
            </p>
          </div>
        ) : viewMode === "grid" ? (
          /* Grid View */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
            {paginatedEntries.map((item) => {
              const isSelected = selectedPaths.has(item.path);
              const fileUrl = convertFileSrc(item.path);

              return (
                <div
                  key={item.path}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                  className={`group relative bg-card border rounded-lg overflow-hidden transition-all duration-200 hover:shadow-md flex flex-col ${
                    isSelected ? "ring-2 ring-primary border-primary" : "border-border hover:border-border/80"
                  }`}
                >
                  {/* Select Checkbox Overlay */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(item.path);
                    }}
                    className={`absolute top-2 left-2 z-10 p-1 rounded-md transition-opacity ${
                      isSelected
                        ? "opacity-100 bg-primary text-primary-foreground"
                        : "opacity-0 group-hover:opacity-100 bg-black/60 text-white"
                    }`}
                  >
                    {isSelected ? <Check className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  </button>

                  {/* Media Thumbnail */}
                  <div
                    className="relative aspect-square bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center overflow-hidden cursor-pointer"
                    onClick={() => setPreviewEntry(item)}
                  >
                    {item.mediaType === "video" ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-black/40 text-white group-hover:scale-105 transition-transform duration-300">
                        <FileVideo className="w-10 h-10 mb-1 opacity-80" />
                        <span className="text-[10px] uppercase tracking-wider font-semibold bg-black/60 px-1.5 py-0.5 rounded">
                          {item.ext}
                        </span>
                      </div>
                    ) : (
                      <img
                        src={fileUrl}
                        alt={item.name}
                        className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                    )}

                    {/* Category Tag */}
                    <div className="absolute top-2 right-2">
                      {item.category === "exports" && (
                        <span className="text-[10px] bg-emerald-500/90 text-white px-1.5 py-0.5 rounded font-medium shadow-sm">
                          导出
                        </span>
                      )}
                      {item.category === "temp" && (
                        <span className="text-[10px] bg-amber-500/90 text-white px-1.5 py-0.5 rounded font-medium shadow-sm">
                          临时
                        </span>
                      )}
                    </div>

                    {/* Quick Hover Actions Overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-2">
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-7 w-7 rounded-full shadow-lg"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewEntry(item);
                        }}
                        title="预览"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-7 w-7 rounded-full shadow-lg"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyImage(item);
                        }}
                        title="复制图片数据"
                      >
                        {copiedImage === item.path ? (
                          <ClipboardCheck className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-7 w-7 rounded-full shadow-lg"
                        onClick={(e) => {
                          e.stopPropagation();
                          revealFileInFolder(item.path);
                        }}
                        title="在系统文件夹中定位"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        className="h-7 w-7 rounded-full shadow-lg"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTargets([item]);
                        }}
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Card Info Footer */}
                  <div className="p-2 bg-card flex-1 flex flex-col justify-between">
                    <div>
                      <div className="text-xs font-medium truncate" title={item.name}>
                        {item.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-between">
                        <span className="text-primary/90 font-medium truncate max-w-[110px]" title={item.toolName}>
                          {item.toolName}
                        </span>
                        <span>{formatBytes(item.size)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : viewMode === "list" ? (
          /* List View */
          <div className="border border-border rounded-lg overflow-hidden bg-card shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground font-medium">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedPaths.size === filteredEntries.length && filteredEntries.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="p-3">缩略图 / 名称</th>
                  <th className="p-3">归属小工具</th>
                  <th className="p-3">相对路径</th>
                  <th className="p-3">大小</th>
                  <th className="p-3">修改时间</th>
                  <th className="p-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedEntries.map((item) => {
                  const isSelected = selectedPaths.has(item.path);
                  const fileUrl = convertFileSrc(item.path);

                  return (
                    <tr
                      key={item.path}
                      onContextMenu={(e) => handleContextMenu(e, item)}
                      className={`hover:bg-muted/30 transition-colors ${
                        isSelected ? "bg-primary/5" : ""
                      }`}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(item.path)}
                          className="rounded"
                        />
                      </td>
                      <td className="p-3">
                        <div
                          className="flex items-center gap-2.5 cursor-pointer group"
                          onClick={() => setPreviewEntry(item)}
                        >
                          <div className="w-9 h-9 rounded bg-zinc-100 dark:bg-zinc-900 border border-border shrink-0 overflow-hidden flex items-center justify-center">
                            {item.mediaType === "video" ? (
                              <FileVideo className="w-5 h-5 text-purple-500" />
                            ) : (
                              <img src={fileUrl} alt="" className="w-full h-full object-cover" />
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                              {getMediaIcon(item.mediaType)}
                              {item.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground font-medium">
                        <Badge variant="outline" className="text-[10px]">
                          {item.toolName}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground font-mono text-[11px] truncate max-w-[200px]" title={item.relativePath}>
                        {item.relativePath}
                      </td>
                      <td className="p-3 text-muted-foreground font-mono">
                        {formatBytes(item.size)}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {item.modifiedAt ? new Date(item.modifiedAt).toLocaleString("zh-CN") : "-"}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setPreviewEntry(item)}
                            title="预览"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleCopyImage(item)}
                            title="复制图片"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => revealFileInFolder(item.path)}
                            title="在系统文件夹中定位"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTargets([item])}
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Tool Grouped View */
          <div className="space-y-4">
            {Object.entries(groupedEntries).map(([toolId, group]) => {
              const isCollapsed = collapsedTools[toolId];
              return (
                <div key={toolId} className="border border-border rounded-lg bg-card overflow-hidden">
                  <div
                    className="px-4 py-3 bg-muted/40 border-b border-border flex items-center justify-between cursor-pointer hover:bg-muted/60 transition-colors"
                    onClick={() =>
                      setCollapsedTools((prev) => ({ ...prev, [toolId]: !prev[toolId] }))
                    }
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      <span className="font-semibold text-sm">{group.toolName}</span>
                      <Badge variant="secondary" className="text-xs">
                        {group.items.length} 个文件
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">
                        ({formatBytes(group.totalSize)})
                      </span>
                    </div>
                  </div>

                  {!isCollapsed && (
                    <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {group.items.map((item) => {
                        const fileUrl = convertFileSrc(item.path);
                        return (
                          <div
                            key={item.path}
                            onContextMenu={(e) => handleContextMenu(e, item)}
                            className="group relative border border-border rounded-md overflow-hidden bg-background hover:shadow transition-all"
                          >
                            <div
                              className="aspect-square bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center cursor-pointer overflow-hidden"
                              onClick={() => setPreviewEntry(item)}
                            >
                              {item.mediaType === "video" ? (
                                <FileVideo className="w-8 h-8 text-purple-500" />
                              ) : (
                                <img src={fileUrl} alt="" className="w-full h-full object-cover" />
                              )}
                            </div>
                            <div className="p-2">
                              <div className="text-xs truncate font-medium">{item.name}</div>
                              <div className="text-[10px] text-muted-foreground flex justify-between mt-0.5">
                                <span>{formatBytes(item.size)}</span>
                                <button
                                  type="button"
                                  onClick={() => revealFileInFolder(item.path)}
                                  className="text-primary hover:underline"
                                >
                                  定位
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Pagination Bar ───────────────────────────────────────── */}
      {viewMode !== "grouped" && totalPages > 1 && (
        <div className="px-4 py-2 border-t border-border bg-card flex items-center justify-between shrink-0">
          <div className="text-xs text-muted-foreground">
            显示第 {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, filteredEntries.length)} 条，共 {filteredEntries.length} 条记录
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(1)}
              title="首页"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              title="上一页"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>

            <span className="text-xs font-mono px-2 text-muted-foreground">
              {currentPage} / {totalPages}
            </span>

            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              title="下一页"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(totalPages)}
              title="末页"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Right Click Context Menu (右键快捷菜单) ──────────────── */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-popover/95 backdrop-blur-md border border-border text-popover-foreground rounded-lg shadow-xl py-1 w-48 text-xs font-medium overflow-hidden animate-in fade-in-80 zoom-in-95"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            onClick={() => {
              setPreviewEntry(contextMenu.entry);
              setContextMenu(null);
            }}
          >
            <Eye className="w-3.5 h-3.5 text-blue-500" />
            全屏预览
          </button>

          <button
            type="button"
            className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            onClick={() => {
              handleCopyImage(contextMenu.entry);
              setContextMenu(null);
            }}
          >
            <Copy className="w-3.5 h-3.5 text-emerald-500" />
            复制图片到剪贴板
          </button>

          <button
            type="button"
            className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            onClick={() => {
              handleCopyPath(contextMenu.entry.path);
              setContextMenu(null);
            }}
          >
            <Copy className="w-3.5 h-3.5 text-gray-500" />
            复制完整路径
          </button>

          <button
            type="button"
            className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            onClick={() => {
              revealFileInFolder(contextMenu.entry.path);
              setContextMenu(null);
            }}
          >
            <ExternalLink className="w-3.5 h-3.5 text-purple-500" />
            在系统文件夹中定位
          </button>

          <div className="my-1 border-t border-border" />

          <button
            type="button"
            className="w-full px-3 py-2 text-left hover:bg-destructive/10 text-destructive flex items-center gap-2"
            onClick={() => {
              setDeleteTargets([contextMenu.entry]);
              setContextMenu(null);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            删除此文件
          </button>
        </div>
      )}

      {/* ─── Media Preview Modal ─────────────────────────────────── */}
      <Dialog open={Boolean(previewEntry)} onOpenChange={(open) => !open && setPreviewEntry(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-4">
          <DialogHeader className="pb-2 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-base">
              {previewEntry && getMediaIcon(previewEntry.mediaType)}
              <span className="truncate">{previewEntry?.name}</span>
            </DialogTitle>
            <DialogDescription className="text-xs font-mono truncate">
              {previewEntry?.path}
            </DialogDescription>
          </DialogHeader>

          {previewEntry && (
            <div className="flex-1 overflow-hidden py-3 flex flex-col items-center justify-center min-h-[300px]">
              {previewEntry.mediaType === "video" ? (
                <video
                  src={convertFileSrc(previewEntry.path)}
                  controls
                  autoPlay
                  className="max-h-[50vh] max-w-full rounded shadow"
                />
              ) : (
                <img
                  src={convertFileSrc(previewEntry.path)}
                  alt={previewEntry.name}
                  className="max-h-[55vh] max-w-full object-contain rounded shadow"
                />
              )}
            </div>
          )}

          <DialogFooter className="border-t border-border pt-3 flex items-center justify-between sm:justify-between">
            <div className="text-xs text-muted-foreground flex items-center gap-3">
              <span>归属：<strong className="text-foreground">{previewEntry?.toolName}</strong></span>
              <span>大小：<strong className="text-foreground">{previewEntry ? formatBytes(previewEntry.size) : 0}</strong></span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => previewEntry && handleCopyImage(previewEntry)}
              >
                <Copy className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                复制图片
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => previewEntry && handleCopyPath(previewEntry.path)}
              >
                {copiedPath === previewEntry?.path ? (
                  <Check className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5 mr-1" />
                )}
                复制路径
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => previewEntry && revealFileInFolder(previewEntry.path)}
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1" />
                定位文件
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (previewEntry) {
                    setDeleteTargets([previewEntry]);
                  }
                }}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                删除文件
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Modal ──────────────────────────── */}
      <Dialog open={Boolean(deleteTargets)} onOpenChange={(open) => !open && setDeleteTargets(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              确认永久删除媒体文件？
            </DialogTitle>
            <DialogDescription className="pt-2">
              您即将永久删除以下 <strong className="text-foreground">{deleteTargets?.length}</strong> 个媒体文件。此操作无法撤销：
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-40 overflow-y-auto my-2 p-2 bg-muted rounded text-xs space-y-1 font-mono">
            {deleteTargets?.map((item) => (
              <div key={item.path} className="truncate text-muted-foreground">
                • {item.relativePath}
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteTargets(null)}>
              取消
            </Button>
            <Button variant="destructive" size="sm" onClick={handleExecuteDelete}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Clear Temp Confirm Modal ────────────────────────────── */}
      <Dialog open={showClearTempConfirm} onOpenChange={setShowClearTempConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500">
              <Eraser className="w-5 h-5" />
              确认清理 sanLabs 临时缓存文件？
            </DialogTitle>
            <DialogDescription className="pt-2">
              将清理动图拆帧、图片切割、AI P图等生成的 <strong className="text-foreground">{tempStats.count}</strong> 个临时文件，可释放 <strong className="text-foreground">{tempStats.sizeFormatted}</strong> 存储空间。正式导出文件不受影响。
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 pt-3">
            <Button variant="outline" size="sm" onClick={() => setShowClearTempConfirm(false)}>
              取消
            </Button>
            <Button variant="default" size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleExecuteClearTemp}>
              确认清理 ({tempStats.sizeFormatted})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
