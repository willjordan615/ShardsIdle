# Shards Idle — Developer Reference

## Project Overview

Web-based asynchronous group PvE idle RPG. Players create characters, form parties, and fight procedurally-staged challenges including offline idle sessions. Stat-based build customisation, skill discovery through combat, cross-challenge quest item persistence.

**Stack:** Vanilla JS frontend, Node.js/Express backend, SQLite database  
**Production:** Railway (`https://shardsidle-production.up.railway.app`) — auto-deploys on git push  
**Local path:** `C:\Users\wtsna\Desktop\ShardsIdle`

---

## Deployment Workflow

This project runs on Railway. There is no local development server — all testing is against the live Railway deployment.

**To deploy changes:**
1. Edit files locally in `C:\Users\wtsna\Desktop\ShardsIdle`
2. Run the git save bat file in the project root
3. Railway detects the push and redeploys automatically (takes ~1 min)

**Database:** SQLite on Railway's persistent volume. No direct DB access — no sqlite3 CLI available. The only way to query the DB is via the admin panel's SQL endpoint (`POST /api/admin/db/query`, SELECT only) or by writing a temporary route. Be careful with schema changes — migrations run on startup via `ALTER TABLE ADD COLUMN` (errors silently ignored if column exists).

**Environment variables** are set in Railway's dashboard (Variables tab):
- `PORT` — set by Railway automatically
- `ADMIN_BOOTSTRAP_SECRET` — was used once to bootstrap admin, now removed

---

## Directory Structure

```
ShardsIdle/
├── backend/
│   ├── server.js                   # Express app, routing, admin editor endpoints
│   ├── database.js                 # SQLite ORM — character/session/combat-log persistence
│   ├── combatEngine.js             # Core turn-based combat simulation (~3800 lines)
│   ├── StatusEngine.js             # Status effect mechanics (DoT, buffs, debuffs)
│   ├── package.json
│   ├── db/                         # game.db (auto-created on first run)
│   ├── data/                       # JSON config files (hot-reloadable via admin panel)
│   │   ├── challenges.json         # Challenge definitions — stages, opportunities, loot
│   │   ├── skills.json             # 100+ skills with scaling, effects, combos
│   │   ├── items.json              # Gear, weapons, consumables, quest items
│   │   ├── enemy-types.json        # Enemy templates, stat budgets, skill pools
│   │   ├── statuses.json           # 58+ status effects (burn, poison, stun, etc.)
│   │   ├── races.json              # Race definitions with intrinsic skills
│   │   ├── bots.json               # Pre-built NPC party members (hardcoded)
│   │   ├── companions.json         # Story companions (Elara, Krog, Hrolf, etc.)
│   │   ├── loot-tags.json          # Item categorisation for drop logic
│   │   └── tuning.json             # Runtime balance constants
│   └── routes/
│       ├── auth.js                 # Login/register/guest auth, sessions, rate limiting
│       ├── combat.js               # /api/combat/* — live and idle combat, locking
│       ├── character.js            # Character CRUD
│       ├── character-snapshots.js  # Character sharing/import/browse system
│       ├── data.js                 # GET endpoints for all game data
│       └── admin.js                # Admin editor endpoints (requireAdmin gated)
├── js/                             # Frontend vanilla JS
│   ├── game-data.js                # Auth state, API wrapper, getCharacterClass()
│   ├── combat-system.js            # Challenge selection, party formation, combat execution
│   ├── character-management.js     # Character creation, roster, detail screen
│   ├── combat-log.js               # Turn-by-turn animation and display
│   ├── combat-rewards.js           # Loot modal, XP display
│   ├── inventory-system.js         # Equipment slots, consumable belt, inventory
│   ├── skill-tree.js               # Skill discovery tree visualisation
│   ├── browse-system.js            # Browse/import public character builds
│   ├── codex.js                    # Field Codex modal (mechanics glossary)
│   ├── gear-tooltip.js             # Item detail tooltips
│   ├── merchant.js                 # NPC vendor interface
│   ├── offline-summary.js          # Idle session summary and rewards
│   ├── avatars.js                  # Avatar selection/customisation
│   ├── admin-panel.js              # Admin UI for editing challenges/items/skills
│   └── ui-helpers.js               # Toast notifications, modals, shared UI utilities
├── css/styles.css
├── index.html                      # Single-page app entry point
├── Dockerfile
└── Documentation/
    ├── HANDOFF.md                  # Session handoff notes
    ├── shards_idle_working_relationship.md
    ├── challenge_generation_dossier.md
    └── skill_depth_reference.md
```


## Stats

