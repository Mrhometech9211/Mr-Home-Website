"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Upload, Search, FileText, Film } from "lucide-react";
import { api, Btn, inputCls, Modal, useToast } from "./ui";
import { directUpload } from "@/lib/direct-upload-client";
import { cn } from "@/lib/utils";

export type MediaRow = { id: number; url: string; filename: string; originalName: string; mimeType: string; kind: string; size: number; width: number | null; height: number | null; alt: string | null; caption: string | null; createdAt: string };

export function MediaThumb({ m, className }: { m: MediaRow; className?: string }) {
  if (m.mimeType.startsWith("image/")) return <Image src={m.url} alt={m.alt ?? m.filename} fill sizes="200px" className={cn("!h-full !w-full object-cover", className)} unoptimized />;
  if (m.mimeType.startsWith("video/")) return <div className={cn("flex h-full w-full items-center justify-center bg-slate-900 text-white", className)}><Film className="h-6 w-6" /></div>;
  return <div className={cn("flex h-full w-full items-center justify-center bg-slate-100 text-slate-500", className)}><FileText className="h-6 w-6" /></div>;
}

export function useMediaUpload() {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const upload = useCallback(async (files: FileList | File[], _extra?: Record<string, string>) => {
    setUploading(true);
    const done: MediaRow[] = [];
    for (const f of Array.from(files)) {
      try {
        // Direct-to-R2 presigned upload (bypasses server body limits);
        // the helper transparently falls back to the legacy multipart
        // storing the file in Postgres when R2 is not configured.
        const { id } = await directUpload("media", f);
        if (id) {
          const d = await api<{ data: MediaRow }>(`/api/admin/media/${id}`);
          done.push(d.data);
        }
      } catch (e) { toast(`${f.name}: ${e instanceof Error ? e.message : "upload failed"}`, "error"); }
    }
    setUploading(false);
    if (done.length) toast(`${done.length} file(s) uploaded`);
    return done;
  }, [toast]);
  return { upload, uploading };
}

export function MediaPicker({ open, onClose, onSelect, accept = "image" }: { open: boolean; onClose: () => void; onSelect: (m: MediaRow) => void; accept?: "image" | "video" | "document" | "any" }) {
  const [items, setItems] = useState<MediaRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useMediaUpload();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "60" });
      if (q) params.set("q", q);
      if (accept !== "any") params.set("kind", accept);
      const d = await api<{ data: MediaRow[] }>(`/api/admin/media?${params}`);
      setItems(d.data);
    } finally { setLoading(false); }
  }, [q, accept]);

  // Subscribe to an external trigger (modal opening / search changes) and load
  // asynchronously in a callback — no synchronous setState in the effect body.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ pageSize: "60" });
        if (q) params.set("q", q);
        if (accept !== "any") params.set("kind", accept);
        const d = await api<{ data: MediaRow[] }>(`/api/admin/media?${params}`);
        if (!cancelled) setItems(d.data);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [open, q, accept]);

  return (
    <Modal open={open} onClose={onClose} title="Media Library" wide>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" /><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Search media…" className={cn(inputCls, "pl-9")} /></div>
        <input ref={fileRef} type="file" multiple className="hidden" accept={accept === "image" ? "image/*" : accept === "video" ? "video/*" : accept === "document" ? "application/pdf" : undefined} onChange={async (e) => { if (e.target.files?.length) { const done = await upload(e.target.files); if (done.length === 1) { onSelect(done[0]); onClose(); } else load(); } e.target.value = ""; }} />
        <Btn variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Upload</Btn>
      </div>
      <div className="mt-4 grid max-h-[55vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4 md:grid-cols-6">
        {loading && items.length === 0 && Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton aspect-square rounded-xl" />)}
        {items.map((m) => (
          <button key={m.id} type="button" onClick={() => { onSelect(m); onClose(); }} className="group relative aspect-square overflow-hidden rounded-xl border border-ink/8 bg-slate-50 transition hover:ring-2 hover:ring-brand" title={m.filename}>
            <MediaThumb m={m} />
            <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1.5 py-1 text-left text-[10px] text-white">{m.originalName}</span>
          </button>
        ))}
        {!loading && items.length === 0 && <p className="col-span-full py-10 text-center text-[13px] text-mist">No media yet. Upload your first file.</p>}
      </div>
    </Modal>
  );
}
