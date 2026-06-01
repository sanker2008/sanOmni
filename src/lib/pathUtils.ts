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
