'use client';

import {
  Bell, PanelLeft, Search, User as UserIcon, Sparkles, Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import Link from 'next/link';

interface TopNavProps {
  onToggleSidebar: () => void;
  onOpenSearch: () => void;
}

export function TopNav({
  onToggleSidebar, onOpenSearch,
}: TopNavProps) {
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

      {/* Brand — a single assistant, no model selector */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-soft">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="hidden font-['Playfair_Display'] text-base font-bold tracking-tight text-[var(--text-primary)] sm:block">
          JK-TECH-CODE<span className="text-[var(--accent)]">.</span>
        </span>
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
