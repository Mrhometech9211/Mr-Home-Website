import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { googleConfigured, googleRedirectUri, googleStatus } from "@/lib/google-drive";

export const GET = handle(async (req) => {
  await requireUser("media.read");
  const configured = googleConfigured();
  const status = configured ? await googleStatus() : { connected: false, email: null };
  return json({
    data: {
      configured,
      connected: status.connected,
      email: status.email,
      redirectUri: googleRedirectUri(req),
    },
  });
});
