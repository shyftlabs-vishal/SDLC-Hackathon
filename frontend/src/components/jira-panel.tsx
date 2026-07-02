"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, ExternalLink, RefreshCw, Upload } from "lucide-react";
import { api } from "@/lib/api";
import type { JiraStatusResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

interface JiraPanelProps {
  projectId: string;
  jiraSiteUrl: string | null;
  jiraProjectKey: string | null;
  ticketCount: number;
  onUpdated: () => void;
  onError: (msg: string) => void;
}

export function JiraPanel({
  projectId,
  jiraSiteUrl,
  jiraProjectKey,
  ticketCount,
  onUpdated,
  onError,
}: JiraPanelProps) {
  const [status, setStatus] = useState<JiraStatusResponse | null>(null);
  const [siteUrl, setSiteUrl] = useState(jiraSiteUrl ?? "");
  const [projectKey, setProjectKey] = useState(jiraProjectKey ?? "");
  const [loading, setLoading] = useState<string | null>(null);
  const [enrichOnImport, setEnrichOnImport] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.getJiraStatus(projectId);
      setStatus(s);
    } catch {
      /* optional */
    }
  }, [projectId]);

  useEffect(() => {
    setSiteUrl(jiraSiteUrl ?? "");
    setProjectKey(jiraProjectKey ?? "");
  }, [jiraSiteUrl, jiraProjectKey]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function saveConfig() {
    setLoading("config");
    onError("");
    try {
      await api.configureJira(projectId, {
        jira_site_url: siteUrl.trim() || null,
        jira_project_key: projectKey.trim().toUpperCase() || null,
      });
      await loadStatus();
      onUpdated();
    } catch (e) {
      onError(e instanceof Error ? e.message : "JIRA config failed");
    } finally {
      setLoading(null);
    }
  }

  async function pushToJira() {
    setLoading("push");
    onError("");
    try {
      const result = await api.pushToJira(projectId);
      if (result.errors.length) {
        onError(result.errors.slice(0, 2).join(" · "));
      }
      await loadStatus();
      onUpdated();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Push to JIRA failed");
    } finally {
      setLoading(null);
    }
  }

  async function syncFromJira() {
    setLoading("sync");
    onError("");
    try {
      const result = await api.syncFromJira(projectId);
      if (result.errors.length) {
        onError(result.errors.slice(0, 2).join(" · "));
      }
      await loadStatus();
      onUpdated();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Sync from JIRA failed");
    } finally {
      setLoading(null);
    }
  }

  async function importFromJira() {
    setLoading("import");
    onError("");
    try {
      const result = await api.importFromJira(projectId, enrichOnImport);
      if (result.imported === 0 && result.skipped > 0) {
        onError("No new JIRA issues to import — all are already linked.");
      } else if (result.errors.length) {
        onError(result.errors.slice(0, 2).join(" · "));
      }
      await loadStatus();
      onUpdated();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Import from JIRA failed");
    } finally {
      setLoading(null);
    }
  }

  const linked = status?.linked_tickets ?? 0;
  const configured = status?.configured ?? false;
  const canPush = configured && projectKey.trim() && ticketCount > 0;
  const canImport = configured && projectKey.trim();

  return (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50/80 to-white">
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">JIRA integration</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Push local tickets to JIRA, import existing JIRA issues, and sync status, priority &amp; assignee.
            </p>
            {status?.user_display_name && (
              <p className="mt-1 text-xs text-blue-700">
                Connected as {status.user_display_name}
                {linked > 0 && ` · ${linked}/${ticketCount} linked`}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className="text-xs"
              loading={loading === "import"}
              disabled={!canImport}
              onClick={importFromJira}
            >
              <Download className="h-3.5 w-3.5" />
              Import from JIRA
            </Button>
            <Button
              variant="secondary"
              className="text-xs"
              loading={loading === "push"}
              disabled={!canPush}
              onClick={pushToJira}
            >
              <Upload className="h-3.5 w-3.5" />
              Push to JIRA
            </Button>
            <Button
              variant="secondary"
              className="text-xs"
              loading={loading === "sync"}
              disabled={!configured || linked === 0}
              onClick={syncFromJira}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Sync from JIRA
            </Button>
          </div>
        </div>

        {!configured && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Add <code className="text-[11px]">JIRA_SITE_URL</code>,{" "}
            <code className="text-[11px]">JIRA_EMAIL</code>, and{" "}
            <code className="text-[11px]">JIRA_API_TOKEN</code> to backend/.env
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            placeholder="https://yourorg.atlassian.net (optional override)"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
          />
          <input
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm uppercase focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-28"
            placeholder="PROJ"
            value={projectKey}
            onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
          />
          <Button
            variant="secondary"
            className="text-xs"
            loading={loading === "config"}
            onClick={saveConfig}
          >
            Save
          </Button>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={enrichOnImport}
            onChange={(e) => setEnrichOnImport(e.target.checked)}
            className="rounded border-[var(--border)]"
          />
          Enrich imported tickets with AI (acceptance criteria &amp; story points)
        </label>

        {status?.site_url && (
          <a
            href={status.site_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            Open JIRA <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </CardBody>
    </Card>
  );
}
