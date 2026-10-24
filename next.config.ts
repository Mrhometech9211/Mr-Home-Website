import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
    // Next buffers the request body so the proxy.ts middleware layer can forward
    // it (see bodystreams.getCloneableBody). The default is 10 MiB which silently
    // truncates any larger multipart upload — brochures go up to 60 MB and media
    // files can be big, so raise the proxy body ceiling to match the API limits.
    proxyClientMaxBodySize: "64mb",
  },
  serverExternalPackages: ["pg", "@electric-sql/pglite", "pg-cloudflare"],
  async headers() {
    return [
      {
        // HTML must never be cached by browsers/proxies: stale HTML references
        // immutable-hashed chunks from old builds → chunk-mismatch errors after
        // deploys. Static assets keep their own immutable caching.
        source: "/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      // Immutable chunk caching is production-only. In dev, Turbopack serves
      // frequently-changing code from /_next/static/... URLs — with immutable,
      // browsers hold a year-old bundle across edits and "fixed" bugs appear
      // not fixed. (public/_headers only applies to the Cloudflare deploy.)
      ...(process.env.NODE_ENV === "production"
        ? [{
            source: "/_next/static/:path*",
            headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
          }]
        : []),
    ];
  },
};

export default nextConfig;

let _cfDevReady = false;

(async () => {
  // NOTE: warp-wrangler's getPlatformProxy loads workerd WASM in this very process,
  // which hard-aborts PGlite's emscripten engine ("RuntimeError: Aborted()") on the
  // first catalog query — every route then 500s. It never returned a usable context
  // locally anyway, so it stays OFF by default; opt in explicitly when needed.
  if (process.env.MRH_SKIP_CF_PROXY !== "0") return;
  try {
    const { getPlatformProxy } = await import('wrangler');
    const cf = await getPlatformProxy({ envFiles: [], environment: undefined });
    if (cf && typeof (cf as any).getCloudflareContext === 'function') {
      _cfDevReady = true;
      console.log('[mrhome] OpenNext platform proxy ready (local bindings available)');
    } else {
      console.warn('[mrhome] OpenNext platform proxy returned no usable context; running without local Cloudflare bindings (PGlite + default cache will be used)');
    }
  } catch (e) {
    console.warn('[mrhome] OpenNext dev init skipped:', e && (e as any).message || e);
  }
})();

