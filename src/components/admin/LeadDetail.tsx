"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Mail, MessageCircle, Phone, Archive, ArchiveRestore, CheckSquare, Square, Trash2, Pencil, FileText } from "lucide-react";
import { LEAD_STATUSES } from "@/lib/resources";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { formatDateTime } from "@/lib/utils";
import { api, Badge, Btn, Confirm, inputCls, labelCls, Modal, statusTone, useToast } from "./ui";
import { ResourceForm } from "./ResourceForm";

type Lead = Record<string, unknown> & { id: number; name: string; email: string; status: string; archived: boolean };
type Note = { id: number; content: string; userName: string | null; createdAt: string };
type Task = { id: number; title: string; dueAt: string | null; done: boolean };
type Activity = { id: number; type: string; description: string; userName: string | null; createdAt: string };

export function LeadDetail({ id, canWrite, canCreateOffer = false, whatsappTemplate, users }: { id: number; canWrite: boolean; canCreateOffer?: boolean; whatsappTemplate: string; users: { id: number; name: string }[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [lead, setLead] = useState<Lead | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [acts, setActs] = useState<Activity[]>([]);
  const [note, setNote] = useState("");
  const [task, setTask] = useState({ title: "", dueAt: "" });
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, a] = await Promise.all([api<{ data: Lead }>(`/api/admin/leads/${id}`), api<{ notes: Note[]; tasks: Task[]; activities: Activity[] }>(`/api/admin/lead-actions/${id}`)]);
      setLead(l.data); setNotes(a.notes); setTasks(a.tasks); setActs(a.activities);
    } catch (e) { toast((e as Error).message, "error"); }
  }, [id, toast]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [l, a] = await Promise.all([api<{ data: Lead }>(`/api/admin/leads/${id}`), api<{ notes: Note[]; tasks: Task[]; activities: Activity[] }>(`/api/admin/lead-actions/${id}`)]);
        if (!cancelled) { setLead(l.data); setNotes(a.notes); setTasks(a.tasks); setActs(a.activities); }
      } catch (e) { if (!cancelled) toast((e as Error).message, "error"); }
    })();
    return () => { cancelled = true; };
  }, [id, toast]);

  const patch = async (data: Record<string, unknown>) => { try { await api(`/api/admin/leads/${id}`, { method: "PATCH", body: JSON.stringify(data) }); toast("Lead updated"); await load(); router.refresh(); } catch (e) { toast((e as Error).message, "error"); } };
  const action = async (body: Record<string, unknown>) => { try { await api(`/api/admin/lead-actions/${id}`, { method: "POST", body: JSON.stringify(body) }); await load(); router.refresh(); } catch (e) { toast((e as Error).message, "error"); } };

  if (!lead) return <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>;

  const phone = (lead.whatsapp || lead.phone) as string | undefined;
  const waMsg = whatsappTemplate.replace("{{name}}", lead.name);
  const info: [string, unknown][] = [["Email", lead.email], ["Phone", lead.phone], ["WhatsApp", lead.whatsapp], ["Country", lead.country], ["Market", lead.marketIdLabel], ["Project", lead.projectIdLabel], ["Budget", lead.budget], ["Interest", lead.interest], ["Source", lead.source], ["Page", lead.page], ["Campaign", lead.campaign], ["IP", lead.ip], ["Created", formatDateTime(lead.createdAt as string)], ["Updated", formatDateTime(lead.updatedAt as string)]];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/leads" className="rounded-lg border border-ink/10 bg-white p-2 hover:border-ink/25" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Link>
          <div><h1 className="flex items-center gap-2 text-[20px] font-semibold tracking-tight">{lead.name} <Badge tone={statusTone(lead.status)}>{lead.status}</Badge>{lead.archived && <Badge tone="neutral">Archived</Badge>}</h1><p className="text-[12px] text-mist">Lead #{lead.id} · {lead.email}</p></div>
        </div>
        {(canWrite || canCreateOffer) && (
          <div className="flex flex-wrap gap-2">
            {canCreateOffer && <Link href={`/admin/sales-offers/new?leadId=${id}`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-[13.5px] font-medium text-white hover:bg-brand-deep"><FileText className="h-4 w-4" /> Create Sales Offer</Link>}
            {canWrite && <Btn variant="secondary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> Edit details</Btn>}
            {canWrite && <Btn variant="secondary" onClick={() => patch({ archived: !lead.archived })}>{lead.archived ? <><ArchiveRestore className="h-4 w-4" /> Restore</> : <><Archive className="h-4 w-4" /> Archive</>}</Btn>}
            {canWrite && <Btn variant="danger" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" /></Btn>}
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="rounded-2xl border border-ink/8 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <a href={`mailto:${lead.email}`} onClick={() => canWrite && action({ type: "contact", channel: "email" })} className="inline-flex h-10 items-center gap-2 rounded-lg border border-ink/10 px-4 text-[13px] hover:border-brand"><Mail className="h-4 w-4 text-brand" /> Email</a>
              {phone && <a href={buildWhatsAppLink(phone, waMsg)} target="_blank" rel="noopener noreferrer" onClick={() => canWrite && action({ type: "contact", channel: "whatsapp" })} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1fa64a] px-4 text-[13px] text-white hover:bg-[#188a3d]"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
              {lead.phone ? <a href={`tel:${lead.phone}`} onClick={() => canWrite && action({ type: "contact", channel: "phone" })} className="inline-flex h-10 items-center gap-2 rounded-lg border border-ink/10 px-4 text-[13px] hover:border-brand"><Phone className="h-4 w-4 text-brand" /> Call</a> : null}
            </div>
            {lead.message ? <blockquote className="mt-4 rounded-xl bg-slate-50 p-4 text-[14px] leading-relaxed text-charcoal">“{lead.message as string}”</blockquote> : null}
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] md:grid-cols-3">{info.map(([k, v]) => <div key={k}><dt className="text-[10.5px] font-semibold uppercase tracking-wider text-mist">{k}</dt><dd className="truncate">{v ? String(v) : "—"}</dd></div>)}</dl>
          </section>

          <section className="rounded-2xl border border-ink/8 bg-white p-5 shadow-sm">
            <h2 className="text-[14px] font-semibold">Notes</h2>
            {canWrite && <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) { action({ type: "note", content: note }); setNote(""); } }} className="mt-3 flex gap-2"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" className={inputCls} /><Btn type="submit">Add</Btn></form>}
            <ul className="mt-4 space-y-3">{notes.map((n) => <li key={n.id} className="rounded-xl bg-slate-50 p-3 text-[13px]"><p className="whitespace-pre-wrap">{n.content}</p><div className="mt-1 text-[11px] text-mist">{n.userName ?? "—"} · {formatDateTime(n.createdAt)}</div></li>)}{notes.length === 0 && <li className="text-[13px] text-mist">No notes yet.</li>}</ul>
          </section>

          <section className="rounded-2xl border border-ink/8 bg-white p-5 shadow-sm">
            <h2 className="text-[14px] font-semibold">Activity history</h2>
            <ol className="mt-3 space-y-2 border-l border-ink/10 pl-4">{acts.map((a) => <li key={a.id} className="relative text-[13px]"><span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand" /><span className="font-medium capitalize">{a.type}</span> — {a.description}<div className="text-[11px] text-mist">{a.userName ?? "System"} · {formatDateTime(a.createdAt)}</div></li>)}</ol>
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-2xl border border-ink/8 bg-white p-5 shadow-sm">
            <label className={labelCls} htmlFor="status">Status</label>
            <select id="status" value={lead.status} disabled={!canWrite} onChange={(e) => patch({ status: e.target.value })} className={inputCls}>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <label className={`${labelCls} mt-4`} htmlFor="assign">Assigned to</label>
            <select id="assign" value={(lead.assignedTo as number | null) ?? ""} disabled={!canWrite} onChange={(e) => patch({ assignedTo: e.target.value ? Number(e.target.value) : null })} className={inputCls}><option value="">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </section>
          <section className="rounded-2xl border border-ink/8 bg-white p-5 shadow-sm">
            <h2 className="text-[14px] font-semibold">Follow-ups & tasks</h2>
            {canWrite && <form onSubmit={(e) => { e.preventDefault(); if (task.title.trim()) { action({ type: "task", title: task.title, dueAt: task.dueAt ? new Date(task.dueAt).toISOString() : null }); setTask({ title: "", dueAt: "" }); } }} className="mt-3 space-y-2"><input value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} placeholder="e.g. Call back re: payment plan" className={inputCls} /><div className="flex gap-2"><input type="datetime-local" value={task.dueAt} onChange={(e) => setTask({ ...task, dueAt: e.target.value })} className={inputCls} aria-label="Due date" /><Btn type="submit">Add</Btn></div></form>}
            <ul className="mt-4 space-y-2">{tasks.map((t) => <li key={t.id} className="flex items-start gap-2 text-[13px]"><button type="button" disabled={!canWrite} onClick={() => action({ type: "task_toggle", taskId: t.id, done: !t.done })} aria-label={t.done ? "Mark open" : "Mark done"}>{t.done ? <CheckSquare className="mt-0.5 h-4 w-4 text-brand" /> : <Square className="mt-0.5 h-4 w-4 text-mist" />}</button><div className="flex-1"><div className={t.done ? "line-through text-mist" : ""}>{t.title}</div>{t.dueAt && <div className={`text-[11px] ${!t.done && new Date(t.dueAt) < new Date() ? "text-red-600" : "text-mist"}`}>Due {formatDateTime(t.dueAt)}</div>}</div>{canWrite && <button type="button" onClick={() => action({ type: "task_delete", taskId: t.id })} aria-label="Delete task" className="text-mist hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}</li>)}{tasks.length === 0 && <li className="text-[13px] text-mist">No tasks.</li>}</ul>
          </section>
        </div>
      </div>

      <Modal open={edit} onClose={() => setEdit(false)} title="Edit lead" wide><ResourceForm resourceKey="leads" id={id} canWrite={canWrite} inline onSaved={() => { setEdit(false); load(); }} /></Modal>
      <Confirm open={del} onClose={() => setDel(false)} title="Delete this lead?" message="All notes, tasks and history will be removed. Consider archiving instead." confirmLabel="Delete" danger onConfirm={async () => { await api(`/api/admin/leads/${id}`, { method: "DELETE" }); toast("Lead deleted"); router.replace("/admin/leads"); router.refresh(); }} />
    </div>
  );
}
