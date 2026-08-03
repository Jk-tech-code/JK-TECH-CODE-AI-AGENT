import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account",
  description:
    "Create your free JK-TECH-CODE account to start detecting AI writing patterns, humanizing text, and accessing powerful AI writing tools.",
  alternates: {
    canonical: "/register",
  },
  openGraph: {
    title: "Create Account | JK-TECH-CODE",
    description:
      "Sign up for JK-TECH-CODE and get instant access to AI writing detection and humanization.",
    url: "/register",
  },
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
