"""Repository ingestion.

Fetches a real repository's structure and key files so the Architecture Agent
reasons about ACTUAL code rather than guessing from a repository name.

This module is the only place that talks to a code host. It is deliberately
isolated: the agent receives a plain text context blob and never performs
network I/O itself.

API budget
----------
GitHub's unauthenticated limit is 60 requests/hour, so the number of calls per
analysis matters enormously. This module uses exactly TWO calls per analysis:

    1. GET /repos/{owner}/{repo}                -> metadata + default branch
    2. GET /repos/{owner}/{repo}/tarball/{ref}  -> every file, in one response

The tarball endpoint returns the whole repository as a gzipped archive, so we
get all file contents from a single request without needing one call per file.

Why not the Git Trees API?
--------------------------
An earlier version used `git/trees/{ref}?recursive=1` and assumed it inlines
blob content. It does NOT: the recursive tree returns only metadata
(path/mode/sha/size) with no `content` field. That bug caused every file fetch
to yield nothing, so the agent silently fell back to analysing an empty context
and then failed validation downstream. Verified against the live API:
`blobs with content field: 0`.

History: an even earlier version fetched each file individually via
`/contents/`, costing up to 62 requests and exhausting the entire hourly quota
in a single analysis.

Security notes:
- Only public repositories are supported (no credentials are sent unless a
  GITHUB_TOKEN is configured).
- File contents are truncated and the total context is capped, so a huge
  repository cannot exhaust the model context window.
- Binary and vendored paths are skipped.
"""

from __future__ import annotations

import base64
import io
import logging
import os
import re
import tarfile
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"

# --- Limits -----------------------------------------------------------------

MAX_FILES = 60
MAX_FILE_BYTES = 12_000
MAX_TOTAL_BYTES = 120_000
MAX_TREE_ENTRIES = 4_000
# Upper bound on the downloaded archive, so a huge repository cannot exhaust memory.
MAX_ARCHIVE_BYTES = 60_000_000

# --- Filtering --------------------------------------------------------------

SKIP_DIRS = {
    "node_modules", ".git", ".next", "dist", "build", "out", "coverage",
    "vendor", "__pycache__", ".venv", "venv", ".pytest_cache", ".mypy_cache",
    "target", "bin", "obj", ".idea", ".vscode", "site-packages",
    "migrations", "fixtures", "testdata", "snapshots",
}

SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".bmp",
    ".mp4", ".mov", ".avi", ".webm", ".mp3", ".wav",
    ".zip", ".tar", ".gz", ".rar", ".7z", ".jar", ".war",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".lock", ".sum", ".min.js", ".min.css", ".map",
    ".exe", ".dll", ".so", ".dylib", ".class", ".pyc", ".o", ".a",
}

