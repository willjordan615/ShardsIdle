# Shards Idle — Skill Depth Reference
*Generated from skills.json. Used by AI sessions for content generation — enemy skill pools, bot pools, challenge design.*
*Re-run `generate_skill_depth_reference.py` from the project root after adding new skills.*

## What Depth Means

Depth reflects position in the combo discovery tree:
- **Depth 1** — Base skills. No parents. Available from the start.
- **Depth 2** — First-tier combos. Require two depth-1 parents.
- **Depth 3** — Second-tier combos. At least one depth-2 parent.
- **Depth 4+** — Advanced combos. Rare, powerful, thematically significant.

## Content Generation Guidelines

### Enemy Skill Pools (by challenge level)

| Enemy Level Range | Max Depth | Notes |
|---|---|---|
| 1–3 | 1–2 | Grunts and fodder. Depth 2 only on brutes or notable enemies. |
| 4–8 | 2–3 | Veterans and specialists. Depth 3 appropriate for mid-tier enemies. |
| 9–15 | 3–4 | Elite enemies and mini-bosses. Depth 4 reserved for named elites. |
| 16–25 | 4 | Strong named enemies. Depth 4 across the board is acceptable. |
| 26+ | 4–5 | Boss-tier only. Depth 5+ should be rare and intentional. |
| Boss/Unique | 4–6 | Bosses can reach d5–6. Depth 7 only for endgame/lore enemies. |

### Bot Skill Pools (procedural generation)

Bots use the same thresholds, applied by bot level:

| Bot Level | Max Depth Available |
|---|---|
| 1–12 | 1–2 (static bots.json) |
| 13–19 | 2 |
| 20–39 | 3 |
| 40–100 | 4 |
| Never | 5+ (bots never reach d5+) |

### Thematic Fit by Category

When assigning skills to an enemy archetype, match category to role:

| Archetype | Primary Categories | Secondary Categories |
|---|---|---|
| Defender/Tank | DEFENSE, CONTROL (taunt) | BUFF |
| Bruiser/Warrior | DAMAGE_SINGLE, BUFF | CONTROL |
| Assassin/Rogue | DAMAGE_SINGLE, DEFENSE_PROC | CONTROL, UTILITY |
| Mage/Caster | DAMAGE_MAGIC, DAMAGE_AOE | BUFF |
| Support/Healer | HEALING, HEALING_AOE | BUFF, RESTORATION |
| Utility/Shaman | RESTORATION, UTILITY, BUFF | CONTROL |
| Beast/Animal | DAMAGE_SINGLE, DAMAGE_PROC | — |
| Undead/Spirit | CONTROL, DAMAGE_MAGIC | HEALING (self-sustain) |
| Elemental | DAMAGE_AOE, DAMAGE_MAGIC | CONTROL |

**Note:** CONTROL skills that apply taunt (provoke, goad, jeer, intimidate, incite, infuriate) are all depth 2–4 and should only appear on enemies that are meant to draw aggro.

---

## Full Skill Depth Table

### Depth 1

