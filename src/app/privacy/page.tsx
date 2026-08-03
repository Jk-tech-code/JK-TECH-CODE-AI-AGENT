import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | JK-TECH-CODE',
  description: 'JK-TECH-CODE Privacy Policy — how we collect, use, and protect your data.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <Link href="/" className="text-sm text-[var(--accent)] hover:underline mb-8 inline-block">&larr; Back to home</Link>
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-8">Privacy Policy</h1>
        <div className="prose prose-sm max-w-none text-[var(--text-muted-70)] space-y-6">
          <p>Last updated: July 2026</p>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mt-8">1. Information We Collect</h2>
          <p>We collect information you provide when creating an account, using our AI writing tools, uploading documents, and communicating with us. This includes email address, name, and content you submit for analysis or humanization.</p>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mt-8">2. How We Use Your Information</h2>
          <p>We use your information to provide and improve our AI writing detection and humanization services, process your requests, send service-related communications, and ensure platform security.</p>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mt-8">3. Data Storage & Security</h2>
          <p>Your data is stored securely using industry-standard encryption. We retain your content only as long as necessary to provide our services. You can delete your account and associated data at any time.</p>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mt-8">4. Third-Party Services</h2>
          <p>We use Supabase for authentication and database hosting, and various AI model providers for text processing. These providers have their own privacy policies governing data handling.</p>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mt-8">5. Your Rights</h2>
          <p>You have the right to access, correct, or delete your personal data. Contact us at support@jktechcode.com for any privacy-related requests.</p>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mt-8">6. Contact</h2>
          <p>For privacy inquiries, email us at support@jktechcode.com.</p>
        </div>
      </div>
    </div>
  );
}
