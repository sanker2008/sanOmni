# Project Structure & Organization

## Directory Layout

```
sanMediaBox/
├── .kiro/                       # Kiro AI assistant configuration
│   └── steering/               # AI guidance documents
├── src/                         # Frontend source code
├── src-tauri/                   # Backend source code
├── docs/                        # Project documentation
├── node_modules/                # NPM dependencies
└── [config files]              # Root configuration files
```

## Frontend Structure (`src/`)

### Component Organization

```
src/
├── components/
│   ├── ui/                     # Reusable UI primitives (shadcn/ui)
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   ├── scroll-area.tsx
│   │   ├── separator.tsx
│   │   ├── skeleton.tsx
│   │   ├── slider.tsx
│   │   ├── switch.tsx
│   │   ├── toast.tsx
│   │   ├── toaster.tsx
│   │   ├── dropdown-menu.tsx
│   │   └── tooltip.tsx
│   ├── InboxView.tsx           # Main inbox view (unarchived images)
│   ├── ArchivedView.tsx        # Archive view (archived images)
│   ├── PromptGroupsView.tsx    # Prompt template groups view
│   ├── IPManagementView.tsx    # IP character management view
│   ├── TrashView.tsx           # Trash / recycle bin view
│   ├── ImageCard.tsx           # Individual image card component
│   ├── ImageViewer.tsx         # Full-screen image viewer with navigation
│   ├── DropZone.tsx            # Drag-and-drop upload area
│   ├── QuickEditModal.tsx      # Quick edit dialog for single image
│   ├── BatchEditModal.tsx      # Batch edit dialog for multiple images
│   ├── IPImagePickerModal.tsx  # Image picker modal for IP assets
│   ├── ConfirmDialog.tsx       # Confirmation dialog component
│   ├── SmartPromptRenderer.tsx # Intelligent prompt template renderer
│   ├── TemplateVariableEditor.tsx # Template variable editing component
│   └── SettingsView.tsx        # Settings panel with tabs
```

**Component Conventions:**
- View components (`*View.tsx`): Full-page or major section components
- Modal components (`*Modal.tsx`): Dialog/overlay components
- Card components (`*Card.tsx`): Reusable card-based components
- UI components (`ui/*.tsx`): Atomic, reusable primitives from shadcn/ui

### Other Frontend Directories

```
src/
├── hooks/                      # Custom React hooks
│   ├── useFolderWatcher.ts    # Folder monitoring hook
│   ├── useKeyboardShortcuts.ts # Global keyboard shortcuts
│   └── useToast.ts            # Toast notification hook
├── services/                   # API abstraction layer
│   └── tauri.ts               # Tauri command wrappers
├── stores/                     # Zustand state management
│   └── index.ts               # All stores (Image, Vendor, Tag, UI)
├── lib/                        # Utility functions
│   └── utils.ts               # Helper functions (cn, etc.)
├── styles/                     # Global styles
│   └── globals.css            # Tailwind directives + CSS variables
├── App.tsx                     # Root application component
└── main.tsx                    # React entry point
```

## Backend Structure (`src-tauri/`)

### Rust Source Organization

```
src-tauri/
├── src/
│   ├── main.rs                 # Application entry point (minimal)
│   ├── lib.rs                  # Tauri builder setup and command registration
│   ├── commands/               # Tauri command handlers (IPC endpoints)
│   │   ├── mod.rs             # Module exports
│   │   ├── images.rs          # Image CRUD operations
│   │   ├── vendors.rs         # Vendor and model management
│   │   ├── tags.rs            # Tag operations
│   │   ├── watermark.rs       # Watermark detection
│   │   ├── watermark_removal.rs # Watermark removal
│   │   ├── gemini_watermark_removal.rs # Gemini AI-powered watermark removal
│   │   ├── watcher.rs         # File system monitoring
│   │   ├── settings.rs        # Settings persistence
│   │   ├── classifier.rs      # Auto-classification logic
│   │   ├── ip_assets.rs       # IP character asset management
│   │   ├── prompt_groups.rs   # Prompt template groups
│   │   └── scanner.rs         # File system scanning
│   ├── database/               # Database layer
│   │   └── mod.rs             # SQLite schema and operations
│   └── models/                 # Data structures
│       ├── mod.rs             # Shared data models
│       └── ip_assets.rs       # IP asset data models
├── capabilities/               # Tauri permission definitions
│   └── default.json
├── icons/                      # Application icons
│   └── icon.ico
├── Cargo.toml                  # Rust dependencies
├── Cargo.lock                  # Dependency lock file
├── tauri.conf.json            # Tauri configuration
└── build.rs                    # Build script
```

