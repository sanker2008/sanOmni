import { useState, useEffect } from "react";
import { X, Download, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

const DISMISSED_VERSION_KEY = "sanomni-dismissed-update-version";

export default function UpdateChecker() {
  const [updateObj, setUpdateObj] = useState<Update | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>("");
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isReadyToRestart, setIsReadyToRestart] = useState(false);

  useEffect(() => {
    checkForUpdate();
  }, []);

  const checkForUpdate = async () => {
    try {
      const version = await getVersion();
      setCurrentVersion(version);
      
      const update = await check();
      
      if (update) {
        // Check if user dismissed this version
        const dismissedVersion = localStorage.getItem(DISMISSED_VERSION_KEY);
        if (dismissedVersion === update.version) {
          return;
        }

        setUpdateObj(update);
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
      if (updateObj) {
        localStorage.setItem(DISMISSED_VERSION_KEY, updateObj.version);
      }
    }, 300);
  };

  const handleDownloadAndInstall = async () => {
    if (!updateObj) return;
    
    setIsDownloading(true);
    setDownloadProgress(0);
    
    let downloaded = 0;
    let contentLength = 0;

    try {
      await updateObj.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setDownloadProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case 'Finished':
            setIsDownloading(false);
            setIsReadyToRestart(true);
            break;
        }
      });
    } catch (error) {
      console.error("Failed to download and install update:", error);
      setIsDownloading(false);
      // fallback
      try {
        const { open } = await import("@tauri-apps/plugin-shell");
        if (updateObj.body) {
           // extract url if present, or just open github releases
           await open("https://github.com/sanker2008/sanOmni/releases/latest");
        }
      } catch {}
    }
  };

  const handleRestart = async () => {
    await relaunch();
  };

  if (!visible || !updateObj) return null;

  return (
    <div
      className={`
        w-full overflow-hidden transition-all duration-300 ease-out
        ${animateIn ? "max-h-12 opacity-100" : "max-h-0 opacity-0"}
      `}
    >
      <div className="flex items-center justify-center gap-3 px-4 py-2 text-sm bg-gradient-to-r from-primary/90 via-primary to-primary/90 text-primary-foreground relative">
        {/* Progress bar background */}
        {isDownloading && (
          <div 
            className="absolute left-0 top-0 bottom-0 bg-white/20 transition-all duration-200"
            style={{ width: `${downloadProgress}%` }}
          />
        )}
        
        <span className="flex items-center gap-2 relative z-10">
          {!isDownloading && !isReadyToRestart && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-foreground/75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-foreground" />
            </span>
          )}
          {isReadyToRestart ? (
            "更新已准备就绪"
          ) : isDownloading ? (
            `正在下载更新... ${downloadProgress}%`
          ) : (
            <>
              发现新版本
              <span className="font-semibold">v{updateObj.version}</span>
              <span className="opacity-75">（当前 v{currentVersion}）</span>
            </>
          )}
        </span>

        <div className="flex items-center gap-2 relative z-10">
          {isReadyToRestart ? (
            <Button
              variant="secondary"
              size="sm"
              className="h-6 px-3 text-xs gap-1.5 bg-green-500 hover:bg-green-600 text-white border-0"
              onClick={handleRestart}
            >
              <RotateCw className="w-3 h-3" />
              立即重启
            </Button>
          ) : isDownloading ? (
            <Button
              variant="secondary"
              size="sm"
              disabled
              className="h-6 px-3 text-xs gap-1.5 bg-primary-foreground/15 text-primary-foreground border-0"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              下载中
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="h-6 px-3 text-xs gap-1.5 bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground border-0"
              onClick={handleDownloadAndInstall}
            >
              <Download className="w-3 h-3" />
              下载更新
            </Button>
          )}

          {!isDownloading && !isReadyToRestart && (
            <button
              className="p-0.5 rounded hover:bg-primary-foreground/15 transition-colors opacity-70 hover:opacity-100"
              onClick={handleDismiss}
              aria-label="忽略更新"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
