import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ApiError, handle } from "@/lib/api";

export const GET = handle(async (req) => {
  await requireUser("pages.read");
  const url = new URL(req.url);
  const pageId = url.searchParams.get("pageId");
  if (!pageId || !/^\d+$/.test(pageId)) {
    throw new ApiError(400, "Invalid pageId");
  }
  const previewUrl = new URL(`/preview/pages/${pageId}`, url.origin);
  return NextResponse.redirect(previewUrl);
});
