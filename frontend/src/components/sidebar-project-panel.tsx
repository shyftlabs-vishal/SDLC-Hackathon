"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FileText,
  GitBranch,
  ShieldAlert,
  Sparkles,
  Ticket,
  ArrowLeft,
} from "lucide-react";
import { api } from "@/lib/api";
import type { CommandCenterResponse, HealthResponse, ProjectDetail, TicketStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { onProjectRefresh } from "@/lib/refresh-events";
import { SidebarActivity } from "@/components/sidebar-activity";
import { SidebarJira } from "@/components/sidebar-jira";
import { SidebarOnboarding } from "@/components/sidebar-onboarding";
import { SidebarStandupSnippet } from "@/components/sidebar-standup-snippet";

const PROJECT_TABS = [
  { id: "overview", label: "Overview", icon: FileText },
  { id: "command", label: "Command Center", icon: Sparkles },
  { id: "spec", label: "Spec", icon: FileText },
  { id: "tickets", label: "Tickets", icon: Ticket },
  { id: "git", label: "Git Activity", icon: GitBranch },
  { id: "drift", label: "Drift", icon: ShieldAlert },
] as const;

const STATUS_ORDER: TicketStatus[] = [
  "done",
  "in_progress",
  "in_review",
  "backlog",
  "blocked",
];

const STATUS_LABELS: Record<TicketStatus, string> = {
  done: "Done",
  in_progress: "In progress",
  in_review: "In review",
  backlog: "Backlog",
  blocked: "Blocked",
};

const STATUS_COLORS: Record<TicketStatus, string> = {
  done: "bg-emerald-400",
  in_progress: "bg-blue-400",
  in_review: "bg-violet-400",
  backlog: "bg-slate-500",
  blocked: "bg-red-400",
};

function ticketBreakdown(tickets: ProjectDetail["tickets"]) {
  const counts: Record<TicketStatus, number> = {
    backlog: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
    blocked: 0,
  };
  let points = 0;
  let donePoints = 0;
  for (const t of tickets) {
    counts[t.status]++;
    if (t.estimated_points) {
      points += t.estimated_points;
      if (t.status === "done") donePoints += t.estimated_points;
    }
  }
  return { counts, total: tickets.length, points, donePoints };
}

export function SidebarProjectPanel({
  projectId,
  activeTab,
}: {
  projectId: string;
  activeTab?: string;
}) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [insights, setInsights] = useState<CommandCenterResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [proj, cc, h] = await Promise.all([
          api.getProject(projectId),
          api.getCommandCenter(projectId).catch(() => null),
          api.health().catch(() => null),
        ]);
        if (!cancelled) {
          setProject(proj);
          setInsights(cc);
          setHealth(h);
        }
      } catch {
        if (!cancelled) setProject(null);
      }
    }

    load();
    return onProjectRefresh(load);
  }, [projectId]);

  const breakdown = useMemo(
    () => (project ? ticketBreakdown(project.tickets) : null),
    [project],
  );

  const openDrifts = project?.drift_alerts.filter((d) => !d.resolved).length ?? 0;
  const readiness = insights?.readiness;
  const commitLinks = insights?.commit_links;

  return (
    <div className="space-y-4 px-3 py-3">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--sidebar-muted)] transition-colors hover:text-white"
      >
        <ArrowLeft className="h-3 w-3" />
        All projects
      </Link>

      {project ? (
        <>
          <div>
            <p className="truncate text-sm font-semibold text-white">{project.name}</p>
            <p className="mt-0.5 truncate text-[11px] text-[var(--sidebar-muted)]">
              {project.repo_branch}
              {project.repo_url || project.local_repo_path ? " · repo linked" : " · no repo"}
            </p>
          </div>

          <SidebarOnboarding project={project} insights={insights} health={health} />

          <SidebarStandupSnippet standup={insights?.standup} />

          <div className="grid grid-cols-2 gap-2">
            <MetricPill
              label="Alignment"
              value={
                project.alignment_score !== null ? `${project.alignment_score}%` : "—"
              }
              tone={
                project.alignment_score !== null && project.alignment_score >= 80
                  ? "good"
                  : project.alignment_score !== null && project.alignment_score >= 50
                    ? "warn"
                    : "neutral"
              }
            />
            <MetricPill
              label="Drift"
              value={String(openDrifts)}
              tone={openDrifts > 0 ? "warn" : "good"}
            />
            <MetricPill label="Commits" value={String(project.recent_commits.length)} />
            <MetricPill
              label="Release"
              value={readiness ? `${readiness.readiness_score}%` : "—"}
              tone={
                readiness && readiness.readiness_score >= 80
                  ? "good"
                  : readiness && readiness.readiness_score >= 50
                    ? "warn"
                    : "neutral"
              }
            />
          </div>

          {commitLinks && commitLinks.links.length > 0 && (
            <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
              <p className="text-[10px] text-[var(--sidebar-muted)]">Commit links</p>
              <p className="text-[11px] text-slate-200">
                {commitLinks.links.length} ticket
                {commitLinks.links.length !== 1 ? "s" : ""} matched
                {commitLinks.unlinked_commits.length > 0 &&
                  ` · ${commitLinks.unlinked_commits.length} unlinked`}
              </p>
            </div>
          )}

          {breakdown && breakdown.total > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold uppercase tracking-wider text-[var(--sidebar-muted)]">
                  Tickets
                </span>
                <span className="text-[var(--sidebar-muted)]">
                  {breakdown.counts.done}/{breakdown.total} done
                  {breakdown.points > 0 && ` · ${breakdown.donePoints}/${breakdown.points} pts`}
                </span>
              </div>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-white/10">
                {STATUS_ORDER.map((status) => {
                  const n = breakdown.counts[status];
                  if (!n) return null;
                  const pct = (n / breakdown.total) * 100;
                  return (
                    <div
                      key={status}
                      className={cn(STATUS_COLORS[status], "h-full")}
                      style={{ width: `${pct}%` }}
                      title={`${STATUS_LABELS[status]}: ${n}`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <SidebarJira projectId={projectId} />
        </>
      ) : (
        <p className="text-xs text-[var(--sidebar-muted)]">Loading project…</p>
      )}

      <nav className="border-t border-white/10 pt-3">
        <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--sidebar-muted)]">
          Navigate
        </p>
        <ul className="space-y-0.5">
          {PROJECT_TABS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id || (!activeTab && id === "overview");
            const href = `/projects/${projectId}?tab=${id}`;
            const badge =
              id === "drift" && openDrifts > 0 ? openDrifts : undefined;
            return (
              <li key={id}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-white/10 text-white"
                      : "text-[var(--sidebar-muted)] hover:bg-white/5 hover:text-white",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", active && "text-blue-400")} />
                  <span className="flex-1 truncate">{label}</span>
                  {badge !== undefined && (
                    <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-white/10 pt-3">
        <SidebarActivity projectId={projectId} />
      </div>
    </div>
  );
}

function MetricPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "neutral";
}) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
      <p className="text-[10px] text-[var(--sidebar-muted)]">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          tone === "good" && "text-emerald-300",
          tone === "warn" && "text-amber-300",
          tone === "neutral" && "text-slate-100",
        )}
      >
        {value}
      </p>
    </div>
  );
}
