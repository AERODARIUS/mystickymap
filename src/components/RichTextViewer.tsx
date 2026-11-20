import React from 'react';
import Markdown, { type Components } from 'react-markdown';
import type { ContentFormat } from '../types';
import { sanitizeLinkUrl } from '../lib/richText';

export interface RichTextViewerProps {
  content: string;
  contentFormat?: ContentFormat;
  variant?: 'note' | 'comment' | 'compact';
  tone?: 'light' | 'dark';
  className?: string;
  stopLinkPropagation?: boolean;
}

const NOTE_ALLOWED_ELEMENTS = [
  'p',
  'br',
  'strong',
  'em',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
];

const COMMENT_ALLOWED_ELEMENTS = ['p', 'br', 'strong', 'em', 'a'];

export const RichTextViewer: React.FC<RichTextViewerProps> = ({
  content,
  contentFormat = 'plain',
  variant = 'note',
  tone = 'light',
  className = '',
  stopLinkPropagation = false,
}) => {
  if (!content) {
    return null;
  }

  // Backward compatibility: render legacy plain-text notes/comments literally
  if (contentFormat !== 'markdown') {
    return (
      <div className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${className}`}>
        {content}
      </div>
    );
  }

  const isDark = tone === 'dark';
  const isCompact = variant === 'compact';
  const isComment = variant === 'comment';

  const linkClass = isDark
    ? 'underline decoration-white/60 underline-offset-2 font-semibold text-white hover:decoration-white break-all'
    : 'underline decoration-teal-600/50 underline-offset-2 font-medium text-teal-700 hover:text-teal-900 hover:decoration-teal-700 break-all';

  const blockquoteClass = isDark
    ? 'border-l-2 border-white/50 pl-2.5 my-1.5 italic opacity-90'
    : 'border-l-2 border-teal-500/60 pl-3 my-1.5 italic text-stone-600';

  const h2Class = isCompact
    ? 'text-[14px] font-extrabold leading-snug mt-1.5 mb-0.5 first:mt-0'
    : 'text-base font-extrabold leading-snug mt-2.5 mb-1 first:mt-0';

  const h3Class = isCompact
    ? 'text-[13px] font-bold leading-snug mt-1 mb-0.5 first:mt-0'
    : 'text-sm font-bold leading-snug mt-2 mb-1 first:mt-0';

  const listSpacing = isCompact ? 'my-1 pl-4 space-y-0.5' : 'my-1.5 pl-5 space-y-1';

  const components: Components = {
    p: ({ children }) => (
      <p className={`${isCompact ? 'my-1' : 'my-1.5'} first:mt-0 last:mb-0 leading-relaxed`}>
        {children}
      </p>
    ),
    strong: ({ children }) => <strong className="font-bold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    h2: ({ children }) => <h2 className={h2Class}>{children}</h2>,
    h3: ({ children }) => <h3 className={h3Class}>{children}</h3>,
    ul: ({ children }) => <ul className={`list-disc ${listSpacing}`}>{children}</ul>,
    ol: ({ children }) => <ol className={`list-decimal ${listSpacing}`}>{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    blockquote: ({ children }) => <blockquote className={blockquoteClass}>{children}</blockquote>,
    a: ({ href, children }) => {
      const safeHref = href ? sanitizeLinkUrl(href) : null;
      if (!safeHref) {
        return <span>{children}</span>;
      }
      return (
        <a
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={linkClass}
          onClick={(e) => {
            if (stopLinkPropagation) {
              e.stopPropagation();
            }
          }}
          onPointerDown={(e) => {
            if (stopLinkPropagation) {
              e.stopPropagation();
            }
          }}
        >
          {children}
        </a>
      );
    },
  };

  return (
    <div
      className={`rich-text-viewer break-words [overflow-wrap:anywhere] ${
        isComment ? 'text-sm leading-relaxed' : ''
      } ${className}`}
    >
      <Markdown
        allowedElements={isComment ? COMMENT_ALLOWED_ELEMENTS : NOTE_ALLOWED_ELEMENTS}
        unwrapDisallowed
        urlTransform={(url) => sanitizeLinkUrl(url) ?? ''}
        components={components}
      >
        {content}
      </Markdown>
    </div>
  );
};
