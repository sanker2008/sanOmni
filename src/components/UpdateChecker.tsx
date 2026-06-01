import { useState, useEffect } from "react";
import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UpdateInfo {
  has_update: boolean;
  latest_version: string;
  current_version: string;
  download_url: string;
  release_notes: string;
  published_at: string;
}

const DISMISSED_VERSION_KEY = "sanomni-dismissed-update-version";

export default function UpdateChecker() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    checkForUpdate();
  }, []);

  const checkForUpdate = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{
        success: boolean;
        data?: UpdateInfo;
        error?: string;
      }>("check_for_update");

      if (result.success && result.data?.has_update) {
        // Check if user dismissed this version
        const dismissedVersion = localStorage.getItem(DISMISSED_VERSION_KEY);
        if (dismissedVersion === result.data.latest_version) {
          return;
        }

        setUpdateInfo(result.data);
        setVisible(true);
        // Trigger animation after mount
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setAnimateIn(true);
          });
        });
      }
    } catch (error) {
      // Silently fail - don't disrupt user experience
      console.debug("Update check failed:", error);
    }
  };

  const handleDismiss = () => {
    setAnimateIn(false);
    setTimeout(() => {
      setVisible(false);
      if (updateInfo) {
        localStorage.setItem(DISMISSED_VERSION_KEY, updateInfo.latest_version);
      }
    }, 300);
  };

  const handleDownload = async () => {
    if (!updateInfo?.download_url) return;
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(updateInfo.download_url);
    } catch {
      // Fallback
      window.open(updateInfo.download_url, "_blank");
    }
  };

  if (!visible || !updateInfo) return null;

  return (
    <div
      className={`
        w-full overflow-hidden transition-all duration-300 ease-out
        ${animateIn ? "max-h-12 opacity-100" : "max-h-0 opacity-0"}
      `}
    >
      <div className="flex items-center justify-center gap-3 px-4 py-2 text-sm bg-gradient-to-r from-primary/90 via-primary to-primary/90 text-primary-foreground">
        <span className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-foreground/75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-foreground" />
          </span>
          发现新版本
          <span className="font-semibold">v{updateInfo.latest_version}</span>
          <span className="opacity-75">（当前 v{updateInfo.current_version}）</span>
        </span>

        <Button
          variant="secondary"
          size="sm"
          className="h-6 px-3 text-xs gap-1.5 bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground border-0"
          onClick={handleDownload}
        >
          <Download className="w-3 h-3" />
          下载更新
        </Button>

        <button
          className="p-0.5 rounded hover:bg-primary-foreground/15 transition-colors opacity-70 hover:opacity-100"
          onClick={handleDismiss}
          aria-label="忽略更新"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
