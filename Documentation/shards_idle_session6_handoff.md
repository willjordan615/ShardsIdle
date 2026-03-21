# Shards Idle — Session 6 Handoff
*Technical state document. Read shards_idle_working_relationship.md first.*

---

## Project Status

Live at: **shardsidle-production.up.railway.app**
Repo: **github.com/willjordan615/ShardsIdle**
Hosting: Railway (Hobby plan, persistent volume at /app/backend/db)

The game is deployed, running, and has been smoke-tested. A combat run completes successfully through D1. The main outstanding issue is that `combatEngine.js` still has ~45 per-turn console.log statements that need to be manually commented out to avoid hitting Railway's 500 logs/second rate limit. The developer knows this and will handle it with find-in-file in their editor.

---

## Repository State

All session 6 changes should be committed. Key files changed this session:

**Backend:**
- `backend/database.js` — DB path moved to `backend/db/game.db` (separate from data/ to avoid volume conflict), `pruneCombatLogs()` + `scheduleCombatLogPruning()` added
- `backend/server.js` — calls `scheduleCombatLogPruning()` on startup, creates `db/` directory if missing
- `backend/routes/combat.js` — `finalResult` bug fixed (was referencing out-of-scope variable in `applyCombatRewards`), manual prune endpoint added, several per-run console.logs silenced
- `backend/routes/admin.js` — 7 new DB admin routes added (characters, snapshots, combat-logs, raw query)
- `backend/routes/character.js` — input sanitization added on character creation and update
- `backend/routes/character-snapshots.js` — buildName/buildDescription sanitization added
- `backend/routes/data.js` — consumables.json dependency removed, consumables derived from items.json filtered by type
- `backend/data/challenges.json` — all XP rewards scaled 20x, loot tiers remapped, elf lore added to 6 challenges
- `backend/data/skills.json` — 9 new skills added (silence, dispel, water_bolt, tidal_grasp, fraying_touch, ward_break, cleanse, undertow, stone_ward). Total: 271
- `backend/data/enemy-types.json` — 25 enemy skill updates, 9 enemies equipped with thematic proc weapons
- `backend/data/items.json` — 7 new thematic proc weapons added. Total: 439
- `backend/package.json` — engines field added (node >=18)

**Frontend:**
- `js/game-data.js` — XP curve changed to `Math.floor(7300 * Math.pow(1.15, level - 1))`, consumables removed from gameData
- `js/combat-log.js` — `finalResult` bug fixed in `applyCombatRewards`
- `js/inventory-system.js` — consumable lookup now uses `gameData.gear` filtered by type
- `js/admin-panel.js` — 3 new admin tabs: Characters, Snapshots, DB query
- `js/admin-panel.js` — admin password changed from `admin123` to `marsh540!vault`
- `index.html` — admin panel updated with 5 tabs (Items, Skills, Characters, Snapshots, DB)

**Deployment:**
- `Dockerfile` — Node 18 Alpine, builds sqlite3 from source with python3-dev/py3-setuptools/make/g++
- `.dockerignore` — excludes node_modules, game.db, backend/db
- `.gitignore` — excludes backend/db/

---

## Architecture

**Single server, all-in-one.** Express serves both the API (`/api/*`) and the static frontend files (index.html, js/, css/) from the same process. `express.static(path.join(__dirname, '..'))` at the server root.

**Database:** SQLite via the `sqlite3` npm package. File lives at `backend/db/game.db` on the persistent Railway volume. Tables: `characters`, `character_snapshots`, `character_progression`, `skill_progression`, `combat_logs`.

**Game data:** All JSON files in `backend/data/`. Loaded at server startup by `loadGameData()` in `routes/data.js`. Served via `/api/data/all`. The frontend attaches everything to `window.gameData` on load.

**No authentication.** Characters are identified by a client-generated UUID stored in localStorage. There is no login system. Anyone with a character ID can modify that character.

**BACKEND_URL** is an empty string in `js/game-data.js` — all API calls use same-origin paths. This is correct and requires no change for the current deployment.

---

## Content State

