# Shards Idle: Comprehensive Technical Documentation

Version: Alpha 1.1 (Stable)
Last Updated: March 17, 2026
Core Philosophy: Asynchronous, Turn-Based, Data-Driven, Vanilla JS.

---

## 🚀 Executive Summary

Shards Idle is a browser-based, asynchronous group PvE RPG. Players build characters, manage equipment, and simulate multi-stage battles against intelligent AI. The backend calculates the entire fight instantly, returning a structured log that the frontend plays back visually.

Key Differentiators:
- **Asynchronous Combat**: No real-time server state; battles are simulated on-demand.
- **Dynamic Weapon Variance**: Weapons have distinct "feel" profiles (volatility) determined by keywords, not hardcoded stats.
- **Pre-Combat Skill Checks**: Narrative and mechanical branches triggered before battle stages based on player skills.
- **Float-Based Progression**: Skills level with fractional XP (e.g., Level 2.45) with category-based balancing to prevent spam-leveling.
- **Safety Net Idle Loop**: On defeat, the game automatically falls back to the last successfully completed challenge and continues running.
- **Form-Based CMS**: A built-in web editor (admin-editor.html) allows full management of challenges, enemies, and skills without touching JSON files.
- **Share/Import System**: Players can generate share codes for characters, which others can import as Companions into their parties.

---

## 🏗 Architecture & Tech Stack

### Technology
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3. No frameworks.
- **Backend**: Node.js with Express.
- **Database**: SQLite3 (better-sqlite3) for user data.
- **Static Data**: JSON files (skills.json, items.json, enemy-types.json, challenges.json, races.json, bots.json, statuses.json, consumables.json).

### Project Structure
```
ShardsIdle/
├── backend/
│   ├── routes/
│   │   ├── combat.js           # API endpoints for simulation + Safety Net logic
│   │   ├── characters.js       # CRUD for user character data
│   │   ├── character-snapshots.js  # Snapshot system
│   │   ├── admin.js            # Admin editor endpoints
│   │   └── data.js             # Serves static JSON & admin data
│   ├── combatEngine.js         # CORE: Logic, AI, Variance, Pre-Combat
│   ├── StatusEngine.js         # DoT, HoT, Stuns, Buffs
│   ├── database.js             # SQLite interactions
│   └── data/                   # Static JSON source of truth
├── js/
│   ├── game-data.js            # Loads global data -> window.gameData
│   ├── combat-system.js        # Party formation, Challenge selection, currentState owner
│   ├── combat-log.js           # Visual playback, Reward calculation, Result modal
│   ├── inventory-system.js     # Equipment & consumable modal logic
│   ├── gear-tooltip.js         # Dynamic tooltip generation/destruction
│   ├── character-management.js # Roster, Creation, Character detail, getCharacter
│   ├── browse-system.js        # Share/Import codes & public character browsing
│   ├── ui-helpers.js           # showScreen, showModal, showError, showSuccess, returnToHub
│   ├── stat-tooltip.js         # Stat explanation tooltips
│   └── admin-panel.js          # In-game admin panel (tilde key)
├── css/
│   ├── styles.css              # Global styling
│   └── admin-panel.css         # Admin panel styles
├── Documentation/              # Technical docs (this folder)
├── admin-editor.html           # 🛠 CMS: Form-based data editor
├── index.html                  # Main entry point
├── SAVE.bat                    # One-click Git commit + push
└── Start_Backend.bat           # Starts the Node.js server
```

---

## ⚙️ Global State

`currentState` is the single source of truth for all transient UI state. It is declared and owned exclusively by `combat-system.js` and attached to `window.currentState` for global access.

```javascript
window.currentState = {
    // Combat & party
    selectedChallenge: null,
    currentParty: [],
    selectedBots: [],
    detailCharacterId: null,
    // Character creation
    selectedRace: null,
    selectedSkills: [],
    selectedWeaponType: null,
    allocatedStats: { conviction: 0, endurance: 0, ambition: 0, harmony: 0 },
    pointsRemaining: 25
};
```

**Critical rule**: Never declare `currentState` with `let` or `const` in any other file. This causes a redeclaration error that crashes all JS. Always access via `window.currentState` or the global `currentState` variable.

---

## ⚔️ Core Combat Systems

### 1. The Combat Engine (backend/combatEngine.js)

The stateless simulator. Accepts a party snapshot and challenge ID, runs a while loop until victory/defeat, and returns a structured result object.

#### A. Initialization
- **Stat Aggregation**: Combines Base Race Stats + Attribute Points + Equipment + Passives.
- **Weapon Variance Profiling**: Scans items.json at startup, maps keywords to variance ranges (e.g., `"dagger"` → `[0.7, 1.4]`, `"mace"` → `[0.9, 1.1]`).
- **Import Hydration**: If a party member is an imported character (`isImported: true` or missing `stats`), the backend fetches the original character from the database to hydrate their full stats before simulation.

