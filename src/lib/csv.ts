import { Timestamp } from 'firebase/firestore';
import { Note, NotePrivacy } from '../types';

export type SpotheonImportField =
  | 'id'
  | 'content'
  | 'lat'
  | 'lng'
  | 'location'
  | 'type'
  | 'audioUrl'
  | 'privacy'
  | 'color'
  | 'emoji'
  | 'language'
  | 'authorName'
  | 'updatedAt';

export type CsvFieldMapping = Record<SpotheonImportField, string>;

export interface ImportDefaults {
  type: 'text' | 'audio';
  privacy: NotePrivacy;
  color: string;
  emoji: string;
  language: string;
  authorName: string;
  maxContentLength: 1000 | 2000;
  skipDuplicates: boolean;
  batchSize: number;
}

export interface ValidatedNotePayload {
  type: 'text' | 'audio';
  content: string;
  audioUrl?: string;
  location: { lat: number; lng: number };
  authorId: string;
  authorName: string;
  privacy: NotePrivacy;
  color: string;
  emoji: string;
  language: string;
  moderationState: 'visible';
  customUpdatedAt?: Timestamp;
}

export interface PreparedImportRow {
  rowIndex: number; // 1-based data row index
  sourceId?: string;
  raw: Record<string, string>;
  status: 'valid' | 'error' | 'duplicate';
  errors: string[];
  warnings: string[];
  payload?: ValidatedNotePayload;
}

export interface PreparedImportResult {
  rows: PreparedImportRow[];
  validCount: number;
  errorCount: number;
  duplicateCount: number;
  batchCount: number;
}

export interface ImportManifestItem {
  rowIndex: number;
  sourceId: string;
  firestoreNoteId: string;
  batchNumber: number;
  lat: number;
  lng: number;
  privacy: NotePrivacy;
  updatedAtIso: string;
  status: 'created' | 'failed';
  error?: string;
}

export const SPOTHEON_FIELD_DEFS: Array<{
  field: SpotheonImportField;
  label: string;
  required?: boolean;
  hint: string;
}> = [
  { field: 'content', label: 'content', required: true, hint: 'Texto de la nota (máx. 1000–2000 caracteres)' },
  { field: 'lat', label: 'lat', required: true, hint: 'Latitud decimal (-90 a 90), o usar campo location' },
  { field: 'lng', label: 'lng', required: true, hint: 'Longitud decimal (-180 a 180), o usar campo location' },
  { field: 'location', label: 'location (opcional)', hint: 'Par "lat,lng" combinado si no hay lat/lng separados' },
  { field: 'privacy', label: 'privacy', hint: 'public | unlisted | private' },
  { field: 'type', label: 'type', hint: 'text | audio (por defecto text)' },
  { field: 'audioUrl', label: 'audioUrl', hint: 'URL https:// si type es audio' },
  { field: 'color', label: 'color', hint: 'Hex #RRGGBB (ej. #0d9488)' },
  { field: 'emoji', label: 'emoji', hint: 'Emoji del marcador (máx. 10 caracteres)' },
  { field: 'language', label: 'language', hint: 'Código de idioma (ej. es-ES)' },
  { field: 'authorName', label: 'authorName', hint: 'Nombre visible del autor (máx. 100 caracteres)' },
  { field: 'updatedAt', label: 'updatedAt', hint: 'Fecha ISO/RFC/YYYY-MM-DD de actualización' },
  { field: 'id', label: 'id (opcional)', hint: 'ID estable [a-zA-Z0-9_-], máx. 128 caracteres' },
];

const HEADER_SYNONYMS: Record<SpotheonImportField, string[]> = {
  id: ['id', 'noteid', 'note_id', 'docid', 'doc_id', 'identificador', 'source_id', 'external_id'],
  content: ['content', 'contenido', 'texto', 'text', 'mensaje', 'message', 'descripcion', 'description', 'nota', 'note'],
  lat: ['lat', 'latitude', 'latitud', 'location_lat', 'location.lat', 'y'],
  lng: ['lng', 'lon', 'long', 'longitude', 'longitud', 'location_lng', 'location.lng', 'x'],
  location: ['location', 'ubicacion', 'coordenadas', 'coords', 'latlng'],
  type: ['type', 'tipo'],
  audioUrl: ['audiourl', 'audio_url', 'audio'],
  privacy: ['privacy', 'privacidad', 'visibilidad', 'visibility'],
  color: ['color', 'colour', 'hex'],
  emoji: ['emoji', 'icono', 'icon', 'pin'],
  language: ['language', 'idioma', 'lang', 'locale'],
  authorName: ['authorname', 'author_name', 'autor', 'author', 'nombre_autor'],
  updatedAt: ['updatedat', 'updated_at', 'fecha_actualizacion', 'actualizado', 'last_modified', 'modified'],
};

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] || '';
  let commas = 0;
  let semis = 0;
  let tabs = 0;
  let inQuotes = false;

  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === ',') commas++;
      else if (ch === ';') semis++;
      else if (ch === '\t') tabs++;
    }
  }

  if (semis > commas && semis >= tabs) return ';';
  if (tabs > commas && tabs > semis) return '\t';
  return ',';
}

