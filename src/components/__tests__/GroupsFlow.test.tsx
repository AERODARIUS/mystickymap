import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Timestamp, deleteField } from 'firebase/firestore';
import { GroupCombobox } from '../GroupCombobox';
import { GroupFilter } from '../GroupFilter';
import { NoteCreator } from '../NoteCreator';
import { MapMarkers } from '../MapMarkers';
import { AnchorView } from '../AnchorView';
import { GroupFilterProvider, useGroupFilter } from '../../context/GroupFilterContext';
import { GROUP_FILTER_STORAGE_KEY } from '../../lib/groups';
import type { Note } from '../../types';

// --- Controlled Firebase & Map Mocks ---
const mockAddDoc = vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(async () => ({ id: 'created-note-1' }));
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

const mockPanTo = vi.fn();
const mockSetZoom = vi.fn();
const mockFitBounds = vi.fn();
const mockMapInstance = {
  panTo: mockPanTo,
  setCenter: vi.fn(),
  setZoom: mockSetZoom,
  fitBounds: mockFitBounds,
  getZoom: () => 15,
  getBounds: () => null,
  getCenter: () => ({ lat: () => -34.9011, lng: () => -56.1645 }),
  addListener: vi.fn(() => ({ remove: vi.fn() })),
};

vi.mock('@vis.gl/react-google-maps', () => ({
  useMap: () => mockMapInstance,
  AdvancedMarker: ({
    children,
    onClick,
    position,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    position?: { lat: number; lng: number };
  }) => (
    <div
      data-testid="advanced-marker"
      data-lat={position?.lat}
      data-lng={position?.lng}
      onClick={onClick}
    >
      {children}
    </div>
  ),
  InfoWindow: ({
    children,
    onCloseClick,
  }: {
    children?: React.ReactNode;
    onCloseClick?: () => void;
  }) => (
    <div role="region" aria-label="InfoWindow" data-testid="info-window">
      <button type="button" onClick={onCloseClick} aria-label="Close InfoWindow">
        ×
      </button>
      {children}
    </div>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOpts?: string | Record<string, unknown>) => {
      if (typeof fallbackOrOpts === 'string') return fallbackOrOpts;
      if (fallbackOrOpts && typeof fallbackOrOpts.defaultValue === 'string') {
        let out = fallbackOrOpts.defaultValue;
        for (const [k, v] of Object.entries(fallbackOrOpts)) {
          if (k !== 'defaultValue') {
            out = out.replace(`{{${k}}}`, String(v));
          }
        }
        return out;
      }
      const dict: Record<string, string> = {
        'creator.new_note': 'New Note',
        'creator.edit_note': 'Edit Note',
        'creator.public': 'PUBLIC',
        'creator.private': 'PRIVATE',
        'anchor.title': 'Nearby Notes',
        'anchor.tab_nearby': 'Nearby',
        'anchor.tab_my_notes': 'My Notes',
        'anchor.created_by': 'Created by',
        'anchor.search_placeholder': 'Search notes...',
        'anchor.radius_label': 'Search Radius',
        'anchor.away': 'away',
        'anchor.no_notes': 'No notes found in this area...',
        'anchor.no_my_notes': "You haven't created any notes yet.",
        'qr.view.you': 'You',
        'groups.validation_too_long': 'Group name must be 60 characters or fewer.',
        'groups.validation_invalid_chars': 'Group name cannot contain line breaks or control characters.',
      };
      return dict[key] || key;
    },
    i18n: { language: 'en-US' },
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
      uid: 'author-1',
      displayName: 'Explorer One',
      emailVerified: true,
    },
  },
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list', GET: 'get', WRITE: 'write' },
  serverTimestamp: () => ({ _type: 'serverTimestamp' }),
  logAnalyticsEvent: vi.fn(),
}));

