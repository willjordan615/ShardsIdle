"""
generate_skill_depth_reference.py

Regenerates Documentation/skill_depth_reference.md from backend/data/skills.json.
Run from the project root:
    python3 Documentation/generate_skill_depth_reference.py
"""

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent.parent
SKILLS_PATH = ROOT / 'backend' / 'data' / 'skills.json'
OUTPUT_PATH = ROOT / 'Documentation' / 'skill_depth_reference.md'

skills = json.loads(SKILLS_PATH.read_text())
skill_map = {s['id']: s for s in skills}

def depth(sid, memo={}):
    if sid in memo: return memo[sid]
    s = skill_map.get(sid)
    if not s: return 0
    parents = s.get('parentSkills') or []
    if not parents:
        memo[sid] = 1
        return 1
    d = 1 + max(depth(p) for p in parents)
    memo[sid] = d
    return d

for s in skills:
    depth(s['id'])

by_depth = defaultdict(list)
for s in skills:
    if s.get('intrinsic'):
        continue
    if s['id'].startswith(('proc_', 'use_', 'apply_', 'grant_')):
        continue
    by_depth[depth(s['id'])].append(s)

CAT_GROUPS = {
    'Damage (Physical)': ['DAMAGE_SINGLE', 'DAMAGE_PROC', 'WEAPON_SKILL'],
    'Damage (Magic/AOE)': ['DAMAGE_MAGIC', 'DAMAGE_AOE'],
    'Defense': ['DEFENSE', 'DEFENSE_PROC'],
    'Control': ['CONTROL', 'CONTROL_PROC'],
    'Healing': ['HEALING', 'HEALING_AOE', 'HEALING_PROC'],
    'Support/Buff': ['BUFF', 'RESTORATION', 'UTILITY', 'UTILITY_PROC', 'NO_RESOURCES'],
    'Consumable': ['CONSUMABLE_DAMAGE', 'CONSUMABLE_ESCAPE', 'CONSUMABLE_HEALING', 'CONSUMABLE_RESTORATION'],
}
cat_to_group = {}
for group, cats in CAT_GROUPS.items():
    for c in cats:
        cat_to_group[c] = group

lines = []
lines.append('# Shards Idle — Skill Depth Reference')
lines.append('*Generated from skills.json. Used by AI sessions for content generation — enemy skill pools, bot pools, challenge design.*')
lines.append('*Re-run `generate_skill_depth_reference.py` from the project root after adding new skills.*')
lines.append('')
lines.append('## What Depth Means')
lines.append('')
lines.append('Depth reflects position in the combo discovery tree:')
lines.append('- **Depth 1** — Base skills. No parents. Available from the start.')
lines.append('- **Depth 2** — First-tier combos. Require two depth-1 parents.')
lines.append('- **Depth 3** — Second-tier combos. At least one depth-2 parent.')
lines.append('- **Depth 4+** — Advanced combos. Rare, powerful, thematically significant.')
lines.append('')
lines.append('## Content Generation Guidelines')
lines.append('')
lines.append('### Enemy Skill Pools (by challenge level)')
lines.append('')
lines.append('| Enemy Level Range | Max Depth | Notes |')
lines.append('|---|---|---|')
lines.append('| 1–3 | 1–2 | Grunts and fodder. Depth 2 only on brutes or notable enemies. |')
lines.append('| 4–8 | 2–3 | Veterans and specialists. Depth 3 appropriate for mid-tier enemies. |')
lines.append('| 9–15 | 3–4 | Elite enemies and mini-bosses. Depth 4 reserved for named elites. |')
lines.append('| 16–25 | 4 | Strong named enemies. Depth 4 across the board is acceptable. |')
lines.append('| 26+ | 4–5 | Boss-tier only. Depth 5+ should be rare and intentional. |')
lines.append('| Boss/Unique | 4–6 | Bosses can reach d5–6. Depth 7 only for endgame/lore enemies. |')
lines.append('')
lines.append('### Bot Skill Pools (procedural generation)')
lines.append('')
lines.append('Bots use the same thresholds, applied by bot level:')
lines.append('')
lines.append('| Bot Level | Max Depth Available |')
lines.append('|---|---|')
lines.append('| 1–12 | 1–2 (static bots.json) |')
lines.append('| 13–19 | 2 |')
lines.append('| 20–39 | 3 |')
lines.append('| 40–100 | 4 |')
lines.append('| Never | 5+ (bots never reach d5+) |')
lines.append('')
lines.append('### Thematic Fit by Category')
lines.append('')
lines.append('When assigning skills to an enemy archetype, match category to role:')
lines.append('')
lines.append('| Archetype | Primary Categories | Secondary Categories |')
lines.append('|---|---|---|')
lines.append('| Defender/Tank | DEFENSE, CONTROL (taunt) | BUFF |')
lines.append('| Bruiser/Warrior | DAMAGE_SINGLE, BUFF | CONTROL |')
lines.append('| Assassin/Rogue | DAMAGE_SINGLE, DEFENSE_PROC | CONTROL, UTILITY |')
lines.append('| Mage/Caster | DAMAGE_MAGIC, DAMAGE_AOE | BUFF |')
lines.append('| Support/Healer | HEALING, HEALING_AOE | BUFF, RESTORATION |')
lines.append('| Utility/Shaman | RESTORATION, UTILITY, BUFF | CONTROL |')
lines.append('| Beast/Animal | DAMAGE_SINGLE, DAMAGE_PROC | — |')
lines.append('| Undead/Spirit | CONTROL, DAMAGE_MAGIC | HEALING (self-sustain) |')
lines.append('| Elemental | DAMAGE_AOE, DAMAGE_MAGIC | CONTROL |')
lines.append('')
lines.append('**Note:** CONTROL skills that apply taunt (provoke, goad, jeer, intimidate, incite, infuriate) are all depth 2–4 and should only appear on enemies that are meant to draw aggro.')
lines.append('')
lines.append('---')
lines.append('')
lines.append('## Full Skill Depth Table')
lines.append('')

for d in sorted(by_depth.keys()):
    skill_list = sorted(by_depth[d], key=lambda s: (cat_to_group.get(s['category'], 'Z'), s['id']))
    lines.append(f'### Depth {d}')
    lines.append('')
    lines.append('| Skill ID | Name | Category | Group | Parents |')
    lines.append('|---|---|---|---|---|')
    for s in skill_list:
        parents = s.get('parentSkills') or []
        parent_str = ', '.join(parents) if parents else '—'
        group = cat_to_group.get(s['category'], s['category'])
        lines.append(f"| `{s['id']}` | {s.get('name', s['id'])} | {s['category']} | {group} | {parent_str} |")
    lines.append('')

OUTPUT_PATH.write_text('\n'.join(lines))
print(f'Written to {OUTPUT_PATH}')
for d in sorted(by_depth.keys()):
    print(f'  Depth {d}: {len(by_depth[d])} skills')
