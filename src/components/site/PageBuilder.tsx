import Image from "next/image";
import Link from "next/link";
import { ArrowRight, FileText, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { getPublishedMarkets, getPublishedProjects, getSettings, type ProjectWithMarket } from "@/lib/content";
import {
  mapEmbedUrl,
  safeSections,
  sectionColumns,
  toEmbedUrl,
  visibilityClass,
  type BuilderItem,
  type BuilderSection,
} from "@/lib/page-builder";
import { resolveBlocks } from "@/lib/builder-blocks";
import { alignClass, containerClass, hasTextTint, overlayStyle, shellStyle, spacingClass } from "@/lib/builder-style";
import { safeHref } from "@/lib/url";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/site/Reveal";
import { Markdown } from "@/components/site/Markdown";
import { Button3D } from "@/components/ui/Button3D";
import { ProjectCard } from "@/components/site/ProjectCard";
import { InquiryForm, type FormMarket, type FormProject } from "@/components/site/InquiryForm";
import { BrochureGate } from "@/components/site/BrochureGate";
import { Gallery } from "@/app/(public)/projects/[slug]/Gallery";

/**
 * Renders a builder section array. Used by the public route (published content)
 * and the authenticated draft preview, so preview and live output can never
 * drift apart. Sections are re-validated on render: anything malformed is
 * dropped rather than executed or leaked.
 */

type Settings = Awaited<ReturnType<typeof getSettings>>;

export function parseSections(raw: unknown): BuilderSection[] {
  return safeSections(raw);
}

export type BuilderProjectContext = { slug: string; name: string; hasBrochure: boolean };

export async function PageBuilder({
  sections,
  source = "page",
  project,
}: {
  sections: unknown;
  source?: string;
  /** Present on project pages so the brochure section uses the real gate. */
  project?: BuilderProjectContext;
}) {
  // Linked reusable blocks are resolved here, on the server, so a master edit
  // reaches every page that references it without touching stored drafts.
  const resolved = await resolveBlocks(safeSections(sections));
  const list = resolved.filter((s) => !s.hidden);

  if (!list.length) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-24 sm:px-6">
        <div className="rounded-3xl border border-dashed border-ink/15 bg-white/60 p-16 text-center">
          <h2 className="text-[20px] font-semibold text-ink">This page has no content yet</h2>
          <p className="mt-2 text-[14px] text-charcoal/70">Sections added in the editor will appear here.</p>
        </div>
      </div>
    );
  }

  const has = (t: BuilderSection["type"]) => list.some((s) => s.type === t);
  const needsForm = has("form");
  const needsSettings = needsForm || has("contact") || has("whatsapp");
  const needsProjects = needsForm || has("related");

  const [settings, markets, projects] = await Promise.all([
    needsSettings ? getSettings() : Promise.resolve(null),
    needsForm ? getPublishedMarkets() : Promise.resolve(null),
    needsProjects ? getPublishedProjects() : Promise.resolve(null),
  ]);

  return (
    <>
      {list.map((s, i) => (
        <SectionShell key={s.id} section={s} index={i}>
          <SectionBody
            section={s}
            index={i}
            source={source}
            project={project}
            settings={settings}
            markets={(markets ?? []) as FormMarket[]}
            projects={(projects ?? []) as ProjectWithMarket[]}
          />
        </SectionShell>
      ))}
    </>
  );
}

/**
 * Outer wrapper every section shares: anchor, background colour/photo, scrim,
 * vertical rhythm, device visibility and text tint. `data-pb` is what the
 * editor's click-to-select listens for.
 */
