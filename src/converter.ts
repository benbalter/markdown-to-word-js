import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  ShadingType,
  UnderlineType,
  convertInchesToTwip
} from 'docx';
import { Token, Tokens } from 'marked';
import { parseMarkdownToTokens } from './markdown-parser.js';

interface ConversionOptions {
  filename?: string;
  pageMargins?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

/**
 * Convert markdown text to a Word document blob
 */
export async function convertMarkdownToWord(
  markdown: string, 
  options: ConversionOptions = {}
): Promise<Blob> {
  try {
    const tokens = parseMarkdownToTokens(markdown);
    const document = createWordDocument(tokens, options);
    const blob = await Packer.toBlob(document);
    return blob;
  } catch (error) {
    console.error('Word document generation error:', error);
    throw new Error('Failed to generate Word document');
  }
}

/**
 * Create a Word document from markdown tokens
 */
function createWordDocument(tokens: Token[], options: ConversionOptions = {}): Document {
  const children: Paragraph[] = [];
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const paragraphs = convertTokenToParagraphs(token);
    children.push(...paragraphs);
  }
  
  // Ensure we have at least one paragraph
  if (children.length === 0) {
    children.push(new Paragraph({
      children: [new TextRun('')]
    }));
  }

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(options.pageMargins?.top ?? 1),
            right: convertInchesToTwip(options.pageMargins?.right ?? 1),
            bottom: convertInchesToTwip(options.pageMargins?.bottom ?? 1),
            left: convertInchesToTwip(options.pageMargins?.left ?? 1),
          }
        }
      },
      children: children
    }]
  });
}

/**
 * Convert a markdown token to Word paragraphs
 */
function convertTokenToParagraphs(token: Token): Paragraph[] {
  switch (token.type) {
    case 'heading':
      return [createHeading(token as Tokens.Heading)];
    
    case 'paragraph':
      return [createParagraph(token as Tokens.Paragraph)];
    
    case 'list':
      return createList(token as Tokens.List);
    
    case 'blockquote':
      return [createBlockquote(token as Tokens.Blockquote)];
    
    case 'code':
      return [createCodeBlock(token as Tokens.Code)];
    
    case 'table':
      return [createTable(token as Tokens.Table)];
    
    case 'hr':
      return [createHorizontalRule()];
    
    case 'space':
      return [new Paragraph({ children: [new TextRun('')] })];
    
    default: {
      // Handle unknown token types by extracting text
      const text = 'text' in token ? (token as { text: string }).text : '';
      return [new Paragraph({ children: [new TextRun(text || '')] })];
    }
  }
}

/**
 * Create a heading paragraph
 */
function createHeading(token: Tokens.Heading): Paragraph {
  const level = Math.min(token.depth, 6) as 1 | 2 | 3 | 4 | 5 | 6;
  const headingLevels: Record<number, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
    5: HeadingLevel.HEADING_5,
    6: HeadingLevel.HEADING_6,
  };
  
  return new Paragraph({
    heading: headingLevels[level],
    children: parseInlineText(token.text),
    spacing: { after: 200, before: 200 }
  });
}

/**
 * Create a regular paragraph
 */
function createParagraph(token: Tokens.Paragraph): Paragraph {
  return new Paragraph({
    children: parseInlineText(token.text),
    spacing: { after: 200 }
  });
}

/**
 * Create list paragraphs
 */
function createList(token: Tokens.List): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  
  for (let i = 0; i < token.items.length; i++) {
    const item = token.items[i];
    const isTask = item.task !== undefined;
    const isChecked = item.checked === true;
    
    let text = item.text;
    if (isTask) {
      text = `${isChecked ? '☑' : '☐'} ${text}`;
    }
    
    const paragraph = new Paragraph({
      children: parseInlineText(text),
      bullet: token.ordered ? { level: 0 } : { level: 0 },
      spacing: { after: 100 }
    });
    
    paragraphs.push(paragraph);
  }
  
  return paragraphs;
}

/**
 * Create a blockquote paragraph
 */
