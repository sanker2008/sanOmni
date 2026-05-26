import { useState, useEffect, useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Users,
  Search,
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  Link,
  ChevronRight,
  ChevronLeft,
  BookOpen,
  Image as ImageIcon,
  Smile,
  Copy,
  PlusCircle,
  ExternalLink,
  ZoomIn,
  X,
  Loader2,
} from "lucide-react";
import { useUIStore, type IpAsset, type IpAssetDetail, type IpStickerPack, type IpStickerPackPlatform } from "@/stores";
import { ipApi, geminiWatermarkApi, watermarkApi } from "@/services/tauri";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/useToast";

export default function IPManagementView() {
  const { selectedIpId, setSelectedIpId, settings } = useUIStore();
  const showFullImage = settings?.showFullImage ?? false;

  // 大图查看器状态
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number>(-1);
  const [imageTimestamp, setImageTimestamp] = useState<number>(Date.now());
  const [isWatermarkModalOpen, setIsWatermarkModalOpen] = useState(false);
  const [isProcessingWatermark, setIsProcessingWatermark] = useState(false);
  const [activeWatermarkPath, setActiveWatermarkPath] = useState<string | null>(null);

  // 数据列表状态
  const [ips, setIps] = useState<IpAsset[]>([]);
  const [detail, setDetail] = useState<IpAssetDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [listSearch, setListSearch] = useState("");

  // 子选项卡状态
  const [activeTab, setActiveTab] = useState<"profile" | "sheets" | "emojis" | "creations" | "relations">("profile");

  // 表单弹窗状态
  const [isIpModalOpen, setIsIpModalOpen] = useState(false);
  const [editingIp, setEditingIp] = useState<IpAsset | null>(null);
  const [ipName, setIpName] = useState("");
  const [ipPath, setIpPath] = useState("");
  const [ipInspiration, setIpInspiration] = useState("");
  const [ipDescription, setIpDescription] = useState("");
  const [ipAvatarPath, setIpAvatarPath] = useState<string | null>(null);

  // 三视图图片类型选择
  const [sheetType, setSheetType] = useState<string>("three-view");

  // 表情包套件状态
  const [selectedPackId, setSelectedPackId] = useState<string>("__ALL__");
  const [movingEmoji, setMovingEmoji] = useState<any | null>(null);
  const [isPackModalOpen, setIsPackModalOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<IpStickerPack | null>(null);
  const [packName, setPackName] = useState("");
  const [packPath, setPackPath] = useState("");
  const [packDescription, setPackDescription] = useState("");

  // 发布平台记录状态
  const [isPlatformModalOpen, setIsPlatformModalOpen] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState<IpStickerPackPlatform | null>(null);
  const [platformName, setPlatformName] = useState("微信表情开放平台");
  const [platformPackName, setPlatformPackName] = useState("");
  const [platformSizeSpec, setPlatformSizeSpec] = useState("");
  const [platformStatus, setPlatformStatus] = useState("Draft");
  const [platformPublishUrl, setPlatformPublishUrl] = useState("");

  // 关系链状态
  const [isRelationModalOpen, setIsRelationModalOpen] = useState(false);
  const [relationTargetId, setRelationTargetId] = useState("");
  const [relationType, setRelationType] = useState("朋友");
  const [relationDesc, setRelationDesc] = useState("");

  // 初始化加载所有 IP
  useEffect(() => {
    loadIps();
  }, []);

  // 键盘监听：左右箭头切换图片，Esc 键退出
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (previewIndex < 0 || previewImages.length === 0) return;
      if (e.key === "ArrowLeft") {
        setPreviewIndex((prev) => (prev > 0 ? prev - 1 : previewImages.length - 1));
      } else if (e.key === "ArrowRight") {
        setPreviewIndex((prev) => (prev < previewImages.length - 1 ? prev + 1 : 0));
      } else if (e.key === "Escape") {
        setPreviewIndex(-1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewIndex, previewImages]);

  // 去水印动作处理函数
  const handleRemoveWatermark = async (method: "gemini" | "general") => {
    const currentPath = activeWatermarkPath || (previewIndex >= 0 && previewImages.length > 0 ? previewImages[previewIndex] : null);
    if (!currentPath) {
      toast({ title: "错误", description: "未指定待处理的图片路径", variant: "destructive" });
      return;
    }

    try {
      setIsProcessingWatermark(true);

      const ext = currentPath.split('.').pop() || 'png';
      const lastSeparator = Math.max(
        currentPath.lastIndexOf('/'),
        currentPath.lastIndexOf('\\')
      );
      const outputDir = currentPath.substring(0, lastSeparator + 1);
      const filename = currentPath.substring(lastSeparator + 1);
      const baseName = filename.replace(/\.[^/.]+$/, '');
      
      // 临时文件名
      const tempPath = `${outputDir}${baseName}_temp_${Date.now()}.${ext}`;

      let success = false;
      // 使用选择的算法移除水印
      if (method === "gemini") {
        const result = await geminiWatermarkApi.autoRemove(currentPath, tempPath);
        success = result.success;
      } else {
        const result = await watermarkApi.remove(currentPath, tempPath, undefined);
        success = result.success;
      }

      if (success) {
        try {
          // 移动原图到应用回收站
          const { mkdir, exists, rename } = await import("@tauri-apps/plugin-fs");
          const { appDataDir, join } = await import("@tauri-apps/api/path");
          
          const appDir = await appDataDir();
          const trashDir = await join(appDir, "trash");
          
          // 确保回收站目录存在
          if (!(await exists(trashDir))) {
            await mkdir(trashDir, { recursive: true });
          }
          
          // 生成回收站中的文件名（带时间戳避免冲突）
          const timestamp = Date.now();
          const trashFileName = `${baseName}_${timestamp}.${ext}`;
          const trashPath = await join(trashDir, trashFileName);
          
          // 移动原图到回收站
          await rename(currentPath, trashPath);
          
          // 重命名临时文件为原文件名
          await rename(tempPath, currentPath);
          
          toast({
            title: "✓ 水印移除成功",
            description: "原图已移至回收站",
          });
          
          setImageTimestamp(Date.now());
          setIsWatermarkModalOpen(false);
          setActiveWatermarkPath(null);
          
          // 重新加载 IP 详情，以便刷新列表里的图片缓存
          if (selectedIpId) {
            loadDetail(selectedIpId);
          }
        } catch (error) {
          console.error("Failed to replace file:", error);
          toast({
            title: "✗ 替换文件失败",
            description: String(error),
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "✗ 水印移除失败",
          description: "水印移除算法未能成功处理图片",
          variant: "destructive",
        });
      }
    } catch (e) {
      console.error(e);
      toast({ 
        title: "去水印失败", 
        description: typeof e === "string" ? e : "去水印过程中发生错误", 
        variant: "destructive" 
      });
    } finally {
      setIsProcessingWatermark(false);
    }
  };

  // 选中 IP 发生变化时，加载其详细信息
  useEffect(() => {
    if (selectedIpId) {
      loadDetail(selectedIpId);
    } else {
      setDetail(null);
    }
  }, [selectedIpId]);

  const loadIps = async () => {
    try {
      setIsLoading(true);
      const list = await ipApi.getAll();
      setIps(list);
      if (list.length > 0 && !selectedIpId) {
        setSelectedIpId(list[0].id);
      }
    } catch (e) {
      console.error(e);
      toast({ title: "加载失败", description: "无法加载 IP 形象列表", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const loadDetail = async (id: string) => {
    try {
      const data = await ipApi.getDetail(id);
      setDetail(data);
      if (selectedPackId === "__ALL__" || selectedPackId === "__UNGROUPED__") {
        // 保留虚拟分组的选中状态
      } else if (selectedPackId && data.sticker_packs.some(p => p.id === selectedPackId)) {
        // 保留已选中的真实套件状态
      } else {
        setSelectedPackId("__ALL__");
      }
    } catch (e) {
      console.error(e);
      toast({ title: "加载失败", description: "无法获取 IP 详情信息", variant: "destructive" });
    }
  };

  // 过滤 IP 列表
  const filteredIps = useMemo(() => {
    const query = listSearch.trim().toLowerCase();
    if (!query) return ips;
    return ips.filter(
      (ip) =>
        ip.name.toLowerCase().includes(query) ||
        (ip.description && ip.description.toLowerCase().includes(query)) ||
        (ip.inspiration && ip.inspiration.toLowerCase().includes(query))
    );
  }, [ips, listSearch]);

  // 根据选中的表情套件过滤表情图片
  const currentEmojis = useMemo(() => {
    if (!detail) return [];
    if (selectedPackId === "__ALL__") return detail.emojis;
    if (selectedPackId === "__UNGROUPED__") return detail.emojis.filter((e) => !e.pack_id);
    return detail.emojis.filter((e) => e.pack_id === selectedPackId);
  }, [detail, selectedPackId]);

  // 打开创建 IP 弹窗
  const handleOpenCreateIp = () => {
    setEditingIp(null);
    setIpName("");
    setIpPath("");
    setIpInspiration("");
    setIpDescription("");
    setIpAvatarPath(null);
    setIsIpModalOpen(true);
  };

  // 打开编辑 IP 弹窗
  const handleOpenEditIp = (ip: IpAsset) => {
    setEditingIp(ip);
    setIpName(ip.name);
    setIpPath(ip.path || "");
    setIpInspiration(ip.inspiration || "");
    setIpDescription(ip.description || "");
    setIpAvatarPath(ip.avatar_path || null);
    setIsIpModalOpen(true);
  };

  // 保存 IP 资产
  const handleSaveIp = async () => {
    if (!ipName.trim()) {
      toast({ title: "请输入 IP 名字" });
      return;
    }
    // 自动生成 path：如果用户没填，用 name 的小写+连字符形式
    const finalPath = ipPath.trim() || ipName.trim().toLowerCase().replace(/\s+/g, "-");
    try {
      if (editingIp) {
        const updated = await ipApi.update(
          editingIp.id,
          ipName,
          finalPath,
          ipInspiration || undefined,
          ipDescription || undefined,
          ipAvatarPath || undefined
        );
        toast({ title: "保存成功", description: "IP 形象已成功更新" });
        setSelectedIpId(updated.id);
      } else {
        const created = await ipApi.create(
          ipName,
          finalPath,
          ipInspiration || undefined,
          ipDescription || undefined,
          ipAvatarPath || undefined
        );
        toast({ title: "创建成功", description: "IP 形象已成功创建" });
        setSelectedIpId(created.id);
      }
      setIsIpModalOpen(false);
      loadIps();
    } catch (e) {
      console.error(e);
      toast({ title: "保存失败", description: "保存数据时发生错误", variant: "destructive" });
    }
  };

  // 删除 IP 资产
  const handleDeleteIp = async (id: string) => {
    if (!confirm("确定要删除这个 IP 形象吗？这会级联删除其下的所有三视图、表情包及关系链！")) return;
    try {
      await ipApi.delete(id);
      toast({ title: "删除成功", description: "IP 形象已成功删除" });
      if (selectedIpId === id) {
        setSelectedIpId(null);
      }
      loadIps();
    } catch (e) {
      console.error(e);
      toast({ title: "删除失败", description: "无法删除该 IP 形象", variant: "destructive" });
    }
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

  // 动作：导入设定图 (多选本地图片)
  const handleImportSheets = async () => {
    if (!selectedIpId) return;
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "webp", "gif"]
        }]
      });
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        await ipApi.addCharacterSheets(selectedIpId, paths, sheetType);
        toast({ title: "导入成功", description: "已将选中图片拷贝为三视图设定图" });
        loadDetail(selectedIpId);
      }
    } catch (e) {
      console.error("导入设定图失败:", e);
      toast({ title: "导入失败", description: "关联设定图时发生错误", variant: "destructive" });
    }
  };

  // 动作：移除设定图
  const handleRemoveSheet = async (imagePath: string) => {
    if (!selectedIpId) return;
    try {
      await ipApi.removeCharacterSheets(selectedIpId, [imagePath]);
      toast({ title: "移除成功", description: "已移除设定图并从磁盘清理" });
      loadDetail(selectedIpId);
    } catch (e) {
      console.error(e);
    }
  };

  // 动作：导入创作图 (多选本地图片)
  const handleImportCreations = async () => {
    if (!selectedIpId) return;
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "webp", "gif"]
        }]
      });
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        // 自动用不含后缀的文件名作为默认的创作名称
        const names = paths.map((p) => {
          const parts = p.split(/[\\/]/);
          const nameWithExt = parts[parts.length - 1];
          const name = nameWithExt.substring(0, nameWithExt.lastIndexOf("."));
          return name || "未命名插画";
        });
        await ipApi.addCreations(selectedIpId, paths, names);
        toast({ title: "导入成功", description: "已将作品图片拷贝并添加至出镜作品归档" });
        loadDetail(selectedIpId);
      }
    } catch (e) {
      console.error("导入创作图失败:", e);
      toast({ title: "导入失败", variant: "destructive" });
    }
  };

  // 动作：移除创作关联
  const handleRemoveCreation = async (imagePath: string) => {
    if (!selectedIpId) return;
    try {
      await ipApi.removeCreations(selectedIpId, [imagePath]);
      toast({ title: "移除成功", description: "已移除出镜插画并从磁盘清理" });
      loadDetail(selectedIpId);
    } catch (e) {
      console.error(e);
    }
  };

  // 动作：导入表情 (多选本地图片)
  const handleImportEmojis = async () => {
    if (!selectedIpId) return;
    const targetPackId = (selectedPackId === "__ALL__" || selectedPackId === "__UNGROUPED__") ? null : selectedPackId;
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "webp", "gif"]
        }]
      });
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        // 自动用不含后缀的文件名作为表情默认触发快捷词
        const words = paths.map((p) => {
          const parts = p.split(/[\\/]/);
          const nameWithExt = parts[parts.length - 1];
          const name = nameWithExt.substring(0, nameWithExt.lastIndexOf("."));
          return name || "";
        });
        await ipApi.addEmojis(selectedIpId, targetPackId, paths, words);
        toast({ title: "导入成功", description: "表情图片已拷贝并添加至 IP 表情库" });
        loadDetail(selectedIpId);
      }
    } catch (e) {
      console.error("导入表情图失败:", e);
      toast({ title: "导入失败", variant: "destructive" });
    }
  };

  // 动作：彻底删除表情图片
  const handleDeleteEmoji = async (emojiId: string) => {
    if (!selectedIpId) return;
    if (!confirm("确定要彻底删除该表情吗？这会将其从所有分组套件中移除，并物理删除该表情文件！")) return;
    try {
      await ipApi.deleteEmojis([emojiId]);
      toast({ title: "已删除表情", description: "已彻底从表情库中删除该表情并物理清理文件" });
      loadDetail(selectedIpId);
    } catch (e) {
      console.error("删除表情失败:", e);
      toast({ title: "删除失败", variant: "destructive" });
    }
  };

  // 动作：移动表情到指定的套件/分组
  const handleMoveEmoji = async (emojiId: string, packId: string | null) => {
    if (!selectedIpId) return;
    try {
      await ipApi.moveEmojisToPack([emojiId], packId);
      toast({ title: "移动成功", description: "已成功更新该表情的分组" });
      loadDetail(selectedIpId);
    } catch (e) {
      console.error("移动表情失败:", e);
      toast({ title: "移动失败", variant: "destructive" });
    }
  };

  // 表情包套件相关操作
  const handleSavePack = async () => {
    if (!packName.trim() || !selectedIpId) return;
    try {
      const finalPath = packPath.trim() || packName.trim().toLowerCase().replace(/\s+/g, "-");
      if (editingPack) {
        await ipApi.updateStickerPack(editingPack.id, packName, finalPath, packDescription || undefined);
        toast({ title: "更新成功", description: "表情包套件信息已更新" });
      } else {
        const created = await ipApi.createStickerPack(selectedIpId, packName, finalPath, packDescription || undefined);
        toast({ title: "新建成功", description: "表情包套件已创建" });
        setSelectedPackId(created.id);
      }
      setIsPackModalOpen(false);
      loadDetail(selectedIpId);
    } catch (e: any) {
      console.error(e);
      toast({ title: editingPack ? "更新失败" : "新建失败", description: e.message || "操作失败", variant: "destructive" });
    }
  };

  const handleDeletePack = async (packId: string) => {
    if (!confirm("确定要删除整个表情包套件吗？这会级联删除此套件下的所有表情图和平台发布记录！") || !selectedIpId) return;
    try {
      await ipApi.deleteStickerPack(packId);
      toast({ title: "删除成功" });
      loadDetail(selectedIpId);
    } catch (e) {
      console.error(e);
    }
  };

  // 更新表情快捷词
  const handleUpdateEmojiWord = async (emojiId: string, word: string) => {
    try {
      await ipApi.updateEmojiTriggerWord(emojiId, word || undefined);
    } catch (e) {
      console.error(e);
    }
  };

  // 复制表情包到系统剪贴板 (PNG 跨平台写剪贴板适配)
  const handleCopyEmoji = async (absolutePath: string) => {
    try {
      const src = convertFileSrc(absolutePath);
      const response = await fetch(src);
      const blob = await response.blob();

      if (blob.type === "image/png") {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob })
        ]);
        toast({ title: "复制成功", description: "表情已成功复制到剪贴板，可直接粘贴使用" });
      } else {
        // 如果是非 PNG 格式图片 (如 jpg, webp, gif等)，用 canvas 转为 png 写入剪贴板
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = src;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(async (pngBlob) => {
            if (pngBlob) {
              try {
                await navigator.clipboard.write([
                  new ClipboardItem({ "image/png": pngBlob })
                ]);
                toast({ title: "复制成功", description: "表情已转换为 PNG 并成功复制到剪贴板" });
              } catch (err) {
                console.error("Clipboard write error:", err);
                toast({ title: "复制失败", description: "系统剪贴板拒绝写入", variant: "destructive" });
              }
            }
          }, "image/png");
        }
      }
    } catch (e) {
      console.error(e);
      toast({ title: "复制失败", description: "无法解析该表情图片", variant: "destructive" });
    }
  };

  // 发布渠道保存
  const handleSavePlatform = async () => {
    if (!platformName.trim() || !selectedPackId || !selectedIpId) return;
    try {
      if (editingPlatform) {
        await ipApi.updateStickerPackPlatform(
          editingPlatform.id,
          platformName,
          platformPackName || undefined,
          platformSizeSpec || undefined,
          platformStatus,
          platformPublishUrl || undefined,
          editingPlatform.downloads_count
        );
        toast({ title: "更新成功", description: "渠道发布信息已更新" });
      } else {
        await ipApi.addStickerPackPlatform(
          selectedPackId,
          platformName,
          platformPackName || undefined,
          platformSizeSpec || undefined,
          platformStatus,
          platformPublishUrl || undefined
        );
        toast({ title: "添加成功", description: "已新增发布渠道" });
      }
      setIsPlatformModalOpen(false);
      loadDetail(selectedIpId);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeletePlatform = async (platformId: string) => {
    if (!confirm("确认删除该发布渠道吗？") || !selectedIpId) return;
    try {
      await ipApi.deleteStickerPackPlatform(platformId);
      toast({ title: "渠道记录已删除" });
      loadDetail(selectedIpId);
    } catch (e) {
      console.error(e);
    }
  };

  // 保存关系链
  const handleSaveRelation = async () => {
    if (!relationTargetId || !selectedIpId) return;
    try {
      await ipApi.addRelation(selectedIpId, relationTargetId, relationType, relationDesc || undefined);
      // 同时建立反向关系
      let backRelation = "搭档";
      if (relationType === "朋友") backRelation = "朋友";
      if (relationType === "宿敌") backRelation = "宿敌";
      if (relationType === "兄弟姐妹") backRelation = "兄弟姐妹";
      if (relationType === "变体") backRelation = "变体";
      if (relationType === "导师") backRelation = "学生/徒弟";
      if (relationType === "学生/徒弟") backRelation = "导师";

      await ipApi.addRelation(relationTargetId, selectedIpId, backRelation, `${detail?.ip.name} 建立的关联`);

      toast({ title: "关系建立成功" });
      setIsRelationModalOpen(false);
      loadDetail(selectedIpId);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteRelation = async (targetId: string, typeStr: string) => {
    if (!confirm("确定要解除这个关系吗？") || !selectedIpId) return;
    try {
      await ipApi.removeRelation(selectedIpId, targetId, typeStr);
      // 尝试同时解除反向关系
      let backRelation = "搭档";
      if (typeStr === "朋友") backRelation = "朋友";
      if (typeStr === "宿敌") backRelation = "宿敌";
      if (typeStr === "兄弟姐妹") backRelation = "兄弟姐妹";
      if (typeStr === "变体") backRelation = "变体";
      if (typeStr === "导师") backRelation = "学生/徒弟";
      if (typeStr === "学生/徒弟") backRelation = "导师";
      await ipApi.removeRelation(targetId, selectedIpId, backRelation);

      toast({ title: "关系已解除" });
      loadDetail(selectedIpId);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-background">
      {/* ==================== 左侧 IP 列表 ==================== */}
      <div className="w-80 border-r flex flex-col bg-card/40">
        <div className="p-4 border-b flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              IP 形象库
            </h2>
            <Button size="icon" variant="ghost" onClick={handleOpenCreateIp} className="h-8 w-8">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索 IP..."
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 p-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2 text-center">
              <Users className="w-8 h-8 opacity-30 animate-pulse" />
              <span className="text-sm">加载中...</span>
            </div>
          ) : filteredIps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2 text-center">
              <Users className="w-8 h-8 opacity-30" />
              <span className="text-sm">暂无匹配 IP 形象</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filteredIps.map((ip) => {
                const isSelected = selectedIpId === ip.id;
                return (
                  <div
                    key={ip.id}
                    onClick={() => setSelectedIpId(ip.id)}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "hover:bg-accent/60 text-card-foreground"
                    }`}
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
                        className={`text-xs truncate ${
                          isSelected ? "text-primary-foreground/75" : "text-muted-foreground"
                        }`}
                      >
                        {ip.inspiration || ip.description || "无详细信息"}
                      </p>
                    </div>

                    <ChevronRight className={`w-4 h-4 flex-shrink-0 opacity-60 ${isSelected ? "text-primary-foreground" : ""}`} />
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ==================== 右侧 IP 工作区 ==================== */}
      <div className="flex-1 flex flex-col overflow-hidden bg-card/10">
        {detail ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* IP 详情 Header */}
            <div className="p-6 border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/45 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted border shadow-sm">
                  {detail.ip.avatar_path ? (
                    <img
                      src={convertFileSrc(detail.ip.avatar_path)}
                      alt={detail.ip.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Users className="w-8 h-8 opacity-40" />
                    </div>
                  )}
                </div>

                <div>
                  <h1 className="text-2xl font-bold flex items-center gap-3">
                    {detail.ip.name}
                    <Badge variant="secondary">IP 形象</Badge>
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    创建于 {new Date(detail.ip.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {detail.ip.id !== "unknown" && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => handleOpenEditIp(detail.ip)} className="gap-1">
                      <Pencil className="w-4 h-4" />
                      编辑资料
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteIp(detail.ip.id)} className="gap-1">
                      <Trash2 className="w-4 h-4" />
                      删除 IP
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* 子 Tab 导航 */}
            <div className="border-b px-6 bg-card/40">
              <div className="flex gap-4">
                {[
                  { id: "profile", label: "基本设定", icon: BookOpen },
                  { id: "sheets", label: "三视图 / 设定图", icon: ImageIcon },
                  { id: "emojis", label: "表情包管理", icon: Smile },
                  { id: "creations", label: "参与的创作", icon: Sparkles },
                  { id: "relations", label: "关系链谱", icon: Link },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-2 py-3 px-1 text-sm font-medium border-b-2 transition-all duration-200 ${
                        isActive
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 子 Tab 工作区 */}
            <div className="flex-1 overflow-hidden p-6 relative">
              {/* === TAB: PROFILE (设定) === */}
              {activeTab === "profile" && (
                <ScrollArea className="h-full pr-4">
                  <div className="flex flex-col gap-6 max-w-4xl">
                    {/* 灵感故事 Quote */}
                    {detail.ip.inspiration && (
                      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-r from-primary/5 via-primary/10 to-transparent p-6 shadow-sm">
                        <div className="absolute -right-4 -bottom-6 text-primary/10 select-none text-8xl font-serif leading-none font-bold">
                          “
                        </div>
                        <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-1.5">
                          <BookOpen className="w-4 h-4" />
                          灵感由来 / 背景故事
                        </h3>
                        <blockquote className="text-foreground/90 italic leading-relaxed whitespace-pre-line text-sm pl-2 border-l-2 border-primary/30">
                          {detail.ip.inspiration}
                        </blockquote>
                      </div>
                    )}

                    {/* 详细设定 */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base font-semibold">详细设定 / 设定特征</CardTitle>
                      </CardHeader>
                      <CardContent className="whitespace-pre-line text-sm text-foreground/80 leading-relaxed">
                        {detail.ip.description || "暂无详细设定描述。你可以点击右上角“编辑资料”进行补充。"}
                      </CardContent>
                    </Card>
                  </div>
                </ScrollArea>
              )}

              {/* === TAB: SHEETS (三视图) === */}
              {activeTab === "sheets" && (
                <div className="h-full flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <select
                        value={sheetType}
                        onChange={(e) => setSheetType(e.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <option value="three-view">三视图</option>
                        <option value="front">正面图</option>
                        <option value="side">侧面图</option>
                        <option value="back">背面图</option>
                        <option value="concept">概念原画</option>
                        <option value="other">其他设定图</option>
                      </select>
                      <Button
                        onClick={handleImportSheets}
                        size="sm"
                        className="gap-1.5"
                      >
                        <PlusCircle className="w-4 h-4" />
                        添加本地图片
                      </Button>
                    </div>
                  </div>

                  <ScrollArea className="flex-1 border rounded-lg py-4 px-0 bg-card/20">
                    {detail.character_sheets.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
                        <ImageIcon className="w-10 h-10 opacity-30" />
                        <span className="text-sm">暂无设定图，请点击上方“添加本地图片”</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {detail.character_sheets.map((sheet, index) => (
                          <div
                            key={sheet.id}
                            onClick={() => {
                              const paths = detail.character_sheets.map(s => s.image_path);
                              setPreviewImages(paths);
                              setPreviewIndex(index);
                            }}
                            className="group relative aspect-square rounded-lg overflow-hidden border bg-muted shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer"
                          >
                            <img
                              src={`${convertFileSrc(sheet.image_path)}?t=${imageTimestamp}`}
                              alt="设定图"
                              className={`w-full h-full ${showFullImage ? "object-contain bg-background" : "object-cover"} transition-transform duration-300 group-hover:scale-102`}
                            />
                            {/* 类型标签 */}
                            <Badge className="absolute top-2 left-2 shadow-sm font-normal">
                              {sheet.sheet_type === "three-view" && "三视图"}
                              {sheet.sheet_type === "front" && "正面"}
                              {sheet.sheet_type === "side" && "侧面"}
                              {sheet.sheet_type === "back" && "背面"}
                              {sheet.sheet_type === "concept" && "概念图"}
                              {sheet.sheet_type === "other" && "其他设定"}
                            </Badge>

                            {/* 操作浮层 */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
                              <Button
                                size="icon"
                                variant="secondary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const paths = detail.character_sheets.map(s => s.image_path);
                                  setPreviewImages(paths);
                                  setPreviewIndex(index);
                                }}
                                className="h-8 w-8 rounded-full"
                                title="查看大图"
                              >
                                <ZoomIn className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="secondary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveWatermarkPath(sheet.image_path);
                                  setIsWatermarkModalOpen(true);
                                }}
                                className="h-8 w-8 rounded-full text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                                title="去水印"
                              >
                                <Sparkles className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveSheet(sheet.image_path);
                                }}
                                className="h-8 w-8 rounded-full"
                                title="删除设定图"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              )}

              {/* === TAB: CREATIONS (创作) === */}
              {activeTab === "creations" && (
                <div className="h-full flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">记录该 IP 角色出镜的插图或海报等 AI 作品</span>
                    <Button
                      onClick={handleImportCreations}
                      size="sm"
                      className="gap-1.5"
                    >
                      <PlusCircle className="w-4 h-4" />
                      添加本地作品
                    </Button>
                  </div>

                  <ScrollArea className="flex-1 border rounded-lg py-4 px-0 bg-card/20">
                    {detail.creations.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
                        <Sparkles className="w-10 h-10 opacity-30" />
                        <span className="text-sm">暂无关联创作，点击右上角“添加本地作品”</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {detail.creations.map((c, index) => (
                          <div
                            key={c.image_path}
                            className="group relative rounded-lg border overflow-hidden bg-card shadow-sm hover:shadow-md transition-all duration-300 flex flex-col"
                          >
                            <div className="aspect-square w-full bg-muted overflow-hidden relative cursor-pointer">
                              <img
                                src={`${convertFileSrc(c.image_path)}?t=${imageTimestamp}`}
                                alt="作品"
                                className={`w-full h-full ${showFullImage ? "object-contain bg-background" : "object-cover"}`}
                                onClick={() => {
                                  const paths = detail.creations.map(cr => cr.image_path);
                                  setPreviewImages(paths);
                                  setPreviewIndex(index);
                                }}
                              />
                              
                              {/* 悬停操作浮层 */}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const paths = detail.creations.map(cr => cr.image_path);
                                    setPreviewImages(paths);
                                    setPreviewIndex(index);
                                  }}
                                  className="h-8 w-8 rounded-full"
                                  title="查看大图"
                                >
                                  <ZoomIn className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveWatermarkPath(c.image_path);
                                    setIsWatermarkModalOpen(true);
                                  }}
                                  className="h-8 w-8 rounded-full text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                                  title="去水印"
                                >
                                  <Sparkles className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveCreation(c.image_path);
                                  }}
                                  className="h-8 w-8 rounded-full"
                                  title="删除作品"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="p-3 flex-1 flex flex-col justify-between gap-1.5">
                              <div>
                                <h4 className="font-semibold text-sm truncate">
                                  {c.creation_name || "未命名插画"}
                                </h4>
                              </div>

                              <div className="flex items-center justify-between border-t pt-2 mt-1">
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(c.created_at).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              )}

              {/* === TAB: EMOJIS (表情包) === */}
              {activeTab === "emojis" && (
                <div className="h-full flex overflow-hidden gap-4">
                  {/* 表情包套件列表 (左小栏) */}
                  <div className="w-64 border rounded-lg p-4 flex flex-col gap-4 bg-card/20 flex-shrink-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">表情包分组</h3>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditingPack(null);
                          setPackName("");
                          setPackPath("");
                          setPackDescription("");
                          setIsPackModalOpen(true);
                        }}
                        className="h-7 w-7"
                        title="新建表情套件"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>

                    <ScrollArea className="flex-1 pr-1 border rounded-md p-1 bg-background/50">
                      <div className="flex flex-col gap-1">
                        {/* 虚拟分类: 全部表情 */}
                        <div
                          onClick={() => setSelectedPackId("__ALL__")}
                          className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-all duration-150 ${
                            selectedPackId === "__ALL__" ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent/40 text-xs"
                          }`}
                        >
                          <span className="truncate text-xs">全部表情 ({detail.emojis.length})</span>
                        </div>
                        {/* 虚拟分类: 未分组表情 */}
                        <div
                          onClick={() => setSelectedPackId("__UNGROUPED__")}
                          className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-all duration-150 ${
                            selectedPackId === "__UNGROUPED__" ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent/40 text-xs"
                          }`}
                        >
                          <span className="truncate text-xs">未分组表情 ({detail.emojis.filter(e => !e.pack_id).length})</span>
                        </div>

                        <div className="border-t my-2" />

                        <div className="text-[10px] font-semibold text-muted-foreground px-2 mb-1">表情包套件</div>

                        {detail.sticker_packs.length === 0 ? (
                          <div className="text-xs text-muted-foreground text-center py-4">暂无套件，请添加</div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {detail.sticker_packs.map((pack) => {
                              const isSelected = selectedPackId === pack.id;
                              const packEmojis = detail.emojis.filter((e) => e.pack_id === pack.id);
                              return (
                                <div
                                  key={pack.id}
                                  onClick={() => setSelectedPackId(pack.id)}
                                  className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-all duration-150 group/item ${
                                    isSelected ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent/40 text-xs"
                                  }`}
                                >
                                  <span className="truncate text-xs">{pack.name} ({packEmojis.length})</span>
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingPack(pack);
                                        setPackName(pack.name);
                                        setPackPath(pack.path || "");
                                        setPackDescription(pack.description || "");
                                        setIsPackModalOpen(true);
                                      }}
                                      className="h-5 w-5 hover:bg-primary/20"
                                    >
                                      <Pencil className="w-3 h-3 text-muted-foreground hover:text-primary" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeletePack(pack.id);
                                      }}
                                      className="h-5 w-5 hover:bg-destructive/20"
                                    >
                                      <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </ScrollArea>

                    {/* 分布渠道平台 (只有当选中具体套件时才展示) */}
                    {selectedPackId !== "__ALL__" && selectedPackId !== "__UNGROUPED__" && (
                      <div className="flex flex-col gap-2 mt-auto border-t pt-4">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="text-xs font-semibold text-muted-foreground">发布渠道与规格</h4>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditingPlatform(null);
                              setPlatformName("微信表情开放平台");
                              setPlatformPackName("");
                              setPlatformSizeSpec("");
                              setPlatformStatus("Draft");
                              setPlatformPublishUrl("");
                              setIsPlatformModalOpen(true);
                            }}
                            className="h-5 w-5 text-primary"
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>

                        <ScrollArea className="max-h-48 border rounded p-2 bg-background/50 text-xs">
                          {detail.platforms.filter((p) => p.pack_id === selectedPackId).length === 0 ? (
                            <div className="text-[10px] text-muted-foreground text-center py-4">未发布到任何平台</div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {detail.platforms
                                .filter((p) => p.pack_id === selectedPackId)
                                .map((platform) => (
                                  <div
                                    key={platform.id}
                                    className="p-1.5 rounded border bg-card/60 flex flex-col gap-1 relative group/plat"
                                  >
                                    <div className="flex items-center justify-between font-semibold">
                                      <span>{platform.platform_name}</span>
                                      <Badge variant="outline" className="text-[8px] px-1 py-0">
                                        {platform.status}
                                      </Badge>
                                    </div>
                                    {platform.pack_name_on_platform && (
                                      <p className="text-[10px] text-muted-foreground truncate">
                                        平台名: {platform.pack_name_on_platform}
                                      </p>
                                    )}
                                    {platform.emoji_size_spec && (
                                      <p className="text-[10px] text-muted-foreground truncate">
                                        规格: {platform.emoji_size_spec}
                                      </p>
                                    )}
                                    {platform.publish_url && (
                                      <a
                                        href={platform.publish_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[10px] text-primary hover:underline flex items-center gap-0.5 mt-0.5"
                                      >
                                        发布链接 <ExternalLink className="w-2.5 h-2.5" />
                                      </a>
                                    )}

                                    {/* 渠道编辑/删除操作 */}
                                    <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover/plat:opacity-100 bg-background/90 px-1 rounded shadow transition-opacity">
                                      <button
                                        onClick={() => {
                                          setEditingPlatform(platform);
                                          setPlatformName(platform.platform_name);
                                          setPlatformPackName(platform.pack_name_on_platform || "");
                                          setPlatformSizeSpec(platform.emoji_size_spec || "");
                                          setPlatformStatus(platform.status);
                                          setPlatformPublishUrl(platform.publish_url || "");
                                          setIsPlatformModalOpen(true);
                                        }}
                                        className="text-[10px] text-muted-foreground hover:text-primary p-0.5"
                                      >
                                        编辑
                                      </button>
                                      <button
                                        onClick={() => handleDeletePlatform(platform.id)}
                                        className="text-[10px] text-muted-foreground hover:text-destructive p-0.5"
                                      >
                                        删除
                                      </button>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </ScrollArea>
                      </div>
                    )}
                  </div>

                  {/* 表情包网格 (右侧大网格) */}
                  <div className="flex-1 border rounded-lg p-4 flex flex-col gap-3 bg-card/20 overflow-hidden">
                    <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-sm">
                            {selectedPackId === "__ALL__"
                              ? "全部表情"
                              : selectedPackId === "__UNGROUPED__"
                              ? "未分组表情"
                              : detail.sticker_packs.find((p) => p.id === selectedPackId)?.name}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {selectedPackId === "__ALL__"
                              ? "当前 IP 形象下的所有表情包图片"
                              : selectedPackId === "__UNGROUPED__"
                              ? "尚未归类到任何表情包套件的表情"
                              : detail.sticker_packs.find((p) => p.id === selectedPackId)?.description || "无套件描述"}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={handleImportEmojis}
                          className="gap-1.5"
                        >
                          <PlusCircle className="w-4 h-4" />
                          导入本地表情
                        </Button>
                      </div>

                      <ScrollArea className="flex-1 border rounded-md py-3 px-0 bg-background/40">
                        {currentEmojis.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
                            <Smile className="w-10 h-10 opacity-30" />
                            <span className="text-xs">此分组下暂无表情图片，请点击右上角“导入本地表情”</span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                            {currentEmojis.map((emoji, index) => {
                              const emojiPack = detail.sticker_packs.find(p => p.id === emoji.pack_id);
                              return (
                                <div
                                  key={emoji.id}
                                  className="group relative rounded-md border bg-card p-1 flex flex-col gap-1.5 hover:shadow-md transition-all animate-fade-in"
                                >
                                  <div className="aspect-square rounded overflow-hidden bg-muted relative cursor-pointer">
                                    <img
                                      src={`${convertFileSrc(emoji.image_path)}?t=${imageTimestamp}`}
                                      alt="表情"
                                      className={`w-full h-full ${showFullImage ? "object-contain bg-background" : "object-cover"}`}
                                      onClick={() => {
                                        const paths = currentEmojis.map(e => e.image_path);
                                        setPreviewImages(paths);
                                        setPreviewIndex(index);
                                      }}
                                    />
                                    {/* 悬停复制/移动/去水印/删除 overlay */}
                                    <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                                      <Button
                                        size="icon"
                                        variant="secondary"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleCopyEmoji(emoji.image_path);
                                        }}
                                        className="h-7 w-7 rounded-full shadow"
                                        title="复制表情到剪贴板"
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="secondary"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMovingEmoji(emoji);
                                        }}
                                        className="h-7 w-7 rounded-full shadow hover:bg-primary/20 hover:text-primary"
                                        title="移动/设置分组"
                                      >
                                        <Link className="w-3.5 h-3.5" />
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="secondary"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveWatermarkPath(emoji.image_path);
                                          setIsWatermarkModalOpen(true);
                                        }}
                                        className="h-7 w-7 rounded-full shadow text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                                        title="去水印"
                                      >
                                        <Sparkles className="w-3.5 h-3.5" />
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="destructive"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteEmoji(emoji.id);
                                        }}
                                        className="h-7 w-7 rounded-full shadow"
                                        title="彻底物理删除"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  </div>

                                  {/* 显示当前归属的套件微章 */}
                                  <div className="flex flex-col gap-1 min-h-[30px] justify-between">
                                    <span className="text-[9px] text-muted-foreground text-center truncate px-1">
                                      {emojiPack ? `套件: ${emojiPack.name}` : "未分组"}
                                    </span>
                                    {/* 快捷触发词输入框 */}
                                    <Input
                                      placeholder="快捷触发词"
                                      defaultValue={emoji.trigger_word || ""}
                                      onBlur={(e) => handleUpdateEmojiWord(emoji.id, e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          handleUpdateEmojiWord(emoji.id, e.currentTarget.value);
                                          e.currentTarget.blur();
                                          toast({ title: "快捷词已保存" });
                                        }
                                      }}
                                      className="h-6 text-[10px] text-center px-1 py-0.5 rounded border bg-background/70 focus:bg-background"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </ScrollArea>
                    </div>

                    {/* 移动表情套件 Dialog */}
                    <Dialog open={movingEmoji !== null} onOpenChange={(open) => !open && setMovingEmoji(null)}>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>设置表情分组</DialogTitle>
                          <DialogDescription>
                            将选中的表情移动到指定的表情套件包中，或者设为未分组。
                          </DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-2 py-4">
                          <Button
                            variant={movingEmoji?.pack_id === null ? "secondary" : "outline"}
                            className="justify-start text-xs font-normal"
                            onClick={() => {
                              if (movingEmoji) {
                                handleMoveEmoji(movingEmoji.id, null);
                                setMovingEmoji(null);
                              }
                            }}
                          >
                            设为未分组表情
                          </Button>
                          <div className="border-t my-1" />
                          <div className="text-[10px] font-semibold text-muted-foreground px-2 mb-1">移动到已有套件:</div>
                          {detail.sticker_packs.length === 0 ? (
                            <div className="text-xs text-muted-foreground text-center py-2">暂无表情套件，请先在左侧创建</div>
                          ) : (
                            <ScrollArea className="max-h-60">
                              <div className="flex flex-col gap-1.5">
                                {detail.sticker_packs.map((pack) => (
                                  <Button
                                    key={pack.id}
                                    variant={movingEmoji?.pack_id === pack.id ? "secondary" : "outline"}
                                    className="justify-start text-xs font-normal truncate"
                                    onClick={() => {
                                      if (movingEmoji) {
                                        handleMoveEmoji(movingEmoji.id, pack.id);
                                        setMovingEmoji(null);
                                      }
                                    }}
                                  >
                                    {pack.name}
                                  </Button>
                                ))}
                              </div>
                            </ScrollArea>
                          )}
                        </div>
                        <DialogFooter>
                          <Button variant="ghost" onClick={() => setMovingEmoji(null)}>
                            取消
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                  </div>
                </div>
              )}

              {/* === TAB: RELATIONS (关系链) === */}
              {activeTab === "relations" && (
                <div className="h-full flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">定义 IP 角色的关系链，并在不同 IP 间快捷穿梭</span>
                    <Button
                      onClick={() => {
                        setRelationTargetId("");
                        setRelationType("朋友");
                        setRelationDesc("");
                        setIsRelationModalOpen(true);
                      }}
                      size="sm"
                      className="gap-1.5"
                    >
                      <PlusCircle className="w-4 h-4" />
                      添加关系
                    </Button>
                  </div>

                  <ScrollArea className="flex-1 border rounded-lg p-4 bg-card/20">
                    {detail.relations.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
                        <Link className="w-10 h-10 opacity-30" />
                        <span className="text-sm">暂无关系链配置，点击右上角“添加关系”</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {detail.relations.map((rel) => (
                          <div
                            key={rel.ip_b_id + rel.relation_type}
                            className="p-4 rounded-xl border bg-card/75 flex flex-col justify-between gap-3 shadow-sm hover:shadow-md transition-all relative group"
                          >
                            <div className="flex items-center gap-3">
                              {/* 关联 IP 的头像 */}
                              <div
                                onClick={() => setSelectedIpId(rel.ip_b_id)}
                                className="w-10 h-10 rounded-full overflow-hidden bg-muted cursor-pointer border hover:ring-2 hover:ring-primary/40 transition-all flex-shrink-0"
                                title={`点击跳转至 ${rel.ip_b_name}`}
                              >
                                {rel.ip_b_avatar_path ? (
                                  <img
                                    src={convertFileSrc(rel.ip_b_avatar_path)}
                                    alt={rel.ip_b_name || ""}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                    <Users className="w-5 h-5 opacity-40" />
                                  </div>
                                )}
                              </div>

                              <div>
                                <h4
                                  onClick={() => setSelectedIpId(rel.ip_b_id)}
                                  className="font-semibold text-sm cursor-pointer hover:text-primary transition-colors truncate"
                                >
                                  {rel.ip_b_name}
                                </h4>
                                <Badge variant="secondary" className="text-[10px] mt-1 py-0 px-1.5">
                                  {rel.relation_type}
                                </Badge>
                              </div>
                            </div>

                            {rel.description && (
                              <p className="text-xs text-muted-foreground leading-normal whitespace-pre-line border-t pt-2">
                                {rel.description}
                              </p>
                            )}

                            {/* 删除关系 */}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDeleteRelation(rel.ip_b_id, rel.relation_type)}
                              className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Users className="w-16 h-16 opacity-20" />
            <h3 className="font-semibold">选择或新建一个 IP 形象</h3>
            <p className="text-xs text-muted-foreground/80">点击左侧列表查看角色详情，或点击加号新建角色设定。</p>
            <Button size="sm" onClick={handleOpenCreateIp} className="mt-2">
              新建 IP 形象
            </Button>
          </div>
        )}
      </div>

      {/* ==================== 弹窗: IP 形象创建与修改 ==================== */}
      <Dialog open={isIpModalOpen} onOpenChange={setIsIpModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingIp ? "编辑 IP 形象" : "新建 IP 形象"}</DialogTitle>
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

      {/* ==================== 弹窗: 新建/编辑表情包分组套件 ==================== */}
      <Dialog open={isPackModalOpen} onOpenChange={setIsPackModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPack ? "编辑表情包套件" : "新建表情包套件"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">套件名称 *</label>
              <Input
                placeholder="例如: 日常篇、搬砖日常"
                value={packName}
                onChange={(e) => setPackName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">路径标识</label>
              <Input
                placeholder="例如: daily（留空则自动生成）"
                value={packPath}
                onChange={(e) => setPackPath(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))}
              />
              <p className="text-[10px] text-muted-foreground">用于目录命名和匹配，只允许小写字母、数字、连字符和下划线</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">描述</label>
              <textarea
                placeholder="描述这套表情包的主题或创作初衷..."
                value={packDescription}
                onChange={(e) => setPackDescription(e.target.value)}
                className="min-h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPackModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSavePack} disabled={!packName.trim()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== 弹窗: 表情包发布平台渠道 ==================== */}
      <Dialog open={isPlatformModalOpen} onOpenChange={setIsPlatformModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPlatform ? "编辑渠道发布信息" : "添加渠道发布信息"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">渠道平台名称 *</label>
              <select
                value={platformName}
                onChange={(e) => setPlatformName(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="微信表情开放平台">微信表情开放平台</option>
                <option value="抖音表情包">抖音表情包</option>
                <option value="QQ表情平台">QQ表情平台</option>
                <option value="TikTok Stickers">TikTok Stickers</option>
                <option value="其他">其他</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">该平台上的表情包套件名称</label>
              <Input
                placeholder="如: 猫耳 Luna 的日常"
                value={platformPackName}
                onChange={(e) => setPlatformPackName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">平台规格大小要求</label>
              <Input
                placeholder="如: 240x240, GIF < 100KB"
                value={platformSizeSpec}
                onChange={(e) => setPlatformSizeSpec(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">发布状态</label>
              <select
                value={platformStatus}
                onChange={(e) => setPlatformStatus(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="Draft">草稿</option>
                <option value="Submitted">审核中</option>
                <option value="Published">已发布</option>
                <option value="Rejected">被拒绝</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">网页链接 / URL</label>
              <Input
                placeholder="输入在平台上的下载详情页 URL"
                value={platformPublishUrl}
                onChange={(e) => setPlatformPublishUrl(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPlatformModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSavePlatform}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== 弹窗: 添加 IP 关系链 ==================== */}
      <Dialog open={isRelationModalOpen} onOpenChange={setIsRelationModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加 IP 关系链接</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">关联目标角色 *</label>
              <select
                value={relationTargetId}
                onChange={(e) => setRelationTargetId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">请选择目标 IP 形象...</option>
                {ips
                  .filter((ip) => ip.id !== selectedIpId)
                  .map((ip) => (
                    <option key={ip.id} value={ip.id}>
                      {ip.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">关系类型 *</label>
              <select
                value={relationType}
                onChange={(e) => setRelationType(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="朋友">朋友</option>
                <option value="宿敌">宿敌</option>
                <option value="兄弟姐妹">兄弟姐妹</option>
                <option value="搭档">搭档</option>
                <option value="导师">导师</option>
                <option value="学生/徒弟">学生/徒弟</option>
                <option value="变体">变体 (不同风格形象)</option>
                <option value="自定义">自定义</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">关系详细描述</label>
              <textarea
                placeholder="对该关系链添加细节描述（如: 两人是在赛博朋克大混战中结识的...）"
                value={relationDesc}
                onChange={(e) => setRelationDesc(e.target.value)}
                className="min-h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRelationModalOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveRelation} disabled={!relationTargetId}>
              确立关系
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === 大图查看器 Dialog === */}
      <Dialog open={previewIndex >= 0} onOpenChange={(open) => !open && setPreviewIndex(-1)}>
        <DialogContent 
          className="w-[95vw] h-[95vh] max-w-[95vw] max-h-[95vh] p-0 border-none bg-black/95 flex flex-col justify-between items-center overflow-hidden select-none outline-none" 
          hideClose
        >
          <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10 rounded-full flex items-center justify-center"
              onClick={() => setIsWatermarkModalOpen(true)}
              title="去水印"
            >
              <Sparkles className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10 rounded-full flex items-center justify-center"
              onClick={() => setPreviewIndex(-1)}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {previewImages.length > 0 && previewIndex >= 0 && (
            <div className="flex-1 w-full relative flex items-center justify-center p-4">
              {/* 左切换 */}
              <Button
                size="icon"
                variant="ghost"
                className="absolute left-4 z-40 text-white/80 hover:text-white hover:bg-white/10 rounded-full h-10 w-10 flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewIndex((prev) => (prev > 0 ? prev - 1 : previewImages.length - 1));
                }}
              >
                <ChevronLeft className="w-8 h-8" />
              </Button>

              {/* 大图片 */}
              <img
                src={`${convertFileSrc(previewImages[previewIndex])}?t=${imageTimestamp}`}
                alt="大图预览"
                className="max-w-full max-h-full object-contain"
                style={{ maxHeight: "calc(95vh - 80px)" }}
              />

              {/* 右切换 */}
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-4 z-40 text-white/80 hover:text-white hover:bg-white/10 rounded-full h-10 w-10 flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewIndex((prev) => (prev < previewImages.length - 1 ? prev + 1 : 0));
                }}
              >
                <ChevronRight className="w-8 h-8" />
              </Button>
            </div>
          )}

          {/* 计数指示器 */}
          {previewImages.length > 0 && previewIndex >= 0 && (
            <div className="text-xs text-white/60 pb-4 select-none">
              {previewIndex + 1} / {previewImages.length}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* === 去水印选择 Dialog === */}
      <Dialog 
        open={isWatermarkModalOpen} 
        onOpenChange={(open) => {
          if (!open && !isProcessingWatermark) {
            setIsWatermarkModalOpen(false);
            setActiveWatermarkPath(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>去水印处理</DialogTitle>
            <DialogDescription>
              自动检测并从该形象图片中移除水印（此操作将原路覆盖物理图片文件，并备份原图至回收站）。
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-4">
            <Button
              disabled={isProcessingWatermark}
              onClick={() => handleRemoveWatermark("gemini")}
              className="w-full justify-center flex items-center gap-2"
            >
              {isProcessingWatermark ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Gemini 水印智能移除
            </Button>

            <Button
              variant="outline"
              disabled={isProcessingWatermark}
              onClick={() => handleRemoveWatermark("general")}
              className="w-full justify-center flex items-center gap-2"
            >
              {isProcessingWatermark && <Loader2 className="w-4 h-4 animate-spin" />}
              通用角落水印修复 (Inpainting)
            </Button>
          </div>
          <DialogFooter>
            <Button 
              variant="ghost" 
              disabled={isProcessingWatermark} 
              onClick={() => {
                setIsWatermarkModalOpen(false);
                setActiveWatermarkPath(null);
              }}
            >
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
