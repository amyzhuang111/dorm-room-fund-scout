# Founder and startup verification

Checked 2026-09-27 against YC company pages, company websites, and the GitHub bios that had been turned into startups.
A startup is **confirmed** when a live YC page or the company's own site matches the name.
A founder is **confirmed** when that YC page lists them, or their LinkedIn slug matches their name and a campus is already on the record.
Claims that failed those checks were corrected, cleared, or marked unverified. Nothing was filled in by guessing.

## Counts

- Startups checked: 1663
- Startups confirmed: 1116
- Startups partly verified: 105
- Startups unverified: 442

- Founders checked (people who had a founder role when the audit started): 1635
- Founders confirmed: 1412
- Founders partly verified: 199
- Founders unverified: 20

## Corrections by field

- Website cleared because it was a shared directory or press page: 98
- Website cleared because the domain was the wrong company, a redirect, or spam: 25
- Website updated to a cited URL: 8
- Company name: 5
- Description: 9
- Founder role removed or changed: 4
- Enrollment: 2
- LinkedIn added from a YC page or company about page: 4
- Profile link removed as a likely namesake: 1
- Removed from startup candidates (not a venture): 2

## Examples

- **Coefficient Bio (was Anthropic).** Nathan Frey's GitHub company field is Anthropic, his employer. [ncfrey.com](https://ncfrey.com/) says he co-founded Coefficient Bio, later acquired by Anthropic, after a Penn PhD and an MIT postdoc. The row was renamed, the GitHub URL was removed as the website, and his enrollment was corrected from an inferred recent grad to older alumni.
- **Horizon Robotics.** The same GitHub-bio parser treated Steven Peng's employer as a company he founded. His bio says he works on humanoid robotics at Horizon Robotics and founded PennEAI. His role is now employee, and the row is no longer a startup candidate.
- **Skild AI.** Stored as “Skild AI, CMU” with his faculty page as the website. [skild.ai](https://www.skild.ai/) is the company site. His [CV](https://www.cs.cmu.edu/~dpathak/CV_Pathak.pdf) says Skild AI was founded in 2023 and that his Berkeley PhD ran through August 2019.
- **SyntheticFi.** Stored as “SyntheticFi. Ex-Stripe” with a GitHub profile as the website. The company site is [syntheticfi.com](https://www.syntheticfi.com/about-us); the YC page says founded in 2023 and names Tony Yang, a Berkeley graduate, as cofounder.
- **Hijacked domains.** Capivara (`getcapivara.com`), Chiyo (`nourimama.co`), Maive (`maive.ai` → Ladder), and several others now resolve to unrelated or spam sites. Those websites were cleared rather than left pointing at the wrong company.
- **Wrong Prism.** Alex Liu's YC bio is on [ycombinator.com/companies/prism](https://www.ycombinator.com/companies/prism) (inference). He had been attached to tryprism.com, whose founders are Theo Kitsberg and Axel La Pira. That link was removed.
- **Nexa Labs.** The YC page lists Zarif Azher and Kenneth Chan. Kyle Berkson and Samuel Xie had been stored as founders from a citation of that same page, which does not name them. Their founder links were removed. The website `nexa.farm` is the one on the YC page.
- **Scoop / Jay Kwon.** YC lists LinkedIn `/in/soonjae` for Jay Kwon. GitHub `@soonjae` is named Soonjae Kim and was only attached because the slug matched, so that GitHub link was removed.
- **Keye.** Kept both founder sets, with a note: YC's current Keye (keye.co) lists Rohan Parikh, Conor Brown, and Lalit Lal; Penn Venture Lab's 2022–23 pages list Paolo Fornasini, Niha Gottiparthy, and Ruthwick Patthireddy on a subscription product of the same name.

Directory and cohort URLs (UC Launch, Free Ventures, Thiel press, and similar) were removed from the website field and kept as the source page.

Re-run the fetch with `python3 scripts/audit/verify-founders-startups.py`. Re-apply stored corrections with `python3 scripts/audit/apply-verification.py`.
