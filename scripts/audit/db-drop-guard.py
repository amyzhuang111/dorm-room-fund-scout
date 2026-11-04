#!/usr/bin/env python3
"""Fail when a pull request makes the committed SQLite database lose data.

Why: data/campus-universe.db is a binary file that cannot be merged. A PR that
carries its own copy replaces everything other PRs added (2026-11-04: PR #149
dropped ~1,000 people, 325 companies and 1,703 claims without anyone noticing).

Compares per-table row counts between the base and head database and exits 1 if
any table shrank by more than max(MIN_DROP rows, PCT percent of the base count).

  python3 scripts/audit/db-drop-guard.py BASE.db HEAD.db [--min-drop 25] [--pct 1.0]

Counts only: it cannot tell a deliberate cleanup from an accident. A deliberate
shrink is allowed by labeling the PR `allow-db-shrink` (the workflow skips the
check then), but the PR should say what it removes and why.
"""
from __future__ import annotations

import argparse
import sqlite3
import sys


def counts(path: str) -> dict[str, int]:
    c = sqlite3.connect(f"file:{path}?mode=ro&immutable=1", uri=True)
    tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    return {t: c.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for t in tables}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("base")
    ap.add_argument("head")
    ap.add_argument("--min-drop", type=int, default=25, help="ignore drops smaller than this many rows")
    ap.add_argument("--pct", type=float, default=1.0, help="ignore drops smaller than this percent of the base count")
    a = ap.parse_args()

    base, head = counts(a.base), counts(a.head)
    bad: list[tuple[str, int, int]] = []
    rows: list[tuple[str, int, int, int]] = []
    for t in sorted(set(base) | set(head)):
        b, h = base.get(t, 0), head.get(t, 0)
        if b != h:
            rows.append((t, b, h, h - b))
        if t not in head and b > 0:
            bad.append((t, b, h))  # a table with data disappeared
        elif b - h > max(a.min_drop, b * a.pct / 100.0):
            bad.append((t, b, h))

    print(f"{'table':<26}{'base':>8}{'head':>8}{'change':>8}")
    for t, b, h, d in rows:
        flag = "  <-- DROP" if any(x[0] == t for x in bad) else ""
        print(f"{t:<26}{b:>8}{h:>8}{d:>+8}{flag}")
    if not rows:
        print("(no table has a different row count)")
    if bad:
        print(
            f"\nFAIL: {len(bad)} table(s) lost more than max({a.min_drop} rows, {a.pct}%): "
            + ", ".join(f"{t} ({b}->{h})" for t, b, h in bad)
            + "\nIf this is a deliberate cleanup, say what it removes in the PR and add the label `allow-db-shrink`."
            + "\nIf not, this PR carries a database that is missing data other PRs added: rebase it onto main's database and re-apply your change."
        )
        return 1
    print("\nOK: no table lost a significant number of rows.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
