"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  GitPullRequest,
  Loader2,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import type { PRReviewResult, PullRequestSummary } from "@/lib/types";
import { alignmentBg, cn, severityStyles } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

type Props = {
  projectId: string;
  hasGitHubRepo: boolean;
  onError: (msg: string) => void;
};

const VERDICT_STYLES: Record<PRReviewResult["verdict"], string> = {
  approve:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  request_changes:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  needs_discussion:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
};

const VERDICT_LABEL: Record<PRReviewResult["verdict"], string> = {
  approve: "Approve",
  request_changes: "Request changes",
  needs_discussion: "Needs discussion",
};

const CATEGORY_LABEL: Record<PRReviewResult["findings"][0]["category"], string> = {
  spec_alignment: "Spec alignment",
  ticket_coverage: "Ticket coverage",
  scope_creep: "Scope creep",
  quality: "Quality",
  testing: "Testing",
  other: "Other",
};

export function PRReviewPanel({ projectId, hasGitHubRepo, onError }: Props) {
  const [pulls, setPulls] = useState<PullRequestSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedPr, setSelectedPr] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState<PRReviewResult | null>(null);

  const loadPulls = useCallback(async () => {
    if (!hasGitHubRepo) return;
    setLoadingList(true);
    try {
      const data = await api.listPullRequests(projectId);
      setPulls(data.pull_requests);
      onError("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to load pull requests");
      setPulls([]);
    } finally {
      setLoadingList(false);
    }
  }, [projectId, hasGitHubRepo, onError]);

  useEffect(() => {
    void loadPulls();
  }, [loadPulls]);

  async function runReview(prNumber: number) {
    setSelectedPr(prNumber);
    setReviewing(true);
    setReview(null);
    onError("");
    try {
      const result = await api.reviewPullRequest(projectId, prNumber);
      setReview(result);
    } catch (e) {
      onError(e instanceof Error ? e.message : "PR review failed");
    } finally {
      setReviewing(false);
    }
  }

  if (!hasGitHubRepo) {
    return (
      <Card>
        <CardHeader
          title="PR Review Agent"
          description="Spec-aware pull request reviews powered by Continuum"
        />
        <CardBody>
          <p className="text-sm text-[var(--muted)]">
            Connect a GitHub repository URL to review open pull requests against your
            spec and tickets.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="PR Review Agent"
        description="Review open PRs against your spec, tickets, and acceptance criteria"
        action={
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => void loadPulls()} disabled={loadingList}>
            {loadingList ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        }
      />
      <CardBody className="space-y-4">
        {loadingList && pulls.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-sm text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading open pull requests…
          </div>
        ) : pulls.length === 0 ? (
          <p className="py-4 text-sm text-[var(--muted)]">No open pull requests found.</p>
        ) : (
          <div className="space-y-2">
            {pulls.map((pr) => (
              <div
                key={pr.number}
                className={cn(
                  "rounded-xl border border-[var(--border)] p-4 transition-colors",
                  selectedPr === pr.number && "border-[var(--accent)] ring-1 ring-[var(--ring)]",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <GitPullRequest className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                      <span className="font-mono text-xs text-[var(--muted)]">#{pr.number}</span>
                      <h4 className="font-medium theme-heading">{pr.title}</h4>
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {pr.author} · {pr.head_branch} → {pr.base_branch}
                      {pr.changed_files > 0 && (
                        <> · {pr.changed_files} files (+{pr.additions}/-{pr.deletions})</>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                    >
                      GitHub
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <Button
                      className="px-3 py-1.5 text-xs"
                      onClick={() => void runReview(pr.number)}
                      disabled={reviewing && selectedPr === pr.number}
                    >
                      {reviewing && selectedPr === pr.number ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Reviewing…
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Review
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {review && selectedPr !== null && (
          <div className="space-y-4 border-t border-[var(--border)] pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className={VERDICT_STYLES[review.verdict]}>
                {VERDICT_LABEL[review.verdict]}
              </Badge>
              <Badge className={alignmentBg(review.alignment_score)}>
                {review.alignment_score}% aligned
              </Badge>
              <span className="text-sm text-[var(--muted)]">PR #{selectedPr}</span>
            </div>

            <p className="text-sm leading-relaxed theme-body">{review.summary}</p>

            {review.linked_tickets.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Linked tickets
                </p>
                <div className="flex flex-wrap gap-2">
                  {review.linked_tickets.map((ticket) => (
                    <Badge
                      key={ticket}
                      className="border-[var(--border)] bg-[var(--surface-muted)] text-[var(--body)]"
                    >
                      {ticket}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {review.strengths.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Strengths
                </p>
                <ul className="space-y-1 text-sm theme-body">
                  {review.strengths.map((item) => (
                    <li key={item} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {review.acceptance_criteria_gaps.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Acceptance criteria gaps
                </p>
                <ul className="space-y-1 text-sm theme-body">
                  {review.acceptance_criteria_gaps.map((item) => (
                    <li key={item} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {review.findings.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Findings
                </p>
                {review.findings.map((finding, index) => (
                  <div
                    key={`${finding.title}-${index}`}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/50 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={severityStyles(finding.severity)}>
                        {finding.severity}
                      </Badge>
                      <Badge className="border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
                        {CATEGORY_LABEL[finding.category]}
                      </Badge>
                      {finding.file && (
                        <span className="font-mono text-[10px] text-[var(--muted)]">
                          {finding.file}
                        </span>
                      )}
                    </div>
                    <h5 className="mt-2 font-medium theme-heading">{finding.title}</h5>
                    <p className="mt-1 text-sm text-[var(--muted)]">{finding.description}</p>
                    <p className="mt-2 text-sm theme-body">
                      <span className="font-medium">Recommendation:</span> {finding.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
