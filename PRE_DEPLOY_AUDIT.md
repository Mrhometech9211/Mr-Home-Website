# MR.HOME — Pre-deployment audit

> **Database follow-up:** see [DB_READINESS.md](DB_READINESS.md). The database verdict there is **NOT READY**, and it supersedes the conditional database clearance in section 7 until the blockers are cleared.

- **Range:** `346aac2` (production) → `cc4e5ec` (HEAD), 2 commits
- **Branch:** `freebuff/fix-only-the-sitemap-domain-in-my-existing-mr-home-2e4ee750-345a-4a30-9ec1-f2adb5b7d7de`
- **Status:** nothing committed, pushed, deployed, or migrated during this audit
- **Live site:** `https://www.mrhomerealestate.com/` (Vercel, old build `346aac2`)

## 1. Change inventory

`121 files changed, 23,337 insertions(+), 6,544 deletions(-)`.

### Public routes
- Added: `/buy`, `/rent`, `/properties/[slug]`, `/list-your-property`, `/news`, `/news/[slug]`
- Deleted: `src/app/(public)/loading.tsx` (the streaming boundary that produced HTTP 200 soft-404s)
- Updated: home, `[slug]` builder, projects list/detail, markets list/detail/city, public layout

### Admin, CMS and CRM
- Page builder: pages list, new/edit, revisions, publish, preview
- Roles and custom permissions, user role assignment
- Brochure upload/download/gating, download tokens, lead capture
- Lead pipeline, notifications, automations, Kanban, lead scoring
- Media library, settings tabs, generic resources, audit log
- New API routes for pages, brochures, roles, notifications, automations, preview, list-your-property

### Marketplace
- `MarketplacePage`, `PropertyFilters`, `PropertyCard`
- Property facets, cities, currencies, purpose/area tags, brochure gate
- Property detail route and related listings

### Libraries
- `content.ts`, `seo.ts`, new `site.ts` and `area.ts`, `page-builder.ts`, `pages-server.ts`
- `resources.ts`/`resources-server.ts`, `permissions.ts`, `auth.ts`, `audit.ts`
- `lead-score.ts`, `currencies.ts`, `amenity-filters.ts`, `automations.ts`
- `brochure-token.ts`, `admin-brochures-handler.ts`, `url.ts`, `defer-load.ts`

### Database
- `src/db/schema.ts`, `seed.ts`, `seed-data.ts`, `src/db/index.ts`
- Migrations `0003`–`0007` and meta snapshot/journal changes

