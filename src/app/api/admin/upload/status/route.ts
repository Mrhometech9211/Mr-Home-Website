import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { r2IsConfigured, r2PublicUrlBase } from "@/lib/r2";

/**
 * Configuration probe for the admin upload UI. Returns booleans only —
 * never account ids, endpoints, keys or bucket names in full.
 */
export const GET = handle(async () => {
  await requireUser("media.read");
  const r2 = r2IsConfigured();
  return json({
    data: {
      r2,
      mode: r2 ? "r2" : "legacy-db",
      publicDelivery: !!r2PublicUrlBase(),
      note: r2
        ? "Uploads transfer directly to R2 with presigned URLs (bypass the Vercel 4.5 MB body limit)."
        : "R2 is not configured — uploads fall back to the legacy database path (files over ~4 MB will fail with 413 on Vercel).",
    },
  });
});
