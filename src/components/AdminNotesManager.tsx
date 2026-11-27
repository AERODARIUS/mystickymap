import React, { useMemo, useState } from 'react';
import { deleteDoc, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { Search, MapPin, Eye, EyeOff, Trash2, AlertCircle, Calendar, CheckCircle2, Download, Folder } from 'lucide-react';
import { db, logAnalyticsEvent } from '../firebase';
import { ModerationState, Note, NotePrivacy } from '../types';
import { getPlainTextExcerpt, markdownToPlainText } from '../lib/richText';
import { isNoteExpired } from '../lib/expiration';
import { buildNotesExportCsv } from '../lib/csv';
import { normalizeGroupName } from '../lib/groups';

interface AdminNotesManagerProps {
  notes: Note[];
  loading: boolean;
  error: string | null;
  onFocusNote?: (note: Note) => void;
}

export const AdminNotesManager = ({
  notes,
  loading,
  error,
  onFocusNote,
}: AdminNotesManagerProps) => {
  const [search, setSearch] = useState('');
  const [privacyFilter, setPrivacyFilter] = useState<'all' | NotePrivacy>('all');
  const [modFilter, setModFilter] = useState<'all' | ModerationState>('all');
  const [expirationFilter, setExpirationFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const legacyNotesMissingExpiresAt = useMemo(
    () => notes.filter((n) => n.expiresAt === undefined),
    [notes]
  );

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (privacyFilter !== 'all' && n.privacy !== privacyFilter) return false;
      const state = n.moderationState || 'visible';
      if (modFilter !== 'all' && state !== modFilter) return false;
      const expired = isNoteExpired(n);
      if (expirationFilter === 'expired' && !expired) return false;
      if (expirationFilter === 'active' && expired) return false;
      if (q) {
        const plainContent = markdownToPlainText(n.content || '', n.contentFormat).toLowerCase();
        const rawContent = (n.content || '').toLowerCase();
        const matchContent = plainContent.includes(q) || rawContent.includes(q);
        const matchAuthor = (n.authorName || '').toLowerCase().includes(q);
        const matchId = n.id.toLowerCase().includes(q);
        if (!matchContent && !matchAuthor && !matchId) return false;
      }
      return true;
    });
  }, [notes, search, privacyFilter, modFilter, expirationFilter]);

  const handleBackfillExpiresAt = async () => {
    if (legacyNotesMissingExpiresAt.length === 0) return;
    setIsBackfilling(true);
    setActionError(null);
    setBackfillMessage(null);
    try {
      const chunkSize = 400;
      let updated = 0;
      for (let i = 0; i < legacyNotesMissingExpiresAt.length; i += chunkSize) {
        const batch = writeBatch(db);
        const slice = legacyNotesMissingExpiresAt.slice(i, i + chunkSize);
        for (const note of slice) {
          batch.update(doc(db, 'notes', note.id), {
            expiresAt: null,
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
        updated += slice.length;
      }
      setBackfillMessage(`Se inicializó expiresAt = null en ${updated} notas existentes.`);
      logAnalyticsEvent('admin_notes_expires_at_backfill', { updated_count: updated });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleToggleModeration = async (note: Note) => {
    const current = note.moderationState || 'visible';
    const next: ModerationState = current === 'removed' ? 'visible' : 'removed';
    setBusyId(note.id);
    setActionError(null);
    try {
      await updateDoc(doc(db, 'notes', note.id), { moderationState: next });
      logAnalyticsEvent('admin_note_moderation_toggle', { note_id: note.id, state: next });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    setBusyId(noteId);
    setActionError(null);
    try {
      await deleteDoc(doc(db, 'notes', noteId));
      logAnalyticsEvent('admin_note_delete', { note_id: noteId });
      setConfirmDeleteId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleExportCsv = () => {
    const csv = buildNotesExportCsv(filteredNotes);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spotheon_notes_export.csv';
    a.click();
    URL.revokeObjectURL(url);
    logAnalyticsEvent('admin_notes_csv_export', { exported_count: filteredNotes.length });
  };

  const formatTs = (ts: Note['createdAt'] | undefined) => {
    if (!ts || typeof ts.toDate !== 'function') return '—';
    return ts.toDate().toISOString().slice(0, 10);
  };

  return (
    <div className="space-y-4">
      {legacyNotesMissingExpiresAt.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900">
          <div className="flex items-start gap-2.5">
            <Calendar className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
            <div>
              <p className="font-semibold">
                Hay {legacyNotesMissingExpiresAt.length} notas existentes sin el campo <span className="font-mono">expiresAt</span>.
              </p>
              <p className="text-amber-800 mt-0.5">
                Ejecutá la migración para asignarles <span className="font-mono">expiresAt: null</span> y hacerlas visibles en las consultas públicas filtradas por vencimiento.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isBackfilling}
            onClick={handleBackfillExpiresAt}
            className="px-4 py-2 bg-[#081e2b] hover:bg-[#0e2a38] disabled:opacity-50 text-white rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
          >
            {isBackfilling ? 'Migrando...' : 'Inicializar expiresAt: null'}
          </button>
        </div>
      )}

      {backfillMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-900">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <p>{backfillMessage}</p>
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por contenido, autor o ID..."
            className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#0d9488]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filtrar por privacidad"
            value={privacyFilter}
            onChange={(e) => setPrivacyFilter(e.target.value as 'all' | NotePrivacy)}
            className="px-3 py-2 bg-white border border-stone-200 rounded-lg text-xs font-medium text-stone-700"
          >
            <option value="all">Privacidad: Todas</option>
            <option value="public">public</option>
            <option value="unlisted">unlisted</option>
            <option value="private">private</option>
          </select>

          <select
            aria-label="Filtrar por estado de moderación"
            value={modFilter}
            onChange={(e) => setModFilter(e.target.value as 'all' | ModerationState)}
            className="px-3 py-2 bg-white border border-stone-200 rounded-lg text-xs font-medium text-stone-700"
          >
            <option value="all">Estado: Todos</option>
            <option value="visible">visible</option>
            <option value="pending_review">pending_review</option>
            <option value="removed">removed</option>
          </select>

          <select
            aria-label="Filtrar por vencimiento"
            value={expirationFilter}
            onChange={(e) => setExpirationFilter(e.target.value as 'all' | 'active' | 'expired')}
            className="px-3 py-2 bg-white border border-stone-200 rounded-lg text-xs font-medium text-stone-700"
          >
            <option value="all">Vencimiento: Todos</option>
            <option value="active">Activas</option>
            <option value="expired">Vencidas</option>
          </select>

          <span className="text-xs text-stone-500 font-mono tabular-nums px-2">
            {filteredNotes.length} / {notes.length}
          </span>

          <button
            type="button"
            disabled={filteredNotes.length === 0}
            onClick={handleExportCsv}
            className="px-3 py-2 bg-[#081e2b] hover:bg-[#0e2a38] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-[#00a88f]" />
            Exportar CSV
          </button>
        </div>
      </div>

      {(error || actionError) && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-xs text-red-800">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
          <p>{error || actionError}</p>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-xs text-stone-500">
          Cargando notas de Firestore...
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold">
                <th className="py-2.5 px-3 whitespace-nowrap">ID / Autor</th>
                <th className="py-2.5 px-3">Contenido</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right">Coordenadas</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Privacidad / Estado</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Vencimiento</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Creada</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredNotes.slice(0, 150).map((note) => {
                const modState = note.moderationState || 'visible';
                const isBusy = busyId === note.id;
                const expired = isNoteExpired(note);
                return (
                  <tr key={note.id} className="hover:bg-stone-50/80 align-top">
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <p className="font-semibold text-stone-900">
                        {note.emoji ? `${note.emoji} ` : ''}
                        {note.authorName || 'Explorer'}
                      </p>
                      <p className="font-mono text-[11px] text-stone-500">{note.id}</p>
                    </td>
                    <td className="py-2.5 px-3 max-w-md space-y-1">
                      <p className="text-stone-800 line-clamp-2 break-words">
                        {note.content
                          ? getPlainTextExcerpt(note.content, note.contentFormat, 160)
                          : '(Nota de audio)'}
                      </p>
                      {normalizeGroupName(note.group) && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-50 text-[#0d9488] border border-teal-100 text-[10px] font-semibold">
                          <Folder className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                          <span>{normalizeGroupName(note.group)}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-right text-stone-700 whitespace-nowrap">
                      {note.location
                        ? `${note.location.lat.toFixed(5)}, ${note.location.lng.toFixed(5)}`
                        : '—'}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-stone-700">
                      <span>{note.privacy}</span>
                      <span aria-hidden="true" className="mx-1.5 text-stone-300">
                        ·
                      </span>
                      <span
                        className={
                          modState === 'removed'
                            ? 'text-red-700 font-semibold'
                            : modState === 'pending_review'
                            ? 'text-amber-700 font-semibold'
                            : 'text-emerald-700 font-semibold'
                        }
                      >
                        {modState}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {expired ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-bold">
                          Vencida
                        </span>
                      ) : (
                        <span className="text-stone-600 font-medium">Activa</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-stone-600 whitespace-nowrap">
                      {formatTs(note.createdAt)}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {onFocusNote && (
                          <button
                            type="button"
                            onClick={() => onFocusNote(note)}
                            className="p-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-md transition-colors"
                            title="Ver en mapa"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleToggleModeration(note)}
                          className="p-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-md transition-colors disabled:opacity-50"
                          title={modState === 'removed' ? 'Restaurar nota' : 'Ocultar nota (removed)'}
                        >
                          {modState === 'removed' ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {confirmDeleteId === note.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleDeleteNote(note.id)}
                              className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[11px] font-semibold"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded text-[11px] font-semibold"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmDeleteId(note.id)}
                            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-md transition-colors disabled:opacity-50"
                            title="Eliminar nota"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredNotes.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-stone-500">
                    No se encontraron notas con los filtros actuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {filteredNotes.length > 150 && (
            <div className="px-3 py-2 bg-stone-50 border-t border-stone-200 text-[11px] text-stone-500">
              Mostrando 150 de {filteredNotes.length} notas. Usá el buscador para acotar resultados.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
