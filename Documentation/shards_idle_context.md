# Shards Idle — Technical Context
*Current as of Session 3. Regenerate this document when the codebase meaningfully changes.*
*Read the working relationship document before this one.*

---

## What This Project Is

Shards Idle is a browser-based idle RPG. Players create characters, form parties, and send them into challenges. Combat is fully autonomous — characters fight using AI-driven skill selection based on their assigned profile. Players watch the combat log, manage their roster, share characters with other players, and import interesting builds they find.

No real-time player input during combat. Everything is data-driven: skills, statuses, enemies, and challenges are defined in JSON files. The combat engine reads those files and runs the simulation.

---

## Stack

- **Frontend:** Vanilla JS, HTML5, CSS3 — no framework, no build system
- **Backend:** Node.js/Express, SQLite via better-sqlite3
- **Single-page frontend** — `index.html` is the entire UI

---

## File Structure

```
backend/
  server.js                      — Express server, route registration
  combatEngine.js                — Combat simulation (~2200 lines, core system)
  StatusEngine.js                — Status effect processing
  database.js                    — SQLite schema + all DB functions
  routes/
    character.js                 — Character CRUD + PATCH aiProfile
    character-snapshots.js       — Export, import, browse
    combat.js                    — POST /api/combat/start
    data.js                      — GET /api/data/all (serves all JSON to frontend)
    admin.js                     — Admin editor endpoints
  data/
    skills.json                  — 251 skills
    statuses.json                — 58 status effects
    enemy-types.json             — 7 enemy types
    items.json                   — 416 items
    races.json                   — 5 races
    challenges.json              — 4 challenges
    consumables.json             — Consumable definitions
    bots.json                    — Bot character definitions

js/
  character-management.js        — Character creation, roster, detail screen
  combat-system.js               — Frontend combat initiation
  combat-log.js                  — Combat log playback and rendering
  browse-system.js               — Browse/import character cards
  gear-tooltip.js                — Equipment tooltip rendering
  inventory-system.js            — Inventory management
  game-data.js                   — Frontend data loading
  ui-helpers.js                  — Shared UI utilities

index.html                       — Entire frontend
css/styles.css                   — All styles
admin-editor.html                — Admin editor (challenges + enemies only)
```

---

## The Data Layer — Most Important Thing To Understand

Everything flows from JSON files. Adding a new skill, status, or enemy means editing JSON — not the engine.

**Reference chain — always verify when editing data files:**

`skills.json` references status IDs in effects (`"debuff": "poison"`). Those IDs must exist in `statuses.json` or the StatusEngine warns and the effect silently fails.

`statuses.json` effects use specific field names the StatusEngine knows how to process. Unknown field names silently do nothing.

`enemy-types.json` references item IDs in `equipment`. Those must exist in `items.json`.

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
- `applySkillEffects(skill, actor, target, healTarget, allPlayers)` — applies all non-damage effects
- `triggerWeaponProcs(actor, target, skillLevel)` — weapon item on-hit procs
- `triggerStatusProcs(actor, target, skillLevel)` — status buff on-hit procs
- `selectPlayerAction(character, players, enemies)` — scored candidate AI
- `selectEnemyAction(enemy, players, enemies)` — profile-driven enemy AI
- `regenerateResources(combatant)` — stamina + mana regen per round (scales with endurance/harmony)

### Unified Resolution Path

AOE is determined by effect `targets` field, not category name. `resolveAction` builds a `targetList`:
- `targets: "all_enemies"` → all alive enemies
- `targets: "all_allies"` → all alive players
- `targets: "all_entities"` → everyone
- Anything else → single target from `action.target`

One loop runs over `targetList` for damage, sleep-break, counter-ready, procs. Every result returns `targets[]` array format. Status ticks are the only exception — they still emit `targetId`/`targetHPAfter` (intentional, they are not skill resolutions).

### Effect Types in applySkillEffects

`damage`, `heal`, `restore_resource`, `restore_pool`, `apply_buff`, `apply_debuff`, `cleanse`, `dispel`

### Status Integration Points

| Effect Field | Where Consumed |
|---|---|
| `damagePerTurn` | Per-round status loop |
| `healPerTurn` | Per-round status loop |
| `manaDrainPerTurn` | Per-round status loop |
| `statBoost` / `statReduction` | Per-round as transient deltas, reversed after turn |
| `incomingDamageMultiplier` | `calculateDamage` step 7 |
| `skillDelayMultiplier` | `resolveAction` final delay calculation |
| `staminaRegenMultiplier` | `regenerateResources` |
| `manaRegenMultiplier` | `regenerateResources` |
| `blockSkillCostType` | `hasResources` via `isSkillBlocked` |
| `skipTurn` | `checkActionBlock` |

