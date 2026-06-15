# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-06-15
### Added
- Pending download retry mechanism: files that fail to download during sync are recorded in a `sync_pending_downloads` table and automatically retried on the next sync. On successful retry, the corresponding database record's file path is updated in-place.

### Fixed
- Sync no longer aborts entirely when a single file download fails (e.g. 404 from server). The error is logged, the file is queued for retry, and the remaining changes continue to apply.
- Relaxed the strict `applied == total` pull check that caused sync to roll back when some changes had no data or matched unrecognized tables. Now logs a warning and commits the successfully applied changes.

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
