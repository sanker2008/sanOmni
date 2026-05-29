import { useState, useEffect } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { toast } from "@/hooks/useToast";
import { settingsApi } from "@/services/tauri";

export type ResetType = 'general' | 'prompt_data' | 'prompt_all' | 'ip_data' | 'ip_all' | null;

interface ResetConfirmDialogProps {
  resetType: ResetType;
  onClose: () => void;
}

export default function ResetConfirmDialog({ resetType, onClose }: ResetConfirmDialogProps) {
  const [resetStep, setResetStep] = useState(0);

  useEffect(() => {
    if (resetType) {
      setResetStep(1);
    } else {
      setResetStep(0);
    }
  }, [resetType]);

  const resetContent = (() => {
    switch (resetType) {
      case 'general':
        return {
          step1Title: "确认重置通用数据",
          step1Desc: "确定要重置通用数据吗？这将清除所有主题色、布局偏好等基础设置。注意：您的 Prompt 模板和 IP 资产数据将保持原样，不受任何影响！",
          step2Title: "⚠️ 通用设置最终确认",
          step2Desc: "【警告】重置通用数据是不可逆的！所有通用系统设置和界面显示首选项都将被恢复为默认值。您真的确定要重置吗？",
          confirmText: "确认重置",
          action: async () => {
            await settingsApi.resetGeneralSettings();
            toast({
              title: "✓ 通用设置已重置",
              description: "通用设置已恢复默认，应用将重新加载",
            });
            setTimeout(() => window.location.reload(), 1000);
          }
        };
      case 'prompt_data':
        return {
          step1Title: "确认重置 Prompt 模板数据",
          step1Desc: "确定要重置 Prompt 模板数据吗？这将清空数据库中的所有 Prompt 模板记录、图片关联和分类。注意：图片文件本身不会被删除！",
          step2Title: "⚠️ Prompt 记录最终确认",
          step2Desc: "【警告】此操作将清除所有 Prompt 模板的数据库记录，且不可恢复！您真的确定要重置吗？",
          confirmText: "确认重置记录",
          action: async () => {
            await settingsApi.resetPromptData(false);
            toast({
              title: "✓ Prompt 数据库记录已重置",
              description: "Prompt 模板数据已重置，应用将重新加载",
            });
            setTimeout(() => window.location.reload(), 1000);
          }
        };
      case 'prompt_all':
        return {
          step1Title: "⚠️ 确认重置数据并删除 Prompt 文件",
          step1Desc: "确定要重置 Prompt 数据并【删除所有关联图片文件】吗？这将清空 Prompt 模板数据库记录，并且【永久删除】待处理(inbox)和归档(archived)目录下的所有图片文件！",
          step2Title: "🚨 Prompt 文件永久删除警告",
          step2Desc: "【极其严重警告】所有待处理(inbox)和归档(archived)目录下的图片文件都将被彻底删除，无法恢复！请确保您已做好备份。确定要永久删除文件并重置吗？",
          confirmText: "永久删除并重置",
          action: async () => {
            await settingsApi.resetPromptData(true);
            toast({
              title: "✓ Prompt 数据及文件已彻底删除",
              description: "相关文件与记录已清理，应用将重新加载",
            });
            setTimeout(() => window.location.reload(), 1000);
          }
        };
      case 'ip_data':
        return {
          step1Title: "确认重置 IP 资产数据",
          step1Desc: "确定要重置 IP 资产数据吗？这将清空数据库中的所有 IP 形象记录、资产关联、表情包和贴纸（系统默认的未知形象 'unknown' 将予以保留）。注意：您的图片文件本身不会被删除！",
          step2Title: "⚠️ IP 资产记录最终确认",
          step2Desc: "【警告】此操作将清除所有 IP 形象及关联的数据库记录（除 'unknown' 外），且不可恢复！您真的确定要重置吗？",
          confirmText: "确认重置记录",
          action: async () => {
            await settingsApi.resetIpData(false);
            toast({
              title: "✓ IP 资产数据库记录已重置",
              description: "IP 资产数据已重置，应用将重新加载",
            });
            setTimeout(() => window.location.reload(), 1000);
          }
        };
      case 'ip_all':
        return {
          step1Title: "⚠️ 确认重置数据并删除 IP 文件",
          step1Desc: "确定要重置 IP 资产数据并【删除所有关联图片文件】吗？这将清空所有 IP 资产数据库记录（保留默认 'unknown'），并且【永久删除】IP待处理(ip_inbox)和IP归档(ip_archived)目录下的所有图片文件！",
          step2Title: "🚨 IP 文件永久删除警告",
          step2Desc: "【极其严重警告】所有 IP 待处理(ip_inbox)和归档(ip_archived)目录下的图片文件都将被彻底删除，无法恢复！请确保您已备份。确定要永久删除所有 IP 资产文件并重置吗？",
          confirmText: "永久删除并重置",
          action: async () => {
            await settingsApi.resetIpData(true);
            toast({
              title: "✓ IP 资产数据及文件已彻底删除",
              description: "相关 IP 文件与记录已清理，应用将重新加载",
            });
            setTimeout(() => window.location.reload(), 1000);
          }
        };
      default:
        return null;
    }
  })();

  const handleClose = () => {
    setResetStep(0);
    onClose();
  };

  return (
    <>
      <ConfirmDialog
        open={resetStep === 1 && resetContent !== null}
        title={resetContent?.step1Title || "确认重置"}
        description={resetContent?.step1Desc || ""}
        confirmText="继续"
        cancelText="取消"
        variant="destructive"
        onConfirm={() => setResetStep(2)}
        onCancel={handleClose}
      />

      <ConfirmDialog
        open={resetStep === 2 && resetContent !== null}
        title={resetContent?.step2Title || "最终确认"}
        description={resetContent?.step2Desc || ""}
        confirmText={resetContent?.confirmText || "确认"}
        cancelText="取消"
        variant="destructive"
        onConfirm={async () => {
          const action = resetContent?.action;
          setResetStep(0);
          if (action) {
            try {
              await action();
            } catch (error) {
              toast({
                title: "✗ 操作失败",
                description: String(error),
                variant: "destructive",
              });
            }
          }
          onClose();
        }}
        onCancel={handleClose}
      />
    </>
  );
}
