import type {
  AnalyzeResponse,
  ApplyCommitLinksResponse,
  CommandCenterResponse,
  CommitLinkResult,
  DriftAlert,
  DriftCheckResponse,
  GitBranchesResponse,
  GitSyncResponse,
  HealthResponse,
  JiraImportResponse,
  JiraNudgeResponse,
  JiraPushResponse,
  JiraStatusResponse,
  JiraSyncResponse,
  MagicRunResponse,
  DocumentExtractResponse,
  ProjectActivityResponse,
  ProjectChatResult,
  ProjectDetail,
  ProjectSummary,
  ReleaseReadinessResult,
  ScopeCreepResult,
  SprintPlanResult,
  StandupDigestResult,
  Ticket,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8096";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<HealthResponse>("/api/health"),

  listProjects: () => request<ProjectSummary[]>("/api/projects"),

  getProject: (id: string) => request<ProjectDetail>(`/api/projects/${id}`),

  getProjectActivity: (projectId: string, limit = 15) =>
    request<ProjectActivityResponse>(
      `/api/projects/${projectId}/activity?limit=${limit}`,
    ),

  createProject: (body: {
    name: string;
    description?: string;
    requirement?: string;
    repo_url?: string | null;
    repo_branch?: string;
    local_repo_path?: string | null;
  }) =>
    request<ProjectDetail>("/api/projects", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateProject: (
    id: string,
    body: Partial<{
      name: string;
      description: string;
      repo_url: string | null;
      repo_branch: string;
      local_repo_path: string | null;
    }>,
  ) =>
    request<ProjectSummary>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteProject: (id: string) =>
    request<void>(`/api/projects/${id}`, { method: "DELETE" }),

  extractDocumentText: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/api/documents/extract-text`, {
      method: "POST",
      body: form,
      cache: "no-store",
    });
    if (!res.ok) {
      let detail = `Upload failed (${res.status})`;
      try {
        const body = await res.json();
        detail = body.detail ?? detail;
      } catch {
        /* ignore */
      }
      throw new Error(detail);
    }
    return res.json() as Promise<DocumentExtractResponse>;
  },

  analyzeRequirement: (projectId: string, requirement: string) =>
    request<AnalyzeResponse>(`/api/projects/${projectId}/analyze`, {
      method: "POST",
      body: JSON.stringify({ requirement }),
    }),

  updateTicket: (
    ticketId: string,
    body: { status?: string; priority?: string },
  ) =>
    request<Ticket>(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  listGitBranches: (projectId: string) =>
    request<GitBranchesResponse>(`/api/projects/${projectId}/git/branches`),

  syncGit: (projectId: string, branch?: string) =>
    request<GitSyncResponse>(`/api/projects/${projectId}/git/sync`, {
      method: "POST",
      body: JSON.stringify(branch ? { branch } : {}),
    }),

  checkDrift: (projectId: string) =>
    request<DriftCheckResponse>(`/api/projects/${projectId}/drift/check`, {
      method: "POST",
    }),

  resolveDrift: (alertId: string) =>
    request<DriftAlert>(`/api/drift/${alertId}/resolve`, { method: "POST" }),

  getCommandCenter: (projectId: string) =>
    request<CommandCenterResponse>(`/api/projects/${projectId}/command-center`),

  runMagic: (projectId: string, opts?: { sprint_count?: number; capacity_per_sprint?: number }) =>
    request<MagicRunResponse>(`/api/projects/${projectId}/ai/magic`, {
      method: "POST",
      body: JSON.stringify(opts ?? {}),
    }),

  generateStandup: (projectId: string) =>
    request<StandupDigestResult>(`/api/projects/${projectId}/ai/standup`, { method: "POST" }),

  generateSprintPlan: (projectId: string, opts?: { sprint_count?: number; capacity_per_sprint?: number }) =>
    request<SprintPlanResult>(`/api/projects/${projectId}/ai/sprint-plan`, {
      method: "POST",
      body: JSON.stringify(opts ?? {}),
    }),

  generateReadiness: (projectId: string) =>
    request<ReleaseReadinessResult>(`/api/projects/${projectId}/ai/readiness`, { method: "POST" }),

  detectScopeCreep: (projectId: string) =>
    request<ScopeCreepResult>(`/api/projects/${projectId}/ai/scope-creep`, { method: "POST" }),

  linkCommits: (projectId: string) =>
    request<CommitLinkResult>(`/api/projects/${projectId}/ai/link-commits`, { method: "POST" }),

  askProject: (projectId: string, question: string) =>
    request<ProjectChatResult>(`/api/projects/${projectId}/ai/chat`, {
      method: "POST",
      body: JSON.stringify({ question }),
    }),

  getJiraStatus: (projectId: string) =>
    request<JiraStatusResponse>(`/api/projects/${projectId}/jira/status`),

  configureJira: (
    projectId: string,
    body: { jira_site_url?: string | null; jira_project_key?: string | null },
  ) =>
    request<ProjectSummary>(`/api/projects/${projectId}/jira/config`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  pushToJira: (projectId: string) =>
    request<JiraPushResponse>(`/api/projects/${projectId}/jira/push`, {
      method: "POST",
    }),

  syncFromJira: (projectId: string) =>
    request<JiraSyncResponse>(`/api/projects/${projectId}/jira/sync`, {
      method: "POST",
    }),

  importFromJira: (projectId: string, enrich = true) =>
    request<JiraImportResponse>(`/api/projects/${projectId}/jira/import`, {
      method: "POST",
      body: JSON.stringify({ enrich }),
    }),

  nudgeJiraTicket: (
    ticketId: string,
    body: {
      message?: string;
      recipient_email?: string;
      recipient_account_id?: string;
    },
  ) =>
    request<JiraNudgeResponse>(`/api/tickets/${ticketId}/jira/nudge`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  applyCommitLinks: (projectId: string) =>
    request<ApplyCommitLinksResponse>(
      `/api/projects/${projectId}/ai/apply-commit-links`,
      { method: "POST" },
    ),
};