function SectionShell({ section: s, index, children }: { section: BuilderSection; index: number; children: React.ReactNode }) {
  const bg = s.style?.backgroundImage;
  return (
    <section
      id={s.anchorId ?? undefined}
      data-pb={index}
      data-pb-type={s.type}
      className={cn("relative overflow-hidden", spacingClass(s), visibilityClass(s), hasTextTint(s) && "pb-tint")}
      style={shellStyle(s)}
    >
      {bg && (
        <div className="absolute inset-0 z-0" aria-hidden>
          <Image src={bg} alt="" fill className="object-cover" sizes="100vw" />
          <div className="absolute inset-0" style={overlayStyle(s)} />
        </div>
      )}
      <div className={cn(containerClass(s), "relative z-10", alignClass(s))}>{children}</div>
    </section>
  );
}

type Ctx = {
  section: BuilderSection;
  index: number;
  source: string;
  project?: BuilderProjectContext;
  settings: Settings | null;
  markets: FormMarket[];
  projects: ProjectWithMarket[];
};

function BlockImage({ src, alt, className, priority }: { src: string; alt: string; className?: string; priority?: boolean }) {
  return (
    <div className={cn("relative aspect-[4/3] w-full overflow-hidden rounded-3xl shadow-card", className)}>
      <Image src={src} alt={alt} fill priority={priority} className="object-cover" sizes="(min-width:1024px) 50vw, 100vw" />
    </div>
  );
}

function Buttons({ s, center }: { s: BuilderSection; center?: boolean }) {
  if (!s.ctaLabel && !s.cta2Label) return null;
  return (
    <div className={cn("mt-7 flex flex-wrap gap-3", center && "justify-center")}>
      {s.ctaLabel && (
        <Button3D href={safeHref(s.ctaHref || "#")} icon="arrow">
          {s.ctaLabel}
        </Button3D>
      )}
      {s.cta2Label && (
        <Button3D href={safeHref(s.cta2Href || "#")} variant="secondary">
          {s.cta2Label}
        </Button3D>
      )}
    </div>
  );
}

function Heading({ s }: { s: BuilderSection }) {
  if (!s.eyebrow && !s.title && !s.subtitle) return null;
  return (
    <Reveal>
      {s.eyebrow && <p className="eyebrow">{s.eyebrow}</p>}
      {s.title && <h2 className={cn("display text-[clamp(1.8rem,3.4vw,2.7rem)]", s.eyebrow && "mt-3")}>{s.title}</h2>}
      {s.subtitle && <p className="mt-3 text-[16.5px] font-medium text-charcoal/85">{s.subtitle}</p>}
    </Reveal>
  );
}

function ItemGrid({ items, columns, render }: { items: BuilderItem[]; columns: number; render: (it: BuilderItem, i: number) => React.ReactNode }) {
  if (!items.length) return null;
  return (
    <Reveal stagger="[data-pbc]" className={cn("mt-8 grid gap-5", columnsClass(columns))}>
      {items.map((it, i) => (
        <div key={i} data-pbc>
          {render(it, i)}
        </div>
      ))}
    </Reveal>
  );
}

function columnsClass(n: number): string {
  switch (n) {
    case 1:
      return "grid-cols-1";
    case 2:
      return "grid-cols-1 sm:grid-cols-2";
    case 4:
      return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
    default:
      return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  }
}