function createBlockquote(token: Tokens.Blockquote): Paragraph {
  const text = extractTextFromTokens(token.tokens || []);
  
  return new Paragraph({
    children: parseInlineText(text),
    indent: { left: convertInchesToTwip(0.5) },
    border: {
      left: {
        style: BorderStyle.SINGLE,
        size: 4,
        color: 'CCCCCC'
      }
    },
    spacing: { after: 200 }
  });
}

/**
 * Create a code block paragraph
 */
function createCodeBlock(token: Tokens.Code): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: token.text,
        font: 'Courier New',
        size: 20, // 10pt
      })
    ],
    shading: {
      type: ShadingType.SOLID,
      color: 'F5F5F5'
    },
    spacing: { after: 200, before: 200 }
  });
}

/**
 * Create a table from markdown table token
 */
function createTable(token: Tokens.Table): Paragraph {
  // For now, just create a simple text representation of the table
  // Full table support would require more complex document structure
  let tableText = '';
  
  // Header row
  if (token.header && token.header.length > 0) {
    const headerRow = token.header.map((cell: Tokens.TableCell) => cell.text).join(' | ');
    tableText += headerRow + '\n';
    tableText += token.header.map(() => '---').join(' | ') + '\n';
  }
  
  // Data rows
  for (const row of token.rows) {
    const dataRow = row.map((cell: Tokens.TableCell) => cell.text).join(' | ');
    tableText += dataRow + '\n';
  }
  
  return new Paragraph({
    children: [new TextRun({
      text: tableText,
      font: 'Courier New',
      size: 20,
    })],
    shading: {
      type: ShadingType.SOLID,
      color: 'F5F5F5'
    },
    spacing: { after: 200, before: 200 }
  });
}

/**
 * Create a horizontal rule
 */
function createHorizontalRule(): Paragraph {
  return new Paragraph({
    children: [new TextRun({
      text: '_______________________________________________________________________________',
      color: 'CCCCCC'
    })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200, before: 200 }
  });
}

/**
 * Parse inline text with formatting (bold, italic, links, etc.)
 */
function parseInlineText(text: string): TextRun[] {
  const runs: TextRun[] = [];
  
  // Simple regex-based parsing for basic formatting
  // This is a simplified version - a more robust solution would use marked's inline parser
  
  const remaining = text;
  let index = 0;
  
  // Process bold, italic, and code formatting
  const formatRegex = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let match;
  
  while ((match = formatRegex.exec(remaining)) !== null) {
    // Add text before the match
    if (match.index > index) {
      const beforeText = remaining.substring(index, match.index);
      if (beforeText) {
        runs.push(new TextRun(beforeText));
      }
    }
    
    if (match[2]) {
      // Bold text
      runs.push(new TextRun({ text: match[2], bold: true }));
    } else if (match[4]) {
      // Italic text
      runs.push(new TextRun({ text: match[4], italics: true }));
    } else if (match[6]) {
      // Inline code
      runs.push(new TextRun({ 
        text: match[6], 
        font: 'Courier New',
        shading: { type: ShadingType.SOLID, color: 'F5F5F5' }
      }));
    } else if (match[8] && match[9]) {
      // Links - show as underlined text with the URL in parentheses
      runs.push(new TextRun({ 
        text: `${match[8]} (${match[9]})`, 
        underline: { type: UnderlineType.SINGLE },
        color: '0000EE'
      }));
    }
    
    index = match.index + match[0].length;
  }
  
  // Add remaining text
  if (index < remaining.length) {
    const remainingText = remaining.substring(index);
    if (remainingText) {
      runs.push(new TextRun(remainingText));
    }
  }
  
  // If no formatting was found, return the original text
  if (runs.length === 0) {
    runs.push(new TextRun(text));
  }
  
  return runs;
}

/**
 * Extract plain text from tokens (helper function)
 */
function extractTextFromTokens(tokens: Token[]): string {
  let text = '';
  
  for (const token of tokens) {
    if ('text' in token) {
      text += token.text + ' ';
    } else if ('raw' in token) {
      text += token.raw + ' ';
    }
  }
  
  return text.trim();
}