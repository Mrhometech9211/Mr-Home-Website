"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, FileText, Pencil } from "lucide-react";
import { api, Badge, EmptyState, Skeleton, useToast } from "@/components/admin/ui";
import { deferInitialLoad } from "@/lib/defer-load";

type Row = {
  key: string;
  title: string;
  path: string;
  content: "sections" | "settings" | "listings";
  note?: string;
  sectionCount: number;
  publishedAt: string | null;
  updatedAt: string | null;
  hasDraft: boolean;
};

export default function BuiltinPagesAdmin() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (spinner = false) => {
    if (spinner) setLoading(true);
    try {
      const res = await api<{ data: Row[] }>("/api/admin/site-pages");
      setRows(res.data);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load built-in pages", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => deferInitialLoad(() => load()), [load]);

  if (loading) return <Skeleton className="h-[420px]" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Built-in pages</h1>
        <p className="mt-1 max-w-3xl text-[13px] text-mist">
          Edit the content and search/social metadata of the site&apos;s built-in pages. Changes stay in a private draft until you publish them, so visitors never see half-finished copy.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No built-in pages found" description="The built-in page list could not be loaded." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((row) => (
            <div key={row.key} className="flex flex-col justify-between rounded-2xl border border-ink/8 bg-white p-5 shadow-sm">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-charcoal/70"><FileText className="h-4 w-4" /></span>
                    <div>
                      <h2 className="text-[14.5px] font-medium text-ink">{row.title}</h2>
                      <code className="text-[11.5px] text-mist">{row.path}</code>
                    </div>
                  </div>
                  <Badge tone={row.publishedAt ? "green" : "slate"}>{row.publishedAt ? "Published" : "Not overridden"}</Badge>
                </div>
                <p className="mt-3 text-[12.5px] text-charcoal/70">
                  {row.content === "sections"
                    ? `${row.sectionCount} editable section${row.sectionCount === 1 ? "" : "s"}`
                    : row.content === "settings"
                      ? "Copy lives in Settings → List Your Property; SEO is editable here"
                      : "Listings and filters live under Projects; SEO is editable here"}
                </p>
                {row.hasDraft && <p className="mt-1 text-[12px] font-medium text-amber-700">Unpublished draft changes</p>}
                {row.publishedAt && (
                  <p className="mt-1 text-[11.5px] text-mist">Published {new Date(row.publishedAt).toLocaleString("en-GB")}</p>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-ink/6 pt-3">
                <Link href={`/admin/site-pages/${row.key}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline">
                  <Pencil className="h-3.5 w-3.5" /> Edit page <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <a href={row.path} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-mist hover:text-ink">
                  <ExternalLink className="h-3.5 w-3.5" /> View live
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
