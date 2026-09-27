"""Tests for repository URL parsing and file selection. 

These guard the entry point of the whole pipeline: a malformed URL or a bad
file-selection heuristic would silently degrade every downstream stage.
"""

from __future__ import annotations

import io
import tarfile

import httpx
import pytest

from repo_fetcher import (
    RateLimitError,
    RepoRef,
    RepositoryFetchError,
    _priority,
    _select_files,
    _should_skip,
    fetch_repository,
    parse_repo_url,
)


@pytest.mark.parametrize(
    ("url", "owner", "name", "branch"),
    [
        ("https://github.com/tiangolo/fastapi", "tiangolo", "fastapi", None),
        ("http://github.com/tiangolo/fastapi", "tiangolo", "fastapi", None),
        ("github.com/tiangolo/fastapi", "tiangolo", "fastapi", None),
        ("https://www.github.com/tiangolo/fastapi", "tiangolo", "fastapi", None),
        ("https://github.com/tiangolo/fastapi.git", "tiangolo", "fastapi", None),
        ("https://github.com/tiangolo/fastapi/", "tiangolo", "fastapi", None),
        ("https://github.com/anshumanNitk/Robotic-Process-Automation/tree/procedure",
         "anshumanNitk", "Robotic-Process-Automation", "procedure"),
        ("tiangolo/fastapi", "tiangolo", "fastapi", None),
        ("  https://github.com/expressjs/express  ", "expressjs", "express", None),
    ],
)
def test_parses_valid_repository_urls(url: str, owner: str, name: str, branch: str | None) -> None:
    ref = parse_repo_url(url)
    assert ref.owner == owner
    assert ref.name == name
    assert ref.branch == branch


@pytest.mark.parametrize(
    "url",
    [
        "",
        "   ",
        "https://gitlab.com/owner/repo",
        "https://bitbucket.org/owner/repo",
        "not a url at all",
        "https://github.com/",
        "https://github.com/onlyowner",
    ],
)
def test_rejects_invalid_repository_urls(url: str) -> None:
    with pytest.raises(RepositoryFetchError):
        parse_repo_url(url)


def test_skips_vendored_and_binary_paths() -> None:
    assert _should_skip("node_modules/react/index.js")
    assert _should_skip("src/__pycache__/mod.pyc")
    assert _should_skip("assets/logo.png")
    assert _should_skip("dist/bundle.min.js")
    assert _should_skip("vendor/github.com/pkg/errors.go")

    assert not _should_skip("src/main.py")
    assert not _should_skip("package.json")
    assert not _should_skip("services/api/routes.ts")


def test_prioritises_manifests_and_entrypoints() -> None:
    assert _priority("package.json") > _priority("src/utils/helpers.ts")
    assert _priority("pyproject.toml") > _priority("src/lib/thing.py")
    assert _priority("ARCHITECTURE.md") >= _priority("README.md")
    assert _priority("src/main.py") > _priority("src/lib/thing.py")


def test_priority_patterns_match_files_as_well_as_directories() -> None:
    """Regression: directory-only patterns (`models/`) gave `models.py` a
    priority of 0, so core framework files were silently dropped."""
    assert _priority("authen/models.py") > 0
    assert _priority("authen/views.py") > 0
    assert _priority("CDC/urls.py") > 0
    assert _priority("manage.py") > 0
    assert _priority("CDC/settings.py") > 0
    # Directory form still works.
    assert _priority("app/models/thing.py") > 0


def test_empty_init_files_rank_below_real_modules() -> None:
    """`__init__.py` is usually empty, so it must not crowd out real modules."""
    assert _priority("authen/__init__.py") < _priority("authen/models.py")
    assert _priority("authen/__init__.py") < _priority("authen/views.py")


def test_selects_django_style_architecture_files() -> None:
    tree = [
        "CDC/__init__.py",
        "CDC/settings.py",
        "CDC/urls.py",
        "CDC/wsgi.py",
        "authen/__init__.py",
        "authen/models.py",
        "authen/urls.py",
        "authen/views.py",
        "manage.py",
        "README.md",
    ]

    selected = _select_files(tree)

    for expected in ["CDC/settings.py", "authen/models.py", "authen/views.py", "manage.py"]:
        assert expected in selected, f"{expected} should be selected"
    # Real modules must outrank near-empty package markers.
    assert selected.index("authen/models.py") < selected.index("authen/__init__.py")


def test_selects_architecture_revealing_files_first() -> None:
    tree = [
        "node_modules/react/index.js",
        "assets/logo.png",
        "package.json",
        "README.md",
        "src/main.py",
        "src/utils/helpers.py",
        "src/lib/deep/nested/thing.py",
    ]

    selected = _select_files(tree)

    assert "package.json" in selected
    assert "README.md" in selected
    assert "src/main.py" in selected
    # Vendored and binary files must never be selected.
    assert not any("node_modules" in path for path in selected)
    assert not any(path.endswith(".png") for path in selected)


def test_selection_is_deterministic() -> None:
    tree = [f"src/module_{i}/file_{i}.py" for i in range(50)] + ["package.json", "README.md"]
    assert _select_files(tree) == _select_files(tree)


def test_falls_back_when_no_recognised_structure() -> None:
    tree = ["weird/one.xyz", "weird/two.xyz"]
    # No source extensions at all -> empty selection, not a crash.
    assert _select_files(tree) == []


def test_repo_ref_defaults_to_github() -> None:
    ref = RepoRef(owner="a", name="b")
    assert ref.provider == "github"
    assert ref.branch is None


