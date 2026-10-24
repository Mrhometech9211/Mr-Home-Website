import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { absoluteSiteUrl } from "@/lib/site";

export type Crumb = { name: string; href: string };

export function Breadcrumbs({ items, dark = false, className }: { items: Crumb[]; dark?: boolean; className?: string }) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absoluteSiteUrl(c.href) })),
  };
  return (
    <nav aria-label="Breadcrumb" className={cn("text-[12.5px]", dark ? "text-white/60" : "text-charcoal/60", className)}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={c.href} className="flex items-center gap-1.5">
              {last ? <span aria-current="page" className={dark ? "text-white" : "text-ink"}>{c.name}</span> : <Link href={c.href} className="transition hover:text-brand">{c.name}</Link>}
              {!last && <ChevronRight className="h-3 w-3 opacity-60" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
