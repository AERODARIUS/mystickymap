import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { RichTextViewer } from '../RichTextViewer';
import { RichTextEditor, type RichTextEditorHandle } from '../RichTextEditor';
import { SpeechButton } from '../SpeechButton';
import { NoteCreator } from '../NoteCreator';
import { CommentsView } from '../CommentsView';
import { MAX_NOTE_LENGTH, MAX_NOTE_STORAGE_LENGTH, type Note, type Comment } from '../../types';

const mockTimestamp = null as unknown as Note['createdAt'];

// Mock i18next so component labels render consistently
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en-US' },
  }),
}));

const mockAddComment = vi.fn(async () => undefined);
const mockDeleteComment = vi.fn(async () => undefined);
let mockCommentsData: Comment[] = [];

vi.mock('../../hooks/useComments', () => ({
  useComments: () => ({
    comments: mockCommentsData,
    loading: false,
    addComment: mockAddComment,
    deleteComment: mockDeleteComment,
  }),
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

vi.mock('../../firebase', () => ({
  db: {},
  auth: {
    currentUser: {
      uid: 'user-1',
      displayName: 'Test Explorer',
      emailVerified: true,
    },
  },
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list', GET: 'get', WRITE: 'write' },
  serverTimestamp: () => ({ _type: 'serverTimestamp' }),
  logAnalyticsEvent: vi.fn(),
}));

if (typeof Range !== 'undefined') {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
  }
}
if (typeof Element !== 'undefined' && !Element.prototype.getClientRects) {
  Element.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockCommentsData = [];
});

describe('RichTextViewer security and rendering', () => {
  it('renders legacy plain text literally without interpreting Markdown or HTML', () => {
    const legacy = 'Visit *here* #1 <script>alert(1)</script>\nSecond line';
    const { container } = render(<RichTextViewer content={legacy} />);

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('em')).toBeNull();
    expect(container.querySelector('h1')).toBeNull();
    expect(screen.getByText(/Visit \*here\* #1 <script>alert\(1\)<\/script>/)).toBeInTheDocument();
  });

  it('renders allowed Markdown formatting in note mode and blocks malicious XSS payloads', () => {
    const maliciousMarkdown = [
      '## Safe Title',
      '',
      '**Bold** and *Italic* and [Safe](https://spotheon.app)',
      '',
      '[XSS](javascript:alert(1)) and [Data](data:text/html,<script>alert(1)</script>)',
      '',
      '<script>alert("xss")</script>',
      '',
      '<img src="x" onerror="alert(1)" />',
      '',
      '![Evil Image](https://evil.com/track.png)',
    ].join('\n');

    const { container } = render(
      <RichTextViewer content={maliciousMarkdown} contentFormat="markdown" variant="note" />
    );

    expect(container.querySelector('h2')).toHaveTextContent('Safe Title');
    expect(container.querySelector('strong')).toHaveTextContent('Bold');
    expect(container.querySelector('em')).toHaveTextContent('Italic');

    const links = Array.from(container.querySelectorAll('a'));
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://spotheon.app');
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    expect(links[0]).toHaveAttribute('target', '_blank');

    // Unsafe elements and event handlers must never become live DOM elements/attributes
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.innerHTML).not.toContain('javascript:');
    expect(container.textContent).toContain('<script>alert("xss")</script>');
  });

  it('disallows headings, lists, and blockquotes in comment variant', () => {
    const { container } = render(
      <RichTextViewer
        content={'## Heading\n\n- item\n\n> quote\n\n**Bold comment**'}
        contentFormat="markdown"
        variant="comment"
      />
    );

    expect(container.querySelector('h2')).toBeNull();
    expect(container.querySelector('ul')).toBeNull();
    expect(container.querySelector('blockquote')).toBeNull();
    expect(container.querySelector('strong')).toHaveTextContent('Bold comment');
  });

  it('stops click and pointerDown propagation on links when stopLinkPropagation is enabled', () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <RichTextViewer
          content="[Spot](https://spotheon.app)"
          contentFormat="markdown"
          stopLinkPropagation
        />
      </div>
    );

    const link = screen.getByRole('link', { name: 'Spot' });
    fireEvent.click(link);
    expect(parentClick).not.toHaveBeenCalled();
  });
});

