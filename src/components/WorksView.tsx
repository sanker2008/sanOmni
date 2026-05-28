import { useEffect, useState } from "react";
import { Plus, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWorksStore } from "@/stores";
import { getWorks } from "@/services/tauri";
import { useToast } from "@/hooks/useToast";

export function WorksView() {
  const { works, setWorks, filters, setFilters, loading, setLoading } = useWorksStore();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchWorks();
  }, [filters]);

  const fetchWorks = async () => {
    setLoading(true);
    try {
      const data = await getWorks(filters);
      setWorks(data);
    } catch (error) {
      console.error("Failed to fetch works:", error);
      toast({
        title: "加载失败",
        description: "无法加载作品列表",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setFilters({ search: searchQuery });
  };

  return (
    <div className="flex flex-col h-full">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-4 p-4 border-b">
        <Input
          placeholder="搜索作品..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="max-w-sm"
        />
        <Button onClick={handleSearch}>搜索</Button>
        <div className="flex-1" />
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          新建作品
        </Button>
      </div>

      {/* 作品列表 */}
      <ScrollArea className="flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">加载中...</p>
          </div>
        ) : works.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Film className="w-16 h-16 mb-4" />
            <p>暂无作品</p>
            <p className="text-sm">点击"新建作品"开始创建</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {works.map((work) => (
              <div
                key={work.id}
                className="border rounded-lg p-4 hover:shadow-lg transition-shadow cursor-pointer"
              >
                <div className="aspect-video bg-muted rounded mb-2 flex items-center justify-center">
                  <Film className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold truncate">{work.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {work.character_count} 个角色
                </p>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