| Skill ID | Name | Category | Group | Parents |
|---|---|---|---|---|
| `elixir_of_vitality` | Elixir of Vitality | CONSUMABLE_HEALING | Consumable | — |
| `heal_major2` | Major Heal | CONSUMABLE_HEALING | Consumable | — |
| `heal_minor` | Minor Heal | CONSUMABLE_HEALING | Consumable | — |
| `heal_standard` | Heal | CONSUMABLE_HEALING | Consumable | — |
| `purge` | Purge | CONSUMABLE_HEALING | Consumable | — |
| `restore_mana_major` | Major Mana Restoration | CONSUMABLE_RESTORATION | Consumable | — |
| `restore_mana_major2` | Major Mana Restoration | CONSUMABLE_RESTORATION | Consumable | — |
| `restore_mana_minor` | Minor Mana Restoration | CONSUMABLE_RESTORATION | Consumable | — |
| `restore_stam` | Stamina Restoration | CONSUMABLE_RESTORATION | Consumable | — |
| `restore_stam_major` | Major Stamina Restoration | CONSUMABLE_RESTORATION | Consumable | — |
| `restore_stam_small` | Small Stamina Restoration | CONSUMABLE_RESTORATION | Consumable | — |
| `skill_fireball` | Fireball | CONSUMABLE_DAMAGE | Consumable | — |
| `skill_lightning` | Lightning Strike | CONSUMABLE_DAMAGE | Consumable | — |
| `skill_teleport` | Teleport | CONSUMABLE_ESCAPE | Consumable | — |
| `throw_knife` | Throw Knife | CONSUMABLE_DAMAGE | Consumable | — |
| `drain_reserves` | Drain Reserves | CONTROL | Control | — |
| `misdirect` | Misdirect | CONTROL | Control | — |
| `shove` | Shove | CONTROL | Control | — |
| `channel` | Channel | DAMAGE_MAGIC | Damage (Magic/AOE) | — |
| `aim` | Aim | DAMAGE_SINGLE | Damage (Physical) | — |
| `basic_attack` | Basic Attack | DAMAGE_SINGLE | Damage (Physical) | — |
| `untrained_strike` | Untrained Strike | DAMAGE_SINGLE | Damage (Physical) | — |
| `block` | Block | DEFENSE | Defense | — |
| `footwork` | Footwork | DEFENSE | Defense | — |
| `cleanse_weaken` | Cleanse Weakness | HEALING | Healing | — |
| `first_aid` | First Aid | HEALING | Healing | — |
| `heal_major` | Major Heal | HEALING | Healing | — |
| `restore_stamina` | Restore Stamina | HEALING | Healing | — |
| `attunement` | Attunement | UTILITY | Support/Buff | — |
| `bloodlust` | Bloodlust | BUFF | Support/Buff | — |
| `buff_loot_rate` | Loot Rate Buff | BUFF | Support/Buff | — |
| `catch_breath` | Catch Breath | NO_RESOURCES | Support/Buff | — |
| `climb_surface` | Climb | UTILITY | Support/Buff | — |
| `desperate_attack` | Desperate Attack | NO_RESOURCES | Support/Buff | — |
| `focus` | Focus | BUFF | Support/Buff | — |
| `last_stand` | Last Stand | NO_RESOURCES | Support/Buff | — |
| `light_area` | Light Area | UTILITY | Support/Buff | — |
| `mental_fog` | Mental Fog | NO_RESOURCES | Support/Buff | — |
| `prayer` | Prayer | BUFF | Support/Buff | — |
| `rest` | Rest | RESTORATION | Support/Buff | — |
| `restore_stam_minor` | Minor Stamina Restoration | RESTORATION | Support/Buff | — |
| `reveal_area` | Reveal Area | UTILITY | Support/Buff | — |
| `sense` | Sense | UTILITY | Support/Buff | — |
| `shout` | Shout | BUFF | Support/Buff | — |
| `skill_teleport_safe` | Safe Teleport | UTILITY | Support/Buff | — |
| `unlock_door` | Unlock Door | UTILITY | Support/Buff | — |
| `wild_flail` | Wild Flail | NO_RESOURCES | Support/Buff | — |
| `buff_all_stats` | All Stats Buff | CONSUMABLE_BUFF | CONSUMABLE_BUFF | — |
| `buff_defense` | Defense Buff | CONSUMABLE_BUFF | CONSUMABLE_BUFF | — |
| `buff_speed` | Speed Buff | CONSUMABLE_BUFF | CONSUMABLE_BUFF | — |
| `buff_strength` | Strength Buff | CONSUMABLE_BUFF | CONSUMABLE_BUFF | — |
| `deploy_caltrops` | Deploy Caltrops | CONSUMABLE_CONTROL | CONSUMABLE_CONTROL | — |
| `deploy_trap_stun` | Deploy Stun Trap | CONSUMABLE_CONTROL | CONSUMABLE_CONTROL | — |

### Depth 2

