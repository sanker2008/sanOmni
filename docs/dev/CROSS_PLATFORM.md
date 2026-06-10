# 跨平台支持说明

## ✅ 支持的平台

这个应用基于 **Tauri 2.0** 构建，完全支持跨平台运行：

### 🖥️ Windows
- ✅ Windows 10/11 (x64)
- ✅ Windows 10/11 (ARM64)
- 📦 打包格式：`.msi`, `.exe`

### 🍎 macOS
- ✅ macOS 10.15+ (Catalina 及更高版本)
- ✅ Intel (x86_64)
- ✅ Apple Silicon (ARM64 / M1/M2/M3)
- 📦 打包格式：`.dmg`, `.app`

### 🐧 Linux
- ✅ Ubuntu 20.04+
- ✅ Debian 11+
- ✅ Fedora 36+
- ✅ Arch Linux
- 📦 打包格式：`.deb`, `.AppImage`

## 🔧 技术栈

### 前端（跨平台）
- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Tailwind CSS** - 样式
- **Vite** - 构建工具
- **Zustand** - 状态管理

### 后端（跨平台）
- **Tauri 2.0** - 跨平台桌面应用框架
- **Rust** - 系统级编程语言
- **SQLite** - 嵌入式数据库（通过 rusqlite）
- **Tokio** - 异步运行时

## 📦 构建配置

### 当前配置
```json
{
  "bundle": {
    "active": true,
    "targets": "all",  // 支持所有平台
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",    // macOS
      "icons/icon.ico"      // Windows
    ]
  }
}
```

### 图标支持
- ✅ `icon.ico` - Windows 图标
- ✅ `icon.icns` - macOS 图标
- ✅ PNG 图标 - Linux 和通用

## 🚀 在 macOS 上运行

### 1. 安装依赖

#### 安装 Rust
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

#### 安装 Node.js
```bash
# 使用 Homebrew
brew install node

# 或使用 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install node
```

#### 安装 Xcode Command Line Tools
```bash
xcode-select --install
```

### 2. 克隆并安装项目
```bash
git clone <repository-url>
cd sanOmni
npm install
```

### 3. 开发模式运行
```bash
npm run tauri:dev
```

### 4. 构建 macOS 应用
```bash
npm run tauri:build
```

构建产物位置：
- `src-tauri/target/release/bundle/dmg/` - DMG 安装包
- `src-tauri/target/release/bundle/macos/` - .app 应用包

## 🐧 在 Linux 上运行

### 1. 安装系统依赖

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

#### Fedora
```bash
sudo dnf install \
  webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel
```

#### Arch Linux
```bash
sudo pacman -S \
  webkit2gtk-4.1 \
  base-devel \
  curl \
  wget \
  file \
  openssl \
  appmenu-gtk-module \
  gtk3 \
  libappindicator-gtk3 \
  librsvg
```

### 2. 安装 Rust 和 Node.js
```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node.js (使用 nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install node
```

### 3. 运行和构建
```bash
npm install
npm run tauri:dev    # 开发模式
npm run tauri:build  # 构建
```

构建产物位置：
- `src-tauri/target/release/bundle/deb/` - DEB 包
- `src-tauri/target/release/bundle/appimage/` - AppImage

## 🔍 平台特定差异

### 文件路径
代码已经处理了跨平台路径差异：

#### TypeScript/React 代码
```typescript
// ✅ 正确：使用 Tauri 的路径 API
const { appDataDir, join } = await import("@tauri-apps/api/path");
const appDir = await appDataDir();
const inboxDir = await join(appDir, "inbox");

// ✅ 正确：使用正则表达式处理路径分隔符
const fileName = path.split(/[/\\]/).pop();

// ✅ 正确：跨平台路径分隔符检测
const lastSeparator = Math.max(
  path.lastIndexOf('/'),
  path.lastIndexOf('\\')
);

// ❌ 错误：硬编码路径
const path = "C:\\Users\\...\\inbox";  // 仅 Windows
const path = "/Users/.../inbox";       // 仅 macOS/Linux
```

