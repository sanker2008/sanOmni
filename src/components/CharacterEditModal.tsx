import { useEffect, useState, useRef } from "react";
import { type CharacterWithRelations, useCharactersStore, useUIStore, type IpAsset } from "@/stores";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { Upload, X, Star } from "lucide-react";

interface CharacterEditModalProps {
  workId: string;
  character: CharacterWithRelations | null; // null for creating
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CHARACTER_TYPES = [
  { value: "protagonist", label: "主角" },
  { value: "supporting", label: "配角" },
  { value: "antagonist", label: "反派" },
  { value: "guest", label: "客串" },
  { value: "cameo", label: "彩蛋" },
  { value: "other", label: "其他" },
];

export default function CharacterEditModal({ workId, character, open, onOpenChange }: CharacterEditModalProps) {
  const { createCharacter, updateCharacter, uploadImages } = useCharactersStore();
  const { toast } = useToast();
  const settings = useUIStore((state) => state.settings);
  const showFullImage = settings.showFullImage ?? false;
  
  const [name, setName] = useState("");
  const [charType, setCharType] = useState("protagonist");
  const [appearanceInfo, setAppearanceInfo] = useState("");
  const [description, setDescription] = useState("");
  
  // Associated Actor IP
  const [selectedIpId, setSelectedIpId] = useState<string>("");
  const [ipRelationNote, setIpRelationNote] = useState("");
  const [ips, setIps] = useState<IpAsset[]>([]);

  // Images states
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isSaving, setIsSaving] = useState(false);

  // Fetch all system IP assets
  useEffect(() => {
    if (open) {
      loadIps();
    }
  }, [open]);

  const loadIps = async () => {
    try {
      const { ipApi } = await import("@/services/tauri");
      const list = await ipApi.getAll();
      setIps(list.filter(ip => ip.id !== "unknown")); // Hide the unknown fallback in select
    } catch (e) {
      console.error("Failed to load IPs in character edit:", e);
    }
  };