| Skill ID | Name | Category | Group | Parents |
|---|---|---|---|---|
| `dissonance` | Dissonance | CONTROL | Control | proc_chime, shove |
| `hex` | Hex | CONTROL | Control | sense, shove |
| `lullaby` | Lullaby | CONTROL | Control | proc_lullaby, misdirect |
| `provoke` | Provoke | CONTROL | Control | misdirect, block |
| `arcane_bolt` | Arcane Bolt | DAMAGE_MAGIC | Damage (Magic/AOE) | channel, focus |
| `chill` | Chill | DAMAGE_MAGIC | Damage (Magic/AOE) | channel, rest |
| `produce_flame` | Produce Flame | DAMAGE_MAGIC | Damage (Magic/AOE) | channel, light_area |
| `shock` | Shock | DAMAGE_MAGIC | Damage (Magic/AOE) | channel, shout |
| `arcane_strike` | Arcane Strike | DAMAGE_SINGLE | Damage (Physical) | channel, basic_attack |
| `frenzy` | Frenzy | DAMAGE_SINGLE | Damage (Physical) | bloodlust, basic_attack |
| `grounded_strike` | Grounded Strike | DAMAGE_SINGLE | Damage (Physical) | basic_attack, attunement |
| `lunge` | Lunge | DAMAGE_SINGLE | Damage (Physical) | basic_attack, footwork |
| `pierce` | Pierce | DAMAGE_SINGLE | Damage (Physical) | aim, footwork |
| `pummel` | Pummel | DAMAGE_SINGLE | Damage (Physical) | shove, basic_attack |
| `rhythmic_strike` | Rhythmic Strike | DAMAGE_SINGLE | Damage (Physical) | focus, attunement |
| `skirmish` | Skirmish | DAMAGE_SINGLE | Damage (Physical) | aim, footwork |
| `slash` | Slash | DAMAGE_SINGLE | Damage (Physical) | basic_attack, aim |
| `smite` | Smite | DAMAGE_SINGLE | Damage (Physical) | prayer, basic_attack |
| `strong_attack` | Strong Attack | DAMAGE_SINGLE | Damage (Physical) | basic_attack, shove |
| `weak_point` | Weak Point | DAMAGE_SINGLE | Damage (Physical) | aim, sense |
| `fortify` | Fortify | DEFENSE | Defense | restore_stam_minor, block |
| `stone_skin` | Stone Skin | DEFENSE | Defense | block, attunement |
| `ward` | Ward | DEFENSE | Defense | block, attunement |
| `holy_light` | Holy Light | HEALING | Healing | prayer, first_aid |
| `mend` | Mend | HEALING | Healing | first_aid, heal_major |
| `nature_touch` | Nature Touch | HEALING | Healing | attunement, shove |
| `second_wind` | Second Wind | HEALING | Healing | restore_stam_minor, first_aid |
| `spirit_link` | Spirit Link | HEALING | Healing | first_aid, proc_harmony |
| `berserker_stance` | Berserker Stance | BUFF | Support/Buff | bloodlust, block |
| `blood_rage` | Blood Rage | BUFF | Support/Buff | bloodlust, shout |
| `call_target` | Call Target | UTILITY | Support/Buff | aim, shout |
| `focused_rest` | Focused Rest | RESTORATION | Support/Buff | rest, focus |
| `iron_will` | Iron Will | RESTORATION | Support/Buff | restore_stam_minor, shout |
| `silent_prayer` | Silent Prayer | UTILITY | Support/Buff | prayer, misdirect |
| `song_of_vigor` | Song of Vigor | BUFF | Support/Buff | proc_melody, shout |
| `spirit_tap` | Spirit Tap | RESTORATION | Support/Buff | rest, attunement |
| `stalk` | Stalk | UTILITY | Support/Buff | footwork, misdirect |
| `vitality_boost` | Vitality Boost | BUFF | Support/Buff | rest, attunement |
| `warcry` | Warcry | BUFF | Support/Buff | shout, focus |

### Depth 3

