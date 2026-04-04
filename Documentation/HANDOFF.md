# Shards Idle — Session Handoff
*Generated end of content generation session. Read before starting work.*

---

## State of the Game

All challenge content from d1 through d16 is now written and appended to the live data files. The narrative arc is complete. The prestige loop (Sharding) exists in the story doc but is not yet mechanically implemented.

**Files modified this session:**
- `backend/data/challenges.json` — 52 challenges total, d1–d16
- `backend/data/enemy-types.json` — 205 enemy types
- `backend/data/items.json` — 573 items
- `backend/combatEngine.js` — one new method and one new code block (see below)
- `companions.json` — NEW FILE, not yet wired in (see below)

---

## What Needs Wiring — Priority Order

### 1. companions.json (frontend work)
A new file following the `bots.json` schema. Contains five companion party members for the d16 raid: Krog, the High Cantor, Elara, Valdris, and Hrolf.

Before the player launches `challenge_spire_fractured_time`, the frontend should:
1. Read `companions.json`
2. For each companion, check `requiredItem` against the player's inventory
3. For Hrolf specifically, also check `requiresChallengeNotCompleted: "challenge_gates_of_atonement"` — if the player cleared that challenge, Hrolf is dead and should not appear
4. Surface available companions as optional party members
5. Inject selected companions into `partySnapshots` before calling `runCombat`

The engine handles companions as normal party members once they're in `partySnapshots`. No engine changes needed.

**Gate items:**
- Krog → `blood_oath_token`
- High Cantor → `songbook_of_lyra`
- Elara → `unified_seed`
- Valdris → `heirs_signet`
- Hrolf → `hrolf_standing_orders` AND gates_of_atonement NOT completed

---

### 2. adaptiveEnemies — smoketest needed
A new engine feature added this session. The method `_resolveAdaptiveEnemies()` runs before `initializeEnemies` on any stage that has an `adaptiveEnemies` field.

Currently used in:
- `challenge_threshold_of_echoes` stage 2 — swaps `threshold_future_wraith` for a party-profile-specific variant based on dominant stat (conviction/harmony/ambition ≥ 140)
- `challenge_spire_fractured_time` stage 3 — same variants, same thresholds

**Needs a smoketest** when the first party reaches these challenges. Specifically verify:
- The correct variant spawns based on party stats
- The base wraith spawns correctly when no stat meets threshold (balanced party)
- The `narrative` log line appears in the backend log

The engine change is in `runCombat` around line 676 and the helper method `_resolveAdaptiveEnemies` sits just above `initializeEnemies`. It was syntax-checked but not runtime-tested.

---

### 3. d16 maxPartySize
`challenge_spire_fractured_time` has `maxPartySize: 8`. The engine does not enforce this — it's informational for the frontend. The party-building UI should allow up to 8 members for this challenge specifically (4 player + up to 4 companions, or any mix up to 8).

---

### 4. spire_fragment and Sharding
`spire_fragment` is a stackable cross-challenge item that drops guaranteed from the Architect. It is designed to accumulate across runs and feed into the Sharding prestige mechanic when the player chooses to initiate it.

The Sharding mechanic itself is **not yet implemented**. The story doc (`StoryArc.zip`) has full design spec including the Echo Visions cinematic sequence and the world-rewrite outcomes. When implementing, `spire_fragment` count could gate or flavour the Sharding options.

---

### 5. greateaxe typo
One item in `items.json` has `"type": "greateaxe"` (extra 'e') — likely a duplicate of a `greataxe` entry. Worth finding and cleaning.

---

## New Systems Added This Session

### adaptiveEnemies schema
Optional field on any stage. Evaluated at stage start against party stats/skills. First matching condition wins.

```json
"adaptiveEnemies": [
  {
    "condition": {
      "type": "stat_check",
      "stat": "conviction",
      "threshold": 140
    },
    "replace": {
      "enemyTypeID": "base_enemy_id",
      "withEnemyTypeID": "variant_enemy_id"
    },
    "narrative": "Optional backend log message."
  }
]
```

Supported condition types: `stat_check`, `has_skill_tag`, `has_skill`, `has_item`, `party_size`.
Also supports `inject` instead of `replace` to add an enemy entry rather than substitute.

---

### companions.json schema
Follows `bots.json` exactly, with two additional fields:

```json
{
  "requiredItem": "item_id",
  "requiresChallengeNotCompleted": "challenge_id"
}
```

`requiresChallengeNotCompleted` is optional and only present on Hrolf.

---

## Cross-Challenge Item Network
Full list of items that carry between challenges and unlock opportunities or branches:

`vulture_company_ledger`, `silver_halfling_coin`, `monitoring_crystal`, `thrains_complete_report`, `architects_seal`, `sigil_fragment`, `oath_stone`, `verdant_word_seal`, `royal_guard_insignia`, `guild_seal`, `unpaid_ledger`, `loyalist_seal`, `blood_oath_token`, `first_hand_shard`, `resonance_node_fragment`, `ferryfolk_lantern`, `heirs_signet`, `songbook_of_lyra`, `capital_key`, `dissolution_record`, `hrolf_standing_orders`, `ironvein_signet`, `athenaeum_scroll`, `coronation_writ`, `ancestral_verdict`, `spire_fragment`

Quest items (not consumed on use) have `slot_id1: "consumable"` and no `type` field.

---

## Calibration Notes for When Players Reach d12+

No one has a character strong enough to play d12+ content yet. When they do, watch for:

- **lord_of_decay / apocalypse / eternal_winter** — these are depth 6-7 skills on d15 bosses. If they're wiping parties too fast, consider reducing boss endurance rather than swapping skills.
- **d15 boss differentiation** — Echo of Valerius uses `apocalypse` (holy fire), Threshold Keeper uses `eternal_winter` (cold/temporal), The Unmade uses `lord_of_decay` (entropy). Each is mechanically distinct.
- **adaptiveEnemies thresholds** — the 140 stat threshold for wraith variants may be trivially exceeded by all d15 parties. Check typical stat ranges at level 60 and adjust if needed.
- **Architect difficulty** — con 280, end 320, armorValue 20, level 70, `skillSelectionCount: 2` from a pool of 6. The two skills it picks per run make every attempt different. If it's too hard, shave endurance before touching skills.

---

## Story Content Remaining

The narrative arc is complete through d16. What exists in the story doc but is not yet in the game:

- **The Sharding / Echo Visions** — prestige loop, world-rewrite cinematics, New Game+ with altered world state. Full spec in `StoryArc.zip / THE ECHO VISIONS_EPILOGUES.txt`.
- **Shard Memory system** — the mechanic by which specific choices carry into the next cycle and change the world. Referenced in the story doc, not yet designed mechanically.
- **Post-Sharding world state** — challenges should reflect different world states based on Shard Memory choices (Bram alive, Verdant Word standing, etc.). This is a significant feature requiring conditional challenge/NPC state.

---

## Files to Read Before Starting Work

1. `shards_idle_working_relationship.md` — how to work with this developer
2. `challenge_generation_dossier.md` — schema reference and authoring rules for challenges
3. `skill_depth_reference.md` — skill depth table for enemy calibration
4. This document

The story arc files (`StoryArc.zip`) are useful for lore context but the narrative is now fully implemented in challenge content — read them for tone reference, not as a spec to follow literally.
