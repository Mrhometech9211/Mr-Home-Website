"use client";

import { useEffect, useRef, useState } from "react";
import { deferInitialLoad } from "@/lib/defer-load";
import { FileText, Loader2, Pencil, Trash2, Download } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import { api, Badge, Btn, Confirm, inputCls, useToast } from "./ui";

type Row = {
  id: number;
  projectId: number;
  projectName: string;
  projectSlug: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  allowDownload: boolean;
  downloads: number;
  createdAt: string;
  updatedAt: string;
};

type Project = { id: number; name: string };

function fmtSize(n: number) {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function BrochuresManager({ canWrite, projects }: { canWrite: boolean; projects: Project[] }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadFor, setUploadFor] = useState<"new" | number>("new");
  const [uploadProjectId, setUploadProjectId] = useState<string>("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [replaceId, setReplaceId] = useState<number | null>(null);
  const [deleteRow, setDeleteRow] = useState<Row | null>(null);
  const [previewRow, setPreviewRow] = useState<Row | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const newProjectRef = useRef<HTMLSelectElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api<{ data: Row[]; byProject?: { id: number }[] }>("/api/admin/brochures");
      setRows(d.data);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to load brochures", "error");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => deferInitialLoad(load), []);

  /* Upload: multipart POST. On failure the previous brochure stays untouched. */
  const upload = async (projectId: number, file: File, replaceRow?: Row) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("projectId", String(projectId));
    if (replaceRow) {
      setBusyId(replaceRow.id);
      try {
        await api(`/api/admin/brochures/${replaceRow.id}`, { method: "PATCH", body: fd });
        toast("Brochure replaced");
        await load();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Replacement failed — previous brochure preserved", "error");
      } finally {
        setBusyId(null);
      }
      return;
    }
    try {
      await api("/api/admin/brochures", { method: "POST", body: fd });
      toast("Brochure uploaded");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", "error");
    }
  };

  const toggleDownload = async (r: Row) => {
    setBusyId(r.id);
    try {
      await api(`/api/admin/brochures/${r.id}`, { method: "PATCH", body: JSON.stringify({ allowDownload: !r.allowDownload }) });
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const del = async (r: Row) => {
    try {
      await api(`/api/admin/brochures/${r.id}`, { method: "DELETE" });
      toast("Brochure removed");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete failed", "error");
    }
  };

  const assignedProjectIds = new Set(rows.map((r) => r.projectId));
  const availableProjects = projects.filter((p) => !assignedProjectIds.has(p.id));

  if (loading) return <div className="flex items-center gap-2 text-[14px] text-charcoal/70"><Loader2 className="h-4 w-4 animate-spin" /> Loading brochures…</div>;

  return (
    <div className="space-y-6">
      {canWrite && (
        <div className="rounded-2xl border border-ink/8 bg-white p-5 shadow-card">
          <h2 className="text-[15px] font-semibold text-ink">Upload a brochure</h2>
          <p className="mt-1 text-[13px] text-charcoal/70">Attach a brochure to a project (PDF up to 60 MB). Visitors download it after submitting name, phone, city and country — each download is recorded as a lead.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select
              ref={newProjectRef}
              value={uploadProjectId}
              onChange={(e) => setUploadProjectId(e.target.value)}
              className={cn(inputCls, "w-64")}
              aria-label="Assign brochure to project"
            >
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {assignedProjectIds.has(p.id) ? " (already has brochure — replaces latest)" : ""}
                </option>
              ))}
            </select>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="text-[13px]"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const pid = Number(uploadProjectId);
                if (!Number.isInteger(pid) || pid <= 0) {
                  toast("Select a project first", "error");
                  return;
                }
                if (f.size > 60 * 1024 * 1024) {
                  toast(`File is ${fmtSize(f.size)} — the maximum is 60 MB`, "error");
                  return;
                }
                void upload(pid, f);
              }}
              disabled={!uploadProjectId}
            />
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-ink/8 bg-white shadow-card">
        <table className="w-full text-left text-[13.5px]">
          <thead className="bg-ivory-deep/60 text-[11px] uppercase tracking-wider text-mist">
            <tr>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Downloads</th>
              <th className="px-4 py-3">Download policy</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-charcoal/60">
                  No brochures uploaded yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-ink/6">
                <td className="px-4 py-3 font-medium text-ink">{r.projectName}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-brand" />
                    {r.originalName}
                  </span>
                </td>
                <td className="px-4 py-3 text-charcoal/70">{fmtSize(r.size)}</td>
                <td className="px-4 py-3 text-charcoal/70">{r.downloads}</td>
                <td className="px-4 py-3">
                  {canWrite ? (
                    <button
                      type="button"
                      onClick={() => toggleDownload(r)}
                      disabled={busyId === r.id}
                      className="disabled:opacity-50"
                    >
                      <Badge tone={r.allowDownload ? "green" : "slate"}>
                        {r.allowDownload ? "Download enabled" : "Download disabled"}
                      </Badge>
                    </button>
                  ) : (
                    <Badge tone={r.allowDownload ? "green" : "slate"}>
                      {r.allowDownload ? "Download enabled" : "Download disabled"}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-charcoal/70">{formatDateTime(r.updatedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1" data-testid={`brochure-actions-${r.projectSlug}`}>
                    <Btn
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void setPreviewRow(r);
                        window.open(`/api/admin/brochures/${r.id}/file-preview`, "_blank");
                      }}
                      title="Preview"
                    >
                      <span className="flex items-center gap-1">
                        <Download className="h-3.5 w-3.5" />
                        Preview
                      </span>
                    </Btn>
                    {canWrite && (
                      <>
                        <Btn
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const input = document.createElement("input") as HTMLInputElement;
                            input.type = "file";
                            input.accept = "application/pdf";
                            input.onchange = () => {
                              const f = input.files?.[0];
                              if (!f || !r.projectId) return;
                              if (f.size > 60 * 1024 * 1024) {
                                toast(`File is ${fmtSize(f.size)} — the maximum is 60 MB`, "error");
                                return;
                              }
                              void upload(r.projectId, f, r);
                            };
                            input.click();
                          }}
                          title="Replace (previous file is preserved if the upload fails)"
                        >
                          <span className="flex items-center gap-1">
                            {busyId === r.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Pencil className="h-3.5 w-3.5" />
                            )}
                            Replace
                          </span>
                        </Btn>
                        <Btn variant="ghost" size="sm" onClick={() => setDeleteRow(r)} title="Remove">
                          <span className="flex items-center gap-1">
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </span>
                        </Btn>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deleteRow && (
        <Confirm
          open={Boolean(deleteRow)}
          onClose={() => setDeleteRow(null)}
          title={`Remove brochure for ${deleteRow.projectName}?`}
          message="The project will show a request-details message until a new brochure is uploaded."
          confirmLabel="Remove"
          onConfirm={async () => {
            await del(deleteRow);
            setDeleteRow(null);
          }}
        />
      )}
    </div>
  );
}