#### B. The Turn Loop
1. **Initiative**: Sort entities by Speed. Ties broken randomly.
2. **Action Selection**:
   - Players: Auto-simulated via Priority Queue (e.g., "Heal if HP < 30%").
   - Enemies: Uses Desperation AI — shifts to high-risk/high-reward moves below 30% HP. Also has a `NO_RESOURCES` fallback pool for when stamina/mana are exhausted.
3. **Resolution**: Accuracy check → Damage/Heal Calc → Status Application.
4. **Logging**: Every event pushed to a per-segment `turns` array with full metadata.

#### C. Multi-Stage & Branching
- Battles flow through sequential stages defined in `challenges.json`.
- At stage end, the engine checks `stageBranches`. If a condition is met (e.g., `has_skill: climb`), it jumps to a specific `nextStageId`.
- Survivors retain HP/Resources between stages.
- The response includes a `segments` array — one entry per stage — each containing their own `turns`, `participantsSnapshot`, `introText`, `summaryText`, and `status`.

#### D. Safety Net Logic (backend/routes/combat.js)
- On **victory**: Updates `lastSuccessfulChallengeId` on the character via direct SQL.
- On **defeat**: Reads `lastSuccessfulChallengeId` and returns it as `nextChallengeId` in the response.
- Default fallback: `challenge_goblin_camp` if no successful challenge is on record.

### 2. Pre-Combat Opportunities
Triggered before specific stages, configured per-stage in `challenges.json`.

- **Check**: `SuccessChance = PrimaryStat + (SecondaryStat * 0.5)` vs `difficultyThreshold`.
- **Outcomes**:
  - **Success**: Narrative bonus, enemy removal, or starting buff.
  - **Failure**: Direct damage (% of maxHP) or status debuff.
  - **Fallback**: Harder penalty if the required skill is missing entirely.

### 3. Status Engine (backend/StatusEngine.js)
- Processes DoT, HoT, Stun, Silence, Buffs, and Knockback at the start of each entity's turn.
- Handles stacking limits and duration expiration.

---

## 🎨 Frontend Systems

### 1. Combat System (js/combat-system.js)
- Owns and initializes `currentState`.
- Handles challenge selection, party formation, bot/companion selection, and firing the combat request.
- `displayCombatLog(combatResult)` is called **without** `await` intentionally — fire-and-forget keeps the UI responsive during playback.
- Imported public companions have `stats`, `skills`, `consumables`, and `equipment` included in the party snapshot so the backend can use them directly without a database lookup.
- XSS protection: public companion cards are built via DOM methods with `data-*` attributes and `addEventListener` rather than inline `onclick` strings. All user-supplied strings are passed through `escapeHtml()`.

### 2. Combat Playback (js/combat-log.js)
- **Async Rendering**: Iterates through `combatData.segments`, playing each stage's `turns` array one by one with `await sleep(delay)` between turns. Each segment shows an intro narrative (4s pause), then turn-by-turn playback, then a stage summary.
- **HP Tracking**: `hpMaxes` and `hpCurrent` maps are initialized from `participants` and updated per-segment from `participantsSnapshot` as new enemies spawn. This prevents wrong-max HP bar calculations across stages.
- **Health Bar Updates**: Triggers on any turn with a defined `targetHPAfter`, including heals — not just damage.
- **Result Modal**: After playback completes, shows `combatResultModal` with loot, XP gained, skill progress note, and a countdown timer (3s victory / 5s defeat).
- **Auto-Restart**: `startCountdown()` updates `window.currentState.selectedChallenge` to the safety net target, then calls `startCombat()` when the timer expires.
- **Bot/Import Safety**: `applyCombatRewards` skips participants whose IDs start with `import_` or match a bot in `window.gameData.bots` — these don't exist in the character database.
- **Global Modal Handlers**: `window.cancelAutoRestart` and `window.forceRestartNow` are defined outside `displayCombatLog` so they're always accessible from `index.html` `onclick` attributes.

### 3. Tooltip Management (js/gear-tooltip.js)
- Creates `div.gear-tooltip` elements appended to `document.body`.
- `destroyGearTooltip()` is a global function — must be called before any DOM re-render that replaces gear cards, otherwise the tooltip orphans on screen.
- `inventory-system.js` calls `destroyGearTooltip()` both before and after equip/unequip operations to handle the case where the mouse is still hovering over the redrawn card position.

### 4. Navigation (js/ui-helpers.js)
- `showScreen(screenName)` — switches active screen.
- `returnToHub()` — returns to the character detail screen after combat, reloading the character so XP/loot/stats are fresh. Falls back to roster if no character is loaded.
- `showError(message)` / `showSuccess(message)` — animated fixed-position toast notifications.
- `getDeviceId()` — persistent device ID stored in localStorage for ownership tracking.
- `formatNumber(num)` — formats large numbers with commas.

### 5. Content Management System (admin-editor.html)
Located in the root directory. A form-based editor for non-coders.
- **Challenge Tab**: Create/edit multi-stage dungeons, enemy spawns, pre-combat logic, and branching paths.
- **Enemy Tab**: Edit stats and skill loadouts (dropdowns populated from live `skills.json`).
- **Data Flow**: Fetches JSON via `/api/admin/data/`, edits in-memory, saves via POST to backend writers.

