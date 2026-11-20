import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link2,
  Unlink,
  Undo2,
  Redo2,
  Check,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ContentFormat } from '../types';
import {
  normalizeLinkInput,
  truncateVisibleCharacters,
  countVisibleCharacters,
} from '../lib/richText';
import {
  createRichTextExtensions,
  getDocVisibleLength,
  parseStoredContentToDoc,
  serializeDocToMarkdown,
  type EditorMode,
} from '../lib/tiptapMarkdown';

export interface RichTextEditorChangeMeta {
  visibleLength: number;
  storageLength: number;
  isEmpty: boolean;
  exceedsVisible: boolean;
  exceedsStorage: boolean;
}

export interface RichTextEditorHandle {
  insertTranscript: (transcript: string) => void;
  clear: () => void;
  focus: () => void;
  setContent: (content: string, format: ContentFormat) => void;
}

export interface RichTextEditorProps {
  mode: EditorMode;
  initialContent: string;
  contentFormat: ContentFormat;
  maxVisibleLength: number;
  maxStorageLength: number;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  compact?: boolean;
  className?: string;
  editorClassName?: string;
  ariaLabel?: string;
  onChange: (markdown: string, meta: RichTextEditorChangeMeta) => void;
  onSubmitShortcut?: () => void;
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  (
    {
      mode,
      initialContent,
      contentFormat,
      maxVisibleLength,
      maxStorageLength,
      placeholder = '',
      disabled = false,
      autoFocus = false,
      compact = false,
      className = '',
      editorClassName = '',
      ariaLabel,
      onChange,
      onSubmitShortcut,
    },
    ref
  ) => {
    const { t } = useTranslation();
    const isNote = mode === 'note';

    const [isLinkBarOpen, setIsLinkBarOpen] = useState(false);
    const [linkUrlInput, setLinkUrlInput] = useState('');
    const [linkError, setLinkError] = useState<string | null>(null);
    const linkInputRef = useRef<HTMLInputElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);

    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const onSubmitShortcutRef = useRef(onSubmitShortcut);
    onSubmitShortcutRef.current = onSubmitShortcut;

    const extensions = useMemo(
      () => createRichTextExtensions(mode, { maxVisibleLength }),
      [mode, maxVisibleLength]
    );

    const parsedInitialDoc = useMemo(
      () => parseStoredContentToDoc(initialContent, contentFormat, mode),
      // Only compute on mount / explicit reset; live typing is driven by ProseMirror state
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [mode]
    );

    const editor = useEditor({
      extensions,
      content: parsedInitialDoc,
      editable: !disabled,
      autofocus: autoFocus ? 'end' : false,
      editorProps: {
        attributes: {
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': ariaLabel || (isNote ? 'Note editor' : 'Comment editor'),
          class: `tiptap-editor-content outline-none text-sm text-stone-800 leading-relaxed break-words [overflow-wrap:anywhere] ${
            compact ? 'min-h-[56px] max-h-[140px]' : 'min-h-[112px] max-h-[200px]'
          } overflow-y-auto px-3.5 py-2.5 ${editorClassName}`,
        },
        handleKeyDown: (_view, event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && onSubmitShortcutRef.current) {
            event.preventDefault();
            onSubmitShortcutRef.current();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: currentEditor }) => {
        const manager = currentEditor.markdown;
        const json = currentEditor.getJSON();
        const markdown = manager ? serializeDocToMarkdown(json, manager) : currentEditor.getText();
        const visibleLength = getDocVisibleLength(currentEditor.state.doc);
        const storageLength = markdown.trim().length;
        const isEmpty = visibleLength === 0 || markdown.trim().length === 0;

        onChangeRef.current(markdown, {
          visibleLength,
          storageLength,
          isEmpty,
          exceedsVisible: visibleLength > maxVisibleLength,
          exceedsStorage: storageLength > maxStorageLength,
        });
      },
    });