function SectionBody({ section: s, index, source, project, settings, markets, projects }: Ctx) {
  const cols = sectionColumns(s);

  switch (s.type) {
    case "hero":
      return (
        <div className="relative">
          {s.image && (
            <div className="absolute -inset-x-4 -inset-y-12 -z-10 sm:-inset-x-6">
              <Image src={s.image} alt="" fill priority={index === 0} className="object-cover" sizes="100vw" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(246,245,240,0.86),rgba(246,245,240,0.97))]" />
            </div>
          )}
          <Reveal className="max-w-3xl">
            {s.eyebrow && <p className="eyebrow">{s.eyebrow}</p>}
            <h1 className={cn("display text-[clamp(2.4rem,5.5vw,4.4rem)]", s.eyebrow && "mt-4")}>{s.title}</h1>
            {s.subtitle && <p className="mt-4 text-[18px] font-medium text-charcoal/85">{s.subtitle}</p>}
            {s.body && <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-charcoal/80">{s.body}</p>}
            <Buttons s={s} />
          </Reveal>
        </div>
      );

    case "banner":
      return (
        <div className="relative -mx-4 overflow-hidden rounded-3xl bg-ink sm:-mx-6">
          {s.image && <Image src={s.image} alt="" fill className="object-cover opacity-80" sizes="100vw" />}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,20,12,0.55),rgba(6,20,12,0.8))]" aria-hidden />
          <div className="relative z-10 flex min-h-[380px] flex-col items-center justify-center px-6 py-16 text-center text-white">
            {s.eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/75">{s.eyebrow}</p>}
            {s.title && <h2 className="display mt-4 max-w-4xl text-[clamp(2rem,4.4vw,3.4rem)] text-white">{s.title}</h2>}
            {s.subtitle && <p className="mt-3 max-w-2xl text-[16px] text-white/80">{s.subtitle}</p>}
            <Buttons s={s} center />
          </div>
        </div>
      );

    case "heading":
      return (
        <div className="mx-auto max-w-3xl">
          <Heading s={s} />
        </div>
      );

    case "text": {
      const layout = s.imageLayout ?? null;
      const imageBlock = s.image ? <BlockImage src={s.image} alt={s.title || ""} /> : null;
      const copy = (
        <Reveal>
          {s.eyebrow && <p className="eyebrow">{s.eyebrow}</p>}
          {s.title && <h2 className={cn("display text-[clamp(1.8rem,3.4vw,2.8rem)]", s.eyebrow && "mt-3")}>{s.title}</h2>}
          {s.body && <Markdown content={s.body} className="prose-legal mt-6 text-[16px] leading-[1.8] text-charcoal/85" />}
          <Buttons s={s} />
        </Reveal>
      );
      if (imageBlock && (layout === "left" || layout === "right")) {
        return (
          <div className="grid items-center gap-10 lg:grid-cols-2">
            {layout === "left" ? <Reveal y={40}>{imageBlock}</Reveal> : copy}
            {layout === "left" ? copy : <Reveal y={40}>{imageBlock}</Reveal>}
          </div>
        );
      }
      return (
        <div className="mx-auto max-w-[900px]">
          {imageBlock && layout === "above" && <div className="mb-8">{imageBlock}</div>}
          {copy}
          {imageBlock && layout === "below" && <div className="mt-8">{imageBlock}</div>}
        </div>
      );
    }

    case "imageText": {
      const layout = s.imageLayout ?? null;
      const stacked = layout === "above" || layout === "below";
      const copy = (
        <Reveal>
          {s.eyebrow && <p className="eyebrow">{s.eyebrow}</p>}
          {s.title && <h2 className={cn("display text-[clamp(1.8rem,3.4vw,2.6rem)]", s.eyebrow && "mt-3")}>{s.title}</h2>}
          {s.subtitle && <p className="mt-3 text-[16px] font-medium text-charcoal/85">{s.subtitle}</p>}
          {s.body && <Markdown content={s.body} className="prose-legal mt-5 text-[15.5px] leading-[1.8] text-charcoal/80" />}
          <Buttons s={s} />
        </Reveal>
      );
      const imageBlock = s.image ? <BlockImage src={s.image} alt={s.title || ""} /> : <div className="skeleton aspect-[4/3] w-full rounded-3xl" />;
      if (stacked) {
        return (
          <div className="mx-auto max-w-[1100px]">
            {layout === "above" && <Reveal y={40} className="mb-10">{imageBlock}</Reveal>}
            {copy}
            {layout === "below" && <Reveal y={40} className="mt-10">{imageBlock}</Reveal>}
          </div>
        );
      }
      const imageFirst = layout === "left" || (!layout && index % 2 === 1);
      return (
        <div className="grid items-center gap-10 lg:grid-cols-2">
          {imageFirst ? <Reveal y={40}>{imageBlock}</Reveal> : copy}
          {imageFirst ? copy : <Reveal y={40}>{imageBlock}</Reveal>}
        </div>
      );
    }

    case "columns":
      return (
        <>
          <Heading s={s} />
          <ItemGrid items={s.items ?? []} columns={cols} render={(it) => (
            <div className="flex h-full flex-col">
              {it.image && (
                <div className="relative mb-4 aspect-[4/3] w-full overflow-hidden rounded-2xl">
                  <Image src={it.image} alt={it.title || ""} fill className="object-cover" sizes="(min-width:1024px) 33vw, 100vw" />
                </div>
              )}
              {it.title && <h3 className="text-[17px] font-semibold text-ink">{it.title}</h3>}
              {it.description && <p className="mt-2 text-[14.5px] leading-relaxed text-charcoal/78">{it.description}</p>}
              {it.href && (
                <Link href={safeHref(it.href)} className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand">
                  {it.label || "Learn more"} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          )} />
          <Buttons s={s} />
        </>
      );

    case "divider":
      return (
        <div className={cn("flex items-center gap-3", s.title && "justify-between")}>
          <hr className="w-full border-0 border-t border-ink/10" />
          {s.title && <span className="shrink-0 text-[12px] uppercase tracking-[0.2em] text-charcoal/50">{s.title}</span>}
          {s.title && <hr className="w-full border-0 border-t border-ink/10" />}
        </div>
      );

    case "video": {
      const src = toEmbedUrl(s.videoUrl || "");
      if (!src) {
        return (
          <div className="rounded-3xl border border-dashed border-ink/15 p-10 text-center text-[13.5px] text-charcoal/70">
            {s.title && <p className="mb-2 text-[16px] font-semibold text-ink">{s.title}</p>}
            Video unavailable — add a YouTube or Vimeo link in the editor.
          </div>
        );
      }
      return (
        <div className="mx-auto max-w-[1100px]">
          {s.title && <h2 className="display mb-6 text-[clamp(1.6rem,3vw,2.4rem)]">{s.title}</h2>}
          <div className="aspect-video w-full overflow-hidden rounded-3xl bg-ink shadow-card">
            <iframe
              src={src}
              title={s.title || "Video"}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
          {s.body && <p className="mt-4 text-[14px] text-charcoal/75">{s.body}</p>}
        </div>
      );
    }

    case "gallery": {
      const images = (s.items ?? []).map((i) => i.image).filter((i): i is string => Boolean(i));
      if (!images.length) return null;
      return (
        <>
          <Heading s={s} />
          <div className="mt-8">
            <Gallery images={images} name={s.title || "Gallery"} />
          </div>
        </>
      );
    }

    case "cards":
    case "testimonials":
      return (
        <>
          <Heading s={s} />
          <ItemGrid items={s.items ?? []} columns={cols} render={(it) => (
            <div className="h-full rounded-3xl border border-ink/8 bg-white p-6 shadow-card">
              {s.type === "testimonials" ? (
                <>
                  <p className="text-[15px] leading-relaxed text-charcoal/85">&ldquo;{it.description || it.title}&rdquo;</p>
                  <p className="mt-4 text-[13.5px] font-semibold text-ink">{it.title}</p>
                  {it.label && <p className="text-[12.5px] text-charcoal/65">{it.label}</p>}
                </>
              ) : (
                <>
                  {it.image && (
                    <div className="relative mb-4 aspect-[16/10] w-full overflow-hidden rounded-2xl">
                      <Image src={it.image} alt={it.title || ""} fill className="object-cover" sizes="(min-width:1024px) 30vw, 100vw" />
                    </div>
                  )}
                  {it.title && <h3 className="text-[16px] font-semibold text-ink">{it.title}</h3>}
                  {it.description && <p className="mt-2 text-[14px] leading-relaxed text-charcoal/75">{it.description}</p>}
                  {it.href && (
                    <Link href={safeHref(it.href)} className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand">
                      {it.label || "Learn more"} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </>
              )}
            </div>
          )} />
        </>
      );

    case "highlights":
      return (
        <>
          <Heading s={s} />
          <ItemGrid items={s.items ?? []} columns={cols} render={(it, i) => (
            <div className="h-full rounded-2xl border border-ink/8 bg-white p-5 shadow-soft">
              <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-brand">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-brand/10">{it.icon || String(i + 1).padStart(2, "0")}</span>
                {it.label}
              </div>
              {it.title && <h3 className="mt-3 text-[15.5px] font-semibold text-ink">{it.title}</h3>}
              {it.description && <p className="mt-1.5 text-[13.5px] leading-relaxed text-charcoal/75">{it.description}</p>}
            </div>
          )} />
        </>
      );

    case "amenities":
      return (
        <>
          <Heading s={s} />
          <ItemGrid items={s.items ?? []} columns={cols} render={(it) => (
            <div className="flex items-start gap-3 rounded-2xl border border-ink/8 bg-white p-4">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
                <MapPin className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[14.5px] font-semibold text-ink">{it.title}</p>
                {it.description && <p className="mt-0.5 text-[13px] text-charcoal/70">{it.description}</p>}
              </div>
            </div>
          )} />
        </>
      );

    case "specs":
      return (
        <>
          <Heading s={s} />
          {s.items?.length ? (
            <dl className="mt-6 divide-y divide-ink/8 overflow-hidden rounded-2xl border border-ink/10 bg-white">
              {s.items.map((it, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <dt className="text-[13px] uppercase tracking-wider text-charcoal/60">{it.label || it.title}</dt>
                  <dd className="text-[14.5px] font-semibold text-ink">{it.value || it.description}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </>
      );

    case "pricing":
      return (
        <>
          <Heading s={s} />
          <ItemGrid items={s.items ?? []} columns={cols} render={(it) => (
            <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-ink/10 bg-white shadow-card">
              <div className="h-1.5 w-full bg-brand" />
              <div className="flex flex-1 flex-col p-6">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-bold uppercase tracking-wider text-charcoal/60">{it.title}</p>
                  {it.label && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">{it.label}</span>}
                </div>
                {it.value && <p className="display mt-3 text-[clamp(1.6rem,2.6vw,2.2rem)] text-ink">{it.value}</p>}
                {it.description && <p className="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed text-charcoal/75">{it.description}</p>}
                {it.href && (
                  <Link href={safeHref(it.href)} className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand">
                    Enquire <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          )} />
        </>
      );

    case "floorPlans":
      return (
        <>
          <Heading s={s} />
          <ItemGrid items={s.items ?? []} columns={cols} render={(it) => (
            <figure className="overflow-hidden rounded-3xl border border-ink/8 bg-white shadow-card">
              {it.image ? (
                <div className="relative aspect-[4/3] w-full bg-slate-50">
                  <Image src={it.image} alt={it.title || "Floor plan"} fill className="object-contain p-3" sizes="(min-width:1024px) 33vw, 100vw" />
                </div>
              ) : null}
              <figcaption className="flex items-center justify-between gap-2 px-5 py-4">
                <span className="text-[14.5px] font-semibold text-ink">{it.title}</span>
                {it.value && <span className="text-[13px] text-charcoal/65">{it.value}</span>}
              </figcaption>
            </figure>
          )} />
        </>
      );

    case "brochure":
      return (
        <div className="overflow-hidden rounded-3xl bg-space px-6 py-12 text-white sm:px-12">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-bright">
                <FileText className="h-4 w-4" /> {s.eyebrow || "Brochure"}
              </p>
              <h2 className="display mt-3 text-[clamp(1.6rem,3vw,2.4rem)]">{s.title || "Download the brochure"}</h2>
              {s.body && <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-white/70">{s.body}</p>}
            </div>
            <div className="shrink-0">
              {project ? (
                project.hasBrochure ? (
                  <BrochureGate projectSlug={project.slug} projectName={project.name} />
                ) : (
                  <button
                    type="button"
                    disabled
                    title="The brochure will be available soon."
                    className="inline-flex h-12 cursor-not-allowed items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 text-[14px] font-medium text-white/55"
                  >
                    <FileText className="h-4 w-4" /> Brochure coming soon
                  </button>
                )
              ) : s.ctaLabel ? (
                <a
                  href={safeHref(s.ctaHref || "#")}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full bg-brand px-6 py-3 text-[14px] font-semibold text-white transition hover:bg-brand-deep"
                >
                  <FileText className="h-4 w-4" /> {s.ctaLabel}
                </a>
              ) : null}
            </div>
          </div>
        </div>
      );

    case "location": {
      const map = mapEmbedUrl(s.mapQuery || s.title || "");
      return (
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <div>
            <Heading s={s} />
            {s.body && <p className="mt-4 text-[15px] leading-relaxed text-charcoal/80">{s.body}</p>}
            {s.items?.length ? (
              <ul className="mt-6 space-y-3">
                {s.items.map((it, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <MapPin className="mt-1 h-4 w-4 shrink-0 text-brand" />
                    <span>
                      <span className="text-[14.5px] font-semibold text-ink">{it.title}</span>
                      {it.description && <span className="text-[13.5px] text-charcoal/70"> — {it.description}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {map && (
            <div className="aspect-[4/3] w-full overflow-hidden rounded-3xl border border-ink/10 bg-slate-100">
              <iframe src={map} title={s.title || "Location map"} className="h-full w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            </div>
          )}
        </div>
      );
    }

    case "related": {
      const shown = projects.slice(0, Math.min(cols, 6));
      if (!shown.length) return null;
      return (
        <>
          <Heading s={s} />
          <div className={cn("mt-8 grid gap-6", columnsClass(cols))}>
            {shown.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </>
      );
    }

    case "stats":
      return (
        <>
          {s.title && <Heading s={s} />}
          <ItemGrid items={s.items ?? []} columns={Math.min(4, Math.max(2, cols))} render={(it) => (
            <div className="rounded-3xl border border-ink/8 bg-white p-6 text-center shadow-card">
              <p className="display text-[clamp(1.6rem,3vw,2.4rem)] text-brand">{it.value}</p>
              <p className="mt-2 text-[13px] uppercase tracking-wider text-charcoal/65">{it.label || it.title}</p>
            </div>
          )} />
        </>
      );

    case "steps":
      return (
        <>
          <Heading s={s} />
          <ol className="mt-8 space-y-5">
            {(s.items ?? []).map((it, i) => (
              <Reveal key={i}>
                <li className="flex gap-5 rounded-3xl border border-ink/8 bg-white p-6 shadow-card">
                  <span className="display shrink-0 text-[24px] text-brand">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="text-[16px] font-semibold text-ink">{it.title}</h3>
                    {it.description && <p className="mt-1.5 text-[14.5px] leading-relaxed text-charcoal/75">{it.description}</p>}
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </>
      );

    case "faq":
      return (
        <>
          <Heading s={s} />
          <div className="mt-8 divide-y divide-ink/8 overflow-hidden rounded-3xl border border-ink/8 bg-white shadow-card">
            {(s.items ?? []).map((it, i) => (
              <details key={i} className="group p-5" open={i === 0}>
                <summary className="cursor-pointer list-none text-[15px] font-semibold text-ink marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {it.title}
                    <span className="text-brand transition group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-3 text-[14.5px] leading-relaxed text-charcoal/75">{it.description}</p>
              </details>
            ))}
          </div>
        </>
      );

    case "cta":
      return (
        <div className="relative overflow-hidden rounded-3xl bg-space px-6 py-14 text-center text-white shadow-card sm:px-14">
          {s.eyebrow && <p className="eyebrow !text-brand-bright">{s.eyebrow}</p>}
          {s.title && <h2 className="display mx-auto mt-4 max-w-3xl text-[clamp(1.8rem,3.6vw,2.8rem)]">{s.title}</h2>}
          {s.body && <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-white/70">{s.body}</p>}
          <Buttons s={s} center />
        </div>
      );

    case "form":
      if (!settings) return null;
      return (
        <div id="inquiry" className="grid gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            {s.eyebrow && <p className="eyebrow">{s.eyebrow}</p>}
            {s.title && <h2 className={cn("display text-[clamp(1.8rem,3.4vw,2.6rem)]", s.eyebrow && "mt-3")}>{s.title}</h2>}
            {s.body && <p className="mt-4 text-[15px] leading-relaxed text-charcoal/80">{s.body}</p>}
          </Reveal>
          <Reveal y={50} className="lg:col-span-7 lg:col-start-6">
            <InquiryForm
              fields={settings.contactFields}
              markets={markets}
              projects={projects as FormProject[]}
              budgetOptions={settings.budgetOptions}
              interestOptions={settings.interestOptions}
              cityFieldEnabled={settings.cityFieldEnabled}
              customBudgetEnabled={settings.customBudgetEnabled}
              source={source}
            />
          </Reveal>
        </div>
      );

    case "contact": {
      const phone = s.items?.find((i) => i.label === "phone")?.value;
      const email = s.items?.find((i) => i.label === "email")?.value;
      const address = s.items?.find((i) => i.label === "address")?.value;
      const rows = [
        { icon: Phone, label: "Phone", value: phone || settings?.phone, href: phone || settings?.phone ? `tel:${(phone || settings?.phone || "").replace(/[^\d+]/g, "")}` : null },
        { icon: Mail, label: "Email", value: email || settings?.email, href: email || settings?.email ? `mailto:${email || settings?.email}` : null },
        { icon: MapPin, label: "Address", value: address || settings?.address, href: null },
      ].filter((r) => r.value);
      return (
        <>
          <Heading s={s} />
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {rows.map((r) => {
              const Icon = r.icon;
              const body = (
                <>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-brand/10 text-brand"><Icon className="h-4 w-4" /></span>
                  <span>
                    <span className="block text-[11px] uppercase tracking-wider text-charcoal/55">{r.label}</span>
                    <span className="text-[14.5px] font-medium text-ink">{r.value}</span>
                  </span>
                </>
              );
              return r.href ? (
                <a key={r.label} href={safeHref(r.href)} className="flex items-start gap-3 rounded-2xl border border-ink/8 bg-white p-4 hover:border-brand/40">
                  {body}
                </a>
              ) : (
                <div key={r.label} className="flex items-start gap-3 rounded-2xl border border-ink/8 bg-white p-4">{body}</div>
              );
            })}
          </div>
          {s.body && <p className="mt-4 text-[14px] text-charcoal/75">{s.body}</p>}
        </>
      );
    }

    case "whatsapp": {
      const digits = (settings?.whatsapp || "").replace(/[^\d]/g, "");
      const message = s.body || settings?.whatsappDefaultMessage || "";
      const href = digits ? `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ""}` : "#";
      return (
        <div className="flex flex-col items-start gap-5 rounded-3xl bg-[#0f5132] px-6 py-10 text-white sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <div>
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </p>
            <h2 className="display mt-3 text-[clamp(1.5rem,2.8vw,2.2rem)]">{s.title || "Chat with an advisor"}</h2>
          </div>
          <a
            href={safeHref(href)}
            target={digits ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-6 py-3 text-[14px] font-semibold text-[#0f5132]"
          >
            <MessageCircle className="h-4 w-4" /> {s.ctaLabel || "Message us"}
          </a>
        </div>
      );
    }

    default:
      return null;
  }
}
