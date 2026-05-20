# 自定义存储路径功能

## 功能说明

从现在开始，你可以自定义 inbox 和 archived 的存储位置，不再局限于默认的 AppData 目录。

## 如何设置

### 1. 打开设置
- 点击右上角的设置图标（齿轮）
- 或使用快捷键 `Ctrl + ,`

### 2. 进入"通用设置"标签
在设置面板中，默认就在"通用设置"标签页。

### 3. 配置自定义路径

#### 自定义 Inbox 路径
- **作用：** 导入图片时的临时存储位置
- **默认：** `C:\Users\<用户名>\AppData\Roaming\com.sanmediabox.app\inbox`
- **设置方法：**
  1. 在"自定义 Inbox 路径"输入框中输入路径
  2. 或点击文件夹图标浏览选择
  3. 留空则使用默认位置

#### 自定义归档路径
- **作用：** 图片归档时的保存目录
- **默认：** `C:\Users\<用户名>\AppData\Roaming\com.sanmediabox.app\archived`
- **设置方法：**
  1. 在"自定义归档路径"输入框中输入路径
  2. 或点击文件夹图标浏览选择
  3. 留空则使用默认位置

### 4. 保存设置
- 修改后会自动提示"保存更改"
- 点击"保存更改"按钮应用设置
- 设置会立即生效，无需重启应用

## 使用场景

### 场景1：使用其他磁盘
如果 C 盘空间不足，可以将图片存储到其他磁盘：

```
Inbox 路径: D:\AI-Images\inbox
归档路径: D:\AI-Images\archived
```

### 场景2：使用网络存储
如果有 NAS 或网络共享文件夹：

```
Inbox 路径: \\NAS\Photos\inbox
归档路径: \\NAS\Photos\archived
```

### 场景3：使用云同步文件夹
配合 OneDrive、Google Drive 等云盘：

```
Inbox 路径: C:\Users\<用户名>\OneDrive\AI-Images\inbox
归档路径: C:\Users\<用户名>\OneDrive\AI-Images\archived
```

### 场景4：项目专用目录
为不同项目使用不同的存储位置：

```
项目A:
  Inbox: D:\Projects\ProjectA\images\inbox
  归档: D:\Projects\ProjectA\images\archived

项目B:
  Inbox: D:\Projects\ProjectB\images\inbox
  归档: D:\Projects\ProjectB\images\archived
```

## 注意事项

### ✅ 优点
- 灵活选择存储位置
- 可以使用容量更大的磁盘
- 支持网络存储和云同步
- 便于备份和管理

### ⚠️ 注意
1. **路径必须存在且可写**
   - 应用会自动创建子目录
   - 但父目录必须已存在

2. **网络路径可能较慢**
   - 导入和归档速度取决于网络速度
   - 建议使用本地磁盘或高速网络

3. **权限问题**
   - 确保应用有读写权限
   - 网络路径需要正确的访问权限

4. **路径格式**
   - Windows: `D:\folder\subfolder` 或 `\\server\share`
   - 支持中文路径
   - 避免使用特殊字符

5. **更改路径不会移动现有文件**
   - 只影响新导入和新归档的图片
   - 旧文件仍在原位置
   - 数据库记录保持不变

## 迁移现有数据

如果你想将现有的图片迁移到新位置：

### 方法1：手动复制
1. 关闭应用
2. 复制整个 inbox 或 archived 目录到新位置
3. 在设置中配置新路径
4. 重启应用

### 方法2：使用文件管理器
1. 在文件管理器中移动文件夹
2. 在设置中更新路径
3. 数据库中的 `absolute_path` 字段需要手动更新（高级用户）

### 方法3：重新导入（推荐）
1. 导出数据库备份
2. 配置新路径
3. 重新导入图片
4. 重新打标签和归档

## 恢复默认路径

如果想恢复使用默认路径：

1. 打开设置
2. 清空"自定义 Inbox 路径"和"自定义归档路径"
3. 保存更改
4. 应用会自动使用默认的 AppData 路径

## 路径优先级

```
自定义路径（如果设置） > 默认路径（AppData）
```

## 技术细节

### 配置存储
自定义路径保存在浏览器的 localStorage 中：
```javascript
{
  "customInboxPath": "D:\\AI-Images\\inbox",
  "customArchivedPath": "D:\\AI-Images\\archived"
}
```

### 代码实现
- `DropZone.tsx`: 导入时使用自定义 inbox 路径
- `InboxView.tsx`: 归档时使用自定义 archived 路径
- `SettingsView.tsx`: 路径配置界面

### 路径解析
```typescript
// 使用自定义路径或默认路径
let inboxDir: string;
if (settings.customInboxPath) {
  inboxDir = settings.customInboxPath;
} else {
  const appDir = await appDataDir();
  inboxDir = await join(appDir, "inbox");
}
```

## 常见问题

### Q: 更改路径后旧图片还能看到吗？
**A:** 能。数据库中记录了每张图片的完整路径，只要文件还在原位置就能正常显示。

### Q: 可以使用相对路径吗？
**A:** 不建议。请使用绝对路径以避免混淆。

### Q: 可以使用 USB 移动硬盘吗？
**A:** 可以，但要注意：
- 盘符可能变化（如 E: 变成 F:）
- 拔出硬盘后图片无法访问
- 建议使用固定的内置硬盘

### Q: 多台电脑可以共享同一个路径吗？
**A:** 理论上可以（使用网络共享），但：
- 数据库是本地的，不会同步
- 可能出现文件冲突
- 不建议同时在多台电脑上操作

### Q: 路径中可以包含空格吗？
**A:** 可以，应用会正确处理包含空格的路径。

### Q: 如何查看当前使用的路径？
**A:** 
1. 打开设置查看配置
2. 或在浏览器控制台输入：
   ```javascript
   localStorage.getItem('ai-image-manager-settings')
   ```

## 未来改进

### 计划中的功能
- [ ] 路径验证和错误提示
- [ ] 一键迁移现有数据
- [ ] 多配置文件支持（快速切换不同项目）
- [ ] 路径使用情况统计（已用空间、文件数量）
- [ ] 自动备份到多个位置
- [ ] 云存储直接集成（OneDrive、Google Drive API）

## 反馈

如果你在使用自定义路径功能时遇到问题，请：
1. 检查路径是否正确
2. 确认有读写权限
3. 查看浏览器控制台的错误信息
4. 提交 Issue 并附上详细信息
