# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commit Convention

When creating commits, include this trailer:
```
Co-Authored-By: Deepseek-V4-Pro[1m] <noreply@deepseek.com>
```

## Commands

- `npm run dev` — Start development with hot reload (electron-vite)
- `npm run build` — TypeCheck + build for production
- `npm run build:mac` — Build macOS app (DMG)
- `npm run build:win` — Build Windows app
- `npm run build:linux` — Build Linux app
- `npm run lint` — ESLint check with cache
- `npm run typecheck` — Run TypeScript checks for both node and web tsconfigs
- `npm run format` — Prettier format all files

## Architecture

Electron app with three layers communicating via IPC:

- **`src/main/`** — Electron main process. Spawns `git` CLI via `child_process` to check status. Manages `Tray` (macOS menu bar icon with attention count). Scans directories (one level deep, no recursion). IPC handlers: `selectDirectory`, `scanGitRepos`, `updateTrayIcon`.

- **`src/preload/`** — Bridge layer using `contextBridge`. Exposes `window.api` with `selectDirectory`, `scanGitRepos`, `updateTrayIcon`, and `localStorage`-backed config persistence (`saveConfig`/`getConfig`).

- **`src/renderer/`** — React 19 + TypeScript UI. Single-page app with:
  - `App.tsx` — Root component, manages directory selection, auto-check timer logic (1 min local, 10 min remote), and state.
  - `DirectoryConfig.tsx` — Directory picker button/input.
  - `GitStatusList.tsx` — Filterable, sortable grid of project cards. Shows branch, last commit, uncommitted changes, ahead/behind counts.

### Key Design Details

- Git operations run synchronously per-repo (no concurrency). Remote checks (`includeRemote=true`) are 2x `rev-list --count` calls against `origin/<branch>` — no `git fetch` is run, so remote data is as of last fetch.
- Tray icon shows a count of repos needing attention (uncommitted changes, unpushed, ahead/behind). Clicking tray shows the main window.
- Window hides on close (macOS-style) instead of quitting. `Cmd+Q` quits fully.
- Config (selected directory, auto-check toggle) persisted to `localStorage` via preload API (no electron-store or similar).

## Tech Stack

- Electron 37 + electron-vite 4 + electron-builder 25
- React 19 + TypeScript 5.8
- ESLint 9 (flat config) + Prettier
- Vite 7 + `@vitejs/plugin-react`
