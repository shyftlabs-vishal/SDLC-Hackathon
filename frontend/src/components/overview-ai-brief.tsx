"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Sparkles, Target, AlertTriangle, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import type { CommandCenterResponse } from "@/lib/types";
import { alignmentBg, alignmentColor, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

interface OverviewAIBriefProps {
  projectId: string;
  hasTickets: boolean;
  onOpenCommandCenter: () => void;
  onRunMagic: () => void;
  magicLoading?: boolean;
}

const BRIEFING_SHELL =
  "relative overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-sm";
const BRIEFING_GLOW =
  "pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-500/[0.07] via-transparent to-violet-500/[0.05]";
const INSIGHT_TILE =
  "rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4";

export function OverviewAIBrief({
  projectId,
  hasTickets,
  onOpenCommandCenter,
  onRunMagic,
  magicLoading,
}: OverviewAIBriefProps) {
  const [data, setData] = useState<CommandCenterResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const cc = await api.getCommandCenter(projectId);
      setData(cc);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const hasInsights =
    data?.readiness || data?.standup || data?.scope_creep || data?.commit_links;

  if (loading) {
    return (
      <Card className={BRIEFING_SHELL}>
        <div className={BRIEFING_GLOW} aria-hidden />
        <CardBody className="relative py-10 text-center text-sm text-[var(--muted)]">
          <Sparkles className="mx-auto mb-2 h-5 w-5 animate-pulse text-indigo-500" />
          Loading AI insights…
        </CardBody>
      </Card>
    );
  }

  if (!hasInsights) {
    return (
      <Card className={BRIEFING_SHELL}>
        <div className={BRIEFING_GLOW} aria-hidden />
        <CardBody className="relative flex flex-wrap items-center justify-between gap-4 py-6">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-semibold">AI Copilot</span>
            </div>
            <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
              {hasTickets
                ? "Run Magic to get release readiness, standup digest, sprint plan, and smart suggestions."
                : "Generate a spec first, then Run Magic for full project intelligence."}
            </p>
          </div>
          <Button
            loading={magicLoading}
            disabled={!hasTickets}
            onClick={onRunMagic}
            className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            <Sparkles className="h-4 w-4" />
            Run Magic
          </Button>
        </CardBody>
      </Card>
    );
  }

  const readiness = data?.readiness;
  const standup = data?.standup;
  const creep = data?.scope_creep;
  const suggestions = standup?.today_suggestions ?? [];

  return (
    <Card className={BRIEFING_SHELL}>
      <div className={BRIEFING_GLOW} aria-hidden />
      <div className="relative">
        <CardHeader
          title="AI briefing"
          description="Latest intelligence from Command Center"
          action={
            <Button variant="ghost" className="text-xs" onClick={onOpenCommandCenter}>
              Full view <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          }
        />
        <CardBody className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {readiness && (
              <div className={INSIGHT_TILE}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Release
                </p>
                <p
                  className={cn(
                    "mt-2 text-3xl font-bold tabular-nums",
                    alignmentColor(readiness.readiness_score),
                  )}
                >
                  {readiness.readiness_score}%
                </p>
                <Badge className={`mt-2 capitalize ${alignmentBg(readiness.readiness_score)}`}>
                  {readiness.verdict.replace("_", " ")}
                </Badge>
              </div>
            )}
            {standup && (
              <div className={cn(INSIGHT_TILE, "sm:col-span-2")}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Standup
                </p>
                <p className="mt-2 text-base font-medium leading-snug theme-heading">
                  {standup.headline}
                </p>
                {standup.blockers.length > 0 && (
                  <p className="mt-2 inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    <AlertTriangle className="h-3 w-3" />
                    {standup.blockers.length} blocker{standup.blockers.length > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            )}
            {creep && creep.items.length > 0 && (
              <div
                className={cn(
                  INSIGHT_TILE,
                  "border-amber-200 bg-amber-50/80 sm:col-span-3 dark:border-amber-900/60 dark:bg-amber-950/30",
                )}
              >
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Scope creep
                </p>
                <p className="mt-2 text-sm leading-relaxed text-amber-950 dark:text-amber-100/90">
                  {creep.summary}
                </p>
              </div>
            )}
          </div>

          {suggestions.length > 0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                <Target className="h-3.5 w-3.5 text-indigo-500" />
                Today&apos;s focus
              </p>
              <ul className="space-y-2.5">
                {suggestions.slice(0, 4).map((s) => (
                  <li
                    key={s}
                    className="flex gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm leading-relaxed theme-body"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-400" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
            <Button
              variant="secondary"
              className="text-xs"
              loading={magicLoading}
              onClick={onRunMagic}
            >
              Refresh insights
            </Button>
            <Button variant="secondary" className="text-xs" onClick={onOpenCommandCenter}>
              Command Center
            </Button>
          </div>
        </CardBody>
      </div>
    </Card>
  );
}
