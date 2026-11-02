import re
from pathlib import Path
skip = {"node_modules", ".next", "scripts", "reviews"}
pat = re.compile(r"\.toLocaleString\((?!\s*[\"']en-US)|Intl\.NumberFormat\((?!\s*[\"']en-US)")
hits = []
for f in list(Path(".").rglob("*.ts")) + list(Path(".").rglob("*.tsx")):
    if any(s in f.parts for s in skip):
        continue
    text = f.read_text()
    for i, line in enumerate(text.splitlines(), 1):
        if pat.search(line):
            hits.append(f"{f}:{i}:{line.strip()}")
print("\n".join(hits))