### Configuration and dependencies
- `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `.gitignore`
- `open-next.config.ts`, `wrangler.jsonc`, `public/_headers` (Cloudflare/OpenNext; not used by Vercel)
- Dependency changes listed in section 5

### SEO
- `src/app/layout.tsx` (metadataBase), `src/lib/seo.ts`, `src/app/sitemap.ts`, `src/app/robots.ts`
- Public layout Organization JSON-LD, Breadcrumbs JSON-LD
- Property/project/news JSON-LD URLs and images
- `src/app/not-found.tsx` title/no-index
- Admin settings help text for the legacy site URL

## 2. Database migration audit

### Runtime path
`initDb()` → `ensureSchema()` reads every `drizzle/*.sql` file (sorted), splits on `--> statement-breakpoint`, checks `CREATE TABLE`, `CREATE INDEX`, `ADD COLUMN` and `ADD CONSTRAINT` against the catalog, then executes the statement. There is **no migration ledger, no down migration, no global transaction and no advisory lock**. `initDb()` is lazy and retries after failure. `runSeed()` only inserts demo content when `site_settings` has no row; it also forward-adds missing Buy/Rent/News/List Your Property nav rows and renumbers the header.

### Migrations
- `0003_smiling_talisman.sql`: creates `brochures`, `custom_roles`, `news_articles`, `page_revisions`, `pages`, `properties`; adds `users.custom_role_id`; adds FKs and indexes.
- `0004_leads_details.sql`: adds `leads.details` (jsonb, nullable).
- `0005_leads_email_nullable.sql`: drops `NOT NULL` from `leads.email` (widening; no data loss).
- `0006_pages_parent.sql`: adds `pages.parent_id` and FK.
- `0006_properties_completion.sql`: adds `properties.completion`; backfills null rows from availability text.
- `0007_projects_purpose_area.sql`: adds `projects.purpose` (default `sale`), `area_value`, `area_unit`; adds purpose index.

No `DROP TABLE`, `TRUNCATE` or `DELETE` statements are present.

### Production risks
1. **DDL privileges:** the production DB user needs CREATE/ALTER/INDEX/FK rights. If it is restricted, the first request will 500 after `initDb()`.
2. **No rollback migrations:** a code rollback leaves additive tables/columns in place. A full DB rollback requires a provider snapshot/`pg_dump` restore. `leads.email` cannot be safely made `NOT NULL` again if null rows exist; completion/backfill values would need the backup.
3. **Schema drift:** if a table already exists with a different shape, `CREATE TABLE` is skipped and no missing columns are added. Verify a staging clone/schema diff first.
4. **First-request DDL:** migrations run on the first request after deploy, with table locks and possible cold-start timeout. Prefer low traffic or a controlled pre-migration on a staging clone.
5. **Concurrency:** simultaneous cold starts can race. Duplicate “already exists” errors are tolerated; a genuinely failed statement leaves earlier statements applied and makes requests fail until a retry succeeds.
6. **Journal mismatch:** `_journal.json` lists 0000–0003 and 0007, not 0004–0006. Do **not** rely on `drizzle-kit migrate`; the runtime runner reads all SQL files. A manual migrate command would skip 0004–0006.
7. **Content effects:** all existing projects become `purpose = sale`; they appear under `/buy` until edited. Missing nav items are inserted and header order renumbered on first boot.
8. **Packaging:** migrations are read with `fs`. `next.config.ts` now includes `./drizzle/**/*.sql` via `outputFileTracingIncludes`; the built page trace contains all 9 SQL files.

### Required before deploy
- Take a provider snapshot **and** a logical `pg_dump`; verify the restore path.
- Run the migrations against a **staging clone of production PostgreSQL** (not PGlite) and confirm the app reads/writes there.
- Confirm the production DB role has DDL rights; otherwise pre-apply migrations with a privileged role.
- Record the current schema/migration state so a rollback decision is explicit.

## 3. SEO fixes applied in this branch

- Canonical and Open Graph URLs are absolute `https://www.mrhomerealestate.com` URLs in `buildMetadata`; filtered URLs consolidate on `/buy` and `/rent`.
- Organization JSON-LD now uses the canonical domain for `url`, `@id`, `logo` and `image`; it no longer reads the editable `siteUrl` value (which was the vercel.app URL in production).
- Breadcrumb, property, project and news JSON-LD use absolute canonical URLs/images.
- Sitemap now covers `/buy`, `/rent`, `/list-your-property`, published property details, published market city pages, plus existing projects/markets/news/legal/published builder pages. Drafts, archived rows, no-index pages and duplicate top-level slugs are excluded.
- `robots.txt` points to the canonical sitemap and disallows `/admin`, `/api/`, `/preview`.
- 404s now return HTTP 404 with a “Page not found” title and noindex; the old streaming soft-404 boundary is gone.
- `/buy`, `/rent`, property details and `/list-your-property` all return index/follow metadata and canonical www URLs.

## 4. Verification performed

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | 0 errors, 8 pre-existing warnings (img, hooks, location) |
| `npm run build` (Next 16.4.2) | Pass |
| Production server `/`, `/buy`, `/rent`, `/projects`, `/markets`, `/news`, `/contact`, `/why-mr-home`, `/list-your-property` | 200 |
| `/buy?type=villa` canonical | `https://www.mrhomerealestate.com/buy` |
| Property detail | 200 after fix; canonical/OG/JSON-LD www |
| Project detail | 200; canonical/OG/JSON-LD www |
| Market, city, news detail | 200; canonical www |
| Unknown top-level and `/properties/nope` | HTTP 404 |
| Sitemap | 69 URLs, 0 vercel.app, includes buy/rent/list-your-property, 8 properties, 25 city pages |
| Robots | canonical Host + sitemap; admin/api/preview disallowed |
| Server error log | No errors during verification |
| Draft/archived exclusion | Enforced by the sitemap query filters; the local seed has no draft fixture |
| Production DB | Not contacted, not migrated |

