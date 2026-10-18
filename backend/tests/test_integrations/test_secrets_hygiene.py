"""
CI-style security hygiene test.
Greps the repository source code for accidental committed secrets, API keys, or live tokens.
Fails if any unauthorized key patterns (sk_live, sk_test_, AC[0-9a-f]{32}, bot tokens) are discovered in source trees.
"""

import os
import re
from pathlib import Path

import pytest

FORBIDDEN_SECRET_PATTERNS = [
    re.compile(r"sk_live_[0-9a-zA-Z]{24,}"),
    re.compile(r"sk_test_[0-9a-zA-Z]{24,}"),
    re.compile(r"\bAC[0-9a-fA-F]{32}\b"),
    re.compile(r"xoxb-[0-9]{10,}-[0-9]{10,}-[0-9a-zA-Z]{24,}"),
    re.compile(r"\bghp_[0-9a-zA-Z]{36}\b"),
]

# Paths allowed to contain mock/dummy tokens or templates
EXCLUDED_DIRS = {
    ".git",
    "tests",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".venv",
    "venv",
    ".idea",
    ".vscode",
}

EXCLUDED_FILES = {
    ".env.example",
    "test_secrets_hygiene.py",
}


def test_no_hardcoded_secrets_in_source_code():
    """Scan all non-test source files for leaked production/test credentials."""
    repo_root = Path(__file__).resolve().parents[2]  # backend root or repo root

    leaked_findings = []

    for root, dirs, files in os.walk(repo_root):
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]

        for file in files:
            if file in EXCLUDED_FILES or file.startswith(".env"):
                continue

            file_path = Path(root) / file
            # Only scan text/code files
            if file_path.suffix not in {".py", ".ts", ".tsx", ".js", ".json", ".yaml", ".yml", ".md", ".sql"}:
                continue

            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue

            for pattern in FORBIDDEN_SECRET_PATTERNS:
                matches = pattern.findall(content)
                if matches:
                    rel_path = file_path.relative_to(repo_root)
                    leaked_findings.append(f"{rel_path}: Matched pattern '{pattern.pattern}'")

    assert not leaked_findings, (
        f"Security violation: Found potential hardcoded secrets in source files:\n"
        + "\n".join(leaked_findings)
    )
