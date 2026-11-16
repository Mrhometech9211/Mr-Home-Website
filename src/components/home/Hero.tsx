"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Button3D } from "@/components/ui/Button3D";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

export type HeroProps = {
  eyebrow?: string | null;
  title: string;
  body?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  secondaryCtaLabel?: string | null;
  secondaryCtaHref?: string | null;
  image: string;
  marketCount?: number;
  publishedProjectCount?: number;
};

function splitTitle(title: string) {
  // Highlight the final word ("Better.") in brand green per reference.
  const parts = title.split(/\s+/);
  if (parts.length < 2) return { lead: title, tail: "" };
  const tail = parts.pop() as string;
  return { lead: parts.join(" "), tail };
}

export function Hero({ eyebrow, title, body, ctaLabel, ctaHref, secondaryCtaLabel, secondaryCtaHref, image, marketCount, publishedProjectCount, play, cinematicEntry }: HeroProps & { play: boolean; cinematicEntry: boolean }) {
  const root = useRef<HTMLElement>(null);
  const imgWrap = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 20 });
  const sy = useSpring(my, { stiffness: 60, damping: 20 });
  const rotY = useTransform(sx, [-1, 1], [-4, 4]);
  const rotX = useTransform(sy, [-1, 1], [3, -3]);
  const tx = useTransform(sx, [-1, 1], [-10, 10]);
  const ty = useTransform(sy, [-1, 1], [-8, 8]);
  const { lead, tail } = splitTitle(title);
  const proofPoints = [
    marketCount && marketCount > 0 ? `${marketCount} Market Guide${marketCount === 1 ? "" : "s"}` : null,
    publishedProjectCount && publishedProjectCount > 0 ? `${publishedProjectCount} Published Project${publishedProjectCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");

  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      // Mobile: keep the parallax subtle — a full 12% slide pushes the photo
      // down into the stats band (misaligned overlap on phones). Desktop keeps
      // the cinematic depth unchanged.
      gsap.to("[data-hero-img]", { yPercent: 4, ease: "none", scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: true } });
      gsap.to("[data-hero-copy]", { yPercent: -18, opacity: 0.2, ease: "none", scrollTrigger: { trigger: el, start: "top top", end: "70% top", scrub: true } });
    }, el);
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
      gsap.to("[data-hero-img]", { yPercent: 12, scale: 1.06, ease: "none", scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: true } });
      gsap.to("[data-hero-ribbon]", { xPercent: -8, ease: "none", scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: true } });
    });
    return () => { ctx.revert(); mm.revert(); };
  }, []);

  const onMove = (e: React.MouseEvent) => {
    const r = root.current?.getBoundingClientRect();
    if (!r) return;
    mx.set(((e.clientX - r.left) / r.width) * 2 - 1);
    my.set(((e.clientY - r.top) / r.height) * 2 - 1);
  };

  const fade = (d: number) => ({ initial: { opacity: 0, y: 26, filter: "blur(6px)" }, animate: play ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}, transition: { duration: 1, delay: d, ease: [0.16, 1, 0.3, 1] as const } });

  return (
    <section ref={root} onMouseMove={onMove} onMouseLeave={() => { mx.set(0); my.set(0); }} className="relative isolate min-h-[100svh] overflow-hidden pt-28 sm:pt-32 lg:pt-36" aria-labelledby="hero-title">
      {/* Layered ribbons / light */}
      <div data-hero-ribbon className="pointer-events-none absolute -left-[20%] top-[35%] -z-10 h-[70%] w-[140%] rotate-[-8deg] bg-[radial-gradient(60%_50%_at_50%_50%,rgba(31,143,58,0.10),transparent_70%)]" />
      <div className="pointer-events-none absolute right-0 top-0 -z-10 h-[60%] w-[55%] bg-[radial-gradient(70%_60%_at_80%_20%,rgba(255,255,255,0.9),transparent_70%)]" />

      <div className="mx-auto grid max-w-[1400px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:gap-6">
        <div data-hero-copy className="relative z-10 lg:col-span-5">
          {eyebrow && <motion.p {...fade(0.05)} className="eyebrow">{eyebrow}</motion.p>}
          <motion.h1 id="hero-title" {...fade(0.15)} className="display mt-5 text-[clamp(2.8rem,7.2vw,5.6rem)] text-ink">
            {lead} <span className="text-brand">{tail}</span>
          </motion.h1>
          {body && <motion.p {...fade(0.3)} className="mt-6 max-w-md text-[16px] leading-relaxed text-charcoal/85 sm:text-[17px]">{body}</motion.p>}
          <motion.div {...fade(0.42)} className="mt-8 flex flex-wrap items-center gap-3">
            {ctaLabel && ctaHref && <Button3D href={ctaHref} variant="primary" size="lg">{ctaLabel}</Button3D>}
            {secondaryCtaLabel && secondaryCtaHref && <Button3D href={secondaryCtaHref} variant="secondary" size="lg">{secondaryCtaLabel}</Button3D>}
          </motion.div>
          <motion.a {...fade(0.6)} href="#stats" className="mt-12 inline-flex items-center gap-3 text-[13px] text-charcoal/70 transition hover:text-brand" aria-label="Scroll to explore">
            <span className="relative flex h-9 w-5 items-start justify-center rounded-full border border-ink/25 p-1">
              <motion.span className="block h-1.5 w-1 rounded-full bg-brand" animate={{ y: [0, 12, 0], opacity: [1, 0.3, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }} />
            </span>
            Scroll to Explore
          </motion.a>
        </div>

        <div className="relative lg:col-span-7 perspective">
          <motion.div
            ref={imgWrap}
            style={{ rotateY: rotY, rotateX: rotX, x: tx, y: ty }}
            initial={cinematicEntry ? { scale: 1.28, opacity: 0, filter: "blur(14px)" } : false}
            animate={play ? { scale: 1, opacity: 1, filter: "blur(0px)" } : {}}
            transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
            className="card-3d relative aspect-[16/11] w-full overflow-hidden rounded-[28px] shadow-[0_40px_90px_-30px_rgba(17,20,17,0.45)] sm:rounded-[36px] lg:aspect-[4/3] xl:aspect-[16/10]"
          >
            <div data-hero-img className="absolute inset-0 will-change-transform">
              <Image src={image} alt="Luxury property" fill priority className="object-cover" sizes="(min-width:1024px) 58vw, 100vw" />
            </div>
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_30%,rgba(17,20,17,0.25))]" />
            <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/40" />
          </motion.div>
          {/* Floating spec chip */}
          {proofPoints && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={play ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.9, duration: 0.9, ease: [0.16, 1, 0.3, 1] }} className="glass float-slow absolute -bottom-5 left-4 hidden rounded-2xl px-5 py-4 shadow-card sm:block lg:-left-6">
              <div className="text-[11px] uppercase tracking-[0.18em] text-mist">Curated Portfolio</div>
              <div className="mt-1 text-[15px] font-semibold text-ink">{proofPoints}</div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Green sweep towards next section */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(180deg,transparent,rgba(31,143,58,0.06))]" />
      <svg className="pointer-events-none absolute -bottom-1 left-0 w-[160%] -translate-x-[15%] text-brand/25 sm:w-full sm:translate-x-0" viewBox="0 0 1440 120" fill="none" aria-hidden><path d="M0 90C240 130 480 20 720 40s480 90 720 10v80H0z" fill="currentColor" /></svg>
    </section>
  );
}
