# Shards Idle — Technical Context
*Current as of Session 5. Regenerate this document when the codebase meaningfully changes.*
*Read the working relationship document before this one.*

---

## What This Project Is

Shards Idle is a browser-based idle RPG. Players create characters, form parties, and send them into challenges. Combat is fully autonomous — characters fight using AI-driven skill selection based on their assigned profile. Players watch the combat log, manage their roster, share characters with other players, and import interesting builds they find.

No real-time player input during combat. Everything is data-driven: skills, statuses, enemies, and challenges are defined in JSON files. The combat engine reads those files and runs the simulation.

---

## Hosting Architecture

**Current state:** Each player runs their own local server instance. `localhost` resolves to whatever machine the server is running on — two players running the game independently have entirely separate databases, characters, and save states. Share codes only work between tabs on the same machine.

**Intended future state:** Single shared server, all players connect to one instance. This is the target architecture. When hosted:
- All characters live in one database
- Share codes work globally between all players
- The `BACKEND_URL = ''` change means no client-side config is needed — players just point their browser at the hosted URL
- The combat_logs cleanup routine (see Database section) must be implemented before this

Do not architect features that assume the current multi-instance model will persist.

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
    skills.json                  — 262 skills
    statuses.json                — 64 status effects
    enemy-types.json             — 7 enemy types
    items.json                   — 417 items (includes strange_mushrooms)
    races.json                   — 5 races (all have intrinsicSkills populated)
    challenges.json              — 4 challenges (goblin camp has loot tables)
    consumables.json             — Consumable definitions
    bots.json                    — Bot character definitions

js/
  character-management.js        — Character creation, roster, detail screen, combat history
  combat-system.js               — Frontend combat initiation, idle loop
  combat-log.js                  — Combat log playback, pause, stats panel
  browse-system.js               — Browse/import character cards
  gear-tooltip.js                — Equipment tooltip rendering
  inventory-system.js            — Equipment swap, consumable stash/belt, selling
  game-data.js                   — Frontend data loading (defines BACKEND_URL)
  ui-helpers.js                  — Shared UI utilities

index.html                       — Entire frontend
css/styles.css                   — All styles
admin-editor.html                — Admin editor (challenges, enemies, skills, items)
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

AOE is determined by effect `targets` field, not category name. `applySkillEffects` is passed `players.concat(enemies)` as `allCombatants`. The `all_allies` buff filter uses `actor.type` to find the correct side.

### Effect Types in applySkillEffects

`damage`, `heal`, `lifetap`, `restore_resource`, `restore_pool`, `apply_buff`, `apply_debuff`, `cleanse`, `dispel`

### Lifedrain Mechanics

- `healAttackerOnHit: fraction` — on target's debuff; heals attacker on each hit
- `sourceHealPerTurn: "expression"` — ticks damage AND heals sourceId combatant
- `onHitProcLifetap: { chance, fraction }` — transfers damage fraction from attacker to target on being hit
- `lifetap` effect type — heals actor for `target.maxHP * magnitude * harmonyScale`

### AI Profiles

**Player profiles:** `balanced`, `aggressive`, `cautious`, `support`, `disruptor`, `opportunist`
**Enemy profiles:** `aggressive`, `tactical`, `berserker`, `support`

DEFENSE scoring: penalised to 0.6x when outnumbered, HP threshold 75%.

### Child Skill Discovery

`checkChildSkillProc` fires after every skill use. Eligible child skills must have:
- `isChildSkill: true`
- `parentSkills: [id1, id2]` — both must be in the character's augmented pool
- `procChance` (defaults to 0.05 if not set)

**The category filter was intentionally removed** — parent availability is the correct gate. Cross-category combos (e.g. BUFF + DAMAGE → DAMAGE child) work correctly.

Every skill with two parents must have `isChildSkill: true`. 156 skills were missing this flag and were fixed — the entire skill tree was previously non-functional for discovery.

