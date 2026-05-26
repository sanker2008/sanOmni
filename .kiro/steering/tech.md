# Technology Stack

## Architecture

**Desktop Application**: Tauri 2.0 hybrid architecture
- **Frontend**: React 18 + TypeScript running in WebView2
- **Backend**: Rust for native system operations and performance
- **IPC**: Tauri command system for frontend-backend communication
- **Two-Domain Design**: The app combines two independent functional domains — Prompt Template Management (sanPromptBox) and IP Character Management (sanIPBox) — plus shared common features. These domains may be split into separate applications in the future.

## Frontend Stack

### Core Framework
- **React 18.2** with TypeScript 5.0
- **Vite 5.0** - Build tool and dev server
- **React DOM 18.2** - Rendering

### UI & Styling
- **Tailwind CSS 3.4** - Utility-first CSS framework
- **shadcn/ui** - Component library built on Radix UI primitives
- **Radix UI** - Headless UI components (Dialog, Switch, Slider, Tooltip, etc.)
- **lucide-react** - Icon library
- **tailwindcss-animate** - Animation utilities

### State Management
- **Zustand 4.5** - Lightweight state management
- Store pattern: Separate stores for images, vendors, tags, and UI state
- LocalStorage integration for settings and theme persistence

### Path Alias
- `@/` maps to `./src/` directory

## Backend Stack

### Core
- **Tauri 2.0** - Desktop application framework
- **Rust 1.70+** - Systems programming language

### Database
- **rusqlite 0.32** - SQLite bindings with bundled SQLite
- **chrono 0.4** - Date/time handling with serde support

### Image Processing
- **image 0.25** - Image manipulation and format handling
- Used for watermark detection and removal

### File System
- **notify 7** - Cross-platform file system watcher
- **tokio 1** - Async runtime with full features

### Utilities
- **serde 1** + **serde_json 1** - Serialization
- **uuid 1** - UUID generation (v4)
- **sha2 0.10** + **hex 0.4** - File hashing
- **anyhow 1** + **thiserror 1** - Error handling

### Tauri Plugins
- **tauri-plugin-shell** - Shell command execution
- **tauri-plugin-dialog** - Native file dialogs
- **tauri-plugin-fs** - File system operations

## Project Structure

```
sanMediaBox/
├── src/                          # React frontend
│   ├── components/              # React components
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── InboxView.tsx       # Inbox view (Prompt domain)
│   │   ├── ArchivedView.tsx    # Archive view (Prompt domain)
│   │   ├── PromptGroupsView.tsx # Prompt groups view (Prompt domain)
│   │   ├── IPManagementView.tsx # IP management view (IP domain)
│   │   ├── TrashView.tsx       # Trash view (Shared)
│   │   ├── ImageCard.tsx       # Image card component
│   │   ├── ImageViewer.tsx     # Full-screen viewer
│   │   ├── DropZone.tsx        # Drag-drop upload
│   │   ├── QuickEditModal.tsx  # Quick edit dialog
│   │   ├── BatchEditModal.tsx  # Batch edit dialog
│   │   ├── IPImagePickerModal.tsx # Image picker for IP assets
│   │   ├── SmartPromptRenderer.tsx # Prompt template renderer
│   │   ├── TemplateVariableEditor.tsx # Template variable editor
│   │   └── SettingsView.tsx    # Settings panel
│   ├── hooks/                  # Custom React hooks
│   │   ├── useFolderWatcher.ts
│   │   ├── useKeyboardShortcuts.ts
│   │   └── useToast.ts
│   ├── services/               # API layer
│   │   └── tauri.ts           # Tauri command wrappers
│   ├── stores/                 # Zustand stores
│   │   └── index.ts           # All stores
│   ├── lib/                    # Utilities
│   │   └── utils.ts           # Helper functions
│   └── styles/                 # Global styles
│       └── globals.css        # Tailwind + CSS variables
├── src-tauri/                   # Rust backend
│   ├── src/
│   │   ├── main.rs             # Entry point
│   │   ├── lib.rs              # Tauri builder setup
│   │   ├── commands/           # Tauri commands (IPC handlers)
│   │   │   ├── mod.rs
│   │   │   ├── images.rs       # Image CRUD + archive (Prompt domain)
│   │   │   ├── vendors.rs      # Vendor management (Prompt domain)
│   │   │   ├── tags.rs         # Tag management (Prompt domain)
│   │   │   ├── classifier.rs   # Auto-classification (Prompt domain)
│   │   │   ├── prompt_groups.rs # Prompt groups (Prompt domain)
│   │   │   ├── scanner.rs      # File system scanning (Prompt + IP domain)
│   │   │   ├── ip_assets.rs    # IP asset management (IP domain)
│   │   │   ├── ip_images.rs    # IP image management (IP domain)
│   │   │   ├── watermark.rs    # Watermark detection (Shared)
│   │   │   ├── watermark_removal.rs # Watermark removal (Shared)
│   │   │   ├── gemini_watermark_removal.rs # Gemini AI watermark removal (Shared)
│   │   │   ├── watcher.rs      # Folder monitoring (Shared)
│   │   │   └── settings.rs     # Settings persistence (Shared)
│   │   ├── database/           # SQLite schema & operations
│   │   │   └── mod.rs
│   │   └── models/             # Data models
│   │       ├── mod.rs          # Shared data models
│   │       └── ip_assets.rs    # IP asset models (IP domain)
│   ├── capabilities/           # Tauri permissions
│   └── icons/                  # Application icons
└── docs/                        # Documentation

```

