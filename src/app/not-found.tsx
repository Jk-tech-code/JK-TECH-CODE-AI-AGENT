import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '404 — Page Not Found | JK-TECH-CODE',
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="text-center max-w-md">
        <h1 className="text-7xl font-bold text-[var(--accent)] mb-4">404</h1>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Page not found</h2>
        <p className="text-[var(--text-muted-70)] mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/"
            className="px-6 py-2.5 rounded-lg bg-[var(--accent)] text-white font-medium text-sm hover:bg-[var(--accent-hover)] transition-colors"
          >
            Go Home
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-2.5 rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] font-medium text-sm hover:bg-[var(--surface-hover)] transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
