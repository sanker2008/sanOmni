# Prompt 筛选功能更新

## 更新日期
2026-05-21

## 新增功能

在 Prompt 管理界面的图片选择器中添加了筛选功能，支持按关联状态筛选图片。

## 功能说明

### 三种筛选模式

```
┌─────────────────────────────────────┐
│ [  全部  ] [已关联] [未关联]        │
└─────────────────────────────────────┘
```

#### 1. 全部
- 显示所有图片
- 默认模式

#### 2. 已关联
- 只显示已关联到其他 Prompt 组的图片
- 显示"X 个组"徽章
- 显示关联的 Prompt 组列表

#### 3. 未关联
- 只显示未关联到任何 Prompt 组的图片
- 方便快速找到未分组的图片

## 使用场景

### 场景 1：为新图片创建 Prompt 组
```
点击"未关联" → 选择未分组图片 → 创建 Prompt 组
```

### 场景 2：管理多组关联
```
点击"已关联" → 查看图片的现有分组 → 添加到新组
```

### 场景 3：确保所有图片都被分组
```
点击"未关联" → 检查是否有遗漏的图片
```

## 技术实现

### 新增状态
```typescript
const [filterMode, setFilterMode] = useState<"all" | "linked" | "unlinked">("all");
```

### 筛选逻辑
```typescript
if (filterMode === "linked") {
  images = images.filter((image) => 
    image.prompt_groups && image.prompt_groups.length > 0
  );
} else if (filterMode === "unlinked") {
  images = images.filter((image) => 
    !image.prompt_groups || image.prompt_groups.length === 0
  );
}
```

## 修改的文件

- `src/components/PromptGroupsView.tsx`
  - 添加 `filterMode` 状态
  - 更新 `filteredImages` 筛选逻辑
  - 添加筛选按钮 UI
  - 优化图片卡片显示

## 视觉效果

### 按钮状态
- **激活**：深色背景（`variant="default"`）
- **未激活**：浅色边框（`variant="outline"`）

### 图片卡片
- **已选中**：显示"已选中"徽章
- **已关联**：显示"X 个组"徽章 + Prompt 列表
- **未关联**：无额外标记

## 用户体验

### 优点
✅ 快速筛选图片  
✅ 清晰的视觉反馈  
✅ 支持与搜索功能组合使用  
✅ 空状态提示友好  

### 性能
- 使用 `useMemo` 优化筛选性能
- 依赖项：`allImages`, `imageSearch`, `filterMode`

## 测试建议

### 测试用例

1. **基础筛选**
   - [ ] 点击"全部"显示所有图片
   - [ ] 点击"已关联"只显示已关联图片
   - [ ] 点击"未关联"只显示未关联图片

2. **组合使用**
   - [ ] 筛选 + 搜索同时工作
   - [ ] 切换筛选模式时保持搜索关键词

3. **视觉反馈**
   - [ ] 激活按钮高亮显示
   - [ ] 已关联图片显示"X 个组"徽章
   - [ ] 已选中图片显示"已选中"徽章

4. **空状态**
   - [ ] 无图片时显示正确提示
   - [ ] 不同筛选模式显示不同提示

5. **性能**
   - [ ] 大量图片时筛选流畅
   - [ ] 切换筛选模式无延迟

## 相关文档

- [详细功能文档](./docs/PROMPT_FILTER_FEATURE.md)
- [Prompt 对比功能](./docs/PROMPT_COMPARISON.md)

---

**状态**：✅ 已实现  
**测试状态**：⏳ 待测试
