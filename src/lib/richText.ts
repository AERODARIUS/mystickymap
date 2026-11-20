import type { JSONContent } from '@tiptap/core';
import type { ContentFormat } from '../types';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Counts user-visible characters (grapheme clusters) accurately for Unicode,
 * emojis (including ZWJ sequences and flags), and accented characters.
 */
export function countVisibleCharacters(text: string): number {
  if (!text) return 0;

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    let count = 0;
    for (const segment of segmenter.segment(text)) {
      if (segment.segment) count += 1;
    }
    return count;
  }

  return Array.from(text).length;
}

/**
 * Truncates text to a maximum number of visible grapheme clusters without
 * splitting surrogate pairs or multi-codepoint emojis.
 */
export function truncateVisibleCharacters(text: string, maxLength: number): string {
  if (!text || maxLength <= 0) return '';

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    let result = '';
    let count = 0;
    for (const { segment } of segmenter.segment(text)) {
      if (count >= maxLength) break;
      result += segment;
      count += 1;
    }
    return result;
  }

  return Array.from(text).slice(0, maxLength).join('');
}

/**
 * Strips ASCII control characters and whitespace for safe protocol inspection.
 */
function stripControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

/**
 * Validates whether a URL uses an allowed, safe protocol (`http:`, `https:`, `mailto:`).
 */
export function isSafeUrl(rawUrl: string): boolean {
  return sanitizeLinkUrl(rawUrl) !== null;
}

/**
 * Returns a sanitized URL if its protocol is explicitly allowed, or null otherwise.
 * Blocks `javascript:`, `data:`, `vbscript:`, `file:`, protocol-relative URLs, etc.
 */
export function sanitizeLinkUrl(rawUrl: string): string | null {
  if (typeof rawUrl !== 'string') return null;
  const cleaned = stripControlChars(rawUrl);
  if (!cleaned) return null;

  // Reject protocol-relative URLs or whitespace-obfuscated schemes
  if (cleaned.startsWith('//')) return null;

  try {
    const parsed = new URL(cleaned);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
      return null;
    }
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.hostname) {
      return null;
    }
    return cleaned;
  } catch {
    return null;
  }
}

/**
 * Normalizes user-entered URLs in the link editor (e.g. prepending `https://` when
 * the user enters a bare domain like `spotheon.app`) and validates safety.
 */
export function normalizeLinkInput(rawInput: string): string | null {
  if (typeof rawInput !== 'string') return null;
  const cleaned = stripControlChars(rawInput);
  if (!cleaned) return null;

  // If the input already specifies a scheme (e.g. `javascript:`, `mailto:`, `https:`)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(cleaned)) {
    return sanitizeLinkUrl(cleaned);
  }

  // Reject bare protocol-relative or whitespace-containing inputs
  if (cleaned.startsWith('//') || /\s/.test(cleaned)) {
    return null;
  }

  // Require at least a domain-like structure (e.g., example.com) when no scheme is provided
  if (!cleaned.includes('.') && !cleaned.startsWith('localhost')) {
    return null;
  }

  return sanitizeLinkUrl(`https://${cleaned}`);
}

/**
 * Escapes leading Markdown block-level prefixes inside a serialized paragraph line
 * so literal plain-text lines like `# hashtag`, `- item`, `1. step`, or `> quote`
 * are never accidentally re-interpreted as headings, lists, or blockquotes on reload.
 */
export function escapeBlockPrefixesInParagraphLine(line: string): string {
  if (!line) return line;
  let result = line;
  // ATX headings: `# `, `## `, etc.
  result = result.replace(/^([ ]{0,3})(#{1,6})(?=\s|$)/, '$1\\$2');
  // Unordered list markers: `- `, `+ ` (`*` is already escaped by MarkdownManager)
  result = result.replace(/^([ ]{0,3})([-+])(\s+)/, '$1\\$2$3');
  // Ordered list markers: `1. `, `2) `
  result = result.replace(/^([ ]{0,3})(\d{1,9})([.)])(\s+)/, '$1$2\\$3$4');
  // Blockquote marker: `> `
  result = result.replace(/^([ ]{0,3})>(\s|$)/, '$1\\>$2');
  return result;
}

/**
 * Converts legacy plain-text content into a literal Tiptap JSON document without
 * interpreting characters like `*`, `_`, `#`, `>`, or `[text](url)` as Markdown.
 */
export function plainTextToTiptapDoc(plainText: string): JSONContent {
  if (!plainText) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    };
  }

  const normalized = plainText.replace(/\r\n?/g, '\n');
  const paragraphBlocks = normalized.split('\n\n');

  const paragraphs: JSONContent[] = paragraphBlocks.map((block) => {
    if (block === '') {
      return { type: 'paragraph' };
    }

    const lines = block.split('\n');
    const inlineContent: JSONContent[] = [];

    lines.forEach((line, idx) => {
      if (line.length > 0) {
        inlineContent.push({
          type: 'text',
          text: line,
        });
      }
      if (idx < lines.length - 1) {
        inlineContent.push({ type: 'hardBreak' });
      }
    });

    return inlineContent.length > 0
      ? { type: 'paragraph', content: inlineContent }
      : { type: 'paragraph' };
  });

  return {
    type: 'doc',
    content: paragraphs.length > 0 ? paragraphs : [{ type: 'paragraph' }],
  };
}

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Converts stored content (plain or Markdown) into readable plain text.
 * Suitable for Text-to-Speech (without pronouncing Markdown syntax), search indexing,
 * and compact plain-text previews.
 */
