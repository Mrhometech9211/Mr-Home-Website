import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { disconnectGoogle } from "@/lib/google-drive";

export const POST = handle(async () => {
  await requireUser("media.write");
  await disconnectGoogle();
  return json({ ok: true });
});
