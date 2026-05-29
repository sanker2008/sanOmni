import { type WorkWithRelations, useWorksStore } from "@/stores";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Film, Edit, Trash2, Calendar, User } from "lucide-react";
import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "@/hooks/useToast";

interface WorkCardProps {
  work: WorkWithRelations;
  onEdit: (work: WorkWithRelations) => void;
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

export default function WorkCard({ work, onEdit }: WorkCardProps) {
  const { selectWork, deleteWork } = useWorksStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleCardClick = () => {
    selectWork(work);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteWork(work.id);
      toast({
        title: "删除成功",
        description: `作品《${work.name}》已成功删除`,
      });
    } catch (e) {
      console.error(e);
      toast({
        title: "删除失败",
        description: "无法删除该作品，请重试",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <Card
        onClick={handleCardClick}
        className="group cursor-pointer overflow-hidden border bg-card/65 backdrop-blur hover:shadow-xl hover:border-primary/40 transition-all duration-300 flex flex-col relative h-[320px]"
      >
        {/* Cover image / Placeholder */}
        <div className="aspect-[16/9] w-full bg-muted border-b relative overflow-hidden flex items-center justify-center flex-shrink-0">
          {work.cover_path ? (
            <img
              src={convertFileSrc(work.cover_path)}
              alt={work.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
          ) : (
            <Film className="w-12 h-12 text-muted-foreground opacity-30 group-hover:scale-110 transition-transform duration-500" />
          )}

          {/* Floating actions */}
          <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 rounded-full shadow bg-background/85 hover:bg-background"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(work);
              }}
            >
              <Edit className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="icon"
              variant="destructive"
              className="h-8 w-8 rounded-full shadow opacity-90 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(true);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Cover Badges */}
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-1 z-10">
            <Badge variant="secondary" className="bg-background/90 text-foreground text-[10px] py-0.5 px-2 font-medium">
              {WORK_TYPE_LABELS[work.work_type] || work.work_type}
            </Badge>
            {work.status && (
              <Badge variant="outline" className={`text-[10px] py-0.5 px-2 border font-medium ${STATUS_COLORS[work.status] || ""}`}>
                {WORK_STATUS_LABELS[work.status]}
              </Badge>
            )}
          </div>
        </div>

        {/* Content details */}
        <CardContent className="p-4 flex-1 flex flex-col justify-between">
          <div className="space-y-1.5">
            <h3 className="font-semibold text-base line-clamp-1 group-hover:text-primary transition-colors">
              {work.name}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed min-h-[32px]">
              {work.description || "暂无相关作品的简要介绍。"}
            </p>
          </div>

          <div className="pt-3 border-t flex flex-col gap-1 text-[11px] text-muted-foreground flex-shrink-0">
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 opacity-60" />
              <span>{work.release_date || "发布日期未知"}</span>
            </div>
            {work.director_author && (
              <div className="flex items-center gap-1">
                <User className="w-3.5 h-3.5 opacity-60" />
                <span className="truncate">导演/作者：{work.director_author}</span>
              </div>
            )}
            
            {/* Tag Badges list */}
            {work.tags && work.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2 overflow-hidden max-h-[22px]">
                {work.tags.slice(0, 3).map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="outline"
                    className="text-[9px] font-normal py-0 px-1.5"
                    style={{ color: tag.color, borderColor: tag.color ? `${tag.color}40` : undefined }}
                  >
                    {tag.name}
                  </Badge>
                ))}
                {work.tags.length > 3 && (
                  <span className="text-[9px] text-muted-foreground">+{work.tags.length - 3}</span>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-primary font-medium mt-1">
              <span>{work.character_count} 个角色</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="确认删除作品？"
        description={`确定要删除作品《${work.name}》吗？这将软删除该作品，且与其关联的全部角色也会随之删除，但磁盘上的文件将被妥善保留。`}
        confirmText={isDeleting ? "正在删除..." : "确认删除"}
        cancelText="取消"
        variant="destructive"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}
