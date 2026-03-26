# Shards Idle — Session 17 Handoff

## Work Completed This Session

### Bug Fix — hunters_mark / Unknown Skill Display
Two-part fix for a player whose character had `hunters_mark` saved in their skill slot after it was renamed to `call_target`.

**Backend** (`database.js`): Already correct from a previous session — `SKILL_ID_MIGRATIONS`, `migrateSkillIds()`, and `patchCharacterSkills()` were all present and wired into both `getCharacter` and `getAllCharacters`. The migration fires on character load, remaps the stale ID, and writes back to the DB. Server needed a restart to take effect.

**Frontend** (`character-management.js`): The "graceful fallback" from the previous session handoff had not actually landed in the code. The corrupt-data `else` branch still showed a red "Unknown Skill" dead end with no action available. Fixed to show "Skill Unavailable" in grey with a working Equip Skill button. Bad ID logged to console only.

If this pattern recurs in future: check `SKILL_ID_MIGRATIONS` in `database.js` first, then verify the frontend fallback branch (~line 1151 in `character-management.js`).

### Minor Fix — Combo Hint Wording
`renderBotsSelection` in `browse-system.js` was rendering combo hints as "May combine with a utility or defensive or fire or cold..." — joining with ` or ` and wrapping in an awkward sentence. Changed to "May combine with: utility, defensive, fire, cold" — comma-separated, no filler grammar.

### Feature — Procedural Bot Generation
Bots above the static cap (level 12, defined in `bots.json`) are now generated procedurally at runtime. Lives entirely in `browse-system.js`.

**Key constants:**
- `MAX_BOT_LEVEL = 100`
- `BOT_STATIC_CAP = 12`
- `_botsGenerated` flag — runs once per session on first `renderBotsSelection` call, then no-ops

**Generation logic:**
- 1–3 bots per level, non-repeating roles at each level
- Stat budget: `220 + 35 * (level - 1)` distributed by role profile with ±10 jitter, absorbed into endurance
- Equipment: role→weapon type map, tier = `Math.min(8, Math.floor((level - 1) / 12))` — tier 8 not until ~level 97
- Skill level: `Math.min(10, Math.floor(level / 10) + 1)` — hits cap at level 90
- Deterministic: `_botRng(seed)` LCG ensures same level always produces same bots
- Names: fixed pool per role, rotated by level — deterministic

**Design intent:** High-level bots are distinctly weaker than players. Naturalistic builds, not optimised. A level 90 bot has good gear and deep skills but will not keep up with a well-built player character.

### Feature — Bot Skill Depth Thresholds
Bot skill pools restructured from flat arrays to tiered `{ minLevel, skills[] }` objects. `pickSkill()` collects all skills from qualifying tiers and picks randomly across them.

Depth thresholds:
- Level 1–12: static `bots.json` (d1–2 only)
- Level 13–19: d1–2
- Level 20–39: d1–3
- Level 40–100: d1–4
- Never: d5+ (bots never reach depth 5 or above)

Each role has `primary` and `secondary` pool objects. Secondary slot explicitly excludes whatever was picked for the primary slot.

### Documentation — Skill Depth Reference
Two new files added to `Documentation/`:

**`skill_depth_reference.md`** — Full reference for AI-assisted content generation. Contains:
- Explanation of what combo-tree depth means
- Enemy skill pool guidelines by challenge level range
- Bot generation thresholds
- Archetype-to-category mappings (Defender→DEFENSE/CONTROL, Mage→DAMAGE_MAGIC/AOE, etc.)
- Complete skill table: all 233 non-intrinsic, non-proc skills with depth, category, group, and parents

**`generate_skill_depth_reference.py`** — Script that regenerates the above from `skills.json`. Run from project root:
```
python3 Documentation/generate_skill_depth_reference.py
```
Re-run whenever new skills are added. The reference file is static — it does not update automatically.

---

## Next Session — Top Priority

No outstanding bugs. Backlog:

- FEAT: Polish Discovery Systems — confirm hint fires correctly with level 3 skill and valid partner
- FEAT: Summoning
- FEAT: Charming
- FEAT: Async Multiplayer Progression
- FEAT: Assignable Character Progression
- FEAT: Unique/Rare Items
- Mobile layout polish (ongoing)
- New challenges (script reviewed, ready to begin implementation)

---

## Carry Forward

### Bugs / Pending Review
- Profile and role labels — verify emoji prefixes are correct after Session 14 git revert
- Emojis in data files — present and acknowledged. Manual removal deferred indefinitely; do not attempt scripted removal.

### Key Constants (unchanged)
- `STAT_SCALE = 300`
- `SUDDEN_DEATH_START = 100`
- Harmony XP: `1 + harmony/750`
- Ambition loot: `baseDropChance × (1 + ambition/500)`
- `untrained_strike` injected at mana < 15%, `costPercent: 0.35`
- Enemy stat scale: `1 + (level - 1) * 0.04`
- Skill combo hint threshold: level >= 3
- Stealth targeting weight: 0.15
- Taunt targeting weight: 4.0
- Browse page size: 8 (party formation companions: 6)
- Bot page size: 6
- Roster page size: 6
- Player max level: 100 (was 45 this session — confirm current value in DB)
- Bot static cap: 12 (bots.json)
- Bot procedural ceiling: 100 (MAX_BOT_LEVEL in browse-system.js)
