# List 模式操作按钮更新

## 问题描述

在列表视图（List Mode）中，图片卡片的操作按钮比网格视图（Grid Mode）少了一个"去除水印"按钮。

## 解决方案

在 `ImageCard.tsx` 的 list 模式部分添加了"去除水印"按钮，使其与 grid 模式保持一致。

## 更新内容

### List 模式现在包含的所有操作按钮：

1. **查看** (Eye) - 在图片查看器中打开
2. **编辑** (Edit) - 打开快速编辑对话框
3. **检测水印** (Scan) - 使用 AI 检测图片中的水印
4. **去除水印** (Eraser) - 移除检测到的水印 ✨ 新增
5. **打开文件夹** (FolderOpen) - 在文件管理器中打开图片所在文件夹
6. **归档/撤销归档** (Archive/Undo2) - 归档图片或撤销归档
7. **删除** (Trash2) - 删除图片

### 按钮顺序

List 模式的按钮顺序与 Grid 模式保持一致：
- 内容操作：查看、编辑、检测水印、去除水印
- 管理操作：打开文件夹、归档、删除

## 技术细节

**文件**: `src/components/ImageCard.tsx`

**变更位置**: List 模式的操作按钮区域（第 ~600 行）

**新增按钮代码**:
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="ghost" size="icon" className="h-7 w-7"
      onClick={handleRemoveWatermark} disabled={removing}>
      {removing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eraser className="w-3 h-3" />}
    </Button>
  </TooltipTrigger>
  <TooltipContent>去除水印</TooltipContent>
</Tooltip>
```

## 影响范围

- ✅ InboxView（待整理视图）
- ✅ ArchivedView（已归档视图）

两个视图都使用相同的 `ImageCard` 组件，因此都会受益于这次更新。

## 用户体验改进

- 在列表模式下也可以直接去除水印，无需切换到网格模式
- 操作按钮在两种视图模式下保持一致，降低学习成本
- 提高工作效率，特别是在处理大量图片时

## 相关功能

- 水印检测：使用图像处理算法检测常见 AI 平台的水印
- 水印移除：支持通用算法和 Gemini 专用算法
- 原图备份：移除水印时会将原图移至应用回收站

## 测试建议

1. 切换到列表视图模式
2. 选择一张图片
3. 点击"检测水印"按钮
4. 如果检测到水印，点击"去除水印"按钮
5. 验证水印是否成功移除
6. 检查原图是否已备份到回收站