export function parseCsv(
  rawText: string,
  forcedDelimiter?: ',' | ';' | '\t'
): { headers: string[]; rows: string[][]; delimiter: ',' | ';' | '\t' } {
  const cleanText = rawText.replace(/^\uFEFF/, '');
  const delimiter = forcedDelimiter || detectDelimiter(cleanText);

  const records: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    const next = cleanText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentField);
        currentField = '';
      } else if (ch === '\r' && next === '\n') {
        currentRow.push(currentField);
        records.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        currentRow.push(currentField);
        records.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += ch;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    records.push(currentRow);
  }

  const nonEmptyRecords = records.filter((row) => row.some((cell) => cell.trim() !== ''));
  if (nonEmptyRecords.length === 0) {
    return { headers: [], rows: [], delimiter };
  }

  const headers = nonEmptyRecords[0].map((h) => h.trim());
  const rows = nonEmptyRecords.slice(1);
  return { headers, rows, delimiter };
}

export function autoMapHeaders(headers: string[]): CsvFieldMapping {
  const mapping: CsvFieldMapping = {
    id: '',
    content: '',
    lat: '',
    lng: '',
    location: '',
    type: '',
    audioUrl: '',
    privacy: '',
    color: '',
    emoji: '',
    language: '',
    authorName: '',
    updatedAt: '',
  };

  const normalizedHeaders = headers.map((h) => ({
    original: h,
    norm: h.toLowerCase().trim().replace(/\s+/g, '_'),
  }));

  (Object.keys(HEADER_SYNONYMS) as SpotheonImportField[]).forEach((field) => {
    const candidates = HEADER_SYNONYMS[field];
    const match = normalizedHeaders.find((h) => candidates.includes(h.norm));
    if (match) {
      mapping[field] = match.original;
    }
  });

  return mapping;
}