| Skill ID | Name | Category | Group | Parents |
|---|---|---|---|---|
| `corrupting_hex` | Corrupting Hex | CONTROL | Control | hex, proc_lullaby |
| `dispel` | Dispel | CONTROL | Control | sense, nature_touch |
| `entangle` | Entangle | CONTROL | Control | nature_touch, footwork |
| `goad` | Goad | CONTROL | Control | provoke, strong_attack |
| `haunting_refrain` | Haunting Refrain | CONTROL | Control | dissonance, proc_echo |
| `jeer` | Jeer | CONTROL | Control | provoke, shout |
| `nature_wrap` | Nature Wrap | CONTROL | Control | nature_touch, shove |
| `burning_aura` | Burning Aura | DAMAGE_AOE | Damage (Magic/AOE) | produce_flame, shout |
| `divine_frost` | Divine Frost | DAMAGE_MAGIC | Damage (Magic/AOE) | chill, holy_light |
| `fireball` | Fireball | DAMAGE_AOE | Damage (Magic/AOE) | produce_flame, focus |
| `frost_nova` | Frost Nova | DAMAGE_AOE | Damage (Magic/AOE) | chill, shout |
| `frost_slide` | Frost Slide | DAMAGE_MAGIC | Damage (Magic/AOE) | chill, footwork |
| `lifetap` | Lifetap | DAMAGE_MAGIC | Damage (Magic/AOE) | bloodlust, arcane_bolt |
| `lightning_chain` | Lightning Chain | DAMAGE_AOE | Damage (Magic/AOE) | shock, arcane_bolt |
| `mind_spike` | Mind Spike | DAMAGE_MAGIC | Damage (Magic/AOE) | focus, shock |
| `neuro_toxin` | Neuro Toxin | DAMAGE_MAGIC | Damage (Magic/AOE) | shock, apply_poison |
| `poison_cloud` | Poison Cloud | DAMAGE_AOE | Damage (Magic/AOE) | apply_poison, shout |
| `scorched_shot` | Scorched Shot | DAMAGE_MAGIC | Damage (Magic/AOE) | produce_flame, aim |
| `septic_flame` | Septic Flame | DAMAGE_MAGIC | Damage (Magic/AOE) | produce_flame, apply_poison |
| `shadow_bolt` | Shadow Bolt | DAMAGE_MAGIC | Damage (Magic/AOE) | arcane_bolt, misdirect |
| `sleet` | Sleet | DAMAGE_MAGIC | Damage (Magic/AOE) | shock, chill |
| `spirit_drain` | Spirit Drain | DAMAGE_MAGIC | Damage (Magic/AOE) | spirit_tap, hex |
| `storm_seed` | Storm Seed | DAMAGE_MAGIC | Damage (Magic/AOE) | shock, nature_touch |
| `thunderclap` | Thunderclap | DAMAGE_MAGIC | Damage (Magic/AOE) | shock, shove |
| `volatile_venom` | Volatile Venom | DAMAGE_MAGIC | Damage (Magic/AOE) | apply_poison, arcane_bolt |
| `acid_splash` | Acid Splash | DAMAGE_SINGLE | Damage (Physical) | apply_poison, chill |
| `arcane_lunge` | Arcane Lunge | DAMAGE_SINGLE | Damage (Physical) | lunge, arcane_bolt |
| `arcane_pummel` | Arcane Pummel | DAMAGE_SINGLE | Damage (Physical) | pummel, arcane_strike |
| `blood_letting` | Blood Letting | DAMAGE_SINGLE | Damage (Physical) | slash, sense |
| `counter_strike` | Counter Strike | DAMAGE_SINGLE | Damage (Physical) | block, slash |
| `flaming_edge` | Flaming Edge | DAMAGE_SINGLE | Damage (Physical) | slash, produce_flame |
| `flaming_fist` | Flaming Fist | DAMAGE_SINGLE | Damage (Physical) | pummel, produce_flame |
| `frostbite` | Frostbite | DAMAGE_SINGLE | Damage (Physical) | chill, basic_attack |
| `holy_shove` | Holy Shove | DAMAGE_SINGLE | Damage (Physical) | shove, holy_light |
| `holy_smite` | Holy Smite | DAMAGE_SINGLE | Damage (Physical) | smite, holy_light |
| `ice_pierce` | Ice Pierce | DAMAGE_SINGLE | Damage (Physical) | pierce, chill |
| `ice_shard` | Ice Shard | DAMAGE_SINGLE | Damage (Physical) | chill, aim |
| `nature_pierce` | Nature Pierce | DAMAGE_SINGLE | Damage (Physical) | pierce, nature_touch |
| `poison_lunge` | Poison Lunge | DAMAGE_SINGLE | Damage (Physical) | lunge, apply_poison |
| `riposte` | Riposte | DAMAGE_SINGLE | Damage (Physical) | block, pierce |
| `runic_smash` | Runic Smash | DAMAGE_SINGLE | Damage (Physical) | pummel, arcane_bolt |
| `shocking_blow` | Shocking Blow | DAMAGE_SINGLE | Damage (Physical) | pummel, shock |
| `singe` | Singe | DAMAGE_SINGLE | Damage (Physical) | produce_flame, basic_attack |
| `stone_fist` | Stone Fist | DAMAGE_SINGLE | Damage (Physical) | stone_skin, pummel |
| `venomous_slash` | Venomous Slash | DAMAGE_SINGLE | Damage (Physical) | slash, apply_poison |
| `wind_cut` | Wind Cut | DAMAGE_SINGLE | Damage (Physical) | slash, footwork |
| `arcane_barrier` | Arcane Barrier | DEFENSE | Defense | arcane_bolt, block |
| `crystal_skin` | Crystal Skin | DEFENSE | Defense | arcane_bolt, stone_skin |
| `faith_armor` | Faith Armor | DEFENSE | Defense | stone_skin, prayer |
| `fire_wall` | Fire Wall | DEFENSE | Defense | produce_flame, block |
| `ice_block` | Ice Block | DEFENSE | Defense | block, chill |
| `mana_shield` | Mana Shield | DEFENSE | Defense | arcane_bolt, rest |
| `stone_ward` | Stone Ward | DEFENSE | Defense | block, nature_touch |
| `alchemy_fire` | Alchemy Fire | HEALING | Healing | produce_flame, first_aid |
| `atonement` | Atonement | HEALING | Healing | mend, prayer |
| `healing_light` | Healing Light | HEALING_AOE | Healing | holy_light, rest |
| `holy_word` | Holy Word | HEALING_AOE | Healing | holy_light, shout |
| `life_link` | Life Link | HEALING | Healing | holy_light, attunement |
| `regrowth` | Regrowth | HEALING | Healing | nature_touch, first_aid |
| `sacred_grove` | Sacred Grove | HEALING_AOE | Healing | holy_light, nature_touch |
| `soothing_verse` | Soothing Verse | HEALING_AOE | Healing | lullaby, first_aid |
| `chorus` | Chorus | BUFF | Support/Buff | song_of_vigor, warcry |
| `echoing_prayer` | Echoing Prayer | BUFF | Support/Buff | prayer, warcry |
| `mana_cycle` | Mana Cycle | RESTORATION | Support/Buff | vitality_boost, arcane_bolt |
| `shadow_step` | Shadow Step | UTILITY | Support/Buff | stalk, footwork |
| `totemic_aura` | Totemic Aura | BUFF | Support/Buff | ward, shout |
| `vitality_surge` | Vitality Surge | BUFF | Support/Buff | vitality_boost, shout |

