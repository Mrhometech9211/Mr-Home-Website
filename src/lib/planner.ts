import { z } from "zod";

export const plannerKinds = ["task", "meeting"] as const;
export type PlannerKind = (typeof plannerKinds)[number];

export const plannerInputSchema = z.object({
  title: z.string().trim().min(1).max(180),
  kind: z.enum(plannerKinds).default("task"),
  notes: z.string().trim().max(2000).optional().default(""),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  reminderAt: z.string().datetime({ offset: true }).nullable().optional(),
  alarmEnabled: z.boolean().default(false),
  sound: z.enum(["chime", "pulse", "bell"]).default("chime"),
  done: z.boolean().default(false),
}).superRefine((item, ctx) => {
  const start = new Date(item.startsAt).getTime();
  if (item.endsAt && new Date(item.endsAt).getTime() < start) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End time must be after the start time." });
  }
  if (item.reminderAt && new Date(item.reminderAt).getTime() > start) {
    ctx.addIssue({ code: "custom", path: ["reminderAt"], message: "Reminder must be at or before the scheduled start." });
  }
});

export type PlannerInput = z.infer<typeof plannerInputSchema>;
export type PlannerItem = PlannerInput & {
  id: number;
  ownerId: number;
  createdAt: string;
  updatedAt: string;
};
