#!/usr/bin/env python3
"""Print a human-readable summary of all consumable items and their wired skills."""

import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = SCRIPT_DIR

items = json.load(open(os.path.join(DATA_DIR, 'items.json')))
skills = json.load(open(os.path.join(DATA_DIR, 'skills.json')))
skill_map = {s['id']: s for s in skills}

CONSUMABLE_TYPES = {'potion', 'scroll', 'food', 'consumable', 'herb', 'elixir', 'bomb', 'trap'}

cons = [i for i in items if i.get('type') in CONSUMABLE_TYPES]
cons.sort(key=lambda x: (x.get('type', ''), x.get('tier', 0), x.get('name', '')))

current_type = None
for item in cons:
    item_type = item.get('type', 'unknown').upper()
    if item_type != current_type:
        print(f"\n{'═' * 60}")
        print(f"  {item_type}S")
        print(f"{'═' * 60}")
        current_type = item_type

    tier = item.get('tier', '?')
    name = item.get('name', item['id'])
    gold = item.get('goldValue', '?')
    stackable = '⟳' if item.get('stackable') else '✗'
    sid = item.get('skillID', 'NONE')
    skill = skill_map.get(sid)

    print(f"\n  [{tier}] {name}  (${gold})  stack={stackable}")
    print(f"       id: {item['id']}")
    print(f"       desc: {item.get('description', 'No description.')}")

    if skill:
        cat = skill.get('category', '?')
        effects = skill.get('effects', [])
        parents = skill.get('parentSkills', [])
        effect_strs = []
        for e in effects:
            etype = e.get('type', '?')
            if etype == 'heal':
                effect_strs.append(f"heal {e.get('magnitude', '?')} (scales: {e.get('scalesBy', '?')})")
            elif etype == 'restore_resource':
                effect_strs.append(f"restore {e.get('resource', '?')} {e.get('magnitude', '?')}")
            elif etype == 'apply_debuff':
                effect_strs.append(f"debuff:{e.get('debuff','?')} {e.get('targets','?')} dur={e.get('duration','?')}")
            elif etype == 'apply_buff':
                effect_strs.append(f"buff:{e.get('buff','?')} {e.get('targets','?')} dur={e.get('duration','?')}")
            elif etype == 'cleanse_debuffs':
                effect_strs.append(f"cleanse_debuffs ({e.get('targets','?')})")
            elif etype == 'damage':
                effect_strs.append(f"damage {e.get('magnitude','?')} {e.get('damageType','?')} ({e.get('targets','?')})")
            elif etype == 'utility':
                effect_strs.append(f"utility:{e.get('utility','?')}")
            else:
                effect_strs.append(etype)
        print(f"       skill: {sid} [{cat}]")
        print(f"       effects: {' | '.join(effect_strs) if effect_strs else 'none'}")
        if parents:
            children = [s['id'] for s in skills if sid in s.get('parentSkills', [])]
            print(f"       children: {', '.join(children) if children else 'none'}")
    else:
        print(f"       skill: {sid} *** MISSING ***")

print(f"\n{'═' * 60}")
print(f"  Total: {len(cons)} consumable items")
print(f"{'═' * 60}\n")
