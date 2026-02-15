import markdownit from 'markdown-it';
import DOMPurify from 'dompurify';

let container = null;
let hljs = null;

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

  // Lazy-load highlight.js
  import('highlight.js/lib/core').then(async (mod) => {
    hljs = mod.default;
    // Load common languages
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

    // Highlight any already-rendered blocks
    if (container) highlightDeferred(container);
  });
}

export function destroy() {
  window.removeEventListener('file:loaded', handleFileLoaded);
  window.removeEventListener('file:error', handleFileError);
  container = null;
}

function handleFileLoaded(e) {
  const { content, path } = e.detail;
  renderMarkdown(content, path);
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

function renderMarkdown(content, filePath) {
  if (!container) return;

  // Get scroll anchor before re-render
  const anchor = getScrollAnchor(container);

  const rawHtml = md.render(content);
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel', 'data-lang'],
    FORBID_TAGS: ['style', 'form', 'input', 'textarea', 'select', 'button'],
  });

  container.innerHTML = `
    <article class="markdown-body">
      ${cleanHtml}
    </article>
  `;

  // Add checkbox interactivity for task lists
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
  const pending = el.querySelectorAll('pre.hljs-pending');
  let index = 0;

  function batch(deadline) {
    while (index < pending.length && (!deadline || deadline.timeRemaining() > 2)) {
      const block = pending[index];
      const lang = block.dataset.lang;
      const code = block.querySelector('code');
      if (lang && hljs.getLanguage(lang)) {
        code.innerHTML = hljs.highlight(code.textContent, { language: lang }).value;
      } else if (code.textContent.trim()) {
        const result = hljs.highlightAuto(code.textContent);
        if (result.relevance > 5) {
          code.innerHTML = result.value;
        }
      }
      block.classList.replace('hljs-pending', 'hljs-done');
      index++;
    }
    if (index < pending.length) {
      requestIdleCallback(batch, { timeout: 100 });
    }
  }

  if ('requestIdleCallback' in window) {
    requestIdleCallback(batch, { timeout: 100 });
  } else {
    // Fallback: highlight all at once
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
      <h1>Markdown Reader</h1>
      <p>A minimal, lightweight reading companion.</p>
      <p class="welcome-hint">Open a directory to start reading<br><kbd>&#8984;</kbd> + <kbd>O</kbd></p>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
