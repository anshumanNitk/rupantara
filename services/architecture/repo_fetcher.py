"""Repository ingestion.

Fetches a real repository's structure and key files so the Architecture Agent
reasons about ACTUAL code rather than guessing from a repository name.

This module is the only place that talks to a code host. It is deliberately
isolated: the agent receives a plain text context blob and never performs
network I/O itself.

Security notes:
- Only public repositories are supported (no credentials are sent).
- File contents are truncated and the total context is capped, so a huge
  repository cannot exhaust the model context window.
- Binary and vendored paths are skipped.
"""

from __future__ import annotations

import base64
import logging
import re
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
PRIORITY_PATTERNS: list[tuple[str, int]] = [
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
    (r"(^|/)README\.md$", 85),
    (r"(^|/)ARCHITECTURE\.md$", 100),
    (r"(^|/)main\.(py|go|rs|ts|js|java|rb)$", 80),
    (r"(^|/)app\.(py|ts|js|tsx|jsx)$", 80),
    (r"(^|/)server\.(py|ts|js|go)$", 80),
    (r"(^|/)index\.(ts|js|tsx|jsx)$", 70),
    (r"(^|/)__init__\.py$", 60),
    (r"(^|/)routes?/", 65),
    (r"(^|/)api/", 65),
    (r"(^|/)controllers?/", 60),
    (r"(^|/)services?/", 60),
    (r"(^|/)models?/", 55),
    (r"(^|/)agents?/", 70),
    (r"(^|/)graph/", 65),
    (r"(^|/)tools?/", 55),
    (r"(^|/)memory/", 55),
    (r"(^|/)db/", 50),
    (r"(^|/)infra/", 60),
    (r"(^|/)deploy/", 55),
    (r"(^|/)k8s/", 55),
    (r"(^|/)terraform/", 55),
    (r"\.(tf)$", 55),
    (r"(^|/)\.github/workflows/", 50),
    (r"(^|/)config/", 45),
    (r"(^|/)lib/", 40),
    (r"(^|/)src/", 35),
]

SOURCE_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java", ".kt",
    ".rb", ".php", ".cs", ".c", ".cpp", ".h", ".hpp", ".swift", ".scala",
    ".sql", ".sh", ".yml", ".yaml", ".toml", ".json", ".md", ".tf", ".proto",
}


class RepositoryFetchError(RuntimeError):
    """Raised when a repository cannot be fetched or parsed."""


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


def fetch_repository(
    ref: RepoRef,
    client: httpx.Client | None = None,
) -> RepoContext:
    """Fetches repository metadata, tree and key file contents from GitHub."""
    owns_client = client is None
    client = client or httpx.Client(
        timeout=30.0,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "architecture-to-3d-world",
        },
        follow_redirects=True,
    )

    try:
        # 1. Repository metadata (also resolves the default branch).
        meta_response = client.get(f"{GITHUB_API}/repos/{ref.owner}/{ref.name}")
        if meta_response.status_code == 404:
            raise RepositoryFetchError(
                f"Repository {ref.owner}/{ref.name} was not found or is private."
            )
        if meta_response.status_code == 403:
            raise RepositoryFetchError(
                "GitHub API rate limit reached. Set GITHUB_TOKEN to raise the limit."
            )
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

        # 2. Full recursive tree.
        tree_response = client.get(
            f"{GITHUB_API}/repos/{ref.owner}/{ref.name}/git/trees/{branch}",
            params={"recursive": "1"},
        )
        if tree_response.status_code == 404:
            raise RepositoryFetchError(
                f'Branch "{branch}" was not found in {ref.owner}/{ref.name}.'
            )
        tree_response.raise_for_status()
        tree_payload = tree_response.json()

        if tree_payload.get("truncated"):
            context.truncated = True

        context.tree = [
            entry["path"]
            for entry in tree_payload.get("tree", [])
            if entry.get("type") == "blob"
        ][:MAX_TREE_ENTRIES]

        # 3. Key file contents.
        total_bytes = 0
        for path in _select_files(context.tree):
            if total_bytes >= MAX_TOTAL_BYTES:
                context.truncated = True
                break

            file_response = client.get(
                f"{GITHUB_API}/repos/{ref.owner}/{ref.name}/contents/{path}",
                params={"ref": branch},
            )
            if file_response.status_code != 200:
                continue

            try:
                payload = file_response.json()
            except ValueError:
                continue

            if isinstance(payload, list):
                continue

            content = _decode_content(payload)
            if not content.strip():
                continue

            if len(content) > MAX_FILE_BYTES:
                content = content[:MAX_FILE_BYTES] + "\n... [truncated]"
                context.truncated = True

            context.files[path] = content
            total_bytes += len(content)

        if not context.files:
            logger.warning("No file contents could be fetched for %s/%s", ref.owner, ref.name)

        return context

    except httpx.HTTPError as exc:
        raise RepositoryFetchError(f"Failed to reach GitHub: {exc}") from exc
    finally:
        if owns_client:
            client.close()
