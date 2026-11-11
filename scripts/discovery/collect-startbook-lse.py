"""Public LSE roster -> sanitized review JSON + CSV. Never imports or approves rows.

python scripts/discovery/collect-startbook-lse.py --output /tmp/lse-review.json
For an existing extraction: --venture-cache /tmp/lse-profiles --founder-cache /tmp/lse-founders
Only the public endpoints used by Startbook's frontend are accessed. No auth,
hidden records, contact details, pitch decks or expiring media links are copied.
"""
import argparse
import concurrent.futures
import csv
import hashlib
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone

API = 'https://foundertribe-backend-736248123386.europe-west1.run.app'
ROOT = 'https://startbook.app/events/lse'

def fetch(route):
    with urllib.request.urlopen(API + route, timeout=45) as response:
        return json.load(response)  # Auth errors abort; no login/bypass/retry.

def clean(value):
    return re.sub(r'\s+', ' ', str(value or '')).strip()

def url(value):
    value = clean(value)
    parsed = urllib.parse.urlparse(value)
    return value if parsed.scheme in ('http', 'https') and parsed.hostname else None

def cached(kind, key, directory):
    dest = Path(directory) / (urllib.parse.quote(key, safe='') + '.json')
    if dest.exists():
        return json.loads(dest.read_text())
    record = fetch(f'/{kind}/lse/{urllib.parse.quote(key, safe="")}')
    expected = 'Venture ID' if kind == 'venture' else 'Founder ID'
    if record.get(expected) != key:
        raise ValueError(f'Identity mismatch: {kind} {key}')
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(record, ensure_ascii=False))
    return record

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--venture-cache', default='/tmp/startbook-lse/ventures')
    parser.add_argument('--founder-cache', default='/tmp/startbook-lse/founders')
    parser.add_argument('--roster-cache')
    args = parser.parse_args()
    roster = json.loads(Path(args.roster_cache).read_text()) if args.roster_cache else fetch('/ventures/lse?gridView=true')
    ids = [r['Venture ID'] for r in roster['data']]
    if not ids or len(ids) != len(set(ids)):
        raise ValueError('Missing or duplicate roster IDs; review the response before continuing.')
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        ventures = list(pool.map(lambda key: cached('venture', key, args.venture_cache), ids))
    founder_ids = sorted({f['Founder ID'] for v in ventures for f in v.get('Founder(s)', [])})
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        founders = list(pool.map(lambda key: cached('founder', key, args.founder_cache), founder_ids))
    people = {f['Founder ID']: f for f in founders}
    records = []
    for v in ventures:
        record = {
            'key': v['Venture ID'], 'name': clean(v['Venture Name']),
            'sourceUrl': url(v.get('Profile URL')), 'website': url(v.get('Venture Website')),
            'companyLinkedin': url(v.get('Venture LinkedIn URL')),
            'description': ' '.join(clean(v.get('Headline')).split()[:20]),
            'sectors': v.get('Venture Industry/Sector', []), 'countries': v.get('Venture Countries of Operation', []),
            'reportedStage': clean(v.get('Venture Stage')) or None,
            'fundraisingStatus': clean(v.get('Fundraising Status')) or None,
            'hq': ', '.join(filter(None, [clean(v.get('Venture Office City')), clean(v.get('Venture Office Country'))])) or None,
            'teamSize': clean(v.get('Venture # of Employees')) or None,
            'snapshotSha256': hashlib.sha256(json.dumps(v, sort_keys=True).encode()).hexdigest(),
            'availableEvidenceFields': [k for k in ['Problem', 'Solution', 'Team', 'Traction', 'Competition', 'Business Model', 'Planned Use Of Funds', 'Venture Raising Target'] if clean(v.get(k))],
            'founders': [], 'review': {'status': 'pending', 'ratings': {}, 'notes': ''},
        }
        if not record['sourceUrl'] or not record['sourceUrl'].startswith(ROOT + '/ventures/'):
            raise ValueError('Unexpected public profile URL')
        for member in v.get('Founder(s)', []):
            f = people[member['Founder ID']]
            qualification = clean(f.get('Highest LSE Qualification'))
            # A directory listing or a generic graduation year does not prove
            # enrollment. Keep the year as reported metadata, with status unknown.
            year = clean(f.get('University Graduation Year'))
            record['founders'].append({
                'key': f['Founder ID'], 'name': clean(f['Founder Name']),
                'role': clean(member.get('Job Title')) or 'Founder (directory listing)',
                'sourceUrl': url(f.get('Profile URL')),
                'linkedin': url(f.get('Personal LinkedIn URL')),
                'lseQualification': qualification or None,
                'reportedGraduationYear': int(year) if re.fullmatch(r'(19|20)\d{2}', year) else None,
            })
        records.append(record)
    result = {'sourceUrl': ROOT + '/ventures', 'retrievedAt': datetime.now(timezone.utc).isoformat(), 'expectedCount': len(records), 'companies': records}
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    with output.with_suffix('.csv').open('w', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow(['source_id', 'company', 'founders', 'reported_stage', 'source_url', 'review_status', 'review_notes'])
        for row in records:
            writer.writerow([row['key'], row['name'], '; '.join(f['name'] for f in row['founders']), row['reportedStage'], row['sourceUrl'], 'pending', ''])
    print(json.dumps({'companies': len(records), 'uniquePeople': len(people), 'reviewStatus': 'pending', 'output': str(output)}))

if __name__ == '__main__':
    main()
