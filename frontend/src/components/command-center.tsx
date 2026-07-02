"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Copy,
  Loader2,
  Sparkles,
  Target,
  Wand2,
  CheckCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import type {
  CommandCenterResponse,
  MagicRunResponse,
  ReleaseReadinessResult,
  ScopeCreepResult,
  SprintPlanResult,
  StandupDigestResult,
} from "@/lib/types";
import { ProjectChat } from "@/components/project-chat";
import { StatusBadge } from "@/components/status-select";
import { alignmentBg, severityStyles } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

interface CommandCenterProps {
  projectId: string;
  hasTickets: boolean;
  hasCommits: boolean;
  onError: (msg: string) => void;
}

export function CommandCenter({
  projectId,
  hasTickets,
  hasCommits,
  onError,
}: CommandCenterProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [data, setData] = useState<CommandCenterResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const cc = await api.getCommandCenter(projectId);
      setData(cc);
    } catch {
      /* cache may be empty */
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runMagic() {
    setLoading("magic");
    onError("");
    try {
      const result = await api.runMagic(projectId);
      setData({
        project_id: projectId,
        standup: result.standup,
        sprint_plan: result.sprint_plan,
        readiness: result.readiness,
        scope_creep: result.scope_creep,
        commit_links: result.commit_links,
        latest_insights: [],
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Magic run failed");
    } finally {
      setLoading(null);
    }
  }

  async function runSingle(
    key: string,
    fn: () => Promise<Partial<CommandCenterResponse>>,
  ) {
    setLoading(key);
    onError("");
    try {
      const partial = await fn();
      setData((prev) => ({
        project_id: projectId,
        latest_insights: prev?.latest_insights ?? [],
        standup: partial.standup ?? prev?.standup ?? null,
        sprint_plan: partial.sprint_plan ?? prev?.sprint_plan ?? null,
        readiness: partial.readiness ?? prev?.readiness ?? null,
        scope_creep: partial.scope_creep ?? prev?.scope_creep ?? null,
        commit_links: partial.commit_links ?? prev?.commit_links ?? null,
      }));
    } catch (e) {
      onError(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setLoading(null);
    }
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text);
  }

  async function applyCommitLinks() {
    setLoading("apply-links");
    onError("");
    try {
      const result = await api.applyCommitLinks(projectId);
      if (result.applied === 0) {
        const hint =
          result.details.length > 0
            ? result.details.slice(0, 3).join(" · ")
            : "Links found but nothing to change — tickets may already match suggested statuses.";
        onError(`No ticket statuses were updated. ${hint}`);
      }
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setLoading(null);
    }
  }

  const ready = data?.readiness;
  const standup = data?.standup;
  const sprint = data?.sprint_plan;
  const creep = data?.scope_creep;
  const links = data?.commit_links;

  return (
    <div className="min-w-0 space-y-6">
      {/* Hero */}
      <Card className="overflow-hidden border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-violet-50">
        <CardBody className="flex flex-wrap items-center justify-between gap-4 py-6">
          <div>
            <div className="flex items-center gap-2 text-indigo-600">
              <Sparkles className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-wide">
                AI Command Center
              </span>
            </div>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              One click. Full sprint intelligence.
            </h2>
            <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
              Standup digest, sprint plan, release readiness, scope creep radar, and
              commit-to-ticket linking — all powered by Continuum.
            </p>
          </div>
          <Button
            loading={loading === "magic"}
            disabled={!hasTickets}
            onClick={runMagic}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Wand2 className="h-4 w-4" />
            {loading === "magic" ? "Analyzing… (1–2 min)" : "Run Magic ✨"}
          </Button>
        </CardBody>
      </Card>

      {!hasTickets && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Generate a spec and tickets first to unlock AI features.
        </p>
      )}

      {/* Score cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ScoreCard
          label="Release readiness"
          score={ready?.readiness_score ?? null}
          subtitle={ready?.verdict?.replace("_", " ") ?? "Not assessed"}
          loading={loading === "readiness" || loading === "magic"}
          onRefresh={() =>
            runSingle("readiness", async () => ({
              readiness: await api.generateReadiness(projectId),
            }))
          }
        />
        <ScoreCard
          label="Scope creep risk"
          score={creep ? 100 - creep.creep_score : null}
          subtitle={creep ? `${creep.items.length} alerts` : "Not assessed"}
          loading={loading === "scope" || loading === "magic"}
          invert
          onRefresh={() =>
            runSingle("scope", async () => ({
              scope_creep: await api.detectScopeCreep(projectId),
            }))
          }
        />
        <ScoreCard
          label="Commit links"
          score={
            links && links.links.length
              ? (() => {
                  const withEvidence = links.links.filter(
                    (l) =>
                      (l.commit_shas?.length ?? 0) > 0 ||
                      Boolean(l.suggested_status) ||
                      Boolean(l.evidence?.trim()),
                  ).length;
                  const total = links.links.length + links.unlinked_commits.length || 1;
                  return Math.round((withEvidence / total) * 100);
                })()
              : null
          }
          subtitle={
            links
              ? links.links.length
                ? `${links.links.length} ticket${links.links.length > 1 ? "s" : ""} matched`
                : `${links.unlinked_commits.length} unlinked commits`
              : hasCommits
                ? "Not linked"
                : "Sync git first"
          }
          loading={loading === "links" || loading === "magic"}
          onRefresh={() =>
            runSingle("links", async () => ({
              commit_links: await api.linkCommits(projectId),
            }))
          }
          disabled={!hasCommits}
        />
      </div>

      {/* Standup */}
      <Card>
        <CardHeader
          title="Daily standup digest"
          description="AI-generated script ready for your ceremony"
          action={
            <Button
              variant="secondary"
              className="text-xs"
              loading={loading === "standup"}
              disabled={!hasTickets}
              onClick={() =>
                runSingle("standup", async () => ({
                  standup: await api.generateStandup(projectId),
                }))
              }
            >
              Generate
            </Button>
          }
        />
        <CardBody>
          {!standup ? (
            <Empty hint="Run Magic or generate standup" />
          ) : (
            <div className="min-w-0 space-y-4">
              <p className="break-words text-lg font-medium text-slate-900">{standup.headline}</p>
              <p className="break-words text-sm text-[var(--muted)]">{standup.summary}</p>
              {standup.wins.length > 0 && (
                <TagSection title="Wins" items={standup.wins} color="emerald" />
              )}
              {standup.blockers.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">
                    Blockers
                  </p>
                  <div className="space-y-2">
                    {standup.blockers.map((b) => (
                      <div
                        key={b.title + b.description}
                        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm break-words"
                      >
                        <strong className="text-amber-900">{b.title}</strong>
                        {b.description && b.description.toLowerCase() !== b.title.toLowerCase() && (
                          <p className="mt-1 text-amber-800">{b.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {standup.today_suggestions.length > 0 && (
                <TagSection title="Today's focus" items={standup.today_suggestions} color="emerald" />
              )}
              <CopyBlock label="Standup script" text={standup.standup_script} onCopy={copyText} />
              <CopyBlock label="Slack / Teams" text={standup.slack_message} onCopy={copyText} />
            </div>
          )}
        </CardBody>
      </Card>

      {/* Sprint plan */}
      {sprint && (
        <Card>
          <CardHeader title="Sprint plan" description={sprint.summary} />
          <CardBody className="space-y-4">
            {sprint.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {sprint.warnings.map((w) => (
                  <p key={w}>⚠ {w}</p>
                ))}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {sprint.sprints.map((s) => (
                <div
                  key={s.name}
                  className="rounded-xl border border-[var(--border)] bg-slate-50/50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">{s.name}</h3>
                    <Badge className="bg-indigo-100 text-indigo-700">
                      {s.total_points} pts
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]">{s.goal}</p>
                  <ul className="mt-3 space-y-1">
                    {s.ticket_titles.map((t) => (
                      <li key={t} className="flex items-start gap-2 text-sm text-slate-700">
                        <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Readiness detail */}
      {ready && (
        <Card>
          <CardHeader
            title="Release readiness"
            action={
              <Badge className={alignmentBg(ready.readiness_score)}>
                {ready.verdict.replace("_", " ")}
              </Badge>
            }
          />
          <CardBody className="space-y-4">
            <p className="text-sm text-[var(--muted)]">{ready.summary}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {ready.checklist.map((item) => (
                <div
                  key={item.label}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    item.status === "pass"
                      ? "border-emerald-200 bg-emerald-50"
                      : item.status === "warn"
                        ? "border-amber-200 bg-amber-50"
                        : "border-red-200 bg-red-50"
                  }`}
                >
                  <strong>{item.label}</strong>
                  <p className="text-[var(--muted)]">{item.detail}</p>
                </div>
              ))}
            </div>
            <CopyBlock
              label="Stakeholder update"
              text={ready.stakeholder_message}
              onCopy={copyText}
            />
          </CardBody>
        </Card>
      )}

      {/* Scope creep */}
      {creep && creep.items.length > 0 && (
        <Card>
          <CardHeader title="Scope creep radar" description={creep.summary} />
          <CardBody className="space-y-3">
            {creep.items.map((item) => (
              <div
                key={item.title}
                className="flex gap-3 rounded-lg border border-[var(--border)] p-4"
              >
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.title}</span>
                    <Badge className={severityStyles(item.severity)}>{item.severity}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]">{item.description}</p>
                  <p className="mt-2 text-xs text-slate-600">
                    <strong>Fix:</strong> {item.recommendation}
                  </p>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Commit links */}
      {links && links.links.length > 0 && (
        <Card>
          <CardHeader
            title="Commit ↔ ticket links"
            description={links.summary}
            action={
              <Button
                variant="secondary"
                className="text-xs"
                loading={loading === "apply-links"}
                onClick={applyCommitLinks}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Apply statuses
              </Button>
            }
          />
          <CardBody className="space-y-3">
            {links.links.map((link) => (
              <div
                key={link.ticket_title}
                className="rounded-lg border border-[var(--border)] px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{link.ticket_title}</span>
                  <Badge className="bg-blue-100 text-blue-700">
                    {Math.round(link.confidence * 100)}% match
                  </Badge>
                  {link.suggested_status && (
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--muted)]">
                      → <StatusBadge status={link.suggested_status} />
                    </span>
                  )}
                </div>
                <p className="mt-1 font-mono text-xs text-[var(--muted)]">
                  {link.commit_shas.join(", ")}
                </p>
                <p className="mt-1 text-sm text-slate-600">{link.evidence}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <ProjectChat projectId={projectId} compact onError={onError} />
    </div>
  );
}

function ScoreCard({
  label,
  score,
  subtitle,
  loading,
  invert,
  disabled,
  onRefresh,
}: {
  label: string;
  score: number | null;
  subtitle: string;
  loading?: boolean;
  invert?: boolean;
  disabled?: boolean;
  onRefresh: () => void;
}) {
  const display = score !== null ? (invert ? score : score) : "—";
  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              {label}
            </p>
            <p
              className={`mt-1 text-3xl font-bold ${
                score !== null && score >= 80
                  ? "text-emerald-600"
                  : score !== null && score >= 50
                    ? "text-amber-600"
                    : "text-slate-900"
              }`}
            >
              {display}
              {score !== null && <span className="text-lg">%</span>}
            </p>
            <p className="text-xs capitalize text-[var(--muted)]">{subtitle}</p>
          </div>
          <Button
            variant="ghost"
            className="px-2 py-1 text-xs"
            loading={loading}
            disabled={disabled}
            onClick={onRefresh}
          >
            ↻
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function formatScriptForDisplay(text: string): string {
  if (text.includes("\n")) return text;
  return text
    .replace(/(?=\*\*[A-Za-z])/g, "\n\n")
    .replace(/(?=\d+\.\s)/g, "\n")
    .trim();
}

function CopyBlock({
  label,
  text,
  onCopy,
}: {
  label: string;
  text: string;
  onCopy: (t: string) => void;
}) {
  const lines = formatScriptForDisplay(text).split(/\n/).map((line) => line.trimEnd());

  return (
    <div className="w-full rounded-lg border border-[var(--border)] bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase text-[var(--muted)]">{label}</span>
        <button
          type="button"
          onClick={() => onCopy(text)}
          className="flex shrink-0 items-center gap-1 text-xs text-indigo-600 hover:underline"
        >
          <Copy className="h-3 w-3" /> Copy
        </button>
      </div>
      <div className="text-readable w-full space-y-2.5 text-sm leading-7 text-slate-700">
        {lines.map((line, i) =>
          line === "" ? (
            <div key={i} className="h-1" />
          ) : (
            <p key={i} className="whitespace-pre-wrap">
              {line}
            </p>
          ),
        )}
      </div>
    </div>
  );
}

function TagSection({
  title,
  items,
  color,
}: {
  title: string;
  items: string[];
  color: "emerald";
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className={`max-w-full break-words rounded-full px-3 py-1 text-xs ${
              color === "emerald" ? "bg-emerald-100 text-emerald-800" : ""
            }`}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return (
    <div className="flex flex-col items-center py-10 text-center text-sm text-[var(--muted)]">
      <Loader2 className="mb-2 h-8 w-8 opacity-30" />
      {hint}
    </div>
  );
}