function makeNote(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    type: 'text',
    content: `Content for ${id}`,
    contentFormat: 'plain',
    location: { lat: -34.9011, lng: -56.1645 },
    authorId: 'author-2',
    authorName: 'Author Two',
    privacy: 'public',
    createdAt: Timestamp.fromMillis(1_700_000_000_000),
    color: '#0d9488',
    emoji: '📍',
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('GroupCombobox interaction, keyboard navigation, and creation option', () => {
  it('filters suggestions, offers "Create group", supports keyboard navigation, clearing, and validation', () => {
    const Harness = () => {
      const [val, setVal] = React.useState('');
      return (
        <GroupCombobox
          label="Group (optional)"
          value={val}
          onChange={setVal}
          suggestions={['Accessible places', 'Events', 'Restaurants']}
        />
      );
    };

    render(<Harness />);
    const input = screen.getByRole('combobox', { name: 'Group (optional)' }) as HTMLInputElement;

    // Focus opens listbox with all suggestions
    fireEvent.focus(input);
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByText('Accessible places')).toBeInTheDocument();
    expect(within(listbox).getByText('Events')).toBeInTheDocument();
    expect(within(listbox).getByText('Restaurants')).toBeInTheDocument();

    // Typing a partial query filters suggestions and offers explicit creation option
    fireEvent.change(input, { target: { value: 'Rest' } });
    expect(within(screen.getByRole('listbox')).getByText('Restaurants')).toBeInTheDocument();
    expect(within(screen.getByRole('listbox')).queryByText('Events')).not.toBeInTheDocument();
    expect(screen.getByText('Create group "Rest"')).toBeInTheDocument();

    // ArrowDown highlights first option ("Restaurants"), Enter selects it
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('Restaurants');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // Clear button resets value
    fireEvent.click(screen.getByRole('button', { name: 'Clear group' }));
    expect(input.value).toBe('');

    // Entering completely new group shows Create group option and selecting it sets input value
    fireEvent.change(input, { target: { value: 'Garage sales' } });
    fireEvent.mouseDown(screen.getByText('Create group "Garage sales"'));
    expect(input.value).toBe('Garage sales');

    // Overlength group displays validation error
    fireEvent.change(input, { target: { value: 'x'.repeat(65) } });
    expect(screen.getByRole('alert')).toHaveTextContent('60 characters or fewer');
  });
});

describe('NoteCreator group assignment, canonical spelling reuse, editing, and clearing', () => {
  it('reuses existing canonical capitalization when creating a note and omits group when empty', async () => {
    const { rerender } = render(
      <NoteCreator
        draftLocation={{ lat: -34.9011, lng: -56.1645 }}
        color="#0d9488"
        setColor={vi.fn()}
        emoji="📝"
        setEmoji={vi.fn()}
        content="Coffee shop nearby"
        setContent={vi.fn()}
        contentFormat="plain"
        setContentFormat={vi.fn()}
        availableGroups={['Accessible places', 'Restaurants']}
        onNoteCreated={vi.fn()}
      />
    );

    // Case-insensitive match "restaurants" resolves to "Restaurants"
    const combobox = screen.getByRole('combobox', { name: /Group/i });
    fireEvent.change(combobox, { target: { value: '  restaurants  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Place Note/i }));

    await waitFor(() => expect(mockAddDoc).toHaveBeenCalledTimes(1));
    const firstPayload = mockAddDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(firstPayload.group).toBe('Restaurants');

    // Creating with whitespace-only group omits the group property entirely
    vi.clearAllMocks();
    rerender(
      <NoteCreator
        key="second"
        draftLocation={{ lat: -34.9011, lng: -56.1645 }}
        color="#0d9488"
        setColor={vi.fn()}
        emoji="📝"
        setEmoji={vi.fn()}
        content="Ungrouped note"
        setContent={vi.fn()}
        contentFormat="plain"
        setContentFormat={vi.fn()}
        group="   "
        availableGroups={['Accessible places', 'Restaurants']}
        onNoteCreated={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Place Note/i }));
    await waitFor(() => expect(mockAddDoc).toHaveBeenCalledTimes(1));
    const secondPayload = mockAddDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(secondPayload).not.toHaveProperty('group');
  });

  it('edits an existing note group and uses deleteField() when cleared', async () => {
    const existing = makeNote('n-edit', {
      authorId: 'author-1',
      group: 'Events',
    });

    render(
      <NoteCreator
        draftLocation={existing.location}
        color="#0d9488"
        setColor={vi.fn()}
        emoji="📝"
        setEmoji={vi.fn()}
        editingNote={existing}
        availableGroups={['Events', 'Tourism']}
        onNoteCreated={vi.fn()}
      />
    );

    const combobox = screen.getByRole('combobox', { name: /Group/i }) as HTMLInputElement;
    expect(combobox.value).toBe('Events');

    fireEvent.click(screen.getByRole('button', { name: 'Clear group' }));
    expect(combobox.value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: /Place Note/i }));
    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(1));

    const updatePayload = mockUpdateDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(updatePayload.group).toEqual(deleteField());
  });
});

