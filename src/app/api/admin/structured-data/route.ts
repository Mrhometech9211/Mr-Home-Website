import { ApiError, handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import {
  buildBuiltinPagePreview,
  buildCityPreview,
  buildCustomPagePreview,
  buildMarketPreview,
  buildProjectPreview,
  buildSitePreview,
} from "@/lib/structured-data-preview";

export const dynamic = "force-dynamic";

function parseId(value: string | null): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, "A valid id is required");
  return id;
}

export const GET = handle(async (req) => {
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind");

  if (kind === "site") {
    await requireUser("settings.read");
    return json({ data: await buildSitePreview() });
  }
  if (kind === "project") {
    await requireUser("projects.read");
    return json({ data: await buildProjectPreview(parseId(searchParams.get("id"))) });
  }
  if (kind === "market") {
    await requireUser("markets.read");
    return json({ data: await buildMarketPreview(parseId(searchParams.get("id"))) });
  }
  if (kind === "city") {
    await requireUser("markets.read");
    return json({ data: await buildCityPreview(parseId(searchParams.get("id"))) });
  }
  if (kind === "builtin-page") {
    await requireUser("content.read");
    const key = searchParams.get("key");
    if (!key) throw new ApiError(400, "A page key is required");
    return json({ data: await buildBuiltinPagePreview(key) });
  }
  if (kind === "page") {
    await requireUser("pages.read");
    return json({ data: await buildCustomPagePreview(parseId(searchParams.get("id"))) });
  }
  throw new ApiError(400, "Unsupported preview kind");
});