# Files that reveal architecture: manifests, entrypoints, infra, docs.
#
# Patterns must match BOTH a file (`models.py`) and a directory (`models/`).
# Using a trailing slash alone silently gives every `models.py` a priority of 0,
# which caused them to be dropped from the context entirely. `\b` provides a
# word boundary that matches the `.` or `/` separator in both cases.
PRIORITY_PATTERNS: list[tuple[str, int]] = [
    # --- Manifests: reveal dependencies and frameworks ---
    (r"(^|/)package\.json$", 100),
    (r"(^|/)pyproject\.toml$", 100),
    (r"(^|/)requirements\.txt$", 95),
    (r"(^|/)go\.mod$", 95),
    (r"(^|/)Cargo\.toml$", 95),
    (r"(^|/)pom\.xml$", 95),
    (r"(^|/)build\.gradle(\.kts)?$", 95),
    (r"(^|/)composer\.json$", 90),
    (r"(^|/)Gemfile$", 90),
    (r"(^|/)docker-compose\.ya?ml$", 90),
    (r"(^|/)Dockerfile$", 85),
    # --- Docs that describe architecture ---
    (r"(^|/)ARCHITECTURE\.md$", 100),
    (r"(^|/)README\.md$", 85),
    # --- Entrypoints ---
    (r"(^|/)manage\.py$", 90),
    (r"(^|/)wsgi\.py$", 85),
    (r"(^|/)asgi\.py$", 80),
    (r"(^|/)settings\.py$", 85),
    (r"(^|/)main\.(py|go|rs|ts|js|java|rb)$", 85),
    (r"(^|/)app\.(py|ts|js|tsx|jsx)$", 85),
    (r"(^|/)server\.(py|ts|js|go)$", 85),
    (r"(^|/)index\.(ts|js|tsx|jsx)$", 70),
    # --- Framework concepts (file or directory) ---
    (r"(^|/)urls\.py$", 80),
    (r"(^|/)agents?\b", 78),
    (r"(^|/)views?\.py$", 75),
    (r"(^|/)models?\.(py|ts|js|java|rb|go|rs)$", 75),
    (r"(^|/)models?\b", 65),
    (r"(^|/)graph\b", 70),
    (r"(^|/)serializers\.py$", 70),
    (r"(^|/)schemas?\.(py|ts|js)$", 65),
    (r"(^|/)routes?\b", 65),
    (r"(^|/)api\b", 65),
    (r"(^|/)controllers?\b", 60),
    (r"(^|/)services?\b", 60),
    (r"(^|/)tools?\b", 60),
    (r"(^|/)memory\b", 60),
    (r"(^|/)repositories?\b", 55),
    (r"(^|/)db\b", 50),
    (r"(^|/)infra\b", 60),
    (r"(^|/)deploy\b", 55),
    (r"(^|/)k8s\b", 55),
    (r"(^|/)terraform\b", 55),
    (r"\.tf$", 55),
    (r"(^|/)\.github/workflows/", 50),
    (r"(^|/)config\b", 45),
    (r"(^|/)lib\b", 40),
    (r"(^|/)src\b", 35),
    # --- Deliberately low: usually empty or pure re-exports ---
    (r"(^|/)__init__\.py$", 5),
]

SOURCE_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java", ".kt",
    ".rb", ".php", ".cs", ".c", ".cpp", ".h", ".hpp", ".swift", ".scala",
    ".sql", ".sh", ".yml", ".yaml", ".toml", ".json", ".md", ".tf", ".proto",
}


class RepositoryFetchError(RuntimeError):
    """Raised when a repository cannot be fetched or parsed."""


class RateLimitError(RepositoryFetchError):
    """Raised when GitHub's API rate limit is exhausted.

    Carries the reset time so the caller can tell the user exactly how long to
    wait, instead of a generic failure.
    """

    def __init__(self, message: str, reset_at: int | None = None, authenticated: bool = False):
        super().__init__(message)
        self.reset_at = reset_at
        self.authenticated = authenticated


class InvalidTokenError(RepositoryFetchError):
    """Raised when GITHUB_TOKEN is set but GitHub rejects it.

    Distinct from rate limiting: a bad token produces a confusing failure
    because the user believes they have raised their quota. Detecting it
    explicitly turns a mystery 401 into an actionable message.
    """


def _check_token_response(response: httpx.Response, authenticated: bool) -> None:
    """Detects a rejected token so the user is not misled about their quota."""
    if not authenticated or response.status_code != 401:
        return

    raise InvalidTokenError(
        "GitHub rejected GITHUB_TOKEN (401 Unauthorized). "
        "The token is invalid, expired, or was revoked. "
        "Create a new token at https://github.com/settings/tokens, or leave "
        "GITHUB_TOKEN empty to use the unauthenticated limit (60 requests/hour)."
    )


