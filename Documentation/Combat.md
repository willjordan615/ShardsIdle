# Combat System Documentation (combat.md)

Project: Shards Idle  
Status: Functional Alpha  
Core Files: backend/combatEngine.js, js/combat-system.js, js/combat-log.js  
---

## 1\. System Overview

The combat system is an asynchronous, turn-based engine that simulates multi-stage PvE encounters. It separates logic (Backend) from presentation (Frontend). The backend calculates the entire battle state instantly and returns a log of events, which the frontend plays back visually to the user.

### Key Architectural Principles

* Stateless Simulation: The server does not maintain active combat sessions in memory; it processes a request, simulates the fight, saves the result, and returns the log.  
* Deterministic Variance: While RNG is used for hits/crits/variance, the seed is derived from the turn state to ensure consistency during replay if needed.  
* Modular Logic: Damage calculation, AI decision-making, and status effects are handled in distinct functions within combatEngine.js.

---

## 2\. Core Components

### A. Combat Engine (backend/combatEngine.js)

The heart of the simulation. It orchestrates the loop, manages turns, and resolves actions.

#### 1\. Initialization & Setup

* Party Validation: Verifies character data, equipment, and skill lists.  
* Stage Loading: Loads the specific challenge stage configuration (enemies, terrain, pre-combat checks).  
* Stat Aggregation: Calculates final stats (HP, Stamina, Mana, Speed) by combining:  
  * Base Race Stats  
  * Allocated Attribute Points (Conviction, Endurance, Ambition, Harmony)  
  * Equipment Bonuses  
  * Skill Passive Buffs

#### 2\. The Turn Loop

The engine runs a while loop until Victory or Defeat conditions are met.

1. Initiative Sort: Entities (Players \+ Enemies) are sorted by Speed stat. Ties are broken randomly.  
2. Action Selection:  
   * Players: Uses a priority queue based on defined AI behavior (e.g., "Heal if HP \< 30%", else "Attack Lowest HP"). Note: In the current alpha, player actions are auto-simulated based on this logic.  
   * Enemies: Uses the Desperation AI (see Section 3).  
3. Execution:  
   * Check resource costs (Stamina/Mana).  
   * Apply accuracy checks.  
   * Calculate Damage/Healing (see Section 4).  
   * Apply Status Effects.  
4. Post-Turn Cleanup: Remove expired buffs/debuffs, regenerate resources.  
5. Log Generation: Every action is pushed to a combatLog array with timestamps and metadata.

#### 3\. Multi-Stage Logic

* Battles can consist of multiple sequential stages.  
* Upon clearing a stage, surviving entities retain their current HP/Resources (unless specified otherwise).  
* The engine automatically loads the next stage configuration and resumes the loop.  
* Branching: If a stage has branching paths (based on pre-combat results), the engine selects the correct next stage ID.

### B. Combat System (js/combat-system.js)

The frontend controller responsible for setup and initiation.

* Party Formation: Allows users to select their main character and fill slots with bots or imported "Companion" codes.  
* Challenge Selection: Interfaces with window.gameData to list available dungeons.  
* Pre-Combat Phase:  
  * Detects skills tagged for pre-combat (e.g., Footwork, Serpentine Approach).  
  * Prompts the user (or auto-resolves based on settings) to attempt skill checks.  
  * Modifies the initial combat state (e.g., removes an enemy, applies a buff) before sending the request to the backend.  
* Request Handling: Sends the full party state and challenge ID to the /api/combat/start endpoint.

### C. Combat Log (js/combat-log.js)

The visual playback and reward processor.

* Asynchronous Playback:  
  * Receives the combatLog array from the server.  
  * Iterates through events using setTimeout or requestAnimationFrame to animate turns one by one.  
  * Updates DOM elements (health bars, floating text, action descriptions) in real-time.  
