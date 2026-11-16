import type { Metadata } from "next";
import { getFaqs, getPublishedMarkets, getSettings } from "@/lib/content";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/site/PageHero";
import { Reveal } from "@/components/site/Reveal";
import { Breadcrumbs, JsonLd } from "@/components/site/Breadcrumbs";
import { ListPropertyForm } from "@/components/list-your-property/ListPropertyForm";
import { getLypSections } from "@/lib/site-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return buildMetadata("/list-your-property", { title: settings.listYourProperty.title || "List Your Property with Mr.Home" });
}

export default async function ListYourPropertyPage() {
  const [settings, markets, faqs] = await Promise.all([getSettings(), getPublishedMarkets(), getFaqs()]);
  const sections = await getLypSections(settings);
  const hero = sections.find((s) => s.key === "hero");
  const benefitsSection = sections.find((s) => s.key === "benefits");
  const stepsSection = sections.find((s) => s.key === "steps");
  const form = sections.find((s) => s.key === "form");
  const lyp = settings.listYourProperty;
  const heroEyebrow = hero?.eyebrow ?? lyp.eyebrow;
  const heroTitle = hero?.title ?? lyp.title;
  const heroBody = hero?.body ?? lyp.heroBody;
  const heroImage = hero?.image ?? lyp.heroImage;
  const benefits = (benefitsSection?.items ?? []).map((i) => ({ title: i.title ?? "", body: i.description ?? "" }));
  const steps = (stepsSection?.items ?? []).map((i) => ({ title: i.title ?? "", body: i.description ?? "" }));
  const stepsTitle = stepsSection?.title || "How listing with us works";
  const formTitle = form?.title ?? lyp.formTitle;
  const formIntro = form?.body ?? lyp.formIntro;
  const formCtaLabel = form?.ctaLabel ?? lyp.formCtaLabel;
  const formCtaHref = form?.ctaHref ?? lyp.formCtaHref;
  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.slice(0, 6).map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
  };

  return (
    <>
      <JsonLd data={ld} />
      <PageHero
        eyebrow={heroEyebrow ?? "For Owners"}
        title={heroTitle ?? "List Your Property with Mr.Home"}
        body={heroBody ?? "Sell or rent faster with a dedicated advisor, a free market valuation and access to our global buyer network."}
        crumbs={[{ name: "Home", href: "/" }, { name: "List Your Property", href: "/list-your-property" }]}
      />

      {heroImage && (
        <section className="mx-auto max-w-[1400px] px-4 pt-12 sm:px-6" aria-hidden="true">
          <img src={heroImage} alt={heroTitle || "List your property with Mr.Home"} className="h-[240px] w-full rounded-[28px] object-cover shadow-card sm:h-[340px]" />
        </section>
      )}

      <section className="mx-auto max-w-[1400px] px-4 pb-8 pt-16 sm:px-6" aria-label="Why list with Mr.Home">
        <Reveal stagger="[data-b]" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((b) => (
            <div key={b.title} data-b className="rounded-[24px] border border-ink/8 bg-white p-6 shadow-card">
              <h2 className="text-[16px] font-semibold tracking-tight text-ink">{b.title}</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-charcoal/75">{b.body}</p>
            </div>
          ))}
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6" aria-label="How listing works">
        <Reveal><h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">{stepsTitle}</h2></Reveal>
        <Reveal stagger="[data-s]" className="mt-8 grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {steps.map((s) => (
            <div key={s.title} data-s className="rounded-[24px] border border-ink/8 bg-ivory-deep/40 p-6">
              <h3 className="text-[15px] font-semibold tracking-tight text-ink">{s.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-charcoal/75">{s.body}</p>
            </div>
          ))}
        </Reveal>
      </section>

      <section id="submit" className="mx-auto max-w-[1400px] px-4 pb-20 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-5">
            <Reveal>
              <h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">{formTitle ?? "Tell us about your property"}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-charcoal/80">
                {formIntro ?? "Submit the details and a listings advisor will contact you within one business day with a free valuation and a proposed plan — no obligation."}
              </p>
              {formCtaLabel && (formCtaHref) && (
                <a href={formCtaHref} className="mt-5 inline-block rounded-full bg-brand px-6 py-3 text-[14px] font-semibold text-white shadow-soft transition hover:brightness-110">{formCtaLabel}</a>
              )}
            </Reveal>
            {settings.phone && (
              <Reveal className="rounded-3xl border border-ink/8 bg-white p-6 shadow-card">
                <p className="text-[11px] uppercase tracking-[0.18em] text-mist">Prefer to talk?</p>
                <a href={`tel:${settings.phone.replace(/\s+/g, "")}`} className="mt-1 inline-block text-[22px] font-semibold tracking-tight text-brand">{settings.phone}</a>
                <p className="mt-2 text-[13px] text-charcoal/70">{settings.workingHours}</p>
              </Reveal>
            )}
            {settings.showEmailCard && settings.email && (
              <Reveal className="rounded-3xl border border-ink/8 bg-white p-6 shadow-card">
                <p className="text-[11px] uppercase tracking-[0.18em] text-mist">Prefer to write?</p>
                <a href={`mailto:${settings.email}`} className="mt-1 inline-block text-[18px] font-semibold tracking-tight text-brand hover:underline">{settings.email}</a>
                <p className="mt-2 text-[13px] text-charcoal/70">We reply to listing enquiries within one business day.</p>
              </Reveal>
            )}
          </div>
          <div className="lg:col-span-7">
            <Reveal>
              <ListPropertyForm markets={markets.map((m) => ({ id: m.id, name: m.name, flag: m.flag }))} lypFields={lyp.contactFields} />
            </Reveal>
          </div>
        </div>
      </section>

      {faqs.length > 0 && (
        <section className="bg-ivory-deep/60 py-20" aria-label="Frequently asked questions">
          <div className="mx-auto max-w-[900px] px-4 sm:px-6">
            <Reveal><h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">Common owner questions</h2></Reveal>
            <Reveal stagger="[data-q]" className="mt-8 space-y-3">
              {faqs.slice(0, 6).map((f) => (
                <details key={f.id} data-q className="group rounded-2xl border border-ink/8 bg-white px-5 py-4 open:shadow-soft">
                  <summary className="cursor-pointer list-none text-[15px] font-medium text-ink marker:hidden">{f.question}</summary>
                  <p className="mt-2 text-[14px] leading-relaxed text-charcoal/75">{f.answer}</p>
                </details>
              ))}
            </Reveal>
          </div>
        </section>
      )}
    </>
  );
}
