const fs = require('fs');
const path = require('path');

const settingsPath = path.join(__dirname, '../src/components/SettingsView.tsx');
let settingsContent = fs.readFileSync(settingsPath, 'utf8');
settingsContent = settingsContent.replace(/\r\n/g, '\n');

// Find the vendor block
const vendorStartStr = '{/* 厂商管理 */}\n              <div className="text-lg font-semibold mt-8 mb-4 border-b pb-2">AI 模型厂商管理</div>\n              <Card>';
const vendorStart = settingsContent.indexOf(vendorStartStr);
if (vendorStart === -1) {
  console.log("Could not find vendor block start");
  process.exit(1);
}

// Find the end of the vendor block
const vendorEndStr = '              </Card>\n            </div>\n          )}\n\n          {/* IP 形象相关 */}';
const vendorEnd = settingsContent.indexOf(vendorEndStr);
if (vendorEnd === -1) {
  console.log("Could not find vendor block end");
  process.exit(1);
}

// Extract vendor block (just the Card)
const vendorJsx = settingsContent.slice(vendorStart + vendorStartStr.indexOf('<Card>'), vendorEnd + '              </Card>'.length);

// Remove vendor block from SettingsView
settingsContent = settingsContent.slice(0, vendorStart) + settingsContent.slice(vendorEnd + '              </Card>\n'.length);

// Remove vendor states from SettingsView
const statesToRemove = [
  '  const { vendors, setVendors } = useVendorStore();\n',
  '  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());\n',
  '  const [editingVendor, setEditingVendor] = useState<string | null>(null);\n',
  '  const [editingModel, setEditingModel] = useState<string | null>(null);\n',
  '  const [vendorForm, setVendorForm] = useState({ name: "", path: "" });\n',
  '  const [modelForm, setModelForm] = useState({ name: "", path: "", description: "" });\n',
  '  const [addingModelForVendor, setAddingModelForVendor] = useState<string | null>(null);\n'
];

for (const stateStr of statesToRemove) {
  settingsContent = settingsContent.replace(stateStr, '');
}

// Also remove `useVendorStore` import if possible
settingsContent = settingsContent.replace('useUIStore, useVendorStore, useImageStore', 'useUIStore, useImageStore');

fs.writeFileSync(settingsPath, settingsContent, 'utf8');

const vendorsViewContent = `import { useState } from "react";
import { useVendorStore } from "@/stores";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Edit2, Trash2, ChevronDown, ChevronRight, Save } from "lucide-react";
import { toast } from "@/hooks/useToast";

export default function VendorsView() {
  const { vendors, setVendors } = useVendorStore();
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());
  const [editingVendor, setEditingVendor] = useState<string | null>(null);
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [vendorForm, setVendorForm] = useState({ name: "", path: "" });
  const [modelForm, setModelForm] = useState({ name: "", path: "", description: "" });
  const [addingModelForVendor, setAddingModelForVendor] = useState<string | null>(null);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      ${vendorJsx}
    </div>
  );
}
`;

const vendorsViewPath = path.join(__dirname, '../src/components/VendorsView.tsx');
fs.writeFileSync(vendorsViewPath, vendorsViewContent, 'utf8');

console.log("Successfully extracted VendorsView");
