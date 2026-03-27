import json
import sys
from collections import defaultdict

path = sys.argv[1] if len(sys.argv) > 1 else 'items.json'

with open(path, encoding='utf-8') as f:
    items = json.load(f)

by_type = defaultdict(list)
for item in items:
    if item.get('consumable'):
        continue
    t = item.get('type', 'unknown')
    by_type[t].append({
        'id':   item.get('id'),
        'name': item.get('name'),
        'tier': item.get('tier'),
    })

for item_type, entries in sorted(by_type.items()):
    print("\n=== %s (%d items) ===" % (item_type.upper(), len(entries)))
    for e in sorted(entries, key=lambda x: (x['tier'] or 0, x['id'])):
        print("  [%s] %s -- %s" % (e['tier'], e['id'], e['name']))
