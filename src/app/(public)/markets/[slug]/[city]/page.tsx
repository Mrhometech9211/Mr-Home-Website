import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { getCitiesByMarket, getCityBySlug, getMarketBySlug, getPublishedProjects, getSettings } from "@/lib/content";
import { getCurrentUser } from "@/lib/auth";
import { buildMetadata } from "@/lib/seo";
import { Breadcrumbs, JsonLd } from "@/components/site/Breadcrumbs";
import { Button3D } from "@/components/ui/Button3D";
import { Reveal } from "@/components/site/Reveal";
import { ProjectCard } from "@/components/site/ProjectCard";

export const dynamic = "force-dynamic";
type Params = Promise<{ slug: string; city: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug: marketSlug, city: citySlug } = await params;
  const market = await getMarketBySlug(marketSlug);
  if (!market) return { title: "City not found", robots: { index: false } };
  const city = await getCityBySlug(market.id, citySlug);
  if (!city) return { title: "City not found", robots: { index: false } };
  return buildMetadata(`/markets/${marketSlug}/${citySlug}`, {
    title: city.seoTitle || `Property Investment in ${city.name}, ${market.name}`,
    description: city.seoDescription || city.tagline || city.description || undefined,
    image: city.coverImage || undefined,
  });
}

export default async function CityPage({ params }: { params: Params }) {
  const { slug: marketSlug, city: citySlug } = await params;
  const user = await getCurrentUser();
  const market = await getMarketBySlug(marketSlug, !!user);
  if (!market) notFound();
  const [city, settings, siblingCities] = await Promise.all([getCityBySlug(market.id, citySlug), getSettings(), getCitiesByMarket(market.id)]);
  if (!city) notFound();
  const projects = await getPublishedProjects({ market: market.slug, city: city.name });
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Markets", href: "/markets" },
    { name: market.name, href: `/markets/${market.slug}` },
    { name: city.name, href: `/markets/${market.slug}/${city.slug}` },
  ];
  const ld = {
    "@context": "https://schema.org",
    "@type": "City",
    name: city.name,
    description: city.description,
    containedInPlace: { "@type": "Country", name: market.name },
    geo: city.latitude != null && city.longitude != null ? { "@type": "GeoCoordinates", latitude: city.latitude, longitude: city.longitude } : undefined,
    image: city.coverImage,
  };

  return (
    <article>
      <JsonLd data={ld} />
      <section className="relative isolate overflow-hidden bg-space pt-28 text-white lg:pt-32">
        <div className="absolute inset-0">
          {city.coverImage ? <Image src={city.coverImage} alt={city.name} fill priority className="object-cover opacity-60" sizes="100vw" /> : market.coverImage ? <Image src={market.coverImage} alt={city.name} fill priority className="object-cover opacity-50" sizes="100vw" /> : null}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,8,12,0.4),rgba(5,8,12,0.6)_50%,#05080c)]" />
        </div>
        <div className="relative mx-auto max-w-[1400px] px-4 pb-20 sm:px-6">
          <Breadcrumbs items={crumbs} dark />
          <Reveal className="mt-10 max-w-3xl">
            <p className="eyebrow !text-brand-bright">{market.flag} {market.name}</p>
            <h1 className="display mt-4 text-[clamp(2.6rem,6vw,5rem)]">{city.name}</h1>
            {city.tagline && <p className="mt-4 text-[18px] text-white/75">{city.tagline}</p>}
            {city.latitude != null && city.longitude != null && (
              <p className="mt-3 flex items-center gap-2 text-[13px] text-white/50"><MapPin className="h-4 w-4 text-brand-bright" />{city.latitude.toFixed(2)}°, {city.longitude.toFixed(2)}° · {projects.length} live project{projects.length === 1 ? "" : "s"}</p>
            )}
            <div className="mt-8 flex flex-wrap gap-3">
              <Button3D href={`/projects?market=${market.slug}&city=${encodeURIComponent(city.name)}`}>View Projects ({projects.length})</Button3D>
              <Button3D href={`/markets/${market.slug}`} variant="secondary"><span className="inline-flex items-center gap-2"><ArrowLeft className="h-4 w-4" />Back to {market.name}</span></Button3D>
            </div>
          </Reveal>
        </div>
      </section>

      {city.stats && city.stats.length > 0 && (
        <div className="relative z-10 mx-auto mt-8 max-w-[1400px] px-4 sm:px-6">
          <Reveal stagger="[data-s]" className="glass grid grid-cols-1 gap-px overflow-hidden rounded-[28px] shadow-card sm:grid-cols-3">
            {city.stats.map((s) => <div key={s.label} data-s className="px-6 py-6"><div className="text-[11px] uppercase tracking-wider text-mist">{s.label}</div><div className="mt-1 text-[24px] font-semibold tracking-tight text-brand">{s.value}</div></div>)}
          </Reveal>
        </div>
      )}

      <div className="mx-auto grid max-w-[1400px] gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12">
        <div className="space-y-12 lg:col-span-7">
          {city.description && <Reveal><h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Why {city.name}?</h2><p className="mt-5 text-[16px] leading-relaxed text-charcoal/85">{city.description}</p></Reveal>}
          {siblingCities.filter((c) => c.id !== city.id).length > 0 && (
            <Reveal>
              <h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Other cities in {market.name}</h2>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {siblingCities.filter((c) => c.id !== city.id).map((c) => (
                  <li key={c.id}>
                    <Link href={`/markets/${market.slug}/${c.slug}`} className="group flex items-center justify-between rounded-2xl border border-ink/10 bg-white px-4 py-3.5 shadow-soft transition hover:border-brand hover:shadow-card">
                      <span className="text-[14.5px] font-semibold text-ink">{c.name}</span>
                      <ArrowLeft className="h-4 w-4 shrink-0 rotate-180 text-mist transition-transform group-hover:translate-x-1 group-hover:text-brand" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Reveal>
          )}
        </div>
        <aside className="lg:col-span-5">
          <div className="rounded-3xl border border-ink/8 bg-white p-6 shadow-soft">
            <h2 className="text-[20px] font-semibold tracking-tight text-ink">Invest in {city.name}</h2>
            <p className="mt-2 text-[13.5px] text-charcoal/75">Speak with an MR.HOME advisor about opportunities in {city.name}, {market.name}.</p>
            <div className="mt-5 flex flex-col gap-2">
              <Button3D href={`/contact?market=${market.slug}&city=${encodeURIComponent(city.name)}`} variant="primary">Register Interest</Button3D>
              <Button3D href={`/markets/${market.slug}`} variant="secondary">Explore all of {market.name}</Button3D>
            </div>
          </div>
        </aside>
      </div>

      <section className="bg-ivory-deep/60 py-20">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
          <Reveal><h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Projects in {city.name}</h2></Reveal>
          {projects.length === 0 ? (
            <div className="mt-8 rounded-3xl border border-dashed border-ink/15 bg-white/60 p-12 text-center text-charcoal/70">New opportunities in {city.name} are being curated. <Link href="/contact" className="text-brand">Register your interest.</Link></div>
          ) : (
            <Reveal stagger="[data-p]" className="perspective mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{projects.map((p) => <div key={p.id} data-p><ProjectCard project={p} /></div>)}</Reveal>
          )}
        </div>
      </section>
      {settings.disclaimer && <p className="mx-auto max-w-[1400px] px-4 pb-12 text-[11.5px] text-mist sm:px-6">{settings.disclaimer}</p>}
    </article>
  );
}
