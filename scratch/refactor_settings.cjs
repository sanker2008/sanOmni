const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/SettingsView.tsx');
let content = fs.readFileSync(filePath, 'utf8');
content = content.replace(/\r\n/g, '\n');

// 1. Replace types and tabs
content = content.replace(
  /type SettingsTab = "general" \| "monitor" \| "vendors" \| "shortcuts" \| "trash";[\s\S]*?\];/,
  `type SettingsTab = "general" | "prompt" | "ip" | "shortcuts" | "trash";\n\nconst SETTINGS_TABS: { key: SettingsTab; label: string }[] = [\n  { key: "general", label: "通用设置" },\n  { key: "prompt", label: "Prompt 模板管理" },\n  { key: "ip", label: "IP 形象管理" },\n  { key: "shortcuts", label: "快捷键" },\n  { key: "trash", label: "回收站" },\n];`
);

// 2. Find markers
const generalStart = content.indexOf('{activeSettingsTab === "general" && (');
const monitorStart = content.indexOf('{/* 监控设置 */}');
const vendorsStart = content.indexOf('{/* 厂商管理 */}');
const shortcutsStart = content.indexOf('{/* 快捷键 */}');

if (generalStart === -1 || monitorStart === -1 || vendorsStart === -1 || shortcutsStart === -1) {
  console.log("Error: Could not find section markers");
  process.exit(1);
}

const namingTemplateStr = '<Card>\n                <CardHeader>\n                  <CardTitle className="text-base">命名模板</CardTitle>';
const namingTemplateCardStart = content.indexOf(namingTemplateStr);

const resetDbStr = '<Card className="border-destructive/50">\n                <CardHeader>\n                  <CardTitle className="text-base flex items-center gap-2 text-destructive">\n                    <AlertTriangle className="w-4 h-4" />\n                    重置数据库';
const resetDbCardStart = content.indexOf(resetDbStr);

if (namingTemplateCardStart === -1 || resetDbCardStart === -1) {
  console.log("Error: Could not find internal cards");
  process.exit(1);
}

// Split logic
const beforeGeneral = content.slice(0, generalStart);
const generalPart1 = content.slice(generalStart, namingTemplateCardStart); // Theme and Display Mode
const promptPart1 = content.slice(namingTemplateCardStart, resetDbCardStart); // Naming, Paths, Scans
const resetDbPart = content.slice(resetDbCardStart, monitorStart); // Reset DB and end of general
const monitorContentRaw = content.slice(monitorStart, vendorsStart);
const vendorsContentRaw = content.slice(vendorsStart, shortcutsStart);
const theRest = content.slice(shortcutsStart);

// Process monitor section
let newMonitorContent = monitorContentRaw.replace(
  /\{\/\* 监控设置 \*\/\}\s+\{activeSettingsTab === "monitor" && \(\s+<div className="space-y-6">/,
  '{/* 监控设置 */}\n              <div className="text-lg font-semibold mt-8 mb-4 border-b pb-2">文件夹监控与自动分类</div>'
);
newMonitorContent = newMonitorContent.replace(/<\/div>\n\s*\)\}\n*/, '');

// Process vendors section
let newVendorsContent = vendorsContentRaw.replace(
  /\{\/\* 厂商管理 \*\/\}\s+\{activeSettingsTab === "vendors" && \(\s+<div className="space-y-6">/,
  '{/* 厂商管理 */}\n              <div className="text-lg font-semibold mt-8 mb-4 border-b pb-2">AI 模型厂商管理</div>'
);
newVendorsContent = newVendorsContent.replace(/<\/div>\n\s*\)\}\n*/, '');

// Process general ending
const newGeneral = generalPart1 + resetDbPart.replace('</Card>\n            </div>\n          )}\n\n\n', '</Card>\n            </div>\n          )}\n\n');

// Build prompt and IP tabs
const newPrompt = `
          {/* Prompt 模板相关 */}
          {activeSettingsTab === "prompt" && (
            <div className="space-y-6">
              <div className="text-lg font-semibold mb-4 border-b pb-2">归档与路径配置</div>
${promptPart1}
${newMonitorContent}
${newVendorsContent}
            </div>
          )}
`;

const newIp = `
          {/* IP 形象相关 */}
          {activeSettingsTab === "ip" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">IP 形象相关设置</CardTitle>
                  <CardDescription>
                    关于 IP 角色、设定图、表情包的管理设置
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    目前 IP 模块采用独立存储架构，暂无需要特殊配置的项。未来的默认发布平台、表情包尺寸预设等设置将在此处扩展。
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
`;

const finalContent = beforeGeneral + newGeneral + newPrompt + newIp + theRest;

fs.writeFileSync(filePath, finalContent, 'utf8');
console.log("Successfully refactored SettingsView.tsx");
