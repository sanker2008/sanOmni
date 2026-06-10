# Prompt 筛选功能

## 功能概述

在 Prompt 管理界面的图片选择器中，添加了"全部"、"已关联"、"未关联"三个筛选按钮，方便用户快速筛选图片。

## 功能说明

### 筛选模式

#### 1. 全部
显示所有图片，不做任何筛选。

**使用场景**：
- 浏览所有可用图片
- 从全部图片中选择

#### 2. 已关联
只显示已经关联到其他 Prompt 组的图片。

**使用场景**：
- 查看哪些图片已经被分组
- 将已分组的图片添加到当前 Prompt 组
- 管理图片的多组关联

**显示特征**：
- 图片卡片右上角显示"X 个组"徽章
- 底部显示已关联的 Prompt 组列表

#### 3. 未关联
只显示还没有关联到任何 Prompt 组的图片。

**使用场景**：
- 快速找到未分组的图片
- 为新图片创建 Prompt 组
- 确保所有图片都被分组

**显示特征**：
- 没有"X 个组"徽章
- 底部不显示 Prompt 组列表

## 界面设计

### 筛选按钮布局

```
┌─────────────────────────────────────┐
│ 关联图片              已选 3 张     │
├─────────────────────────────────────┤
│ [  全部  ] [已关联] [未关联]        │  ← 筛选按钮
├─────────────────────────────────────┤
│ [搜索框]                            │
├─────────────────────────────────────┤
│ [图片列表]                          │
└─────────────────────────────────────┘
```

### 按钮状态

- **激活状态**：深色背景，白色文字
- **未激活状态**：浅色边框，默认文字颜色
- **等宽布局**：三个按钮平均分配宽度

### 图片卡片显示

#### 已选中的图片
```
┌─────────────────────────────────────┐
│ [缩略图] 文件名.png        [已选中] │
│          模型名称                   │
│          关联的 Prompt 组...        │
└─────────────────────────────────────┘
```

#### 已关联但未选中的图片
```
┌─────────────────────────────────────┐
│ [缩略图] 文件名.png        [3 个组] │
│          模型名称                   │
│          Prompt 1 / Prompt 2 / ...  │
└─────────────────────────────────────┘
```

#### 未关联的图片
```
┌─────────────────────────────────────┐
│ [缩略图] 文件名.png                 │
│          模型名称                   │
└─────────────────────────────────────┘
```

## 使用流程

### 场景 1：为新图片创建 Prompt 组

1. 点击"添加 Prompt"按钮
2. 输入 Prompt 信息
3. 点击"未关联"筛选按钮
4. 从未分组的图片中选择
5. 保存

### 场景 2：将已分组图片添加到新组

1. 点击"添加 Prompt"按钮
2. 输入 Prompt 信息
3. 点击"已关联"筛选按钮
4. 查看图片已关联的组
5. 选择需要的图片（支持多组关联）
6. 保存

### 场景 3：编辑 Prompt 组的图片

1. 点击某个 Prompt 组的"编辑"按钮
2. 在图片选择器中：
   - 点击"全部"查看所有图片
   - 点击"已关联"查看已分组图片
   - 点击"未关联"查看未分组图片
3. 选择或取消选择图片
4. 保存修改

## 技术实现

### 状态管理

```typescript
const [filterMode, setFilterMode] = useState<"all" | "linked" | "unlinked">("all");
```

### 筛选逻辑

```typescript
const filteredImages = useMemo(() => {
  const keyword = imageSearch.trim().toLowerCase();
  let images = allImages;

  // 根据筛选模式过滤
  if (filterMode === "linked") {
    images = images.filter((image) => 
      image.prompt_groups && image.prompt_groups.length > 0
    );
  } else if (filterMode === "unlinked") {
    images = images.filter((image) => 
      !image.prompt_groups || image.prompt_groups.length === 0
    );
  }

  // 根据搜索关键词过滤
  if (!keyword) {
    return images;
  }

  return images.filter((image) => {
    const primaryModel = image.models.find((model) => model.is_primary)?.name || "";
    return (
      image.filename.toLowerCase().includes(keyword) ||
      primaryModel.toLowerCase().includes(keyword) ||
      (image.prompt_groups && 
       image.prompt_groups.some((group) => 
         group.prompt.toLowerCase().includes(keyword)
       ))
    );
  });
}, [allImages, imageSearch, filterMode]);
```

