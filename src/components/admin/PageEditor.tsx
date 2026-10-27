"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ExternalLink, Save, ChevronLeft, Eye } from "lucide-react";
import { api, Badge, Btn, Confirm, EmptyState, Skeleton, useToast, Card } from "@/components/admin/ui";
import type { BuilderPage, BuilderSection } from "@/lib/page-builder";
import { PageMetaEditor } from "@/components/admin/Stubs";
import { VisualBuilder } from "@/components/admin/VisualBuilder";
import { formatDate } from "@/lib/utils";

/** pageId 0 → create mode (POST /api/admin/pages, then continue in edit mode). */
export function PageEditor({ pageId }: { pageId: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const creating = pageId === 0;

  const [page, setPage] = useState<BuilderPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState({ title: "", slug: "", navLabel: "", navOrder: 0, navVisible: true, seoTitle: "", seoDescription: "", noIndex: false, ogImage: "" });
  const [metaDirty, setMetaDirty] = useState(false);
  const [sections, setSections] = useState<BuilderSection[]>([]);
  const [revisions, setRevisions] = useState<{ id: number; headline: string; createdAt: string; userName: string | null }[]>([]);
  const [confirmRestore, setConfirmRestore] = useState<{ id: number; headline: string } | null>(null);
  const [confirmDestroy, setConfirmDestroy] = useState(false);

  const fetchPage = useCallback(async () => {
    if (creating) {
      setLoading(false);
      return;
    }
    try {
      const data = await api<{ data: BuilderPage }>(`/api/admin/pages/${pageId}`);
      setPage(data.data);
      const p = data.data;
      setMeta({
        title: p.title,
        slug: p.slug,
        navLabel: p.navLabel ?? "",
        navOrder: p.navOrder ?? 0,
        navVisible: p.navVisible,
        seoTitle: p.seoTitle ?? "",
        seoDescription: p.seoDescription ?? "",
        noIndex: p.noIndex,
        ogImage: p.ogImage ?? "",
      });
      setSections(p.draft);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load the page", "error");
      router.push("/admin/pages");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, router]);

  const fetchRevisions = useCallback(async () => {
    if (creating) return;
    try {
      const data = await api<{ data: { revisions: { id: number; headline: string; createdAt: string; userName: string | null }[] } }>(`/api/admin/pages/${pageId}/revisions`);
      setRevisions(data.data.revisions);
    } catch {
      // revisions are non-fatal
    }
  }, [pageId, creating]);

  useEffect(() => {
    (async () => {
      await fetchPage();
      await fetchRevisions();
    })();
  }, [fetchPage, fetchRevisions]);

  const saveMeta = useCallback(async () => {
    try {
      if (creating) {
        const data = await api<{ data: BuilderPage }>("/api/admin/pages", { method: "POST", body: JSON.stringify(meta) });
        toast("Page created — add sections, then publish", "success");
        router.replace(`/admin/pages/${data.data.id}`);
      } else {
        await api(`/api/admin/pages/${pageId}`, { method: "PATCH", body: JSON.stringify(meta) });
        toast("Page info saved", "success");
        setMetaDirty(false);
        await fetchPage();
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    }
  }, [creating, meta, pageId, router, toast, fetchPage]);

  const snapshotDraft = useCallback(async () => {
    try {
      await api(`/api/admin/pages/${pageId}`, { method: "PATCH", body: JSON.stringify({ snapshot: true }) });
      toast("Revision saved", "success");
      await fetchRevisions();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    }
  }, [pageId, toast, fetchRevisions]);

  const setPublishState = useCallback(
    async (action: "unpublish") => {
      try {
        await api(`/api/admin/pages/${pageId}/publish`, { method: "POST", body: JSON.stringify({ action }) });
        toast("Page unpublished", "success");
        await fetchPage();
        await fetchRevisions();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not change publish state", "error");
      }
    },
    [pageId, toast, fetchPage, fetchRevisions],
  );

  const restoreRevision = useCallback(
    async (revisionId: number) => {
      setConfirmRestore(null);
      try {
        await api(`/api/admin/pages/${pageId}/revisions`, { method: "POST", body: JSON.stringify({ revisionId }) });
        toast("Revision restored to the draft", "success");
        await fetchPage();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Restore failed", "error");
      }
    },
    [pageId, toast, fetchPage],
  );

  const doDelete = useCallback(async () => {
    setConfirmDestroy(false);
    try {
      await api(`/api/admin/pages/${pageId}`, { method: "DELETE" });
      toast("Page deleted", "success");
      router.push("/admin/pages");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete failed", "error");
    }
  }, [pageId, router, toast]);

  if (loading) return <Skeleton className="h-[640px] rounded-2xl" />;

  const isPublished = page?.status === "published";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Btn variant="ghost" size="sm" onClick={() => router.push("/admin/pages")} aria-label="Back to pages list" className="!px-2">
            <ChevronLeft className="h-4 w-4" />
          </Btn>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-tight">{page?.title ?? "New page"}</h1>
              {page && <Badge tone={page.status === "published" ? "green" : page.status === "archived" ? "amber" : "slate"}>{page.status}</Badge>}
              {metaDirty && <Badge tone="blue">unsaved info</Badge>}
            </div>
            {page && (
              <p className="mt-0.5 text-[13px] text-mist">
                Live at <code className="rounded bg-slate-100 px-1 text-[12px] text-ink">/{page.slug}</code>
                {" · "}updated {formatDate(page.updatedAt)}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!creating && isPublished && (
            <a href={`/${page!.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-2 text-[12.5px] font-medium text-ink hover:bg-slate-50">
              <ExternalLink className="h-3.5 w-3.5" /> Live page
            </a>
          )}
          {!creating && isPublished && (
            <Btn variant="secondary" size="sm" onClick={() => setPublishState("unpublish")}>
              Unpublish
            </Btn>
          )}
          {!creating && (
            <a href={`/preview/pages/${pageId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-2 text-[12.5px] font-medium text-ink hover:bg-slate-50">
              <Eye className="h-3.5 w-3.5" /> Draft preview
            </a>
          )}
          {!creating && (
            <Btn variant="danger" size="sm" onClick={() => setConfirmDestroy(true)}>
              <X className="h-4 w-4" /> Delete
            </Btn>
          )}
        </div>
      </div>

      <Card title="Page info" actions={<Btn variant="primary" size="sm" onClick={saveMeta}>{creating ? "Create page" : "Save info"}</Btn>}>
        <PageMetaEditor
          meta={{
            ...meta,
            slug: meta.slug || (meta.title ? meta.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) : ""),
          }}
          onChange={(patch) => {
            setMeta((m) => ({ ...m, ...patch, ...(typeof patch.navOrder === "string" ? { navOrder: Number(patch.navOrder) } : {}) }));
            setMetaDirty(true);
          }}
          pageSlug={page?.slug}
        />
      </Card>

      {creating ? (
        <EmptyState title="Create the page first" description="Click “Create page” above — the visual editor, preview and publishing unlock right after." />
      ) : (
        <VisualBuilder
          target={{
            kind: "page",
            id: pageId,
            title: page?.title ?? "Page",
            previewSrc: `/preview/pages/${pageId}`,
            saveUrl: `/api/admin/pages/${pageId}`,
            publishUrl: `/api/admin/pages/${pageId}/publish`,
            publicHref: isPublished ? `/${page!.slug}` : null,
            status: page?.status,
          }}
          initialSections={sections}
          canWrite
          canPublish
          onPublished={() => {
            void fetchPage();
            void fetchRevisions();
          }}
        />
      )}

      {!creating && (
        <Card
          title="Saved revisions"
          actions={<Btn variant="ghost" size="sm" onClick={snapshotDraft}><Save className="h-3.5 w-3.5" /> Snapshot</Btn>}
        >
          {revisions.length === 0 ? (
            <p className="text-[13px] text-mist">No snapshots yet. Publishing and restoring auto-save a version; “Snapshot” stores one manually.</p>
          ) : (
            <ul className="divide-y divide-ink/6">
              {revisions.slice(0, 8).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-ink">{r.headline}</p>
                    <p className="text-[11.5px] text-mist">
                      {r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
                      {r.userName ? ` · ${r.userName}` : ""}
                    </p>
                  </div>
                  <Btn variant="ghost" size="sm" onClick={() => setConfirmRestore({ id: r.id, headline: r.headline })}>
                    Restore
                  </Btn>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Confirm
        open={!!confirmRestore}
        onClose={() => setConfirmRestore(null)}
        title="Restore this revision?"
        message={`The current draft will be replaced with “${confirmRestore?.headline ?? "revision"}”. Your current draft is snapshotted first, so nothing is lost. Published content is untouched until the next publish.`}
        confirmLabel="Restore"
        onConfirm={() => (confirmRestore ? restoreRevision(confirmRestore.id) : Promise.resolve())}
      />
      <Confirm
        open={confirmDestroy}
        onClose={() => setConfirmDestroy(false)}
        title="Delete this page?"
        message="This permanently removes the page and its revisions. Visitors can no longer reach it. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={doDelete}
      />
    </div>
  );
}
