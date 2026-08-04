'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bot, Check, Copy, Edit2, RefreshCw, Share2, Trash2,
  ThumbsUp, ThumbsDown, User,
} from 'lucide-react';
import { Markdown } from './markdown';
import { cn } from '@/lib/utils';

export interface WorkspaceMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  streaming?: boolean;
}

interface MessageBubbleProps {
  message: WorkspaceMessage;
  onCopy: (text: string) => void;
  onRetry?: (message: WorkspaceMessage) => void;
  onEdit?: (message: WorkspaceMessage) => void;
  onShare?: (message: WorkspaceMessage) => void;
  onDelete?: (id: string) => void;
}

function ActButton({
  icon: Icon, label, onClick, activeClass,
}: {
  icon: React.ElementType; label: string; onClick?: () => void; activeClass?: string;
}) {
  const [active, setActive] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { if (onClick) onClick(); setActive(a => !a); }}
      aria-label={label}
      title={label}
      className={cn(
        'rounded-md p-1.5 text-[var(--text-muted-50)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
        active && activeClass,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

export function MessageBubble({
  message, onCopy, onRetry, onEdit, onShare, onDelete,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

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
        <span className="mb-1 block px-1 text-xs font-medium text-[var(--text-muted-50)]">
          {isUser ? 'You' : 'JK-TECH-CODE AI'}
        </span>

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
            <span className="typing-dots" aria-label="Assistant is typing">
              <span /><span /><span />
            </span>
          ) : null}
        </div>

        {/* Streaming cursor */}
        {message.streaming && message.content && (
          <span aria-hidden="true" className="ml-1 inline-block h-4 w-0.5 animate-pulse rounded bg-[var(--accent)]" />
        )}

        {/* Actions */}
        {!message.streaming && (
          <div className={cn(
            'mt-1.5 flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100',
            isUser ? 'justify-end' : 'justify-start',
          )}>
            <ActButton icon={copied ? Check : Copy} label="Copy" onClick={handleCopy} />
            {!isUser && onRetry && (
              <ActButton icon={RefreshCw} label="Retry" onClick={() => onRetry(message)} />
            )}
            {isUser && onEdit && (
              <ActButton icon={Edit2} label="Edit" onClick={() => onEdit(message)} />
            )}
            {onShare && <ActButton icon={Share2} label="Share" onClick={() => onShare(message)} />}
            {onDelete && (
              <ActButton icon={Trash2} label="Delete" onClick={() => onDelete(message.id)} />
            )}
            {!isUser && (
              <>
                <ActButton icon={ThumbsUp} label="Like" activeClass="text-[var(--accent)]" />
                <ActButton icon={ThumbsDown} label="Dislike" />
              </>
            )}
          </div>
        )}
      </div>
    </motion.article>
  );
}