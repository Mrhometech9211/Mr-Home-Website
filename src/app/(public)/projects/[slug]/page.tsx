import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BedDouble, Bath, Ruler, CalendarClock, Building2, MapPin, TrendingUp, FileText, Check, Download } from "lucide-react";
import { getProjectBySlug, getPublishedMarkets, getPublishedProjects, getSettings, getActiveBrochureForProject } from "@/lib/content";
import { BrochureGate } from "@/components/site/BrochureGate";
import { ProjectPricing } from "@/components/site/ProjectPricing";
import { getCurrentUser } from "@/lib/auth";
import { buildMetadata } from "@/lib/seo";
import { absoluteSiteUrl } from "@/lib/site";
import { buildWhatsAppLink, fillTemplate } from "@/lib/whatsapp";
import { formatProjectArea, STATUS_LABELS } from "@/lib/utils";
import { Breadcrumbs, JsonLd } from "@/components/site/Breadcrumbs";
import { Button3D } from "@/components/ui/Button3D";
import { Reveal } from "@/components/site/Reveal";
import { ProjectCard } from "@/components/site/ProjectCard";
import { InquiryForm } from "@/components/site/InquiryForm";
import { RoiCalculator } from "@/components/site/RoiCalculator";
import { Gallery } from "./Gallery";
import { PageBuilder } from "@/components/site/PageBuilder";
import { safeSections } from "@/lib/page-builder";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProjectBySlug(slug);
  if (!p) return { title: "Project not found", robots: { index: false } };
  return buildMetadata(`/projects/${slug}`, { title: p.seoTitle || `${p.name} — ${p.city}, ${p.market?.name ?? p.country}`, description: p.seoDescription || p.shortDescription || p.description?.slice(0, 160), image: p.coverImage });
}

