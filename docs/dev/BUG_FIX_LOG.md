# SanOmni 修复与调试记录 (Bug Fix & Debug Log)

本文档专门用于记录开发过程中遇到的 Bug 及其修复过程。每次的 debug 记录都会详细说明问题表现、根本原因、排查过程以及最终的解决方案，以便后续追溯。

---

## [2026-06-15] - 云同步拉取不完整、中文乱码、IP 表情路径与平台信息缺失

### 1. 问题表现 (Symptoms)
- 线上同步服务器显示有大量 sanIP 数据，但本机同步后仍看不到服务器上的全部 IP / 图片 / 表情包数据。
- 第一次手动修复导入后，中文 IP 名称出现乱码。
- IP 表情包管理页能看到表情记录和触发词，但图片无法显示；普通资产图片可以显示。
- `D:\sanomnidata\ip_archived` 下出现以 IP UUID 命名的残留目录，例如：
  - `74f09eb4-2b78-43f4-8c7b-7b6a31086d58`
  - `19519760-fe01-44b4-9fb9-968ab098d8ae`
- 表情包右侧“平台信息”为空，用户记忆中曾经存在平台发布信息。

### 2. 根本原因 (Root Cause)
1. **同步游标已经推进，但本地业务表不完整**
   本地真实数据库为 `D:\sanomnidata\data\database.sqlite`。同步配置中的 `last_sync_version` 已经是服务器最新版本 `1410`，但本地 `ip_assets`、`ip_images` 等业务表缺少数据。之后普通拉取从 `since_version=1410` 开始，因此不会再回放历史记录。

2. **PowerShell 手动导入破坏 UTF-8 中文**
   第一次使用 PowerShell 拉取服务器 JSON 时，响应文本被错误解码，导致中文 IP 名称变成 mojibake。后续改用 Node `fetch` 按 UTF-8 重新导入后恢复。

3. **历史同步 JSON 中包含未转义的 Windows 路径**
   服务器 `sync_log.data_json` 中存在类似 `D:\san\...` 的历史路径字符串，对 JSON 来说这不是合法转义序列。客户端直接 `serde_json::from_str` 会失败，导致部分变更没有落库。

4. **拉取阶段先下载文件、后写业务表，路径推导依赖尚未写入的本地数据**
   表情文件下载时需要 `ip_assets.path` 和 `ip_sticker_packs.path`，但当时对应记录还未写入本地 DB。旧逻辑查不到时 fallback 到 `ip_id`，生成 UUID 目录；写库时又保留了服务器旧绝对路径，导致 UI 读取不存在的 `D:\san\sanomni\...` 路径。

5. **强制重推漏掉表情包相关表**
   `sync_force_repush` 只重推 `ip_assets`、`ip_images`、关系表和标签，漏掉：
   - `ip_sticker_packs`
   - `ip_sticker_pack_platforms`
   - `ip_emojis`
   因此即使某台机器本地有平台信息，旧版“强制重推”也不会把平台信息补回服务器。

6. **服务器没有全量快照拉取能力**
   当前普通拉取依赖 `sync_log`。如果服务器业务表和 `sync_log` 已经历史性不一致，普通同步无法保证恢复完整数据。`/api/sync/snapshot` 目前仍是 TODO。

### 3. 排查证据 (Evidence)
- 服务器认证测试显示：
  - `sync_log_entries = 1410`
  - `latest_version = 1410`
- 本地同步游标：
  - `last_sync_version = 1410`
- 修复前本地数据明显少于服务器历史变更回放结果。
- UTF-8 重新导入后，本地 IP 名称恢复为：
  - `糯糯`
  - `生蜀黍`
  - `牙7`
- 表情路径修复前：
  - `ip_emojis.image_path` 96 条全部指向不存在的旧路径 `D:\san\sanomni\...`
- 表情路径修复后：
  - 96 条全部指向存在的 `D:\sanomnidata\ip_archived\...`
- 服务器 `/api/sync/pull?since_version=0` 返回：
  - `ip_sticker_pack_platforms = 0`
  - 说明平台信息没有出现在服务器同步日志中。
- 本机当前库、默认 AppData 库、`D:\sanomnidata\data` 下 SQLite 备份均未找到平台信息记录。

### 4. 已实施修复 (Fixes Applied)
- `src-tauri/src/sync/client.rs`
  - `SyncClient::new` 对 `server_url` 执行 `trim()` 和去除尾部 `/`，避免配置中前后空格导致请求异常。
- `src-tauri/src/commands/sync_commands.rs`
  - 保存同步配置时 trim `server_url`。
  - 保存配置前确保同步表结构存在。
  - 修复 `sync_force_repush`，补入 `ip_sticker_packs`、`ip_sticker_pack_platforms`、`ip_emojis`。
- `src-tauri/src/sync/engine.rs`
  - 增加 legacy JSON 解析兼容逻辑，自动修复历史 Windows 路径中的未转义反斜杠。
  - 所有拉取/推送变更解析改走兼容解析函数。
  - 修复 `watermark_detected`、`watermark_removed` 从字符串读取的问题，改为按整数读取。
  - 拉取应用不完整时返回错误，不推进 `last_sync_version`。
  - 拉取下载文件前，先从本次服务器变更中建立 `ip_id -> path`、`pack_id -> path` 映射，避免生成 UUID 目录。
- 本地数据修复：
  - 使用 Node `fetch` 按 UTF-8 重新导入，修复中文乱码。
  - 批量修正 96 条 `ip_emojis.image_path`。
  - 删除不再被数据库引用的 UUID 残留目录。

### 5. 备份与验证 (Backup & Verification)
- 本地数据库备份：
  - `D:\sanomnidata\data\database_before_utf8_reimport_20260615_135529.sqlite`
  - `D:\sanomnidata\data\database_before_emoji_path_repair_20260615_140235.sqlite`
- 验证命令：
  - `cargo check` 通过。
  - `npm run build` 通过，只有既有 Vite chunk / dynamic import 警告。
- 当前本地状态：
  - `ip_assets = 6`
  - `ip_emojis = 96`
  - `ip_emojis` 缺失文件数为 0。
  - `ip_sticker_pack_platforms = 0`

### 6. 遗留风险与后续 TODO (Risks & Follow-up)
- “强制重推”不是安全合并。它会把本地现有记录作为 `INSERT` 推送到服务器，并用 `INSERT OR REPLACE` 覆盖同 ID 服务器记录。服务器独有数据通常不会被删除，但同 ID 的服务器新数据可能被本地旧数据覆盖。
- 在确认本地是最完整数据源之前，不应随意执行强制重推。
- 安全流程应为：
  1. 备份服务器数据库。
  2. 从服务器业务表做全量快照拉取，而不是依赖 `sync_log`。
  3. 本地校验 IP、图片、表情包、平台信息完整。
  4. 再从完整本地库执行强制重推。
  5. 推送后校验服务器业务表数量和关键记录。
- 需要实现真正的 `/api/sync/snapshot`：
  - 直接返回服务器业务表全量数据。
  - 客户端支持全量对账和路径重写。
  - 强制重推前增加备份/校验提示，避免误覆盖。
- 平台信息恢复结论：
  - 当前服务器同步日志没有平台信息。
  - 当前本机及本地备份也没有平台信息。
  - 如果另一台电脑仍有平台信息，应升级到包含本次 `sync_force_repush` 修复的版本，再由那台“数据最完整”的电脑执行重推。

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
