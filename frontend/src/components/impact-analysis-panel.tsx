"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { RequirementImpactResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

type Props = {
  projectId: string;
  newRequirement: string;
  hasSpec: boolean;
  onError?: (message: string | null) => void;
};

const SEVERITY_STYLE: Record<
  RequirementImpactResult["outdated_tickets"][0]["severity"],
  string
> = {
  critical: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300",
  high: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-300",
  medium: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300",
  low: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted)]",
};

export function ImpactAnalysisPanel({
  projectId,
  newRequirement,
  hasSpec,
  onError,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RequirementImpactResult | null>(null);

  async function handleAnalyze() {
    if (newRequirement.trim().length < 10) return;
    setLoading(true);
    onError?.(null);
    try {
      const data = await api.analyzeRequirementImpact(projectId, newRequirement);
      setResult(data);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Impact analysis failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  if (!hasSpec) return null;

  return (
    <Card className="border-indigo-200/60 dark:border-indigo-900/40">
      <CardHeader
        title="Requirement change impact"
        description="See which tickets and acceptance criteria may be outdated before re-analyzing"
      />
      <CardBody className="space-y-4">
        <Button
          variant="secondary"
          loading={loading}
          onClick={handleAnalyze}
          disabled={newRequirement.trim().length < 10}
        >
          <Sparkles className="h-4 w-4" />
          Analyze impact
        </Button>

        {result && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-sm leading-relaxed theme-body">{result.summary}</p>

            {result.spec_sections_affected.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Spec sections affected
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.spec_sections_affected.map((section) => (
                    <Badge key={section} className="bg-indigo-50 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
                      {section}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {result.outdated_tickets.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Outdated tickets ({result.outdated_tickets.length})
                </p>
                {result.outdated_tickets.map((item) => (
                  <div
                    key={item.ticket_title}
                    className={cn("rounded-xl border p-3", SEVERITY_STYLE[item.severity])}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold theme-heading">{item.ticket_title}</span>
                      <Badge className="text-[10px] uppercase">{item.severity}</Badge>
                    </div>
                    <p className="mt-1 text-sm">{item.reason}</p>
                    <p className="mt-1 text-xs opacity-80">→ {item.suggested_action}</p>
                  </div>
                ))}
              </div>
            )}

            {result.stale_acceptance_criteria.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Stale acceptance criteria ({result.stale_acceptance_criteria.length})
                </p>
                {result.stale_acceptance_criteria.map((item, i) => (
                  <div
                    key={`${item.criteria}-${i}`}
                    className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20"
                  >
                    {item.ticket_title && (
                      <p className="text-xs font-medium text-[var(--muted)]">{item.ticket_title}</p>
                    )}
                    <p className="text-sm font-medium theme-heading">{item.criteria}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{item.reason}</p>
                  </div>
                ))}
              </div>
            )}

            {result.recommended_actions.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Recommended actions
                </p>
                <ul className="list-inside list-disc space-y-1 text-sm theme-body">
                  {result.recommended_actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.outdated_tickets.length === 0 &&
              result.stale_acceptance_criteria.length === 0 && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  No major impact detected — safe to re-analyze when ready.
                </p>
              )}
          </div>
        )}

        {loading && !result && (
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Comparing requirement against spec and tickets…
          </div>
        )}
      </CardBody>
    </Card>
  );
}
