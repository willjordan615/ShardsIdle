# Shards Idle: Comprehensive Technical Documentation

Version: Alpha 1.0 (Functional)  
Last Updated: March 16, 2026  
Core Philosophy: Asynchronous, Turn-Based, Data-Driven, Vanilla JS.  
---

## 🚀 Executive Summary

Shards Idle is a browser-based, asynchronous group PvE RPG. Players build characters, manage equipment, and simulate multi-stage battles against intelligent AI. The backend calculates the entire fight instantly, returning a structured log that the frontend plays back visually.  
Key Differentiators:

* Asynchronous Combat: No real-time server state; battles are simulated on-demand.  
* Dynamic Weapon Variance: Weapons have distinct "feel" profiles (volatility) determined by keywords, not hardcoded stats.  
* Pre-Combat Skill Checks: Narrative and mechanical branches triggered before battle stages based on player skills.  
* Float-Based Progression: Skills level with fractional XP (e.g., Level 2.45) with category-based balancing to prevent spam-leveling.  
* Form-Based CMS: A built-in web editor (admin-editor.html) allows full management of challenges, enemies, and skills without touching JSON files.

---

## 🏗 Architecture & Tech Stack

### Technology

* Frontend: Vanilla JavaScript (ES6+), HTML5, CSS3. No frameworks.  
* Backend: Node.js with Express.  
* Database: SQLite3 (better-sqlite3 or sqlite3) for user data.  
* Static Data: JSON files (skills.json, items.json, enemies.json, challenges.json).

/NewGame   
├── backend/   
│   ├── routes/   
│   │   ├── combat.js       \# API endpoints for simulation  
│   │   ├── characters.js   \# CRUD for user data  
│   │   └── data.js         \# Serves static JSON & Admin data  
│   ├── combatEngine.js     \# CORE: Logic, AI, Variance, Pre-Combat  
│   ├── StatusEngine.js     \# DoT, HoT, Stuns, Buffs  
│   ├── database.js         \# SQLite interactions  
│   └── data/               \# Static JSON source of truth  
├── js/   
│   ├── game-data.js        \# Loads global data \-\> window.gameData  
│   ├── combat-system.js    \# Party formation & Challenge selection  
│   ├── combat-log.js       \# Visual playback & Reward calculation  
│   ├── inventory-system.js \# Equipment modal logic  
│   ├── gear-tooltip.js     \# Dynamic tooltip generation/destruction  
│   ├── character-management.js \# Roster & Creation  
│   └── browse-system.js    \# Share/Import codes  
├── admin-editor.html       \# 🛠 CMS: Form-based data editor (Root)  
├── index.html              \# Main entry point  
└── styles.css

## ⚔️ Core Combat Systems

### 1\. The Combat Engine (backend/combatEngine.js)

The stateless simulator. It accepts a party and challenge ID, runs a while loop until victory/defeat, and returns a combatLog array.

#### A. Initialization

* Stat Aggregation: Combines Base Race Stats \+ Attribute Points \+ Equipment \+ Passives.  
* Weapon Variance Profiling: Scans items.json at startup.  
  * Logic: Maps keywords to ranges (e.g., "dagger" → \[0.7, 1.4\], "mace" → \[0.9, 1.1\]).  
  * Calculation: Final Dmg \= (Base \+ Weapon) \* Random(VarianceRange).

#### B. The Turn Loop

1. Initiative: Sort entities by Speed. Ties broken randomly.  
2. Action Selection:  
   * Players: Auto-simulated via Priority Queue (e.g., "Heal if HP \< 30%").  
   * Enemies: Uses Desperation AI (shifts behavior at \<30% HP to high-risk/high-reward moves).  
3. Resolution: Accuracy check → Damage/Heal Calc → Status Application.  
4. Logging: Every event pushed to combatLog with metadata (timestamp, source, target, values).

#### C. Multi-Stage & Branching

* Battles consist of sequential stages defined in challenges.json.  
* Branching: At stage end, the engine checks stageBranches. If a condition is met (e.g., has\_skill: climb), it jumps to a specific nextStageId instead of the default next index.  
* Persistence: Survivors retain HP/Resources between stages unless specified otherwise.

### 2\. Pre-Combat Opportunities

Triggered before specific stages (configured in Challenge Editor).

* Check: SuccessChance \= PrimaryStat \+ (SecondaryStat \* 0.5) vs Threshold.  
* Outcomes:  
  * Success: Narrative bonus, enemy removal, or buff.  
  * Failure: Direct damage (%) or debuff.  
  * Fallback: Penalty applied if the required skill is missing entirely.

### 3\. Status Engine (backend/StatusEngine.js)

* Processes effects at the start of each turn.  
* Supports: DoT, HoT, Stun, Silence, Buffs.  
* Handles stacking limits and duration expiration.

---

## 🎨 Frontend Systems

