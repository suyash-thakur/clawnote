import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import markdownit from 'markdown-it';
import TurndownService from 'turndown';
import { gfm } from '@joplin/turndown-plugin-gfm';
import { SlashCommands } from './slash-commands.js';
import { getState, setState, subscribe } from '../state.js';

let editor = null;
let container = null;
let editorEl = null;
let toolbarEl = null;
let unsubscribe = null;
let lastSavedContent = '';
let isSaving = false;

const md = markdownit({ html: false, linkify: true, typographer: true });

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  bulletListMarker: '-',
  hr: '---',
});
turndown.use(gfm);

// Custom task list rule
turndown.addRule('taskListItem', {
  filter: (node) => {
    return node.nodeName === 'LI' && node.getAttribute('data-type') === 'taskItem';
  },
  replacement: (content, node) => {
    const checked = node.getAttribute('data-checked') === 'true';
    const text = content.trim().replace(/^\n+/, '');
    return `${checked ? '- [x]' : '- [ ]'} ${text}\n`;
  },
});

function markdownToHtml(markdown) {
  return md.render(markdown);
}

function htmlToMarkdown(html) {
  let result = turndown.turndown(html);
  // Clean up extra blank lines
  result = result.replace(/\n{3,}/g, '\n\n');
  // Ensure file ends with newline
  if (!result.endsWith('\n')) result += '\n';
  return result;
}

export function init(el) {
  container = el;
  unsubscribe = subscribe((changed) => {
    if (changed.includes('editing')) {
      const { editing } = getState();
      if (editing) {
        show();
      } else {
        hide();
      }
    }
  });
}

export function destroy() {
  if (unsubscribe) unsubscribe();
  destroyEditor();
  container = null;
}

function createToolbar() {
  if (toolbarEl) return;
  toolbarEl = document.createElement('div');
  toolbarEl.className = 'editor-toolbar';
  toolbarEl.innerHTML = `
    <div class="toolbar-group">
      <button data-action="bold" title="Bold (Cmd+B)"><strong>B</strong></button>
      <button data-action="italic" title="Italic (Cmd+I)"><em>I</em></button>
      <button data-action="strike" title="Strikethrough" style="text-decoration: line-through;">S</button>
      <button data-action="code" title="Inline Code" style="font-family: var(--font-mono);">&lt;/&gt;</button>
    </div>
    <div class="toolbar-sep"></div>
    <div class="toolbar-group">
      <button data-action="h1" title="Heading 1">H1</button>
      <button data-action="h2" title="Heading 2">H2</button>
      <button data-action="h3" title="Heading 3">H3</button>
    </div>
    <div class="toolbar-sep"></div>
    <div class="toolbar-group">
      <button data-action="bulletList" title="Bullet List">•</button>
      <button data-action="orderedList" title="Numbered List">1.</button>
      <button data-action="taskList" title="Task List">☑</button>
    </div>
    <div class="toolbar-sep"></div>
    <div class="toolbar-group">
      <button data-action="blockquote" title="Quote">"</button>
      <button data-action="codeBlock" title="Code Block">{ }</button>
      <button data-action="hr" title="Divider">—</button>
    </div>
    <div class="toolbar-spacer"></div>
    <div class="toolbar-group">
      <button data-action="save" class="toolbar-save" title="Save (Cmd+S)">Save</button>
    </div>
  `;

  toolbarEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !editor) return;

    const action = btn.dataset.action;
    const chain = editor.chain().focus();

    switch (action) {
      case 'bold': chain.toggleBold().run(); break;
      case 'italic': chain.toggleItalic().run(); break;
      case 'strike': chain.toggleStrike().run(); break;
      case 'code': chain.toggleCode().run(); break;
      case 'h1': chain.toggleHeading({ level: 1 }).run(); break;
      case 'h2': chain.toggleHeading({ level: 2 }).run(); break;
      case 'h3': chain.toggleHeading({ level: 3 }).run(); break;
      case 'bulletList': chain.toggleBulletList().run(); break;
      case 'orderedList': chain.toggleOrderedList().run(); break;
      case 'taskList': chain.toggleTaskList().run(); break;
      case 'blockquote': chain.toggleBlockquote().run(); break;
      case 'codeBlock': chain.toggleCodeBlock().run(); break;
      case 'hr': chain.setHorizontalRule().run(); break;
      case 'save': save(); break;
    }
  });
}