- `conviction` — Offensive (physical/fire/arcane/lightning/holy/shadow damage, HP, stamina, hit chance)
- `endurance` — Survivability (HP, stamina, stamina regen, physical defense, skill cost reduction up to 25%)
- `ambition` — Speed & cunning (crit chance, skill delay reduction up to 25%, item drops)
- `harmony` — Magic & sustain (mana, healing, cold/holy/nature/poison damage, XP, variance compression)

Stat scale constant: `STAT_SCALE = 300`. Most stat modifiers use `stat / STAT_SCALE`.

---

## Backend Systems

### database.js

**Active tables:** `users`, `sessions`, `characters`, `combat_logs`, `character_snapshots`, `character_imports`

**Legacy tables (exist in DB, no active code):** `skill_progression`, `character_inventory`, `character_progression` — functions were removed, tables kept for safety.

**Key functions:**
- `saveCharacter(character)` — Full upsert. Writes ALL character fields including `consumables`, `consumableStash`, `keyring`, `skills`, `equipment`, `inventory`.
- `getCharacter(id)` — Returns fully parsed character object.
- `setAdmin(userId, isAdmin)` — Grants/revokes admin flag.
- `setIdleSession()` / `getIdleSession()` / `clearIdleSession()` — Offline combat state.
- `saveCombatLog()` — Persists turn-by-turn log. Pruned after 24h (turns stripped), deleted after 7 days.

**Migrations:** Run automatically on startup — `ALTER TABLE ADD COLUMN` errors are silently ignored (column already exists on fresh installs).

**Admin auth:** Users have `is_admin` column. `requireAuth` middleware attaches `req.isAdmin` via `getUserById`. `requireAdmin` middleware in `server.js` chains `requireAuth` + admin check.

---

### combatEngine.js — CombatEngine class

**Main entry:** `runCombat(partySnapshots, challenge)` → `{ result, participants, log, rewards }`

**Core flow:**
1. `resolvePreCombatPhase()` — skill/stat/item opportunity checks with narrative outcomes
2. `initializeEnemies()` — spawn, scale stats, assign skills
3. Turn loop per stage: tick statuses → each combatant acts → check defeat → roll loot → advance or end
4. `calculateRewards()` — XP, gold, loot drops

**Key methods:**
- `selectAction(actor, allies, opponents, context, opts)` — AI skill selection. Builds `usableSkills` pool, scores each, weighted-random pick.
- `resolveAction(action, actor, players, enemies)` — Hit/miss/crit, damage, status application, consumable decrement.
- `getAugmentedSkillPool(character)` — Returns Set of available skill IDs: first 2 non-intrinsic slots + all intrinsics + consumable belt skills (qty > 0) + weapon proc skills.
- `applySkillEffects(skill, actor, target, healTarget, allPlayers)` — Executes individual effects (damage, heal, buff, debuff).
- `resolvePreCombatPhase(playerCharacters, enemies, stage, turnCount)` — Handles all checkTypes: skill, stat, item, combo, item_and_stat, party_size, random, none.
- `getStatusMultipliers(target)` — Lightweight read-only status probe (multipliers only, no DoT/heal computation). Use instead of `processStatusEffects` when only multipliers are needed.
- `regenerateResources(combatant)` — Stamina/mana regen per turn, uses `getStatusMultipliers`.
- `generateEnemyWeapon(tags, level)` — Procedural enemy weapon from tags + level.

**Participants result object** (returned in `runCombat`):
```js
{
  characterID, characterName, maxHP, finalHP, maxMana, finalMana,
  maxStamina, finalStamina, defeated, skills, consumables,
  consumableStash, keyring, avatarId, avatarColor
}
```
All of `skills`, `consumables`, `consumableStash`, `keyring` are post-combat state and must be written back to DB.

**AoE targeting:** Driven by `effect.targets` on skill effects, not category name. `isAllyAOE` is only true if the skill has NO `damage → all_enemies` effect. Mixed skills (damage + ally buff) route to enemies; ally-buff side effects are handled per-effect in `applySkillEffects`.

**Stealth:** Breaks on first damaging hit by the actor (`removeStatus(actor, 'stealth')`).

**AI scoring base:** Support-category skills (`BUFF`, `HEALING`, `HEALING_AOE`, `DEFENSE`, `UTILITY`, `RESTORATION`) start at `score = 1.0` regardless of `basePower` (which is 0 for pure buff skills). Damage skills use `basePower`.

**Turn 1 buff bonus:** `stageTurnCount` starts at `stageTurns.length` (pre-combat turns) and increments before context is built. Effective "turn 1" arrives at `stageTurnCount >= 2`. Buff priority window is `<= 3`.

