"""Git activity ingestion from local repos, GitHub, GitLab, and Azure DevOps."""

from __future__ import annotations

import base64
import os
import re
import subprocess
from datetime import UTC, datetime
from typing import Any, Literal
from urllib.parse import quote, urlparse

import httpx

GITHUB_API = "https://api.github.com"
GitProvider = Literal["github", "gitlab", "azure", "local"]


def detect_git_provider(repo_url: str | None) -> GitProvider | None:
    if not repo_url:
        return None
    url = repo_url.strip().lower()
    if "dev.azure.com" in url or "visualstudio.com" in url:
        return "azure"
    if "gitlab" in url:
        return "gitlab"
    if "github.com" in url or re.match(r"^[\w.-]+/[\w.-]+$", repo_url.strip()):
        return "github"
    return "github"


def _parse_gitlab_repo(repo_url: str) -> tuple[str, str] | None:
    """Return (api_base, project_path) e.g. ('https://gitlab.com/api/v4', 'group/project')."""
    repo_url = repo_url.strip().rstrip("/")
    if repo_url.endswith(".git"):
        repo_url = repo_url[:-4]

    if "gitlab" not in repo_url.lower() and not repo_url.startswith("git@"):
        return None

    if repo_url.startswith("git@"):
        match = re.match(r"git@[^:]+:(.+)$", repo_url)
        if match:
            return "https://gitlab.com/api/v4", match.group(1)
        return None

    parsed = urlparse(repo_url)
    host = parsed.netloc
    path = parsed.path.strip("/")
    if not path:
        return None
    api_base = f"{parsed.scheme}://{host}/api/v4"
    return api_base, path


def _parse_azure_repo(repo_url: str) -> tuple[str, str, str] | None:
    """Return (organization, project, repository) from Azure DevOps URL."""
    repo_url = repo_url.strip().rstrip("/")
    if repo_url.endswith(".git"):
        repo_url = repo_url[:-4]

    parsed = urlparse(repo_url)
    host = parsed.netloc.lower()
    if "dev.azure.com" not in host and "visualstudio.com" not in host:
        return None

    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) >= 4 and parts[2] == "_git":
        return parts[0], parts[1], parts[3]
    if len(parts) >= 3 and parts[1] == "_git":
        org = host.split(".")[0]
        return org, parts[0], parts[2]
    return None


def _gitlab_headers(token: str | None) -> dict[str, str]:
    headers = {"Accept": "application/json"}
    if token:
        headers["PRIVATE-TOKEN"] = token
    return headers


def _azure_headers(token: str | None) -> dict[str, str]:
    headers = {"Accept": "application/json"}
    if token:
        basic = base64.b64encode(f":{token}".encode()).decode()
        headers["Authorization"] = f"Basic {basic}"
    return headers


def _gitlab_project_id(api_base: str, project_path: str) -> str:
    return quote(project_path, safe="")


def _azure_base(org: str, project: str) -> str:
    return f"https://dev.azure.com/{org}/{project}/_apis"


def _parse_github_repo(repo_url: str) -> tuple[str, str] | None:
    """Return (owner, repo) from a GitHub URL or owner/repo string."""
    repo_url = repo_url.strip().rstrip("/")
    if repo_url.endswith(".git"):
        repo_url = repo_url[:-4]

    if "github.com" in repo_url:
        path = urlparse(repo_url).path.strip("/")
        parts = path.split("/")
        if len(parts) >= 2:
            return parts[0], parts[1]

    if re.match(r"^[\w.-]+/[\w.-]+$", repo_url):
        owner, repo = repo_url.split("/", 1)
        return owner, repo
    return None


def _run_git(args: list[str], cwd: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "git command failed")
    return result.stdout


