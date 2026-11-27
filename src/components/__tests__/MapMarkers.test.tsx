import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Timestamp } from 'firebase/firestore';
import { MapMarkers } from '../MapMarkers';
import { MapController } from '../MapController';
import { AnchorView } from '../AnchorView';
import { Note } from '../../types';

// --- Controlled Google Maps SDK Boundary Mock ---
let mockZoom = 15;
let mockBounds: {
  getNorthEast: () => { lat: () => number; lng: () => number };
  getSouthWest: () => { lat: () => number; lng: () => number };
} | null = null;

type IdleCallback = () => void;
let idleListeners: IdleCallback[] = [];

const mockPanTo = vi.fn();
const mockSetCenter = vi.fn();
const mockSetZoom = vi.fn((z: number) => {
  mockZoom = z;
});
const mockFitBounds = vi.fn();
const mockGetZoom = vi.fn(() => mockZoom);
const mockGetBounds = vi.fn(() => mockBounds);
const mockGetCenter = vi.fn(() => ({ lat: () => -34.9011, lng: () => -56.1645 }));
const mockAddListener = vi.fn((event: string, cb: IdleCallback) => {
  if (event === 'idle') {
    idleListeners.push(cb);
  }
  return {
    remove: () => {
      idleListeners = idleListeners.filter((fn) => fn !== cb);
    },
  };
});

const mockMapInstance = {
  panTo: mockPanTo,
  setCenter: mockSetCenter,
  setZoom: mockSetZoom,
  fitBounds: mockFitBounds,
  getZoom: mockGetZoom,
  getBounds: mockGetBounds,
  getCenter: mockGetCenter,
  addListener: mockAddListener,
};

function triggerMapIdle(nextZoom?: number) {
  if (typeof nextZoom === 'number') {
    mockZoom = nextZoom;
  }
  act(() => {
    for (const cb of [...idleListeners]) {
      cb();
    }
  });
}

vi.mock('@vis.gl/react-google-maps', () => ({
  useMap: () => mockMapInstance,
  AdvancedMarker: ({
    children,
    onClick,
    draggable,
    position,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    draggable?: boolean;
    position?: { lat: number; lng: number };
  }) => (
    <div
      data-testid="advanced-marker"
      data-lat={position?.lat}
      data-lng={position?.lng}
      data-draggable={draggable ? 'true' : 'false'}
      onClick={onClick}
    >
      {children}
    </div>
  ),
  InfoWindow: ({
    children,
    onCloseClick,
    position,
  }: {
    children?: React.ReactNode;
    onCloseClick?: () => void;
    position?: { lat: number; lng: number };
  }) => (
    <div
      role="region"
      aria-label="InfoWindow"
      data-testid="info-window"
      data-lat={position?.lat}
      data-lng={position?.lng}
    >
      <button type="button" onClick={onCloseClick} aria-label="Close InfoWindow">
        ×
      </button>
      {children}
    </div>
  ),
}));

