# Campus Scout scan desk

A desk for the public [Campus Scout campus file](https://campus-scout-git-main-amys-projects-d3dfb125.vercel.app/campuses). It scans all 238 campuses on that file and ranks every one.

The public file is read-only. 124 campuses have no founders and no sources yet, and PitchBook place does not change when a campus is scanned. This desk reads the Nov 4, 2026 file and runs both passes locally.

## What the passes do

**Scan all campuses** walks every campus:

- Every campus with founders or sources on file is confirmed. None are left partial. The note records the source count, founder count, and last check.
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

The Founders desk lists the same 2,432 projects as the public founders table. 1,328 company names link to a website on file, and 1,621 founder names link to a recorded profile, usually LinkedIn, otherwise GitHub or a personal site. Names with no URL on file stay plain text. Unverified name-only LinkedIn guesses are left unlinked.

The page loads with both passes already applied. Scan all, Rank all, and Run both again replay them. Show the Nov 4, 2026 file returns to the original coverage labels.
