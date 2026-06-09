import { useEffect, useState, useMemo, useRef } from "react";
import { useIpImageStore, useUIStore, type IpAssetDetail, type IpStickerPack, type IpAsset } from "@/stores";
import { ipImageApi, ipApi } from "@/services/tauri";
import { toast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Archive, 
  Search, 
  CheckSquare, 
  Square,
  Image as ImageIcon,
  Undo2,
  Loader2,
  Edit2,
  LayoutGrid,
  List,
  Filter,
  Trash2,
  Check,
  AlertCircle,
  RefreshCw,
  Users,
  BookOpen,
  Smile,
  Film,
  Link,
  Sparkles,
  Plus,
  Pencil,
  PlusCircle,
  Copy,
  X,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Minimize,
  ChevronDown,
  Menu,
} from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import ImageCard from "./ImageCard";
import SyncButton from "@/components/SyncButton";
import IPImagePickerModal from "./IPImagePickerModal";
import BatchEditModal from "./BatchEditModal";
import ConfirmDialog from "./ConfirmDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IpAssociateCharacterModal } from "./IpAssociateCharacterModal";

import IpSidebar from "./IpSidebar";
import { useWorksStore, type CharacterWithRelations } from "@/stores";
import { cn } from "@/lib/utils";

// 自动拷贝并归档头像到当前 IP 形象
const autoArchiveAvatar = async (avatarPath: string, ip: IpAsset) => {
  try {
    const { join } = await import("@tauri-apps/api/path");
      const { getAppRoot } = await import("@/lib/pathUtils");
    const { copyFile, exists, mkdir, stat } = await import("@tauri-apps/plugin-fs");
    
    const { settings } = useUIStore.getState();

    // 1. 解析待整理收件箱路径
    let inboxDir: string;
    if (settings.customIpInboxPath) {
      inboxDir = settings.customIpInboxPath;
    } else {
      const appDir = await getAppRoot();
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
      libraryPath = await getAppRoot();
    }
    const namingTemplate = settings.ipNamingTemplate || "{ip}-{date}-{time}";

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
      ip_id: ip.id,
      tags: [],
    });

    let finalAvatarPath = targetPath;

    // 4. 自动进行图库归档
    try {
      const archiveResult = await ipImageApi.archive([importResult.id], libraryPath, namingTemplate);
      if (archiveResult.success_count > 0) {
        try {
          const archived = await ipImageApi.getArchivedImages();
          const archivedImage = archived.find(x => x.id === importResult.id);
          if (archivedImage) {
            finalAvatarPath = archivedImage.absolute_path;
          }
        } catch (e) {
          console.error("加载归档后的绝对路径失败:", e);
        }
      }
    } catch (archiveError) {
      console.error(`自动归档头像图片 ${importResult.id} 失败:`, archiveError);
    }

    // 5. 更新 IP 形象的头像路径为归档后的绝对路径
    try {
      await ipApi.update(
        ip.id,
        ip.name,
        ip.path,
        ip.inspiration || undefined,
        ip.description || undefined,
        finalAvatarPath,
        false
      );
    } catch (updateError) {
      console.error("更新 IP 头像路径失败:", updateError);
    }
  } catch (error) {
    console.error("自动归档头像失败:", error);
  }
};

