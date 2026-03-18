# Shards Idle — Technical Context
*Current as of Session 4. Regenerate this document when the codebase meaningfully changes.*
*Read the working relationship document before this one.*

---

## What This Project Is

Shards Idle is a browser-based idle RPG. Players create characters, form parties, and send them into challenges. Combat is fully autonomous — characters fight using AI-driven skill selection based on their assigned profile. Players watch the combat log, manage their roster, share characters with other players, and import interesting builds they find.

No real-time player input during combat. Everything is data-driven: skills, statuses, enemies, and challenges are defined in JSON files. The combat engine reads those files and runs the simulation.

---

## Stack

- **Frontend:** Vanilla JS, HTML5, CSS3 — no framework, no build system
- **Backend:** Node.js/Express, SQLite via `sqlite3` (native addon — requires C++ build tools)
- **Single-page frontend** — `index.html` is the entire UI
- **BACKEND_URL** is `''` (empty string) — all API calls are relative, works on any host without config changes

---

## File Structure

```
backend/
  server.js                      — Express server, route registration
  combatEngine.js                — Combat simulation (~2500 lines, core system)
  StatusEngine.js                — Status effect processing
  database.js                    — SQLite schema + all DB functions
  routes/
    character.js                 — Character CRUD + PATCH aiProfile
    character-snapshots.js       — Export, import, browse
    combat.js                    — POST /api/combat/start, GET history
    data.js                      — GET /api/data/all (serves all JSON to frontend)
    admin.js                     — Admin editor endpoints
  data/
    skills.json                  — 255 skills
    statuses.json                — 61 status effects
    enemy-types.json             — 7 enemy types
    items.json                   — 416 items
    races.json                   — 5 races
    challenges.json              — 4 challenges (placeholders)
    consumables.json             — Consumable definitions
    bots.json                    — Bot character definitions

js/
  character-management.js        — Character creation, roster, detail screen, combat history
  combat-system.js               — Frontend combat initiation, idle loop
  combat-log.js                  — Combat log playback, pause, stats panel
  browse-system.js               — Browse/import character cards
  gear-tooltip.js                — Equipment tooltip rendering
  inventory-system.js            — Inventory management
  game-data.js                   — Frontend data loading (defines BACKEND_URL)
  ui-helpers.js                  — Shared UI utilities

index.html                       — Entire frontend
css/styles.css                   — All styles
admin-editor.html                — Admin editor (challenges + enemies only)
```

---

## Equipment Slots

The six valid equipment slots are: `mainHand`, `offHand`, `head`, `chest`, `accessory1`, `accessory2`. No legs, hands, or feet slots exist. Items not fitting mainHand/offHand/head/chest are accessories unless consumable.

Armor is summed from: `head`, `chest`, `offHand`, `accessory1`, `accessory2`.
Stat bonuses are summed from all six slots.

---

## The Data Layer

Everything flows from JSON files. Adding a new skill, status, or enemy means editing JSON — not the engine.

**Reference chain — always verify when editing data files:**

`skills.json` references status IDs in effects. Those IDs must exist in `statuses.json` or the effect silently fails.

`statuses.json` effects use specific field names the StatusEngine knows how to process. Unknown field names silently do nothing.

`enemy-types.json` references item IDs in `equipment`. Both object format `{ mainHand: "..." }` and array format `["fangs_tiny"]` are handled.

`items.json` references skill IDs in `onhit_skillid_N` fields. Those must exist in `skills.json`.

`challenges.json` references enemy type IDs. Those must exist in `enemy-types.json`.

**Valid stat names** (used in statuses.json `statBoost`/`statReduction`): `conviction`, `endurance`, `ambition`, `harmony`. No others.

---

## Combat Engine Architecture

`combatEngine.js` runs synchronously — takes party snapshots and a challenge definition, returns a full combat log.

### Key Methods

