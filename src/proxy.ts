import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "mrh_session";
const isProd = process.env.NODE_ENV === "production";

function securityHeaders(res: NextResponse, isAdmin: boolean) {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://www.googletagmanager.com https://connect.facebook.net`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https://res.cloudinary.com https:",
    "font-src 'self' data:",
    // Direct-to-R2 browser PUTs go to the storage endpoint (https in prod).
    // Dev additionally allows loopback http so the local R2 emulator works.
    "connect-src 'self' https:" + (isProd ? "" : " http://127.0.0.1:* http://localhost:*"),
    "frame-src https://maps.google.com https://www.google.com https://www.youtube.com https://player.vimeo.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (isProd) res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  if (isAdmin) res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return res;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();

  // CSRF: reject cross-origin state-changing API requests.
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin && host) {
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = "";
      }
      if (originHost !== host) {
        return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
      }
    }
  }

  const isAdmin = pathname.startsWith("/admin");
  if (isAdmin && !pathname.startsWith("/admin/login") && !pathname.startsWith("/admin/setup")) {
    if (!req.cookies.get(SESSION_COOKIE)?.value) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return securityHeaders(NextResponse.redirect(url), true);
    }
  }

  return securityHeaders(NextResponse.next(), isAdmin || pathname.startsWith("/api/admin"));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|textures/|images/|brand/).*)"],
};
