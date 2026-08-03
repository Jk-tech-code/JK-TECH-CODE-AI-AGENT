import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in to your JK-TECH-CODE account to access AI writing detection, humanization tools, and your saved conversations.",
  alternates: {
    canonical: "/login",
  },
  openGraph: {
    title: "Sign In | JK-TECH-CODE",
    description:
      "Access your JK-TECH-CODE dashboard for AI writing detection and humanization.",
    url: "/login",
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
