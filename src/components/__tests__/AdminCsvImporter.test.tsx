import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AdminCsvImporter } from '../AdminCsvImporter';
import type { User } from 'firebase/auth';

const mockBatchSet = vi.fn();
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
    expect(mockBatchSet.mock.calls[1][1]).toMatchObject({
      contentFormat: 'plain',
      content: 'Texto *literal* #hashtag',
    });
  });
});
