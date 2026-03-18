# Combat AI Overhaul — Design Document
## Shards Idle Engine

**Status:** Pending — implement after full skills.json is integrated  
**Priority:** High — current AI undermines balance, skill discovery, and multi-stage tuning  
**File to modify:** `backend/combatEngine.js` — `selectPlayerAction()` and `selectEnemyAction()`

---

## Why the Current AI is Broken

The current system is a flat priority list: heal if critical → AOE if 3+ enemies → highest basePower skill available. This means:

- **Resource conservation is zero.** A character burns all stamina in Stage 1 with no awareness that Stage 2 and 3 exist. By Stage 3 they are always in desperation mode.
- **Debuff stacking is never considered.** The AI will reapply Knockback to an already-knocked-back enemy, wasting a turn.
- **Child skill discovery is accidental.** The AI doesn't prefer parent skills when a proc is close — it just picks whatever has the highest basePower.
- **Targeting is one-dimensional.** Always targets lowest HP. Never focuses a dangerous enemy, never protects a critical ally, never switches targets to break a debuff.
- **The full skill pool is wasted.** Control skills, utility skills, buffs, and debuffs are never selected because they don't show up in the DAMAGE category filter. Effectively invisible to the AI.
- **Balance tuning is impossible.** A fight calibrated against this AI will play differently once the AI improves, meaning all current difficulty settings are provisional.

---

## Design Principles for the New AI

### 1. Context Awareness
Every decision should be made with knowledge of:
- Current stage number and total stages remaining in the challenge
- Own HP%, Mana%, Stamina%
- Party HP% (for healer decisions)
- Active status effects on all combatants (own, allies, enemies)
- Enemy HP% and which enemies are most threatening

### 2. Resource Budgeting
Before each combat, the AI should estimate a **resource budget per stage**:
```
staminaBudgetPerStage = character.maxStamina / totalStages * 1.2  (slight buffer)
manaBudgetPerStage    = character.maxMana    / totalStages * 1.2
```
If current resource usage is ahead of budget (burned too much in early stages), the AI biases toward lower-cost skills. If under budget (still has plenty), it can afford premium skills.

This single change alone fixes the multi-stage depletion problem.

### 3. Synergy Awareness (Child Skill Proc Pressure)
The AI should track which parent skills are in the equipped pool and actively prefer using them in sequence to drive proc chance. Specifically:

- If the character has skill A and skill B equipped, and A+B have a known child skill in the skill definitions, the AI should apply a **proc pressure bias** — after using A, it should prefer B on the next turn over an equally-powered alternative.
- This doesn't override emergency decisions (if HP is critical, heal regardless) but applies as a tiebreaker when two skills have similar power.
- The proc system already handles the actual discovery; the AI just needs to feed it more consistently.

```js
// Pseudo-code for proc pressure bias
function hasProcOpportunity(character, lastUsedSkillId) {
    return this.skills.some(childSkill =>
        childSkill.parentSkills?.includes(lastUsedSkillId) &&
        childSkill.parentSkills.some(pid => 
            getAugmentedSkillPool(character).has(pid) && pid !== lastUsedSkillId
        )
    );
}
```

Track `lastUsedSkillId` on the character object per-turn and pass it into `selectPlayerAction`.

### 4. Debuff Awareness
Before applying a debuff, check if the target already has it active. Don't waste a Slow skill on an already-slowed enemy unless the skill has other effects worth using.

```js
function targetHasDebuff(target, debuffName) {
    return target.statusEffects?.some(e => e.id === debuffName && e.duration > 0);
}
```

Use this as a downward modifier on skill score — a skill whose primary value is its debuff scores lower if that debuff is already applied.

### 5. Threat Assessment
Not all enemies are equal. A threat score should inform targeting:

```js
function threatScore(enemy) {
    const dps = (enemy.stats.ambition || 0) * 0.5 + (enemy.stats.conviction || 0) * 0.3;
    const hpFactor = enemy.currentHP / enemy.maxHP; // higher HP = more threat remaining
    return dps * hpFactor;
}
```

**Target priority options (context-dependent):**
- **Default:** Lowest HP enemy (finish kills efficiently — current behaviour, keep as default)
- **High threat present:** Highest threat score enemy (interrupt the dangerous one)
- **Debuffer present:** Enemy with active buff on them (cleanse/interrupt)
- **Self-healing enemy:** Priority target — they waste the party's DPS if left alive

### 6. Skill Scoring System
Replace the flat priority list with a **scored candidate system**. Generate candidate actions, score each one, pick the highest. This is more extensible and easier to tune than a hard-coded priority chain.

