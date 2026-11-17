import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "mrh_session";

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
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Public pages, sitemap/robots, images and other crawler hits are served
  // without starting this proxy: their security/cache headers are in
  // next.config.ts. Only routes that genuinely need CSRF or the admin cookie
  // gate run here.
  //
  // The local disk upload is excluded because it streams a raw body; if the
  // proxy buffered it, Next's proxyClientMaxBodySize (64 MB) would truncate
  // large videos. Auth is enforced inside that route.
  matcher: [
    "/admin/:path*",
    "/admin",
    "/preview/:path*",
    // All API routes except the raw-body local upload. That endpoint streams
    // multipart video directly and must never be buffered by the proxy.
    "/((?!api/admin/media/local-upload(?:/|$))api/.*)",
  ],
};