function parseCoordinate(rawVal: string): number | null {
  const trimmed = rawVal.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFlexibleDate(rawVal: string): Date | null {
  const trimmed = rawVal.trim();
  if (!trimmed) return null;

  // DD/MM/YYYY or DD-MM-YYYY (with optional HH:MM[:SS])
  const dmyMatch = trimmed.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[\sT-]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    const hour = dmyMatch[4] ? Number(dmyMatch[4]) : 0;
    const min = dmyMatch[5] ? Number(dmyMatch[5]) : 0;
    const sec = dmyMatch[6] ? Number(dmyMatch[6]) : 0;
    const d = new Date(Date.UTC(year, month - 1, day, hour, min, sec));
    if (!Number.isNaN(d.getTime()) && d.getUTCMonth() === month - 1 && d.getUTCDate() === day) {
      return d;
    }
    return null;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeColor(rawColor: string): string | null {
  const trimmed = rawColor.trim();
  if (!trimmed) return null;
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return VALID_HEX_REGEX.test(withHash) ? withHash.toLowerCase() : null;
}

function makeContentLocationKey(lat: number, lng: number, content: string): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}|${content.trim().toLowerCase()}`;
}

export function validateAndPrepareNotes(
  rows: string[][],
  headers: string[],
  mapping: CsvFieldMapping,
  defaults: ImportDefaults,
  existingNotes: Note[],
  currentUserUid: string
): PreparedImportResult {
  const headerIndex = new Map<string, number>();
  headers.forEach((h, idx) => {
    headerIndex.set(h, idx);
  });

  const existingIds = new Set(existingNotes.map((n) => n.id));
  const existingSignatures = new Set(
    existingNotes
      .filter((n) => n.location && typeof n.location.lat === 'number' && typeof n.location.lng === 'number' && n.content)
      .map((n) => makeContentLocationKey(n.location.lat, n.location.lng, n.content || ''))
  );

  const seenCsvIds = new Set<string>();
  const seenCsvSignatures = new Set<string>();

  const getVal = (row: string[], field: SpotheonImportField): string => {
    const col = mapping[field];
    if (!col) return '';
    const idx = headerIndex.get(col);
    if (idx === undefined) return '';
    return (row[idx] ?? '').trim();
  };

  const preparedRows: PreparedImportRow[] = rows.map((row, i) => {
    const rowIndex = i + 1;
    const rawObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rawObj[h] = (row[idx] ?? '').trim();
    });

    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Optional ID
    const sourceId = getVal(row, 'id');
    if (sourceId) {
      if (!VALID_ID_REGEX.test(sourceId)) {
        errors.push('ID inválido (solo letras, números, "_" o "-", máx. 128 caracteres).');
      } else if (defaults.skipDuplicates && existingIds.has(sourceId)) {
        return {
          rowIndex,
          sourceId,
          raw: rawObj,
          status: 'duplicate',
          errors: [],
          warnings: [`ID "${sourceId}" ya existe en Firestore (omitido).`],
        };
      } else if (seenCsvIds.has(sourceId)) {
        return {
          rowIndex,
          sourceId,
          raw: rawObj,
          status: 'duplicate',
          errors: [],
          warnings: [`ID "${sourceId}" duplicado dentro del mismo CSV (omitido).`],
        };
      }
    }

    // 2. Content
    const content = getVal(row, 'content');
    if (!content) {
      errors.push('El campo content está vacío.');
    } else if (content.length > 2000) {
      errors.push(`content excede el límite máximo de firestore.rules (${content.length}/2000).`);
    } else if (content.length > defaults.maxContentLength) {
      errors.push(`content excede el límite configurado (${content.length}/${defaults.maxContentLength}).`);
    } else if (content.length > 1000) {
      warnings.push(`content tiene ${content.length} caracteres (>1000 del blueprint, permitido por reglas hasta 2000).`);
    }

    // 3. Coordinates
    let lat = parseCoordinate(getVal(row, 'lat'));
    let lng = parseCoordinate(getVal(row, 'lng'));

    if ((lat === null || lng === null) && mapping.location) {
      const locStr = getVal(row, 'location');
      if (locStr) {
        const parts = locStr.split(/[,\s;]+/).filter(Boolean);
        if (parts.length >= 2) {
          lat = parseCoordinate(parts[0]);
          lng = parseCoordinate(parts[1]);
        }
      }
    }

    if (lat === null || lng === null) {
      errors.push('Coordenadas lat/lng inválidas o faltantes.');
    } else {
      if (lat < -90 || lat > 90) errors.push(`Latitud fuera de rango (${lat}).`);
      if (lng < -180 || lng > 180) errors.push(`Longitud fuera de rango (${lng}).`);
      if (lat === 0 && lng === 0) errors.push('Coordenadas (0, 0) no válidas.');
    }

    // 4. Duplicate signature check
    if (defaults.skipDuplicates && lat !== null && lng !== null && content) {
      const sig = makeContentLocationKey(lat, lng, content);
      if (existingSignatures.has(sig)) {
        return {
          rowIndex,
          sourceId: sourceId || undefined,
          raw: rawObj,
          status: 'duplicate',
          errors: [],
          warnings: ['Ya existe una nota con la misma ubicación y contenido en Firestore (omitida).'],
        };
      }
      if (seenCsvSignatures.has(sig)) {
        return {
          rowIndex,
          sourceId: sourceId || undefined,
          raw: rawObj,
          status: 'duplicate',
          errors: [],
          warnings: ['Fila duplicada dentro del CSV (misma ubicación y contenido, omitida).'],
        };
      }
    }

    // 5. Type & audioUrl
    const rawType = getVal(row, 'type').toLowerCase();
    let noteType: 'text' | 'audio' = defaults.type;
    if (rawType) {
      if (rawType === 'text' || rawType === 'audio') {
        noteType = rawType;
      } else {
        errors.push(`type inválido "${rawType}" (usar text o audio).`);
      }
    }

    const audioUrl = getVal(row, 'audioUrl');
    if (noteType === 'audio') {
      if (!audioUrl || !audioUrl.startsWith('https://') || audioUrl.length > 500) {
        errors.push('audioUrl debe comenzar con "https://" y tener máx. 500 caracteres.');
      }
    } else if (audioUrl && (!audioUrl.startsWith('https://') || audioUrl.length > 500)) {
      errors.push('audioUrl debe comenzar con "https://" y tener máx. 500 caracteres.');
    }

    // 6. Privacy
    const rawPrivacy = getVal(row, 'privacy').toLowerCase();
    let privacy: NotePrivacy = defaults.privacy;
    if (rawPrivacy) {
      if (rawPrivacy === 'public' || rawPrivacy === 'unlisted' || rawPrivacy === 'private') {
        privacy = rawPrivacy;
      } else {
        errors.push(`privacy inválido "${rawPrivacy}" (usar public, unlisted o private).`);
      }
    }

    // 7. Color
    const rawColor = getVal(row, 'color');
    let color = defaults.color;
    if (rawColor) {
      const normalized = normalizeColor(rawColor);
      if (normalized) {
        color = normalized;
      } else {
        errors.push(`color inválido "${rawColor}" (debe ser hex #RRGGBB).`);
      }
    }

    // 8. Emoji
    const rawEmoji = getVal(row, 'emoji');
    const emoji = rawEmoji || defaults.emoji;
    if (emoji.length > 10) {
      errors.push(`emoji excede 10 caracteres (${emoji.length}).`);
    }

    // 9. Language
    const rawLang = getVal(row, 'language');
    const language = rawLang || defaults.language;
    if (language.length > 20) {
      errors.push(`language excede 20 caracteres (${language.length}).`);
    }

    // 10. AuthorName
    const rawAuthorName = getVal(row, 'authorName');
    const authorName = (rawAuthorName || defaults.authorName || 'Admin').slice(0, 100);
    if (rawAuthorName.length > 100) {
      warnings.push('authorName truncado a 100 caracteres según reglas.');
    }

    // 11. UpdatedAt
    const rawUpdatedAt = getVal(row, 'updatedAt');
    let customUpdatedAt: Timestamp | undefined;
    if (rawUpdatedAt) {
      const parsedDate = parseFlexibleDate(rawUpdatedAt);
      if (!parsedDate) {
        errors.push(`updatedAt inválido "${rawUpdatedAt}" (usar ISO 8601 o YYYY-MM-DD).`);
      } else {
        customUpdatedAt = Timestamp.fromDate(parsedDate);
      }
    }

    if (errors.length > 0 || lat === null || lng === null) {
      return {
        rowIndex,
        sourceId: sourceId || undefined,
        raw: rawObj,
        status: 'error',
        errors,
        warnings,
      };
    }

    if (sourceId) seenCsvIds.add(sourceId);
    seenCsvSignatures.add(makeContentLocationKey(lat, lng, content));

    const payload: ValidatedNotePayload = {
      type: noteType,
      content,
      ...(audioUrl ? { audioUrl } : {}),
      location: { lat, lng },
      authorId: currentUserUid,
      authorName,
      privacy,
      color,
      emoji,
      language,
      moderationState: 'visible',
      ...(customUpdatedAt ? { customUpdatedAt } : {}),
    };

    return {
      rowIndex,
      sourceId: sourceId || undefined,
      raw: rawObj,
      status: 'valid',
      errors: [],
      warnings,
      payload,
    };
  });

  const validCount = preparedRows.filter((r) => r.status === 'valid').length;
  const errorCount = preparedRows.filter((r) => r.status === 'error').length;
  const duplicateCount = preparedRows.filter((r) => r.status === 'duplicate').length;
  const safeBatchSize = Math.max(1, Math.min(500, defaults.batchSize || 20));
  const batchCount = validCount > 0 ? Math.ceil(validCount / safeBatchSize) : 0;

  return {
    rows: preparedRows,
    validCount,
    errorCount,
    duplicateCount,
    batchCount,
  };
}

