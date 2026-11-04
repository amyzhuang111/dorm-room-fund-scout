# Campus Scout scan desk

A desk for the public [Campus Scout shortlist](https://campus-scout-git-main-amys-projects-d3dfb125.vercel.app/work/shortlist). It scans all 170 campuses on that file and ranks every one.

The shortlist itself is read-only. Seventy campuses were marked Not scanned, and PitchBook place does not change when a campus is scanned. This desk reads the Nov 2, 2026 file and runs both passes locally.

## What the passes do

**Scan all campuses** walks every campus:

- Up to date files are confirmed, with their source count, founder count, and last check.
- Partial files stay partial. Missing names are left unresolved.
- Not scanned campuses are opened from the file. The note records founders already on file and any PitchBook rank. It does not invent people.

**Rank all** gives every campus a desk place:

1. PitchBook 2026 undergraduate rank
2. PitchBook graduate rank, for campuses with no undergraduate rank
3. PitchBook MBA rank
4. Founders already on file, then companies

Tied PitchBook numbers break on founders on file, then companies, then name.

## Run

```bash
npm install
npm run dev -- --port 43123
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123). Founder and company links are at [http://127.0.0.1:43123/founders](http://127.0.0.1:43123/founders).

## Founder and company links

The Founders desk lists the same 2,432 projects as the public founders table. A company name links to the website on file. A founder name links to the recorded profile, usually LinkedIn, otherwise GitHub or a personal site. Names with no URL on file stay plain text. Unverified name-only LinkedIn guesses are left unlinked.

The page loads with both passes already applied. Scan all, Rank all, and Run both again replay them. Show the Nov 2, 2026 file returns to the original coverage labels.
