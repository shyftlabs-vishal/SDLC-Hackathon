"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Search,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandPalette, useCommandPalette } from "@/components/command-palette";
import { SidebarHealth } from "@/components/sidebar-health";
import { SidebarProjectPanel } from "@/components/sidebar-project-panel";
import { SidebarRecentProjects } from "@/components/sidebar-recent-projects";
import { ThemeToggle } from "@/components/theme-toggle";

const GLOBAL_NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects/new", label: "New Project", icon: Plus },
];

const SIDEBAR_WIDTH = "w-[19rem]";
const SIDEBAR_STORAGE_KEY = "sdlc-sidebar-collapsed";

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

  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true") {
      setCollapsed(true);
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <CommandPalette
        projectId={projectId}
        open={open}
        onClose={() => setOpen(false)}
      />

      {/* Mobile backdrop when sidebar is open */}
      {!collapsed && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={toggleSidebar}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-svh flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-fg)] transition-transform duration-300 ease-in-out",
          SIDEBAR_WIDTH,
          collapsed ? "-translate-x-full" : "translate-x-0",
        )}
      >
        <div className="flex h-[3.75rem] shrink-0 items-center gap-3 border-b border-[var(--sidebar-border)] px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-900/30">
            <Workflow className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold tracking-tight text-white">
              SDLC Conductor
            </p>
            <p className="truncate text-xs text-[var(--sidebar-muted)]">Spec → Build → Track</p>
          </div>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Collapse sidebar"
            title="Collapse sidebar (⌘\)"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--sidebar-muted)] transition-colors hover:bg-white/10 hover:text-white"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-0.5 p-3">
            {GLOBAL_NAV.map(({ href, label, icon: Icon }) => {
              const active =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors",
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
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[var(--sidebar-muted)] transition-colors hover:bg-white/5 hover:text-white"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">Search</span>
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium">
                ⌘K
              </kbd>
            </button>
          </div>

          {projectId ? (
            <SidebarProjectPanel projectId={projectId} activeTab={activeTab} />
          ) : (
            <SidebarRecentProjects activeId={projectId ?? undefined} />
          )}

          <div className="space-y-3 border-t border-[var(--sidebar-border)] p-4 pb-6">
            <SidebarHealth />
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-center">
              <p className="text-xs font-medium text-[var(--sidebar-muted)]">Built with</p>
              <p className="mt-0.5 text-sm font-semibold tracking-tight text-white">
                Continuum
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div
        className={cn(
          "flex min-h-screen min-w-0 flex-col transition-[margin] duration-300 ease-in-out",
          collapsed ? "ml-0" : "lg:ml-[19rem]",
        )}
      >
        <header className="sticky top-0 z-20 flex h-[3.75rem] items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)]/80 px-4 backdrop-blur-md lg:px-6">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Open sidebar" : "Close sidebar"}
            title="Toggle sidebar (⌘\)"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--body)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--hover)]"
          >
            <PanelLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="hidden items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--hover)] sm:flex"
            >
              <Search className="h-3.5 w-3.5" />
              Search
              <kbd className="rounded border border-[var(--border)] bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)]">
                ⌘K
              </kbd>
            </button>
            <ThemeToggle variant="icon" />
          </div>
        </header>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1200px] px-6 py-8 lg:px-10 lg:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