const mockLogAnalyticsEvent = vi.fn();
const mockDeleteDoc = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
const mockDoc = vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}`, id }));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
    doc: (dbArg: unknown, col: string, id: string) => mockDoc(dbArg, col, id),
  };
});

vi.mock('../../firebase', () => ({
  db: { _mock: true },
  handleFirestoreError: vi.fn(),
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  },
  logAnalyticsEvent: (...args: unknown[]) => mockLogAnalyticsEvent(...args),
}));

vi.mock('../../hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({
    flags: {
      enableARView: true,
      enableAudioNotes: true,
      enableEmojiPins: true,
      enableQRScanner: true,
      enableComments: true,
      enableModeration: true,
      maxNoteLength: 1000,
    },
    loading: false,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, optsOrFallback?: string | Record<string, unknown>) => {
      if (typeof optsOrFallback === 'string') return optsOrFallback;
      if (optsOrFallback && typeof optsOrFallback.defaultValue === 'string') {
        return optsOrFallback.defaultValue;
      }
      const dict: Record<string, string> = {
        'anchor.created_by': 'Creado por',
        'qr.view.you': 'Tú',
        'creator.public': 'PÚBLICA',
        'creator.private': 'PRIVADA',
        'anchor.edit_note': 'Editar Nota',
        'anchor.delete_note': 'Borrar Nota',
        'anchor.delete_confirm': '¿Estás seguro de que deseas borrar esta nota?',
        'anchor.generate_qr': 'Generar Código QR',
        'anchor.share_link': 'Compartir Enlace',
        'anchor.view_on_map': 'Ver en el Mapa',
        'comments.reply': 'Responder',
      };
      return dict[key] || key;
    },
    i18n: { language: 'es-ES' },
  }),
}));

function buildNote(id: string, lat: number, lng: number, overrides: Partial<Note> = {}): Note {
  return {
    id,
    type: 'text',
    content: `Oferta laboral ${id}`,
    contentFormat: 'plain',
    location: { lat, lng },
    authorId: 'user-other',
    authorName: `Empresa ${id}`,
    privacy: 'public',
    createdAt: Timestamp.fromMillis(1_700_000_000_000 + Number(id.replace(/\D/g, '') || 0)),
    color: '#0d9488',
    emoji: '💼',
    ...overrides,
  };
}

function renderMarkers(props: Partial<React.ComponentProps<typeof MapMarkers>> = {}) {
  const defaultProps: React.ComponentProps<typeof MapMarkers> = {
    user: { uid: 'user-1', displayName: 'Tester' } as never,
    notes: [],
    userLocation: null,
    isCreating: false,
    editingNote: null,
    placementStep: 'editing_content',
    draftLocation: null,
    draftColor: '#0d9488',
    draftEmoji: '📝',
    selectedNote: null,
    copyStatus: null,
    setDraftLocation: vi.fn(),
    setSelectedNote: vi.fn(),
    setEditingNote: vi.fn(),
    copyToClipboard: vi.fn(),
    onGenerateQRCode: vi.fn(),
    onShowComments: vi.fn(),
    onReportNote: vi.fn(),
    ...props,
  };

  return render(<MapMarkers {...defaultProps} />);
}

describe('MapMarkers clustering, coincident coordinates, and InfoWindow preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockZoom = 15;
    mockBounds = null;
    idleListeners = [];
  });

  afterEach(() => {
    cleanup();
  });

  it('handles empty notes list without markers or errors', () => {
    renderMarkers({ notes: [] });
    expect(screen.queryAllByTestId('advanced-marker')).toHaveLength(0);
    expect(screen.queryByTestId('info-window')).not.toBeInTheDocument();
  });

  it('renders a single note at a location and logs note_view on selection', () => {
    const note = buildNote('n-1', -34.9011, -56.1645);
    const setSelectedNote = vi.fn();

    renderMarkers({ notes: [note], setSelectedNote });

    const markerBtn = screen.getByTestId('marker-single-n-1');
    expect(markerBtn).toBeInTheDocument();

    fireEvent.click(markerBtn);
    expect(setSelectedNote).toHaveBeenCalledWith(note);
    expect(mockLogAnalyticsEvent).toHaveBeenCalledWith('note_view', {
      note_id: 'n-1',
      mode: 'map_marker',
      privacy: 'public',
    });
  });

  it('collapses multiple notes with identical coordinates into one coincident marker with accurate count and opens a selectable list', () => {
    const shared = { lat: -34.9058, lng: -56.1913 };
    const notes = [
      buildNote('1', shared.lat, shared.lng, { content: 'Desarrollador Frontend' }),
      buildNote('2', shared.lat, shared.lng, { content: 'Diseñador UX/UI' }),
      buildNote('3', shared.lat, shared.lng, { content: 'Analista QA' }),
    ];

    const Wrapper = () => {
      const [selected, setSelected] = React.useState<Note | null>(null);
      return (
        <MapMarkers
          user={{ uid: 'user-1', displayName: 'Tester' } as never}
          notes={notes}
          userLocation={null}
          isCreating={false}
          editingNote={null}
          draftLocation={null}
          draftColor="#0d9488"
          draftEmoji="📝"
          selectedNote={selected}
          copyStatus={null}
          setDraftLocation={vi.fn()}
          setSelectedNote={setSelected}
          setEditingNote={vi.fn()}
          copyToClipboard={vi.fn()}
          onGenerateQRCode={vi.fn()}
          onShowComments={vi.fn()}
          onReportNote={vi.fn()}
        />
      );
    };

    render(<Wrapper />);

    // Only 1 AdvancedMarker is rendered for all 3 coincident notes (no overlapping pins)
    expect(screen.getAllByTestId('advanced-marker')).toHaveLength(1);
    const coincidentPin = screen.getByTestId('marker-coincident--34.905800,-56.191300');
    expect(coincidentPin).toHaveTextContent('3');

    // Opening the group list must NOT log note_view
    coincidentPin.focus();
    fireEvent.click(coincidentPin);
    expect(mockLogAnalyticsEvent).not.toHaveBeenCalledWith('note_view', expect.anything());

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('3 notes at this location')).toBeInTheDocument();

    // All 3 notes are individually accessible and selectable
    expect(within(dialog).getByText('Desarrollador Frontend')).toBeInTheDocument();
    expect(within(dialog).getByText('Diseñador UX/UI')).toBeInTheDocument();
    expect(within(dialog).getByText('Analista QA')).toBeInTheDocument();

    // Select the middle note ("Diseñador UX/UI")
    fireEvent.click(within(dialog).getByText('Diseñador UX/UI'));

    // Group dialog closes, InfoWindow opens for that note, and note_view is logged
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const infoWindow = screen.getByTestId('info-window');
    expect(within(infoWindow).getByText('Diseñador UX/UI')).toBeInTheDocument();
    expect(mockLogAnalyticsEvent).toHaveBeenCalledWith('note_view', {
      note_id: '2',
      mode: 'cluster_list',
      privacy: 'public',
    });

    // Can return back to the group list from InfoWindow to pick another note
    fireEvent.click(within(infoWindow).getByRole('button', { name: /Back to 3 notes/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Analista QA'));
    expect(within(screen.getByTestId('info-window')).getByText('Analista QA')).toBeInTheDocument();
  });

  it('supports large groups (e.g., 120 coincident notes) with search filtering and incremental pagination', () => {
    const shared = { lat: -34.9011, lng: -56.1645 };
    const manyNotes = Array.from({ length: 120 }, (_, idx) =>
      buildNote(`job-${idx + 1}`, shared.lat, shared.lng, {
        content: idx === 115 ? 'Arquitecto Cloud Senior' : `Puesto operativo #${idx + 1}`,
        authorName: idx === 115 ? 'TechUruguay' : `Empresa ${idx + 1}`,
      })
    );

    const setSelectedNote = vi.fn();
    renderMarkers({ notes: manyNotes, setSelectedNote });

    const pin = screen.getByTestId('marker-coincident--34.901100,-56.164500');
    expect(pin).toHaveTextContent('120');

    fireEvent.click(pin);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('120 notes at this location')).toBeInTheDocument();

    // Pagination initially renders 80 items and offers "Show 40 more"
    const showMoreBtn = within(dialog).getByRole('button', { name: /Show 40 more/i });
    expect(showMoreBtn).toBeInTheDocument();

    // Filter finds note #116 immediately without needing manual pagination
    const searchInput = within(dialog).getByRole('searchbox');
    fireEvent.change(searchInput, { target: { value: 'Arquitecto Cloud' } });
    expect(within(dialog).getByText('Arquitecto Cloud Senior')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByText('Arquitecto Cloud Senior'));
    expect(setSelectedNote).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-116', content: 'Arquitecto Cloud Senior' })
    );
  });

  it('closes the group list via Escape key and close button and restores focus', () => {
    const shared = { lat: -34.9011, lng: -56.1645 };
    const notes = [
      buildNote('1', shared.lat, shared.lng),
      buildNote('2', shared.lat, shared.lng),
    ];

    renderMarkers({ notes });
    const pin = screen.getByTestId('marker-coincident--34.901100,-56.164500');
    pin.focus();
    fireEvent.click(pin);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Close with Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(pin);

    // Reopen and close with close button
    fireEvent.click(pin);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close group list' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('updates clusters and open group list dynamically when notes prop changes', () => {
    const shared = { lat: -34.9011, lng: -56.1645 };
    const initialNotes = [
      buildNote('1', shared.lat, shared.lng, { content: 'Nota inicial 1' }),
      buildNote('2', shared.lat, shared.lng, { content: 'Nota inicial 2' }),
    ];

    const { rerender } = render(
      <MapMarkers
        user={null}
        notes={initialNotes}
        userLocation={null}
        isCreating={false}
        editingNote={null}
        draftLocation={null}
        draftColor="#0d9488"
        draftEmoji="📝"
        selectedNote={null}
        copyStatus={null}
        setDraftLocation={vi.fn()}
        setSelectedNote={vi.fn()}
        setEditingNote={vi.fn()}
        copyToClipboard={vi.fn()}
        onGenerateQRCode={vi.fn()}
        onShowComments={vi.fn()}
        onReportNote={vi.fn()}
      />
    );

    const pin = screen.getByTestId('marker-coincident--34.901100,-56.164500');
    expect(pin).toHaveTextContent('2');
    fireEvent.click(pin);
    expect(within(screen.getByRole('dialog')).getByText('2 notes at this location')).toBeInTheDocument();

    // Add a 3rd note at the same coordinate while the list is open
    const updatedNotes = [
      ...initialNotes,
      buildNote('3', shared.lat, shared.lng, { content: 'Nueva oferta agregada' }),
    ];

    rerender(
      <MapMarkers
        user={null}
        notes={updatedNotes}
        userLocation={null}
        isCreating={false}
        editingNote={null}
        draftLocation={null}
        draftColor="#0d9488"
        draftEmoji="📝"
        selectedNote={null}
        copyStatus={null}
        setDraftLocation={vi.fn()}
        setSelectedNote={vi.fn()}
        setEditingNote={vi.fn()}
        copyToClipboard={vi.fn()}
        onGenerateQRCode={vi.fn()}
        onShowComments={vi.fn()}
        onReportNote={vi.fn()}
      />
    );

    expect(within(screen.getByRole('dialog')).getByText('3 notes at this location')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByText('Nueva oferta agregada')).toBeInTheDocument();

    // Removing all notes closes the open list cleanly
    rerender(
      <MapMarkers
        user={null}
        notes={[]}
        userLocation={null}
        isCreating={false}
        editingNote={null}
        draftLocation={null}
        draftColor="#0d9488"
        draftEmoji="📝"
        selectedNote={null}
        copyStatus={null}
        setDraftLocation={vi.fn()}
        setSelectedNote={vi.fn()}
        setEditingNote={vi.fn()}
        copyToClipboard={vi.fn()}
        onGenerateQRCode={vi.fn()}
        onShowComments={vi.fn()}
        onReportNote={vi.fn()}
      />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clusters distinct locations on zoom out, zooms map when clicking spatial cluster, and separates on zoom in', () => {
    const n1 = buildNote('d1', -34.9011, -56.1645);
    const n2 = buildNote('d2', -34.9058, -56.1913); // ~2.5km away

    // At zoom 15, they are far apart (>58px) -> 2 separate markers
    mockZoom = 15;
    renderMarkers({ notes: [n1, n2] });
    expect(screen.getByTestId('marker-single-d1')).toBeInTheDocument();
    expect(screen.getByTestId('marker-single-d2')).toBeInTheDocument();

    // Zoom out to zoom 9 -> they merge into 1 spatial cluster showing 2
    triggerMapIdle(9);
    expect(screen.queryByTestId('marker-single-d1')).not.toBeInTheDocument();
    const clusterBtn = screen.getByRole('button', { name: /Cluster of 2 notes/i });
    expect(clusterBtn).toHaveTextContent('2');

    // Clicking spatial cluster calls fitBounds to zoom in (and does NOT log note_view)
    fireEvent.click(clusterBtn);
    expect(mockFitBounds).toHaveBeenCalledTimes(1);
    expect(mockLogAnalyticsEvent).not.toHaveBeenCalledWith('note_view', expect.anything());

    // Zoom back in to 15 -> markers separate again
    triggerMapIdle(15);
    expect(screen.getByTestId('marker-single-d1')).toBeInTheDocument();
    expect(screen.getByTestId('marker-single-d2')).toBeInTheDocument();
  });

  it('supports selecting a note externally from AnchorView and focusing it via MapController', () => {
    const shared = { lat: -34.9011, lng: -56.1645 };
    const n1 = buildNote('ext-1', shared.lat, shared.lng, { content: 'Oferta desde AnchorView' });
    const n2 = buildNote('ext-2', shared.lat, shared.lng, { content: 'Otra oferta' });

    const Host = () => {
      const [view, setView] = React.useState<'anchor' | 'map'>('anchor');
      const [selectedNote, setSelectedNote] = React.useState<Note | null>(null);
      const [focusNonce, setFocusNonce] = React.useState(0);

      const handleFocusNote = (note: Note) => {
        setSelectedNote(note);
        setFocusNonce((n) => n + 1);
        setView('map');
      };

      if (view === 'anchor') {
        return (
          <AnchorView
            notes={[n1, n2]}
            userLocation={{ lat: -34.9011, lng: -56.1645 }}
            user={null}
            setEditingNote={vi.fn()}
            onFocusNote={handleFocusNote}
            copyToClipboard={vi.fn()}
            copyStatus={null}
            onGenerateQRCode={vi.fn()}
            onShowComments={vi.fn()}
            onReportNote={vi.fn()}
          />
        );
      }

      return (
        <>
          <MapController
            isCreating={false}
            editingNote={null}
            placementStep="editing_content"
            userLocation={{ lat: -34.9011, lng: -56.1645 }}
            candidateLocation={null}
            setCandidateLocation={vi.fn()}
            isTrackingLocation={false}
            selectedNote={selectedNote}
            focusNonce={focusNonce}
            hasInitiallyPositioned={true}
            onInitialPositionComplete={vi.fn()}
          />
          <MapMarkers
            user={null}
            notes={[n1, n2]}
            userLocation={null}
            isCreating={false}
            editingNote={null}
            draftLocation={null}
            draftColor="#0d9488"
            draftEmoji="📝"
            selectedNote={selectedNote}
            copyStatus={null}
            setDraftLocation={vi.fn()}
            setSelectedNote={setSelectedNote}
            setEditingNote={vi.fn()}
            copyToClipboard={vi.fn()}
            onGenerateQRCode={vi.fn()}
            onShowComments={vi.fn()}
            onReportNote={vi.fn()}
          />
        </>
      );
    };

    render(<Host />);

    const focusButtons = screen.getAllByTitle('Ver en el Mapa');
    fireEvent.click(focusButtons[0]);

    // Map opens with InfoWindow for the externally selected note even though it shares coordinates
    const infoWindow = screen.getByTestId('info-window');
    expect(within(infoWindow).getByText('Oferta desde AnchorView')).toBeInTheDocument();
    expect(mockPanTo).toHaveBeenCalledWith(shared);
  });

  it('preserves existing InfoWindow actions, RichTextViewer markdown, userLocation, and draggable edit marker', async () => {
    const ownedNote = buildNote('own-1', -34.9011, -56.1645, {
      authorId: 'user-1',
      authorName: 'Tester',
      content: '## Titulo Markdown\n\nTexto **en negrita**',
      contentFormat: 'markdown',
      emoji: undefined,
      color: undefined,
      expiresAt: Timestamp.fromDate(new Date('2099-12-21T02:59:59.999Z')),
    });

    const onShowComments = vi.fn();
    const onGenerateQRCode = vi.fn();
    const copyToClipboard = vi.fn();
    const onReportNote = vi.fn();
    const setEditingNote = vi.fn();
    const setSelectedNote = vi.fn();

    const { rerender } = render(
      <MapMarkers
        user={{ uid: 'user-1', displayName: 'Tester' } as never}
        notes={[ownedNote]}
        userLocation={{ lat: -34.902, lng: -56.165 }}
        isCreating={false}
        editingNote={null}
        draftLocation={null}
        draftColor="#0d9488"
        draftEmoji="📝"
        selectedNote={ownedNote}
        copyStatus={null}
        setDraftLocation={vi.fn()}
        setSelectedNote={setSelectedNote}
        setEditingNote={setEditingNote}
        copyToClipboard={copyToClipboard}
        onGenerateQRCode={onGenerateQRCode}
        onShowComments={onShowComments}
        onReportNote={onReportNote}
      />
    );

    // User location marker + single note marker both rendered
    expect(screen.getAllByTestId('advanced-marker')).toHaveLength(2);

    const infoWindow = screen.getByTestId('info-window');
    expect(within(infoWindow).getByRole('heading', { name: 'Titulo Markdown' })).toBeInTheDocument();
    expect(within(infoWindow).getByText('en negrita').tagName).toBe('STRONG');
    expect(within(infoWindow).queryByText(/Visible hasta/i)).not.toBeInTheDocument();
    expect(within(infoWindow).queryByText(/2099/)).not.toBeInTheDocument();

    fireEvent.click(within(infoWindow).getByTitle('Responder'));
    expect(onShowComments).toHaveBeenCalledWith(ownedNote);

    fireEvent.click(within(infoWindow).getByTitle('Generar Código QR'));
    expect(onGenerateQRCode).toHaveBeenCalledWith('own-1');

    fireEvent.click(within(infoWindow).getByTitle('Compartir Enlace'));
    expect(copyToClipboard).toHaveBeenCalledWith('own-1');

    fireEvent.click(within(infoWindow).getByTitle('Report Note'));
    expect(onReportNote).toHaveBeenCalledWith(ownedNote);

    fireEvent.click(within(infoWindow).getByTitle('Editar Nota'));
    expect(setEditingNote).toHaveBeenCalledWith(ownedNote);

    // Delete flow opens confirmation modal and deletes document
    fireEvent.click(within(infoWindow).getByTitle('Borrar Nota'));
    const confirmDeleteBtn = screen
      .getAllByRole('button', { name: 'Borrar Nota' })
      .find((btn) => btn.textContent?.includes('Borrar Nota'));
    expect(confirmDeleteBtn).toBeDefined();
    fireEvent.click(confirmDeleteBtn!);
    await waitFor(() => {
      expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    });

    // Editing mode hides the note from map clusters and renders draggable draft marker
    rerender(
      <MapMarkers
        user={{ uid: 'user-1', displayName: 'Tester' } as never}
        notes={[ownedNote]}
        userLocation={null}
        isCreating={false}
        editingNote={ownedNote}
        placementStep="editing_content"
        draftLocation={ownedNote.location}
        draftColor="#0d9488"
        draftEmoji="💼"
        selectedNote={null}
        copyStatus={null}
        setDraftLocation={vi.fn()}
        setSelectedNote={setSelectedNote}
        setEditingNote={setEditingNote}
        copyToClipboard={copyToClipboard}
        onGenerateQRCode={onGenerateQRCode}
        onShowComments={onShowComments}
        onReportNote={onReportNote}
      />
    );

    const markersInEdit = screen.getAllByTestId('advanced-marker');
    expect(markersInEdit).toHaveLength(1);
    expect(markersInEdit[0]).toHaveAttribute('data-draggable', 'true');
  });
});
