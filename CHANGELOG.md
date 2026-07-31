# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- sanPrompt: 在模板详情弹窗中新增“上一个/下一个”快捷切换按钮，支持在当前搜索与筛选结果内无缝浏览相邻模板。
- sanPrompt: 新增 Supabase Storage 直传功能。发布模板时支持自动将本地图片上传至 Supabase，并替换为云端 public URL。
- 图片自动压缩：上传 Supabase 前通过浏览器 Canvas 自动压缩图片（转为 WebP 格式，最大 1920px 宽），单张图片体积减少 90%+，极大节省云端存储空间。

### Changed
- sanPrompt 发布流程：图片上传成功后，系统会自动将 public URL 存回本地 SQLite 数据库（`remote_url` 字段），更新模板时实现“秒传”，避免图片重复上传造成的流量与时间浪费。
- sanPrompt (Web): 优化 Next.js `Image` 组件，对 Supabase 和 placehold.co 域名的图片自动应用 Next.js 图片优化逻辑，不再全局禁用优化。

### Fixed
- 修复客户端游标已等于服务端最新版本时，历史漏拉记录（例如另一台设备创建的 IP）永远无法通过普通增量同步补回的问题。增量 Pull 返回空结果后会对照服务端快照；若发现远端记录缺失，则从保留的完整历史中筛选这些记录的最新有效变更，通过现有事务化 Pull 路径安全恢复，并在同步结果中明确显示补回数量。
- 修复删除 sanIP 图片后同步会尝试读取队列中已失效的旧文件路径、导致同步中断的问题。推送前会将同一记录的未同步历史折叠为最终状态，保留删除操作并跳过已被删除图片的旧新增/更新记录。

## [1.4.3] - 2026-07-29

### Added
- sanIP 云同步现已覆盖角色设定图、创作图片和 IP 关系，包括本地变更触发器、拉取应用、关联文件下载以及强制全量重推。
- 新增[同步正确性约束](docs/architecture/SYNC_CORRECTNESS.md)，记录游标、事务、记录身份和文件失败处理的不变量。

### Changed
- Pull 游标只在整批远端数据库变更成功提交后推进；Push 返回的服务端版本不再被当作已消费的 Pull 游标。
- 创作图片使用 `ip_id|文件名` 作为跨设备记录身份，并兼容 Windows 与 Linux 路径分隔符。
- 连接测试与实际同步统一复用 URL、API Key 和客户端校验行为；公网地址必须使用 HTTPS，HTTP 仅允许回环或私网地址。

### Fixed
- 修复同一轮先 Push 后 Pull 时可能跳过其他设备较早变更的问题。
- 修复部分 Pull 仍提交并推进游标、导致失败记录之后无法通过增量同步恢复的问题；任一数据库变更无法应用时整批回滚。
- 修复角色设定图、创作图片和 IP 关系未被完整记录或拉取的问题。
- 修复创作图片因设备绝对路径不同而重复、无法更新或无法删除的问题。
- 修复待上传文件读取失败仍继续同步，以及下载、读取或哈希校验失败未可靠进入重试队列的问题。
- 修复空 URL、空 API Key、错误端口及系统密钥链异常在连接测试与真实同步之间表现不一致的问题。

### Notes
- 强制全量重推不是安全合并或覆盖恢复。执行前必须备份，并确认本机是数据最完整的来源。

## [1.4.1] - 2026-07-22
### Changed
- sanLabs: Gemini 水印高级修复顶栏中的“打开输出目录”按钮调整为始终显示，方便随时快速访问导出文件夹。
- sanIP (表情包管理): 表情包分组简介文本添加单行截断 (`line-clamp-1`) 与 Hover Tooltip 完整提示，防止长文本占据过高页面布局。

### Fixed
- sanIP (作品集): 新增标签全量自动去重函数 `groupAndDeduplicateTags`，合并同名重复标签（如“风景”、“人像”），并在标签筛选区域支持展开/收起切换 (默认展示 16 个)，避免多行标签铺满页面。
- Backend: 补充 Rust `get_works` 命令中的 `tag_ids` SQL 筛选实现。

