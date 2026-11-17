import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// These headers used to be emitted by proxy.ts on every matched request. They
// now live here so public pages and crawler files never need to start the
// Node proxy. Keep the CSP identical to the previous values.
function cspFor(frameable = false) {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://www.googletagmanager.com https://connect.facebook.net`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https://res.cloudinary.com https:",
    "font-src 'self' data:",
    "connect-src 'self' https:" + (isProd ? "" : " http://127.0.0.1:* http://localhost:*"),
    "frame-src 'self' https://maps.google.com https://www.google.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameable ? "'self'" : "'none'"}`,
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

const commonSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const pageSecurityHeaders = (frameable: boolean) => [
  { key: "Content-Security-Policy", value: cspFor(frameable) },
  { key: "X-Frame-Options", value: frameable ? "SAMEORIGIN" : "DENY" },
  ...commonSecurityHeaders,
];

// Media/brochure responses set their own Content-Security-Policy where needed
// (SVG files are sandboxed by the route). Replacing it here would weaken that
// sandbox, so these paths only opt into same-origin framing.
const frameableFileHeaders = [{ key: "X-Frame-Options", value: "SAMEORIGIN" }];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    // Media URLs stay stable when an admin replaces the file, so optimized
    // variants must use the default short TTL instead of a day-long cache.
    minimumCacheTTL: 60,
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
    // Next buffers the request body so the proxy.ts middleware layer can forward
    // it (see bodystreams.getCloneableBody). The default is 10 MiB which silently
    // truncates larger multipart uploads. Large brochures and media upload
    // directly to R2; only the small legacy in-band fallback (≤4 MiB) goes
    // through this proxy, so a modest ceiling is enough.
    proxyClientMaxBodySize: "64mb",
  },
  serverExternalPackages: ["pg", "@electric-sql/pglite", "pg-cloudflare"],
  // The DB layer applies ./drizzle/*.sql at runtime. Force those files into
  // every traced server function so a deploy never starts with an empty
  // migration directory (which would silently skip new tables/columns).
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*.sql"],
  },
  async headers() {
    return [
      {
        // Common hardening on every route (admin, API, previews and public HTML).
        source: "/:path*",
        headers: commonSecurityHeaders,
      },
      {
        // Authenticated/private responses must never be cached. Public pages
        // keep Next's per-route policy so ISR can emit s-maxage for the three
        // public routes that opt into it.
        source: "/admin/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        source: "/admin",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        source: "/preview/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        source: "/preview",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        // Public HTML. The private preview canvas and file viewer are excluded
        // below because they must be frameable by this same origin.
        source: "/:path((?!preview(?:/|$)|api/media(?:/|$)|api/brochures(?:/|$)).*)",
        headers: pageSecurityHeaders(false),
      },
      {
        source: "/",
        headers: pageSecurityHeaders(false),
      },
      {
        source: "/preview/:path*",
        headers: pageSecurityHeaders(true),
      },
      {
        source: "/api/media/:path*",
        headers: frameableFileHeaders,
      },
      {
        source: "/api/brochures/:path*",
        headers: frameableFileHeaders,
      },
      {
        source: "/preview/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        source: "/admin",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        source: "/api/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      // Immutable chunk caching is production-only. In dev, Turbopack serves
      // frequently-changing code from /_next/static/... URLs — with immutable,
      // browsers hold a year-old bundle across edits and "fixed" bugs appear
      // not fixed. (public/_headers only applies to the Cloudflare deploy.)
      ...(process.env.NODE_ENV === "production"
        ? [{
            source: "/_next/static/:path*",
            headers: [{ key: "Cache-Control", value: "public, max-age=31536000, s-maxage=31536000, immutable" }],
          }]
        : []),
      {
        // Stable public artwork and textures: let the browser reuse them.
        source: "/(images|brand|textures)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400" }],
      },
      {
        source: "/favicon.ico",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, s-maxage=86400" }],
      },
      {
        source: "/robots.txt",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600" }],
      },
      {
        source: "/sitemap.xml",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600" }],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, s-maxage=86400" }],
      },
      {
        // Media URLs stay stable when an admin replaces the file. Use a short,
        // bounded TTL so a cached redirect can never outlive that replacement.
        source: "/api/media/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=60, s-maxage=60, stale-while-revalidate=60" }],
      },
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