**23 challenges, D1-D8.** Full narrative arc through the Silver Vale.

| D | Challenges |
|---|---|
| D1 | Grizzlethorn Encampment, Whispering Willow Shrine |
| D2 | Moonlit Ferry Crossing, Vulture's Perch, Blighted Orchard |
| D3 | Stone Tooth Pass, Broken Axle Crossing, Burnt Outpost, Kennels of Wolf's Head |
| D4 | Sealed Excavation, Salt-Wept Beacon, Whispering Athenaeum |
| D5 | Guildhall of Silent Trade, Shrine of the First Oath, Bastion of the Fractured Ward |
| D6 | Ancestral Forge, Watchtower of Northern Lights, Marsh of Broken Oaths |
| D7 | Sunken Sanctum of Aethelgard, Spire of Silent Conviction, Hall of Ancestral Echoes, Stone-Tusk Forward Camp |
| D8 | Gallery of Fractured Light |

**Loot tiers by difficulty:**
- D1: consumables only, no gear drops
- D2: T1 gear (rare)
- D3: T1 standard
- D4: T1-T2
- D5: T2 standard
- D6: T2-T3
- D7: T3 standard, T4 in secret stage drops and secret rewards
- D8: T4 standard rewards, T5 in secret reward table only
- T5-T8: reserved for D9-D16 (not yet built)

**XP curve:** `Math.floor(7300 * Math.pow(1.15, level - 1))`
- L1→L2: 7,300 XP
- L10→L11: 25,680 XP
- L30→L31: 420,300 XP
- L70→L71: 112,583,266 XP
- L92→L93: ~2.4 billion XP
- Game designed to be beatable at level 70-90. Level 100 is endgame grind.

**XP rewards:** D1 = 6,000-12,000/run. D8 = 18,000-36,000/run. D9-D16 should scale to 136,000-850,000/run.

---

## Narrative State (end of D8)

The player has assembled the complete picture of what is wrong with the Silver Vale.

**The Fraying** is the accumulated residue of two centuries of broken oaths — every dissolved pact, abandoned ward, and shattered covenant has been rotting into the magical substrate. The Verdant Word's dissolution was the largest single Fraying event.

**The Architect of Decay** is the Fraying given intent and coherence. It is not a new entity — it grew inside the Order's broken promises over two hundred years. Its sigil is identified in the Spire's restricted vault. It has three named agents; the player has encountered fragments of its influence throughout D1-D8 without knowing what they were looking at.

**The water spirit** has been moving toward the Spire of Silent Conviction for three hundred years. Thrain's complete report names the destination. The Tidebound are its advance force, not an independent faction.

**The Elves** sealed the Gallery of Fractured Light bridges four days after the dissolution — before the outside world understood the Order was gone. They were watching through the Ward-Core memory network. Elara is split: the Preservation Core (merged with the First Tree in the Gallery) and the Oathbound Fragment (maintaining the halfling pact alone at the Shrine of the First Oath for fifty years).

**The succession crisis** has a resolution: High Judge Thorgrim named a third heir in the Hall of Ancestral Echoes. The heir is a merchant's grandchild. Their records are in the Guildhall. Guildmaster Vane knows and sealed the gates partly to suppress this.

**The unfinished vote** in the Spire was three-to-two to expose the Architect's infiltration of the Order. The dissolution interrupted it. The vote still exists. What completing it does is the D15 narrative event.

---

## D9-D16 Brief

A prompt for Qwen or another model to generate D9-D16 content was written at the end of Session 6. It covers:
- Full world state entering D9
- XP curve and reward scaling targets
- Gear tier expectations per difficulty
- Narrative targets for each act
- Format requirements matching D1-D8 style

Ask the developer for this prompt — it was the last substantial output before the handoff.

---

## Known Issues / Pending Work

**Console logging** — combatEngine.js has ~45 per-turn console.log statements that will hit Railway's 500 logs/second rate limit under active play. The developer will comment these out manually using find-in-file. Tags to silence are listed in the session transcript. Do not touch combatEngine.js for this — the developer is handling it.

