import React, { useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  Play,
  RotateCcw,
} from 'lucide-react';
import { db, logAnalyticsEvent } from '../firebase';
import {
  ContentFormat,
  MAX_NOTE_LENGTH,
  MAX_NOTE_STORAGE_LENGTH,
  Note,
  NotePrivacy,
  SUPPORTED_LANGUAGES,
} from '../types';
import {
  SPOTHEON_FIELD_DEFS,
  CsvFieldMapping,
  ImportDefaults,
  ImportManifestItem,
  SpotheonImportField,
  autoMapHeaders,
  buildCsvTemplate,
  buildManifestCsv,
  parseCsv,
  validateAndPrepareNotes,
} from '../lib/csv';
import { RichTextViewer } from './RichTextViewer';

interface AdminCsvImporterProps {
  user: User | null;
  existingNotes: Note[];
  notesLoading: boolean;
}

type DelimiterOption = 'auto' | ',' | ';' | '\t';
type PreviewFilter = 'all' | 'valid' | 'error' | 'duplicate';

export const AdminCsvImporter = ({
  user,
  existingNotes,
  notesLoading,
}: AdminCsvImporterProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string>('');
  const [rawCsvText, setRawCsvText] = useState<string>('');
  const [showPasteInput, setShowPasteInput] = useState(false);
  const [delimiterOption, setDelimiterOption] = useState<DelimiterOption>('auto');
  const [mapping, setMapping] = useState<CsvFieldMapping>({
    id: '',
    content: '',
    contentFormat: '',
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
  });

  const [defaults, setDefaults] = useState<ImportDefaults>({
    contentFormat: 'plain',
    type: 'text',
    privacy: 'public',
    color: '#0d9488',
    emoji: '📍',
    language: 'es-ES',
    authorName: (user?.displayName || 'Admin').slice(0, 100),
    maxContentLength: 2000,
    skipDuplicates: true,
    batchSize: 20,
  });

  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>('all');
  const [previewMode, setPreviewMode] = useState<'rendered' | 'raw'>('rendered');
  const [isImporting, setIsImporting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    currentBatch: number;
    totalBatches: number;
    createdCount: number;
    failedCount: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<ImportManifestItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const parsedCsv = useMemo(() => {
    if (!rawCsvText.trim()) {
      return { headers: [] as string[], rows: [] as string[][], delimiter: ',' as const };
    }
    return parseCsv(rawCsvText, delimiterOption === 'auto' ? undefined : delimiterOption);
  }, [rawCsvText, delimiterOption]);

  const loadCsvContent = (text: string, name: string) => {
    setRawCsvText(text);
    setFileName(name);
    setManifest([]);
    setImportError(null);
    setBatchProgress(null);

    const parsed = parseCsv(text, delimiterOption === 'auto' ? undefined : delimiterOption);
    if (parsed.headers.length > 0) {
      setMapping(autoMapHeaders(parsed.headers));
    }
  };

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    let text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    // Fallback if UTF-8 decoding produced replacement characters from Latin-1 CSVs
    if (text.includes('\uFFFD')) {
      try {
        text = new TextDecoder('iso-8859-1').decode(buffer);
      } catch {
        // Keep UTF-8 text if iso-8859-1 is unavailable
      }
    }
    loadCsvContent(text, file.name);
    setShowPasteInput(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    await handleFileSelected(file);
  };

  const prepared = useMemo(() => {
    if (parsedCsv.headers.length === 0 || parsedCsv.rows.length === 0) {
      return null;
    }
    return validateAndPrepareNotes(
      parsedCsv.rows,
      parsedCsv.headers,
      mapping,
      defaults,
      existingNotes,
      user?.uid || ''
    );
  }, [parsedCsv, mapping, defaults, existingNotes, user?.uid]);

  const filteredPreviewRows = useMemo(() => {
    if (!prepared) return [];
    if (previewFilter === 'all') return prepared.rows;
    return prepared.rows.filter((r) => r.status === previewFilter);
  }, [prepared, previewFilter]);

  const handleMappingChange = (field: SpotheonImportField, column: string) => {
    setMapping((prev) => ({ ...prev, [field]: column }));
  };

  const handleDownloadTemplate = () => {
    const csv = buildCsvTemplate();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spotheon_notes_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadManifest = (format: 'json' | 'csv') => {
    if (manifest.length === 0) return;
    const content =
      format === 'json' ? JSON.stringify(manifest, null, 2) : buildManifestCsv(manifest);
    const mime = format === 'json' ? 'application/json' : 'text/csv;charset=utf-8;';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spotheon_import_manifest.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setFileName('');
    setRawCsvText('');
    setManifest([]);
    setBatchProgress(null);
    setImportError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExecuteBatchImport = async () => {
    if (!user) {
      setImportError('Debés iniciar sesión para importar notas.');
      return;
    }
    if (!user.emailVerified) {
      setImportError(
        'Las reglas de seguridad de Firestore requieren una cuenta con correo verificado (email_verified == true).'
      );
      return;
    }
    if (!prepared || prepared.validCount === 0) {
      setImportError('No hay filas válidas para importar.');
      return;
    }

    const validRows = prepared.rows.filter((r) => r.status === 'valid' && r.payload);
    const chunkSize = Math.max(1, Math.min(500, defaults.batchSize || 20));
    const totalBatches = Math.ceil(validRows.length / chunkSize);

    setIsImporting(true);
    setImportError(null);
    setManifest([]);
    setBatchProgress({
      currentBatch: 0,
      totalBatches,
      createdCount: 0,
      failedCount: 0,
    });

    const notesCollection = collection(db, 'notes');
    const collectedManifest: ImportManifestItem[] = [];
    let createdCount = 0;
    let failedCount = 0;

    try {
      for (let b = 0; b < totalBatches; b++) {
        const batchNumber = b + 1;
        const slice = validRows.slice(b * chunkSize, (b + 1) * chunkSize);
        const batch = writeBatch(db);
        const batchEntries: Array<{
          rowIndex: number;
          sourceId: string;
          firestoreNoteId: string;
          contentFormat: ContentFormat;
          lat: number;
          lng: number;
          privacy: NotePrivacy;
          updatedAtIso: string;
        }> = [];

        for (const row of slice) {
          const payload = row.payload!;
          const docRef = row.sourceId
            ? doc(db, 'notes', row.sourceId)
            : doc(notesCollection);

          const { customUpdatedAt, ...restPayload } = payload;
          const firestoreDoc = {
            ...restPayload,
            authorId: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: customUpdatedAt ?? serverTimestamp(),
          };

          batch.set(docRef, firestoreDoc);
          batchEntries.push({
            rowIndex: row.rowIndex,
            sourceId: row.sourceId || '',
            firestoreNoteId: docRef.id,
            contentFormat: payload.contentFormat,
            lat: payload.location.lat,
            lng: payload.location.lng,
            privacy: payload.privacy,
            updatedAtIso: customUpdatedAt ? customUpdatedAt.toDate().toISOString() : 'serverTimestamp',
          });
        }

        try {
          await batch.commit();
          createdCount += batchEntries.length;
          for (const entry of batchEntries) {
            collectedManifest.push({
              ...entry,
              batchNumber,
              status: 'created',
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failedCount += batchEntries.length;
          for (const entry of batchEntries) {
            collectedManifest.push({
              ...entry,
              batchNumber,
              status: 'failed',
              error: msg,
            });
          }
          setImportError(
            `Error en batch ${batchNumber}/${totalBatches}: ${msg}. Revisá el manifiesto para ver qué lotes se guardaron antes de reintentar.`
          );
          break;
        }

        setBatchProgress({
          currentBatch: batchNumber,
          totalBatches,
          createdCount,
          failedCount,
        });
      }

      setManifest(collectedManifest);
      logAnalyticsEvent('admin_csv_import', {
        created_count: createdCount,
        failed_count: failedCount,
        total_batches: totalBatches,
        batch_size: chunkSize,
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Section 1: Auth & File Upload */}
      <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-stone-900">Importación masiva en formato CSV</h3>
            <p className="text-xs text-stone-500 mt-1">
              Validación previa contra las reglas de Firestore y escritura agrupada mediante batches reales.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Descargar plantilla CSV
            </button>
            {rawCsvText && (
              <button
                type="button"
                onClick={handleReset}
                className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Author / Verification Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-stone-50 border border-stone-200 rounded-lg text-xs">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-stone-600">
            <span>
              <strong className="text-stone-900">Autoría (authorId):</strong>{' '}
              <span className="font-mono">{user?.uid || 'No autenticado'}</span>
            </span>
            <span aria-hidden="true" className="text-stone-300">
              ·
            </span>
            <span>
              <strong className="text-stone-900">Correo:</strong> {user?.email || '—'}
            </span>
            <span aria-hidden="true" className="text-stone-300">
              ·
            </span>
            <span className={user?.emailVerified ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>
              {user?.emailVerified ? 'Cuenta verificada' : 'Cuenta sin verificar (bloqueada por reglas)'}
            </span>
          </div>
          <div className="text-stone-500 tabular-nums">
            {notesLoading ? 'Cargando notas existentes...' : `${existingNotes.length} notas en base`}
          </div>
        </div>

        {/* Dropzone + Paste Toggle */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border border-dashed rounded-xl p-6 text-center transition-colors ${
            isDragging
              ? 'border-[#0d9488] bg-teal-50/40'
              : 'border-stone-300 bg-stone-50/50 hover:border-stone-400'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => handleFileSelected(e.target.files?.[0])}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-stone-600">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-stone-900">
                {fileName ? `Archivo cargado: ${fileName}` : 'Arrastrá un archivo CSV o seleccionalo desde tu equipo'}
              </p>
              <p className="text-xs text-stone-500 mt-1">
                Soporta delimitadores coma (,), punto y coma (;) o tabulación, comillas RFC-4180 y UTF-8 / ISO-8859-1.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-[#081e2b] hover:bg-[#0e2a38] text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                Elegir archivo CSV
              </button>
              <button
                type="button"
                onClick={() => setShowPasteInput((prev) => !prev)}
                className="px-4 py-2 bg-white border border-stone-200 hover:bg-stone-100 text-stone-700 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                {showPasteInput ? 'Ocultar editor CSV' : 'Pegar texto CSV'}
              </button>
            </div>
          </div>
        </div>

        {showPasteInput && (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-stone-700">
              Contenido CSV directo
            </label>
            <textarea
              value={rawCsvText}
              onChange={(e) => loadCsvContent(e.target.value, 'csv-pegado.csv')}
              placeholder="id,content,contentFormat,lat,lng,type,privacy,color,emoji,language,authorName,updatedAt"
              rows={6}
              className="w-full p-3 font-mono text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d9488]"
            />
          </div>
        )}

        <div className="px-4 py-3 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-600 space-y-1">
          <p className="font-semibold text-stone-800">
            Formato enriquecido opcional (<span className="font-mono">contentFormat</span>)
          </p>
          <p>
            Usá <span className="font-mono font-semibold">plain</span> (por defecto) para texto literal o{' '}
            <span className="font-mono font-semibold">markdown</span> para negrita (<span className="font-mono">**texto**</span>), cursiva (<span className="font-mono">*texto*</span>), encabezados (<span className="font-mono">##</span> / <span className="font-mono">###</span>), listas, citas (<span className="font-mono">&gt;</span>) y enlaces seguros (<span className="font-mono">http/https/mailto</span>). No se permite HTML sin procesar ni imágenes embebidas. Límites: máx. {MAX_NOTE_LENGTH} caracteres visibles y hasta {MAX_NOTE_STORAGE_LENGTH} almacenados.
          </p>
        </div>
      </div>

      {/* Section 2: Mapping & Defaults */}
      {parsedCsv.headers.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-stone-900">Mapeo de columnas y valores por defecto</h3>
              <p className="text-xs text-stone-500 mt-1">
                {parsedCsv.headers.length} columnas detectadas · {parsedCsv.rows.length} filas de datos · Delimitador activo:{' '}
                <span className="font-mono font-semibold">
                  {parsedCsv.delimiter === '\t' ? 'TAB' : `"${parsedCsv.delimiter}"`}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="csv-delimiter" className="text-xs font-medium text-stone-600 whitespace-nowrap">
                Delimitador:
              </label>
              <select
                id="csv-delimiter"
                value={delimiterOption}
                onChange={(e) => setDelimiterOption(e.target.value as DelimiterOption)}
                className="px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-medium text-stone-800"
              >
                <option value="auto">Automático</option>
                <option value=",">Coma (,)</option>
                <option value=";">Punto y coma (;)</option>
                <option value={'\t'}>Tabulación</option>
              </select>
            </div>
          </div>

          {/* Field Mapping Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SPOTHEON_FIELD_DEFS.map((def) => (
              <div key={def.field} className="space-y-1">
                <label
                  htmlFor={`map-${def.field}`}
                  className="flex items-center justify-between text-xs font-semibold text-stone-800"
                >
                  <span>
                    {def.label}
                    {def.required && <span className="text-red-600 ml-1">*</span>}
                  </span>
                </label>
                <select
                  id={`map-${def.field}`}
                  value={mapping[def.field]}
                  onChange={(e) => handleMappingChange(def.field, e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#0d9488]"
                >
                  <option value="">— Sin mapear (usar defecto / omitir) —</option>
                  {parsedCsv.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-stone-500">{def.hint}</p>
              </div>
            ))}
          </div>

          {/* Defaults & Batch Controls */}
          <div className="border-t border-stone-100 pt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label htmlFor="def-format" className="block text-xs font-semibold text-stone-700">
                contentFormat por defecto
              </label>
              <select
                id="def-format"
                value={defaults.contentFormat || 'plain'}
                onChange={(e) =>
                  setDefaults((d) => ({ ...d, contentFormat: e.target.value as ContentFormat }))
                }
                className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs text-stone-800"
              >
                <option value="plain">plain (texto literal)</option>
                <option value="markdown">markdown (texto enriquecido)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="def-author" className="block text-xs font-semibold text-stone-700">
                authorName por defecto
              </label>
              <input
                id="def-author"
                type="text"
                maxLength={100}
                value={defaults.authorName}
                onChange={(e) => setDefaults((d) => ({ ...d, authorName: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs text-stone-800"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="def-privacy" className="block text-xs font-semibold text-stone-700">
                privacy por defecto
              </label>
              <select
                id="def-privacy"
                value={defaults.privacy}
                onChange={(e) => setDefaults((d) => ({ ...d, privacy: e.target.value as NotePrivacy }))}
                className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs text-stone-800"
              >
                <option value="public">public</option>
                <option value="unlisted">unlisted</option>
                <option value="private">private</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="def-language" className="block text-xs font-semibold text-stone-700">
                language por defecto
              </label>
              <select
                id="def-language"
                value={defaults.language}
                onChange={(e) => setDefaults((d) => ({ ...d, language: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs text-stone-800"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label} ({l.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label htmlFor="def-color" className="block text-xs font-semibold text-stone-700">
                  color
                </label>
                <input
                  id="def-color"
                  type="text"
                  value={defaults.color}
                  onChange={(e) => setDefaults((d) => ({ ...d, color: e.target.value }))}
                  className="w-full px-3 py-2 font-mono bg-white border border-stone-300 rounded-lg text-xs text-stone-800"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="def-emoji" className="block text-xs font-semibold text-stone-700">
                  emoji
                </label>
                <input
                  id="def-emoji"
                  type="text"
                  maxLength={10}
                  value={defaults.emoji}
                  onChange={(e) => setDefaults((d) => ({ ...d, emoji: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs text-stone-800"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="def-batch-size" className="block text-xs font-semibold text-stone-700">
                Registros por batch (1–500)
              </label>
              <input
                id="def-batch-size"
                type="number"
                min={1}
                max={500}
                value={defaults.batchSize}
                onChange={(e) =>
                  setDefaults((d) => ({
                    ...d,
                    batchSize: Math.max(1, Math.min(500, Number(e.target.value) || 20)),
                  }))
                }
                className="w-full px-3 py-2 font-mono tabular-nums bg-white border border-stone-300 rounded-lg text-xs text-stone-800"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="def-max-len" className="block text-xs font-semibold text-stone-700">
                Límite almacenado (máx. {MAX_NOTE_LENGTH} visibles)
              </label>
              <select
                id="def-max-len"
                value={defaults.maxContentLength}
                onChange={(e) =>
                  setDefaults((d) => ({
                    ...d,
                    maxContentLength: Number(e.target.value) as 1000 | 2000 | 4000,
                  }))
                }
                className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs text-stone-800"
              >
                <option value={2000}>2000 caracteres almacenados (estándar CSV)</option>
                <option value={1000}>1000 caracteres almacenados (estricto)</option>
                <option value={4000}>{MAX_NOTE_STORAGE_LENGTH} caracteres almacenados (máx. firestore.rules)</option>
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-4 flex items-end pt-1">
              <label className="flex items-center gap-2.5 text-xs font-medium text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={defaults.skipDuplicates}
                  onChange={(e) => setDefaults((d) => ({ ...d, skipDuplicates: e.target.checked }))}
                  className="w-4 h-4 accent-[#0d9488] rounded"
                />
                Omitir duplicados exactos por ID o por coincidencia de ubicación, formato y texto (los posibles duplicados con distinto formato muestran advertencia sin descartarse)
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Section 3: Validation Summary & Preview Table */}
      {prepared && (
        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-5">
          {/* Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg">
              <p className="text-[11px] font-medium text-stone-500">Filas totales</p>
              <p className="text-xl font-bold text-stone-900 font-mono tabular-nums mt-0.5">
                {prepared.rows.length}
              </p>
            </div>
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg">
              <p className="text-[11px] font-medium text-stone-500">Listas para importar</p>
              <p className="text-xl font-bold text-emerald-700 font-mono tabular-nums mt-0.5">
                {prepared.validCount}
              </p>
            </div>
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg">
              <p className="text-[11px] font-medium text-stone-500">Con errores</p>
              <p className="text-xl font-bold text-red-700 font-mono tabular-nums mt-0.5">
                {prepared.errorCount}
              </p>
            </div>
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg">
              <p className="text-[11px] font-medium text-stone-500">Duplicadas omitidas</p>
              <p className="text-xl font-bold text-amber-700 font-mono tabular-nums mt-0.5">
                {prepared.duplicateCount}
              </p>
            </div>
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg">
              <p className="text-[11px] font-medium text-stone-500">Batches a ejecutar</p>
              <p className="text-xl font-bold text-stone-900 font-mono tabular-nums mt-0.5">
                {prepared.batchCount}
              </p>
            </div>
          </div>

          {/* Filter, Preview Toggle & Execute Action */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg w-fit">
                {(
                  [
                    { id: 'all', label: `Todas (${prepared.rows.length})` },
                    { id: 'valid', label: `Válidas (${prepared.validCount})` },
                    { id: 'error', label: `Errores (${prepared.errorCount})` },
                    { id: 'duplicate', label: `Duplicadas (${prepared.duplicateCount})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPreviewFilter(tab.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      previewFilter === tab.id
                        ? 'bg-white text-stone-900 shadow-sm'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div
                role="group"
                aria-label="Modo de vista previa de contenido"
                className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg w-fit"
              >
                <button
                  type="button"
                  aria-pressed={previewMode === 'rendered'}
                  onClick={() => setPreviewMode('rendered')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    previewMode === 'rendered'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Renderizado
                </button>
                <button
                  type="button"
                  aria-pressed={previewMode === 'raw'}
                  onClick={() => setPreviewMode('raw')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    previewMode === 'raw'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Markdown sin procesar
                </button>
              </div>
            </div>

            <button
              type="button"
              disabled={isImporting || prepared.validCount === 0 || !user?.emailVerified}
              onClick={handleExecuteBatchImport}
              className="px-5 py-2.5 bg-[#081e2b] hover:bg-[#0e2a38] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5 text-[#00a88f]" />
              {isImporting
                ? 'Importando batches...'
                : `Importar ${prepared.validCount} notas en ${prepared.batchCount} batch${prepared.batchCount === 1 ? '' : 'es'}`}
            </button>
          </div>

          {importError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <p>{importError}</p>
            </div>
          )}

          {batchProgress && (
            <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-stone-800 tabular-nums">
                <span>
                  Progreso de lotes: {batchProgress.currentBatch} / {batchProgress.totalBatches}
                </span>
                <span>
                  Creadas: {batchProgress.createdCount} · Fallidas: {batchProgress.failedCount}
                </span>
              </div>
              <div className="w-full h-2 bg-stone-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0d9488] transition-all duration-200"
                  style={{
                    width: `${
                      batchProgress.totalBatches > 0
                        ? Math.round((batchProgress.currentBatch / batchProgress.totalBatches) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          )}

          {manifest.length > 0 && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  Manifiesto generado con <strong>{manifest.filter((m) => m.status === 'created').length}</strong> registros creados en Firestore.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownloadManifest('csv')}
                  className="px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-900 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  Descargar Manifiesto CSV
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadManifest('json')}
                  className="px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-900 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  Descargar Manifiesto JSON
                </button>
              </div>
            </div>
          )}

          {/* Data Grid Preview */}
          <div className="border border-stone-200 rounded-lg overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold">
                  <th className="py-2.5 px-3 whitespace-nowrap">#</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Estado</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">ID origen</th>
                  <th className="py-2.5 px-3">Contenido / Formato</th>
                  <th className="py-2.5 px-3 whitespace-nowrap text-right">Coordenadas</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Privacidad</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">updatedAt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredPreviewRows.slice(0, 100).map((row) => (
                  <tr key={row.rowIndex} className="hover:bg-stone-50/80 align-top">
                    <td className="py-2.5 px-3 font-mono tabular-nums text-stone-500">
                      {row.rowIndex}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {row.status === 'valid' ? (
                        <span className="text-emerald-700 font-semibold">Válida</span>
                      ) : row.status === 'duplicate' ? (
                        <span className="text-amber-700 font-semibold">Duplicada</span>
                      ) : (
                        <span className="text-red-700 font-semibold">Error</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-stone-600 whitespace-nowrap">
                      {row.sourceId || 'auto'}
                    </td>
                    <td className="py-2.5 px-3 max-w-md space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono font-semibold ${
                            row.contentFormat === 'markdown'
                              ? 'bg-teal-50 text-teal-800 border border-teal-200'
                              : 'bg-stone-100 text-stone-700 border border-stone-200'
                          }`}
                        >
                          {row.contentFormat}
                        </span>
                        <span className="font-mono tabular-nums text-stone-500">
                          {row.visibleLength}/{MAX_NOTE_LENGTH} vis. · {row.storageLength} alm.
                        </span>
                      </div>

                      {previewMode === 'rendered' && row.contentFormat === 'markdown' ? (
                        <div className="max-h-40 overflow-y-auto rounded-lg bg-stone-50/80 border border-stone-200/80 px-2.5 py-2 text-xs text-stone-800">
                          <RichTextViewer
                            content={row.previewContent}
                            contentFormat="markdown"
                            variant="compact"
                            tone="light"
                          />
                        </div>
                      ) : (
                        <div
                          className={`max-h-40 overflow-y-auto rounded-lg border border-stone-200/80 px-2.5 py-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-stone-800 ${
                            previewMode === 'raw' ? 'bg-stone-100/80 font-mono text-[11px]' : 'bg-stone-50/60 text-xs'
                          }`}
                        >
                          {row.previewContent || row.raw[mapping.content] || '—'}
                        </div>
                      )}

                      {row.errors.length > 0 && (
                        <p className="text-red-700 font-medium">{row.errors.join(' ')}</p>
                      )}
                      {row.warnings.length > 0 && (
                        <p className="text-amber-700 font-medium">{row.warnings.join(' ')}</p>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-right text-stone-700 whitespace-nowrap">
                      {row.payload
                        ? `${row.payload.location.lat.toFixed(5)}, ${row.payload.location.lng.toFixed(5)}`
                        : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-stone-700 whitespace-nowrap">
                      {row.payload?.privacy || '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-stone-600 whitespace-nowrap">
                      {row.payload?.customUpdatedAt
                        ? row.payload.customUpdatedAt.toDate().toISOString().slice(0, 10)
                        : 'serverTimestamp'}
                    </td>
                  </tr>
                ))}
                {filteredPreviewRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-stone-500">
                      No hay filas que coincidan con el filtro seleccionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {filteredPreviewRows.length > 100 && (
              <div className="px-3 py-2 bg-stone-50 border-t border-stone-200 text-[11px] text-stone-500">
                Mostrando las primeras 100 de {filteredPreviewRows.length} filas (todas se validan e importan).
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
