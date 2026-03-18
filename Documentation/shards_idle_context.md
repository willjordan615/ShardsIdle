# Shards Idle — Project Context
*Single authoritative reference. Ignore any other documentation files if they conflict with this one.*

---

## Read This First — How We Work

This is an active, ongoing development project with an established codebase. You are not being asked to design or architect anything. The system exists, it works, and your job is to work within it.

**Do not suggest architectural changes.** If you think something could be structured differently, keep it to yourself unless directly asked. The developer has made deliberate decisions about how this system works. Respect them.

**Do not start coding without confirmation.** When a task involves a design decision with meaningful alternatives — different data structures, different approaches to a feature, anything where "I could do this a few different ways" — describe what you're thinking and wait for confirmation before writing a single line of code. This is not optional.

**Do not produce unprompted fixes.** If you notice something that looks wrong while working on something else, mention it briefly and move on. Do not start fixing things that weren't asked about.

**Ask one question at a time.** If you need clarification, ask the most important question only. Don't produce a list of questions.

**Match the existing code style.** Read the files before writing. The project has a consistent style — match it exactly.

**Be precise about strong effects.** Any skill that skips a turn (stun, sleep, freeze) needs an explicitly calibrated chance value. Never leave these at high default values.

**The developer's instincts are good.** When they push back on an approach, they're right. Listen first.

---

## What This Project Is

Shards Idle is a browser-based idle RPG. Players create characters, form parties, and send them into challenges. Combat is fully autonomous — characters fight on their own using AI-driven skill selection. Players watch the combat log, manage their roster, share characters with other players, and import interesting builds they find.

There is no real-time player input during combat. Everything is data-driven: skills, statuses, enemies, and challenges are all defined in JSON files. The combat engine reads those files and runs the simulation.

The project is well into development. The combat engine, status system, skill web, character management, sharing system, and AI profiles are all implemented and working. New features are added incrementally on top of this foundation.

---

## Stack

- **Frontend:** Vanilla JS, HTML5, CSS3 — no framework, no build system
- **Backend:** Node.js/Express, SQLite via better-sqlite3
- **Direct file serving** — index.html is the entire frontend

---

## File Structure

```
backend/
  server.js                  — Express server, route registration
  combatEngine.js            — Combat simulation (the core system)
  StatusEngine.js            — Status effect processing
  database.js                — SQLite schema + all DB functions
  routes/
    character.js             — Character CRUD + PATCH aiProfile
    character-snapshots.js   — Export, import, browse
    combat.js                — POST /api/combat/start
    data.js                  — GET /api/data/all (serves all JSON data)
    admin.js                 — Admin editor endpoints
  data/
    skills.json              — 251 skills
    statuses.json            — 58 status effects
    enemy-types.json         — Enemy definitions with AI profiles
    items.json               — 415 items including weapons, armor, consumables
    races.json               — Player races
    challenges.json          — Challenge/dungeon definitions
    consumables.json         — Consumable item definitions
    bots.json                — Bot character definitions

js/
  character-management.js    — Character creation, roster, detail screen
  combat-system.js           — Frontend combat initiation and log display
  combat-log.js              — Combat log rendering
  browse-system.js           — Browse/import character cards
  gear-tooltip.js            — Equipment tooltip rendering
  inventory-system.js        — Inventory management
  game-data.js               — Frontend data loading
  ui-helpers.js              — Shared UI utilities

index.html                   — Entire frontend (single file)
css/styles.css               — All styles
admin-editor.html            — Admin editor interface
```

---

## The Data Layer

This is the most important thing to understand about how the project works.

**Everything flows from JSON files.** The combat engine doesn't have hardcoded skill logic, status logic, or enemy behaviour. It reads definitions from the data files and executes them. Adding a new skill, status, or enemy means editing JSON — not the engine.

**The relationship between files:**

`skills.json` references status IDs in its effects (e.g. `"debuff": "poison"`). Those IDs must exist in `statuses.json`. If they don't, the StatusEngine logs a warning and the effect silently fails.

