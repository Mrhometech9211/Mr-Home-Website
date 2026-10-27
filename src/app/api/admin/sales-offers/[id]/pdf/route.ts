import { handle, json } from "@/lib/api";
import { getIp } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getOfferOrThrow, getVersionFile } from "@/lib/offers/service";
import { presignGet } from "@/lib/r2";

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

/** Authenticated download. R2 objects are served through a short-lived signed URL. */
export const GET = handle<Ctx>(async (req, ctx) => {
  const me = await requireUser("offers.read");
  const { id } = await ctx.params;
  const offerId = parseInt(id, 10);
  if (Number.isNaN(offerId)) return json({ error: "Invalid offer id" }, { status: 400 });
  const offer = await getOfferOrThrow(offerId);
  const url = new URL(req.url);
  const versionId = url.searchParams.get("version");
  const version = await getVersionFile(offerId, versionId ? parseInt(versionId, 10) : undefined);
  if (!version) return json({ error: "No generated PDF exists for this offer yet." }, { status: 404 });

  const download = url.searchParams.get("inline") !== "1";
  await audit({
    user: me,
    action: "sales_offer.downloaded",
    entity: "sales_offers",
    entityId: offer.id,
    metadata: { version: version.version, batchId: version.batchId, inline: !download },
    ip: getIp(req),
  });

  const filename = version.pdfFilename || `${offer.reference}.pdf`;
  const headers = new Headers({
    "Content-Type": version.pdfMime || "application/pdf",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename.replace(/[^\w.-]+/g, "_")}"`,
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
  });

  if (version.pdfStorageKey) {
    try {
      const signed = await presignGet(version.pdfStorageKey, { filename, expiresSeconds: 120, inline: !download, contentType: "application/pdf" });
      return new Response(null, { status: 302, headers: { ...Object.fromEntries(headers), Location: signed } });
    } catch {
      // Fall through to a server-streamed copy when signing is unavailable.
    }
  }
  if (!version.pdfData) return json({ error: "The generated file is no longer available." }, { status: 410 });
  return new Response(new Uint8Array(version.pdfData), { status: 200, headers });
});
