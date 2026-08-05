import Link from 'next/link';
import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jk-ai-agent.vercel.app';

export const metadata: Metadata = {
  title: 'Pricing | JK-TECH-CODE',
  description: 'Choose the right plan for your AI writing needs. Free tier available.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Pricing | JK-TECH-CODE',
    description: 'Simple, transparent pricing for JK-TECH-CODE AI. Start free, upgrade when you need more.',
    type: 'website',
    url: `${siteUrl}/pricing`,
  },
};

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Perfect for trying out our AI writing tools.',
    features: ['5 analyses per day', '500 characters per analysis', 'Basic humanization', 'Web search support'],
    cta: 'Get Started',
    href: '/register',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$19',
    period: '/month',
    description: 'For writers and professionals who need more power.',
    features: ['Unlimited analyses', '10,000 characters per analysis', 'Advanced humanization', 'Web search & research', 'Conversation history', 'Document upload & RAG', 'Priority support'],
    cta: 'Start Free Trial',
    href: '/register',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: '$99',
    period: '/month',
    description: 'For teams and organizations with advanced needs.',
    features: ['Everything in Pro', '200,000 characters per analysis', 'Custom AI model routing', 'Team collaboration', 'API access', 'Dedicated support', 'SLA guarantee'],
    cta: 'Contact Sales',
    href: '/contact',
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-6xl mx-auto px-6 py-20">
        <Link href="/" className="text-sm text-[var(--accent)] hover:underline mb-8 inline-block">&larr; Back to home</Link>

        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-4">Simple, transparent pricing</h1>
          <p className="text-[var(--text-muted-70)] max-w-xl mx-auto">
            Start for free, upgrade when you need more. No hidden fees.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {plans.map(plan => (
            <div
              key={plan.name}
              className={`rounded-2xl border p-8 flex flex-col ${
                plan.highlight
                  ? 'border-[var(--accent)] bg-[var(--accent)]/5 shadow-lg shadow-[var(--accent)]/10 scale-105'
                  : 'border-[var(--border-color)] bg-[var(--surface)]'
              }`}
            >
              <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{plan.name}</h2>
              <p className="text-sm text-[var(--text-muted-70)] mb-6">{plan.description}</p>
              <div className="mb-6">
                <span className="text-4xl font-bold text-[var(--text-primary)]">{plan.price}</span>
                <span className="text-[var(--text-muted-50)] ml-1">{plan.period}</span>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[var(--text-muted-70)]">
                    <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${plan.highlight ? 'text-[var(--accent)]' : 'text-green-400'}`} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`block text-center py-2.5 px-4 rounded-lg font-medium text-sm transition-colors ${
                  plan.highlight
                    ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
                    : 'border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