    useEffect(() => {
      if (editor) {
        editor.setEditable(!disabled);
      }
    }, [editor, disabled]);

    const editorState = useEditorState({
      editor,
      selector: (ctx) => {
        const ed = ctx.editor;
        if (!ed) {
          return {
            isEmpty: true,
            bold: false,
            italic: false,
            h2: false,
            h3: false,
            bulletList: false,
            orderedList: false,
            blockquote: false,
            link: false,
            canUndo: false,
            canRedo: false,
            visibleLength: 0,
          };
        }
        const visibleLength = getDocVisibleLength(ed.state.doc);
        return {
          isEmpty: visibleLength === 0,
          bold: ed.isActive('bold'),
          italic: ed.isActive('italic'),
          h2: isNote && ed.isActive('heading', { level: 2 }),
          h3: isNote && ed.isActive('heading', { level: 3 }),
          bulletList: isNote && ed.isActive('bulletList'),
          orderedList: isNote && ed.isActive('orderedList'),
          blockquote: isNote && ed.isActive('blockquote'),
          link: ed.isActive('link'),
          canUndo: ed.can().chain().focus().undo().run(),
          canRedo: ed.can().chain().focus().redo().run(),
          visibleLength,
        };
      },
    });

    useImperativeHandle(
      ref,
      () => ({
        insertTranscript: (transcript: string) => {
          if (!editor) return;
          const cleaned = transcript.trim();
          if (!cleaned) return;

          const currentVisible = getDocVisibleLength(editor.state.doc);
          const remaining = maxVisibleLength - currentVisible;
          if (remaining <= 0) return;

          const { from } = editor.state.selection;
          const prevChar =
            from > 1
              ? editor.state.doc.textBetween(Math.max(0, from - 1), from, '\n', '\n')
              : '';
          const needsSpace = prevChar.length > 0 && !/\s/.test(prevChar);
          const prefix = needsSpace ? ' ' : '';
          const budgetForTranscript = remaining - countVisibleCharacters(prefix);
          if (budgetForTranscript <= 0) return;

          const safeAddition = truncateVisibleCharacters(cleaned, budgetForTranscript);
          if (!safeAddition) return;

          editor
            .chain()
            .focus()
            .insertContent(`${prefix}${safeAddition}`)
            .run();
        },
        clear: () => {
          if (!editor) return;
          editor.commands.clearContent(true);
          setIsLinkBarOpen(false);
          setLinkUrlInput('');
          setLinkError(null);
          onChangeRef.current('', {
            visibleLength: 0,
            storageLength: 0,
            isEmpty: true,
            exceedsVisible: false,
            exceedsStorage: false,
          });
        },
        focus: () => {
          editor?.commands.focus();
        },
        setContent: (content: string, format: ContentFormat) => {
          if (!editor) return;
          const doc = parseStoredContentToDoc(content, format, mode, editor.markdown);
          editor.commands.setContent(doc);
        },
      }),
      [editor, maxVisibleLength, mode]
    );

    const openLinkBar = useCallback(() => {
      if (!editor || disabled) return;
      const currentHref = (editor.getAttributes('link')?.href as string | undefined) || '';
      setLinkUrlInput(currentHref);
      setLinkError(null);
      setIsLinkBarOpen(true);
      setTimeout(() => {
        linkInputRef.current?.focus();
      }, 0);
    }, [editor, disabled]);

    const applyLink = useCallback(() => {
      if (!editor) return;
      const trimmed = linkUrlInput.trim();
      if (!trimmed) {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
        setIsLinkBarOpen(false);
        setLinkError(null);
        return;
      }

      const normalized = normalizeLinkInput(trimmed);
      if (!normalized) {
        setLinkError(t('editor.invalid_url', 'Enter a valid http(s) or mailto link.'));
        return;
      }

      const { empty } = editor.state.selection;
      if (empty && !editor.isActive('link')) {
        const currentVisible = getDocVisibleLength(editor.state.doc);
        const remaining = maxVisibleLength - currentVisible;
        if (remaining <= 0) {
          setLinkError(t('editor.char_limit_reached', 'Character limit reached.'));
          return;
        }
        const label = truncateVisibleCharacters(trimmed, remaining);
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'text',
            text: label,
            marks: [{ type: 'link', attrs: { href: normalized } }],
          })
          .run();
      } else {
        editor
          .chain()
          .focus()
          .extendMarkRange('link')
          .setLink({ href: normalized })
          .run();
      }

