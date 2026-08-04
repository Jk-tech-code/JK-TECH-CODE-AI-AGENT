'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  MessageSquare, Plus, Search, Star, Pin, FileText, Settings,
  Trash2, PanelLeft, X, Hash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SidebarConversation {
  id: string;
  title: string;
  preview: string;
  time: string;
  pinned?: boolean;
  favorite?: boolean;
  unread?: boolean;
}

interface SidebarProps {
  conversations: SidebarConversation[];
  activeId: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

function SidebarSection({
  label, icon: Icon, children,
}: {
  label: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 px-3 mb-1.5">
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
  conv, active, onSelect, onDelete, onTogglePin, onToggleFavorite,
}: {
  conv: SidebarConversation;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'group relative flex w-full flex-col gap-0.5 rounded-lg border border-transparent px-3 py-2 text-left cursor-pointer transition-colors',
        active
          ? 'bg-[var(--surface-accent)] border-[var(--border-color)]'
          : 'hover:bg-[var(--surface-hover)]',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-2 text-left"
        aria-current={active ? 'true' : undefined}
      >
        <span className="flex-1 truncate text-[13px] font-medium text-[var(--text-primary)]">
          {conv.title}
        </span>
        {conv.pinned && <Pin className="h-3 w-3 shrink-0 text-[var(--accent)]" />}
        {conv.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />}
      </button>
      <div className="flex items-center gap-2 pl-0">
        <span className="flex-1 truncate text-[11px] text-[var(--text-muted-50)]">
          {conv.preview || conv.time}
        </span>
      </div>

      {/* Hover actions */}
      <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md bg-[var(--surface)] p-0.5 shadow-soft group-hover:flex">
        <button
          type="button"
          onClick={() => { onTogglePin(); }}
          className="rounded p-1 text-[var(--text-muted-50)] hover:text-[var(--accent)]"
          aria-label={conv.pinned ? 'Unpin conversation' : 'Pin conversation'}
        >
          <Pin className={cn('h-3 w-3', conv.pinned && 'fill-current text-[var(--accent)]')} />
        </button>
        <button
          type="button"
          onClick={() => { onToggleFavorite(); }}
          className="rounded p-1 text-[var(--text-muted-50)] hover:text-[var(--accent)]"
          aria-label={conv.favorite ? 'Remove favorite' : 'Favorite conversation'}
        >
          <Star className={cn('h-3 w-3', conv.favorite && 'fill-current text-[var(--accent)]')} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded p-1 text-[var(--text-muted-50)] hover:text-red-400"
          aria-label="Delete conversation"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </motion.div>
  );
}

export function Sidebar({
  conversations, activeId, collapsed, onToggleCollapse, onNewChat,
  onSelect, onDelete, onTogglePin, onToggleFavorite,
}: SidebarProps) {
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState(false);
  const [width, setWidth] = useState(280);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const filtered = conversations.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase()),
  );
  const favorites = filtered.filter(c => c.favorite);
  const pinned = filtered.filter(c => c.pinned);
  const recent = filtered.filter(c => !c.pinned);

  // Resize dragging
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

  return (
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
          {/* New chat */}
          <div className="p-3">
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
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search chats..."
                className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted-30)] outline-none"
                aria-label="Search chats"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Clear search">
                  <X className="h-3.5 w-3.5 text-[var(--text-muted-50)] hover:text-[var(--text-primary)]" />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto px-3 pb-6">
            {conversations.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-[var(--text-muted-50)]">
                No conversations yet.
                <br />
                Start a new chat to begin.
              </p>
            ) : (
              <>
                {favorites.length > 0 && (
                  <SidebarSection label="Favorites" icon={Star}>
                    <div className="space-y-0.5">
                      {favorites.map(c => (
                        <ConversationItem key={c.id} conv={c} active={c.id === activeId}
                          onSelect={() => onSelect(c.id)} onDelete={() => onDelete(c.id)}
                          onTogglePin={() => onTogglePin(c.id)} onToggleFavorite={() => onToggleFavorite(c.id)} />
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
                          onTogglePin={() => onTogglePin(c.id)} onToggleFavorite={() => onToggleFavorite(c.id)} />
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
                          onTogglePin={() => onTogglePin(c.id)} onToggleFavorite={() => onToggleFavorite(c.id)} />
                      ))}
                    </div>
                  </SidebarSection>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[var(--border-color)] p-2 space-y-0.5">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-[var(--text-muted-50)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            >
              <FileText className="h-4 w-4" />
              Recent Files
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-[var(--text-muted-50)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            >
              <Settings className="h-4 w-4" />
              Settings
            </button>
          </div>

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
  );
}

export function MobileSidebarToggle({
  collapsed, onToggle,
}: { collapsed: boolean; onToggle: () => void }) {
  return (
    <Button variant="ghost" size="icon" onClick={onToggle} className="md:hidden"
      aria-label={collapsed ? 'Open sidebar' : 'Close sidebar'}>
      <PanelLeft className="h-4.5 w-4.5" />
    </Button>
  );
}