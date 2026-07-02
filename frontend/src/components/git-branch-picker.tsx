"use client";

import { GitBranch, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GitBranchPickerProps {
  branches: string[];
  selectedBranch: string;
  defaultBranch?: string | null;
  loading?: boolean;
  syncing?: boolean;
  disabled?: boolean;
  onSelect: (branch: string) => void;
  onRefreshBranches: () => void;
  onSync: () => void;
  compact?: boolean;
}

export function GitBranchPicker({
  branches,
  selectedBranch,
  defaultBranch,
  loading,
  syncing,
  disabled,
  onSelect,
  onRefreshBranches,
  onSync,
  compact,
}: GitBranchPickerProps) {
  const hasRepo = !disabled;

  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] ${
        compact ? "p-2.5" : "p-4"
      }`}
    >
      <div
        className={`flex flex-wrap items-center ${
          compact ? "gap-2.5" : "gap-3"
        } ${compact ? "" : "w-full"}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <GitBranch className="h-4 w-4 shrink-0 text-[var(--muted)]" />
          <select
            className="theme-input min-w-[160px] max-w-md flex-1 rounded-lg border px-3.5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            value={selectedBranch}
            disabled={disabled || loading || branches.length === 0}
            onChange={(e) => onSelect(e.target.value)}
          >
            {branches.length === 0 ? (
              <option value={selectedBranch}>{selectedBranch || "No branches"}</option>
            ) : (
              branches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                  {branch === defaultBranch ? " (default)" : ""}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            className="px-3.5 py-2.5 text-xs"
            loading={loading}
            disabled={!hasRepo}
            onClick={onRefreshBranches}
            title="Refresh branch list"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {!compact && "Branches"}
          </Button>

          <Button
            variant="secondary"
            className="px-3.5 py-2.5 text-xs"
            loading={syncing}
            disabled={!hasRepo}
            onClick={onSync}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sync
          </Button>
        </div>
      </div>
    </div>
  );
}
