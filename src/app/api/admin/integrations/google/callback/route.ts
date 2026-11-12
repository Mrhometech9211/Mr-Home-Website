import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { exchangeGoogleCode, googleRedirectUri } from "@/lib/google-drive";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (status: string) => new Response(null, { status: 302, headers: { Location: `/admin/media?drive=${status}` } });

  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 302, headers: { Location: "/admin/login" } });

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expected = store.get("mh_g_state")?.value;

  if (!code || !state || !expected || state !== expected) return back("error");
  store.delete("mh_g_state");

  try {
    await exchangeGoogleCode(code, googleRedirectUri(req));
    return back("connected");
  } catch {
    return back("error");
  }
}