**Special fields read directly by engine (not StatusEngine):**
- `onHitProc: { skillId, chance }` — read by `triggerStatusProcs`
- `counterProc: { skillId, chance }` — fired by counter_ready hook on receiving damage
- `targetingWeight` — read by `_weightedRandomTarget` in `selectEnemyAction`
- `stackingBehaviour: "escalate"` + `maxMagnitude` — read by `StatusEngine.applyStatus`

### AI Profiles

**Player profiles:** `balanced`, `aggressive`, `cautious`, `support`, `disruptor`, `opportunist`
**Enemy profiles:** `aggressive`, `tactical`, `berserker`, `support`

Targeting uses weighted random: taunt 4.0x, stealth 0.15x, `targetingWeight` from status definitions. Taunt overrides preferred-target logic for non-berserker profiles. Berserker honours taunt only on its random rolls (~40%).

---

## Status System (58 statuses)

Every status has real mechanical effects. Nothing is decorative.

**Valid `effects` fields:**
```
damagePerTurn: "magnitude * N"
healPerTurn: "magnitude * N"
manaDrainPerTurn: "magnitude * N"
statReduction: { statName: fraction }
statBoost: { statName: fraction }
skillDelayMultiplier: N        (>1 slower, <1 faster)
incomingDamageMultiplier: N    (>1 more damage taken, <1 less)
staminaRegenMultiplier: N
manaRegenMultiplier: N
blockSkillCostType: "mana"|"stamina"
skipTurn: true
```

**Tiered poison:** `poison_weak` → `poison` → `poison_strong` → `poison_deadly`

**Elemental DoTs:** `burn`, `chilled`, `electrified`, `shadowed`, `arcane_burn`

**`deep_wound`** — `stackingBehaviour: "escalate"`, reapplication increases magnitude up to `maxMagnitude: 5`

**`counter_ready`** — `counterProc: { skillId, chance }`, fires retaliatory proc on being hit then removes itself

**`marked`** — `targetingWeight: 3.0` | **`provoked`** — `targetingWeight: 2.5`

**`sleep`** — `skipTurn: true` + `incomingDamageMultiplier: 1.3`, breaks on receiving any damage

---

## Skill System (251 skills)

### Categories the AI Evaluates
`DAMAGE_SINGLE`, `DAMAGE_AOE`, `DAMAGE_MAGIC`, `DAMAGE_AOE_MAGIC`, `HEALING`, `HEALING_AOE`, `CONTROL`, `BUFF`, `DEFENSE`, `UTILITY`, `RESTORATION`, `CONSUMABLE_HEALING`, `CONSUMABLE_RESTORATION`, `CONSUMABLE_DAMAGE`

### Categories the AI Ignores
`CONSUMABLE_ESCAPE`, `UTILITY_PROC`, `WEAPON_SKILL`, `PROGRESSION`, `DAMAGE_PROC`, `CONTROL_PROC`, `NO_RESOURCES` (desperation pool only)

### Proc Skills
`DAMAGE_PROC` category, `proc_` prefix. Always have `chance: 1.0` on their effect — the roll happens at weapon or status level. Fire via `triggerWeaponProcs` or `triggerStatusProcs`.

### Heal Effects
Must have both `scalesBy` (`harmony`/`conviction`/`endurance`/`basePower`) and `magnitude` (fraction of maxHP). Missing either silently heals 0.

### AOE Skills
All 38 AOE skills have `targets: "all_enemies"` or `targets: "all_allies"` on their effects. The engine reads this field — not the category name.

### Key Design Decisions
- Cold skills apply `chilled` (not `slow`)
- Electric skills apply `electrified` (not `stun`, except physical concussive hits)
- Shadow skills apply `shadowed` (not `weaken`)
- `hunter_mark` applies `marked` (targeting weight debuff, not weaken)
- `corrosive_wound` applies `armor_break`
- `bleed_out` applies `deep_wound` (escalating)
- Counter/riposte skills apply `counter_ready` buff on self
- Stun/sleep/freeze chances calibrated 25-55% by skill depth

### Skill Discovery
Child skills have `parentSkills` arrays. `checkChildSkillProc` fires after parent skill use. 14 intentional starter skills have `isStarterSkill: true`.

⚠️ **Character creation UI shows all 84 parentless skills** — filter not yet implemented.

---

## Enemy Types (7)