### 1\. Combat Playback (js/combat-log.js)

* Async Rendering: Iterates through the server-provided combatLog using setTimeout to animate turns without blocking the UI.  
* Reward Calculation (applyCombatRewards):  
  * Scans log for skill usage.  
  * Category Balancing:  
    * DAMAGE\_SINGLE: 0.5 XP/hit (anti-spam).  
    * UTILITY/HEALING: 50.0 XP/use.  
  * Updates window.gameData character objects with float XP.  
* Defeat Handling: Explicitly checks for Victory: false to prevent null-reference errors on reward distribution.

### 2\. Tooltip Management (js/gear-tooltip.js)

* Mechanism: Dynamically creates div elements appended to document.body.  
* Critical Rule: Must call destroyGearTooltip() before any DOM re-render (modal open/close, inventory update) to prevent "stuck" tooltips.

### 3\. Content Management System (admin-editor.html)

Located in the root directory. A Form-Based Editor for non-coders.

* Challenge Tab:  
  * Create/Edit multi-stage dungeons.  
  * Enemy Spawns: Modal to add enemies with Level and Count Ranges.  
  * Pre-Combat Logic: Form to define Skill Checks, Success/Fail/Fallback narratives, and effects (Damage, Status, Remove Enemy).  
  * Branching: UI to set conditional stage transitions.  
* Enemy Tab:  
  * Edit Stats (Conviction, Endurance, Ambition, Harmony).  
  * Skill Loadouts: Dynamic dropdowns (populated from live skills.json) to assign skills to enemies.  
* Data Flow: Fetches JSON via /api/admin/data/, edits in-memory, and saves via POST to backend writers.

---

## 📊 Data Models & Flow

### Key Data Structures

* Character: { id, race, stats: {}, skills: \[{id, xp}\], equipment: {} }  
* Challenge: { id, stages: \[{ stageId, enemies: \[\], preCombatOpportunities: \[\], stageBranches: \[\] }\] }  
* Combat Log Event: { turn: int, actor: id, action: string, target: id, value: float, narrative: string }

### Request/Response Flow

1. User: Selects Challenge → Forms Party → Clicks "Start".  
2. Frontend: Sends POST /api/combat/start with full party state.  
3. Backend:  
   * Runs combatEngine.js simulation (instant).  
   * Saves result to SQLite (Logs, XP, Gold).  
   * Returns { victory: bool, log: \[\], rewards: {} }.  
4. Frontend:  
   * Triggers combat-log.js playback.  
   * Applies rewards to local state.

---

## 🛠 Immediate Needs & Roadmap

### High Priority (Active Development)

1. Combo Skill System:  
   * Goal: Detect sequences (e.g., Skill A → Skill B) to trigger bonus effects.  
   * Status: Architecture planned; code hooks needed in combatEngine.js to track lastUsedSkillId.  
2. Balance Tuning:  
   * Adjust variance ranges and AI desperation thresholds to reduce RNG frustration.  
3. UI Polish:  
   * Visual indicators for active combos.  
   * Enhanced feedback for Pre-Combat results.

### Future Ambitions

* Advanced AI: Target prioritization (focus healers), enemy synergy (buffs), Boss phase changes.  
* Elemental Reactions: Oil \+ Fire \= Explosion logic.  
* Real-Time Co-op: Lobby system for human players (Long-term).

---

## 🤖 Collaboration Guide for AI Assistants

### Coding Standards

* Language: Vanilla JS (ES6+). NO React, Vue, or jQuery.  
* Async: Use async/await for all DB/API calls.  
* Safety: Always check for null/undefined (e.g., if (\!target) return;).  
* Logging: Include console.log('\[MODULE\] Message') for debugging new features.  
* Non-Breaking: Ensure schema changes include migration logic or default values for old saves.

### Workflow Preferences

1. Analyze First: Outline logic flow before writing code.  
2. Full Files: When modifying a file, output the entire corrected file content for safe copy-pasting.  
3. Side-Effect Awareness: Explicitly warn if a change affects Tooltips, Save States, or the Combat Loop.  
4. Iterative Chunks: Implement small, testable features rather than massive refactors.

### Known Quirks & Gotchas

* Tooltips: Fragile. Any DOM change requires destroyGearTooltip().  
* Playback: Do not await the visual playback function in the start routine; it must be fire-and-forget to keep UI responsive.  
* Data Loading: Ensure window.gameData is fully populated before initializing combat or character creation.  
* Admin Editor: Relies on /api/data/skills being available. New skills appear instantly upon reload.

---

## 📝 Quick Start (Dev Environment)

1. Install: npm install  
2. Run: node backend/server.js (or npm start)  
3. Access:  
   * Game: http://localhost:3001  
   * Editor: http://localhost:3001/admin-editor.html  
4. Debug: Check Network tab for /api/combat/start payload and response logs.

---

Generated for Shards Idle Project \- Alpha State

