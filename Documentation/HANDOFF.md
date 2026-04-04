Shards Idle — Session Handoff
Generated end of session. Read before starting work.

State of the Game
All challenge content d1–d16 is written and live. The companion system is fully wired. Several item/skill gaps identified in the cross-challenge network have been resolved. The prestige loop (Sharding) is scoped but not yet implemented.
Files modified this session:

backend/routes/data.js — companions.json loaded into gameData
backend/combatEngine.js — Krog enemy suppression when companion_krog_contracted is in party; weapon on-hit procs added to augmented skill pool; adaptiveEnemies block refactored to let for mutability
backend/data/companions.json — 9 companions total; Valdris requiredItem corrected to coronation_writ; Bram added
backend/data/items.json — greateaxe typo fixed; moon_touched_apple schema corrected; styptic_powder and stamina_ration wired to new cleanse skills
backend/data/skills.json — two new skills: cleanse_bleed (Clot), cleanse_exhaustion (Second Wind)
js/combat-system.js — companion auto-injection generalised to use allowedChallenges; no longer hardcoded to d16
js/combat-log.js — questHints computed and passed into animateCombatRewards payload
js/combat-rewards.js — quest item hint section added to rewards modal
js/offline-summary.js — quest item hint section added to offline summary
js/game-data.js — window.getQuestItemHints() helper added


What Needs Doing — Priority Order
1. adaptiveEnemies smoketest
The _resolveAdaptiveEnemies() method was added last session and is syntax-checked but not runtime-tested. When a party first reaches challenge_threshold_of_echoes stage 2 or challenge_spire_fractured_time stage 3, run a combat and paste the backend log. Verify:

Correct variant spawns based on dominant stat (conviction/harmony/ambition ≥ 140)
Base wraith spawns correctly for a balanced party
Narrative log line appears

2. Prestige / Sharding system
Scoped and ready to implement. Full design in StoryArc.zip / THE ECHO VISIONS_EPILOGUES.txt. The mechanical spec agreed this session:

Shard Memory passives — player picks memories based on challenges completed; each grants a themed stat bonus (Save Lyra → harmony, Prevent the Dissolution → conviction, etc.)
Cycle XP/gold multiplier — small per-cycle bonus, caps at a reasonable ceiling
Starting gear — one or two guaranteed items on cycle 2+, varying by memory choices
Cosmetics — cycle counter in UI, title or avatar frame indicator
Echo Visions — cinematic sequence on Sharding, full spec in story doc
Reset — strips XP, gear, level; retains Shard Memories and cycle counter

Memory availability gates on challenge completions — you only have "Save Lyra" if you cleared the Moonlit Ferry. Implementation needs: character schema changes, new prestige endpoint, Echo Visions UI, Sharding trigger post-d16.
The world reacting to Shard Memories (altered challenges, living/dead NPCs, conditional enemy rosters) is expansion territory — not this implementation.
3. World-reaction expansion
Challenges behaving differently based on Shard Memory choices. Bram alive, Verdant Word standing, gates open from day one. Significant feature requiring conditional challenge/NPC state. Do not start until prestige loop is complete and stable.

Companion System — Current State
9 companions in companions.json. Auto-inject on combat start based on player inventory and challenge ID. No player-facing UI — they simply appear in the fight.
Scoped companions (allowedChallenges field):

companion_elara_fragment — oath_stone → gallery_fractured_light
companion_krog_contracted — blood_oath_token → field_of_settled_debts (suppresses chieftain_krog enemy)
companion_hrolf_gates — hrolf_standing_orders → gates_of_atonement

D16 companions (no allowedChallenges — fallback to spire_fractured_time):

companion_chieftain_krog — blood_oath_token
companion_high_cantor — songbook_of_lyra
companion_elara_unified — unified_seed
companion_valdris_third_heir — coronation_writ
companion_captain_hrolf — hrolf_standing_orders AND gates_of_atonement NOT completed
companion_bram_ferryman — ferryfolk_lantern


New Systems Added This Session
Quest Item Hints
window.getQuestItemHints(challenge, character) in game-data.js. Scans challenge opportunities and branch conditions for requiredItemID / has_item references, cross-checks against player inventory, returns hint objects for items the player is carrying that are relevant to the current challenge. Rendered in the rewards modal (combat-rewards.js) and offline summary (offline-summary.js) as a muted "✦ Your Pack" section.
Weapon Proc Skills in Augmented Pool
getAugmentedSkillPool now includes onhit_skillid_1/2/3 from equipped mainHand and offHand weapons. This unblocks the entire bard and shaman skill lines, which gate on proc_chime, proc_melody, proc_echo, proc_resonance, proc_harmony, and proc_lullaby. Previously these procs never entered the pool so their child combos could never fire or be discovered.
New Consumable Skills

cleanse_bleed (Clot) — removes bleed and deep_wound via targeted cleanse
cleanse_exhaustion (Second Wind) — removes exhaustion

Wired to: styptic_powder → cleanse_bleed, stamina_ration → cleanse_exhaustion, moon_touched_apple → nature_touch (schema also corrected from non-standard fields).

Cross-Challenge Item Network
Full list of items that carry between challenges. Quest items use slot_id1: "consumable" with no type field, consumable: false, stackable: false (except spire_fragment which is stackable). They are never consumed by opportunity checks.
vulture_company_ledger, silver_halfling_coin, monitoring_crystal, thrains_complete_report, architects_seal, sigil_fragment, oath_stone, verdant_word_seal, royal_guard_insignia, guild_seal, unpaid_ledger, loyalist_seal, blood_oath_token, first_hand_shard, resonance_node_fragment, ferryfolk_lantern, heirs_signet, songbook_of_lyra, capital_key, dissolution_record, hrolf_standing_orders, ironvein_signet, athenaeum_scroll, coronation_writ, ancestral_verdict, spire_fragment, unified_seed, heir_signet, ironvein_field_orders, seed_of_first_tree, petitioners_verdict
Note: heirs_signet (type: ring) and heir_signet (no type) are two distinct items. The former is used in the alliance arc and gates Elara Fragment; the latter is used in the tribunal/coronation arc.

Calibration Notes for When Players Reach d12+
No one has a character strong enough to play d12+ content yet. When they do, watch for:

lord_of_decay / apocalypse / eternal_winter — depth 6-7 skills on d15 bosses. If wiping parties too fast, reduce boss endurance before touching skills.
d15 boss differentiation — Echo of Valerius uses apocalypse, Threshold Keeper uses eternal_winter, The Unmade uses lord_of_decay. Each is mechanically distinct.
adaptiveEnemies thresholds — the 140 stat threshold for wraith variants may be trivially exceeded by all d15 parties. Check typical stat ranges at level 60 and adjust if needed.
Architect difficulty — con 280, end 320, armorValue 20, level 70, skillSelectionCount: 2 from a pool of 6.


Files to Read Before Starting Work

shards_idle_working_relationship.md — how to work with this developer
challenge_generation_dossier.md — schema reference and authoring rules
skill_depth_reference.md — skill depth table for enemy calibration
This document