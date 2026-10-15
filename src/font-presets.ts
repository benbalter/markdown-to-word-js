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
  /** Font size in points; Chinese sizes map to 二号 = 22, 三号 = 16. */
  sizePt: number;
  bold: boolean;
}

/** Word 行距规则。预设目前只需要单倍。 */
export type LineSpacing = 'single';

export interface ParagraphStyle {
  /** 段前/段后间距 in points. */
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

/** 二号 */
const SIZE_ER = 22;
/** 三号 */
const SIZE_SAN = 16;

/**
 * Fonts and sizes for Chinese official documents (公文): 正文仿宋三号,
 * 一级标题方正小标宋简体二号, 二级标题黑体三号, 三级标题楷体三号,
 * 四级及以下标题为加粗仿宋三号. 各级均为段前段后 0 行、单倍行距.
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