### Depth 4

| Skill ID | Name | Category | Group | Parents |
|---|---|---|---|---|
| `ancestral_shroud` | Ancestral Shroud | CONTROL | Control | corrupting_hex, sense |
| `frozen_cry` | Frozen Cry | CONTROL | Control | warcry, frost_nova |
| `holy_roots` | Holy Roots | CONTROL | Control | smite, entangle |
| `incite` | Incite | CONTROL | Control | goad, lunge |
| `judgment_field` | Judgment Field | CONTROL | Control | holy_word, entangle |
| `primal_crush` | Primal Crush | CONTROL | Control | nature_wrap, stone_fist |
| `sacred_roots` | Sacred Roots | CONTROL | Control | entangle, holy_light |
| `shadow_tendril` | Shadow Tendril | CONTROL | Control | shadow_bolt, attunement |
| `siren_call` | Siren Call | CONTROL | Control | haunting_refrain, proc_harmony |
| `ward_break` | Ward Break | CONTROL | Control | thunderclap, stone_fist |
| `battle_hymn` | Battle Hymn | DAMAGE_AOE | Damage (Magic/AOE) | rhythmic_strike, chorus |
| `blizzard` | Blizzard | DAMAGE_AOE | Damage (Magic/AOE) | frost_nova, shout |
| `chain_lightning` | Chain Lightning | DAMAGE_AOE | Damage (Magic/AOE) | lightning_chain, focus |
| `decay_aura` | Decay Aura | DAMAGE_AOE | Damage (Magic/AOE) | shadow_bolt, attunement |
| `earthquake` | Earthquake | DAMAGE_AOE | Damage (Magic/AOE) | stone_fist, shove |
| `entropic_decay` | Entropic Decay | DAMAGE_MAGIC | Damage (Magic/AOE) | shadow_bolt, nature_touch |
| `fraying_touch` | Fraying Touch | DAMAGE_MAGIC | Damage (Magic/AOE) | shadow_bolt, nature_touch |
| `meteor` | Meteor | DAMAGE_AOE | Damage (Magic/AOE) | fireball, aim |
| `plague_carrier` | Plague Carrier | DAMAGE_AOE | Damage (Magic/AOE) | venomous_slash, poison_cloud |
| `ring_of_fire` | Ring of Fire | DAMAGE_AOE | Damage (Magic/AOE) | burning_aura, footwork |
| `shockwave` | Shockwave | DAMAGE_AOE | Damage (Magic/AOE) | channel, thunderclap |
| `spirit_storm` | Spirit Storm | DAMAGE_AOE | Damage (Magic/AOE) | spirit_drain, totemic_aura |
| `storm_hammer` | Storm Hammer | DAMAGE_AOE | Damage (Magic/AOE) | shocking_blow, strong_attack |
| `venom_storm` | Venom Storm | DAMAGE_AOE | Damage (Magic/AOE) | poison_cloud, lightning_chain |
| `water_bolt` | Water Bolt | DAMAGE_MAGIC | Damage (Magic/AOE) | shock, entangle |
| `arcane_dash` | Arcane Dash | DAMAGE_SINGLE | Damage (Physical) | arcane_lunge, footwork |
| `assassinate` | Assassinate | DAMAGE_SINGLE | Damage (Physical) | shadow_step, weak_point |
| `blood_ice` | Blood Ice | DAMAGE_SINGLE | Damage (Physical) | chill, blood_letting |
| `corrosive_wound` | Corrosive Wound | DAMAGE_SINGLE | Damage (Physical) | venomous_slash, acid_splash |
| `divine_judgment` | Divine Judgment | DAMAGE_SINGLE | Damage (Physical) | holy_smite, focus |
| `glacial_javelin` | Glacial Javelin | DAMAGE_SINGLE | Damage (Physical) | ice_pierce, aim |
| `ice_lance` | Ice Lance | DAMAGE_SINGLE | Damage (Physical) | ice_shard, pierce |
| `inferno_slice` | Inferno Slice | DAMAGE_SINGLE | Damage (Physical) | flaming_edge, lunge |
| `penitent_strike` | Penitent Strike | DAMAGE_SINGLE | Damage (Physical) | smite, blood_letting |
| `phantom_lunge` | Phantom Lunge | DAMAGE_SINGLE | Damage (Physical) | lunge, shadow_step |
| `shadow_riposte` | Shadow Riposte | DAMAGE_SINGLE | Damage (Physical) | counter_strike, shadow_step |
| `shadow_strike` | Shadow Strike | DAMAGE_SINGLE | Damage (Physical) | shadow_bolt, basic_attack |
| `shadow_wound` | Shadow Wound | DAMAGE_SINGLE | Damage (Physical) | slash, shadow_bolt |
| `shield_bash` | Shield Bash | DAMAGE_SINGLE | Damage (Physical) | counter_strike, shove |
| `bark_carapace` | Bark Carapace | DEFENSE | Defense | nature_wrap, stone_skin |
| `divine_barrier` | Divine Barrier | DEFENSE | Defense | mana_shield, prayer |
| `sanctuary` | Sanctuary | DEFENSE | Defense | holy_word, block |
| `spell_reflection` | Spell Reflection | DEFENSE | Defense | arcane_barrier, block |
| `caustic_mend` | Caustic Mend | HEALING_AOE | Healing | mend, poison_cloud |
| `forest_embrace` | Forest Embrace | HEALING_AOE | Healing | regrowth, entangle |
| `martyrdom` | Martyrdom | HEALING_AOE | Healing | healing_light, basic_attack |
| `mass_heal` | Mass Heal | HEALING_AOE | Healing | healing_light, rest |
| `persistent_life` | Persistent Life | HEALING | Healing | regrowth, rest |
| `resurrection_rite` | Bless | HEALING | Healing | holy_word, first_aid |
| `retaliatory_heal` | Retaliatory Heal | HEALING | Healing | mend, counter_strike |
| `rooted_healing` | Rooted Healing | HEALING_AOE | Healing | healing_light, entangle |
| `thorned_regeneration` | Thorned Regeneration | HEALING | Healing | regrowth, nature_wrap |
| `blood_fury` | Blood Fury | BUFF | Support/Buff | blood_letting, shout |
| `grand_symphony` | Grand Symphony | BUFF | Support/Buff | chorus, proc_resonance |
| `mental_fortitude` | Mental Fortitude | BUFF | Support/Buff | mind_spike, focus |
| `shadow_misdirection` | Shadow Misdirection | UTILITY | Support/Buff | shadow_step, misdirect |
| `shadow_veil` | Shadow Veil | UTILITY | Support/Buff | shadow_bolt, misdirect |
| `stalking_shadow` | Stalking Shadow | UTILITY | Support/Buff | stalk, shadow_step |
| `terror_cry` | Terror Cry | BUFF | Support/Buff | warcry, shadow_bolt |