```js
function scoreAction(character, skill, target, context) {
    let score = skill.basePower || 0;

    // Resource efficiency — prefer skills that don't blow the stage budget
    const resourceRatio = skill.costType === 'stamina'
        ? character.currentStamina / character.maxStamina
        : character.currentMana / character.maxMana;
    if (resourceRatio < 0.3) score *= 0.5; // penalise expensive skills when low

    // Debuff redundancy penalty
    if (skill.effects?.some(e => e.type === 'apply_debuff' && targetHasDebuff(target, e.debuff))) {
        score *= 0.6;
    }

    // Proc pressure bonus — reward using this skill if it sets up a child proc
    if (context.lastUsedSkillId && hasProcOpportunity(character, skill.id, context.lastUsedSkillId)) {
        score *= 1.35;
    }

    // AOE value — scale with number of alive enemies
    if (skill.category?.includes('AOE')) {
        score *= (context.aliveEnemies.length * 0.4);
    }

    // Finishing blow bonus — high-value target at low HP
    if (target && target.currentHP <= target.maxHP * 0.25) {
        score *= 1.2;
    }

    // Threat bonus — targeting the most dangerous enemy
    if (target && threatScore(target) === context.highestThreatScore) {
        score *= 1.15;
    }

    // Stage conservation penalty — late in a fight, conserve resources
    if (context.stagesRemaining > 1 && resourceRatio < 0.5) {
        score *= 0.7;
    }

    return score;
}
```

### 7. Decision Categories (what the AI considers each turn)
In order of consideration — not a strict priority list but a candidate generation pipeline:

1. **Emergency survival** — HP < 20%: strongly bias toward heals and defensive skills. Override scoring.
2. **Ally rescue** — ally HP < 30%: consider heal-target actions. Goes into scoring pool with high base score.
3. **Resource recovery** — stamina < 15% AND mana < 15%: bias toward NO_RESOURCES skills appropriately (last_stand only when genuinely critical, catch_breath if just stamina-drained).
4. **Control opportunity** — high-value debuff available on a non-debuffed target: add to scoring pool.
5. **AOE opportunity** — 2+ alive enemies (lower threshold than current 3+): add AOE skills to pool.
6. **Damage** — standard damage skills, scored and targeted intelligently.
7. **Buff window** — if no immediate threat and resources are healthy: consider buff skills.

---

## Player aiProfile

Player characters have a persistent `aiProfile` field saved to the DB and included in the character export snapshot. It controls how the scoring system weights decisions for that character.

### Profiles

- **`balanced`** (default) — the scoring system as designed above. Heals when needed, uses AOE when valuable, conserves resources across stages. Good all-rounder.
- **`aggressive`** — maximises damage output. Resource conservation multipliers are halved. Accepts higher risk of hitting desperation. Higher DPS on short challenges, unreliable on long ones.
- **`cautious`** — heavy resource conservation. Heals at 40% HP instead of 20%. Never spends above 60% of stage budget. Slower kills but arrives at late stages healthy.
- **`support`** — heavily biases toward healing allies and applying buffs before dealing damage. Ally rescue threshold raised to 50% HP. Ideal as a second party member alongside an aggressive character.
- **`disruptor`** — prioritises control and debuff skills over raw damage. Targets high-threat enemies first. Focuses on status application. Pairs well with aggressive.
- **`opportunist`** — high proc pressure bias (1.6x instead of 1.35x). Actively sequences parent skills to drive child skill discoveries. Slightly weaker in straight DPS but discovers new skills faster. **Only meaningful for your own characters — see note below.**

### The `opportunist` Profile and Imported Characters

**Important:** Imported characters fight in your party but their skill discoveries do not persist back to the original owner. The `opportunist` profile's proc pressure bonus accrues discoveries to the imported snapshot during the run, but those discoveries are not saved — the importing player gains nothing from them.

This means:
- `opportunist` is a meaningful choice only for **your own characters** where skill progression matters
- For **imported characters**, the profile affects combat behaviour only — the importer should care whether the imported character heals, tanks, or deals damage, not whether it drives proc sequences

### aiProfile in the Import/Browse UI

When browsing and importing characters, the `aiProfile` should be **visible on the character card**. This is tactically relevant information — a player building a party for a tough multi-stage challenge actively wants to find a `support` or `cautious` profile character to pair with their own `aggressive` main.

Display format on import card: a small badge next to the character name, e.g. `⚔ Aggressive` or `🛡 Support`. Tooltip explains what the profile does.

### Schema

Add to character DB record and export snapshot:
```json
{
  "aiProfile": "balanced"
}
```

Default to `"balanced"` if absent (backward compatible). Selectable on the character detail screen under a new "Combat Style" section.

---

## Enemy AI Improvements

Enemy AI should be simpler than player AI but smarter than current. Key changes:

### Target Selection
Enemies should not always focus the lowest-HP player. Vary by enemy type:

Add `aiProfile` field to enemy-types.json:
```json
{
  "aiProfile": "aggressive|tactical|support|berserker"
}
```

- **aggressive** (default): targets lowest HP player — finishes kills
- **tactical**: targets highest-threat player (highest DPS output) — disrupts the party
- **support**: if multiple enemies, occasionally buffs/heals allies instead of attacking
- **berserker**: ignores HP thresholds, never heals, uses highest-power skill always

