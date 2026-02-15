---
title: "Electron Markdown Reader"
type: feat
status: completed
date: 2026-02-16
---

# Electron Markdown Reader

A minimal, lightweight markdown reader built with Electron. Think lightweight Obsidian.

## Overview

Desktop app for opening directories and reading markdown files with a clean, aesthetic interface. Closely tied to Claude Code workflows.

## Tech Stack

- Electron 33 + Forge + Vite
- Vanilla JS (no framework)
- markdown-it 14.x (CommonMark)
- highlight.js 11.x (selective language loading)
- chokidar 4.x (file watching)
- github-markdown-css 5.x
- DOMPurify 3.x (XSS prevention)

## Design System: Warm Monograph

- Light: #FCFAF7 bg, #C05D30 accent
- Dark: #1C1B19 bg, #E0845A accent
- Source Serif 4 body, IBM Plex Mono code
- System sans-serif headings

## Implementation - Phase 1 (MVP)

- [x] Electron app scaffold with Forge + Vite
- [x] Main process: window creation, IPC handlers, file watcher, menu, window state
- [x] Preload: contextBridge API with disposer pattern
- [x] Renderer: state container, file tree component, markdown renderer
- [x] Security: path validation (realpath), sender verification, CSP headers, DOMPurify
- [x] Performance: deferred syntax highlighting, load token cancellation, app-level debounce
- [x] Styles: themes (light/dark), typography, layout, animations, hljs theme
- [x] File watching with chokidar + 150ms debounce
- [x] Auto-reload on file change

## Phase 2 (Future)

- [ ] Editing mode (CodeMirror integration)
- [ ] Command palette
- [ ] Search across files
- [ ] Recent directories
- [ ] PDF export
