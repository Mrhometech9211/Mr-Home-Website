import type { Metadata } from "next";
import { getFaqs, getSections, getSettings, getTestimonials } from "@/lib/content";
import { buildMetadata, resolvePageSeo } from "@/lib/seo";
import { PageHero } from "@/components/site/PageHero";
import { Reveal } from "@/components/site/Reveal";
import { DynamicIcon } from "@/components/site/Icons";
import { Button3D } from "@/components/ui/Button3D";
import { JsonLd } from "@/components/site/Breadcrumbs";
import { webPageJsonLd } from "@/lib/structured-data";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/why-mr-home", { title: "Why Mr.Home" });
}

export default async function WhyPage() {
  const [sections, faqs, testimonials, settings] = await Promise.all([getSections("why-mr-home"), getFaqs(), getTestimonials(), getSettings()]);
  const byKey = Object.fromEntries(sections.map((s) => [s.key, s]));
  const hero = byKey.hero;
  const values = byKey.values;
  const process = byKey.process;
  const faqLd = faqs.length ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) } : null;
  const seo = await resolvePageSeo("/why-mr-home", { title: hero?.title || "Why Mr.Home", description: hero?.body, image: hero?.image });
  const pageLd = webPageJsonLd({ path: "/why-mr-home", canonical: seo.canonical, name: seo.title, description: seo.description });

  return (
    <>
      <JsonLd data={pageLd} />
      <PageHero eyebrow={hero?.eyebrow || "Why Mr.Home"} title={hero?.title || "Why Mr.Home"} body={hero?.body} image={hero?.image} crumbs={[{ name: "Home", href: "/" }, { name: "Why Mr.Home", href: "/why-mr-home" }]} />

      {values && (
        <section className="relative py-8 lg:py-16" aria-labelledby="values-title">
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
            <Reveal><h2 id="values-title" className="display text-[clamp(1.8rem,3.4vw,2.6rem)] text-ink">{values.title}</h2></Reveal>
            <Reveal stagger="[data-v]" className="perspective mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {(values.items ?? []).map((it, i) => (
                <div key={i} data-v className="card-3d group relative rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,#ffffff,#f3f3ee)] p-7 shadow-card transition-transform duration-500 hover:-translate-y-2 hover:[transform:perspective(1000px)_rotateX(3deg)_translateY(-8px)]">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(160deg,var(--brand-bright),var(--brand))] text-white shadow-[0_10px_20px_-8px_rgba(31,143,58,0.7)]"><DynamicIcon name={it.icon} className="h-6 w-6" /></span>
                  <h3 className="mt-5 text-[18px] font-semibold tracking-tight text-ink">{it.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-charcoal/75">{it.description}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>
      )}

      {process && (
        <section className="relative overflow-hidden bg-space py-24 text-white" aria-labelledby="process-title">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_30%,rgba(31,143,58,0.18),transparent_70%)]" />
          <div className="relative mx-auto max-w-[1400px] px-4 sm:px-6">
            <Reveal><h2 id="process-title" className="display text-[clamp(1.8rem,3.4vw,2.6rem)]">{process.title}</h2></Reveal>
            <Reveal stagger="[data-p]" className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {(process.items ?? []).map((it, i) => (
                <div key={i} data-p className="glass-dark rounded-3xl p-6">
                  <div className="text-[13px] font-semibold tracking-[0.2em] text-brand-bright">{it.title?.split("—")[0]?.trim()}</div>
                  <h3 className="mt-3 text-[18px] font-semibold tracking-tight">{it.title?.split("—").slice(1).join("—").trim() || it.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-white/65">{it.description}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>
      )}

      {testimonials.length > 0 && (
        <section className="py-24" aria-labelledby="testimonials-title">
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
            <Reveal><p className="eyebrow">Client Voices</p><h2 id="testimonials-title" className="display mt-4 text-[clamp(1.8rem,3.4vw,2.6rem)] text-ink">Trusted by investors worldwide</h2></Reveal>
            <Reveal stagger="[data-t]" className="mt-10 grid gap-5 md:grid-cols-3">
              {testimonials.map((t) => (
                <figure key={t.id} data-t className="rounded-3xl border border-ink/8 bg-white p-7 shadow-soft">
                  <blockquote className="text-[15.5px] leading-relaxed text-charcoal">“{t.quote}”</blockquote>
                  <figcaption className="mt-5 text-[13px]"><span className="font-semibold text-ink">{t.name}</span>{t.role && <span className="text-mist"> · {t.role}</span>}</figcaption>
                </figure>
              ))}
            </Reveal>
          </div>
        </section>
      )}

      {faqs.length > 0 && (
        <section className="pb-24" aria-labelledby="faq-title">
          {faqLd && <JsonLd data={faqLd} />}
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <Reveal><h2 id="faq-title" className="display text-[clamp(1.8rem,3.4vw,2.6rem)] text-ink">Frequently asked questions</h2></Reveal>
            <div className="mt-8 divide-y divide-ink/8 rounded-3xl border border-ink/8 bg-white shadow-soft">
              {faqs.map((f) => (
                <details key={f.id} className="group p-6">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-[16px] font-medium text-ink"><span>{f.question}</span><span className="ml-4 text-brand transition-transform group-open:rotate-45">+</span></summary>
                  <p className="mt-3 text-[14.5px] leading-relaxed text-charcoal/80">{f.answer}</p>
                </details>
              ))}
            </div>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button3D href="/contact">Talk to an Advisor</Button3D>
              <Button3D href="/projects" variant="secondary">Explore Projects</Button3D>
            </div>
            <p className="mt-6 text-[12px] text-mist">{settings.disclaimer}</p>
          </div>
        </section>
      )}
    </>
  );
}
