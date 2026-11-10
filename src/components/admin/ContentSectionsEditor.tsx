"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, LayoutTemplate, RotateCcw, Sparkles } from "lucide-react";
import { api, Badge, Btn, Card, Confirm, Skeleton, useToast } from "./ui";
import { VisualBuilder } from "./VisualBuilder";
import type { BuilderSection } from "@/lib/page-builder";

export type ContentBuilderPayload = {
  kind: "market" | "news";
  id: number;
  title: string;
  slug: string;
  published: boolean;
  draft: BuilderSection[];
  publishedSections: BuilderSection[];
  publicHref: string;
};

/**
 * Editor shell for builder-backed editorial content (markets, news articles).
 * It is the same VisualBuilder the pages and projects use — only the load,
 * seed and publish endpoints differ, so the editing experience cannot drift.
 */
export function ContentSectionsEditor({
  kind,
  id,
  canWrite,
  canPublish,
}: {
  kind: "market" | "news";
  id: number;
  canWrite: boolean;
  canPublish: boolean;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<ContentBuilderPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmSeed, setConfirmSeed] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  const endpoint = `/api/admin/builder/${kind}/${id}`;

  const load = useCallback(async () => {
    try {
      const res = await api<{ data: ContentBuilderPayload }>(endpoint);
      setData(res.data);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load the page layout", "error");
    } finally {
      setLoading(false);
    }
  }, [endpoint, toast]);

  // Initial load resolves through promise callbacks: no synchronous setState in
  // the effect body (React 19 lint rule).
  useEffect(() => {
    let alive = true;
    api<{ data: ContentBuilderPayload }>(endpoint)
      .then((res) => {
        if (alive) setData(res.data);
      })
      .catch((e) => {
        if (alive) toast(e instanceof Error ? e.message : "Could not load the page layout", "error");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [endpoint, toast]);

  const seed = useCallback(async () => {
    setConfirmSeed(false);
    setBusy(true);
    try {
      const res = await api<{ data: { draft: BuilderSection[] } }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ action: "seed" }),
      });
      setData((d) => (d ? { ...d, draft: res.data.draft } : d));
      toast("Started from the current content — review, then publish", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not build the starting layout", "error");
    } finally {
      setBusy(false);
    }
  }, [endpoint, toast]);

  const reset = useCallback(async () => {
    setConfirmReset(false);
    setBusy(true);
    try {
      await api(endpoint, { method: "POST", body: JSON.stringify({ action: "reset" }) });
      setData((d) => (d ? { ...d, draft: [], publishedSections: [] } : d));
      toast("Reset to the default layout", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not reset", "error");
    } finally {
      setBusy(false);
    }
  }, [endpoint, toast]);

  if (loading) return <Skeleton className="h-[640px] rounded-2xl" />;
  if (!data) return <p className="text-[13.5px] text-mist">Not found.</p>;

  const noun = kind === "market" ? "market page" : "article";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href={`/admin/${kind}`} className="mt-1 rounded-lg p-1.5 text-mist hover:bg-slate-100 hover:text-ink" aria-label={`Back to ${kind}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-tight">{data.title}</h1>
              <Badge tone={data.publishedSections.length ? "green" : "slate"}>
                {data.publishedSections.length ? `${data.publishedSections.length} published sections` : "default layout"}
              </Badge>
            </div>
            <p className="mt-0.5 text-[13px] text-mist">
              {noun} <code className="rounded bg-slate-100 px-1 text-[12px] text-ink">{data.publicHref}</code>
              {data.publishedSections.length ? " · custom sections are live" : " · visitors still see the default layout"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={data.publicHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-2 text-[12.5px] font-medium text-ink hover:bg-slate-50">
            <ExternalLink className="h-3.5 w-3.5" /> View live
          </a>
          <Link href={`/admin/${kind}/${id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-2 text-[12.5px] font-medium text-ink hover:bg-slate-50">
            Edit {kind === "market" ? "market data" : "article data"}
          </Link>
        </div>
      </div>

      <Card
        title="Page layout"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="secondary" size="sm" loading={busy} disabled={!canWrite} onClick={() => setConfirmSeed(true)}>
              <Sparkles className="h-3.5 w-3.5" /> Start from current content
            </Btn>
            {data.publishedSections.length > 0 && canPublish && (
              <Btn variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Btn>
            )}
          </div>
        }
      >
        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-charcoal/75">
          <LayoutTemplate className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          Sections here replace the {kind === "market" ? "market body below the hero and statistics" : "article body below the header and cover image"}.
          The page keeps its existing layout until you publish.
        </p>
      </Card>

      <VisualBuilder
        key={`${kind}-${id}-${data.draft.length === 0 ? "empty" : "ready"}`}
        target={{
          kind: "page",
          id,
          title: data.title,
          previewSrc: `/preview/${kind === "market" ? "markets" : "news"}/${id}`,
          saveUrl: endpoint,
          publishUrl: endpoint,
          publicHref: data.publicHref,
          status: data.publishedSections.length ? "published" : "draft",
        }}
        initialSections={data.draft}
        canWrite={canWrite}
        canPublish={canPublish}
        onPublished={() => void load()}
      />

      <Confirm
        open={confirmSeed}
        onClose={() => setConfirmSeed(false)}
        title="Start from the current content?"
        message="This fills the draft with sections built from this record's existing fields. Your current draft is replaced. Nothing is published until you press Publish."
        confirmLabel="Build sections"
        onConfirm={seed}
      />
      <Confirm
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset to the default layout?"
        message="The custom sections are removed from this page and the built-in layout is shown again. The record's own data is untouched."
        confirmLabel="Reset"
        danger
        onConfirm={reset}
      />
    </div>
  );
}
