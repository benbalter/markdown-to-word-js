import { marked, Tokens } from 'marked';

interface TaskListToken extends Tokens.Generic {
  checked: boolean;
}

// Configure marked for GitHub Flavored Markdown
marked.setOptions({
  gfm: true,
  breaks: true,
});

// Add custom renderer for code blocks
marked.use({
  renderer: {
    code(code: string, language: string | undefined) {
      const lang = language || '';
      return `<pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>`;
    }
  }
});

// Add support for task lists
marked.use({
  extensions: [{
    name: 'taskList',
    level: 'inline',
    start(src: string) {
      const match = src.match(/^\s*- \[[ xX]\]/);
      return match ? match.index : undefined;
    },
    tokenizer(src: string) {
      const rule = /^(\s*)- \[( |x|X)\] (.+)/;
      const match = rule.exec(src);
      if (match) {
        return {
          type: 'taskList',
          raw: match[0],
          checked: match[2] !== ' ',
          text: match[3].trim(),
          tokens: this.lexer.inlineTokens(match[3].trim())
        };
      }
    },
    renderer(token: Tokens.Generic) {
      const taskToken = token as TaskListToken;
      const checked = taskToken.checked ? 'checked' : '';
      return `<li class="task-list-item">
        <input type="checkbox" ${checked} disabled> 
        ${this.parser.parseInline(taskToken.tokens ?? [])}
      </li>`;
    }
  }]
});

/**
 * Parse markdown text and return HTML
 */
export function parseMarkdownToHtml(markdown: string): string {
  try {
    return marked.parse(markdown) as string;
  } catch (error) {
    console.error('Markdown parsing error:', error);
    throw new Error('Failed to parse markdown content');
  }
}

/**
 * Extract the first H1 heading text from markdown content.
 * Returns null if no H1 heading is found.
 */
export function extractTitle(markdown: string): string | null {
  const tokens = marked.lexer(markdown);
  for (const token of tokens) {
    if (token.type === 'heading' && token.depth === 1) {
      return token.text;
    }
  }
  return null;
}

/**
 * Convert a string into a URL/filename-safe slug.
 * Lowercases, replaces spaces with hyphens, removes non-alphanumeric characters,
 * and collapses consecutive hyphens.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Escape HTML entities
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}