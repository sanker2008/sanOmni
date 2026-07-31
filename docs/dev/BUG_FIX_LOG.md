# SanOmni 修复与调试记录 (Bug Fix & Debug Log)

本文档专门用于记录开发过程中遇到的 Bug 及其修复过程。每次的 debug 记录都会详细说明问题表现、根本原因、排查过程以及最终的解决方案，以便后续追溯。

---

## [2026-07-31] - sanPrompt Supabase URL 显示旧缓存，但数据库配置已更新

### 1. 问题表现 (Symptoms)
- 用户在“设置 → sanPrompt”更新 Supabase URL 并重启客户端后，设置输入框仍显示旧 URL。
- 默认 AppData 数据库和统一根目录数据库中的 `sanPromptSupabaseUrl` 已经一致且为最新值，界面与数据库状态不一致。
- 因实际上传配置由 Tauri 原生层读取数据库，可能出现“界面看起来是旧 URL，但同步仍按当前数据库配置执行”的误导性现象。

### 2. 根本原因 (Root Cause)
1. `useUIStore` 初始化时只从 WebView `localStorage` 的 `ai-image-manager-settings` 读取设置。
2. 应用启动时虽然调用了 `settingsApi.getAll()`，但结果仅用于初始化数据库，没有回填到 Zustand 状态或 `localStorage` 缓存。
3. `SettingsView` 打开时直接使用 Zustand 中的缓存值，没有重新读取 SQLite。因此重启不会淘汰已持久化的旧 WebView 缓存。

### 3. 已实施修复 (Fixes Applied)
- `src/App.tsx`：启动时读取数据库中的 `sanPromptSupabaseUrl`；若与 WebView 缓存不同，则更新 Zustand 和 `localStorage`。
- `src/components/settings/SettingsView.tsx`：每次打开设置时重新读取数据库 URL 与系统凭据库中的发布密钥，避免启动阶段尚未完成时短暂显示旧值。
- 保持 Storage Key 不进入 `localStorage`；数据库 URL 与敏感凭据继续分开管理。

### 4. 验证与发布注意事项 (Verification & Rollout)
- 已只读核对默认数据库 `%APPDATA%\com.sanomni.app\data\database.sqlite` 与统一根目录数据库 `D:\sanomnidata\data\database.sqlite`：`sanPromptSupabaseUrl` 一致。
- `pnpm exec tsc --noEmit` 通过。
- 本轮 WSL 的完整 Vite 构建受缺少 `@rollup/rollup-linux-x64-gnu` 可选原生依赖阻断；需在依赖完整的构建环境产出新客户端后再做安装包验收。
- 在升级到包含本修复的客户端之前，不要在仍显示旧 URL 的界面点击“保存更改”，以免旧缓存覆盖数据库值。

---

## [2026-07-29] - sanIP 双向同步游标跳跃、父记录更新丢子数据与子表漏同步

### 1. 问题表现 (Symptoms)
- 同一轮同步先 Push 再 Pull 后，其他设备已经写入服务端的较早变更可能永远不再下发到本机。
- 更新已有 IP 或图片后，服务端关联的图片关系、角色设定图、创作图片等子记录可能消失。
- `ip_character_sheets`、`ip_creations`、`ip_relations` 的新增、修改或删除不能稳定到达其他设备，强制全量重推也无法完整补齐。
- 同一张创作图片在 Windows 和 Linux 设备上使用不同绝对路径时，可能生成重复服务端记录，或出现更新、删除匹配不到原记录的情况。
- 文件读取、下载或哈希校验失败时，旧流程可能继续完成数据库同步，造成界面有记录但本地文件缺失且没有可靠重试状态。
- “测试连接”和真实同步对 URL、API Key、端口及系统密钥链错误的处理不一致，容易出现测试通过但同步失败，或错误原因不明确。

### 2. 根本原因 (Root Cause)
1. **Push 版本与 Pull 游标混用**：Push 返回的是服务端接收本机写入后的最新版本，不代表本机已经消费此前所有远端版本。直接用它开始 Pull 会跳过其他设备较早写入的记录。
2. **父表使用 `INSERT OR REPLACE`**：SQLite 的 `REPLACE` 实际是删除旧行再插入新行。开启外键级联后，更新 `ip_assets` 或 `ip_images` 会先删除父行，并连带删除子记录。
3. **表覆盖不完整**：角色设定图、创作图片和 IP 关系缺少完整的触发器、拉取分支、文件处理及全量重推 SQL。
4. **记录身份依赖绝对路径**：创作图片将设备本地绝对路径纳入 `record_id`，同一逻辑文件在不同系统上会得到不同身份。
5. **错误处理过于宽松**：旧 Pull 允许部分数据库变更提交，部分文件失败也可能只记录日志；一旦游标推进，失败内容无法通过普通增量 Pull 再次获取。
6. **连接逻辑分叉**：连接测试与真实同步没有完全复用同一套客户端构造和配置校验路径。

