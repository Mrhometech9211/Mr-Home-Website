import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BedDouble, Bath, Maximize, MapPin, Building2, KeyRound, Sofa, CalendarClock, Check, Share2 } from "lucide-react";
import { getPropertyBySlug, getPublishedMarkets, getPublishedProperties, getSettings } from "@/lib/content";
import { getCurrentUser } from "@/lib/auth";
import { buildMetadata } from "@/lib/seo";
import { buildWhatsAppLink, fillTemplate } from "@/lib/whatsapp";
import { formatPrice } from "@/lib/utils";
import { Breadcrumbs, JsonLd } from "@/components/site/Breadcrumbs";
import { Button3D } from "@/components/ui/Button3D";
import { Reveal } from "@/components/site/Reveal";
import { PropertyCard, formatArea } from "@/components/marketplace/PropertyCard";
import { InquiryForm } from "@/components/site/InquiryForm";
import { Gallery } from "@/app/(public)/projects/[slug]/Gallery";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPropertyBySlug(slug);
  if (!p) return { title: "Listing not found", robots: { index: false } };
  return buildMetadata(`/properties/${slug}`, { title: p.seoTitle || `${p.title} — ${p.city ?? ""}${p.market ? `, ${p.market.name}` : ""}`, description: p.seoDescription || p.shortDescription || p.description?.slice(0, 160) || null, image: p.coverImage });
}

