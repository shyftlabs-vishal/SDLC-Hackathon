"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  GitBranch,
  Link2,
  ShieldAlert,
  Sparkles,
  Ticket,
  Wand2,
} from "lucide-react";
import { api } from "@/lib/api";
import type { ActivityEvent } from "@/lib/types";
import { formatRelative } from "@/lib/utils";
import { onProjectRefresh } from "@/lib/refresh-events";

const EVENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  analyze: Sparkles,
  git_sync: GitBranch,
  drift_check: ShieldAlert,
  magic_run: Wand2,
  jira_push: Link2,
  jira_sync: Link2,
  jira_import: Link2,
  jira_nudge: Bell,
  ticket_update: Ticket,
  apply_links: GitBranch,
  project_created: Sparkles,
  standup: Sparkles,
  sprint_plan: Sparkles,
  readiness: Sparkles,
  scope_creep: ShieldAlert,
  commit_links: GitBranch,
  drift_alert: ShieldAlert,
};

export function SidebarActivity({ projectId }: { projectId: string }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.getProjectActivity(projectId, 12);
      setEvents(data.events);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
    return onProjectRefresh(load);
  }, [load]);

  if (loading) {
    return (
      <div className="px-1 py-1">
        <p className="sidebar-label">Activity</p>
        <p className="mt-2 text-xs text-[var(--sidebar-muted)]">Loading…</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="px-1 py-1">
        <p className="sidebar-label">Activity</p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--sidebar-muted)]">
          Sync git, run drift checks, or Run Magic to see activity here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 px-1">
      <p className="sidebar-label">Activity</p>
      <ul className="space-y-1">
        {events.map((event) => {
          const Icon = EVENT_ICONS[event.event_type] ?? Sparkles;
          return (
            <li
              key={event.id}
              className="flex gap-2.5 rounded-lg px-2 py-2 hover:bg-white/[0.04]"
            >
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--sidebar-muted)]" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-xs leading-relaxed text-slate-200">
                  {event.message}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--sidebar-muted)]">
                  {formatRelative(event.created_at)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
