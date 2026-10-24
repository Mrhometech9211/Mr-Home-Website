"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Component, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { ArrowRight, Building2 } from "lucide-react";
import type { Market, PageSection } from "@/db/schema";
import { Button3D } from "@/components/ui/Button3D";
import { Reveal } from "@/components/site/Reveal";
import { cn } from "@/lib/utils";
import type { EarthMarket } from "./Earth3D";

const Earth3D = dynamic(() => import("./Earth3D"), { ssr: false, loading: () => null });

class GLBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function detectWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

type Props = { section: PageSection; markets: Market[]; projectCounts: Record<number, number>; standalone?: boolean; initialSlug?: string | null };

const noopSubscribe = () => () => {};

function clientWebgl(): boolean {
  try {
    return detectWebGL() && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function clientQuality(): "high" | "low" {
  try {
    return (navigator.hardwareConcurrency ?? 8) <= 4 || window.innerWidth < 768 ? "low" : "high";
  } catch {
    return "low";
  }
}

export function EarthSection({ section, markets, projectCounts, standalone = false, initialSlug }: Props) {
  const root = useRef<HTMLElement>(null);
  const inView = useInView(root, { margin: "300px 0px", once: true });
  // Hydration-safe capability detection: SSR always renders the static fallback,
  // then React switches to the client snapshot without a mismatch error.
  const webgl = useSyncExternalStore(noopSubscribe, clientWebgl, () => false);
  const quality = useSyncExternalStore(noopSubscribe, clientQuality, () => "high" as const);
  const [ready, setReady] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(initialSlug ?? null);
  const listRef = useRef<HTMLUListElement>(null);

  // Warm the three.js chunk once the browser is idle (not during first paint):
  // the hero and intro video get the bandwidth first, yet the globe chunk is
  // ready long before this below-the-fold section is reached.
  useEffect(() => {
    type IdleWindow = Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const w = window as IdleWindow;
    const start = () => { void import("./Earth3D"); };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(start, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(start, 2500);
    return () => window.clearTimeout(t);
  }, []);

  // Default to the flagship market after entering view so the rotation is visible.
  useEffect(() => {
    if (!inView || selected) return;
    const flagship = markets.find((m) => m.slug === "uae") ?? markets.find((m) => m.featured) ?? markets[0];
    const t = window.setTimeout(() => flagship && setSelected(flagship.slug), 1200);
    return () => window.clearTimeout(t);
  }, [inView, markets, selected, initialSlug]);

  const earthMarkets: EarthMarket[] = useMemo(() => markets.map((m) => ({ id: m.id, slug: m.slug, name: m.name, flag: m.flag, latitude: m.latitude, longitude: m.longitude, featured: m.featured })), [markets]);
  const active = markets.find((m) => m.slug === selected) ?? null;
  const onReady = useCallback(() => setReady(true), []);

  const onKeyNav = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)) return;
    e.preventDefault();
    const idx = markets.findIndex((m) => m.slug === selected);
    const dir = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
    const next = markets[(idx + dir + markets.length) % markets.length];
    setSelected(next.slug);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-slug="${next.slug}"]`)?.focus();
  };

  return (
    <section ref={root} id="global-presence" className={cn("relative isolate overflow-hidden bg-space text-white", standalone ? "pt-32 pb-20" : "py-20 lg:py-28")} aria-labelledby="earth-title">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_45%,rgba(40,80,140,0.28),transparent_70%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-ivory to-transparent" style={{ display: standalone ? "none" : undefined }} />
      <div className="pointer-events-none absolute -bottom-40 left-1/2 h-80 w-[120%] -translate-x-1/2 rounded-[100%] bg-brand/10 blur-3xl" />

      <div className="relative mx-auto grid max-w-[1400px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:gap-6">
        <Reveal className="relative z-20 lg:col-span-3">
          <p className="eyebrow !text-brand-bright">{section.eyebrow || "Global Presence"}</p>
          <h2 id="earth-title" className="display mt-4 text-[clamp(2rem,3.6vw,3rem)] uppercase tracking-tight">
            {section.title?.split(",")[0]}{section.title?.includes(",") && ","}<br />
            <span className="text-brand-bright">{section.title?.split(",").slice(1).join(",").trim()}</span>
          </h2>
          {section.body && <p className="mt-5 max-w-xs text-[15px] leading-relaxed text-white/70">{section.body}</p>}
          {section.ctaLabel && section.ctaHref && <div className="mt-8"><Button3D href={section.ctaHref} variant="primary">{section.ctaLabel}</Button3D></div>}
          <div className="mt-8 hidden gap-6 text-[13px] text-white/60 lg:flex">
            <div><div className="text-[22px] font-semibold text-white">{markets.length}</div>Global Markets</div>
            <div><div className="text-[22px] font-semibold text-white">{Object.values(projectCounts).reduce((a, b) => a + b, 0)}</div>Live Projects</div>
          </div>
        </Reveal>

        <div className="relative lg:col-span-6">
          <div className="relative mx-auto aspect-square w-full max-w-[640px]">
            {/* Static premium fallback / loading poster */}
            <div className={cn("absolute inset-0 transition-opacity duration-1000", webgl && ready ? "opacity-0" : "opacity-100")} aria-hidden={!!(webgl && ready)}>
              <Image src="/images/earth-static.jpg" alt="Earth" fill priority={standalone} className="rounded-full object-cover" sizes="(min-width:1024px) 50vw, 100vw" />
              <div className="absolute inset-0 rounded-full shadow-[inset_0_0_80px_rgba(5,8,12,0.9),0_0_120px_rgba(80,140,255,0.18)]" />
              {webgl === false && (
                <div className="absolute inset-0">
                  {markets.map((m) => {
                    // Simple equirect-style projection on the fallback image (approximate visual positions).
                    const x = 50 + Math.cos(m.latitude * Math.PI / 180) * Math.sin((m.longitude - 40) * Math.PI / 180) * 44;
                    const y = 50 - Math.sin(m.latitude * Math.PI / 180) * 44;
                    const isA = m.slug === selected;
                    return (
                      <button key={m.slug} type="button" onClick={() => setSelected(m.slug)} aria-label={`Select ${m.name}`} aria-pressed={isA} style={{ left: `${x}%`, top: `${y}%` }} className={cn("absolute -translate-x-1/2 -translate-y-1/2 rounded-full border transition", isA ? "pulse-ring h-4 w-4 border-brand-bright bg-brand-bright shadow-glow" : "h-3 w-3 border-white/60 bg-brand hover:scale-125")} />
                    );
                  })}
                </div>
              )}
            </div>
            {webgl && !glFailed && inView && (
              <GLBoundary onError={() => setGlFailed(true)}>
                {/* The canvas only needs a small glow over-overscan; on phones a
                    wide inset shifts the globe off-centre and wastes width, so
                    the over-overscan is reduced to a subtle halo on small screens. */}
                <div className="absolute inset-x-[-4%] inset-y-[-8%] sm:inset-[-12%]">
                  <Earth3D markets={earthMarkets} selectedSlug={selected} onSelect={setSelected} onReady={onReady} quality={quality} />
                </div>
              </GLBoundary>
            )}
            {/* Pedestal glow */}
            <div className="pointer-events-none absolute -bottom-6 left-1/2 h-16 w-[80%] -translate-x-1/2 rounded-[100%] bg-brand/25 blur-2xl" />
          </div>

          {/* Market info card */}
          <AnimatePresence mode="wait">
            {active && (
              <motion.div key={active.slug} initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.98 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="glass-dark relative z-20 mx-auto mt-4 w-full max-w-sm rounded-3xl p-5 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] lg:absolute lg:right-[-4%] lg:top-1/2 lg:mt-0 lg:w-[300px] lg:-translate-y-1/2 xl:right-[-8%]" aria-live="polite">
                <div className="flex items-center gap-3">
                  <span className="text-3xl leading-none" aria-hidden>{active.flag}</span>
                  <div>
                    <h3 className="text-[20px] font-semibold tracking-tight">{active.name}</h3>
                    <p className="text-[12px] text-white/50">{(active.cities ?? []).slice(0, 3).join(" · ")}</p>
                  </div>
                </div>
                <p className="mt-3 text-[13.5px] leading-relaxed text-white/75">{active.tagline || active.description}</p>
                <div className="mt-3 flex items-center gap-2 text-[13px] text-white/70"><Building2 className="h-4 w-4 text-brand-bright" />{projectCounts[active.id] ?? 0} Projects</div>
                {active.stats && active.stats.length > 0 && (
                  <dl className="mt-3 grid grid-cols-3 gap-2">
                    {active.stats.slice(0, 3).map((s) => (
                      <div key={s.label} className="rounded-xl bg-white/5 p-2">
                        <dt className="text-[10px] uppercase tracking-wider text-white/40">{s.label}</dt>
                        <dd className="text-[13px] font-semibold text-brand-bright">{s.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <div className="mt-4 flex flex-col gap-2">
                  <Button3D href={`/projects?market=${active.slug}`} variant="primary" size="sm">View Projects</Button3D>
                  <Link href={`/markets/${active.slug}`} className="group inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/15 text-[13px] text-white/80 transition hover:border-brand-bright hover:text-white">Explore Market <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* min-w-0: the mobile pill strip (overflow-x-auto) otherwise forces this
            grid item's min-content ≈ all pills' width (~1100px+), blowing the
            single-column mobile grid wide and shoving the globe off-centre. */}
        <div className="relative z-20 min-w-0 lg:col-span-3">
          <ul ref={listRef} role="listbox" aria-label="Select a market" aria-activedescendant={selected ? `market-opt-${selected}` : undefined} onKeyDown={onKeyNav} className="flex snap-x gap-2 overflow-x-auto pb-2 scrollbar-none lg:block lg:space-y-1.5 lg:overflow-visible lg:pb-0" data-lenis-prevent>
            {markets.map((m) => {
              const isA = m.slug === selected;
              return (
                <li key={m.slug} id={`market-opt-${m.slug}`} role="option" aria-selected={isA} className="snap-start shrink-0 lg:shrink">
                  <button
                    type="button"
                    data-slug={m.slug}
                    onClick={() => setSelected(m.slug)}
                    className={cn("group flex w-full items-center gap-3 rounded-full border px-4 py-2.5 text-left text-[14px] transition-all duration-400 lg:rounded-2xl lg:py-3", isA ? "border-brand-bright/60 bg-[linear-gradient(90deg,rgba(31,143,58,0.9),rgba(31,143,58,0.35))] text-white shadow-glow" : "border-white/10 bg-white/[0.03] text-white/75 hover:border-white/25 hover:bg-white/[0.07] hover:text-white")}
                  >
                    <span className="text-lg leading-none" aria-hidden>{m.flag}</span>
                    <span className="font-medium">{m.name}</span>
                    <span className={cn("ml-auto hidden text-[11px] lg:inline", isA ? "text-white/80" : "text-white/35")}>{projectCounts[m.id] ?? 0}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