| ID | Weapon | AI Profile | Notes |
|---|---|---|---|
| `goblin_scout` | goblin_dagger | aggressive | Basic melee |
| `goblin_archer` | goblin_bow | tactical | Ranged |
| `spider_small` | fangs_tiny | aggressive | 25% proc_poison_weak on hit |
| `spider_large` | fangs_small | berserker | 30% proc_poison on hit |
| `orc_warrior` | dogchopper | berserker | Heavy melee |
| `orc_shaman` | shaman_totem | support | Heals, buffs, produces flame |
| `dragon_ancient` | fangs_great | tactical | 55% proc_poison_deadly, 25% proc_bleed |

**Equipment format:** Spiders use array format `["fangs_tiny"]`. Others use object format `{ mainHand: "...", offHand: null, ... }`.

---

## Weapon System

On-hit proc fields: `onhit_skillid_1`, `onhit_skillchance_1` (slots 1-3). Chance is 0-100 (percent).

**Fang weapon family** (all type: `"dagger"`, tier: -1):
- `fangs_tiny` — 1 piercing, 25% proc_poison_weak
- `fangs_small` — 3 piercing, 30% proc_poison
- `fangs_large` — 6 piercing + 2 poison, 35% proc_poison_strong
- `fangs_great` — 10 piercing + 4 poison, 45% proc_poison_deadly, 20% proc_bleed

**Weapon variance** auto-scanned from `items.json` by type keyword. Daggers `[0.70, 1.40]`, balanced weapons `[0.85, 1.25]`, heavy weapons `[0.90, 1.15]`.

---

## Challenges (4)

| ID | Name | Content |
|---|---|---|
| `challenge_goblin_camp` | Goblin Encampment | 2 stages, scouts and archers |
| `challenge_forest_dungeon` | Forest Dungeon | Branching, spiders, queen's chamber |
| `challenge_survive_waves` | Orc Warband Ambush | 2 stages, warriors and shaman |
| `challenge_dragon_lair` | Dragon's Lair | 2 stages, orcs then dragon |

Forest Dungeon is the most tested challenge. All smoketests have used it.

---

## Database

**Characters table** includes `aiProfile TEXT DEFAULT 'balanced'` (migration runs on startup).
**character_snapshots table** includes `ai_profile TEXT DEFAULT 'balanced'` (migration runs on startup).

`saveCharacter`, `getCharacter`, `getAllCharacters` all include `aiProfile`.

Bot characters skip DB save intentionally — this is correct behaviour, not a bug.

---

## aiProfile Feature (complete)

Full end-to-end flow: creation UI dropdown → DB storage → detail screen (editable) → `PATCH /api/characters/:id/aiProfile` → browse card badge → snapshot export/import → partySnapshot → engine reads from player character object.

---

## Frontend Combat Log

**Result format:** All skill resolutions return `targets[]`. Each entry: `{ targetId, targetName, damage, hpAfter, targetStatuses }`. Status ticks emit `targetId`/`targetHPAfter` — intentional, handled by legacy branch.

**renderTurn routing:**
- Multiple targets with damage → one log entry per target (AOE)
- Single target with damage → one summary line
- No damage → one summary line using `result.message` (buffs, heals)
- Miss → standard handler via empty `targets[]`
- Status tick → italic status handler

Enemy cards include `statuses-${enemyID}` div. Post-stage sweep applies `combatant-defeated` to all enemies with `finalHP <= 0`.

---

## Pending Work (Priority Order)

1. **Character creation skill filter** — shows all 84 parentless skills, should show only 14 `isStarterSkill: true` skills

2. **Race bonus skills** — all 5 races have empty `bonusSkills` arrays

3. **`masteryUnlockAt` engine hook** — 20 skills have thresholds defined, engine doesn't check them

4. **Barrier as HP absorption pool** — currently `incomingDamageMultiplier: 0.6`, should be a true absorbing shield

5. **Admin editor coverage** — skills and races not yet editable

6. **Qwen Pass 3** — more skills targeting cross-branch connectors and utility/healing depth. Prompt ready.

7. **Balance pass** — spider damage intentionally low for now, full pass when content is more stable

8. **New challenges and enemies** — nothing blocking expansion

---

## Data Integrity Rules

- All status IDs referenced in skill effects must exist in `statuses.json`
- All stat names in status effects must be: `conviction`, `endurance`, `ambition`, `harmony`
- Heal effects must have both `scalesBy` and `magnitude`
- Proc skill effects have `chance: 1.0` — roll happens at weapon/status level
- Stun/sleep/freeze chances must be calibrated by depth (range: 25-55%)
- AOE skills must have `targets: "all_enemies"` or `targets: "all_allies"` on their effects
- `dmg_type_N` fields should be lowercase
