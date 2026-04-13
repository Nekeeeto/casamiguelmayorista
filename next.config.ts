import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@react-pdf/renderer"],
  experimental: {
    serverActions: {
      /** Imágenes nuevas van como data URL en el patch Woo (base64). */
      bodySizeLimit: "20mb",
    },
  },
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
