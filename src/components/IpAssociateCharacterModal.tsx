import { useEffect, useState } from "react";
import { type CharacterWithRelations, useCharactersStore } from "@/stores";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { Search, Loader2 } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";

interface IpAssociateCharacterModalProps {
  ipId: string;
  ipName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function IpAssociateCharacterModal({ ipId, ipName, open, onOpenChange, onSuccess }: IpAssociateCharacterModalProps) {
  const { toast } = useToast();
  const [characters, setCharacters] = useState<CharacterWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadCharacters();
      setSelectedIds(new Set());
      setSearchQuery("");
    }
  }, [open]);

  const loadCharacters = async () => {
    setIsLoading(true);
    try {
      // Import here to avoid circular dependencies or initialization issues
      const { invoke } = await import("@tauri-apps/api/core");
      const list: CharacterWithRelations[] = await invoke("get_all_characters");
      // Filter out characters that are already associated with this IP
      setCharacters(list.filter(c => c.character.ip_id !== ipId));
    } catch (error) {
      console.error("Failed to load all characters:", error);
      toast({
        title: "获取角色列表失败",
        description: typeof error === "string" ? error : "未知错误",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (selectedIds.size === 0) return;
    
    setIsSaving(true);
    try {
      const { updateCharacter } = useCharactersStore.getState();
      const selectedCharacters = characters.filter(c => selectedIds.has(c.character.id));
      
      for (const char of selectedCharacters) {
        await updateCharacter(char.character.id, {
          name: char.character.name,
          character_type: char.character.character_type,
          description: char.character.description,
          appearance_info: char.character.appearance_info,
          ip_id: ipId,
          ip_relation_note: char.character.ip_relation_note,
        });
      }
      
      toast({
        title: "关联成功",
        description: `成功将 ${selectedIds.size} 个角色关联至该 IP`,
      });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to associate characters:", error);
      toast({
        title: "关联失败",
        description: typeof error === "string" ? error : error?.message || "未知错误",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const filteredCharacters = characters.filter(c => 
    c.character.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (c.work_name && c.work_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>关联已有角色至：{ipName}</DialogTitle>
          <DialogDescription>
            从所有作品中选择已有角色并将其关联到当前 IP。
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索角色名称或作品名称..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[300px] border rounded-md p-2">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              正在加载...
            </div>
          ) : filteredCharacters.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <p>没有找到可关联的角色</p>
              {searchQuery && <p className="text-sm mt-1">请尝试更换搜索词</p>}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredCharacters.map(char => {
                const images = char.character.image_paths ? JSON.parse(char.character.image_paths) : [];
                const firstImage = images.length > 0 ? convertFileSrc(images[0]) : null;
                const isSelected = selectedIds.has(char.character.id);
                
                return (
                  <div 
                    key={char.character.id}
                    onClick={() => toggleSelection(char.character.id)}
                    className={`
                      relative flex items-center p-2 gap-3 border rounded-lg cursor-pointer transition-colors
                      ${isSelected ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'}
                    `}
                  >
                    <div className="w-12 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
                      {firstImage ? (
                        <img src={firstImage} alt={char.character.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                          无图
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="font-medium text-sm truncate" title={char.character.name}>
                        {char.character.name}
                      </span>
                      <span className="text-xs text-muted-foreground truncate" title={char.work_name || "未知作品"}>
                        {char.work_name || "未知作品"}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                        <div className="w-1.5 h-1.5 bg-primary-foreground rounded-full" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            取消
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving || selectedIds.size === 0}
          >
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            确认关联 ({selectedIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
