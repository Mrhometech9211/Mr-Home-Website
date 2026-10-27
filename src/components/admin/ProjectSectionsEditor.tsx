"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, LayoutTemplate, RotateCcw, Sparkles } from "lucide-react";
import { api, Badge, Btn, Card, Confirm, Skeleton, useToast } from "./ui";
import { VisualBuilder } from "./VisualBuilder";
import type { BuilderSection } from "@/lib/page-builder";

type Payload = {
  project: { id: number; name: string; slug: string; published: boolean; archived: boolean };
  draft: BuilderSection[];
  published: BuilderSection[];
};

export function ProjectSectionsEditor({ projectId, canWrite, canPublish }: { projectId: number; canWrite: boolean; canPublish: boolean }) {
  const { toast } = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmSeed, setConfirmSeed] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ data: Payload }>(`/api/admin/projects/${projectId}/builder`);
      setData(res.data);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load project sections", "error");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  // Initial load resolves through promise callbacks: no synchronous setState
  // inside the effect body.
  useEffect(() => {
    let alive = true;
    api<{ data: Payload }>(`/api/admin/projects/${projectId}/builder`)
      .then((res) => {
        if (alive) setData(res.data);
      })
      .catch((e) => {
        if (alive) toast(e instanceof Error ? e.message : "Could not load project sections", "error");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId, toast]);

  const seed = useCallback(async () => {
    setConfirmSeed(false);
    setBusy(true);
    try {
      const res = await api<{ data: { draft: BuilderSection[] } }>(`/api/admin/projects/${projectId}/builder`, {
        method: "POST",
        body: JSON.stringify({ action: "seed" }),
      });
      setData((d) => (d ? { ...d, draft: res.data.draft } : d));
      toast("Started from the current layout — review, then publish", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not build the starting layout", "error");
    } finally {
      setBusy(false);
    }
  }, [projectId, toast]);

  const reset = useCallback(async () => {
    setConfirmReset(false);
    setBusy(true);
    try {
      await api(`/api/admin/projects/${projectId}/builder`, { method: "POST", body: JSON.stringify({ action: "reset" }) });
      setData((d) => (d ? { ...d, draft: [], published: [] } : d));
      toast("Reset to the default project layout", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not reset", "error");
    } finally {
      setBusy(false);
    }
  }, [projectId, toast]);

  if (loading) return <Skeleton className="h-[640px] rounded-2xl" />;
  if (!data) return <p className="text-[13.5px] text-mist">Project not found.</p>;

  const { project } = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/admin/projects" className="mt-1 rounded-lg p-1.5 text-mist hover:bg-slate-100 hover:text-ink" aria-label="Back to projects">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-tight">{project.name}</h1>
              <Badge tone={data.published.length ? "green" : "slate"}>{data.published.length ? `${data.published.length} published sections` : "default layout"}</Badge>
            </div>
            <p className="mt-0.5 text-[13px] text-mist">
              Project page <code className="rounded bg-slate-100 px-1 text-[12px] text-ink">/projects/{project.slug}</code>
              {data.published.length ? " · custom sections are live" : " · visitors still see the built-in layout"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/projects/${project.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-2 text-[12.5px] font-medium text-ink hover:bg-slate-50">
            <ExternalLink className="h-3.5 w-3.5" /> View project
          </a>
          <Link href={`/admin/projects/${project.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-2 text-[12.5px] font-medium text-ink hover:bg-slate-50">
            Edit project data
          </Link>
        </div>
      </div>

      <Card title="Page layout" actions={
        <div className="flex flex-wrap items-center gap-2">
          <Btn variant="secondary" size="sm" loading={busy} disabled={!canWrite} onClick={() => setConfirmSeed(true)}>
            <Sparkles className="h-3.5 w-3.5" /> Start from current layout
          </Btn>
          {data.published.length > 0 && canPublish && (
            <Btn variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Btn>
          )}
        </div>
      }>
        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-charcoal/75">
          <LayoutTemplate className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          Sections here replace the project&apos;s body content (intro, gallery, amenities, specifications, floor plans, location, brochure, related projects, inquiry).
          The hero, price card and facts band stay intact, and the page keeps its existing layout until you publish.
        </p>
      </Card>

      <VisualBuilder
        key={`${projectId}-${data.draft.length === 0 ? "empty" : "ready"}`}
        target={{
          kind: "project",
          id: projectId,
          title: project.name,
          previewSrc: `/preview/projects/${projectId}`,
          saveUrl: `/api/admin/projects/${projectId}/builder`,
          publishUrl: `/api/admin/projects/${projectId}/builder`,
          publicHref: `/projects/${project.slug}`,
          status: data.published.length ? "published" : "draft",
        }}
        initialSections={data.draft}
        canWrite={canWrite}
        canPublish={canPublish}
        onPublished={() => void load()}
      />

      <Confirm
        open={confirmSeed}
        onClose={() => setConfirmSeed(false)}
        title="Start from the current layout?"
        message="This fills the draft with sections built from this project's existing fields (description, gallery, amenities, specifications, floor plans, location, brochure, related projects, inquiry). Your current draft is replaced. Nothing is published until you press Publish."
        confirmLabel="Build sections"
        onConfirm={seed}
      />
      <Confirm
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset to the default layout?"
        message="The custom sections are removed from this project and the built-in project page layout is shown again. Project data, images and brochures are untouched."
        confirmLabel="Reset"
        danger
        onConfirm={reset}
      />
    </div>
  );
}
