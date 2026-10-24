"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowUpRight, BedDouble, Bath, Maximize, MapPin } from "lucide-react";
import type { PropertyWithMarket } from "@/lib/content";
import { cn, formatPrice } from "@/lib/utils";
import { formatArea, type AreaDisplayUnit } from "@/lib/area";

export function PropertyCard({ property, priority = false, unit = "sqm" }: { property: PropertyWithMarket; priority?: boolean; unit?: AreaDisplayUnit }) {
  const ref = useRef<HTMLDivElement>(null);
  const [imgError, setImgError] = useState(false);
  const mx = useMotionValue(0), my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 220, damping: 22 }), sy = useSpring(my, { stiffness: 220, damping: 22 });
  const rx = useTransform(sy, [-0.5, 0.5], [6, -6]);
  const ry = useTransform(sx, [-0.5, 0.5], [-6, 6]);
  const imgX = useTransform(sx, [-0.5, 0.5], [8, -8]);
  const imgY = useTransform(sy, [-0.5, 0.5], [8, -8]);
  const area = formatArea(property.areaSqm, unit);
  const isRent = property.purpose === "rent";
  const priceSuffix = isRent ? (property.rentPeriod === "month" ? "/mo" : "/yr") : "";

  return (
    <motion.div
      ref={ref}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1100 }}
      onMouseMove={(e) => { const r = ref.current?.getBoundingClientRect(); if (!r) return; mx.set((e.clientX - r.left) / r.width - 0.5); my.set((e.clientY - r.top) / r.height - 0.5); }}
      onMouseLeave={() => { mx.set(0); my.set(0); }}
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className="card-3d group relative h-full"
      data-pc
    >
      <Link href={`/properties/${property.slug}`} className="flex h-full flex-col overflow-hidden rounded-[24px] border border-ink/8 bg-white shadow-card transition-shadow duration-500 hover:shadow-[0_30px_60px_-24px_rgba(17,20,17,0.35)]" aria-label={`${property.title} — view listing`}>
        <div className="relative aspect-[4/3] overflow-hidden">
          <motion.div style={{ x: imgX, y: imgY, scale: 1.08 }} className="absolute inset-0">
            {property.coverImage && !imgError ? (
              <Image src={property.coverImage} alt={property.title} fill priority={priority} onError={() => setImgError(true)} className="object-cover transition-transform duration-700 group-hover:scale-105" sizes="(min-width:1280px) 25vw, (min-width:768px) 45vw, 90vw" />
            ) : (
              <div className="absolute inset-0 bg-[linear-gradient(135deg,#dfe5df,#f3f3ee)]" />
            )}
          </motion.div>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(5,8,12,0.75))]" />
          <div className="absolute left-4 top-4 flex gap-2">
            {property.featured && <span className="rounded-full bg-brand px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white shadow-glow">Featured</span>}
            <span className="rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white backdrop-blur">For {isRent ? "Rent" : "Sale"}</span>
          </div>
          <span className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white opacity-0 backdrop-blur transition-all duration-500 group-hover:opacity-100 group-hover:bg-brand"><ArrowUpRight className="h-4 w-4" /></span>
          <div className="absolute inset-x-4 bottom-4 text-white">
            <h3 className="text-[17px] font-semibold tracking-tight leading-tight">{property.title}</h3>
            <p className="mt-1 flex items-center gap-1 text-[12.5px] text-white/80"><MapPin className="h-3 w-3" />{[property.city, property.market?.name ?? property.country].filter(Boolean).join(", ")}</p>
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3 text-[12.5px] text-charcoal/70">
          <div className="flex items-center gap-3">
            {property.bedrooms != null && <span className="inline-flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{property.bedrooms}</span>}
            {property.bathrooms != null && <span className="inline-flex items-center gap-1"><Bath className="h-3.5 w-3.5" />{property.bathrooms}</span>}
            {area && <span className="inline-flex items-center gap-1"><Maximize className="h-3.5 w-3.5" />{area}</span>}
          </div>
          <span className="font-semibold text-brand-bright text-[13.5px]">{formatPrice(property.price, property.currency)}{priceSuffix}</span>
        </div>
      </Link>
    </motion.div>
  );
}
