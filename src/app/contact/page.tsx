import type { Metadata } from 'next';
import { ContactForm } from '@/components/contact-form';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jktechcode.com';

export const metadata: Metadata = {
  title: 'Contact | JK-TECH-CODE',
  description:
    "Have a question or feedback about JK-TECH-CODE AI? Get in touch — we'd love to hear from you.",
  alternates: { canonical: '/contact' },
  openGraph: {
    title: 'Contact | JK-TECH-CODE',
    description: 'Have a question or feedback about JK-TECH-CODE AI? Get in touch.',
    type: 'website',
    url: `${siteUrl}/contact`,
  },
};

export default function ContactPage() {
  return <ContactForm />;
}