def fetch_local_branches(repo_path: str) -> tuple[list[str], str | None]:
    path = os.path.expanduser(repo_path)
    if not os.path.isdir(path):
        raise ValueError(f"Local repo path does not exist: {path}")
    if not os.path.isdir(os.path.join(path, ".git")):
        raise ValueError(f"Not a git repository: {path}")

    branches: set[str] = set()
    local = _run_git(["branch", "--format=%(refname:short)"], cwd=path)
    for name in local.splitlines():
        if name.strip():
            branches.add(name.strip())

    try:
        remote = _run_git(["branch", "-r", "--format=%(refname:short)"], cwd=path)
        for name in remote.splitlines():
            name = name.strip()
            if not name or name.endswith("/HEAD"):
                continue
            short = name.split("/", 1)[1] if "/" in name else name
            branches.add(short)
    except RuntimeError:
        pass

    default: str | None = None
    try:
        default = _run_git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], cwd=path)
        default = default.strip().removeprefix("origin/")
    except RuntimeError:
        try:
            default = _run_git(["branch", "--show-current"], cwd=path).strip() or None
        except RuntimeError:
            default = None

    return sorted(branches, key=str.lower), default


async def fetch_github_branches(
    repo_url: str,
    token: str | None = None,
) -> tuple[list[str], str | None]:
    parsed = _parse_github_repo(repo_url)
    if not parsed:
        raise ValueError(f"Could not parse GitHub repository from: {repo_url}")

    owner, repo = parsed
    headers: dict[str, str] = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        repo_resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}",
            headers=headers,
        )
        if repo_resp.status_code == 401:
            raise RuntimeError("GitHub authentication failed. Check GITHUB_TOKEN.")
        if repo_resp.status_code == 404:
            raise RuntimeError(f"GitHub repository not found: {owner}/{repo}")
        repo_resp.raise_for_status()
        default_branch = repo_resp.json().get("default_branch")

        branches: list[str] = []
        page = 1
        while page <= 10:
            response = await client.get(
                f"{GITHUB_API}/repos/{owner}/{repo}/branches",
                params={"per_page": 100, "page": page},
                headers=headers,
            )
            response.raise_for_status()
            payload = response.json()
            if not payload:
                break
            branches.extend(item["name"] for item in payload if item.get("name"))
            if len(payload) < 100:
                break
            page += 1

        return sorted(set(branches), key=str.lower), default_branch


async def list_project_branches(
    repo_url: str | None,
    local_repo_path: str | None,
) -> tuple[list[str], str | None]:
    if local_repo_path:
        return fetch_local_branches(local_repo_path)
    if not repo_url:
        raise ValueError("Configure repo_url or local_repo_path to list branches.")

    provider = detect_git_provider(repo_url)
    if provider == "gitlab":
        return await fetch_gitlab_branches(repo_url, token=os.getenv("GITLAB_TOKEN"))
    if provider == "azure":
        return await fetch_azure_branches(repo_url, token=os.getenv("AZURE_DEVOPS_TOKEN"))
    return await fetch_github_branches(repo_url, token=os.getenv("GITHUB_TOKEN"))


def fetch_local_commits(repo_path: str, branch: str = "main", limit: int = 30) -> list[dict[str, Any]]:
    path = os.path.expanduser(repo_path)
    if not os.path.isdir(path):
        raise ValueError(f"Local repo path does not exist: {path}")
    if not os.path.isdir(os.path.join(path, ".git")):
        raise ValueError(f"Not a git repository: {path}")

    log_format = "%H%x1f%an%x1f%ae%x1f%aI%x1f%s"
    try:
        raw = _run_git(
            ["log", f"-n{limit}", branch, f"--pretty=format:{log_format}", "--numstat"],
            cwd=path,
        )
    except RuntimeError as exc:
        raise RuntimeError(f"Branch '{branch}' not found or has no commits.") from exc

    commits: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for line in raw.splitlines():
        if "\x1f" in line:
            if current:
                commits.append(current)
            sha, author, email, committed_at, message = line.split("\x1f", 4)
            current = {
                "sha": sha[:12],
                "full_sha": sha,
                "message": message.strip(),
                "author": author.strip(),
                "author_email": email.strip(),
                "committed_at": committed_at.strip(),
                "files_changed": [],
                "additions": 0,
                "deletions": 0,
                "url": None,
            }
        elif current and line.strip() and "\t" in line:
            parts = line.split("\t")
            if len(parts) >= 3 and parts[0] != "-":
                current["files_changed"].append(parts[2])
                try:
                    current["additions"] += int(parts[0])
                    current["deletions"] += int(parts[1])
                except ValueError:
                    pass

    if current:
        commits.append(current)

    return commits


