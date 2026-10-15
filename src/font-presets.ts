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
}

/** Word line spacing rule. The presets only need single spacing so far. */
export type LineSpacing = 'single';

export interface ParagraphStyle {
  /** Paragraph spacing before and after, in points. */
  beforePt: number;
  afterPt: number;
  lineSpacing: LineSpacing;
}

export interface FontPreset {
  body: LevelStyle;
  /** Six entries, applied to the `Heading1` - `Heading6` styles. */
  headings: LevelStyle[];
  /** Shared by the body text and every heading level. */
  paragraph: ParagraphStyle;
}

const LATIN_FONT = 'Times New Roman';
const BODY_FONT = '仿宋';

/** Chinese size 2 (二号). */
const SIZE_ER = 22;
/** Chinese size 3 (三号). */
const SIZE_SAN = 16;

/**
 * Fonts and sizes for Chinese official documents (公文):
 *
 * - Body: FangSong (仿宋), size 3
 * - Heading 1: FZXiaoBiaoSong (方正小标宋简体), size 2
 * - Heading 2: SimHei (黑体), size 3
 * - Heading 3: KaiTi (楷体), size 3
 * - Heading 4 and below: bold FangSong, size 3
 *
 * Every level uses Times New Roman for Latin text, no space before or after
 * paragraphs, and single line spacing.
 */
export const CHINESE_OFFICIAL_DOC_FONTS: FontPreset = {
  body: { latin: LATIN_FONT, eastAsia: BODY_FONT, sizePt: SIZE_SAN, bold: false },
  headings: [
    { latin: LATIN_FONT, eastAsia: '方正小标宋简体', sizePt: SIZE_ER, bold: false },
    { latin: LATIN_FONT, eastAsia: '黑体', sizePt: SIZE_SAN, bold: false },
    { latin: LATIN_FONT, eastAsia: '楷体', sizePt: SIZE_SAN, bold: false },
    { latin: LATIN_FONT, eastAsia: BODY_FONT, sizePt: SIZE_SAN, bold: true },
    { latin: LATIN_FONT, eastAsia: BODY_FONT, sizePt: SIZE_SAN, bold: true },
    { latin: LATIN_FONT, eastAsia: BODY_FONT, sizePt: SIZE_SAN, bold: true },
  ],
  paragraph: { beforePt: 0, afterPt: 0, lineSpacing: 'single' },
};
