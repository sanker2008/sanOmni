const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, 'src/components/SettingsView.tsx');
const content = fs.readFileSync(srcFile, 'utf8');

function extractBetween(content, startMarker, endMarker) {
  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) return '';
  const endIndex = content.indexOf(endMarker, startIndex);
  if (endIndex === -1) return '';
  return content.slice(startIndex, endIndex);
}

const promptContent = extractBetween(content, '{/* Prompt 模板相关 */}', '{/* IP 资产管理相关 */}');
const ipContent = extractBetween(content, '{/* IP 资产管理相关 */}', '{/* Labs 工具管理 */}');

// Write PromptSettingsTab.tsx
const promptCode = `import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { ScanLine, Loader2, FolderOpen, AlertTriangle, Plus, X } from "lucide-react";
import { scannerApi } from "@/services/tauri";
import { useImageStore } from "@/stores";
import { toast } from "@/hooks/useToast";
import type { ResetType } from "./ResetConfirmDialog";

interface PromptSettingsTabProps {
  localSettings: Record<string, any>;
  handleLocalUpdate: (key: string, value: any) => void;
  onSelectPath: (key: string) => Promise<void>;
  onTriggerReset: (type: ResetType) => void;
  activeWatchers: any[];
}

export default function PromptSettingsTab({
  localSettings,
  handleLocalUpdate,
  onSelectPath,
  onTriggerReset,
  activeWatchers,
}: PromptSettingsTabProps) {
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
      ${promptContent.replace('{activeSettingsTab === "prompt" && (', '').replace(/<div className="space-y-6">\s*/, '').replace(/}\)\s*$/, '').replace(/handleSelectCustomPath\(/g, 'onSelectPath(')}
  );
}
`;
fs.writeFileSync(path.join(__dirname, 'src/components/settings/PromptSettingsTab.tsx'), promptCode);

// Write IpSettingsTab.tsx
const ipCode = `import { useState } from "react";
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

interface IpSettingsTabProps {
  localSettings: Record<string, any>;
  handleLocalUpdate: (key: string, value: any) => void;
  onSelectPath: (key: string) => Promise<void>;
  onTriggerReset: (type: ResetType) => void;
  activeWatchers: any[];
}

export default function IpSettingsTab({
  localSettings,
  handleLocalUpdate,
  onSelectPath,
  onTriggerReset,
  activeWatchers,
}: IpSettingsTabProps) {
  const { setArchivedImages, setInboxImages } = useImageStore();
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [isCleaningInbox, setIsCleaningInbox] = useState(false);
  const [inboxCleanupResult, setInboxCleanupResult] = useState<any>(null);
  const [newWatchFolder, setNewWatchFolder] = useState("");

  const handleAddWatchFolder = () => {
    if (newWatchFolder.trim()) {
      const folders = [...(localSettings.ipWatchFolders || []), newWatchFolder.trim()];
      handleLocalUpdate("ipWatchFolders", folders);
      setNewWatchFolder("");
    }
  };

  const handleRemoveWatchFolder = (index: number) => {
    const folders = [...(localSettings.ipWatchFolders || [])];
    folders.splice(index, 1);
    handleLocalUpdate("ipWatchFolders", folders);
  };

  const handleSelectWatchFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selectedFolder = await open({
        directory: true,
        multiple: false,
      });

      if (selectedFolder && typeof selectedFolder === "string") {
        const folders = [...(localSettings.ipWatchFolders || []), selectedFolder];
        handleLocalUpdate("ipWatchFolders", folders);
      }
    } catch (error) {
      console.error("Failed to select folder:", error);
    }
  };

  // Filter watchers for IP specifically (paths ending with ip_inbox or similar in standard setup)
  // For now we just show all or filter if needed

  return (
    <div className="space-y-6">
      ${ipContent.replace('{activeSettingsTab === "ip" && (', '').replace(/<div className="space-y-6">\s*/, '').replace(/}\)\s*$/, '').replace(/handleSelectCustomPath\(/g, 'onSelectPath(')}
  );
}
`;
fs.writeFileSync(path.join(__dirname, 'src/components/settings/IpSettingsTab.tsx'), ipCode);

console.log('Extraction complete!');