## [1.3.2] - 2026-06-29
### Changed
- sanLabs: removed the duplicated "智能去水印" entry from the lab sidebar; watermark repair remains available through the Gemini watermark lab flow.
- Image Slicer: slice previews now reflect the configured export canvas size and background behavior, including automatic background fill for non-transparent formats.
- PNG to SVG: preview panes now support mouse-wheel zoom, left-button drag panning, hidden scrollbars, and a one-click "恢复原位" reset for both source and SVG previews.

### Fixed
- Image Slicer: repeated exports from the same source image no longer overwrite previous slice files; new files receive numeric suffixes when needed.
- PNG to SVG: generated SVG previews are rendered through an SVG data URL to avoid blank preview results, and results can be cleared without changing the selected source image.

## [1.3.1] - 2026-06-26
### Added
- sanLabs: 增加“灵感画布 (Thought Canvas)”，基于 Excalidraw 提供一个本地化、无边框的白板，用于随时记录突发灵感和绘制流程图，支持本地存储与防丢失自动保存。

### Fixed
- 高级抠图 (Pro): 修复在处理超大分辨率图片时可能导致底层 `rembg` (IS-Net) 与 Python 产生 `MemoryError` 内存溢出的问题。优化手段包括智能降低检测尺寸阈值和绕过图片全量合成，通过纯遮罩提取结合引导滤波还原无损超清抠图。

## [1.3.0] - 2026-06-25
### Added
- Pro Background Removal (高级抠图): Added a high-precision, locally-run AI background removal tool in sanLabs using `rembg` (u2net/isnet) and Pillow. Features include strategy selection, advanced tunable parameters, side-by-side comparison, and consecutive processing.
- Pro Background Removal (高级抠图): Added intelligent internal hole filling (防误扣漏洞填补) using OpenCV morphological operations to prevent the AI model from incorrectly removing internal parts of solid objects.
- Pro Background Removal (高级抠图): Integrated an interactive Canvas-based brush tool for manual masking repair. Features include a Restore Brush (恢复画笔) to draw back original pixels, and an Eraser (橡皮擦) to remove artifact pixels. Includes pointer-event capture for smooth edge drawing, global hotkeys (Enter/Esc), and full Undo/Redo history support.
- Review remediation documentation for sanOmni, sanPrompt, and sanomni-sync-server boundaries.
- Secure filesystem service path for moving local asset operations behind Tauri commands and user-authorized roots.
- Release note for the June 2026 cross-project review remediation.

### Changed
- sanPrompt publish secrets are stored through the system keyring instead of SQLite settings or source code.
- sanIP sync sends explicit domain and protocol metadata to the sync server.
- Top-level domain views, global modals, and sanLabs tools are lazy-loaded to reduce initial bundle size.
- Local file/folder opening is routed through Tauri commands so broad frontend shell execution can remain disabled.
- Broad Tauri filesystem plugin permissions are removed; local asset filesystem operations now use the secure FS command layer.

### Added
- Emoji Management: Added batch operations (select all, batch change group, batch delete) for emojis.
- Emoji Management: Added a "Revert to image" (退回普通图片) action for emojis to safely remove their emoji status without deleting the original asset from the archive.
- Emoji Management: Added secondary confirmation dialogs for both single and batch emoji deletions to prevent accidental data loss.
- Emoji Management: Improved wording for grouping logic, changing "移除分组" to "移至「未分组」".

## [1.2.1] - 2026-06-16
### Fixed
- Fixed app crash and hanging sync progress (ERR_CONNECTION_REFUSED) caused by a missing `sync_pending_downloads` table on existing installations. Sync now automatically ensures the latest database schema is applied before starting.

## [1.2.0] - 2026-06-15
### Added
- Pending download retry mechanism: files that fail to download during sync are recorded in a `sync_pending_downloads` table and automatically retried on the next sync. On successful retry, the corresponding database record's file path is updated in-place.

### Fixed
- Sync no longer aborts entirely when a single file download fails (e.g. 404 from server). The error is logged, the file is queued for retry, and the remaining changes continue to apply.
- Relaxed the strict `applied == total` pull check that caused sync to roll back when some changes had no data or matched unrecognized tables. Now logs a warning and commits the successfully applied changes.
- Fixed sync cursor advancing even when the pull transaction rolled back or failed, causing pulled changes to be permanently skipped. Cursor now only advances after a successful commit.

