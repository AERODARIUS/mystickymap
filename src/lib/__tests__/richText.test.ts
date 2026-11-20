import { describe, expect, it } from 'vitest';
import {
  countVisibleCharacters,
  escapeBlockPrefixesInParagraphLine,
  getPlainTextExcerpt,
  isSafeUrl,
  markdownToPlainText,
  normalizeLinkInput,
  plainTextToTiptapDoc,
  sanitizeLinkUrl,
  truncateVisibleCharacters,
  validateContentLimits,
} from '../richText';
import { calculateRiskScore } from '../moderation';
import {
  MAX_COMMENT_LENGTH,
  MAX_COMMENT_STORAGE_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_NOTE_STORAGE_LENGTH,
} from '../../types';

describe('richText utilities', () => {
  it('counts visible grapheme clusters accurately for Unicode, emojis, and multiline text', () => {
    expect(countVisibleCharacters('')).toBe(0);
    expect(countVisibleCharacters('café')).toBe(4);
    // Single ZWJ family emoji and regional-indicator flag emoji each count as 1 visible grapheme
    expect(countVisibleCharacters('👨‍👩‍👧‍👦')).toBe(1);
    expect(countVisibleCharacters('🇺🇾🇦🇷')).toBe(2);
    expect(countVisibleCharacters('Hola\nMundo!')).toBe(11);
  });

  it('truncates visible characters without splitting multi-codepoint emojis', () => {
    const text = 'A👨‍👩‍👧‍👦B🇺🇾C';
    expect(truncateVisibleCharacters(text, 2)).toBe('A👨‍👩‍👧‍👦');
    expect(truncateVisibleCharacters(text, 4)).toBe('A👨‍👩‍👧‍👦B🇺🇾');
  });

  it('validates and sanitizes link URLs safely', () => {
    expect(isSafeUrl('https://spotheon.app/notes?id=1')).toBe(true);
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('mailto:hello@spotheon.app')).toBe(true);

    expect(sanitizeLinkUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeLinkUrl('JaVaScRiPt:alert(1)')).toBeNull();
    expect(sanitizeLinkUrl('  \u0000javascript:alert(1)')).toBeNull();
    expect(sanitizeLinkUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(sanitizeLinkUrl('vbscript:msgbox(1)')).toBeNull();
    expect(sanitizeLinkUrl('file:///etc/passwd')).toBeNull();
    expect(sanitizeLinkUrl('//evil.com/phish')).toBeNull();

    expect(normalizeLinkInput('spotheon.app/place')).toBe('https://spotheon.app/place');
    expect(normalizeLinkInput('javascript:alert(1)')).toBeNull();
    expect(normalizeLinkInput('not a valid url')).toBeNull();
  });

  it('escapes block-level Markdown prefixes in plain paragraph lines', () => {
    expect(escapeBlockPrefixesInParagraphLine('# Heading lookalike')).toBe('\\# Heading lookalike');
    expect(escapeBlockPrefixesInParagraphLine('## Subheading')).toBe('\\## Subheading');
    expect(escapeBlockPrefixesInParagraphLine('- bullet item')).toBe('\\- bullet item');
    expect(escapeBlockPrefixesInParagraphLine('1. numbered item')).toBe('1\\. numbered item');
    expect(escapeBlockPrefixesInParagraphLine('> quoted text')).toBe('\\> quoted text');
    expect(escapeBlockPrefixesInParagraphLine('Regular text #tag')).toBe('Regular text #tag');
  });

  it('builds literal Tiptap JSON from legacy plain text preserving line breaks', () => {
    const doc = plainTextToTiptapDoc('Line *one*\nLine #two\n\nSecond _para_');
    expect(doc.type).toBe('doc');
    expect(doc.content).toHaveLength(2);
    expect(doc.content?.[0].content).toEqual([
      { type: 'text', text: 'Line *one*' },
      { type: 'hardBreak' },
      { type: 'text', text: 'Line #two' },
    ]);
    expect(doc.content?.[1].content).toEqual([{ type: 'text', text: 'Second _para_' }]);
  });

  it('converts Markdown to readable plain text for TTS without pronouncing Markdown syntax', () => {
    const md = [
      '## Café Plaza',
      '',
      'Try the **espresso** and *croissant* at [La Molienda](https://example.com/cafe).',
      '',
      '- Open 8am',
      '- Great Wi-Fi',
      '',
      '> Best spot in town!',
      '',
      'Price: \\*10 and \\#1 choice.',
    ].join('\n');

    const plain = markdownToPlainText(md, 'markdown');
    expect(plain).not.toContain('**');
    expect(plain).not.toContain('##');
    expect(plain).not.toContain('https://example.com/cafe');
    expect(plain).toContain('Café Plaza');
    expect(plain).toContain('Try the espresso and croissant at La Molienda.');
    expect(plain).toContain('Open 8am');
    expect(plain).toContain('Best spot in town!');
    expect(plain).toContain('Price: *10 and #1 choice.');

    // Legacy plain text is returned verbatim
    const legacy = 'Use *asterisks* and #hashtags literally.';
    expect(markdownToPlainText(legacy, 'plain')).toBe(legacy);
    expect(markdownToPlainText(legacy, undefined)).toBe(legacy);
  });

  it('creates compact plain-text excerpts safely', () => {
    const md = '## Hello\n\nCheck **[this link](https://spotheon.app)** out 🚀🎉';
    expect(getPlainTextExcerpt(md, 'markdown', 200)).toBe('Hello Check this link out 🚀🎉');
    expect(getPlainTextExcerpt(md, 'markdown', 12)).toBe('Hello Check…');
  });

  it('validates visible length and storage length independently', () => {
    // 100 visible chars wrapped in verbose Markdown link syntax
    const shortVisible = 20;
    const okMarkdown = '[click](https://example.com/a/b/c) **text**';
    expect(
      validateContentLimits(shortVisible, okMarkdown, MAX_NOTE_LENGTH, MAX_NOTE_STORAGE_LENGTH)
    ).toMatchObject({ valid: true, exceedsVisible: false, exceedsStorage: false });

    // Exceeds visible limit (1000)
    expect(
      validateContentLimits(1001, 'a'.repeat(1001), MAX_NOTE_LENGTH, MAX_NOTE_STORAGE_LENGTH)
    ).toMatchObject({ valid: false, exceedsVisible: true, exceedsStorage: false });

    // Within visible limit (e.g. 500) but Markdown links push serialized string past storage limit (4000)
    const bloatedNote = 'x'.repeat(MAX_NOTE_STORAGE_LENGTH + 1);
    expect(
      validateContentLimits(500, bloatedNote, MAX_NOTE_LENGTH, MAX_NOTE_STORAGE_LENGTH)
    ).toMatchObject({ valid: false, exceedsVisible: false, exceedsStorage: true });

    // Comment storage limit (1500) vs visible limit (500)
    const bloatedComment = 'y'.repeat(MAX_COMMENT_STORAGE_LENGTH + 1);
    expect(
      validateContentLimits(100, bloatedComment, MAX_COMMENT_LENGTH, MAX_COMMENT_STORAGE_LENGTH)
    ).toMatchObject({ valid: false, exceedsVisible: false, exceedsStorage: true });
  });

  it('evaluates moderation risk scores against plain text extracted from Markdown', () => {
    const result = calculateRiskScore(
      '**[Click here for free crypto](https://spam.example)**',
      [],
      'markdown'
    );
    expect(result).toBeGreaterThanOrEqual(30);
  });
});
