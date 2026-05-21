# Prompt 对比功能 - 更新说明

## 更新日期
2026-05-21

## 你的改进

基于初始实现，你做了以下重要改进：

### 1. 添加 `image_count` 字段 ✨

**改进内容**：
- 在 `PromptGroup` 结构中添加了 `image_count` 字段
- 在查询时动态计算每个组包含的图片数量

**影响的文件**：
- `src-tauri/src/models/mod.rs` - 数据模型
- `src/stores/index.ts` - TypeScript 类型定义
- `src-tauri/src/commands/prompt_groups.rs` - 所有查询命令

**好处**：
- ✅ 无需额外查询即可显示图片数量
- ✅ 提升列表显示性能
- ✅ 更好的用户体验

**实现细节**：
```rust
// 在 get_prompt_groups 中使用 COUNT 聚合
SELECT
    pg.id,
    pg.prompt,
    pg.negative_prompt,
    pg.description,
    COUNT(ipgr.image_id) as image_count,  // 动态计算
    pg.created_at,
    pg.updated_at
FROM prompt_groups pg
LEFT JOIN image_prompt_group_relations ipgr ON pg.id = ipgr.prompt_group_id
GROUP BY pg.id, pg.prompt, pg.negative_prompt, pg.description, pg.created_at, pg.updated_at
```

### 2. 添加图片关联管理功能 🔗

**新增命令**：

#### `get_prompt_groups_for_image`
获取某张图片已关联的所有 Prompt 组。

**用途**：
- 在图片编辑界面显示该图片属于哪些 Prompt 组
- 方便用户了解图片的分组情况

**实现**：
```rust
pub async fn get_prompt_groups_for_image(
    db_path: PathBuf,
    image_id: String,
) -> Result<Vec<PromptGroup>, String>
```

#### `set_prompt_groups_for_image`
直接设置某张图片关联的 Prompt 组（替换现有关联）。

**用途**：
- 在图片编辑界面批量设置 Prompt 组
- 使用事务确保数据一致性

**实现**：
```rust
pub async fn set_prompt_groups_for_image(
    db_path: PathBuf,
    image_id: String,
    group_ids: Vec<String>,
) -> Result<(), String>
```

**特点**：
- ✅ 使用事务保证原子性
- ✅ 先删除旧关联，再添加新关联
- ✅ 自动更新 Prompt 组的 `updated_at` 时间戳

### 3. 前端 API 集成 🌐

**新增 API 方法**：

在 `src/services/tauri.ts` 的 `promptApi` 中添加：

```typescript
async getForImage(imageId: string): Promise<PromptGroup[]> {
  const dbPath = await getDbPath();
  return invoke<PromptGroup[]>("get_prompt_groups_for_image", { dbPath, imageId });
}

async setForImage(imageId: string, groupIds: string[]): Promise<void> {
  const dbPath = await getDbPath();
  return invoke("set_prompt_groups_for_image", { dbPath, imageId, groupIds });
}
```

## 功能对比

### 初始实现（我的版本）

| 功能 | 状态 |
|------|------|
| 创建 Prompt 组 | ✅ |
| 获取所有组 | ✅ |
| 获取组详情 | ✅ |
| 添加图片到组 | ✅ |
| 从组移除图片 | ✅ |
| 更新组信息 | ✅ |
| 删除组 | ✅ |
| 自动分组 | ✅ |
| 显示图片数量 | ❌ |
| 获取图片的组 | ❌ |
| 设置图片的组 | ❌ |

### 改进后（你的版本）

| 功能 | 状态 |
|------|------|
| 创建 Prompt 组 | ✅ |
| 获取所有组 | ✅ |
| 获取组详情 | ✅ |
| 添加图片到组 | ✅ |
| 从组移除图片 | ✅ |
| 更新组信息 | ✅ |
| 删除组 | ✅ |
| 自动分组 | ✅ |
| 显示图片数量 | ✅ **新增** |
| 获取图片的组 | ✅ **新增** |
| 设置图片的组 | ✅ **新增** |

## 使用场景

### 场景 1：在图片编辑界面管理 Prompt 组

**流程**：
```
1. 用户打开图片编辑对话框
   ↓
2. 调用 promptApi.getForImage(imageId)
   ↓
3. 显示该图片已关联的 Prompt 组
   ↓
4. 用户选择/取消选择 Prompt 组
   ↓
5. 调用 promptApi.setForImage(imageId, selectedGroupIds)
   ↓
6. 保存成功
```

**UI 示例**：
```
┌─────────────────────────────────────┐
│ 编辑图片                            │
├─────────────────────────────────────┤
│ Prompt: a beautiful sunset...       │
│                                     │
│ 关联的 Prompt 组：                  │
│ ☑ 风景对比组 (5 张)                │
│ ☐ 日落效果组 (8 张)                │
│ ☑ 模型测试组 (12 张)               │
│                                     │
│ [保存] [取消]                       │
└─────────────────────────────────────┘
```

### 场景 2：显示图片数量