### 按钮组件

```typescript
<div className="flex gap-2">
  <Button
    type="button"
    variant={filterMode === "all" ? "default" : "outline"}
    size="sm"
    onClick={() => setFilterMode("all")}
    className="flex-1"
  >
    全部
  </Button>
  <Button
    type="button"
    variant={filterMode === "linked" ? "default" : "outline"}
    size="sm"
    onClick={() => setFilterMode("linked")}
    className="flex-1"
  >
    已关联
  </Button>
  <Button
    type="button"
    variant={filterMode === "unlinked" ? "default" : "outline"}
    size="sm"
    onClick={() => setFilterMode("unlinked")}
    className="flex-1"
  >
    未关联
  </Button>
</div>
```

## 数据依赖

### ImageWithRelations 类型

```typescript
export interface ImageWithRelations extends Image {
  models: ModelInfo[];
  tags: Tag[];
  prompt_groups: PromptGroup[];  // 关键字段
}
```

### PromptGroup 类型

```typescript
export interface PromptGroup {
  id: string;
  prompt: string;
  negative_prompt?: string;
  description?: string;
  image_count: number;
  created_at: string;
  updated_at: string;
}
```

## 用户体验优化

### 1. 视觉反馈

- **激活按钮**：使用 `variant="default"` 深色背景
- **未激活按钮**：使用 `variant="outline"` 浅色边框
- **徽章显示**：
  - "已选中"：主色调徽章
  - "X 个组"：次要色调徽章

### 2. 空状态提示

根据不同的筛选模式显示不同的提示：

- **全部模式**："当前没有可关联的图片"
- **已关联模式**："没有已关联的图片"
- **未关联模式**："没有未关联的图片"

### 3. 信息展示

- **已关联图片**：显示关联的 Prompt 组列表（最多 2 行）
- **未关联图片**：不显示额外信息
- **已选中图片**：优先显示"已选中"徽章

## 性能考虑

### 1. useMemo 优化

使用 `useMemo` 缓存筛选结果，避免不必要的重新计算：

```typescript
const filteredImages = useMemo(() => {
  // 筛选逻辑
}, [allImages, imageSearch, filterMode]);
```

### 2. 依赖项

- `allImages`：图片列表变化时重新筛选
- `imageSearch`：搜索关键词变化时重新筛选
- `filterMode`：筛选模式变化时重新筛选

## 常见问题

### Q1: 为什么有些图片显示"X 个组"？

**A**: 这表示该图片已经关联到 X 个 Prompt 组。一张图片可以同时属于多个 Prompt 组。

### Q2: 点击"已关联"后没有图片？

**A**: 这说明当前没有图片关联到任何 Prompt 组。你可以：
1. 切换到"未关联"查看未分组的图片
2. 为这些图片创建 Prompt 组

### Q3: 如何快速找到未分组的图片？

**A**: 点击"未关联"筛选按钮，系统会只显示还没有关联到任何 Prompt 组的图片。

### Q4: 筛选和搜索可以同时使用吗？

**A**: 可以！筛选按钮和搜索框是独立的：
1. 先选择筛选模式（全部/已关联/未关联）
2. 再在搜索框中输入关键词
3. 系统会在筛选结果中进行搜索

### Q5: 如何取消筛选？

**A**: 点击"全部"按钮即可显示所有图片。

## 未来改进

### 计划中的功能

1. **筛选统计**
   - 显示每个筛选模式下的图片数量
   - 例如："全部 (50)" "已关联 (30)" "未关联 (20)"

2. **快速操作**
   - 一键选择所有未关联图片
   - 一键取消选择所有已关联图片

3. **高级筛选**
   - 按关联组数量筛选（1个组、2个组、3个以上）
   - 按特定 Prompt 组筛选

4. **排序功能**
   - 按关联组数量排序
   - 按文件名排序
   - 按创建时间排序

## 相关文档

- [Prompt 对比功能](./PROMPT_COMPARISON.md)
- [Prompt 对比快速开始](../guides/PROMPT_COMPARISON_QUICKSTART.md)
- [Prompt 对比更新说明](../PROMPT_COMPARISON_UPDATES.md)

---

**更新日期**：2026-05-21  
**功能状态**：✅ 已实现
