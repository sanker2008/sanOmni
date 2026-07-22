import { useEffect, useState } from "react";
import { Plus, Film, Search, Filter, SortDesc, SortAsc, X, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useWorksStore, useTagStore, groupAndDeduplicateTags, type WorkWithRelations, type UniqueTagGroup } from "@/stores";
import { tagApi } from "@/services/tauri";
import { Skeleton } from "@/components/ui/skeleton";
import WorkCard from "./WorkCard";
import WorkEditModal from "./WorkEditModal";

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

const SORT_OPTIONS = [
  { value: "created_at", label: "创建时间" },
  { value: "updated_at", label: "最近更新" },
  { value: "release_date", label: "发布日期" },
  { value: "name", label: "作品名称" },
];

import { useAutoGridColumns } from "@/hooks/useAutoGridColumns";

export function WorksView() {
  const { containerRef: gridRef, columns: gridCols } = useAutoGridColumns(250, 24, 48);
  
  const { works, loading, setFilters, fetchWorks } = useWorksStore();
  const { tags: allTags, setTags } = useTagStore();
  
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>("__ALL__");
  const [selectedStatus, setSelectedStatus] = useState<string>("__ALL__");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [isTagsExpanded, setIsTagsExpanded] = useState(false);
  
  const [sortBy, setSortBy] = useState<string>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingWork, setEditingWork] = useState<WorkWithRelations | null>(null);

  // Group & deduplicate system tags
  const uniqueTagGroups = groupAndDeduplicateTags(allTags);
  const MAX_COLLAPSED_TAGS = 16;
  const visibleTagGroups = isTagsExpanded
    ? uniqueTagGroups
    : uniqueTagGroups.filter((group, index) => {
        const isSelected = group.ids.some((id) => selectedTagIds.includes(id));
        return index < MAX_COLLAPSED_TAGS || isSelected;
      });

  // Load tags and works on mount
  useEffect(() => {
    fetchWorks();
    loadSystemTags();
  }, []);

  const loadSystemTags = async () => {
    try {
      const data = await tagApi.getAll();
      setTags(data);
    } catch (e) {
      console.error(e);
    }
  };

  // Compose filters and fetch works
  const applyFilters = () => {
    setFilters({
      search: search.trim() || undefined,
      work_type: selectedType === "__ALL__" ? undefined : (selectedType as any),
      status: selectedStatus === "__ALL__" ? undefined : (selectedStatus as any),
      tag_ids: selectedTagIds.length === 0 ? undefined : selectedTagIds,
      sort_by: sortBy as any,
      sort_order: sortOrder,
    });
  };

  // Run filtering on triggers change
  useEffect(() => {
    applyFilters();
  }, [selectedType, selectedStatus, selectedTagIds, sortBy, sortOrder]);

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      applyFilters();
    }
  };

  const handleCreateNew = () => {
    setEditingWork(null);
    setIsEditOpen(true);
  };

  const handleEditWork = (work: WorkWithRelations) => {
    setEditingWork(work);
    setIsEditOpen(true);
  };

  const handleToggleTagGroup = (group: UniqueTagGroup) => {
    const isSelected = group.ids.some((id) => selectedTagIds.includes(id));
    setSelectedTagIds((prev) =>
      isSelected
        ? prev.filter((id) => !group.ids.includes(id))
        : Array.from(new Set([...prev, ...group.ids]))
    );
  };

  const handleClearAllFilters = () => {
    setSearch("");
    setSelectedType("__ALL__");
    setSelectedStatus("__ALL__");
    setSelectedTagIds([]);
    setFilters({});
  };

  const activeFiltersCount = 
    (selectedType !== "__ALL__" ? 1 : 0) +
    (selectedStatus !== "__ALL__" ? 1 : 0) +
    selectedTagIds.length +
    (search.trim() ? 1 : 0);

  return (
    <div className="flex flex-col h-full bg-background/25">
      {/* Search & filters toolbar */}
      <div className="flex flex-col gap-3 p-4 border-b bg-card/45 backdrop-blur flex-shrink-0 z-10 shadow-sm">
        {/* Core row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative max-w-sm flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索作品名称、大纲、主创..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyPress}
              className="pl-9 pr-9 h-9"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setFilters({ search: undefined });
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Button onClick={applyFilters} size="sm" className="h-9">搜索</Button>

          {/* Type Select */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-zinc-950"
          >
            <option value="__ALL__">全部作品类型</option>
            {WORK_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          {/* Status Select */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-zinc-950"
          >
            <option value="__ALL__">全部制作状态</option>
            {WORK_STATUSES.map((st) => (
              <option key={st.value} value={st.value}>
                {st.label}
              </option>
            ))}
          </select>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-zinc-950"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  排序：{opt.label}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            >
              {sortOrder === "desc" ? <SortDesc className="w-4 h-4" /> : <SortAsc className="w-4 h-4" />}
            </Button>
          </div>

          {/* Create Button */}
          <Button onClick={handleCreateNew} size="sm" className="h-9 gap-1.5 shadow-sm">
            <Plus className="w-4 h-4" />
            新建作品
          </Button>
        </div>

        {/* Second Row: Tags filtering and clear actions */}
        <div className="flex flex-wrap gap-2 items-start text-xs pt-1 border-t border-dashed">
          <div className="flex items-center gap-1.5 text-muted-foreground mr-1.5 font-medium shrink-0 pt-0.5">
            <Filter className="w-3.5 h-3.5" />
            <span>按标签筛选：</span>
          </div>

          <div className="flex flex-wrap gap-1.5 flex-1 min-w-[200px] transition-all">
            {visibleTagGroups.map((group) => {
              const isSelected = group.ids.some((id) => selectedTagIds.includes(id));
              return (
                <Badge
                  key={group.name}
                  variant={isSelected ? "default" : "outline"}
                  onClick={() => handleToggleTagGroup(group)}
                  className="cursor-pointer text-[10px] font-normal transition-all py-0.5 px-2 select-none"
                  style={{
                    backgroundColor: isSelected && group.color ? group.color : undefined,
                    borderColor: !isSelected && group.color ? `${group.color}40` : undefined,
                    color: !isSelected && group.color ? group.color : undefined,
                  }}
                >
                  {group.name}
                  {isSelected && <Check className="w-2.5 h-2.5 ml-0.5" />}
                </Badge>
              );
            })}

            {uniqueTagGroups.length > 16 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsTagsExpanded(!isTagsExpanded)}
                className="h-6 text-[10px] text-muted-foreground hover:text-foreground px-2 gap-1 font-normal"
              >
                {isTagsExpanded ? (
                  <>
                    收起 <ChevronUp className="w-3 h-3" />
                  </>
                ) : (
                  <>
                    展开 ({uniqueTagGroups.length}) <ChevronDown className="w-3 h-3" />
                  </>
                )}
              </Button>
            )}
          </div>

          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAllFilters}
              className="h-7 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted font-normal px-2.5 shrink-0"
            >
              清除全部筛选 ({activeFiltersCount})
            </Button>
          )}
        </div>
      </div>

      {/* Main Works List area */}
      <ScrollArea className="flex-1">
        <div className="p-6 h-full min-h-[300px]" ref={gridRef}>
          {loading ? (
            /* Premium loading grid Skeletons */
            <div 
              className="grid gap-6"
              style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
            >
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex flex-col gap-3 rounded-lg border p-4 bg-card">
                  <Skeleton className="aspect-video w-full rounded animate-pulse" />
                  <Skeleton className="h-5 w-3/4 animate-pulse mt-1" />
                  <Skeleton className="h-4 w-5/6 animate-pulse" />
                  <div className="flex justify-between items-center pt-2 mt-auto border-t">
                    <Skeleton className="h-3 w-1/3 animate-pulse" />
                    <Skeleton className="h-3.5 w-1/4 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : works.length === 0 ? (
            /* Empty state indicator */
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground max-w-md mx-auto text-center">
              <Film className="w-16 h-16 mb-4 opacity-30 animate-bounce duration-1000" />
              <h3 className="font-semibold text-lg text-foreground/80">
                {activeFiltersCount > 0 ? "未找到匹配作品" : "暂无作品集记录"}
              </h3>
              <p className="text-sm mt-1.5 leading-relaxed">
                {activeFiltersCount > 0
                  ? "当前筛选条件过于严苛，请尝试放宽关键字或清除分类、状态、标签筛选器再次检索。"
                  : "这里可以对电视剧、电影、动漫、小说等任何创作类型的作品集进行一站式角色画像及参演设定归档。"}
              </p>
              {activeFiltersCount > 0 ? (
                <Button variant="outline" size="sm" onClick={handleClearAllFilters} className="mt-5 shadow-sm">
                  清除所有筛选
                </Button>
              ) : (
                <Button size="sm" onClick={handleCreateNew} className="mt-5 shadow-sm gap-1.5">
                  <Plus className="w-4.5 h-4.5" />
                  新建首个作品
                </Button>
              )}
            </div>
          ) : (
            /* Works Grid */
            <div 
              className="grid gap-6"
              style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
            >
              {works.map((work) => (
                <WorkCard
                  key={work.id}
                  work={work}
                  onEdit={handleEditWork}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Save or Create Work Edit Modal Dialog */}
      <WorkEditModal
        work={editingWork}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
      />
    </div>
  );
}
