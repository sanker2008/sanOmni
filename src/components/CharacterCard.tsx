import { useState } from "react";
import { type CharacterWithRelations, useCharactersStore, useUIStore } from "@/stores";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { GripVertical, Edit, Trash2, ChevronDown, ChevronUp, Star, HelpCircle, Film, Sparkles, FolderOpen, Minimize, Loader2 } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";

import { convertFileToWebp, convertFileToPng } from "@/lib/webpConverter";

interface CharacterCardProps {
  character: CharacterWithRelations;
  onEdit: (character: CharacterWithRelations) => void;
  onIpSelect?: (ipId: string | null) => void;
}

const CHAR_TYPE_LABELS: Record<string, string> = {
  protagonist: "主角",
  supporting: "配角",
  antagonist: "反派",
  guest: "客串",
  cameo: "彩蛋",
  other: "其他",
};

const CHAR_TYPE_COLORS: Record<string, string> = {
  protagonist: "bg-amber-500/10 text-amber-500 border-amber-500/20 dark:bg-amber-500/15",
  supporting: "bg-blue-500/10 text-blue-500 border-blue-500/20 dark:bg-blue-500/15",
  antagonist: "bg-red-500/10 text-red-500 border-red-500/20 dark:bg-red-500/15",
  guest: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 dark:bg-emerald-500/15",
  cameo: "bg-purple-500/10 text-purple-500 border-purple-500/20 dark:bg-purple-500/15",
  other: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20 dark:bg-zinc-500/15",
};