# --- API budget -------------------------------------------------------------
#
# These tests are the regression guard for two separate bugs:
#
#   1. An implementation that issued one request per file (up to 62 per
#      analysis), which could exhaust GitHub's entire 60/hour quota in a run.
#   2. An implementation that relied on the recursive Git Trees API inlining
#      blob content. It does not, so every analysis silently read ZERO files
#      and the agent produced a fabricated architecture before failing.
#
# A full analysis must cost exactly 2 requests: metadata + tarball.


def _make_tarball(files: dict[str, str], prefix: str = "acme-demo-abc123") -> bytes:
    """Builds a real gzipped tarball, mirroring GitHub's archive layout."""
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        for path, content in files.items():
            data = content.encode("utf-8")
            info = tarfile.TarInfo(name=f"{prefix}/{path}")
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


def _mock_client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_uses_exactly_two_api_calls() -> None:
    """A full analysis must cost 2 requests, not one per file."""
    calls: list[str] = []
    archive = _make_tarball(
        {
            "package.json": '{"name":"demo"}',
            "src/main.py": "def main(): pass",
            "README.md": "# Demo",
        }
    )

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path == "/repos/acme/demo":
            return httpx.Response(200, json={"default_branch": "main", "language": "Python"})
        if request.url.path == "/repos/acme/demo/tarball/main":
            return httpx.Response(200, content=archive)
        return httpx.Response(404)

    with _mock_client(handler) as client:
        context = fetch_repository(RepoRef("acme", "demo"), client=client)

    assert len(calls) == 2, f"expected 2 API calls, got {len(calls)}: {calls}"
    assert context.files["package.json"] == '{"name":"demo"}'
    assert context.files["src/main.py"] == "def main(): pass"
    assert context.files["README.md"] == "# Demo"


def test_never_uses_per_file_requests() -> None:
    """Content must come from the archive, never a /contents/ request."""
    paths: list[str] = []
    archive = _make_tarball({"src/app.py": "print('hi')"})

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        if request.url.path == "/repos/acme/demo":
            return httpx.Response(200, json={"default_branch": "main"})
        return httpx.Response(200, content=archive)

    with _mock_client(handler) as client:
        context = fetch_repository(RepoRef("acme", "demo"), client=client)

    assert not any("/contents/" in path for path in paths)
    assert not any("/git/trees/" in path for path in paths)
    assert context.files["src/app.py"] == "print('hi')"


def test_strips_archive_prefix_and_skips_binaries() -> None:
    """Paths are relative and binary members are skipped, not crashed on."""
    archive = _make_tarball(
        {
            "src/app.py": "x = 1",
            "assets/logo.png": "\x00\x01\x02binary",
        }
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/repos/acme/demo":
            return httpx.Response(200, json={"default_branch": "main"})
        return httpx.Response(200, content=archive)

    with _mock_client(handler) as client:
        context = fetch_repository(RepoRef("acme", "demo"), client=client)

    # Prefix stripped so paths match the repository tree.
    assert "src/app.py" in context.files
    assert not any("acme-demo-abc123" in path for path in context.files)
    # Binary content skipped.
    assert "assets/logo.png" not in context.files


def test_raises_rate_limit_error_with_reset_time() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            403,
            headers={"x-ratelimit-remaining": "0", "x-ratelimit-reset": "1800000000"},
            json={"message": "API rate limit exceeded"},
        )

    with _mock_client(handler) as client:
        with pytest.raises(RateLimitError) as exc_info:
            fetch_repository(RepoRef("acme", "demo"), client=client)

    assert exc_info.value.reset_at == 1800000000
    assert "GITHUB_TOKEN" in str(exc_info.value)


def test_rate_limit_error_is_not_a_plain_fetch_error() -> None:
    """RateLimitError must be distinguishable so the API can return 429."""
    assert issubclass(RateLimitError, RepositoryFetchError)


def test_reports_unreadable_archive() -> None:
    """A corrupt archive is a clear error, not a silent empty result."""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/repos/acme/demo":
            return httpx.Response(200, json={"default_branch": "main"})
        return httpx.Response(200, content=b"this is not a gzip archive")

    with _mock_client(handler) as client:
        with pytest.raises(RepositoryFetchError) as exc_info:
            fetch_repository(RepoRef("acme", "demo"), client=client)

    assert "archive" in str(exc_info.value).lower()


def test_returns_context_with_no_files_for_non_source_repo() -> None:
    """A repo with only binaries yields zero files rather than raising here.

    The agent treats zero files as a hard failure; that policy lives in the
    agent, so the fetcher stays honest about what it found.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/repos/acme/demo":
            return httpx.Response(200, json={"default_branch": "main"})
        return httpx.Response(200, content=_make_tarball({"assets/logo.png": "\x00"}))

    with _mock_client(handler) as client:
        context = fetch_repository(RepoRef("acme", "demo"), client=client)

    assert context.files == {}


def test_reports_missing_repository() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"message": "Not Found"})

    with _mock_client(handler) as client:
        with pytest.raises(RepositoryFetchError) as exc_info:
            fetch_repository(RepoRef("acme", "missing"), client=client)

    assert "not found" in str(exc_info.value).lower()


def test_reports_missing_branch() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/repos/acme/demo":
            return httpx.Response(200, json={"default_branch": "main"})
        return httpx.Response(404, json={"message": "Not Found"})

    with _mock_client(handler) as client:
        with pytest.raises(RepositoryFetchError) as exc_info:
            fetch_repository(RepoRef("acme", "demo", branch="nope"), client=client)

    assert "nope" in str(exc_info.value)
