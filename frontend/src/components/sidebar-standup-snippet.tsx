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
    <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.04] px-3.5 py-3.5">
      <p className="sidebar-label">Today</p>

      {blockers.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Blockers
          </p>
          {blockers.map((b) => (
            <p
              key={b.title}
              className="line-clamp-2 text-xs leading-relaxed text-amber-100/90"
              title={b.description || b.title}
            >
              {b.title}
            </p>
          ))}
        </div>
      )}

      {focus.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-blue-300">
            <Target className="h-3.5 w-3.5 shrink-0" />
            Focus
          </p>
          <ul className="space-y-2">
            {focus.map((item) => (
              <li
                key={item}
                className="line-clamp-2 text-xs leading-relaxed text-slate-300"
                title={item}
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
