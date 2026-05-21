# Prompt 对比功能

## 功能概述

Prompt 对比功能允许用户将使用相同 prompt 生成的图片组织在一起，方便对比不同模型在相同提示词下的效果差异。

## 核心概念

### Prompt 组（Prompt Group）

一个 Prompt 组包含：
- **Prompt**：正向提示词
- **Negative Prompt**：负面提示词（可选）
- **Description**：组描述（可选）
- **关联图片**：使用该 prompt 生成的所有图片

### 使用场景

1. **模型对比**：使用相同 prompt 在不同模型（如 DALL-E 3、Midjourney v6、Imagen 3）上生成图片，对比效果
2. **Prompt 管理**：将常用的 prompt 保存为组，方便复用和管理
3. **效果追踪**：记录同一 prompt 在不同时间、不同模型版本下的生成效果

## 功能特性

### 1. 自动分组

系统可以自动检测数据库中具有相同 prompt 的图片，并创建 Prompt 组。

**使用方法**：
- 点击"Prompt 对比"标签页
- 点击"自动分组"按钮
- 系统会扫描所有图片，将具有相同 prompt 的图片（至少 2 张）自动创建为组

### 2. 手动创建组

可以手动选择图片创建 Prompt 组。

**使用方法**：
- 在图片列表中选择多张图片
- 点击"创建 Prompt 组"
- 输入 prompt 和其他信息
- 保存

### 3. 对比视图

在 Prompt 组详情中，图片会按模型自动分组显示，方便对比。

**显示方式**：
```
OpenAI - DALL-E 3
  [图片1] [图片2] [图片3]

Google - Imagen 3
  [图片4] [图片5]

Midjourney - Midjourney v6
  [图片6] [图片7] [图片8] [图片9]
```

### 4. 组管理

- **查看详情**：点击"查看对比"查看组内所有图片
- **添加图片**：将新图片添加到现有组
- **移除图片**：从组中移除图片（不删除图片本身）
- **编辑组**：修改 prompt、描述等信息
- **删除组**：删除 Prompt 组（不会删除图片）

## 数据库结构

### prompt_groups 表

```sql
CREATE TABLE prompt_groups (
    id                  TEXT PRIMARY KEY,
    prompt              TEXT NOT NULL,
    negative_prompt     TEXT,
    description         TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);
```

### image_prompt_group_relations 表

```sql
CREATE TABLE image_prompt_group_relations (
    image_id            TEXT NOT NULL,
    prompt_group_id     TEXT NOT NULL,
    PRIMARY KEY (image_id, prompt_group_id),
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
    FOREIGN KEY (prompt_group_id) REFERENCES prompt_groups(id) ON DELETE CASCADE
);
```

## API 接口

### 后端命令

1. **create_prompt_group** - 创建 Prompt 组
   ```rust
   async fn create_prompt_group(
       db_path: PathBuf,
       prompt: String,
       negative_prompt: Option<String>,
       description: Option<String>,
       image_ids: Vec<String>,
   ) -> Result<PromptGroup, String>
   ```

2. **get_prompt_groups** - 获取所有 Prompt 组
   ```rust
   async fn get_prompt_groups(
       db_path: PathBuf
   ) -> Result<Vec<PromptGroup>, String>
   ```

3. **get_prompt_group_with_images** - 获取 Prompt 组详情（含图片）
   ```rust
   async fn get_prompt_group_with_images(
       db_path: PathBuf,
       group_id: String,
   ) -> Result<PromptGroupWithImages, String>
   ```

4. **add_images_to_prompt_group** - 添加图片到组
   ```rust
   async fn add_images_to_prompt_group(
       db_path: PathBuf,
       group_id: String,
       image_ids: Vec<String>,
   ) -> Result<(), String>
   ```