Discovery XP: 20 XP per proc at level 0. Unlock threshold: 120 XP. After level 1: standard mastery formula.

### Augmented Skill Pool

`getAugmentedSkillPool` builds the set of skills available to a character each turn:
1. First two non-intrinsic skills in `character.skills[]`
2. All skills with `intrinsic: true` in `character.skills[]`
3. Skills linked to consumable belt items with qty > 0

---

## Racial Intrinsic Skills

Each race has an intrinsic skill injected into `character.skills[]` at creation with `{ intrinsic: true, skillLevel: 0 }`. The skill is always in the augmented pool, never appears in the UI, and accumulates discovery XP silently through combat. It graduates to level 1 at 120 XP like any other child skill.

| Race | Intrinsic Skill | Notes |
|---|---|---|
| Human | `prayer` | Opens divine and shadow magic trees |
| Dwarf | `restore_stam_minor` | Feeds fortify/iron_will/second_wind tree |
| Elf | `sense` | Opens weak_point and hunter_mark |
| Orc | `bloodlust` | Opens blood_rage/frenzy/berserker_stance tree |
| Halfling | `stalk` | Opens hunter_mark and stalking_shadow |

`ensureIntrinsicSkill()` runs on every `showCharacterDetail` call to migrate existing characters.

`confirmSkillSwap` separates intrinsic and non-intrinsic skills before slot manipulation and re-appends intrinsics at the end.

### Strange Mushrooms

Consumable item that grants `bloodlust` skill on use. Drops from `orc_warrior` and `orc_shaman` at 8% chance. Allows non-Orc characters to access the bloodlust tree the hard way.

### New Skill Trees

**Bloodlust tree (Orc):**
- `bloodlust` → root, conviction buff
- `blood_rage` — bloodlust + shout → AOE conviction buff
- `frenzy` — bloodlust + basic_attack → multi-hit high damage
- `berserker_stance` — bloodlust + block → conviction buff on taking damage

**Restore Stam Minor tree (Dwarf):**
- `restore_stam_minor` → root (racial intrinsic)
- `fortify` — restore_stam_minor + block → massive personal defense
- `iron_will` — restore_stam_minor + shout → party stamina restore
- `second_wind` — restore_stam_minor + first_aid → stamina + HP restore

---

## Status System (64 statuses)

New statuses: `bloodlust_buff`, `berserker_stance_buff`, `fortify_buff`.

**Valid `effects` fields:**
```
damagePerTurn, healPerTurn, manaDrainPerTurn, sourceHealPerTurn
statReduction / statBoost: { statName: fraction }
skillDelayMultiplier, incomingDamageMultiplier
staminaRegenMultiplier, manaRegenMultiplier
blockSkillCostType: "mana"|"stamina"
skipTurn: true
```

**Top-level fields:** `onHitProc`, `onHitProcLifetap`, `counterProc`, `targetingWeight`, `stackingBehaviour`, `maxMagnitude`, `healAttackerOnHit`

---

## Skill System (262 skills)

### Heal Effects
All heals must use `scalesBy: "harmony"` and `basePower: 0`. Exception: consumable potions use `scalesBy: "basePower"`.

### Consumable Belt vs Stash
- `character.consumables` — belt (4 slots max), what the combat engine sees
- `character.consumableStash` — holding area, drops land here, player moves to belt manually
- Engine never reads stash — only belt items are usable in combat

### Starter Skills (16)
`basic_attack`, `aim`, `block`, `chill`, `first_aid`, `focus`, `footwork`, `misdirect`, `produce_flame`, `rest`, `sense`, `shock`, `shout`, `shove`, `channel`, `attunement`

---

## Inventory System

### Item Categories
- **Gear** — slots mainHand/offHand/head/chest/accessory1/accessory2. Visible only in gear panel, not on main detail screen. Duplicates auto-sell on receipt.
- **Consumables** — `slot_id1: "consumable"`. Land in `consumableStash` on drop. Player equips to belt manually.
- **Quest items** — anything else. Deleteable, not sellable.

