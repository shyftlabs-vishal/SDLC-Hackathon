"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  GitCommitHorizontal,
  Loader2,
  Target,
  Ticket,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api";
import type { PerformanceAnalyticsResponse } from "@/lib/types";
import { onProjectRefresh } from "@/lib/refresh-events";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

type Props = {
  projectId: string;
};

const GRADE_LABEL: Record<PerformanceAnalyticsResponse["grade"], string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  at_risk: "At risk",
  critical: "Critical",
};

const GRADE_STYLE: Record<PerformanceAnalyticsResponse["grade"], string> = {
  excellent:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  good: "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300",
  fair: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  at_risk:
    "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
  critical:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
};

const STATUS_BAR: Record<PerformanceAnalyticsResponse["breakdown"][0]["status"], string> = {
  strong: "bg-emerald-500",
  moderate: "bg-amber-500",
  weak: "bg-rose-500",
};

const PRIORITY_STYLE: Record<
  PerformanceAnalyticsResponse["recommendations"][0]["priority"],
  string
> = {
  high: "border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30",
  medium: "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30",
  low: "border-[var(--border)] bg-[var(--surface-muted)]",
};

function ScoreRing({ score, grade }: { score: number; grade: PerformanceAnalyticsResponse["grade"] }) {
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative mx-auto h-28 w-28 shrink-0">
      <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="var(--border)"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(
            grade === "excellent" && "text-emerald-500",
            grade === "good" && "text-indigo-500",
            grade === "fair" && "text-amber-500",
            grade === "at_risk" && "text-orange-500",
            grade === "critical" && "text-rose-500",
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold theme-heading">{score}</span>
        <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">score</span>
      </div>
    </div>
  );
}

export function PerformanceAnalytics({ projectId }: Props) {
  const [data, setData] = useState<PerformanceAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getProjectPerformance(projectId);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load performance analytics");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    return onProjectRefresh(() => {
      void load();
    });
  }, [load]);

  if (loading) {
    return (
      <Card>
        <CardBody className="flex items-center gap-2 py-10 text-sm text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Calculating performance…
        </CardBody>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardBody className="py-8 text-center text-sm text-red-600 dark:text-red-400">
          {error ?? "Performance data unavailable"}
        </CardBody>
      </Card>
    );
  }

  const { delivery, drift, velocity } = data;

  return (
    <Card>
      <CardHeader
        title="Performance analytics"
        description="Delivery, drift, and git activity scored against your spec and tickets"
      />
      <CardBody className="space-y-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <ScoreRing score={data.overall_score} grade={data.grade} />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <Badge className={GRADE_STYLE[data.grade]}>{GRADE_LABEL[data.grade]}</Badge>
            <p className="mt-3 text-sm leading-relaxed theme-body">{data.summary}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <MetricTile
            icon={Ticket}
            label="Delivery"
            value={`${delivery.completion_rate}%`}
            sub={`${delivery.done}/${delivery.total_tickets || 0} done`}
          />
          <MetricTile
            icon={Target}
            label="Drift health"
            value={`${drift.health_score}%`}
            sub={
              drift.alignment_score !== null
                ? `${drift.alignment_score}% aligned · ${drift.open_alerts} open`
                : `${drift.open_alerts} open alerts`
            }
          />
          <MetricTile
            icon={GitCommitHorizontal}
            label="Git activity"
            value={`${velocity.activity_score}%`}
            sub={`${velocity.commits_last_7d} commits / 7d`}
          />
        </div>

        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Score breakdown
          </p>
          <div className="space-y-3">
            {data.breakdown.map((item) => (
              <div key={item.name}>
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium theme-heading">{item.name}</span>
                  <span className="text-[var(--muted)]">
                    {item.score}/100 · {item.weight_percent}% weight
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                  <div
                    className={cn("h-full rounded-full transition-all", STATUS_BAR[item.status])}
                    style={{ width: `${item.score}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold theme-heading">
              <TrendingUp className="h-4 w-4 text-[var(--accent)]" />
              Ticket pipeline
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <PipelineStat label="Done" value={delivery.done} good />
              <PipelineStat label="In progress" value={delivery.in_progress} />
              <PipelineStat label="In review" value={delivery.in_review} />
              <PipelineStat label="Backlog" value={delivery.backlog} />
              <PipelineStat label="Blocked" value={delivery.blocked} warn={delivery.blocked > 0} />
              <PipelineStat
                label="Story pts done"
                value={`${delivery.points_done}/${delivery.points_total}`}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold theme-heading">
              <Activity className="h-4 w-4 text-[var(--accent)]" />
              Drift & velocity
            </div>
            <div className="space-y-2 text-sm theme-body">
              <div className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">Open drift alerts</span>
                <span>{drift.open_alerts}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">Resolved alerts</span>
                <span>{drift.resolved_alerts}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">Critical / high open</span>
                <span>
                  {drift.critical_open} / {drift.high_open}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">Commits (14 days)</span>
                <span>{velocity.commits_last_14d}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[var(--muted)]">Repo linked</span>
                <span>{velocity.has_repo ? "Yes" : "No"}</span>
              </div>
            </div>
          </div>
        </div>

        {data.recommendations.length > 0 && (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Recommendations
            </p>
            <div className="space-y-2">
              {data.recommendations.map((rec) => (
                <div
                  key={rec.title}
                  className={cn("rounded-xl border p-3", PRIORITY_STYLE[rec.priority])}
                >
                  <div className="flex items-start gap-2">
                    {rec.priority === "high" ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted)]" />
                    )}
                    <div>
                      <p className="text-sm font-medium theme-heading">{rec.title}</p>
                      <p className="mt-0.5 text-sm text-[var(--muted)]">{rec.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold theme-heading">{value}</p>
      <p className="mt-0.5 text-xs text-[var(--muted)]">{sub}</p>
    </div>
  );
}

function PipelineStat({
  label,
  value,
  good,
  warn,
}: {
  label: string;
  value: string | number;
  good?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg bg-[var(--surface-muted)]/60 px-3 py-2">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p
        className={cn(
          "font-semibold theme-heading",
          good && "text-emerald-600 dark:text-emerald-400",
          warn && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}