### Depth 5

| Skill ID | Name | Category | Group | Parents |
|---|---|---|---|---|
| `intimidate` | Intimidate | CONTROL | Control | jeer, shockwave |
| `shadow_grasp` | Shadow Grasp | CONTROL | Control | shadow_tendril, entangle |
| `silence` | Silence | CONTROL | Control | shadow_veil, misdirect |
| `soul_shatter` | Soul Shatter | CONTROL | Control | ancestral_shroud, corrupting_hex |
| `tidal_grasp` | Tidal Grasp | CONTROL | Control | water_bolt, shove |
| `bio_hazard` | Bio Hazard | DAMAGE_AOE | Damage (Magic/AOE) | plague_carrier, nature_touch |
| `discordant_surge` | Discordant Surge | DAMAGE_AOE | Damage (Magic/AOE) | battle_hymn, proc_chime |
| `heavens_fury` | Heaven's Fury | DAMAGE_AOE | Damage (Magic/AOE) | divine_judgment, holy_word |
| `hellfire` | Hellfire | DAMAGE_AOE | Damage (Magic/AOE) | ring_of_fire, shadow_bolt |
| `permafrost` | Permafrost | DAMAGE_AOE | Damage (Magic/AOE) | blizzard, frostbite |
| `plague_bloom` | Plague Bloom | DAMAGE_AOE | Damage (Magic/AOE) | plague_carrier, regrowth |
| `plague_wind` | Plague Wind | DAMAGE_AOE | Damage (Magic/AOE) | ancestral_shroud, proc_melody |
| `thunder_god` | Thunder God | DAMAGE_AOE | Damage (Magic/AOE) | storm_hammer, shock |
| `titan_foot` | Titan Foot | DAMAGE_AOE | Damage (Magic/AOE) | primal_crush, footwork |
| `toxic_fog` | Toxic Fog | DAMAGE_AOE | Damage (Magic/AOE) | poison_cloud, shadow_veil |
| `absolute_zero` | Absolute Zero | DAMAGE_SINGLE | Damage (Physical) | glacial_javelin, chill |
| `arcane_shield_bash` | Arcane Shield Bash | DAMAGE_SINGLE | Damage (Physical) | shield_bash, arcane_bolt |
| `bleed_out` | Bleed Out | DAMAGE_SINGLE | Damage (Physical) | blood_fury, weak_point |
| `blink_strike` | Blink Strike | DAMAGE_SINGLE | Damage (Physical) | arcane_dash, arcane_bolt |
| `phoenix_strike` | Phoenix Strike | DAMAGE_SINGLE | Damage (Physical) | inferno_slice, mend |
| `silent_death` | Silent Death | DAMAGE_SINGLE | Damage (Physical) | assassinate, shadow_step |
| `void_rend` | Void Rend | DAMAGE_SINGLE | Damage (Physical) | shadow_strike, slash |
| `divine_reflection` | Divine Reflection | DEFENSE | Defense | spell_reflection, holy_light |
| `psychic_barrier` | Psychic Barrier | DEFENSE | Defense | mental_fortitude, arcane_barrier |
| `shadow_block` | Shadow Block | DEFENSE | Defense | block, shadow_veil |
| `cleanse` | Cleanse | HEALING | Healing | sacred_roots, holy_light |
| `berserker_rage` | Berserker Rage | BUFF | Support/Buff | blood_fury, warcry |
| `mirror_image` | Mirror Image | UTILITY | Support/Buff | spell_reflection, shadow_veil |
| `shadow_clone` | Shadow Clone | UTILITY | Support/Buff | shadow_veil, misdirect |