async def fetch_github_commits(
    repo_url: str,
    branch: str = "main",
    limit: int = 30,
    token: str | None = None,
) -> list[dict[str, Any]]:
    parsed = _parse_github_repo(repo_url)
    if not parsed:
        raise ValueError(f"Could not parse GitHub repository from: {repo_url}")

    owner, repo = parsed
    headers: dict[str, str] = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/commits",
            params={"sha": branch, "per_page": min(limit, 100)},
            headers=headers,
        )
        if response.status_code == 401:
            raise RuntimeError("GitHub authentication failed. Check GITHUB_TOKEN.")
        if response.status_code == 404:
            raise RuntimeError(f"GitHub repository not found: {owner}/{repo}")
        response.raise_for_status()
        payload = response.json()

        commits: list[dict[str, Any]] = []
        for item in payload:
            sha = item["sha"]
            commit = item["commit"]
            committed_at = commit["author"]["date"]
            if committed_at.endswith("Z"):
                committed_at = committed_at.replace("Z", "+00:00")

            files_changed: list[str] = []
            additions = 0
            deletions = 0

            detail = await client.get(
                f"{GITHUB_API}/repos/{owner}/{repo}/commits/{sha}",
                headers=headers,
            )
            if detail.status_code == 200:
                detail_data = detail.json()
                for file in detail_data.get("files", []):
                    files_changed.append(file.get("filename", ""))
                    additions += file.get("additions", 0)
                    deletions += file.get("deletions", 0)

            commits.append(
                {
                    "sha": sha[:12],
                    "full_sha": sha,
                    "message": commit["message"].split("\n")[0],
                    "author": (commit["author"] or {}).get("name") or "Unknown",
                    "author_email": (commit["author"] or {}).get("email") or "",
                    "committed_at": committed_at,
                    "files_changed": [f for f in files_changed if f],
                    "additions": additions,
                    "deletions": deletions,
                    "url": item.get("html_url"),
                }
            )
        return commits


async def sync_project_commits(
    repo_url: str | None,
    local_repo_path: str | None,
    branch: str = "main",
    limit: int = 30,
) -> list[dict[str, Any]]:
    if local_repo_path:
        return fetch_local_commits(local_repo_path, branch=branch, limit=limit)

    if not repo_url:
        raise ValueError("Configure repo_url or local_repo_path to sync git activity.")

    provider = detect_git_provider(repo_url)
    if provider == "gitlab":
        return await fetch_gitlab_commits(
            repo_url, branch=branch, limit=limit, token=os.getenv("GITLAB_TOKEN")
        )
    if provider == "azure":
        return await fetch_azure_commits(
            repo_url, branch=branch, limit=limit, token=os.getenv("AZURE_DEVOPS_TOKEN")
        )
    return await fetch_github_commits(
        repo_url, branch=branch, limit=limit, token=os.getenv("GITHUB_TOKEN")
    )


def build_activity_summary(commits: list[dict[str, Any]]) -> str:
    if not commits:
        return "No git commits synced yet."

    lines = [f"Recent git activity ({len(commits)} commits):"]
    for commit in commits[:20]:
        files = ", ".join(commit.get("files_changed", [])[:8])
        if len(commit.get("files_changed", [])) > 8:
            files += ", ..."
        lines.append(
            f"- [{commit['sha']}] {commit['message']} by {commit['author']} "
            f"(+{commit.get('additions', 0)}/-{commit.get('deletions', 0)})"
        )
        if files:
            lines.append(f"  Files: {files}")
    return "\n".join(lines)


