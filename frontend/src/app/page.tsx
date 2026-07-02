import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FolderKanban,
  GitCommit,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { alignmentBg, formatRelative } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let projects: Awaited<ReturnType<typeof api.listProjects>> = [];
  let health: Awaited<ReturnType<typeof api.health>> | null = null;
  let error: string | null = null;

  try {
    [projects, health] = await Promise.all([api.listProjects(), api.health()]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not reach backend";
  }

  const totalTickets = projects.reduce((n, p) => n + p.ticket_count, 0);
  const totalDrift = projects.reduce((n, p) => n + p.open_drift_count, 0);
  const avgAlignment =
    projects.filter((p) => p.alignment_score !== null).length > 0
      ? Math.round(
          projects
            .filter((p) => p.alignment_score !== null)
            .reduce((n, p) => n + (p.alignment_score ?? 0), 0) /
            projects.filter((p) => p.alignment_score !== null).length,
        )
      : null;

  return (
    <div className="animate-fade-in space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Requirements to specs, tickets, git tracking, and drift detection.
          </p>
        </div>
        <Link href="/projects/new">
          <Button>New Project</Button>
        </Link>
      </div>

      {error && (
        <Card className="border-amber-200 bg-amber-50">
          <CardBody>
            <p className="text-sm text-amber-800">
              <strong>Backend unavailable.</strong> {error}. Start the API with{" "}
              <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
                cd backend && python server.py
              </code>
            </p>
          </CardBody>
        </Card>
      )}

      {health && !health.llm_configured && (
        <Card className="border-amber-200 bg-amber-50">
          <CardBody>
            <p className="text-sm text-amber-800">
              <strong>
                {health.llm_provider === "AURA"
                  ? "SMART_GATEWAY_URL / SMART_GATEWAY_API_KEY"
                  : health.llm_provider === "GEMINI"
                    ? "GEMINI_API_KEY"
                    : "OPENAI_API_KEY"}{" "}
                not
                configured.
              </strong>{" "}
              Set <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
                LLM_PROVIDER={health.llm_provider}
              </code>{" "}
              and add the matching key to{" "}
              <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
                backend/.env
              </code>{" "}
              to enable spec generation and drift detection.
              {health.default_model && (
                <>
                  {" "}
                  Default model:{" "}
                  <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
                    {health.default_model}
                  </code>
                </>
              )}
            </p>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={FolderKanban}
          label="Projects"
          value={String(projects.length)}
        />
        <StatCard icon={GitCommit} label="Total Tickets" value={String(totalTickets)} />
        <StatCard
          icon={CheckCircle2}
          label="Avg Alignment"
          value={avgAlignment !== null ? `${avgAlignment}%` : "—"}
        />
        <StatCard
          icon={AlertTriangle}
          label="Open Drift Alerts"
          value={String(totalDrift)}
          accent={totalDrift > 0 ? "text-amber-600" : undefined}
        />
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Projects</h2>
        </div>

        {projects.length === 0 ? (
          <Card>
            <CardBody className="flex flex-col items-center py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
                <Sparkles className="h-7 w-7 text-blue-600" />
              </div>
              <h3 className="text-lg font-medium text-slate-900">No projects yet</h3>
              <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
                Create your first project, paste a requirement, and SDLC Conductor
                will generate a spec and tickets automatically.
              </p>
              <Link href="/projects/new" className="mt-6">
                <Button>Create Project</Button>
              </Link>
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-4">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardBody className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="truncate font-medium text-slate-900">
                          {project.name}
                        </h3>
                        {project.alignment_score !== null && (
                          <Badge className={alignmentBg(project.alignment_score)}>
                            {project.alignment_score}% aligned
                          </Badge>
                        )}
                        {project.open_drift_count > 0 && (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                            {project.open_drift_count} drift
                          </Badge>
                        )}
                      </div>
                      {project.description && (
                        <p className="mt-1 truncate text-sm text-[var(--muted)]">
                          {project.description}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-4 text-xs text-[var(--muted)]">
                        <span>{project.ticket_count} tickets</span>
                        {project.repo_url && (
                          <span className="truncate">{project.repo_url}</span>
                        )}
                        <span>Updated {formatRelative(project.updated_at)}</span>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 shrink-0 text-slate-300" />
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
            <Icon className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              {label}
            </p>
            <p className={`text-2xl font-semibold ${accent ?? "text-slate-900"}`}>
              {value}
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