- `runCombat(partySnapshots, challenge)` — entry point
- `resolveAction(action, actor, players, enemies)` — resolves one skill use end-to-end
- `calculateDamage(actor, skill, target, isCrit, skillLevel)` — 9-step damage pipeline
- `applySkillEffects(skill, actor, target, healTarget, allCombatants)` — applies all non-damage effects
- `triggerWeaponProcs(actor, target, skillLevel)` — weapon item on-hit procs
- `triggerStatusProcs(actor, target, skillLevel)` — status buff on-hit procs
- `selectPlayerAction(character, players, enemies, context)` — scored candidate AI
- `selectEnemyAction(enemy, players, enemies, context)` — profile-driven enemy AI
- `regenerateResources(combatant)` — stamina + mana regen per round

### Armor Formula

```
reduction = armorValue / (armorValue + 16)
```

armor=6 → 27% reduction. armor=16 → 50%. armor=30 → 65%. Never reaches 100%.

### Unified Resolution Path

AOE is determined by effect `targets` field, not category name. `applySkillEffects` is passed `players.concat(enemies)` as `allCombatants`. The `all_allies` buff filter uses `actor.type` to find the correct side, so enemy AOE buffs hit enemies and player AOE buffs hit players.

### Effect Types in applySkillEffects

`damage`, `heal`, `lifetap`, `restore_resource`, `restore_pool`, `apply_buff`, `apply_debuff`, `cleanse`, `dispel`

### Lifedrain Mechanics

Four status fields added:

- `healAttackerOnHit: fraction` — on target's debuff; heals attacker for `fraction * damage * harmonyScale` on each hit
- `sourceHealPerTurn: "expression"` — ticks damage AND heals the combatant stored in `activeStatus.sourceId`
- `onHitProcLifetap: { chance, fraction }` — on being hit, transfers `fraction * damage` from attacker to target
- `lifetap` effect type — heals actor for `target.maxHP * magnitude * harmonyScale`

`sourceId` is stamped onto newly applied debuffs by `applySkillEffects` using `actor.id`.

### AI Profiles

**Player profiles:** `balanced`, `aggressive`, `cautious`, `support`, `disruptor`, `opportunist`
**Enemy profiles:** `aggressive`, `tactical`, `berserker`, `support`

DEFENSE skill scoring: penalised to 0.6x when enemies outnumber the party. HP threshold for buff-window bonus raised to 75%. Enemies return budget ratios of 1.0 (no cross-stage conservation).

Enemies check for critically low resources (<15% both stamina and mana) and use RESTORATION skills. RESTORATION is included in `usableSkills`.

---

## Status System (61 statuses)

Three new statuses: `siphon_ward` (healAttackerOnHit), `life_leech` (sourceHealPerTurn + damagePerTurn), `cursed_blood` (onHitProcLifetap).

**Valid `effects` fields:**
```
damagePerTurn: "magnitude * N"
healPerTurn: "magnitude * N"
manaDrainPerTurn: "magnitude * N"
sourceHealPerTurn: "magnitude * N"
statReduction: { statName: fraction }
statBoost: { statName: fraction }
skillDelayMultiplier: N
incomingDamageMultiplier: N
staminaRegenMultiplier: N
manaRegenMultiplier: N
blockSkillCostType: "mana"|"stamina"
skipTurn: true
```

**Top-level fields (not inside effects{}):**
`onHitProc`, `onHitProcLifetap`, `counterProc`, `targetingWeight`, `stackingBehaviour`, `maxMagnitude`, `healAttackerOnHit`

---

## Skill System (255 skills)

### Heal Effects
All heals must use `scalesBy: "harmony"` and `basePower: 0`.
```
restoreAmount = floor(maxHP * magnitude * (1 + harmony/300))
```
Exception: consumable potions use `scalesBy: "basePower"` for flat stat-independent restores.

### Consumable Belt
Quantities decrement in `resolveAction` when a belt skill fires. `consumables` is included in the result participants snapshot.

### New Skills
`lifetap` (starter), `apply_siphon_ward`, `apply_life_leech`, `apply_cursed_blood` — tree rooted at lifetap.

---

## Enemy Types (7)

