# Shards Idle

## An Asynchronous Group-Based PvE RPG

Shards Idle is a browser-based, asynchronous RPG where players build characters, manage equipment, and engage in multi-stage combat challenges against intelligent AI enemies. The game features deep stat customization, dynamic weapon variance, pre-combat skill opportunities, and a robust sharing system for characters.

## Key Features

* Dynamic Combat Engine: Turn-based combat with initiative systems, resource management (Stamina/Mana), and desperation AI.  
* Weapon Variance System: Weapons have unique "feel" profiles (e.g., Daggers are spiky/high-variance, Maces are consistent) determined dynamically by item type.  
* Pre-Combat Opportunities: Before certain stages, players can trigger skill checks (e.g., Footwork to evade traps) for narrative advantages or penalties.  
* Multi-Stage Challenges: Battles flow through sequential stages with branching paths based on player skills (e.g., Climb to access secret areas).  
* Character Progression: Deep stat allocation (Conviction, Endurance, Ambition, Harmony), skill leveling with float-based XP, and equipment optimization.  
* Share & Import System: Generate share codes for characters. Others can import them as "Companions" for their own parties (read-only linked references).  
* Admin Editor: Built-in web-based tool to edit skills, items, enemies, and challenges without touching code.

## Tech Stack

* Frontend: Vanilla JavaScript (ES6+), HTML5, CSS3. No frameworks.  
* Backend: Node.js with Express.  
* Database: SQLite3 (via better-sqlite3 or sqlite3).  
* Data Storage: JSON files for static game data (Skills, Items, Enemies); SQLite for dynamic user data (Characters, Logs).

## Project Structure

/NewGame  
├── backend/  
│ ├── routes/  
│ │ ├── combat.js \# API endpoints for combat simulation  
│ │ ├── characters.js\# CRUD for character data  
│ │ └── data.js \# Serves static JSON game data  
│ ├── combatEngine.js \# Core combat logic, AI, Variance, Pre-Combat  
│ ├── StatusEngine.js \# Status effect processing  
│ ├── database.js \# SQLite interactions  
│ └── data/ \# Static JSON data (skills.json, items.json, etc.)  
├── js/ \# Frontend modules  
│ ├── game-data.js \# Loads global data, attaches to window.gameData  
│ ├── combat-log.js \# Visual playback & reward calculation (Skill XP)  
│ ├── combat-system.js \# Challenge selection & party formation  
│ ├── inventory-system.js \# Equipment management modal  
│ ├── gear-tooltip.js \# Dynamic tooltip generation & destruction  
│ ├── character-management.js \# Creation, roster, detail view  
│ └── browse-system.js \# Share/Import functionality  
├── index.html \# Main entry point  
├── styles.css \# Global styling  
└── README.md

## Quick Start

### Prerequisites

* Node.js (v18+)  
* npm

### Installation

1. Clone the repository.  
2. Install dependencies:  
3. bash  
4. 1  
5. Initialize the database (if not auto-created):  
6. bash  
7. 1  
8. Start the server:  
9. bash  
10. 1  
11. Open http://localhost:3001 in your browser.

## Gameplay Loop

1. Create Character: Choose Race, allocate 25 stat points, pick 2 starter skills, and select a starting weapon.  
2. Select Challenge: Choose a dungeon from the roster (e.g., Goblin Encampment).  
3. Form Party: Add your character \+ up to 3 bots or imported public characters.  
4. Pre-Combat Phase: Trigger skill checks if available (e.g., Serpentine Approach).  
5. Combat: Watch the turn-by-turn playback. Manage resources; enemies adapt when desperate.  
6. Rewards: Earn XP, Gold, and Loot. Skills level up based on usage and category.

## Core Mechanics Deep Dive

### 1\. Dynamic Weapon Variance

The combatEngine.js scans items.json at startup to build weaponVarianceProfiles.

* Logic: Maps keywords (e.g., "dagger") to ranges (e.g., \[0.7, 1.4\]).  
* Execution: During damage calculation, a random multiplier is applied to the total damage (Skill \+ Weapon).  
* Result: Daggers feel volatile (high highs, low lows); Maces feel consistent.

### 2\. Pre-Combat Opportunities

Before Stage 2 (or defined stages), the engine checks for specific skills.

* Check: Calculates success chance based on PrimaryStat \+ (SecondaryStat \* 0.5).  
* Outcome:  
  * Success: Narrative bonus or enemy removal.  
  * Failure: Direct damage or status debuff.  
  * Fallback: If the player lacks the skill entirely, a harder penalty applies.

### 3\. Skill XP & Balancing

Handled in js/combat-log.js via applyCombatRewards().

* Data Source: Uses window.gameData to fetch skill definitions.  
* Category Balancing:  
  * DAMAGE\_SINGLE (e.g., Basic Attack): Nerfed to 0.5 XP per hit to prevent spam-leveling.  
  * UTILITY / HEALING: Granted 50.0 XP per use.  
* Float System: XP is stored as a float (e.g., 34.5), allowing for fine-grained progression.

### 4\. Tooltip Management

Tooltips are dynamically created divs appended to document.body.

* Bug Fix: Explicit destroyGearTooltip() calls are placed in equipItem, unequipItem, and modal close functions to prevent stuck tooltips when the DOM changes abruptly.

## Contributing

This is a personal project, but feel free to fork and experiment\!

## License

MIT  
