'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="text-center max-w-md">
        <h1 className="text-7xl font-bold text-red-400 mb-4">500</h1>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Something went wrong</h2>
        <p className="text-[var(--text-muted-70)] mb-8">
          An unexpected error occurred. Our team has been notified.
        </p>
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={reset}
            className="px-6 py-2.5 rounded-lg bg-[var(--accent)] text-white font-medium text-sm hover:bg-[var(--accent-hover)] transition-colors cursor-pointer border-none"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="px-6 py-2.5 rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] font-medium text-sm hover:bg-[var(--surface-hover)] transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