## Common Commands

### Development
```bash
# Install dependencies
npm install

# Start development server (frontend + backend hot reload)
npm run tauri:dev

# Frontend only (for UI work)
npm run dev
```

### Building
```bash
# Build TypeScript and frontend
npm run build

# Build complete application (creates installer)
npm run tauri:build
```

### Tauri CLI
```bash
# Direct Tauri commands
npm run tauri [command]
```

## Development Notes

### Frontend-Backend Communication
- All backend calls go through `src/services/tauri.ts`
- Use `invoke()` from `@tauri-apps/api/core` for command calls
- Commands are registered in `src-tauri/src/lib.rs`

### State Management Pattern

**Prompt Domain Stores:**
- **Image Store** (`useImageStore`): `ImageWithRelations[]` — inbox/archive workflow, selection state
- **Vendor Store**: Vendor and model data
- **Tag Store**: Tag data and popular tags

**IP Domain Stores:**
- **IP Image Store** (`useIpImageStore`): `IpImageWithRelations[]` — IP image inbox/archive workflow

**Shared Stores:**
- **UI Store**: UI state, filters, modals, theme, settings, active view, `selectedIpId`

### Key Type Distinction

| Type | Domain | Fields |
|------|--------|--------|
| `ImageWithRelations` | Prompt | `models`, `tags`, `prompt_groups`, vendor/model IDs |
| `IpImageWithRelations` | IP | `ip_id`, `ip_name`, `tags` — no vendor/model |
| `IpAsset` | IP | `id`, `name`, `path` (unique slug), `avatar_path`, etc. |

The `path` field on `IpAsset` is a unique slug (lowercase, hyphens/underscores only) used for directory naming in `ip_archived/{path}/` and folder scanning.

### Styling Conventions
- Use Tailwind utility classes
- shadcn/ui components for consistent UI
- CSS variables in `globals.css` for theming
- Dark mode via `dark:` prefix and `.dark` class on `<html>`

### Database Location
- **Windows**: `%USERPROFILE%\.ai-image-manager\data\database.sqlite`
- Managed by Tauri's `app_data_dir()`

### Build Optimization
- Dev profile uses `opt-level = 0` and `codegen-units = 512` for faster compilation
- Dependencies compiled with minimal optimization in dev mode

## Environment Requirements

- **Node.js**: 18+
- **Rust**: 1.70+ (install via [rustup](https://rustup.rs/))
- **MSVC Build Tools**: Required on Windows (Visual Studio Installer → "Desktop development with C++")
- **WebView2**: Pre-installed on Windows 10/11

## Port Configuration

- **Dev Server**: Port 1420 (strict, configured in `vite.config.ts`)
- **Tauri Dev URL**: `http://localhost:1420`
