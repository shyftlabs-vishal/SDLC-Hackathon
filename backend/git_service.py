"""Git activity ingestion from local repos and GitHub."""

from __future__ import annotations

import os
import re
import subprocess
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

import httpx

GITHUB_API = "https://api.github.com"


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
    token = os.getenv("GITHUB_TOKEN")
    if local_repo_path:
        return fetch_local_branches(local_repo_path)
    if repo_url:
        return await fetch_github_branches(repo_url, token=token)
    raise ValueError("Configure repo_url or local_repo_path to list branches.")


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
    token = os.getenv("GITHUB_TOKEN")

    if local_repo_path:
        return fetch_local_commits(local_repo_path, branch=branch, limit=limit)

    if repo_url:
        return await fetch_github_commits(repo_url, branch=branch, limit=limit, token=token)

    raise ValueError("Configure repo_url or local_repo_path to sync git activity.")


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
