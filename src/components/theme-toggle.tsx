'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="h-9 w-9 rounded-lg text-[var(--text-muted-50)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      suppressHydrationWarning
    >
      {isDark ? (
        <Sun className="h-4.5 w-4.5" suppressHydrationWarning />
      ) : (
        <Moon className="h-4.5 w-4.5" suppressHydrationWarning />
      )}
    </Button>
  );
}