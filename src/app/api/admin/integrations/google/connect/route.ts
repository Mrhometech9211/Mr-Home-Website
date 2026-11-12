import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { googleAuthUrl, googleConfigured, googleRedirectUri } from "@/lib/google-drive";

export const GET = handle(async (req) => {
  await requireUser("media.write");
  if (!googleConfigured()) {
    return json(
      { error: "Google credentials are not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then restart the server." },
      { status: 503 },
    );
  }
  const state = randomUUID();
  const store = await cookies();
  store.set("mh_g_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return new Response(null, {
    status: 302,
    headers: { Location: googleAuthUrl(googleRedirectUri(req), state) },
  });
});
