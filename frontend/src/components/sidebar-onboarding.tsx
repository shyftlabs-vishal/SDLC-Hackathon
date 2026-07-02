"use client";

import { CheckCircle2, Circle } from "lucide-react";
import type { CommandCenterResponse, HealthResponse, ProjectDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

function buildChecklist(
  project: ProjectDetail,
  insights: CommandCenterResponse | null,
  health: HealthResponse | null,
): ChecklistItem[] {
  const hasRepo = Boolean(project.repo_url || project.local_repo_path);
  const hasJira = Boolean(
    health?.jira_configured && project.jira_project_key,
  );
  const hasMagic = Boolean(
    insights?.readiness || insights?.standup || insights?.sprint_plan,
  );

  return [
    {
      id: "requirement",
      label: "Add requirement",
      done: project.requirement.trim().length >= 10,
    },
    {
      id: "spec",
      label: "Generate spec & tickets",
      done: project.spec !== null && project.tickets.length > 0,
    },
    {
      id: "git",
      label: "Connect & sync git",
      done: hasRepo && project.recent_commits.length > 0,
    },
    {
      id: "jira",
      label: "Link JIRA project",
      done: hasJira,
    },
    {
      id: "drift",
      label: "Run drift check",
      done: project.alignment_score !== null,
    },
    {
      id: "magic",
      label: "Run Magic insights",
      done: hasMagic,
    },
  ];
}

export function SidebarOnboarding({
  project,
  insights,
  health,
}: {
  project: ProjectDetail;
  insights: CommandCenterResponse | null;
  health: HealthResponse | null;
}) {
  const items = buildChecklist(project, insights, health);
  const doneCount = items.filter((i) => i.done).length;
  const complete = doneCount === items.length;

  if (complete) return null;

  const pct = Math.round((doneCount / items.length) * 100);

  return (
    <div className="space-y-2 rounded-lg bg-white/[0.04] px-3 py-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sidebar-muted)]">
          Setup
        </p>
        <span className="text-[10px] font-medium text-slate-300">
          {doneCount}/{items.length}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="space-y-1.5 pt-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-xs">
            {item.done ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 text-[var(--sidebar-muted)]" />
            )}
            <span
              className={cn(
                item.done ? "text-[var(--sidebar-muted)] line-through" : "text-slate-200",
              )}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
