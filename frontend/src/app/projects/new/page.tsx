"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { RequirementEditor } from "@/components/requirement-editor";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export default function NewProjectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [requirement, setRequirement] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [repoBranch, setRepoBranch] = useState("main");
  const [localPath, setLocalPath] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Project name is required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const project = await api.createProject({
        name: name.trim(),
        description: description.trim(),
        requirement: requirement.trim(),
        repo_url: repoUrl.trim() || null,
        repo_branch: repoBranch.trim() || "main",
        local_repo_path: localPath.trim() || null,
      });
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-in mx-auto max-w-3xl space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:theme-heading"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight theme-heading">
          New Project
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Describe what you want to build. Continuum will generate a spec and tickets.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader title="Project details" />
          <CardBody className="space-y-4">
            <Field label="Project name" required>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="User authentication module"
              />
            </Field>
            <Field label="Description">
              <input
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short summary for the dashboard"
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Requirement"
            description="Type your requirement or upload a PDF/DOCX document. AI generates spec + tickets on create."
          />
          <CardBody>
            <RequirementEditor
              value={requirement}
              onChange={setRequirement}
              onError={setError}
              disabled={loading}
              minHeight="180px"
              placeholder={`Example:\n\nBuild a user authentication system with email/password signup, OAuth (Google), JWT sessions, password reset flow, and rate limiting on login attempts. Must support 10k concurrent users.`}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Git repository"
            description="Optional — connect a repo to track commits and detect drift."
          />
          <CardBody className="space-y-4">
            <Field label="Repository URL (GitHub, GitLab, or Azure DevOps)">
              <input
                className="input"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/org/repo or gitlab.com/group/project"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Branch">
                <input
                  className="input"
                  value={repoBranch}
                  onChange={(e) => setRepoBranch(e.target.value)}
                  placeholder="main"
                />
              </Field>
              <Field label="Local repo path (alternative)">
                <input
                  className="input"
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  placeholder="/Users/you/projects/my-app"
                />
              </Field>
            </div>
          </CardBody>
        </Card>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Link href="/">
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Link>
          <Button type="submit" loading={loading}>
            {requirement.trim() ? "Create & Generate Spec" : "Create Project"}
          </Button>
        </div>
      </form>

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid var(--border);
          background: var(--input-bg);
          color: var(--foreground);
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s;
        }
        .input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--ring);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium theme-body">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
