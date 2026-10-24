"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Loader2 } from "lucide-react";
import { PERMISSION_GROUPS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { deferInitialLoad } from "@/lib/defer-load";
import { api, Badge, Btn, Confirm, inputCls, useToast } from "./ui";

type RoleRow = { id: number; key: string; name: string; description: string | null; permissions: string[]; inUse: number };

export function RolesManager({ canWrite, isSuperAdmin, myPermissions }: { canWrite: boolean; isSuperAdmin: boolean; myPermissions: string[] | null }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RoleRow | "new" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState<RoleRow | null>(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const d = await api<{ data: RoleRow[] }>("/api/admin/roles");
      setRows(d.data);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load roles"); } finally { setLoading(false); }
  };
  useEffect(() => deferInitialLoad(load), []);

  const openNew = () => { setEditing("new"); setName(""); setDescription(""); setPerms(new Set()); };
  const openEdit = (r: RoleRow) => { setEditing(r); setName(r.name); setDescription(r.description ?? ""); setPerms(new Set(r.permissions)); };

  const toggle = (p: string) => {
    if (!canWrite) return;
    setPerms((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  };

  const save = async () => {
    if (!name.trim()) { toast("Name is required", "error"); return; }
    setSaving(true);
    try {
      const body = JSON.stringify({ name: name.trim(), description: description.trim() || null, permissions: [...perms] });
      if (editing === "new") await api("/api/admin/roles", { method: "POST", body });
      else if (editing) await api(`/api/admin/roles/${editing.id}`, { method: "PATCH", body });
      toast(`Role ${editing === "new" ? "created" : "updated"}`);
      setEditing(null);
      await load();
    } catch (e) { toast(e instanceof Error ? e.message : "Save failed", "error"); } finally { setSaving(false); }
  };

  const del = async (r: RoleRow) => {
    try { await api(`/api/admin/roles/${r.id}`, { method: "DELETE" }); toast("Role deleted"); await load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Delete failed", "error"); }
  };

  const groupDisabled = (permKey: string) => !isSuperAdmin && myPermissions ? !myPermissions.includes(permKey) : false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[22px] font-semibold tracking-tight">Custom Roles</h1><p className="text-[13px] text-mist">Granular server-enforced permissions beyond the built-in Super Admin / Admin / Editor roles.</p></div>
        {canWrite && <Btn onClick={openNew}><Plus className="h-4 w-4" /> New Role</Btn>}
      </div>
      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-ink/8 bg-white shadow-sm">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-mist">
            <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Permissions</th><th className="px-4 py-3">Users</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-ink/6">
            {loading && <tr><td colSpan={4} className="px-4 py-4"><div className="skeleton h-5 w-full rounded" /></td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="group">
                <td className="px-4 py-3"><div className="font-medium">{r.name}</div><div className="font-mono text-[11px] text-mist">{r.key}</div>{r.description && <div className="text-[12px] text-mist">{r.description}</div>}</td>
                <td className="px-4 py-3"><Badge tone="green">{r.permissions.length} granted</Badge></td>
                <td className="px-4 py-3">{r.inUse}</td>
                <td className="px-4 py-3 text-right">
                  {canWrite && (
                    <div className="flex justify-end gap-1">
                      <Btn size="sm" variant="ghost" onClick={() => openEdit(r)} aria-label="Edit role"><Pencil className="h-3.5 w-3.5" /></Btn>
                      <Btn size="sm" variant="ghost" onClick={() => setConfirmDel(r)} aria-label="Delete role"><Trash2 className="h-3.5 w-3.5" /></Btn>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-mist">No custom roles yet. Create one like “SEO Manager” or “Content Editor”.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="my-8 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editing === "new" ? "New Role" : `Edit ${editing.name}`}</h2>
              <button onClick={() => setEditing(null)} aria-label="Close" className="rounded-lg p-2 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <label className="block text-[12.5px] font-medium">Role name<input value={name} onChange={(e) => setName(e.target.value)} className={cn(inputCls, "mt-1")} placeholder="e.g. SEO Manager" disabled={!canWrite} /></label>
              <label className="block text-[12.5px] font-medium">Description (optional)<input value={description} onChange={(e) => setDescription(e.target.value)} className={cn(inputCls, "mt-1")} placeholder="What this role manages" disabled={!canWrite} /></label>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12.5px] font-medium">Permissions — enforced on API routes, not just menus</span>
                  <div className="flex gap-2 text-[11.5px]">
                    <button type="button" className="text-brand hover:underline" onClick={() => setPerms(new Set(PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key as string))))}>Select all</button>
                    <button type="button" className="text-mist hover:underline" onClick={() => setPerms(new Set())}>Clear</button>
                  </div>
                </div>
                <div className="max-h-[45vh] space-y-3 overflow-y-auto rounded-xl border border-ink/10 p-3">
                  {PERMISSION_GROUPS.map((g) => (
                    <div key={g.group}>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-mist">{g.group}</div>
                      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                        {g.items.map((i) => {
                          const locked = groupDisabled(i.key);
                          return (
                            <label key={i.key} className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] hover:bg-slate-50", !canWrite && "cursor-not-allowed opacity-60", locked && "opacity-50")} title={locked ? "You do not hold this permission yourself — you cannot grant it" : undefined}>
                              <input type="checkbox" checked={perms.has(i.key)} disabled={!canWrite} onChange={() => toggle(i.key)} />
                              <span className="select-none">{i.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Btn variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
                <Btn onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{editing === "new" ? "Create Role" : "Save Changes"}</Btn>
              </div>
              {!isSuperAdmin && <p className="text-[11.5px] text-mist">Only permissions you hold yourself can be granted.</p>}
            </div>
          </div>
        </div>
      )}

      <Confirm open={!!confirmDel} onClose={() => setConfirmDel(null)} title={`Delete ${confirmDel?.name}?`} message="Users must be unassigned first. This cannot be undone." confirmLabel="Delete" danger onConfirm={() => { if (confirmDel) void del(confirmDel); }} />
    </div>
  );
}
