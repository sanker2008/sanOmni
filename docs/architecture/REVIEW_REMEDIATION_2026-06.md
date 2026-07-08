# Review Remediation Notes - 2026-06

This document records the architecture and security remediation work from the
cross-project review of `sanOmni`, `sanPrompt`, and `sanomni-sync-server`.

## Project Responsibilities

`sanOmni` is the desktop client and local asset manager. It owns local asset
storage, local SQLite data, local sanPrompt publishing operations, sanIP asset
management, and sanLabs tools.

`sanPrompt` is the public website and consumer playground. It does not contain a
seller/admin backend. Template production, publishing decisions, category
assignment, price data, image ordering, and publish state are managed locally in
`sanOmni`, then pushed to `sanPrompt` through the publish API.

`sanomni-sync-server` is currently the private sync service for `sanOmni` sanIP.
The protocol now carries a domain and protocol version so future sync domains
can be added without mixing tables or record semantics.

## sanOmni Remediation

Status: implemented and verified in `sanOmni`.

### Publishing Secret Storage

The sanPrompt publish secret must not be stored in source code or plain SQLite
settings. The desktop app now exposes Tauri commands to read/write the secret
from the system keyring:

- `get_sanprompt_publish_secret`
- `set_sanprompt_publish_secret`

The settings save/load path filters keyring-only keys out of the SQLite settings
payload. Legacy `sanPromptPublishSecret` values are migrated out of settings
when encountered.

### Sync Client Contract

The sanIP sync client sends explicit sync metadata:

- domain: `sanIP`
- protocol version: current client/server protocol version

This keeps sanIP sync isolated from future domains and avoids relying on
server-side defaults for protocol behavior.

### Frontend Bundle Boundaries

Domain views and global modals are loaded lazily from `App.tsx`. sanLabs tools
are also loaded lazily from `LabView.tsx`, so large tool dependencies such as
3D pose editing are not part of the initial app shell.

The expected build shape is:

- small app shell and domain-view chunks
- `LabView` as a small registry/sidebar chunk
- heavy lab tools as independent lazy chunks

### Shell and Filesystem Permissions

Native local file/folder opening must go through Rust commands instead of
frontend `Command.create(...)`. This allows the Tauri capability file to remove
general shell execution while keeping native file reveal/open behavior.

Allowed browser-like shell opening is limited to the GitHub repository URL
allowlist used by update/about links.

Filesystem access is being moved behind `src/services/secureFs.ts` and Rust
commands in `src-tauri/src/commands/fs.rs`. New code should not import
`@tauri-apps/plugin-fs` directly for arbitrary local asset paths. Use the secure
FS service so app data and user-authorized asset roots are checked consistently.

The broad frontend filesystem plugin permission set has now been removed from
`src-tauri/capabilities/default.json`, and `tauri_plugin_fs` is no longer
registered in `src-tauri/src/lib.rs`. Frontend asset operations use
`src/services/secureFs.ts`, which calls Rust commands that check either app data
paths or user-authorized roots before reading, writing, copying, renaming,
listing, or deleting local files.

Current expected rules for new code:

1. Do not add `@tauri-apps/plugin-fs` imports for local asset operations.
2. Authorize paths selected by users before operating on them.
3. Use the secure FS wrapper for file reads/writes and directory operations.
4. Keep native open/reveal behavior inside Rust commands.
5. Do not reintroduce wildcard filesystem scopes such as `**`.

## sanPrompt Remediation

### Publish API Authentication

`/api/sync` must require `SYNC_SECRET`. There is no development fallback secret.
If the environment variable is missing, the API returns a service configuration
error instead of silently accepting a default credential.

Error responses must not expose raw backend exceptions to clients.

### Publishing Contract

sanPrompt categories are aligned with the sanOmni category taxonomy. Publish
payloads may include gallery/image metadata, and image records are updated by
URL to make repeated publishes idempotent.

### Next 16 Proxy

The Next.js request middleware has been migrated to the Next 16 proxy file
convention. The file is `src/proxy.ts`, and the exported function is `proxy`.

### Serwist and Turbopack

`@serwist/next` is disabled when Next runs under Turbopack. This avoids using an
unsupported service-worker integration path. If production PWA behavior becomes
required under Turbopack, migrate to Serwist configurator mode or the Turbopack
integration instead of re-enabling the old plugin path.

## sanomni-sync-server Remediation

### Domain and Protocol Isolation

Sync requests and responses include sync domain and protocol metadata. The
server currently allows only the `sanIP` domain. Each domain has a table
allowlist, so adding a future domain requires an explicit table mapping.

### Table and Key Safety

The server rejects unsupported domains, domain mismatches, unknown tables, and
tables outside the domain allowlist.

Composite-key handling must prefer structured JSON fields when available. Do
not parse record IDs by splitting on underscores for relation tables because
business IDs may contain underscores.

### Upload and Database Hardening

File upload handling is bounded and streams through a temporary file instead of
using a global unlimited body limit. SQLite access is pooled instead of being
serialized through a single global connection mutex.

### Future Domains

To add another sync domain:

1. Define the domain name and supported protocol version.
2. Add the domain to the server allowlist.
3. Add a table allowlist and per-table key logic.
4. Add apply/verify tests for inserts, updates, deletes, and composite keys.
5. Update the sanOmni client to send that domain explicitly.

## Verification Commands

Use these commands before considering this remediation complete:

```bash
# sanOmni
pnpm run build
cd src-tauri && cargo check

# sanPrompt
pnpm run build

# sanomni-sync-server
cargo test
```

Latest verification from `sanOmni` on 2026-06-22:

- `pnpm run build` passed.
- `cd src-tauri && cargo check` passed.
- No direct `@tauri-apps/plugin-fs` imports remain under `src/` or `src-tauri/`.
- No `tauri_plugin_fs`, `fs:allow-*`, or `fs:scope` permission remains under
  `src-tauri/`.

## Known Follow-Up Work

- Clean remaining Vite import-shape warnings for `src/services/tauri.ts`, where
  the same core API module is both statically and dynamically imported. This is
  a bundle-shape cleanup item, not a filesystem-permission blocker.
- Decide whether sanPrompt needs production PWA support under Turbopack; if so,
  migrate Serwist integration rather than enabling the unsupported path.
