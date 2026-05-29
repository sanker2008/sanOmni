const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const content = execSync('git show HEAD:src/components/SettingsView.tsx', { encoding: 'utf8' });

function extractBetween(content, startMarker, endMarker) {
  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) return '';
  const endIndex = content.indexOf(endMarker, startIndex);
  if (endIndex === -1) return '';
  return content.slice(startIndex, endIndex);
}

let promptContent = extractBetween(content, '{/* Prompt 模板相关 */}', '{/* IP 资产管理相关 */}');
let ipContent = extractBetween(content, '{/* IP 资产管理相关 */}', '{/* 快捷键 */}');

function cleanTabContent(tabContent) {
  const lines = tabContent.split('\n');
  let result = [];
  let skip = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('{activeSettingsTab ===')) {
      skip = true;
      continue;
    }
    if (skip && line.includes('<div className="space-y-6">')) {
      skip = false;
      continue;
    }
    result.push(line);
  }
  
  let cleaned = result.join('\n');
  
  // Remove the trailing )} at the end of the block
  cleaned = cleaned.replace(/\s*\}\)\s*$/g, '');
  cleaned = cleaned.replace(/\s*\}\)\s*$/, ''); // just in case
  
  // Also remove the exact block we know exists at the very end
  const lastBracketIndex = cleaned.lastIndexOf(')}');
  if (lastBracketIndex > cleaned.length - 20) {
    cleaned = cleaned.substring(0, lastBracketIndex) + cleaned.substring(lastBracketIndex + 2);
  }

  // Replace handleSelectCustomPath with onSelectPath
  cleaned = cleaned.replace(/handleSelectCustomPath\(/g, 'onSelectPath(');
  
  // Replace setResetType/Step with onTriggerReset
  cleaned = cleaned.replace(/setResetType\('([^']+)'\);\s*setResetStep\(1\);/g, "onTriggerReset('$1');");
  
  return cleaned;
}

promptContent = cleanTabContent(promptContent);
ipContent = cleanTabContent(ipContent);

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

fs.writeFileSync(path.join(__dirname, 'src/components/settings/PromptSettingsTab.tsx'), createTemplate('PromptSettingsTab', promptContent));

// IpTab has specific property 'ipWatchFolders'
const ipCode = createTemplate('IpSettingsTab', ipContent).replace(/watchFolders/g, 'ipWatchFolders').replace('ipipWatchFolders', 'ipWatchFolders');

fs.writeFileSync(path.join(__dirname, 'src/components/settings/IpSettingsTab.tsx'), ipCode);

console.log('Extraction complete!');
