import { requireUser } from "@/lib/auth";
import { handle, json } from "@/lib/api";
import { listBuiltinPageStatus } from "@/lib/site-pages";

/** Built-in pages and their draft/publish status. */
export const GET = handle(async () => {
  await requireUser("content.read");
  return json({ data: await listBuiltinPageStatus() });
});
