# Technology Stack

## Architecture

**Desktop Application**: Tauri 2.0 hybrid architecture
- **Frontend**: React 18 + TypeScript running in WebView2
- **Backend**: Rust for native system operations and performance
- **IPC**: Tauri command system for frontend-backend communication

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
│   │   ├── InboxView.tsx       # Inbox view
│   │   ├── ArchivedView.tsx    # Archive view
│   │   ├── ImageCard.tsx       # Image card component
│   │   ├── ImageViewer.tsx     # Full-screen viewer
│   │   ├── DropZone.tsx        # Drag-drop upload
│   │   ├── QuickEditModal.tsx  # Quick edit dialog
│   │   ├── BatchEditModal.tsx  # Batch edit dialog
│   │   └── SettingsView.tsx    # Settings panel
│   ├── hooks/                  # Custom React hooks
│   │   ├── useFolderWatcher.ts
│   │   └── useKeyboardShortcuts.ts
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
│   │   │   ├── images.rs       # Image CRUD + archive
│   │   │   ├── vendors.rs      # Vendor management
│   │   │   ├── tags.rs         # Tag management
│   │   │   ├── watermark.rs    # Watermark detection
│   │   │   ├── watermark_removal.rs
│   │   │   ├── watcher.rs      # Folder monitoring
│   │   │   ├── settings.rs     # Settings persistence
│   │   │   └── classifier.rs   # Auto-classification
│   │   ├── database/           # SQLite schema & operations
│   │   │   └── mod.rs
│   │   └── models/             # Data models
│   │       └── mod.rs
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
- **Image Store**: Image data, selection state
- **Vendor Store**: Vendor and model data
- **Tag Store**: Tag data and popular tags
- **UI Store**: UI state, filters, modals, theme, settings

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
