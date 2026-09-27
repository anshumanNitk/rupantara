"""Tests for repository URL parsing and file selection.

These guard the entry point of the whole pipeline: a malformed URL or a bad
file-selection heuristic would silently degrade every downstream stage.
"""

from __future__ import annotations

import pytest

from repo_fetcher import (
    RepoRef,
    RepositoryFetchError,
    _priority,
    _select_files,
    _should_skip,
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