def normalize_commit_timestamps(commits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for commit in commits:
        ts = commit["committed_at"]
        if isinstance(ts, str):
            if ts.endswith("Z"):
                ts = ts.replace("Z", "+00:00")
            dt = datetime.fromisoformat(ts)
        else:
            dt = ts
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        normalized.append({**commit, "committed_at": dt.isoformat()})
    return normalized


def _github_headers(token: str | None) -> dict[str, str]:
    headers: dict[str, str] = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


async def fetch_pull_requests(
    repo_url: str,
    state: str = "open",
    limit: int = 20,
) -> list[dict[str, Any]]:
    provider = detect_git_provider(repo_url)
    if provider == "gitlab":
        return await fetch_gitlab_merge_requests(
            repo_url, state=state, limit=limit, token=os.getenv("GITLAB_TOKEN")
        )
    if provider == "azure":
        return await fetch_azure_pull_requests(
            repo_url, state=state, limit=limit, token=os.getenv("AZURE_DEVOPS_TOKEN")
        )
    return await fetch_github_pull_requests(
        repo_url, state=state, limit=limit, token=os.getenv("GITHUB_TOKEN")
    )


async def fetch_github_pull_requests(
    repo_url: str,
    state: str = "open",
    limit: int = 20,
    token: str | None = None,
) -> list[dict[str, Any]]:
    parsed = _parse_github_repo(repo_url)
    if not parsed:
        raise ValueError(f"Could not parse GitHub repository from: {repo_url}")

    owner, repo = parsed
    headers = _github_headers(token)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/pulls",
            params={"state": state, "per_page": min(limit, 100), "sort": "updated", "direction": "desc"},
            headers=headers,
        )
        if response.status_code == 401:
            raise RuntimeError("GitHub authentication failed. Check GITHUB_TOKEN.")
        if response.status_code == 404:
            raise RuntimeError(f"GitHub repository not found: {owner}/{repo}")
        response.raise_for_status()

        pulls: list[dict[str, Any]] = []
        for item in response.json():
            pulls.append(
                {
                    "number": item["number"],
                    "title": item.get("title") or f"PR #{item['number']}",
                    "state": item.get("state") or "open",
                    "author": (item.get("user") or {}).get("login") or "unknown",
                    "head_branch": (item.get("head") or {}).get("ref") or "",
                    "base_branch": (item.get("base") or {}).get("ref") or "",
                    "url": item.get("html_url") or "",
                    "created_at": item.get("created_at") or "",
                    "body": item.get("body") or "",
                    "additions": 0,
                    "deletions": 0,
                    "changed_files": 0,
                }
            )
        return pulls


async def fetch_github_pull_request_detail(
    repo_url: str,
    pr_number: int,
    token: str | None = None,
    *,
    max_files: int = 30,
    max_patch_chars: int = 2500,
) -> dict[str, Any]:
    parsed = _parse_github_repo(repo_url)
    if not parsed:
        raise ValueError(f"Could not parse GitHub repository from: {repo_url}")

    owner, repo = parsed
    headers = _github_headers(token)

    async with httpx.AsyncClient(timeout=45.0) as client:
        pr_resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/pulls/{pr_number}",
            headers=headers,
        )
        if pr_resp.status_code == 401:
            raise RuntimeError("GitHub authentication failed. Check GITHUB_TOKEN.")
        if pr_resp.status_code == 404:
            raise RuntimeError(f"Pull request #{pr_number} not found.")
        pr_resp.raise_for_status()
        item = pr_resp.json()

        files_resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/pulls/{pr_number}/files",
            params={"per_page": 100},
            headers=headers,
        )
        files_resp.raise_for_status()
        raw_files = files_resp.json()

        files: list[dict[str, Any]] = []
        total_additions = 0
        total_deletions = 0
        for f in raw_files[:max_files]:
            patch = f.get("patch") or ""
            if len(patch) > max_patch_chars:
                patch = patch[:max_patch_chars] + "\n... [patch truncated]"
            additions = f.get("additions", 0)
            deletions = f.get("deletions", 0)
            total_additions += additions
            total_deletions += deletions
            files.append(
                {
                    "filename": f.get("filename") or "",
                    "status": f.get("status") or "modified",
                    "additions": additions,
                    "deletions": deletions,
                    "patch": patch,
                }
            )

        return {
            "number": item["number"],
            "title": item.get("title") or f"PR #{pr_number}",
            "state": item.get("state") or "open",
            "author": (item.get("user") or {}).get("login") or "unknown",
            "head_branch": (item.get("head") or {}).get("ref") or "",
            "base_branch": (item.get("base") or {}).get("ref") or "",
            "url": item.get("html_url") or "",
            "created_at": item.get("created_at") or "",
            "body": item.get("body") or "",
            "additions": total_additions,
            "deletions": total_deletions,
            "changed_files": len(raw_files),
            "files": files,
            "files_truncated": len(raw_files) > max_files,
        }


