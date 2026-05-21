# Prompt 对比功能实现总结

## 实现日期
2026-05-21

## 功能概述

实现了 Prompt 对比功能，允许用户将使用相同 prompt 生成的图片组织在一起，方便对比不同模型在相同提示词下的效果差异。

## 核心价值

**解决的问题**：
- 同一套 prompt 对应不同模型产出不同效果图的管理和对比
- Prompt 的复用和管理
- 模型效果的直观对比

## 实现内容

### 1. 数据库扩展

**新增表**：
- `prompt_groups` - 存储 Prompt 组信息
- `image_prompt_group_relations` - 图片与 Prompt 组的多对多关系

**新增索引**：
- `idx_images_prompt` - 加速 prompt 查询
- `idx_ipgr_group` - 加速组关联查询

### 2. 后端实现

**新增文件**：
- `src-tauri/src/commands/prompt_groups.rs` - Prompt 组管理命令

**新增命令**（8个）：
1. `create_prompt_group` - 创建 Prompt 组
2. `get_prompt_groups` - 获取所有组
3. `get_prompt_group_with_images` - 获取组详情（含图片）
4. `add_images_to_prompt_group` - 添加图片到组
5. `remove_images_from_prompt_group` - 从组移除图片
6. `update_prompt_group` - 更新组信息
7. `delete_prompt_group` - 删除组
8. `auto_group_by_prompt` - 自动分组（核心功能）

**数据模型**：
- `PromptGroup` - Prompt 组结构
- `PromptGroupWithImages` - 包含图片的完整组信息

### 3. 前端实现

**新增组件**：
- `src/components/PromptGroupsView.tsx` - Prompt 对比主视图

**功能特性**：
- Prompt 组列表展示
- 自动分组按钮
- 对比视图（按模型分组显示图片）
- 组管理（查看、删除）
- 响应式布局

**UI 集成**：
- 在主导航添加"Prompt 对比"标签页
- 使用 Sparkles 图标标识
- 更新 UI Store 支持新标签页

### 4. 文档

**新增文档**：
- `docs/PROMPT_COMPARISON.md` - 完整功能文档
- `PROMPT_COMPARISON_IMPLEMENTATION.md` - 实现总结（本文档）

## 技术亮点

### 1. 智能自动分组

```sql
-- 查找有相同 prompt 的图片（至少 2 张）
SELECT prompt, negative_prompt, GROUP_CONCAT(id) as image_ids, COUNT(*) as count
FROM images
WHERE prompt IS NOT NULL AND prompt != ''
GROUP BY prompt, negative_prompt
HAVING count >= 2
```

自动检测重复 prompt，一键创建所有可能的对比组。

### 2. 按模型分组显示

在对比视图中，图片按"厂商 - 模型"自动分组：
```
OpenAI - DALL-E 3
  [图片1] [图片2] [图片3]

Google - Imagen 3
  [图片4] [图片5]
```

方便直观对比不同模型的效果。

### 3. 多对多关系

一张图片可以属于多个 Prompt 组，支持：
- 同一图片用于不同的对比场景
- 灵活的组织方式
- 不影响原有图片管理

### 4. 级联删除

- 删除图片时自动清理关联关系
- 删除 Prompt 组不影响图片本身
- 保证数据一致性

## 使用流程

```
1. 导入图片（确保有 prompt 信息）
   ↓
2. 点击"Prompt 对比"标签页
   ↓
3. 点击"自动分组"
   ↓
4. 系统自动创建 Prompt 组
   ↓
5. 点击"查看对比"
   ↓
6. 按模型分组查看效果对比
```

## 文件清单

### 修改的文件

1. `src-tauri/src/database/mod.rs`
   - 添加 prompt_groups 表
   - 添加 image_prompt_group_relations 表
   - 添加相关索引

2. `src-tauri/src/models/mod.rs`
   - 添加 PromptGroup 结构
   - 添加 PromptGroupWithImages 结构

3. `src-tauri/src/commands/mod.rs`
   - 导出 prompt_groups 模块

