"use client";

import { useEffect, useState } from "react";
import { Circle, Cpu, GitBranch, Link2 } from "lucide-react";
import { api } from "@/lib/api";
import type { HealthResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <Circle
      className={cn("h-2 w-2 shrink-0 fill-current", ok ? "text-emerald-400" : "text-amber-400")}
    />
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
  ok,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 text-xs">
      <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--sidebar-muted)]" />
      <span className="flex-1 truncate text-[var(--sidebar-muted)]">{label}</span>
      <StatusDot ok={ok} />
      <span className={cn("max-w-[88px] truncate font-medium", ok ? "text-slate-200" : "text-amber-300")}>
        {value}
      </span>
    </div>
  );
}

export function SidebarHealth() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const h = await api.health();
        if (!cancelled) {
          setHealth(h);
          setOnline(true);
        }
      } catch {
        if (!cancelled) {
          setHealth(null);
          setOnline(false);
        }
      }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const llmLabel = health?.llm_provider === "GEMINI" ? "Gemini" : "OpenAI";
  const llmOk = health?.llm_configured ?? false;

  return (
    <div className="space-y-2.5 rounded-lg bg-white/[0.04] px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sidebar-muted)]">
        System
      </p>
      <StatusRow
        icon={Circle}
        label="API"
        value={online ? "Online" : "Offline"}
        ok={online}
      />
      {health && (
        <>
          <StatusRow
            icon={Cpu}
            label="LLM"
            value={llmOk ? llmLabel : "Not set"}
            ok={llmOk}
          />
          <StatusRow
            icon={GitBranch}
            label="GitHub"
            value={health.github_configured ? "Linked" : "Optional"}
            ok={health.github_configured}
          />
          <StatusRow
            icon={Link2}
            label="JIRA"
            value={health.jira_configured ? "Ready" : "Optional"}
            ok={health.jira_configured}
          />
        </>
      )}
    </div>
  );
}
