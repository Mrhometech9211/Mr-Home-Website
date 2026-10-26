# Local integration checks

These scripts exercise the upload/download pipeline against a **mock** S3
endpoint and the local PGlite database. They never contact production, but some
of them create and then delete disposable rows/leads in the local database.

## Prerequisites

1. Mock R2 (listens on 127.0.0.1:9876, stores objects in `./tmp-mr2`):

   ```bash
   node tests/integration/mock-r2.mjs
   ```

2. Local QA admin (run while the dev server is stopped, or restart the server
   afterwards so it sees the row):

   ```bash
   node tests/integration/qa-dev-user.mjs qa@mrhome.dev 'QaAdmin#2026x'
   ```

3. Dev server with the R2 variables pointed at the mock:

   ```bash
   R2_ACCOUNT_ID=mock R2_ACCESS_KEY_ID=mockkey R2_SECRET_ACCESS_KEY=mocksecret \
   R2_BUCKET_NAME=qa-bucket R2_ENDPOINT=http://127.0.0.1:9876 \
   npx next dev -p 3344
   ```

`QA_BASE` defaults to `http://localhost:3344`; override it for another port.

## Scripts

| Script | Covers |
| --- | --- |
| `qa-settings-save.mjs` | Admin settings payloads: full save, List Your Property toggle, restore (the `contactFields.0` regression). |
| `qa-r2-flow.mjs` | 6 MB init → presigned PUT → completion → DB metadata → gated 302 download; 401/400 rejection; missing-brochure 404. |
| `qa-brochure-replace.mjs` | Replace flow keeps one live row, moves to the new object, serves the new bytes. |
| `qa-media-r2.mjs` | Pending media is not publicly served or listed; SVG active content is rejected at finalize. |

The settings schema regression also runs without any server:

```bash
npm test
```
