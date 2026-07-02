"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Link2, RefreshCw, Upload } from "lucide-react";
import { api } from "@/lib/api";
import type { JiraStatusResponse } from "@/lib/types";
import { dispatchProjectRefresh } from "@/lib/refresh-events";
import { cn } from "@/lib/utils";

export function SidebarJira({
  projectId,
  onError,
}: {
  projectId: string;
  onError?: (msg: string) => void;
}) {
  const [status, setStatus] = useState<JiraStatusResponse | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api.getJiraStatus(projectId));
    } catch {
      setStatus(null);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!status?.configured) {
    return (
      <div className="rounded-lg bg-white/[0.04] px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sidebar-muted)]">
          JIRA
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--sidebar-muted)]">
          Configure JIRA on the Tickets tab to sync issues.
        </p>
      </div>
    );
  }

  if (!status.project_key) {
    return (
      <div className="rounded-lg bg-white/[0.04] px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sidebar-muted)]">
          JIRA
        </p>
        <p className="mt-2 text-[11px] text-[var(--sidebar-muted)]">
          Set a project key on the Tickets tab.
        </p>
      </div>
    );
  }

  async function run(action: "sync" | "push") {
    setLoading(action);
    try {
      if (action === "sync") {
        const r = await api.syncFromJira(projectId);
        if (r.updated === 0 && r.errors.length === 0) {
          onError?.("JIRA sync complete — no changes.");
        }
      } else {
        await api.pushToJira(projectId);
      }
      await load();
      dispatchProjectRefresh();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "JIRA action failed");
    } finally {
      setLoading(null);
    }
  }

  const jiraUrl = status.site_url
    ? `${status.site_url}/jira/software/projects/${status.project_key}`
    : null;

  return (
    <div className="space-y-2.5 rounded-lg bg-white/[0.04] px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--sidebar-muted)]">
          <Link2 className="h-3 w-3" />
          JIRA · {status.project_key}
        </p>
        {jiraUrl && (
          <a
            href={jiraUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--sidebar-muted)] hover:text-white"
            title="Open in JIRA"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <p className="text-[11px] text-slate-300">
        <span className="font-medium text-white">{status.linked_tickets}</span>
        <span className="text-[var(--sidebar-muted)]"> / {status.total_tickets} linked</span>
      </p>

      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => run("sync")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium",
            "bg-white/10 text-slate-200 hover:bg-white/15 disabled:opacity-50",
          )}
        >
          <RefreshCw className={cn("h-3 w-3", loading === "sync" && "animate-spin")} />
          Sync
        </button>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => run("push")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium",
            "bg-white/10 text-slate-200 hover:bg-white/15 disabled:opacity-50",
          )}
        >
          <Upload className={cn("h-3 w-3", loading === "push" && "animate-pulse")} />
          Push
        </button>
      </div>
    </div>
  );
}
