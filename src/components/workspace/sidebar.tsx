'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bot, Download, FileText, Hash, MessageSquare, Pencil, Pin, Plus, Search,
  Settings, Star, Trash2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export interface SidebarConversation {
  id: string;
  title: string;
  preview: string;
  time: string;
  pinned?: boolean;
  favorite?: boolean;
  unread?: boolean;
  /** Full message text so search can match conversation content. */
  content?: string;
}

interface SidebarProps {
  conversations: SidebarConversation[];
  activeId: string | null;
  collapsed: boolean;
  /** Bump this number to focus + select the search box (Ctrl/Cmd+K). */
  searchFocusSignal: number;
  mobileOpen: boolean;
  onMobileClose: () => void;
  onToggleCollapse: () => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onExport: (id: string) => void;
}

function SidebarSection({
  label, icon: Icon, children,
}: {
  label: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="mb-1.5 flex items-center gap-2 px-3">
        <Icon className="h-3.5 w-3.5 text-[var(--text-muted-50)]" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted-50)]">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function ConversationItem({
  conv, active, onSelect, onDelete, onTogglePin, onToggleFavorite, onRename, onExport,
}: {
  conv: SidebarConversation;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onToggleFavorite: () => void;
  onRename: (title: string) => void;
  onExport: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(conv.title);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      editRef.current?.focus();
      editRef.current?.select();
    }
  }, [editing]);

  const commitRename = useCallback(() => {
    setEditing(false);
    const next = value.trim();
    if (next && next !== conv.title) onRename(next);
    else setValue(conv.title);
  }, [conv.title, onRename, value]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'group relative flex w-full flex-col gap-0.5 rounded-lg border border-transparent px-3 py-2 text-left transition-colors',
        active
          ? 'border-[var(--border-color)] bg-[var(--surface-accent)]'
          : 'hover:bg-[var(--surface-hover)]',
      )}
    >
      {editing ? (
        <input
          ref={editRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={e => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') { setValue(conv.title); setEditing(false); }
          }}
          className="w-full rounded-md border border-[var(--accent)] bg-[var(--surface)] px-1.5 py-0.5 text-[13px] text-[var(--text-primary)] outline-none"
          aria-label="Conversation title"
        />
      ) : (
        <button
          type="button"
          onClick={onSelect}
          className="flex w-full items-center gap-2 text-left"
          aria-current={active ? 'true' : undefined}
          title={conv.title}
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted-30)]" />
          <span className="flex-1 truncate text-[13px] font-medium text-[var(--text-primary)]">
            {conv.title}
          </span>
          {conv.pinned && <Pin className="h-3 w-3 shrink-0 text-[var(--accent)]" />}
          {conv.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />}
        </button>
      )}

      <div className="flex items-center gap-2">
        <span className="flex-1 truncate pl-[22px] text-[11px] text-[var(--text-muted-50)]">
          {conv.preview || conv.time}
        </span>
      </div>

      {/* Hover actions */}
      {!editing && (
        <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md bg-[var(--surface)] p-0.5 shadow-soft group-hover:flex">
          <button
            type="button"
            onClick={onTogglePin}
            className="rounded p-1 text-[var(--text-muted-50)] transition-colors hover:text-[var(--accent)]"
            aria-label={conv.pinned ? 'Unpin conversation' : 'Pin conversation'}
            title={conv.pinned ? 'Unpin' : 'Pin'}
          >
            <Pin className={cn('h-3 w-3', conv.pinned && 'fill-current text-[var(--accent)]')} />
          </button>
          <button
            type="button"
            onClick={onToggleFavorite}
            className="rounded p-1 text-[var(--text-muted-50)] transition-colors hover:text-[var(--accent)]"
            aria-label={conv.favorite ? 'Remove favorite' : 'Favorite conversation'}
            title={conv.favorite ? 'Unfavorite' : 'Favorite'}
          >
            <Star className={cn('h-3 w-3', conv.favorite && 'fill-current text-[var(--accent)]')} />
          </button>
          <button
            type="button"
            onClick={() => { setValue(conv.title); setEditing(true); }}
            className="rounded p-1 text-[var(--text-muted-50)] transition-colors hover:text-[var(--accent)]"
            aria-label="Rename conversation"
            title="Rename"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onExport}
            className="rounded p-1 text-[var(--text-muted-50)] transition-colors hover:text-[var(--accent)]"
            aria-label="Export conversation as Markdown"
            title="Export"
          >
            <Download className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded p-1 text-[var(--text-muted-50)] transition-colors hover:text-red-400"
            aria-label="Delete conversation"
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </motion.div>
  );
}

