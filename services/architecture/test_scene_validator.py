"""Tests for the scene sandbox static validator.

These tests are the security contract: malicious or malformed scene code must be
rejected before it ever reaches a build or a runtime.
"""

from __future__ import annotations

import pytest

from scene_validator import validate_scene_code

VALID_SCENE = """
import { AgentControlCenter, DataCenter, Road } from '@/scene-sdk';
import type { PlacedWorld } from '@/world/schemas/world';

export default function GeneratedScene({ world }: { world: PlacedWorld }) {
  const agent = world.entities.find((e) => e.id === 'rpa_agent');
  const redis = world.entities.find((e) => e.id === 'redis');
  const link = world.connections.find((c) => c.from === 'rpa_agent');

  return (
    <>
      {agent && <AgentControlCenter position={agent.resolved_position} />}
      {redis && <DataCenter position={redis.resolved_position} />}
      {link && <Road path={link.path} />}
    </>
  );
}
"""


def test_accepts_a_valid_scene() -> None:
    result = validate_scene_code(VALID_SCENE)
    assert result.ok, result.errors


def test_rejects_empty_code() -> None:
    assert not validate_scene_code("").ok


@pytest.mark.parametrize(
    "snippet",
    [
        "eval('malicious')",
        "new Function('return 1')",
        "require('fs')",
        "import('fs')",
        "fetch('https://evil.example')",
        "new XMLHttpRequest()",
        "process.env.SECRET",
        "globalThis.thing",
        "window.location",
        "document.cookie",
        "localStorage.getItem('x')",
        "child_process.exec('rm -rf /')",
        "Math.random()",
        "Date.now()",
    ],
)
def test_rejects_forbidden_expressions(snippet: str) -> None:
    code = VALID_SCENE.replace("return (", f"{snippet};\n  return (")
    result = validate_scene_code(code)
    assert not result.ok, f"expected rejection for: {snippet}"


@pytest.mark.parametrize(
    "source",
    [
        "fs",
        "path",
        "os",
        "net",
        "http",
        "https",
        "crypto",
        "child_process",
        "next/headers",
        "next/server",
        "server-only",
        "pg",
        "ioredis",
        "@aws-sdk/client-s3",
    ],
)
def test_rejects_forbidden_imports(source: str) -> None:
    code = f"import x from '{source}';\n" + VALID_SCENE
    result = validate_scene_code(code)
    assert not result.ok, f"expected rejection for import: {source}"


def test_rejects_unknown_components() -> None:
    code = VALID_SCENE.replace("<DataCenter", "<TotallyMadeUpComponent")
    result = validate_scene_code(code)
    assert not result.ok
    assert any("TotallyMadeUpComponent" in e for e in result.errors)


def test_rejects_missing_default_export() -> None:
    code = VALID_SCENE.replace("export default function GeneratedScene", "function GeneratedScene")
    result = validate_scene_code(code)
    assert not result.ok


def test_warns_when_positions_are_not_derived_from_the_world() -> None:
    code = """
import { DataCenter } from '@/scene-sdk';
import type { PlacedWorld } from '@/world/schemas/world';

export default function GeneratedScene({ world }: { world: PlacedWorld }) {
  return <DataCenter position={{ x: 1, y: 2, z: 3 }} />;
}
"""
    result = validate_scene_code(code)
    assert result.ok
    assert any("resolved_position" in w for w in result.warnings)
