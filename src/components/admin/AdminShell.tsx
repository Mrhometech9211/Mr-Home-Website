"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {  LayoutDashboard, Inbox, Building2, FileText, Globe2, MapPin, KanbanSquare, LayoutTemplate, PanelTop, Menu as MenuIcon, Image as ImageIcon, HelpCircle, Quote, Mail, Search, Scale, MessageCircle, Settings, Users, History, LogOut, ExternalLink, X, UserCircle, Newspaper, FileStack, Layers, Eye, RotateCcw, Save, Shield } from "lucide-react";
import { ADMIN_NAV } from "@/lib/resources";
import { CommandPalette } from "@/components/admin/CommandPalette";
import { cn } from "@/lib/utils";
import { ToastProvider, useToast } from "./ui";  const ICONS: Record<string, React.ComponentType<{ className?: string }>> = { dashboard: LayoutDashboard, inbox: Inbox, building: Building2, brochure: FileText, globe: Globe2, "map-pin": MapPin, kanban: KanbanSquare, layout: LayoutTemplate, menu: MenuIcon, image: ImageIcon, help: HelpCircle, quote: Quote, mail: Mail, search: Search, scale: Scale, message: MessageCircle, settings: Settings, users: Users, history: History, news: Newspaper, pages: PanelTop, shield: Shield, offer: FileStack };

type Props = { user: { id: number; name: string; email: string; role: string }; permissions: string[]; brandName: string; logo: string; children: ReactNode; newLeads: number };

function Shell({ user, permissions, brandName, logo, children, newLeads }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  // Session heartbeat: rotates the session periodically and redirects when expired.
  useEffect(() => {
    let active = true;
    const ping = async () => {
      try {
        const res = await fetch("/api/auth/session", { credentials: "same-origin" });
        if (res.status === 401 && active) { toast("Your session has expired. Please sign in again.", "error"); router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`); }
      } catch { /* offline — ignore */ }
    };
    ping();
    const t = setInterval(ping, 5 * 60 * 1000);
    return () => { active = false; clearInterval(t); };
  }, [pathname, router, toast]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    router.replace("/admin/login");
    router.refresh();
  };

  const nav = ADMIN_NAV.filter((n) => !n.permission || permissions.includes(n.permission));
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  const Sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 py-5">
        <Link href="/admin" className="relative block h-9 w-[140px]"><Image src={logo} alt={brandName} fill className="object-contain object-left" sizes="140px" unoptimized={logo.endsWith(".svg")} /></Link>
        <button type="button" className="rounded-lg p-1.5 text-charcoal hover:bg-slate-100 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-4 w-4" /></button>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Admin">
        {nav.map((n) => {
          const Icon = ICONS[n.icon] ?? LayoutDashboard;
          return (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} aria-current={isActive(n.href) ? "page" : undefined} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition", isActive(n.href) ? "bg-brand/10 text-brand" : "text-charcoal hover:bg-slate-100 hover:text-ink")}>
              <Icon className="h-4 w-4" />
              {n.label}
              {n.href === "/admin/leads" && newLeads > 0 && <span className="ml-auto rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">{newLeads}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-ink/8 p-3">
        <Link href="/admin/profile" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-100">
          <UserCircle className="h-8 w-8 text-charcoal/60" />
          <div className="min-w-0"><div className="truncate text-[13px] font-semibold text-ink">{user.name}</div><div className="truncate text-[11px] text-mist">{user.role.replace("_", " ")}</div></div>
        </Link>
        <div className="mt-1 flex gap-1">
          <a href="/" target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12px] text-charcoal hover:bg-slate-100"><ExternalLink className="h-3.5 w-3.5" /> View site</a>
          <button type="button" onClick={logout} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12px] text-charcoal hover:bg-slate-100"><LogOut className="h-3.5 w-3.5" /> Sign out</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f4f5f3] text-ink">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-ink/8 bg-white lg:block">{Sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-[120] lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-2xl">{Sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-ink/8 bg-white/80 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-charcoal hover:bg-slate-100 lg:hidden" aria-label="Open menu"><MenuIcon className="h-5 w-5" /></button>
            <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-mist">{brandName} Admin</span>
          </div>
          <div className="hidden max-w-[45vw] truncate text-[12px] text-mist sm:block">{user.email}</div>
        </header>
        <main className="p-4 lg:p-8">{children}</main>
        <CommandPalette />
      </div>
    </div>
  );
}

export function AdminShell(props: Props) {
  return (
    <ToastProvider>
      <Shell {...props} />
    </ToastProvider>
  );
}