describe('Synchronized GroupFilter across MapMarkers and AnchorView', () => {
  interface MapAndNearbyProps {
    notes: Note[];
    setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
    selectedNote: Note | null;
    setSelectedNote: React.Dispatch<React.SetStateAction<Note | null>>;
  }

  const MapAndNearby: React.FC<MapAndNearbyProps> = ({
    notes,
    setNotes,
    selectedNote,
    setSelectedNote,
  }) => {
    const { filterNotes } = useGroupFilter();
    const mapNotes = React.useMemo(() => filterNotes(notes), [filterNotes, notes]);

    React.useEffect(() => {
      if (selectedNote && filterNotes([selectedNote]).length === 0) {
        setSelectedNote(null);
      }
    }, [filterNotes, selectedNote, setSelectedNote]);

    return (
      <div>
        <div data-testid="map-toolbar">
          <GroupFilter variant="map" />
        </div>
        <div data-testid="map-section">
          <MapMarkers
            user={null}
            notes={mapNotes}
            userLocation={null}
            isCreating={false}
            editingNote={null}
            draftLocation={null}
            draftColor="#0d9488"
            draftEmoji="📍"
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
        </div>
        <div data-testid="anchor-section">
          <AnchorView
            notes={notes}
            myNotes={[]}
            userLocation={{ lat: -34.9011, lng: -56.1645 }}
            user={null}
            setEditingNote={vi.fn()}
            onFocusNote={vi.fn()}
            copyToClipboard={vi.fn()}
            copyStatus={null}
            onGenerateQRCode={vi.fn()}
            onShowComments={vi.fn()}
            onReportNote={vi.fn()}
          />
        </div>
        <button
          type="button"
          onClick={() =>
            setNotes((prev) => [
              ...prev,
              makeNote('n-new-group', {
                content: 'New tourism note',
                group: 'Tourism',
                location: { lat: -34.903, lng: -56.166 },
              }),
            ])
          }
        >
          Add Tourism Note
        </button>
      </div>
    );
  };

  const SharedViewsHarness: React.FC<{ initialNotes: Note[]; initialSelected?: Note | null }> = ({
    initialNotes,
    initialSelected = null,
  }) => {
    const [notes, setNotes] = React.useState<Note[]>(initialNotes);
    const [selectedNote, setSelectedNote] = React.useState<Note | null>(initialSelected);

    return (
      <GroupFilterProvider notes={notes} myNotes={[]}>
        <MapAndNearby
          notes={notes}
          setNotes={setNotes}
          selectedNote={selectedNote}
          setSelectedNote={setSelectedNote}
        />
      </GroupFilterProvider>
    );
  };

  it('synchronizes filters, closes excluded InfoWindow, preserves map camera, displays badges, and persists to localStorage', () => {
    const noteEvents = makeNote('n-events', {
      content: 'Jazz festival',
      group: 'Events',
      location: { lat: -34.9011, lng: -56.1645 },
    });
    const noteJobs = makeNote('n-jobs', {
      content: 'Frontend role',
      group: 'Job opportunities',
      location: { lat: -34.9055, lng: -56.1645 },
    });
    const noteUngrouped = makeNote('n-ungrouped', {
      content: 'Lost keys at plaza',
      location: { lat: -34.9011, lng: -56.1585 },
    });

    const { unmount } = render(
      <SharedViewsHarness
        initialNotes={[noteEvents, noteJobs, noteUngrouped]}
        initialSelected={noteEvents}
      />
    );

    // InfoWindow shows assigned group badge
    expect(within(screen.getByTestId('info-window')).getByTestId('info-window-group-badge')).toHaveTextContent(
      'Events'
    );

    // All 3 notes visible initially in both MapMarkers and AnchorView
    expect(screen.getByTestId('marker-single-n-events')).toBeInTheDocument();
    expect(screen.getByTestId('marker-single-n-jobs')).toBeInTheDocument();
    expect(screen.getByTestId('marker-single-n-ungrouped')).toBeInTheDocument();
    expect(within(screen.getByTestId('anchor-section')).getByText('Jazz festival')).toBeInTheDocument();
    expect(within(screen.getByTestId('anchor-section')).getByText('Frontend role')).toBeInTheDocument();
    expect(within(screen.getByTestId('anchor-section')).getByText('Lost keys at plaza')).toBeInTheDocument();
    expect(screen.getByTestId('anchor-note-group-n-events')).toHaveTextContent('Events');

    // Open Map GroupFilter and uncheck "Events" -> InfoWindow closes and Events note disappears from both Map and AnchorView
    fireEvent.click(screen.getByTestId('map-group-filter-button'));
    const dialog = screen.getByTestId('group-filter-popover');
    const eventsCheckbox = within(dialog).getByLabelText(/Events/);
    fireEvent.click(eventsCheckbox);

    expect(screen.queryByTestId('info-window')).not.toBeInTheDocument();
    expect(screen.queryByTestId('marker-single-n-events')).not.toBeInTheDocument();
    expect(screen.getByTestId('marker-single-n-jobs')).toBeInTheDocument();
    expect(screen.getByTestId('marker-single-n-ungrouped')).toBeInTheDocument();

    expect(within(screen.getByTestId('anchor-section')).queryByText('Jazz festival')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('anchor-section')).getByText('Frontend role')).toBeInTheDocument();
    expect(within(screen.getByTestId('anchor-section')).getByText('Lost keys at plaza')).toBeInTheDocument();

    // Map camera was never reset/panned by group filter change
    expect(mockPanTo).not.toHaveBeenCalled();
    expect(mockSetZoom).not.toHaveBeenCalled();

    // Clear all -> 0 notes in both views and filtered empty state in AnchorView
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear all' }));
    expect(screen.queryAllByTestId('advanced-marker')).toHaveLength(0);
    expect(within(screen.getByTestId('anchor-section')).getByText('No notes match the selected groups')).toBeInTheDocument();

    // Select only Ungrouped -> shows only ungrouped note
    fireEvent.click(within(dialog).getByLabelText(/Ungrouped/));
    expect(screen.queryByTestId('marker-single-n-events')).not.toBeInTheDocument();
    expect(screen.queryByTestId('marker-single-n-jobs')).not.toBeInTheDocument();
    expect(screen.getByTestId('marker-single-n-ungrouped')).toBeInTheDocument();

    // Select Events only -> persists to localStorage and survives unmount/remount
    fireEvent.click(within(dialog).getByLabelText(/Ungrouped/));
    fireEvent.click(within(dialog).getByLabelText(/Events/));
    const stored = window.localStorage.getItem(GROUP_FILTER_STORAGE_KEY);
    expect(stored).toContain('"events"');

    unmount();

    // Remount without noteEvents in current dataset -> saved "Events" filter is preserved cleanly as unavailable in current view
    render(<SharedViewsHarness initialNotes={[noteJobs, noteUngrouped]} />);
    expect(screen.queryByTestId('marker-single-n-jobs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('marker-single-n-ungrouped')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('map-group-filter-button'));
    expect(within(screen.getByTestId('group-filter-popover')).getByText('Not in current view')).toBeInTheDocument();

    // Reset restores unrestricted default and auto-includes newly discovered groups
    fireEvent.click(within(screen.getByTestId('group-filter-popover')).getAllByRole('button', { name: 'Reset' })[0]);
    expect(screen.getByTestId('marker-single-n-jobs')).toBeInTheDocument();
    expect(screen.getByTestId('marker-single-n-ungrouped')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add Tourism Note' }));
    expect(screen.getByTestId('marker-single-n-new-group')).toBeInTheDocument();
  });

  it('recalculates clusters when group filters exclude notes from a cluster', () => {
    const closeNotes = [
      makeNote('cl-1', { content: 'Event 1', group: 'Events', location: { lat: -34.9011, lng: -56.1645 } }),
      makeNote('cl-2', { content: 'Job 1', group: 'Job opportunities', location: { lat: -34.9015, lng: -56.1648 } }),
    ];

    render(<SharedViewsHarness initialNotes={closeNotes} />);

    // Both notes cluster together initially
    const clusterMarker = screen.getByRole('button', { name: /Cluster of 2 notes/i });
    expect(clusterMarker).toHaveTextContent('2');

    // Excluding Job opportunities unclusters Events into a single marker
    fireEvent.click(screen.getByTestId('map-group-filter-button'));
    fireEvent.click(within(screen.getByTestId('group-filter-popover')).getByLabelText(/Job opportunities/));

    expect(screen.queryByRole('button', { name: /Cluster of 2 notes/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('marker-single-cl-1')).toBeInTheDocument();
  });

  it('displays group badges inside ClusterNotesSheet for coincident notes', () => {
    const shared = { lat: -34.9011, lng: -56.1645 };
    const notes = [
      makeNote('c1', { location: shared, content: 'Cafe A', group: 'Restaurants' }),
      makeNote('c2', { location: shared, content: 'Cafe B', group: 'Events' }),
    ];

    render(
      <GroupFilterProvider notes={notes} myNotes={[]}>
        <MapMarkers
          user={null}
          notes={notes}
          userLocation={null}
          isCreating={false}
          editingNote={null}
          draftLocation={null}
          draftColor="#0d9488"
          draftEmoji="📍"
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
      </GroupFilterProvider>
    );

    fireEvent.click(screen.getByTestId('marker-coincident--34.901100,-56.164500'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('cluster-note-group-c1')).toHaveTextContent('Restaurants');
    expect(within(dialog).getByTestId('cluster-note-group-c2')).toHaveTextContent('Events');
  });
});
