import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://jktechcode.com";

export const metadata: Metadata = {
  title: {
    template: "%s | JK-TECH-CODE",
    default: "JK-TECH-CODE AI — Write Like You | AI Assistant & Humanizer",
  },
  description:
    "JK-TECH-CODE AI is a modern AI assistant that writes, codes, researches, and answers — with every response crafted to sound naturally human.",
  keywords: [
    "AI assistant",
    "AI writing detector",
    "humanize AI text",
    "AI writing fixer",
    "remove AI patterns",
    "natural writing",
    "anti-AI writing",
    "writing tool",
    "chat assistant",
    "JK-TECH-CODE",
  ],
  authors: [{ name: "JK-TECH-CODE" }],
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  metadataBase: new URL(siteUrl),  openGraph: {
    title: "JK-TECH-CODE AI — Write Like You",
    description:
      "A modern AI assistant that writes, codes, researches, and answers — with every response crafted to sound naturally human.",
    type: "website",
    siteName: "JK-TECH-CODE",
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "JK-TECH-CODE — AI Writing Humanizer",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "JK-TECH-CODE AI — Write Like You",
    description:
      "A modern AI assistant that writes, codes, researches, and answers — with every response crafted to sound naturally human.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
  },
  other: {
    "google-site-verification": process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION || "",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "JK-TECH-CODE",
      url: siteUrl,
      logo: `${siteUrl}/icon-192.png`,
      description:
        "Modern AI assistant and humanization platform. Ask anything and get clear, naturally-written answers in real time.",
      foundingDate: "2025",
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "support",
        email: "support@jktechcode.com",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "JK-TECH-CODE",
      description:
        "Modern AI assistant that writes, codes, researches, and answers. Every response is crafted to sound naturally human.",
      publisher: { "@id": `${siteUrl}/#organization` },
      inLanguage: "en-US",
    },
    {
      "@type": "WebPage",
      "@id": `${siteUrl}/#webpage`,
      url: siteUrl,
      name: "JK-TECH-CODE AI — Write Like You | AI Assistant & Humanizer",
      description:
        "Ask JK-TECH-CODE AI anything — build a website, write a proposal, generate code, or research a topic.",
      isPartOf: { "@id": `${siteUrl}/#website` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${siteUrl}/#app`,
      name: "JK-TECH-CODE AI",
      url: siteUrl,
      applicationCategory: "ProductivityApplication",
      operatingSystem: "Web",
      description:
        "AI assistant and humanizer. Writes, codes, researches, and answers with naturally human responses.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    {
      "@type": "FAQPage",
      "@id": `${siteUrl}/#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "What is JK-TECH-CODE AI?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "JK-TECH-CODE AI is a modern AI assistant that writes, codes, researches, and answers questions. Every response is written to sound like a real person — no robotic phrasing, no AI buzzwords.",
          },
        },
        {
          "@type": "Question",
          name: "Is my text stored or shared when I use the humanizer?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Your privacy is important. Text submitted for humanization is processed in real-time and is not stored on our servers. We do not share or use your content for training purposes.",
          },
        },
        {
          "@type": "Question",
          name: "What types of writing can JK-TECH-CODE help with?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "JK-TECH-CODE works with essays, blog posts, emails, articles, creative writing, business communications, academic papers, and any other text where you want to eliminate AI-generated patterns and sound more authentic.",
          },
        },
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${inter.variable} ${playfair.variable} antialiased`}
      >
        <a
          href="#main-content"
          className="skip-to-content"
        >
          Skip to main content
        </a>
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