**Bug found and fixed:** `/properties/[slug]` imported `formatArea` from the `"use client"` PropertyCard module and called it on the server, causing a 500 on every property detail page. It now lives in server-safe `src/lib/area.ts`; the property page and card share it.

There is no automated test script in this repository (no `test` script and no test files), so verification is the build plus the HTTP integration checks above.

## 5. Dependencies and deployment

- `next` 16.2.6 → 16.4.2; `react`/`react-dom` 19.2.6 → 19.3.1
- `@react-three/fiber` 9.7.0 → 9.8.2
- `eslint` 9.39.4 → 10.13.0; `eslint-config-next` 16.4.2
- Added dev deps: `@opennextjs/cloudflare` 1.20.12, `wrangler` 4.148.0, `pg-cloudflare` 1.4.1
- `next.config.ts`: output tracing includes migrations; `pg`/PGlite externalized; static-asset caching and security headers
- OpenNext/Wrangler files are for the Cloudflare preview path and are not the Vercel production target
- Next 16 requires Node 20.9+; confirm the Vercel project is on Node 22.x before deploying

## 6. Working-tree changes made during this audit

Modified: `next-env.d.ts` (regenerated by build), `next.config.ts`, `src/app/layout.tsx`, `src/app/(public)/layout.tsx`, `src/app/(public)/news/[slug]/page.tsx`, `src/app/(public)/projects/[slug]/page.tsx`, `src/app/(public)/properties/[slug]/page.tsx`, `src/app/not-found.tsx`, `src/app/robots.ts`, `src/app/sitemap.ts`, `src/components/admin/SettingsForm.tsx`, `src/components/marketplace/PropertyCard.tsx`, `src/components/site/Breadcrumbs.tsx`, `src/lib/content.ts`, `src/lib/seo.ts`, `tsconfig.tsbuildinfo` (build cache).

Added: `src/lib/area.ts`, `src/lib/site.ts`, `PRE_DEPLOY_AUDIT.md`.

All pre-existing commits and untracked files were preserved. No source file was deleted or reset.

## 7. Verdict

The branch is **code-ready**: typecheck, lint (no errors) and production build pass, and the local production server serves the new routes with canonical www metadata, a correct sitemap/robots and real 404s.

The production deploy is **conditionally safe**, not risk-free: the runtime will apply six new migrations on the first request. Do the DB snapshot + staging-clone migration test + DDL-privilege check first. If those pass, a fast-forward push to `main` is the correct deployment path; no new repository or Cloudflare deploy is needed.

Not done: commit, push, deploy, production DB mutation, or Search Console submission. No claim of Google indexing is made.

## Appendix — full file inventory (`git diff --name-status 346aac2..HEAD`)

