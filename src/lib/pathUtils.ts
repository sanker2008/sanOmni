import { appDataDir, join } from "@tauri-apps/api/path";

export async function getAppRoot(): Promise<string> {
  try {
    const settingsStr = localStorage.getItem("ai-image-manager-settings");
    if (settingsStr) {
      const settings = JSON.parse(settingsStr);
      if (settings.unifiedRootPath && settings.unifiedRootPath.trim()) {
        return settings.unifiedRootPath.trim();
      }
    }
  } catch (e) {
    // Ignore JSON parse errors
  }

  return await appDataDir();
}

export async function getLabsRoot(): Promise<string> {
  try {
    const settingsStr = localStorage.getItem("ai-image-manager-settings");
    if (settingsStr) {
      const settings = JSON.parse(settingsStr);
      if (settings.labsCustomRootPath && settings.labsCustomRootPath.trim()) {
        return settings.labsCustomRootPath.trim();
      }
    }
  } catch (e) {
    // Ignore JSON parse errors
  }
  
  const appRoot = await getAppRoot();
  return await join(appRoot, "labs");
}

export async function resolveSettingPath(settingKey: string, value: string, currentAppRoot: string): Promise<string> {
  // 如果提供了有效值，则它本身就是绝对路径
  if (value && value.trim()) {
    return value.trim();
  }

  // 否则根据 key 返回默认路径
  switch (settingKey) {
    case "unifiedRootPath":
      return await appDataDir();
    case "customInboxPath":
      return await join(currentAppRoot, "inbox");
    case "customArchivedPath":
      return await join(currentAppRoot, "archived");
    case "customWorksPath":
      return currentAppRoot;
    case "labsCustomRootPath":
      return await join(currentAppRoot, "labs");
    case "ipCustomInboxPath":
      return await join(currentAppRoot, "ip_inbox");
    case "ipCustomArchivedPath":
      return await join(currentAppRoot, "ip_archived");
    default:
      return "";
  }
}

export async function revealFileInFolder(filePath: string) {
  if (!filePath) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('show_in_folder', { path: filePath });
  } catch (e) {
    console.error('Failed to reveal file in folder:', e);
  }
}
