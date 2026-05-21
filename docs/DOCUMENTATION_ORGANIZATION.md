# 文档组织说明

## 📁 文档结构

### 根目录
```
sanMediaBox/
├── README.md                    # 项目主文档（唯一保留在根目录）
└── docs/                        # 所有其他文档
    ├── INDEX.md                 # 文档索引（新增）
    ├── PROMPT_*.md              # Prompt 相关文档
    ├── VENDOR_*.md              # 厂商管理相关文档
    ├── CHANGELOG_*.md           # 更新日志
    └── ...                      # 其他功能文档
```

## 📋 文档分类

### 1. 功能文档（用户向）
- `USAGE.md` - 使用指南
- `PROMPT_COMPARISON.md` - Prompt 对比功能
- `PROMPT_COMPARISON_QUICKSTART.md` - 快速开始
- `VENDOR_MANAGEMENT.md` - 厂商管理
- `DELETE_FEATURE.md` - 删除功能
- `IMAGE_VIEWER.md` - 图片查看器
- `FOLDER_MONITORING.md` - 文件夹监控
- 等等...

### 2. 技术文档（开发向）
- `PROMPT_COMPARISON_IMPLEMENTATION.md` - 实现细节
- `PROMPT_COMPARISON_SUMMARY.md` - 功能总结
- `PROMPT_COMPARISON_UPDATES.md` - 更新说明
- `VENDOR_MANAGEMENT_SUMMARY.md` - 厂商管理实现
- `CROSS_PLATFORM.md` - 跨平台支持
- `PLATFORM_FIXES.md` - 平台修复
- 等等...

### 3. 测试文档
- `READY_TO_TEST.md` - 准备测试
- `START_TESTING.md` - 启动测试
- `TEST_PROMPT_COMPARISON.md` - Prompt 测试清单
- `TEST_CHECKLIST_VENDOR_MANAGEMENT.md` - 厂商管理测试
- 等等...

### 4. 更新日志
- `CHANGELOG_2026-05-21_PROMPT_COMPARISON.md` - Prompt 对比功能
- `PROMPT_FILTER_UPDATE.md` - 筛选功能更新
- `CHANGELOG_2026-05-20.md` - 厂商管理更新
- `UI_IMPROVEMENTS_2026-05-20.md` - UI 改进
- 等等...

### 5. 其他文档
- `STORAGE_STRUCTURE.md` - 存储结构
- `DATA_PERSISTENCE.md` - 数据持久化
- `CUSTOM_STORAGE_PATH.md` - 自定义路径
- `TROUBLESHOOTING.md` - 故障排除
- 等等...

## 🔍 查找文档

### 方式 1：通过索引
查看 [INDEX.md](./INDEX.md) 获取完整的文档列表和分类。

### 方式 2：通过 README
查看根目录的 [README.md](../README.md) 获取主要文档链接。

### 方式 3：按主题搜索
在 `docs/` 目录中搜索关键词：
- Prompt 相关：`PROMPT_*.md`
- 厂商相关：`VENDOR_*.md`
- 测试相关：`TEST_*.md`
- 更新日志：`CHANGELOG_*.md`

## 📝 文档命名规范

### 功能文档
- 格式：`FEATURE_NAME.md`
- 示例：`PROMPT_COMPARISON.md`, `VENDOR_MANAGEMENT.md`

### 快速开始
- 格式：`FEATURE_NAME_QUICKSTART.md` 或 `QUICK_START_FEATURE_NAME.md`
- 示例：`PROMPT_COMPARISON_QUICKSTART.md`

### 实现文档
- 格式：`FEATURE_NAME_IMPLEMENTATION.md` 或 `FEATURE_NAME_SUMMARY.md`
- 示例：`PROMPT_COMPARISON_IMPLEMENTATION.md`

### 更新文档
- 格式：`FEATURE_NAME_UPDATE.md` 或 `FEATURE_NAME_UPDATES.md`
- 示例：`PROMPT_FILTER_UPDATE.md`

### 测试文档
- 格式：`TEST_FEATURE_NAME.md` 或 `TEST_CHECKLIST_FEATURE_NAME.md`
- 示例：`TEST_PROMPT_COMPARISON.md`

### 更新日志
- 格式：`CHANGELOG_YYYY-MM-DD.md` 或 `CHANGELOG_YYYY-MM-DD_FEATURE.md`
- 示例：`CHANGELOG_2026-05-21_PROMPT_COMPARISON.md`

## 🎯 文档维护

### 添加新文档
1. 在 `docs/` 目录创建文档
2. 使用规范的命名格式
3. 更新 `INDEX.md` 添加链接
4. 如果是重要文档，更新 `README.md`

### 更新现有文档
1. 直接编辑文档
2. 更新文档底部的"最后更新"日期
3. 如果结构有重大变化，更新 `INDEX.md`

### 删除文档
1. 从 `docs/` 目录删除文档
2. 从 `INDEX.md` 移除链接
3. 从 `README.md` 移除链接（如果有）
4. 检查其他文档中的引用链接

## 📊 文档统计

### 当前文档数量
- **总计**：36 个文档
- **功能文档**：约 15 个
- **技术文档**：约 10 个
- **测试文档**：约 5 个
- **更新日志**：约 6 个

### 文档覆盖
- ✅ Prompt 对比功能：完整
- ✅ 厂商管理功能：完整
- ✅ 图片管理功能：完整
- ✅ 存储管理功能：完整
- ✅ 测试指南：完整

## 🔄 迁移记录

### 2026-05-21：文档整理
**操作**：将根目录的所有文档（除 README.md）移动到 `docs/` 目录

**移动的文件**：
- `FOLDER_MONITORING_COMPLETE.md`
- `IMPLEMENTATION_CHECKLIST.md`
- `PROMPT_COMPARISON_IMPLEMENTATION.md`
- `PROMPT_COMPARISON_SUMMARY.md`
- `PROMPT_COMPARISON_UPDATES.md`
- `PROMPT_FILTER_UPDATE.md`
- `READY_TO_TEST.md`
- `START_TESTING.md`
- `TEST_PROMPT_COMPARISON.md`
- `VENDOR_MANAGEMENT_README.md`
- `VENDOR_MANAGEMENT_SUMMARY.md`

**新增文件**：
- `docs/INDEX.md` - 文档索引
- `docs/DOCUMENTATION_ORGANIZATION.md` - 本文档

**更新文件**：
- `README.md` - 添加文档索引链接

## 💡 最佳实践

### 编写文档
1. **清晰的标题**：使用有意义的标题
2. **结构化内容**：使用标题、列表、代码块
3. **示例代码**：提供实际可用的示例
4. **截图说明**：必要时添加截图
5. **更新日期**：在文档底部标注更新日期

### 链接文档
1. **相对路径**：使用相对路径链接其他文档
2. **描述性文本**：链接文本应描述目标内容
3. **检查链接**：确保链接有效

### 维护文档
1. **定期审查**：定期检查文档是否过时
2. **及时更新**：功能变更时同步更新文档
3. **删除过时**：删除不再相关的文档

---

**创建日期**：2026-05-21  
**最后更新**：2026-05-21  
**维护者**：开发团队
