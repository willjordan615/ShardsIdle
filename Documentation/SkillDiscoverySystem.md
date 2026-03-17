# Skill Discovery System — Design Specification

Project: Shards Idle
Status: Designed, Not Yet Implemented
Priority: High (Next Major Feature)
Last Updated: March 17, 2026

---

## Overview

The Skill Discovery System is a hidden skill tree where players unlock new skills by using combinations of skills they already own. The system is designed to feel like an alchemy game — players discover combinations organically through play rather than following a visible progression tree. Discovery is rewarding precisely because it is unexpected.

The system extends naturally from the existing two-slot skill economy and consumable belt without requiring a redesign of either.

---

## Core Design Principles

- **Discovery over instruction**: Players are never told what combinations exist. The game hints at them through natural combat procs.
- **Constraint as design**: Two skill slots forever. The choice of what to equip is the game.
- **Everything is a skill**: Consumables grant temporary access to skills already in `skills.json`. There is no special consumable parent type — it is always Skill + Skill in code.
- **Ownership is earned**: A child skill must reach level 1 through natural proc XP before it becomes equippable.

---

## Slot Economy

| Slot Type | Count | Description |
|-----------|-------|-------------|
| Skill slots | 2 | Chosen at character creation. Always filled — never empty. |
| Consumable belt | 4 | Grants temporary access to consumable skills during combat. Depletes on use. |

Skill slots are swappable at any time in character detail (see Skill Swapping section). Both slots must always be filled — swapping means replacing, never removing.

There is no slot expansion planned. The two-slot constraint is intentional design.

---

## Skill Ownership

A skill is selectable for a slot if either condition is true:
- `isStarterSkill: true` — all starter skills are always available to all characters regardless of level
- The character's skill record for that skill has `skillLevel >= 1` — earned through discovery

Consumable-sourced skills (e.g. `produce_flame` from a torch) are never selectable in a skill slot. They become temporarily available via the belt during combat only. They are gated naturally by consumable quantity — no special flag needed.

---

## Recipe Types

There is only one recipe type in code: **Skill + Skill**.

Consumables grant temporary access to a skill during combat. When that consumable is on the belt with quantity > 0, the engine treats its `effect_skillid` as an available skill alongside the character's two equipped skills. When the consumable runs out, that skill is no longer available for that combat.

This means all child skill recipes are defined identically:

```json
{
  "parentSkills": ["basic_attack", "produce_flame"]
}
```

Whether `produce_flame` came from a skill slot or a consumable belt is irrelevant to the recipe. The engine just checks whether the character currently has access to both parent skills.

Child skills can themselves become parents. The skill graph has no depth limit, though in practice it is bounded by how many recipes are defined in the data.

---

## Data Structure

### skills.json additions

Child skills are defined as normal skills with additional fields:

```json
{
  "id": "burning_strike",
  "name": "Burning Strike",
  "description": "A strike that carries the memory of flame.",
  "isChildSkill": true,
  "isStarterSkill": false,
  "parentSkills": ["basic_attack", "produce_flame"],
  "procChance": 0.05,
  "skillType": "DAMAGE_SINGLE",
  "category": "DAMAGE_SINGLE",
  "basePower": 1.4,
  "costType": "stamina",
  "costAmount": 8,
  "delay": 900
}
```

**Key fields:**
- `isChildSkill: true` — flags this skill for proc checking and discovery visual treatment. Not an ownership gate.
- `isStarterSkill: false` — child skills are never in the starter pool
- `parentSkills` — exactly two skill IDs. Always two. No exceptions.
- `procChance` — base proc rate (recommended 0.04–0.06)
- `skillType` — must match the AI's chosen skill type for the proc to be eligible (see Proc Conditions)

### character.skills additions

Child skills are added to `character.skills` on first proc only. They are never pre-populated.

```json
{
  "skillID": "burning_strike",
  "skillLevel": 0,
  "skillXP": 20.0,
  "usageCount": 1,
  "lastUsed": 1234567890,
  "discovered": true,
  "discoveredAt": 1234567890
}
```

`skillLevel: 0` means discovered but not yet unlocked. Unequippable until `skillLevel >= 1`.

---

## Proc Conditions

The proc check runs in `combatEngine.js` after the AI selects a skill for a player character's turn, before execution.

**All of the following must be true for a child skill to be eligible:**

1. Both parent skills are currently available to the character:
   - Parent is in an equipped skill slot, OR
   - Parent is the `effect_skillid` of a consumable on the belt with quantity > 0