async def fetch_pull_request_for_review(
    repo_url: str | None,
    pr_number: int,
) -> dict[str, Any]:
    if not repo_url:
        raise ValueError("Pull request review requires a repository URL.")
    provider = detect_git_provider(repo_url)
    if provider == "gitlab":
        return await fetch_gitlab_merge_request_detail(
            repo_url, pr_number, token=os.getenv("GITLAB_TOKEN")
        )
    if provider == "azure":
        return await fetch_azure_pull_request_detail(
            repo_url, pr_number, token=os.getenv("AZURE_DEVOPS_TOKEN")
        )
    return await fetch_github_pull_request_detail(
        repo_url, pr_number, token=os.getenv("GITHUB_TOKEN")
    )


# --- GitLab ---


async def fetch_gitlab_branches(
    repo_url: str,
    token: str | None = None,
) -> tuple[list[str], str | None]:
    parsed = _parse_gitlab_repo(repo_url)
    if not parsed:
        raise ValueError(f"Could not parse GitLab repository from: {repo_url}")

    api_base, project_path = parsed
    project_id = _gitlab_project_id(api_base, project_path)
    headers = _gitlab_headers(token)

    async with httpx.AsyncClient(timeout=30.0) as client:
        proj_resp = await client.get(
            f"{api_base}/projects/{project_id}",
            headers=headers,
        )
        if proj_resp.status_code == 401:
            raise RuntimeError("GitLab authentication failed. Check GITLAB_TOKEN.")
        if proj_resp.status_code == 404:
            raise RuntimeError(f"GitLab project not found: {project_path}")
        proj_resp.raise_for_status()
        default_branch = proj_resp.json().get("default_branch")

        branches: list[str] = []
        page = 1
        while page <= 10:
            response = await client.get(
                f"{api_base}/projects/{project_id}/repository/branches",
                params={"per_page": 100, "page": page},
                headers=headers,
            )
            response.raise_for_status()
            payload = response.json()
            if not payload:
                break
            branches.extend(item["name"] for item in payload if item.get("name"))
            if len(payload) < 100:
                break
            page += 1

        return sorted(set(branches), key=str.lower), default_branch


async def fetch_gitlab_commits(
    repo_url: str,
    branch: str = "main",
    limit: int = 30,
    token: str | None = None,
) -> list[dict[str, Any]]:
    parsed = _parse_gitlab_repo(repo_url)
    if not parsed:
        raise ValueError(f"Could not parse GitLab repository from: {repo_url}")

    api_base, project_path = parsed
    project_id = _gitlab_project_id(api_base, project_path)
    headers = _gitlab_headers(token)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{api_base}/projects/{project_id}/repository/commits",
            params={"ref_name": branch, "per_page": min(limit, 100)},
            headers=headers,
        )
        if response.status_code == 401:
            raise RuntimeError("GitLab authentication failed. Check GITLAB_TOKEN.")
        if response.status_code == 404:
            raise RuntimeError(f"GitLab branch '{branch}' not found.")
        response.raise_for_status()

        commits: list[dict[str, Any]] = []
        for item in response.json():
            sha = item["id"]
            detail = await client.get(
                f"{api_base}/projects/{project_id}/repository/commits/{sha}",
                headers=headers,
            )
            files_changed: list[str] = []
            additions = 0
            deletions = 0
            if detail.status_code == 200:
                stats = detail.json().get("stats") or {}
                additions = stats.get("additions", 0)
                deletions = stats.get("deletions", 0)
                diff_resp = await client.get(
                    f"{api_base}/projects/{project_id}/repository/commits/{sha}/diff",
                    headers=headers,
                )
                if diff_resp.status_code == 200:
                    for diff in diff_resp.json()[:30]:
                        if diff.get("new_path"):
                            files_changed.append(diff["new_path"])

            committed_at = item.get("committed_date") or item.get("created_at") or ""
            commits.append(
                {
                    "sha": sha[:12],
                    "full_sha": sha,
                    "message": (item.get("title") or item.get("message") or "").split("\n")[0],
                    "author": (item.get("author_name") or "Unknown"),
                    "author_email": item.get("author_email") or "",
                    "committed_at": committed_at,
                    "files_changed": files_changed,
                    "additions": additions,
                    "deletions": deletions,
                    "url": item.get("web_url"),
                }
            )
        return commits


