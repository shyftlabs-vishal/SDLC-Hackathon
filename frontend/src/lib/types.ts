export type TicketType = "feature" | "bug" | "task" | "spike" | "chore";
export type TicketPriority = "critical" | "high" | "medium" | "low";
export type TicketStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "blocked"
  | "archived";
export type DriftSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface Spec {
  id: string;
  project_id: string;
  title: string;
  overview: string;
  goals: string[];
  non_goals: string[];
  acceptance_criteria: string[];
  technical_approach: string;
  constraints: string[];
  risks: string[];
  open_questions: string[];
  created_at: string;
  version: number;
}

export interface Ticket {
  id: string;
  project_id: string;
  title: string;
  description: string;
  ticket_type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  acceptance_criteria: string[];
  estimated_points: number | null;
  dependencies: string[];
  jira_issue_key: string | null;
  jira_issue_id: string | null;
  jira_url: string | null;
  jira_synced_at: string | null;
  assignee: string | null;
  jira_assignee_account_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface GitCommit {
  id: string;
  project_id: string;
  sha: string;
  message: string;
  author: string;
  author_email: string;
  committed_at: string;
  files_changed: string[];
  additions: number;
  deletions: number;
  url: string | null;
}

export interface DriftAlert {
  id: string;
  project_id: string;
  severity: DriftSeverity;
  title: string;
  description: string;
  spec_reference: string;
  code_evidence: string;
  recommendation: string;
  affected_tickets: string[];
  alignment_score: number | null;
  resolved: boolean;
  created_at: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  repo_url: string | null;
  repo_branch: string;
  local_repo_path: string | null;
  jira_site_url: string | null;
  jira_project_key: string | null;
  alignment_score: number | null;
  ticket_count: number;
  open_drift_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail extends ProjectSummary {
  requirement: string;
  spec: Spec | null;
  tickets: Ticket[];
  recent_commits: GitCommit[];
  drift_alerts: DriftAlert[];
}

export interface HealthResponse {
  status: "ok";
  service: string;
  llm_provider: "OPENAI" | "GEMINI" | "AURA";
  llm_configured: boolean;
  default_model: string;
  openai_configured: boolean;
  gemini_configured: boolean;
  aura_configured: boolean;
  github_configured: boolean;
  gitlab_configured?: boolean;
  azure_devops_configured?: boolean;
  jira_configured: boolean;
}

export interface ActivityEvent {
  id: string;
  event_type: string;
  message: string;
  created_at: string;
}

export interface ProjectActivityResponse {
  events: ActivityEvent[];
}

export interface JiraStatusResponse {
  configured: boolean;
  site_url: string | null;
  project_key: string | null;
  linked_tickets: number;
  total_tickets: number;
  user_display_name: string | null;
}

export interface JiraPushResponse {
  created: number;
  skipped: number;
  errors: string[];
  tickets: Ticket[];
}

export interface JiraSyncResponse {
  updated: number;
  archived: number;
  errors: string[];
  tickets: Ticket[];
}

export interface JiraImportResponse {
  imported: number;
  skipped: number;
  enriched: number;
  errors: string[];
  tickets: Ticket[];
}

export interface JiraNudgeResponse {
  issue_key: string;
  recipient_name: string;
  recipient_email: string | null;
  comment_id: string;
  comment_url: string;
}

export interface ApplyCommitLinksResponse {
  applied: number;
  skipped: number;
  details: string[];
  tickets: Ticket[];
}

export interface StandupBlocker {
  title: string;
  description: string;
  ticket_title: string | null;
  severity: string;
}

export interface StandupDigestResult {
  headline: string;
  summary: string;
  wins: string[];
  blockers: StandupBlocker[];
  today_suggestions: string[];
  per_person_updates: string[];
  standup_script: string;
  slack_message: string;
}

export interface SprintPlanItem {
  name: string;
  goal: string;
  ticket_titles: string[];
  total_points: number;
  rationale: string;
}

export interface SprintPlanResult {
  summary: string;
  sprints: SprintPlanItem[];
  warnings: string[];
  recommended_capacity_per_sprint: number;
}

export interface ReadinessCheckItem {
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface ReleaseReadinessResult {
  readiness_score: number;
  verdict: "ship" | "caution" | "not_ready";
  summary: string;
  checklist: ReadinessCheckItem[];
  blockers: string[];
  stakeholder_message: string;
}

export interface ScopeCreepItem {
  severity: DriftSeverity;
  title: string;
  description: string;
  evidence: string;
  recommendation: string;
}

export interface ScopeCreepResult {
  creep_score: number;
  summary: string;
  items: ScopeCreepItem[];
}

export interface CommitTicketLink {
  ticket_title: string;
  commit_shas: string[];
  confidence: number;
  evidence: string;
  suggested_status: TicketStatus | null;
}

export interface CommitLinkResult {
  links: CommitTicketLink[];
  unlinked_commits: string[];
  summary: string;
}

export interface ProjectChatResult {
  answer: string;
  cited_tickets: string[];
  cited_commits: string[];
  suggested_actions: string[];
}

export interface CommandCenterResponse {
  project_id: string;
  readiness: ReleaseReadinessResult | null;
  standup: StandupDigestResult | null;
  sprint_plan: SprintPlanResult | null;
  scope_creep: ScopeCreepResult | null;
  commit_links: CommitLinkResult | null;
  latest_insights: unknown[];
}

export interface MagicRunResponse {
  standup: StandupDigestResult;
  sprint_plan: SprintPlanResult;
  readiness: ReleaseReadinessResult;
  scope_creep: ScopeCreepResult;
  commit_links: CommitLinkResult;
}

export interface AnalyzeResponse {
  spec: Spec;
  tickets: Ticket[];
  summary: string;
}

export interface DriftCheckResponse {
  alignment_score: number;
  summary: string;
  findings: DriftAlert[];
  covered_requirements: string[];
  missing_requirements: string[];
}

export interface GitSyncResponse {
  synced_commits: number;
  total_commits: number;
  latest_sha: string | null;
  branch: string;
}

export interface GitBranchesResponse {
  branches: string[];
  current_branch: string;
  default_branch: string | null;
}

export interface PullRequestSummary {
  number: number;
  title: string;
  state: string;
  author: string;
  head_branch: string;
  base_branch: string;
  url: string;
  created_at: string;
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface PullRequestListResponse {
  pull_requests: PullRequestSummary[];
}

export interface PRReviewFinding {
  severity: DriftSeverity;
  category:
    | "spec_alignment"
    | "ticket_coverage"
    | "scope_creep"
    | "quality"
    | "testing"
    | "other";
  title: string;
  description: string;
  file: string | null;
  recommendation: string;
}

export interface PRReviewResult {
  verdict: "approve" | "request_changes" | "needs_discussion";
  alignment_score: number;
  summary: string;
  linked_tickets: string[];
  findings: PRReviewFinding[];
  acceptance_criteria_gaps: string[];
  strengths: string[];
}

export interface PerformanceDeliveryMetrics {
  total_tickets: number;
  done: number;
  in_progress: number;
  in_review: number;
  backlog: number;
  blocked: number;
  completion_rate: number;
  points_total: number;
  points_done: number;
  points_completion_rate: number;
}

export interface PerformanceDriftMetrics {
  alignment_score: number | null;
  open_alerts: number;
  resolved_alerts: number;
  critical_open: number;
  high_open: number;
  drift_penalty: number;
  health_score: number;
}

export interface PerformanceVelocityMetrics {
  commits_last_7d: number;
  commits_last_14d: number;
  commits_tracked: number;
  activity_score: number;
  has_repo: boolean;
}

export interface PerformanceBreakdownItem {
  name: string;
  score: number;
  weight_percent: number;
  status: "strong" | "moderate" | "weak";
  detail: string;
}

export interface PerformanceRecommendation {
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
}

export interface PerformanceAnalyticsResponse {
  overall_score: number;
  grade: "excellent" | "good" | "fair" | "at_risk" | "critical";
  summary: string;
  delivery: PerformanceDeliveryMetrics;
  drift: PerformanceDriftMetrics;
  velocity: PerformanceVelocityMetrics;
  breakdown: PerformanceBreakdownItem[];
  recommendations: PerformanceRecommendation[];
}

export interface DocumentExtractResponse {
  text: string;
  filename: string;
  char_count: number;
  truncated: boolean;
}

export interface OutdatedTicketItem {
  ticket_title: string;
  reason: string;
  severity: "critical" | "high" | "medium" | "low";
  suggested_action: string;
}

export interface StaleCriteriaItem {
  ticket_title: string | null;
  criteria: string;
  reason: string;
}

export interface RequirementImpactResult {
  summary: string;
  outdated_tickets: OutdatedTicketItem[];
  stale_acceptance_criteria: StaleCriteriaItem[];
  spec_sections_affected: string[];
  recommended_actions: string[];
}

export interface PerformanceHistoryEntry {
  id: string;
  overall_score: number;
  alignment_score: number | null;
  delivery_score: number;
  drift_health_score: number;
  activity_score: number;
  trigger: string;
  created_at: string;
}

export interface PerformanceHistoryResponse {
  entries: PerformanceHistoryEntry[];
  trend_summary: string | null;
}

export interface ProjectReportResponse {
  markdown: string;
  filename: string;
}