| ID | Weapon | AI Profile | Notes |
|---|---|---|---|
| `goblin_scout` | goblin_dagger | aggressive | Basic melee |
| `goblin_archer` | goblin_bow | tactical | Ranged |
| `spider_small` | fangs_tiny | aggressive | Array equipment format |
| `spider_large` | fangs_small | berserker | Array equipment format |
| `orc_warrior` | dogchopper | berserker | Heavy melee |
| `orc_shaman` | shaman_totem | support | Heals, buffs, produces flame |
| `dragon_ancient` | fangs_great | tactical | Large fang weapon |

---

## Database

### ⚠️ HOSTING CRITICAL — combat_logs growth — DO NOT REMOVE THIS NOTE

The `combat_logs` table stores the full `runCombat()` output for every fight as a JSON blob — every turn, every damage number, every status tick. A long fight can be several hundred kilobytes. `getCombatLogs` caps retrieval at 50 per character but does **not** delete rows.

**Before hosting publicly, implement a periodic cleanup job** that prunes old logs. A nightly job is sufficient:
```sql
DELETE FROM combat_logs WHERE createdAt < (strftime('%s','now') - 2592000) * 1000;
```
(2592000 seconds = 30 days. Adjust threshold as needed.) Without this the database grows without bound.

### Tables

**characters** — full character state including skills, equipment, consumables, inventory, combatStats, aiProfile.
**character_snapshots** — exported/imported character references.
**combat_logs** — full simulation output. Columns: `id`, `challengeID`, `partyID`, `startTime`, `result`, `totalTurns`, `log` (JSON), `createdAt`.

Bot characters skip DB save intentionally.

---

## Combat Log Persistence

All outcomes persist: victory, defeat, and retreat all call `db.saveCombatLog`. `shouldPersist` is `true` on all result types.

Two history endpoints:
- `GET /api/combat/history/:characterID` — full logs (used for replay)
- `GET /api/combat/history/:characterID/summary` — lightweight summaries (used for history modal)

Full replay: fetch `/api/combat/:combatID`, pass the `log` field to `displayCombatLog()`.

---

## Frontend Combat Log

**Pause:** `window.combatPaused` flag. `sleep()` polls it in 100ms ticks.
**Auto-scroll:** `_scrollLogToBottom()` respects `_userScrolledUp` flag. "↓ Latest" button appears when user scrolls up.
**Stats panel:** Per-character damage dealt, damage taken, heals. Updated before `updateHealthBars` so heal deltas are correct.

---

## Character Detail Screen

**Combat History** — button top-right next to character name. Pre-fetches summary on detail load. Modal shows up to 20 recent combats. Per-entry buttons:
- **📄 View Log** — inline text expansion, toggles
- **▶ Replay** — closes modal, switches to combat log screen, full animated playback

---

## XP and Rewards

`applyCombatRewards` runs on all outcomes. Null rewards (defeat/retreat) are substituted with empty object so skill XP still processes. `currentState.currentParty` synced after rewards: skills, experience, level, consumables.

---

## Pending Work

1. **Race bonus skills** — all 5 races have empty `bonusSkills` arrays
2. **`masteryUnlockAt` engine hook** — 20 skills have thresholds defined, engine doesn't check them
3. **Barrier as HP absorption pool** — currently `incomingDamageMultiplier: 0.6`, should absorb damage
4. **Admin editor coverage** — skills and races not yet editable
5. **Challenge pass** — challenges are placeholders, not balanced
6. **Inventory pass** — display, equipping, item management UI incomplete
7. **combat_logs cleanup routine** — required before public hosting (see Database section)

---

## Data Integrity Rules

- All status IDs referenced in skill effects must exist in `statuses.json`
- All stat names in status effects must be: `conviction`, `endurance`, `ambition`, `harmony`
- Heal effects must use `scalesBy: "harmony"` and `basePower: 0` (consumables excepted)
- Proc skill effects have `chance: 1.0` — roll happens at weapon/status level
- Stun/sleep/freeze chances calibrated 25-55% by skill depth
- AOE skills must have `targets: "all_enemies"` or `targets: "all_allies"` on their effects
- `dmg_type_N` fields should be lowercase
