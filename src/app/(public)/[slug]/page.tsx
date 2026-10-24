import type { ReactElement } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLegalPage, getPublishedBuilderPage, getSections, getSettings } from "@/lib/content";
import { buildMetadata } from "@/lib/seo";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { Markdown } from "@/components/site/Markdown";
import { PageBuilder } from "@/components/site/PageBuilder";
import { Reveal } from "@/components/site/Reveal";
import { formatDate } from "@/lib/utils";

/** Generic content section rendered when a section is linked to a custom page. */
const CustomSections = ({ title, body, items }: { title: string; body?: string | null; items: any[] }): ReactElement => (
  <div className="space-y-4">
    <h3 className="text-[19px] font-semibold tracking-tight text-ink">{title}</h3>
    {body && <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-charcoal/85">{body}</p>}
    {items.length > 0 && (
      <ul className="my-6 grid list-none gap-3 sm:grid-cols-2">
        {items.filter(it => it).map((it, i) => (
          <li key={i} className="rounded-2xl border border-ink/10 bg-white p-5 shadow-soft">
            {it.title && <p className="font-semibold text-ink">{it.title}</p>}
            {it.description && <p className="text-[13.5px] leading-relaxed text-charcoal/80">{it.description}</p>}
          </li>
        ))}
      </ul>
    )}
  </div>
);

export const dynamic = "force-dynamic";
type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const legal = await getLegalPage(slug);
  if (legal) return buildMetadata(`/${slug}`, { title: legal.seoTitle || legal.title, description: legal.seoDescription });
  const page = await getPublishedBuilderPage(slug);
  if (!page) return { title: "Not found", robots: { index: false } };
  return buildMetadata(`/${page.slug}`, {
    title: page.seoTitle || page.title,
    description: page.seoDescription,
    image: page.ogImage,
    noIndex: page.noIndex,
  });
}

export default async function CatchAllPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [legal, page, s] = await Promise.all([getLegalPage(slug), getPublishedBuilderPage(slug), getSettings()]);
  if (legal) {
    return (
      <article className="pt-32 pb-24 lg:pt-40">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: legal.title, href: `/${legal.slug}` }]} />
          <p className="mt-8 text-[12px] text-mist">Last updated {formatDate(legal.updatedAt)}</p>
          <Markdown content={legal.content} className="prose-legal mt-2" />
          <div className="mt-12 rounded-3xl bg-ivory-deep/70 p-6 text-[13.5px] text-charcoal">
            <p className="font-semibold text-ink">{s.brandName}</p>
            <p>{s.address}</p>
            <p>{s.email} · {s.phone}</p>
          </div>
        </div>
      </article>
    );
  }

  // Phase 7 — published builder page (drafts/archived pages never resolve here).
  if (page) {
    // Content sections linked to this page via Admin → Content → Sections.
    const linkedSections = await getSections(`custom:${page.slug}`);
    return (
      <>
        <BreadcrumbsWrapper title={page.navLabel || page.title} href={`/${page.slug}`} />
        <PageBuilder sections={page.published} source={`page:${page.slug}`} />
        {linkedSections.length > 0 && (
          <div className="mx-auto max-w-3xl space-y-12 px-4 pb-24 pt-8 sm:px-6">
            {linkedSections.map((sec) => (
              <Reveal key={sec.id} className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {sec.image && <img src={sec.image} alt={sec.title || ""} className="h-64 w-full rounded-[24px] object-cover shadow-card" />}
                <CustomSections title={sec.title || sec.key} body={sec.body} items={(sec.items ?? []) as any[]} />
              </Reveal>
            ))}
          </div>
        )}
      </>
    );
  }

  notFound();
}

function BreadcrumbsWrapper({ title, href }: { title: string; href: string }) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-32 sm:px-6 lg:pt-40">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: title, href }]} />
    </div>
  );
}