### Depth 6

| Skill ID | Name | Category | Group | Parents |
|---|---|---|---|---|
| `infuriate` | Infuriate | CONTROL | Control | incite, berserker_rage |
| `mind_control` | Mind Control | CONTROL | Control | psychic_barrier, misdirect |
| `rotting_grasp` | Rotting Grasp | CONTROL | Control | shadow_grasp, nature_touch |
| `apocalypse` | Apocalypse | DAMAGE_AOE | Damage (Magic/AOE) | heavens_fury, hellfire |
| `eternal_winter` | Eternal Winter | DAMAGE_AOE | Damage (Magic/AOE) | absolute_zero, blizzard |
| `reality_fracture` | Reality Fracture | DAMAGE_AOE | Damage (Magic/AOE) | blink_strike, spell_reflection |
| `smothering_darkness` | Smothering Darkness | DAMAGE_AOE | Damage (Magic/AOE) | toxic_fog, shadow_veil |
| `storm_of_a_thousand_storms` | Storm of a Thousand Storms | DAMAGE_AOE | Damage (Magic/AOE) | thunder_god, chain_lightning |
| `sunfall` | Sunfall | DAMAGE_AOE | Damage (Magic/AOE) | phoenix_strike, meteor |
| `undertow` | Undertow | DAMAGE_AOE | Damage (Magic/AOE) | tidal_grasp, sleet |
| `executioner` | Executioner | DAMAGE_SINGLE | Damage (Physical) | bleed_out, smite |
| `necromancy` | Necromancy | HEALING | Healing | shadow_grasp, first_aid |
| `demon_form` | Demon Form | BUFF | Support/Buff | void_rend, shadow_clone |
| `void_walk` | Void Walk | UTILITY | Support/Buff | silent_death, shadow_step |

### Depth 7

| Skill ID | Name | Category | Group | Parents |
|---|---|---|---|---|
| `lord_of_decay` | Lord of Decay | DAMAGE_AOE | Damage (Magic/AOE) | bio_hazard, necromancy |
| `omnipotence` | Omnipotence | BUFF | Support/Buff | mind_control, warcry |
| `spirit_walk` | Spirit Walk | UTILITY | Support/Buff | void_walk, attunement |
