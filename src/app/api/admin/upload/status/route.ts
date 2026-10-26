import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { probeR2, r2Diagnostics, r2IsConfigured, r2PublicUrlBase } from "@/lib/r2";

/**
 * Configuration probe for the admin upload UI. Returns booleans, env NAMES and
 * validation outcomes only — never account ids, endpoints, bucket names, keys
 * or presigned URLs.
 *
 * `?probe=1` additionally performs a server-side HeadBucket. If that succeeds
 * but the browser's PUT still fails, the bucket's CORS policy is the blocker;
 * if it fails, the endpoint/credentials are.
 */
export const GET = handle(async (req) => {
  await requireUser("media.read");
  const r2 = r2IsConfigured();
  const diag = r2Diagnostics();
  const wantsProbe = new URL(req.url).searchParams.get("probe") === "1";
  return json({
    data: {
      r2,
      mode: r2 ? "r2" : "legacy-db",
      publicDelivery: !!r2PublicUrlBase(),
      note: r2
        ? "Uploads transfer directly to R2 with presigned URLs (bypass the Vercel 4.5 MB body limit)."
        : "R2 is not configured — uploads fall back to the legacy database path (files over ~4 MB will fail with 413 on Vercel).",
      problems: diag.problems,
      warnings: diag.warnings,
      ...(wantsProbe ? { probe: await probeR2() } : {}),
    },
  });
});
