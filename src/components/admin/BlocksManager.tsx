"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Library, Pencil, Search, Trash2 } from "lucide-react";
import { api, Badge, Btn, Card, Confirm, EmptyState, Modal, Skeleton, inputCls, labelCls, useToast } from "./ui";
import { SectionEditor } from "./VisualBuilder";
import { sectionLabel, type BuilderBlock, type BuilderSection } from "@/lib/page-builder";
import { cn } from "@/lib/utils";

type Usage = { kind: "page" | "project"; id: number; name: string; status: string };

export function BlocksManager({ canWrite }: { canWrite: boolean }) {
  const { toast } = useToast();
  const [blocks, setBlocks] = useState<BuilderBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<BuilderBlock | null>(null);
  const [section, setSection] = useState<BuilderSection | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [usage, setUsage] = useState<Usage[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<BuilderBlock | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ data: BuilderBlock[] }>("/api/admin/blocks");
      setBlocks(res.data);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load blocks", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Initial load. State is only touched from the promise callbacks so the
  // effect does not trigger a synchronous re-render (React Compiler rule).
  useEffect(() => {
    let alive = true;
    api<{ data: BuilderBlock[] }>("/api/admin/blocks")
      .then((res) => {
        if (alive) setBlocks(res.data);
      })
      .catch((e) => {
        if (alive) toast(e instanceof Error ? e.message : "Could not load blocks", "error");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [toast]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return blocks;
    return blocks.filter((b) => `${b.name} ${b.category ?? ""} ${b.section.type}`.toLowerCase().includes(term));
  }, [blocks, q]);

  const openEdit = useCallback(async (block: BuilderBlock) => {
    setEditing(block);
    setSection(block.section);
    setName(block.name);
    setCategory(block.category ?? "");
    setDescription(block.description ?? "");
    setUsage([]);
    try {
      const res = await api<{ data: BuilderBlock & { usage: Usage[] } }>(`/api/admin/blocks/${block.id}`);
      setUsage(res.data.usage ?? []);
    } catch {
      // usage is informational
    }
  }, []);

  const save = useCallback(async () => {
    if (!editing || !section) return;
    setSaving(true);
    try {
      await api(`/api/admin/blocks/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, category: category || null, description: description || null, section }),
      });
      toast("Block updated — linked pages will render the new content", "success");
      setEditing(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the block", "error");
    } finally {
      setSaving(false);
    }
  }, [editing, section, name, category, description, toast, load]);

  const remove = useCallback(async () => {
    const block = confirmDelete;
    setConfirmDelete(null);
    if (!block) return;
    try {
      await api(`/api/admin/blocks/${block.id}`, { method: "DELETE" });
      toast("Block deleted", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not delete the block", "error");
    }
  }, [confirmDelete, toast, load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Reusable blocks</h1>
          <p className="mt-0.5 text-[13px] text-mist">
            Save a configured section once and insert it on any page. Linked inserts follow this master; independent copies never change.
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search blocks…" className={cn(inputCls, "pl-9")} />
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={blocks.length ? "No blocks match that search" : "No reusable blocks yet"}
          description="Open a page in the visual editor, select a section and choose “Save as block”. It then appears here and in the editor's block library."
          action={<Link href="/admin/pages" className="text-[13px] font-semibold text-brand hover:underline">Go to pages →</Link>}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((b) => (
            <Card key={b.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Library className="h-4 w-4 shrink-0 text-brand" />
                    <p className="truncate text-[14px] font-semibold text-ink">{b.name}</p>
                  </div>
                  <p className="mt-0.5 text-[11.5px] uppercase tracking-wider text-mist">
                    {sectionLabel(b.section.type)}
                    {b.category ? ` · ${b.category}` : ""}
                  </p>
                </div>
                <Badge tone={(b.usageCount ?? 0) > 0 ? "green" : "slate"}>
                  {(b.usageCount ?? 0) > 0 ? `${b.usageCount} link${b.usageCount === 1 ? "" : "s"}` : "unused"}
                </Badge>
              </div>
              {b.description && <p className="mt-2 line-clamp-2 text-[12.5px] text-charcoal/70">{b.description}</p>}
              {b.section.title && <p className="mt-2 truncate text-[12px] text-mist">“{b.section.title}”</p>}
              <div className="mt-3 flex items-center gap-2">
                <Btn variant="secondary" size="sm" onClick={() => void openEdit(b)} disabled={!canWrite}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Btn>
                <Btn variant="ghost" size="sm" onClick={() => setConfirmDelete(b)} disabled={!canWrite} className="!text-red-600">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Btn>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit “${editing.name}”` : "Edit block"} wide>
        {editing && section && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Category</label>
                  <input value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} placeholder="CTAs, Project modules…" />
                </div>
              </div>
              <div className="mt-3">
                <label className={labelCls}>Description</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="When to use this block" />
              </div>
              <div className="mt-4">
                <SectionEditor section={section} onChange={setSection} />
              </div>
            </div>
            <aside className="rounded-xl border border-ink/10 bg-slate-50/60 p-3">
              <p className={labelCls}>Used on {usage.length} item{usage.length === 1 ? "" : "s"}</p>
              {usage.length === 0 ? (
                <p className="text-[12px] text-mist">Not linked anywhere yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {usage.map((u) => (
                    <li key={`${u.kind}-${u.id}`} className="text-[12.5px] text-ink">
                      <span className="mr-1 rounded bg-white px-1 py-0.5 text-[10px] font-semibold uppercase text-charcoal/60 ring-1 ring-ink/10">{u.kind}</span>
                      {u.name}
                      <span className="ml-1 text-[11px] text-mist">({u.status})</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-charcoal/60">
                Saving updates every linked placement immediately. Pages that received an independent copy are not affected.
              </p>
            </aside>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Btn variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Btn>
          <Btn size="sm" loading={saving} onClick={() => void save()} disabled={!name.trim()}>Save block</Btn>
        </div>
      </Modal>

      <Confirm
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this reusable block?"
        message={
          (confirmDelete?.usageCount ?? 0) > 0
            ? `“${confirmDelete?.name}” is still linked on ${confirmDelete?.usageCount} item(s). The block cannot be deleted until those placements are removed or replaced.`
            : `“${confirmDelete?.name}” will be removed from the library. Pages that used it earlier are unaffected because they hold independent copies.`
        }
        confirmLabel="Delete"
        danger
        onConfirm={remove}
      />
    </div>
  );
}
