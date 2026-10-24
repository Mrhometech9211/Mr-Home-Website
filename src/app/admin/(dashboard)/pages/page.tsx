"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileText, MoreHorizontal, Pencil, Globe, Archive, Trash2 } from "lucide-react";
import { api, Badge, Btn, Confirm, EmptyState, Skeleton, useToast } from "@/components/admin/ui";
import { deferInitialLoad } from "@/lib/defer-load";
import type { BuilderPage } from "@/lib/page-builder";

/** Built-in public pages: they already exist as routes (edited via Content/Settings), listed read-only. */
const SYSTEM_PAGES = [
  { title: "Home", slug: "" },
  { title: "Why Mr.Home", slug: "why-mr-home" },
  { title: "Projects", slug: "projects" },
  { title: "Buy", slug: "buy" },
  { title: "Rent", slug: "rent" },
  { title: "News", slug: "news" },
  { title: "Contact", slug: "contact" },
  { title: "List Your Property", slug: "list-your-property" },
];

type PageRow = {
  id: number;
  title: string;
  slug: string;
  status: "draft" | "published" | "archived";
  updatedAt: string;
};

export default function PagesAdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [pages, setPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [destroying, setDestroying] = useState<number | null>(null);
  const [publishing, setPublishing] = useState<number | null>(null);
  const [confirmDestroy, setConfirmDestroy] = useState<string | null>(null);

  const fetchPages = useCallback(async (withSpinner = false) => {
    if (withSpinner) setLoading(true);
    try {
      const data = await api<{ data: PageRow[] }>("/api/admin/pages");
      setPages(data.data.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to load pages", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const load = useCallback(() => fetchPages(true), [fetchPages]);

  useEffect(() => deferInitialLoad(() => fetchPages(false)), [fetchPages]);

  const destroy = async (id: number, title: string) => {
    setDestroying(id);
    try {
      await api(`/api/admin/pages/${id}`, { method: "DELETE" });
      toast(`“${title}” deleted`, "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not delete the page", "error");
    } finally {
      setDestroying(null);
      setConfirmDestroy(null);
    }
  };

  const statusTone = (status: PageRow["status"]) =>
    status === "published" ? "green" : status === "archived" ? "amber" : "slate";

  const publish = async (id: number, action: "publish" | "unpublish") => {
    setPublishing(id);
    try {
      await api(`/api/admin/pages/${id}/publish`, { method: "POST", body: JSON.stringify({ action }) });
      toast(action === "publish" ? "Page published" : "Page unpublished", "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : `Could not ${action} the page`, "error");
    } finally {
      setPublishing(null);
    }
  };

  if (loading) return <Skeleton className="h-[420px]" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Custom pages</h1>
          <p className="mt-1 text-[13px] text-mist">Create and manage custom content pages. Drafts are private; published pages are visible to visitors.</p>
        </div>
        <Btn variant="primary" size="sm" onClick={() => router.push("/admin/pages/new")}>
          <Plus className="h-4 w-4" /> New page
        </Btn>
      </div>

      <div className="rounded-2xl border border-ink/8 bg-white p-4 shadow-sm">
        <h2 className="text-[13px] font-medium uppercase tracking-wider text-mist">System pages</h2>
        <p className="mt-1 text-[12.5px] text-mist">Built-in site pages — edited from their own sections, not the page builder.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {SYSTEM_PAGES.map((pg) => (
            <a
              key={pg.slug}
              href={pg.slug === "/" ? "/" : `/${pg.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-xl border border-ink/8 bg-slate-50 px-3.5 py-2.5 text-[13px] text-ink transition hover:border-brand/40 hover:bg-white"
            >
              <span className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-mist" /> {pg.title}</span>
            </a>
          ))}
        </div>
      </div>

      {pages.length === 0 ? (
        <EmptyState title="No custom pages yet" description="Create your first page to start adding custom content to the site." />
      ) : (
        <div className="rounded-2xl border border-ink/8 bg-white shadow-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-ink/8">
                <th className="px-5 py-3.5 text-left text-[12.5px] font-medium uppercase text-mist">Page</th>
                <th className="px-5 py-3.5 text-left text-[12.5px] font-medium uppercase text-mist">Status</th>
                <th className="px-5 py-3.5 text-left text-[12.5px] font-medium uppercase text-mist">Slug</th>
                <th className="px-5 py-3.5 text-left text-[12.5px] font-medium uppercase text-mist">Updated</th>
                <th className="px-5 py-3.5 text-right text-[12.5px] font-medium uppercase text-mist">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/6">
              {pages.map((page) => (
                <tr key={page.id} className="hover:bg-slate-50/50">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-mist shrink-0" />
                      <div>
                        <p className="text-[14px] font-medium text-ink">{page.title}</p>
                        <p className="text-[12px] text-mist">Page #{page.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone={statusTone(page.status)}>{page.status}</Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <code className="rounded bg-slate-100 px-1.5 text-[12px] text-ink">/{page.slug}</code>
                  </td>
                  <td className="px-5 py-3.5 text-[12.5px] text-mist">
                    {new Date(page.updatedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Btn variant="ghost" size="sm" onClick={() => router.push(`/admin/pages/${page.id}`)}>
                        <Pencil className="h-4 w-4" /> Edit
                      </Btn>
                      {page.status === "published" && (
                        <a href={`/${page.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg border border-ink/10 px-2.5 py-1.5 text-[12.5px] text-ink hover:bg-slate-50" title="View live page">
                          <Globe className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {page.status === "published" && (
                        <Btn variant="ghost" size="sm" disabled={publishing === page.id} onClick={() => publish(page.id, "unpublish")}>
                          <Archive className="h-4 w-4" /> Unpublish
                        </Btn>
                      )}
                      {page.status !== "published" && (
                        <Btn variant="ghost" size="sm" disabled={publishing === page.id} onClick={() => publish(page.id, "publish")}>
                          <Globe className="h-4 w-4" /> Publish
                        </Btn>
                      )}
                      <Btn variant="ghost" size="sm" onClick={() => setConfirmDestroy(`${page.id}::${page.title}`)} className="text-red-600 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Confirm
        open={confirmDestroy !== null}
        onClose={() => setConfirmDestroy(null)}
        title="Delete this page?"
        message="This will permanently remove the page and its draft snapshots. Published links will stop working. This action cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          const [idStr, title] = (confirmDestroy ?? "").split("::");
          if (idStr) destroy(Number(idStr), title);
        }}
      />
    </div>
  );
}