**在 Prompt 组列表中**：
```
┌─────────────────────────────────────┐
│ Prompt 对比                         │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ a beautiful sunset over...      │ │
│ │ 5 张图片                        │ │  ← 直接显示
│ │ [查看对比] [删除]               │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ cyberpunk city at night...      │ │
│ │ 8 张图片                        │ │  ← 直接显示
│ │ [查看对比] [删除]               │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## 技术细节

### 事务处理

在 `set_prompt_groups_for_image` 中使用事务：

```rust
let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
let tx = conn.transaction().map_err(|e| e.to_string())?;

// 1. 删除旧关联
tx.execute(
    "DELETE FROM image_prompt_group_relations WHERE image_id = ?1",
    [&image_id],
)?;

// 2. 添加新关联
for group_id in &group_ids {
    tx.execute(
        "INSERT OR IGNORE INTO image_prompt_group_relations (image_id, prompt_group_id)
         VALUES (?1, ?2)",
        rusqlite::params![&image_id, group_id],
    )?;
    
    // 3. 更新时间戳
    tx.execute(
        "UPDATE prompt_groups SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![&now, group_id],
    )?;
}

// 4. 提交事务
tx.commit()?;
```

**好处**：
- ✅ 原子性：要么全部成功，要么全部失败
- ✅ 一致性：不会出现部分更新的情况
- ✅ 性能：批量操作在一个事务中完成

### 性能优化

#### 1. 使用 LEFT JOIN 和 COUNT

```sql
-- 一次查询获取所有组和图片数量
SELECT
    pg.id,
    pg.prompt,
    COUNT(ipgr.image_id) as image_count
FROM prompt_groups pg
LEFT JOIN image_prompt_group_relations ipgr ON pg.id = ipgr.prompt_group_id
GROUP BY pg.id
```

**对比**：
- ❌ 旧方式：查询 N 个组 + N 次查询图片数量 = N+1 次查询
- ✅ 新方式：1 次查询获取所有数据

#### 2. 子查询计算图片数量

在 `get_prompt_groups_for_image` 中：

```sql
SELECT
    pg.id,
    pg.prompt,
    (
        SELECT COUNT(*)
        FROM image_prompt_group_relations ipgr2
        WHERE ipgr2.prompt_group_id = pg.id
    ) as image_count
FROM prompt_groups pg
INNER JOIN image_prompt_group_relations ipgr ON pg.id = ipgr.prompt_group_id
WHERE ipgr.image_id = ?1
```

## 命令总数

### 初始版本
- 8 个命令

### 改进版本
- **10 个命令**（新增 2 个）

### 完整命令列表

1. `create_prompt_group` - 创建 Prompt 组
2. `get_prompt_groups` - 获取所有组（含图片数量）
3. `get_prompt_group_with_images` - 获取组详情
4. `add_images_to_prompt_group` - 添加图片到组
5. `remove_images_from_prompt_group` - 从组移除图片
6. `update_prompt_group` - 更新组信息
7. `delete_prompt_group` - 删除组
8. `auto_group_by_prompt` - 自动分组
9. `get_prompt_groups_for_image` - 获取图片的组 **新增**
10. `set_prompt_groups_for_image` - 设置图片的组 **新增**

## 下一步建议

### 1. 在图片编辑界面集成

在 `QuickEditModal.tsx` 或 `BatchEditModal.tsx` 中添加 Prompt 组选择器：

```typescript
// 加载图片的 Prompt 组
const [promptGroups, setPromptGroups] = useState<PromptGroup[]>([]);
const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

useEffect(() => {
  if (imageId) {
    promptApi.getForImage(imageId).then(groups => {
      setPromptGroups(groups);
      setSelectedGroups(groups.map(g => g.id));
    });
  }
}, [imageId]);

// 保存时更新
const handleSave = async () => {
  await promptApi.setForImage(imageId, selectedGroups);
  // ... 其他保存逻辑
};
```

### 2. 添加 Prompt 组选择器组件

创建 `PromptGroupSelector.tsx`：

```typescript
interface PromptGroupSelectorProps {
  imageId: string;
  onChange: (groupIds: string[]) => void;
}

export function PromptGroupSelector({ imageId, onChange }: PromptGroupSelectorProps) {
  // 显示所有可用的 Prompt 组
  // 标记已选中的组
  // 支持多选
}
```

### 3. 在 Prompt 组详情中显示图片数量

已经实现！在 `PromptGroupsView.tsx` 中：

```typescript
<Badge variant="outline">{group.image_count} 张</Badge>
```

## 总结

你的改进非常棒！主要优点：

✅ **性能提升**：减少数据库查询次数  
✅ **功能完善**：支持从图片侧管理 Prompt 组  
✅ **用户体验**：直接显示图片数量  
✅ **数据一致性**：使用事务保证原子性  
✅ **代码质量**：清晰的 API 设计

这些改进使得 Prompt 对比功能更加完整和实用！

---

**状态**：✅ 所有代码无编译错误，可以开始测试

**下一步**：
1. 启动开发服务器：`npm run tauri:dev`
2. 测试新功能
3. 在图片编辑界面集成 Prompt 组选择器
