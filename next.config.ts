import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone so the Docker image can run without node_modules.
  output: "standalone",
  images: {
    remotePatterns: [
      // LINE profile picture CDN
      { protocol: "https", hostname: "profile.line-scdn.net" },
      // Project CDN (see NEXT_PUBLIC_FILES_URL_BASE)
      { protocol: "https", hostname: "cdn.yoyemuethong.com" },
    ],
  },
};

export default nextConfig;
