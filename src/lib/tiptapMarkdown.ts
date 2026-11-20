import { Extension, type JSONContent, type AnyExtension } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { Markdown, MarkdownManager } from '@tiptap/markdown';
import type { ContentFormat } from '../types';
import {
  countVisibleCharacters,
  escapeBlockPrefixesInParagraphLine,
  isSafeUrl,
  plainTextToTiptapDoc,
  sanitizeLinkUrl,
  truncateVisibleCharacters,
} from './richText';

export type EditorMode = 'note' | 'comment';

/**
 * Extracts user-visible text from a ProseMirror/Tiptap document node using
 * single newlines between blocks so line breaks count consistently without
 * inflating the visible character counter with Markdown syntax.
 */
export function getDocVisibleText(doc: {
  textBetween: (from: number, to: number, blockSeparator?: string, leafText?: string) => string;
  content: { size: number };
}): string {
  return doc.textBetween(0, doc.content.size, '\n', '\n');
}

export function getDocVisibleLength(doc: {
  textBetween: (from: number, to: number, blockSeparator?: string, leafText?: string) => string;
  content: { size: number };
}): number {
  return countVisibleCharacters(getDocVisibleText(doc));
}

/**
 * ProseMirror plugin extension that enforces a visible character limit while
 * still allowing deletions when an existing document (e.g. imported note) starts
 * above the limit.
 */
export function createVisibleLimitExtension(maxVisibleLength: number) {
  return Extension.create({
    name: 'visibleCharacterLimit',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('visibleCharacterLimit'),
          filterTransaction: (transaction, state) => {
            if (!transaction.docChanged || maxVisibleLength <= 0) {
              return true;
            }
            const oldLen = getDocVisibleLength(state.doc);
            const newLen = getDocVisibleLength(transaction.doc);

            if (newLen <= maxVisibleLength) {
              return true;
            }

            // Allow deletions or reductions when already over limit
            if (oldLen > maxVisibleLength && newLen <= oldLen) {
              return true;
            }

            // If pasting over the limit, trim the inserted text at the cursor
            if (transaction.getMeta('paste')) {
              const excess = newLen - maxVisibleLength;
              const headPos = transaction.selection.$head.pos;
              const startPos = Math.max(0, headPos - excess);
              // Walk back safely if surrogate/grapheme split occurred
              if (startPos < headPos) {
                try {
                  const sliceText = transaction.doc.textBetween(startPos, headPos, '\n', '\n');
                  const targetGraphemes = Math.max(0, countVisibleCharacters(sliceText) - excess);
                  const kept = truncateVisibleCharacters(sliceText, targetGraphemes);
                  transaction.insertText(kept, startPos, headPos);
                  if (getDocVisibleLength(transaction.doc) <= maxVisibleLength) {
                    return true;
                  }
                } catch {
                  // Fall through to reject if range cannot be safely trimmed
                }
              }
            }

            return false;
          },
        }),
      ];
    },
  });
}

/**
 * Builds the shared Tiptap extension set for either `'note'` or `'comment'` mode.
 * Unsupported nodes/marks (images, tables, code blocks, strikethrough, underline,
 * horizontal rules, and in comment mode headings/lists/blockquotes) are disabled
 * so pasted or imported content is automatically normalized to safe nodes.
 */
export function createRichTextExtensions(
  mode: EditorMode,
  options?: { maxVisibleLength?: number; includeMarkdownExtension?: boolean }
): AnyExtension[] {
  const isNote = mode === 'note';

  const starterKit = StarterKit.configure({
    bold: {},
    italic: {},
    hardBreak: {},
    paragraph: {},
    undoRedo: {},
    heading: isNote ? { levels: [2, 3] } : false,
    bulletList: isNote ? {} : false,
    orderedList: isNote ? {} : false,
    listItem: isNote ? {} : false,
    listKeymap: isNote ? {} : false,
    blockquote: isNote ? {} : false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    dropcursor: isNote ? {} : false,
    gapcursor: isNote ? undefined : false,
    trailingNode: isNote ? undefined : false,
    link: {
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: 'https',
      protocols: ['http', 'https', 'mailto'],
      HTMLAttributes: {
        rel: 'noopener noreferrer nofollow',
        target: '_blank',
      },
      isAllowedUri: (url, ctx) => {
        if (!isSafeUrl(url)) return false;
        return ctx.defaultValidate(url);
      },
      shouldAutoLink: (url) => isSafeUrl(url),
    },
  });

  const extensions: AnyExtension[] = [starterKit];

  if (options?.includeMarkdownExtension !== false) {
    extensions.push(Markdown);
  }

  if (options?.maxVisibleLength && options.maxVisibleLength > 0) {
    extensions.push(createVisibleLimitExtension(options.maxVisibleLength));
  }

  return extensions;
}