async def fetch_gitlab_merge_requests(
    repo_url: str,
    state: str = "open",
    limit: int = 20,
    token: str | None = None,
) -> list[dict[str, Any]]:
    parsed = _parse_gitlab_repo(repo_url)
    if not parsed:
        raise ValueError(f"Could not parse GitLab repository from: {repo_url}")

    api_base, project_path = parsed
    project_id = _gitlab_project_id(api_base, project_path)
    headers = _gitlab_headers(token)
    gl_state = "opened" if state == "open" else state

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{api_base}/projects/{project_id}/merge_requests",
            params={"state": gl_state, "per_page": min(limit, 100), "order_by": "updated_at"},
            headers=headers,
        )
        if response.status_code == 401:
            raise RuntimeError("GitLab authentication failed. Check GITLAB_TOKEN.")
        response.raise_for_status()

        pulls: list[dict[str, Any]] = []
        for item in response.json():
            pulls.append(
                {
                    "number": item["iid"],
                    "title": item.get("title") or f"MR !{item['iid']}",
                    "state": item.get("state") or "opened",
                    "author": (item.get("author") or {}).get("username") or "unknown",
                    "head_branch": item.get("source_branch") or "",
                    "base_branch": item.get("target_branch") or "",
                    "url": item.get("web_url") or "",
                    "created_at": item.get("created_at") or "",
                    "body": item.get("description") or "",
                    "additions": 0,
                    "deletions": 0,
                    "changed_files": 0,
                }
            )
        return pulls


async def fetch_gitlab_merge_request_detail(
    repo_url: str,
    mr_iid: int,
    token: str | None = None,
    *,
    max_files: int = 30,
    max_patch_chars: int = 2500,
) -> dict[str, Any]:
    parsed = _parse_gitlab_repo(repo_url)
    if not parsed:
        raise ValueError(f"Could not parse GitLab repository from: {repo_url}")

    api_base, project_path = parsed
    project_id = _gitlab_project_id(api_base, project_path)
    headers = _gitlab_headers(token)

    async with httpx.AsyncClient(timeout=45.0) as client:
        mr_resp = await client.get(
            f"{api_base}/projects/{project_id}/merge_requests/{mr_iid}",
            headers=headers,
        )
        if mr_resp.status_code == 404:
            raise RuntimeError(f"Merge request !{mr_iid} not found.")
        mr_resp.raise_for_status()
        item = mr_resp.json()

        changes_resp = await client.get(
            f"{api_base}/projects/{project_id}/merge_requests/{mr_iid}/changes",
            headers=headers,
        )
        changes_resp.raise_for_status()
        changes = changes_resp.json().get("changes") or []

        files: list[dict[str, Any]] = []
        total_additions = 0
        total_deletions = 0
        for ch in changes[:max_files]:
            patch = ch.get("diff") or ""
            if len(patch) > max_patch_chars:
                patch = patch[:max_patch_chars] + "\n... [diff truncated]"
            adds = patch.count("\n+") - patch.count("\n+++")
            dels = patch.count("\n-") - patch.count("\n---")
            total_additions += max(adds, 0)
            total_deletions += max(dels, 0)
            files.append(
                {
                    "filename": ch.get("new_path") or ch.get("old_path") or "",
                    "status": "modified",
                    "additions": max(adds, 0),
                    "deletions": max(dels, 0),
                    "patch": patch,
                }
            )

        return {
            "number": item["iid"],
            "title": item.get("title") or f"MR !{mr_iid}",
            "state": item.get("state") or "opened",
            "author": (item.get("author") or {}).get("username") or "unknown",
            "head_branch": item.get("source_branch") or "",
            "base_branch": item.get("target_branch") or "",
            "url": item.get("web_url") or "",
            "created_at": item.get("created_at") or "",
            "body": item.get("description") or "",
            "additions": total_additions,
            "deletions": total_deletions,
            "changed_files": len(changes),
            "files": files,
            "files_truncated": len(changes) > max_files,
        }


