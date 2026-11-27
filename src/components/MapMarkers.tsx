import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AdvancedMarker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import {
  Languages,
  Pencil,
  Trash2,
  Check,
  Share2,
  FileText,
  QrCode,
  Lock,
  Globe,
  Link,
  MessageSquare,
  AlertTriangle,
  Layers,
  ArrowLeft,
  Folder,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { Note, SUPPORTED_LANGUAGES } from '../types';
import { normalizeGroupName } from '../lib/groups';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { useMapViewport } from '../hooks/useMapViewport';
import { getPlainTextExcerpt } from '../lib/richText';
import {
  clusterNotes,
  compareNotesDeterministically,
  getCoordinateKey,
  isValidLocation,
  shouldZoomCluster,
  type CoincidentMarkerCluster,
  type LatLngLiteral,
  type SpatialMarkerCluster,
} from '../lib/markerClustering';
import { ClusterNotesSheet } from './ClusterNotesSheet';
import { SpeechButton } from './SpeechButton';
import { RichTextViewer } from './RichTextViewer';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { db, handleFirestoreError, OperationType, logAnalyticsEvent } from '../firebase';
import { doc, deleteDoc } from 'firebase/firestore';

interface MapMarkersProps {
  user: User | null;
  notes: Note[];
  userLocation: { lat: number; lng: number } | null;
  isCreating: boolean;
  editingNote: Note | null;
  placementStep?: 'editing_content' | 'placing_location';
  draftLocation: { lat: number; lng: number } | null;
  draftColor: string;
  draftEmoji: string;
  selectedNote: Note | null;
  copyStatus: string | null;
  setDraftLocation: (loc: { lat: number; lng: number } | null) => void;
  setSelectedNote: (note: Note | null) => void;
  setEditingNote: (note: Note | null) => void;
  copyToClipboard: (id: string) => void;
  onGenerateQRCode: (id: string) => void;
  onShowComments: (note: Note) => void;
  onReportNote: (note: Note) => void;
}

interface GroupContext {
  id: string;
  coordKey?: string;
  noteIds?: string[];
  position: LatLngLiteral;
  triggerElement?: HTMLElement | null;
}

export const MapMarkers = ({
  user,
  notes,
  userLocation,
  isCreating,
  editingNote,
  placementStep = 'editing_content',
  draftLocation,
  draftColor,
  draftEmoji,
  selectedNote,
  copyStatus,
  setDraftLocation,
  setSelectedNote,
  setEditingNote,
  copyToClipboard,
  onGenerateQRCode,
  onShowComments,
  onReportNote,
}: MapMarkersProps) => {
  const { t } = useTranslation();
  const { flags } = useFeatureFlags();
  const map = useMap();
  const viewport = useMapViewport(15);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeGroup, setActiveGroup] = useState<GroupContext | null>(null);
  const [lastGroupContext, setLastGroupContext] = useState<GroupContext | null>(null);

  const visibleNotes = useMemo(
    () => notes.filter((n) => n.id !== editingNote?.id),
    [notes, editingNote?.id]
  );

  const clusters = useMemo(
    () => clusterNotes(visibleNotes, { zoom: viewport.zoom, bounds: viewport.bounds }),
    [visibleNotes, viewport.zoom, viewport.bounds]
  );

  const resolveGroupNotes = useCallback(
    (group: GroupContext | null): Note[] => {
      if (!group) return [];
      if (group.coordKey) {
        return visibleNotes
          .filter((n) => isValidLocation(n.location) && getCoordinateKey(n.location) === group.coordKey)
          .sort(compareNotesDeterministically);
      }
      if (group.noteIds && group.noteIds.length > 0) {
        const idSet = new Set(group.noteIds);
        return visibleNotes
          .filter((n) => idSet.has(n.id))
          .sort(compareNotesDeterministically);
      }
      return [];
    },
    [visibleNotes]
  );

  const activeGroupNotes = useMemo(
    () => (isCreating || editingNote ? [] : resolveGroupNotes(activeGroup)),
    [activeGroup, editingNote, isCreating, resolveGroupNotes]
  );

  const lastGroupNotes = useMemo(
    () => resolveGroupNotes(lastGroupContext),
    [lastGroupContext, resolveGroupNotes]
  );

  const isGroupSheetOpen = Boolean(!isCreating && !editingNote && activeGroup && activeGroupNotes.length > 0);

  useEffect(() => {
    if (!activeGroup || activeGroupNotes.length > 0) return;
    const timer = setTimeout(() => {
      setActiveGroup(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [activeGroup, activeGroupNotes.length]);

  useEffect(() => {
    if (!lastGroupContext || lastGroupNotes.length > 0) return;
    const timer = setTimeout(() => {
      setLastGroupContext(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [lastGroupContext, lastGroupNotes.length]);

  // Keep selectedNote synced with latest snapshot updates when available
  const resolvedSelectedNote = useMemo(() => {
    if (!selectedNote) return null;
    return notes.find((n) => n.id === selectedNote.id) ?? selectedNote;
  }, [notes, selectedNote]);

  const selectedNoteGroup = useMemo(
    () => (resolvedSelectedNote ? normalizeGroupName(resolvedSelectedNote.group) : undefined),
    [resolvedSelectedNote]
  );

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'notes', deleteId));
      logAnalyticsEvent('note_delete', { note_id: deleteId });
      setSelectedNote(null);
      setDeleteId(null);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `notes/${deleteId}`);
      } catch {
        // Logged and reported via handleFirestoreError; avoid unhandled rejection in async click handler
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSelectSingleNote = useCallback(
    (note: Note) => {
      setActiveGroup(null);
      setLastGroupContext(null);
      setSelectedNote(note);
      logAnalyticsEvent('note_view', {
        note_id: note.id,
        mode: 'map_marker',
        privacy: note.privacy,
      });
    },
    [setSelectedNote]
  );

  const handleOpenCoincidentGroup = useCallback(
    (item: CoincidentMarkerCluster) => {
      const triggerElement =
        typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setSelectedNote(null);
      setLastGroupContext(null);
      setActiveGroup({
        id: item.id,
        coordKey: item.coordKey,
        position: item.position,
        triggerElement,
      });
    },
    [setSelectedNote]
  );

  const handleClusterClick = useCallback(
    (item: SpatialMarkerCluster) => {
      if (map && shouldZoomCluster(item, viewport.zoom)) {
        setActiveGroup(null);
        const latSpan = Math.abs(item.bounds.north - item.bounds.south);
        const lngSpan = Math.abs(item.bounds.east - item.bounds.west);

        if (latSpan < 0.0004 && lngSpan < 0.0004) {
          map.panTo(item.position);
          map.setZoom(Math.min(19, Math.max(viewport.zoom + 2, 18)));
        } else if (typeof map.fitBounds === 'function') {
          map.fitBounds(item.bounds, { top: 80, right: 48, bottom: 120, left: 48 });
        } else {
          map.panTo(item.position);
          map.setZoom(Math.min(18, viewport.zoom + 2));
        }
        return;
      }

      const triggerElement =
        typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setSelectedNote(null);
      setLastGroupContext(null);
      setActiveGroup({
        id: item.id,
        noteIds: item.notes.map((n) => n.id),
        position: item.position,
        triggerElement,
      });
    },
    [map, setSelectedNote, viewport.zoom]
  );

  const handleSelectNoteFromGroup = useCallback(
    (note: Note) => {
      setLastGroupContext(activeGroup);
      setActiveGroup(null);
      setSelectedNote(note);
      logAnalyticsEvent('note_view', {
        note_id: note.id,
        mode: 'cluster_list',
        privacy: note.privacy,
      });
    },
    [activeGroup, setSelectedNote]
  );

  const handleCloseGroupSheet = useCallback(() => {
    setActiveGroup(null);
  }, []);

  return (
    <>
      <DeleteConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />

      {userLocation && (
        <AdvancedMarker position={userLocation}>
          <div className="relative" aria-hidden="true">
            <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20" />
            <div className="w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg" />
          </div>
        </AdvancedMarker>
      )}

      {(isCreating || editingNote) && draftLocation && placementStep === 'editing_content' && (
        <AdvancedMarker
          position={draftLocation}
          draggable={true}
          onDragEnd={(e) => {
            if (e.latLng) {
              setDraftLocation({ lat: e.latLng.lat(), lng: e.latLng.lng() });
            }
          }}
        >
          <motion.div
            initial={{ scale: 0, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="flex items-center justify-center w-12 h-12 rounded-full shadow-2xl border-4 border-white z-50 cursor-grab active:cursor-grabbing"
            style={{ backgroundColor: draftColor }}
          >
            <span className="text-2xl">{draftEmoji}</span>
            <div
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-r-4 border-b-4 border-white"
              style={{ backgroundColor: draftColor }}
            />
            <div
              className="absolute -inset-4 border-2 border-dashed rounded-full animate-[spin_4s_linear_infinite]"
              style={{ borderColor: draftColor, opacity: 0.5 }}
            />
          </motion.div>
        </AdvancedMarker>
      )}

      {clusters.map((item) => {
        if (item.kind === 'single') {
          const { note } = item;
          const excerpt =
            getPlainTextExcerpt(note.content || '', note.contentFormat, 60) ||
            t('cluster.empty_note', 'Untitled note');
          const ariaLabel = t('cluster.single_aria', {
            author: note.authorName || 'Explorer',
            excerpt,
            defaultValue: `Note by ${note.authorName || 'Explorer'}: ${excerpt}`,
          });

          return (
            <AdvancedMarker
              key={item.id}
              position={item.position}
              clickable={true}
              zIndex={resolvedSelectedNote?.id === note.id ? 30 : 10}
              onClick={() => handleSelectSingleNote(note)}
            >
              <button
                type="button"
                aria-label={ariaLabel}
                data-testid={`marker-single-${note.id}`}
                className="relative flex items-center justify-center w-10 h-10 rounded-full shadow-xl border-2 border-white transition-transform hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d9488] focus-visible:ring-offset-2 cursor-pointer"
                style={{ backgroundColor: note.color || '#10b981' }}
              >
                {note.emoji ? (
                  <span className="text-xl leading-none" aria-hidden="true">
                    {note.emoji}
                  </span>
                ) : (
                  <FileText className="w-5 h-5 text-white" aria-hidden="true" />
                )}
                <div
                  aria-hidden="true"
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-r-2 border-b-2 border-white"
                  style={{ backgroundColor: note.color || '#10b981' }}
                />
              </button>
            </AdvancedMarker>
          );
        }

        if (item.kind === 'coincident') {
          const leadNote = item.notes[0];
          const pinColor = leadNote?.color || '#0d9488';
          const ariaLabel = t('cluster.coincident_aria', {
            count: item.noteCount,
            defaultValue: `${item.noteCount} notes at this exact location. Activate to view list.`,
          });

          return (
            <AdvancedMarker
              key={item.id}
              position={item.position}
              clickable={true}
              zIndex={20}
              onClick={() => handleOpenCoincidentGroup(item)}
            >
              <button
                type="button"
                aria-label={ariaLabel}
                data-testid={`marker-coincident-${item.coordKey}`}
                className="relative group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d9488] focus-visible:ring-offset-2 rounded-full"
              >
                {/* Stacked pin layer behind primary pin */}
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-1 w-10 h-10 rounded-full bg-white/90 border-2 border-stone-200 shadow-md rotate-6 transition-transform group-hover:rotate-12"
                />
                <div
                  className="relative flex items-center justify-center w-11 h-11 rounded-full shadow-xl border-2 border-white transition-transform group-hover:scale-110 group-active:scale-95"
                  style={{ backgroundColor: pinColor }}
                >
                  {leadNote?.emoji ? (
                    <span className="text-xl leading-none" aria-hidden="true">
                      {leadNote.emoji}
                    </span>
                  ) : (
                    <Layers className="w-5 h-5 text-white" aria-hidden="true" />
                  )}
                  <div
                    aria-hidden="true"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 border-r-2 border-b-2 border-white"
                    style={{ backgroundColor: pinColor }}
                  />
                </div>
                <span
                  aria-hidden="true"
                  className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#081e2b] text-white text-[11px] font-black leading-none flex items-center justify-center border-2 border-white shadow-lg tabular-nums"
                >
                  {item.noteCount}
                </span>
              </button>
            </AdvancedMarker>
          );
        }

        // Spatial cluster
        const sizeClass =
          item.noteCount >= 100
            ? 'w-14 h-14 text-sm'
            : item.noteCount >= 10
              ? 'w-12 h-12 text-xs'
              : 'w-11 h-11 text-xs';
        const ariaLabel = t('cluster.cluster_aria', {
          count: item.noteCount,
          defaultValue: `Cluster of ${item.noteCount} notes. Activate to zoom in.`,
        });

        return (
          <AdvancedMarker
            key={item.id}
            position={item.position}
            clickable={true}
            zIndex={25}
            onClick={() => handleClusterClick(item)}
          >
            <button
              type="button"
              aria-label={ariaLabel}
              data-testid={`marker-cluster-${item.id}`}
              className={`relative flex items-center justify-center ${sizeClass} rounded-full bg-[#081e2b] text-white font-black border-2 border-white ring-4 ring-[#0d9488]/30 shadow-xl transition-transform hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a88f] focus-visible:ring-offset-2 cursor-pointer tabular-nums`}
            >
              <span aria-hidden="true">{item.noteCount}</span>
            </button>
          </AdvancedMarker>
        );
      })}

      <ClusterNotesSheet
        isOpen={isGroupSheetOpen}
        notes={activeGroupNotes}
        user={user}
        onSelectNote={handleSelectNoteFromGroup}
        onClose={handleCloseGroupSheet}
        returnFocusElement={activeGroup?.triggerElement ?? null}
      />

      {resolvedSelectedNote && (
        <InfoWindow
          position={resolvedSelectedNote.location}
          onCloseClick={() => {
            setSelectedNote(null);
            setLastGroupContext(null);
          }}
        >
          <div className="p-3 max-w-[280px] max-h-[320px] overflow-y-auto scrollbar-thin">
            {lastGroupContext && lastGroupNotes.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedNote(null);
                  setActiveGroup(lastGroupContext);
                }}
                className="mb-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50 hover:bg-teal-100 text-[#0d9488] text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d9488]"
              >
                <ArrowLeft className="w-3 h-3" aria-hidden="true" />
                <span>
                  {t('cluster.back_to_list', {
                    count: lastGroupNotes.length,
                    defaultValue: `Back to ${lastGroupNotes.length} notes`,
                  })}
                </span>
              </button>
            )}

            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-stone-100">
              <div className="flex-1 min-w-0">
                <p className="text-[8px] text-stone-400 uppercase tracking-tighter">
                  {t('anchor.created_by')}
                </p>
                <p className="text-[10px] font-bold text-stone-900 truncate">
                  {user && resolvedSelectedNote.authorId === user.uid
                    ? t('qr.view.you')
                    : resolvedSelectedNote.authorName || 'Explorer'}
                </p>
              </div>
              {resolvedSelectedNote.privacy === 'private' ? (
                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded text-[8px] font-bold">
                  <Lock className="w-2.5 h-2.5" />
                  {t('creator.private')}
                </div>
              ) : resolvedSelectedNote.privacy === 'unlisted' ? (
                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded text-[8px] font-bold">
                  <Link className="w-2.5 h-2.5" />
                  UNLISTED
                </div>
              ) : (
                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[8px] font-bold">
                  <Globe className="w-2.5 h-2.5" />
                  {t('creator.public')}
                </div>
              )}
            </div>
            {selectedNoteGroup && (
              <div className="mb-2">
                <span
                  data-testid="info-window-group-badge"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-[#0d9488] border border-teal-100 text-[10px] font-bold max-w-full truncate"
                >
                  <Folder className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{selectedNoteGroup}</span>
                </span>
              </div>
            )}
            <div className="text-sm text-stone-800 font-medium leading-relaxed">
              <RichTextViewer
                content={resolvedSelectedNote.content || ''}
                contentFormat={resolvedSelectedNote.contentFormat}
                variant="compact"
                tone="light"
                stopLinkPropagation
              />
            </div>
            <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-stone-100/50">
              <p className="text-[10px] text-stone-400">
                {resolvedSelectedNote.createdAt?.toDate
                  ? resolvedSelectedNote.createdAt.toDate().toLocaleDateString()
                  : '—'}
              </p>
              {resolvedSelectedNote.language && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-stone-100 rounded text-[9px] font-bold text-stone-500 uppercase tracking-wider shrink-0">
                  <Languages className="w-2.5 h-2.5" />
                  {SUPPORTED_LANGUAGES.find((l) => l.code === resolvedSelectedNote.language)?.label ||
                    resolvedSelectedNote.language}
                </div>
              )}
            </div>
            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-start gap-3">
                <SpeechButton
                  text={resolvedSelectedNote.content || ''}
                  language={resolvedSelectedNote.language}
                  contentFormat={resolvedSelectedNote.contentFormat}
                  className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 p-2.5"
                />
                <button
                  onClick={() => {
                    logAnalyticsEvent('comments_open', { note_id: resolvedSelectedNote.id });
                    onShowComments(resolvedSelectedNote);
                  }}
                  className="p-2.5 bg-sky-50 hover:bg-sky-100 text-sky-600 rounded-full transition-colors flex items-center justify-center"
                  title={t('comments.reply')}
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onGenerateQRCode(resolvedSelectedNote.id)}
                  className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full transition-colors flex items-center justify-center"
                  title={t('anchor.generate_qr')}
                >
                  <QrCode className="w-4 h-4" />
                </button>
                <button
                  onClick={() => copyToClipboard(resolvedSelectedNote.id)}
                  className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full transition-colors flex items-center justify-center"
                  title={t('anchor.share_link')}
                >
                  {copyStatus === resolvedSelectedNote.id ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Share2 className="w-4 h-4" />
                  )}
                </button>
                {user && (
                  <>
                    {resolvedSelectedNote.authorId === user.uid && (
                      <button
                        onClick={() => {
                          setEditingNote(resolvedSelectedNote);
                          setSelectedNote(null);
                        }}
                        className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full transition-colors flex items-center justify-center"
                        title={t('anchor.edit_note')}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {resolvedSelectedNote.authorId === user.uid && (
                      <button
                        onClick={() => setDeleteId(resolvedSelectedNote.id)}
                        className="p-2.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-full transition-colors flex items-center justify-center"
                        title={t('anchor.delete_note')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    {flags.enableModeration && (
                      <button
                        onClick={() => onReportNote(resolvedSelectedNote)}
                        className="p-2.5 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-full transition-colors flex items-center justify-center"
                        title="Report Note"
                      >
                        <AlertTriangle className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};
