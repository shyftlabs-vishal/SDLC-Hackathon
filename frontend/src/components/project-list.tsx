"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FolderKanban, Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { ProjectSummary } from "@/lib/types";
import { dispatchProjectRefresh } from "@/lib/refresh-events";
import { alignmentBg, formatRelative } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ProjectList({ projects: initialProjects }: { projects: ProjectSummary[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingDelete || deleting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingDelete(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDelete, deleting]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteProject(pendingDelete.id);
      setProjects((prev) => prev.filter((p) => p.id !== pendingDelete.id));
      setPendingDelete(null);
      dispatchProjectRefresh();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete project");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((project) => (
          <div
            key={project.id}
            className="card-hover group relative h-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]"
          >
            <button
              type="button"
              onClick={() => {
                setError(null);
                setPendingDelete(project);
              }}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-[var(--muted)] opacity-70 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 dark:hover:border-red-900/50 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              aria-label={`Delete ${project.name}`}
              title="Delete project"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            <Link href={`/projects/${project.id}`} className="block min-w-0 pr-8">
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
                  {project.repo_url
                    ? project.repo_url.replace(/^https?:\/\//, "")
                    : "No repo linked"}
                </span>
                <span className="shrink-0">Updated {formatRelative(project.updated_at)}</span>
              </div>
            </Link>
          </div>
        ))}
      </div>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm"
          onClick={() => !deleting && setPendingDelete(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
          >
            <h3 id="delete-project-title" className="text-lg font-semibold theme-heading">
              Delete project?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Are you sure you want to delete{" "}
              <strong className="font-medium text-[var(--body)]">{pendingDelete.name}</strong>?
              This will permanently remove its spec, tickets, git history, and drift alerts.
            </p>
            {error && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting…
                  </>
                ) : (
                  "Delete project"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
