"use client";

import { AlertTriangle, Target } from "lucide-react";
import type { StandupDigestResult } from "@/lib/types";

export function SidebarStandupSnippet({
  standup,
}: {
  standup: StandupDigestResult | null | undefined;
}) {
  if (!standup) return null;

  const blockers = standup.blockers.slice(0, 2);
  const focus = standup.today_suggestions.slice(0, 3);

  if (blockers.length === 0 && focus.length === 0) return null;

  return (
    <div className="space-y-2.5 rounded-lg bg-white/[0.04] px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sidebar-muted)]">
        Today
      </p>

      {blockers.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1 text-[10px] font-medium text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            Blockers
          </p>
          {blockers.map((b) => (
            <p
              key={b.title}
              className="truncate text-[11px] leading-snug text-amber-100/90"
              title={b.description || b.title}
            >
              {b.title}
            </p>
          ))}
        </div>
      )}

      {focus.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1 text-[10px] font-medium text-blue-300">
            <Target className="h-3 w-3" />
            Focus
          </p>
          <ul className="space-y-1">
            {focus.map((item) => (
              <li
                key={item}
                className="text-[11px] leading-snug text-slate-300 before:mr-1.5 before:text-[var(--sidebar-muted)] before:content-['·']"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
