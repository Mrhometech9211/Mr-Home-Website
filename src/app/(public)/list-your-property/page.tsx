import type { Metadata } from "next";
import { getFaqs, getPublishedMarkets, getSettings } from "@/lib/content";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/site/PageHero";
import { Reveal } from "@/components/site/Reveal";
import { Breadcrumbs, JsonLd } from "@/components/site/Breadcrumbs";
import { ListPropertyForm } from "@/components/list-your-property/ListPropertyForm";
import type { LypItem } from "@/lib/settings-types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return buildMetadata("/list-your-property", { title: settings.listYourProperty.title || "List Your Property with Mr.Home" });
}

const defaultBenefits: LypItem[] = [
  { title: "Reach genuine buyers and tenants", body: "Your property is presented to our global buyer base and marketed across our channels — not listed and forgotten." },
  { title: "Right price, backed by data", body: "Every listing starts with a free market assessment so your asking price reflects real transaction evidence." },
  { title: "One end-to-end partner", body: "Photography, viewings, negotiation and paperwork are handled by one dedicated advisor." },
  { title: "Vetted enquiries only", body: "We pre-qualify every enquiry before it reaches you, so viewings are productive and private." },
];

const defaultSteps: LypItem[] = [
  { title: "1. Submit your property", body: "Share the basics below — address, type and whether you want to sell or rent. It takes two minutes." },
  { title: "2. Get a free valuation", body: "Your advisor confirms the market value, rental potential and the best channel for your property." },
  { title: "3. Professional presentation", body: "We organise photography, floor plans and a listing description that sells the property." },
  { title: "4. Viewings & offers", body: "We coordinate viewings and negotiate offers on your behalf — you approve everything." },
  { title: "5. Paperwork to handover", body: "Contracts, deposits and key handover are managed to completion, wherever you are." },
];

const benefits = defaultBenefits;
const steps = defaultSteps;

export default async function ListYourPropertyPage() {
  const [settings, markets, faqs] = await Promise.all([getSettings(), getPublishedMarkets(), getFaqs()]);
  const lyp = { ...settings.listYourProperty };
  // Defensive fallbacks so an empty settings row never blanks the page.
  if (!lyp.benefits?.length) lyp.benefits = defaultBenefits;
  if (!lyp.steps?.length) lyp.steps = defaultSteps;
  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.slice(0, 6).map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
  };

  return (
    <>
      <JsonLd data={ld} />
      <PageHero
        eyebrow={lyp.eyebrow || "For Owners"}
        title={lyp.title || "List Your Property with Mr.Home"}
        body={lyp.heroBody || "Sell or rent faster with a dedicated advisor, a free market valuation and access to our global buyer network."}
        crumbs={[{ name: "Home", href: "/" }, { name: "List Your Property", href: "/list-your-property" }]}
      />

      {lyp.heroImage && (
        <section className="mx-auto max-w-[1400px] px-4 pt-12 sm:px-6" aria-hidden="true">
          <img src={lyp.heroImage} alt={lyp.title || "List your property with Mr.Home"} className="h-[240px] w-full rounded-[28px] object-cover shadow-card sm:h-[340px]" />
        </section>
      )}

      <section className="mx-auto max-w-[1400px] px-4 pb-8 pt-16 sm:px-6" aria-label="Why list with Mr.Home">
        <Reveal stagger="[data-b]" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {lyp.benefits.map((b) => (
            <div key={b.title} data-b className="rounded-[24px] border border-ink/8 bg-white p-6 shadow-card">
              <h2 className="text-[16px] font-semibold tracking-tight text-ink">{b.title}</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-charcoal/75">{b.body}</p>
            </div>
          ))}
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6" aria-label="How listing works">
        <Reveal><h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">How listing with us works</h2></Reveal>
        <Reveal stagger="[data-s]" className="mt-8 grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {lyp.steps.map((s) => (
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
              <h2 className="display text-[clamp(1.6rem,3vw,2.2rem)] text-ink">{lyp.formTitle || "Tell us about your property"}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-charcoal/80">
                {lyp.formIntro || "Submit the details and a listings advisor will contact you within one business day with a free valuation and a proposed plan — no obligation."}
              </p>
              {lyp.formCtaLabel && (lyp.formCtaHref) && (
                <a href={lyp.formCtaHref} className="mt-5 inline-block rounded-full bg-brand px-6 py-3 text-[14px] font-semibold text-white shadow-soft transition hover:brightness-110">{lyp.formCtaLabel}</a>
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
