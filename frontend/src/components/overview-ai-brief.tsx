"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Sparkles, Target, AlertTriangle, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import type { CommandCenterResponse } from "@/lib/types";
import { alignmentBg } from "@/lib/utils";
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
      <Card className="border-indigo-200 bg-indigo-50/30">
        <CardBody className="py-8 text-center text-sm text-[var(--muted)]">
          Loading AI insights…
        </CardBody>
      </Card>
    );
  }

  if (!hasInsights) {
    return (
      <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white">
        <CardBody className="flex flex-wrap items-center justify-between gap-4 py-6">
          <div>
            <div className="flex items-center gap-2 text-indigo-600">
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-semibold">AI Copilot</span>
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {hasTickets
                ? "Run Magic to get release readiness, standup digest, sprint plan, and smart suggestions."
                : "Generate a spec first, then Run Magic for full project intelligence."}
            </p>
          </div>
          <Button
            loading={magicLoading}
            disabled={!hasTickets}
            onClick={onRunMagic}
            className="bg-indigo-600 hover:bg-indigo-700"
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
    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white">
      <CardHeader
        title="AI briefing"
        description="Latest intelligence from Command Center"
        action={
          <Button variant="ghost" className="text-xs" onClick={onOpenCommandCenter}>
            Full view <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        }
      />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {readiness && (
            <div className="rounded-lg border border-[var(--border)] bg-white p-3">
              <p className="text-xs font-medium uppercase text-[var(--muted)]">Release</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {readiness.readiness_score}%
              </p>
              <Badge className={`mt-1 ${alignmentBg(readiness.readiness_score)}`}>
                {readiness.verdict.replace("_", " ")}
              </Badge>
            </div>
          )}
          {standup && (
            <div className="rounded-lg border border-[var(--border)] bg-white p-3 sm:col-span-2">
              <p className="text-xs font-medium uppercase text-[var(--muted)]">Standup</p>
              <p className="mt-1 font-medium text-slate-900">{standup.headline}</p>
              {standup.blockers.length > 0 && (
                <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                  <AlertTriangle className="h-3 w-3" />
                  {standup.blockers.length} blocker{standup.blockers.length > 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}
          {creep && creep.items.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:col-span-3">
              <p className="text-xs font-medium uppercase text-amber-800">Scope creep</p>
              <p className="mt-1 text-sm text-amber-900">{creep.summary}</p>
            </div>
          )}
        </div>

        {suggestions.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase text-[var(--muted)]">
              <Target className="h-3.5 w-3.5" /> Today&apos;s focus
            </p>
            <ul className="space-y-1.5">
              {suggestions.slice(0, 4).map((s) => (
                <li key={s} className="flex gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
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
    </Card>
  );
}