/**
 * Creates a standalone MarkdownManager instance for parsing and serializing
 * note or comment content outside of a mounted React editor.
 */
export function createMarkdownManager(mode: EditorMode): MarkdownManager {
  return new MarkdownManager({
    extensions: createRichTextExtensions(mode, { includeMarkdownExtension: false }),
  });
}

function isEmptyParagraph(node?: JSONContent): boolean {
  return node?.type === 'paragraph' && (!node.content || node.content.length === 0);
}

/**
 * Serializes a Tiptap JSON document to Markdown while escaping block-level
 * prefixes inside literal paragraph nodes so plain-text characters like `# `,
 * `- `, `1. `, or `> ` never accidentally turn into headings/lists on reload.
 */
export function serializeDocToMarkdown(doc: JSONContent, manager: MarkdownManager): string {
  const blocks = Array.isArray(doc.content) ? doc.content : [];
  if (blocks.length === 0) return '';

  const renderedBlocks = blocks.map((block, index) => {
    const prevBlock = index > 0 ? blocks[index - 1] : undefined;

    if (block.type === 'paragraph') {
      if (isEmptyParagraph(block)) {
        return isEmptyParagraph(prevBlock) ? '&nbsp;' : '';
      }

      const singleDoc: JSONContent = { type: 'doc', content: [block] };
      const raw = manager.serialize(singleDoc);
      return raw
        .split('\n')
        .map((line) => escapeBlockPrefixesInParagraphLine(line))
        .join('\n');
    }

    const singleDoc: JSONContent = { type: 'doc', content: [block] };
    return manager.serialize(singleDoc);
  });

  const joined = renderedBlocks.join('\n\n');
  // If document has only empty paragraphs / whitespace, return empty string
  if (joined.replace(/&nbsp;/g, '').trim() === '') {
    return '';
  }

  return joined.replace(/\n+$/, '');
}

type MarkObject = NonNullable<JSONContent['marks']>[number];

function sanitizeMarks(marks: JSONContent['marks']): JSONContent['marks'] | undefined {
  if (!Array.isArray(marks) || marks.length === 0) return undefined;
  const safeMarks: MarkObject[] = [];

  for (const mark of marks) {
    if (mark.type === 'bold' || mark.type === 'italic') {
      safeMarks.push({ type: mark.type });
    } else if (mark.type === 'link') {
      const rawHref = typeof mark.attrs?.href === 'string' ? mark.attrs.href : '';
      const safeHref = sanitizeLinkUrl(rawHref);
      if (safeHref) {
        safeMarks.push({
          type: 'link',
          attrs: {
            href: safeHref,
            target: '_blank',
            rel: 'noopener noreferrer nofollow',
          },
        });
      }
    }
  }

  return safeMarks.length > 0 ? safeMarks : undefined;
}

function sanitizeInlineNodes(nodes: JSONContent[] | undefined): JSONContent[] {
  if (!Array.isArray(nodes)) return [];
  const result: JSONContent[] = [];

  for (const node of nodes) {
    if (node.type === 'text') {
      if (typeof node.text === 'string' && node.text.length > 0) {
        const marks = sanitizeMarks(node.marks);
        result.push(marks ? { type: 'text', text: node.text, marks } : { type: 'text', text: node.text });
      }
    } else if (node.type === 'hardBreak') {
      result.push({ type: 'hardBreak' });
    } else if (node.type === 'image') {
      // Strip embedded images completely
      continue;
    } else if (Array.isArray(node.content)) {
      result.push(...sanitizeInlineNodes(node.content));
    } else if (typeof node.text === 'string' && node.text.length > 0) {
      result.push({ type: 'text', text: node.text });
    }
  }

  return result;
}

function extractInlineAsParagraphs(node: JSONContent): JSONContent[] {
  if (node.type === 'paragraph') {
    const inline = sanitizeInlineNodes(node.content);
    return [inline.length > 0 ? { type: 'paragraph', content: inline } : { type: 'paragraph' }];
  }
  if (node.type === 'heading' || node.type === 'codeBlock') {
    const inline = sanitizeInlineNodes(node.content);
    return inline.length > 0 ? [{ type: 'paragraph', content: inline }] : [];
  }
  if (Array.isArray(node.content)) {
    const nested: JSONContent[] = [];
    for (const child of node.content) {
      nested.push(...extractInlineAsParagraphs(child));
    }
    return nested;
  }
  const inline = sanitizeInlineNodes([node]);
  return inline.length > 0 ? [{ type: 'paragraph', content: inline }] : [];
}