export default function IpArchivedView() {
  const { 
    archivedImages, 
    selectedImages, 
    isLoading, 
    setArchivedImages, 
    setLoading,
    selectAll,
    clearSelection,
    removeImage,
    deselectImage,
    updateImage,
  } = useIpImageStore();

  const { searchQuery, setSearchQuery, viewMode, setViewMode, isQuickEditOpen, selectedIpId, setSelectedIpId } = useUIStore();
  const [ipDetail, setIpDetail] = useState<IpAssetDetail | null>(null);
  const [isUnarchiving, setIsUnarchiving] = useState(false);
  const [isQuickUploading, setIsQuickUploading] = useState(false);
  const [unarchiveResult, setUnarchiveResult] = useState<string | null>(null);
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [isUpdatingWatermark, setIsUpdatingWatermark] = useState(false);
  const [batchDeleteStep, setBatchDeleteStep] = useState(0);
  const [sortBy, setSortBy] = useState<"time" | "size">("time");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<"profile" | "emojis" | "creations" | "relations" | "works">("creations");
  const [ipRoles, setIpRoles] = useState<CharacterWithRelations[]>([]);
  const [isLoadingIpRoles, setIsLoadingIpRoles] = useState(false);
  const [isAssociateModalOpen, setIsAssociateModalOpen] = useState(false);

  const [sidebarKey, setSidebarKey] = useState(0);

  // IP 编辑/删除 状态
  const [isIpModalOpen, setIsIpModalOpen] = useState(false);
  const [editingIp, setEditingIp] = useState<any | null>(null);
  const [ipName, setIpName] = useState("");
  const [ipPath, setIpPath] = useState("");
  const [ipInspiration, setIpInspiration] = useState("");
  const [ipDescription, setIpDescription] = useState("");
  const [ipAvatarPath, setIpAvatarPath] = useState<string | null>(null);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [isAvatarFromAsset, setIsAvatarFromAsset] = useState(false);

  const [deleteIpId, setDeleteIpId] = useState<string | null>(null);
  const [deleteIpName, setDeleteIpName] = useState<string>("");
  const [deleteIpAssetCount, setDeleteIpAssetCount] = useState<number>(0);

  const handleOpenEditIp = (ip: any) => {
    setEditingIp(ip);
    setIpName(ip.name);
    setIpPath(ip.path || "");
    setIpInspiration(ip.inspiration || "");
    setIpDescription(ip.description || "");
    setIpAvatarPath(ip.avatar_path || null);
    setIsAvatarFromAsset(false);
    setIsIpModalOpen(true);
  };

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
        setIsAvatarFromAsset(false);
      }
    } catch (e) {
      console.error("选择头像失败:", e);
    }
  };

  const handleSaveIp = async () => {
    if (!ipName.trim()) {
      toast({ title: "请输入 IP 名字" });
      return;
    }
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
      toast({ title: "保存失败", description: "路径标识无可用的合法字符", variant: "destructive" });
      return;
    }
    try {
      if (editingIp) {
        const isAvatarChanged = ipAvatarPath && ipAvatarPath !== editingIp.avatar_path;

        const updated = await ipApi.update(
          editingIp.id,
          ipName,
          finalPath,
          ipInspiration || undefined,
          ipDescription || undefined,
          (isAvatarChanged && !isAvatarFromAsset) ? undefined : (ipAvatarPath || undefined),
          (isAvatarChanged && isAvatarFromAsset) ? false : undefined
        );

        if (isAvatarChanged && ipAvatarPath && !isAvatarFromAsset) {
          await autoArchiveAvatar(ipAvatarPath, updated);
        }

        toast({ title: "保存成功", description: "IP 形象已成功更新" });
        setIsIpModalOpen(false);
        setSidebarKey(prev => prev + 1);
        loadArchivedImages();
      }
    } catch (e) {
      console.error(e);
      toast({ title: "保存失败", description: "保存数据时发生错误", variant: "destructive" });
    }
  };

  const handleDeleteIp = (id: string) => {
    if (id === "unknown") {
      toast({ title: "删除失败", description: "系统默认的未知形象不可删除", variant: "destructive" });
      return;
    }
    const name = ipDetail?.ip.name || "该 IP 形象";
    const assetCount = ipDetail?.ip_images?.length || 0;
    
    setDeleteIpId(id);
    setDeleteIpName(name);
    setDeleteIpAssetCount(assetCount);
  };

  const executeDeleteIp = async (keepImages: boolean) => {
    if (!deleteIpId) return;
    try {
      await ipApi.delete(deleteIpId, keepImages);
      toast({
        title: "删除成功",
        description: keepImages ? "IP 形象已删除，图片资产已移至待整理" : "IP 形象及其全部图片已删除",
      });
      if (selectedIpId === deleteIpId) {
        setSelectedIpId(null);
        setIpDetail(null);
      }
      setDeleteIpId(null);
      setSidebarKey(prev => prev + 1);
      loadArchivedImages();
    } catch (e) {
      console.error(e);
      toast({
        title: "删除失败",
        description: "删除 IP 形象时发生错误",
        variant: "destructive",
      });
    }
  };

  // 表情包套件状态
  const [selectedPackId, setSelectedPackId] = useState<string>("__ALL__");
  const [isPackModalOpen, setIsPackModalOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<IpStickerPack | null>(null);
  const [packName, setPackName] = useState("");
  const [packPath, setPackPath] = useState("");
  const [packDescription, setPackDescription] = useState("");

  // 关系链状态
  const [ips, setIps] = useState<any[]>([]);
  const [isRelationModalOpen, setIsRelationModalOpen] = useState(false);
  const [relationTargetId, setRelationTargetId] = useState("");
  const [relationType, setRelationType] = useState("朋友");
  const [relationDesc, setRelationDesc] = useState("");

  // 大图查看器 & 去水印 & 临时状态 (for Emojis / large preview)
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number>(-1);
  const [imageTimestamp, setImageTimestamp] = useState<number>(Date.now());
  const [isWatermarkModalOpen, setIsWatermarkModalOpen] = useState(false);
  const [isProcessingWatermark, setIsProcessingWatermark] = useState(false);
  const [activeWatermarkPath, setActiveWatermarkPath] = useState<string | null>(null);

  const settings = useUIStore((state) => state.settings);
  const showFullImage = settings?.showFullImage ?? false;

  const loadIps = async () => {
    try {
      const list = await ipApi.getAll();
      setIps(list);
    } catch (e) {
      console.error(e);
    }
  };

  // 根据选中的表情套件过滤表情图片
  const currentEmojis = useMemo(() => {
    if (!ipDetail) return [];
    if (selectedPackId === "__ALL__") return ipDetail.emojis;
    if (selectedPackId === "__UNGROUPED__") return ipDetail.emojis.filter((e) => !e.pack_id);
    return ipDetail.emojis.filter((e) => e.pack_id === selectedPackId);
  }, [ipDetail, selectedPackId]);

  // 表情/关系 API 处理器
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
        const words = paths.map(() => null);
        await ipApi.addEmojis(selectedIpId, targetPackId, paths, words);
        toast({ title: "导入成功", description: "表情图片已拷贝并添加至 IP 表情库" });
        loadArchivedImages();
      }
    } catch (e) {
      console.error("导入表情图失败:", e);
      toast({ title: "导入失败", variant: "destructive" });
    }
  };

  const executeDeleteEmoji = async (emojiId: string) => {
    if (!selectedIpId) return;
    try {
      await ipApi.deleteEmojis([emojiId]);
      toast({ title: "已删除表情", description: "已彻底从表情库中删除该表情" });
      loadArchivedImages();
    } catch (e) {
      console.error("删除表情失败:", e);
      toast({ title: "删除失败", variant: "destructive" });
    }
  };

  const handleMoveEmoji = async (emojiId: string, packId: string | null) => {
    if (!selectedIpId) return;
    try {
      await ipApi.moveEmojisToPack([emojiId], packId);
      toast({ title: "移动成功", description: "已成功更新该表情的分组" });
      loadArchivedImages();
    } catch (e) {
      console.error("移动表情失败:", e);
      toast({ title: "移动失败", variant: "destructive" });
    }
  };

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
      loadArchivedImages();
    } catch (e: any) {
      console.error(e);
      toast({ title: editingPack ? "更新失败" : "新建失败", description: e.message || "操作失败", variant: "destructive" });
    }
  };

  const handleDeletePack = async (packId: string) => {
    if (!confirm("确定要删除整个表情包套件吗？这会级联删除此套件下的所有表情图！") || !selectedIpId) return;
    try {
      await ipApi.deleteStickerPack(packId);
      toast({ title: "删除成功" });
      loadArchivedImages();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateEmojiWord = async (emojiId: string, word: string) => {
    try {
      await ipApi.updateEmojiTriggerWord(emojiId, word || undefined);
    } catch (e) {
      console.error(e);
    }
  };

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
        const context = canvas.getContext("2d");
        if (context) {
          context.drawImage(img, 0, 0);
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

  const handleSaveRelation = async () => {
    if (!relationTargetId || !selectedIpId) return;
    try {
      await ipApi.addRelation(selectedIpId, relationTargetId, relationType, relationDesc || undefined);
      let backRelation = "搭档";
      if (relationType === "朋友") backRelation = "朋友";
      if (relationType === "宿敌") backRelation = "宿敌";
      if (relationType === "兄弟姐妹") backRelation = "兄弟姐妹";
      if (relationType === "变体") backRelation = "变体";
      if (relationType === "导师") backRelation = "学生/徒弟";
      if (relationType === "学生/徒弟") backRelation = "导师";

      await ipApi.addRelation(relationTargetId, selectedIpId, backRelation, `${ipDetail?.ip.name} 建立的关联`);

      toast({ title: "关系建立成功" });
      setIsRelationModalOpen(false);
      if (selectedIpId) loadIpDetail(selectedIpId);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteRelation = async (targetId: string, typeStr: string) => {
    if (!confirm("确定要解除这个关系吗？") || !selectedIpId) return;
    try {
      await ipApi.removeRelation(selectedIpId, targetId, typeStr);
      let backRelation = "搭档";
      if (typeStr === "朋友") backRelation = "朋友";
      if (typeStr === "宿敌") backRelation = "宿敌";
      if (typeStr === "兄弟姐妹") backRelation = "兄弟姐妹";
      if (typeStr === "变体") backRelation = "变体";
      if (typeStr === "导师") backRelation = "学生/徒弟";
      if (typeStr === "学生/徒弟") backRelation = "导师";

      await ipApi.removeRelation(targetId, selectedIpId, backRelation);
      toast({ title: "关系解除成功" });
      if (selectedIpId) loadIpDetail(selectedIpId);
    } catch (e) {
      console.error(e);
    }
  };

  // Watermark removal in preview
  const handleRemoveWatermark = async (method: "gemini" | "general") => {
    const currentPath = activeWatermarkPath || (previewIndex >= 0 && previewImages.length > 0 ? previewImages[previewIndex] : null);
    if (!currentPath) {
      toast({ title: "错误", description: "未指定待处理的图片路径", variant: "destructive" });
      return;
    }

    try {
      setIsProcessingWatermark(true);
      const ext = currentPath.split('.').pop() || 'png';
      const lastSeparator = Math.max(currentPath.lastIndexOf('/'), currentPath.lastIndexOf('\\'));
      const outputDir = currentPath.substring(0, lastSeparator + 1);
      const filename = currentPath.substring(lastSeparator + 1);
      const baseName = filename.replace(/\.[^/.]+$/, '');
      const tempPath = `${outputDir}${baseName}_temp_${Date.now()}.${ext}`;

      let success = false;
      const { geminiWatermarkApi, watermarkApi } = await import("@/services/tauri");
      if (method === "gemini") {
        const result = await geminiWatermarkApi.autoRemove(currentPath, tempPath);
        success = result.success;
      } else {
        const result = await watermarkApi.remove(currentPath, tempPath, undefined);
        success = result.success;
      }

      if (success) {
        const { mkdir, exists, rename } = await import("@tauri-apps/plugin-fs");
        const { join } = await import("@tauri-apps/api/path");
      const { getAppRoot } = await import("@/lib/pathUtils");
        const appDir = await getAppRoot();
        const trashDir = await join(appDir, "trash");
        if (!(await exists(trashDir))) {
          await mkdir(trashDir, { recursive: true });
        }
        const trashPath = await join(trashDir, `${baseName}_${Date.now()}.${ext}`);
        await rename(currentPath, trashPath);
        await rename(tempPath, currentPath);
        
        toast({ title: "✓ 水印移除成功", description: "原图已移至回收站" });
        setImageTimestamp(Date.now());
        setIsWatermarkModalOpen(false);
        setActiveWatermarkPath(null);
        if (selectedIpId) loadIpDetail(selectedIpId);
      } else {
        toast({ title: "✗ 水印移除失败", description: "水印移除算法未能成功处理图片", variant: "destructive" });
      }
    } catch (e) {
      console.error(e);
      toast({ title: "去水印失败", description: "去水印过程中发生错误", variant: "destructive" });
    } finally {
      setIsProcessingWatermark(false);
    }
  };

  const handleBatchSetWatermark = async (hasWatermark: boolean) => {
    if (selectedImages.length === 0) return;

    setIsUpdatingWatermark(true);
    let successCount = 0;
    let failCount = 0;

    for (const imageId of selectedImages) {
      const image = archivedImages.find((img) => img.id === imageId);
      if (!image) continue;

      try {
        const updated = await ipImageApi.update({
          ip_image_id: imageId,
          ip_ids: image.ip_ids || [image.ip_id],
          primary_ip_id: image.primary_ip_id || image.ip_id,
          tags: image.tags.map((t) => t.name),
          has_watermark: hasWatermark,
          watermark_platform: hasWatermark ? "unknown" : undefined,
        });

        updateImage(imageId, updated);
        successCount++;
      } catch (err) {
        console.error(`Failed to update watermark for image ${imageId}:`, err);
        failCount++;
      }
    }

    setIsUpdatingWatermark(false);
    clearSelection();
    
    toast({
      title: `✓ 批量修改水印完成`,
      description: `已成功标记 ${successCount} 张图片，失败 ${failCount} 张`,
      variant: failCount > 0 ? "destructive" : "default",
    });
  };

  const [isConvertingWebp, setIsConvertingWebp] = useState(false);
  const handleBatchConvertFormat = async (format: 'webp' | 'png') => {
    if (selectedImages.length === 0) return;
    setIsConvertingWebp(true);
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    const formatName = format === 'webp' ? 'WebP' : 'PNG';
    const loadingToast = toast({
      title: `正在批量转为 ${formatName}`,
      description: "图片压缩优化中...",
      duration: 100000,
    });

    try {
      const { convertIpImageToWebp, convertIpImageToPng } = await import("@/lib/webpConverter");
      for (const imageId of selectedImages) {
        const image = archivedImages.find((img) => img.id === imageId);
        if (!image) continue;
        
        if (image.format?.toLowerCase() === format) {
          skippedCount++;
          continue;
        }

        try {
          if (format === 'webp') {
            await convertIpImageToWebp(image as any);
          } else {
            await convertIpImageToPng(image as any);
          }
          successCount++;
        } catch (err) {
          console.error(`Failed to convert image ${imageId} to ${formatName}:`, err);
          failCount++;
        }
      }
    } finally {
      setIsConvertingWebp(false);
      loadingToast.dismiss();
      clearSelection();
      
      toast({
        title: `批量转为 ${formatName} 完成`,
        description: `成功转换 ${successCount} 张，跳过 ${skippedCount} 张，失败 ${failCount} 张`,
        variant: failCount > 0 ? "destructive" : "default",
      });
    }
  };

  const [showFilters, setShowFilters] = useState(false);
  const [filterEmojiPack, setFilterEmojiPack] = useState<string>("all");
  const [filterTagId, setFilterTagId] = useState<string>("all");
  const [filterHasWatermark, setFilterHasWatermark] = useState<boolean | null>(null);
  const activeFilterCount = [
    filterEmojiPack !== "all",
    filterTagId !== "all",
    filterHasWatermark !== null
  ].filter(Boolean).length;

  useEffect(() => {
    loadArchivedImages();
    loadIps();
  }, []);

  // Clear selection when IP tab or activeTab changes
  useEffect(() => {
    clearSelection();
  }, [selectedIpId, activeTab, clearSelection]);

  useEffect(() => {
    if (selectedIpId) {
      loadIpDetail(selectedIpId);
    } else {
      setIpDetail(null);
    }
  }, [selectedIpId]);

  useEffect(() => {
    if (selectedIpId && activeTab === "works") {
      loadIpRoles();
    }
  }, [selectedIpId, activeTab]);

  const loadIpRoles = async () => {
    if (!selectedIpId) return;
    setIsLoadingIpRoles(true);
    try {
      const { getIpCharacters } = await import("@/services/tauri");
      const roles = await getIpCharacters(selectedIpId);
      setIpRoles(roles);
    } catch (e) {
      console.error("Failed to load IP roles:", e);
      toast({
        title: "加载失败",
        description: "无法加载参与作品角色列表",
        variant: "destructive",
      });
    } finally {
      setIsLoadingIpRoles(false);
    }
  };

  // 当 QuickEditModal 关闭时，刷新侧边栏和 IP 详情（头像可能已更新）
  const prevQuickEditOpen = useRef(false);
  useEffect(() => {
    if (prevQuickEditOpen.current && !isQuickEditOpen) {
      // 弹窗刚关闭，刷新侧边栏 IP 列表
      setSidebarKey(prev => prev + 1);
      // 同时刷新当前选中 IP 的详情（顶部头像）
      if (selectedIpId) {
        loadIpDetail(selectedIpId);
      }
      // 重新加载图片列表，让 ImageCard 重新检查头像状态
      loadArchivedImages();
    }
    prevQuickEditOpen.current = isQuickEditOpen;
  }, [isQuickEditOpen]);

  const loadIpDetail = async (id: string) => {
    try {
      const data = await ipApi.getDetail(id);
      setIpDetail(data);
    } catch (error) {
      console.error("Failed to load IP details:", error);
    }
  };

  const loadArchivedImages = async () => {
    setLoading(true);
    try {
      const images = await ipImageApi.getArchivedImages();
      setArchivedImages(images);
      if (selectedIpId) {
        await loadIpDetail(selectedIpId);
      }
    } catch (error) {
      console.error("Failed to load archived images:", error);
    } finally {
      setLoading(false);
    }
  };



  // Filter images
  const filteredImages = archivedImages.filter((image) => {
    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase().trim();
      const keywords = query.split(/\s+/).filter(k => k.length > 0);
      
      const matchesSearch = keywords.every(keyword => {
        return (
          image.filename.toLowerCase().includes(keyword) ||
          image.original_filename?.toLowerCase().includes(keyword) ||
          image.format?.toLowerCase().includes(keyword) ||
          image.watermark_platform?.toLowerCase().includes(keyword) ||
          image.tags.some((tag) => tag.name.toLowerCase().includes(keyword)) ||
          image.ip_name?.toLowerCase().includes(keyword)
        );
      });
      
      if (!matchesSearch) return false;
    }
    
    // IP 筛选（支持多关联过滤，若有 ip_ids 数组则判断是否包含，否则 fallback 到单个 ip_id）
    if (selectedIpId) {
      const ipIds = image.ip_ids && image.ip_ids.length > 0
        ? image.ip_ids
        : [image.ip_id || "unknown"];
        
      if (!ipIds.includes(selectedIpId)) {
        return false;
      }
    }
    
    // 表情包组筛选
    if (filterEmojiPack !== "all") {
      const isEmoji = ipDetail?.emojis.find(e => e.image_path === image.absolute_path);
      if (filterEmojiPack === "has_none") {
        if (isEmoji) return false;
      } else if (filterEmojiPack === "has_any") {
        if (!isEmoji) return false;
      } else {
        if (!isEmoji || isEmoji.pack_id !== filterEmojiPack) return false;
      }
    }

    // Tags 筛选
    if (filterTagId !== "all") {
      const hasTags = image.tags.length > 0;
      if (filterTagId === "has_none") {
        if (hasTags) return false;
      } else if (filterTagId === "has_any") {
        if (!hasTags) return false;
      } else {
        if (!image.tags.some(t => t.id === filterTagId)) return false;
      }
    }
    
    // 水印筛选
    if (filterHasWatermark !== null) {
      if (image.has_watermark !== filterHasWatermark) return false;
    }
    
    return true;
  });

  const sortedImages = useMemo(() => {
    const result = [...filteredImages];
    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "time") {
        const dateA = a.created_at || "";
        const dateB = b.created_at || "";
        comparison = dateA.localeCompare(dateB);
      } else if (sortBy === "size") {
        const sizeA = a.file_size || 0;
        const sizeB = b.file_size || 0;
        comparison = sizeA - sizeB;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
    return result;
  }, [filteredImages, sortBy, sortOrder]);

  const allAvailableTags = useMemo(() => {
    const tagsMap = new Map<string, any>();
    archivedImages.forEach(img => {
      img.tags.forEach(tag => tagsMap.set(tag.id, tag));
    });
    return Array.from(tagsMap.values());
  }, [archivedImages]);

  const ipImageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    archivedImages.forEach((image) => {
      const ipIds = image.ip_ids && image.ip_ids.length > 0
        ? image.ip_ids
        : [image.ip_id || "unknown"];
        
      ipIds.forEach((ipId) => {
        counts[ipId] = (counts[ipId] || 0) + 1;
      });
    });
    return counts;
  }, [archivedImages]);

  const isAllSelected = sortedImages.length > 0 &&
    sortedImages.every((img) => selectedImages.includes(img.id));

  const handleQuickUpload = async () => {
    if (!selectedIpId || !ipDetail) return;
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "webp", "gif"]
        }]
      });
      
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      if (paths.length === 0) return;

      setIsQuickUploading(true);
      const { join } = await import("@tauri-apps/api/path");
      const { getAppRoot } = await import("@/lib/pathUtils");
      const { copyFile, exists, mkdir, stat } = await import("@tauri-apps/plugin-fs");
      const { settings } = useUIStore.getState();

      let inboxDir: string;
      if (settings.customIpInboxPath) {
        inboxDir = settings.customIpInboxPath;
      } else {
        const appDir = await getAppRoot();
        inboxDir = await join(appDir, "ip_inbox");
      }
      if (!(await exists(inboxDir))) {
        await mkdir(inboxDir, { recursive: true });
      }

      let libraryPath: string;
      if (settings.customIpArchivedPath) {
        libraryPath = settings.customIpArchivedPath;
      } else {
        libraryPath = await getAppRoot();
      }
      const namingTemplate = settings.ipNamingTemplate || "{ip}-{date}-{time}";

      let successCount = 0;
      let failCount = 0;

      for (const imgPath of paths) {
        try {
          const fileName = imgPath.split(/[/\\]/).pop() || "image.png";
          let fileSize = 0;
          try {
            const fileMeta = await stat(imgPath);
            fileSize = fileMeta.size;
          } catch (error) {
            console.error(`Failed to get metadata for ${imgPath}:`, error);
          }

          const timestamp = Date.now();
          const uniqueFileName = `${timestamp}_${fileName}`;
          const targetPath = await join(inboxDir, uniqueFileName);

          await copyFile(imgPath, targetPath);

          const importResult = await ipImageApi.import({
            file_path: targetPath,
            file_name: fileName,
            file_size: fileSize,
            ip_id: selectedIpId,
            tags: [],
          });

          const archiveResult = await ipImageApi.archive([importResult.id], libraryPath, namingTemplate);
          if (archiveResult.success_count > 0) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (err) {
          console.error("Failed to upload image:", err);
          failCount++;
        }
      }

      toast({
        title: "上传并归档完成",
        description: `成功 ${successCount} 张，失败 ${failCount} 张`,
        variant: failCount > 0 ? "destructive" : "default",
      });
      loadArchivedImages();
    } catch (e) {
      console.error("Quick upload error:", e);
      toast({ title: "上传失败", variant: "destructive" });
    } finally {
      setIsQuickUploading(false);
    }
  };

  const handleUnarchive = async () => {
    if (selectedImages.length === 0) return;

    setIsUnarchiving(true);
    setUnarchiveResult(null);

    try {
      // 使用自定义 inbox 路径或默认路径
      let inboxPath: string;
      const customPath = useUIStore.getState().settings.customInboxPath;
      
      if (customPath) {
        inboxPath = customPath;
      } else {
        const { getAppRoot } = await import("@/lib/pathUtils");
        inboxPath = await getAppRoot();
      }

      const result = await ipImageApi.archive(selectedImages, inboxPath);

      if (result.success_count > 0) {
        // Remove unarchived images from archived view
        for (const id of selectedImages) {
          removeImage(id);
        }
        clearSelection();

        let msg = `成功撤销归档 ${result.success_count} 张图片`;
        if (result.skipped_count > 0) msg += `，跳过 ${result.skipped_count} 张`;
        if (result.failed_count > 0) msg += `，失败 ${result.failed_count} 张`;
        setUnarchiveResult(msg);
      } else if (result.skipped_count > 0) {
        setUnarchiveResult(`跳过了 ${result.skipped_count} 张图片（未归档）`);
      }

      // Clear message after 5 seconds
      setTimeout(() => setUnarchiveResult(null), 5000);
    } catch (error) {
      console.error("Unarchive failed:", error);
      setUnarchiveResult("撤销归档失败");
      setTimeout(() => setUnarchiveResult(null), 5000);
    } finally {
      setIsUnarchiving(false);
    }
  };

  const handleUnarchiveSingle = async (imageId: string) => {
    setIsUnarchiving(true);
    setUnarchiveResult(null);

    try {
      // 使用自定义 inbox 路径或默认路径
      let inboxPath: string;
      const customPath = useUIStore.getState().settings.customInboxPath;
      
      if (customPath) {
        inboxPath = customPath;
      } else {
        const { getAppRoot } = await import("@/lib/pathUtils");
        inboxPath = await getAppRoot();
      }

      const result = await ipImageApi.archive([imageId], inboxPath);

      if (result.success_count > 0) {
        removeImage(imageId);
        deselectImage(imageId);
        setUnarchiveResult(`成功撤销归档 1 张图片`);
      } else {
        setUnarchiveResult(`撤销归档失败：${result.errors.join(', ')}`);
      }

      // Clear message after 3 seconds
      setTimeout(() => setUnarchiveResult(null), 3000);
    } catch (error) {
      console.error("Unarchive failed:", error);
      setUnarchiveResult("撤销归档失败");
      setTimeout(() => setUnarchiveResult(null), 3000);
    } finally {
      setIsUnarchiving(false);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    try {
      const success = await ipImageApi.delete(imageId);
      if (success) {
        removeImage(imageId);
        if (selectedImages.includes(imageId)) {
          deselectImage(imageId);
        }
      }
    } catch (error) {
      console.error("Failed to delete image:", error);
      toast({
        title: "✗ 删除图片失败",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const handleBatchDelete = () => {
    if (selectedImages.length === 0) return;
    setBatchDeleteStep(1);
  };

  const executeBatchDelete = async () => {
    setBatchDeleteStep(0);

    let successCount = 0;
    let failCount = 0;

    for (const imageId of selectedImages) {
      try {
        const success = await ipImageApi.delete(imageId);
        if (success) {
          removeImage(imageId);
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error(`Failed to delete image ${imageId}:`, error);
        failCount++;
      }
    }

    clearSelection();

    if (failCount > 0) {
      toast({
        title: "删除完成",
        description: `成功 ${successCount} 张，失败 ${failCount} 张`,
        variant: failCount === selectedImages.length ? "destructive" : "default",
      });
    }
  };

  return (
    <div className="flex h-full relative">
      {/* Sidebar - IP Tree */}
      <div className={cn(
        "absolute inset-y-0 left-0 z-50 transform transition-transform duration-300 md:relative md:transform-none",
        isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <IpSidebar
          key={sidebarKey}
          onIpSelect={setSelectedIpId}
          selectedIpId={selectedIpId}
          imageCounts={ipImageCounts}
          totalCount={archivedImages.length}
          onRefreshImages={loadArchivedImages}
          onClose={() => setIsMobileSidebarOpen(false)}
        />
      </div>

      {/* Mobile overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="absolute inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* IP 详情 Header */}
        {selectedIpId && ipDetail && (
          <div className="p-6 border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/45 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" className="md:hidden shrink-0 -ml-2" onClick={() => setIsMobileSidebarOpen(true)}>
                <Menu className="w-5 h-5" />
              </Button>
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted border shadow-sm">
                {ipDetail.ip.avatar_path ? (
                  <img
                    src={convertFileSrc(ipDetail.ip.avatar_path)}
                    alt={ipDetail.ip.name}
                    className={`w-full h-full ${showFullImage ? "object-contain bg-background/50" : "object-cover"}`}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <Users className="w-8 h-8 opacity-40" />
                  </div>
                )}
              </div>

              <div>
                <h1 className="text-2xl font-bold flex items-center gap-3">
                  {ipDetail.ip.name}
                  <Badge variant="secondary">IP 形象</Badge>
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  创建于 {new Date(ipDetail.ip.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {ipDetail.ip.id !== "unknown" && (
                <>
                  <Button variant="outline" size="sm" onClick={() => handleOpenEditIp(ipDetail.ip)} className="gap-1">
                    <Pencil className="w-4 h-4" />
                    编辑资料
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDeleteIp(ipDetail.ip.id)} className="gap-1">
                    <Trash2 className="w-4 h-4" />
                    删除 IP
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {selectedIpId && !ipDetail && (
          <div className="p-6 border-b bg-card/80 backdrop-blur flex items-center gap-4 shadow-sm">
            <Skeleton className="w-16 h-16 rounded-lg animate-pulse" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-32 animate-pulse" />
              <Skeleton className="h-4 w-48 animate-pulse" />
            </div>
          </div>
        )}

        {/* Tab Headers (Only shown if selectedIpId is not null) */}
        {selectedIpId && ipDetail && (
          <div className="border-b px-6 bg-card/40 z-10 flex-shrink-0">
            <div className="flex gap-4">
              {[
                { id: "creations", label: "归档资产", icon: Sparkles },
                { id: "emojis", label: "表情包管理", icon: Smile },
                { id: "relations", label: "关系链谱", icon: Link },
                ...((settings?.showIpWorksTab ?? true) ? [{ id: "works", label: "参与作品", icon: Film }] : []),
                { id: "profile", label: "基本设定", icon: BookOpen },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 py-3 px-1 text-sm font-medium border-b-2 transition-all duration-200 relative ${
                      isActive
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Workspace area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
            <>
              {/* === TAB: 归档资产 === */}
              {(!selectedIpId || activeTab === "creations") && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Header */}
              <div className="border-b px-4 py-3 flex items-center justify-between bg-card shadow-sm z-10 flex-shrink-0">
                <div className="flex items-center gap-4">
                  {!selectedIpId ? (
                    <>
                      <Button variant="ghost" size="icon" className="md:hidden shrink-0 -ml-2" onClick={() => setIsMobileSidebarOpen(true)}>
                        <Menu className="w-5 h-5" />
                      </Button>
                      <h2 className="text-lg font-semibold flex items-center gap-2 whitespace-nowrap shrink-0">
                        <Archive className="w-5 h-5 shrink-0" />
                        全部资产
                      </h2>
                      <Badge variant="secondary" className="whitespace-nowrap shrink-0">{filteredImages.length} 张图片</Badge>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" className="md:hidden shrink-0 -ml-2" onClick={() => setIsMobileSidebarOpen(true)}>
                        <Menu className="w-5 h-5" />
                      </Button>
                      <Badge variant="secondary">{filteredImages.length} 张图片</Badge>
                    </>
                  )}
                  <Button variant="outline" size="sm" className="gap-2" onClick={loadArchivedImages} disabled={isLoading}>
                    <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                    刷新
                  </Button>
                  <div className="pl-2 border-l border-border h-6 flex items-center">
                    <SyncButton />
                  </div>
                  {selectedIpId && (
                    <Button variant="ghost" size="sm" onClick={() => setSelectedIpId(null)}>
                      清除筛选
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="搜索 (文件名/IP形象/标签/格式/水印平台...)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-9 w-80"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* 筛选按钮 */}
                  <Button
                    variant={showFilters ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className="gap-2"
                  >
                    <Filter className="w-4 h-4" />
                    筛选
                    {activeFilterCount > 0 && (
                      <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>

                  {/* 排序 */}
                  <select
                    value={`${sortBy}-${sortOrder}`}
                    onChange={(e) => {
                      const [by, order] = e.target.value.split("-") as [("time" | "size"), ("asc" | "desc")];
                      setSortBy(by);
                      setSortOrder(order);
                    }}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground focus:text-foreground cursor-pointer"
                  >
                    <option value="time-desc">时间降序 (最新)</option>
                    <option value="time-asc">时间升序 (最早)</option>
                    <option value="size-desc">大小降序 (从大到小)</option>
                    <option value="size-asc">大小升序 (从小到大)</option>
                  </select>

                  {/* 视图切换 */}
                  <div className="flex items-center border rounded-md overflow-hidden">
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`p-1.5 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                      title="网格视图"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode("list")}
                      className={`p-1.5 transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                      title="列表视图"
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* 筛选面板 */}
              {showFilters && (
                <div className="border-b px-4 py-3 bg-muted/20 space-y-3 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">筛选条件</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFilterEmojiPack("all");
                        setFilterTagId("all");
                        setFilterHasWatermark(null);
                      }}
                      className="h-7 text-xs"
                    >
                      清除全部
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    {/* 表情包组 筛选 */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">关联表情包组</label>
                      <select
                        value={filterEmojiPack}
                        onChange={(e) => setFilterEmojiPack(e.target.value)}
                        disabled={!selectedIpId}
                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground focus:text-foreground cursor-pointer disabled:opacity-50"
                      >
                        <option value="all">{!selectedIpId ? "请先选择IP" : "全部"}</option>
                        {selectedIpId && (
                          <>
                            <option value="has_any">已关联</option>
                            <option value="has_none">未关联</option>
                            {ipDetail?.sticker_packs.map(pack => (
                              <option key={pack.id} value={pack.id}>{pack.name}</option>
                            ))}
                          </>
                        )}
                      </select>
                    </div>

                    {/* Tags 筛选 */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">标签</label>
                      <select
                        value={filterTagId}
                        onChange={(e) => setFilterTagId(e.target.value)}
                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground focus:text-foreground cursor-pointer"
                      >
                        <option value="all">全部</option>
                        <option value="has_any">有标签</option>
                        <option value="has_none">无标签</option>
                        {allAvailableTags.map(tag => (
                          <option key={tag.id} value={tag.id}>{tag.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* 水印筛选 */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">水印</label>
                      <select
                        value={filterHasWatermark === null ? "" : String(filterHasWatermark)}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFilterHasWatermark(val === "" ? null : val === "true");
                        }}
                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground focus:text-foreground cursor-pointer"
                      >
                        <option value="">全部</option>
                        <option value="true">有水印</option>
                        <option value="false">无水印</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Unarchive result notification */}
              {unarchiveResult && (
                <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 text-blue-800 text-sm flex-shrink-0">
                  {unarchiveResult}
                </div>
              )}

              {/* Toolbar - Always reserve space */}
              <div className="border-b px-4 py-2 bg-muted/30 min-h-[44px] flex items-center flex-shrink-0">
                {filteredImages.length > 0 ? (
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() =>
                        isAllSelected ? clearSelection() : selectAll(sortedImages.map((img) => img.id))
                      }
                      className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                    >
                      {isAllSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      {isAllSelected ? "取消全选" : "全选"}
                    </button>
                    {selectedImages.length > 0 && (
                      <>
                        <span className="text-sm text-muted-foreground flex items-center gap-1 border-r pr-3 mr-1">
                          已选择 {selectedImages.length} 张
                          <button onClick={clearSelection} className="text-muted-foreground hover:text-foreground p-0.5 rounded-md hover:bg-muted transition-colors" title="清空选中">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                        <Button variant="ghost" size="sm" className="gap-1 h-7"
                          onClick={() => setShowBatchEdit(true)}>
                          <Edit2 className="w-3 h-3" />
                          批量编辑
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 h-7"
                              disabled={isUpdatingWatermark}
                            >
                              {isUpdatingWatermark ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <AlertCircle className="w-3 h-3 text-orange-500" />
                              )}
                              标记水印
                              <ChevronDown className="w-3 h-3 opacity-50" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem
                              onClick={() => handleBatchSetWatermark(true)}
                              className="text-orange-600 dark:text-orange-400 cursor-pointer"
                            >
                              <AlertCircle className="w-3.5 h-3.5 mr-2" />
                              标记有水印
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleBatchSetWatermark(false)}
                              className="text-green-600 dark:text-green-400 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5 mr-2" />
                              标记无水印
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 h-7 text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
                      disabled={isConvertingWebp}
                    >
                      {isConvertingWebp ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Minimize className="w-3 h-3" />
                      )}
                      批量图片优化
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => handleBatchConvertFormat('webp')}>转为 WebP</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBatchConvertFormat('png')}>转为 PNG-24</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 h-7"
                          onClick={handleUnarchive}
                          disabled={isUnarchiving}
                        >
                          {isUnarchiving ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Undo2 className="w-3 h-3" />
                          )}
                          撤销归档
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 h-7"
                          onClick={handleBatchDelete}
                        >
                          <Trash2 className="w-3 h-3" />
                          批量删除
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="h-[28px]" /> // Empty placeholder to maintain height
                )}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden">
                {isLoading ? (
                  <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="aspect-square rounded-lg" />
                        <Skeleton className="h-4 w-3/4" />
                      </div>
                    ))}
                  </div>
                ) : filteredImages.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center h-full">
                    <div className="text-center space-y-4">
                      <ImageIcon className="w-16 h-16 mx-auto text-muted-foreground/30" />
                      <div>
                        <p className="text-muted-foreground">暂无归档图片</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          在待整理中标记图片后，点击归档
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <ScrollArea className="h-full">
                    {viewMode === "grid" ? (
                      <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {sortedImages.map((image) => (
                          <ImageCard 
                            key={image.id} 
                            image={image}
                            onDelete={handleDeleteImage}
                            onArchive={handleUnarchiveSingle}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 space-y-2">
                        {sortedImages.map((image) => (
                          <ImageCard
                            key={image.id}
                            image={image}
                            onDelete={handleDeleteImage}
                            onArchive={handleUnarchiveSingle}
                            listMode
                          />
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                )}
              </div>

              {selectedIpId && (
                <Button
                  className="absolute bottom-8 right-8 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all"
                  size="icon"
                  onClick={handleQuickUpload}
                  disabled={isQuickUploading}
                  title="快速上传图片到当前IP"
                >
                  {isQuickUploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Plus className="h-6 w-6" />}
                </Button>
              )}
            </div>
          )}

          {/* === TAB: 表情包管理 === */}
          {selectedIpId && ipDetail && activeTab === "emojis" && (
            <div className="h-full flex overflow-hidden p-6 gap-4">
              {/* 表情包套件列表 (左小栏) */}
              <div className="w-64 border-r bg-muted/10 flex flex-col flex-shrink-0 rounded-lg overflow-hidden border">
                <div className="flex items-center justify-between p-4 border-b bg-card">
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

                <ScrollArea className="flex-1 p-2">
                  <div className="flex flex-col gap-1">
                    {/* 虚拟分类: 全部表情 */}
                    <div
                      onClick={() => setSelectedPackId("__ALL__")}
                      className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-all duration-150 text-sm ${
                        selectedPackId === "__ALL__" ? "bg-secondary font-medium" : "hover:bg-accent/50"
                      }`}
                    >
                      <span className="truncate text-xs">全部表情</span>
                      <Badge variant="outline" className="font-normal text-xs px-1.5 py-0 min-w-[20px] h-5 justify-center border-none bg-muted/50 text-muted-foreground">{ipDetail.emojis.length}</Badge>
                    </div>
                    {/* 虚拟分类: 未分组表情 */}
                    <div
                      onClick={() => setSelectedPackId("__UNGROUPED__")}
                      className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-all duration-150 text-sm ${
                        selectedPackId === "__UNGROUPED__" ? "bg-secondary font-medium" : "hover:bg-accent/50"
                      }`}
                    >
                      <span className="truncate text-xs">未分组表情</span>
                      <Badge variant="outline" className="font-normal text-xs px-1.5 py-0 min-w-[20px] h-5 justify-center border-none bg-muted/50 text-muted-foreground">{ipDetail.emojis.filter(e => !e.pack_id).length}</Badge>
                    </div>

                    {ipDetail.sticker_packs.length > 0 && (
                      <div className="flex flex-col gap-1 mt-2 border-t pt-2">
                        {ipDetail.sticker_packs.map((pack) => {
                          const isSelected = selectedPackId === pack.id;
                          const packEmojis = ipDetail.emojis.filter((e) => e.pack_id === pack.id);
                          return (
                            <div
                              key={pack.id}
                              onClick={() => setSelectedPackId(pack.id)}
                              className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-all duration-150 group/item text-sm ${
                                isSelected ? "bg-secondary font-medium" : "hover:bg-accent/50"
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
              </div>

              {/* 表情包网格 (中间大网格) */}
              <div className="flex-1 border rounded-lg p-4 flex flex-col gap-3 bg-card/20 overflow-hidden min-w-0">
                <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-sm">
                        {selectedPackId === "__ALL__"
                          ? "全部表情"
                          : selectedPackId === "__UNGROUPED__"
                          ? "未分组表情"
                          : ipDetail.sticker_packs.find((p) => p.id === selectedPackId)?.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {selectedPackId === "__ALL__"
                          ? "当前 IP 形象下的所有表情包图片"
                          : selectedPackId === "__UNGROUPED__"
                          ? "尚未归类到任何表情包套件的表情"
                          : ipDetail.sticker_packs.find((p) => p.id === selectedPackId)?.description || "无套件描述"}
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
                      <div className="p-4 grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {currentEmojis.map((emoji, index) => {
                          return (
                            <div
                              key={emoji.id}
                              className="group relative rounded-md border bg-card p-1 flex flex-col gap-1.5 hover:shadow-md transition-all duration-300"
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
                                {/* Overlay with actions */}
                                <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-white hover:bg-white/20 rounded-full"
                                    onClick={() => handleCopyEmoji(emoji.image_path)}
                                    title="复制到剪贴板"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-white hover:bg-white/20 rounded-full"
                                    onClick={() => {
                                      setActiveWatermarkPath(emoji.image_path);
                                      setIsWatermarkModalOpen(true);
                                    }}
                                    title="去水印"
                                  >
                                    <Sparkles className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-white hover:bg-destructive/80 rounded-full"
                                    onClick={() => executeDeleteEmoji(emoji.id)}
                                    title="删除"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>

                              {/* Emoji trigger word / details */}
                              <div className="px-1 py-0.5 flex flex-col gap-0.5">
                                <input
                                  type="text"
                                  placeholder="添加快捷词..."
                                  defaultValue={emoji.trigger_word || ""}
                                  onBlur={(e) => handleUpdateEmojiWord(emoji.id, e.target.value)}
                                  className="w-full text-[10px] bg-transparent border-none outline-none focus:ring-0 text-foreground/85 placeholder:text-muted-foreground/40 truncate text-center font-mono"
                                />
                                
                                {/* Move dropdown */}
                                <select
                                  value={emoji.pack_id || ""}
                                  onChange={(e) => handleMoveEmoji(emoji.id, e.target.value || null)}
                                  className="w-full text-[9px] bg-transparent border-none text-muted-foreground focus:ring-0 cursor-pointer text-center"
                                >
                                  <option value="">未分组</option>
                                  {ipDetail.sticker_packs.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </div>
            </div>
          )}

          {/* === TAB: 关系链谱 === */}
          {selectedIpId && ipDetail && activeTab === "relations" && (
            <div className="h-full flex flex-col gap-4 p-6 overflow-hidden">
              <div className="flex items-center justify-between flex-shrink-0">
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
                {ipDetail.relations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
                    <Link className="w-10 h-10 opacity-30" />
                    <span className="text-sm">暂无关系链配置，点击右上角“添加关系”</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {ipDetail.relations.map((rel) => (
                      <div
                        key={rel.ip_b_id + rel.relation_type}
                        className="p-4 rounded-xl border bg-card/75 flex flex-col justify-between gap-3 shadow-sm hover:shadow-md transition-all relative group"
                      >
                        <div className="flex items-center gap-3">
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
                          <p className="text-xs text-muted-foreground leading-normal whitespace-pre-line border-t pt-2 font-light">
                            {rel.description}
                          </p>
                        )}

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

          {/* === TAB: 基本设定 === */}
          {selectedIpId && ipDetail && activeTab === "profile" && (
            <ScrollArea className="h-full p-6">
              <div className="flex flex-col gap-6 max-w-4xl">
                {/* 灵感故事 Quote */}
                {ipDetail.ip.inspiration && (
                  <div className="relative overflow-hidden rounded-xl border bg-gradient-to-r from-primary/5 via-primary/10 to-transparent p-6 shadow-sm">
                    <div className="absolute -right-4 -bottom-6 text-primary/10 select-none text-8xl font-serif leading-none font-bold">
                      “
                    </div>
                    <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4" />
                      灵感由来 / 背景故事
                    </h3>
                    <blockquote className="text-foreground/90 italic leading-relaxed whitespace-pre-line text-sm pl-2 border-l-2 border-primary/30">
                      {ipDetail.ip.inspiration}
                    </blockquote>
                  </div>
                )}

                {/* 详细设定 */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-semibold">详细设定 / 设定特征</CardTitle>
                  </CardHeader>
                  <CardContent className="whitespace-pre-line text-sm text-foreground/80 leading-relaxed font-light">
                    {ipDetail.ip.description || "暂无详细设定描述。"}
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          )}

          {/* === TAB: 参与作品 === */}
          {selectedIpId && activeTab === "works" && (
            <div className="h-full flex flex-col">
              <div className="p-4 border-b shrink-0 flex items-center justify-between">
                <div className="text-sm font-medium">参与作品列表</div>
                <Button onClick={() => setIsAssociateModalOpen(true)}>
                  <Link className="w-4 h-4 mr-2" />
                  关联现有角色
                </Button>
              </div>
              <ScrollArea className="flex-1 p-6">
                {isLoadingIpRoles ? (
                  <div className="flex flex-col gap-4">
                    <Skeleton className="h-24 w-full animate-pulse" />
                    <Skeleton className="h-24 w-full animate-pulse" />
                  </div>
                ) : ipRoles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <Film className="w-16 h-16 mb-4 opacity-40" />
                    <p className="text-sm">该 IP 暂无参演的角色作品记录</p>
                    <p className="text-xs text-muted-foreground mt-1 mb-4">您可以点击右上方按钮，或在作品集详情中为角色关联此 IP 资产</p>
                    <Button variant="outline" onClick={() => setIsAssociateModalOpen(true)}>
                      <Link className="w-4 h-4 mr-2" />
                      关联现有角色
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl">
                  {ipRoles.map((role) => (
                    <Card
                      key={role.id}
                      onClick={async () => {
                        // Click to jump to the work details!
                        const { getWorkById } = await import("@/services/tauri");
                        try {
                          const workWithRelations = await getWorkById(role.work_id);
                          const { selectWork } = useWorksStore.getState();
                          const { setIpTab } = useUIStore.getState();
                          selectWork(workWithRelations);
                          setIpTab("works");
                        } catch (e) {
                          console.error("Failed to load work detail for jump:", e);
                        }
                      }}
                      className="cursor-pointer hover:shadow-md transition-shadow group overflow-hidden border bg-card relative"
                    >
                      <CardContent className="p-4 flex gap-4">
                        {/* 角色图片（首张） */}
                        <div className="w-16 h-20 bg-muted rounded overflow-hidden flex-shrink-0 border flex items-center justify-center">
                          {(() => {
                            let imgUrl = "";
                            if (role.image_paths) {
                              try {
                                const paths = JSON.parse(role.image_paths);
                                if (Array.isArray(paths) && paths.length > 0) {
                                  imgUrl = convertFileSrc(paths[0]);
                                }
                              } catch {}
                            }
                            return imgUrl ? (
                              <img src={imgUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            ) : (
                              <Users className="w-6 h-6 text-muted-foreground opacity-40" />
                            );
                          })()}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="font-semibold text-base truncate group-hover:text-primary transition-colors">{role.name}</h3>
                              {role.character_type && (
                                <Badge variant="outline" className="text-xs font-normal shrink-0">
                                  {role.character_type === "protagonist" ? "主角" :
                                   role.character_type === "supporting" ? "配角" :
                                   role.character_type === "antagonist" ? "反派" :
                                   role.character_type === "guest" ? "客串" : "其他"}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              出演作品：《{role.work_name}》
                            </p>
                          </div>
                          
                          {role.appearance_info && (
                            <p className="text-xs text-muted-foreground truncate italic">
                              出场：{role.appearance_info}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
          )}
            </>
        </div>
      </div>
      
      {/* Associate Character Modal */}
      {selectedIpId && ipDetail && (
        <IpAssociateCharacterModal
          ipId={selectedIpId}
          ipName={ipDetail.ip.name}
          open={isAssociateModalOpen}
          onOpenChange={setIsAssociateModalOpen}
          onSuccess={() => {
            // refresh roles
            if (selectedIpId) {
              setIsLoadingIpRoles(true);
              import("@tauri-apps/api/core").then(({ invoke }) => {
                invoke("get_ip_roles", { ipId: selectedIpId })
                  .then((roles) => setIpRoles(roles as CharacterWithRelations[]))
                  .catch((e) => console.error("Failed to refresh IP roles:", e))
                  .finally(() => setIsLoadingIpRoles(false));
              });
            }
          }}
        />
      )}

      {/* Batch Edit Modal */}
      <BatchEditModal open={showBatchEdit} onClose={() => setShowBatchEdit(false)} isIpMode={true} />

      {/* ==================== 弹窗: 新建/编辑 表情包套件 ==================== */}
      <Dialog open={isPackModalOpen} onOpenChange={setIsPackModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPack ? "编辑表情包套件" : "新建表情包套件"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">套件名称 *</label>
              <Input
                placeholder="例如: 兔兔日常表情第一弹"
                value={packName}
                onChange={(e) => setPackName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">路径标识 / 目录名</label>
              <Input
                placeholder="例如: bunny-daily-vol1 (留空则自动生成)"
                value={packPath}
                onChange={(e) => setPackPath(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))}
                disabled={!!editingPack}
              />
              {editingPack ? (
                <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium">
                  ⚠️ 为保证文件关联和同步安全，表情包创建后路径标识不可修改
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  限定小写字母、数字、连字符和下划线，用于本地存储文件夹命名。<br/>
                  <span className="text-amber-600 dark:text-amber-500 font-medium">⚠️ 注意：为保证文件关联安全，创建后不可修改</span>
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">描述设定</label>
              <textarea
                placeholder="简述该表情包的主题设定..."
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
              保存套件
            </Button>
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
                placeholder="对该关系链添加细节描述..."
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
          className="w-[95vw] h-[95vh] max-w-[95vw] max-h-[95vh] p-0 border-none bg-black/95 flex flex-col justify-between items-center overflow-hidden select-none outline-none z-50" 
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

              <img
                src={`${convertFileSrc(previewImages[previewIndex])}?t=${imageTimestamp}`}
                alt="大图预览"
                className="max-w-full max-h-full object-contain"
                style={{ maxHeight: "calc(95vh - 80px)" }}
              />

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

      {/* ==================== 弹窗: 编辑 IP 形象 ==================== */}
      <Dialog open={isIpModalOpen} onOpenChange={setIsIpModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑 IP 形象</DialogTitle>
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
                    className={`w-full h-full ${showFullImage ? "object-contain bg-background/50" : "object-cover"}`}
                  />
                ) : (
                  <Users className="w-8 h-8 opacity-30" />
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAvatarPath}
                >
                  选择本地头像
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAvatarPickerOpen(true)}
                >
                  从当前资产库选择
                </Button>
              </div>
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
                disabled={!!editingIp}
              />
              {editingIp ? (
                <p className="text-xs text-amber-600 dark:text-amber-500 font-medium">
                  ⚠️ 为保证文件关联和同步安全，IP 创建后路径标识不可修改
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  用于文件夹命名和目录匹配，只允许小写字母、数字、连字符和下划线。
                  <br />
                  <span className="text-amber-600 dark:text-amber-500 font-medium">⚠️ 注意：为保证关联和同步安全，创建后该标识不可修改</span>
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">灵感来源 / 背景故事</label>
              <textarea
                placeholder="输入该 IP 角色的创作灵感、灵感来源或是核心背景设定..."
                value={ipInspiration}
                onChange={(e) => setIpInspiration(e.target.value)}
                className="min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 animate-fade-in"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">特征设定 / 外观性格描述</label>
              <textarea
                placeholder="在此细化角色的外观发色、眼睛色彩、性格特质等具体设定细节..."
                value={ipDescription}
                onChange={(e) => setIpDescription(e.target.value)}
                className="min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 animate-fade-in"
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

      {/* ==================== 弹窗: IP 删除二次确认 ==================== */}
      <Dialog open={deleteIpId !== null} onOpenChange={(open) => !open && setDeleteIpId(null)}>
        <DialogContent className="max-w-md bg-card border shadow-lg rounded-xl overflow-hidden p-0 animate-in zoom-in-95 duration-200">
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-full text-red-600 dark:text-red-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 flex-1">
                <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  确定要删除 IP 形象吗？
                </DialogTitle>
                <div className="text-sm text-muted-foreground leading-relaxed font-light">
                  你正在删除 IP 形象 <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">“{deleteIpName}”</span>。
                  {deleteIpAssetCount > 0 ? (
                    <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg text-amber-800 dark:text-amber-300 space-y-1">
                      <p className="font-semibold flex items-center gap-1 font-normal">
                        ⚠️ 警告：检测到该形象下含有 {deleteIpAssetCount} 张图片资产！
                      </p>
                      <p className="text-xs leading-normal text-amber-700 dark:text-amber-400/90 font-normal">
                        你可以选择彻底抹除所有图片，或保留全部图片并移回“待整理（Inbox）”供后续重新归档。
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1.5">此操作将永久清除该形象的基本设定与关联链接。</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="bg-muted/30 px-6 py-4 border-t flex flex-col sm:flex-row gap-2 shrink-0 sm:justify-end">
            <Button
              variant="ghost"
              onClick={() => setDeleteIpId(null)}
              className="w-full sm:w-auto"
            >
              取消
            </Button>
            {deleteIpAssetCount > 0 ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => executeDeleteIp(true)}
                  className="w-full sm:w-auto text-amber-600 hover:text-amber-700 hover:bg-amber-50 border-amber-200 font-medium"
                >
                  移至待整理并保留图片
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => executeDeleteIp(false)}
                  className="w-full sm:w-auto"
                >
                  彻底删除图片与 IP
                </Button>
              </>
            ) : (
              <Button
                variant="destructive"
                onClick={() => executeDeleteIp(false)}
                className="w-full sm:w-auto"
              >
                确定删除
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Delete Confirmation - Step 1 */}
      <ConfirmDialog
        open={batchDeleteStep === 1}
        title="确认批量删除"
        description={`确定要删除选中的 ${selectedImages.length} 张图片吗？此操作不可恢复。`}
        confirmText={selectedImages.length > 10 ? "继续" : "确认删除"}
        cancelText="取消"
        variant="destructive"
        onConfirm={() => {
          if (selectedImages.length > 10) {
            setBatchDeleteStep(2);
          } else {
            void executeBatchDelete();
          }
        }}
        onCancel={() => setBatchDeleteStep(0)}
      />

      {/* Batch Delete Confirmation - Step 2 */}
      <ConfirmDialog
        open={batchDeleteStep === 2}
        title="⚠️ 最终确认"
        description={`【警告】您正在批量删除 ${selectedImages.length} 张图片！此操作将永久删除这些图片记录及源文件，无法撤销！`}
        confirmText="确认删除"
        cancelText="取消"
        variant="destructive"
        onConfirm={executeBatchDelete}
        onCancel={() => setBatchDeleteStep(0)}
      />

      {/* 资产库头像选择弹窗 */}
      <IPImagePickerModal
        isOpen={isAvatarPickerOpen}
        onClose={() => setIsAvatarPickerOpen(false)}
        title="选择已有头像"
        description="从该 IP 形象现有的资产图片中选择一张作为头像。"
        multiSelect={false}
        images={ipDetail?.ip_images?.map(item => item.ip_image) || []}
        onConfirm={(ids) => {
          if (ids.length > 0 && ipDetail) {
            const selectedImg = ipDetail.ip_images.find(item => item.ip_image.id === ids[0]);
            if (selectedImg) {
              setIpAvatarPath(selectedImg.ip_image.absolute_path);
              setIsAvatarFromAsset(true);
            }
          }
        }}
      />
    </div>
  );
}
