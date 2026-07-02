"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  GitBranch,
  Loader2,
  ShieldAlert,
  Sparkles,
  Ticket,
  User,
} from "lucide-react";
import { CommandCenter } from "@/components/command-center";
import { OverviewAIBrief } from "@/components/overview-ai-brief";
import { ProjectChat } from "@/components/project-chat";
import { RequirementEditor } from "@/components/requirement-editor";
import { api } from "@/lib/api";
import { dispatchProjectRefresh, onProjectRefresh } from "@/lib/refresh-events";
import type { DriftCheckResponse, ProjectDetail, TicketStatus } from "@/lib/types";
import {
  alignmentBg,
  alignmentColor,
  formatDate,
  formatRelative,
  priorityStyles,
  severityStyles,
  typeStyles,
} from "@/lib/utils";
import { GitBranchPicker } from "@/components/git-branch-picker";
import { JiraPanel } from "@/components/jira-panel";
import { StatusSelect } from "@/components/status-select";
import { TicketNudge } from "@/components/ticket-nudge";
import { TicketTitleEditor } from "@/components/ticket-title-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

type Tab = "overview" | "command" | "spec" | "tickets" | "git" | "drift";

const VALID_TABS: Tab[] = ["overview", "command", "spec", "tickets", "git", "drift"];

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Overview", icon: FileText },
  { id: "command", label: "Command Center", icon: Sparkles },
  { id: "spec", label: "Spec", icon: FileText },
  { id: "tickets", label: "Tickets", icon: Ticket },
  { id: "git", label: "Git Activity", icon: GitBranch },
  { id: "drift", label: "Drift", icon: ShieldAlert },
];

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [driftResult, setDriftResult] = useState<DriftCheckResponse | null>(null);
  const [requirement, setRequirement] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState("main");

  const hasRepo = Boolean(project?.repo_url || project?.local_repo_path);

  useEffect(() => {
    params.then((p) => setProjectId(p.id));
  }, [params]);

  useEffect(() => {
    const fromUrl = searchParams.get("tab");
    if (fromUrl && VALID_TABS.includes(fromUrl as Tab)) {
      setTab(fromUrl as Tab);
    }
  }, [searchParams]);

  const selectTab = useCallback(
    (id: Tab) => {
      setTab(id);
      if (projectId) {
        router.replace(`/projects/${projectId}?tab=${id}`, { scroll: false });
      }
    },
    [projectId, router],
  );

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.getProject(projectId);
      setProject(data);
      setRequirement(data.requirement);
      setSelectedBranch(data.repo_branch);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return onProjectRefresh(() => {
      void load();
    });
  }, [load]);

  const loadBranches = useCallback(async () => {
    if (!projectId || !hasRepo) return;
    setActionLoading("branches");
    try {
      const data = await api.listGitBranches(projectId);
      setBranches(data.branches);
      setDefaultBranch(data.default_branch);
      setSelectedBranch(data.current_branch);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load branches");
    } finally {
      setActionLoading(null);
    }
  }, [projectId, hasRepo]);

  useEffect(() => {
    if (hasRepo && projectId) {
      loadBranches();
    }
  }, [hasRepo, projectId, loadBranches]);

  async function handleRunMagic() {
    if (!projectId) return;
    setActionLoading("magic");
    setError(null);
    try {
      await api.runMagic(projectId);
      await load();
      dispatchProjectRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Magic run failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleAnalyze() {
    if (!projectId || requirement.trim().length < 10) return;
    setActionLoading("analyze");
    try {
      await api.analyzeRequirement(projectId, requirement);
      await load();
      dispatchProjectRefresh();
      selectTab("spec");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSyncGit(branch?: string) {
    if (!projectId) return;
    const targetBranch = branch ?? selectedBranch;
    setActionLoading("git");
    try {
      await api.syncGit(projectId, targetBranch);
      await load();
      dispatchProjectRefresh();
      if (branch) setSelectedBranch(branch);
      selectTab("git");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Git sync failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleBranchChange(branch: string) {
    if (branch === selectedBranch) return;
    setSelectedBranch(branch);
    await handleSyncGit(branch);
  }

  async function handleCheckDrift() {
    if (!projectId) return;
    setActionLoading("drift");
    try {
      const result = await api.checkDrift(projectId);
      setDriftResult(result);
      await load();
      dispatchProjectRefresh();
      selectTab("drift");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Drift check failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleTicketStatus(ticketId: string, status: TicketStatus) {
    setActionLoading(`ticket-${ticketId}`);
    try {
      await api.updateTicket(ticketId, { status });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setActionLoading(null);
    }
  }

  function handleTicketTitleSaved(ticketId: string, newTitle: string) {
    setError(null);
    setProject((current) =>
      current
        ? {
            ...current,
            tickets: current.tickets.map((ticket) =>
              ticket.id === ticketId ? { ...ticket, title: newTitle } : ticket,
            ),
          }
        : current,
    );
    dispatchProjectRefresh();
  }

  async function handleResolveDrift(alertId: string) {
    setActionLoading(`drift-${alertId}`);
    try {
      await api.resolveDrift(alertId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resolve failed");
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--muted)]" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center">
        <p className="text-[var(--muted)]">{error ?? "Project not found"}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-[var(--accent)]">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const openDrifts = project.drift_alerts.filter((d) => !d.resolved);

  return (
    <div className="animate-fade-in min-w-0 space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:theme-heading"
      >
        <ArrowLeft className="h-4 w-4" />
        Dashboard
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="page-title">{project.name}</h1>
            {project.alignment_score !== null && (
              <Badge className={alignmentBg(project.alignment_score)}>
                {project.alignment_score}% aligned
              </Badge>
            )}
            {openDrifts.length > 0 && (
              <Badge className="border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                {openDrifts.length} drift alert{openDrifts.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          {project.description && (
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--muted)]">
              {project.description}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {hasRepo && (
            <GitBranchPicker
              compact
              branches={branches}
              selectedBranch={selectedBranch}
              defaultBranch={defaultBranch}
              loading={actionLoading === "branches"}
              syncing={actionLoading === "git"}
              disabled={!hasRepo}
              onSelect={handleBranchChange}
              onRefreshBranches={loadBranches}
              onSync={() => handleSyncGit()}
            />
          )}
          <Button
            variant="secondary"
            loading={actionLoading === "drift"}
            onClick={handleCheckDrift}
            disabled={!project.spec}
          >
            <ShieldAlert className="h-4 w-4" />
            Check Drift
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error.length > 400 ? `${error.slice(0, 400)}…` : error}
        </p>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)]">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => selectTab(id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-[13px] font-medium transition-colors ${
              tab === id
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--muted)] hover:theme-body"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {id === "drift" && openDrifts.length > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {openDrifts.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-8 animate-fade-in">
          {projectId && (
            <OverviewAIBrief
              projectId={projectId}
              hasTickets={project.tickets.length > 0}
              magicLoading={actionLoading === "magic"}
              onRunMagic={handleRunMagic}
              onOpenCommandCenter={() => selectTab("command")}
            />
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Requirement" />
              <CardBody className="space-y-4">
                <RequirementEditor
                  value={requirement}
                  onChange={setRequirement}
                  onError={setError}
                  disabled={actionLoading === "analyze"}
                  placeholder="Paste or edit your requirement..."
                />
                <Button
                  loading={actionLoading === "analyze"}
                  onClick={handleAnalyze}
                  disabled={requirement.trim().length < 10}
                >
                  {project.spec ? "Re-analyze Requirement" : "Generate Spec & Tickets"}
                </Button>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Quick stats" />
              <CardBody className="space-y-4">
                <StatRow label="Tickets" value={String(project.tickets.length)} />
                <StatRow
                  label="Alignment"
                  value={
                    project.alignment_score !== null
                      ? `${project.alignment_score}%`
                      : "Not checked"
                  }
                  valueClass={alignmentColor(project.alignment_score)}
                />
                <StatRow label="Commits tracked" value={String(project.recent_commits.length)} />
                <StatRow label="Open drift alerts" value={String(openDrifts.length)} />
                <StatRow
                  label="Repository"
                  value={
                    project.repo_url ?? project.local_repo_path ?? "Not connected"
                  }
                />
                <StatRow label="Branch" value={project.repo_branch} />
              </CardBody>
            </Card>
          </div>
          {projectId && (
            <ProjectChat projectId={projectId} onError={setError} />
          )}
        </div>
      )}

      {tab === "command" && projectId && (
        <CommandCenter
          projectId={projectId}
          hasTickets={project.tickets.length > 0}
          hasCommits={project.recent_commits.length > 0}
          onError={setError}
        />
      )}

      {tab === "spec" && (
        <Card>
          {!project.spec ? (
            <CardBody className="py-16 text-center text-[var(--muted)]">
              No spec yet. Add a requirement on the Overview tab and generate one.
            </CardBody>
          ) : (
            <>
              <CardHeader
                title={project.spec.title}
                description={`Version ${project.spec.version} · ${formatDate(project.spec.created_at)}`}
              />
              <CardBody className="space-y-6">
                <Section title="Overview" content={project.spec.overview} />
                <ListSection title="Goals" items={project.spec.goals} />
                <ListSection title="Non-goals" items={project.spec.non_goals} />
                <ListSection title="Acceptance criteria" items={project.spec.acceptance_criteria} />
                <Section title="Technical approach" content={project.spec.technical_approach} />
                <ListSection title="Constraints" items={project.spec.constraints} />
                <ListSection title="Risks" items={project.spec.risks} />
                <ListSection title="Open questions" items={project.spec.open_questions} />
              </CardBody>
            </>
          )}
        </Card>
      )}

      {tab === "tickets" && (
        <div className="space-y-3">
          {projectId && (
            <JiraPanel
              projectId={projectId}
              jiraSiteUrl={project.jira_site_url}
              jiraProjectKey={project.jira_project_key}
              ticketCount={project.tickets.length}
              onUpdated={load}
              onError={setError}
            />
          )}
          {project.tickets.length === 0 ? (
            <Card>
              <CardBody className="py-12 text-center text-[var(--muted)]">
                No local tickets yet. Generate a spec from your requirement, or import
                existing issues from JIRA above.
              </CardBody>
            </Card>
          ) : (
            project.tickets.map((ticket) => (
              <Card key={ticket.id}>
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <TicketTitleEditor
                          ticketId={ticket.id}
                          title={ticket.title}
                          disabled={actionLoading === `ticket-${ticket.id}`}
                          onSaved={(newTitle) => handleTicketTitleSaved(ticket.id, newTitle)}
                          onError={setError}
                        />
                        {ticket.jira_issue_key && ticket.jira_url && (
                          <a
                            href={ticket.jira_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/60"
                          >
                            {ticket.jira_issue_key}
                          </a>
                        )}
                        <Badge className={typeStyles(ticket.ticket_type)}>
                          {ticket.ticket_type}
                        </Badge>
                        <Badge className={priorityStyles(ticket.priority)}>
                          {ticket.priority}
                        </Badge>
                        <span
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${
                            ticket.assignee
                              ? "bg-[var(--surface-muted)] theme-body"
                              : "bg-[var(--surface-muted)] text-[var(--muted)] italic"
                          }`}
                          title={ticket.assignee ? "JIRA assignee" : "No assignee"}
                        >
                          <User className="h-3 w-3" />
                          {ticket.assignee ?? "Unassigned"}
                        </span>
                        {ticket.estimated_points && (
                          <span className="text-xs text-[var(--muted)]">
                            {ticket.estimated_points} pts
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-[var(--muted)]">{ticket.description}</p>
                      {ticket.acceptance_criteria.length > 0 && (
                        <ul className="mt-3 space-y-1 text-sm theme-body">
                          {ticket.acceptance_criteria.map((c) => (
                            <li key={c} className="flex gap-2">
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                              {c}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <StatusSelect
                      value={ticket.status}
                      disabled={actionLoading === `ticket-${ticket.id}`}
                      onChange={(status) => handleTicketStatus(ticket.id, status)}
                    />
                  </div>
                  <TicketNudge
                    ticket={ticket}
                    onError={setError}
                    onSuccess={(msg) => {
                      setError(null);
                      if (projectId) dispatchProjectRefresh();
                    }}
                  />
                </CardBody>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "git" && (
        <Card>
          <CardHeader
            title="Git activity"
            description={
              project.repo_url || project.local_repo_path
                ? String(project.repo_url ?? project.local_repo_path)
                : "Connect a repository in project settings"
            }
          />
          <CardBody className="space-y-6">
            {hasRepo ? (
              <GitBranchPicker
                branches={branches}
                selectedBranch={selectedBranch}
                defaultBranch={defaultBranch}
                loading={actionLoading === "branches"}
                syncing={actionLoading === "git"}
                disabled={!hasRepo}
                onSelect={handleBranchChange}
                onRefreshBranches={loadBranches}
                onSync={() => handleSyncGit()}
              />
            ) : (
              <p className="py-2 text-sm text-[var(--muted)]">
                Connect a GitHub URL or local repo path to track commits.
              </p>
            )}

            {project.recent_commits.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--muted)]">
                No commits synced for <strong>{project.repo_branch}</strong>. Select a
                branch and click Sync.
              </p>
            ) : (
              <div className="divide-y divide-[var(--border)] pt-2">
                {project.recent_commits.map((commit) => (
                  <div key={commit.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-muted)] font-mono text-xs theme-body">
                      {commit.sha.slice(0, 7)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium theme-heading">{commit.message}</p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {commit.author} · {formatRelative(commit.committed_at)} · +
                        {commit.additions}/-{commit.deletions}
                      </p>
                      {commit.files_changed.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {commit.files_changed.slice(0, 6).map((f) => (
                            <span
                              key={f}
                              className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-[10px] theme-body"
                            >
                              {f}
                            </span>
                          ))}
                          {commit.files_changed.length > 6 && (
                            <span className="text-[10px] text-[var(--muted)]">
                              +{commit.files_changed.length - 6} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {commit.url && (
                      <a
                        href={commit.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs text-[var(--accent)] hover:underline"
                      >
                        View
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {tab === "drift" && (
        <div className="space-y-6">
          {driftResult && (
            <Card className="border-[var(--info-border)] bg-[var(--info-surface)]">
              <CardBody>
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border text-lg font-bold ${alignmentBg(driftResult.alignment_score)}`}
                  >
                    {driftResult.alignment_score}%
                  </div>
                  <div>
                    <p className="font-semibold theme-heading">Latest drift analysis</p>
                    <p className="mt-1 text-sm leading-relaxed theme-body">{driftResult.summary}</p>
                  </div>
                </div>
                {(driftResult.covered_requirements.length > 0 ||
                  driftResult.missing_requirements.length > 0) && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {driftResult.covered_requirements.length > 0 && (
                      <ListSection
                        title="Covered"
                        items={driftResult.covered_requirements}
                        compact
                      />
                    )}
                    {driftResult.missing_requirements.length > 0 && (
                      <ListSection
                        title="Missing"
                        items={driftResult.missing_requirements}
                        compact
                      />
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {openDrifts.length === 0 && !driftResult ? (
            <Card>
              <CardBody className="flex flex-col items-center py-16 text-center">
                <ShieldAlert className="mb-4 h-10 w-10 text-[var(--muted)]" />
                <p className="text-[var(--muted)]">
                  No drift alerts. Sync git activity and run a drift check.
                </p>
                <Button
                  className="mt-4"
                  onClick={handleCheckDrift}
                  loading={actionLoading === "drift"}
                  disabled={!project.spec || actionLoading === "drift"}
                >
                  Run Drift Check
                </Button>
              </CardBody>
            </Card>
          ) : (
            openDrifts.map((alert) => (
              <Card key={alert.id} className="border-l-4 border-l-amber-400">
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium theme-heading">{alert.title}</h3>
                          <Badge className={severityStyles(alert.severity)}>
                            {alert.severity}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-[var(--muted)]">{alert.description}</p>
                        <div className="mt-3 space-y-2 rounded-lg bg-[var(--surface-muted)] p-3 text-sm">
                          <p>
                            <span className="font-medium theme-body">Spec ref:</span>{" "}
                            {alert.spec_reference}
                          </p>
                          <p>
                            <span className="font-medium theme-body">Evidence:</span>{" "}
                            {alert.code_evidence}
                          </p>
                          <p>
                            <span className="font-medium theme-body">Recommendation:</span>{" "}
                            {alert.recommendation}
                          </p>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      loading={actionLoading === `drift-${alert.id}`}
                      onClick={() => handleResolveDrift(alert.id)}
                    >
                      Resolve
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function StatRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-[var(--muted)]">{label}</span>
      <span className={`text-sm font-medium ${valueClass ?? "theme-heading"}`}>{value}</span>
    </div>
  );
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed theme-body">{content}</p>
    </div>
  );
}

function ListSection({
  title,
  items,
  compact,
}: {
  title: string;
  items: string[];
  compact?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        {title}
      </h3>
      <ul className={`mt-2 space-y-1.5 ${compact ? "text-sm" : ""}`}>
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm theme-body">
            <span className="text-[var(--muted)]">•</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
