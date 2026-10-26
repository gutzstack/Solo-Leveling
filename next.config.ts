import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM build of PostgreSQL that must be loaded with native Node `require`.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  // The local backend reads its SQL migrations at runtime, so they must ship with the server bundle.
  outputFileTracingIncludes: { "/**": ["./supabase/**/*.sql"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
