import { handle, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { automationStats, runStaleLeadArchive } from "@/lib/automations";

/** Admin → Settings → Automation: live backlog counts + a manual maintenance run. */
export const GET = handle(async () => {
  await requireUser("leads.write");
  const stats = await automationStats();
  return json({ data: stats });
});

export const POST = handle(async () => {
  await requireUser("leads.write");
  const result = await runStaleLeadArchive();
  return json({
    data: result,
    message: result.archived
      ? `${result.archived} stale lead(s) archived`
      : result.days
        ? "Nothing to archive — the backlog is clean"
        : "Stale archiving is off in Settings → Automation",
  });
});
