# Combat System Documentation

Project: Shards Idle
Status: Alpha 1.1 (Stable)
Core Files: `backend/combatEngine.js`, `backend/routes/combat.js`, `js/combat-system.js`, `js/combat-log.js`
Last Updated: March 17, 2026

---

## 1. System Overview

The combat system is an asynchronous, turn-based engine that simulates multi-stage PvE encounters. Logic and presentation are fully separated. The backend calculates the entire battle instantly and returns a structured result object. The frontend plays it back visually, turn by turn.

### Key Architectural Principles
- **Stateless Simulation**: The server holds no active combat sessions. It receives a request, simulates the fight, saves the result, and returns the log.
- **Deterministic Variance**: RNG is used for hits/crits/variance, but the result is fully computed server-side before playback begins.
- **Modular Logic**: Damage calculation, AI decision-making, and status effects are handled in distinct functions within `combatEngine.js`.
- **Fire-and-Forget Playback**: `displayCombatLog()` is called without `await` in `startCombat()`. This is intentional — awaiting it would freeze the UI for the entire duration of combat playback.

---

## 2. Core Components

### A. Combat Engine (backend/combatEngine.js)

The heart of the simulation. Orchestrates the turn loop, manages stages, and resolves all actions.

#### Initialization & Setup
- **Import Hydration**: If a party member has `isImported: true` or is missing `stats`, the engine fetches the original character from the database and merges their full stats before simulation begins.
- **Stat Aggregation**: Combines Base Race Stats + Allocated Attribute Points + Equipment Bonuses + Skill Passives.
- **Weapon Variance Profiling**: Scans `items.json` at startup. Keywords map to variance ranges:
  - `"dagger"` → `[0.7, 1.4]` (High volatility)
  - `"mace"` → `[0.9, 1.1]` (Consistent)
  - `"sword"` → `[0.8, 1.2]` (Balanced)
  - `"scepter"` → `[0.85, 1.25]`

#### The Turn Loop
The engine runs a while loop until Victory or Defeat conditions are met.

1. **Initiative Sort**: All entities (players + enemies) sorted by Speed. Ties broken randomly.
2. **Action Selection**:
   - **Players**: Priority queue AI (e.g., "Heal if HP < 30%", else "Attack Lowest HP").
   - **Enemies**: Standard rotation → Desperation AI below 30% HP → `NO_RESOURCES` fallback pool when stamina/mana exhausted.
3. **Execution**:
   - Resource cost check (Stamina/Mana)
   - Accuracy check
   - Damage/Healing calculation with variance applied
   - Status effect application
4. **Post-Turn Cleanup**: Expire buffs/debuffs, regenerate resources.
5. **Log Generation**: Every action pushed to the current segment's `turns` array with full metadata including delay timing for frontend playback.

#### Multi-Stage Logic
- Battles flow through sequential stages defined in `challenges.json`.
- Survivors retain current HP/Resources between stages.
- **Branching**: At stage end, `stageBranches` is checked. If a condition is met (e.g., `has_skill: climb`), the engine jumps to a specific `nextStageId` instead of the default next stage.
- Each completed stage produces a segment in the response with its own `turns`, `participantsSnapshot`, `introText`, `summaryText`, and `status`.

#### Desperation AI
Enemy behavior shifts dynamically based on HP thresholds.
- **Normal State** (>30% HP): Standard rotation — basic attack → cooldown skill.
- **Desperate State** (<30% HP): Ignores resource conservation, prioritizes high-damage abilities, may target lowest-HP players.
- **No Resources State**: Draws from a global `NO_RESOURCES` skill pool (e.g., Last Stand). Self-targeting skills are applied to the enemy itself; damage skills target the lowest-HP player.

### B. Safety Net Logic (backend/routes/combat.js)

Manages the idle auto-restart loop.

- **On victory**: Updates `lastSuccessfulChallengeId` on the character via direct SQL `UPDATE`.
- **On defeat**: Reads `lastSuccessfulChallengeId` from the character record and returns it as `nextChallengeId` in the response.
- **Default fallback**: `challenge_goblin_camp` if no successful challenge is recorded.
- The frontend's `startCountdown()` reads `nextChallengeId` from the response, updates `window.currentState.selectedChallenge`, and calls `startCombat()` when the timer expires.

### C. Pre-Combat Opportunities

Triggered before specific stages, configured per-stage in `challenges.json`.

- **Logic**: `SuccessChance = PrimaryStat + (SecondaryStat * 0.5)` vs `difficultyThreshold`
- **Outcomes**:
  - **Success**: Narrative bonus (e.g., bypass trap), enemy removal, or starting buff.
  - **Failure**: Direct damage (% of maxHP) or status debuff applied to party.
  - **Fallback**: Harder penalty if the required skill is absent entirely.
- Pre-combat results appear as `type: "pre_combat_skill"` or `type: "pre_combat_fallback"` turns in the segment log.