# --- Azure DevOps ---


async def fetch_azure_branches(
    repo_url: str,
    token: str | None = None,
) -> tuple[list[str], str | None]:
    parsed = _parse_azure_repo(repo_url)
    if not parsed:
        raise ValueError(f"Could not parse Azure DevOps repository from: {repo_url}")

    org, project, repo = parsed
    base = _azure_base(org, project)
    headers = _azure_headers(token)

    async with httpx.AsyncClient(timeout=30.0) as client:
        repo_resp = await client.get(
            f"{base}/git/repositories/{repo}",
            params={"api-version": "7.1"},
            headers=headers,
        )
        if repo_resp.status_code == 401:
            raise RuntimeError("Azure DevOps authentication failed. Check AZURE_DEVOPS_TOKEN.")
        if repo_resp.status_code == 404:
            raise RuntimeError(f"Azure DevOps repository not found: {repo}")
        repo_resp.raise_for_status()
        default_branch = repo_resp.json().get("defaultBranch", "").replace("refs/heads/", "") or None

        response = await client.get(
            f"{base}/git/repositories/{repo}/refs",
            params={"filter": "heads/", "api-version": "7.1"},
            headers=headers,
        )
        response.raise_for_status()
        branches = [
            ref["name"].replace("refs/heads/", "")
            for ref in response.json().get("value", [])
            if ref.get("name", "").startswith("refs/heads/")
        ]
        return sorted(set(branches), key=str.lower), default_branch


async def fetch_azure_commits(
    repo_url: str,
    branch: str = "main",
    limit: int = 30,
    token: str | None = None,
) -> list[dict[str, Any]]:
    parsed = _parse_azure_repo(repo_url)
    if not parsed:
        raise ValueError(f"Could not parse Azure DevOps repository from: {repo_url}")

    org, project, repo = parsed
    base = _azure_base(org, project)
    headers = _azure_headers(token)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{base}/git/repositories/{repo}/commits",
            params={
                "searchCriteria.itemVersion.version": branch,
                "searchCriteria.itemVersion.versionType": "branch",
                "$top": min(limit, 100),
                "api-version": "7.1",
            },
            headers=headers,
        )
        if response.status_code == 401:
            raise RuntimeError("Azure DevOps authentication failed. Check AZURE_DEVOPS_TOKEN.")
        response.raise_for_status()

        commits: list[dict[str, Any]] = []
        for item in response.json().get("value", []):
            sha = item["commitId"]
            author = (item.get("author") or {}).get("name") or "Unknown"
            email = (item.get("author") or {}).get("email") or ""
            committed_at = (item.get("author") or {}).get("date") or ""
            message = (item.get("comment") or "").split("\n")[0]

            files_changed: list[str] = []
            additions = 0
            deletions = 0
            changes_resp = await client.get(
                f"{base}/git/repositories/{repo}/commits/{sha}/changes",
                params={"api-version": "7.1"},
                headers=headers,
            )
            if changes_resp.status_code == 200:
                change_counts = changes_resp.json().get("changeCounts") or {}
                additions = change_counts.get("Add", 0) + change_counts.get("Edit", 0)
                deletions = change_counts.get("Delete", 0)
                for ch in (changes_resp.json().get("changes") or [])[:30]:
                    item_path = (ch.get("item") or {}).get("path")
                    if item_path:
                        files_changed.append(item_path)

            commits.append(
                {
                    "sha": sha[:12],
                    "full_sha": sha,
                    "message": message,
                    "author": author,
                    "author_email": email,
                    "committed_at": committed_at,
                    "files_changed": files_changed,
                    "additions": additions,
                    "deletions": deletions,
                    "url": None,
                }
            )
        return commits