**Backend Module Conventions:**
- `commands/`: Each file represents a feature domain (images, vendors, tags, etc.)
- `database/`: Single module for all database operations
- `models/`: Shared data structures used across modules
- Command functions are registered in `lib.rs` using `tauri::generate_handler![]`

## Documentation Structure (`docs/`)

```
docs/
├── PROGRESS.md                 # Development progress tracking
├── USAGE.md                    # User guide
├── TROUBLESHOOTING.md          # Common issues and solutions
├── STORAGE_STRUCTURE.md        # File storage organization
├── DATA_PERSISTENCE.md         # Data backup and migration
├── CUSTOM_STORAGE_PATH.md      # Custom path configuration
├── FOLDER_MONITORING.md        # Folder watcher feature
├── DELETE_FEATURE.md           # Delete functionality
├── VENDOR_MANAGEMENT.md        # Vendor management guide
├── IMAGE_VIEWER.md             # Image viewer feature
├── CROSS_PLATFORM.md           # Platform support notes
├── PLATFORM_FIXES.md           # Platform-specific fixes
├── CHANGELOG_*.md              # Version changelogs
└── UI_IMPROVEMENTS_*.md        # UI update logs
```

## Configuration Files (Root)

```
├── package.json                # NPM dependencies and scripts
├── package-lock.json           # NPM lock file
├── tsconfig.json               # TypeScript configuration
├── tsconfig.node.json          # TypeScript config for Node tools
├── vite.config.ts              # Vite build configuration
├── tailwind.config.js          # Tailwind CSS configuration
├── postcss.config.js           # PostCSS configuration
├── components.json             # shadcn/ui configuration
├── index.html                  # HTML entry point
├── .gitignore                  # Git ignore rules
└── README.md                   # Project overview
```

## Module Domains

The project is organized into two independent functional domains plus shared common features:

### Domain 1: Prompt Template Management (sanPromptBox)

Manages AI-generated images as visual references for prompt templates.

| Layer | Files |
|-------|-------|
| **Frontend Views** | `InboxView.tsx`, `ArchivedView.tsx`, `PromptGroupsView.tsx` |
| **Frontend Components** | `ImageCard.tsx`, `QuickEditModal.tsx`, `BatchEditModal.tsx`, `SmartPromptRenderer.tsx`, `TemplateVariableEditor.tsx`, `DropZone.tsx` |
| **Backend Commands** | `images.rs`, `vendors.rs`, `tags.rs`, `classifier.rs`, `prompt_groups.rs`, `scanner.rs` |
| **State** | `useImageStore`, `useVendorStore`, `useTagStore` |

### Domain 2: IP Character Management (sanIPBox)

Manages IP characters, sticker packs, emojis, character sheets, creations, and platform publishing.

| Layer | Files |
|-------|-------|
| **Frontend Views** | `IPManagementView.tsx` |
| **Frontend Components** | `IPImagePickerModal.tsx` |
| **Backend Commands** | `ip_assets.rs` |
| **Backend Models** | `models/ip_assets.rs` |
| **State** | (planned: `useIPStore`) |

### Shared Common Features

Features used by both domains.

| Layer | Files |
|-------|-------|
| **Frontend Views** | `SettingsView.tsx`, `TrashView.tsx` |
| **Frontend Components** | `ImageViewer.tsx`, `ConfirmDialog.tsx`, `ui/*` |
| **Frontend Hooks** | `useFolderWatcher.ts`, `useKeyboardShortcuts.ts`, `useToast.ts` |
| **Frontend Services** | `tauri.ts` |
| **Backend Commands** | `settings.rs`, `watcher.rs`, `watermark.rs`, `watermark_removal.rs`, `gemini_watermark_removal.rs` |
| **State** | `useUIStore` |

