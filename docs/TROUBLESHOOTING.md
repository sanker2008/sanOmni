# 图片不显示问题排查指南

## 问题描述
图片卡片显示为占位符图标，而不是实际的图片内容。

## 已修复的问题

### 1. 文件未复制到应用目录
**问题**：导入图片时只记录了原始路径，没有将文件复制到应用数据目录。

**修复**：
- 修改 `DropZone.tsx`，在导入时将文件复制到 `$APPDATA/inbox` 目录
- 添加时间戳前缀避免文件名冲突
- 改进错误处理，复制失败时跳过该文件并继续处理其他文件

### 2. Tauri 权限不足
**问题**：缺少文件系统操作权限。

**修复**：
- 在 `default.json` 中添加了必要的权限：
  - `fs:allow-copy-file`
  - `fs:allow-create`
  - `fs:allow-mkdir`
  - `fs:allow-exists`
  - `fs:allow-stat`
  - `fs:allow-read-dir`

## 测试步骤

### 1. 重新启动应用
```bash
npm run tauri dev
```

### 2. 导入测试图片
1. 点击"导入"按钮或拖放图片
2. 选择一张测试图片

### 3. 检查控制台日志
打开浏览器开发者工具（F12），查看控制台：

**成功的日志应该包含**：
```
Processing path: C:\Users\...\test.png
Extracted filename: test.png
File size: 123456
Copying file from: C:\Users\...\test.png
Copying file to: C:\Users\...\AppData\Roaming\com.sanmediabox.app\inbox\1234567890_test.png
File copied successfully
Calling imageApi.import with: {...}
Import result: {...}
```

**如果出现错误**：
- `Failed to copy file`: 检查源文件是否存在，权限是否正确
- `Failed to import image`: 检查数据库连接和后端日志

### 4. 验证文件复制
检查文件是否被复制到应用数据目录：
```
%APPDATA%\com.sanmediabox.app\inbox\
```

应该能看到带时间戳前缀的图片文件。

### 5. 检查图片显示
- 图片卡片应该显示实际的图片内容
- 如果仍然显示占位符，检查：
  - 浏览器控制台是否有图片加载错误
  - `convertFileSrc` 转换后的 URL 是否正确
  - 文件路径是否使用了正确的分隔符

## 常见问题

### Q: 旧的图片仍然不显示
**A**: 旧的图片记录仍然指向原始路径。解决方案：
1. 删除旧的图片记录
2. 重新导入图片
3. 或者手动将旧图片复制到 inbox 目录并更新数据库

### Q: 图片加载很慢
**A**: 可能是图片文件太大。建议：
1. 在导入时添加图片压缩
2. 生成缩略图用于列表显示
3. 点击查看时再加载原图

### Q: 某些图片格式不支持
**A**: 检查：
1. Tauri 是否支持该图片格式
2. 浏览器是否支持该图片格式
3. 文件扩展名是否在 `IMAGE_EXTENSIONS` 列表中

## 下一步优化

1. **添加缩略图生成**：提高列表加载速度
2. **添加图片压缩**：减少存储空间
3. **添加进度显示**：批量导入时显示进度
4. **添加重试机制**：复制失败时自动重试
5. **添加文件校验**：确保复制的文件完整性

## 需要帮助？

如果问题仍然存在，请提供：
1. 浏览器控制台的完整错误信息
2. 应用数据目录的文件列表
3. 一个示例图片的完整路径
4. Tauri 后端的日志输出
