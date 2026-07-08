# Review Remediation - 2026-06-22

This note summarizes the cross-project review remediation that affects
`sanOmni`, `sanPrompt`, and `sanomni-sync-server`.

## Scope

- `sanOmni` remains the desktop client and local asset manager.
- `sanOmni` owns the local sanPrompt admin workflow for template production,
  publishing decisions, and publish state.
- `sanPrompt` remains the public website/playground and receives published
  template payloads through its publish API.
- `sanomni-sync-server` currently serves sanIP sync, with explicit domain and
  protocol boundaries for future sync domains.

## sanOmni

- sanPrompt publish secrets are stored through the system keyring instead of
  plain SQLite settings.
- sanIP sync sends explicit `sanIP` domain and protocol metadata.
- Local file/folder opening goes through Rust commands instead of frontend shell
  execution.
- Local asset filesystem operations go through `src/services/secureFs.ts` and
  authorized Rust commands.
- Broad Tauri frontend filesystem permissions and wildcard filesystem scopes
  have been removed.
- Domain views, global modals, and sanLabs tools are lazy-loaded to reduce the
  initial bundle size.

## sanPrompt

- `/api/sync` requires `SYNC_SECRET` and fails closed when it is missing.
- Raw backend errors are not exposed to publish API clients.
- Categories and publish payload semantics are aligned with the sanOmni local
  admin workflow.
- Image publishing is idempotent by URL.
- Next 16 proxy conventions and Serwist/Turbopack behavior are documented in
  the sanPrompt publishing contract.

## sanomni-sync-server

- Sync requests include explicit domain and protocol metadata.
- The server currently allows only the `sanIP` domain.
- Tables are allowlisted per domain.
- Composite keys prefer structured JSON fields instead of underscore splitting.
- Uploads are bounded and stream through a temporary file.
- SQLite access uses a connection pool.

## Verification

`sanOmni` verification on 2026-06-22:

- `pnpm run build` passed.
- `cd src-tauri && cargo check` passed.

Cross-project verification recorded during remediation:

- `sanPrompt`: `pnpm run build` passed after publish contract and Next/Serwist
  changes.
- `sanomni-sync-server`: `cargo test` passed with sync protocol boundary tests.

## Remaining Follow-Up

- Clean the remaining Vite import-shape warning for `src/services/tauri.ts`.
  This is a performance and bundle organization cleanup item, not a security
  blocker.
- If sanPrompt needs production PWA behavior under Turbopack, migrate to a
  supported Serwist integration path instead of re-enabling the old plugin path.
