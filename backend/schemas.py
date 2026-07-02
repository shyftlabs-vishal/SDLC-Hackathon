"""Pydantic schemas for SDLC Conductor API and agent structured outputs."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class TicketType(str, Enum):
    FEATURE = "feature"
    BUG = "bug"
    TASK = "task"
    SPIKE = "spike"
    CHORE = "chore"


class TicketPriority(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TicketStatus(str, Enum):
    BACKLOG = "backlog"
    IN_PROGRESS = "in_progress"
    IN_REVIEW = "in_review"
    DONE = "done"
    BLOCKED = "blocked"


class DriftSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


# --- Agent structured outputs ---


class GeneratedTicket(BaseModel):
    title: str = Field(description="Concise ticket title")
    description: str = Field(description="Detailed implementation description")
    ticket_type: TicketType = Field(description="Ticket category")
    priority: TicketPriority = Field(description="Relative priority")
    acceptance_criteria: list[str] = Field(
        default_factory=list,
        description="Testable acceptance criteria",
    )
    estimated_points: int | None = Field(
        default=None,
        description="Story points estimate (1-13)",
    )
    dependencies: list[str] = Field(
        default_factory=list,
        description="Titles of tickets this depends on",
    )


class GeneratedSpec(BaseModel):
    title: str = Field(description="Feature or initiative title")
    overview: str = Field(description="High-level summary of what will be built")
    goals: list[str] = Field(default_factory=list, description="Business and user goals")
    non_goals: list[str] = Field(
        default_factory=list,
        description="Explicitly out of scope items",
    )
    acceptance_criteria: list[str] = Field(
        default_factory=list,
        description="Overall acceptance criteria for the initiative",
    )
    technical_approach: str = Field(
        description="Recommended architecture and implementation approach",
    )
    constraints: list[str] = Field(
        default_factory=list,
        description="Technical, timeline, or compliance constraints",
    )
    risks: list[str] = Field(default_factory=list, description="Identified risks")
    open_questions: list[str] = Field(
        default_factory=list,
        description="Questions that need stakeholder answers",
    )


class RequirementAnalysisResult(BaseModel):
    spec: GeneratedSpec
    tickets: list[GeneratedTicket] = Field(
        min_length=1,
        description="Actionable work items derived from the requirement",
    )
    summary: str = Field(description="Brief executive summary of the plan")


class DriftFinding(BaseModel):
    severity: DriftSeverity
    title: str = Field(description="Short drift alert title")
    description: str = Field(description="What diverged from the agreed spec")
    spec_reference: str = Field(description="Which spec or ticket requirement is affected")
    code_evidence: str = Field(
        description="Evidence from git activity or code changes",
    )
    recommendation: str = Field(description="Suggested remediation action")
    affected_tickets: list[str] = Field(
        default_factory=list,
        description="Related ticket titles",
    )


class DriftAnalysisResult(BaseModel):
    alignment_score: int = Field(
        ge=0,
        le=100,
        description="0-100 score of how well code matches agreed spec",
    )
    summary: str = Field(description="Overall drift assessment narrative")
    findings: list[DriftFinding] = Field(default_factory=list)
    covered_requirements: list[str] = Field(
        default_factory=list,
        description="Spec items that appear implemented",
    )
    missing_requirements: list[str] = Field(
        default_factory=list,
        description="Spec items not yet reflected in code",
    )


# --- AI ceremony agent outputs ---


class StandupBlocker(BaseModel):
    title: str
    description: str
    ticket_title: str | None = None
    severity: str = Field(description="critical, high, medium, or low")


class StandupDigestResult(BaseModel):
    headline: str
    summary: str
    wins: list[str] = Field(default_factory=list)
    blockers: list[StandupBlocker] = Field(default_factory=list)
    today_suggestions: list[str] = Field(default_factory=list)
    per_person_updates: list[str] = Field(default_factory=list)
    standup_script: str = Field(description="Ready-to-read standup script for the scrum master")
    slack_message: str = Field(description="Formatted message for Slack/Teams")


class SprintPlanItem(BaseModel):
    name: str
    goal: str
    ticket_titles: list[str]
    total_points: int
    rationale: str


class SprintPlanResult(BaseModel):
    summary: str
    sprints: list[SprintPlanItem] = Field(min_length=1)
    warnings: list[str] = Field(default_factory=list)
    recommended_capacity_per_sprint: int = 21


class ReadinessCheckItem(BaseModel):
    label: str
    status: Literal["pass", "warn", "fail"]
    detail: str


class ReleaseReadinessResult(BaseModel):
    readiness_score: int = Field(ge=0, le=100)
    verdict: Literal["ship", "caution", "not_ready"]
    summary: str
    checklist: list[ReadinessCheckItem] = Field(default_factory=list)
    blockers: list[str] = Field(default_factory=list)
    stakeholder_message: str


class ScopeCreepItem(BaseModel):
    severity: DriftSeverity
    title: str
    description: str
    evidence: str
    recommendation: str


class ScopeCreepResult(BaseModel):
    creep_score: int = Field(ge=0, le=100, description="Higher = more scope creep detected")
    summary: str
    items: list[ScopeCreepItem] = Field(default_factory=list)


class CommitTicketLink(BaseModel):
    ticket_title: str
    commit_shas: list[str]
    confidence: float = Field(ge=0, le=1)
    evidence: str
    suggested_status: TicketStatus | None = None


class CommitLinkResult(BaseModel):
    links: list[CommitTicketLink] = Field(default_factory=list)
    unlinked_commits: list[str] = Field(default_factory=list)
    summary: str


class ProjectChatResult(BaseModel):
    answer: str
    cited_tickets: list[str] = Field(default_factory=list)
    cited_commits: list[str] = Field(default_factory=list)
    suggested_actions: list[str] = Field(default_factory=list)


class TicketEnrichmentItem(BaseModel):
    ticket_title: str
    acceptance_criteria: list[str] = Field(default_factory=list)
    estimated_points: int | None = Field(default=None, ge=1, le=13)
    priority: TicketPriority | None = None
    ticket_type: TicketType | None = None


class TicketEnrichmentResult(BaseModel):
    enrichments: list[TicketEnrichmentItem] = Field(default_factory=list)
    summary: str = ""


class ApplyCommitLinksResponse(BaseModel):
    applied: int
    skipped: int
    details: list[str] = Field(default_factory=list)
    tickets: list[TicketResponse] = Field(default_factory=list)


class ProjectChatRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)


class SprintPlanRequest(BaseModel):
    sprint_count: int = Field(default=2, ge=1, le=6)
    capacity_per_sprint: int = Field(default=21, ge=1, le=100)


class CommitLinkResponse(BaseModel):
    links: list[CommitTicketLink]
    unlinked_commits: list[str]
    summary: str


class AIInsightResponse(BaseModel):
    insight_type: str
    payload: dict
    created_at: datetime


class CommandCenterResponse(BaseModel):
    project_id: str
    readiness: ReleaseReadinessResult | None = None
    standup: StandupDigestResult | None = None
    sprint_plan: SprintPlanResult | None = None
    scope_creep: ScopeCreepResult | None = None
    commit_links: CommitLinkResult | None = None
    latest_insights: list[AIInsightResponse] = Field(default_factory=list)


class MagicRunResponse(BaseModel):
    standup: StandupDigestResult
    sprint_plan: SprintPlanResult
    readiness: ReleaseReadinessResult
    scope_creep: ScopeCreepResult
    commit_links: CommitLinkResult




# --- API models ---


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    requirement: str = Field(default="", max_length=50000)
    repo_url: str | None = Field(default=None, max_length=500)
    repo_branch: str = Field(default="main", max_length=100)
    local_repo_path: str | None = Field(default=None, max_length=500)
    jira_site_url: str | None = Field(default=None, max_length=500)
    jira_project_key: str | None = Field(default=None, max_length=50)


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    repo_url: str | None = None
    repo_branch: str | None = None
    local_repo_path: str | None = None
    jira_site_url: str | None = None
    jira_project_key: str | None = None


class RequirementInput(BaseModel):
    requirement: str = Field(min_length=10, max_length=50000)


class DocumentExtractResponse(BaseModel):
    text: str
    filename: str
    char_count: int
    truncated: bool = False


class TicketUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    status: TicketStatus | None = None
    priority: TicketPriority | None = None
    assignee: str | None = None
    jira_assignee_account_id: str | None = None


class SpecResponse(BaseModel):
    id: str
    project_id: str
    title: str
    overview: str
    goals: list[str]
    non_goals: list[str]
    acceptance_criteria: list[str]
    technical_approach: str
    constraints: list[str]
    risks: list[str]
    open_questions: list[str]
    created_at: datetime
    version: int


class TicketResponse(BaseModel):
    id: str
    project_id: str
    title: str
    description: str
    ticket_type: TicketType
    priority: TicketPriority
    status: TicketStatus
    acceptance_criteria: list[str]
    estimated_points: int | None
    dependencies: list[str]
    jira_issue_key: str | None = None
    jira_issue_id: str | None = None
    jira_url: str | None = None
    jira_synced_at: datetime | None = None
    assignee: str | None = None
    jira_assignee_account_id: str | None = None
    created_at: datetime
    updated_at: datetime


class GitCommitResponse(BaseModel):
    id: str
    project_id: str
    sha: str
    message: str
    author: str
    author_email: str
    committed_at: datetime
    files_changed: list[str]
    additions: int
    deletions: int
    url: str | None


class DriftAlertResponse(BaseModel):
    id: str
    project_id: str
    severity: DriftSeverity
    title: str
    description: str
    spec_reference: str
    code_evidence: str
    recommendation: str
    affected_tickets: list[str]
    alignment_score: int | None
    resolved: bool
    created_at: datetime


class ProjectSummary(BaseModel):
    id: str
    name: str
    description: str
    repo_url: str | None
    repo_branch: str
    local_repo_path: str | None
    jira_site_url: str | None = None
    jira_project_key: str | None = None
    alignment_score: int | None
    ticket_count: int
    open_drift_count: int
    created_at: datetime
    updated_at: datetime


class ProjectDetail(ProjectSummary):
    requirement: str
    spec: SpecResponse | None
    tickets: list[TicketResponse]
    recent_commits: list[GitCommitResponse]
    drift_alerts: list[DriftAlertResponse]


class AnalyzeResponse(BaseModel):
    spec: SpecResponse
    tickets: list[TicketResponse]
    summary: str


class DriftCheckResponse(BaseModel):
    alignment_score: int
    summary: str
    findings: list[DriftAlertResponse]
    covered_requirements: list[str]
    missing_requirements: list[str]


class GitSyncRequest(BaseModel):
    branch: str | None = Field(default=None, max_length=100)


class GitBranchesResponse(BaseModel):
    branches: list[str]
    current_branch: str
    default_branch: str | None = None


class GitSyncResponse(BaseModel):
    synced_commits: int
    total_commits: int
    latest_sha: str | None
    branch: str


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    llm_provider: Literal["OPENAI", "GEMINI", "AURA"]
    llm_configured: bool
    default_model: str
    openai_configured: bool
    gemini_configured: bool
    aura_configured: bool
    github_configured: bool
    jira_configured: bool


class ActivityEvent(BaseModel):
    id: str
    event_type: str
    message: str
    created_at: datetime


class ProjectActivityResponse(BaseModel):
    events: list[ActivityEvent] = Field(default_factory=list)


class JiraConfigRequest(BaseModel):
    jira_site_url: str | None = Field(default=None, max_length=500)
    jira_project_key: str | None = Field(default=None, max_length=50)


class JiraStatusResponse(BaseModel):
    configured: bool
    site_url: str | None
    project_key: str | None
    linked_tickets: int
    total_tickets: int
    user_display_name: str | None = None


class JiraPushResponse(BaseModel):
    created: int
    skipped: int
    errors: list[str]
    tickets: list[TicketResponse]


class JiraSyncResponse(BaseModel):
    updated: int
    errors: list[str]
    tickets: list[TicketResponse]


class JiraImportRequest(BaseModel):
    enrich: bool = Field(default=True, description="Use AI to add acceptance criteria and story points")


class JiraImportResponse(BaseModel):
    imported: int
    skipped: int
    enriched: int = 0
    errors: list[str]
    tickets: list[TicketResponse]


class JiraNudgeRequest(BaseModel):
    message: str = Field(default="", max_length=2000)
    recipient_email: str | None = Field(default=None, max_length=320)
    recipient_account_id: str | None = Field(default=None, max_length=128)


class JiraNudgeResponse(BaseModel):
    issue_key: str
    recipient_name: str
    recipient_email: str | None = None
    comment_id: str
    comment_url: str