## [1.1.9] - 2026-06-15
### Added
- Added a Tauri `sync_get_snapshot` command and client support for the sync server snapshot endpoint, enabling full server-state diagnostics for reconciliation workflows.
- Added `sync_reconcile_snapshot` to compare server snapshot keys against the local SQLite key set without mutating local data.

### Fixed
- Hardened cloud sync recovery for incomplete pulls: trim configured server URLs, tolerate legacy sync JSON with unescaped Windows paths, prevent advancing the sync cursor when remote changes are not fully applied, and repair local file path rewriting for IP sticker pack emojis.
- Updated force repush to include sticker packs, sticker pack platform records, and emoji records instead of only IP assets/images/tags.
- Made file sync fail closed: upload/check/download errors now stop sync, uploaded hashes are verified, existing local files are hash-checked, and downloaded files are rehashed before local records are applied.
- Snapshot reconciliation now rejects malformed snapshot table payloads instead of silently ignoring rows with missing key fields.

### Notes
- Force repush is not a safe merge operation. Back up the server database and confirm the local database is the most complete source before using it.
- Incremental pull still depends on `sync_log` for normal sync. The snapshot endpoint is now reachable from the client for diagnostics/reconciliation, but automatic destructive restore should still require an explicit backup and review step.

## [1.1.8] - 2026-06-14
### Added
- Implemented pagination for Archived Assets (creations tab) to optimize rendering performance for large image collections.
- Added 'View' (high-resolution preview) and 'Open Folder' (show in native file explorer) action buttons to the Emoji Cards overlay.

### Changed
- Replaced the 'View Details' sticker pack button with an 'Edit' button and removed the redundant pencil icon from the sidebar list.
- Removed the watermark icon and pack selector dropdown from the Emoji Cards overlay to clean up the interface.
- Adjusted FAB placement and z-index to prevent overlapping with content or dropdown menus at the bottom of lists.

### Fixed
- Fixed the sticker pack edit modal not populating with the pack details when opened.
- Fixed the IPImagePickerModal scrollbar issue by using explicit viewport height (`h-[60vh]`).

## [1.1.7] - 2026-06-12
### Added
- Fine-grained Sync Control: Support single direction sync operations (Push-only and Pull-only).
- Aggregated Sync Timeline: Visually group sync history logs by time and actions for a human-readable summary.
- sanLabs: Added an Instructions Help Dialog accessible from the Lab tools sidebar.
- Product Image Maker: Added Ctrl+C keyboard shortcut to copy image and text layers to clipboard.

### Fixed
- Sync UI now correctly falls back to local database mappings to display IP names instead of raw IDs.

## [1.1.6] - 2026-06-12
### Added
- Complete cloud two-way synchronization for Sticker Packs, including pack metadata, platform distribution configurations, and individual emoji image assets.
- Automated local directory creation and asset recovery during sync pull.

## [1.1.5] - 2026-06-10
### Added
- Cloud two-way sync engine using CAS content-addressable storage.
- Support for syncing image relations, tags, and avatar files.

### Changed
- Moved sync server architecture documentation to its respective private repository `sanomni-sync-server`.
- Optimized the deletion logic to prevent removing un-synced local files.

### Fixed
- Fixed missing relation tracking in sync triggers.
- Fixed server-side push handling without transaction protection.

## [1.1.0] - 2026-06-09
### Changed
- Implemented Path Immutability (数据底层防断链) for robust asset tracking. See [Release Notes](./docs/release-notes/2026-06-09_PATH_IMMUTABILITY.md).

## [1.0.5] - 2026-06-02
### Fixed
- Fixed directory migration issues. See [Release Notes](./docs/release-notes/2026-06-02_DIRECTORY_MIGRATION_REPAIR.md).

## [1.0.4] - 2026-06-01
### Added
- Unified root directory feature. See [Release Notes](./docs/release-notes/2026-06-01_UNIFIED_ROOT.md).