---

## 📊 Data Models & Flow

### Key Data Structures

**Character** (stored in SQLite):
```json
{
  "id": "char_1234567890",
  "name": "Krynn",
  "race": "human",
  "level": 3,
  "experience": 450,
  "stats": { "conviction": 8, "endurance": 7, "ambition": 6, "harmony": 4 },
  "skills": [{ "skillID": "aim", "skillLevel": 2, "skillXP": 45.5, "usageCount": 12 }],
  "equipment": { "mainHand": "iron_sword", "offHand": null, "head": null, "chest": null },
  "inventory": [{ "itemID": "leather_armor", "rarity": "common", "acquiredAt": 1234567890 }],
  "consumables": {},
  "lastSuccessfulChallengeId": "challenge_goblin_camp"
}
```

**Combat Response** (from `/api/combat/start`):
```json
{
  "result": "victory",
  "totalTurns": 39,
  "segments": [{ "stageId": 1, "title": "...", "turns": [...], "status": "victory", "participantsSnapshot": {...} }],
  "participants": { "playerCharacters": [...], "enemies": [...] },
  "rewards": { "experienceGained": { "char_xxx": 368 }, "lootDropped": [...] },
  "nextChallengeId": "challenge_goblin_camp"
}
```

### Request/Response Flow
1. User selects challenge → forms party → clicks "Begin Challenge"
2. `confirmPartyAndStart()` → `startCombat()` → `POST /api/combat/start` with full party snapshots
3. Backend: hydrates imports → runs simulation → updates safety net → saves log → returns result
4. Frontend: `showScreen('combatlog')` → `displayCombatLog(result)` (fire-and-forget)
5. Playback completes → result modal shown → countdown → `startCombat()` auto-fires

---

## 🛠 Roadmap

### High Priority (Next to Build)
1. **Combo Skill System**: Detect skill sequences (e.g., Shove → Aim → Power Shot) to trigger bonus combo effects. Hooks for `lastUsedSkillId` tracking exist in `combatEngine.js` but sequence detection logic is not yet implemented.
2. **Balance Tuning**: Variance ranges and desperation thresholds need tuning passes once more content exists.
3. **UI Polish**: Visual indicators for active combo chains, enhanced pre-combat result feedback.

### Future Ambitions
- **Advanced AI**: Target prioritization (focus healers), enemy group synergy (Shaman buffs Warrior), Boss phase changes at 50% HP.
- **Elemental Reactions**: Damage types are tagged (Fire, Oil, etc.) but reaction logic is stubbed.
- **Expanded Content**: More races, skills, items, and complex branching dungeons.
- **Real-Time Co-op**: Lobby system for human players (long-term).

---

## 🤖 Collaboration Guide for AI Assistants

### Coding Standards
- **Language**: Vanilla JS (ES6+). NO React, Vue, or jQuery.
- **Async**: Use `async/await` for all DB/API calls.
- **Safety**: Always check for `null`/`undefined` (e.g., `if (!target) return;`).
- **Logging**: Include `console.log('[MODULE] Message')` for debugging new features.
- **Non-Breaking**: Ensure schema changes include migration logic or default values for old saves.

### Workflow
1. **Save first**: Before any AI touches files, run `SAVE.bat` to create a Git snapshot.
2. **Analyze before coding**: Outline logic flow before writing code.
3. **Full files**: When modifying a file, output the entire corrected file for safe replacement.
4. **Syntax check**: Run `node --check filename.js` before replacing any file.
5. **Side-effect awareness**: Explicitly flag if a change affects tooltips, save states, or the combat loop.

### Critical Gotchas
- **`currentState` ownership**: Declared ONLY in `combat-system.js`. Never redeclare with `let`/`const` anywhere else — this breaks the entire app.
- **`showError` / `getCharacter`**: Defined in `ui-helpers.js` and `character-management.js` respectively. Do not redefine in `game-data.js` or elsewhere.
- **Playback is fire-and-forget**: `displayCombatLog()` must NOT be awaited in `startCombat()`. Awaiting it freezes the UI until combat ends.
- **Tooltips**: Fragile. Any DOM change that replaces gear cards requires `destroyGearTooltip()` called both before and after the DOM update.
- **HP bars across stages**: `hpMaxes` must be updated from `segment.participantsSnapshot` when each new stage loads, or enemy HP percentages will calculate against wrong max values.
- **Bot rewards**: Bots and imported characters must be skipped in `applyCombatRewards` — they don't exist in the character database and will 404.
- **Cache busting**: Script tags in `index.html` use `?v=N` version params. Increment N when making significant JS changes to ensure browsers load fresh files.

---

## 📝 Quick Start (Dev Environment)

1. Install: `npm install`
2. Start server: double-click `Start_Backend.bat` or run `npm start`
3. Access game: `http://localhost:3001`
4. Access editor: `http://localhost:3001/admin-editor.html`
5. Save progress: double-click `SAVE.bat`, type a description, hit Enter

---

*Shards Idle — Alpha 1.1 — Last updated March 17, 2026*
