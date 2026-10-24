# MR.HOME — Database and deployment readiness

- **Checked:** 2026-10-25
- **Production:** `https://www.mrhomerealestate.com/` (Vercel)
- **Production commit:** `346aac2`
- **Local HEAD:** `cc4e5ec` (two commits ahead, zero behind `origin/main`)
- **Remote:** `https://github.com/Mrhometech9211/Mr-Home-Website.git`
- **Verdict:** **NOT READY** — see [Blockers](#10-blockers-and-required-setup)
- **Nothing was committed, pushed, deployed, migrated, backed up, or changed in production.**

The earlier report [PRE_DEPLOY_AUDIT.md](PRE_DEPLOY_AUDIT.md) covers the code/SEO audit and the file inventory. This report covers the database runner, migration behaviour, staging status, backup/restore, and the Vercel deployment path.

## 1. Runtime path

`src/db/index.ts`:

```text
initDb()
  -> createDatabase()                       // pg Pool when DATABASE_URL is set, PGlite otherwise
  -> ensureSchema(db)                       // reads every drizzle/*.sql, sorted by filename
       -> split on "--> statement-breakpoint"
       -> statementAlreadyApplied()         // catalog check for CREATE TABLE/INDEX, ADD COLUMN, ADD CONSTRAINT
       -> exec.execute(sql.raw(statement))   // one statement at a time
       -> catch: ignore only messages containing "already exists"
  -> runSeed()                              // inserts demo data only when site_settings is empty
```

`src/db/seed.ts`:

- `runSeed()` returns `false` when `site_settings` already has row `id = 1`; it does not touch existing content.
- `ensureSeeded()` calls `initDb()`, then `runSeed()`, then (when not freshly seeded) `ensureCitiesSeeded()` and `ensureNavItemsSeeded()`.
- Public content (`getSettings`, `getNavigation`, `getPublishedMarkets`, page queries) calls `ensureSeeded()`.
- The root layout calls `getSettings()` on every route.

There is **no migration ledger, no down migration, no global transaction, and no advisory lock**. The `drizzle/meta/_journal.json` is incomplete (it does not list 0004, 0005, 0006); the runtime ignores the journal and reads every SQL file in filename order. Do **not** run `drizzle-kit migrate` as a substitute — it would skip those files.

### Exact execution order

| # | File | What it does |
|---|---|---|
| 1 | `0000_black_prodigy.sql` | Baseline tables (`leads`, `markets`, `projects`, `users`, …), indexes and FKs |
| 2 | `0001_third_rawhide_kid.sql` | Creates `cities`; adds `leads.city`; cities indexes |
| 3 | `0002_bizarre_omega_red.sql` | Adds `leads.score` (`integer NOT NULL DEFAULT 0`) |
| 4 | `0003_smiling_talisman.sql` | Creates `brochures`, `custom_roles`, `news_articles`, `page_revisions`, `pages`, `properties`; adds `users.custom_role_id`; FKs and indexes |
| 5 | `0004_leads_details.sql` | Adds `leads.details` (`jsonb`, nullable) |
| 6 | `0005_leads_email_nullable.sql` | `ALTER TABLE leads ALTER COLUMN email DROP NOT NULL` |
| 7 | `0006_pages_parent.sql` | Adds `pages.parent_id`; FK |
| 8 | `0006_properties_completion.sql` | Adds `properties.completion`; backfills nulls from `availability` |
| 9 | `0007_projects_purpose_area.sql` | Adds `projects.purpose` (default `sale`), `area_value`, `area_unit`; purpose index |

No `DROP TABLE`, `TRUNCATE`, or `DELETE` appears in any file. All new columns are nullable or have defaults, so existing rows are preserved.

## 2. Repeat-run behaviour (tested on PGlite, not PostgreSQL)

A fresh in-memory PGlite database was initialised with `ensureSchema()` twice:

| Run | Time | Result |
|---|---:|---|
| First | 3,736 ms | Full schema created |
| Second | 210 ms | No error; catalog checks skipped most statements |

Resulting schema facts:

- 26 public tables, including all new tables.
- `leads.email.is_nullable = YES`.
- `projects.purpose` default `'sale'::text`, `is_nullable = NO`.
- `properties.completion` exists, nullable.

This proves the idempotency logic works on repeat for the guarded statements in a single-process embedded engine. It does **not** prove PostgreSQL lock behaviour, DDL privileges, timeout behaviour, or concurrent cold starts.

### Repeat-run gaps found in the runner

`statementAlreadyApplied()` matches only statements that **start** with the DDL keyword. `splitStatements()` does not strip leading SQL comments, so comment-prefixed statements are executed on every run and rely on the `"already exists"` error fallback:

- `0006_properties_completion.sql` statement 1 begins with `-- Phase 8: …`, so the `ALTER TABLE … ADD COLUMN completion` is retried every run; PostgreSQL returns “column already exists”, which the catch ignores.
- `0006_properties_completion.sql` statement 2 begins with `-- Backfill …`, so the `UPDATE properties SET completion = … WHERE completion IS NULL` is **always executed**. On a large table that is a full scan on every new server process; it will also classify any future `completion IS NULL` row on the next process start.
- `0007_projects_purpose_area.sql` statements 1 and 2 begin with comments, so the two `ADD COLUMN` statements are retried every run and rely on the same error fallback.
- `0005_leads_email_nullable.sql` is a plain `ALTER TABLE … DROP NOT NULL`. It is **not guarded** and executes on every cold start. It takes an `ACCESS EXCLUSIVE` lock on `leads` briefly and waits behind any long-running transaction; reads and writes queue behind it.
- `0000`–`0004` are guarded normally (no leading comments on the statements that matter).

The fallback matches English `"already exists"` text. A database with a non-English `lc_messages`, or a different error (permission denied, lock timeout), will throw and leave the request failing. A proper migration ledger or a version marker would remove this dependence; that is not implemented.

## 3. Concurrent first-request and half-applied behaviour

- Vercel may start several function instances concurrently. Each process has its own `globalForDb.__mrhDbPromise`, so each runs `ensureSchema()`.
- There is no advisory lock or `IF NOT EXISTS` on `0005`; two instances can both try the same DDL. One waits on the other, then gets “already exists” and continues. A lock wait longer than the function timeout aborts that instance.
- `0005` and the `0006` backfill are the highest-risk concurrent statements because they are always executed and touch existing tables.
- Each statement is its own transaction. A failure inside a multi-statement file leaves earlier statements committed. The catch does not roll them back.
- `initDb()` clears its cached promise on failure, so a later request retries from the beginning. Catalog guards skip objects that already exist and retry the missing ones.
- Partial failure therefore leaves an additive, partially migrated schema; the old production code ignores the new columns/tables, so it can usually continue serving. The new deployment cannot start until the missing statement succeeds.
- If a table already exists with the wrong shape, `CREATE TABLE` is skipped and its missing columns are never added. Schema drift is not detected.
- `CREATE INDEX` is non-concurrent. It locks writes on the table for the duration; acceptable for small tables, risky for large `leads`/`projects` tables.
- `0006` backfill runs under a normal `UPDATE` lock; on a large `properties` table it can hold row locks and consume time on every process start.

## 4. Specific consequences of the requested changes

### `leads.email` nullable

- Existing rows keep their values; no rewrite, no data loss.
- The public lead API still requires an email. The brochure-download route (new code) deliberately inserts `email: null`; until `0005` applies, that insert fails with a not-null violation.
- The `leads_email_idx` index allows multiple nulls.
- Admin UI consequence: `src/components/admin/LeadDetail.tsx` renders `mailto:${lead.email}` and “Lead #id · {lead.email}”. For a phone-only brochure lead this becomes `mailto:null` and a visible “null” in the header. Cosmetic, not a database blocker, but it should be guarded before or shortly after deploy.
- Rolling back to `NOT NULL` later requires deciding what to do with null email rows; the old schema cannot simply be restored without data cleanup.

### `projects.purpose = 'sale'`

- Every existing project receives `sale` at `ALTER TABLE … ADD COLUMN … DEFAULT 'sale' NOT NULL`; no backfill query is needed.
- `purpose` is plain `text` with no check constraint. An invalid value is accepted and the project disappears from both `/buy` and `/rent` filters.
- All existing projects therefore appear under `/buy`; `/rent` stays empty until an admin edits projects and tags them `rent`. This is a content decision, not a schema failure.
- Existing `area` text is preserved; `area_value`/`area_unit` stay null for old rows until edited.

### Navigation rows

`ensureNavItemsSeeded()` inserts only these rows, and only when the `location:href` pair is missing:

- header: `/buy` (order 2), `/rent` (3), `/news` (6)
- footer: `/buy` (6), `/rent` (7), `/news` (8), `/list-your-property` (9)

When anything is inserted, it renumbers the header rows for `/`, `/buy`, `/rent`, `/projects`, `/markets`, `/news`, `/why-mr-home`, `/contact` to 1–8. It does **not** insert Home/Projects/Markets/Why/Contact (it assumes the original seed already has them), does not delete or update labels, and does not renumber footer items other than inserting the new orders. Custom nav items can collide on order values. No content is lost.

Because `getSettings()` calls `ensureSeeded()`, this forward-seed can also run during the Vercel **build** (see §7), not only on the first request.

### `properties.completion` backfill

```sql
SET completion = CASE
  WHEN availability ILIKE '%handover%'
    OR availability ILIKE '%2026%'
    OR availability ILIKE '%2027%'
    OR availability ILIKE '%moving in%'
  THEN 'offplan'
  ELSE 'ready'
END
WHERE completion IS NULL;
```

- It only fills nulls; explicitly set values are not overwritten.
- It ignores off-plan years 2028 and later, and it classifies any availability string containing `2026`/`2027` as off-plan. A value such as **“Ready – Q1 2026”** becomes `offplan` because the year test runs before any “ready” wording is considered. Review production `availability` values before accepting the result.
- Because the UPDATE is always re-executed, any future property created with `completion = null` will be silently classified on the next server process start.
- `completion` remains nullable; the admin/public filter should treat null explicitly.

## 5. Staging status

**No staging database is configured.**

- No `STAGING_DATABASE_URL`, `STAGING_PG*`, or equivalent is present in the environment.
- Vercel environment variables (names only):
  - `DATABASE_URL` — **Production only**
  - `NEXT_PUBLIC_SITE_URL` — **Production only**
  - `ADMIN_SETUP_TOKEN` — **Production only**
- There is no `DATABASE_URL` for Preview or Development. Preview deployments fall back to embedded PGlite, so a Vercel Preview is **not** a PostgreSQL staging test.
- Vercel → Storage shows **no connected database**; production uses an externally supplied PostgreSQL URL. The provider and database host were not read, and no production credentials were used.
- No PostgreSQL client/server tooling is installed locally: `psql`, `pg_dump`, `pg_restore`, `postgres`, `initdb`, `pg_ctl`, `docker`, and `podman` are all absent. The only local engine is the 80 MB `.pglite-data` directory used by the app’s dev fallback.

Therefore the production schema could not be verified safely, and the migrations could not be tested against a real PostgreSQL clone. **Do not treat PGlite results as a staging pass.**

## 6. Backup and restore procedure (documented, not tested)

The following is the required procedure. It was **not executed**: no PostgreSQL tools, no staging URL, and no approval to touch production.

### Before any migration

1. Record the current commit, deployment ID, and database size.
2. Take a provider snapshot (Neon/Supabase/RDS/other) and confirm it is restorable in the provider console.
3. Take a logical backup with a **read-only** role:
   ```bash
   pg_dump "$PROD_DATABASE_URL" \
     --format=custom --no-owner --no-privileges \
     --file="prod-$(date +%Y%m%d-%H%M).dump"
   ```
   Keep the dump outside the repository and never commit it.
4. Take a schema-only dump for comparison:
   ```bash
   pg_dump "$PROD_DATABASE_URL" --schema-only --no-owner --no-privileges \
     --file="prod-schema-$(date +%Y%m%d-%H%M).sql"
   ```

### Restore drill (staging only)

1. Create an **empty, separate** staging database owned by a role with DDL rights.
2. Restore the logical dump:
   ```bash
   pg_restore --dbname "$STAGING_DATABASE_URL" \
     --no-owner --no-privileges --clean --if-exists \
     "prod-YYYYMMDD-HHMM.dump"
   ```
   `--clean` is destructive to the target. Never point it at production.
3. Verify row counts for `site_settings`, `users`, `leads`, `projects`, `properties`, `markets`, `pages`, `navigation_items`.
4. Point a **staging** app at `STAGING_DATABASE_URL`, run the new code, and exercise admin login, lead create, project create/edit, `/buy`, `/rent`, property detail, brochure download, pages, sitemap, robots.
5. Restore the same dump into a second empty database to prove the restore path is repeatable.
6. Only after this passes should a production snapshot + pre-migration be considered.

### Rollback limits

- Code rollback leaves additive tables/columns in place; those are safe for the old code.
- `leads.email` cannot go back to `NOT NULL` if phone-only brochure leads exist. The rows must be cleaned or given addresses first.
- `properties.completion`, `projects.purpose`, `navigation_items` inserts and the backfill are data changes; the snapshot/dump is the only reliable undo.
- There are no down migrations. A production restore is the last resort and loses writes made after the backup.

## 7. Vercel findings

| Item | Verified state |
|---|---|
| Git repository | `Mrhometech9211/Mr-Home-Website` |
| Production branch | `main` |
| Last production deployment | commit `346aac2` |
| Auto deployment | Ignored Build Step is **Automatic**; a push to `main` builds and deploys |
| Framework preset | Next.js |
| Root directory | empty (repository root) |
| Install command | automatic |
| Build command | `next build` |
| Node.js version | 24.x selected; local build ran on Node 24.20 and passed (Next requires ≥20.9) |
| Domains | `www.mrhomerealestate.com` (primary) and apex redirect |
| Env names / targets | `DATABASE_URL` Production only; `NEXT_PUBLIC_SITE_URL` Production only; `ADMIN_SETUP_TOKEN` Production only |
| Database target | external PostgreSQL via `DATABASE_URL`; no Vercel-managed Storage database connected; provider/host not inspected |

### Critical: the Vercel build can migrate production before deployment

The build output contains prerendered `/_not-found` and `/robots.txt`. Both render through the root layout / `robots()` and call `getSettings()` → `initDb()` → `ensureSchema()` → `runSeed()` / `ensureSeeded()`.

- `.next/prerender-manifest.json` lists `/_not-found`, `/_global-error`, and `/robots.txt`.
- `.next/server/app/_not-found.html` exists and contains the settings-derived title `Page not found | MR.HOME`.
- `src/app/layout.tsx` calls `getSettings()` in both `generateMetadata()` and the layout body.
- `src/app/robots.ts` is `force-static` and calls `getSettings()`.

Because `DATABASE_URL` is a **Production** variable, it is available to the production build. A push to `main` therefore makes `next build` connect to the production database and attempt the migrations, seed and navigation inserts **before** the new deployment is promoted. This contradicts the requirement not to migrate production during this inspection and is the main reason the branch is not ready to push.

Next's build can render multiple static pages in parallel workers, which makes concurrent `ensureSchema()` calls possible. There is no lock.

Possible fixes (none applied, because this phase is checks only):

1. Add a build-phase guard to `initDb()` so it never connects or migrates when `NEXT_PHASE === "phase-production-build"` (return static/default settings instead), and make the root metadata independent of the database at build time. This is the cleanest.
2. Pre-apply migrations with a controlled script, then add an explicit `MRH_SKIP_DB_BOOTSTRAP=1`-style flag that both runtime and build honour. This still needs the build metadata to have a fallback.
3. Make `/_not-found` and `/robots.txt` dynamic so they do not run at build. Global `not-found` cannot simply declare `dynamic`; forcing dynamic in the root layout would affect every route. A targeted build guard is safer.

Do not rely on unsetting `DATABASE_URL` only for the build: the PGlite fallback would create and potentially bundle a local `.pglite-data` store, and it would not test the real schema.

## 8. DDL privileges required

The production role must be able to:

- `CREATE` in schema `public` (new tables, sequences, indexes)
- `ALTER` and own `users`, `leads`, `pages`, `properties`, `projects` (PostgreSQL requires table ownership for `ALTER TABLE`; a mere `ALTER` grant is not enough)
- `REFERENCES` on `projects`, `users`, `markets`, `pages`, `custom_roles` for the new FKs
- `CREATE` on the database/schema for sequences used by the new `serial` columns

Whether the current role has these rights is **unverified**. If it does not, the build/first request will fail at the first DDL statement; because earlier statements may already be committed, the result is a partially migrated schema and a failing deployment.

## 9. Checks performed

| Check | Result |
|---|---|
| Read `PRE_DEPLOY_AUDIT.md` and all nine SQL files | Done |
| Inspect runtime runner and seed paths | Done |
| Fresh PGlite: `ensureSchema` twice | Pass, no error; 3,736 ms then 210 ms |
| PGlite schema facts (`leads.email`, `projects.purpose`, `properties.completion`) | As expected |
| Real PostgreSQL repeat/concurrency/privilege test | **Not possible** — no staging, no PostgreSQL binaries |
| Production schema inspection | **Not performed** — no safe read-only access |
| Production backup/restore drill | **Not performed** — no approval, tools absent |
| Vercel Git/branch/Node/build settings | Verified |
| Vercel env names/targets | Verified; values not read |
| Vercel database target | External; provider not verified |
| Build-time DB access analysis | **Blocker found** |
| Commit / push / deploy / migration | None |

## 10. Blockers and required setup

1. **No staging PostgreSQL.** Provide an isolated `STAGING_DATABASE_URL` (a separate database, not production, with its own credentials) and either install `psql`/`pg_dump`/`pg_restore` or provide a provider console. Then clone the production schema and representative synthetic data and run the nine files twice.
2. **Production schema and DDL ownership unknown.** Provide a read-only role/schema dump or written confirmation that the production role owns the affected tables. Do not send the password in chat; place it in the project env file or ask the provider to confirm ownership.
3. **Build-time migration is unguarded.** Before any push to `main`, add a build-phase guard (or an equivalent) so `next build` cannot call `ensureSchema`/`ensureSeeded` against production. This is a code change and needs approval.
4. **Repeat-run loopholes.** `0005` runs on every cold start; the `0006` backfill runs on every cold start; comment-prefixed `ADD COLUMN`s rely on error text. Add a migration ledger/version marker or make these statements explicitly conditional before deploying.
5. **Backup/restore is documented but untested.** Take a provider snapshot and a logical dump, restore it to staging, and prove the drill. Do not create or restore a production backup without approval.
6. **Completion backfill can misclassify “Ready 2026”.** Review or correct the `availability` strings before accepting the backfill, and decide how null completion should behave in filters.
7. **Rent listing content.** All existing projects become `sale`; `/rent` will be empty until projects are manually tagged. Decide whether that is acceptable for launch.
8. **Minor admin issue.** Phone-only brochure leads render `mailto:null` and “null” in `LeadDetail`; guard the email action.

## 11. Verdict

**NOT READY.**

The code builds and the embedded-engine repeat test passes, but the production database path has not been exercised on PostgreSQL, the production schema/privileges are unverified, there is no backup/restore drill, and a normal Vercel build would run migrations and seed/navigation writes against production before deployment. Pushing `cc4e5ec` to `main` now would not be a safe, controlled migration.

The branch, commits, working tree and untracked files remain exactly as they were: HEAD `cc4e5ec`, `origin/main` `346aac2`, two commits ahead, zero behind, 18 untracked entries preserved. No commit, push, deploy, migration, backup, or production change was made.
