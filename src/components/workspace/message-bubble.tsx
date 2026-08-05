'use client';

import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle, Bot, Check, Copy, Download, Edit2, RefreshCw,
  Share2, Trash2, ThumbsUp, ThumbsDown, User,
} from 'lucide-react';
import { Markdown } from './markdown';
import type { WorkspaceMessage } from './types';
import { cn } from '@/lib/utils';

export type { WorkspaceMessage } from './types';

interface MessageBubbleProps {
  message: WorkspaceMessage;
  onCopy: (text: string) => void;
  onRetry?: (message: WorkspaceMessage) => void;
  onRegenerate?: (message: WorkspaceMessage) => void;
  onEdit?: (message: WorkspaceMessage) => void;
  onShare?: (message: WorkspaceMessage) => void;
  onDownload?: (message: WorkspaceMessage) => void;
  onDelete?: (id: string) => void;
  onReact?: (id: string, reaction: 'up' | 'down' | null) => void;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ActButton({
  icon: Icon, label, onClick, activeClass, disabled,
}: {
  icon: React.ElementType; label: string; onClick?: () => void; activeClass?: string; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'rounded-md p-1.5 text-[var(--text-muted-50)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-40',
        activeClass,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function MessageBubbleInner({
  message, onCopy, onRetry, onRegenerate, onEdit, onShare, onDownload, onDelete, onReact,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const showActions = !message.streaming && !message.error;

  const handleCopy = () => {
    onCopy(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={cn('group relative flex w-full gap-3 py-3', isUser ? 'flex-row-reverse' : 'flex-row')}
      aria-label={`${isUser ? 'User' : 'Assistant'} message`}
    >
      {/* Avatar */}
      <div className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
        isUser
          ? 'bg-[var(--surface-hover)] ring-1 ring-[var(--border-color)]'
          : 'bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/20',
      )}>
        {isUser
          ? <User className="h-4 w-4 text-[var(--text-muted-70)]" />
          : <Bot className="h-4 w-4 text-[var(--accent)]" />}
      </div>

      {/* Content */}
      <div className={cn('min-w-0 max-w-full flex-1', isUser ? 'text-right' : 'text-left')}>
        <div className={cn('mb-1 flex items-baseline gap-2 px-1', isUser ? 'justify-end' : 'justify-start')}>
          <span className="text-xs font-medium text-[var(--text-muted-50)]">
            {isUser ? 'You' : 'JK-TECH-CODE AI'}
          </span>
          <span className="text-[10px] text-[var(--text-muted-30)]">
            {formatTime(message.timestamp)}
          </span>
        </div>

        {/* Attachment chips shown above the user's message */}
        {message.attachments && message.attachments.length > 0 && (
          <div className={cn('mb-1.5 flex flex-wrap gap-1.5 px-1', isUser ? 'justify-end' : 'justify-start')}>
            {message.attachments.map(att => (
              <span
                key={att.id}
                className="inline-flex max-w-[200px] items-center gap-1 truncate rounded-md border border-[var(--border-color)] bg-[var(--surface-accent)] px-2 py-0.5 text-[10px] text-[var(--text-muted-70)]"
                title={att.name}
              >
                {att.kind === 'image' ? '🖼' : '📎'}
                <span className="truncate">{att.name}</span>
              </span>
            ))}
          </div>
        )}

        {message.error ? (
          /* Friendly error card — never a blank message */
          <div className="error-card" role="alert">
            <AlertCircle className="error-card__icon h-4.5 w-4.5" />
            <div className="min-w-0 text-left">
              <p className="text-xs font-medium">
                {message.errorText || 'Something went wrong while generating a response.'}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted-50)]">
                This happens sometimes — hit retry and it should work on the next try.
              </p>
              {onRetry && (
                <button
                  type="button"
                  className="error-card__retry"
                  onClick={() => onRetry(message)}
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className={cn(
            'inline-block rounded-2xl px-4 py-3 text-left text-sm leading-relaxed',
            isUser
              ? 'rounded-tr-md bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] text-white'
              : 'rounded-tl-md bg-[var(--surface)] ring-1 ring-[var(--border-color)]',
          )}>
            {message.content ? (
              <div className="max-w-[640px]">
                <Markdown content={message.content} />
              </div>
            ) : message.streaming ? (
              /* Phase indicator while the first tokens arrive */
              <div className="flex items-center gap-2" role="status" aria-live="polite">
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted-50)]">
                  <span className="typing-dots">
                    <span /><span /><span />
                  </span>
                  {message.streamingStatus === 'thinking' ? 'Thinking' : 'Generating'}
                  <span className="thinking-cursor" aria-hidden="true">▍</span>
                </span>
              </div>
            ) : null}
          </div>
        )}

        {/* Streaming cursor */}
        {message.streaming && message.content && (
          <span aria-hidden="true" className="ml-1 inline-block h-4 w-0.5 animate-pulse rounded bg-[var(--accent)]" />
        )}

        {/* Reactions */}
        {message.reaction && !message.streaming && !message.error && (
          <button
            type="button"
            onClick={() => onReact?.(message.id, null)}
            className={cn('reaction-chip mt-1.5', isUser ? '' : '')}
            data-active="true"
            aria-label="Remove reaction"
            title="Remove reaction"
          >
            {message.reaction === 'up' ? <ThumbsUp className="h-3 w-3" /> : <ThumbsDown className="h-3 w-3" />}
            {message.reaction === 'up' ? 'Helpful' : 'Needs work'}
          </button>
        )}

        {/* Actions */}
        {showActions && (
          <div className={cn(
            'mt-1.5 flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100',
            isUser ? 'justify-end' : 'justify-start',
          )}>
            <ActButton icon={copied ? Check : Copy} label="Copy" onClick={handleCopy} />
            {!isUser && onRegenerate && (
              <ActButton icon={RefreshCw} label="Regenerate" onClick={() => onRegenerate(message)} />
            )}
            {isUser && onEdit && (
              <ActButton icon={Edit2} label="Edit" onClick={() => onEdit(message)} />
            )}
            {!isUser && onDownload && (
              <ActButton icon={Download} label="Download" onClick={() => onDownload(message)} />
            )}
            {onShare && <ActButton icon={Share2} label="Share" onClick={() => onShare(message)} />}
            {onDelete && (
              <ActButton icon={Trash2} label="Delete" onClick={() => onDelete(message.id)} />
            )}
            {!isUser && onReact && (
              <>
                <ActButton
                  icon={ThumbsUp} label="Like"
                  activeClass={message.reaction === 'up' ? 'text-[var(--accent)]' : undefined}
                  onClick={() => onReact(message.id, message.reaction === 'up' ? null : 'up')}
                />
                <ActButton
                  icon={ThumbsDown} label="Dislike"
                  activeClass={message.reaction === 'down' ? 'text-red-500' : undefined}
                  onClick={() => onReact(message.id, message.reaction === 'down' ? null : 'down')}
                />
              </>
            )}
          </div>
        )}
      </div>
    </motion.article>
  );
}

export const MessageBubble = memo(MessageBubbleInner);
