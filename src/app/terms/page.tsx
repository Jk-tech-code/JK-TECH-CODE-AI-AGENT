import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | JK-TECH-CODE',
  description: 'JK-TECH-CODE Terms of Service — rules and guidelines for using our platform.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <Link href="/" className="text-sm text-[var(--accent)] hover:underline mb-8 inline-block">&larr; Back to home</Link>
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-8">Terms of Service</h1>
        <div className="prose prose-sm max-w-none text-[var(--text-muted-70)] space-y-6">
          <p>Last updated: July 2026</p>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mt-8">1. Acceptance of Terms</h2>
          <p>By using JK-TECH-CODE, you agree to these terms. If you do not agree, do not use the service.</p>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mt-8">2. Service Description</h2>
          <p>JK-TECH-CODE provides AI-powered text analysis and humanization tools. We reserve the right to modify or discontinue features with reasonable notice.</p>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mt-8">3. User Responsibilities</h2>
          <p>You agree not to misuse the service for illegal activities, harassment, or generating harmful content. You are responsible for maintaining the confidentiality of your account.</p>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mt-8">4. Intellectual Property</h2>
          <p>You retain ownership of content you submit. We claim no intellectual property rights over your content. The service itself, including our AI models and algorithms, is our proprietary technology.</p>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mt-8">5. Limitation of Liability</h2>
          <p>JK-TECH-CODE is provided &ldquo;as is&rdquo; without warranties. We are not liable for damages arising from use of the service.</p>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mt-8">6. Termination</h2>
          <p>We reserve the right to suspend or terminate accounts that violate these terms.</p>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mt-8">7. Contact</h2>
          <p>For questions about these terms, contact support@jktechcode.com.</p>
        </div>
      </div>
    </div>
  );
}
