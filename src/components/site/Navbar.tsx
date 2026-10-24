"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, MessageCircle, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { safeHref } from "@/lib/url";
import { Button3D } from "@/components/ui/Button3D";

export type NavItem = { id: number; label: string; href: string; openInNewTab?: boolean; children?: NavItem[] };

/** DB-stored nav hrefs are admin input — neutralize dangerous schemes. */
function withSafeChildren(items: NavItem[]): NavItem[] {
  return items.map((i) => ({ ...i, href: safeHref(i.href), children: i.children?.map((c) => ({ ...c, href: safeHref(c.href) })) }));
}

type Props = { brandName: string; logo: string; items: NavItem[]; whatsappHref: string; whatsappLabel?: string };

export function Navbar({ brandName, logo, items, whatsappHref }: Props) {
  const navItems = withSafeChildren(items);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);

  useEffect(() => {
    // Auto-hide the moment the page moves down (‑ not after 140px, which was the
    // old "late" behaviour), reveal on the first upward pixel. rAF-batched so
    // it stays glued to the scroll position instead of lagging a frame behind.
    // The bar can always come back: scroll up, mouse near the top edge, wheel-up
    // intent (works inside scroll-jacked sections) or keyboard focus.
    let lastY = window.scrollY;
    let ticking = false;
    const reveal = () => setHidden(false);
    const apply = () => {
      ticking = false;
      const y = window.scrollY;
      setScrolled(y > 12);
      const delta = y - lastY;
      if (open || openDropdown !== null) {
        setHidden(false);
      } else if (delta > 1 && y > 24) {
        setHidden(true);
      } else if (delta < -1 || y <= 24) {
        setHidden(false);
      }
      lastY = y;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    };
    const onMouseMove = (e: MouseEvent) => { if (e.clientY <= 90) reveal(); };
    // Wheel intent lets the bar return even where a pinned section swallows
    // scrollY changes. Any upward wheel delta reveals, not just large ones.
    const onWheel = (e: WheelEvent) => { if (e.deltaY < 0) reveal(); };
    const onFocusIn = (e: FocusEvent) => { if (headerRef.current?.contains(e.target as Node)) reveal(); };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("wheel", onWheel);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open, openDropdown]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("lenis-stopped");
    // Hide floating CTAs (WhatsApp bubble) while the menu is open so they can
    // never sit above menu links; restored automatically on close.
    document.documentElement.classList.add("mrh-menu-open");
    const first = drawerRef.current?.querySelector<HTMLElement>("a,button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab" && drawerRef.current) {
        const f = drawerRef.current.querySelectorAll<HTMLElement>("a,button,[tabindex]:not([tabindex='-1'])");
        if (!f.length) return;
        const firstEl = f[0], lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.classList.remove("lenis-stopped");
      document.documentElement.classList.remove("mrh-menu-open");
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
    <header
      ref={headerRef}
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-transform duration-200 ease-[cubic-bezier(.16,1,.3,1)] will-change-transform",
        hidden ? "pointer-events-none -translate-y-[110%] opacity-0" : "translate-y-0 opacity-100",
        scrolled ? "py-2" : "py-4",
      )}
    >
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <div className={cn("flex items-center justify-between rounded-full px-4 sm:px-5 transition-all duration-500", scrolled ? "glass shadow-soft h-16" : "h-[72px] bg-transparent")}>
          <Link href="/" className="relative flex h-10 w-[150px] items-center sm:w-[170px]" aria-label={`${brandName} home`}>
            <Image src={logo} alt={brandName} fill priority className="object-contain object-left" sizes="170px" unoptimized={logo.endsWith(".svg")} />
          </Link>

          <nav aria-label="Primary" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {navItems.map((item) => (
                <li key={item.id} className="relative" onMouseEnter={() => item.children?.length && setOpenDropdown(item.id)} onMouseLeave={() => setOpenDropdown(null)}>
                  <Link
                    href={item.href}
                    target={item.openInNewTab ? "_blank" : undefined}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={cn("group relative block px-3 py-2 text-[13.5px] font-medium tracking-tight transition-colors lg:px-4 lg:text-[14px]", isActive(item.href) ? "text-ink" : "text-charcoal/80 hover:text-ink")}
                  >
                    {item.label}
                    <span className={cn("absolute inset-x-4 -bottom-0.5 h-[2px] origin-left rounded-full bg-brand transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)]", isActive(item.href) ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100")} />
                  </Link>
                  {item.children && item.children.length > 0 && (
                    <AnimatePresence>
                      {openDropdown === item.id && (
                        <motion.ul initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.2 }} className="glass absolute left-2 top-full mt-2 min-w-[200px] rounded-2xl p-2 shadow-soft">
                          {item.children.map((c) => (
                            <li key={c.id}>
                              <Link href={c.href} className="block rounded-xl px-3 py-2 text-[13px] text-charcoal hover:bg-brand/8 hover:text-brand">{c.label}</Link>
                            </li>
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            {/* Phase 2: the old mobile-number card is now a List Your Property
                action. The number itself stays in the mobile drawer and footer. */}
            <Link
              href="/list-your-property"
              aria-label="List your property with us"
              className="hidden h-11 select-none items-center gap-2 whitespace-nowrap rounded-full border border-brand/30 bg-brand/10 px-4 text-[14px] font-semibold tracking-tight text-ink shadow-soft transition hover:border-brand/60 hover:text-brand lg:flex"
            >
              <Home className="h-4 w-4 text-brand" aria-hidden />
              List Your Property
            </Link>
            <div className="hidden lg:block">
              <Button3D href={whatsappHref} variant="primary" size="sm" icon="whatsapp" external>Speak With Us</Button3D>
            </div>
            <button
              type="button"
              onClick={() => { setOpen(true); setHidden(false); }}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label="Open menu"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-ink/10 bg-white/70 text-ink shadow-soft backdrop-blur transition hover:border-brand/40 md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </header>

    {/*
      Mobile drawer lives OUTSIDE the <header> on purpose: the header always
      carries a translate/will-change transform (auto-hide animation), and a
      transformed element becomes the containing block for `position: fixed`
      descendants — which previously collapsed this full-screen drawer to the
      header's ~104px box (links invisible, page visible behind, CTAs floating
      mid-screen). As a sibling of the header, `fixed` resolves against the
      real viewport on every breakpoint.
    */}
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[85] bg-ink/40 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} />
            <motion.div
              id="mobile-menu"
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="fixed inset-y-0 right-0 z-[90] flex w-[min(92vw,400px)] flex-col bg-ivory shadow-2xl md:hidden"
            >
              <div className="flex items-center justify-between px-5 py-5">
                <div className="relative h-9 w-[140px]"><Image src={logo} alt={brandName} fill className="object-contain object-left" sizes="140px" unoptimized={logo.endsWith(".svg")} /></div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="flex h-11 w-11 items-center justify-center rounded-full border border-ink/10 bg-white text-ink"><X className="h-5 w-5" /></button>
              </div>
              <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-3" data-lenis-prevent>
                <ul className="space-y-1">
                  {navItems.map((item, i) => (
                    <motion.li key={item.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i + 0.1 }}>
                      <Link href={item.href} onClick={() => setOpen(false)} aria-current={isActive(item.href) ? "page" : undefined} className={cn("flex items-center justify-between rounded-2xl px-4 py-4 text-[22px] font-medium tracking-tight", isActive(item.href) ? "bg-white text-brand shadow-soft" : "text-ink hover:bg-white/70")}>
                        {item.label}
                        {isActive(item.href) && <span className="h-2 w-2 rounded-full bg-brand" />}
                      </Link>
                      {item.children?.map((c) => (
                        <Link key={c.id} href={c.href} onClick={() => setOpen(false)} className="block rounded-xl px-8 py-2 text-[15px] text-charcoal">{c.label}</Link>
                      ))}
                    </motion.li>
                  ))}
                </ul>
              </nav>
              <div className="space-y-3 border-t border-ink/10 p-5">
                {/* The raw phone number is deliberately gone from the mobile
                    drawer — the primary action is listing a property. */}
                <Link href="/list-your-property" onClick={() => setOpen(false)} className="flex h-12 items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-semibold text-white shadow-glow"><Home className="h-4 w-4" /> List Your Property</Link>
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-full border border-ink/10 bg-white text-ink"><MessageCircle className="h-4 w-4" /> Chat on WhatsApp</a>
              </div>
            </motion.div>
        </>
      )}
    </AnimatePresence>
    </>
  );
}
