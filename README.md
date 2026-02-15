# ClawNote

A warm, minimal desktop markdown reader with a built-in Claude Code terminal. Read, write, and refine your markdown files — then ask Claude to edit them without leaving the app.

Built with Electron and vanilla JS. No frameworks, no bloat.

![macOS](https://img.shields.io/badge/platform-macOS-333?style=flat-square)
![Electron 33](https://img.shields.io/badge/electron-33-47848f?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-c05d30?style=flat-square)

---

## Features

**Read** — Beautifully typeset markdown with syntax highlighting, GFM tables, task lists, and smooth scroll. Serif body text, warm tones, zero distraction.

**Write** — Toggle into a rich editor with a floating toolbar, slash commands (`/`), and instant save. Markdown in, markdown out — no proprietary format.

**Claude Code** — An embedded terminal panel runs Claude as an interactive PTY session. Ask it to edit your files and watch changes reload live in the reader above.

**Themes** — A hand-tuned "Warm Monograph" palette in light and dark, following your system preference. The terminal stays dark in both modes.

**File Watching** — Chokidar watches your directory. Any external change — from Claude, git, or another editor — reloads instantly.

---

## Screenshots

> *Coming soon — the app uses a warm, book-like color palette with rust accents and serif typography.*

---

## Install

```bash
git clone https://github.com/your-username/clawnote.git
cd clawnote
npm install
npm start
```

Requires Node.js 18+ and `claude` CLI installed globally (for the terminal feature).

### Build for macOS

```bash
npm run make
```

Produces a `.dmg` in the `out/` directory.

---

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Open directory | `Cmd+O` |
| Toggle sidebar | `Cmd+B` |
| Toggle edit mode | `Cmd+E` |
| Save (in editor) | `Cmd+S` |
| Open Claude Code | `Cmd+Shift+C` |
| Slash commands (in editor) | `/` |

---

## How the Claude Terminal Works

Press `Cmd+Shift+C` or click the terminal icon in the sidebar header. A bottom panel opens with Claude Code running as a PTY process:

```
+--------------------------+
|  Sidebar  |   Markdown   |
|           |   Viewer     |
|           |              |
|           +--------------+
|           | Claude Code  |
|           | Terminal     |
+--------------------------+
```

- Claude receives context about which file you're reading
- The `CLAUDECODE` env var is stripped so it works even when launched from a Claude Code session
- File changes Claude makes are picked up by the watcher and auto-reloaded
- One session at a time — reopening kills the previous one
- Close with the X button or reopen via the menu

---

## Editor

Toggle edit mode with `Cmd+E`. The editor uses Tiptap (ProseMirror) under the hood:

- **Toolbar**: Bold, italic, strikethrough, code, headings, lists, blockquotes, code blocks, horizontal rules
- **Slash commands**: Type `/` for a quick-insert menu with 9 block types
- **Task lists**: Fully interactive checkboxes
- **Save indicator**: Shows unsaved changes with `Save*`, confirms with `Saved`
- **Round-trip fidelity**: Markdown -> HTML for editing -> Markdown on save (via Turndown + GFM plugin)

---

## Architecture

```
src/
  main/
    index.js            Entry point, window creation, security policies
    ipc-handlers.js     All IPC: file ops, directory picker, PTY management
    file-watcher.js     Chokidar watcher with debounced events
    menu.js             Native menu bar (File, Edit, View)
    window-state.js     Persist window position/size across sessions
    recent-dirs.js      Recent directories (up to 10, persisted to disk)
  components/
    file-tree.js        Sidebar: directory tree, recent dirs, empty state
    markdown-renderer.js  Read mode: markdown-it + DOMPurify + highlight.js
    editor.js           Write mode: Tiptap editor + toolbar + save
    slash-commands.js    Tiptap extension for / command menu
    claude-terminal.js  xterm.js terminal + PTY IPC bridge
  styles/
    themes.css          Warm Monograph design tokens (light + dark + terminal)
    app.css             Layout, sidebar, file tree, scrollbars
    markdown.css        Typography, code blocks, tables, task lists
    editor.css          Toolbar, slash menu, editor chrome
    claude-terminal.css Terminal panel, header bar, session-ended state
    animations.css      Fade-in, reduced-motion support
    hljs-theme.css      Syntax highlighting colors
  state.js              Simple pub/sub state store
  renderer.js           Wires everything together
  preload.js            IPC bridge (context-isolated)
```

**Stack**: Electron 33, Forge 7.x, Vite 5.x, vanilla JS. No React, no Vue, no bundler plugins beyond what Forge provides.

**Key dependencies**:
- [markdown-it](https://github.com/markdown-it/markdown-it) — Markdown parsing
- [Tiptap](https://tiptap.dev) — Rich text editing
- [highlight.js](https://highlightjs.org) — Syntax highlighting (deferred via `requestIdleCallback`)
- [DOMPurify](https://github.com/cure53/DOMPurify) — HTML sanitization
- [xterm.js](https://xtermjs.org) — Terminal emulator
- [node-pty](https://github.com/nicknisi/node-pty) — PTY process spawning
- [chokidar](https://github.com/paulmillr/chokidar) — File system watching

---

## Design

The "Warm Monograph" theme is designed to feel like reading a well-set book:

- **Typography**: Serif body (Source Serif 4 / Georgia), system sans-serif headings
- **Palette**: Off-white and deep brown backgrounds, rust-orange accents, warm grays
- **Terminal**: Always dark with warm tints — `#2a2520` in light mode, `#141311` in dark mode
- **Details**: Subtle shadows, rounded code blocks, accent-colored blockquote borders, smooth 0.2s transitions
- **Accessibility**: Respects `prefers-reduced-motion`, clear focus states, readable contrast ratios

---

## Security

- Context isolation enabled — renderer has no direct Node.js access
- All file paths validated against the opened directory root (symlink-resolved)
- Only `.md` / `.markdown` files can be read or written
- 10 MB file size limit
- IPC sender origin validated
- CSP headers enforced in production
- DOMPurify strips all dangerous HTML from rendered markdown
- `CLAUDECODE` env var removed from PTY to prevent nested session conflicts

---

## License

MIT
