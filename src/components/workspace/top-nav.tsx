'use client';

import { useState } from 'react';
import {
  Bell, ChevronDown, PanelLeft, Search, User as UserIcon, Sparkles, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

interface TopNavProps {
  onToggleSidebar: () => void;
  onOpenSearch: () => void;
  modelName: string;
  onModelChange: (model: string) => void;
}

const MODELS = [
  { id: 'gpt-4o-mini', label: 'JK-TECH-CODE Assistant', badge: 'Fast' },
  { id: 'gpt-4o', label: 'JK-TECH-CODE Pro', badge: 'Smart' },
  { id: 'research', label: 'Research Mode', badge: 'Deep' },
];

export function TopNav({
  onToggleSidebar, onOpenSearch, modelName, onModelChange,
}: TopNavProps) {
  const [modelMenu, setModelMenu] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border-color)] bg-[var(--background)]/85 px-3 backdrop-blur-md md:px-4">
      {/* Sidebar toggle */}
      <Button
        variant="ghost" size="icon"
        onClick={onToggleSidebar}
        className="hidden h-9 w-9 shrink-0 rounded-lg text-[var(--text-muted-50)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] md:inline-flex"
        aria-label="Toggle sidebar"
      >
        <PanelLeft className="h-4.5 w-4.5" />
      </Button>

      {/* Brand */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-soft">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="hidden font-['Playfair_Display'] text-base font-bold tracking-tight text-[var(--text-primary)] sm:block">
          JK-TECH-CODE<span className="text-[var(--accent)]">.</span>
        </span>
      </div>

      {/* Model selector */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setModelMenu(v => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted-70)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
          aria-haspopup="menu"
          aria-expanded={modelMenu}
        >
          <Zap className="h-3.5 w-3.5 text-[var(--accent)]" />
          <span className="max-w-[140px] truncate">{modelName}</span>
          <ChevronDown className={cn('h-3 w-3 transition-transform', modelMenu && 'rotate-180')} />
        </button>

        {modelMenu && (
          <div
            role="menu"
            className="absolute left-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-1 shadow-lift"
          >
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted-50)]">
              Choose model
            </p>
            {MODELS.map(m => (
              <button
                key={m.id}
                type="button"
                role="menuitem"
                onClick={() => { onModelChange(m.label); setModelMenu(false); }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] text-[var(--text-muted-70)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              >
                <span>{m.label}</span>
                {m.badge && (
                  <span className="rounded-full bg-[var(--surface-accent)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                    {m.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="ghost" size="icon"
          onClick={onOpenSearch}
          className="hidden h-9 w-9 rounded-lg text-[var(--text-muted-50)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] sm:inline-flex"
          aria-label="Search"
        >
          <Search className="h-4.5 w-4.5" />
        </Button>
        <Button
          variant="ghost" size="icon"
          className="relative h-9 w-9 rounded-lg text-[var(--text-muted-50)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          aria-label="Notifications"
        >
          <Bell className="h-4.5 w-4.5" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
        </Button>
        <ThemeToggle />

        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] text-white ring-2 ring-[var(--border-color)] transition-transform hover:scale-105"
          aria-label="Profile menu"
        >
          <UserIcon className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}