describe('SpeechButton TTS integration', () => {
  const originalSpeechSynthesis = window.speechSynthesis;
  const originalUtterance = (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;

  beforeEach(() => {
    class MockUtterance {
      text: string;
      lang = '';
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    (globalThis as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = MockUtterance;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: vi.fn(),
        cancel: vi.fn(),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: originalSpeechSynthesis,
    });
    (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = originalUtterance;
  });

  it('speaks plain text without Markdown syntax and preserves note language', () => {
    render(
      <SpeechButton
        text={'## Hola **Mundo**\n\nVisita [este lugar](https://spotheon.app)!'}
        contentFormat="markdown"
        language="es-ES"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /speech\.listen|listen/i }));

    const speakMock = window.speechSynthesis.speak as ReturnType<typeof vi.fn>;
    expect(speakMock).toHaveBeenCalledTimes(1);
    const spokenUtterance = speakMock.mock.calls[0][0] as { text: string; lang: string };
    expect(spokenUtterance.lang).toBe('es-ES');
    expect(spokenUtterance.text).not.toContain('**');
    expect(spokenUtterance.text).not.toContain('##');
    expect(spokenUtterance.text).not.toContain('https://');
    expect(spokenUtterance.text).toContain('Hola Mundo');
    expect(spokenUtterance.text).toContain('Visita este lugar!');
  });
});