function updateToolbarState() {
  if (!toolbarEl || !editor) return;

  toolbarEl.querySelectorAll('button[data-action]').forEach((btn) => {
    const action = btn.dataset.action;
    let active = false;

    switch (action) {
      case 'bold': active = editor.isActive('bold'); break;
      case 'italic': active = editor.isActive('italic'); break;
      case 'strike': active = editor.isActive('strike'); break;
      case 'code': active = editor.isActive('code'); break;
      case 'h1': active = editor.isActive('heading', { level: 1 }); break;
      case 'h2': active = editor.isActive('heading', { level: 2 }); break;
      case 'h3': active = editor.isActive('heading', { level: 3 }); break;
      case 'bulletList': active = editor.isActive('bulletList'); break;
      case 'orderedList': active = editor.isActive('orderedList'); break;
      case 'taskList': active = editor.isActive('taskList'); break;
      case 'blockquote': active = editor.isActive('blockquote'); break;
      case 'codeBlock': active = editor.isActive('codeBlock'); break;
    }

    btn.classList.toggle('active', active);
  });
}

function show() {
  if (!container) return;

  const { currentFile, rawMarkdown } = getState();
  if (!currentFile || rawMarkdown == null) return;

  // Destroy any previous editor instance
  destroyEditor();

  createToolbar();

  // Clear the content area and show editor
  container.innerHTML = '';

  editorEl = document.createElement('div');
  editorEl.className = 'editor-wrapper';

  const editorContent = document.createElement('div');
  editorContent.className = 'editor-content';

  editorEl.appendChild(editorContent);
  container.appendChild(toolbarEl);
  container.appendChild(editorEl);

  lastSavedContent = rawMarkdown;
  const html = markdownToHtml(rawMarkdown);

  try {
    editor = new Editor({
      element: editorContent,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4, 5, 6] },
        }),
        Placeholder.configure({
          placeholder: 'Start writing, or type / for commands...',
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        SlashCommands,
      ],
      content: html,
      editorProps: {
        attributes: {
          class: 'markdown-body',
        },
      },
      onUpdate: () => {
        updateToolbarState();
        updateDirtyState();
      },
      onSelectionUpdate: () => {
        updateToolbarState();
      },
    });

    // Keyboard shortcuts
    container.addEventListener('keydown', handleKeydown);
    editor.commands.focus();
  } catch (err) {
    console.error('Failed to initialize editor:', err);
  }
}

function hide() {
  container?.removeEventListener('keydown', handleKeydown);
  destroyEditor();
}

function destroyEditor() {
  if (editor) {
    editor.destroy();
    editor = null;
  }
  if (editorEl) {
    editorEl.remove();
    editorEl = null;
  }
  if (toolbarEl?.parentNode) {
    toolbarEl.remove();
  }
}

function handleKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    save();
  }
}

function updateDirtyState() {
  if (!editor) return;
  const currentMarkdown = htmlToMarkdown(editor.getHTML());
  const dirty = currentMarkdown !== lastSavedContent;
  const saveBtn = toolbarEl?.querySelector('[data-action="save"]');
  if (saveBtn) {
    saveBtn.classList.toggle('dirty', dirty);
    saveBtn.textContent = dirty ? 'Save*' : 'Save';
  }
}

export async function save() {
  if (!editor || isSaving) return;

  const { currentFile } = getState();
  if (!currentFile) return;

  isSaving = true;
  const saveBtn = toolbarEl?.querySelector('[data-action="save"]');
  if (saveBtn) saveBtn.textContent = 'Saving...';

  try {
    const markdown = htmlToMarkdown(editor.getHTML());
    await window.api.writeFile(currentFile, markdown);
    lastSavedContent = markdown;
    setState({ rawMarkdown: markdown });
    if (saveBtn) {
      saveBtn.textContent = 'Saved';
      saveBtn.classList.remove('dirty');
      setTimeout(() => {
        if (saveBtn && !isSaving) saveBtn.textContent = 'Save';
      }, 1500);
    }
  } catch (err) {
    console.error('Failed to save:', err);
    if (saveBtn) saveBtn.textContent = 'Error!';
    setTimeout(() => {
      if (saveBtn) saveBtn.textContent = 'Save*';
    }, 2000);
  } finally {
    isSaving = false;
  }
}

export function getEditor() {
  return editor;
}

export function isEditing() {
  return !!editor;
}
