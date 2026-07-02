"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutDashboard, Plus, Search, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandPalette, useCommandPalette } from "@/components/command-palette";
import { SidebarHealth } from "@/components/sidebar-health";
import { SidebarProjectPanel } from "@/components/sidebar-project-panel";
import { SidebarRecentProjects } from "@/components/sidebar-recent-projects";

const GLOBAL_NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects/new", label: "New Project", icon: Plus },
];

function extractProjectId(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  if (!match || match[1] === "new") return null;
  return match[1];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectId = extractProjectId(pathname);
  const activeTab = searchParams.get("tab") ?? undefined;
  const { open, setOpen } = useCommandPalette();

  return (
    <div className="flex min-h-screen">
      <CommandPalette
        projectId={projectId}
        open={open}
        onClose={() => setOpen(false)}
      />
      <aside className="fixed inset-y-0 left-0 z-30 flex h-svh w-72 flex-col border-r border-white/5 bg-[var(--sidebar)] text-[var(--sidebar-fg)]">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-900/30">
            <Workflow className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">SDLC Conductor</p>
            <p className="truncate text-[11px] text-[var(--sidebar-muted)]">Spec → Build → Track</p>
          </div>
        </div>

        <div className="shrink-0 space-y-1 border-b border-white/10 p-3">
          {GLOBAL_NAV.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-white/10 text-white"
                    : "text-[var(--sidebar-muted)] hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[var(--sidebar-muted)] transition-colors hover:bg-white/5 hover:text-white"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Search</span>
            <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px]">
              ⌘K
            </kbd>
          </button>
        </div>

        <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          {projectId ? (
            <SidebarProjectPanel projectId={projectId} activeTab={activeTab} />
          ) : (
            <SidebarRecentProjects activeId={projectId ?? undefined} />
          )}
        </div>

        <div className="shrink-0 space-y-3 border-t border-white/10 p-4">
          <SidebarHealth />
          <p className="text-center text-[10px] text-[var(--sidebar-muted)]">
            Powered by Continuum
          </p>
        </div>
      </aside>

      <main className="ml-72 w-0 min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto w-full max-w-7xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