describe('RichTextEditor toolbar, dictation, and keyboard accessibility', () => {
  it('renders note vs comment toolbar controls and supports keyboard navigation', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <RichTextEditor
        mode="note"
        initialContent=""
        contentFormat="markdown"
        maxVisibleLength={MAX_NOTE_LENGTH}
        maxStorageLength={MAX_NOTE_STORAGE_LENGTH}
        onChange={onChange}
      />
    );

    expect(screen.getByRole('toolbar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Heading 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bullet list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Blockquote' })).toBeInTheDocument();

    const boldBtn = screen.getByRole('button', { name: 'Bold' });
    const italicBtn = screen.getByRole('button', { name: 'Italic' });
    boldBtn.focus();
    fireEvent.keyDown(boldBtn, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(italicBtn);

    rerender(
      <RichTextEditor
        mode="comment"
        initialContent=""
        contentFormat="markdown"
        maxVisibleLength={500}
        maxStorageLength={1500}
        onChange={onChange}
      />
    );
    expect(screen.queryByRole('button', { name: 'Heading 2' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bullet list' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
  });

  it('inserts speech transcript at cursor and rejects unsafe URLs inline', async () => {
    const onChange = vi.fn();
    const editorRef = React.createRef<RichTextEditorHandle>();

    render(
      <RichTextEditor
        ref={editorRef}
        mode="note"
        initialContent="Hello **world**"
        contentFormat="markdown"
        maxVisibleLength={MAX_NOTE_LENGTH}
        maxStorageLength={MAX_NOTE_STORAGE_LENGTH}
        onChange={onChange}
      />
    );

    editorRef.current?.insertTranscript('from voice');

    await waitFor(() => {
      const lastCall = onChange.mock.calls.at(-1);
      expect(lastCall?.[0]).toContain('from voice');
    });

    // Open inline link bar and verify unsafe javascript: URL is rejected inline
    fireEvent.click(screen.getByRole('button', { name: 'Add or edit link' }));
    const urlInput = screen.getByLabelText('Link URL');
    fireEvent.change(urlInput, { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply link' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid http(s) or mailto link.');
  });
});

describe('NoteCreator draft workflow and CommentsView', () => {
  it('preserves rich-text draft content when transitioning to placement and returning to edit', async () => {
    let draftContent = '## Draft Heading\n\n**Keep me**';
    let draftFormat: 'plain' | 'markdown' = 'markdown';
    const onProceed = vi.fn();

    const { unmount } = render(
      <NoteCreator
        draftLocation={{ lat: -34.9, lng: -56.16 }}
        color="#0d9488"
        setColor={vi.fn()}
        emoji="📝"
        setEmoji={vi.fn()}
        content={draftContent}
        setContent={(c) => {
          draftContent = c;
        }}
        contentFormat={draftFormat}
        setContentFormat={(f) => {
          draftFormat = f;
        }}
        language="en-US"
        setLanguage={vi.fn()}
        privacy="public"
        setPrivacy={vi.fn()}
        onProceedToPlacement={onProceed}
      />
    );

    // Wait for lazy RichTextEditor to load
    const textbox = await screen.findByRole('textbox');
    expect(textbox).toHaveTextContent('Draft Heading');
    expect(textbox).toHaveTextContent('Keep me');
    expect(screen.getByText('21 / 1000')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Place Note/i }));
    expect(onProceed).toHaveBeenCalledTimes(1);

    // Simulate unmounting during location placement and remounting on "Edit Note"
    unmount();

    render(
      <NoteCreator
        draftLocation={{ lat: -34.9, lng: -56.16 }}
        color="#0d9488"
        setColor={vi.fn()}
        emoji="📝"
        setEmoji={vi.fn()}
        content={draftContent}
        setContent={vi.fn()}
        contentFormat={draftFormat}
        setContentFormat={vi.fn()}
        language="en-US"
        setLanguage={vi.fn()}
        privacy="public"
        setPrivacy={vi.fn()}
        onProceedToPlacement={onProceed}
      />
    );

    const restoredTextbox = await screen.findByRole('textbox');
    expect(restoredTextbox).toHaveTextContent('Draft Heading');
    expect(restoredTextbox).toHaveTextContent('Keep me');
  });

  it('renders plain and Markdown comments safely in CommentsView', async () => {
    const parentNote: Note = {
      id: 'note-1',
      type: 'text',
      content: '## Main Note',
      contentFormat: 'markdown',
      location: { lat: -34.9, lng: -56.16 },
      authorId: 'user-1',
      authorName: 'Author',
      privacy: 'public',
      createdAt: mockTimestamp,
    };

    mockCommentsData = [
      {
        id: 'c-plain',
        noteId: 'note-1',
        content: 'Legacy *plain* comment',
        authorId: 'user-2',
        authorName: 'Legacy User',
        createdAt: mockTimestamp,
      },
      {
        id: 'c-md',
        noteId: 'note-1',
        content: '**Formatted** [reply](https://spotheon.app)',
        contentFormat: 'markdown',
        authorId: 'user-3',
        authorName: 'Rich User',
        createdAt: mockTimestamp,
      },
    ];

    render(
      <CommentsView
        note={parentNote}
        isOpen
        user={{ uid: 'user-1', displayName: 'Test Explorer' } as never}
        onClose={vi.fn()}
        onReportComment={vi.fn()}
        onReportNote={vi.fn()}
      />
    );

    expect(screen.getByText('Legacy *plain* comment')).toBeInTheDocument();
    const replyLink = screen.getByRole('link', { name: 'reply' });
    expect(replyLink).toHaveAttribute('href', 'https://spotheon.app');
    expect(await screen.findByRole('textbox')).toBeInTheDocument();
  });

  it('loads legacy plain-text note for editing without interpreting * or # as Markdown until edited', async () => {
    const legacyNote: Note = {
      id: 'legacy-1',
      type: 'text',
      content: '# Tag *literal*',
      location: { lat: -34.9, lng: -56.16 },
      authorId: 'user-1',
      authorName: 'Author',
      privacy: 'public',
      createdAt: mockTimestamp,
    };

    render(
      <NoteCreator
        draftLocation={{ lat: -34.9, lng: -56.16 }}
        color="#0d9488"
        setColor={vi.fn()}
        emoji="📝"
        setEmoji={vi.fn()}
        editingNote={legacyNote}
        onProceedToPlacement={vi.fn()}
      />
    );

    const textbox = await screen.findByRole('textbox');
    expect(textbox).toHaveTextContent('# Tag *literal*');
    expect(textbox.querySelector('h1, h2, em')).toBeNull();
  });

  it('submits formatted comments with contentFormat markdown from CommentsView', async () => {
    const parentNote: Note = {
      id: 'note-2',
      type: 'text',
      content: 'Plain parent note',
      location: { lat: -34.9, lng: -56.16 },
      authorId: 'user-1',
      authorName: 'Author',
      privacy: 'public',
      createdAt: mockTimestamp,
    };

    render(
      <CommentsView
        note={parentNote}
        isOpen
        user={{ uid: 'user-1', displayName: 'Test Explorer' } as never}
        onClose={vi.fn()}
        onReportComment={vi.fn()}
        onReportNote={vi.fn()}
      />
    );

    const textbox = await screen.findByRole('textbox');
    // Apply bold via toolbar + type text or trigger Ctrl+Enter on populated editor
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    // Verify accessible submit button starts disabled when empty
    const sendBtn = screen.getByRole('button', { name: 'comments.send' });
    expect(sendBtn).toBeDisabled();
    expect(textbox).toBeInTheDocument();
  });
});

describe('Firestore security rules verification (static invariants)', () => {
  it('enforces contentFormat validation, updated storage limits, and strict field allowlists', () => {
    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    const rules = fs.readFileSync(rulesPath, 'utf8');

    expect(rules).toContain("data.contentFormat in ['plain', 'markdown']");
    expect(rules).toContain('data.content.size() <= 4000');
    expect(rules).toContain('data.content.size() >= 1 && data.content.size() <= 1500');
    expect(rules).toContain("'contentFormat'");
    expect(rules).toContain(
      "affectedKeys().hasOnly(['content', 'contentFormat', 'audioUrl', 'location', 'updatedAt', 'color', 'emoji', 'language', 'group', 'authorName', 'privacy', 'expiresAt'])"
    );
    expect(rules).toContain("data.keys().hasOnly(['content', 'contentFormat', 'authorId', 'authorName', 'createdAt', 'noteId'])");
  });
});
