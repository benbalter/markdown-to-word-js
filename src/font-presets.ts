/**
 * Typography for one level of a document.
 *
 * Word selects a typeface per character class: Latin letters and digits are
 * rendered from the `w:ascii`/`w:hAnsi` run-property slots, Chinese characters
 * from `w:eastAsia`. Naming both fonts per level is therefore enough to keep
 * Chinese text in a Chinese face and Latin text in a Latin one.
 */
export interface LevelStyle {
  /** Typeface for Latin letters, digits and punctuation. */
  latin: string;
  /** Typeface for Chinese characters. */
  eastAsia: string;
  /** Font size in points. Chinese named sizes: size 2 (二号) = 22pt, size 3 (三号) = 16pt. */
  sizePt: number;
  bold: boolean;
  /** Centers the paragraph, without the first-line indent. */
  centered?: boolean;
}

/**
 * Word line spacing rule:
 *
 * - `single`: single line spacing.
 * - `grid`: exact line spacing at the line pitch of the page's document grid,
 *   with widow control off, so every full page holds `page.grid.linesPerPage`
 *   lines. Needs `page.grid`.
 */
export type LineSpacing = 'single' | 'grid';

export interface ParagraphStyle {
  /** Paragraph spacing before and after, in points. */
  beforePt: number;
  afterPt: number;
  lineSpacing: LineSpacing;
  /** First-line indent, in characters of the body font size. */
  firstLineIndentChars?: number;
}

/** Paper and text block, in millimeters. */
export interface PageLayout {
  widthMm: number;
  heightMm: number;
  marginsMm: { top: number; right: number; bottom: number; left: number };
  /** Word's document grid (文档网格): a fixed number of lines and characters. */
  grid?: { linesPerPage: number; charsPerLine: number };
}

export interface FontPreset {
  body: LevelStyle;
  /** Six entries, applied to the `Heading1` - `Heading6` styles. */
  headings: LevelStyle[];
  /** Shared by the body text and every heading level. */
  paragraph: ParagraphStyle;
  /**
   * Page size and margins. Margins passed to `convertMarkdownToWord` as
   * `pageMargins` take precedence.
   */
  page?: PageLayout;
}

const LATIN_FONT = 'Times New Roman';
const BODY_FONT = '仿宋';

/** Chinese size 2 (二号). */
const SIZE_ER = 22;
/** Chinese size 3 (三号). */
const SIZE_SAN = 16;

/**
 * Chinese official documents (公文), after GB/T 9704-2012 《党政机关公文格式》:
 *
 * - Body: FangSong (仿宋), size 3
 * - Heading 1 (the title): FZXiaoBiaoSong (方正小标宋简体), size 2, centered (7.3.1)
 * - Heading 2: SimHei (黑体), size 3
 * - Heading 3: KaiTi (楷体), size 3
 * - Heading 4: FangSong, size 3, bold. The standard sets levels 3 and 4 in
 *   plain 仿宋, but a bolded fourth level is how these documents are made.
 * - Heading 5 and below: FangSong, size 3, not bold.
 * - A4 paper with a 37mm top and 28mm left margin around a 156 × 225mm text
 *   block (5.1, 5.2.1)
 * - 22 lines of 28 characters per page (5.2.3), as a document grid with exact
 *   line spacing at its pitch
 * - Paragraphs indented two characters (7.3.3), headings below the title too
 *
 * Every level uses Times New Roman for Latin text and no space before or after
 * paragraphs. The standard names no Latin font; Times New Roman is common
 * practice.
 */
export const CHINESE_OFFICIAL_DOC_FONTS: FontPreset = {
  body: { latin: LATIN_FONT, eastAsia: BODY_FONT, sizePt: SIZE_SAN, bold: false },
  headings: [
    {
      latin: LATIN_FONT,
      eastAsia: '方正小标宋简体',
      sizePt: SIZE_ER,
      bold: false,
      centered: true,
    },
    { latin: LATIN_FONT, eastAsia: '黑体', sizePt: SIZE_SAN, bold: false },
    { latin: LATIN_FONT, eastAsia: '楷体', sizePt: SIZE_SAN, bold: false },
    { latin: LATIN_FONT, eastAsia: BODY_FONT, sizePt: SIZE_SAN, bold: true },
    { latin: LATIN_FONT, eastAsia: BODY_FONT, sizePt: SIZE_SAN, bold: false },
    { latin: LATIN_FONT, eastAsia: BODY_FONT, sizePt: SIZE_SAN, bold: false },
  ],
  paragraph: { beforePt: 0, afterPt: 0, lineSpacing: 'grid', firstLineIndentChars: 2 },
  page: {
    widthMm: 210,
    heightMm: 297,
    // 297 - 37 - 225 = 35 at the bottom, 210 - 28 - 156 = 26 on the right.
    marginsMm: { top: 37, right: 26, bottom: 35, left: 28 },
    grid: { linesPerPage: 22, charsPerLine: 28 },
  },
};

/** Twips (1/20 point) per millimeter. */
const TWIPS_PER_MM = 1440 / 25.4;

export function mmToTwips(mm: number): number {
  return Math.round(mm * TWIPS_PER_MM);
}

/** The presets offered in the UI, keyed by the value of their `<option>`. */
export const FONT_PRESETS: Record<string, FontPreset> = {
  'chinese-official': CHINESE_OFFICIAL_DOC_FONTS,
};

/**
 * Whether most of the letters in `text` are Chinese characters, used to suggest
 * the Chinese preset. Kana means Japanese, which also uses Han characters, so
 * text with a meaningful share of kana does not count.
 */
export function isMostlyChinese(text: string): boolean {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const han = text.match(/\p{Script=Han}/gu)?.length ?? 0;
  const kana = text.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu)?.length ?? 0;

  return han >= 10 && han / letters >= 0.5 && kana < han / 10;
}