```text
M	.gitignore
A	drizzle/0003_smiling_talisman.sql
A	drizzle/0004_leads_details.sql
A	drizzle/0005_leads_email_nullable.sql
A	drizzle/0006_pages_parent.sql
A	drizzle/0006_properties_completion.sql
A	drizzle/0007_projects_purpose_area.sql
A	drizzle/meta/0003_snapshot.json
M	drizzle/meta/_journal.json
M	eslint.config.mjs
M	next-env.d.ts
M	next.config.ts
A	open-next.config.ts
M	package-lock.json
M	package.json
A	public/_headers
M	src/app/(public)/[slug]/page.tsx
A	src/app/(public)/buy/page.tsx
M	src/app/(public)/layout.tsx
A	src/app/(public)/list-your-property/page.tsx
D	src/app/(public)/loading.tsx
M	src/app/(public)/markets/[slug]/[city]/page.tsx
M	src/app/(public)/markets/[slug]/page.tsx
A	src/app/(public)/news/[slug]/page.tsx
A	src/app/(public)/news/page.tsx
M	src/app/(public)/projects/ProjectFilters.tsx
M	src/app/(public)/projects/[slug]/page.tsx
M	src/app/(public)/projects/page.tsx
A	src/app/(public)/properties/[slug]/page.tsx
A	src/app/(public)/rent/page.tsx
A	src/app/admin/(dashboard)/brochures/page.tsx
M	src/app/admin/(dashboard)/layout.tsx
M	src/app/admin/(dashboard)/leads/pipeline/page.tsx
M	src/app/admin/(dashboard)/page.tsx
A	src/app/admin/(dashboard)/pages/[id]/page.tsx
A	src/app/admin/(dashboard)/pages/new/page.tsx
A	src/app/admin/(dashboard)/pages/page.tsx
A	src/app/admin/(dashboard)/roles/page.tsx
M	src/app/api/admin/[resource]/[id]/route.ts
M	src/app/api/admin/[resource]/bulk/route.ts
M	src/app/api/admin/[resource]/route.ts
A	src/app/api/admin/automations/route.ts
A	src/app/api/admin/brochures/[id]/file-preview/route.ts
A	src/app/api/admin/brochures/[id]/route.ts
A	src/app/api/admin/brochures/route.ts
A	src/app/api/admin/notifications/recent/route.ts
A	src/app/api/admin/pages-lookup/route.ts
A	src/app/api/admin/pages/[id]/publish/route.ts
A	src/app/api/admin/pages/[id]/revisions/route.ts
A	src/app/api/admin/pages/[id]/route.ts
A	src/app/api/admin/pages/route.ts
A	src/app/api/admin/preview/route.ts
A	src/app/api/admin/roles/[...action]/route.ts
A	src/app/api/admin/roles/[id]/route.ts
A	src/app/api/admin/roles/route.ts
M	src/app/api/admin/settings/route.ts
M	src/app/api/auth/login/route.ts
M	src/app/api/auth/session/route.ts
A	src/app/api/brochures/[id]/route.ts
A	src/app/api/brochures/lead/route.ts
M	src/app/api/leads/route.ts
A	src/app/api/list-your-property/route.ts
M	src/app/layout.tsx
A	src/app/preview/pages/[id]/page.tsx
M	src/app/robots.ts
M	src/app/sitemap.ts
M	src/components/admin/AdminShell.tsx
A	src/components/admin/BrochuresManager.tsx
M	src/components/admin/FieldInput.tsx
M	src/components/admin/KanbanBoard.tsx
A	src/components/admin/LeadNotifier.tsx
M	src/components/admin/MediaLibrary.tsx
A	src/components/admin/PageEditor.tsx
M	src/components/admin/ResourceForm.tsx
M	src/components/admin/ResourceManager.tsx
A	src/components/admin/RolesManager.tsx
M	src/components/admin/SettingsForm.tsx
A	src/components/admin/Stubs.tsx
M	src/components/admin/ui.tsx
M	src/components/home/EarthSection.tsx
A	src/components/home/MarketCTA.tsx
M	src/components/home/StatsBar.tsx
A	src/components/list-your-property/ListPropertyForm.tsx
A	src/components/marketplace/MarketplacePage.tsx
A	src/components/marketplace/PropertyCard.tsx
A	src/components/marketplace/PropertyFilters.tsx
A	src/components/site/BrochureGate.tsx
M	src/components/site/Footer.tsx
A	src/components/site/MasonryGrid.tsx
M	src/components/site/Navbar.tsx
A	src/components/site/PageBuilder.tsx
M	src/components/site/PageHero.tsx
M	src/components/site/ProjectCard.tsx
A	src/components/site/ProjectPricing.tsx
M	src/components/site/WhatsAppFloat.tsx
M	src/db/index.ts
M	src/db/schema.ts
M	src/db/seed-data.ts
M	src/db/seed.ts
A	src/lib/admin-brochures-handler.ts
A	src/lib/amenity-filters.ts
M	src/lib/audit.ts
M	src/lib/auth.ts
A	src/lib/automations.ts
A	src/lib/brochure-token.ts
M	src/lib/content.ts
A	src/lib/currencies.ts
A	src/lib/defer-load.ts
M	src/lib/lead-score.ts
A	src/lib/listing-options.ts
M	src/lib/media-validation.ts
A	src/lib/page-builder.ts
A	src/lib/pages-server.ts
M	src/lib/permissions.ts
M	src/lib/resources-server.ts
M	src/lib/resources.ts
M	src/lib/settings-types.ts
A	src/lib/url.ts
M	src/lib/utils.ts
M	tsconfig.json
A	wrangler.jsonc
```
