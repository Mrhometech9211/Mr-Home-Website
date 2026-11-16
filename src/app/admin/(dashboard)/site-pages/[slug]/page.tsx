"use client";

import { useParams } from "next/navigation";
import { SitePageEditor } from "@/components/admin/SitePageEditor";

export default function BuiltinPageEditRoute() {
  const params = useParams<{ slug: string }>();
  return <SitePageEditor slug={params.slug} />;
}
