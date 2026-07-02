"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GitBranch,
  LayoutDashboard,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Ticket,
  Wand2,
} from "lucide-react";
import { api } from "@/lib/api";
import type { ProjectSummary } from "@/lib/types";
import { dispatchProjectRefresh } from "@/lib/refresh-events";
import { cn } from "@/lib/utils";

type CommandAction = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void | Promise<unknown>;
  group: string;
};

export function CommandPalette({
  projectId,
  open,
  onClose,
}: {
  projectId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    api.listProjects().then(setProjects).catch(() => setProjects([]));
  }, [open]);

  const go = useCallback(
    (path: string) => {
      onClose();
      router.push(path);
    },
    [onClose, router],
  );

  const runAction = useCallback(
    async (action: () => void | Promise<unknown>) => {
      setRunning(true);
      try {
        await action();
        dispatchProjectRefresh();
      } finally {
        setRunning(false);
        onClose();
      }
    },
    [onClose],
  );

  const commands = useMemo(() => {
    const list: CommandAction[] = [
      {
        id: "dashboard",
        label: "Go to Dashboard",
        icon: LayoutDashboard,
        group: "Navigation",
        run: () => go("/"),
      },
      {
        id: "new-project",
        label: "New Project",
        icon: Plus,
        group: "Navigation",
        run: () => go("/projects/new"),
      },
    ];

    if (projectId) {
      const base = `/projects/${projectId}`;
      const tabs = [
        { id: "overview", label: "Overview", icon: LayoutDashboard },
        { id: "command", label: "Command Center", icon: Sparkles },
        { id: "tickets", label: "Tickets", icon: Ticket },
        { id: "git", label: "Git Activity", icon: GitBranch },
        { id: "drift", label: "Drift", icon: ShieldAlert },
      ];
      for (const tab of tabs) {
        list.push({
          id: `tab-${tab.id}`,
          label: tab.label,
          hint: "Switch tab",
          icon: tab.icon,
          group: "This project",
          run: () => go(`${base}?tab=${tab.id}`),
        });
      }
      list.push(
        {
          id: "magic",
          label: "Run Magic",
          hint: "Full AI suite",
          icon: Wand2,
          group: "Actions",
          run: () => runAction(() => api.runMagic(projectId)),
        },
        {
          id: "drift",
          label: "Check Drift",
          icon: ShieldAlert,
          group: "Actions",
          run: () => runAction(() => api.checkDrift(projectId)),
        },
        {
          id: "git-sync",
          label: "Sync Git",
          icon: GitBranch,
          group: "Actions",
          run: () => runAction(() => api.syncGit(projectId)),
        },
        {
          id: "jira-sync",
          label: "Sync from JIRA",
          icon: Ticket,
          group: "Actions",
          run: () => runAction(() => api.syncFromJira(projectId)),
        },
      );
    }

    for (const p of projects.slice(0, 6)) {
      if (p.id === projectId) continue;
      list.push({
        id: `project-${p.id}`,
        label: p.name,
        hint: "Open project",
        icon: LayoutDashboard,
        group: "Projects",
        run: () => go(`/projects/${p.id}`),
      });
    }

    return list;
  }, [projectId, projects, go, runAction]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q) ||
        c.hint?.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[activeIndex]) {
        e.preventDefault();
        void filtered[activeIndex].run();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, activeIndex, onClose]);

  if (!open) return null;

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 px-4 pt-[min(20vh,120px)] backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands, tabs, projects…"
            className="flex-1 bg-transparent text-sm theme-heading outline-none placeholder:text-[var(--muted)]"
          />
          <kbd className="hidden rounded border border-[var(--border)] bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] text-[var(--muted)] sm:inline">
            esc
          </kbd>
        </div>

        <ul className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-[var(--muted)]">
              No matching commands
            </li>
          ) : (
            filtered.map((cmd, index) => {
              const showGroup = cmd.group !== lastGroup;
              lastGroup = cmd.group;
              const Icon = cmd.icon;
              return (
                <li key={cmd.id}>
                  {showGroup && (
                    <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                      {cmd.group}
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={running}
                    onClick={() => void cmd.run()}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                      index === activeIndex
                        ? "bg-indigo-50 text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200"
                        : "theme-body hover:bg-[var(--hover)]",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-60" />
                    <span className="flex-1 font-medium">{cmd.label}</span>
                    {cmd.hint && (
                      <span className="text-xs text-[var(--muted)]">{cmd.hint}</span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="border-t border-[var(--border)] px-4 py-2 text-[10px] text-[var(--muted)]">
          ↑↓ navigate · ↵ run · esc close
          {running && " · Running…"}
        </div>
      </div>
    </div>
  );
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen };
}
