# 自动更新与发布指南 (Tauri Updater)

sanOmni 接入了 Tauri 官方的 Updater 插件 (`@tauri-apps/plugin-updater`)，支持应用内无缝下载与自动静默覆盖安装。为了降低维护成本，我们配置了 GitHub Actions 自动化流水线。

## 架构原理

1. **GitHub Actions (`.github/workflows/release.yml`)**
   当您推送一个形如 `v0.1.1` 的 Git 标签（Tag）时，云端的机器会自动拉取代码。
   - 自动安装 Node.js 和 Rust。
   - 自动编译构建 Windows `.msi` 安装包。
   - 自动读取 GitHub Secrets 中的 `TAURI_PRIVATE_KEY` 进行 Ed25519 数字签名。
   - 自动将打包产物（`.msi`、`.msi.zip`、`.sig` 等）推送到 GitHub Releases 页面。
   - 自动生成 `latest.json` 并一并推送到 GitHub Releases。

2. **客户端更新检测 (`UpdateChecker.tsx`, `AboutTab.tsx`)**
   应用内部调用 Updater 插件 API，获取远端的 `latest.json`。
   如果检测到新版本，在界面展示弹窗和下载进度条。
   下载完毕后一键调用 `relaunch()` 重启，触发系统的自动覆盖安装。

## 🚀 日常发布新版流程

作为开发者，发布新版本变成了一项极其简单的工作。您不需要再手动打包、手动签名、手动写 JSON 了。

**第 1步：修改版本号**
在项目根目录修改这两个文件：
1. `package.json` 中的 `version` 字段。
2. `src-tauri/tauri.conf.json` 中的 `version` 字段。

**第 2步：提交并打 Tag 推送**
```bash
# 提交代码修改
git add .
git commit -m "发布新版本 v0.2.0"
git push

# 设定版本标签 (务必以小写 v 开头)
git tag v0.2.0

# 推送标签触发 GitHub Actions
git push origin v0.2.0
```

**第 3步：坐享其成**
- 打开您的 GitHub 仓库的 `Actions` 选项卡。
- 等待 `Release` 工作流（通常需要 5 - 10 分钟）成功跑完，变成绿色的对勾 ✅。
- 此时远端新版本已正式发布完毕，全网的旧版客户端将自动收到更新推送！

## ⚠️ 常见问题排查

1. **GitHub Actions 编译报错退出？**
   请检查您是否在 GitHub 仓库的 Settings -> Secrets and variables -> Actions 中正确配置了名为 `TAURI_PRIVATE_KEY` 的 Repository secret，内容是您本地用 `tauri signer generate` 生成的私钥字符串。

2. **GitHub Actions 提示权限不足无法上传 Release？**
   请检查您是否在 GitHub 仓库的 Settings -> Actions -> General 中，把 `Workflow permissions` 选为了 `Read and write permissions`。

3. **客户端检查更新提示“网络失败”或“找不到配置文件”？**
   如果您的应用刚打开，GitHub Releases 服务器可能在中国大陆地区有网络波动。也可以检查 `tauri.conf.json` 中的 `endpoints` 地址是否正确指向了您的仓库地址。
