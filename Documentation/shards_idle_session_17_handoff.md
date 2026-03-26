# Shards Idle — Session 17 Handoff

## Work Completed This Session

### Bug Fix — hunters_mark / Unknown Skill Display
Two-part fix for a player whose character had `hunters_mark` saved in their skill slot after it was renamed to `call_target`.

**Backend** (`database.js`): Already correct from a previous session — `SKILL_ID_MIGRATIONS`, `migrateSkillIds()`, and `patchCharacterSkills()` were all present and wired into both `getCharacter` and `getAllCharacters`. The migration fires on character load, remaps the stale ID, and writes back to the DB. Server needed a restart to take effect.

**Frontend** (`character-management.js`): The "graceful fallback" from the previous session handoff had not actually landed in the code. Fixed to show "Skill Unavailable" in grey with a working Equip Skill button instead of a red dead-end. Bad ID logged to console only.

If this pattern recurs in future: check `SKILL_ID_MIGRATIONS` in `database.js` first, then verify the frontend fallback branch (~line 1151 in `character-management.js`).

### Minor Fix — Combo Hint Wording
Combo hints were rendering as "May combine with a utility or defensive or fire or cold..." Changed to "May combine with: utility, defensive, fire, cold" — comma-separated. File: `browse-system.js`.

### Feature — Procedural Bot Generation
Bots above the static cap (level 12) are now generated procedurally at runtime in `browse-system.js`. Generated once per session on first `renderBotsSelection` call, then cached.

**Key constants:**
- `MAX_BOT_LEVEL = 100`
- `BOT_STATIC_CAP = 12`
- `_botsGenerated` — session flag, prevents re-running
- `_botSessionSeed = Date.now() & 0xffffffff` — XORed into all RNG seeds so bots vary per session

**Generation logic:**
- 1–3 bots per level, non-repeating roles at each level
- Stat budget: `220 + 35 * (level - 1)` by role profile with ±10 jitter, absorbed into endurance
- Equipment tier: `Math.min(8, Math.floor((level - 1) / 12))` — tier 8 not until ~level 97
- Skill level: `Math.min(10, Math.floor(level / 10) + 1)` — hits cap at level 90

**Design intent:** High-level bots are naturalistic and noticeably weaker than well-built players. Not optimised.

### Feature — Bot Skill Depth Thresholds
Bot skill pools restructured from flat arrays to tiered `{ minLevel, skills[] }` objects. `pickSkill()` collects all qualifying tiers and picks randomly — pool expands as bots level.

Depth thresholds:
- Level 1–12: static `bots.json` (d1–2 only)
- Level 13–19: d1–2
- Level 20–39: d1–3
- Level 40–100: d1–4
- Never: d5+

Each role has `primary` and `secondary` pool objects. Secondary explicitly excludes the primary pick.

### Documentation — Skill Depth Reference
Two new files in `Documentation/`:

**`skill_depth_reference.md`** — Reference for AI content generation: depth explanation, enemy skill pool guidelines by challenge level, bot thresholds, archetype-to-category mappings, full table of 233 skills with depth/category/parents.

**`generate_skill_depth_reference.py`** — Regenerates the above from `skills.json`. Run from project root:
```
python3 Documentation/generate_skill_depth_reference.py
```
Re-run whenever new skills are added. Static file, does not auto-update.

### Feature — Server Status Indicator
Persistent green/yellow/red dot in the header top bar, left of Settings. Polls `/api/health` every 30s. Green = online (<500ms), Yellow = slow (≥500ms), Red = offline/timeout (5s).

- `index.html` — `#serverStatusIndicator` added to `#headerTopBar`
- `styles.css` — `.server-dot`, `.server-label` with three state classes
- `game-data.js` — polling IIFE at end of file
- `server.js` — health endpoint now does `SELECT 1` against the DB before responding, so latency reflects the full stack. Railway volume/DB slowness will show yellow instead of false green.

### Bug Fix — gear-tooltip.js Syntax Error
Stray `});` after the `touchmove` listener in `addGearCardTooltip()`. Pre-existing, removed. Version bumped to v=5.

### Critical Bug Fix — combat-system.js Restored
**What happened:** At some prior session, `browse-system.js` was created as a split-out of `combat-system.js`, but `combat-system.js` was never cleaned up — it became a stale duplicate of browse-system.js. Later it was overwritten entirely with browse-system.js content and committed. This sat dormant until this session's bot generator added new `const` declarations to browse-system.js, which caused a hard duplicate declaration error in the browser that prevented all JS from running — characters wouldn't load.

**Fix:** Recovered the real `combat-system.js` from git history (`796906e`), decoded it from UTF-16 (PowerShell redirect encoding), stripped the functions that had since moved to browse-system.js (`renderBotsSelection`, `loadPublicCompanions`, `loadPublicCompanionsDebounced`, `_publicCompanionsSearchTimeout`), verified zero conflicts with browse-system.js, and committed.

**What combat-system.js owns:**
- `window.currentState` initialisation (combat, party, idle loop, character creation state)
- `renderChallenges`, `selectChallenge`, `selectCharacterForChallenge`
- `renderPartyFormation`, `renderCurrentParty`
- `addBotToParty`, `removeBotFromParty`, `removeFromParty`
- `confirmPartyAndStart`, `startCombat`
- `showCompanionTab`, `addPublicCompanion`
- `viewCharacterDuringCombat`
- `updateChallengeStatusBanner`, `requestLoopExit`, `cancelLoopExit`

**What browse-system.js owns:**
- `_browsePagination`, `loadBrowseCharacters`, `createBrowseCard`, browse/import/share UI
- `_botsPaging`, `BOT_PAGE_SIZE`, `renderBotsSelection`, `_renderBotsPagination`
- `_generateBots`, `_botRng`, bot generation
- `loadPublicCompanions`, `loadPublicCompanionsDebounced`

**Do not let these overlap again.** If a future session moves functions between these files, remove them from the source file — don't just copy.

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
- Bot page size: 6 (`BOT_PAGE_SIZE` in `browse-system.js`)
- Roster page size: 6
- Player max level: 100
- Bot static cap: 12 (`bots.json`)
- Bot procedural ceiling: 100 (`MAX_BOT_LEVEL` in `browse-system.js`)
- Bot stat budget: `220 + 35 * (level - 1)`
- Bot equipment tier: `Math.min(8, Math.floor((level - 1) / 12))`
