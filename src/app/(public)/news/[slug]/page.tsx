import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getNewsArticleBySlug, getPublishedNews } from "@/lib/content";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/site/PageHero";
import { Markdown } from "@/components/site/Markdown";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

const SITE = "https://www.mrhomerealestate.com";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getNewsArticleBySlug(slug);
  if (!article) return buildMetadata(`/news/${slug}`, { title: "Article not found", noIndex: true });
  return buildMetadata(`/news/${article.slug}`, {
    title: article.seoTitle || article.title,
    description: article.seoDescription || article.excerpt,
    image: article.coverImage,
  });
}

export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getNewsArticleBySlug(slug);
  if (!article) notFound();

  const related = (await getPublishedNews({ category: article.category ?? undefined }))
    .filter((a) => a.id !== article.id)
    .slice(0, 3);

  const publishedISO = (article.publishedAt || article.createdAt).toISOString();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.excerpt || article.seoDescription || undefined,
    image: article.coverImage ? [article.coverImage.startsWith("http") ? article.coverImage : `${SITE}${article.coverImage}`] : undefined,
    datePublished: publishedISO,
    dateModified: article.updatedAt.toISOString(),
    author: article.author ? { "@type": "Organization", name: article.author } : undefined,
    publisher: {
      "@type": "Organization",
      name: "MR.HOME Real Estate",
      url: SITE,
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE}/news/${article.slug}` },
    articleSection: article.category || undefined,
    keywords: article.seoKeywords || undefined,
  };

  return (
    <>
      <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
                { "@type": "ListItem", position: 2, name: "News", item: `${SITE}/news` },
                { "@type": "ListItem", position: 3, name: article.title, item: `${SITE}/news/${article.slug}` },
              ],          }),
        }}
      />
      <PageHero
        eyebrow={article.category}
        title={article.title}
        body={article.excerpt}
        crumbs={[{ name: "Home", href: "/" }, { name: "News", href: "/news" }, { name: article.title, href: `/news/${article.slug}` }]}
      >
        <p className="mt-4 text-[13px] text-charcoal/60">
          {article.author && (
            <>
              By <span className="font-medium text-ink">{article.author}</span>
              {article.authorRole ? ` · ${article.authorRole}` : ""}
            </>
          )}
          {article.author && " · "}
          {formatDateTime(article.publishedAt || article.createdAt)}
          {article.marketName && (
            <>
              {" "}· <Link href={`/news?market=${article.marketSlug}`} className="text-brand underline underline-offset-2">{article.marketFlag} {article.marketName}</Link>
            </>
          )}
        </p>
      </PageHero>

      <article className="pb-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
          {article.coverImage && (
            <div className="relative mt-10 aspect-[16/9] w-full overflow-hidden rounded-3xl bg-ivory-deep shadow-card">
              <Image src={article.coverImage} alt={article.coverImageAlt || article.title} fill priority className="object-cover" sizes="(min-width:768px) 768px, 100vw" />
            </div>
          )}
          <div className="mt-10">
            <Markdown content={article.body} className="prose-legal text-[16px] leading-[1.8] text-charcoal/85" />
          </div>
          {article.videoUrl && (
            <div className="mt-10 aspect-video w-full overflow-hidden rounded-3xl bg-ink">
              <iframe
                src={article.videoUrl}
                title={article.title}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          )}
          <p className="mt-12 rounded-2xl bg-ivory-deep/70 p-5 text-[13px] text-charcoal/70">
            Looking to invest in {article.marketName || "one of our markets"}?{" "}
            <Link href="/contact" className="font-medium text-brand underline underline-offset-2">Speak with an advisor</Link> — we respond within one business day.
          </p>
        </div>

        {related.length > 0 && (
          <div className="mx-auto mt-16 max-w-[1400px] px-4 sm:px-6">
            <h2 className="text-[20px] font-semibold text-ink">More {article.category ? `${article.category}` : "news"}</h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              {related.map((r) => (
                <Link key={r.id} href={`/news/${r.slug}`} className="group rounded-2xl border border-ink/8 bg-white p-5 shadow-card transition-transform duration-300 hover:-translate-y-1">
                  <p className="text-[12px] text-charcoal/60">{r.marketFlag} {r.marketName || r.country} · {formatDateTime(r.publishedAt || r.createdAt)}</p>
                  <h3 className="mt-2 text-[16px] font-semibold leading-snug text-ink group-hover:text-brand">{r.title}</h3>
                  {r.excerpt && <p className="mt-2 line-clamp-2 text-[13px] text-charcoal/70">{r.excerpt}</p>}
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>
    </>
  );
}
