import markdownit from 'markdown-it';
import DOMPurify from 'dompurify';
import { getState, subscribe } from '../state.js';

let container = null;
let hljs = null;
let highlightAbortController = null;
let unsubscribeEditing = null;

const md = markdownit({
  html: false,
  linkify: true,
  typographer: true,
  highlight: (str, lang) => {
    const escaped = md.utils.escapeHtml(str);
    const langAttr = lang ? ` data-lang="${md.utils.escapeHtml(lang)}"` : '';
    return `<pre class="hljs-pending"${langAttr}><code>${escaped}</code></pre>`;
  },
});

// Open links in default browser
const defaultRender =
  md.renderer.rules.link_open ||
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return defaultRender(tokens, idx, options, env, self);
};

export function init(el) {
  container = el;
  showWelcome();

  window.addEventListener('file:loaded', handleFileLoaded);
  window.addEventListener('file:error', handleFileError);

  // When leaving edit mode, re-render the current file
  unsubscribeEditing = subscribe((changed) => {
    if (changed.includes('editing')) {
      const { editing, rawMarkdown } = getState();
      if (!editing && rawMarkdown) {
        renderMarkdown(rawMarkdown);
      }
    }
  });

  // Lazy-load highlight.js
  import('highlight.js/lib/core').then(async (mod) => {
    hljs = mod.default;
    const langs = await Promise.all([
      import('highlight.js/lib/languages/javascript'),
      import('highlight.js/lib/languages/typescript'),
      import('highlight.js/lib/languages/python'),
      import('highlight.js/lib/languages/bash'),
      import('highlight.js/lib/languages/json'),
      import('highlight.js/lib/languages/css'),
      import('highlight.js/lib/languages/xml'),
      import('highlight.js/lib/languages/markdown'),
      import('highlight.js/lib/languages/yaml'),
      import('highlight.js/lib/languages/sql'),
      import('highlight.js/lib/languages/ruby'),
      import('highlight.js/lib/languages/go'),
    ]);
    const names = [
      'javascript',
      'typescript',
      'python',
      'bash',
      'json',
      'css',
      'xml',
      'markdown',
      'yaml',
      'sql',
      'ruby',
      'go',
    ];
    langs.forEach((lang, i) => hljs.registerLanguage(names[i], lang.default));

    if (container) highlightDeferred(container);
  });
}

export function destroy() {
  window.removeEventListener('file:loaded', handleFileLoaded);
  window.removeEventListener('file:error', handleFileError);
  if (unsubscribeEditing) unsubscribeEditing();
  if (highlightAbortController) highlightAbortController.abort();
  container = null;
}

function handleFileLoaded(e) {
  const { editing } = getState();
  if (editing) return;
  const { content } = e.detail;
  renderMarkdown(content);
}

function handleFileError(e) {
  if (!container) return;
  container.innerHTML = `
    <div class="error-state">
      <p>Failed to load file</p>
      <p class="error-detail">${escapeHtml(e.detail.error)}</p>
    </div>
  `;
}

function renderMarkdown(content) {
  if (!container) return;

  // Cancel any in-flight highlighting
  if (highlightAbortController) highlightAbortController.abort();

  const anchor = getScrollAnchor(container);

  const rawHtml = md.render(content);
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel', 'data-lang'],
    FORBID_TAGS: [
      'style',
      'form',
      'input',
      'textarea',
      'select',
      'button',
      'iframe',
      'object',
      'embed',
      'script',
      'math',
    ],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus'],
  });

  container.innerHTML = `
    <article class="markdown-body">
      ${cleanHtml}
    </article>
  `;

  container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.disabled = true;
  });

  // Deferred syntax highlighting
  requestAnimationFrame(() => {
    if (hljs) highlightDeferred(container);
  });

  // Restore scroll position
  requestAnimationFrame(() => {
    if (anchor) restoreScrollAnchor(container, anchor);
  });
}

function highlightDeferred(el) {
  if (highlightAbortController) highlightAbortController.abort();
  const controller = new AbortController();
  highlightAbortController = controller;

  const pending = el.querySelectorAll('pre.hljs-pending');
  let index = 0;

  function batch(deadline) {
    if (controller.signal.aborted) return;

    while (index < pending.length && (!deadline || deadline.timeRemaining() > 2)) {
      if (controller.signal.aborted) return;
      const block = pending[index];
      const lang = block.dataset.lang;
      const code = block.querySelector('code');
      if (lang && hljs.getLanguage(lang)) {
        code.innerHTML = hljs.highlight(code.textContent, { language: lang }).value;
      } else if (code.textContent.trim()) {
        // Cap auto-detection input size
        const text = code.textContent;
        if (text.length <= 10000) {
          const result = hljs.highlightAuto(text);
          if (result.relevance > 5) {
            code.innerHTML = result.value;
          }
        }
      }
      block.classList.replace('hljs-pending', 'hljs-done');
      index++;
    }
    if (index < pending.length && !controller.signal.aborted) {
      requestIdleCallback(batch, { timeout: 100 });
    }
  }

  if ('requestIdleCallback' in window) {
    requestIdleCallback(batch, { timeout: 100 });
  } else {
    batch(null);
  }
}

function getScrollAnchor(el) {
  const headings = el.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const scrollTop = el.scrollTop;

  for (const heading of headings) {
    if (heading.offsetTop >= scrollTop) {
      return { text: heading.textContent, offset: heading.offsetTop - scrollTop };
    }
  }
  return null;
}

function restoreScrollAnchor(el, anchor) {
  const headings = el.querySelectorAll('h1, h2, h3, h4, h5, h6');
  for (const heading of headings) {
    if (heading.textContent === anchor.text) {
      el.scrollTop = heading.offsetTop - anchor.offset;
      return;
    }
  }
}

function showWelcome() {
  if (!container) return;
  container.innerHTML = `
    <div class="welcome-state">
      <h1>ClawNote</h1>
      <p>A warm, minimal markdown reader with Claude built in.</p>
      <p class="welcome-hint">Open a directory to start reading<br><kbd>&#8984;</kbd> + <kbd>O</kbd></p>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
