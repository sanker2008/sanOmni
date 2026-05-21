import { useEffect, useRef } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useUIStore, useImageStore } from "@/stores";
import { watcherApi, imageApi, classifyApi } from "@/services/tauri";

interface FileWatchEvent {
  event_type: string;
  path: string;
  timestamp: string;
}

export function useFolderWatcher() {
  const { settings } = useUIStore();
  const { addImage } = useImageStore();
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const activeWatchersRef = useRef<Set<string>>(new Set());

  // 启动监控器
  useEffect(() => {
    const startWatchers = async () => {
      const folders = settings.watchFolders || [];
      const extensions = (settings.watchExtensions || "png,jpg,jpeg,webp,gif")
        .split(",")
        .map((ext) => ext.trim());
      const debounceMs = settings.watchDebounceMs || 1000;

      for (const folder of folders) {
        // 避免重复启动
        if (activeWatchersRef.current.has(folder)) {
          continue;
        }

        try {
          const watcherInfo = await watcherApi.start({
            path: folder,
            recursive: true,
            file_extensions: extensions,
            debounce_ms: debounceMs,
          });

          activeWatchersRef.current.add(folder);
          console.log(`Started watching: ${folder}`, watcherInfo);
        } catch (error) {
          console.error(`Failed to start watcher for ${folder}:`, error);
        }
      }
    };

    startWatchers();
  }, [settings.watchFolders, settings.watchExtensions, settings.watchDebounceMs]);

  // 监听文件事件并自动导入
  useEffect(() => {
    const setupListener = async () => {
      // 清理旧的监听器
      if (unlistenRef.current) {
        unlistenRef.current();
      }

      // 设置新的监听器
      const unlisten = await listen<FileWatchEvent>("file-watch-event", async (event) => {
        console.log("File watch event received:", event.payload);

        const { path } = event.payload;

        try {
          // 获取文件信息
          const { stat } = await import("@tauri-apps/plugin-fs");
          const fileMeta = await stat(path);
          const fileSize = fileMeta.size;

          // 提取文件名
          const fileName = path.split(/[/\\]/).pop() || "unknown";

          // 自动分类
          let vendorId: string | undefined;
          let modelIds: string[] = [];

          try {
            const classification = await classifyApi.classify(fileName);
            if (classification.confidence > 0.5) {
              vendorId = classification.vendor_id;
              if (classification.model_id) {
                modelIds = [classification.model_id];
              }
            }
          } catch (error) {
            console.error("Classification failed:", error);
          }

          // 复制文件到 inbox
          const { appDataDir, join } = await import("@tauri-apps/api/path");
          const { copyFile, exists, mkdir } = await import("@tauri-apps/plugin-fs");

          // 使用自定义路径或默认路径
          let inboxDir: string;
          if (settings.customInboxPath) {
            inboxDir = settings.customInboxPath;
          } else {
            const appDir = await appDataDir();
            inboxDir = await join(appDir, "inbox");
          }

          // 确保 inbox 目录存在
          if (!(await exists(inboxDir))) {
            await mkdir(inboxDir, { recursive: true });
          }

          // 生成唯一文件名
          const timestamp = Date.now();
          const uniqueFileName = `${timestamp}_${fileName}`;
          const targetPath = await join(inboxDir, uniqueFileName);

          // 复制文件
          await copyFile(path, targetPath);

          // 导入到数据库
          const result = await imageApi.import({
            file_path: targetPath,
            file_name: fileName,
            file_size: fileSize,
            vendor_id: vendorId,
            model_ids: modelIds,
            tags: [],
          });

          // 添加到 store
          addImage(result);

          console.log(`Auto-imported: ${fileName}`);

          // 可选：显示通知
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("新图片已导入", {
              body: `${fileName} 已自动导入到待整理`,
              icon: "/icon.png",
            });
          }
        } catch (error) {
          console.error("Failed to auto-import image:", error);
        }
      });

      unlistenRef.current = unlisten;
    };

    setupListener();

    // 清理
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, [settings.customInboxPath, addImage]);

  // 请求通知权限
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);
}