export default function CharacterCard({ character, onEdit, onIpSelect }: CharacterCardProps) {
  const { deleteCharacter, uploadImages } = useCharactersStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [convertingToWebp, setConvertingToWebp] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const { toast } = useToast();
  const settings = useUIStore((state) => state.settings);
  const showFullImage = settings.showFullImage ?? false;

  const imagePaths: string[] = (() => {
    if (character.image_paths) {
      try {
        const parsed = JSON.parse(character.image_paths);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [];
  })();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteCharacter(character.id);
      toast({
        title: "角色删除成功",
        description: `角色“${character.name}”已从列表中移除`,
      });
    } catch (e) {
      console.error(e);
      toast({
        title: "删除失败",
        description: "无法删除该角色，请重试",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleConvertFormat = async (e: React.MouseEvent, format: 'webp' | 'png') => {
    e.stopPropagation();
    if (convertingToWebp || !character.image_paths || character.image_paths === '[]') return;
    setConvertingToWebp(true);
    toast({ title: `正在转为 ${format.toUpperCase()}`, description: "图片优化中..." });
    try {
      const paths = JSON.parse(character.image_paths);
      if (Array.isArray(paths)) {
        const finalFiles: File[] = [];
        for (const p of paths) {
          const response = await fetch(convertFileSrc(p));
          const blob = await response.blob();
          const file = new File([blob], p.split(/[\\/]/).pop() || 'image.png', { type: blob.type });
          const newFile = format === 'webp' ? await convertFileToWebp(file) : await convertFileToPng(file);
          finalFiles.push(newFile);
        }
        await uploadImages(character.id, character.work_id, finalFiles);
        toast({ title: "✓ 转换成功", description: `已成功转为 ${format.toUpperCase()} 格式` });
      }
    } catch (error: any) {
      toast({ title: "转换失败", description: String(error), variant: "destructive" });
    } finally {
      setConvertingToWebp(false);
    }
  };

  const handleIpClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (character.ip_id && onIpSelect) {
      onIpSelect(character.ip_id);
    }
  };

  return (
    <>
      <Card className="hover:shadow-md transition-shadow duration-300 border bg-card/65 backdrop-blur relative overflow-hidden group">
        <CardContent className="p-4 flex gap-4 items-start select-none">
          {/* Drag Handle */}
          <div className="self-center cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded text-muted-foreground opacity-30 group-hover:opacity-100 transition-opacity">
            <GripVertical className="w-4 h-4" />
          </div>

          {/* Character Photo / Carousel */}
          <div className="w-16 h-20 bg-muted border rounded overflow-hidden flex-shrink-0 flex items-center justify-center relative bg-zinc-100 dark:bg-zinc-800 group/img">
            {imagePaths.length > 0 ? (
              <>
                <img
                  src={convertFileSrc(imagePaths[carouselIndex])}
                  alt={character.name}
                  className={`w-full h-full ${showFullImage ? "object-contain bg-background" : "object-cover"}`}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-white hover:text-primary hover:bg-black/50"
                    onClick={(e) => {
                      e.stopPropagation();
                      import("@/lib/pathUtils").then(({ revealFileInFolder }) => {
                        revealFileInFolder(imagePaths[carouselIndex]);
                      });
                    }}
                    title="打开所在目录"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                  </Button>
                  {!imagePaths[carouselIndex].toLowerCase().endsWith('.webp') && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-white hover:text-primary hover:bg-black/50"
                      onClick={(e) => handleConvertFormat(e as any, 'webp')}
                      title="转为 WebP"
                      disabled={convertingToWebp}
                    >
                      {convertingToWebp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Minimize className="w-3.5 h-3.5" />}
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <HelpCircle className="w-6 h-6 text-muted-foreground opacity-30" />
            )}
            {imagePaths.length > 1 && isExpanded && (
              <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1 rounded-sm">
                {carouselIndex + 1}/{imagePaths.length}
              </div>
            )}
          </div>

          {/* Mid core info */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base truncate">{character.name}</h3>
              {character.character_type && (
                <Badge
                  variant="outline"
                  className={`text-[10px] font-normal px-2 py-0.2 shrink-0 ${
                    CHAR_TYPE_COLORS[character.character_type] || ""
                  }`}
                >
                  {CHAR_TYPE_LABELS[character.character_type] || character.character_type}
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-muted-foreground">
              {character.appearance_info && (
                <div className="flex items-center gap-1">
                  <Film className="w-3 h-3 opacity-60" />
                  <span>出场：{character.appearance_info}</span>
                </div>
              )}
              
              {/* Linked Actor IP Asset */}
              {character.ip_id && (
                <div
                  onClick={handleIpClick}
                  className="flex items-center gap-1.5 bg-primary/5 hover:bg-primary/10 border border-primary/20 hover:border-primary/45 rounded-full px-2 py-0.5 text-[10px] text-primary font-medium cursor-pointer transition-all shrink-0 shadow-sm"
                >
                  {character.ip_avatar_path ? (
                    <img
                      src={convertFileSrc(character.ip_avatar_path)}
                      alt={character.ip_name}
                      className="w-3.5 h-3.5 rounded-full object-cover border-none"
                    />
                  ) : (
                    <Star className="w-2.5 h-2.5 fill-current" />
                  )}
                  <span>演员：{character.ip_name}</span>
                </div>
              )}
            </div>

            {/* Character short description preview */}
            {!isExpanded && character.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 leading-relaxed pt-1.5 border-t border-dashed">
                {character.description}
              </p>
            )}
          </div>

          {/* Actions pane */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(character)}
            >
              <Edit className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
            {character.description || imagePaths.length > 1 ? (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            ) : null}
          </div>
        </CardContent>

        {/* Extended information pane */}
        {isExpanded && (
          <div className="px-14 pb-4 pt-1 space-y-4 border-t border-dashed border-muted bg-muted/10">
            {/* Carousel navigation */}
            {imagePaths.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-primary" />
                  精美剧照 / 设定图（共 {imagePaths.length} 张）
                </p>
                <div className="flex gap-2 overflow-x-auto py-1">
                  {imagePaths.map((path, idx) => (
                    <div
                      key={idx}
                      onClick={() => setCarouselIndex(idx)}
                      className={`relative w-14 h-16 bg-muted rounded overflow-hidden cursor-pointer border-2 transition-all ${
                        carouselIndex === idx ? "border-primary scale-105 shadow-sm" : "border-transparent opacity-70 hover:opacity-100"
                      }`}
                    >
                      <img src={convertFileSrc(path)} className={`w-full h-full ${showFullImage ? "object-contain bg-background" : "object-cover"}`} alt={`Thumb ${idx}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* IP relation note if exists */}
            {character.ip_id && character.ip_relation_note && (
              <div className="text-xs border rounded-lg p-2.5 bg-primary/5 border-primary/10">
                <span className="font-semibold text-primary">出演关联说明：</span>
                <span className="text-foreground/80">{character.ip_relation_note}</span>
              </div>
            )}

            {/* Description */}
            {character.description && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">角色小传 / 性格特征</p>
                <p className="text-xs text-foreground/80 leading-relaxed bg-background/50 p-3 rounded-lg border">
                  {character.description}
                </p>
              </div>
            )}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="确认删除登场角色？"
        description={`确定要从作品中删除登场角色“${character.name}”吗？此操作会从数据库中软删除该角色并自动解除其与 IP 的演员绑定关系，磁盘文件也会相应清理。`}
        confirmText={isDeleting ? "正在删除..." : "确认删除"}
        cancelText="取消"
        variant="destructive"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}
