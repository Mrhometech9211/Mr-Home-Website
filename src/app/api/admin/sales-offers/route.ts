import { handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createOffer, listOffers } from "@/lib/offers/service";
import { createOfferSchema } from "@/lib/offers/schema";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  await requireUser("offers.read");
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const data = await listOffers({ status: status || undefined, q: q || undefined });
  return json({ data });
});

export const POST = handle(async (req) => {
  const me = await requireUser("offers.write");
  const body = createOfferSchema.parse(await readJson(req));
  const row = await createOffer(
    {
      ...body,
      options: body.options
        ? {
            assets: body.options.assets,
            design: body.options.design,
          }
        : undefined,
    },
    me,
  );
  return json({ data: row }, { status: 201 });
});
