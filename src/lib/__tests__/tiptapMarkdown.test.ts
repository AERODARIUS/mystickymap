import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import {
  convertPlainTextToMarkdown,
  createMarkdownManager,
  createRichTextExtensions,
  getDocVisibleLength,
  getDocVisibleText,
  parseStoredContentToDoc,
  serializeDocToMarkdown,
} from '../tiptapMarkdown';

describe('tiptapMarkdown integration', () => {
  it('round-trips note Markdown formatting cleanly (headings, bold, italic, lists, quotes, links)', () => {
    const manager = createMarkdownManager('note');
    const sourceMarkdown = [
      '## Spot Guide',
      '',
      'Welcome to **Spotheon** *Montevideo* with [map](https://spotheon.app).',
      '',
      '### Highlights',
      '',
      '- Coffee',
      '- Sunset',
      '',
      '1. Arrive early',
      '2. Bring camera',
      '',
      '> Enjoy the view',
    ].join('\n');

    const doc = parseStoredContentToDoc(sourceMarkdown, 'markdown', 'note', manager);
    const reserialized = serializeDocToMarkdown(doc, manager);
    const reloaded = parseStoredContentToDoc(reserialized, 'markdown', 'note', manager);

    expect(reloaded.content?.map((n) => n.type)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'bulletList',
      'orderedList',
      'blockquote',
    ]);
    expect(reserialized).toContain('## Spot Guide');
    expect(reserialized).toContain('**Spotheon**');
    expect(reserialized).toContain('*Montevideo*');
    expect(reserialized).toContain('[map](https://spotheon.app)');
    expect(reserialized).toContain('### Highlights');
    expect(reserialized).toContain('> Enjoy the view');
  });

  it('preserves plain-text special characters literally without interpreting them as Markdown', () => {
    const legacyPlain = '# Not a heading\n- Not a list\n*Not italic* _neither_ > not quote';
    const doc = parseStoredContentToDoc(legacyPlain, 'plain', 'note');
    const manager = createMarkdownManager('note');
    const serialized = serializeDocToMarkdown(doc, manager);

    // Reloading the serialized Markdown must yield only paragraph text, never headings/lists/italic
    const reloaded = parseStoredContentToDoc(serialized, 'markdown', 'note', manager);
    expect(reloaded.content).toHaveLength(1);
    expect(reloaded.content?.[0].type).toBe('paragraph');

    const editor = new Editor({
      extensions: createRichTextExtensions('note'),
      content: reloaded,
    });
    expect(getDocVisibleText(editor.state.doc)).toBe(legacyPlain);
    editor.destroy();

    // Helper converts legacy plain text safely too
    const converted = convertPlainTextToMarkdown('Price *5* & #1', 'note');
    const convertedDoc = parseStoredContentToDoc(converted, 'markdown', 'note', manager);
    expect(convertedDoc.content?.[0].content?.[0]).toMatchObject({
      type: 'text',
      text: 'Price *5* & #1',
    });
  });

  it('restricts comment mode from headings, lists, blockquotes, images, and code blocks', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions('comment', { maxVisibleLength: 500 }),
      content: '',
    });

    const complexInput = [
      '## Big Heading',
      '',
      '- bullet item',
      '',
      '> quote text',
      '',
      '![pic](https://evil.com/a.png)',
      '',
      'Keep **bold** and *italic* and [safe](https://spotheon.app).',
    ].join('\n');

    const doc = parseStoredContentToDoc(complexInput, 'markdown', 'comment', editor.markdown);
    editor.commands.setContent(doc);

    const json = editor.getJSON();
    const blockTypes = (json.content || []).map((n) => n.type);
    expect(blockTypes).not.toContain('heading');
    expect(blockTypes).not.toContain('bulletList');
    expect(blockTypes).not.toContain('orderedList');
    expect(blockTypes).not.toContain('blockquote');
    expect(blockTypes).not.toContain('image');
    expect(blockTypes).not.toContain('codeBlock');

    const serialized = serializeDocToMarkdown(json, editor.markdown!);
    expect(serialized).toContain('**bold**');
    expect(serialized).toContain('*italic*');
    expect(serialized).toContain('[safe](https://spotheon.app)');
    editor.destroy();
  });

  it('counts visible characters excluding Markdown syntax and enforces visible limit', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions('note', { maxVisibleLength: 10 }),
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Hello',
                marks: [
                  { type: 'bold' },
                  { type: 'link', attrs: { href: 'https://spotheon.app/very/long/url/path' } },
                ],
              },
            ],
          },
        ],
      },
    });

    // Serialized Markdown is > 50 chars, but visible text "Hello" is 5 chars
    const md = serializeDocToMarkdown(editor.getJSON(), editor.markdown!);
    expect(md.length).toBeGreaterThan(40);
    expect(getDocVisibleLength(editor.state.doc)).toBe(5);

    // Adding 5 more visible chars succeeds (total 10)
    editor.commands.insertContent('World');
    expect(getDocVisibleLength(editor.state.doc)).toBe(10);

    // Adding an 11th visible char is blocked by visibleCharacterLimit plugin
    editor.commands.insertContent('!');
    expect(getDocVisibleLength(editor.state.doc)).toBe(10);
    editor.destroy();
  });

  it('strips unsafe javascript: links when parsing untrusted content', () => {
    const editor = new Editor({
      extensions: createRichTextExtensions('note'),
      content: '',
    });

    const parsed = parseStoredContentToDoc(
      '[bad link](javascript:alert(1)) and [good](https://spotheon.app)',
      'markdown',
      'note',
      editor.markdown
    );
    editor.commands.setContent(parsed);

    const serialized = serializeDocToMarkdown(editor.getJSON(), editor.markdown!);
    expect(serialized).not.toContain('javascript:');
    expect(serialized).toContain('[good](https://spotheon.app)');
    editor.destroy();
  });

  it('normalizes pasted rich HTML in note and comment modes without losing text', () => {
    const pastedHtml =
      '<h1>Main</h1><h2>Sub</h2><p><strong>Bold</strong> <del>Strike</del> <img src="x" onerror="alert(1)" /> <a href="javascript:alert(1)">Unsafe</a> <a href="https://spotheon.app">Safe</a></p>';

    const noteEditor = new Editor({
      extensions: createRichTextExtensions('note'),
      content: '',
    });
    noteEditor.commands.setContent(pastedHtml);
    const noteMd = serializeDocToMarkdown(noteEditor.getJSON(), noteEditor.markdown!);
    expect(noteMd).toContain('Main');
    expect(noteMd).toContain('## Sub');
    expect(noteMd).toContain('**Bold**');
    expect(noteMd).toContain('Strike');
    expect(noteMd).toContain('Unsafe');
    expect(noteMd).not.toContain('javascript:');
    expect(noteMd).not.toContain('<img');
    expect(noteMd).toContain('[Safe](https://spotheon.app)');
    noteEditor.destroy();

    const commentEditor = new Editor({
      extensions: createRichTextExtensions('comment'),
      content: '',
    });
    commentEditor.commands.setContent(pastedHtml);
    const commentMd = serializeDocToMarkdown(commentEditor.getJSON(), commentEditor.markdown!);
    expect(commentMd).not.toContain('##');
    expect(commentMd).toContain('Main');
    expect(commentMd).toContain('Sub');
    expect(commentMd).toContain('**Bold**');
    expect(commentMd).not.toContain('javascript:');
    expect(commentMd).toContain('[Safe](https://spotheon.app)');
    commentEditor.destroy();
  });
});
