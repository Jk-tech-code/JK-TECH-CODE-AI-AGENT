'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bell, Check, ChevronDown, PanelLeft, Search, User as UserIcon, Sparkles, Zap, Brain, Eye, Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { MODEL_OPTIONS, type ModelOption } from '@/lib/core/model-catalog';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface TopNavProps {
  onToggleSidebar: () => void;
  onOpenSearch: () => void;
  /** Human-readable label of the currently selected model. */
  modelName: string;
  /** Catalog id of the currently selected model. */
  modelId: string;
  onModelChange: (modelId: string) => void;
}

/** Providers ordered for the picker — 'Automatic' first, then by family. */
const PROVIDER_ORDER = ['Automatic', 'OpenAI', 'Anthropic', 'Google', 'DeepSeek'];

function providerGroups(): Array<{ provider: string; options: ModelOption[] }> {
  const groups = new Map<string, ModelOption[]>();
  for (const opt of MODEL_OPTIONS) {
    const list = groups.get(opt.provider) ?? [];
    list.push(opt);
    groups.set(opt.provider, list);
  }
  const sorted = [...groups.entries()].sort((a, b) => {
    const ia = PROVIDER_ORDER.indexOf(a[0]);
    const ib = PROVIDER_ORDER.indexOf(b[0]);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return sorted.map(([provider, options]) => ({ provider, options }));
}

// MODEL_OPTIONS is a module constant — the grouped view never changes.
const MODEL_GROUPS = providerGroups();

export function TopNav({
  onToggleSidebar, onOpenSearch, modelName, modelId, onModelChange,
}: TopNavProps) {
  const [modelMenu, setModelMenu] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  // Close the model dropdown on outside click or Escape.
  useEffect(() => {
    if (!modelMenu) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!modelMenuRef.current?.contains(e.target as Node)) setModelMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModelMenu(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [modelMenu]);

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
      <div className="relative" ref={modelMenuRef}>
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
            aria-label="Model selection"
            className="absolute left-0 top-full z-50 mt-1.5 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-1 shadow-lift"
          >
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted-50)]">
              Choose model
            </p>

            {MODEL_GROUPS.map(group => (
              <div key={group.provider} role="group" aria-label={group.provider}>
                <p className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted-30)]">
                  {group.provider}
                </p>
                {group.options.map(m => {
                  const selected = m.modelId === modelId;
                  return (
                    <button
                      key={m.modelId}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => { onModelChange(m.modelId); setModelMenu(false); }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors',
                        selected
                          ? 'bg-[var(--surface-accent)] text-[var(--text-primary)]'
                          : 'text-[var(--text-muted-70)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{m.label}</span>
                      {m.supportsThinking && (
                        <span
                          className="flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--surface-accent)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--accent)]"
                          title="Supports reasoning / extended thinking"
                        >
                          <Brain className="h-2.5 w-2.5" /> Thinking
                        </span>
                      )}
                      {m.supportsVision && (
                        <span
                          className="flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--surface-accent)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-muted-70)]"
                          title="Supports image input"
                        >
                          <Eye className="h-2.5 w-2.5" /> Vision
                        </span>
                      )}
                      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />}
                    </button>
                  );
                })}
              </div>
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

        <Link
          href="/settings/ai"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted-50)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          aria-label="AI settings"
          title="AI settings"
        >
          <Settings className="h-4.5 w-4.5" />
        </Link>

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
