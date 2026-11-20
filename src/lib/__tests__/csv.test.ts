import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import {
  autoMapHeaders,
  buildCsvTemplate,
  buildManifestCsv,
  parseCsv,
  validateAndPrepareNotes,
  type ImportDefaults,
} from '../csv';
import {
  createMarkdownManager,
  createRichTextExtensions,
  getDocVisibleText,
  parseStoredContentToDoc,
  serializeDocToMarkdown,
} from '../tiptapMarkdown';
import { MAX_NOTE_LENGTH, MAX_NOTE_STORAGE_LENGTH, type Note } from '../../types';

const mockTimestamp = null as unknown as Note['createdAt'];

const baseDefaults: ImportDefaults = {
  contentFormat: 'plain',
  type: 'text',
  privacy: 'public',
  color: '#0d9488',
  emoji: '📍',
  language: 'es-ES',
  authorName: 'Admin',
  maxContentLength: 2000,
  skipDuplicates: true,
  batchSize: 20,
};

describe('CSV Importer rich-text parsing, validation, and payload generation', () => {
  it('keeps legacy CSV files without contentFormat working as plain text without inferring Markdown', () => {
    const legacyCsv = [
      'id,content,lat,lng,type,privacy,color,emoji,language,authorName,updatedAt',
      'legacy_1,"# Hashtag *literal* - no es lista",-34.907851,-56.201122,text,public,#0d9488,📍,es-ES,Admin,2026-11-13T12:00:11Z',
    ].join('\n');

    const parsed = parseCsv(legacyCsv);
    const mapping = autoMapHeaders(parsed.headers);
    expect(mapping.contentFormat).toBe('');

    const result = validateAndPrepareNotes(
      parsed.rows,
      parsed.headers,
      mapping,
      baseDefaults,
      [],
      'admin-uid'
    );

    expect(result.validCount).toBe(1);
    expect(result.errorCount).toBe(0);
    const row = result.rows[0];
    expect(row.contentFormat).toBe('plain');
    expect(row.payload?.contentFormat).toBe('plain');
    expect(row.payload?.content).toBe('# Hashtag *literal* - no es lista');

    // Loading legacy plain note into Tiptap keeps literal characters
    const doc = parseStoredContentToDoc(row.payload!.content, row.payload!.contentFormat, 'note');
    expect(doc.content).toHaveLength(1);
    expect(doc.content?.[0].type).toBe('paragraph');
  });

  it('supports mixed plain and markdown rows and case-insensitive contentFormat normalization', () => {
    const csv = [
      'id,content,contentFormat,lat,lng',
      'row_plain,"Texto *literal*",PLAIN,-34.90,-56.20',
      'row_md,"## Teatro Solís\n\n**Montevideo**",  MaRkDoWn ,-34.91,-56.21',
      'row_default,"Sin formato explícito",,-34.92,-56.22',
    ].join('\n');

    const parsed = parseCsv(csv);
    const mapping = autoMapHeaders(parsed.headers);
    const result = validateAndPrepareNotes(
      parsed.rows,
      parsed.headers,
      mapping,
      baseDefaults,
      [],
      'admin-uid'
    );

    expect(result.validCount).toBe(3);
    expect(result.rows[0].payload?.contentFormat).toBe('plain');
    expect(result.rows[1].payload?.contentFormat).toBe('markdown');
    expect(result.rows[2].payload?.contentFormat).toBe('plain');
  });

  it('recognizes CSV header aliases for contentFormat (content_format, format, formato)', () => {
    for (const alias of ['contentFormat', 'content_format', 'format', 'formato']) {
      const csv = `id,content,${alias},lat,lng\nn1,"**Hola**",markdown,-34.9,-56.2`;
      const parsed = parseCsv(csv);
      const mapping = autoMapHeaders(parsed.headers);
      expect(mapping.contentFormat).toBe(alias);

      const res = validateAndPrepareNotes(
        parsed.rows,
        parsed.headers,
        mapping,
        baseDefaults,
        [],
        'admin-uid'
      );
      expect(res.validCount).toBe(1);
      expect(res.rows[0].payload?.contentFormat).toBe('markdown');
    }
  });

  it('rejects unsupported contentFormat values with clear errors rather than treating as plain', () => {
    const csv = [
      'id,content,contentFormat,lat,lng',
      'bad_fmt_1,"<b>Hola</b>",html,-34.9,-56.2',
      'bad_fmt_2,"**Hola**",md,-34.91,-56.21',
    ].join('\n');

    const parsed = parseCsv(csv);
    const mapping = autoMapHeaders(parsed.headers);
    const result = validateAndPrepareNotes(
      parsed.rows,
      parsed.headers,
      mapping,
      baseDefaults,
      [],
      'admin-uid'
    );

    expect(result.validCount).toBe(0);
    expect(result.errorCount).toBe(2);
    expect(result.rows[0].errors[0]).toContain('contentFormat inválido "html"');
    expect(result.rows[1].errors[0]).toContain('contentFormat inválido "md"');
  });

  it('handles multiline Markdown, embedded commas, escaped quotes (""), CRLF, Unicode, and emojis', () => {
    const csv =
      'id,content,contentFormat,lat,lng,emoji\r\n' +
      'mvd_solis,"## Teatro Solís, ""El Coliseo"" 🎭\r\n\r\n' +
      'Uno de los teatros más importantes de **Montevideo** 👨‍👩‍👧‍👦🇺🇾.\r\n\r\n' +
      '- Visitas guiadas, horarios\r\n' +
      '- Arquitectura histórica\r\n\r\n' +
      '> ""Cultura abierta""\r\n\r\n' +
      '[Más información](https://www.teatrosolis.org.uy/)",markdown,-34.907851,-56.201122,🎭\r\n';

    const parsed = parseCsv(csv);
    const mapping = autoMapHeaders(parsed.headers);
    const result = validateAndPrepareNotes(
      parsed.rows,
      parsed.headers,
      mapping,
      baseDefaults,
      [],
      'admin-uid'
    );

    expect(result.validCount).toBe(1);
    expect(result.errorCount).toBe(0);
    const payload = result.rows[0].payload!;
    expect(payload.contentFormat).toBe('markdown');
    expect(payload.emoji).toBe('🎭');
    expect(payload.content).toContain('## Teatro Solís, "El Coliseo" 🎭');
    expect(payload.content).toContain('👨‍👩‍👧‍👦🇺🇾');
    expect(payload.content).toContain('- Visitas guiadas, horarios');
    expect(payload.content).toContain('> "Cultura abierta"');
    expect(payload.content).not.toContain('\r');
    expect(payload.content).toContain('[Más información](https://www.teatrosolis.org.uy/)');
  });

  it('preserves meaningful Markdown indentation/whitespace, keeps literal \\n sequences untouched, and rejects whitespace-only content', () => {
    const csv = [
      'id,content,contentFormat,lat,lng',
      'ws_indent,"  - Nivel 1\n    - Subnivel 2\n\nLínea 1  \nLínea 2 con \\n literal",markdown,-34.9,-56.2',
      'ws_empty,"   \n\t  ",markdown,-34.91,-56.21',
    ].join('\n');

    const parsed = parseCsv(csv);
    const mapping = autoMapHeaders(parsed.headers);
    const result = validateAndPrepareNotes(
      parsed.rows,
      parsed.headers,
      mapping,
      baseDefaults,
      [],
      'admin-uid'
    );

    expect(result.rows[0].status).toBe('valid');
    expect(result.rows[0].payload?.content.startsWith('  - Nivel 1\n    - Subnivel 2')).toBe(true);
    expect(result.rows[0].payload?.content).toContain('Línea 1  \nLínea 2');
    expect(result.rows[0].payload?.content).toContain('\\n literal');

    expect(result.rows[1].status).toBe('error');
    expect(result.rows[1].errors[0]).toContain('vacío');
  });

  it('validates visible length (<= 1000) and serialized length independently using Tiptap/ProseMirror', () => {
    // 20 visible characters, but > 1100 serialized characters via Markdown links
    const longUrl = `https://example.com/${'path/'.repeat(230)}`;
    const linkHeavyMarkdown = `[Visitar sitio oficial](${longUrl})`;
    expect(linkHeavyMarkdown.length).toBeGreaterThan(1000);
    expect(linkHeavyMarkdown.length).toBeLessThan(2000);

    // 1001 visible characters (even with maxContentLength: 2000 or 4000, must be rejected!)
    const overVisibleMarkdown = `**${'a'.repeat(1001)}**`;

    const csv = [
      'id,content,contentFormat,lat,lng',
      `ok_links,"${linkHeavyMarkdown}",markdown,-34.90,-56.20`,
      `too_many_visible,"${overVisibleMarkdown}",markdown,-34.91,-56.21`,
    ].join('\n');

    const parsed = parseCsv(csv);
    const mapping = autoMapHeaders(parsed.headers);

    // With maxContentLength = 2000: linkHeavyMarkdown passes (21 visible <= 1000, ~1180 stored <= 2000)
    const res2000 = validateAndPrepareNotes(
      parsed.rows,
      parsed.headers,
      mapping,
      { ...baseDefaults, maxContentLength: 2000 },
      [],
      'admin-uid'
    );
    expect(res2000.rows[0].status).toBe('valid');
    expect(res2000.rows[0].visibleLength).toBe(21);
    expect(res2000.rows[0].storageLength).toBe(linkHeavyMarkdown.length);

    // overVisibleMarkdown MUST fail even when maxContentLength is 2000 or 4000
    expect(res2000.rows[1].status).toBe('error');
    expect(res2000.rows[1].errors.some((e) => e.includes('texto visible'))).toBe(true);

    // With maxContentLength = 1000: linkHeavyMarkdown fails serialized limit
    const res1000 = validateAndPrepareNotes(
      parsed.rows,
      parsed.headers,
      mapping,
      { ...baseDefaults, maxContentLength: 1000 },
      [],
      'admin-uid'
    );
    expect(res1000.rows[0].status).toBe('error');
    expect(res1000.rows[0].errors.some((e) => e.includes('serializado'))).toBe(true);

    // Exceeding MAX_NOTE_STORAGE_LENGTH (4000) must fail regardless of defaults
    const hugeUrl = `https://example.com/${'x'.repeat(4000)}`;
    const hugeCsv = `id,content,contentFormat,lat,lng\nhuge,"[Ver](${hugeUrl})",markdown,-34.9,-56.2`;
    const hugeParsed = parseCsv(hugeCsv);
    const hugeRes = validateAndPrepareNotes(
      hugeParsed.rows,
      hugeParsed.headers,
      autoMapHeaders(hugeParsed.headers),
      { ...baseDefaults, maxContentLength: 4000 },
      [],
      'admin-uid'
    );
    expect(hugeRes.rows[0].status).toBe('error');
    expect(hugeRes.rows[0].errors.some((e) => e.includes(String(MAX_NOTE_STORAGE_LENGTH)))).toBe(true);
  });

  it('rejects unsafe URLs, raw HTML, and embedded images while warning on unsupported safe Markdown without blocking valid rows', () => {
    const csv = [
      'id,content,contentFormat,lat,lng',
      'xss_js,"[Click](javascript:alert(1))",markdown,-34.90,-56.20',
      'xss_data,"[Data](data:text/html,<script>alert(1)</script>)",markdown,-34.91,-56.21',
      'raw_html,"Texto <script>alert(1)</script>",markdown,-34.92,-56.22',
      'raw_img_html,"<img src=""x"" onerror=""alert(1)"" />",markdown,-34.93,-56.23',
      'md_image,"Hola ![evil](https://evil.com/p.png)",markdown,-34.94,-56.24',
      'unsupported_h1,"# Título H1\n\nCon ~~tachado~~ y `código`.",markdown,-34.95,-56.25',
      'clean_md,"## Título H2\n\nTexto **válido**",markdown,-34.96,-56.26',
    ].join('\n');

    const parsed = parseCsv(csv);
    const mapping = autoMapHeaders(parsed.headers);
    const result = validateAndPrepareNotes(
      parsed.rows,
      parsed.headers,
      mapping,
      baseDefaults,
      [],
      'admin-uid'
    );

    expect(result.rows[0].status).toBe('error');
    expect(result.rows[1].status).toBe('error');
    expect(result.rows[2].status).toBe('error');
    expect(result.rows[3].status).toBe('error');
    expect(result.rows[4].status).toBe('error');

    // Unsupported formatting row warns clearly
    expect(result.rows[5].status).toBe('valid');
    expect(result.rows[5].warnings.length).toBeGreaterThan(0);
    expect(result.rows[5].warnings[0]).toContain('no soportado');

    // Valid row remains unaffected
    expect(result.rows[6].status).toBe('valid');
    expect(result.validCount).toBe(2);
    expect(result.errorCount).toBe(5);
  });

  it('maintains formatting consistency when imported Markdown notes are opened, edited, and re-serialized in Tiptap', () => {
    const csv = [
      'id,content,contentFormat,lat,lng',
      'edit_rt,"## Teatro Solís\n\n**Montevideo** y *Uruguay*.\n\n- Sala principal\n- Visitas\n\n> Imperdible\n\n[Web](https://www.teatrosolis.org.uy/)",markdown,-34.907851,-56.201122',
    ].join('\n');

    const parsed = parseCsv(csv);
    const res = validateAndPrepareNotes(
      parsed.rows,
      parsed.headers,
      autoMapHeaders(parsed.headers),
      baseDefaults,
      [],
      'admin-uid'
    );
    const imported = res.rows[0].payload!;

    const manager = createMarkdownManager('note');
    const editor = new Editor({
      extensions: createRichTextExtensions('note', { maxVisibleLength: MAX_NOTE_LENGTH }),
      content: parseStoredContentToDoc(imported.content, imported.contentFormat, 'note', manager),
    });

    // Modify content in editor by adding a new paragraph at the end
    editor.chain().focus('end').splitBlock().insertContent('Abierto hoy').run();
    const savedMarkdown = serializeDocToMarkdown(editor.getJSON(), editor.markdown!);
    const visibleText = getDocVisibleText(editor.state.doc);
    editor.destroy();

    expect(visibleText).toContain('Abierto hoy');
    expect(savedMarkdown).toContain('## Teatro Solís');
    expect(savedMarkdown).toContain('**Montevideo**');
    expect(savedMarkdown).toContain('*Uruguay*');
    expect(savedMarkdown).toContain('- Sala principal');
    expect(savedMarkdown).toContain('> Imperdible');
    expect(savedMarkdown).toContain('[Web](https://www.teatrosolis.org.uy/)');
  });

  it('handles exact duplicates vs formatting-only ambiguous duplicates safely', () => {
    const existingNotes: Note[] = [
      {
        id: 'existing_plain',
        type: 'text',
        content: 'Teatro Solís',
        contentFormat: 'plain',
        location: { lat: -34.907851, lng: -56.201122 },
        authorId: 'u1',
        authorName: 'Admin',
        privacy: 'public',
        createdAt: mockTimestamp,
      },
      {
        id: 'existing_md',
        type: 'text',
        content: '## Sala Zitarrosa\n\n**Centro**',
        contentFormat: 'markdown',
        location: { lat: -34.906123, lng: -56.193456 },
        authorId: 'u1',
        authorName: 'Admin',
        privacy: 'public',
        createdAt: mockTimestamp,
      },
    ];

    const csv = [
      'id,content,contentFormat,lat,lng',
      // 1. Exact ID duplicate -> skipped as duplicate
      'existing_plain,"Otro texto",plain,-34.91,-56.21',
      // 2. Exact plain match (location + content + plain) -> skipped as duplicate
      'new_1,"Teatro Solís",plain,-34.907851,-56.201122',
      // 3. Exact markdown match (location + content + markdown) -> skipped as duplicate
      'new_2,"## Sala Zitarrosa\n\n**Centro**",markdown,-34.906123,-56.193456',
      // 4. Formatting-only difference at same location ("Teatro Solís" plain vs "## **Teatro Solís**" markdown) -> NOT discarded, shows warning!
      'new_3,"## **Teatro Solís**",markdown,-34.907851,-56.201122',
    ].join('\n');

    const parsed = parseCsv(csv);
    const res = validateAndPrepareNotes(
      parsed.rows,
      parsed.headers,
      autoMapHeaders(parsed.headers),
      baseDefaults,
      existingNotes,
      'admin-uid'
    );

    expect(res.rows[0].status).toBe('duplicate');
    expect(res.rows[1].status).toBe('duplicate');
    expect(res.rows[2].status).toBe('duplicate');
    expect(res.rows[3].status).toBe('valid');
    expect(res.rows[3].payload?.contentFormat).toBe('markdown');
    expect(res.rows[3].warnings.some((w) => w.includes('distinto formato'))).toBe(true);
  });

  it('produces valid Firestore payloads and round-trips buildCsvTemplate() cleanly', () => {
    const template = buildCsvTemplate();
    const parsed = parseCsv(template);
    const mapping = autoMapHeaders(parsed.headers);

    expect(parsed.headers).toEqual([
      'id',
      'content',
      'contentFormat',
      'lat',
      'lng',
      'type',
      'privacy',
      'color',
      'emoji',
      'language',
      'authorName',
      'updatedAt',
    ]);
    expect(mapping.contentFormat).toBe('contentFormat');

    const res = validateAndPrepareNotes(
      parsed.rows,
      parsed.headers,
      mapping,
      baseDefaults,
      [],
      'admin-uid-123'
    );

    expect(res.rows).toHaveLength(3);
    expect(res.validCount).toBe(3);
    expect(res.errorCount).toBe(0);
    expect(res.rows[0].payload?.contentFormat).toBe('plain');
    expect(res.rows[1].payload?.contentFormat).toBe('markdown');
    expect(res.rows[2].payload?.contentFormat).toBe('markdown');

    // Verify Firestore document keys satisfy isValidNote() allowlist & count <= 14
    const allowedFirestoreKeys = new Set([
      'type',
      'location',
      'authorId',
      'createdAt',
      'authorName',
      'content',
      'contentFormat',
      'privacy',
      'audioUrl',
      'updatedAt',
      'color',
      'emoji',
      'language',
      'moderationState',
    ]);
    for (const row of res.rows) {
      const { customUpdatedAt, ...rest } = row.payload!;
      const docKeys = Object.keys({
        ...rest,
        createdAt: 'serverTimestamp',
        updatedAt: customUpdatedAt ?? 'serverTimestamp',
      });
      expect(docKeys.length).toBeLessThanOrEqual(14);
      docKeys.forEach((k) => expect(allowedFirestoreKeys.has(k)).toBe(true));
    }

    const manifestCsv = buildManifestCsv([
      {
        rowIndex: 1,
        sourceId: 'mvd_accesible_solis',
        firestoreNoteId: 'mvd_accesible_solis',
        batchNumber: 1,
        contentFormat: 'markdown',
        lat: -34.907851,
        lng: -56.201122,
        privacy: 'public',
        updatedAtIso: '2026-11-13T12:00:11.000Z',
        status: 'created',
      },
    ]);
    expect(manifestCsv).toContain('contentFormat');
    expect(manifestCsv).toContain('markdown');
  });

  it('enforces Firestore security rule constraints for notes and contentFormat', () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    expect(rules).toContain("isValidId(noteId)");
    expect(rules).toContain("data.contentFormat in ['plain', 'markdown']");
    expect(rules).toContain("data.keys().size() <= 14");
    expect(rules).toContain("data.content.size() <= 4000");
    expect(rules).toContain(
      "affectedKeys().hasOnly(['content', 'contentFormat', 'audioUrl', 'location', 'updatedAt', 'color', 'emoji', 'language', 'authorName', 'privacy'])"
    );
  });
});