**Active buff penalty:** Only counts `statusEffects` with `type === 'buff'` — debuffs on the actor do not penalise buff skill scoring.

---

### StatusEngine.js — StatusEngine class

- `applyStatus(target, statusId, duration, magnitude)` — Add/extend, respects `stackingBehaviour` (`extend` | `escalate`)
- `processStatusEffects(target)` → `{ damageDealt, healed, statReductions, statBoosts, skillDelayMultiplier, incomingDamageMultiplier, staminaRegenMultiplier, manaRegenMultiplier, manaDrainPerTurn, sourceHeals }` — Full tick. Call once per turn per combatant in the main loop.
- `getStatusMultipliers(target)` → `{ skillDelayMultiplier, incomingDamageMultiplier, staminaRegenMultiplier, manaRegenMultiplier }` — Read-only probe. Use for delay/damage/regen calculations mid-action.
- `removeStatus(target, statusId)` — Explicit removal (sleep on damage, stealth on attack, counter_ready on counter).
- `evaluateExpression(expr, magnitude)` — Evaluates `"magnitude * 5"` expressions safely.

---

### routes/combat.js

**Live combat save path** (after `runCombat`):
1. Fetch fresh character from DB
2. Merge skills (safe merge — preserves DB skillLevel if higher, preserves intrinsic flags)
3. Apply `participant.consumables`, `participant.consumableStash`, `participant.keyring` back to character
4. Stack consumable loot into `consumableStash`, quest items into `keyring`
5. `saveCharacter(character)`

**Idle combat save path** (`POST /api/combat/idle/collect`):
- `liveChars` map holds in-memory character state across the full idle loop
- Before each combat: snapshot refreshed with `consumables`, `consumableStash`, `keyring` from `liveChars`
- After each combat: `participant.consumables/consumableStash/keyring` synced back to `liveChars`
- Final save: all `liveChars` written to DB after loop completes

**Import hydration:** Imported characters re-hydrated from original character at combat start. Hydration includes `stats`, `skills`, `equipment`, `consumables`, `consumableStash`, `keyring`, `aiProfile`.

**Bot hydration:** Hardcoded bots use `bot.characterName` (not `bot.name`).

**Skill check (opportunity):** Intrinsic racial skills always pass regardless of `skillLevel` — checked via `skillRecord.intrinsic` before the `skillLevel >= 1` gate.

---

### routes/character-snapshots.js

**Browse endpoint** (`GET /api/character/browse`): Returns `liveChar.skills` and `liveChar.equipment` (not snapshot values) so the card always reflects the character's current equipped build. Falls back to snapshot if live character unavailable.

---

## Frontend

### Global State (`game-data.js`)
- `window.authState` — `{ token, userId, username, isGuest, isAdmin, ready }`
- `window.gameData` — `{ challenges, skills, races, gear, statuses, bots, companions }`
- `window.authFetch()` — Fetch wrapper that auto-injects Authorization header

### `getCharacterClass(character, skills)` — in `game-data.js`
Derives class label from equipped skills, weapon type, stats, armor, combat history.

**Flow:** Steps 1–9 use early returns via `withElement(className)`. Steps 10–11 handle prestige prefixes on `baseClass` (rarely reached).

**`withElement(cls)`** — closure inside `getCharacterClass`. Prepends an elemental adjective (`Flame`, `Frost`, `Storm`, `Plague`, `Shadow`, `Divine`, `Nature`, `Arcane`, `Tide`) based on `dominantTag` if:
- The class is a single word
- The class name doesn't already contain an elemental word
- The class isn't in the skip set (`Tactician`, `Harmonist`, `Minstrel`, `Choirmaster`, `Grand Bard`, `Pathfinder`, `Footsoldier`)
- Arcane isn't applied to already-arcane-implied classes (Mage, Wizard, etc.)
- Nature isn't applied to druid-family classes
- Holy isn't applied to paladin/cleric/priest classes

**Bard detection:** Any skill with `song` tag triggers bard classification. Single song skill + no instrument → `Minstrel` (if healing) or `Bard`. Elemental non-song skill as second slot → elemental singer title (`Frost Singer`, `Flame Singer`, etc.).

**Shaman detection:** `spirit` tag stacking or key skill combos (`totemic_aura` + `spirit_link`, `spirit_storm`).

### Skill display (roster/browse cards)
Equipped skills = first 2 non-intrinsic skills by array position + first intrinsic. **Not** sorted by level — level sort was showing old high-level skills from previous builds.

