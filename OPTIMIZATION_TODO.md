# Vercel CPU optimization

## Completed

- [x] Batch 1: stop continuous admin polling and redundant session checks
- [x] Batch 2: reduce proxy matcher and preserve security headers in `next.config.ts`
- [x] Batch 3: add safe public cache headers, sitemap/manifest caching, image TTL
- [x] Batch 4: enable runtime ISR for news, legal/custom pages and properties
- [x] Batch 5: add publish-time cache invalidation for admin mutations
- [x] Batch 6: optimize planner/notification server work and R2 media delivery
- [x] Batch 7: convert request-independent marketing pages to static ISR
- [x] Batch 8: move built-in draft previews to a private route so public pages read published-only content
- [x] Batch 9: guard production builds against migrations/seeding and verify the full build/runtime path

## Final verification — 2026-11-17

- `npm run typecheck` — exit 0.
- `npm test` — 57/57 passed.
- `npm run test:render` — 3/3 passed.
- `npx eslint src tests next.config.ts` — 0 errors, 12 pre-existing warnings.
- `npm run build` — exit 0.
  - `/` and `/markets`: prerendered, `revalidate=300`.
  - `/why-mr-home` and `/list-your-property`: prerendered, `revalidate=3600`.
  - `/[slug]`: 3600; `/news/[slug]`, `/properties/[slug]`, `/projects/[slug]`, `/markets/[slug]`, `/markets/[slug]/[city]`: 300.
  - `/buy`, `/rent`, `/projects`, `/news`, `/contact`: dynamic because URL filters use `searchParams`.
  - `/preview/site/[key]`: dynamic, private, no-store.
- Isolated production server (throwaway PGlite store):
  - `/`, `/markets`, `/why-mr-home`, `/list-your-property`: `s-maxage` 300/3600 with `x-nextjs-cache: HIT`.
  - `/markets/[slug]` and `/projects/[slug]`: first request `MISS`, second `HIT`, `s-maxage=300`.
  - `/buy`, `/projects`, `/news`, `/contact`: `private, no-cache, no-store`.
  - `/api/media/[id]`: 60 s on DB, R2-buffered and redirect paths.
  - `/robots.txt` 86400; `/sitemap.xml` 3600; manifest 86400.
  - Published draft to static `/`: public HTML updated immediately (`MISS`), then restored.
  - Draft isolation: a draft title appeared only at `/preview/site/home`, never in the public `/` HTML.
  - Admin setup/login: 200; `/admin`: 200 with a session, 307 without; admin API 401 without a session.
  - Lead form POST: 201; cross-origin POST: 403.
  - Media upload/serve: 201 then 200 with `image/png` and 60 s cache.
  - Canonicals resolve to `https://www.mrhomerealestate.com/...`; sitemap has 69 URLs and excludes admin/preview/API.
- R2 presign proof against installed `@aws-sdk/client-s3` 3.1156.0: the default client signs `x-amz-checksum-crc32` on empty-body `PutObject`/`UploadPart`; the configured client removes it from both.

## CPU expectation

- Public marketing pages and detail pages no longer invoke a function for every request; Vercel can serve them from the ISR cache.
- Filter pages (`/buy`, `/rent`, `/projects`, `/news`, `/contact`) remain dynamic by design; converting them requires a client-side filter refactor and was deliberately deferred to avoid feature risk.
- No Vercel Observability/API access was available, so there is no measured Fluid CPU baseline or numeric percentage claim.

## Deferred / unverified

- `R2_PUBLIC_URL` is inactive in Production; live media currently returns buffered 200s instead of 302 redirects. Real browser large-upload and CORS-preflight tests need R2 credentials, which are not present locally. The presign checksum fix is code- and SDK-verified, not live-storage-verified.
- No production admin credentials are available, so the live signed-in admin flow cannot be exercised. The full setup/login/preview flow was verified against the isolated database.
- Build-time database access is read-only: `ensureSchema` and `runSeed` are skipped when `NEXT_PHASE=phase-production-build` and `DATABASE_URL` is set.
