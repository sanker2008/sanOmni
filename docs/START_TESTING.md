# 启动和测试 Prompt 对比功能

## 🚀 快速启动

### 步骤 1：启动开发服务器

```bash
npm run tauri:dev
```

**预期结果**：
- Vite 开发服务器启动在 http://localhost:1420
- Tauri 应用窗口打开
- 应用正常显示

**如果遇到错误**：
- 确保端口 1420 未被占用
- 检查 Node.js 版本（需要 18+）
- 检查 Rust 工具链是否安装

### 步骤 2：数据库初始化

**首次启动**：
- 应用会自动创建数据库和新表
- 位置：`%USERPROFILE%\.ai-image-manager\data\database.sqlite`

**如果已有旧数据库**：

方式 1 - 重置数据库（会清空数据）：
```
应用 → 设置 → 数据管理 → 重置数据库
```

方式 2 - 手动迁移（保留数据）：
1. 使用 SQLite 工具打开数据库
2. 执行以下 SQL：

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

## 🧪 测试流程

### 测试 1：基础界面测试

1. 启动应用
2. 查看顶部导航栏
3. 确认有"Prompt 对比"标签页（带 ✨ 图标）
4. 点击标签页
5. 确认显示空状态："还没有 Prompt 组"

**预期结果**：✅ 界面正常显示

### 测试 2：准备测试数据

**方式 1 - 导入真实图片**：
1. 准备 3-5 张 AI 生成的图片
2. 确保它们有相同的 prompt
3. 在收件箱中导入这些图片
4. 编辑每张图片，填写相同的 prompt

**方式 2 - 使用现有图片**：
1. 在收件箱中选择 2-3 张图片
2. 编辑它们，设置相同的 prompt
3. 保存

**示例 prompt**：
```
a beautiful sunset over mountains, golden hour, cinematic lighting
```

### 测试 3：自动分组测试

1. 切换到"Prompt 对比"标签页
2. 点击右上角"自动分组"按钮
3. 等待处理完成

**预期结果**：
- 弹出提示："成功创建 X 个 Prompt 组"
- 列表中显示新创建的组
- 组卡片显示 prompt 内容

### 测试 4：查看对比测试

1. 在 Prompt 组列表中，找到刚创建的组
2. 点击"查看对比"按钮
3. 查看对话框内容

**预期结果**：
- 对话框打开
- 显示完整的 prompt
- 图片按模型分组显示
- 每个模型组有标签（如"OpenAI - DALL-E 3"）
- 图片正确加载

### 测试 5：删除组测试

1. 在 Prompt 组列表中，点击某个组的删除按钮（垃圾桶图标）
2. 确认删除对话框
3. 点击确认

**预期结果**：
- 组从列表中移除
- 图片仍然存在于收件箱/归档中

### 测试 6：刷新测试

1. 点击右上角"刷新"按钮
2. 观察列表更新

**预期结果**：
- 列表重新加载
- 显示最新数据

## 🐛 常见问题排查

### 问题 1：启动失败

**错误**：`Error: spawn EINVAL`

**解决方法**：
- ✅ 已修复：更新了 `ensure-vite-for-tauri.mjs`
- 重新运行 `npm run tauri:dev`

### 问题 2：数据库错误

**错误**：`table prompt_groups does not exist`

**解决方法**：
1. 删除旧数据库文件
2. 重启应用，自动创建新数据库
3. 或执行手动迁移 SQL

### 问题 3：自动分组没有结果

**原因**：
- 图片没有 prompt 信息
- 没有重复的 prompt

**解决方法**：
1. 检查图片是否有 prompt
2. 确保至少 2 张图片有相同 prompt
3. 在图片编辑界面手动添加 prompt

### 问题 4：图片不显示

**原因**：
- 图片文件路径错误
- 图片文件已移动或删除

**解决方法**：
1. 检查图片文件是否存在
2. 在设置中重新扫描归档目录
3. 查看浏览器控制台错误信息

### 问题 5：编译错误

**错误**：Rust 编译失败

**解决方法**：
1. 检查 Rust 工具链：`rustc --version`
2. 更新 Rust：`rustup update`
3. 清理构建缓存：`cd src-tauri && cargo clean`
4. 重新构建：`npm run tauri:dev`

## 📊 性能基准

### 预期性能指标

- **自动分组**：100 张图片 < 5 秒
- **打开对比视图**：20 张图片 < 1 秒
- **列表滚动**：流畅，无卡顿
- **图片加载**：按需加载，不阻塞 UI

### 性能测试

1. 导入 100+ 张图片
2. 运行自动分组
3. 记录耗时
4. 打开包含多张图片的组
5. 测试滚动性能

## 🎯 测试目标

### 必须通过的测试

- [x] 应用启动成功
- [ ] Prompt 对比标签页显示
- [ ] 自动分组功能正常
- [ ] 对比视图正确显示
- [ ] 删除功能正常
- [ ] 数据持久化正常

### 可选测试

- [ ] 性能测试（100+ 图片）
- [ ] 边界情况测试
- [ ] 并发操作测试
- [ ] 错误恢复测试

## 📝 测试记录

### 测试环境

- 操作系统：Windows 11
- Node.js：v24.12.0
- Rust：_______
- 测试日期：2026-05-21

### 测试结果

| 测试项 | 状态 | 备注 |
|--------|------|------|
| 应用启动 | ⏳ 待测试 | |
| 界面显示 | ⏳ 待测试 | |
| 自动分组 | ⏳ 待测试 | |
| 查看对比 | ⏳ 待测试 | |
| 删除功能 | ⏳ 待测试 | |
| 刷新功能 | ⏳ 待测试 | |

**状态说明**：
- ✅ 通过
- ❌ 失败
- ⏳ 待测试
- ⚠️ 部分通过

### 发现的问题

1. _______
2. _______
3. _______

### 改进建议

1. _______
2. _______
3. _______

## 🎉 测试完成后

### 如果测试通过

1. ✅ 标记所有测试项为通过
2. 📝 更新 README.md
3. 🚀 准备发布
4. 📢 通知用户

### 如果测试失败

1. 📋 记录失败的测试项和错误信息
2. 🔍 分析失败原因
3. 🔧 修复问题
4. 🔄 重新测试

## 📚 相关文档

- [功能文档](./docs/PROMPT_COMPARISON.md)
- [快速开始](./docs/PROMPT_COMPARISON_QUICKSTART.md)
- [实现总结](./PROMPT_COMPARISON_IMPLEMENTATION.md)
- [测试清单](./TEST_PROMPT_COMPARISON.md)
- [更新日志](./docs/CHANGELOG_2026-05-21_PROMPT_COMPARISON.md)

## 💡 提示

- 使用浏览器开发者工具（F12）查看控制台日志
- 检查 Tauri 后端日志（终端输出）
- 使用 SQLite 工具查看数据库内容
- 保存测试数据以便重复测试

---

**准备好了吗？让我们开始测试！** 🚀

```bash
npm run tauri:dev
```
