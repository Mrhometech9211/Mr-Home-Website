import { ApiError, handle, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getOfferOrThrow, reviseOffer, setOfferArchived } from "@/lib/offers/service";
import { offerActionSchema } from "@/lib/offers/schema";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (req, ctx) => {
  const me = await requireUser("offers.write");
  const { id } = await ctx.params;
  const offerId = parseInt(id, 10);
  if (Number.isNaN(offerId)) throw new ApiError(400, "Invalid offer id");
  const body = offerActionSchema.parse(await readJson(req));
  const offer = await getOfferOrThrow(offerId);
  if (body.action === "revise") {
    const revised = await reviseOffer(offer, me);
    return json({ data: revised }, { status: 201 });
  }
  const updated = await setOfferArchived(offer, body.action === "archive", me);
  return json({ data: updated });
});
