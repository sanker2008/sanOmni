const fs = require('fs');
const { execSync } = require('child_process');

const content = execSync('git show HEAD:src/components/SettingsView.tsx', { encoding: 'utf8' });
const lines = content.split('\n');

let promptStart = lines.findIndex(l => l.includes('{/* Prompt 模板相关 */}'));
let ipStart = lines.findIndex(l => l.includes('{/* IP 资产管理相关 */}'));
let shortcutStart = lines.findIndex(l => l.includes('{/* 快捷键 */}'));

if (promptStart === -1 || ipStart === -1 || shortcutStart === -1) {
    console.error('Markers not found!');
    process.exit(1);
}

// Prompt block
let promptLines = lines.slice(promptStart + 2, ipStart);
// Remove the trailing )}
while (promptLines.length > 0 && !promptLines[promptLines.length - 1].includes(')}')) {
    promptLines.pop();
}
if (promptLines.length > 0 && promptLines[promptLines.length - 1].includes(')}')) {
    promptLines[promptLines.length - 1] = promptLines[promptLines.length - 1].replace(')}', '');
}

// IP block
let ipLines = lines.slice(ipStart + 2, shortcutStart);
// Remove the trailing )}
while (ipLines.length > 0 && !ipLines[ipLines.length - 1].includes(')}')) {
    ipLines.pop();
}
if (ipLines.length > 0 && ipLines[ipLines.length - 1].includes(')}')) {
    ipLines[ipLines.length - 1] = ipLines[ipLines.length - 1].replace(')}', '');
}

function postProcess(arr) {
    let text = arr.join('\n');
    text = text.replace(/handleSelectCustomPath\(/g, 'onSelectPath(');
    text = text.replace(/setResetType\('([^']+)'\);\s*setResetStep\(1\);/g, "onTriggerReset('$1');");
    return text;
}

const createTemplate = (name, contentStr) => `import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ScanLine, Loader2, FolderOpen, AlertTriangle, Plus, X } from "lucide-react";
import { scannerApi } from "@/services/tauri";
import { useImageStore } from "@/stores";
import { toast } from "@/hooks/useToast";
import type { ResetType } from "./ResetConfirmDialog";

interface ${name}Props {
  localSettings: Record<string, any>;
  handleLocalUpdate: (key: string, value: any) => void;
  onSelectPath: (key: string) => Promise<void>;
  onTriggerReset: (type: ResetType) => void;
  activeWatchers: any[];
}

export default function ${name}({
  localSettings,
  handleLocalUpdate,
  onSelectPath,
  onTriggerReset,
  activeWatchers,
}: ${name}Props) {
  const { setArchivedImages, setInboxImages } = useImageStore();
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [isCleaningInbox, setIsCleaningInbox] = useState(false);
  const [inboxCleanupResult, setInboxCleanupResult] = useState<any>(null);
  const [newWatchFolder, setNewWatchFolder] = useState("");

  const handleAddWatchFolder = () => {
    if (newWatchFolder.trim()) {
      const folders = [...(localSettings.watchFolders || []), newWatchFolder.trim()];
      handleLocalUpdate("watchFolders", folders);
      setNewWatchFolder("");
    }
  };

  const handleRemoveWatchFolder = (index: number) => {
    const folders = [...(localSettings.watchFolders || [])];
    folders.splice(index, 1);
    handleLocalUpdate("watchFolders", folders);
  };

  const handleSelectWatchFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selectedFolder = await open({
        directory: true,
        multiple: false,
      });

      if (selectedFolder && typeof selectedFolder === "string") {
        const folders = [...(localSettings.watchFolders || []), selectedFolder];
        handleLocalUpdate("watchFolders", folders);
      }
    } catch (error) {
      console.error("Failed to select folder:", error);
    }
  };

  return (
    <div className="space-y-6">
${contentStr}
    </div>
  );
}
`;

fs.writeFileSync('src/components/settings/PromptSettingsTab.tsx', createTemplate('PromptSettingsTab', postProcess(promptLines)));
fs.writeFileSync('src/components/settings/IpSettingsTab.tsx', createTemplate('IpSettingsTab', postProcess(ipLines)).replace(/watchFolders/g, 'ipWatchFolders').replace('ipipWatchFolders', 'ipWatchFolders'));

console.log("Extraction complete!");
