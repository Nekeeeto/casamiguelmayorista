import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "casamiguel.uy",
      },
      {
        protocol: "https",
        hostname: "casamiguel.b-cdn.net",
      },
      {
        protocol: "https",
        hostname: "www.casamiguel.uy",
      },
    ],
  },
};

export default nextConfig;