### 3. 已实施修复 (Fixes Applied)

#### sanOmni 桌面端
- 将 `last_sync_version` 明确定义为“最后一次成功提交的 Pull 版本”。Push 成功只清理已推送的本地日志，不推进 Pull 游标。
- Pull 要求收到的数据库变更全部被识别并成功应用；否则事务整体回滚，游标保持不变。历史版本中“允许部分 Pull 提交”的行为不再沿用。
- 为 `ip_character_sheets`、`ip_creations`、`ip_relations` 补齐变更触发器、拉取应用、文件路径重写、失败重试和强制全量重推。
- 创作图片对外使用 `ip_id|文件名` 作为稳定身份；路径解析同时接受 `/` 与 `\`。更新复合主键时以 `DELETE + INSERT` 表达旧身份和新身份。
- 上传前读取失败、远端文件检查失败、上传失败或上传哈希不一致会直接使 Push 失败；Pull 侧下载、读回或哈希校验失败会登记到 `sync_pending_downloads`，后续同步继续重试。
- 连接测试和实际同步统一使用 `SyncClient`；保存配置前验证 URL 与 API Key，明确暴露密钥链错误。默认服务端端口为 `3080`。

#### sanomni-sync-server
- 父表更新改用 `INSERT ... ON CONFLICT DO UPDATE`，保留原父行身份，避免触发 `ON DELETE CASCADE`。
- Push 的业务表写入、`sync_log` 写入和结果校验继续位于同一事务；任一环节失败时整批拒绝。
- 补齐三个子表的服务端白名单、写入、删除、验证及快照支持。
- 服务端以 `ip_id|文件名` 识别创作图片，并在写入或删除时兼容清理旧版绝对路径 ID。
- 新增 `bind_address` 配置。旧配置完全省略该字段时仍默认 `0.0.0.0`；新示例显式使用 `127.0.0.1`，适合由 Nginx 反向代理提供 HTTPS。

### 4. 兼容性与部署顺序 (Compatibility & Rollout)
1. 先备份服务端数据库与各设备本地 SQLite。
2. 先升级 `sanomni-sync-server`，确保新表和稳定创作图片身份可被接受。
3. 再升级所有仍会参与同步的 sanOmni 客户端；旧客户端仍可能产生旧路径身份或错误推进游标。
4. 正常执行一次双向同步并核对关键 IP、角色设定图、创作图片和 IP 关系。
5. 既有漏同步不会仅靠升级自动回放。确需强制全量重推时，必须先确认该设备拥有最完整数据；该操作不是安全合并或服务端覆盖恢复。

### 5. 验证 (Verification)
- 服务端 `cargo test`：13 项通过，包含父记录更新保留子记录、跨设备创作图片身份及监听地址兼容回归测试。
- 客户端游标、跨平台创作图片身份、触发器覆盖和连接测试定向测试通过。
- 同步引擎独立类型检查通过；`pnpm exec tsc --noEmit` 通过。
- 在真实数据库副本中安装并核对 32 个同步触发器；创作图片更新记录为 `INSERT, DELETE, INSERT, DELETE`，可同时表达旧身份删除与新身份插入。

### 6. 剩余限制 (Known Limits)
- 本轮未在 WSL 内完成完整 Tauri Linux/Windows 交叉编译：Linux 检查受缺少 `glib-2.0` 开发库限制，Windows 交叉目标受缺少 MinGW GCC 限制。已通过与同步引擎直接相关的测试和 TypeScript 检查，但仍需在具备完整原生工具链的环境做最终安装包验证。
- 文件传输采用可重试的最终一致性：远端数据库变更必须整批提交，但暂时下载失败的文件会保留待处理记录，不能把“数据库同步成功”解释为“所有文件已经落盘”。

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
- `pnpm run build` 通过，仅有既有 Vite chunk 警告。

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
  - `pnpm run build` 通过，只有既有 Vite chunk / dynamic import 警告。
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