/** Shared list + search UI used by both the desktop sidebar and the mobile drawer. */
function SidebarBody({
  conversations, activeId, onNewChat, onSelect, onDelete, onTogglePin, onToggleFavorite, onRename, onExport,
}: {
  conversations: SidebarConversation[];
  activeId: string | null;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onExport: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? conversations.filter(c =>
        c.title.toLowerCase().includes(q)
        || (c.preview || '').toLowerCase().includes(q)
        || (c.content || '').toLowerCase().includes(q),
      )
    : conversations;

  const favorites = filtered.filter(c => c.favorite);
  const pinned = filtered.filter(c => c.pinned);
  const recent = filtered.filter(c => !c.pinned && !c.favorite);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* New chat */}
      <div className="p-3 pb-2">
        <Button
          onClick={onNewChat}
          className="w-full bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 focus-within:border-[var(--accent)]/50">
          <Search className="h-3.5 w-3.5 text-[var(--text-muted-50)]" />
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search chats..."
            className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted-30)] outline-none"
            aria-label="Search chats"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="rounded p-0.5 text-[var(--text-muted-50)] hover:text-[var(--text-primary)]"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        {conversations.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <MessageSquare className="mx-auto mb-2 h-6 w-6 text-[var(--text-muted-30)]" />
            <p className="text-xs text-[var(--text-muted-50)]">
              No conversations yet.
              <br />
              Start a new chat to begin.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-[var(--text-muted-50)]">
            No chats match “{search.trim()}”.
          </p>
        ) : (
          <>
            {favorites.length > 0 && (
              <SidebarSection label="Favorites" icon={Star}>
                <div className="space-y-0.5">
                  {favorites.map(c => (
                    <ConversationItem key={c.id} conv={c} active={c.id === activeId}
                      onSelect={() => onSelect(c.id)} onDelete={() => onDelete(c.id)}
                      onTogglePin={() => onTogglePin(c.id)} onToggleFavorite={() => onToggleFavorite(c.id)}
                      onRename={t => onRename(c.id, t)} onExport={() => onExport(c.id)} />
                  ))}
                </div>
              </SidebarSection>
            )}
            {pinned.length > 0 && (
              <SidebarSection label="Pinned" icon={Pin}>
                <div className="space-y-0.5">
                  {pinned.map(c => (
                    <ConversationItem key={c.id} conv={c} active={c.id === activeId}
                      onSelect={() => onSelect(c.id)} onDelete={() => onDelete(c.id)}
                      onTogglePin={() => onTogglePin(c.id)} onToggleFavorite={() => onToggleFavorite(c.id)}
                      onRename={t => onRename(c.id, t)} onExport={() => onExport(c.id)} />
                  ))}
                </div>
              </SidebarSection>
            )}
            {recent.length > 0 && (
              <SidebarSection label="Recent chats" icon={Hash}>
                <div className="space-y-0.5">
                  {recent.map(c => (
                    <ConversationItem key={c.id} conv={c} active={c.id === activeId}
                      onSelect={() => onSelect(c.id)} onDelete={() => onDelete(c.id)}
                      onTogglePin={() => onTogglePin(c.id)} onToggleFavorite={() => onToggleFavorite(c.id)}
                      onRename={t => onRename(c.id, t)} onExport={() => onExport(c.id)} />
                  ))}
                </div>
              </SidebarSection>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="space-y-0.5 border-t border-[var(--border-color)] p-2">
        <Link
          href="/autonomy"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-[var(--text-muted-50)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          <Bot className="h-4 w-4" />
          Autonomy
        </Link>
        <Link
          href="/settings/ai"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-[var(--text-muted-50)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>
    </div>
  );
}

export function Sidebar({
  conversations, activeId, collapsed, searchFocusSignal, mobileOpen, onMobileClose,
  onNewChat, onSelect, onDelete, onTogglePin, onToggleFavorite, onRename, onExport,
}: SidebarProps) {
  const [dragging, setDragging] = useState(false);
  const [width, setWidth] = useState(280);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const searchFocusHandled = useRef(0);

  // Focus the sidebar search box whenever the signal bumps (Ctrl/Cmd+K, top-bar search).
  useEffect(() => {
    if (searchFocusSignal === 0 || searchFocusSignal === searchFocusHandled.current) return;
    searchFocusHandled.current = searchFocusSignal;
    const input = sidebarRef.current?.querySelector<HTMLInputElement>('input[aria-label="Search chats"]');
    if (input) {
      input.focus();
      input.select();
    }
  }, [searchFocusSignal]);

  // Close the mobile drawer with Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, onMobileClose]);

  // Resize dragging (desktop only)
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const next = Math.min(360, Math.max(200, e.clientX));
      setWidth(next);
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  const bodyProps = {
    conversations, activeId, onNewChat, onSelect, onDelete,
    onTogglePin, onToggleFavorite, onRename, onExport,
  };

  return (
    <>
      {/* Desktop sidebar */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.aside
            ref={sidebarRef}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-20 hidden h-full shrink-0 flex-col overflow-hidden border-r border-[var(--border-color)] bg-[var(--background)] md:flex"
            aria-label="Conversations sidebar"
          >
            <SidebarBody {...bodyProps} />

            {/* Resize handle */}
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={() => setDragging(true)}
              className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-[var(--accent)]/40"
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile slide-over drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onMobileClose}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
              aria-label="Close chat list"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-[320px] flex-col border-r border-[var(--border-color)] bg-[var(--background)] shadow-lift md:hidden"
              aria-label="Conversations sidebar"
            >
              <div className="flex items-center justify-between px-3 pb-1 pt-3">
                <span className="font-['Playfair_Display'] text-sm font-bold text-[var(--text-primary)]">
                  JK-TECH-CODE<span className="text-[var(--accent)]">.</span>
                </span>
                <button
                  type="button"
                  onClick={onMobileClose}
                  className="rounded-lg p-1.5 text-[var(--text-muted-50)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  aria-label="Close chat list"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <SidebarBody {...bodyProps} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
