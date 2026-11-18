"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type Fbq = (...args: unknown[]) => void;

/**
 * The base Meta Pixel snippet in the root layout tracks the initial PageView.
 * App Router client-side navigations do not re-run that snippet, so this
 * component tracks subsequent pathname changes.
 *
 * The ref is seeded with the first pathname so hydration (including React
 * Strict Mode's double-invoked mount effect) cannot duplicate the initial
 * PageView. A pathname change fires exactly one event.
 */
export function MetaPixelPageViews() {
  const pathname = usePathname();
  const lastPathname = useRef(pathname);

  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    (window as Window & { fbq?: Fbq }).fbq?.("track", "PageView");
  }, [pathname]);

  return null;
}
