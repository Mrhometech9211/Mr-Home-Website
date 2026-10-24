import Image from "next/image";
import { getPublishedMarkets, getPublishedProjects, getSettings } from "@/lib/content";
import { sectionsSchema, toEmbedUrl, type BuilderSection } from "@/lib/page-builder";
import { safeHref } from "@/lib/url";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/site/Reveal";
import { Markdown } from "@/components/site/Markdown";
import { Button3D } from "@/components/ui/Button3D";
import { InquiryForm, type FormMarket, type FormProject } from "@/components/site/InquiryForm";

/**
 * Phase 7 — renders a builder page's section array. Used by both the public
 * route (published content) and the authenticated draft preview, so preview
 * and live output can never drift apart. Sections are re-validated on render:
 * anything malformed is dropped rather than executed/leaked.
 */
export function parseSections(raw: unknown): BuilderSection[] {
  const parsed = sectionsSchema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data as BuilderSection[];
}

export async function PageBuilder({ sections, source = "page" }: { sections: unknown; source?: string }) {
  const list = parseSections(sections).filter((s) => !s.hidden);
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

  const needsForm = list.some((s) => s.type === "form");
  const [settings, markets, projects] = needsForm
    ? await Promise.all([getSettings(), getPublishedMarkets(), getPublishedProjects()])
    : [null, null, null];

  return (
    <>
      {list.map((s, i) => (
        <Section key={s.id} section={s} index={i} source={source} settings={settings} markets={markets as FormMarket[]} projects={projects as FormProject[]} />
      ))}
    </>
  );
}

/** Shared builder image: rounded 4:3 media block used by text/imageText blocks. */
function BlockImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div className={cn("relative aspect-[4/3] w-full overflow-hidden rounded-3xl shadow-card", className)}>
      <Image src={src} alt={alt} fill className="object-cover" sizes="(min-width:1024px) 50vw, 100vw" />
    </div>
  );
}

type Ctx = {
  section: BuilderSection;
  index: number;
  source: string;
  settings: Awaited<ReturnType<typeof getSettings>> | null;
  markets: FormMarket[];
  projects: FormProject[];
};