export function buildCsvTemplate(): string {
  const header = 'id,content,lat,lng,type,privacy,color,emoji,language,authorName,updatedAt';
  const row1 =
    'mvd_accesible_solis,"Teatro Solís — Acceso principal accesible con rampa y ascensor. Fuente: Intendencia de Montevideo — Espacios accesibles de Montevideo (https://catalogodatos.gub.uy/dataset/intendencia-montevideo-espacios-accesibles-de-montevideo1). Datos de origen actualizados: 2026-11-13T12:00:11Z",-34.907851,-56.201122,text,public,#0d9488,🎭,es-ES,Admin,2026-11-13T12:00:11Z';
  const row2 =
    'mvd_ejemplo_zitarrosa,"Sala Zitarrosa — Acceso por Av. 18 de Julio 1012. Fuente: Intendencia de Montevideo — Salas públicas de Montevideo (https://catalogodatos.gub.uy/dataset/intendencia-montevideo-salas-publicas-de-montevideo). Datos de origen actualizados: 2026-10-06T16:21:37Z",-34.906123,-56.193456,text,public,#0d9488,🎵,es-ES,Admin,2026-10-06T16:21:37Z';
  return `${header}\n${row1}\n${row2}\n`;
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildManifestCsv(items: ImportManifestItem[]): string {
  const header = 'rowIndex,sourceId,firestoreNoteId,batchNumber,lat,lng,privacy,updatedAtIso,status,error';
  const lines = items.map((item) =>
    [
      String(item.rowIndex),
      escapeCsvCell(item.sourceId),
      escapeCsvCell(item.firestoreNoteId),
      String(item.batchNumber),
      String(item.lat),
      String(item.lng),
      escapeCsvCell(item.privacy),
      escapeCsvCell(item.updatedAtIso),
      escapeCsvCell(item.status),
      escapeCsvCell(item.error || ''),
    ].join(',')
  );
  return `${header}\n${lines.join('\n')}\n`;
}
