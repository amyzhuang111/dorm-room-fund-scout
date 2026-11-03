# Data backfill + founder verify 2026-11-03

Branch: `cursor/data-backfill-2026-11-03` from `origin/main` @ 6f5a35c (r59 / 1,225 investable).

## Company fill rates (investable, of 1,225)

| Field | Before | After |
|---|---:|---:|
| stage | 30 | 331 |
| founded | 719 | 723 |
| sector | 902 | 950 |
| funding | 28 | 334 |
| website | 515 | 840 |

## Founder / project verification

- Founders: 3205 (unchanged)
- Verified founders: 2547 → 2654
- Projects: 2030 (unchanged)
- Verified projects ( /founders verified count ): 1720 → 1788
- Newly confirmed: 109
- Flagged for exclusion (not deleted): 13

### Exclusion list

- **Alaric Qin** (—, Penn, year=2016): Stored enrollment_grad_year 2016 is before 2023
- **Amy Xiao** (Cloudglue, Toronto, year=2020): Stored enrollment_grad_year 2020 is before 2023
- **August Chen** (Hazel, Harvard, year=2020): Stored enrollment_grad_year 2020 is before 2023
- **Dr. Sabrine Obbad** (Alara, NYU, year=2014): Stored enrollment_grad_year 2014 is before 2023
- **Elian Haddock** (Airgoods, Yale, year=2022): Stored enrollment_grad_year 2022 is before 2023
- **Finnian Brown** (Aqua Voice, Harvard, year=2019): Stored enrollment_grad_year 2019 is before 2023
- **Jeff Kessler** (—, Penn, year=2016): Stored enrollment_grad_year 2016 is before 2023
- **John Piotti** (Sensei, MIT, year=2019): Stored enrollment_grad_year 2019 is before 2023
- **Kimberly Gallant** (—, Penn, year=2008): Stored enrollment_grad_year 2008 is before 2023
- **Neha Mathur** (—, Penn, year=2014): Stored enrollment_grad_year 2014 is before 2023
- **Reed Ginsberg** (—, Penn, year=2018): Stored enrollment_grad_year 2018 is before 2023
- **Ryan Marschang** (—, Penn, year=2014): Stored enrollment_grad_year 2014 is before 2023
- **Simon Oh** (—, Penn, year=2018): Stored enrollment_grad_year 2018 is before 2023

### Founder audit samples

- Naheem Cadiz: confirm — https://library.syracuse.edu/news/2026-hult-prize-campus-qualifier-winners/
- Noah Merhai: confirm — https://library.syracuse.edu/news/2026-hult-prize-campus-qualifier-winners/
- Sean Chuang: confirm — https://www.linkedin.com/in/sean-sung-en-chuang
- Ruthwick Patthireddy: confirm — https://venturelab.upenn.edu/vip-alumni
- Paolo Fornasini: confirm — https://venturelab.upenn.edu/vip-alumni
- Amogh Chaturvedi: confirm — https://techcrunch.com/2025/09/03/these-20-and-22-year-olds-raised-5m-from-yc-general-catalyst-to-study-online-behavior-using-vision-ai/
- Anish Shanbhag: confirm — https://www.linkedin.com/in/anish-shanbhag
- Justin Zhang: confirm — https://venturelab.upenn.edu/vip-alumni

### Company audit samples

- **Cascade** `funding_round` = `Accelerator|YC Winter 2026` ← https://www.ycombinator.com/companies/cascade (existing_claim)
- **Allus AI** `website` = `https://allus.ai` ← https://allus.ai (existing_claim)
- **Mosaic** `founded_year` = `2024` ← https://www.ycombinator.com/companies/mosaic-2 (yc_page)
- **Ultra** `funding_round` = `Accelerator|YC Summer 2024` ← https://www.ycombinator.com/companies/ultra (existing_claim)
- **Sira** `website` = `https://sira.team` ← https://sira.team (existing_claim)
- **Sonia** `website` = `https://soniahealth.com` ← https://soniahealth.com (existing_claim)
- **Keyframe Labs** `founded_year` = `2025` ← https://www.ycombinator.com/companies/keyframe-labs (yc_page)
- **Forward** `funding_round` = `Accelerator|YC Fall 2026` ← https://www.ycombinator.com/companies/useforward (existing_claim)
- **Read Bean** `website` = `https://readbean.app/` ← https://readbean.app/ (existing_claim)
- **Booko** `funding_round` = `Accelerator|YC Winter 2026` ← https://www.ycombinator.com/companies/booko (existing_claim)

## Conflicts / caveats

- {"type": "starcloud_reminder", "note": "No Starcloud merge in this pass; domain/founder confirmation rule unchanged."}

Press search via DuckDuckGo HTML returned 0 usable hits in this environment; funding/stage gains are mostly YC Accelerator evidence plus company sites.

Reverted weak confirms on audit: Aniket Kittur (LinkedIn slug niki-kittur namesake risk) and Cole Fairchild (2022 Wayback DRF team page does not prove 2023+).
