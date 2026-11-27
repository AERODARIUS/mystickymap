import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Timestamp } from 'firebase/firestore';
import { NoteCreator } from '../NoteCreator';
import { AnchorView } from '../AnchorView';
import { ClusterNotesSheet } from '../ClusterNotesSheet';
import { CommentsView } from '../CommentsView';
import { AdminNotesManager } from '../AdminNotesManager';
import { Note } from '../../types';

const mockAddDoc = vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(async () => ({ id: 'created-note-id' }));
const mockUpdateDoc = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
const mockDeleteDoc = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
const mockDoc = vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}`, id }));
const mockCollection = vi.fn((_db: unknown, col: string) => ({ path: col }));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    addDoc: (...args: unknown[]) => mockAddDoc(...args),
    updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
    deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
    doc: (dbArg: unknown, col: string, id: string) => mockDoc(dbArg, col, id),
    collection: (dbArg: unknown, col: string) => mockCollection(dbArg, col),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOpts?: string | Record<string, unknown>) => {
      const dict: Record<string, string> = {
        'creator.new_note': 'Nueva Nota',
        'creator.edit_note': 'Editar Nota',
        'creator.enable_expiration': 'Establecer fecha de expiración',
        'creator.visible_until': 'Visible hasta',
        'creator.expiration_helper': 'La nota dejará de mostrarse públicamente después de esta fecha.',
        'creator.expiration_required': 'Selecciona una fecha de expiración.',
        'creator.expiration_invalid': 'Ingresa una fecha válida.',
        'creator.expiration_past': 'La fecha de expiración debe ser futura.',
        'creator.expired_edit_notice': 'Esta nota está vencida y oculta al público.',
        'expiration.expired_badge': 'Vencida',
        'expiration.expired_on': 'Venció el',
        'expiration.visible_until_short': 'Visible hasta',
        'anchor.title': 'Notas Cercanas',
        'anchor.tab_nearby': 'Cercanas',
        'anchor.tab_my_notes': 'Mis notas',
        'anchor.renew_note': 'Renovar',
        'anchor.edit_note': 'Editar Nota',
        'anchor.delete_note': 'Borrar Nota',
        'anchor.no_notes': 'No se encontraron notas',
        'anchor.no_my_notes': 'No tienes notas',
        'anchor.search_placeholder': 'Buscar...',
        'anchor.radius_label': 'Radio',
        'anchor.away': 'de distancia',
        'creator.public': 'PÚBLICA',
        'creator.private': 'PRIVADA',
      };
      if (dict[key]) return dict[key];
      if (typeof fallbackOrOpts === 'string') return fallbackOrOpts;
      if (fallbackOrOpts && typeof fallbackOrOpts.defaultValue === 'string') {
        return fallbackOrOpts.defaultValue;
      }
      return key;
    },
    i18n: { language: 'es-ES' },
  }),
}));

vi.mock('../../hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({
    flags: {
      enableARView: true,
      enableAudioNotes: false,
      enableEmojiPins: true,
      enableQRScanner: true,
      enableComments: true,
      enableModeration: false,
      maxNoteLength: 1000,
    },
    loading: false,
  }),
}));

vi.mock('../../firebase', () => ({
  db: { _mock: true },
  auth: {
    currentUser: {
      uid: 'owner-1',
      displayName: 'Test Explorer',
      emailVerified: true,
    },
  },
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list', GET: 'get', WRITE: 'write' },
  serverTimestamp: () => ({ _type: 'serverTimestamp' }),
  logAnalyticsEvent: vi.fn(),
}));

vi.mock('../../hooks/useComments', () => ({
  useComments: () => ({
    comments: [],
    loading: false,
    addComment: vi.fn(),
    deleteComment: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('NoteCreator optional expiration & renewal UI flows', () => {
  it('defaults expiration to disabled and creates a note with expiresAt: null', async () => {
    const onCreated = vi.fn();
    render(
      <NoteCreator
        draftLocation={{ lat: -34.9011, lng: -56.1645 }}
        color="#0d9488"
        setColor={vi.fn()}
        emoji="📝"
        setEmoji={vi.fn()}
        content="Nota sin vencimiento"
        setContent={vi.fn()}
        contentFormat="plain"
        setContentFormat={vi.fn()}
        onNoteCreated={onCreated}
      />
    );

    const toggle = screen.getByLabelText(/Establecer fecha de expiración/i) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.queryByLabelText(/Visible hasta/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Place Note/i }));

    await waitFor(() => {
      expect(mockAddDoc).toHaveBeenCalledTimes(1);
    });
    const payload = mockAddDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.expiresAt).toBeNull();
    expect(payload.content).toBe('Nota sin vencimiento');
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it('creates a note with a valid future expiration date converted to UTC end-of-day in America/Montevideo', async () => {
    render(
      <NoteCreator
        draftLocation={{ lat: -34.9011, lng: -56.1645 }}
        color="#0d9488"
        setColor={vi.fn()}
        emoji="📝"
        setEmoji={vi.fn()}
        content="Evento temporal"
        setContent={vi.fn()}
        contentFormat="plain"
        setContentFormat={vi.fn()}
        onNoteCreated={vi.fn()}
      />
    );

    const toggle = screen.getByLabelText(/Establecer fecha de expiración/i);
    fireEvent.click(toggle);

    expect(
      screen.getByText('La nota dejará de mostrarse públicamente después de esta fecha.')
    ).toBeInTheDocument();

    const dateInput = screen.getByLabelText(/Visible hasta/i);
    fireEvent.change(dateInput, { target: { value: '2099-12-20' } });

    fireEvent.click(screen.getByRole('button', { name: /Place Note/i }));

    await waitFor(() => {
      expect(mockAddDoc).toHaveBeenCalledTimes(1);
    });
    const payload = mockAddDoc.mock.calls[0]?.[1] as { expiresAt: Timestamp };
    expect(payload.expiresAt).toBeInstanceOf(Timestamp);
    expect(payload.expiresAt.toDate().toISOString()).toBe('2099-12-21T02:59:59.999Z');
  });

  it('rejects past expiration dates and missing date when expiration is enabled', async () => {
    render(
      <NoteCreator
        draftLocation={{ lat: -34.9011, lng: -56.1645 }}
        color="#0d9488"
        setColor={vi.fn()}
        emoji="📝"
        setEmoji={vi.fn()}
        content="Nota con fecha inválida"
        setContent={vi.fn()}
        contentFormat="plain"
        setContentFormat={vi.fn()}
        onNoteCreated={vi.fn()}
      />
    );

    const toggle = screen.getByLabelText(/Establecer fecha de expiración/i);
    fireEvent.click(toggle);

    // Submitting with empty date shows required error and blocks submit
    fireEvent.click(screen.getByRole('button', { name: /Place Note/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Selecciona una fecha de expiración.');
    expect(mockAddDoc).not.toHaveBeenCalled();

    // Entering past date shows past-date error and disables submit
    const dateInput = screen.getByLabelText(/Visible hasta/i);
    fireEvent.change(dateInput, { target: { value: '2020-01-15' } });
    expect(screen.getByRole('alert')).toHaveTextContent('La fecha de expiración debe ser futura.');
    expect(screen.getByRole('button', { name: /Place Note/i })).toBeDisabled();
  });

  it('opens legacy note without expiration disabled, and renews expired note preserving note ID & identity', async () => {
    const legacyNote: Note = {
      id: 'legacy-note-42',
      type: 'text',
      content: 'Nota legacy sin expiresAt',
      contentFormat: 'plain',
      location: { lat: -34.9011, lng: -56.1645 },
      authorId: 'owner-1',
      authorName: 'Test Explorer',
      privacy: 'public',
      createdAt: Timestamp.fromMillis(Date.UTC(2025, 0, 1, 10, 0, 0)),
    };

    const { unmount } = render(
      <NoteCreator
        draftLocation={legacyNote.location}
        color="#0d9488"
        setColor={vi.fn()}
        emoji="📝"
        setEmoji={vi.fn()}
        editingNote={legacyNote}
      />
    );

    expect((screen.getByLabelText(/Establecer fecha de expiración/i) as HTMLInputElement).checked).toBe(false);
    unmount();

    // Now edit & renew an expired note
    const expiredNote: Note = {
      ...legacyNote,
      id: 'expired-note-99',
      content: 'Promoción vencida',
      expiresAt: Timestamp.fromMillis(Date.UTC(2024, 5, 1, 2, 59, 59)),
    };

    render(
      <NoteCreator
        draftLocation={expiredNote.location}
        color="#0d9488"
        setColor={vi.fn()}
        emoji="📝"
        setEmoji={vi.fn()}
        editingNote={expiredNote}
        onNoteCreated={vi.fn()}
      />
    );

    expect(screen.getByText('Vencida')).toBeInTheDocument();
    expect((screen.getByLabelText(/Establecer fecha de expiración/i) as HTMLInputElement).checked).toBe(true);

    const dateInput = screen.getByLabelText(/Visible hasta/i);
    fireEvent.change(dateInput, { target: { value: '2099-08-10' } });

    fireEvent.click(screen.getByRole('button', { name: /Place Note/i }));

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    });
    expect(mockAddDoc).not.toHaveBeenCalled();
    expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'notes', 'expired-note-99');

    const updatePayload = mockUpdateDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect((updatePayload.expiresAt as Timestamp).toDate().toISOString()).toBe('2099-08-11T02:59:59.999Z');
    // Original createdAt is preserved (not reset in updates)
    expect(updatePayload).not.toHaveProperty('createdAt');
    expect(updatePayload.location).toEqual(expiredNote.location);
    expect(updatePayload.content).toBe('Promoción vencida');
  });

  it('allows author to remove expiration completely when editing an expiring note', async () => {
    const expiringNote: Note = {
      id: 'expiring-note-7',
      type: 'text',
      content: 'Aviso con vencimiento',
      contentFormat: 'plain',
      location: { lat: -34.9011, lng: -56.1645 },
      authorId: 'owner-1',
      authorName: 'Test Explorer',
      privacy: 'public',
      createdAt: Timestamp.fromMillis(Date.UTC(2026, 0, 1, 10, 0, 0)),
      expiresAt: Timestamp.fromDate(new Date('2099-05-02T02:59:59.999Z')),
    };

    render(
      <NoteCreator
        draftLocation={expiringNote.location}
        color="#0d9488"
        setColor={vi.fn()}
        emoji="📝"
        setEmoji={vi.fn()}
        editingNote={expiringNote}
        onNoteCreated={vi.fn()}
      />
    );

    const toggle = screen.getByLabelText(/Establecer fecha de expiración/i) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect((screen.getByLabelText(/Visible hasta/i) as HTMLInputElement).value).toBe('2099-05-01');

    // Uncheck to remove expiration
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(screen.queryByLabelText(/Visible hasta/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Place Note/i }));

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    });
    const updatePayload = mockUpdateDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(updatePayload.expiresAt).toBeNull();
  });
});

describe('AnchorView owner management for expired notes', () => {
  it('displays expired notes under Mis notas with Vencida badge and Renovar action', () => {
    const onEdit = vi.fn();
    const activePublicNote: Note = {
      id: 'active-1',
      type: 'text',
      content: 'Nota activa cercana',
      contentFormat: 'plain',
      location: { lat: -34.9011, lng: -56.1645 },
      authorId: 'other-user',
      authorName: 'Vecino',
      privacy: 'public',
      createdAt: Timestamp.fromMillis(Date.UTC(2026, 1, 1)),
      expiresAt: null,
    };

    const ownerExpiredNote: Note = {
      id: 'owner-exp-1',
      type: 'text',
      content: 'Búsqueda laboral finalizada',
      contentFormat: 'plain',
      location: { lat: -34.85, lng: -56.10 }, // outside 1km radius too
      authorId: 'owner-1',
      authorName: 'Test Explorer',
      privacy: 'public',
      createdAt: Timestamp.fromMillis(Date.UTC(2025, 10, 1)),
      expiresAt: Timestamp.fromMillis(Date.UTC(2025, 11, 20)),
    };

    render(
      <AnchorView
        notes={[activePublicNote]}
        myNotes={[ownerExpiredNote]}
        userLocation={{ lat: -34.9011, lng: -56.1645 }}
        user={{ uid: 'owner-1', displayName: 'Test Explorer' } as never}
        setEditingNote={onEdit}
        onFocusNote={vi.fn()}
        copyToClipboard={vi.fn()}
        copyStatus={null}
        onGenerateQRCode={vi.fn()}
        onShowComments={vi.fn()}
        onReportNote={vi.fn()}
      />
    );

    // Public Nearby view shows active note and NOT expired note
    expect(screen.getByText('Nota activa cercana')).toBeInTheDocument();
    expect(screen.queryByText('Búsqueda laboral finalizada')).not.toBeInTheDocument();

    // Switch to Mis notas tab -> owner sees expired note even outside radius with Vencida badge & Renovar button, without expiration date
    fireEvent.click(screen.getByRole('tab', { name: /Mis notas/i }));
    expect(screen.getByText('Búsqueda laboral finalizada')).toBeInTheDocument();
    expect(screen.getByText('Vencida')).toBeInTheDocument();
    expect(screen.queryByText(/Venció el/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Visible hasta/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dic/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Renovar/i }));
    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'owner-exp-1',
        content: 'Búsqueda laboral finalizada',
        expiresAt: ownerExpiredNote.expiresAt,
      })
    );
  });

  it('hides expiration date in AnchorView active notes, ClusterNotesSheet, CommentsView, and AdminNotesManager', () => {
    const expiringNote: Note = {
      id: 'expiring-note-1',
      type: 'text',
      content: 'Evento con vencimiento oculto',
      contentFormat: 'plain',
      location: { lat: -34.9011, lng: -56.1645 },
      authorId: 'other-user',
      authorName: 'Organizador',
      privacy: 'public',
      createdAt: Timestamp.fromMillis(Date.UTC(2026, 1, 1)),
      expiresAt: Timestamp.fromDate(new Date('2099-12-21T02:59:59.999Z')),
    };

    const { unmount: unmountAnchor } = render(
      <AnchorView
        notes={[expiringNote]}
        myNotes={[]}
        userLocation={{ lat: -34.9011, lng: -56.1645 }}
        user={{ uid: 'owner-1', displayName: 'Test Explorer' } as never}
        setEditingNote={vi.fn()}
        onFocusNote={vi.fn()}
        copyToClipboard={vi.fn()}
        copyStatus={null}
        onGenerateQRCode={vi.fn()}
        onShowComments={vi.fn()}
        onReportNote={vi.fn()}
      />
    );
    expect(screen.getByText('Evento con vencimiento oculto')).toBeInTheDocument();
    expect(screen.queryByText(/Visible hasta/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/2099/)).not.toBeInTheDocument();
    unmountAnchor();

    const { unmount: unmountCluster } = render(
      <ClusterNotesSheet
        isOpen={true}
        notes={[expiringNote]}
        user={null}
        onSelectNote={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Evento con vencimiento oculto')).toBeInTheDocument();
    expect(screen.queryByText(/Visible/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/2099/)).not.toBeInTheDocument();
    unmountCluster();

    const { unmount: unmountComments } = render(
      <CommentsView
        note={expiringNote}
        isOpen={true}
        user={null}
        onClose={vi.fn()}
        onReportComment={vi.fn()}
        onReportNote={vi.fn()}
      />
    );
    expect(screen.getByText('Evento con vencimiento oculto')).toBeInTheDocument();
    expect(screen.queryByText(/Visible hasta/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/2099/)).not.toBeInTheDocument();
    unmountComments();

    render(
      <AdminNotesManager
        notes={[expiringNote]}
        loading={false}
        error={null}
      />
    );
    expect(screen.getByText('Evento con vencimiento oculto')).toBeInTheDocument();
    expect(screen.queryByText(/2099/)).not.toBeInTheDocument();
  });
});
