import { Card, CardContent } from "@/components/ui/card";

// 快捷键列表（只读）
const SHORTCUTS = [
  { key: "Ctrl + N", description: "导入新图片" },
  { key: "Ctrl + A", description: "全选图片" },
  { key: "Delete", description: "删除选中图片" },
  { key: "Ctrl + E", description: "快速编辑" },
  { key: "Ctrl + S", description: "归档选中图片" },
  { key: "Ctrl + F", description: "聚焦搜索框" },
  { key: "Escape", description: "取消选择 / 关闭弹窗" },
  { key: "Ctrl + 1", description: "切换到待整理" },
  { key: "Ctrl + 2", description: "切换到已归档" },
  { key: "Ctrl + ,", description: "打开设置" },
];

export default function ShortcutsTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {SHORTCUTS.map((shortcut) => (
              <div
                key={shortcut.key}
                className="flex items-center justify-between p-3 rounded-lg border bg-muted/40"
              >
                <span className="text-sm font-medium">{shortcut.description}</span>
                <kbd className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-background border rounded shadow-sm">
                  {shortcut.key}
                </kbd>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
