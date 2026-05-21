# 文件夹监控功能说明

## 功能概述

**文件夹监控**功能可以自动监视指定的文件夹，当有新图片文件添加到这些文件夹时，自动将其导入到待整理。

## 使用场景

### 场景1：AI 生成工具输出目录
如果你使用 Stable Diffusion、Midjourney 等工具生成图片，它们通常会保存到固定的输出目录。设置监控后，新生成的图片会自动导入。

```
监控目录: D:\stable-diffusion-webui\outputs\txt2img-images
效果: 每次生成新图片后自动导入到待整理
```

### 场景2：截图工具保存目录
监控截图工具的保存目录，自动收集截图。

```
监控目录: C:\Users\<用户名>\Pictures\Screenshots
效果: 每次截图后自动导入
```

### 场景3：下载文件夹
监控浏览器下载目录，自动导入下载的图片。

```
监控目录: C:\Users\<用户名>\Downloads
效果: 下载图片后自动导入
```

### 场景4：云同步文件夹
监控云盘同步文件夹，团队成员上传的图片会自动导入。

```
监控目录: C:\Users\<用户名>\OneDrive\Team-Images
效果: 云端有新图片时自动同步并导入
```

### 场景5：多个项目目录
同时监控多个项目的图片目录。

```
监控目录1: D:\Projects\ProjectA\assets
监控目录2: D:\Projects\ProjectB\assets
监控目录3: D:\Projects\ProjectC\assets
效果: 所有项目的新图片都会自动导入
```

## 使用方法

### 1. 打开设置
- 点击右上角的设置图标（齿轮）
- 或使用快捷键 `Ctrl + ,`

### 2. 进入"监控设置"标签
在设置面板中，点击"监控设置"标签。

### 3. 查看活跃的监控器
如果有监控器正在运行，会在顶部显示绿色的"活跃的监控器"卡片，显示：
- 监控的文件夹路径
- 运行状态（绿色圆点表示运行中）

### 4. 添加监控文件夹

#### 方法1：手动输入路径
1. 在输入框中输入文件夹路径
2. 按 Enter 或点击"+"按钮添加

#### 方法2：浏览选择
1. 点击文件夹图标
2. 在弹出的对话框中选择要监控的文件夹
3. 自动添加到列表

### 4. 配置监控选项

#### 文件扩展名过滤
- **作用：** 只监控指定类型的文件
- **默认：** `png,jpg,jpeg,webp,gif`
- **自定义：** 可以添加或删除扩展名，用逗号分隔

#### 防抖时间
- **作用：** 文件变更后等待多久再触发处理
- **默认：** 1000ms (1秒)
- **范围：** 200ms - 5000ms
- **说明：** 避免文件正在写入时就触发导入

### 5. 保存设置并重启应用
1. 点击"保存更改"按钮应用设置
2. 关闭并重新打开应用
3. 监控器会自动启动

### 6. 测试监控功能
1. 在监控的文件夹中添加一张图片
2. 等待 1-2 秒（防抖时间）
3. 检查待整理，图片应该已自动导入
4. 如果启用了通知，会收到桌面通知

## 工作原理

### 监控流程
```
1. 应用启动时加载监控配置
   ↓
2. 为每个配置的文件夹创建监控器
   ↓
3. 监听文件系统事件（创建、修改、重命名）
   ↓
4. 检测到新文件
   ↓
5. 检查文件扩展名是否匹配
   ↓
6. 等待防抖时间（确保文件写入完成）
   ↓
7. 自动导入到待整理
   ↓
8. 继续监控...
```

### 监控的事件类型
- ✅ **文件创建** - 新文件添加到文件夹
- ✅ **文件重命名** - 文件重命名为图片扩展名
- ❌ **文件修改** - 不触发（避免重复导入）
- ❌ **文件删除** - 不触发

