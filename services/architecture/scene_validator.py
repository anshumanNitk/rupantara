"""Static validation for generated scene code.

This is the FIRST gate of the sandbox pipeline:

    Scene Agent -> Generated Scene TSX -> [static validation] -> TypeScript
    compile -> isolated sandbox build -> preview bundle -> restricted iframe

Nothing here executes the generated code. It only inspects it. The production
application must remain protected even if the Scene Agent produces malformed or
malicious output.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# --- Allowlists -------------------------------------------------------------

ALLOWED_IMPORT_SOURCES = {
    "@/scene-sdk",
    "@/world/schemas/world",
    "react",
}

ALLOWED_SDK_COMPONENTS = {
    # buildings
    "OfficeBuilding", "OfficeTower", "AgentControlCenter", "DataCenter",
    "Warehouse", "DistributionCenter", "Factory", "Workshop", "Airport",
    "ControlTower", "TargetApplication",
    # people
    "Person", "RequestEntity",
    # vehicles
    "Car", "Truck", "RobotWorker", "Airplane",
    # connections
    "Road", "Bridge", "AirRoute", "Pipe", "Beam", "DataRoute",
    # effects
    "PulseEffect", "SuccessEffect", "FailureEffect", "ParticleEffect", "Label",
    # behaviors
    "MoveAlongPath", "MoveAlongArc", "Pulse", "Spawn", "Enter", "Exit", "Orbit",
}

# --- Denylists --------------------------------------------------------------

# Patterns that indicate arbitrary execution, filesystem, network or secret
# access. These are rejected outright, not warned about.
FORBIDDEN_PATTERNS: list[tuple[str, str]] = [
    (r"\beval\s*\(", "eval() is forbidden"),
    (r"\bnew\s+Function\s*\(", "new Function() is forbidden"),
    (r"\bFunction\s*\(\s*['\"]", "Function constructor is forbidden"),
    (r"\brequire\s*\(", "require() is forbidden"),
    (r"\bimport\s*\(", "dynamic import() is forbidden"),
    (r"\bfetch\s*\(", "fetch() is forbidden"),
    (r"\bXMLHttpRequest\b", "XMLHttpRequest is forbidden"),
    (r"\bWebSocket\b", "WebSocket is forbidden"),
    (r"\bprocess\s*\.", "process access is forbidden"),
    (r"\bprocess\s*\[", "process access is forbidden"),
    (r"\bglobalThis\b", "globalThis access is forbidden"),
    (r"\bwindow\s*\.", "window access is forbidden"),
    (r"\bdocument\s*\.", "document access is forbidden"),
    (r"\blocalStorage\b", "localStorage access is forbidden"),
    (r"\bsessionStorage\b", "sessionStorage access is forbidden"),
    (r"\bindexedDB\b", "indexedDB access is forbidden"),
    (r"\bchild_process\b", "child_process is forbidden"),
    (r"\bworker_threads\b", "worker_threads is forbidden"),
    (r"\bnode:fs\b", "filesystem access is forbidden"),
    (r"\bnode:net\b", "network access is forbidden"),
    (r"\bnode:http\b", "network access is forbidden"),
    (r"\bnode:crypto\b", "crypto access is forbidden"),
    (r"\bfrom\s+['\"]fs['\"]", "filesystem access is forbidden"),
    (r"\bfrom\s+['\"]path['\"]", "path access is forbidden"),
    (r"\bfrom\s+['\"]os['\"]", "os access is forbidden"),
    (r"\bfrom\s+['\"]net['\"]", "network access is forbidden"),
    (r"\bfrom\s+['\"]http['\"]", "network access is forbidden"),
    (r"\bfrom\s+['\"]https['\"]", "network access is forbidden"),
    (r"\bfrom\s+['\"]crypto['\"]", "crypto access is forbidden"),
    (r"\bfrom\s+['\"]child_process['\"]", "child_process is forbidden"),
    (r"\bfrom\s+['\"]next/headers['\"]", "Next.js server API is forbidden"),
    (r"\bfrom\s+['\"]next/server['\"]", "Next.js server API is forbidden"),
    (r"\bfrom\s+['\"]server-only['\"]", "server-only import is forbidden"),
    (r"\bfrom\s+['\"]@prisma", "database client is forbidden"),
    (r"\bfrom\s+['\"]pg['\"]", "database client is forbidden"),
    (r"\bfrom\s+['\"]mysql", "database client is forbidden"),
    (r"\bfrom\s+['\"]mongodb", "database client is forbidden"),
    (r"\bfrom\s+['\"]redis['\"]", "database client is forbidden"),
    (r"\bfrom\s+['\"]ioredis['\"]", "database client is forbidden"),
    (r"\bfrom\s+['\"]@aws-sdk", "cloud SDK is forbidden"),
    (r"\bfrom\s+['\"]@google-cloud", "cloud SDK is forbidden"),
    (r"\bfrom\s+['\"]@azure", "cloud SDK is forbidden"),
    (r"\bMath\.random\s*\(", "Math.random() breaks determinism"),
    (r"\bDate\.now\s*\(", "Date.now() breaks determinism"),
    (r"\bnew\s+Date\s*\(\s*\)", "new Date() breaks determinism"),
]

IMPORT_RE = re.compile(
    r"""^\s*import\s+(?:type\s+)?(?:[\w*{}\s,$]+\s+from\s+)?['"]([^'"]+)['"]""",
    re.MULTILINE,
)

# Matches JSX component usage: <ComponentName
JSX_COMPONENT_RE = re.compile(r"<\s*([A-Z][A-Za-z0-9_]*)")

# Intrinsic R3F/Three elements the SDK is allowed to compose with.
ALLOWED_INTRINSIC_ELEMENTS = {
    "group", "mesh", "boxGeometry", "sphereGeometry", "cylinderGeometry",
    "coneGeometry", "torusGeometry", "capsuleGeometry", "planeGeometry",
    "ringGeometry", "octahedronGeometry", "edgesGeometry", "lineSegments",
    "lineBasicMaterial", "meshStandardMaterial", "meshBasicMaterial",
    "ambientLight", "directionalLight", "pointLight", "hemisphereLight",
    "color", "fog", "primitive",
}

MAX_SCENE_BYTES = 200_000


@dataclass
class SceneValidationResult:
    ok: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _check_forbidden_patterns(code: str) -> list[str]:
    errors: list[str] = []
    for pattern, message in FORBIDDEN_PATTERNS:
        if re.search(pattern, code):
            errors.append(message)
    return errors


def _check_imports(code: str) -> list[str]:
    errors: list[str] = []
    for source in IMPORT_RE.findall(code):
        if source not in ALLOWED_IMPORT_SOURCES:
            errors.append(f'Import from "{source}" is not allowed')
    return errors


def _check_components(code: str) -> list[str]:
    errors: list[str] = []
    for name in set(JSX_COMPONENT_RE.findall(code)):
        if name in ALLOWED_SDK_COMPONENTS:
            continue
        if name in ALLOWED_INTRINSIC_ELEMENTS:
            continue
        # Allow the component's own name and React fragments.
        if name in {"GeneratedScene", "Fragment"}:
            continue
        errors.append(f'Component <{name}> is not part of the Scene SDK')
    return errors


def _check_shape(code: str) -> list[str]:
    errors: list[str] = []
    if "export default" not in code:
        errors.append("Scene module must have a default export")
    if "GeneratedScene" not in code:
        errors.append("Scene module must define a GeneratedScene component")
    if "world" not in code:
        errors.append("Scene module must consume the `world` prop")
    return errors


def validate_scene_code(code: str) -> SceneValidationResult:
    """Statically validates generated scene code. Never executes it."""
    errors: list[str] = []
    warnings: list[str] = []

    if not code.strip():
        return SceneValidationResult(ok=False, errors=["Scene code is empty"])

    if len(code.encode("utf-8")) > MAX_SCENE_BYTES:
        errors.append(f"Scene code exceeds {MAX_SCENE_BYTES} bytes")

    errors.extend(_check_forbidden_patterns(code))
    errors.extend(_check_imports(code))
    errors.extend(_check_components(code))
    errors.extend(_check_shape(code))

    # Non-fatal observations.
    if "resolved_position" not in code:
        warnings.append("Scene does not reference resolved_position; positions may be hardcoded")
    if "world.connections" not in code and "world.entities" not in code:
        warnings.append("Scene does not iterate the world specification")

    return SceneValidationResult(ok=not errors, errors=errors, warnings=warnings)
