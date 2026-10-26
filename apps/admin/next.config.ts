import type { NextConfig } from "next";

/**
 * PerdeGo Admin — Next.js yapılandırması.
 *
 * API köprüsü (FAZ 8): panel ile API aynı menşe (same-origin) üzerinden
 * konuşur. Tarayıcı yalnızca göreli yollar kullanır (/api/v1/*, /health*);
 * Next.js bunları iç ağdaki NestJS örneğine çevirir. Böylece:
 *  - CORS gerekmez, çerez/anahtar üçüncü menşe exposing yoktur,
 *  - gateway arkasında tek dış port (3000) tüm paneli servis eder,
 *  - sağlayıcı anahtarları ve imzalama sırları ASLA tarayıcıya gitmez
 *    (yükleme URL'leri sunucuda üretilir; süreli + imzalıdır).
 */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3002";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Dev modunda 127.0.0.1/localhost dışı kaynak engellenmesin (gateway 3000'e
  // farklı host başlığıyla gelebilir).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${API_INTERNAL_URL}/api/v1/:path*` },
      { source: "/health", destination: `${API_INTERNAL_URL}/health` },
      { source: "/health/db", destination: `${API_INTERNAL_URL}/health/db` },
      { source: "/api/docs", destination: `${API_INTERNAL_URL}/api/docs` },
      { source: "/api/docs/:path*", destination: `${API_INTERNAL_URL}/api/docs/:path*` },
      { source: "/api/docs-json", destination: `${API_INTERNAL_URL}/api/docs-json` },
    ];
  },
};

export default nextConfig;
