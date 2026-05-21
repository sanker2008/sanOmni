# 更新日志 - 2026-05-21

## 🎉 新功能：Prompt 对比

### 概述

添加了全新的 **Prompt 对比** 功能，允许用户将使用相同 prompt 生成的图片组织在一起，方便对比不同模型在相同提示词下的效果差异。

### 核心功能

#### 1. 自动分组 ✨

系统可以自动检测数据库中具有相同 prompt 的图片，并创建 Prompt 组。

**特点**：
- 一键操作，自动扫描所有图片
- 智能识别相同的 prompt（包括 negative_prompt）
- 至少 2 张图片才会创建组
- 避免重复创建

**使用方法**：
```
Prompt 对比标签页 → 自动分组按钮 → 完成
```

#### 2. 对比视图 📊

在 Prompt 组详情中，图片按模型自动分组显示，方便直观对比。

**显示特点**：
- 按"厂商 - 模型"分组
- 网格布局，支持响应式
- 显示图片尺寸和文件名
- 支持滚动浏览

**示例布局**：
```
OpenAI - DALL-E 3
  [图片1] [图片2] [图片3]

Google - Imagen 3
  [图片4] [图片5]

Midjourney - Midjourney v6
  [图片6] [图片7] [图片8]
```

#### 3. 组管理 🗂️

完整的 Prompt 组管理功能：

- ✅ 查看组列表
- ✅ 查看组详情（含图片）
- ✅ 删除组（不删除图片）
- ✅ 刷新列表
- 🔜 编辑组信息（计划中）
- 🔜 手动创建组（计划中）
- 🔜 添加/移除图片（计划中）

### 技术实现

#### 数据库变更

**新增表**：
```sql
-- Prompt 组表
CREATE TABLE prompt_groups (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    negative_prompt TEXT,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 图片与 Prompt 组关联表
CREATE TABLE image_prompt_group_relations (
    image_id TEXT NOT NULL,
    prompt_group_id TEXT NOT NULL,
    PRIMARY KEY (image_id, prompt_group_id),
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
    FOREIGN KEY (prompt_group_id) REFERENCES prompt_groups(id) ON DELETE CASCADE
);
```

**新增索引**：
```sql
CREATE INDEX idx_images_prompt ON images(prompt);
CREATE INDEX idx_ipgr_group ON image_prompt_group_relations(prompt_group_id);
```

#### 后端 API

新增 8 个 Tauri 命令：

1. `create_prompt_group` - 创建 Prompt 组
2. `get_prompt_groups` - 获取所有组
3. `get_prompt_group_with_images` - 获取组详情
4. `add_images_to_prompt_group` - 添加图片到组
5. `remove_images_from_prompt_group` - 从组移除图片
6. `update_prompt_group` - 更新组信息
7. `delete_prompt_group` - 删除组
8. `auto_group_by_prompt` - 自动分组（核心）

#### 前端组件

**新增组件**：
- `PromptGroupsView.tsx` - Prompt 对比主视图

**UI 更新**：
- 主导航添加"Prompt 对比"标签页
- 使用 Sparkles (✨) 图标
- 响应式布局，支持移动端

### 使用场景

#### 场景 1：模型选择

为特定类型的图片选择最佳模型：

```
准备标准 prompt → 多模型生成 → 导入系统 → 自动分组 → 查看对比 → 选择最佳
```

#### 场景 2：Prompt 优化

测试不同 prompt 变体的效果：

```
准备 prompt 变体 → 同模型生成 → 导入分组 → 对比效果 → 优化 prompt
```

#### 场景 3：版本对比

对比模型不同版本的效果：

```
相同 prompt → 不同版本 → 导入标记 → 查看差异 → 评估升级
```

### 文件变更

#### 新增文件

**后端**：
- `src-tauri/src/commands/prompt_groups.rs` - Prompt 组命令实现

**前端**：
- `src/components/PromptGroupsView.tsx` - Prompt 对比视图

**文档**：
- `docs/PROMPT_COMPARISON.md` - 完整功能文档
- `docs/PROMPT_COMPARISON_QUICKSTART.md` - 快速开始指南
- `PROMPT_COMPARISON_IMPLEMENTATION.md` - 实现总结
- `docs/CHANGELOG_2026-05-21_PROMPT_COMPARISON.md` - 本更新日志

#### 修改文件

**后端**：
- `src-tauri/src/database/mod.rs` - 添加新表和索引
- `src-tauri/src/models/mod.rs` - 添加数据模型
- `src-tauri/src/commands/mod.rs` - 导出新模块
- `src-tauri/src/lib.rs` - 注册新命令

**前端**：
- `src/App.tsx` - 添加新标签页
- `src/stores/index.ts` - 扩展 UI Store

### 数据库迁移

⚠️ **重要提示**：此更新需要数据库 schema 变更。

#### 方式 1：重置数据库（推荐用于测试）

```
设置 → 数据管理 → 重置数据库
```

**注意**：会清空所有数据！

#### 方式 2：手动迁移（保留数据）

在数据库中执行以下 SQL：

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

### 性能影响

- ✅ 新增索引提升 prompt 查询性能
- ✅ 按需加载图片，不影响主界面性能
- ✅ 自动分组使用批量操作，效率高
- ⚠️ 大量 Prompt 组时可能需要分页（未来优化）

### 已知限制

1. **手动创建组**：当前版本仅支持自动分组，手动创建功能计划在下个版本提供
2. **编辑功能**：暂不支持编辑 Prompt 组信息
3. **批量操作**：暂不支持从图片列表直接创建组
4. **导出功能**：暂不支持导出对比报告

### 未来计划

#### 短期（1-2 周）

- [ ] 从图片列表手动创建 Prompt 组
- [ ] 编辑 Prompt 组信息
- [ ] 添加/移除图片到组
- [ ] 批量操作支持

#### 中期（1-2 月）

- [ ] Prompt 库功能
- [ ] 图片评分系统
- [ ] 导出对比报告（PDF/HTML）
- [ ] 搜索和筛选 Prompt 组

#### 长期（3-6 月）

- [ ] 智能推荐最佳模型
- [ ] AI 辅助 Prompt 优化
- [ ] 统计分析和可视化
- [ ] 分享和协作功能

### 测试建议

#### 基础测试

1. **自动分组测试**
   ```
   导入 3 张相同 prompt 的图片 → 自动分组 → 验证创建成功
   ```

2. **对比视图测试**
   ```
   打开 Prompt 组 → 验证图片按模型分组 → 验证显示正常
   ```

3. **删除测试**
   ```
   删除 Prompt 组 → 验证图片未被删除 → 验证组已移除
   ```

#### 边界测试

1. **空数据**：没有图片时的显示
2. **无重复**：没有重复 prompt 时的自动分组
3. **大数据**：100+ Prompt 组的性能
4. **异常**：图片文件不存在时的处理

### 反馈和支持

如有问题或建议，请：

- 📖 查看 [快速开始指南](./PROMPT_COMPARISON_QUICKSTART.md)
- 📚 阅读 [完整文档](./PROMPT_COMPARISON.md)
- 🐛 提交 Issue
- 💬 联系开发团队

### 致谢

感谢所有测试用户的反馈和建议！

---

## 其他更新

### 优化

- 优化了图片查询性能（新增 prompt 索引）
- 改进了数据库结构（支持多对多关系）

### 修复

- 无

---

**版本**：v1.1.0  
**发布日期**：2026-05-21  
**更新类型**：功能更新（Feature Update）
