"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Mail, Phone, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/admin/ui";

export type KanbanCard = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  budget: string | null;
  status: string;
  score: number;
  source: string | null;
  ip: string | null;
  marketName: string | null;
  projectName: string | null;
  createdAt: string;
};

const STAGES = [
  { key: "NEW", label: "New", accent: "bg-sky-500" },
  { key: "CONTACTED", label: "Contacted", accent: "bg-amber-500" },
  { key: "QUALIFIED", label: "Qualified", accent: "bg-violet-500" },
  { key: "CONVERTED", label: "Converted", accent: "bg-brand" },
  { key: "CLOSED_DEAL", label: "Closed Deal", accent: "bg-emerald-600" },
  { key: "LOST", label: "Lost", accent: "bg-slate-400" },
] as const;

function scoreColor(score: number) {
  if (score >= 70) return "bg-brand/15 text-brand";
  if (score >= 40) return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-500";
}

function declaredBudgetValue(budget: string | null): number {
  if (!budget) return 0;
  const match = budget.match(/[\d.]+/);
  if (!match) return 0;
  const n = parseFloat(match[0]);
  const b = budget.toLowerCase();
  if (b.includes("m")) return n * 1_000_000;
  if (b.includes("k")) return n * 1_000;
  return n;
}

function Card({ card, onDragStart, dragging }: { card: KanbanCard; onDragStart: () => void; dragging: boolean }) {
  return (
    <motion.article
      layout
      draggable
      onDragStart={onDragStart}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group relative cursor-grab select-none rounded-xl border border-ink/8 bg-white p-3 shadow-soft transition hover:shadow-card active:cursor-grabbing",
        dragging && "opacity-40",
      )}
      aria-label={`${card.name} — ${card.status}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-ink">{card.name}</p>
          <p className="truncate text-[12px] text-charcoal/70">{card.projectName ?? card.marketName ?? "No target"}</p>
        </div>
        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold", scoreColor(card.score))}>
          <Star className="h-3 w-3" aria-hidden /> {card.score}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-charcoal/60">
        {card.budget && <span className="rounded-md bg-ivory-deep px-1.5 py-0.5 font-medium">{card.budget}</span>}
        {card.city && <span className="rounded-md bg-ivory-deep px-1.5 py-0.5">{card.city}</span>}
        {card.source && <span className="rounded-md bg-ivory-deep px-1.5 py-0.5">{card.source}</span>}
        {card.ip && <span className="rounded-md bg-ivory-deep px-1.5 py-0.5 font-mono text-[10.5px]" title="Visitor IP address">{card.ip}</span>}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-ink/5 pt-2">
        <div className="flex items-center gap-1.5">
          {card.email && <a href={`mailto:${card.email}`} aria-label={`Email ${card.name}`} className="rounded-lg p-1.5 text-charcoal/60 hover:bg-brand/10 hover:text-brand"><Mail className="h-3.5 w-3.5" /></a>}
          {card.phone && <a href={`tel:${card.phone.replace(/[^+\d]/g, "")}`} aria-label={`Call ${card.name}`} className="rounded-lg p-1.5 text-charcoal/60 hover:bg-brand/10 hover:text-brand"><Phone className="h-3.5 w-3.5" /></a>}
        </div>
        <span className="text-[10.5px] text-mist">{new Date(card.createdAt).toLocaleDateString()}</span>
      </div>
    </motion.article>
  );
}

export function KanbanBoard({ cards, canWrite }: { cards: KanbanCard[]; canWrite: boolean; currentUserId: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState(cards);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dragIdRef = useRef<number | null>(null);

  const byStage = useMemo(() => {
    const map: Record<string, KanbanCard[]> = {};
    for (const s of STAGES) map[s.key] = [];
    for (const c of items) (map[c.status] ?? map.NEW).push(c);
    for (const s of STAGES) map[s.key].sort((a, b) => b.score - a.score);
    return map;
  }, [items]);

  async function moveTo(leadId: number, status: string) {
    const card = items.find((c) => c.id === leadId);
    if (!card || card.status === status) return;
    const prev = items;
    setItems((cur) => cur.map((c) => (c.id === leadId ? { ...c, status } : c)));
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update");
      }
      toast(`${card.name} moved to ${status}`, "success");
      start(() => router.refresh());
    } catch (e) {
      setItems(prev);
      toast(e instanceof Error ? e.message : "Failed to update lead", "error");
    }
  }

  return (
    <div className={cn("transition-opacity", pending && "opacity-70")}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Pipeline</h1>
          <p className="text-[13px] text-charcoal/70">Drag leads between stages — changes save instantly. Sorted by lead score.</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-[13px] font-medium"
            title="Closed Deal leads as a share of all active leads"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden />
            Conversion
            <b className="text-ink">
              {(() => {
                const closed = items.filter((c) => c.status === "CLOSED_DEAL").length;
                return `${closed}/${items.length}${items.length ? ` (${Math.round((closed / items.length) * 100)}%)` : ""}`;
              })()}
            </b>
          </span>
          <Link href="/admin/leads" className="inline-flex h-10 items-center rounded-full border border-ink/10 bg-white px-4 text-[13px] font-medium text-ink transition hover:border-brand">
            Table view
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6" role="list" aria-label="Lead pipeline stages">
        {STAGES.map((stage) => {
          const stageCards = byStage[stage.key];
          const total = stageCards.reduce((a, c) => a + declaredBudgetValue(c.budget), 0);
          return (
            <section
              key={stage.key}
              role="listitem"
              aria-label={stage.label}
              onDragOver={(e) => {
                if (!canWrite) return;
                e.preventDefault();
                setOverStage(stage.key);
              }}
              onDragLeave={() => setOverStage((s) => (s === stage.key ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOverStage(null);
                const id = dragIdRef.current;
                if (id && canWrite) void moveTo(id, stage.key);
                dragIdRef.current = null;
                setDragId(null);
              }}
              className={cn(
                "flex min-h-[220px] flex-col rounded-2xl border bg-ivory-deep/50 p-2.5 transition",
                overStage === stage.key ? "border-brand bg-brand/5 ring-2 ring-brand/20" : "border-ink/8",
              )}
            >
              <header className="mb-2 flex items-center gap-2 px-1">
                <span className={cn("h-2 w-2 rounded-full", stage.accent)} aria-hidden />
                <h2 className="text-[13px] font-semibold text-ink">{stage.label}</h2>
                <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-charcoal/70">{stageCards.length}</span>
              </header>
              <div className="flex flex-1 flex-col gap-2">
                {stageCards.map((c) => (
                  <Card key={c.id} card={c} dragging={dragId === c.id} onDragStart={() => { dragIdRef.current = c.id; setDragId(c.id); }} />
                ))}
                {stageCards.length === 0 && <p className="rounded-xl border border-dashed border-ink/10 p-4 text-center text-[12px] text-mist">Drop leads here</p>}
              </div>
              {total > 0 && <p className="mt-2 px-1 text-[11px] font-medium text-charcoal/60">≈ {Intl.NumberFormat("en", { notation: "compact" }).format(total)} declared</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