`statuses.json` defines what each status does mechanically. The `effects` object uses specific field names that the StatusEngine knows how to process. Using an unknown field name means it silently does nothing.

`enemy-types.json` references item IDs in its `equipment` array. Those IDs must exist in `items.json`. Enemies get their weapons from items.json just like players do.

`items.json` references skill IDs in `onhit_skillid_N` fields. Those skill IDs must exist in `skills.json`.

`challenges.json` references enemy type IDs. Those must exist in `enemy-types.json`.

**Valid stat names** (used in statuses.json statBoost/statReduction): `conviction`, `endurance`, `ambition`, `harmony`. No others exist.

**When editing data files, always verify the reference chain is intact.**

---

## The Combat Engine

`combatEngine.js` is the core of the project. It runs synchronously — takes party snapshots and a challenge definition, returns a full combat log with every action, damage value, and status change.

**You should understand these methods before touching the engine:**

- `runCombat(partySnapshots, challenge)` — entry point, builds combatants, runs all stages
- `resolveAction(action, actor, players, enemies)` — resolves one skill use end-to-end
- `calculateDamage(actor, skill, target, isCrit, skillLevel)` — 9-step damage pipeline
- `applySkillEffects(skill, actor, target)` — applies all non-damage effects (heal, buff, debuff, cleanse, dispel)
- `triggerWeaponProcs(actor, target, skillLevel)` — fires weapon item on-hit procs
- `triggerStatusProcs(actor, target, skillLevel)` — fires status buff on-hit procs (onHitProc field)
- `selectPlayerAction(character, players, enemies)` — scored candidate AI for players
- `selectEnemyAction(enemy, players, enemies)` — profile-driven AI for enemies
- `_weightedRandomTarget(pool)` — weighted random targeting used by enemy AI
- `regenerateResources(combatant)` — stamina + mana regen per round

**Effect types handled in applySkillEffects:**
`damage`, `heal`, `restore_resource`, `restore_pool`, `apply_buff`, `apply_debuff`, `cleanse`, `dispel`

**How status effects integrate with the combat loop:**

The StatusEngine's `processStatusEffects()` is called in multiple places:
1. Per-round loop — applies DoT damage, HoT healing, mana drain, stat deltas (reversed after each turn)
2. `resolveAction` — reads `skillDelayMultiplier` from actor's statuses to adjust action timing
3. `calculateDamage` — reads `incomingDamageMultiplier` from target's statuses
4. `regenerateResources` — reads `staminaRegenMultiplier` and `manaRegenMultiplier`
5. `hasResources` — calls `isSkillBlocked()` to check `blockSkillCostType` (silence, exhaustion)

**Special status fields read directly by the engine (not by StatusEngine):**
- `onHitProc: { skillId, chance }` — read by `triggerStatusProcs`
- `counterProc: { skillId, chance }` — read by the counter_ready hook in `resolveAction`
- `targetingWeight` — read by `_weightedRandomTarget`
- `stackingBehaviour` + `maxMagnitude` — read by `StatusEngine.applyStatus`

---

## The Status System

58 status effects. Every one has real mechanical effects — nothing is decorative.

**Valid effect fields in `effects: {}`:**
```
damagePerTurn: "magnitude * N"
healPerTurn: "magnitude * N"
manaDrainPerTurn: "magnitude * N"
statReduction: { statName: fraction }
statBoost: { statName: fraction }
skillDelayMultiplier: N        (>1 = slower, <1 = faster)
incomingDamageMultiplier: N    (>1 = more damage taken, <1 = less)
staminaRegenMultiplier: N
manaRegenMultiplier: N
blockSkillCostType: "mana"|"stamina"
skipTurn: true
```

**Status types:** `buff` or `debuff` — this determines which UI pip style is shown and which cleanse/dispel effects target it.

**Tiered poison:** `poison_weak` → `poison` → `poison_strong` → `poison_deadly` (escalating damage and stat penalties)

**deep_wound** uses `stackingBehaviour: "escalate"` — reapplication increases magnitude up to `maxMagnitude: 5` rather than just extending duration.