async def fetch_azure_pull_requests(
    repo_url: str,
    state: str = "open",
    limit: int = 20,
    token: str | None = None,
) -> list[dict[str, Any]]:
    parsed = _parse_azure_repo(repo_url)
    if not parsed:
        raise ValueError(f"Could not parse Azure DevOps repository from: {repo_url}")

    org, project, repo = parsed
    base = _azure_base(org, project)
    headers = _azure_headers(token)
    az_status = "active" if state == "open" else state

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{base}/git/repositories/{repo}/pullrequests",
            params={
                "searchCriteria.status": az_status,
                "$top": min(limit, 100),
                "api-version": "7.1",
            },
            headers=headers,
        )
        if response.status_code == 401:
            raise RuntimeError("Azure DevOps authentication failed. Check AZURE_DEVOPS_TOKEN.")
        response.raise_for_status()

        pulls: list[dict[str, Any]] = []
        for item in response.json().get("value", []):
            pulls.append(
                {
                    "number": item["pullRequestId"],
                    "title": item.get("title") or f"PR #{item['pullRequestId']}",
                    "state": "open" if item.get("status") == "active" else item.get("status", "open"),
                    "author": (item.get("createdBy") or {}).get("displayName") or "unknown",
                    "head_branch": (item.get("sourceRefName") or "").replace("refs/heads/", ""),
                    "base_branch": (item.get("targetRefName") or "").replace("refs/heads/", ""),
                    "url": None,
                    "created_at": item.get("creationDate") or "",
                    "body": item.get("description") or "",
                    "additions": 0,
                    "deletions": 0,
                    "changed_files": 0,
                }
            )
        return pulls


async def fetch_azure_pull_request_detail(
    repo_url: str,
    pr_id: int,
    token: str | None = None,
    *,
    max_files: int = 30,
    max_patch_chars: int = 2500,
) -> dict[str, Any]:
    parsed = _parse_azure_repo(repo_url)
    if not parsed:
        raise ValueError(f"Could not parse Azure DevOps repository from: {repo_url}")

    org, project, repo = parsed
    base = _azure_base(org, project)
    headers = _azure_headers(token)

    async with httpx.AsyncClient(timeout=45.0) as client:
        pr_resp = await client.get(
            f"{base}/git/repositories/{repo}/pullrequests/{pr_id}",
            params={"api-version": "7.1"},
            headers=headers,
        )
        if pr_resp.status_code == 404:
            raise RuntimeError(f"Pull request #{pr_id} not found.")
        pr_resp.raise_for_status()
        item = pr_resp.json()

        iterations_resp = await client.get(
            f"{base}/git/repositories/{repo}/pullrequests/{pr_id}/iterations",
            params={"api-version": "7.1"},
            headers=headers,
        )
        files: list[dict[str, Any]] = []
        total_additions = 0
        total_deletions = 0
        if iterations_resp.status_code == 200:
            iterations = iterations_resp.json().get("value") or []
            if iterations:
                latest_id = iterations[-1]["id"]
                changes_resp = await client.get(
                    f"{base}/git/repositories/{repo}/pullrequests/{pr_id}/iterations/{latest_id}/changes",
                    params={"api-version": "7.1"},
                    headers=headers,
                )
                if changes_resp.status_code == 200:
                    for ch in (changes_resp.json().get("changeEntries") or [])[:max_files]:
                        path = (ch.get("item") or {}).get("path") or ""
                        patch = ""
                        if len(patch) > max_patch_chars:
                            patch = patch[:max_patch_chars] + "\n... [diff truncated]"
                        files.append(
                            {
                                "filename": path,
                                "status": "modified",
                                "additions": 0,
                                "deletions": 0,
                                "patch": patch,
                            }
                        )

        return {
            "number": item["pullRequestId"],
            "title": item.get("title") or f"PR #{pr_id}",
            "state": "open" if item.get("status") == "active" else item.get("status", "open"),
            "author": (item.get("createdBy") or {}).get("displayName") or "unknown",
            "head_branch": (item.get("sourceRefName") or "").replace("refs/heads/", ""),
            "base_branch": (item.get("targetRefName") or "").replace("refs/heads/", ""),
            "url": None,
            "created_at": item.get("creationDate") or "",
            "body": item.get("description") or "",
            "additions": total_additions,
            "deletions": total_deletions,
            "changed_files": len(files),
            "files": files,
            "files_truncated": False,
        }