* Reward Calculation (applyCombatRewards):  
  * Triggered immediately after simulation ends (before or during playback).  
  * XP Distribution:  
    * Scans the log for skill usage.  
    * Applies Category Balancing:  
      * DAMAGE\_SINGLE: 0.5 XP per hit (prevents spam-leveling).  
      * UTILITY / HEALING: 50.0 XP per use.  
    * Updates character skill levels using Float-Based XP (e.g., Level 2.45).  
  * Loot & Gold: Adds rewards to the character profile.  
* Defeat Handling:  
  * Detects Victory: false.  
  * Prevents null-reference errors when calculating rewards for dead characters.  
  * Displays "Defeated" screen with options to retry or return to hub.

---

## 3\. Specialized Mechanics

### Dynamic Weapon Variance

Implemented in combatEngine.js damage calculation.

* Profile Mapping: At startup, items.json is scanned. Keywords map to variance ranges:  
  * "dagger" → \[0.7, 1.4\] (High volatility)  
  * "mace" → \[0.9, 1.1\] (Consistent)  
  * "sword" → \[0.8, 1.2\] (Balanced)  
* Application: Final Damage \= (Base Skill Dmg \+ Weapon Dmg) \* Random(VarianceRange).  
* Impact: Creates distinct "feel" for weapons without needing unique code for every item.

### Desperation AI

Enemy behavior shifts dynamically based on HP thresholds.

* Normal State: Uses standard rotation (Basic Attack \-\> Cooldown Skill).  
* Desperate State (\<30% HP):  
  * Ignores resource conservation.  
  * Prioritizes high-damage, high-cooldown abilities.  
  * May target low-HP players specifically (Glass Cannon strategy).

### Pre-Combat Opportunities

Before the main loop starts, the engine checks for specific skills in the party.

* Logic: SuccessChance \= PrimaryStat \+ (SecondaryStat \* 0.5).  
* Outcomes:  
  * Success: Narrative bonus (e.g., "You bypassed the trap"), enemy removal, or starting buff.  
  * Failure: Direct damage or debuff applied to the party.  
  * Fallback: If the skill is missing entirely, a hardcoded penalty is applied (e.g., "You walked into the trap blindly").

### Status Effect Engine (StatusEngine.js)

* Handles DoT (Damage over Time), HoT (Heal over Time), Stuns, and Silences.  
* Processes at the start of each entity's turn.  
* Supports stacking limits and duration tracking.

---

## 4\. Data Flow Diagram

mermaid  
Code  
Preview  
---

## 5\. Known Quirks & Safety Checks

### Tooltip Management

* Issue: Dynamic DOM updates during combat playback can cause tooltips to stick or crash.  
* Fix: destroyGearTooltip() is explicitly called before opening modals or updating inventory views mid-combat (if applicable).

### Async Playback

* Rule: The frontend playback function must not block the main thread.  
* Implementation: Uses non-blocking timers. The await keyword is avoided in the render loop to keep the UI responsive.

### Null Safety

* Check: All damage/healing functions verify target \!== null and target.hp \> 0 before execution.  
* Edge Case: Handles scenarios where a character dies during a pre-combat phase or via DoT before their turn initiates.

### Data Integrity

* Schema Compatibility: Combat logs store skill IDs, not names, to ensure old logs remain valid if skill names change.  
* Float Precision: XP is stored as floats in SQLite; rounding only occurs for display purposes.

---

## 6\. Future Expansion Points (Hooks)

The current codebase includes commented placeholders for:

1. Combo System: Logic hooks exist to track lastUsedSkillId. Ready for sequence detection implementation.  
2. Elemental Reactions: Damage types are tagged (Fire, Oil, etc.) but reaction logic is currently stubbed.  
3. Target Priority AI: Current AI is basic; structure allows for swapping in complex targeting algorithms (e.g., "Focus Healer").

---

Generated based on README.md, Project Ambitions and Tips.txt, and current codebase analysis.

