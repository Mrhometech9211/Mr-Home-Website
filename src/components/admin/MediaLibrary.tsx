"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Upload, Search, Trash2, Copy, RefreshCw, Link2, Download } from "lucide-react";
import { api, Btn, Confirm, inputCls, labelCls, Modal, useToast, EmptyState } from "./ui";
import { MediaThumb, useMediaUpload, type MediaRow } from "./MediaPicker";
import { cn, formatDateTime } from "@/lib/utils";

type Usage = { total: number; projects: { id: number; name: string }[]; markets: { id: number; name: string }[]; sections: { id: number; name: string }[]; testimonials: { id: number; name: string }[]; seo: { id: number; name: string }[]; settings: boolean };

export function MediaLibrary({ canWrite }: { canWrite: boolean }) {
  const { toast } = useToast();
  const [items, setItems] = useState<MediaRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [sort, setSort] = useState("createdAt:desc");
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<(MediaRow & { usage?: Usage }) | null>(null);
  const [meta, setMeta] = useState({ alt: "", caption: "", kind: "image" });
  const [confirm, setConfirm] = useState(false);
  const [drag, setDrag] = useState(false);
  const [tick, setTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useMediaUpload();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d] = sort.split(":");
      const params = new URLSearchParams({ page: String(page), pageSize: "36", sort: s, dir: d });
      if (q) params.set("q", q);
      if (kind) params.set("kind", kind);
      const r = await api<{ data: MediaRow[]; total: number }>(`/api/admin/media?${params}`);
      setItems(r.data); setTotal(r.total);
    } catch (e) { toast((e as Error).message, "error"); } finally { setLoading(false); }
  }, [page, q, kind, sort, toast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [s, d] = sort.split(":");
        const params = new URLSearchParams({ page: String(page), pageSize: "36", sort: s, dir: d });
        if (q) params.set("q", q);
        if (kind) params.set("kind", kind);
        const r = await api<{ data: MediaRow[]; total: number }>(`/api/admin/media?${params}`);
        if (!cancelled) { setItems(r.data); setTotal(r.total); }
      } catch (e) { if (!cancelled) toast((e as Error).message, "error"); } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [page, q, kind, sort, toast, tick]);

  const openItem = async (m: MediaRow) => {
    setActive(m); setMeta({ alt: m.alt ?? "", caption: m.caption ?? "", kind: m.kind });
    try { const r = await api<{ data: MediaRow; usage: Usage }>(`/api/admin/media/${m.id}`); setActive({ ...r.data, usage: r.usage }); } catch { /* ignore */ }
  };

  const saveMeta = async () => {
    if (!active) return;
    try { await api(`/api/admin/media/${active.id}`, { method: "PATCH", body: JSON.stringify(meta) }); toast("Media updated"); setTick((t) => t + 1); setActive(null); } catch (e) { toast((e as Error).message, "error"); }
  };

  const remove = async (force = false) => {
    if (!active) return;
    try { await api(`/api/admin/media/${active.id}${force ? "?force=1" : ""}`, { method: "DELETE" }); toast("Deleted"); setActive(null); setTick((t) => t + 1); }
    catch (e) { const err = e as Error & { status?: number }; if (err.status === 409 && confirm) { await api(`/api/admin/media/${active.id}?force=1`, { method: "DELETE" }); toast("Force deleted"); setActive(null); setTick((t) => t + 1); } else toast(err.message, "error"); }
  };

  const onDrop = async (e: React.DragEvent) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length && canWrite) { await upload(e.dataTransfer.files); setTick((t) => t + 1); } };
  const copy = (url: string) => { navigator.clipboard.writeText(`${location.origin}${url}`); toast("URL copied", "info"); };
  const pages = Math.max(1, Math.ceil(total / 36));

  return (
    <div className="space-y-4" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[22px] font-semibold tracking-tight">Media Library</h1><p className="text-[13px] text-mist">{total} files · images, videos, logos and documents</p></div>                {canWrite && <><input ref={fileRef} type="file" multiple className="hidden" onChange={async (e) => { if (e.target.files?.length) { await upload(e.target.files); setTick((t) => t + 1); } e.target.value = ""; }} /><Btn loading={uploading} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Upload files</Btn></>}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-ink/8 bg-white p-3 shadow-sm">
        <form onSubmit={(e) => { e.preventDefault(); setPage(1); load(); }} className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search filename, alt or caption…" className={cn(inputCls, "pl-9")} /></form>
        <select value={kind} onChange={(e) => { setPage(1); setKind(e.target.value); }} className={cn(inputCls, "w-auto")} aria-label="Type"><option value="">All types</option><option value="image">Images</option><option value="logo">Logos</option><option value="video">Videos</option><option value="document">Documents</option></select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className={cn(inputCls, "w-auto")} aria-label="Sort"><option value="createdAt:desc">Newest</option><option value="createdAt:asc">Oldest</option><option value="filename:asc">Name A–Z</option><option value="size:desc">Largest</option></select>
      </div>

      <div className={cn("rounded-2xl border-2 border-dashed p-4 transition", drag ? "border-brand bg-brand/5" : "border-transparent")}>
        {loading && items.length === 0 ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton aspect-square rounded-xl" />)}</div>
          : items.length === 0 ? <EmptyState title="No media yet" description="Drag & drop files here or use Upload. Allowed: JPG, PNG, WebP, AVIF, GIF, SVG, MP4, WebM, PDF." />
          : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {items.map((m) => (
                <button key={m.id} type="button" onClick={() => openItem(m)} className="group relative overflow-hidden rounded-xl border border-ink/8 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="relative aspect-square bg-slate-50"><MediaThumb m={m} /></div>
                  <div className="p-2"><div className="truncate text-[12px] font-medium">{m.originalName}</div><div className="text-[10.5px] text-mist">{(m.size / 1024).toFixed(0)} KB{m.width ? ` · ${m.width}×${m.height}` : ""}</div></div>
                </button>
              ))}
            </div>
          )}
      </div>
      <div className="flex items-center justify-between text-[12.5px] text-mist"><span>Page {page} of {pages}</span><div className="flex gap-1"><Btn size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Btn><Btn size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Btn></div></div>

      <Modal open={!!active} onClose={() => setActive(null)} title={active?.originalName ?? ""} wide>
        {active && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-ink/8 bg-slate-50">
              {active.mimeType.startsWith("video/") ? <video src={active.url} controls className="w-full" /> : active.mimeType === "application/pdf" ? <iframe src={active.url} title={active.filename} className="h-[420px] w-full" /> : <div className="relative aspect-[4/3]"><MediaThumb m={active} className="object-contain" /></div>}
              <a href={active.url} download={active.originalName} className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-[12.5px] font-medium text-white transition hover:bg-brand">
                <Download className="h-3.5 w-3.5" /> {active.mimeType.startsWith("video/") || active.mimeType === "application/pdf" ? "Open / download file" : "Download"}
              </a>
            </div>
            <div className="space-y-4 text-[13px]">
              <dl className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-[12px]">
                <dt className="text-mist">Type</dt><dd>{active.mimeType}</dd>
                <dt className="text-mist">Size</dt><dd>{(active.size / 1024).toFixed(1)} KB</dd>
                {active.width && <><dt className="text-mist">Dimensions</dt><dd>{active.width} × {active.height}</dd></>}
                <dt className="text-mist">Uploaded</dt><dd>{formatDateTime(active.createdAt)}</dd>
                <dt className="text-mist">URL</dt><dd className="flex items-center gap-1 truncate"><code className="truncate">{active.url}</code><button type="button" onClick={() => copy(active.url)} aria-label="Copy URL"><Copy className="h-3.5 w-3.5" /></button></dd>
              </dl>
              <div><label className={labelCls}>Alt text</label><input value={meta.alt} onChange={(e) => setMeta({ ...meta, alt: e.target.value })} className={inputCls} disabled={!canWrite} /></div>
              <div><label className={labelCls}>Caption</label><input value={meta.caption} onChange={(e) => setMeta({ ...meta, caption: e.target.value })} className={inputCls} disabled={!canWrite} /></div>
              <div><label className={labelCls}>Category</label><select value={meta.kind} onChange={(e) => setMeta({ ...meta, kind: e.target.value })} className={inputCls} disabled={!canWrite}><option value="image">Image</option><option value="logo">Logo</option><option value="video">Video</option><option value="document">Document</option></select></div>
              <div>
                <div className={labelCls}>Usage {active.usage ? `(${active.usage.total})` : ""}</div>
                {active.usage ? (
                  active.usage.total === 0 ? <p className="text-mist">Not used anywhere yet.</p> : (
                    <ul className="space-y-1 text-[12.5px]">
                      {active.usage.projects.map((p) => <li key={`p${p.id}`}><Link2 className="mr-1 inline h-3 w-3" /><a href={`/admin/projects/${p.id}`} className="text-brand hover:underline">Project: {p.name}</a></li>)}
                      {active.usage.markets.map((p) => <li key={`m${p.id}`}><Link2 className="mr-1 inline h-3 w-3" /><a href={`/admin/markets/${p.id}`} className="text-brand hover:underline">Market: {p.name}</a></li>)}
                      {active.usage.sections.map((p) => <li key={`s${p.id}`}><Link2 className="mr-1 inline h-3 w-3" /><a href={`/admin/sections/${p.id}`} className="text-brand hover:underline">Section: {p.name}</a></li>)}
                      {active.usage.testimonials.map((p) => <li key={`t${p.id}`}>Testimonial: {p.name}</li>)}
                      {active.usage.seo.map((p) => <li key={`o${p.id}`}>SEO: {p.name}</li>)}
                      {active.usage.settings && <li><Link href="/admin/settings" className="text-brand hover:underline">Site settings</Link></li>}
                    </ul>
                  )
                ) : <p className="text-mist">Checking…</p>}
              </div>
              {canWrite && (
                <div className="flex flex-wrap gap-2 border-t border-ink/8 pt-4">
                  <Btn onClick={saveMeta}>Save</Btn>
                  <input ref={replaceRef} type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f || !active) return; const fd = new FormData(); fd.append("file", f); try { await api(`/api/admin/media/${active.id}`, { method: "POST", body: fd }); toast("File replaced — all usages updated"); load(); setActive(null); } catch (err) { toast((err as Error).message, "error"); } e.target.value = ""; }} />
                  <Btn variant="secondary" onClick={() => replaceRef.current?.click()}><RefreshCw className="h-4 w-4" /> Replace file</Btn>
                  <Btn variant="danger" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" /> Delete</Btn>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
      <Confirm open={confirm} onClose={() => setConfirm(false)} title="Delete this file?" message={active?.usage?.total ? `This file is referenced in ${active.usage.total} place(s). Deleting will break those references.` : "This permanently deletes the file."} confirmLabel="Delete" danger onConfirm={() => remove(!!active?.usage?.total)} />
    </div>
  );
}
