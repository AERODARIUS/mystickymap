import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { deleteField, Timestamp } from 'firebase/firestore';
import { AdminCsvImporter } from '../AdminCsvImporter';
import { AdminNotesManager } from '../AdminNotesManager';
import type { Note } from '../../types';
import type { User } from 'firebase/auth';

const mockBatchSet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn(async () => undefined);
const mockLogAnalytics = vi.fn();

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    collection: vi.fn((_db, name: string) => ({ path: name })),
    doc: vi.fn((colOrDb, ...segments: string[]) => ({
      id: segments.length > 0 ? segments[segments.length - 1] : 'auto_id_1',
      path: segments.join('/'),
    })),
    serverTimestamp: () => ({ _type: 'serverTimestamp' }),
    writeBatch: vi.fn(() => ({
      set: mockBatchSet,
      update: mockBatchUpdate,
      commit: mockBatchCommit,
    })),
  };
});

vi.mock('../../firebase', () => ({
  db: {},
  logAnalyticsEvent: (...args: unknown[]) => mockLogAnalytics(...args),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const verifiedUser = {
  uid: 'admin-uid',
  email: 'admin@spotheon.app',
  displayName: 'Admin',
  emailVerified: true,
} as unknown as User;

describe('AdminCsvImporter rich-text UI, preview toggle, and batch writes', () => {
  it('renders Markdown safely in Renderizado mode, supports toggling to Raw Markdown, and writes contentFormat in batches', async () => {
    render(<AdminCsvImporter user={verifiedUser} existingNotes={[]} notesLoading={false} />);

    // Open direct CSV paste editor
    fireEvent.click(screen.getByRole('button', { name: 'Pegar texto CSV' }));

    const csvText = [
      'id,content,contentFormat,lat,lng',
      'md_row,"## Teatro Solís\n\n**Montevideo** y [Web](https://www.teatrosolis.org.uy/)",markdown,-34.907851,-56.201122',
      'plain_row,"Texto *literal* #hashtag",plain,-34.906123,-56.193456',
      'bad_xss,"<script>alert(1)</script> [XSS](javascript:alert(1))",markdown,-34.905,-56.19',
    ].join('\n');

    const textarea = screen.getByPlaceholderText(/contentFormat/i);
    fireEvent.change(textarea, { target: { value: csvText } });

    // Rendered mode by default: Markdown H2, bold, and safe link render; no <script>
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Teatro Solís' })).toBeInTheDocument();
    });
    expect(screen.getByText('Montevideo').tagName).toBe('STRONG');
    const link = screen.getByRole('link', { name: 'Web' });
    expect(link).toHaveAttribute('href', 'https://www.teatrosolis.org.uy/');
    expect(document.querySelector('script')).toBeNull();

    // Plain row renders literally
    expect(screen.getByText('Texto *literal* #hashtag')).toBeInTheDocument();

    // Error row reports validation failure without blocking valid rows
    expect(screen.getByText(/No se permite HTML sin procesar en contenido Markdown/i)).toBeInTheDocument();

    // Toggle to Raw Markdown preview
    fireEvent.click(screen.getByRole('button', { name: 'Markdown sin procesar' }));
    expect(screen.queryByRole('heading', { level: 2, name: 'Teatro Solís' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText(/## Teatro Solís/)).toBeInTheDocument();

    // Execute batch import for the 2 valid rows
    const importBtn = screen.getByRole('button', { name: /Importar 2 notas/i });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    });
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchSet.mock.calls[0][1]).toMatchObject({
      contentFormat: 'markdown',
      authorId: 'admin-uid',
    });
    expect(mockBatchSet.mock.calls[0][1]).not.toHaveProperty('group');
    expect(mockBatchSet.mock.calls[1][1]).toMatchObject({
      contentFormat: 'plain',
      content: 'Texto *literal* #hashtag',
    });
  });

  it('supports batch-level GroupCombobox, per-row CSV group, and clearing existing note group via deleteField()', async () => {
    const existingNotes: Note[] = [
      {
        id: 'existing-1',
        type: 'text',
        content: 'Existing grouped note',
        contentFormat: 'plain',
        location: { lat: -34.9011, lng: -56.1645 },
        authorId: 'orig-author',
        authorName: 'Original',
        privacy: 'public',
        createdAt: Timestamp.fromMillis(1_700_000_000_000),
        group: 'Events',
      },
    ];

    render(<AdminCsvImporter user={verifiedUser} existingNotes={existingNotes} notesLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pegar texto CSV' }));

    const csvText = [
      'id,content,lat,lng,group',
      'existing-1,"Updated existing note",-34.9011,-56.1645,""',
      'new-custom,"New note with fallback group",-34.902,-56.165,""',
      'new-explicit,"New note with explicit group",-34.903,-56.166,"Tourism"',
    ].join('\n');

    fireEvent.change(screen.getByPlaceholderText(/contentFormat/i), { target: { value: csvText } });

    // Uncheck skipDuplicates so existing-1 becomes an update
    const skipCheckbox = screen.getByRole('checkbox');
    fireEvent.click(skipCheckbox);

    // Assign a batch default group via GroupCombobox
    const batchGroupInput = screen.getByRole('combobox', { name: /group por defecto/i });
    fireEvent.change(batchGroupInput, { target: { value: 'Restaurants' } });

    fireEvent.click(screen.getByRole('button', { name: /Importar 3 notas/i }));

    await waitFor(() => {
      expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    });

    // Existing row cleared group using deleteField()
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate.mock.calls[0][1]).toMatchObject({
      content: 'Updated existing note',
      group: deleteField(),
    });

    // New rows got batch default ('Restaurants') or explicit ('Tourism')
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchSet.mock.calls[0][1]).toMatchObject({
      content: 'New note with fallback group',
      group: 'Restaurants',
    });
    expect(mockBatchSet.mock.calls[1][1]).toMatchObject({
      content: 'New note with explicit group',
      group: 'Tourism',
    });
  });

  it('exports only currently filtered notes from AdminNotesManager as CSV', () => {
    const createObjectUrlSpy = vi.fn(() => 'blob:mock-url');
    const revokeObjectUrlSpy = vi.fn();
    const clickSpy = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectUrlSpy,
      revokeObjectURL: revokeObjectUrlSpy,
    });
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(clickSpy);
      }
      return el;
    });

    const notes: Note[] = [
      {
        id: 'n1',
        type: 'text',
        content: 'Public event note',
        contentFormat: 'plain',
        location: { lat: -34.9, lng: -56.2 },
        authorId: 'u1',
        authorName: 'Alice',
        privacy: 'public',
        createdAt: Timestamp.fromMillis(1_700_000_000_000),
        group: 'Events',
      },
      {
        id: 'n2',
        type: 'text',
        content: 'Private note',
        contentFormat: 'plain',
        location: { lat: -34.91, lng: -56.21 },
        authorId: 'u2',
        authorName: 'Bob',
        privacy: 'private',
        createdAt: Timestamp.fromMillis(1_700_000_000_000),
      },
    ];

    render(<AdminNotesManager notes={notes} loading={false} error={null} />);

    // Filter to private only
    fireEvent.change(screen.getByLabelText('Filtrar por privacidad'), {
      target: { value: 'private' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/i }));
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(mockLogAnalytics).toHaveBeenCalledWith('admin_notes_csv_export', { exported_count: 1 });

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('filters notes by group (including case-insensitive deduplication and ungrouped) and exports the filtered subset', () => {
    const createObjectUrlSpy = vi.fn(() => 'blob:mock-url');
    const revokeObjectUrlSpy = vi.fn();
    const clickSpy = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectUrlSpy,
      revokeObjectURL: revokeObjectUrlSpy,
    });
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(clickSpy);
      }
      return el;
    });

    const notes: Note[] = [
      {
        id: 'n1',
        type: 'text',
        content: 'Festival opening',
        contentFormat: 'plain',
        location: { lat: -34.9, lng: -56.2 },
        authorId: 'u1',
        authorName: 'Alice',
        privacy: 'public',
        createdAt: Timestamp.fromMillis(1_700_000_000_000),
        group: 'Events',
      },
      {
        id: 'n2',
        type: 'text',
        content: 'Evening meetup',
        contentFormat: 'plain',
        location: { lat: -34.905, lng: -56.205 },
        authorId: 'u2',
        authorName: 'Bob',
        privacy: 'private',
        createdAt: Timestamp.fromMillis(1_700_000_000_000),
        group: 'events',
      },
      {
        id: 'n3',
        type: 'text',
        content: 'Cafe special',
        contentFormat: 'plain',
        location: { lat: -34.91, lng: -56.21 },
        authorId: 'u3',
        authorName: 'Carla',
        privacy: 'public',
        createdAt: Timestamp.fromMillis(1_700_000_000_000),
        group: 'Restaurants',
      },
      {
        id: 'n4',
        type: 'text',
        content: 'Standalone bench note',
        contentFormat: 'plain',
        location: { lat: -34.92, lng: -56.22 },
        authorId: 'u4',
        authorName: 'Diego',
        privacy: 'public',
        createdAt: Timestamp.fromMillis(1_700_000_000_000),
      },
    ];

    render(<AdminNotesManager notes={notes} loading={false} error={null} />);

    const groupSelect = screen.getByLabelText('Filtrar por grupo') as HTMLSelectElement;
    // Case-insensitive deduplication merges Events + events into one option with count 2
    expect(screen.getByRole('option', { name: /Events \(2\)/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Restaurants \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Sin grupo \(1\)/ })).toBeInTheDocument();

    // Filter to Events -> both n1 and n2 appear
    fireEvent.change(groupSelect, { target: { value: 'events' } });
    expect(screen.getByText('Festival opening')).toBeInTheDocument();
    expect(screen.getByText('Evening meetup')).toBeInTheDocument();
    expect(screen.queryByText('Cafe special')).not.toBeInTheDocument();
    expect(screen.queryByText('Standalone bench note')).not.toBeInTheDocument();

    // Combine with privacy filter -> only n1 remains and Exportar CSV exports 1 note
    fireEvent.change(screen.getByLabelText('Filtrar por privacidad'), {
      target: { value: 'public' },
    });
    expect(screen.getByText('Festival opening')).toBeInTheDocument();
    expect(screen.queryByText('Evening meetup')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/i }));
    expect(mockLogAnalytics).toHaveBeenCalledWith('admin_notes_csv_export', { exported_count: 1 });

    // Reset privacy and select ungrouped notes only
    fireEvent.change(screen.getByLabelText('Filtrar por privacidad'), {
      target: { value: 'all' },
    });
    fireEvent.change(groupSelect, { target: { value: '__ungrouped__' } });
    expect(screen.getByText('Standalone bench note')).toBeInTheDocument();
    expect(screen.queryByText('Festival opening')).not.toBeInTheDocument();
    expect(screen.queryByText('Cafe special')).not.toBeInTheDocument();

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
