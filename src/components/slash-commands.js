import { Extension } from '@tiptap/core';
import { PluginKey, Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const COMMANDS = [
  { id: 'heading1', label: 'Heading 1', shortcut: '#', icon: 'H1', action: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run() },
  { id: 'heading2', label: 'Heading 2', shortcut: '##', icon: 'H2', action: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: 'heading3', label: 'Heading 3', shortcut: '###', icon: 'H3', action: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run() },
  { id: 'bullet', label: 'Bullet List', shortcut: '-', icon: '•', action: (editor) => editor.chain().focus().toggleBulletList().run() },
  { id: 'ordered', label: 'Numbered List', shortcut: '1.', icon: '1.', action: (editor) => editor.chain().focus().toggleOrderedList().run() },
  { id: 'task', label: 'Task List', shortcut: '[]', icon: '☐', action: (editor) => editor.chain().focus().toggleTaskList().run() },
  { id: 'blockquote', label: 'Quote', shortcut: '>', icon: '"', action: (editor) => editor.chain().focus().toggleBlockquote().run() },
  { id: 'code', label: 'Code Block', shortcut: '```', icon: '</>', action: (editor) => editor.chain().focus().toggleCodeBlock().run() },
  { id: 'divider', label: 'Divider', shortcut: '---', icon: '—', action: (editor) => editor.chain().focus().setHorizontalRule().run() },
];

let menuEl = null;
let selectedIndex = 0;
let filteredCommands = [];
let queryText = '';
let isActive = false;
let slashPos = null;

function createMenu() {
  if (menuEl) return menuEl;
  menuEl = document.createElement('div');
  menuEl.className = 'slash-menu';
  menuEl.style.display = 'none';
  document.body.appendChild(menuEl);
  return menuEl;
}

function renderMenu() {
  if (!menuEl) return;

  menuEl.innerHTML = filteredCommands
    .map((cmd, i) => `
      <div class="slash-menu-item ${i === selectedIndex ? 'selected' : ''}" data-index="${i}">
        <span class="slash-menu-icon">${cmd.icon}</span>
        <span class="slash-menu-label">${cmd.label}</span>
        <span class="slash-menu-shortcut">${cmd.shortcut}</span>
      </div>
    `)
    .join('');

  menuEl.querySelectorAll('.slash-menu-item').forEach((el) => {
    el.addEventListener('mouseenter', () => {
      selectedIndex = parseInt(el.dataset.index, 10);
      renderMenu();
    });
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      selectCommand();
    });
  });
}

function showMenu(view) {
  if (!menuEl) createMenu();

  const coords = view.coordsAtPos(slashPos);
  menuEl.style.display = 'block';
  menuEl.style.left = `${coords.left}px`;
  menuEl.style.top = `${coords.bottom + 6}px`;

  renderMenu();
}

function hideMenu() {
  if (menuEl) menuEl.style.display = 'none';
  isActive = false;
  slashPos = null;
  queryText = '';
  selectedIndex = 0;
  filteredCommands = [];
}

function filterCommands(query) {
  const q = query.toLowerCase();
  filteredCommands = q
    ? COMMANDS.filter((c) => c.label.toLowerCase().includes(q) || c.shortcut.includes(q))
    : [...COMMANDS];
  selectedIndex = Math.min(selectedIndex, Math.max(0, filteredCommands.length - 1));
}

let currentEditor = null;

function selectCommand() {
  if (!currentEditor || filteredCommands.length === 0) return;

  const cmd = filteredCommands[selectedIndex];

  // Delete the slash and query text
  const { tr } = currentEditor.state;
  tr.delete(slashPos, currentEditor.state.selection.from);
  currentEditor.view.dispatch(tr);

  cmd.action(currentEditor);
  hideMenu();
}

export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addProseMirrorPlugins() {
    const editor = this.editor;
    currentEditor = editor;

    return [
      new Plugin({
        key: new PluginKey('slashCommands'),

        props: {
          handleKeyDown(view, event) {
            if (!isActive) {
              if (event.key === '/') {
                const { $from } = view.state.selection;
                const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
                // Only trigger at start of line or after whitespace
                if (textBefore === '' || textBefore.endsWith(' ')) {
                  // We'll activate after the / is inserted
                  setTimeout(() => {
                    const { from } = editor.state.selection;
                    slashPos = from - 1;
                    isActive = true;
                    queryText = '';
                    filterCommands('');
                    showMenu(view);
                  }, 0);
                }
              }
              return false;
            }

            // Menu is active
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              selectedIndex = (selectedIndex + 1) % filteredCommands.length;
              renderMenu();
              return true;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              selectedIndex = (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length;
              renderMenu();
              return true;
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              selectCommand();
              return true;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              hideMenu();
              return true;
            }
            if (event.key === 'Backspace') {
              const { from } = view.state.selection;
              if (from <= slashPos + 1) {
                // Deleting the slash itself
                hideMenu();
                return false;
              }
              // Let backspace happen, then update query
              setTimeout(() => {
                const { from: newFrom } = editor.state.selection;
                const { $from } = editor.state.selection;
                queryText = $from.parent.textContent.slice(slashPos - $from.start() + 1, newFrom - $from.start());
                filterCommands(queryText);
                if (filteredCommands.length === 0) {
                  hideMenu();
                } else {
                  renderMenu();
                }
              }, 0);
              return false;
            }

            // Typing filter characters
            if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
              setTimeout(() => {
                const { from } = editor.state.selection;
                const { $from } = editor.state.selection;
                queryText = $from.parent.textContent.slice(slashPos - $from.start() + 1, from - $from.start());
                filterCommands(queryText);
                if (filteredCommands.length === 0) {
                  hideMenu();
                } else {
                  renderMenu();
                }
              }, 0);
              return false;
            }

            // Space or other keys close the menu
            if (event.key === ' ') {
              hideMenu();
              return false;
            }

            return false;
          },
        },
      }),
    ];
  },

  onDestroy() {
    hideMenu();
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }
    currentEditor = null;
  },
});
