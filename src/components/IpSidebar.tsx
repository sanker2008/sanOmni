import { useState, useEffect } from "react";
import { type IpAsset } from "@/stores";
import { ipApi } from "@/services/tauri";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Users, ChevronRight, Archive, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "@/hooks/useToast";
import { ipImageApi } from "@/services/tauri";
import { useUIStore } from "@/stores";

interface IpSidebarProps {
  onIpSelect: (ipId: string | null) => void;
  selectedIpId: string | null;
  imageCounts?: Record<string, number>;
  totalCount?: number;
  onRefreshImages?: () => void;
}

// 自动拷贝并归档头像到当前 IP 形象
const autoArchiveAvatar = async (avatarPath: string, ipId: string) => {
  try {
    const { appDataDir, join } = await import("@tauri-apps/api/path");
    const { copyFile, exists, mkdir, stat } = await import("@tauri-apps/plugin-fs");
    
    const { settings } = useUIStore.getState();

    // 1. 解析待整理收件箱路径
    let inboxDir: string;
    if (settings.customIpInboxPath) {
      inboxDir = settings.customIpInboxPath;
    } else {
      const appDir = await appDataDir();
      inboxDir = await join(appDir, "ip_inbox");
    }

    if (!(await exists(inboxDir))) {
      await mkdir(inboxDir, { recursive: true });
    }

    // 2. 解析归档库路径
    let libraryPath: string;
    if (settings.customIpArchivedPath) {
      libraryPath = settings.customIpArchivedPath;
    } else {
      libraryPath = await appDataDir();
    }
    const namingTemplate = settings.ipNamingTemplate || "{ip}-{date}-{index}";

    const fileName = avatarPath.split(/[/\\]/).pop() || "avatar.png";

    let fileSize = 0;
    try {
      const fileMeta = await stat(avatarPath);
      fileSize = fileMeta.size;
    } catch (error) {
      console.error(`Failed to get metadata for ${avatarPath}:`, error);
    }

    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}_${fileName}`;
    const targetPath = await join(inboxDir, uniqueFileName);

    // 复制头像文件到收件箱
    await copyFile(avatarPath, targetPath);

    // 3. 导入至图库收件箱并关联 IP
    const importResult = await ipImageApi.import({
      file_path: targetPath,
      file_name: fileName,
      file_size: fileSize,
      ip_id: ipId,
      tags: ["头像"],
    });

    // 4. 自动进行图库归档
    try {
      await ipImageApi.archive([importResult.id], libraryPath, namingTemplate);
    } catch (archiveError) {
      console.error(`自动归档头像图片 ${importResult.id} 失败:`, archiveError);
    }
  } catch (error) {
    console.error("自动归档头像失败:", error);
  }
};

export default function IpSidebar({ onIpSelect, selectedIpId, imageCounts, totalCount, onRefreshImages }: IpSidebarProps) {
  const [ips, setIps] = useState<IpAsset[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // 表单弹窗状态
  const [isIpModalOpen, setIsIpModalOpen] = useState(false);
  const [ipName, setIpName] = useState("");
  const [ipPath, setIpPath] = useState("");
  const [ipInspiration, setIpInspiration] = useState("");
  const [ipDescription, setIpDescription] = useState("");
  const [ipAvatarPath, setIpAvatarPath] = useState<string | null>(null);

  useEffect(() => {
    loadIps();
  }, []);

  const loadIps = async () => {
    try {
      setIsLoading(true);
      const data = await ipApi.getAll();
      setIps(data);
    } catch (error) {
      console.error("Failed to load IPs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 打开创建 IP 弹窗
  const handleOpenCreateIp = () => {
    setIpName("");
    setIpPath("");
    setIpInspiration("");
    setIpDescription("");
    setIpAvatarPath(null);
    setIsIpModalOpen(true);
  };

  // 动作：使用本地文件选择器选择 IP 头像
  const handleSelectAvatarPath = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "webp", "gif"]
        }]
      });
      if (selected && typeof selected === "string") {
        setIpAvatarPath(selected);
      }
    } catch (e) {
      console.error("选择头像失败:", e);
    }
  };

  // 保存 IP 资产
  const handleSaveIp = async () => {
    if (!ipName.trim()) {
      toast({ title: "请输入 IP 名字" });
      return;
    }
    // 自动生成并清洗 path：转为小写，仅限小写字母、数字、横杠、下划线组合，空格转连字符，其余特殊字符直接过滤
    const sanitizePath = (str: string) => {
      return str
        .trim()
        .toLowerCase()
        .replace(/[\s\/\\]+/g, "-")
        .replace(/[^a-z0-9\-_]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
    };
    const finalPath = sanitizePath(ipPath || ipName);
    if (!finalPath) {
      toast({ title: "保存失败", description: "路径标识无可用的合法字符（限小写字母、数字、横线、下划线组合）", variant: "destructive" });
      return;
    }
    try {
      const created = await ipApi.create(
        ipName,
        finalPath,
        ipInspiration || undefined,
        ipDescription || undefined,
        ipAvatarPath || undefined
      );

      // 如果上传了头像，自动归档该头像图片到新创建的 IP 形象下
      if (ipAvatarPath) {
        await autoArchiveAvatar(ipAvatarPath, created.id);
      }

      toast({ title: "创建成功", description: "IP 形象已成功创建，头像已自动归档" });
      setIsIpModalOpen(false);
      await loadIps();
      onIpSelect(created.id);
      onRefreshImages?.();
    } catch (e) {
      console.error(e);
      toast({ title: "保存失败", description: "保存数据时发生错误", variant: "destructive" });
    }
  };

  const filteredIps = ips.filter(ip => 
    ip.name.toLowerCase().includes(search.toLowerCase()) ||
    (ip.description && ip.description.toLowerCase().includes(search.toLowerCase())) ||
    (ip.inspiration && ip.inspiration.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="w-80 border-r flex flex-col bg-muted/40 h-full overflow-hidden">
      <div className="p-4 border-b flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            IP 资产库
          </h2>
          <Button size="icon" variant="ghost" onClick={handleOpenCreateIp} className="h-8 w-8">
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索 IP 名称/设定/故事..."
            className="pl-9 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      
      <ScrollArea className="flex-1 p-2">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2 text-center">
            <Users className="w-8 h-8 opacity-30 animate-pulse" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {/* 全部图片 */}
            <div
              onClick={() => onIpSelect(null)}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200",
                selectedIpId === null
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "hover:bg-accent/60 text-card-foreground"
              )}
            >
              <div className="w-12 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0 border flex items-center justify-center">
                <Archive className="w-6 h-6 opacity-60" />
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm truncate">全部图片</h3>
                <p
                  className={cn(
                    "text-xs truncate",
                    selectedIpId === null ? "text-primary-foreground/75" : "text-muted-foreground"
                  )}
                >
                  查看所有已归档的图片资产
                </p>
              </div>

              {typeof totalCount === "number" && (
                <Badge 
                  variant="outline" 
                  className={cn(
                    "font-normal text-xs px-1.5 py-0.2 min-w-[20px] h-5 justify-center border-none flex-shrink-0",
                    selectedIpId === null ? "bg-background/50 text-foreground" : "bg-muted/50 text-muted-foreground"
                  )}
                >
                  {totalCount}
                </Badge>
              )}

              <ChevronRight className={cn("w-4 h-4 flex-shrink-0 opacity-60", selectedIpId === null && "text-primary-foreground")} />
            </div>

            {/* IP 形象列表 */}
            {filteredIps.length === 0 && search && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2 text-center">
                <Users className="w-8 h-8 opacity-30" />
                <span className="text-sm">暂无匹配 IP 形象</span>
              </div>
            )}

            {filteredIps.map((ip) => {
              const isSelected = selectedIpId === ip.id;
              const count = imageCounts?.[ip.id] || 0;
              return (
                <div
                  key={ip.id}
                  onClick={() => onIpSelect(ip.id)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200",
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "hover:bg-accent/60 text-card-foreground"
                  )}
                >
                  {/* 头像 */}
                  <div className="w-12 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0 border">
                    {ip.avatar_path ? (
                      <img
                        src={convertFileSrc(ip.avatar_path)}
                        alt={ip.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Users className="w-6 h-6 opacity-40" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate">{ip.name}</h3>
                    <p
                      className={cn(
                        "text-xs truncate",
                        isSelected ? "text-primary-foreground/75" : "text-muted-foreground"
                      )}
                    >
                      {ip.inspiration || ip.description || "无详细信息"}
                    </p>
                  </div>

                  {imageCounts && (
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "font-normal text-xs px-1.5 py-0.2 min-w-[20px] h-5 justify-center border-none flex-shrink-0",
                        isSelected ? "bg-background/50 text-foreground" : "bg-muted/50 text-muted-foreground"
                      )}
                    >
                      {count}
                    </Badge>
                  )}

                  <ChevronRight className={cn("w-4 h-4 flex-shrink-0 opacity-60", isSelected && "text-primary-foreground")} />
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* ==================== 弹窗: IP 形象创建 ==================== */}
      <Dialog open={isIpModalOpen} onOpenChange={setIsIpModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>新建 IP 形象</DialogTitle>
            <DialogDescription>编辑 IP 形象的核心设定，关联头像图片。</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-4">
              {/* 头像预览 */}
              <div className="w-16 h-16 rounded-md overflow-hidden bg-muted border relative flex-shrink-0 flex items-center justify-center">
                {ipAvatarPath ? (
                  <img
                    src={convertFileSrc(ipAvatarPath)}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Users className="w-8 h-8 opacity-30" />
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAvatarPath}
              >
                选择本地头像
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">名字 *</label>
              <Input
                placeholder="例如: Luna"
                value={ipName}
                onChange={(e) => setIpName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">路径标识</label>
              <Input
                placeholder="例如: luna（留空则自动生成）"
                value={ipPath}
                onChange={(e) => setIpPath(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))}
              />
              <p className="text-xs text-muted-foreground">用于文件夹命名和目录匹配，只允许小写字母、数字、连字符和下划线</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">灵感来源 / 背景故事</label>
              <textarea
                placeholder="输入该 IP 角色的创作灵感、灵感来源或是核心背景设定..."
                value={ipInspiration}
                onChange={(e) => setIpInspiration(e.target.value)}
                className="min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">特征设定 / 外观性格描述</label>
              <textarea
                placeholder="在此细化角色的外观发色、眼睛色彩、性格特质等具体设定细节..."
                value={ipDescription}
                onChange={(e) => setIpDescription(e.target.value)}
                className="min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsIpModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveIp}>确认保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