export function markdownToPlainText(content: string, contentFormat?: ContentFormat): string {
  if (!content) return '';
  if (contentFormat !== 'markdown') {
    return content;
  }

  // Temporarily mask backslash-escaped ASCII punctuation so literal `*`, `#`, etc.
  // are preserved instead of treated as Markdown delimiters.
  const escapedChars: string[] = [];
  let text = content.replace(/\r\n?/g, '\n').replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, (_m, ch: string) => {
    const idx = escapedChars.length;
    escapedChars.push(ch);
    return `\uE000ESC${idx}\uE001`;
  });

  // Strip trailing two-space hard-break markers
  text = text.replace(/ {2,}\n/g, '\n');

  // Convert Markdown links `[label](url "title")` -> `label` (and images `![alt](url)` -> `alt`)
  text = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');

  // Strip block-level prefixes line by line
  text = text
    .split('\n')
    .map((line) => {
      let l = line;
      // Headings: ## Title -> Title
      l = l.replace(/^\s{0,3}#{1,6}\s+/, '');
      // Blockquotes: > Quote -> Quote (possibly nested)
      l = l.replace(/^(\s{0,3}>\s?)+/, '');
      // Unordered lists: - item / * item / + item -> item
      l = l.replace(/^\s{0,3}[-+*]\s+/, '');
      // Ordered lists: 1. item -> item
      l = l.replace(/^\s{0,3}\d{1,9}[.)]\s+/, '');
      return l;
    })
    .join('\n');

  // Strip inline emphasis/strong/code/strikethrough delimiters cleanly
  // Bold + Italic (***text*** or ___text___)
  text = text.replace(/\*\*\*([\s\S]+?)\*\*\*/g, '$1');
  text = text.replace(/___([\s\S]+?)___/g, '$1');
  // Bold (**text** or __text__)
  text = text.replace(/\*\*([\s\S]+?)\*\*/g, '$1');
  text = text.replace(/__([\s\S]+?)__/g, '$1');
  // Italic (*text* or _text_)
  text = text.replace(/(^|[^\w*])\*([^*\n]+?)\*(?!\*)/g, '$1$2');
  text = text.replace(/(^|[^\w_])_([^_\n]+?)_(?!_)/g, '$1$2');
  // Inline code (`code`)
  text = text.replace(/`([^`]+)`/g, '$1');

  // Restore escaped literal characters
  text = text.replace(/\uE000ESC(\d+)\uE001/g, (_m, idxStr: string) => {
    return escapedChars[Number(idxStr)] ?? '';
  });

  // Decode entities emitted by Tiptap Markdown serializer (e.g., &gt;, &lt;, &nbsp;)
  text = decodeBasicHtmlEntities(text);

  // Normalize excessive blank lines while preserving readable paragraph breaks
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}

/**
 * Extracts a single-line compact plain-text excerpt for constrained UI contexts
 * (e.g., admin tables, compact previews).
 */
export function getPlainTextExcerpt(
  content: string,
  contentFormat?: ContentFormat,
  maxChars = 160
): string {
  const plain = markdownToPlainText(content, contentFormat).replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  if (countVisibleCharacters(plain) <= maxChars) return plain;
  return `${truncateVisibleCharacters(plain, Math.max(1, maxChars - 1))}…`;
}

export interface ContentLimitValidation {
  valid: boolean;
  isEmpty: boolean;
  visibleLength: number;
  storageLength: number;
  exceedsVisible: boolean;
  exceedsStorage: boolean;
}

/**
 * Validates both user-visible character count and serialized Markdown storage length.
 */
export function validateContentLimits(
  visibleLength: number,
  serializedContent: string,
  maxVisibleLength: number,
  maxStorageLength: number
): ContentLimitValidation {
  const trimmed = serializedContent.trim();
  const isEmpty = visibleLength === 0 || trimmed.length === 0;
  const storageLength = trimmed.length;
  const exceedsVisible = visibleLength > maxVisibleLength;
  const exceedsStorage = storageLength > maxStorageLength;

  return {
    valid: !isEmpty && !exceedsVisible && !exceedsStorage,
    isEmpty,
    visibleLength,
    storageLength,
    exceedsVisible,
    exceedsStorage,
  };
}
