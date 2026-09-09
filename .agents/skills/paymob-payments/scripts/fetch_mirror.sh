#!/bin/bash
# Re-fetch the Paymob docs mirror from developers.paymob.com (Theneo-hosted).
# Usage: ./fetch_mirror.sh /tmp/paymob_pages
# Then:  python3 convert.py "<skill>/references/docs" && python3 postpass.py "<skill>/references/docs"
set -euo pipefail
WORK="${1:-/tmp/paymob_pages}"; mkdir -p "$WORK/raw"; cd "$WORK"
UA="Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"

# 1. Landing page -> __NEXT_DATA__ (buildId + full menu/sectionMap)
curl -s "https://developers.paymob.com/paymob-docs" -H "User-Agent: $UA" --compressed -o landing.html
python3 - <<'PY'
import re, json
html = open('landing.html', encoding='utf-8').read()
data = json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S).group(1))
open('next_data.json','w').write(json.dumps(data))
print("buildId:", data['buildId'])
open('buildid.txt','w').write(data['buildId'])
d = data['props']['pageProps']['documents']['data']
dm = d['documentMenu']
sec2tab = {sid: t['slug'] for t in dm['tabs'] for sid in t['sectionId']}
pages = []
def walk(items, prefix, tab, crumbs):
    for it in items:
        slug = it.get('slug'); path = f"{prefix}/{slug}" if prefix else slug
        t = sec2tab.get(it.get('sectionId'), tab)
        pages.append({"path": path, "name": (it.get('name') or '').strip(), "tab": t,
                      "crumbs": crumbs + [(it.get('name') or '').strip()],
                      "isHeader": bool(it.get('isHeader'))})
        walk(it.get('subItems') or [], path, t, crumbs + [(it.get('name') or '').strip()])
walk(dm['items'], "", "documentation", [])
json.dump(pages, open('inventory.json','w'), indent=1)
with open('fetchlist.txt','w') as f:
    for p in pages:
        q = "&".join(f"path={s}" for s in ['paymob-docs'] + p['path'].split('/'))
        f.write(p['path'].replace('/','__') + "\t" + q + "\n")
print("pages:", len(pages))
PY

# 2. Per-page data JSONs (~800KB each) via the Next.js data route
BUILD=$(cat buildid.txt)
B="https://developers.paymob.com/_next/data/$BUILD/customdomain.json"
while IFS=$'\t' read -r fn q; do
  [ -s "raw/$fn.json" ] && continue
  for i in 1 2 3; do
    code=$(curl -s "$B?$q&xcustomdomain=developers.paymob.com" -H "User-Agent: $UA" --compressed -o "raw/$fn.json" -w "%{http_code}")
    [ "$code" = "200" ] && [ -s "raw/$fn.json" ] && { echo "OK $fn"; break; }
    sleep $((i*2))
  done
done < fetchlist.txt
echo "done: $(ls raw | wc -l) pages in $WORK/raw"