**counter_ready** uses `counterProc: { skillId, chance }` — when the buffed combatant takes damage, the counter fires and the status removes itself.

---

## The Skill System

251 skills across 6 depth tiers. Skills are discovered through combat when parent skills are used (the `checkChildSkillProc` system).

**Skill categories that the AI candidate system evaluates:**
`DAMAGE_SINGLE`, `DAMAGE_AOE`, `DAMAGE_MAGIC`, `DAMAGE_AOE_MAGIC`, `HEALING`, `HEALING_AOE`, `CONTROL`, `BUFF`, `DEFENSE`, `UTILITY`, `RESTORATION`, `CONSUMABLE_HEALING`, `CONSUMABLE_RESTORATION`, `CONSUMABLE_DAMAGE`

**Categories the AI ignores:**
`CONSUMABLE_ESCAPE`, `UTILITY_PROC`, `WEAPON_SKILL`, `PROGRESSION`, `DAMAGE_PROC`, `CONTROL_PROC`

**Proc skills** (`DAMAGE_PROC` prefix `proc_`): Always have `chance: 1.0` on their effect — the roll happens at the weapon or status level. They apply debuffs, not damage directly (unless the skill has an explicit `damage` effect).

**Heal effects** must have both `scalesBy` (harmony/conviction/endurance/basePower) and `magnitude` (fraction of maxHP). Missing either means the heal silently restores 0.

**Starters:** Only `isStarterSkill: true` skills should appear in character creation. ⚠️ The UI currently shows all 74 parentless skills — this filter is pending.

---

## AI Profiles

**Player profiles:** `balanced`, `aggressive`, `cautious`, `support`, `disruptor`, `opportunist`

**Enemy profiles:** `aggressive`, `tactical`, `berserker`, `support`

Profiles influence the scored candidate system for players and the target selection logic for enemies. Berserker is notably resistant to taunt (only honours it 40% of the time) and ignores stealth weighting.

aiProfile flows from character creation → DB → party snapshot → combat engine. The player character object in `runCombat` includes `aiProfile` directly.

---

## What's Done

- Combat engine with full damage pipeline, weapon variance, resistances, armor
- Status system (58 statuses) fully wired end-to-end
- Skill web (251 skills) with discovery system, proc chains, child unlocks
- AI profiles for players and enemies
- Weighted targeting system (taunt, stealth, marked, provoked)
- Cleanse and dispel effect types
- On-hit proc system for both weapon items and status buffs
- Sleep break-on-damage
- Counter_ready retaliatory proc system
- Tiered poison statuses and fang weapon family for enemies
- Sense skill uses dispel to counter stealth
- Character sharing, export, import, browse system
- CSS theming with settings modal
- Admin editor for challenges and enemies

---

## What's Pending

1. **Character creation skill filter** — show only `isStarterSkill: true` skills (~15), not all 74 parentless skills
2. **Race bonus skills** — all races have empty `bonusSkills` arrays
3. **masteryUnlockAt engine hook** — 20 skills have thresholds, engine doesn't check them yet
4. **Barrier as HP absorption pool** — currently just `incomingDamageMultiplier: 0.6`, should be a true absorbing shield
5. **Admin editor** — skills and races not yet editable
6. **Qwen Pass 3** — more skills targeting cross-branch connectors and utility/healing depth
7. **Balance pass** — AI and skills are now stable enough for this
8. **New challenges and enemies** — nothing blocking this
9. **Terrain effects** — no terrain system exists, intentionally deferred

---

## Session 3 Files — Deliver These Before Anything Else

The outputs filesystem broke at the end of session 3. All changes are saved correctly in the project. Copy these to `/mnt/user-data/outputs/` and present them for download before starting any new work:

```
backend/combatEngine.js
backend/database.js
backend/StatusEngine.js
backend/routes/character.js
backend/routes/character-snapshots.js
backend/data/statuses.json
backend/data/skills.json
backend/data/items.json
backend/data/enemy-types.json
js/character-management.js
js/browse-system.js
js/combat-system.js
index.html
```
