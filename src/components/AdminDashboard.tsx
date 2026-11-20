import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
  deleteDoc,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, logAnalyticsEvent } from '../firebase';
import { NoteReport, Note, ModerationState, Comment } from '../types';
import {
  Shield,
  Trash2,
  CheckCircle,
  Clock,
  MapPin,
  AlertCircle,
  MessageCircle,
  FileSpreadsheet,
  Notebook,
  Flag,
} from 'lucide-react';
import { AdminCsvImporter } from './AdminCsvImporter';
import { AdminNotesManager } from './AdminNotesManager';
import { RichTextViewer } from './RichTextViewer';

interface AdminDashboardProps {
  onClose: () => void;
  user: User | null;
  onFocusNote?: (note: Note) => void;
}

type AdminSection = 'moderation' | 'notes' | 'import_csv';

export const AdminDashboard = ({ onClose, user, onFocusNote }: AdminDashboardProps) => {
  const [activeSection, setActiveSection] = useState<AdminSection>('moderation');

  // Reports state
  const [reports, setReports] = useState<NoteReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'resolved' | 'dismissed'>('pending');

  // All Notes state (used by Notes Manager and duplicate check in CSV Importer)
  const [adminNotes, setAdminNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const newReports = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as NoteReport[];
        setReports(newReports);
        setReportsLoading(false);
        setReportsError(null);
      },
      (error) => {
        console.error('Failed to list reports:', error);
        setReportsError(
          error instanceof Error
            ? error.message
            : 'No se pudieron leer los reportes. Verificá que tu UID esté en la colección admins.'
        );
        setReportsLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'notes'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loaded = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Note[];
        setAdminNotes(loaded);
        setNotesLoading(false);
        setNotesError(null);
      },
      (error) => {
        console.error('Failed to list admin notes:', error);
        setNotesError(
          error instanceof Error
            ? error.message
            : 'No se pudieron listar todas las notas. Verificá permisos de administrador en /admins/{uid}.'
        );
        setNotesLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  const handleAction = async (report: NoteReport, action: 'dismiss' | 'remove') => {
    try {
      if (action === 'remove') {
        if (report.commentId && report.noteId) {
          const commentRef = doc(db, 'notes', report.noteId, 'comments', report.commentId);
          await deleteDoc(commentRef);
        } else if (report.noteId) {
          const noteRef = doc(db, 'notes', report.noteId);
          await updateDoc(noteRef, { moderationState: 'removed' as ModerationState });
        }
        await updateDoc(doc(db, 'reports', report.id), { status: 'resolved' });
      } else {
        await updateDoc(doc(db, 'reports', report.id), { status: 'dismissed' });
      }
      logAnalyticsEvent('admin_moderation_action', { action, report_id: report.id });
    } catch (error) {
      setReportsError(error instanceof Error ? error.message : String(error));
    }
  };

  const pendingReportsCount = reports.filter((r) => r.status === 'pending').length;
  const filteredReports = reports.filter((r) => r.status === filter);

  return (
    <div className="fixed inset-0 z-[110] bg-stone-50 flex flex-col">
      {/* Top Bar */}
      <header className="bg-white border-b border-stone-200 px-6 py-3.5 flex items-center justify-between gap-6 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-[#081e2b] text-white rounded-lg shrink-0">
            <Shield className="w-4 h-4 text-[#00a88f]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-stone-900 leading-tight whitespace-nowrap">
              Spotheon Admin Panel
            </h2>
            <p className="text-xs text-stone-500 truncate">
              {user?.displayName || 'Admin'}
              {user?.email ? ` · ${user.email}` : ''}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          Cerrar panel
        </button>
      </header>

      {/* Workspace Body: Sidebar + Main Viewport */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Navigation Sidebar (desktop) / Tab Bar (mobile) */}
        <aside className="bg-white border-b md:border-b-0 md:border-r border-stone-200 md:w-60 shrink-0 p-3 flex md:flex-col gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSection('moderation')}
            className={`px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between gap-3 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'moderation'
                ? 'bg-[#081e2b] text-white'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Flag className="w-4 h-4" />
              Moderación
            </span>
            <span className="font-mono tabular-nums text-[11px] opacity-80">
              {pendingReportsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('notes')}
            className={`px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between gap-3 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'notes'
                ? 'bg-[#081e2b] text-white'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Notebook className="w-4 h-4" />
              Notas
            </span>
            <span className="font-mono tabular-nums text-[11px] opacity-80">
              {adminNotes.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('import_csv')}
            className={`px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between gap-3 transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'import_csv'
                ? 'bg-[#081e2b] text-white'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <FileSpreadsheet className="w-4 h-4" />
              Importar CSV
            </span>
          </button>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-6xl mx-auto">
            {activeSection === 'moderation' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-1 p-1 bg-stone-200/60 rounded-lg w-fit">
                    {(['pending', 'resolved', 'dismissed'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFilter(f)}
                        className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          filter === f
                            ? 'bg-white text-stone-900 shadow-sm'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        {f === 'pending'
                          ? 'Pendientes'
                          : f === 'resolved'
                          ? 'Resueltos'
                          : 'Descartados'}{' '}
                        <span className="font-mono tabular-nums">
                          ({reports.filter((r) => r.status === f).length})
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {reportsError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-xs text-red-800">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                    <p>{reportsError}</p>
                  </div>
                )}

                {reportsLoading ? (
                  <div className="bg-white border border-stone-200 rounded-xl p-12 text-center text-xs text-stone-500">
                    Cargando reportes...
                  </div>
                ) : filteredReports.length === 0 ? (
                  <div className="bg-white border border-stone-200 rounded-xl p-16 flex flex-col items-center text-center gap-3">
                    <CheckCircle className="w-10 h-10 text-stone-300" />
                    <div>
                      <p className="text-base font-bold text-stone-900">Sin reportes pendientes</p>
                      <p className="text-xs text-stone-500 mt-1">
                        No hay elementos en estado {filter} en este momento.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {filteredReports.map((report) => (
                      <ReportCard key={report.id} report={report} onAction={handleAction} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeSection === 'notes' && (
              <AdminNotesManager
                notes={adminNotes}
                loading={notesLoading}
                error={notesError}
                onFocusNote={onFocusNote}
              />
            )}

            {activeSection === 'import_csv' && (
              <AdminCsvImporter
                user={user}
                existingNotes={adminNotes}
                notesLoading={notesLoading}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

const ReportCard = ({
  report,
  onAction,
}: {
  report: NoteReport;
  onAction: (r: NoteReport, a: 'dismiss' | 'remove') => void;
}) => {
  const [note, setNote] = useState<Note | null>(null);
  const [comment, setComment] = useState<Comment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (report.noteId) {
          const snap = await getDoc(doc(db, 'notes', report.noteId));
          if (snap.exists()) {
            setNote({ id: snap.id, ...snap.data() } as Note);
          }
        }

        if (report.commentId && report.noteId) {
          const snap = await getDoc(
            doc(db, 'notes', report.noteId, 'comments', report.commentId)
          );
          if (snap.exists()) {
            setComment({ id: snap.id, ...snap.data() } as Comment);
          }
        }
      } catch (e) {
        console.error('Failed to fetch reported content', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [report.noteId, report.commentId]);

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden flex flex-col md:flex-row">
      {/* Left: Report Info */}
      <div className="flex-1 p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
          <span
            className={`font-semibold ${
              report.reason === 'threat' || report.reason === 'hate_speech'
                ? 'text-red-700'
                : 'text-amber-700'
            }`}
          >
            {report.reason.replace('_', ' ')}
          </span>
          <span aria-hidden="true">·</span>
          <span className="flex items-center gap-1 font-mono tabular-nums">
            <Clock className="w-3.5 h-3.5" />
            {report.createdAt.toDate().toLocaleString()}
          </span>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-stone-700 mb-1.5">Detalles del reporte</h4>
          <p className="text-xs text-stone-700 bg-stone-50 border border-stone-200 p-3 rounded-lg leading-relaxed">
            {report.details || 'Sin comentarios adicionales.'}
          </p>
        </div>

        {report.status === 'pending' && (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => onAction(report, 'remove')}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Retirar contenido
            </button>
            <button
              type="button"
              onClick={() => onAction(report, 'dismiss')}
              className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Descartar
            </button>
          </div>
        )}
      </div>

      {/* Right: Content Preview */}
      <div className="w-full md:w-96 bg-stone-50 p-5 border-t md:border-t-0 md:border-l border-stone-200 flex flex-col">
        <h4 className="text-xs font-semibold text-stone-600 mb-3">
          Vista previa ({report.commentId ? 'Comentario' : 'Nota'})
        </h4>
        {loading ? (
          <div className="text-xs text-stone-400">Cargando contenido...</div>
        ) : !note && !comment ? (
          <div className="flex flex-col items-center justify-center flex-1 text-stone-400 text-xs py-6 gap-1.5">
            <AlertCircle className="w-5 h-5" />
            Contenido no disponible o eliminado.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-base border border-stone-200 shrink-0"
                style={{ backgroundColor: note?.color || '#f5f5f4' }}
              >
                {report.commentId ? (
                  <MessageCircle className="w-4 h-4 text-stone-600" />
                ) : (
                  note?.emoji || '📍'
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-stone-900 truncate">
                  {comment ? comment.authorName : note?.authorName}
                </p>
                <div className="flex items-center gap-1 text-[11px] font-mono tabular-nums text-stone-500">
                  <MapPin className="w-3 h-3" />
                  {note
                    ? `${note.location.lat.toFixed(4)}, ${note.location.lng.toFixed(4)}`
                    : 'Ubicación desconocida'}
                </div>
              </div>
            </div>
            <div className="text-xs text-stone-800 leading-relaxed bg-white p-3 rounded-lg border border-stone-200 max-h-44 overflow-y-auto">
              <RichTextViewer
                content={comment ? comment.content : (note?.content || '')}
                contentFormat={comment ? comment.contentFormat : note?.contentFormat}
                variant={comment ? 'comment' : 'note'}
                tone="light"
              />
            </div>
            {comment && (
              <p className="text-[11px] text-stone-500">
                Respuesta a nota de {note?.authorName}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