### 递归监控
- 默认启用递归监控
- 会监控子文件夹中的文件变化
- 例如：监控 `D:\Images\` 也会监控 `D:\Images\subfolder\`

## 当前状态

### ✅ 功能状态：已完成

监控功能已经完全实现并可以使用！

#### 已实现 ✅
- ✅ 文件夹监控器的创建和启动
- ✅ 文件系统事件的监听
- ✅ 配置界面（添加/删除监控文件夹）
- ✅ 扩展名过滤配置
- ✅ 防抖时间配置
- ✅ 检测到新文件时自动调用导入 API
- ✅ 监控器的启动/停止管理
- ✅ 监控状态的持久化
- ✅ 活跃监控器列表的显示
- ✅ 自动分类和导入
- ✅ 桌面通知提示

## 完整实现说明

### 后端实现（Rust）

#### 文件监控器
```rust
// 使用 notify crate 监听文件系统事件
let mut watcher = Watcher::new(
    move |res: Result<Event, notify::Error>| {
        match res {
            Ok(event) => {
                // 只处理创建和重命名事件
                match event.kind {
                    EventKind::Create(_) | EventKind::Modify(_) => {
                        for path in event.paths {
                            if is_image_file(&path, &extensions) {
                                // 发送事件到前端
                                app.emit("file-watch-event", event_data);
                            }
                        }
                    }
                    _ => {}
                }
            }
            Err(e) => eprintln!("Watch error: {:?}", e),
        }
    },
    Config::default()
).unwrap();
```

#### 状态管理
```rust
// 使用 Tauri 的状态管理存储活跃的监控器
pub struct WatcherState {
    pub watchers: Arc<Mutex<HashMap<String, WatcherInfo>>>,
}
```

### 前端实现（TypeScript）

#### 自动导入 Hook
```typescript
// useFolderWatcher.ts
export function useFolderWatcher() {
  // 启动监控器
  useEffect(() => {
    const startWatchers = async () => {
      for (const folder of settings.watchFolders) {
        await watcherApi.start({
          path: folder,
          recursive: true,
          file_extensions: extensions,
          debounce_ms: debounceMs,
        });
      }
    };
    startWatchers();
  }, [settings.watchFolders]);

  // 监听文件事件并自动导入
  useEffect(() => {
    const unlisten = await listen("file-watch-event", async (event) => {
      // 复制文件到 inbox
      await copyFile(path, targetPath);
      
      // 导入到数据库
      const result = await imageApi.import({...});
      
      // 添加到 store
      addImage(result);
      
      // 显示通知
      new Notification("新图片已导入", {...});
    });
  }, []);
}
```

#### 在应用中使用
```typescript
// App.tsx
function App() {
  useFolderWatcher(); // 启动监控功能
  // ...
}
```

## 注意事项

### ⚠️ 性能考虑
- 监控大量文件夹会消耗系统资源
- 建议只监控必要的文件夹
- 避免监控整个磁盘或系统目录

### ⚠️ 文件冲突
- 如果同一个文件被多次触发，防抖机制会避免重复导入
- 但如果文件名相同，可能会覆盖

### ⚠️ 权限问题
- 确保应用有读取监控文件夹的权限
- 网络文件夹可能需要额外配置

### ⚠️ 自动导入的图片
- 会自动尝试分类（根据文件名）
- 如果无法分类，会标记为 "Unknown"
- 需要手动打标签和归档

## 替代方案

~~在监控功能完全实现之前~~，如果遇到问题，你还可以：

### 方案1：手动导入
- 定期打开应用
- 使用"选择文件夹"功能批量导入

### 方案2：使用脚本
创建一个脚本定期复制文件到 inbox 目录：

```batch
@echo off
REM 复制新图片到 inbox
xcopy "D:\AI-Output\*.png" "%APPDATA%\com.sanmediabox.app\inbox\" /D /Y
xcopy "D:\AI-Output\*.jpg" "%APPDATA%\com.sanmediabox.app\inbox\" /D /Y
```

### 方案3：使用第三方工具
- 使用 FreeFileSync 等工具同步文件夹
- 使用 Windows 任务计划程序定时运行复制脚本

## 功能特性

### 已实现的功能
- ✅ 递归监控（包括子文件夹）
- ✅ 文件扩展名过滤
- ✅ 防抖机制（避免重复触发）
- ✅ 自动分类（根据文件名）
- ✅ 自动导入到待整理
- ✅ 桌面通知
- ✅ 活跃监控器状态显示
- ✅ 支持自定义 inbox 路径
- ✅ 多文件夹同时监控

### 工作流程
1. 应用启动时读取配置的监控文件夹
2. 为每个文件夹创建监控器
3. 监听文件创建和重命名事件
4. 检查文件扩展名是否匹配
5. 等待防抖时间（确保文件写入完成）
6. 复制文件到 inbox 目录
7. 自动分类（根据文件名推断厂商/模型）
8. 导入到数据库
9. 更新界面显示
10. 显示桌面通知

## 常见问题

### Q: 监控功能现在能用吗？
**A:** 是的！功能已完全实现，配置后重启应用即可使用。

### Q: 会监控子文件夹吗？
**A:** 是的，默认启用递归监控。

### Q: 会重复导入同一个文件吗？
**A:** 不会，防抖机制和文件检查会避免重复导入。

### Q: 可以监控网络文件夹吗？
**A:** 理论上可以，但可能会有性能问题。

### Q: 监控会影响性能吗？
**A:** 监控本身消耗很少资源，但监控大量文件夹或频繁变化的文件夹会有影响。

### Q: 如何停止监控？
**A:** 在设置中删除监控文件夹，或关闭应用。

### Q: 如何知道监控器是否在运行？
**A:** 在设置的"监控设置"标签中，活跃的监控器会显示绿色圆点和"运行中"标签。

### Q: 为什么添加图片后没有自动导入？
**A:** 可能的原因：
1. 监控器未启动（需要重启应用）
2. 文件扩展名不在过滤列表中
3. 防抖时间未到（默认 1 秒）
4. 文件正在被其他程序占用

### Q: 可以看到导入通知吗？
**A:** 可以，如果浏览器允许通知权限，会显示桌面通知。首次使用时会请求权限。

## 贡献

~~如果你想帮助完善这个功能，欢迎：~~
功能已完成！如果你想改进或添加新特性，欢迎：
1. Fork 项目
2. 实现新功能或改进
3. 添加测试
4. 提交 Pull Request

主要文件：
- `src-tauri/src/commands/watcher.rs` - 后端监控逻辑
- `src/hooks/useFolderWatcher.ts` - 前端自动导入逻辑
- `src/App.tsx` - 启动监控器
- `src/components/SettingsView.tsx` - 配置界面