      setIsLinkBarOpen(false);
      setLinkUrlInput('');
      setLinkError(null);
    }, [editor, linkUrlInput, maxVisibleLength, t]);

    const removeLink = useCallback(() => {
      if (!editor) return;
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setIsLinkBarOpen(false);
      setLinkUrlInput('');
      setLinkError(null);
    }, [editor]);

    const handleToolbarKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!toolbarRef.current) return;
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') {
        return;
      }
      const buttons = Array.from(
        toolbarRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      );
      if (buttons.length === 0) return;

      const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (currentIndex === -1) return;

      e.preventDefault();
      let nextIndex = currentIndex;
      if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % buttons.length;
      else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
      else if (e.key === 'Home') nextIndex = 0;
      else if (e.key === 'End') nextIndex = buttons.length - 1;

      buttons[nextIndex]?.focus();
    };

    const btnBase =
      'p-1.5 rounded-lg transition-colors flex items-center justify-center min-w-[30px] min-h-[30px] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-35 disabled:cursor-not-allowed';
    const btnActive = 'bg-emerald-600 text-white shadow-xs';
    const btnInactive = 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900';

    return (
      <div
        className={`w-full rounded-2xl border border-stone-200 bg-stone-50 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-transparent transition-all overflow-hidden ${className}`}
      >
        {/* Formatting Toolbar */}
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label={t('editor.toolbar', 'Formatting toolbar')}
          onKeyDown={handleToolbarKeyDown}
          className="flex flex-wrap items-center gap-0.5 sm:gap-1 px-2 py-1.5 bg-stone-100/80 border-b border-stone-200/80"
        >
          <button
            type="button"
            disabled={disabled || !editor}
            aria-label={t('editor.bold', 'Bold')}
            aria-pressed={editorState?.bold ?? false}
            title={t('editor.bold', 'Bold (Ctrl+B)')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className={`${btnBase} ${editorState?.bold ? btnActive : btnInactive}`}
          >
            <Bold className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            disabled={disabled || !editor}
            aria-label={t('editor.italic', 'Italic')}
            aria-pressed={editorState?.italic ?? false}
            title={t('editor.italic', 'Italic (Ctrl+I)')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className={`${btnBase} ${editorState?.italic ? btnActive : btnInactive}`}
          >
            <Italic className="w-3.5 h-3.5" />
          </button>

          {isNote && (
            <>
              <span className="w-px h-4 bg-stone-300/70 mx-0.5" aria-hidden="true" />
              <button
                type="button"
                disabled={disabled || !editor}
                aria-label={t('editor.heading2', 'Heading 2')}
                aria-pressed={editorState?.h2 ?? false}
                title={t('editor.heading2', 'Heading 2')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                className={`${btnBase} ${editorState?.h2 ? btnActive : btnInactive}`}
              >
                <Heading2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                disabled={disabled || !editor}
                aria-label={t('editor.heading3', 'Heading 3')}
                aria-pressed={editorState?.h3 ?? false}
                title={t('editor.heading3', 'Heading 3')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                className={`${btnBase} ${editorState?.h3 ? btnActive : btnInactive}`}
              >
                <Heading3 className="w-3.5 h-3.5" />
              </button>

              <span className="w-px h-4 bg-stone-300/70 mx-0.5" aria-hidden="true" />
              <button
                type="button"
                disabled={disabled || !editor}
                aria-label={t('editor.bullet_list', 'Bullet list')}
                aria-pressed={editorState?.bulletList ?? false}
                title={t('editor.bullet_list', 'Bullet list')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
                className={`${btnBase} ${editorState?.bulletList ? btnActive : btnInactive}`}
              >
                <List className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                disabled={disabled || !editor}
                aria-label={t('editor.ordered_list', 'Numbered list')}
                aria-pressed={editorState?.orderedList ?? false}
                title={t('editor.ordered_list', 'Numbered list')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                className={`${btnBase} ${editorState?.orderedList ? btnActive : btnInactive}`}
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                disabled={disabled || !editor}
                aria-label={t('editor.blockquote', 'Blockquote')}
                aria-pressed={editorState?.blockquote ?? false}
                title={t('editor.blockquote', 'Blockquote')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                className={`${btnBase} ${editorState?.blockquote ? btnActive : btnInactive}`}
              >
                <Quote className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <span className="w-px h-4 bg-stone-300/70 mx-0.5" aria-hidden="true" />
          <button
            type="button"
            disabled={disabled || !editor}
            aria-label={t('editor.link', 'Add or edit link')}
            aria-pressed={editorState?.link || isLinkBarOpen}
            title={t('editor.link', 'Add or edit link')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (isLinkBarOpen ? setIsLinkBarOpen(false) : openLinkBar())}
            className={`${btnBase} ${editorState?.link || isLinkBarOpen ? btnActive : btnInactive}`}
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>

          {editorState?.link && (
            <button
              type="button"
              disabled={disabled || !editor}
              aria-label={t('editor.unlink', 'Remove link')}
              title={t('editor.unlink', 'Remove link')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={removeLink}
              className={`${btnBase} text-rose-600 hover:bg-rose-100`}
            >
              <Unlink className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              disabled={disabled || !editorState?.canUndo}
              aria-label={t('editor.undo', 'Undo')}
              title={t('editor.undo', 'Undo (Ctrl+Z)')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor?.chain().focus().undo().run()}
              className={`${btnBase} ${btnInactive}`}
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              disabled={disabled || !editorState?.canRedo}
              aria-label={t('editor.redo', 'Redo')}
              title={t('editor.redo', 'Redo (Ctrl+Shift+Z)')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor?.chain().focus().redo().run()}
              className={`${btnBase} ${btnInactive}`}
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Inline Link Editor Bar */}
        {isLinkBarOpen && (
          <div className="px-2.5 py-2 bg-white border-b border-stone-200 space-y-1">
            <div className="flex items-center gap-1.5">
              <input
                ref={linkInputRef}
                type="url"
                value={linkUrlInput}
                onChange={(e) => {
                  setLinkUrlInput(e.target.value);
                  if (linkError) setLinkError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyLink();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setIsLinkBarOpen(false);
                    setLinkError(null);
                    editor?.commands.focus();
                  }
                }}
                placeholder="https://example.com"
                aria-label={t('editor.link_url', 'Link URL')}
                className="flex-1 min-w-0 px-2.5 py-1 text-xs bg-stone-50 border border-stone-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 text-stone-800"
              />
              <button
                type="button"
                onClick={applyLink}
                aria-label={t('editor.apply_link', 'Apply link')}
                title={t('editor.apply_link', 'Apply link')}
                className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shrink-0"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLinkBarOpen(false);
                  setLinkError(null);
                  editor?.commands.focus();
                }}
                aria-label={t('editor.cancel_link', 'Cancel')}
                title={t('editor.cancel_link', 'Cancel')}
                className="p-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-lg transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {linkError && (
              <p className="text-[11px] font-medium text-red-600" role="alert">
                {linkError}
              </p>
            )}
          </div>
        )}

        {/* Editor Surface + Accessible Placeholder */}
        <div className="relative">
          {editorState?.isEmpty && placeholder && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-2.5 left-3.5 right-10 text-sm text-stone-400 select-none truncate"
            >
              {placeholder}
            </div>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>
    );
  }
);

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
