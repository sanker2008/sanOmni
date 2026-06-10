# SanOmni 修复与调试记录 (Bug Fix & Debug Log)

本文档专门用于记录开发过程中遇到的 Bug 及其修复过程。每次的 debug 记录都会详细说明问题表现、根本原因、排查过程以及最终的解决方案，以便后续追溯。

---

## [2026-06-02] - 跨盘文件转移失败与默认路径写死问题

### 1. 问题表现 (Symptoms)
- 用户在“待整理”中编辑完图片（包含 Prompt 图片和 IP 资产图片），点击【保存并归档】后，界面未更新（图片仍卡在“待整理”列表中）。
- 检查后台日志发现错误：`os error 17`（跨盘符链接错误）。
- 即便用户设置了统一根目录 `D:\sanomni`，系统仍尝试将部分归档图片写入 `C:\Users\Admin\AppData\Roaming\com.sanomni.app` 目录。

### 2. 根本原因 (Root Cause)
1. **系统跨盘重命名限制**：Rust 中的 `std::fs::rename` 在 Windows 平台上无法直接跨越不同的磁盘分区（如从 D 盘移动到 C 盘）执行重命名操作。
2. **前端路径读取错误**：在 `QuickEditModal.tsx` 中，归档路径的获取逻辑出现了失误。当用户没有设置特定库的 `customArchivedPath` 时，代码回退使用了 `appDataDir()`（获取系统默认 AppData 目录），而没有去读取用户在全局设置的 `unifiedRootPath`。这导致本应存放在 D 盘的文件被强制推向 C 盘，引发了上述的跨盘错误。

### 3. 排查与修复过程 (Debug & Fix Process)
- **第一步：排查跨盘报错**。发现 `std::fs::rename` 报错 `os error 17`，随即在后端（Rust）的 `images.rs`、`ip_images.rs` 以及通用的 `fs.rs` 模块中，为文件移动增加了 fallback（降级）机制：
  ```rust
  // 如果重命名失败，则尝试复制后再删除原文件
  if let Err(e) = std::fs::rename(source, &target_path).or_else(|_| {
      std::fs::copy(source, &target_path).and_then(|_| std::fs::remove_file(source))
  }) {
      // 错误处理...
  }
  ```
  这一修复彻底解决了底层系统层面的跨盘移动障碍。
  
- **第二步：排查路径异常分配**。跨盘机制修复后，通过追踪路径发现，为何文件执意要移动到 C 盘。检查 `QuickEditModal.tsx` 代码，发现：
  ```typescript
  // 错误代码: const libraryPath = customPath || await appDataDir();
  // 修复代码:
  const { getAppRoot } = await import("@/lib/pathUtils");
  const libraryPath = customPath || await getAppRoot();
  ```
  修改后，组件终于能正确尊重 `unifiedRootPath` 配置，所有相关图片归档都能准确落在用户设定的根目录下，不再默认流向系统 C 盘。

### 4. 优化补充 (Enhancements)
- 在 `GeneralSettingsTab.tsx` 设置界面中，添加了明确的绿色提示：“系统现已原生支持跨盘（跨分区）无缝转移，可放心修改根目录或跨盘存放资产”，从而消除用户的顾虑。

---