### Debuff Awareness
Enemies should not reapply debuffs that are already active. Same check as player AI.

### Stage Awareness
Enemies don't have multi-stage resource concerns the way players do, but they should avoid wasting NO_RESOURCES skills when they still have usable combat skills. Current AI hits desperation too early because it doesn't check all skill categories — it only checks DAMAGE. It should check CONTROL, BUFF, and DEFENSE categories before falling back to NO_RESOURCES.

---

## Context Object

Both `selectPlayerAction` and `selectEnemyAction` should receive a `context` object built once per turn:

```js
const context = {
    stageIndex:          current stage number (0-based),
    totalStages:         challenge.stages.length,
    stagesRemaining:     totalStages - stageIndex - 1,
    aliveEnemies:        enemies.filter(e => !e.defeated),
    alivePlayers:        players.filter(p => !p.defeated),
    highestThreatScore:  Math.max(...aliveEnemies.map(threatScore)),
    lastUsedSkillId:     character.lastUsedSkillId || null,
    roundNumber:         current round in stage,
    // Resource budget awareness
    staminaBudgetRatio:  character.currentStamina / (character.maxStamina / Math.max(1, stagesRemaining + 1)),
    manaBudgetRatio:     character.currentMana    / (character.maxMana    / Math.max(1, stagesRemaining + 1)),
};
```

This context is passed into `selectPlayerAction(character, players, enemies, context)` and `selectEnemyAction(enemy, players, enemies, context)`.

Building it once and passing it in keeps the function signatures clean and makes the logic testable.

---

## `lastUsedSkillId` Tracking

This field already has a hook in the engine. It needs to be:
1. Set on the character object after each resolved turn: `character.lastUsedSkillId = action.skillID`
2. Reset at the start of each stage (not carried between stages)
3. Used by `checkChildSkillProc` as an additional proc pressure signal — if the selected skill is the "other parent" of a child skill whose first parent was last used, apply a proc chance bonus

---

## New Skill Categories to Handle

When the full skills.json lands, `selectPlayerAction` needs to handle:

| Category | Current Handling | Required Handling |
|---|---|---|
| `DAMAGE_AOE_MAGIC` | Not handled | Same as `DAMAGE_AOE` but prefer when enemies have buffs |
| `HEALING_AOE` | Not handled | Use when 2+ allies below 50% HP |
| `CONTROL` | Not handled | High priority when enemy is high-threat and debuff isn't active |
| `DEFENSE_STANCE` | Not handled | Consider when HP < 40% and no heal available |
| `BUFF` | Not handled | Use at round start if resources healthy and no active buff |
| `UTILITY` | Not handled | Situational — expose weakness before damage turn |
| `RESTORATION` | Not handled | Prefer over NO_RESOURCES when not yet critical |

---

## Implementation Order

When skills.json is ready:

1. **Build context object** — add to the combat loop, pass into both action selectors
2. **Add `lastUsedSkillId` tracking** — set after each resolved player turn
3. **Add `aiProfile` to character schema** — DB field, default `"balanced"`, included in export snapshot
4. **Implement `scoreAction()`** — replace the flat priority list in `selectPlayerAction`, apply profile modifiers to scoring weights
5. **Implement `threatScore()`** — used for targeting
6. **Implement `targetHasDebuff()`** — used for debuff redundancy check
7. **Implement `hasProcOpportunity()`** — used for proc pressure bonus
8. **Handle new skill categories** in the candidate generation pipeline
9. **Update `selectEnemyAction`** — add aiProfile support and debuff awareness
10. **Add `aiProfile` to enemy-types.json** — assign profiles to each enemy type
11. **Add Combat Style selector to character detail UI** — dropdown with profile descriptions
12. **Add aiProfile badge to import/browse character cards** — visible tactical information
13. **Test against Goblin Camp** — verify multi-stage resource usage is sane
14. **Test against Forest Dungeon** — verify branching + varied enemy types work
15. **Balance pass** — now that AI is playing correctly, tune enemy stats and challenge difficulty

---

## What This Unlocks

Once the AI overhaul is complete:
- Balance tuning is meaningful — fights play out as designed
- Child skill discovery rate becomes intentional, not accidental
- The full skill web is actually used — control, buff, and utility skills see play
- Multi-stage challenges feel distinct — characters arrive at Stage 3 with appropriate resources
- Enemy variety matters — an aggressive goblin and a tactical orc feel different
- The idle loop is actually fun to watch — you can see smart decisions being made
- **Player aiProfile adds a genuine tactical layer** — party composition becomes a decision, not just stat stacking. A support + aggressive pair plays differently than two aggressives or two cautious characters.
- **Import/browse becomes strategically interesting** — players hunt for specific profiles to complement their own character rather than just importing the highest-level available.

---

*Document created during development session. Implement after skills.json integration.*
