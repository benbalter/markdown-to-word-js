import { marked, Token } from 'marked';

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
    renderer(token: any) {
      const checked = token.checked ? 'checked' : '';
      return `<li class="task-list-item">
        <input type="checkbox" ${checked} disabled> 
        ${this.parser.parseInline(token.tokens)}
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
 * Parse markdown and return tokens for Word document generation
 */
export function parseMarkdownToTokens(markdown: string): Token[] {
  try {
    return marked.lexer(markdown);
  } catch (error) {
    console.error('Markdown tokenization error:', error);
    throw new Error('Failed to tokenize markdown content');
  }
}

/**
 * Escape HTML entities
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Extract text content from markdown tokens (for Word document generation)
 */
export function extractTextFromTokens(tokens: Token[]): string {
  let text = '';
  
  for (const token of tokens) {
    switch (token.type) {
      case 'heading':
        text += token.text + '\n\n';
        break;
      case 'paragraph':
        text += token.text + '\n\n';
        break;
      case 'list':
        if ('items' in token) {
          for (const item of token.items) {
            text += '• ' + item.text + '\n';
          }
        }
        text += '\n';
        break;
      case 'blockquote':
        text += '> ' + token.text + '\n\n';
        break;
      case 'code':
        text += token.text + '\n\n';
        break;
      case 'hr':
        text += '---\n\n';
        break;
      default:
        if ('text' in token) {
          text += token.text + '\n';
        }
        break;
    }
  }
  
  return text.trim();
}