### D. Combat System Frontend (js/combat-system.js)

Frontend controller for setup and initiation.

- Owns and initializes `window.currentState` (the only place it should ever be declared).
- Handles challenge selection, party formation, bot/companion selection.
- Builds `partySnapshots` — includes `stats`, `skills`, `consumables`, and `equipment` for all party members including imported companions.
- Sends `POST /api/combat/start` with `{ partySnapshots, challengeID, challenges }`.
- On response: calls `showScreen('combatlog')` then `displayCombatLog(combatResult)` without `await`.

### E. Combat Log Frontend (js/combat-log.js)

Visual playback and reward processor.

#### Playback
- Iterates through `combatData.segments` in order.
- Per segment: shows intro narrative (4s pause) → renders enemies for this stage → plays each turn with per-turn delay → shows stage summary.
- `hpMaxes` is updated from `segment.participantsSnapshot` at the start of each stage so HP bar percentages are calculated against the correct max for newly spawned enemies.
- Health bar updates trigger on any turn with a defined `targetHPAfter`, including heals.

#### Result Modal
After all segments complete:
- Populates `#combatResultModal` with loot, XP, and skill progress.
- Victory: 3s countdown, then auto-restarts same challenge.
- Defeat: 5s countdown, then restarts from safety net challenge.
- Retreat: 2s delay, then `returnToHub()`.

#### Reward Calculation (applyCombatRewards)
- Skips imported characters (`charId.startsWith('import_')`) and bots (matched against `window.gameData.bots`).
- Applies character XP and handles level-ups.
- Applies skill XP with category balancing:
  - `DAMAGE_SINGLE`: 2 XP/use (anti-spam)
  - All others: 50 XP/use
  - Scaled by `Math.log(skillLevel + 2)` for diminishing returns
  - Pre-combat failures get 0.5x multiplier
- Applies loot to first player character's inventory.
- Calls `renderRoster()` and `showCharacterDetail()` to refresh UI.

---

## 3. Known Quirks & Safety Checks

### HP Bars Across Stages
The initial `hpMaxes` map is populated from `combatData.participants.enemies` which reflects only the final state. When entering each new stage, `segment.participantsSnapshot.enemies` must be used to update `hpMaxes` for newly spawned enemies, or bar percentages will be wrong.

### Tooltip Management
Dynamic DOM updates during combat playback can cause gear tooltips to orphan on screen. `destroyGearTooltip()` must be called both before and after any operation that replaces gear card DOM elements (equip, unequip, modal close).

### Async Playback
`displayCombatLog()` is an `async` function but must not be `await`ed by its caller. The `await sleep()` calls inside work correctly — they pause the playback loop — but the outer caller continues immediately, which is the desired behavior for keeping the UI responsive.

### Bot & Import Safety
Bots and imported characters exist in `window.gameData.bots` and the `character_imports` table respectively, not in the main characters table. Attempting to `getCharacter()` on their IDs will 404. Both `applyCombatRewards` skips them explicitly.

### XSS Protection
Public companion cards in party formation are built via DOM methods with `data-*` attributes, not inline `onclick` strings. All user-supplied strings (character names, race names) are passed through `escapeHtml()` before insertion into innerHTML.

---

## 4. Data Flow Diagram

```
User clicks "Begin Challenge"
        │
        ▼
confirmPartyAndStart() → startCombat()
        │
        ▼
POST /api/combat/start
{ partySnapshots, challengeID, challenges }
        │
        ▼
Backend: combatEngine.js
  ├── Hydrate imports from DB
  ├── Aggregate stats
  ├── Run turn loop (all stages)
  ├── Update safety net (SQL)
  └── Return result object
        │
        ▼
Frontend receives response
        │
        ├── showScreen('combatlog')
        └── displayCombatLog(result)  ← fire-and-forget
                │
                ▼
        Stage 1 playback (turns + delays)
                │
                ▼
        Stage 2 playback (turns + delays)
                │
                ▼
        Result Modal shown
        (loot, XP, countdown)
                │
                ▼
        applyCombatRewards()
        startCountdown() → startCombat()
```

---

## 5. Future Expansion Points

1. **Combo System**: `lastUsedSkillId` tracking hook exists in `combatEngine.js`. Sequence detection and combo recipe lookup against a `combos.json` is the next step.
2. **Elemental Reactions**: Damage types are tagged (Fire, Oil, etc.) throughout the engine. Reaction logic (e.g., Oil + Fire = Explosion) is stubbed but not implemented.
3. **Advanced Target Priority AI**: Current AI targets lowest HP. Structure allows swapping in complex algorithms (focus healers, focus buffers, random).
4. **Boss Phase Changes**: Desperation AI threshold exists. Phase-specific skill loadout swapping at defined HP thresholds is a natural extension.

---

*Combat System Documentation — Shards Idle Alpha 1.1 — March 17, 2026*