def _rate_limit_message(response: httpx.Response, authenticated: bool) -> str:
    """Builds an actionable rate-limit message from GitHub's response headers."""
    remaining = response.headers.get("x-ratelimit-remaining")
    reset = response.headers.get("x-ratelimit-reset")

    reset_hint = ""
    if reset and reset.isdigit():
        import datetime

        reset_dt = datetime.datetime.fromtimestamp(int(reset), tz=datetime.timezone.utc)
        minutes = max(0, int((reset_dt - datetime.datetime.now(datetime.timezone.utc)).total_seconds() // 60))
        reset_hint = f" Resets in ~{minutes} minute(s) at {reset_dt:%H:%M} UTC."

    if authenticated:
        return (
            "GitHub API rate limit reached even with GITHUB_TOKEN."
            f"{reset_hint} Check that the token is valid and not expired."
        )

    return (
        "GitHub API rate limit reached (60 requests/hour unauthenticated)."
        f"{reset_hint} Set GITHUB_TOKEN in .env to raise the limit to 5000/hour."
    )


def _check_rate_limit(response: httpx.Response, authenticated: bool) -> None:
    """Raises RateLimitError when GitHub reports the quota is exhausted."""
    if response.status_code == 403 and response.headers.get("x-ratelimit-remaining") == "0":
        reset = response.headers.get("x-ratelimit-reset")
        raise RateLimitError(
            _rate_limit_message(response, authenticated),
            reset_at=int(reset) if reset and reset.isdigit() else None,
            authenticated=authenticated,
        )

    # Secondary rate limits also return 403 but without the remaining header.
    if response.status_code == 403:
        body = response.text.lower()
        if "rate limit" in body or "abuse" in body:
            raise RateLimitError(
                _rate_limit_message(response, authenticated),
                authenticated=authenticated,
            )


@dataclass
class RepoRef:
    owner: str
    name: str
    branch: str | None = None
    provider: str = "github"


@dataclass
class RepoContext:
    ref: RepoRef
    default_branch: str
    description: str = ""
    language: str = ""
    stars: int = 0
    topics: list[str] = field(default_factory=list)
    tree: list[str] = field(default_factory=list)
    files: dict[str, str] = field(default_factory=dict)
    truncated: bool = False

    def to_prompt(self) -> str:
        """Renders the context as a compact, model-friendly text blob."""
        lines: list[str] = [
            f"Repository: {self.ref.owner}/{self.ref.name}",
            f"Default branch: {self.default_branch}",
        ]
        if self.ref.branch:
            lines.append(f"Analyzed branch: {self.ref.branch}")
        if self.description:
            lines.append(f"Description: {self.description}")
        if self.language:
            lines.append(f"Primary language: {self.language}")
        if self.stars:
            lines.append(f"Stars: {self.stars}")
        if self.topics:
            lines.append(f"Topics: {', '.join(self.topics)}")

        lines.append("")
        lines.append(f"=== FILE TREE ({len(self.tree)} entries) ===")
        lines.extend(self.tree[:400])
        if len(self.tree) > 400:
            lines.append(f"... and {len(self.tree) - 400} more entries")

        lines.append("")
        lines.append(f"=== KEY FILE CONTENTS ({len(self.files)} files) ===")
        for path, content in self.files.items():
            lines.append("")
            lines.append(f"--- {path} ---")
            lines.append(content)

        if self.truncated:
            lines.append("")
            lines.append("NOTE: context was truncated to fit the model window.")

        return "\n".join(lines)


# --- URL parsing ------------------------------------------------------------

_GITHUB_URL_RE = re.compile(
    r"^(?:https?://)?(?:www\.)?github\.com/(?P<owner>[\w.-]+)/(?P<name>[\w.-]+?)(?:\.git)?"
    r"(?:/tree/(?P<branch>[^\s/]+))?/?$",
    re.IGNORECASE,
)
_SHORTHAND_RE = re.compile(r"^(?P<owner>[\w.-]+)/(?P<name>[\w.-]+)$")


def parse_repo_url(url: str) -> RepoRef:
    """Parses a GitHub URL or `owner/name` shorthand into a RepoRef.

    Raises RepositoryFetchError for anything that is not a GitHub repository.
    """
    candidate = url.strip()
    if not candidate:
        raise RepositoryFetchError("Repository URL is empty")

    match = _GITHUB_URL_RE.match(candidate)
    if match:
        return RepoRef(
            owner=match.group("owner"),
            name=match.group("name"),
            branch=match.group("branch"),
        )

    match = _SHORTHAND_RE.match(candidate)
    if match:
        return RepoRef(owner=match.group("owner"), name=match.group("name"))

    raise RepositoryFetchError(
        f'Could not parse "{url}". Expected a GitHub URL such as '
        "https://github.com/owner/repo or the shorthand owner/repo."
    )


# --- Fetching ---------------------------------------------------------------


def _should_skip(path: str) -> bool:
    parts = path.split("/")
    if any(part in SKIP_DIRS for part in parts[:-1]):
        return True
    lowered = path.lower()
    if any(lowered.endswith(ext) for ext in SKIP_EXTENSIONS):
        return True
    if lowered.endswith(".min.js") or lowered.endswith(".min.css"):
        return True
    return False


def _priority(path: str) -> int:
    for pattern, score in PRIORITY_PATTERNS:
        if re.search(pattern, path, re.IGNORECASE):
            return score
    return 0


def _select_files(tree: list[str]) -> list[str]:
    """Picks the most architecture-revealing files, deterministically."""
    candidates = [
        path
        for path in tree
        if not _should_skip(path)
        and any(path.lower().endswith(ext) for ext in SOURCE_EXTENSIONS)
    ]

    # Sort by priority desc, then path asc for stable, reproducible selection.
    candidates.sort(key=lambda p: (-_priority(p), p))

    selected: list[str] = []
    for path in candidates:
        if _priority(path) > 0:
            selected.append(path)
        if len(selected) >= MAX_FILES:
            break

    # If the repo has no recognisable structure, fall back to the first files.
    if not selected:
        selected = candidates[:MAX_FILES]

    return selected


def _decode_content(payload: dict[str, Any]) -> str:
    encoding = payload.get("encoding")
    content = payload.get("content", "")
    if encoding == "base64":
        try:
            raw = base64.b64decode(content)
        except Exception:  # noqa: BLE001
            return ""
        return raw.decode("utf-8", errors="replace")
    return str(content)


def _download_archive(
    ref: RepoRef,
    client: httpx.Client,
    branch: str,
    authenticated: bool,
) -> bytes:
    """Downloads the repository tarball for the given ref.

    One request yields every file. GitHub redirects to codeload; httpx follows
    redirects because the client is created with `follow_redirects=True`.
    """
    response = client.get(
        f"{GITHUB_API}/repos/{ref.owner}/{ref.name}/tarball/{branch}",
        follow_redirects=True,
    )
    if response.status_code == 404:
        raise RepositoryFetchError(
            f'Branch "{branch}" was not found in {ref.owner}/{ref.name}.'
        )
    _check_token_response(response, authenticated)
    _check_rate_limit(response, authenticated)
    response.raise_for_status()

    if len(response.content) > MAX_ARCHIVE_BYTES:
        raise RepositoryFetchError(
            f"Repository archive is larger than {MAX_ARCHIVE_BYTES // 1_000_000} MB "
            f"and cannot be analysed in one pass."
        )

    return response.content


def _iter_archive_members(archive: bytes) -> list[tuple[str, str]]:
    """Extracts (relative path, decoded text) pairs from a gzipped tarball.

    GitHub prefixes every member with a top-level directory such as
    `owner-repo-<sha>/`, which is stripped so paths match the repository tree.
    Binary and undecodable members are skipped rather than raising.
    """
    members: list[tuple[str, str]] = []

    try:
        with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
            for member in tar.getmembers():
                if not member.isfile():
                    continue

                # Strip the generated top-level directory prefix.
                parts = member.name.split("/", 1)
                if len(parts) != 2:
                    continue
                path = parts[1]

                handle = tar.extractfile(member)
                if handle is None:
                    continue

                try:
                    raw = handle.read()
                except Exception:  # noqa: BLE001
                    continue

                # Skip binary files: NUL bytes are a reliable signal.
                if b"\x00" in raw[:8192]:
                    continue

                try:
                    text = raw.decode("utf-8")
                except UnicodeDecodeError:
                    text = raw.decode("utf-8", errors="replace")

                members.append((path, text))
    except tarfile.TarError as exc:
        raise RepositoryFetchError(f"Repository archive could not be read: {exc}") from exc

    return members


def _auth_headers() -> dict[str, str]:
    """Builds GitHub request headers.

    Public repositories work unauthenticated, but GitHub's limit is only 60
    requests/hour. A token raises it to 5000/hour. The token is optional and is
    never logged.
    """
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "architecture-to-3d-world",
    }
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def fetch_repository(
    ref: RepoRef,
    client: httpx.Client | None = None,
) -> RepoContext:
    """Fetches repository metadata and file contents from GitHub.

    Uses exactly TWO API calls regardless of repository size:
      1. repository metadata (resolves the default branch)
      2. repository tarball (every file, in one response)

    This keeps a single analysis well inside GitHub's 60 requests/hour
    unauthenticated quota.
    """
    owns_client = client is None
    authenticated = bool(os.getenv("GITHUB_TOKEN", "").strip())
    client = client or httpx.Client(
        timeout=60.0,
        headers=_auth_headers(),
        follow_redirects=True,
    )

    try:
        # --- Call 1: repository metadata (also resolves the default branch) ---
        meta_response = client.get(f"{GITHUB_API}/repos/{ref.owner}/{ref.name}")

        if meta_response.status_code == 404:
            raise RepositoryFetchError(
                f"Repository {ref.owner}/{ref.name} was not found or is private."
            )
        _check_rate_limit(meta_response, authenticated)
        meta_response.raise_for_status()
        meta = meta_response.json()

        default_branch = meta.get("default_branch") or "main"
        branch = ref.branch or default_branch

        context = RepoContext(
            ref=RepoRef(ref.owner, ref.name, branch, ref.provider),
            default_branch=default_branch,
            description=meta.get("description") or "",
            language=meta.get("language") or "",
            stars=int(meta.get("stargazers_count") or 0),
            topics=list(meta.get("topics") or []),
        )

        # --- Call 2: full archive, giving us every file in one response ---
        archive = _download_archive(ref, client, branch, authenticated)
        members = _iter_archive_members(archive)

        context.tree = [path for path, _ in members][:MAX_TREE_ENTRIES]

        # Index content by path so selection can pick by priority.
        content_by_path = {path: text for path, text in members}

        selected = _select_files(context.tree)
        total_bytes = 0

        for path in selected:
            if total_bytes >= MAX_TOTAL_BYTES:
                context.truncated = True
                break

            content = content_by_path.get(path)
            if content is None or not content.strip():
                continue

            if len(content) > MAX_FILE_BYTES:
                content = content[:MAX_FILE_BYTES] + "\n... [truncated]"
                context.truncated = True

            context.files[path] = content
            total_bytes += len(content)

        # If priority selection produced nothing usable, fall back to any
        # non-empty text file so the agent still has real code to reason about.
        if not context.files:
            for path in context.tree:
                if total_bytes >= MAX_TOTAL_BYTES:
                    break
                content = content_by_path.get(path)
                if content is None or not content.strip():
                    continue
                if len(content) > MAX_FILE_BYTES:
                    content = content[:MAX_FILE_BYTES] + "\n... [truncated]"
                    context.truncated = True
                context.files[path] = content
                total_bytes += len(content)
                if len(context.files) >= MAX_FILES:
                    break

        if not context.files:
            logger.warning("No file contents could be read for %s/%s", ref.owner, ref.name)

        return context

    except httpx.HTTPError as exc:
        raise RepositoryFetchError(f"Failed to reach GitHub: {exc}") from exc
    finally:
        if owns_client:
            client.close()