### `combat-system.js`
- `window.currentState` — `{ selectedChallenge, currentParty[], idleActive, pendingLoopExit }`
- `startCombat()` — POSTs to `/api/combat/start`, displays log, handles escape consumable
- `idleLoop()` — Auto-restarts challenge indefinitely

---

## Consumable / Inventory Architecture

Three separate stores per character:

| Store | Field | Purpose |
|---|---|---|
| Belt | `consumables` | `{ itemId: qty }` — items currently slotted for combat use |
| Stash | `consumableStash` | `{ itemId: qty }` — purchased/looted items not yet on belt |
| Keyring | `keyring` | `{ itemId: 1 }` — quest items, passive, no capacity limit |

**Quest item detection:** `slot_id1 === 'consumable'` AND no `type` field. Quest items route to keyring, never decrement, never show in belt management modal.

**Belt order:** `beltOrder: [itemId|null, itemId|null, itemId|null, itemId|null]` — 4 slots, position matters for UI.

---

## Security

- All `/api/admin/data/*` routes (disk writes) gated by `requireAdmin`
- `requireAdmin` = `requireAuth` + `req.isAdmin === true`
- Login rate-limited: 10 attempts / 15 min / IP via `express-rate-limit`
- `POST /api/auth/grant-admin { username, secret }` — bootstrap endpoint, inert without `ADMIN_BOOTSTRAP_SECRET` env var

---

## Data Integrity

### Silent failures — nothing logs, nothing errors:
- Skill references missing `statusId` → status not applied
- Skill references missing parent/combo `skillId` → no effect
- Healing skill missing `scalesBy` → heals 0
- Loot table references missing `itemId` → item skipped

**Rule:** Before adding any reference in a data file, verify the target ID exists in its source file.

### Reference chain:
```
skills.json → statuses.json        (skills apply status IDs)
skills.json → skills.json          (parentSkills, combo triggers)
challenges.json → enemy-types.json
challenges.json → items.json       (loot tables, opportunity item checks)
challenges.json → skills.json      (opportunity skill checks)
enemy-types.json → items.json      (weapon IDs)
```

Before deleting any ID from a data file, grep for references across all other data files.

### Quest items vs consumables
- **Consumable:** has `type: "consumable"`, `consumable: true`, `stackable: true` — decrements on use
- **Quest item:** NO `type` field, `consumable: false`, `stackable: false` — keyring only, never consumed

---

## Known Incomplete / Untested

- **`adaptiveEnemies`** — Written in `combatEngine.js` but not runtime-tested. Triggers at Threshold of Echoes (stage 2) and Spire Fractured Time (stage 3).
- **d12+ calibration** — `lord_of_decay`, `apocalypse`, `eternal_winter` bosses untested against live parties. May oneshot — reduce endurance scaling if needed.
- **Architect (d16 boss, level 70)** — Calibrated but untested.
- **Prestige/Sharding** — Designed but not implemented.
- **Belt UI** — Quest items filtered from stash display but a player with pre-keyring quest items in belt slots won't be auto-migrated.
- **`renderChallenges()` in `game-data.js` line ~267** — Retained intentionally as dead code backup.
- **Admin panel HTML** — No server-side session check on the page itself. API is protected but the HTML loads for anyone who knows the URL.

---

## Cross-Challenge Quest Items (31 total)

Persist between challenges. Handle with care — deleting or renaming breaks the item network:

`vulture_company_ledger`, `silver_halfling_coin`, `monitoring_crystal`, `thrains_complete_report`, `architects_seal`, `sigil_fragment`, `oath_stone`, `verdant_word_seal`, `royal_guard_insignia`, `guild_seal`, `unpaid_ledger`, `loyalist_seal`, `blood_oath_token`, `first_hand_shard`, `resonance_node_fragment`, `ferryfolk_lantern`, `heirs_signet`, `songbook_of_lyra`, `capital_key`, `dissolution_record`, `hrolf_standing_orders`, `ironvein_signet`, `athenaeum_scroll`, `coronation_writ`, `ancestral_verdict`, `spire_fragment`, `unified_seed`, `heir_signet`, `ironvein_field_orders`, `seed_of_first_tree`, `petitioners_verdict`

**Note:** `heirs_signet` (ring-type equipment) and `heir_signet` (quest item, no type) are two distinct items.

---

## Working Conventions

- **Routine tasks** (bug fixes, wiring a field, adding a status): just do it
- **Structural/design changes** (new systems, refactoring, architecture): describe approach and confirm first
- **Bulk find-and-replace or file transformations**: confirm changes are committed to git or explicitly acknowledged before proceeding
- **After significant engine or data work**: run a smoketest combat and read the backend log carefully
- **Data file edits**: always verify referenced IDs exist before saving