**Admin panel** — newly added this session (tilde key + `marsh540!vault`). Three new tabs: Characters (list/delete), Snapshots (list/delete share codes), DB (SELECT query + clear combat logs). This has not been playtested yet.

**combat_logs pruning** — `scheduleCombatLogPruning()` runs on startup and every 6 hours. Strips full turn data from logs older than 24h, deletes logs older than 7 days. Working as of deployment.

**combatEngine.js was damaged** — The first python script in Session 6 attempted to silence console.logs but mangled the filter callback block around line 130. The developer's local copy should be intact. When applying session 6 changes, do NOT use the combatEngine.js from this session's outputs — use the local copy and make logging changes manually as described above.

**Stale data files** — the following files in `backend/data/` are development artifacts and should be deleted before the repo gets cluttered: `challenge_sanctum.json`, `challenge_sanctum_final.json`, `challenge_stonetooth.json`, `challenge_stonetooth_final.json`, `challenge_stonetooth_v2.json`, `enemy_sanctum_final.json`, `enemy_sanctum_validated.json`, `enemy_stonetooth_final.json`, `enemy_stonetooth_validated.json`. They are not referenced by anything.

**masteryUnlockAt** — thresholds defined on skills but engine ignores them.

**Barrier as HP absorption** — currently a damage reduction multiplier, not a true HP pool.

**races.json** — only `intrinsicSkills` remains. Starting skills are player choice, not race-determined. Human: prayer, Dwarf: restore_stam_minor, Elf: sense, Orc: bloodlust, Halfling: stalk.

---

## Cross-Challenge Item Chain

Items that gate secret paths in later challenges. Players must carry these manually between runs.

| Item | Drops In | Gates |
|---|---|---|
| silver_halfling_coin | Moonlit Ferry | — (lore item) |
| oath_stone | Moonlit Ferry | Salt-Wept Beacon secret, Gallery secret |
| verdant_word_seal | Whispering Willow Shrine | Sealed Excavation secret, Watchtower secret, Marsh secret |
| vulture_company_ledger | Vulture's Perch | Guildhall secret, Stone-Tusk secret |
| loyalist_seal | Stone Tooth Pass | Broken Axle Crossing secret |
| royal_guard_insignia | Burnt Outpost / Kennels | — (lore item) |
| ironvein_signet | Stone Tooth Pass | Ancestral Forge secret, Hall of Ancestral Echoes secret |
| guild_seal | Guildhall / Bastion | — (lore item) |
| athenaeum_scroll | Whispering Athenaeum | Marsh of Broken Oaths secret |
| monitoring_crystal | Watchtower / Marsh | Spire of Silent Conviction secret |
| ancestral_verdict | Hall of Ancestral Echoes | seeds D9+ |
| unpaid_ledger | Stone-Tusk Forward Camp | Guildhall D9+ |
| seed_of_first_tree | Gallery of Fractured Light | affects D9+ Sanctum content |
| moon_touched_apple | Blighted Orchard | — (lore item) |

---

## Thematic Proc Weapons (Enemy-Only)

These exist in items.json but cannot be found in loot tables — they are equipped on specific enemies only.

| Item | Enemy | Proc | Chance |
|---|---|---|---|
| weapon_lyra_current | beacon_lyra_fragment | proc_chilled | 20% |
| weapon_tidebound_harpoon | high_chanter_malacor, watch_commander_thrain | proc_electrified | 25% |
| weapon_fraying_natural | gallery_fraying_touched | proc_shadowed | 18% |
| weapon_ashen_fist | captain_ignis, ashen_brute | proc_burn | 12% |
| weapon_alpha_bite | the_alpha | proc_disorient | 15% |
| weapon_ancestral_hammer | high_judge_thorgrim | proc_stun | 20% |
| weapon_purifying_touch | elara_preservation_core | proc_silence | 30% |

---

## Session Transcripts

Previous sessions are logged at `/mnt/transcripts/`. A catalog is in `journal.txt` in the same directory. Session 6 transcript will be added there when this session closes.

The working relationship document is at `/mnt/user-data/uploads/shards_idle_working_relationship.md`. It should be provided to every new session.
