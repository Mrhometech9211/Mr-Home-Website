"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  FolderInput,
  Cloud,
  Copy,
  Download,
  Folder,
  FolderPlus,
  Home,
  LayoutGrid,
  Link2,
  Loader2,
  Pencil,
  Table,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api, Btn, Confirm, EmptyState, inputCls, labelCls, Modal, useToast } from "./ui";
import { MediaThumb, useMediaUpload, type MediaRow } from "./MediaPicker";
import { cn, formatDateTime } from "@/lib/utils";

type Usage = { total: number; projects: { id: number; name: string }[]; markets: { id: number; name: string }[]; sections: { id: number; name: string }[]; testimonials: { id: number; name: string }[]; seo: { id: number; name: string }[]; settings: boolean };
type FolderRow = { id: number; name: string; parentId: number | null; count: number };
type UploadJob = { key: string; name: string; pct: number | null; state: "uploading" | "done" | "error"; message?: string };
type DriveEntry = { id: string; name: string; mimeType: string; size?: number; modifiedTime?: string; isFolder: boolean; imported?: boolean };
type DriveImportSummary = { imported: number; skipped: number; failed: { name: string; error: string }[]; stopped?: boolean; savedBytes?: number };

const DND_MEDIA = "application/x-mh-media";
const DND_FOLDER = "application/x-mh-folder";
const PAGE_SIZE = 48;
const bytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function MediaLibrary({ canWrite }: { canWrite: boolean }) {
  const { toast } = useToast();
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [rootCount, setRootCount] = useState(0);
  const [current, setCurrent] = useState<number | null>(null);
  const [items, setItems] = useState<MediaRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [sort, setSort] = useState("createdAt:desc");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [view, setView] = useState<"icons" | "details">("icons");
  const [compress, setCompress] = useState(true);

  // Remember the explorer preferences between visits, like a desktop file manager.
  useEffect(() => {
    // Read preferences after paint so hydration is never blocked by storage.
    const id = setTimeout(() => {
      try {
        const v = localStorage.getItem("mh-media-view");
        if (v === "details" || v === "icons") setView(v);
        const c = localStorage.getItem("mh-media-compress");
        if (c === "0") setCompress(false);
      } catch { /* storage can be blocked */ }
    }, 0);
    return () => clearTimeout(id);
  }, []);
  const changeView = (v: "icons" | "details") => {
    setView(v);
    try { localStorage.setItem("mh-media-view", v); } catch { /* ignore */ }
  };
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadJob[]>([]);
  const [downloadPct, setDownloadPct] = useState<Record<number, number | null>>({});
  const [active, setActive] = useState<(MediaRow & { usage?: Usage }) | null>(null);
  const [meta, setMeta] = useState({ alt: "", caption: "", kind: "image", name: "", folderId: "" });
  const [confirm, setConfirm] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [folderModal, setFolderModal] = useState<{ mode: "new" | "rename"; parentId: number | null; folder?: FolderRow } | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderToDelete, setFolderToDelete] = useState<FolderRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [driveStatus, setDriveStatus] = useState<{ configured: boolean; connected: boolean; email: string | null; redirectUri: string } | null>(null);
  const [driveEntries, setDriveEntries] = useState<DriveEntry[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveFolder, setDriveFolder] = useState("root");
  const [drivePath, setDrivePath] = useState<{ id: string; name: string }[]>([]);
  const [driveQuery, setDriveQuery] = useState("");
  const [driveSelected, setDriveSelected] = useState<Set<string>>(new Set());
  const [driveNext, setDriveNext] = useState<string | null>(null);
  const [driveTruncated, setDriveTruncated] = useState(false);
  const [drivePreview, setDrivePreview] = useState<DriveEntry | null>(null);
  const [driveOptimize, setDriveOptimize] = useState<"lossless" | "balanced" | "off">("balanced");
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useMediaUpload();

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Surface the OAuth callback result (?drive=connected|error) once.
  useEffect(() => {
    const status = new URLSearchParams(location.search).get("drive");
    if (status === "connected") toast("Google Drive connected");
    else if (status === "error") toast("Google Drive connection failed — check the redirect URI", "error");
  }, [toast]);

  const driveConnectHref = "/api/admin/integrations/google/connect";

  const loadDrive = async (folderId = driveFolder, search = "", pageToken?: string) => {
    setDriveLoading(true);
    setDriveError(null);
    try {
      const s = await api<{ data: { configured: boolean; connected: boolean; email: string | null; redirectUri: string } }>("/api/admin/integrations/google/status");
      setDriveStatus(s.data);
      if (!s.data.connected) {
        setDriveEntries([]);
        return;
      }
      const params = new URLSearchParams();
      params.set("folderId", folderId);
      if (search.trim()) params.set("q", search.trim());
      if (pageToken) params.set("pageToken", pageToken);
      const f = await api<{ data: DriveEntry[]; nextPageToken: string | null; truncated?: boolean }>(`/api/admin/integrations/google/files?${params.toString()}`);
      setDriveEntries((prev) => (pageToken ? [...prev, ...f.data] : f.data));
      setDriveNext(f.nextPageToken ?? null);
      setDriveTruncated(Boolean(f.truncated));
    } catch (e) {
      setDriveError((e as Error).message);
    } finally {
      setDriveLoading(false);
    }
  };

  const openDrive = () => {
    setDriveOpen(true);
    setDriveFolder("root");
    setDrivePath([]);
    setDriveQuery("");
    setDriveSelected(new Set());
    void loadDrive("root", "");
  };

  const openDriveFolder = (entry: DriveEntry) => {
    setDrivePath((p) => [...p, { id: entry.id, name: entry.name }]);
    setDriveFolder(entry.id);
    setDriveQuery("");
    setDriveSelected(new Set());
    void loadDrive(entry.id, "");
  };

  const goDriveRoot = () => {
    setDrivePath([]);
    setDriveFolder("root");
    setDriveSelected(new Set());
    void loadDrive("root", driveQuery.trim());
  };

  const toggleDriveSelect = (id: string) => {
    setDriveSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const describeImport = (s: DriveImportSummary) => {
    const bits = [`${s.imported} imported`];
    if (s.skipped) bits.push(`${s.skipped} already in the library`);
    if (s.failed.length) bits.push(`${s.failed.length} failed: ${s.failed[0].error}`);
    if (s.savedBytes && s.savedBytes > 0) bits.push(`${(s.savedBytes / 1024 / 1024).toFixed(1)} MB saved`);
    if (s.stopped) bits.push("stopped at the 4-minute cap — run it again for the rest");
    return bits.join(" · ");
  };

  const importSelectedFromDrive = async () => {
    const ids = [...driveSelected];
    if (!ids.length) return;
    setDriveBusy(true);
    try {
      const r = await api<{ data: DriveImportSummary }>("/api/admin/integrations/google/import", {
        method: "POST",
        body: JSON.stringify({ fileIds: ids, destinationFolderId: current, optimize: driveOptimize }),
      });
      toast(describeImport(r.data), r.data.imported ? "success" : "error");
      setDriveSelected(new Set());
      refresh();
      void loadDrive(driveFolder, driveQuery.trim());
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setDriveBusy(false);
    }
  };

  const importSingleFromDrive = async (file: DriveEntry) => {
    setDriveBusy(true);
    try {
      const r = await api<{ data: DriveImportSummary }>("/api/admin/integrations/google/import", {
        method: "POST",
        body: JSON.stringify({ fileIds: [file.id], destinationFolderId: current, optimize: driveOptimize }),
      });
      toast(describeImport(r.data), r.data.imported ? "success" : "error");
      setDrivePreview(null);
      refresh();
      void loadDrive(driveFolder, driveQuery.trim());
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setDriveBusy(false);
    }
  };

  const importDriveFolder = async () => {
    if (driveFolder === "root") return;
    setDriveBusy(true);
    try {
      const r = await api<{ data: DriveImportSummary }>("/api/admin/integrations/google/import", {
        method: "POST",
        body: JSON.stringify({ folderId: driveFolder, mirror: true, destinationFolderId: current, optimize: driveOptimize }),
      });
      toast(describeImport(r.data), r.data.imported ? "success" : "error");
      refresh();
      void loadDrive(driveFolder, driveQuery.trim());
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setDriveBusy(false);
    }
  };

  useEffect(() => {
    if (!driveOpen || !driveStatus?.connected) return;
    const t = setTimeout(() => void loadDrive(driveFolder, driveQuery.trim()), 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveQuery]);

  const disconnectDrive = async () => {
    try {
      await api("/api/admin/integrations/google/disconnect", { method: "POST" });
      setDriveStatus((s) => (s ? { ...s, connected: false, email: null } : s));
      setDriveEntries([]);
      setDrivePath([]);
      setDriveFolder("root");
      toast("Google Drive disconnected");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  // Debounce search so typing stays instant even with thousands of files.
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 220);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api<{ data: FolderRow[]; rootCount: number }>(`/api/admin/media/folders?t=${Date.now()}`);
        if (!cancelled) { setFolders(r.data); setRootCount(r.rootCount); }
      } catch (e) { if (!cancelled) toast((e as Error).message, "error"); }
    })();
    return () => { cancelled = true; };
  }, [tick, toast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [s, d] = sort.split(":");
        const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort: s, dir: d });
        // A search spans the whole library; browsing is scoped to the folder.
        if (search) params.set("q", search);
        else params.set("folder", current === null ? "root" : String(current));
        if (kind) params.set("kind", kind);
        const r = await api<{ data: MediaRow[]; total: number }>(`/api/admin/media?${params}`);
        if (!cancelled) { setItems(r.data); setTotal(r.total); }
      } catch (e) { if (!cancelled) toast((e as Error).message, "error"); } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [page, search, kind, sort, current, tick, toast]);

  // Auto-clear finished upload rows after a beat.
  useEffect(() => {
    if (!uploads.some((j) => j.state === "done")) return;
    const t = setTimeout(() => setUploads((prev) => prev.filter((j) => j.state !== "done")), 6000);
    return () => clearTimeout(t);
  }, [uploads]);

  const path = useMemo(() => {
    const byId = new Map(folders.map((f) => [f.id, f]));
    const out: FolderRow[] = [];
    let cursor = current;
    while (cursor !== null && byId.has(cursor) && out.length < 50) {
      const f = byId.get(cursor)!;
      out.unshift(f);
      cursor = f.parentId;
    }
    return out;
  }, [folders, current]);

  const folderOptions = useMemo(() => {
    const out: { id: number; label: string }[] = [];
    const walk = (parent: number | null, depth: number) => {
      folders.filter((f) => f.parentId === parent).sort((a, b) => a.name.localeCompare(b.name)).forEach((f) => {
        out.push({ id: f.id, label: `${"– ".repeat(depth)}${f.name}` });
        walk(f.id, depth + 1);
      });
    };
    walk(null, 0);
    return out;
  }, [folders]);

  const subfolders = useMemo(() => folders.filter((f) => f.parentId === current).sort((a, b) => a.name.localeCompare(b.name)), [folders, current]);

  const openItem = async (m: MediaRow) => {
    setActive(m);
    setMeta({ alt: m.alt ?? "", caption: m.caption ?? "", kind: m.kind, name: m.originalName, folderId: m.folderId ? String(m.folderId) : "" });
    try {
      const r = await api<{ data: MediaRow; usage: Usage }>(`/api/admin/media/${m.id}?t=${Date.now()}`);
      setActive({ ...r.data, usage: r.usage });
      setMeta({ alt: r.data.alt ?? "", caption: r.data.caption ?? "", kind: r.data.kind, name: r.data.originalName, folderId: r.data.folderId ? String(r.data.folderId) : "" });
    } catch { /* keep the row we already have */ }
  };

  const uploadFiles = async (files: File[], folderId: number | null) => {
    if (!canWrite) return;
    const list = files.filter((f) => f.size > 0);
    if (!list.length) return;
    const jobs: UploadJob[] = list.map((f, i) => ({ key: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`, name: f.name, pct: 0, state: "uploading" }));
    setUploads((prev) => [...jobs, ...prev].slice(0, 40));
    let savedBytes = 0;
    await Promise.all(list.map(async (f, i) => {
      const key = jobs[i].key;
      await upload([f], {
        folderId,
        compressImages: compress,
        onCompressed: (_name, saved) => { savedBytes += saved; },
        onProgress: (_name, pct) => setUploads((prev) => prev.map((j) => (j.key === key ? { ...j, pct } : j))),
        onError: (_name, message) => setUploads((prev) => prev.map((j) => (j.key === key ? { ...j, state: "error", message } : j))),
      });
      setUploads((prev) => prev.map((j) => (j.key === key && j.state !== "error" ? { ...j, pct: 100, state: "done" } : j)));
    }));
    if (savedBytes > 0) toast(`Compressed images by ${bytes(savedBytes)} before upload`, "info");
    refresh();
  };

  const moveMedia = async (ids: number[], folderId: number | null) => {
    if (!ids.length) return;
    try {
      await api("/api/admin/media/bulk", { method: "POST", body: JSON.stringify({ ids, folderId }) });
      toast(`${ids.length} file${ids.length === 1 ? "" : "s"} moved${folderId ? " into the folder" : " to the root"}`);
      setSelection(new Set());
      refresh();
    } catch (e) { toast((e as Error).message, "error"); }
  };

  const moveFolder = async (id: number, parentId: number | null) => {
    if (id === parentId) return;
    try {
      await api(`/api/admin/media/folders/${id}`, { method: "PATCH", body: JSON.stringify({ parentId }) });
      toast("Folder moved");
      refresh();
    } catch (e) { toast((e as Error).message, "error"); }
  };

  const onDropInto = async (e: DragEvent, folderId: number | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) { await uploadFiles(files, folderId); return; }
    const folderIdRaw = e.dataTransfer.getData(DND_FOLDER);
    if (folderIdRaw) { await moveFolder(Number(folderIdRaw), folderId); return; }
    const mediaRaw = e.dataTransfer.getData(DND_MEDIA);
    if (mediaRaw) {
      try { await moveMedia(JSON.parse(mediaRaw) as number[], folderId); } catch { /* malformed drag payload */ }
    }
  };

  const dropProps = (folderId: number | null, key: string) => ({
    onDragOver: (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setDropTarget(key); },
    onDragLeave: (e: DragEvent) => { e.stopPropagation(); setDropTarget((t) => (t === key ? null : t)); },
    onDrop: (e: DragEvent) => void onDropInto(e, folderId),
  });

  const downloadItem = async (m: MediaRow) => {
    setDownloadPct((p) => ({ ...p, [m.id]: 0 }));
    try {
      const res = await fetch(m.url, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const length = Number(res.headers.get("content-length") || 0);
      const reader = res.body?.getReader();
      const chunks: BlobPart[] = [];
      let loaded = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) { chunks.push(value as unknown as BlobPart); loaded += value.byteLength; }
          setDownloadPct((p) => ({ ...p, [m.id]: length ? Math.round((loaded / length) * 100) : null }));
        }
      }
      const url = URL.createObjectURL(new Blob(chunks, { type: m.mimeType }));
      const a = document.createElement("a");
      a.href = url; a.download = m.originalName; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast("Downloaded");
    } catch {
      // R2 redirects are cross-origin (no CORS, no progress) — let the browser
      // perform the download directly, which still works.
      const a = document.createElement("a");
      a.href = m.url; a.download = m.originalName; document.body.appendChild(a); a.click(); a.remove();
    } finally {
      setDownloadPct((p) => { const next = { ...p }; delete next[m.id]; return next; });
    }
  };

  const saveItem = async () => {
    if (!active) return;
    setSaving(true);
    try {
      await api(`/api/admin/media/${active.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          alt: meta.alt || null,
          caption: meta.caption || null,
          kind: meta.kind,
          originalName: meta.name,
          folderId: meta.folderId ? Number(meta.folderId) : null,
        }),
      });
      toast("File updated");
      setActive(null);
      refresh();
    } catch (e) { toast((e as Error).message, "error"); } finally { setSaving(false); }
  };

  const removeItem = async (force = false) => {
    if (!active) return;
    try {
      await api(`/api/admin/media/${active.id}${force ? "?force=1" : ""}`, { method: "DELETE" });
      toast("Deleted");
      setActive(null);
      refresh();
    } catch (e) { toast((e as Error).message, "error"); }
  };

  const submitFolder = async () => {
    if (!folderModal) return;
    setSaving(true);
    try {
      if (folderModal.mode === "new") {
        await api("/api/admin/media/folders", { method: "POST", body: JSON.stringify({ name: folderName, parentId: folderModal.parentId }) });
        toast("Folder created");
      } else if (folderModal.folder) {
        await api(`/api/admin/media/folders/${folderModal.folder.id}`, { method: "PATCH", body: JSON.stringify({ name: folderName }) });
        toast("Folder renamed");
      }
      setFolderModal(null);
      refresh();
    } catch (e) { toast((e as Error).message, "error"); } finally { setSaving(false); }
  };

  const deleteFolder = async () => {
    if (!folderToDelete) return;
    try {
      await api(`/api/admin/media/folders/${folderToDelete.id}?force=1`, { method: "DELETE" });
      toast("Folder deleted");
      if (current === folderToDelete.id) setCurrent(folderToDelete.parentId);
      setFolderToDelete(null);
      refresh();
    } catch (e) { toast((e as Error).message, "error"); }
  };

  const deleteSelected = async () => {
    const ids = [...selection];
    try {
      await api("/api/admin/media/bulk", { method: "DELETE", body: JSON.stringify({ ids }) });
      toast(`${ids.length} file${ids.length === 1 ? "" : "s"} deleted`);
      setSelection(new Set());
      setBulkConfirm(false);
      refresh();
    } catch (e) { toast((e as Error).message, "error"); }
  };

  const toggleSelect = (id: number) =>
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const go = (folderId: number | null) => { setCurrent(folderId); setPage(1); setSelection(new Set()); setDropTarget(null); };

  const renderItem = (m: MediaRow) => {
    const selected = selection.has(m.id);
    const pct = downloadPct[m.id];
    const dragStart = (e: DragEvent) => {
      const ids = selected ? [...selection] : [m.id];
      e.dataTransfer.setData(DND_MEDIA, JSON.stringify(ids));
      e.dataTransfer.effectAllowed = "move";
    };
    const onClick = (e: { metaKey: boolean; ctrlKey: boolean; preventDefault: () => void }) => {
      if (e.metaKey || e.ctrlKey) { e.preventDefault(); toggleSelect(m.id); } else void openItem(m);
    };
    const checkbox = (
      <button
        type="button"
        aria-label={selected ? "Deselect" : "Select"}
        onClick={(e) => { e.stopPropagation(); toggleSelect(m.id); }}
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-md border bg-white/90 transition",
          selected ? "border-brand text-brand" : "border-ink/20 text-charcoal/30 opacity-0 group-hover:opacity-100",
          view === "details" ? "opacity-100" : "absolute left-1.5 top-1.5",
        )}
      ><Check className="h-3.5 w-3.5" /></button>
    );
    const download = (
      <button
        type="button"
        aria-label="Download"
        title={typeof pct === "number" ? `Downloading ${pct}%` : "Download"}
        onClick={(e) => { e.stopPropagation(); void downloadItem(m); }}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md",
          view === "details" ? "text-charcoal/60 hover:bg-slate-100" : "absolute right-1.5 top-1.5 bg-black/55 text-white opacity-0 transition group-hover:opacity-100",
        )}
      >
        {pct === undefined ? <Download className="h-3.5 w-3.5" /> : <span className="text-[9.5px] font-semibold">{pct === null ? "…" : `${pct}%`}</span>}
      </button>
    );

    if (view === "details") {
      return (
        <tr
          key={m.id}
          draggable
          onDragStart={dragStart}
          onClick={onClick}
          className={cn("cursor-pointer border-t border-ink/5 hover:bg-slate-50", selected && "bg-brand/5")}
        >
          <td className="px-3 py-2">{checkbox}</td>
          <td className="max-w-[320px] px-2 py-2">
            <div className="flex items-center gap-2">
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-slate-50"><MediaThumb m={m} /></div>
              <span className="truncate font-medium">{m.originalName}</span>
            </div>
          </td>
          <td className="px-2 py-2 text-mist">{m.mimeType}</td>
          <td className="px-2 py-2">{bytes(m.size)}</td>
          <td className="px-2 py-2 text-mist">{m.width ? `${m.width}×${m.height}` : "—"}</td>
          <td className="px-2 py-2 text-mist">{formatDateTime(m.createdAt)}</td>
          <td className="px-2 py-2">{download}</td>
        </tr>
      );
    }

    return (
      <div
        key={m.id}
        draggable
        onDragStart={dragStart}
        onClick={onClick}
        className={cn("group relative cursor-pointer overflow-hidden rounded-xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md", selected ? "border-brand ring-2 ring-brand/40" : "border-ink/8")}
      >
        <div className="relative aspect-[4/3] bg-slate-50"><MediaThumb m={m} /></div>
        {checkbox}
        {download}
        <div className="p-2.5">
          <div className="truncate text-[12.5px] font-medium">{m.originalName}</div>
          <div className="text-[10.5px] text-mist">{bytes(m.size)}{m.width ? ` · ${m.width}×${m.height}` : ""}</div>
        </div>
      </div>
    );
  };

  const renderTree = (parentId: number | null, depth: number): ReactNode =>
    folders
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => (
        <div key={f.id}>
          <div
            {...dropProps(f.id, `folder-${f.id}`)}
            className={cn(
              "group flex items-center gap-1 rounded-lg pr-1 transition",
              current === f.id ? "bg-brand/10 text-brand" : "hover:bg-slate-50",
              dropTarget === `folder-${f.id}` && "ring-2 ring-brand/60",
            )}
            draggable
            onDragStart={(e) => { e.dataTransfer.setData(DND_FOLDER, String(f.id)); e.dataTransfer.effectAllowed = "move"; }}
          >
            <button type="button" onClick={() => go(f.id)} className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left text-[12.5px]" style={{ paddingLeft: 8 + depth * 12 }}>
              <Folder className={cn("h-3.5 w-3.5 shrink-0", current === f.id ? "text-brand" : "text-charcoal/40")} />
              <span className="truncate">{f.name}</span>
              <span className="ml-auto shrink-0 text-[10.5px] text-mist">{f.count}</span>
            </button>
            {canWrite && (
              <span className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100">
                <button type="button" title="Rename" aria-label="Rename folder" className="rounded p-1 text-charcoal/50 hover:text-ink" onClick={() => { setFolderName(f.name); setFolderModal({ mode: "rename", parentId: f.parentId, folder: f }); }}><Pencil className="h-3 w-3" /></button>
                <button type="button" title="Delete" aria-label="Delete folder" className="rounded p-1 text-charcoal/50 hover:text-red-600" onClick={() => setFolderToDelete(f)}><Trash2 className="h-3 w-3" /></button>
              </span>
            )}
          </div>
          {renderTree(f.id, depth + 1)}
        </div>
      ));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Media Library</h1>
          <p className="text-[13px] text-mist">{total} {search ? "matching files" : "files here"} · folders, drag &amp; drop, downloads</p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <input ref={fileRef} type="file" multiple className="hidden" onChange={async (e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; if (files.length) await uploadFiles(files, current); }} />
            <Btn variant="secondary" onClick={openDrive}><Cloud className="h-4 w-4" /> Drive</Btn>
            <Btn variant="secondary" onClick={() => { setFolderName(""); setFolderModal({ mode: "new", parentId: current }); }}><FolderPlus className="h-4 w-4" /> New folder</Btn>
            <Btn loading={uploading} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Upload</Btn>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Folder tree */}
        <aside className="w-full shrink-0 rounded-2xl border border-ink/8 bg-white p-2 shadow-sm lg:w-64">
          <div
            {...dropProps(null, "tree-root")}
            className={cn("rounded-lg", dropTarget === "tree-root" && "ring-2 ring-brand/60")}
          >
            <button type="button" onClick={() => go(null)} className={cn("flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12.5px]", current === null ? "bg-brand/10 text-brand" : "hover:bg-slate-50")}>
              <Home className="h-3.5 w-3.5" />
              <span className="font-medium">Library root</span>
              <span className="ml-auto text-[10.5px] text-mist">{rootCount}</span>
            </button>
          </div>
          <div className="mt-1 space-y-0.5">{renderTree(null, 0)}</div>
          {folders.length === 0 && <p className="px-2 py-3 text-[11.5px] text-mist">No folders yet — create one to organise files.</p>}
        </aside>

        <div className="min-w-0 flex-1 space-y-3">
          {/* Breadcrumbs + tools */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-ink/8 bg-white p-2.5 shadow-sm">
            <nav className="flex min-w-0 items-center gap-0.5 text-[12.5px]" aria-label="Breadcrumb">
              <button type="button" onClick={() => go(null)} className="rounded px-1.5 py-1 text-charcoal/70 hover:bg-slate-50 hover:text-ink">Media</button>
              {path.map((f) => (
                <span key={f.id} className="flex min-w-0 items-center">
                  <ChevronRight className="h-3 w-3 shrink-0 text-mist" />
                  <button type="button" onClick={() => go(f.id)} className="max-w-[180px] truncate rounded px-1.5 py-1 text-charcoal/70 hover:bg-slate-50 hover:text-ink">{f.name}</button>
                </span>
              ))}
            </nav>
            <div className="relative ml-auto min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all files…" className={cn(inputCls, "pl-9")} />
            </div>
            <select value={kind} onChange={(e) => { setPage(1); setKind(e.target.value); }} className={cn(inputCls, "w-auto")} aria-label="Type">
              <option value="">All types</option>
              <option value="image">Images</option>
              <option value="logo">Logos</option>
              <option value="video">Videos</option>
              <option value="document">Documents</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className={cn(inputCls, "w-auto")} aria-label="Sort">
              <option value="createdAt:desc">Newest</option>
              <option value="createdAt:asc">Oldest</option>
              <option value="filename:asc">Name A–Z</option>
              <option value="size:desc">Largest</option>
            </select>
            <div className="flex items-center gap-0.5 rounded-lg border border-ink/10 p-0.5" role="group" aria-label="View">
              <button type="button" aria-label="Large icons" aria-pressed={view === "icons"} title="Large icons" onClick={() => changeView("icons")} className={cn("rounded-md p-1.5 transition", view === "icons" ? "bg-ink text-white" : "text-charcoal/60 hover:bg-slate-100")}><LayoutGrid className="h-4 w-4" /></button>
              <button type="button" aria-label="Details" aria-pressed={view === "details"} title="Details" onClick={() => changeView("details")} className={cn("rounded-md p-1.5 transition", view === "details" ? "bg-ink text-white" : "text-charcoal/60 hover:bg-slate-100")}><Table className="h-4 w-4" /></button>
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink/10 px-2 py-1.5 text-[11.5px] text-charcoal/70" title="Re-encode images in the browser before upload">
              <input
                type="checkbox"
                checked={compress}
                onChange={(e) => { setCompress(e.target.checked); try { localStorage.setItem("mh-media-compress", e.target.checked ? "1" : "0"); } catch { /* ignore */ } }}
                className="h-3.5 w-3.5 accent-emerald-600"
              />
              Compress images
            </label>
          </div>

          {search && <p className="text-[12px] text-mist">Searching every folder for “{search}”.</p>}

          {selection.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-[12.5px]">
              <span className="font-medium">{selection.size} selected</span>
              <select
                className={cn(inputCls, "w-auto")}
                value=""
                onChange={(e) => { const v = e.target.value; if (!v) return; void moveMedia([...selection], v === "root" ? null : Number(v)); e.currentTarget.value = ""; }}
                aria-label="Move selection"
              >
                <option value="">Move to…</option>
                <option value="root">Library root</option>
                {folderOptions.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              <Btn size="sm" variant="danger" onClick={() => setBulkConfirm(true)}><Trash2 className="h-3.5 w-3.5" /> Delete</Btn>
              <Btn size="sm" variant="ghost" onClick={() => setSelection(new Set())}><X className="h-3.5 w-3.5" /> Clear</Btn>
            </div>
          )}

          <div
            {...dropProps(current, "grid")}
            className={cn("min-h-[320px] rounded-2xl border-2 border-dashed p-3 transition", dropTarget === "grid" ? "border-brand bg-brand/5" : "border-transparent")}
          >
            {!search && subfolders.length > 0 && (
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {subfolders.map((f) => (
                  <div
                    key={f.id}
                    {...dropProps(f.id, `card-${f.id}`)}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData(DND_FOLDER, String(f.id)); e.dataTransfer.effectAllowed = "move"; }}
                    onDoubleClick={() => go(f.id)}
                    className={cn("group flex cursor-pointer items-center gap-2 rounded-xl border border-ink/8 bg-white px-3 py-2.5 shadow-sm transition hover:border-brand/40 hover:shadow", dropTarget === `card-${f.id}` && "ring-2 ring-brand/60")}
                    onClick={() => go(f.id)}
                  >
                    <Folder className="h-5 w-5 shrink-0 text-brand/70" />
                    <div className="min-w-0"><div className="truncate text-[12.5px] font-medium">{f.name}</div><div className="text-[10.5px] text-mist">{f.count} item{f.count === 1 ? "" : "s"}</div></div>
                    <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-mist" />
                  </div>
                ))}
              </div>
            )}

            {loading && items.length === 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="skeleton aspect-square rounded-xl" />)}</div>
            ) : items.length === 0 ? (
              <EmptyState
                title={search ? "Nothing matches" : "This folder is empty"}
                description={canWrite ? "Drop files anywhere in this area to upload them here, or use Upload." : undefined}
              />
            ) : view === "details" ? (
              <div className="overflow-x-auto rounded-xl border border-ink/8 bg-white">
                <table className="w-full min-w-[680px] text-left text-[12.5px]">
                  <thead className="bg-slate-50 text-[10.5px] uppercase tracking-wider text-charcoal/60">
                    <tr>
                      <th className="w-8 px-3 py-2"><span className="sr-only">Select</span></th>
                      <th className="px-2 py-2">Name</th>
                      <th className="px-2 py-2">Type</th>
                      <th className="px-2 py-2">Size</th>
                      <th className="px-2 py-2">Dimensions</th>
                      <th className="px-2 py-2">Added</th>
                      <th className="w-10 px-2 py-2"><span className="sr-only">Download</span></th>
                    </tr>
                  </thead>
                  <tbody>{items.map(renderItem)}</tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{items.map(renderItem)}</div>
            )}
          </div>

          <div className="flex items-center justify-between text-[12.5px] text-mist">
            <span>Page {page} of {pages}</span>
            <div className="flex gap-1">
              <Btn size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Btn>
              <Btn size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Btn>
            </div>
          </div>
        </div>
      </div>

      {/* Upload progress stack */}
      {uploads.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 w-[300px] overflow-hidden rounded-xl border border-ink/10 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-ink/8 px-3 py-2 text-[12px] font-medium">
            <span>Transfers</span>
            <button type="button" aria-label="Dismiss transfers" onClick={() => setUploads([])}><X className="h-3.5 w-3.5 text-charcoal/50" /></button>
          </div>
          <div className="max-h-56 space-y-2 overflow-y-auto p-3">
            {uploads.map((j) => (
              <div key={j.key}>
                <div className="flex items-center gap-2 text-[11.5px]">
                  <span className="min-w-0 flex-1 truncate">{j.name}</span>
                  {j.state === "error" ? <span className="text-red-600">failed</span> : j.state === "done" ? <span className="text-emerald-600">done</span> : <span className="text-mist">{j.pct === null ? "…" : `${j.pct}%`}</span>}
                </div>
                {j.state !== "done" && (
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                    <div className={cn("h-full rounded-full transition-[width]", j.state === "error" ? "bg-red-500" : "bg-brand")} style={{ width: `${j.pct ?? 35}%` }} />
                  </div>
                )}
                {j.message && <p className="mt-0.5 truncate text-[10.5px] text-red-600">{j.message}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File details */}
      <Modal open={!!active} onClose={() => setActive(null)} title={active?.originalName ?? ""} wide>
        {active && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-ink/8 bg-slate-50">
              {active.mimeType.startsWith("video/") ? <video src={active.url} controls className="w-full" /> : active.mimeType === "application/pdf" ? <iframe src={active.url} title={active.filename} className="h-[420px] w-full" /> : <div className="relative aspect-[4/3]"><MediaThumb m={active} className="object-contain" /></div>}
              <div className="flex gap-2 p-2">
                <button type="button" onClick={() => void downloadItem(active)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-[12.5px] font-medium text-white transition hover:bg-brand">
                  {downloadPct[active.id] === undefined ? <Download className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {typeof downloadPct[active.id] === "number" ? `Downloading ${downloadPct[active.id]}%` : "Download"}
                </button>
              </div>
            </div>
            <div className="space-y-4 text-[13px]">
              <dl className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-[12px]">
                <dt className="text-mist">Type</dt><dd className="truncate">{active.mimeType}</dd>
                <dt className="text-mist">Size</dt><dd>{bytes(active.size)}</dd>
                {active.width && <><dt className="text-mist">Dimensions</dt><dd>{active.width} × {active.height}</dd></>}
                <dt className="text-mist">Uploaded</dt><dd>{formatDateTime(active.createdAt)}</dd>
                <dt className="text-mist">URL</dt><dd className="flex items-center gap-1 truncate"><code className="truncate">{active.url}</code><button type="button" onClick={() => { navigator.clipboard.writeText(`${location.origin}${active.url}`); toast("URL copied", "info"); }} aria-label="Copy URL"><Copy className="h-3.5 w-3.5" /></button></dd>
              </dl>
              <div><label className={labelCls}>File name</label><input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} className={inputCls} disabled={!canWrite} /></div>
              <div><label className={labelCls}>Alt text</label><input value={meta.alt} onChange={(e) => setMeta({ ...meta, alt: e.target.value })} className={inputCls} disabled={!canWrite} /></div>
              <div><label className={labelCls}>Caption</label><input value={meta.caption} onChange={(e) => setMeta({ ...meta, caption: e.target.value })} className={inputCls} disabled={!canWrite} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Category</label>
                  <select value={meta.kind} onChange={(e) => setMeta({ ...meta, kind: e.target.value })} className={inputCls} disabled={!canWrite}>
                    <option value="image">Image</option><option value="logo">Logo</option><option value="video">Video</option><option value="document">Document</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Folder</label>
                  <select value={meta.folderId} onChange={(e) => setMeta({ ...meta, folderId: e.target.value })} className={inputCls} disabled={!canWrite}>
                    <option value="">Library root</option>
                    {folderOptions.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div className={labelCls}>Usage {active.usage ? `(${active.usage.total})` : ""}</div>
                {active.usage ? (
                  active.usage.total === 0 ? <p className="text-mist">Not used anywhere yet.</p> : (
                    <ul className="space-y-1 text-[12.5px]">
                      {active.usage.projects.map((p) => <li key={`p${p.id}`}><Link2 className="mr-1 inline h-3 w-3" /><Link href={`/admin/projects/${p.id}`} className="text-brand hover:underline">Project: {p.name}</Link></li>)}
                      {active.usage.markets.map((p) => <li key={`m${p.id}`}><Link2 className="mr-1 inline h-3 w-3" /><Link href={`/admin/markets/${p.id}`} className="text-brand hover:underline">Market: {p.name}</Link></li>)}
                      {active.usage.sections.map((p) => <li key={`s${p.id}`}><Link2 className="mr-1 inline h-3 w-3" /><span>Section: {p.name}</span></li>)}
                      {active.usage.testimonials.map((p) => <li key={`t${p.id}`}>Testimonial: {p.name}</li>)}
                      {active.usage.seo.map((p) => <li key={`o${p.id}`}>SEO: {p.name}</li>)}
                      {active.usage.settings && <li><Link href="/admin/settings" className="text-brand hover:underline">Site settings</Link></li>}
                    </ul>
                  )
                ) : <p className="text-mist">Checking…</p>}
              </div>
              {canWrite && (
                <div className="flex flex-wrap gap-2 border-t border-ink/8 pt-4">
                  <Btn loading={saving} onClick={saveItem}>Save</Btn>
                  <input ref={replaceRef} type="file" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f || !active) return; const fd = new FormData(); fd.append("file", f); try { await api(`/api/admin/media/${active.id}`, { method: "POST", body: fd }); toast("File replaced — all usages updated"); setActive(null); refresh(); } catch (err) { toast((err as Error).message, "error"); } e.target.value = ""; }} />
                  <Btn variant="secondary" onClick={() => replaceRef.current?.click()}><RefreshCw className="h-4 w-4" /> Replace</Btn>
                  <Btn variant="danger" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" /> Delete</Btn>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!folderModal} onClose={() => setFolderModal(null)} title={folderModal?.mode === "rename" ? "Rename folder" : "New folder"}>
        <label className={labelCls}>Folder name</label>
        <input
          autoFocus
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && folderName.trim()) void submitFolder(); }}
          className={inputCls}
          placeholder="e.g. Taormina assets"
        />
        {folderModal?.mode === "new" && <p className="mt-2 text-[11.5px] text-mist">Created inside {current ? path[path.length - 1]?.name ?? "the current folder" : "the library root"}.</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Btn variant="secondary" onClick={() => setFolderModal(null)}>Cancel</Btn>
          <Btn loading={saving} disabled={!folderName.trim()} onClick={submitFolder}>{folderModal?.mode === "rename" ? "Rename" : "Create"}</Btn>
        </div>
      </Modal>

      <Modal open={driveOpen} onClose={() => setDriveOpen(false)} title="Google Drive" wide>
        {driveError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{driveError}</p>}
        {!driveStatus ? (
          <div className="space-y-2"><div className="skeleton h-4 w-40 rounded" /><div className="skeleton h-4 w-64 rounded" /></div>
        ) : !driveStatus.configured ? (
          <div className="space-y-3 text-[13px] text-charcoal">
            <p>
              This connector is built and ready, but Google requires OAuth credentials owned by you. Until they exist it stays
              inactive — nothing is faked.
            </p>
            <ol className="list-decimal space-y-1.5 pl-5 text-[12.5px] text-charcoal/80">
              <li>Google Cloud Console → enable the <strong>Google Drive API</strong>.</li>
              <li>Create an OAuth client of type <strong>Web application</strong>.</li>
              <li>Authorised redirect URI: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11.5px]">{driveStatus.redirectUri}</code></li>
              <li>Add <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11.5px]">GOOGLE_CLIENT_ID</code> and <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11.5px]">GOOGLE_CLIENT_SECRET</code> to <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11.5px]">.env</code> (and Vercel), then restart.</li>
            </ol>
          </div>
        ) : !driveStatus.connected ? (
          <div className="space-y-4 text-[13px]">
            <p>Connect your Google account to browse Drive images, videos and PDFs and import them here. Imports are filed under <strong>Google Drive / YYYY-MM</strong> automatically.</p>
            <a href={driveConnectHref} className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-brand">
              <Cloud className="h-4 w-4" /> Connect Google Drive
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
              <p>
                Connected as <strong>{driveStatus.email ?? "Google account"}</strong> · imports go to{" "}
                <strong>{current === null ? "Library root" : path[path.length - 1]?.name ?? "folder"} → Google Drive / {new Date().toISOString().slice(0, 7)}</strong>
              </p>
              <button type="button" onClick={disconnectDrive} className="text-[12px] text-red-600 hover:underline">Disconnect</button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
              <button type="button" onClick={goDriveRoot} className={cn("inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-ink/5", drivePath.length === 0 && !driveQuery && "bg-ink/5 font-medium")}>
                <Home className="h-3.5 w-3.5" /> My Drive
              </button>
              {drivePath.map((p, i) => (
                <span key={p.id} className="flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 text-mist" />
                  <button
                    type="button"
                    onClick={() => {
                      const next = drivePath.slice(0, i + 1);
                      setDrivePath(next);
                      setDriveFolder(p.id);
                      setDriveSelected(new Set());
                      setDriveQuery("");
                      void loadDrive(p.id, "");
                    }}
                    className="rounded-lg px-1.5 py-1 hover:bg-ink/5"
                  >
                    {p.name}
                  </button>
                </span>
              ))}
              <div className="relative ml-auto">
                <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-mist" />
                <input value={driveQuery} onChange={(e) => setDriveQuery(e.target.value)} placeholder="Search this Drive" className={cn(inputCls, "h-8 w-52 pl-8 text-[12px]")} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-mist">
              <span>{driveEntries.filter((e) => !e.isFolder).length} file(s), {driveEntries.filter((e) => e.isFolder).length} folder(s)</span>
              {driveQuery.trim() && <span>· searching inside {driveFolder === "root" ? "My Drive" : drivePath[drivePath.length - 1]?.name ?? "this folder"} (recursive)</span>}
              {driveTruncated && <span className="text-amber-600">· partial results (scan limit) — narrow the search or open a subfolder</span>}
              <button type="button" onClick={() => void loadDrive(driveFolder, driveQuery.trim())} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-charcoal/70 hover:bg-ink/5">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>

            {driveLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
            ) : (
              <div className="max-h-[52vh] divide-y divide-ink/5 overflow-y-auto rounded-xl border border-ink/8">
                {driveEntries.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 px-3 py-2 text-[12.5px]">
                    {f.isFolder ? (
                      <button type="button" onClick={() => openDriveFolder(f)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{f.name}</div>
                          <div className="text-[10.5px] text-mist">Folder</div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-mist" />
                      </button>
                    ) : (
                      <>
                        <input
                          type="checkbox"
                          checked={driveSelected.has(f.id)}
                          onChange={() => toggleDriveSelect(f.id)}
                          disabled={Boolean(f.imported) || driveBusy}
                          aria-label={`Select ${f.name}`}
                          className="h-3.5 w-3.5 accent-ink"
                        />
                        <button type="button" onClick={() => setDrivePreview(f)} title="Preview" className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <Cloud className="h-4 w-4 shrink-0 text-charcoal/40" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{f.name}</div>
                            <div className="text-[10.5px] text-mist">{f.mimeType}{f.size ? ` · ${bytes(f.size)}` : ""}{f.modifiedTime ? ` · ${formatDateTime(f.modifiedTime)}` : ""}</div>
                          </div>
                        </button>
                        {f.imported && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600"><Check className="h-3.5 w-3.5" /> Imported</span>
                        )}
                      </>
                    )}
                  </div>
                ))}
                {driveEntries.length === 0 && !driveError && (
                  <p className="p-4 text-[12.5px] text-mist">{driveQuery.trim() ? "No Drive files match that search." : "This folder is empty."}</p>
                )}
                {driveNext && (
                  <div className="p-2 text-center">
                    <button type="button" onClick={() => void loadDrive(driveFolder, driveQuery.trim(), driveNext)} disabled={driveLoading} className="text-[12px] font-medium text-brand hover:underline disabled:opacity-50">
                      {driveLoading ? "Loading…" : "Load more files"}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-ink/8 pt-3">
              <button
                type="button"
                onClick={() => setDriveSelected(new Set(driveEntries.filter((e) => !e.isFolder && !e.imported).map((e) => e.id)))}
                className="text-[12px] text-charcoal/70 hover:underline"
              >
                Select all
              </button>
              <button type="button" onClick={() => setDriveSelected(new Set())} className="text-[12px] text-charcoal/70 hover:underline">Clear</button>
              <span className="text-[12px] text-mist">{driveSelected.size} selected</span>
              <select
                value={driveOptimize}
                onChange={(e) => setDriveOptimize(e.target.value as "lossless" | "balanced" | "off")}
                aria-label="Image optimisation"
                className={cn(inputCls, "ml-2 h-8 w-[11.5rem] text-[12px]")}
              >
                <option value="balanced">Balanced (WebP 90%) — compresses</option>
                <option value="lossless">Pixel-perfect (JPEG untouched)</option>
                <option value="off">Original bytes</option>
              </select>
              <div className="ml-auto flex gap-2">
                {driveFolder !== "root" && (
                  <Btn variant="secondary" loading={driveBusy} onClick={() => void importDriveFolder()}>
                    <FolderInput className="h-4 w-4" /> Import this folder
                  </Btn>
                )}
                <Btn loading={driveBusy} disabled={!driveSelected.size} onClick={() => void importSelectedFromDrive()}>
                  <Cloud className="h-4 w-4" /> Import selected{driveSelected.size ? ` (${driveSelected.size})` : ""}
                </Btn>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!drivePreview} onClose={() => setDrivePreview(null)} title={drivePreview?.name ?? "Drive file"} wide>
        {drivePreview && (
          <div className="space-y-3">
            <div className="flex max-h-[55vh] min-h-[240px] items-center justify-center overflow-auto rounded-xl border border-ink/8 bg-slate-50 p-2">
              {drivePreview.mimeType.startsWith("image/") ? (
                <img
                  key={drivePreview.id}
                  src={`/api/admin/integrations/google/file/${drivePreview.id}`}
                  alt={drivePreview.name}
                  className="max-h-[50vh] max-w-full rounded-lg object-contain"
                />
              ) : drivePreview.mimeType.startsWith("video/") ? (
                <video
                  key={drivePreview.id}
                  src={`/api/admin/integrations/google/file/${drivePreview.id}`}
                  controls
                  className="max-h-[50vh] w-full rounded-lg bg-black"
                />
              ) : drivePreview.mimeType === "application/pdf" ? (
                <iframe
                  key={drivePreview.id}
                  title={drivePreview.name}
                  src={`/api/admin/integrations/google/file/${drivePreview.id}`}
                  className="h-[50vh] w-full rounded-lg"
                />
              ) : (
                <p className="p-6 text-[13px] text-mist">
                  No inline preview for {drivePreview.mimeType}. Use Download or Open in Drive.
                </p>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-2 text-[12.5px]">
              <div><dt className="text-mist">Type</dt><dd>{drivePreview.mimeType}</dd></div>
              <div><dt className="text-mist">Size</dt><dd>{drivePreview.size ? bytes(drivePreview.size) : "—"}</dd></div>
              <div><dt className="text-mist">Modified</dt><dd>{drivePreview.modifiedTime ? formatDateTime(drivePreview.modifiedTime) : "—"}</dd></div>
              <div><dt className="text-mist">In library</dt><dd>{drivePreview.imported ? "Yes" : "Not yet"}</dd></div>
            </dl>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink/8 pt-3">
              <a
                href={`https://drive.google.com/open?id=${drivePreview.id}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg px-3 py-2 text-[12.5px] font-medium text-charcoal/80 hover:bg-ink/5"
              >
                Open in Drive
              </a>
              <a
                href={`/api/admin/integrations/google/file/${drivePreview.id}?download=1`}
                className="rounded-lg px-3 py-2 text-[12.5px] font-medium text-charcoal/80 hover:bg-ink/5"
              >
                Download
              </a>
              <Btn loading={driveBusy} disabled={Boolean(drivePreview.imported)} onClick={() => void importSingleFromDrive(drivePreview)}>
                <Cloud className="h-4 w-4" /> {drivePreview.imported ? "Imported" : "Import"}
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      <Confirm open={confirm} onClose={() => setConfirm(false)} title="Delete this file?" message={active?.usage?.total ? `This file is referenced in ${active.usage.total} place(s). Deleting will break those references.` : "This permanently deletes the file."} confirmLabel="Delete" danger onConfirm={() => removeItem(!!active?.usage?.total)} />
      <Confirm open={bulkConfirm} onClose={() => setBulkConfirm(false)} title={`Delete ${selection.size} file(s)?`} message="This permanently removes the selected files, including any that are referenced on the site. This cannot be undone." confirmLabel="Delete all" danger onConfirm={deleteSelected} />
      <Confirm
        open={!!folderToDelete}
        onClose={() => setFolderToDelete(null)}
        title={`Delete “${folderToDelete?.name ?? ""}”?`}
        message={`This deletes the folder, its ${folderToDelete?.count ?? 0} file(s) and every subfolder inside it. This cannot be undone.`}
        confirmLabel="Delete folder"
        danger
        onConfirm={deleteFolder}
      />
    </div>
  );
}