2. The child skill's `skillType` matches the `skillType` of the AI's chosen skill for this turn
3. The character owns the child skill at any level OR it has never been discovered yet (first proc creates the record)

**Proc resolution:**
1. AI selects a skill — note its `skillType`
2. Scan all child skills in `skills.json` where both parents are available
3. Filter to those whose `skillType` matches the selected skill's type
4. Shuffle the eligible list (random order to prevent systematic blocking)
5. Roll `procChance` for each in order — first success wins
6. If a proc fires: replace the selected skill with the child skill for this turn
7. If the proc parent was a consumable: decrement the consumable quantity
8. Award child skill XP, flag the turn as `child_skill_proc` in the combat log
9. If no proc fires: proceed with the AI's original selection

---

## XP & Unlock

Child skills use a dedicated XP rate separate from the category-based system:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| XP per proc | 20 | Category-neutral, consistent |
| Level 1 threshold | 120 XP | Same formula as existing skills |
| Procs to unlock | ~6 | Meaningful but not a grind |
| Combats to unlock | ~12 | At 5% proc rate, ~10 eligible turns per combat |

Once a child skill reaches level 1 it becomes equippable. Subsequent levels use the existing skill XP formula and category rates — child skills are normal skills once unlocked.

---

## Discovery Feedback

### In combat (combat-log.js)

A proc turn gets `action.type: "child_skill_proc"` in the log event.

**First proc ever (skill newly created on character):**
```
✨ An unknown technique fires — something new was discovered!
[skill executes normally with damage/effect]
```
The skill name is revealed. Mystery framing is used for the header but the name appears — players need to know what to look for. Rendered with gold border and distinct styling.

**Subsequent procs (skill exists but below level 1):**
```
⚡ Burning Strike (Lv.0) — XP: 40/120
[skill executes normally]
```
Subtler treatment. Shows progress toward unlock.

**Proc after level 1 (already unlocked, just firing naturally):**
Normal skill execution. No special treatment — it is just a skill now.

### Victory modal

After combat, the result modal gets a "Discoveries" section if any child skill procs occurred:

```
🔮 Discoveries This Combat
• Burning Strike — First discovered! (20/120 XP to unlock)
• Lunge — Progress: 80/120 XP to unlock
```

This section only appears if at least one child skill proc fired during the combat. It does not appear if all child skills in the combat were already above level 1.

---

## Skill Swapping (Character Detail)

Players can swap either skill slot at any time from the character detail screen.

**Rules:**
- Both slots must always be filled — swapping means replacing, never removing
- Selectable skills: all `isStarterSkill: true` skills + any skill with `skillLevel >= 1` on this character
- Consumable skills are never selectable
- Child skills below level 1 are not selectable

**UI:** A simple modal or dropdown triggered from the skill display on the character detail screen. Shows owned skills with their current level. Replaces the selected slot on confirm.

---

## Implementation Order

1. **`skills.json`** — Add `isChildSkill`, `parentSkills`, `procChance` fields. Define initial child skill recipes for starter skill combinations (Basic Attack + Footwork, etc.)
2. **`combatEngine.js`** — Build augmented skill pool at combat start (equipped skills + consumable belt skills). Add proc check post-AI-selection. Add `child_skill_proc` turn type to log.
3. **`combat-log.js`** — Add visual treatment for `child_skill_proc` turn type.
4. **`combat-log.js` (modal)** — Add Discoveries section to victory modal.
5. **`character-management.js`** — Add skill swap UI to character detail screen.
6. **`index.html`** — Add skill swap modal HTML.
7. **Balance pass** — Tune `procChance` and child skill XP rate against real play data.

---

## Open Questions (Deferred)

- **Reaction slots** — Skills that fire in response to events (taking damage, enemy using a skill type, HP threshold). Deliberately deferred until the base discovery system is built and played.
- **Support slots** — Passive or ally-targeting skills. Same deferral.
- Both of these will interact with the discovery system in ways that are hard to anticipate before the base system exists. Design them after play observation.

---

## What Does Not Exist Yet

- Any child skill definitions in `skills.json`
- `isChildSkill` field on any skill
- `parentSkills` field on any skill
- Proc check logic in `combatEngine.js`
- Consumable skill pool augmentation in `combatEngine.js`
- `child_skill_proc` turn type in combat log
- Discoveries section in victory modal
- Skill swap UI in character detail

---

*Shards Idle — Skill Discovery System Spec — March 17, 2026*
