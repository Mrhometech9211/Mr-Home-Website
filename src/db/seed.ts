import { eq, sql } from "drizzle-orm";
import { db, initDb } from "@/db";
import { cities, faqs, legalPages, markets, navigationItems, newsArticles, pageSections, projects, properties, seoEntries, siteSettings, testimonials, whatsappTemplates } from "@/db/schema";
import { CITIES_SEED, FAQ_SEED, LEGAL_SEED, MARKETS_SEED, NAV_SEED, NEWS_SEED, PROJECTS_SEED, PROPERTIES_SEED, SECTIONS_SEED, SEO_SEED, TESTIMONIAL_SEED, WHATSAPP_TEMPLATES_SEED } from "./seed-data";
import { DEFAULT_SETTINGS } from "@/lib/settings-types";

export async function runSeed() {
  const existing = await db.select({ id: siteSettings.id }).from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
  if (existing.length) return false;

  await db.insert(siteSettings).values({ id: 1, data: DEFAULT_SETTINGS as unknown as Record<string, unknown> });

  const insertedMarkets = await db.insert(markets).values(MARKETS_SEED.map((m) => ({ ...m, published: true }))).returning({ id: markets.id, slug: markets.slug });
  const marketBySlug = new Map(insertedMarkets.map((m) => [m.slug, m.id]));

  await db.insert(projects).values(
    PROJECTS_SEED.map(({ market, ...p }) => ({ ...p, marketId: marketBySlug.get(market) ?? null })),
  );

  await db.insert(cities).values(
    CITIES_SEED.map(({ market, ...c }) => ({ ...c, marketId: marketBySlug.get(market) ?? null, published: true })),
  );

  await db.insert(pageSections).values(SECTIONS_SEED.map((s) => ({ ...s, enabled: true })));
  await db.insert(navigationItems).values(NAV_SEED.map((n) => ({ ...n, visible: true })));
  await db.insert(legalPages).values(LEGAL_SEED.map((l) => ({ ...l, published: true })));
  await db.insert(faqs).values(FAQ_SEED);
  await db.insert(testimonials).values(TESTIMONIAL_SEED);
  await db.insert(whatsappTemplates).values(WHATSAPP_TEMPLATES_SEED);
  await db.insert(seoEntries).values(SEO_SEED);
  // Phase 2 + 5: starter marketplace listings and news so new installs have live data.
  await db.insert(properties).values(
    PROPERTIES_SEED.map(({ market, ...p }) => ({ ...p, marketId: marketBySlug.get(market) ?? null, published: true })),
  );
  await db.insert(newsArticles).values(
    NEWS_SEED.map(({ market, ...n }) => ({ ...n, marketId: marketBySlug.get(market) ?? null, published: true, publishedAt: new Date() })),
  );
  return true;
}

/**
 * Forward-fix (Phase 2/5): header + footer navigation of databases seeded before
 * the marketplace/news gained rows for Buy / Rent / News / List Your Property.
 * Idempotent — no-ops once every href exists in its location.
 */
async function ensureNavItemsSeeded() {
  const wanted = [
    { location: "header", label: "Buy", href: "/buy", order: 2 },
    { location: "header", label: "Rent", href: "/rent", order: 3 },
    { location: "header", label: "News", href: "/news", order: 6 },
    { location: "footer", label: "Buy", href: "/buy", order: 6 },
    { location: "footer", label: "Rent", href: "/rent", order: 7 },
    { location: "footer", label: "News", href: "/news", order: 8 },
    { location: "footer", label: "List Your Property", href: "/list-your-property", order: 9 },
  ];
  // Sort the regenerated header naturally: existing rows keep meaning, but the
  // requested sequence is Home, Buy, Rent, Projects, Markets, News, Why, Contact.
  const rows = await db.select({ id: navigationItems.id, location: navigationItems.location, href: navigationItems.href }).from(navigationItems);
  const present = new Set(rows.map((r) => `${r.location}:${r.href}`));
  const missing = wanted.filter((w) => !present.has(`${w.location}:${w.href}`));
  if (missing.length) {
    await db.insert(navigationItems).values(missing.map((m) => ({ ...m, visible: true })));
    // Renumber header orders so new items land between the flows without jitter.
    const headerOrder = ["/", "/buy", "/rent", "/projects", "/markets", "/news", "/why-mr-home", "/contact"];
    for (let i = 0; i < headerOrder.length; i++) {
      await db.execute(sql`update navigation_items set "order" = ${i + 1} where location = 'header' and href = ${headerOrder[i]}`);
    }
  }
}

/**
 * Forward-fix: databases seeded before the Cities feature receive the default
 * city rows on the next boot. No-op once any city exists.
 */
export async function ensureCitiesSeeded() {
  const existing = await db.select({ id: cities.id }).from(cities).limit(1);
  if (existing.length) return;
  const rows = await db.select({ id: markets.id, slug: markets.slug }).from(markets);
  const marketBySlug = new Map(rows.map((m) => [m.slug, m.id]));
  await db.insert(cities).values(
    CITIES_SEED.map(({ market, ...c }) => ({ ...c, marketId: marketBySlug.get(market) ?? null, published: true })),
  );
}

let seedPromise: Promise<boolean> | null = null;
/** Lazily seeds the database once per server process if it is empty. */
export async function ensureSeeded() {
  await initDb(); // safe to call repeatedly — resolves once per process
  if (!seedPromise) {
    seedPromise = runSeed()
      .then(async (seeded) => {
        if (!seeded) {
          try {
            await ensureCitiesSeeded();
            await ensureNavItemsSeeded();
          } catch (e) {
            console.error("[seed] forward-seeds failed", e);
          }
        }
        return seeded;
      })
      .catch((e) => {
        console.error("[seed] failed", e);
        seedPromise = null;
        return false;
      });
  }
  return seedPromise;
}