4. `src-tauri/src/lib.rs`
   - 注册 8 个新命令

5. `src/App.tsx`
   - 添加 Prompt 对比标签页
   - 导入 PromptGroupsView 组件
   - 添加路由逻辑

6. `src/stores/index.ts`
   - 扩展 activeTab 类型支持 "prompt-groups"

### 新增的文件

1. `src-tauri/src/commands/prompt_groups.rs` - 后端命令实现
2. `src/components/PromptGroupsView.tsx` - 前端视图组件
3. `docs/PROMPT_COMPARISON.md` - 功能文档
4. `PROMPT_COMPARISON_IMPLEMENTATION.md` - 实现总结

## 数据库迁移

**注意**：现有数据库需要更新 schema。

**方式 1 - 重置数据库**（会丢失数据）：
- 在设置中点击"重置数据库"

**方式 2 - 手动迁移**（保留数据）：
```sql
-- 创建新表
CREATE TABLE IF NOT EXISTS prompt_groups (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    negative_prompt TEXT,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS image_prompt_group_relations (
    image_id TEXT NOT NULL,
    prompt_group_id TEXT NOT NULL,
    PRIMARY KEY (image_id, prompt_group_id),
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
    FOREIGN KEY (prompt_group_id) REFERENCES prompt_groups(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_images_prompt ON images(prompt);
CREATE INDEX IF NOT EXISTS idx_ipgr_group ON image_prompt_group_relations(prompt_group_id);
```

## 测试建议

### 功能测试

1. **自动分组测试**
   - 导入多张具有相同 prompt 的图片
   - 点击"自动分组"
   - 验证组是否正确创建

2. **对比视图测试**
   - 打开一个 Prompt 组
   - 验证图片按模型正确分组
   - 验证图片显示正常

3. **组管理测试**
   - 删除组（验证图片未被删除）
   - 刷新列表
   - 验证数据一致性

### 边界测试

1. **空数据测试**
   - 没有图片时的显示
   - 没有重复 prompt 时的自动分组

2. **大数据测试**
   - 大量 Prompt 组的性能
   - 单个组包含大量图片的性能

3. **异常测试**
   - 图片文件不存在
   - 数据库连接失败
   - 并发操作

## 未来扩展方向

### 短期（1-2 周）

1. **从图片列表创建组**
   - 在 InboxView/ArchivedView 中选择图片
   - 右键菜单"创建 Prompt 组"
   - 自动填充 prompt 信息

2. **编辑组功能**
   - 修改 prompt 和描述
   - 添加/移除图片
   - 批量操作

### 中期（1-2 月）

1. **Prompt 库**
   - 将常用 prompt 保存为模板
   - 支持变量和参数化
   - 快速应用到新图片

2. **评分系统**
   - 为图片打分
   - 统计模型平均分
   - 生成对比报告

### 长期（3-6 月）

1. **智能推荐**
   - 基于历史数据推荐最佳模型
   - 根据 prompt 类型推荐参数
   - AI 辅助 prompt 优化

2. **导出功能**
   - 生成对比报告（PDF/HTML）
   - 导出 prompt 库
   - 分享对比结果

## 性能考虑

### 当前实现

- 使用索引优化查询
- 图片按需加载
- 简单的内存管理

### 优化空间

1. **分页加载**
   - 当 Prompt 组很多时
   - 实现虚拟滚动

2. **缓存策略**
   - 缓存常用组的数据
   - 减少数据库查询

3. **图片预加载**
   - 智能预加载下一组图片
   - 提升浏览体验

## 总结

成功实现了 Prompt 对比功能，核心价值是：

✅ **解决了同一 prompt 对应不同模型效果对比的需求**
✅ **提供了自动分组功能，降低使用门槛**
✅ **按模型分组显示，直观对比效果**
✅ **完整的 CRUD 操作，易于管理**
✅ **良好的扩展性，支持未来功能增强**

这个功能将 sanMediaBox 从单纯的图片管理工具提升为 **AI 图片生成效果对比和 Prompt 管理平台**，为用户提供了更大的价值。