export default async function ProjectPage({ params }: { params: Params }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const [project, settings] = await Promise.all([getProjectBySlug(slug, !!user), getSettings()]);
  if (!project) notFound();
  const isPreview = !project.published || project.archived;
  const [related, markets, brochure] = await Promise.all([
    getPublishedProjects({ market: project.market?.slug, limit: 3, excludeId: project.id }),
    getPublishedMarkets(),
    getActiveBrochureForProject(project.id),
  ]);
  const wa = buildWhatsAppLink(settings.whatsapp, fillTemplate(settings.whatsappProjectMessage, { project: project.name, market: project.market?.name ?? project.country ?? "" }));
  const gallery = [project.coverImage, ...(project.gallery ?? [])].filter((g): g is string => !!g);
  const facts = [
    { icon: Building2, label: "Type", value: project.propertyType },
    { icon: BedDouble, label: "Bedrooms", value: project.bedrooms },
    { icon: Bath, label: "Bathrooms", value: project.bathrooms },
    { icon: Ruler, label: "Area", value: formatProjectArea(project) },
    { icon: CalendarClock, label: "Handover", value: project.handover },
    { icon: TrendingUp, label: "Est. ROI", value: project.roi },
  ].filter((f) => f.value);
  const ld = {
    "@context": "https://schema.org",
    "@type": "Residence",
    name: project.name,
    description: project.shortDescription || project.description,
    image: project.coverImage ? absoluteSiteUrl(project.coverImage) : undefined,
    url: absoluteSiteUrl(`/projects/${project.slug}`),
    address: { "@type": "PostalAddress", streetAddress: project.address, addressLocality: project.city, addressCountry: project.country },
    geo: project.latitude && project.longitude ? { "@type": "GeoCoordinates", latitude: project.latitude, longitude: project.longitude } : undefined,
    offers: project.price ? { "@type": "Offer", price: project.price, priceCurrency: project.currency } : undefined,
  };
  const crumbs = [{ name: "Home", href: "/" }, { name: "Projects", href: "/projects" }, ...(project.market ? [{ name: project.market.name, href: `/projects?market=${project.market.slug}` }] : []), { name: project.name, href: `/projects/${project.slug}` }];
  // Once an administrator publishes builder sections they replace the legacy
  // body; projects without a builder configuration render exactly as before.
  const customSections = safeSections(project.builderPublished);

  return (
    <article>
      {isPreview && <meta name="robots" content="noindex,nofollow" />}
      <JsonLd data={ld} />
      {isPreview && <div className="fixed inset-x-0 top-0 z-[60] bg-amber-500 py-1.5 text-center text-[12px] font-semibold text-white">Preview mode — this project is {project.archived ? "archived" : "unpublished"} and not visible to the public. <Link href={`/admin/projects/${project.id}`} className="underline">Edit</Link></div>}

      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-space pt-28 text-white lg:pt-32">
        <div className="absolute inset-0">
          {project.coverImage && <Image src={project.coverImage} alt={project.name} fill priority className="object-cover opacity-70" sizes="100vw" />}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,8,12,0.4),rgba(5,8,12,0.55)_50%,#05080c)]" />
        </div>
        <div className="relative mx-auto max-w-[1400px] px-4 pb-16 sm:px-6 lg:pb-24">
          <Breadcrumbs items={crumbs} dark />
          <Reveal className="mt-10 grid gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-brand px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white">{STATUS_LABELS[project.status] ?? project.status}</span>
                {project.featured && <span className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-white/80">Featured</span>}
                {project.market && <Link href={`/markets/${project.market.slug}`} className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-white/80 hover:border-brand-bright">{project.market.flag} {project.market.name}</Link>}
              </div>
              <h1 className="display mt-5 text-[clamp(2.4rem,5.5vw,4.6rem)]">{project.name}</h1>
              <p className="mt-4 flex items-center gap-2 text-[15px] text-white/70"><MapPin className="h-4 w-4 text-brand-bright" />{[project.address, project.city, project.country].filter(Boolean).join(", ")}</p>
              {project.developer && <p className="mt-1 text-[13.5px] text-white/50">Developed by <span className="text-white/80">{project.developer}</span></p>}
            </div>
            <div className="glass-dark rounded-3xl p-6 lg:col-span-4">
              {/* Client island: searchable world-currency selector first (above
                  Download Brochure), then the live-converted price, then actions. */}
              <ProjectPricing price={project.price} currency={project.currency} roi={project.roi}>
                <div className="mt-5 flex flex-col gap-2">
                  {brochure?.allowDownload ? (
                    <BrochureGate projectSlug={project.slug} projectName={project.name} />
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="inline-flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 text-[15px] font-medium text-white/55 backdrop-blur"
                      title="The brochure will be available soon — request details in the meantime."
                    >
                      <Download className="h-4 w-4" />
                      Brochure coming soon
                    </button>
                  )}
                  {/* Routed to the public Contact page with the project preselected. */}
                  <Button3D href={`/contact?project=${project.slug}`} variant="primary">Request Details</Button3D>
                  <Button3D href={wa} variant="whatsapp" icon="whatsapp" external>WhatsApp Advisor</Button3D>
                </div>
              </ProjectPricing>
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
                <f.icon className="h-5 w-5 shrink-0 text-brand" />
                <div><div className="text-[11px] uppercase tracking-wider text-mist">{f.label}</div><div className="text-[15px] font-semibold text-ink">{f.value}</div></div>
              </div>
            ))}
          </Reveal>
        </div>
      )}

      {customSections.length > 0 && (
        <PageBuilder
          sections={customSections}
          source={`project:${project.slug}`}
          project={{ slug: project.slug, name: project.name, hasBrochure: Boolean(brochure?.allowDownload) }}
        />
      )}

      {customSections.length === 0 && (
      <>
      <div className="mx-auto grid max-w-[1400px] gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12">
        <div className="space-y-16 lg:col-span-8">
          <Reveal>
            <h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">About the project</h2>
            <div className="mt-5 space-y-4 text-[16px] leading-relaxed text-charcoal/85">{(project.description || "").split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>
          </Reveal>

          {gallery.length > 0 && <Reveal><h2 className="display mb-5 text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Gallery</h2><Gallery images={gallery} name={project.name} /></Reveal>}

          {project.video && (
            <Reveal>
              <h2 className="display mb-5 text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Video</h2>
              <div className="overflow-hidden rounded-3xl bg-black shadow-card">
                {/youtube|youtu\.be|vimeo/.test(project.video) ? (
                  <iframe src={project.video.replace("watch?v=", "embed/").replace("youtu.be/", "www.youtube.com/embed/")} title={`${project.name} video`} className="aspect-video w-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
                ) : (
                  <video src={project.video} controls playsInline className="aspect-video w-full" />
                )}
              </div>
            </Reveal>
          )}

          {(project.amenities ?? []).length > 0 && (
            <Reveal>
              <h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Amenities</h2>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {project.amenities!.map((a) => <li key={a} className="flex items-center gap-2 rounded-2xl border border-ink/8 bg-white px-4 py-3 text-[14px] text-charcoal"><Check className="h-4 w-4 text-brand" />{a}</li>)}
              </ul>
            </Reveal>
          )}

          {(project.specifications ?? []).length > 0 && (
            <Reveal>
              <h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Specifications</h2>
              <dl className="mt-5 divide-y divide-ink/8 rounded-3xl border border-ink/8 bg-white">
                {project.specifications!.map((s) => <div key={s.label} className="flex justify-between gap-4 px-5 py-3.5 text-[14px]"><dt className="text-charcoal/70">{s.label}</dt><dd className="font-medium text-ink">{s.value}</dd></div>)}
              </dl>
            </Reveal>
          )}

          {(project.floorPlans ?? []).length > 0 && (
            <Reveal>
              <h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Floor plans</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {project.floorPlans!.map((fp) => (
                  <div key={fp.name} className="overflow-hidden rounded-3xl border border-ink/8 bg-white">
                    {fp.image ? <div className="relative aspect-[4/3]"><Image src={fp.image} alt={fp.name} fill className="object-cover" sizes="33vw" /></div> : <div className="flex aspect-[4/3] items-center justify-center bg-ivory-deep text-mist"><FileText className="h-8 w-8" /></div>}
                    <div className="px-4 py-3"><div className="text-[14px] font-semibold text-ink">{fp.name}</div>{fp.area && <div className="text-[12.5px] text-mist">{fp.area}</div>}</div>
                  </div>
                ))}
              </div>
            </Reveal>
          )}

          {(project.documents ?? []).length > 0 && (
            <Reveal>
              <h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Documents</h2>
              <ul className="mt-5 space-y-2">
                {project.documents!.map((d) => (
                  <li key={d.name}>
                    {d.url.startsWith("#") ? (
                      <a href="#inquire" className="flex items-center justify-between rounded-2xl border border-ink/8 bg-white px-5 py-3.5 text-[14px] text-ink transition hover:border-brand"><span className="flex items-center gap-2"><FileText className="h-4 w-4 text-brand" />{d.name}</span><span className="text-[12px] text-brand">Request via inquiry</span></a>
                    ) : (
                      <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-2xl border border-ink/8 bg-white px-5 py-3.5 text-[14px] text-ink transition hover:border-brand"><span className="flex items-center gap-2"><FileText className="h-4 w-4 text-brand" />{d.name}</span><Download className="h-4 w-4 text-mist" /></a>
                    )}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {project.latitude && project.longitude && (
            <Reveal>
              <h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Location</h2>
              <div className="mt-5 overflow-hidden rounded-3xl border border-ink/8 shadow-soft">
                <iframe title={`Map of ${project.name}`} src={`https://maps.google.com/maps?q=${project.latitude},${project.longitude}&z=13&output=embed`} className="h-[380px] w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              </div>
              <p className="mt-3 text-[13px] text-mist">{project.address} · {project.latitude.toFixed(4)}, {project.longitude.toFixed(4)}</p>
            </Reveal>
          )}
        </div>

        <aside className="lg:col-span-4">
          <div id="inquire" className="space-y-6 lg:sticky lg:top-28">
            <RoiCalculator price={project.price} currency={project.currency} roi={project.roi} />
            <div>
              <h2 className="mb-4 text-[20px] font-semibold tracking-tight text-ink">Inquire about {project.name}</h2>
            <InquiryForm fields={settings.contactFields.filter((f) => f !== "project" && f !== "market")} markets={markets.map((m) => ({ id: m.id, name: m.name, slug: m.slug, flag: m.flag, cities: m.cities }))} projects={[]} budgetOptions={settings.budgetOptions} interestOptions={settings.interestOptions} cityFieldEnabled={settings.cityFieldEnabled} customBudgetEnabled={settings.customBudgetEnabled} defaultMarketId={project.marketId} defaultProjectId={project.id} source="project-page" compact submitLabel="Request Details" />
            <input type="hidden" />
            <p className="mt-4 text-[11.5px] leading-relaxed text-mist">{settings.disclaimer}</p>
            </div>
          </div>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="bg-ivory-deep/60 py-20">
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
            <Reveal className="flex items-end justify-between"><h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Related projects</h2><Link href={`/projects?market=${project.market?.slug ?? ""}`} className="text-[13.5px] font-medium text-brand hover:underline">View all</Link></Reveal>
            <Reveal stagger="[data-r]" className="perspective mt-8 grid gap-6 md:grid-cols-3">{related.map((p) => <div key={p.id} data-r><ProjectCard project={p} /></div>)}</Reveal>
          </div>
        </section>
      )}
      </>
      )}
    </article>
  );
}