### Currencies
- `character.gold` (float) — gear sells for `goldValue || (tier * 8 + 5)` × rarity multiplier
- `character.arcaneDust` (float) — gear yields `gold * 0.01` dust on sale. Consumables yield 1g/ea, 0.01 dust/ea.

### Gear Panel (3 columns)
- Left: equipped items (click to unequip)
- Middle: inventory gear by slot (click to equip)
- Right: sell panel — gear for gold+dust, consumables for 1g each

---

## Enemy Types (7)

Orc enemies now drop `strange_mushrooms` at 8% chance.

---

## Database

### ⚠️ HOSTING CRITICAL — combat_logs growth — DO NOT REMOVE THIS NOTE

The `combat_logs` table stores full simulation output per fight as a JSON blob. Can be several hundred KB per fight. No automatic deletion.

**Before hosting publicly:**
```sql
DELETE FROM combat_logs WHERE createdAt < (strftime('%s','now') - 2592000) * 1000;
```
Run this on a schedule (nightly recommended). Without it the database grows without bound.

### New Columns (migrations run on startup)
`consumableStash TEXT DEFAULT '{}'`, `gold REAL DEFAULT 0`, `arcaneDust REAL DEFAULT 0`

### Tables
**characters** — full state including consumableStash, gold, arcaneDust, aiProfile.
**character_snapshots** — exported/imported character references.
**combat_logs** — full simulation output.

---

## Admin Editor (admin-editor.html)

Four tabs: Challenges, Enemies, Skills, Items.

**Skills tab features:**
- Search by name/ID, filter by category and type (starter/child/other)
- All 23 categories available
- hitCount supports fixed and range modes
- critMultiplier, masteryUnlockAt fields
- Parent skill dropdowns with live search (size=5 visible list)
- Effect modal: type-conditional field visibility, status ID is searchable dropdown from all 64 statuses, chance dropdown, ignore armor, resource type

**Backend endpoints:**
- `GET/POST /api/admin/data/skills` — reads/writes skills.json, invalidates engine cache on save
- `GET/POST /api/admin/data/challenges` — challenges.json
- `GET/POST /api/admin/data/enemies` — enemy-types.json

---

## Combat Log Persistence

All outcomes persist. Two history endpoints:
- `GET /api/combat/history/:characterID/summary` — lightweight (history modal)
- `GET /api/combat/:combatID` — full log (replay)

---

## Frontend Combat Log

**Pause:** `window.combatPaused`, `sleep()` polls in 100ms ticks.
**Auto-scroll:** `_scrollLogToBottom()` respects `_userScrolledUp`. "↓ Latest" button when scrolled up.
**Stats panel:** Per-character damage dealt, damage taken, heals. Updated before `updateHealthBars`.

---

## XP and Rewards

`applyCombatRewards` runs on all outcomes. Null rewards substituted with empty object. `currentState.currentParty` synced after: skills, experience, level, consumables, consumableStash, gold, arcaneDust.

---

## Pending Work

1. **`masteryUnlockAt` engine hook** — thresholds defined on ~20 skills, engine doesn't check them
2. **Barrier as HP absorption pool** — currently `incomingDamageMultiplier: 0.6`
3. **Challenge pass** — only goblin camp has loot tables; all challenges are placeholder difficulty
4. **combat_logs cleanup routine** — required before public hosting
5. **Single-server hosting** — intended architecture, not yet deployed

---

## Data Integrity Rules

- All status IDs referenced in skill effects must exist in `statuses.json`
- All stat names: `conviction`, `endurance`, `ambition`, `harmony`
- Heal effects: `scalesBy: "harmony"`, `basePower: 0` (consumables excepted)
- Child skills: must have `isChildSkill: true` AND `parentSkills: [id1, id2]`
- Proc skill effects: `chance: 1.0` — roll at weapon/status level
- AOE skills: `targets: "all_enemies"` or `targets: "all_allies"` on effects
- `dmg_type_N` fields lowercase