5. **remove_images_from_prompt_group** - 从组移除图片
   ```rust
   async fn remove_images_from_prompt_group(
       db_path: PathBuf,
       group_id: String,
       image_ids: Vec<String>,
   ) -> Result<(), String>
   ```

6. **update_prompt_group** - 更新 Prompt 组
   ```rust
   async fn update_prompt_group(
       db_path: PathBuf,
       group_id: String,
       prompt: Option<String>,
       negative_prompt: Option<String>,
       description: Option<String>,
   ) -> Result<(), String>
   ```

7. **delete_prompt_group** - 删除 Prompt 组
   ```rust
   async fn delete_prompt_group(
       db_path: PathBuf,
       group_id: String
   ) -> Result<(), String>
   ```

8. **auto_group_by_prompt** - 自动分组
   ```rust
   async fn auto_group_by_prompt(
       db_path: PathBuf
   ) -> Result<Vec<PromptGroup>, String>
   ```

### 前端组件

- **PromptGroupsView** - Prompt 对比主视图
  - 显示所有 Prompt 组列表
  - 提供自动分组功能
  - 查看组详情和对比

## 使用流程

### 典型工作流程

1. **导入图片**
   - 将不同模型生成的图片导入系统
   - 确保图片的 prompt 字段已填写

2. **自动分组**
   - 进入"Prompt 对比"标签页
   - 点击"自动分组"
   - 系统自动创建 Prompt 组

3. **查看对比**
   - 点击某个 Prompt 组的"查看对比"
   - 系统按模型分组显示图片
   - 直观对比不同模型的效果

4. **管理组**
   - 添加新生成的图片到现有组
   - 编辑 prompt 或描述
   - 删除不需要的组

## 最佳实践

### 1. Prompt 规范化

为了更好地自动分组，建议：
- 使用一致的 prompt 格式
- 避免在 prompt 中包含模型特定的参数
- 将核心描述和风格参数分开

### 2. 批量测试

进行模型对比时：
- 准备一组标准 prompt
- 在多个模型上批量生成
- 使用自动分组功能快速组织
- 在对比视图中评估效果

### 3. 版本管理

对于重要的 prompt：
- 在描述中记录测试日期和目的
- 保留不同版本的生成结果
- 定期清理过时的组

## 未来扩展

### 计划中的功能

1. **Prompt 库**
   - 将 Prompt 组导出为可复用的模板
   - 支持 prompt 变量和参数化

2. **评分系统**
   - 为每张图片打分
   - 统计不同模型的平均得分

3. **导出报告**
   - 生成对比报告（PDF/HTML）
   - 包含图片和统计数据

4. **智能推荐**
   - 基于历史数据推荐最佳模型
   - 根据 prompt 类型推荐参数

5. **批量操作**
   - 从图片列表直接创建组
   - 批量编辑组信息

## 技术细节

### 性能优化

- 使用索引加速 prompt 查询
- 图片按需加载，避免一次性加载大量图片
- 对比视图使用虚拟滚动

### 数据一致性

- 删除图片时自动清理关联关系（CASCADE）
- 删除 Prompt 组不影响图片本身
- 支持一张图片属于多个组

### 扩展性

- 数据模型支持未来添加更多元数据
- API 设计考虑了批量操作的需求
- UI 组件模块化，易于扩展

## 故障排除

### 自动分组没有结果

**原因**：
- 图片的 prompt 字段为空
- 没有重复的 prompt
- 已经创建过相同的组

**解决方法**：
- 检查图片是否有 prompt 信息
- 确保至少有 2 张图片使用相同 prompt
- 查看是否已存在相同的组

### 图片显示不正确

**原因**：
- 图片文件已移动或删除
- 路径转换问题

**解决方法**：
- 检查图片文件是否存在
- 重新扫描归档目录
- 查看控制台错误信息

## 相关文档

- [数据持久化](./DATA_PERSISTENCE.md)
- [存储结构](./STORAGE_STRUCTURE.md)
- [使用指南](./USAGE.md)
