import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  env: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || "https://jkaiagent.vercel.app",
  },
};

export default nextConfig;