## Future Modular Structure

The two domains are architecturally independent and may be split into separate standalone applications in the future:

- **sanPromptBox**: Standalone prompt template management app
- **sanIPBox**: Standalone IP character management app
- **sanMediaBox**: Remains as the unified shell or is retired

To facilitate this potential split, the following guidelines apply:

1. **Minimize cross-domain dependencies**: Prompt and IP modules should not import from each other
2. **Shared code in common locations**: Shared utilities, UI components, and services should remain in domain-neutral locations (`ui/`, `services/`, `hooks/`, shared commands)
3. **Independent database tables**: Each domain's database tables should be logically separable
4. **Domain-specific stores**: Each domain should have its own Zustand store(s)

## File Naming Conventions

### Frontend (TypeScript/React)
- **Components**: PascalCase with `.tsx` extension (e.g., `ImageCard.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useKeyboardShortcuts.ts`)
- **Services**: camelCase with `.ts` extension (e.g., `tauri.ts`)
- **Stores**: camelCase with `.ts` extension (e.g., `index.ts`)
- **Types**: Defined inline or in component files, PascalCase for interfaces

### Backend (Rust)
- **Modules**: snake_case with `.rs` extension (e.g., `watermark_removal.rs`)
- **Functions**: snake_case (e.g., `import_image`, `get_vendors`)
- **Structs**: PascalCase (e.g., `ImageWithRelations`, `Vendor`)
- **Constants**: SCREAMING_SNAKE_CASE

### Documentation
- **Markdown files**: SCREAMING_SNAKE_CASE with `.md` extension (e.g., `PROGRESS.md`)
- **Changelogs**: Include date suffix (e.g., `CHANGELOG_2026-05-20.md`)

## Code Organization Patterns

### Frontend Patterns

**State Management:**
- Separate Zustand stores by domain (images, vendors, tags, UI)
- Store files export both the store hook and TypeScript interfaces
- LocalStorage integration for persistent settings

**Component Structure:**
- Import statements (React, libraries, local)
- Type definitions
- Component function
- Export statement

**Service Layer:**
- All Tauri commands wrapped in `src/services/tauri.ts`
- Provides type-safe API for frontend components
- Handles error transformation

### Backend Patterns

**Command Structure:**
- Each command is an async function with `#[tauri::command]` attribute
- Commands accept typed parameters and return `Result<T, String>`
- Database operations are synchronous (rusqlite)
- File operations use Tauri's path APIs

**Error Handling:**
- Use `anyhow` for internal errors
- Convert to `String` for Tauri command returns
- Use `thiserror` for custom error types

**Database Access:**
- Direct SQLite access via rusqlite
- Connection opened per operation (no connection pooling)
- Database path managed by Tauri's `app_data_dir()`

## Import Path Conventions

### Frontend
- Use `@/` alias for `src/` directory imports
- Example: `import { Button } from "@/components/ui/button"`
- Relative imports for sibling files

### Backend
- Use module paths: `crate::commands::images`
- Re-export through `mod.rs` files
- Public API defined in `lib.rs`

## Adding New Features

### Frontend Feature Checklist
1. Create component in `src/components/`
2. Add types to relevant store in `src/stores/index.ts`
3. Add Tauri command wrapper to `src/services/tauri.ts`
4. Update UI store if new UI state needed
5. Add keyboard shortcuts to `src/hooks/useKeyboardShortcuts.ts` if applicable

### Backend Feature Checklist
1. Create command module in `src-tauri/src/commands/`
2. Define data models in `src-tauri/src/models/mod.rs`
3. Add database operations in `src-tauri/src/database/mod.rs`
4. Export commands in `src-tauri/src/commands/mod.rs`
5. Register commands in `src-tauri/src/lib.rs` invoke_handler
6. Update Tauri capabilities if new permissions needed

## Testing Locations

- No formal test directory structure currently
- Manual testing via `npm run tauri:dev`
- Integration testing through UI interaction
