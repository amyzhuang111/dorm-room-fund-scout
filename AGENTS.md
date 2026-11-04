<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Rules for any agent or session working in this repo: protect the database

`data/campus-universe.db` is a **binary file that cannot be merged**. If your PR carries its own copy, it replaces everything other PRs added since you branched. This already happened once: PR #149 ("Promote ... build to main") kept its own copy and discarded 59 reviewed company restores, the weekly collector's data, ~1,000 people and ~325 companies. See `docs/data-pipeline-and-operations.md` (incident, recovery, how the pieces fit).

1. **Do not commit `data/campus-universe.db` unless the whole point of the PR is a database change.** Most data work does not need it.
2. **Never resolve a conflict on that file by keeping "your corpus".** If it conflicts, stop: branch from the *current* `main`, re-run your data script on `main`'s database, and commit that.
3. **Prefer data as code over editing the binary.** Reviewed decisions live as lists plus idempotent scripts applied in `prebuild` (`data/exports/restore-reviewed-companies-*.json`, `data/exports/recovered-rows-*.json`, `scripts/data/`). They survive a database replacement. Add a new list instead of flipping rows by hand.
4. **Before opening a PR that changes the database, run the guard and paste its output in the PR:**
   `git show origin/main:data/campus-universe.db > /tmp/base.db && python3 scripts/audit/db-drop-guard.py /tmp/base.db data/campus-universe.db`
   It exits non-zero if any table lost a meaningful number of rows. CI runs the same check ("DB drop guard"). A deliberate cleanup needs the label `allow-db-shrink` and a PR description that says what is removed and why.
5. **Never "promote" or "sync" a whole branch to `main` without comparing databases first** and stating in the PR what it drops.
6. Never experiment on the committed file: `cp data/campus-universe.db /tmp/scratch.db` and set `CAMPUS_UNIVERSE_DB_PATH=/tmp/scratch.db`. Opening it with the app switches it to WAL mode and can leave `-wal`/`-shm` files.
7. If you are unsure whether a change is additive, assume it is not and ask the owner.