export default async function PropertyPage({ params }: { params: Params }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const property = await getPropertyBySlug(slug);
  if (!property) notFound();
  const [settings, markets, related] = await Promise.all([
    getSettings(),
    getPublishedMarkets(),
    getPublishedProperties({ purpose: property.purpose, market: property.market?.slug, pageSize: 4 }),
  ]);
  const isRent = property.purpose === "rent";
  const priceSuffix = isRent ? (property.rentPeriod === "year" ? "/yr" : "/mo") : "";
  const wa = buildWhatsAppLink(settings.whatsapp, fillTemplate(settings.whatsappProjectMessage, { project: property.title, market: property.market?.name ?? property.country ?? "" }));
  const gallery = [property.coverImage, ...(property.gallery ?? [])].filter((g): g is string => !!g);
  const unit = "sqm";
  const area = formatArea(property.areaSqm, unit);
  const facts = [
    { icon: Building2, label: "Type", value: property.propertyType },
    { icon: BedDouble, label: "Bedrooms", value: property.bedrooms },
    { icon: Bath, label: "Bathrooms", value: property.bathrooms },
    { icon: Maximize, label: "Area", value: area },
    { icon: Sofa, label: "Furnishing", value: property.furnished ? (property.furnished === "semi" ? "Semi-furnished" : property.furnished.charAt(0).toUpperCase() + property.furnished.slice(1)) : null },
    { icon: CalendarClock, label: "Availability", value: property.availability },
  ].filter((f) => f.value != null && f.value !== "");

  const ld = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: property.title,
    description: property.shortDescription || property.description || undefined,
    image: property.coverImage,
    url: `/properties/${property.slug}`,
    address: { "@type": "PostalAddress", streetAddress: property.address, addressLocality: property.city, addressCountry: property.country },
    offer: property.price ? { "@type": "Offer", price: property.price, priceCurrency: property.currency, availability: "https://schema.org/InStock" } : undefined,
    numberOfRooms: property.bedrooms ?? undefined,
    numberOfBathroomsTotal: property.bathrooms ?? undefined,
    floorSize: property.areaSqm ? { "@type": "QuantitativeValue", value: Number(property.areaSqm), unitCode: "MTK" } : undefined,
  };
  const crumbs = [
    { name: "Home", href: "/" },
    { name: isRent ? "Rent" : "Buy", href: isRent ? "/rent" : "/buy" },
    { name: property.title, href: `/properties/${property.slug}` },
  ];
  const relatedItems = related.items.filter((r) => r.id !== property.id).slice(0, 3);

  return (
    <article>
      <JsonLd data={ld} />

      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-space pt-28 text-white lg:pt-32">
        <div className="absolute inset-0">
          {property.coverImage && <Image src={property.coverImage} alt={property.title} fill priority className="object-cover opacity-70" sizes="100vw" />}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,8,12,0.4),rgba(5,8,12,0.55)_50%,#05080c)]" />
        </div>
        <div className="relative mx-auto max-w-[1400px] px-4 pb-16 sm:px-6 lg:pb-24">
          <Breadcrumbs items={crumbs} dark />
          <Reveal className="mt-10 grid gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-brand px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white">{isRent ? "For Rent" : "For Sale"}</span>
                {property.featured && <span className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-white/80">Featured</span>}
                {property.market && <Link href={isRent ? `/rent?market=${property.market.slug}` : `/buy?market=${property.market.slug}`} className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-white/80 hover:border-brand-bright">{property.market.flag} {property.market.name}</Link>}
              </div>
              <h1 className="display mt-5 text-[clamp(2.2rem,5vw,4rem)]">{property.title}</h1>
              <p className="mt-4 flex items-center gap-2 text-[15px] text-white/70"><MapPin className="h-4 w-4 text-brand-bright" />{[property.address, property.city, property.country].filter(Boolean).join(", ")}</p>
            </div>
            <div className="glass-dark rounded-3xl p-6 lg:col-span-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">{isRent ? "Rent" : "Price"}</div>
              <div className="mt-1 text-[32px] font-semibold tracking-tight text-brand-bright">
                {formatPrice(property.price, property.currency)}<span className="text-[16px] text-white/70">{priceSuffix}</span>
              </div>
              <div className="mt-5 flex flex-col gap-2">
                <Button3D href="#inquire" variant="primary">{isRent ? "Request a Viewing" : "Request Details"}</Button3D>
                <Button3D href={wa} variant="whatsapp" icon="whatsapp" external>WhatsApp Advisor</Button3D>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Facts */}
      {facts.length > 0 && (
        <div className="relative z-10 mx-auto mt-8 max-w-[1400px] px-4 sm:px-6">
          <Reveal stagger="[data-f]" className="glass grid grid-cols-2 gap-px overflow-hidden rounded-[28px] shadow-card md:grid-cols-3 lg:grid-cols-6">
            {facts.map((f) => (
              <div key={f.label} data-f className="flex items-center gap-3 px-5 py-5">
                <f.icon className="h-5 w-5 shrink-0 text-brand" aria-hidden />
                <div><div className="text-[11px] uppercase tracking-wider text-mist">{f.label}</div><div className="text-[15px] font-semibold text-ink">{f.value}</div></div>
              </div>
            ))}
          </Reveal>
        </div>
      )}

      <div className="mx-auto grid max-w-[1400px] gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12">
        <div className="space-y-16 lg:col-span-8">
          <Reveal>
            <h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">About this {isRent ? "rental" : "property"}</h2>
            <div className="mt-5 space-y-4 text-[16px] leading-relaxed text-charcoal/85">
              {property.shortDescription && <p>{property.shortDescription}</p>}
              {(property.description || "").split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </Reveal>

          {gallery.length > 0 && <Reveal><h2 className="display mb-5 text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Gallery</h2><Gallery images={gallery} name={property.title} /></Reveal>}

          {(property.amenities ?? []).length > 0 && (
            <Reveal>
              <h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Amenities</h2>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {property.amenities!.map((a) => <li key={a} className="flex items-center gap-2 rounded-2xl border border-ink/8 bg-white px-4 py-3 text-[14px] text-charcoal"><Check className="h-4 w-4 text-brand" aria-hidden />{a}</li>)}
              </ul>
            </Reveal>
          )}
        </div>

        <aside className="lg:col-span-4">
          <div id="inquire" className="space-y-6 lg:sticky lg:top-28">
            <div>
              <h2 className="mb-4 text-[20px] font-semibold tracking-tight text-ink">Enquire about {property.title}</h2>
              <InquiryForm fields={settings.contactFields.filter((f) => f !== "project" && f !== "market")} markets={markets.map((m) => ({ id: m.id, name: m.name, slug: m.slug, flag: m.flag, cities: m.cities }))} projects={[]} budgetOptions={settings.budgetOptions} interestOptions={settings.interestOptions} cityFieldEnabled={settings.cityFieldEnabled} customBudgetEnabled={settings.customBudgetEnabled} defaultMarketId={property.marketId ?? undefined} source="property-page" compact submitLabel={isRent ? "Request a Viewing" : "Request Details"} />
              <input type="hidden" />
              <p className="mt-4 text-[11.5px] leading-relaxed text-mist">{settings.disclaimer}</p>
            </div>
          </div>
        </aside>
      </div>

      {relatedItems.length > 0 && (
        <section className="bg-ivory-deep/60 py-20">
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
            <Reveal className="flex items-end justify-between">
              <h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Similar {isRent ? "rentals" : "listings"}</h2>
              <Link href={isRent ? `/rent?market=${property.market?.slug ?? ""}` : `/buy?market=${property.market?.slug ?? ""}`} className="text-[13.5px] font-medium text-brand hover:underline">View all</Link>
            </Reveal>
            <Reveal stagger="[data-r]" className="perspective mt-8 grid gap-6 md:grid-cols-3">{relatedItems.map((p, i) => <div key={p.id} data-r><PropertyCard property={p} unit={unit} priority={i === 0} /></div>)}</Reveal>
          </div>
        </section>
      )}
    </article>
  );
}
