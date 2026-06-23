# SanOmni 修复与调试记录 (Bug Fix & Debug Log)

本文档专门用于记录开发过程中遇到的 Bug 及其修复过程。每次的 debug 记录都会详细说明问题表现、根本原因、排查过程以及最终的解决方案，以便后续追溯。

---

## [2026-06-23] - Gemini 水印大小与位置变化导致去除失败

### 1. 问题
- 两张样例图尺寸同为 `2752x1536`，但 Gemini 水印位置不同。
- 图一水印右/下边距约 `196px`，旧逻辑只搜索右下角 `128px` 范围，导致检测不到或 fallback 到错误位置。
- 图二水印更靠近传统右下角区域，因此旧逻辑可以成功。
- `rqm0` 样例的水印叠在脸角和手臂上，NCC 自由搜索被右侧白底假峰值带偏，改错了 `(967,844)` 而不是新 profile 的 `(880,880)`。
- `c80u` 黑底样例使用新版 `96px / margin 192` alpha，旧 `bg_96` 反算后会留下亮边残影。
- 多个前端入口只判断 `result.success`，低置信 fallback 也可能被当作成功并替换原图。

### 2. 修复
- `src-tauri/src/commands/gemini_watermark_removal.rs`
  - 水印尺寸从 `[96, 48]` 扩展为 `[96, 72, 48, 36]`。
  - 支持从现有 alpha map 缩放生成 `72px` 和 `36px` 模板。
  - 新增 `bg_96_20260520.png` alpha 模板，兼容 Gemini 新版透明度。
  - 新增已知 Gemini 下载 profile 优先检测：大图 `96px / margin 192 / alpha 20260520`，以及 `1024x1024` 图片上的 `48px / margin 96 / alpha legacy_scale_0.60`。
  - `48px / margin 96` profile 使用独立较低 evidence 阈值，避免脸角/手臂等强纹理区域分数偏低时退回自由搜索并命中 `(967,844)` 白底假峰值。
  - 已知新版 profile 优先于自由搜索，避免人物、文字、钟表等内容产生的 NCC 假峰值覆盖真实水印位置。
  - 搜索区域从固定 `128px` 扩展为按图片尺寸计算的右下角区域。
  - 使用粗搜 + 局部精搜，提高兼容性并控制耗时。
  - `method` 输出命中的 `size / x / y / conf / profile / alpha`，便于排查。
- `src/services/tauri.ts`
  - 新增 `isGeminiWatermarkRemovalSuccessful(result)`，统一要求 `success && watermark_detected`。
- 前端入口已统一接入该 helper：
  - `src/components/ImageCard.tsx`
  - `src/components/IpArchivedView.tsx`
  - `src/components/lab/image-compressor/ImageCompressor.tsx`
  - `src/components/lab/image-slicer/ImageSlicer.tsx`
- 新增文档：`docs/watermark/GEMINI_WATERMARK_REMOVAL.md`。
- sanLabs 新增 `Gemini 水印高级修复`：
  - 支持自动处理、手动框选水印区域、profile 切换和 alpha 强度微调。
  - 用于一键流程遇到 `profile=false`、命中错误位置、白色残留、变深残影等情况时兜底。
  - 手动处理仍复用后端 `advanced_remove_gemini_watermark`，避免维护第二套算法。

### 3. 验证
- `cargo test gemini_watermark_removal` 通过。
- `cargo test` 通过，23 个测试全绿。
- `npm run build` 通过，仅有既有 Vite chunk 警告。

### 4. 约定
- 后续新增 Gemini 去水印入口时，不能只判断 `result.success`。
- 替换原图或读回去水印结果前，必须使用 `isGeminiWatermarkRemovalSuccessful(result)`。

---

## [2026-06-15] - 云同步数据安全加固与快照对账通道

### 1. 问题
- 同步服务端旧逻辑可能在业务表写入失败时仍写入 `sync_log` 并返回成功，导致客户端推进游标后无法通过普通增量拉取恢复。
- 客户端旧逻辑在文件检查、上传或下载失败时只打印错误，仍可能继续推送/落库并推进同步流程。
- 服务端 `/api/sync/snapshot` 之前仍是 TODO，缺少从业务表全量对账的基础接口。

### 2. 修复
- `sanomni-sync-server/src/sync.rs`
  - `POST /api/sync/push` 现在会拒绝非法 JSON、未知表、同步日志写入失败、以及业务表结果校验失败的变更。
  - 业务表 SQL 写入失败会直接拒绝本次 push；不会只记录日志后继续推进版本。
  - 失败会返回结构化错误和非 2xx 状态码，事务回滚，不再把失败变更计入 `applied_count`。
  - `GET /api/sync/snapshot` 现在返回服务端核心同步表和对象 hash 列表，用于全量对账/恢复工具；任一表读取失败会返回错误，不会伪装为空表。
- `src-tauri/src/sync/engine.rs`
  - 文件检查失败、上传失败、上传 hash 不一致、下载失败、下载后 hash 不一致都会中断同步。
  - 本地已有文件会先计算 hash；hash 不一致时重新下载，下载后再次校验。
- `src-tauri/src/sync/client.rs`
  - HTTP 非成功响应会携带服务端 body，便于定位具体失败原因。
  - 新增 snapshot 拉取客户端方法。
- `src-tauri/src/commands/sync_commands.rs`
  - 新增 `sync_get_snapshot` Tauri 命令，用于诊断/对账入口。
  - 新增 `sync_reconcile_snapshot` 非破坏性对账命令，按表比较服务端快照 key 与本地 SQLite key。
  - 快照对账遇到缺少关键字段或表 payload 非数组时直接报错，避免静默漏报。

### 3. 验证
- `sanomni-sync-server`: `cargo check` 通过。
- `sanomni-sync-server`: `cargo test` 通过。
- `sanOmni/src-tauri`: `cargo check` 通过。
- `sanOmni/src-tauri`: `cargo test` 通过。

### 4. 剩余限制
- 当前新增的是 snapshot 获取和对账基础通道，尚未实现“一键自动覆盖式快照恢复”。后续实现恢复前仍必须先备份服务端和本地 SQLite。
- 强制重推仍不是安全合并；只应在确认本机是最完整数据源后使用。

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
- `/api/sync/snapshot` 基础接口已在本次安全加固中补齐，可直接返回服务端核心业务表和对象 hash；后续仍需要把“自动快照恢复/覆盖”做成带备份确认的显式流程。
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