  // Populate form on edit mode
  useEffect(() => {
    if (open) {
      if (character) {
        setName(character.name);
        setCharType(character.character_type || "protagonist");
        setAppearanceInfo(character.appearance_info || "");
        setDescription(character.description || "");
        setSelectedIpId(character.ip_id || "");
        setIpRelationNote(character.ip_relation_note || "");
        
        // Populate existing images
        if (character.image_paths) {
          try {
            const parsed = JSON.parse(character.image_paths);
            if (Array.isArray(parsed)) {
              setPreviewUrls(parsed.map(path => convertFileSrc(path)));
            } else {
              setPreviewUrls([]);
            }
          } catch {
            setPreviewUrls([]);
          }
        } else {
          setPreviewUrls([]);
        }
        setSelectedFiles([]);
      } else {
        // Reset for creating
        setName("");
        setCharType("protagonist");
        setAppearanceInfo("");
        setDescription("");
        setSelectedIpId("");
        setIpRelationNote("");
        setPreviewUrls([]);
        setSelectedFiles([]);
      }
    }
  }, [open, character]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newFiles = Array.from(files);
      setSelectedFiles((prev) => [...prev, ...newFiles]);
      
      const newUrls = newFiles.map(file => URL.createObjectURL(file));
      setPreviewUrls((prev) => [...prev, ...newUrls]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveImage = (index: number) => {
    setPreviewUrls((prev) => prev.filter((_, idx) => idx !== index));
    
    // Calculate if it's from the new files
    // If we are editing, some files are already on the backend, so selectedFiles has fewer items than previewUrls
    const existingCount = character?.image_paths ? JSON.parse(character.image_paths).length : 0;
    
    if (index >= existingCount) {
      const fileIndex = index - existingCount;
      setSelectedFiles((prev) => prev.filter((_, idx) => idx !== fileIndex));
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "验证失败",
        description: "角色名称为必填项",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      let savedChar;
      
      const payload = {
        name: name.trim(),
        character_type: charType || null,
        appearance_info: appearanceInfo.trim() || null,
        description: description.trim() || null,
        ip_id: selectedIpId || null,
        ip_relation_note: ipRelationNote.trim() || null,
      };

      if (character) {
        // Edit mode
        savedChar = await updateCharacter(character.id, payload);
        
        // Overwrite images if any new files are uploaded
        // (Tauri character image uploads are single complete batches)
        if (selectedFiles.length > 0) {
          await uploadImages(character.id, workId, selectedFiles);
        }
        
        toast({
          title: "更新成功",
          description: `登场角色“${name}”设定已成功更新`,
        });
      } else {
        // Create mode
        savedChar = await createCharacter({
          work_id: workId,
          ...payload
        });

        // Upload images if any
        if (selectedFiles.length > 0) {
          await uploadImages(savedChar.id, workId, selectedFiles);
        }

        toast({
          title: "创建成功",
          description: `登场角色“${name}”已成功录入作品`,
        });
      }

      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast({
        title: "保存失败",
        description: "保存角色信息时发生错误，请重试",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border shadow-xl">
        <DialogHeader>
          <DialogTitle>{character ? "编辑登场角色设定" : "添加登场角色"}</DialogTitle>
          <DialogDescription>
            编辑角色类型、出场信息，并可以将其绑定到系统内已归档的演员 IP 形象。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">角色名称 *</label>
              <Input
                placeholder="例如: Luna"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">角色类型</label>
              <select
                value={charType}
                onChange={(e) => setCharType(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-zinc-950"
              >
                {CHARACTER_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">出场信息描述</label>
            <Input
              placeholder="例如: 第一季 01-12 集 / 第三章 核心登场"
              value={appearanceInfo}
              onChange={(e) => setAppearanceInfo(e.target.value)}
            />
          </div>

          {/* Actor IP back-linking settings */}
          <div className="border rounded-xl p-4 bg-primary/5 border-primary/10 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-primary font-medium text-xs">
              <Star className="w-4 h-4 fill-current" />
              <span>演员 IP 联动绑定（可选）</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-primary/80">选择演员 IP 形象</label>
                <select
                  value={selectedIpId}
                  onChange={(e) => setSelectedIpId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-primary/20 bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-zinc-950"
                >
                  <option value="">-- 纯作品角色，不绑定任何 IP 形象 --</option>
                  {ips.map((ip) => (
                    <option key={ip.id} value={ip.id}>
                      {ip.name} ({ip.path})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-primary/80">出演关联说明</label>
                <Input
                  placeholder="例如: 扮演主角 Luna，提供全剧台词与核心表情动作"
                  value={ipRelationNote}
                  onChange={(e) => setIpRelationNote(e.target.value)}
                  disabled={!selectedIpId}
                  className="bg-background border-primary/20"
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">角色小传 / 性格故事简介</label>
            <textarea
              placeholder="简要录入该角色的背景故事、主要特征与性格性格等核心设定描述..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-zinc-950"
            />
          </div>

          {/* Photos Upload & Previews */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground">剧照 / 设定图图片管理（支持多图）</label>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              multiple
              className="hidden"
            />

            <div className="flex flex-wrap gap-3 items-center">
              {/* Uploder card */}
              <div
                onClick={triggerFileSelect}
                className="w-20 h-24 border-2 border-dashed border-muted-foreground/35 rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all text-muted-foreground"
              >
                <Upload className="w-5 h-5 opacity-60" />
                <span className="text-[9px] font-medium text-center px-1">上传大图</span>
              </div>

              {/* Previews lists */}
              {previewUrls.map((url, idx) => (
                <div key={idx} className="w-20 h-24 rounded-lg overflow-hidden border relative group bg-background flex items-center justify-center shadow-sm shrink-0">
                  <img src={url} className={`w-full h-full ${showFullImage ? "object-contain bg-background/50" : "object-cover"}`} alt={`Preview ${idx}`} />
                  <button
                    onClick={() => handleRemoveImage(idx)}
                    className="absolute top-1 right-1 bg-black/60 hover:bg-black/90 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "正在保存..." : "确认保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
