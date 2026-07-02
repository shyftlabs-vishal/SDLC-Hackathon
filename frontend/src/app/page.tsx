import Link from "next/link";
import {
  ArrowRight,
  FileText,
  FolderKanban,
  GitBranch,
  LayoutDashboard,
  Plus,
  ShieldAlert,
  Sparkles,
  Ticket,
} from "lucide-react";
import { api } from "@/lib/api";
import { alignmentBg, formatRelative } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: "Overview",
    description: "A live snapshot of specs, tickets, git, and drift in one glance.",
    tint: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-50 dark:bg-indigo-950/40",
  },
  {
    icon: Sparkles,
    title: "Command Center",
    description: "One click generates standup, sprint plan, and release readiness.",
    tint: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/40",
  },
  {
    icon: FileText,
    title: "Spec",
    description: "Turn a requirement or uploaded doc into a structured spec instantly.",
    tint: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/40",
  },
  {
    icon: Ticket,
    title: "Tickets",
    description: "AI-generated, estimated tickets that sync two-way with Jira.",
    tint: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
  },
  {
    icon: GitBranch,
    title: "Git Activity",
    description: "Track commits and link them back to the tickets they deliver.",
    tint: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
  },
  {
    icon: ShieldAlert,
    title: "Drift Detection",
    description: "Spot where the code diverges from the agreed spec, automatically.",
    tint: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-950/40",
  },
];

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
  const alignedProjects = projects.filter((p) => p.alignment_score !== null);
  const avgAlignment =
    alignedProjects.length > 0
      ? Math.round(
          alignedProjects.reduce((n, p) => n + (p.alignment_score ?? 0), 0) /
            alignedProjects.length,
        )
      : null;

  return (
    <div className="animate-fade-in space-y-10">
      {/* Hero */}
      <section className="hero-gradient relative overflow-hidden rounded-3xl px-7 py-10 shadow-[var(--shadow-lg)] sm:px-10 sm:py-14">
        <div className="hero-grid absolute inset-0 opacity-60" />
        <div className="relative z-10 max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5" />
            Powered by Continuum
          </span>
          <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-white sm:text-[2.6rem] sm:leading-[1.1]">
            From requirement to shipped,
            <br className="hidden sm:block" /> orchestrated by AI.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/80">
            SDLC Conductor turns requirements and documents into specs and tickets,
            tracks git activity, and flags drift — so your team always knows what to
            build next.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/projects/new">
              <button className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-indigo-700 shadow-lg transition-transform hover:-translate-y-0.5">
                <Plus className="h-4 w-4" />
                New Project
              </button>
            </Link>
            {projects.length > 0 && (
              <a
                href="#projects"
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              >
                View Projects
                <ArrowRight className="h-4 w-4" />
              </a>
            )}
          </div>

          <div className="mt-9 grid max-w-lg grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            <HeroStat label="Projects" value={String(projects.length)} />
            <HeroStat label="Tickets" value={String(totalTickets)} />
            <HeroStat
              label="Avg Align"
              value={avgAlignment !== null ? `${avgAlignment}%` : "—"}
            />
            <HeroStat label="Drift" value={String(totalDrift)} />
          </div>
        </div>
      </section>

      {error && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30">
          <CardBody>
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Backend unavailable.</strong> {error}. Start the API with{" "}
              <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/50 dark:text-amber-100">
                cd backend && python server.py
              </code>
            </p>
          </CardBody>
        </Card>
      )}

      {health && !health.llm_configured && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30">
          <CardBody>
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>
                {health.llm_provider === "AURA"
                  ? "SMART_GATEWAY_URL / SMART_GATEWAY_API_KEY"
                  : health.llm_provider === "GEMINI"
                    ? "GEMINI_API_KEY"
                    : "OPENAI_API_KEY"}{" "}
                not configured.
              </strong>{" "}
              Set{" "}
              <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/50 dark:text-amber-100">
                LLM_PROVIDER={health.llm_provider}
              </code>{" "}
              and add the matching key to{" "}
              <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/50 dark:text-amber-100">
                backend/.env
              </code>{" "}
              to enable spec generation and drift detection.
            </p>
          </CardBody>
        </Card>
      )}

      {/* Feature showcase */}
      <section>
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
            What you can do
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight theme-heading">
            Everything your sprint needs, in one place
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="feature-glow card-hover rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]"
            >
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl ${f.bg}`}
              >
                <f.icon className={`h-5 w-5 ${f.tint}`} />
              </div>
              <h3 className="mt-4 text-[15px] font-semibold theme-heading">
                {f.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Projects */}
      <section id="projects" className="scroll-mt-20">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              Your workspace
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight theme-heading">
              Projects
            </h2>
          </div>
          <Link href="/projects/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </Link>
        </div>

        {projects.length === 0 ? (
          <Card>
            <CardBody className="flex flex-col items-center py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-950/40">
                <Sparkles className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h3 className="text-lg font-semibold theme-heading">No projects yet</h3>
              <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
                Create your first project, paste a requirement or upload a document,
                and SDLC Conductor will generate a spec and tickets automatically.
              </p>
              <Link href="/projects/new" className="mt-6">
                <Button>Create Project</Button>
              </Link>
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} className="block min-w-0">
                <div className="card-hover group h-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
                        <FolderKanban className="h-5 w-5" />
                      </div>
                      <h3 className="break-words text-[15px] font-semibold theme-heading">
                        {project.name}
                      </h3>
                    </div>
                    <ArrowRight className="mt-0.5 h-5 w-5 shrink-0 text-[var(--muted)] transition-transform group-hover:translate-x-1 group-hover:text-[var(--accent)]" />
                  </div>

                  {project.description && (
                    <p className="mt-3 line-clamp-2 break-words text-sm leading-relaxed text-[var(--muted)]">
                      {project.description}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {project.alignment_score !== null && (
                      <Badge className={alignmentBg(project.alignment_score)}>
                        {project.alignment_score}% aligned
                      </Badge>
                    )}
                    {project.open_drift_count > 0 && (
                      <Badge className="border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                        {project.open_drift_count} drift
                      </Badge>
                    )}
                    <Badge className="border-[var(--border)] bg-[var(--surface-muted)] text-[var(--body)]">
                      {project.ticket_count} tickets
                    </Badge>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
                    <span className="min-w-0 break-all">
                      {project.repo_url ? project.repo_url.replace(/^https?:\/\//, "") : "No repo linked"}
                    </span>
                    <span className="shrink-0">Updated {formatRelative(project.updated_at)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-white/60">
        {label}
      </p>
    </div>
  );
}
