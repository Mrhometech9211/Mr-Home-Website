import { ApiError, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/content";
import { generateOffer, getOfferOrThrow } from "@/lib/offers/service";
import { generateOfferSchema } from "@/lib/offers/schema";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 60;

export const POST = handle<Ctx>(async (req, ctx) => {
  const me = await requireUser("offers.write");
  const { id } = await ctx.params;
  const offerId = parseInt(id, 10);
  if (Number.isNaN(offerId)) throw new ApiError(400, "Invalid offer id");
  const body = generateOfferSchema.parse(await readJson(req));
  const offer = await getOfferOrThrow(offerId);
  const settings = await getSettings();
  const origin = new URL(req.url).origin;
  const result = await generateOffer(offer, { mode: body.mode, planKeys: body.planKeys, origin, settings }, me);
  return json({ data: result });
});
