import { ApiError, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { approveOffer, getOfferOrThrow } from "@/lib/offers/service";
import { approveOfferSchema } from "@/lib/offers/schema";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (req, ctx) => {
  const me = await requireUser("offers.approve");
  const { id } = await ctx.params;
  const offerId = parseInt(id, 10);
  if (Number.isNaN(offerId)) throw new ApiError(400, "Invalid offer id");
  const body = approveOfferSchema.parse(await readJson(req));
  const offer = await getOfferOrThrow(offerId);
  const result = await approveOffer(offer, body.batchId, me);
  return json({ data: result });
});