#### Rust 代码
```rust
// ✅ 正确：使用 std::path::Path
use std::path::Path;

let target_dir = Path::new(&library_path)
    .join("archived")
    .join(&vendor_path)
    .join(&model_path);

// ✅ 正确：转换为字符串
let path_str = target_dir.to_string_lossy().to_string();

// ❌ 错误：硬编码路径分隔符
let path = format!("archived/{}/{}", vendor, model);  // 可能有问题
```

### 应用数据目录
不同平台的默认位置：
- **Windows**: `%APPDATA%\com.sanomni.app\`
  - 示例：`C:\Users\YourName\AppData\Roaming\com.sanomni.app\`
- **macOS**: `~/Library/Application Support/com.sanomni.app/`
  - 示例：`/Users/YourName/Library/Application Support/com.sanomni.app/`
- **Linux**: `~/.local/share/com.sanomni.app/`
  - 示例：`/home/yourname/.local/share/com.sanomni.app/`

### 最近修复的跨平台问题

#### 1. 路径分隔符硬编码 ✅ 已修复
- **问题**：`ImageCard.tsx` 中使用 `lastIndexOf('\\')`
- **修复**：使用 `Math.max(lastIndexOf('/'), lastIndexOf('\\'))`

#### 2. Rust 路径拼接 ✅ 已修复
- **问题**：使用 `format!("archived/{}/{}", ...)` 硬编码正斜杠
- **修复**：使用 `Path::new().join().join()` 方法

#### 3. 相对路径构建 ✅ 已修复
- **问题**：`inbox/{}/{}` 格式字符串
- **修复**：使用 `Path::new("inbox").join().join()` 方法

## 🎨 UI 适配

### 窗口控制
- **Windows/Linux**: 标准窗口控制按钮
- **macOS**: 遵循 macOS 设计规范（红黄绿按钮）

### 快捷键
代码使用跨平台快捷键：
```typescript
// Tauri 会自动处理 Cmd (macOS) 和 Ctrl (Windows/Linux)
```

## 📝 注意事项

### macOS 特定
1. **代码签名**：发布到 App Store 需要 Apple Developer 账号
2. **公证**：macOS 10.15+ 需要公证才能分发
3. **权限**：首次运行可能需要在"系统偏好设置 > 安全性与隐私"中允许

### Linux 特定
1. **依赖**：不同发行版可能需要不同的依赖包
2. **AppImage**：最通用的分发格式，无需安装
3. **权限**：AppImage 需要执行权限：`chmod +x *.AppImage`

### Windows 特定
1. **WebView2**：Windows 10/11 已预装，旧版本需要安装
2. **防火墙**：首次运行可能需要允许网络访问
3. **安装器**：MSI 安装器需要管理员权限

## 🧪 测试建议

### 跨平台测试清单
- [ ] 文件导入功能（拖放、选择文件、选择文件夹）
- [ ] 图片显示和缩略图
- [ ] 数据库读写
- [ ] 文件系统操作（复制、移动、删除）
- [ ] 快捷键
- [ ] 窗口大小和位置保存
- [ ] 应用更新

### 虚拟机测试
如果没有物理设备，可以使用：
- **macOS**: 在 Mac 上使用 Parallels/VMware 测试 Windows/Linux
- **Windows**: 使用 WSL2 测试 Linux，使用 Hackintosh 或云 Mac 测试 macOS
- **Linux**: 使用 VirtualBox/VMware 测试其他系统

## 📚 相关资源

- [Tauri 官方文档](https://tauri.app/)
- [Tauri 跨平台指南](https://tauri.app/v1/guides/building/cross-platform)
- [Rust 安装指南](https://www.rust-lang.org/tools/install)
- [Node.js 下载](https://nodejs.org/)

## 🤝 贡献

如果你在特定平台上遇到问题，欢迎：
1. 提交 Issue 描述问题
2. 提供平台信息（操作系统、版本、架构）
3. 提供错误日志和截图
4. 提交 PR 修复问题

## 📄 许可证

本项目使用的技术栈都是开源的：
- Tauri: MIT/Apache-2.0
- React: MIT
- Rust: MIT/Apache-2.0