function Section({ section: s, index, source, settings, markets, projects }: Ctx) {
  switch (s.type) {
    case "hero":
      return (
        <section className="relative overflow-hidden pt-36 pb-20 lg:pt-44 lg:pb-28" data-pb={index}>
          {s.image && (
            <div className="absolute inset-0">
              <Image src={s.image} alt="" fill priority={index === 0} className="object-cover" sizes="100vw" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(246,245,240,0.86),rgba(246,245,240,0.97))]" />
            </div>
          )}
          <div className="relative mx-auto max-w-[1400px] px-4 sm:px-6">
            <Reveal className="max-w-3xl">
              {s.eyebrow && <p className="eyebrow">{s.eyebrow}</p>}
              <h1 className="display mt-4 text-[clamp(2.4rem,5.5vw,4.4rem)]">{s.title}</h1>
              {s.subtitle && <p className="mt-4 text-[18px] font-medium text-charcoal/85">{s.subtitle}</p>}
              {s.body && <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-charcoal/80">{s.body}</p>}
              {(s.ctaLabel || s.cta2Label) && (
                <div className="mt-8 flex flex-wrap gap-3">
                  {s.ctaLabel && <Button3D href={s.ctaHref || "#"} icon="arrow">{s.ctaLabel}</Button3D>}
                  {s.cta2Label && <Button3D href={s.cta2Href || "#"} variant="secondary">{s.cta2Label}</Button3D>}
                </div>
              )}
            </Reveal>
          </div>
        </section>
      );

    case "text": {
      // Admin can place this block's image beside the copy (left/right) as well
      // as above/below it — see PageEditor → Sections → Image position.
      const layout = s.imageLayout ?? null;
      const imageBlock = s.image ? <BlockImage src={s.image} alt={s.title || ""} /> : null;
      const copy = (
        <Reveal>
          {s.eyebrow && <p className="eyebrow">{s.eyebrow}</p>}
          {s.title && <h2 className="display mt-3 text-[clamp(1.8rem,3.4vw,2.8rem)]">{s.title}</h2>}
          {s.body && <Markdown content={s.body} className="prose-legal mt-6 text-[16px] leading-[1.8] text-charcoal/85" />}
          {(s.ctaLabel || s.cta2Label) && (
            <div className="mt-7 flex flex-wrap gap-3">
              {s.ctaLabel && <Button3D href={s.ctaHref || "#"} icon="arrow">{s.ctaLabel}</Button3D>}
              {s.cta2Label && <Button3D href={s.cta2Href || "#"} variant="secondary">{s.cta2Label}</Button3D>}
            </div>
          )}
        </Reveal>
      );
      if (imageBlock && (layout === "left" || layout === "right")) {
        return (
          <section className="py-16 lg:py-20" data-pb={index}>
            <div className="mx-auto grid max-w-[1400px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
              {layout === "left" ? <Reveal y={40}>{imageBlock}</Reveal> : copy}
              {layout === "left" ? copy : <Reveal y={40}>{imageBlock}</Reveal>}
            </div>
          </section>
        );
      }
      return (
        <section className="py-16 lg:py-20" data-pb={index}>
          <div className="mx-auto max-w-[900px] px-4 sm:px-6">
            {imageBlock && layout === "above" && <div className="mb-8">{imageBlock}</div>}
            {copy}
            {imageBlock && layout !== "above" && <div className="mt-8">{imageBlock}</div>}
          </div>
        </section>
      );
    }

    case "imageText": {
      const layout = s.imageLayout ?? null;
      const stacked = layout === "above" || layout === "below";
      const copy = (
        <Reveal>
          {s.eyebrow && <p className="eyebrow">{s.eyebrow}</p>}
          {s.title && <h2 className="display mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)]">{s.title}</h2>}
          {s.subtitle && <p className="mt-3 text-[16px] font-medium text-charcoal/85">{s.subtitle}</p>}
          {s.body && <Markdown content={s.body} className="prose-legal mt-5 text-[15.5px] leading-[1.8] text-charcoal/80" />}
          {(s.ctaLabel || s.cta2Label) && (
            <div className="mt-7 flex flex-wrap gap-3">
              {s.ctaLabel && <Button3D href={s.ctaHref || "#"} icon="arrow">{s.ctaLabel}</Button3D>}
              {s.cta2Label && <Button3D href={s.cta2Href || "#"} variant="secondary">{s.cta2Label}</Button3D>}
            </div>
          )}
        </Reveal>
      );
      const imageBlock = s.image ? <BlockImage src={s.image} alt={s.title || ""} /> : <div className="skeleton aspect-[4/3] w-full rounded-3xl" />;
      if (stacked) {
        return (
          <section className="py-16 lg:py-24" data-pb={index}>
            <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
              {layout === "above" && <Reveal y={40} className="mb-10">{imageBlock}</Reveal>}
              {copy}
              {layout === "below" && <Reveal y={40} className="mt-10">{imageBlock}</Reveal>}
            </div>
          </section>
        );
      }
      // Explicit left/right wins; otherwise alternate side per section (legacy look).
      const imageFirst = layout === "left" || (!layout && index % 2 === 1);
      return (
        <section className="py-16 lg:py-24" data-pb={index}>
          <div className="mx-auto grid max-w-[1400px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
            {imageFirst ? <Reveal y={40}>{imageBlock}</Reveal> : copy}
            {imageFirst ? copy : <Reveal y={40}>{imageBlock}</Reveal>}
          </div>
        </section>
      );
    }

    case "video": {
      const src = toEmbedUrl(s.videoUrl || "");
      if (!src) {
        return (
          <section className="py-10" data-pb={index}>
            <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
              <div className="rounded-3xl border border-dashed border-ink/15 p-10 text-center text-[13.5px] text-charcoal/70">
                {s.title && <p className="mb-2 text-[16px] font-semibold text-ink">{s.title}</p>}
                Video unavailable — add a YouTube or Vimeo link in the editor.
              </div>
            </div>
          </section>
        );
      }
      return (
        <section className="py-16" data-pb={index}>
          <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
            <Reveal>
              {s.title && <h2 className="display mb-6 text-[clamp(1.6rem,3vw,2.4rem)]">{s.title}</h2>}
              <div className="aspect-video w-full overflow-hidden rounded-3xl bg-ink shadow-card">
                <iframe src={src} title={s.title || "Video"} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
              </div>
              {s.body && <p className="mt-4 text-[14px] text-charcoal/75">{s.body}</p>}
            </Reveal>
          </div>
        </section>
      );
    }

    case "cta":
      return (
        <section className="py-16" data-pb={index}>
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
            <Reveal>
              <div className="relative overflow-hidden rounded-3xl bg-space px-6 py-14 text-center text-white shadow-card sm:px-14">
                <p className="eyebrow !text-brand-bright">{s.eyebrow}</p>
                {s.title && <h2 className="display mx-auto mt-4 max-w-3xl text-[clamp(1.8rem,3.6vw,2.8rem)]">{s.title}</h2>}
                {s.body && <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-white/70">{s.body}</p>}
                {(s.ctaLabel || s.cta2Label) && (
                  <div className="mt-8 flex flex-wrap justify-center gap-3">
                   {s.ctaLabel && <Button3D href={s.ctaHref ? safeHref(s.ctaHref) : "#"} icon="arrow">{s.ctaLabel}</Button3D>}
                   {s.cta2Label && <Button3D href={s.cta2Href ? safeHref(s.cta2Href) : "#"} variant="secondary">{s.cta2Label}</Button3D>}
                  </div>
                )}
              </div>
            </Reveal>
          </div>
        </section>
      );

    case "cards":
    case "testimonials":
      return (
        <section className="py-16 lg:py-20" data-pb={index}>
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
            <Reveal>
              {s.eyebrow && <p className="eyebrow">{s.eyebrow}</p>}
              {s.title && <h2 className="display mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)]">{s.title}</h2>}
              {s.body && <p className="mt-4 max-w-2xl text-[15px] text-charcoal/75">{s.body}</p>}
            </Reveal>
            <Reveal stagger="[data-pbc]" className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {(s.items || []).map((it, i) => (
                <div key={i} data-pbc className="rounded-3xl border border-ink/8 bg-white p-6 shadow-card">
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
                          <Image src={it.image} alt={it.title || ""} fill className="object-cover" sizes="(min-width:1024px) 30vw, (min-width:640px) 50vw, 100vw" />
                        </div>
                      )}
                      {it.title && <h3 className="text-[16px] font-semibold text-ink">{it.title}</h3>}
                      {it.description && <p className="mt-2 text-[14px] leading-relaxed text-charcoal/75">{it.description}</p>}
                    </>
                  )}
                </div>
              ))}
            </Reveal>
          </div>
        </section>
      );

    case "stats":
      return (
        <section className="py-16" data-pb={index}>
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
            <Reveal>
              {s.title && <h2 className="display text-center text-[clamp(1.6rem,3vw,2.4rem)]">{s.title}</h2>}
            </Reveal>
            <Reveal stagger="[data-pbs]" className="mt-10 grid grid-cols-2 gap-6 lg:grid-cols-4">
              {(s.items || []).map((it, i) => (
                <div key={i} data-pbs className="rounded-3xl border border-ink/8 bg-white p-6 text-center shadow-card">
                  <p className="display text-[clamp(1.6rem,3vw,2.4rem)] text-brand">{it.value}</p>
                  <p className="mt-2 text-[13px] uppercase tracking-wider text-charcoal/65">{it.label}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>
      );

    case "steps":
      return (
        <section className="py-16 lg:py-20" data-pb={index}>
          <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
            <Reveal>
              {s.eyebrow && <p className="eyebrow">{s.eyebrow}</p>}
              {s.title && <h2 className="display mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)]">{s.title}</h2>}
            </Reveal>
            <ol className="mt-10 space-y-6">
              {(s.items || []).map((it, i) => (
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
          </div>
        </section>
      );

    case "faq":
      return (
        <section className="py-16" data-pb={index}>
          <div className="mx-auto max-w-[900px] px-4 sm:px-6">
            <Reveal>
              {s.title && <h2 className="display text-[clamp(1.8rem,3.4vw,2.6rem)]">{s.title}</h2>}
            </Reveal>
            <div className="mt-8 divide-y divide-ink/8 overflow-hidden rounded-3xl border border-ink/8 bg-white shadow-card">
              {(s.items || []).map((it, i) => (
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
          </div>
        </section>
      );

    case "form":
      if (!settings) return null;
      return (
        <section className="py-16 lg:py-20" id="inquiry" data-pb={index}>
          <div className="mx-auto grid max-w-[1400px] gap-10 px-4 sm:px-6 lg:grid-cols-12">
            <Reveal className="lg:col-span-4">
              {s.eyebrow && <p className="eyebrow">{s.eyebrow}</p>}
              {s.title && <h2 className="display mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)]">{s.title}</h2>}
              {s.body && <p className="mt-4 text-[15px] leading-relaxed text-charcoal/80">{s.body}</p>}
            </Reveal>
            <Reveal y={50} className="lg:col-span-7 lg:col-start-6">
              <InquiryForm
                fields={settings.contactFields}
                markets={markets}
                projects={projects}
                budgetOptions={settings.budgetOptions}
                interestOptions={settings.interestOptions}
                cityFieldEnabled={settings.cityFieldEnabled}
                customBudgetEnabled={settings.customBudgetEnabled}
                source={source}
              />
            </Reveal>
          </div>
        </section>
      );

    default:
      return null;
  }
}
