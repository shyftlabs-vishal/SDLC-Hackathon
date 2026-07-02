"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { api } from "@/lib/api";
import type { ProjectSummary } from "@/lib/types";
import { onProjectRefresh } from "@/lib/refresh-events";
import { cn } from "@/lib/utils";

export function SidebarRecentProjects({ activeId }: { activeId?: string }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    function load() {
      setLoading(true);
      api
        .listProjects()
        .then((list) => {
          if (!cancelled) {
            const sorted = [...list].sort(
              (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
            );
            setProjects(sorted.slice(0, 8));
          }
        })
        .catch(() => {
          if (!cancelled) setProjects([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    load();
    const unsubscribe = onProjectRefresh(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sidebar-muted)]">
          Recent projects
        </p>
        <p className="mt-3 text-xs text-[var(--sidebar-muted)]">Loading…</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sidebar-muted)]">
          Recent projects
        </p>
        <p className="mt-3 text-xs leading-relaxed text-[var(--sidebar-muted)]">
          No projects yet. Create one to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="px-2 py-3">
      <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--sidebar-muted)]">
        Recent projects
      </p>
      <ul className="space-y-0.5">
        {projects.map((project) => {
          const active = project.id === activeId;
          return (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className={cn(
                  "group flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
                  active
                    ? "bg-white/10 text-white"
                    : "text-[var(--sidebar-muted)] hover:bg-white/5 hover:text-white",
                )}
              >
                <FolderKanban
                  className={cn(
                    "mt-0.5 h-3.5 w-3.5 shrink-0",
                    active ? "text-blue-400" : "text-[var(--sidebar-muted)] group-hover:text-slate-300",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">{project.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-[var(--sidebar-muted)]">
                      {project.ticket_count} tickets
                    </span>
                    {project.alignment_score !== null && (
                      <span
                        className={cn(
                          "rounded px-1 py-0.5 text-[10px] font-medium",
                          project.alignment_score >= 80
                            ? "bg-emerald-500/20 text-emerald-300"
                            : project.alignment_score >= 50
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-red-500/20 text-red-300",
                        )}
                      >
                        {project.alignment_score}%
                      </span>
                    )}
                    {project.open_drift_count > 0 && (
                      <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[10px] font-medium text-amber-300">
                        {project.open_drift_count} drift
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