function sanitizeBlockNodes(nodes: JSONContent[] | undefined, mode: EditorMode): JSONContent[] {
  if (!Array.isArray(nodes)) return [];
  const isNote = mode === 'note';
  const result: JSONContent[] = [];

  for (const node of nodes) {
    if (node.type === 'paragraph') {
      const inline = sanitizeInlineNodes(node.content);
      result.push(inline.length > 0 ? { type: 'paragraph', content: inline } : { type: 'paragraph' });
    } else if (node.type === 'heading') {
      const inline = sanitizeInlineNodes(node.content);
      if (isNote) {
        const rawLevel = Number(node.attrs?.level);
        const level = rawLevel <= 2 ? 2 : 3;
        result.push(
          inline.length > 0
            ? { type: 'heading', attrs: { level }, content: inline }
            : { type: 'heading', attrs: { level } }
        );
      } else if (inline.length > 0) {
        result.push({ type: 'paragraph', content: inline });
      }
    } else if (node.type === 'blockquote') {
      const children = sanitizeBlockNodes(node.content, mode);
      if (isNote) {
        if (children.length > 0) {
          result.push({ type: 'blockquote', content: children });
        }
      } else {
        result.push(...children);
      }
    } else if (node.type === 'bulletList' || node.type === 'orderedList') {
      if (isNote) {
        const items: JSONContent[] = [];
        for (const item of node.content || []) {
          if (item.type === 'listItem') {
            const itemBlocks = sanitizeBlockNodes(item.content, mode);
            items.push({
              type: 'listItem',
              content: itemBlocks.length > 0 ? itemBlocks : [{ type: 'paragraph' }],
            });
          }
        }
        if (items.length > 0) {
          result.push({ type: node.type, content: items });
        }
      } else {
        for (const item of node.content || []) {
          result.push(...extractInlineAsParagraphs(item));
        }
      }
    } else if (node.type === 'image' || node.type === 'horizontalRule') {
      // Unsupported media / rule nodes are removed
      continue;
    } else if (node.type === 'text' || node.type === 'hardBreak') {
      const inline = sanitizeInlineNodes([node]);
      if (inline.length > 0) {
        result.push({ type: 'paragraph', content: inline });
      }
    } else {
      // Unsupported block nodes (e.g., codeBlock, table) normalize into safe paragraphs
      result.push(...extractInlineAsParagraphs(node));
    }
  }

  return result;
}

/**
 * Sanitizes a Tiptap JSON document so only mode-allowed nodes, bold/italic/link
 * marks, and safe URL protocols (`http:`, `https:`, `mailto:`) remain.
 */
export function sanitizeTiptapDoc(doc: JSONContent, mode: EditorMode): JSONContent {
  const blocks = sanitizeBlockNodes(doc.content, mode);
  return {
    type: 'doc',
    content: blocks.length > 0 ? blocks : [{ type: 'paragraph' }],
  };
}

let cachedNoteMarkdownManager: MarkdownManager | null = null;

function getNoteParserManager(): MarkdownManager {
  if (!cachedNoteMarkdownManager) {
    cachedNoteMarkdownManager = createMarkdownManager('note');
  }
  return cachedNoteMarkdownManager;
}

/**
 * Parses stored content into a Tiptap JSON document according to its format.
 * Legacy `'plain'` content is loaded strictly as literal text without Markdown
 * interpretation.
 */
export function parseStoredContentToDoc(
  content: string,
  contentFormat: ContentFormat,
  mode: EditorMode,
  manager?: MarkdownManager
): JSONContent {
  if (!content) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }

  if (contentFormat === 'plain') {
    return plainTextToTiptapDoc(content);
  }

  // Strip Markdown image syntax before parsing so unregistered image tokens never
  // disrupt MarkdownManager parsing, then parse with note grammar and normalize
  // to the target editor mode.
  const withoutImages = content.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  const parser = mode === 'comment' ? getNoteParserManager() : (manager ?? getNoteParserManager());
  const parsed = parser.parse(withoutImages);
  return sanitizeTiptapDoc(parsed, mode);
}

/**
 * Converts a legacy plain-text string to safe Markdown via Tiptap's serializer
 * so literal `*`, `_`, `#`, `>`, and `<script>` are preserved without formatting.
 */
export function convertPlainTextToMarkdown(plainText: string, mode: EditorMode): string {
  if (!plainText.trim()) return '';
  const manager = createMarkdownManager(mode);
  const doc = plainTextToTiptapDoc(plainText);
  return serializeDocToMarkdown(doc, manager);
}
