# 图片显示问题修复说明

## 问题原因

1. **文件未复制到应用目录**：导入图片时，只是记录了原始文件路径，没有将文件复制到应用数据目录
2. **路径访问问题**：Tauri 的 `convertFileSrc` 需要访问实际存在的文件，如果原始文件被移动或删除，图片就无法显示
3. **权限不足**：Tauri 配置中缺少必要的文件系统操作权限

## 修复内容

### 1. DropZone.tsx
- 在导入图片时，将文件复制到 `$APPDATA/inbox` 目录
- 使用复制后的路径存储到数据库
- 添加了错误处理和日志

### 2. default.json (Tauri 权限配置)
- 添加了 `fs:allow-copy-file` 权限
- 添加了 `fs:allow-create` 和 `fs:allow-mkdir` 权限
- 添加了其他必要的文件系统权限

### 3. ImageCard.tsx
- 添加了调试日志，方便排查问题

## 测试步骤

1. 重新启动开发服务器：
   ```bash
   npm run tauri dev
   ```

2. 导入一张测试图片

3. 检查浏览器控制台（F12）的日志：
   - 查看 "Copying file to:" 日志，确认文件被复制
   - 查看 "ImageCard rendering:" 日志，确认路径转换正确

4. 如果图片仍然不显示：
   - 检查控制台是否有错误信息
   - 检查文件是否成功复制到 `%APPDATA%/com.sanmediabox.app/inbox/` 目录
   - 检查 `convertFileSrc` 转换后的 URL 是否正确

## 可能的额外问题

如果修复后图片仍不显示，可能是：

1. **数据库中已有的图片**：旧的图片记录仍然指向原始路径，需要重新导入
2. **路径格式问题**：Windows 路径分隔符（`\` vs `/`）可能需要标准化
3. **Tauri 资源协议**：可能需要检查 `convertFileSrc` 的输出格式

## 下一步

如果问题持续，请：
1. 分享浏览器控制台的完整错误信息
2. 检查 `%APPDATA%/com.sanmediabox.app/` 目录结构
3. 提供一个示例图片的完整路径和转换后的 URL
