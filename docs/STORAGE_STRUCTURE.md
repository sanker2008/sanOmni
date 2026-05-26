# 图片存储结构说明

## 存储位置

### 应用数据目录
在 Windows 系统上，`appDataDir()` 返回的路径是：
```
C:\Users\<用户名>\AppData\Roaming\com.sanmediabox.app\
```

### 完整目录结构
```
{AppDataDir}/
├── data/
│   └── database.sqlite          # 数据库文件
├── inbox/                        # Prompt 图片待整理（复制的副本）
│   ├── 1234567890_image1.png
│   └── ...
├── archived/                     # Prompt 图片归档（按厂商/模型组织）
│   ├── midjourney/
│   │   └── midjourney-v6/
│   │       ├── midjourney-v6-2024-01-15-001.png
│   │       └── ...
│   ├── openai/
│   │   └── gpt-image-2/
│   │       └── ...
│   └── unknown/
│       └── unknown/
│           └── ...
├── ip_inbox/                     # IP 图片待整理
│   ├── {ip_id}/
│   │   ├── 1234567890_sticker.png
│   │   └── ...
│   └── ...
├── ip_archived/                  # IP 资源归档及私有资产目录（按唯一 IP path 路径标识组织）
│   ├── luna/                     # IP 角色 luna 目录 (path = "luna")
│   │   ├── ip_assets/            # 存放该 IP 的专属图片资源（头像、设定图、三视图、衍生创作图片等）
│   │   │   ├── avatar.png
│   │   │   ├── luna_sheet_01.png
│   │   │   └── ...
│   │   └── emojis/               # 存放该 IP 的表情包分组目录
│   │       └── default/          # 某个表情包分组的分组路径目录 (pack_path = "default")
│   │           ├── emoji1.png
│   │           └── ...
│   └── ...
└── ...
```

## 工作流程

### Prompt 图片工作流

#### 1. 导入阶段
```
原始位置: ~/Pictures/my-image.png  (保持不变)
         ↓ 复制
待整理: {AppDataDir}/inbox/1234567890_my-image.png
```

#### 2. 归档阶段
```
待整理: {AppDataDir}/inbox/1234567890_my-image.png
         ↓ 移动 + 重命名
归档: {AppDataDir}/archived/midjourney/midjourney-v6/midjourney-v6-2024-01-15-001.png
```

### IP 图片工作流

#### 1. 导入阶段
```
原始位置: ~/Pictures/sticker.png  (保持不变)
         ↓ 复制
待整理: {AppDataDir}/ip_inbox/{ip_id}/1234567890_sticker.png
```

#### 2. 归档阶段
```
待整理: {AppDataDir}/ip_inbox/{ip_id}/1234567890_sticker.png
         ↓ 移动 + 重命名（按 ip_assets.path 字段）
归档: {AppDataDir}/ip_archived/luna/luna-20240115-001.png
```

归档命名模板默认为 `{ip}-{date}-{index}`，其中 `{ip}` 取 `ip_assets.name`。

### IP 角色私有资源（设定图/表情/创作）

这类图片通过 `ip_assets.rs` 管理，存储在 IP 路径标识对应的目录中，**不经过 inbox/archived 流程**：

```
{AppDataDir}/ip_archived/{ip_path}/
├── ip_assets/            # 存放三视图、头像、创作等普通资产图片
└── emojis/{pack_path}/   # 存放对应表情包分组下的表情包图片
```

## 磁盘空间考虑

### 优点
✅ 原始文件安全，不会被意外修改或删除  
✅ 可以随时删除应用数据目录来清理空间  
✅ 归档后的文件有清晰的组织结构  

### 缺点
❌ 会占用额外的磁盘空间（每张图片有两份：原始 + inbox副本）  
❌ 导入大量图片时需要复制时间  

### 建议
- 定期归档图片，归档后 inbox 中的副本会被移动（不再占用双份空间）
- 归档后可以选择删除原始文件（手动操作）
- 如果磁盘空间紧张，可以考虑修改代码改为"移动"而不是"复制"

## 如何查看实际路径

### 方法1：在代码中打印
在 `DropZone.tsx` 的 `importPaths` 函数中已经有日志输出：
```typescript
console.log("Copying file to:", targetPath);
```

### 方法2：在浏览器开发者工具中查看
1. 运行应用
2. 打开开发者工具（F12）
3. 导入图片时查看 Console 输出

### 方法3：直接访问目录
在文件资源管理器地址栏输入：
```
%APPDATA%\com.sanmediabox.app
```

## 未来优化建议

### 选项1：添加配置选项
让用户选择：
- 复制模式（当前）：安全，但占用双份空间
- 移动模式：节省空间，但原始文件会被移动
- 链接模式：创建符号链接（需要管理员权限）

### 选项2：智能清理
- 归档后自动询问是否删除原始文件
- 提供"清理 inbox"功能，删除已归档图片的 inbox 副本

### 选项3：外部存储
- 允许用户指定 inbox 和 archived 的位置
- 可以选择其他磁盘或网络存储
