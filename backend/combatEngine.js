const crypto = require('crypto');

// Game balance constants
const CONSTANTS = {
    STAT_SCALE: 200,
    STAT_CAP_MAX: 0.99,
    STAT_CAP_MIN: 0.1,
    BASE_HIT_CHANCE: 0.85,
    MAX_CRIT_CHANCE: 0.4,
    BASE_CRIT_CHANCE: 0.05,

    // ── Resource scaling ────────────────────────────────────────────────────
    // BASE_*: starting value at level 1
    // GROWTH_*: exponential growth factor per level
    // STAT_DIVISOR_*: lower = stats matter more (halves pool at this stat value)
    PLAYER_BASE_HP:         60,
    PLAYER_BASE_MANA:       80,
    PLAYER_BASE_STAMINA:    80,
    ENEMY_BASE_HP:          22,
    ENEMY_BASE_MANA:        45,
    ENEMY_BASE_STAMINA:     45,
    HP_GROWTH:              1.05,
    MANA_GROWTH:            1.02,
    STAMINA_GROWTH:         1.02,
    HP_STAT_DIVISOR:        150,
    MANA_STAT_DIVISOR:      150,
    STAMINA_STAT_DIVISOR:   150,

    // ── Enemy skill level ───────────────────────────────────────────────────
    // Effective skill level = floor(spawnLevel / ENEMY_SKILL_LEVEL_DIVISOR), min 1
    ENEMY_SKILL_LEVEL_DIVISOR: 4,
};

/**
/**
 * Generate a procedural weapon for an enemy based on its tags and level.
 * Returns a plain weapon object — never touches items.json.
 * Type maps to a real variance-profile key so existing variance logic applies.
 */
function generateEnemyWeapon(tags, level) {
    const t = tags || [];

    // ── Tuning constants ─────────────────────────────────────────────────────
    const GEN_WEAPON = generateEnemyWeapon.TUNING || {
        BASE_FLAT:    2,    // flat damage added at all levels
        BASE_PER_LVL: 0.8,  // damage added per enemy level
        FAST_MULT:    0.70, // fast style (dagger) damage multiplier
        STD_MULT:     1.0,  // standard style (sword) damage multiplier
        HEAVY_MULT:   1.35, // heavy style (hammer) damage multiplier
        MAGIC_MULT:   0.65, // penalty for magic-dominant enemies (caster/spirit/wisp)
    };

    // ── Damage type from thematic tags ──────────────────────────────────────
    const DAMAGE_TYPE_MAP = [
        [['beast', 'canine'],                              ['slashing', 'piercing']],
        [['undead', 'shadow', 'blight'],                   ['shadow', 'cold']],
        [['fire', 'ashen_remnant'],                        ['fire', 'physical']],
        [['water', 'tidebound', 'salt_wept'],              ['cold', 'physical']],
        [['nature', 'verdant', 'plant'],                   ['nature', 'physical']],
        [['construct', 'earth', 'stone'],                  ['bludgeoning', 'physical']],
        [['spirit', 'wisp', 'luminary', 'holy'],           ['holy', 'arcane']],
        [['inkbound', 'echo_council', 'ancestor', 'pact'], ['arcane', 'shadow']],
        [['lightning'],                                    ['lightning', 'physical']],
        [['cold'],                                         ['cold', 'physical']],
        [['caster'],                                       ['arcane', 'physical']],
    ];

    let damageTypes = ['physical'];
    for (const [matchTags, types] of DAMAGE_TYPE_MAP) {
        if (matchTags.some(mt => t.includes(mt))) { damageTypes = types; break; }
    }

    // ── Weapon style ─────────────────────────────────────────────────────────
    // fast  → dagger variance [0.70,1.40]
    // standard → sword variance [0.85,1.25]
    // heavy → hammer variance [0.90,1.15]
    let style = 'standard';
    if (t.some(x => ['beast', 'canine', 'scout', 'ranged'].includes(x)))              style = 'fast';
    if (t.some(x => ['tank', 'brute', 'construct', 'soldier', 'earth', 'stone'].includes(x))) style = 'heavy';

    // ── Damage value ─────────────────────────────────────────────────────────
    const base = GEN_WEAPON.BASE_FLAT + level * GEN_WEAPON.BASE_PER_LVL;
    const styleMult  = style === 'fast' ? GEN_WEAPON.FAST_MULT : style === 'heavy' ? GEN_WEAPON.HEAVY_MULT : GEN_WEAPON.STD_MULT;
    const magicTypes = new Set(['fire','cold','lightning','arcane','holy','shadow','nature','poison']);
    const isMagicDominant = t.some(x => ['caster','spirit','wisp'].includes(x)) ||
        damageTypes.every(dt => magicTypes.has(dt));
    const magicMult  = isMagicDominant ? GEN_WEAPON.MAGIC_MULT : 1.0;
    const totalDamage = Math.round(base * styleMult * magicMult);

    const dmg1 = damageTypes.length === 1 ? totalDamage : Math.ceil(totalDamage * 0.65);
    const dmg2 = damageTypes.length > 1   ? totalDamage - dmg1 : null;

    return {
        id:         `__generated_${style}`,
        name:       `Generated ${style} weapon`,
        type:       style === 'fast' ? 'dagger' : style === 'heavy' ? 'hammer' : 'sword',
        dmg1,       dmg_type_1: damageTypes[0],
        dmg2,       dmg_type_2: dmg2 ? damageTypes[1] : null,
        dmg3: null, dmg4: null,
        generated:  true,
    };
}

/**
 * DYNAMIC WEAPON VARIANCE CONFIGURATION
 * Scans gearData to find all unique weapon types and assigns variance profiles.
 */
function initializeWeaponVarianceProfiles(gearData) {
    const profiles = {};
    const processedTypes = new Set();

    // Keyword mapping: if a type name includes these words, use this variance [min, max]
    const KEYWORD_MAP = {
        // Fast/Spiky
        'dagger': [0.70, 1.40],
        'knife':  [0.70, 1.40],
        'bow':    [0.80, 1.30],
        'crossbow': [0.80, 1.30],
        'wand':   [0.80, 1.30],
        'pistol': [0.80, 1.30],
        'flute':  [0.75, 1.35],
        'totem':  [0.75, 1.35],
        
        // Balanced
        'sword':  [0.85, 1.25],
        'axe':    [0.85, 1.25],
        'handaxe':[0.85, 1.25],
        'spear':  [0.85, 1.25],
        'bell':   [0.85, 1.25],
        'scepter':[0.85, 1.25],
        'tome':   [0.85, 1.25],
        
        // Heavy/Consistent
        'mace':   [0.90, 1.15],
        'hammer': [0.90, 1.15],
        'shield': [0.90, 1.10],
    };

    const DEFAULT_PROFILE = [0.90, 1.15]; // Fallback for unknown types

    // Safety check: Ensure gearData exists
    if (!gearData || !Array.isArray(gearData)) {
        console.warn('[INIT] No gear data found for variance initialization. Using defaults.');
        return { 'default': DEFAULT_PROFILE };
    }

    console.log('[INIT] Scanning items.json for weapon types...');

    gearData.forEach(item => {
        // Only process items that have a 'type' and look like weapons
        if (item.type && (item.dmg1 || item.type.includes('weapon'))) {
            const rawType = item.type.toLowerCase(); 
            
            let assignedProfile = DEFAULT_PROFILE;
            let matchedKeyword = 'default';

            // Check against keywords
            for (const [keyword, range] of Object.entries(KEYWORD_MAP)) {
                if (rawType.includes(keyword)) {
                    assignedProfile = range;
                    matchedKeyword = keyword;
                    break; 
                }
            }

            // Store the profile for this specific type string found in JSON
            if (!processedTypes.has(rawType)) {
                profiles[rawType] = assignedProfile;
                processedTypes.add(rawType);
                // Optional: Log what was found
                // console.log(`  - Type "${rawType}" matched keyword "${matchedKeyword}" → Variance: [${assignedProfile[0]}, ${assignedProfile[1]}]`);
            }
        }
    });

    // CRITICAL: Ensure 'default' always exists in the returned object
    if (!profiles['default']) {
        profiles['default'] = DEFAULT_PROFILE;
    }

    console.log(`[INIT] Weapon Variance initialized with ${Object.keys(profiles).length} unique types.`);
    return profiles;
}


class CombatEngine {
    constructor(skillsData, enemyTypesData, racesData, gearData, statusEngine, lootTags = {}) {
        this.skills = skillsData;
        this.enemyTypes = enemyTypesData;
        this.races = racesData;
        this.gear = gearData;
        this.statusEngine = statusEngine;
        this.lootTags = lootTags;
        this._skillDepthCache = this._buildSkillDepthCache();
        
        // CRITICAL FIX: Initialize Weapon Variance safely
        try {
            this.weaponVarianceProfiles = initializeWeaponVarianceProfiles(gearData);
        } catch (error) {
            console.error('[INIT] Failed to initialize weapon variance:', error);
            // Fallback to a safe default if initialization fails
            this.weaponVarianceProfiles = { 'default': [0.90, 1.15] };
        }
    }


  /**
   * NEW METHOD: Resolve Pre-Combat Opportunities
   * Handles skill checks before the turn loop starts.
   * NOW INCLUDES: Fallback logic for characters lacking the required skill.
   */
  resolvePreCombatPhase(playerCharacters, enemies, stage, globalTurnCount) {
    const opportunities = stage.preCombatOpportunities;
    if (!opportunities || opportunities.length === 0) {
      return { turns: [], turnCount: globalTurnCount };
    }

    const preCombatTurns = [];
    let currentTurnCount = globalTurnCount;
    let requiredSkills = []; // populated in the 'skill' checkType branch; used by resolvedSkillID

    // ── Step 1: Filter by spawn chance ──────────────────────────────────
    // Each opportunity has an optional `spawnChance` (0–1, default 1.0).
    // Roll for each — only opportunities that pass are eligible this run.
    const eligible = opportunities.filter(op => {
      const roll = Math.random();
      const passes = roll < (op.spawnChance !== undefined ? op.spawnChance : 1.0);
      //DEBUG
      //if (!passes) console.log(`[PRE-COMBAT] Opportunity "${op.name}" skipped (spawnChance roll failed)`);
      return passes;
    });

    if (eligible.length === 0) {
      return { turns: [], turnCount: currentTurnCount };
    }

    // ── Step 2: Pick one opportunity at random from eligible pool ────────
    const op = eligible[Math.floor(Math.random() * eligible.length)];

    // ── Step 3: Resolve the check type ───────────────────────────────────
    // check types: 'skill' | 'stat' | 'party_size' | 'random' | none (always fires success/failure)
    const checkType = op.checkType || (op.requiredSkillID ? 'skill' : 'none');

    let bestActor = playerCharacters.find(p => !p.defeated) || playerCharacters[0];
    let bestStatValue = 0;
    let highestChance = 0.5;
    let conditionMet = false;  // does the party even qualify to attempt this?
    let isFallback = false;

    if (checkType === 'skill') {
      // Support both requiredSkillID (string), requiredSkillIDs (array), and requiredSkillTag (element tag)
      // Checks against EQUIPPED skills only (intrinsics + 2 slots) — not the full discovered list.
      // A character must have the skill equipped to use it in pre-combat opportunities.
      requiredSkills = [];
      if (op.requiredSkillTag) {
        requiredSkills = this.skills
          .filter(s => s.tags && s.tags.includes(op.requiredSkillTag))
          .map(s => s.id);
      } else {
        requiredSkills = op.requiredSkillIDs
          ? op.requiredSkillIDs
          : op.requiredSkillID ? [op.requiredSkillID] : [];
      }
      const qualifiedActors = playerCharacters.filter(p => {
        if (p.defeated) return false;
        const equippedPool = this.getAugmentedSkillPool(p); // Set of equipped + intrinsic skill IDs
        return requiredSkills.some(id => {
          if (!equippedPool.has(id)) return false;
          const skillRecord = p.skills?.find(s => s.skillID === id);
          // Skills with a character record require skillLevel >= 1
          // Consumable-belt skills have no record but are valid if equipped
          if (skillRecord) return (skillRecord.skillLevel || 0) >= 1;
          return true; // consumable-linked skill — belt presence is enough
        });
      });
      if (qualifiedActors.length === 0) {
        isFallback = true;
        conditionMet = false;
      } else {
        conditionMet = true;
        // Best actor = highest stat value among qualified
        qualifiedActors.forEach(p => {
          const val = (p.stats?.[op.checkStat] || 0) + (p.stats?.[op.secondaryStat] || 0) * 0.5;
          if (val > bestStatValue) { bestStatValue = val; bestActor = p; }
        });
        const margin = bestStatValue - (op.difficultyThreshold || 50);
        highestChance = margin >= 0 ? 1.0 : Math.max(0.05, 0.5 + margin / CONSTANTS.STAT_SCALE);
      }
    } else if (checkType === 'stat') {
      // No skill required — any party member can attempt via stats alone
      conditionMet = true;
      playerCharacters.filter(p => !p.defeated).forEach(p => {
        const val = (p.stats?.[op.checkStat] || 0) + (p.stats?.[op.secondaryStat] || 0) * 0.5;
        if (val > bestStatValue) { bestStatValue = val; bestActor = p; }
      });
      const margin = bestStatValue - (op.difficultyThreshold || 50);
      highestChance = margin >= 0 ? 1.0 : Math.max(0.05, 0.5 + margin / CONSTANTS.STAT_SCALE);
    } else if (checkType === 'combo') {
      // Requires BOTH an item AND a stat threshold.
      // Item acts as the gate (no item = fallback); stat determines success chance.
      // op.requiredItemID — item that must be present on any alive party member
      // op.checkStat / op.difficultyThreshold — stat roll on best actor
      const comboItemID = op.requiredItemID;
      const itemHolders = playerCharacters.filter(p =>
        !p.defeated && (
          (p.consumables && p.consumables[comboItemID] > 0) ||
          (p.consumableStash && p.consumableStash[comboItemID] > 0)
        )
      );
      if (itemHolders.length === 0) {
        isFallback = true;
        conditionMet = false;
      } else {
        conditionMet = true;
        // Best actor for stat = highest among all alive (item opens door, party impression matters)
        playerCharacters.filter(p => !p.defeated).forEach(p => {
          const val = (p.stats?.[op.checkStat] || 0) + (p.stats?.[op.secondaryStat] || 0) * 0.5;
          if (val > bestStatValue) { bestStatValue = val; bestActor = p; }
        });
        const margin = bestStatValue - (op.difficultyThreshold || 50);
        highestChance = margin >= 0 ? 1.0 : Math.max(0.05, 0.5 + margin / CONSTANTS.STAT_SCALE);
      }
    } else if (checkType === 'party_size') {
      const alive = playerCharacters.filter(p => !p.defeated).length;
      conditionMet = true;
      const minOk = op.minPartySize === undefined || alive >= op.minPartySize;
      const maxOk = op.maxPartySize === undefined || alive <= op.maxPartySize;
      highestChance = (minOk && maxOk) ? 1.0 : 0.0;
    } else if (checkType === 'item') {
      // Check if any alive party member has the required item in consumables or consumableStash
      const itemID = op.requiredItemID;
      conditionMet = playerCharacters.some(p =>
        !p.defeated && (
          (p.consumables && p.consumables[itemID] > 0) ||
          (p.consumableStash && p.consumableStash[itemID] > 0)
        )
      );
      highestChance = conditionMet ? 1.0 : 0.0;
      if (conditionMet) {
        // Consume one of the item from whoever has it
        const owner = playerCharacters.find(p =>
          !p.defeated && (
            (p.consumables && p.consumables[itemID] > 0) ||
            (p.consumableStash && p.consumableStash[itemID] > 0)
          )
        );
        if (owner) {
          if (owner.consumables?.[itemID] > 0) owner.consumables[itemID]--;
          else if (owner.consumableStash?.[itemID] > 0) owner.consumableStash[itemID]--;
          //DEBUG
          //console.log(`[PRE-COMBAT] ${owner.name} used ${itemID} as offering`);
        }
      }
    } else if (checkType === 'item_and_stat') {
      // Hard gate: item must be present. If present, stat roll determines success vs failure.
      // If item absent, falls back. requiredItemID + checkStat + difficultyThreshold all required.
      const itemID = op.requiredItemID;
      const hasItem = playerCharacters.some(p =>
        !p.defeated && (
          (p.consumables && p.consumables[itemID] > 0) ||
          (p.consumableStash && p.consumableStash[itemID] > 0)
        )
      );
      if (!hasItem) {
        isFallback = true;
        conditionMet = false;
      } else {
        conditionMet = true;
        // Stat roll among all non-defeated party members
        playerCharacters.filter(p => !p.defeated).forEach(p => {
          const val = (p.stats?.[op.checkStat] || 0) + (p.stats?.[op.secondaryStat] || 0) * 0.5;
          if (val > bestStatValue) { bestStatValue = val; bestActor = p; }
        });
        const margin = bestStatValue - (op.difficultyThreshold || 50);
        highestChance = margin >= 0 ? 1.0 : Math.max(0.05, 0.5 + margin / CONSTANTS.STAT_SCALE);
      }
    } else if (checkType === 'random') {
      conditionMet = true;
      highestChance = op.successChance !== undefined ? op.successChance : 0.5;
    } else {
      // 'none' — narrative only, always fires, no check
      conditionMet = true;
      highestChance = 1.0;
    }

    // ── Step 4: Roll outcome ─────────────────────────────────────────────
    currentTurnCount++;
    let rolled = Math.random();
    let isSuccess = !isFallback && (rolled <= highestChance);
    let effect = isFallback
      ? (op.fallbackEffect || op.failureEffect)
      : (isSuccess ? op.successEffect : op.failureEffect);

    if (!effect) {
      console.warn(`[PRE-COMBAT] No effect found for "${op.name}" (isFallback=${isFallback} isSuccess=${isSuccess})`);
      return { turns: [], turnCount: currentTurnCount };
    }

    // ── Step 5: Log ──────────────────────────────────────────────────────
    //DEBUG
    //console.log(`\n[PRE-COMBAT] === ${op.name} ===`);
    //console.log(`[PRE-COMBAT] checkType: ${checkType} | conditionMet: ${conditionMet} | isFallback: ${isFallback}`);
    //if (checkType !== 'none' && checkType !== 'random') {
      //console.log(`[PRE-COMBAT] Best actor: ${bestActor?.name} | statValue: ${bestStatValue.toFixed(1)} | chance: ${(highestChance*100).toFixed(1)}%`);
    //}
    //console.log(`[PRE-COMBAT] Roll: ${rolled.toFixed(3)} | Result: ${isFallback ? 'FALLBACK' : isSuccess ? '✅ SUCCESS' : '❌ FAILURE'}`);
    //console.log(`[PRE-COMBAT] Narrative: "${effect.narrative}"\n`);

    const narrativeTurn = {
      turnNumber: currentTurnCount,
      stageTurnNumber: 0,
      actor: bestActor?.id,
      actorName: bestActor?.name || 'Party',
      action: {
        type: isFallback ? 'pre_combat_fallback' : 'pre_combat_skill',
        skillID: checkType === 'item_and_stat' ? `[item:${op.requiredItemID}+stat:${op.checkStat}]` : op.requiredSkillTag ? `[tag:${op.requiredSkillTag}]` : op.requiredSkillIDs ? op.requiredSkillIDs.join('/') : (op.requiredSkillID || null),
        // The actual skill ID the best actor used — for XP awarding in the frontend
        resolvedSkillID: checkType === 'skill' && bestActor
          ? (() => {
              const pool = this.getAugmentedSkillPool(bestActor);
              return requiredSkills.find(id => pool.has(id)) || null;
            })()
          : null,
        name: op.name
      },
      roll: { hitChance: highestChance, rolled, hit: isSuccess },
      result: { message: effect.narrative, success: isSuccess, delay: 1000 }
    };

    // ── Step 6: Apply effects ────────────────────────────────────────────
    if (effect.type === 'apply_direct_damage') {
      playerCharacters.forEach(p => {
        if (p.defeated) return;
        const damage = Math.floor(p.maxHP * (effect.magnitude || 0.1));
        p.currentHP = Math.max(0, p.currentHP - damage);
        if (p.currentHP <= 0) { p.defeated = true; narrativeTurn.result.message += ` ${p.name} falls!`; }
      });
    } else if (effect.type === 'apply_status') {
      playerCharacters.forEach(p => {
        if (!p.defeated) this.statusEngine.applyStatus(p, effect.status, effect.duration, effect.magnitude || 1);
      });
    } else if (effect.type === 'remove_enemy') {
      // effect.enemyTypeID — which enemy type to remove. Falls back to first enemy type in stage.
      const targetTypeID = effect.enemyTypeID || stage.enemies?.[0]?.enemyTypeID;
      const countToRemove = effect.count || effect.magnitude || 1;
      if (targetTypeID) {
        let removed = 0;
        for (let i = enemies.length - 1; i >= 0 && removed < countToRemove; i--) {
          if (enemies[i].id.includes(targetTypeID)) { enemies.splice(i, 1); removed++; }
        }
        //console.log(`[PRE-COMBAT] Removed ${removed}x ${targetTypeID} from combat`);
      }
    } else if (effect.type === 'apply_buff') {
      // Apply a status buff to all alive party members
      playerCharacters.forEach(p => {
        if (!p.defeated) this.statusEngine.applyStatus(p, effect.status, effect.duration || 3, effect.magnitude || 1);
      });
    }
    // 'narrative_only' — no mechanical effect, just the text

    preCombatTurns.push(narrativeTurn);
    return { turns: preCombatTurns, turnCount: currentTurnCount };
  }

/**
   * Run a complete combat simulation
   */
  // Unwrap an equipment slot value — accepts either a bare itemID string (legacy)
  // or an object { itemID, itemName, itemDescription } (current format).
  _eqId(val) { return (val && typeof val === 'object') ? val.itemID : val; }

  // Resolve a full item object from a slot value, merging any _rolls over the base def.
  _eqItem(val) {
      const id = this._eqId(val);
      if (!id) return null;
      const base = this.gear.find(g => g.id === id);
      if (!base) return null;
      const rolls = (val && typeof val === 'object') ? val._rolls : null;
      return rolls ? { ...base, ...rolls } : base;
  }

  runCombat(partySnapshots, challenge) {
    const combatID = 'combat_' + crypto.randomBytes(8).toString('hex');
    const startTime = Date.now();

    const playerCharacters = partySnapshots.map((snapshot, idx) => {
      const stats = snapshot.stats || { conviction: 0, endurance: 0, ambition: 0, harmony: 0 };
      const skills = Array.isArray(snapshot.skills) ? snapshot.skills : [];
      const level = snapshot.level || 1;
      const equipment = snapshot.equipment || {};

      // Apply stat bonuses from all equipped items (weapons + armor)
      // Items carry short-name stat fields (con, end, amb, har) that boost character stats.
      const statFieldMap = { con: 'conviction', end: 'endurance', amb: 'ambition', har: 'harmony' };
      const equipmentSlots = ['mainHand', 'offHand', 'head', 'chest', 'accessory1', 'accessory2'];
      const boostedStats = { ...stats }; // don't mutate the original snapshot stats
      equipmentSlots.forEach(slot => {
        const itemDef = this._eqItem(equipment[slot]);
        if (!itemDef) return;
        Object.entries(statFieldMap).forEach(([shortKey, longKey]) => {
          if (itemDef[shortKey]) boostedStats[longKey] = (boostedStats[longKey] || 0) + itemDef[shortKey];
        });
      });

      // Sum armor and evasion from all equipped armor pieces.
      // armor → flat damage reduction; phys_ev/mag_ev → hit chance reduction (separate).
      const armorSlots = ['head', 'chest', 'offHand', 'accessory1', 'accessory2'];
      let totalArmor = 0;
      let totalPhysEv = 0;
      let totalMagEv  = 0;
      armorSlots.forEach(slot => {
        const itemDef = this._eqItem(equipment[slot]);
        if (!itemDef) return;
        totalArmor  += itemDef.armor   || 0;
        totalPhysEv += itemDef.phys_ev || 0;
        totalMagEv  += itemDef.mag_ev  || 0;
      });
      // armorValue: used in calculateDamage as flat damage reduction (not %).
      // physEvasion / magEvasion: used in calculateHitChance to reduce attacker hit chance.
      const armorValue  = totalArmor;
      const physEvasion = totalPhysEv;
      const magEvasion  = totalMagEv;

      return {
        id: snapshot.characterID,
        name: snapshot.characterName,
        type: 'player',
        stats: boostedStats,
        level,
        maxHP: this.calculateMaxHP(boostedStats, level, true),
        currentHP: this.calculateMaxHP(boostedStats, level, true),
        maxMana: this.calculateMaxMana(boostedStats, level, true),
        currentMana: this.calculateMaxMana(boostedStats, level, true),
        maxStamina: this.calculateMaxStamina(boostedStats, level, true),
        currentStamina: this.calculateMaxStamina(boostedStats, level, true),
        skills,
        consumables: snapshot.consumables || {},
        equipment,
        armorValue,    // flat damage reduction
        physEvasion,   // reduces physical hit chance against this character
        magEvasion,    // reduces magical hit chance against this character
        defeated: false,
        index: idx,
        statusEffects: [],
        aiProfile: snapshot.aiProfile || 'balanced'
      };
    });

    const segments = [];
    let globalTurnCount = 0;
    let combatResult = 'victory'; 
    
    // Handle Stages with Branching Logic
    const allStages = challenge.stages || [];
    let stageIndex = 0;
    // FIX #3: When a branch fires we record the target index so stageIndex++ lands correctly.
    let forcedNextStageIndex = null;

    while (stageIndex < allStages.length) {
      let stage = allStages[stageIndex];
      forcedNextStageIndex = null;

      // --- BRANCHING LOGIC ---
      if (stage.stageBranches && stage.stageBranches.length > 0) {
        let resolvedNextStageId = undefined; // undefined = no branch fired yet

        for (const branch of stage.stageBranches) {
          if (!branch.condition) {
            // Default fallback branch — null nextStageId means "end after this stage"
            resolvedNextStageId = branch.nextStageId; // may be null (end) or a stageId
            if (branch.overrideDescription) stage.description = branch.overrideDescription;
            continue;
          }

          // Evaluate condition first
          let conditionMet = false;
          const cond = branch.condition;
          if (cond.type === 'has_skill') {
            conditionMet = playerCharacters.some(p =>
              !p.defeated && p.skills && p.skills.some(s =>
                s.skillID === cond.value && (s.skillLevel || 0) >= 1
              )
            );
          } else if (cond.type === 'has_skill_tag') {
            const taggedSkillIds = this.skills
              .filter(s => s.tags && s.tags.includes(cond.value))
              .map(s => s.id);
            conditionMet = playerCharacters.some(p => {
              if (p.defeated) return false;
              const equippedPool = this.getAugmentedSkillPool(p);
              return taggedSkillIds.some(id => {
                if (!equippedPool.has(id)) return false;
                const rec = p.skills?.find(s => s.skillID === id);
                if (rec) return (rec.skillLevel || 0) >= 1;
                return true;
              });
            });
          } else if (cond.type === 'has_item') {
            conditionMet = playerCharacters.some(p =>
              !p.defeated && (
                (p.consumables && p.consumables[cond.value] > 0) ||
                (p.consumableStash && p.consumableStash[cond.value] > 0)
              )
            );
          } else if (cond.type === 'has_skill_tag_and_stat') {
            // A SINGLE character must have both: an equipped skill with the given tag at level >= 1
            // AND meet the stat threshold.
            const taggedSkillIds = this.skills
              .filter(s => s.tags && s.tags.includes(cond.skillTag))
              .map(s => s.id);
            conditionMet = playerCharacters.some(p => {
              if (p.defeated) return false;
              const meetsStat = (p.stats?.[cond.stat] || 0) >= cond.threshold;
              if (!meetsStat) return false;
              const equippedPool = this.getAugmentedSkillPool(p);
              return taggedSkillIds.some(id => {
                if (!equippedPool.has(id)) return false;
                const rec = p.skills?.find(s => s.skillID === id);
                return rec ? (rec.skillLevel || 0) >= 1 : true;
              });
            });
          } else if (cond.type === 'stat_check') {
            conditionMet = playerCharacters.some(p =>
              !p.defeated && (p.stats?.[cond.stat] || 0) >= cond.threshold
            );
          } else if (cond.type === 'party_size') {
            const alive = playerCharacters.filter(p => !p.defeated).length;
            const minOk = cond.min === undefined || alive >= cond.min;
            const maxOk = cond.max === undefined || alive <= cond.max;
            conditionMet = minOk && maxOk;
          } else if (cond.type === 'random') {
            conditionMet = Math.random() < (cond.chance || 0.5);
          }

          // Condition must pass first; then apply optional chance gate
          if (conditionMet) {
            if (branch.chance !== undefined && Math.random() > branch.chance) {
              continue; // Party qualifies but the opportunity didn't present itself this run
            }
            resolvedNextStageId = branch.nextStageId;
            if (branch.overrideDescription) stage.description = branch.overrideDescription;
            break;
          }
        }

        // Only act on the resolved branch if one was explicitly set
        if (resolvedNextStageId !== undefined) {
          if (resolvedNextStageId === null) {
            // Default fallback said "end after this stage" — skip past all remaining stages
            forcedNextStageIndex = allStages.length - 1;
          } else {
            const targetIdx = allStages.findIndex(s => s.stageId === resolvedNextStageId);
            if (targetIdx !== -1) {
              stage = allStages[targetIdx];
              forcedNextStageIndex = targetIdx;
            } else {
              console.error(`[BRANCH] Target stage ${resolvedNextStageId} not found!`);
            }
          }
        }
      }
      // -----------------------

      if (playerCharacters.every(p => p.defeated)) {
        combatResult = 'loss';
        break;
      }

      //console.log(`\n[STAGE] Starting Stage ${stage.stageId}: ${stage.title}`);
      
      const enemies = this.initializeEnemies(stage.enemies);
      const initiative = this.calculateInitiative(playerCharacters, enemies, partySnapshots);
      const turnOrder = [...initiative].sort((a, b) => b.initiative - a.initiative);

      // --- PRE-COMBAT PHASE ---
      const preCombatResult = this.resolvePreCombatPhase(playerCharacters, enemies, stage, globalTurnCount);
      let stageTurns = preCombatResult.turns;
      globalTurnCount = preCombatResult.turnCount;

      if (playerCharacters.every(p => p.defeated)) {
         const startStageHP = playerCharacters.map(p => ({ id: p.id, hp: p.maxHP }));
         const endStageHP = playerCharacters.map(p => ({ id: p.id, hp: 0 }));
         const summaryText = this._generateStageSummary(stage, playerCharacters, enemies, false, startStageHP, endStageHP);
         
         segments.push({
            stageId: stage.stageId,
            title: stage.title,
            introText: stage.description,
            turns: stageTurns,
            summaryText: summaryText,
            status: 'defeat',
            participantsSnapshot: {
                playerCharacters: playerCharacters.map(p => ({ characterID: p.id, characterName: p.name, finalHP: 0, defeated: true })),
                enemies: enemies.map(e => ({ enemyID: e.id, enemyName: e.name, maxHP: e.maxHP, finalHP: e.currentHP, defeated: false }))
            }
         });
         combatResult = 'loss';
         break;
      }

      // Reset lastUsedSkillId and buffCooldowns at the start of each stage
      playerCharacters.forEach(p => { p.lastUsedSkillId = null; p.buffCooldowns = {}; });

      const SUDDEN_DEATH_START = 100;   // turn within a stage where escalation begins
      const SUDDEN_DEATH_BASE  = 0.04;  // 4% max HP at turn 100, +2% per 10 turns after
      let stageTurnCount = stageTurns.length;
      const startStageHP = playerCharacters.map(p => ({ id: p.id, hp: p.currentHP }));

      while (!this.isCombatFinished(playerCharacters, enemies)) {
        for (const combatant of turnOrder) {
          if (combatant.defeated || combatant.currentHP <= 0) {
            if (combatant.currentHP <= 0 && !combatant.defeated) {
              console.warn(`[SAFETY] ${combatant.name} has 0 HP but defeated=false — forcing defeated.`);
              combatant.defeated = true;
            }
            continue;
          }

          stageTurnCount++;
          globalTurnCount++;

          const turn = {
            turnNumber: globalTurnCount,
            stageTurnNumber: stageTurnCount,
            actor: combatant.id,
            actorName: combatant.name,
            action: null,
            roll: null,
            result: null
          };

          if (combatant.type === 'player') {
            const playerChar = playerCharacters.find(p => p.id === combatant.id);
            const context = this._buildContext(stageIndex, allStages, playerCharacters, enemies, playerChar, stageTurnCount);
            const action = this.selectAction(playerChar, playerCharacters, enemies, context, {
              isEnemy: false,
              focusChance: 1.0,
            });
            const turnResult = this.resolveAction(action, playerChar, playerCharacters, enemies);
            
            // Track last used skill for proc pressure
            if (action.type === 'skill' && action.skillID) {
              playerChar.lastUsedSkillId = action.skillID;
            }
            // Track last buff turn for cooldown scoring
            if (action.type === 'skill') {
              const usedSkill = this.skills.find(s => s.id === action.skillID);
              if (usedSkill && (usedSkill.category === 'BUFF' || usedSkill.category === 'DEFENSE' || usedSkill.category === 'UTILITY')) {
                if (!playerChar.buffCooldowns) playerChar.buffCooldowns = {};
                playerChar.buffCooldowns[action.skillID] = stageTurnCount;
              }
            }

            turn.action = action;
            turn.roll = turnResult.roll;
            turn.result = turnResult.result;
            // FIX #1: Hoist child skill proc flags from action → turn so frontend can detect them
            if (action.isChildSkillProc) {
              turn.isChildSkillProc = true;
              turn.isFirstDiscovery = action.isFirstDiscovery || false;
              turn.replacedSkillID  = action.replacedSkillID  || null;
            }
            
            if (action.type === 'retreat' && turnResult.result.success) {
              return this._buildRetreatResult(combatID, playerCharacters, enemies, stageTurns, globalTurnCount, combatant.id);
            }
          } else {
            const enemy = enemies.find(e => e.id === combatant.id);
            if (!enemy || enemy.defeated || enemy.currentHP <= 0) continue;
            
            const context = this._buildContext(stageIndex, allStages, playerCharacters, enemies, enemy, stageTurnCount);
            const enemyProfile = enemy.aiProfile || 'aggressive';
            const enemyFocusChance = { aggressive: 0.70, tactical: 0.65, berserker: 0.40, support: 0.55 }[enemyProfile] ?? 0.70;
            const action = this.selectAction(enemy, enemies, playerCharacters, context, {
              isEnemy: true,
              focusChance: enemyFocusChance,
            });
            
            if (action.type === 'blocked') {
              turn.action = action;
              turn.result = { message: action.reason, success: false, delay: 1000 };
              stageTurns.push(turn);
              continue;
            }
            
            const turnResult = this.resolveAction(action, enemy, playerCharacters, enemies);
            turn.action = action;
            turn.roll = turnResult.roll;
            turn.result = turnResult.result;

            // Track buff cooldowns for enemies — same logic as players
            if (action.type === 'skill') {
              const usedSkill = this.skills.find(s => s.id === action.skillID);
              if (usedSkill && (usedSkill.category === 'BUFF' || usedSkill.category === 'DEFENSE' || usedSkill.category === 'UTILITY')) {
                if (!enemy.buffCooldowns) enemy.buffCooldowns = {};
                enemy.buffCooldowns[action.skillID] = stageTurnCount;
              }
            }
          }

          stageTurns.push(turn);
          if (this.isCombatFinished(playerCharacters, enemies)) break;
        }

        [...playerCharacters, ...enemies].forEach(combatant => {
          if (combatant.defeated) return;
          const statusResults = this.statusEngine.processStatusEffects(combatant);
          
          if (statusResults.damageDealt > 0) {
            combatant.currentHP = Math.max(0, combatant.currentHP - statusResults.damageDealt);
            if (combatant.currentHP <= 0) combatant.defeated = true;
            statusResults.messages.forEach(msg => {
              stageTurns.push({
                turnNumber: globalTurnCount + 0.1,
                actor: combatant.id,
                actorName: combatant.name,
                action: { type: 'status' },
                result: {
                  message: msg,
                  success: true,
                  delay: 500,
                  targetId: combatant.id,
                  targetHPAfter: Math.max(0, combatant.currentHP)
                }
              });
            });
          }
          if (statusResults.healed > 0) {
            combatant.currentHP = Math.min(combatant.maxHP, combatant.currentHP + statusResults.healed);
          }

          // Leech DoT: credit heals to the source combatant
          if (statusResults.sourceHeals && statusResults.sourceHeals.length > 0) {
            const allCombatants = [...playerCharacters, ...enemies];
            statusResults.sourceHeals.forEach(({ sourceId, amount }) => {
              const source = allCombatants.find(c => c.id === sourceId && !c.defeated);
              if (source) {
                source.currentHP = Math.min(source.maxHP, source.currentHP + amount);
                //console.log(`[LIFEDRAIN] ${source.name} leeches ${amount} HP from ${combatant.name}`);
              }
            });
          }

          if (statusResults.manaDrainPerTurn > 0) {
            combatant.currentMana = Math.max(0, combatant.currentMana - statusResults.manaDrainPerTurn);
          }

          // FIX: Apply stat boosts/reductions — previously computed but discarded.
          // Transient per-turn deltas only; reversed after tick so they don't compound.
          const hasDeltas = Object.keys(statusResults.statBoosts).length > 0
                         || Object.keys(statusResults.statReductions).length > 0;
          const appliedDeltas = {};
          if (hasDeltas) {
            for (const [stat, boost] of Object.entries(statusResults.statBoosts)) {
              const delta = Math.floor((combatant.stats[stat] || 0) * boost);
              combatant.stats[stat] = (combatant.stats[stat] || 0) + delta;
              appliedDeltas[stat] = (appliedDeltas[stat] || 0) + delta;
            }
            for (const [stat, reduction] of Object.entries(statusResults.statReductions)) {
              const delta = Math.floor((combatant.stats[stat] || 0) * reduction);
              combatant.stats[stat] = Math.max(0, (combatant.stats[stat] || 0) - delta);
              appliedDeltas[stat] = (appliedDeltas[stat] || 0) - delta;
            }
          }

          this.statusEngine.updateStatusDurations(combatant);

          // Reverse transient deltas so they don't bleed into the next turn
          if (hasDeltas) {
            for (const [stat, delta] of Object.entries(appliedDeltas)) {
              combatant.stats[stat] = (combatant.stats[stat] || 0) - delta;
            }
          }
        });

        // ── Sudden death — escalating damage when fights drag on ──────────────
        if (stageTurnCount > SUDDEN_DEATH_START) {
          const overtime = stageTurnCount - SUDDEN_DEATH_START;
          const pct = SUDDEN_DEATH_BASE + Math.floor(overtime / 10) * 0.02;
          const allCombatants = [...playerCharacters, ...enemies].filter(c => !c.defeated);
          if (allCombatants.length > 0) {
            // Mark sudden death active on all combatants — reduces healing effectiveness
            allCombatants.forEach(c => {
              c.suddenDeathActive = true;
              c.suddenDeathTurn = (c.suddenDeathTurn || 0) + 1;
            });
            console.warn(`[SUDDEN DEATH] Turn ${stageTurnCount}: dealing ${(pct*100).toFixed(0)}% max HP to all combatants`);
            allCombatants.forEach(c => {
              const dmg = Math.max(1, Math.floor(c.maxHP * pct));
              c.currentHP = Math.max(0, c.currentHP - dmg);
              if (c.currentHP <= 0) c.defeated = true;
            });
            stageTurns.push({
              turnNumber: globalTurnCount + 0.5,
              stageTurnNumber: stageTurnCount,
              actor: null,
              actorName: 'The Field',
              action: { type: 'sudden_death' },
              roll: null,
              result: {
                message: `The battle has gone on too long. All combatants take ${(pct*100).toFixed(0)}% of their maximum HP in damage.`,
                success: false,
                delay: 800
              }
            });
          }
        }

        // Regen fires AFTER status effects so debuffs apply to the pre-regen pool
        playerCharacters.forEach(p => this.regenerateResources(p));
        enemies.forEach(e => this.regenerateResources(e));

        if (stageTurns.length > 0) {
          stageTurns[stageTurns.length - 1].playerResourceStates = playerCharacters.map(p => ({
            characterID: p.id,
            currentStamina: p.currentStamina,
            currentMana: p.currentMana
          }));
        }
      }

      const stageWon = enemies.every(e => e.defeated);
      const stageLost = playerCharacters.every(p => p.defeated);
      const endStageHP = playerCharacters.map(p => ({ id: p.id, hp: p.currentHP }));
      const summaryText = this._generateStageSummary(stage, playerCharacters, enemies, stageWon, startStageHP, endStageHP);

      segments.push({
        stageId: stage.stageId,
        title: stage.title,
        introText: stage.description,
        turns: stageTurns,
        summaryText: summaryText,
        status: stageWon ? 'victory' : (stageLost ? 'defeat' : 'incomplete'),
        participantsSnapshot: {
          playerCharacters: playerCharacters.map(p => ({
            characterID: p.id, characterName: p.name, finalHP: p.currentHP, finalMana: p.currentMana, finalStamina: p.currentStamina, defeated: p.defeated
          })),
          enemies: enemies.map(e => ({
            enemyID: e.id, enemyName: e.name, maxHP: e.maxHP, finalHP: e.currentHP, defeated: e.defeated
          }))
        }
      });

      if (stageLost) {
        combatResult = 'loss';
        break;
      }

      // FIX #3: If a branch fired, jump to targetIdx+1 so we continue AFTER the branched stage.
      // Otherwise advance sequentially.
      if (forcedNextStageIndex !== null) {
        stageIndex = forcedNextStageIndex + 1;
      } else {
        stageIndex++;
      }
    }

    const allStagesWon = segments.every(s => s.status === 'victory');
    const anyStageWon  = segments.some(s  => s.status === 'victory');
    // Call calculateRewards whenever any stage completed so the global drop ramp
    // always advances. XP/gold are zeroed out on non-full-victory runs.
    const rewards = anyStageWon ? this.calculateRewards(playerCharacters, challenge, segments) : null;
    if (rewards && !allStagesWon) {
        rewards.experienceGained = {};
        rewards.goldGained = 0;
    }

    return {
      combatID,
      result: combatResult,
      totalTurns: globalTurnCount,
      segments,  
      turns: segments.flatMap(s => s.turns), 
      participants: {
        playerCharacters: playerCharacters.map((p, idx) => ({
          characterID: p.id, 
          characterName: p.name, 
          maxHP: p.maxHP, 
          finalHP: p.currentHP, 
          maxMana: p.maxMana, 
          finalMana: p.currentMana, 
          maxStamina: p.maxStamina, 
          finalStamina: p.currentStamina, 
          defeated: p.defeated,
          skills: p.skills,
          consumables: p.consumables,
          avatarId: partySnapshots[idx]?.avatarId || null,
          avatarColor: partySnapshots[idx]?.avatarColor || null
        })),
        enemies: segments[segments.length-1]?.participantsSnapshot.enemies || []
      },
      rewards,
      shouldPersist: true
    };
  }

  // Helper: Generate Narrative Summary
  _generateStageSummary(stage, players, enemies, won, startHP, endHP) {
    if (!won) {
        const survivors = players.filter(p => !p.defeated);
        const killer = enemies.find(e => !e.defeated && e.currentHP > 0);
        return `${players[0].name} was overwhelmed in "${stage.title}". ${survivors.length === 0 ? 'The party was wiped out.' : `${survivors.length} survivor(s) fled.`} ${killer ? `Last stood by ${killer.name}.` : ''}`;
    }

    const hpStatus = players.map(p => {
        const start = startHP.find(h => h.id === p.id)?.hp || p.maxHP;
        const end = endHP.find(h => h.id === p.id)?.hp || 0;
        const pct = Math.floor((end / p.maxHP) * 100);
        return pct < 30 ? `${p.name} (Critical ${pct}%)` : `${p.name} (${pct}%)`;
    }).join(', ');

    const enemyList = enemies.map(e => `${e.name} (Lvl ${e.level})`).join(', ');
    return `${players[0].name} cleared "${stage.title}", defeating ${enemyList}. Party Status: ${hpStatus}.`;
  }

  // Helper: Build Retreat Result
  _buildRetreatResult(combatID, players, enemies, turns, turnCount, retreatedBy) {
    return {
        combatID,
        result: 'retreated',
        totalTurns: turnCount,
        segments: [{ stageId: 'retreat', title: 'Retreat', introText: 'Fleeing...', turns, summaryText: 'Successfully retreated.', status: 'retreat' }],
        turns,
        participants: { playerCharacters: [], enemies: [] },
        rewards: null,
        shouldPersist: true
    };
  }

/**
Calculate rewards using the challenge object directly
*/
calculateRewards(players, challenge, segments = []) {
    const rewards = {
        experienceGained: {},
        lootDropped: [],
        secretPathCompleted: false
    };
    const baseXP = challenge?.rewards?.baseXP || 100;
    const baseGold = challenge?.rewards?.baseGold || 50;

    // FIX: Initialize lootTable with global rewards, then aggregate completed stage loot
    const lootTable = [...(challenge?.rewards?.lootTable || [])];
    
    if (challenge.stages && segments.length > 0) {
        challenge.stages.forEach(stage => {
            // Only include stage loot if the stage was actually completed
            const segment = segments.find(s => s.stageId === stage.stageId && s.status === 'victory');
            if (segment && stage.lootTable) {
                lootTable.push(...stage.lootTable);
            }
        });
    }

    // Detect if a secret path stage was completed this run
    const secretStage = challenge?.stages?.find(s => s.secretPath === true);
    const secretCompleted = secretStage
        ? segments.some(seg => seg.stageId === secretStage.stageId && seg.status === 'victory')
        : false;
    if (secretCompleted) {
        rewards.secretPathCompleted = true;
        console.log(`[REWARDS] Secret path completed for ${challenge.id}!`);
    }

    // XP with diminishing returns for larger parties
    const partyScale = 1 / (1 + 0.5 * (players.length - 1));

    // Difficulty scaling — steep penalty for overlevelled parties.
    // 0-5 over recommended: gentle reduction
    // 6-10 over: steep drop
    // 11-20 over: near zero
    // 20+ over: effectively nothing (1%)
    const avgPartyLevel = players.reduce((sum, p) => sum + (p.level || 1), 0) / players.length;
    const recommendedLevel = challenge?.recommendedLevel || 1;
    const levelDelta = avgPartyLevel - recommendedLevel;
    let difficultyScale;
    if (levelDelta <= 0) {
        // Under or at recommended level — bonus XP for punching up, capped at 2×
        difficultyScale = Math.min(2.0, 1 / Math.max(0.5, 1 + levelDelta * 0.15));
    } else if (levelDelta <= 5) {
        // 1-5 over: gentle reduction (1.0 down to ~0.57)
        difficultyScale = 1 / (1 + levelDelta * 0.12);
    } else if (levelDelta <= 10) {
        // 6-10 over: steep drop (~0.5 down to ~0.15)
        const base = 1 / (1 + 5 * 0.12);
        difficultyScale = base * Math.pow(0.6, levelDelta - 5);
    } else if (levelDelta <= 20) {
        // 11-20 over: near zero (~0.09 down to ~0.01)
        const base = (1 / (1 + 5 * 0.12)) * Math.pow(0.6, 5);
        difficultyScale = base * Math.pow(0.75, levelDelta - 10);
    } else {
        // 20+ over: effectively nothing
        difficultyScale = 0.01;
    }

    // Secret path bonus: 2x XP
    const secretXPMultiplier = secretCompleted ? 2.0 : 1.0;

    players.forEach(player => {
        const xpReward = Math.floor(baseXP * partyScale * difficultyScale * secretXPMultiplier * (1 + (player.stats?.harmony || 0) / 750));
        rewards.experienceGained[player.id] = xpReward;
    });

    // Standard loot (Now includes aggregated stage loot)
    lootTable.forEach(lootItem => {
        const dropChance = (lootItem.dropChance || 0.3) * (1 + (players[0]?.stats?.ambition || 0) / 500);
        if (Math.random() <= dropChance) {
            const itemDef = this.gear.find(g => g.id === lootItem.itemID);
            const _rolls = itemDef ? this._rollItemVariance(itemDef) : null;
            rewards.lootDropped.push({
                characterID: players[0].id,
                itemID: lootItem.itemID,
                itemName: itemDef?.name || lootItem.itemID,
                rarity: lootItem.rarity,
                ...(_rolls ? { _rolls } : {})
            });
        }
    });

    // Secret path loot
    if (secretCompleted && challenge?.rewards?.secretLootTable) {
        challenge.rewards.secretLootTable.forEach(lootItem => {
            const dropChance = (lootItem.dropChance || 0.3) * (1 + (players[0]?.stats?.ambition || 0) / 500);
            if (Math.random() <= dropChance) {
                const itemDef = this.gear.find(g => g.id === lootItem.itemID);
                const _rolls = itemDef ? this._rollItemVariance(itemDef) : null;
                rewards.lootDropped.push({
                    characterID: players[0].id,
                    itemID: lootItem.itemID,
                    itemName: itemDef?.name || lootItem.itemID,
                    rarity: lootItem.rarity,
                    ...(_rolls ? { _rolls } : {})
                });
            }
        });
    }

    // Global bonus roll — rolls once per completed stage, not once per run.
    // Ramp ticks (up or down) after each stage: grows by 1.15x on a miss, halves on a hit.
    // D1→T0, D2→T0-1, D3→T1, D4→T1-2, D5→T2, D6→T2-3, D7→T3, D8→T3-4
    {
        const BASE_CHANCE   = 0.01;
        const MAX_CHANCE    = 0.20;
        const GROWTH_FACTOR = 1.15;
        const HIT_DIVISOR   = 2;

        const player = players[0];
        const ambitionBonus = 1 + (player?.stats?.ambition || 0) / 500;
        const difficulty = challenge?.difficulty || 1;
        const tierRanges = {
            1: [0, 0], 2: [0, 1], 3: [1, 1], 4: [1, 2],
            5: [2, 2], 6: [2, 3], 7: [3, 3], 8: [3, 4]
        };
        const [minTier, maxTier] = tierRanges[Math.min(difficulty, 8)] || [0, 0];
        const basePool = this.gear.filter(g =>
            g.tier >= minTier && g.tier <= maxTier &&
            g.slot_id1 && !g.consumable && !g.creatureOnly && g.tier >= 0
        );
        const challengeTags = challenge?.tags || [];

        // Use DB-sourced chance injected by combat.js
        let runningChance = challenge?._globalDropChance ?? BASE_CHANCE;
        runningChance = Math.max(BASE_CHANCE, Math.min(MAX_CHANCE, runningChance));

        // Collect completed stages in order
        const completedStages = (challenge?.stages || []).filter(stage =>
            segments.some(seg => seg.stageId === stage.stageId && seg.status === 'victory')
        );

        for (const _stage of completedStages) {
            if (Math.random() <= runningChance * ambitionBonus) {
                let pick = null;
                if (basePool.length) {
                    pick = basePool[Math.floor(Math.random() * basePool.length)];
                }
                if (pick && challengeTags.length > 0 && Object.keys(this.lootTags).length > 0) {
                    const tag = challengeTags[Math.floor(Math.random() * challengeTags.length)];
                    const tagDef = this.lootTags[tag];
                    if (tagDef) pick = this._applyLootTagFlavour(pick, { ...tagDef, _tag: tag });
                }
                if (pick) {
                    const _rolls = this._rollItemVariance(pick);
                    rewards.lootDropped.push({
                        characterID: player.id,
                        itemID: pick.id,
                        itemName: pick.name,
                        itemDescription: pick.description,
                        rarity: 'bonus',
                        ...(_rolls ? { _rolls } : {})
                    });
                    runningChance = Math.max(BASE_CHANCE, runningChance / HIT_DIVISOR);
                } else {
                    runningChance = Math.min(MAX_CHANCE, runningChance * GROWTH_FACTOR);
                }
            } else {
                runningChance = Math.min(MAX_CHANCE, runningChance * GROWTH_FACTOR);
            }
        }

        rewards.nextGlobalDropChance = runningChance;
    }

    return rewards;
}

_rollItemVariance(item) {
    // Roll variance for all non-null numeric stats on an item.
    // Returns a _rolls object containing only the stats that exist on the item.
    const STAT_KEYS = ['dmg1','dmg2','dmg3','armor','phys_ev','mag_ev','hp','mana','stam','con','end','amb','har'];
    const MIN_MULT = 0.65;
    const MAX_MULT = 1.35;
    const rolls = {};
    let hasRoll = false;
    STAT_KEYS.forEach(key => {
        const base = item[key];
        if (base == null || base === 0) return;
        const mult = MIN_MULT + Math.random() * (MAX_MULT - MIN_MULT);
        const rolled = Math.max(1, Math.round(base * mult));
        rolls[key] = rolled;
        hasRoll = true;
    });
    return hasRoll ? rolls : null;
}

_applyLootTagFlavour(item, tagDef) {
    // Returns a shallow copy of item with name and description flavoured by tag.
    // Original item object is never mutated.
    const copy = { ...item };

    const prefixes = tagDef.prefixes || [];
    const suffixes = tagDef.suffixes || [];
    const flavourLine = tagDef.flavourLine || '';

    // Pick prefix or suffix randomly (prefer prefix, 70/30)
    if (prefixes.length && (suffixes.length === 0 || Math.random() < 0.7)) {
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        copy.name = `${prefix} ${item.name}`;
    } else if (suffixes.length) {
        const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
        copy.name = `${item.name} ${suffix}`;
    }

    if (flavourLine) {
        copy.description = flavourLine;
    }

    // Small flat stat affixes by tag. Clamped to minimum 0 to avoid negatives on stats that don't exist.
    const TAG_AFFIXES = {
        sacred:    { har: 1, hp: 3 },
        corrupted: { amb: 1, armor: -1 },
        arcane:    { har: 1, mana: 5 },
        fire:      { con: 1, dmg1: 1 },
        dwarven:   { end: 1, armor: 2 },
        orc:       { con: 1, end: 1 },
        elven:     { amb: 1, har: 1 },
        shadow:    { amb: 2 },
        beast:     { con: 1, dmg1: 1 },
        spirit:    { har: 1, mana: 5 },
        nature:    { har: 1, phys_ev: 1 },
        martial:   { con: 1, end: 1 },
        goblin:    { amb: 1 },
        scavenge:  { end: 1 },
        undead:    { end: 1, har: 1 },
        coastal:   { end: 1, phys_ev: 1 },
        mountain:  { end: 2, armor: 1 },
        woodland:  { amb: 1, phys_ev: 1 },
        oath:      { con: 1, hp: 3 },
        mercenary: { amb: 1, con: 1 },
    };

    const affixes = TAG_AFFIXES[tagDef._tag];
    if (affixes) {
        Object.entries(affixes).forEach(([stat, bonus]) => {
            const current = copy[stat] || 0;
            const next = current + bonus;
            // Don't add a stat that didn't exist and ends up at 0 or below
            if (next <= 0 && !item[stat]) {
                delete copy[stat];
            } else {
                copy[stat] = Math.max(0, next);
            }
        });
    }

    return copy;
}

  /**
   * Unified action selection for players, bots, and enemies.
   * opts.isEnemy       — true for enemies (different skill pool, no child procs, no conservation)
   * opts.focusChance   — 1.0 for players/bots (always focused), 0.4–0.7 for enemies by profile
   */
  selectAction(actor, allies, opponents, context = {}, opts = {}) {
    const {
      isEnemy = false,
      focusChance = 1.0,
    } = opts;

    // ── Stun/block check ─────────────────────────────────────────────────────
    const actionBlock = this.statusEngine.checkActionBlock(actor);
    if (!actionBlock.canAct) {
      //console.log(`[DEBUG] ${actor.name} is stunned and cannot act!`);
      return { type: 'blocked', reason: actionBlock.reason };
    }

    const aliveOpponents = opponents.filter(e => !e.defeated);
    const aliveAllies    = allies.filter(a => !a.defeated);
    if (aliveOpponents.length === 0) return { type: 'attack', target: null };

    const profile = actor.aiProfile || (isEnemy ? 'aggressive' : 'balanced');
    const conservationEnabled = !isEnemy && profile !== 'aggressive';

    // Proc pressure bonus — opportunist is much more proc-hungry
    const procPressureBonus = profile === 'opportunist' ? 2.0 : profile === 'disruptor' ? 1.2 : 1.35;

    // ── Emergency survival (HP critical) ────────────────────────────────────
    // Thresholds per profile — cautious and support react earlier
    const emergencyHPThreshold = {
      cautious:    0.45,
      support:     0.40,
      balanced:    0.25,
      disruptor:   0.25,
      opportunist: 0.25,
      tactical:    0.30,
      aggressive:  0.15,  // aggressive waits until near death
      berserker:   0.00,  // berserker never retreats
    }[profile] ?? 0.25;
    if (profile !== 'berserker' && actor.currentHP <= actor.maxHP * emergencyHPThreshold) {
      const healSkill = isEnemy
        ? this.getEnemySkillByCategory(actor.skills, 'HEALING')
        : (this.getAvailableSkillByCategory(actor, 'HEALING') || this.getAvailableSkillByCategory(actor, 'HEALING_AOE'));
      if (healSkill) {
        const action = { type: 'skill', skillID: healSkill.id, target: actor.id };
        return isEnemy ? action : this.checkChildSkillProc(actor, action, allies, opponents);
      }
      const defSkill = isEnemy
        ? this.getEnemySkillByCategory(actor.skills, 'DEFENSE')
        : this.getAvailableSkillByCategory(actor, 'DEFENSE');
      if (defSkill && !isEnemy) {
        const action = { type: 'skill', skillID: defSkill.id, target: actor.id };
        return this.checkChildSkillProc(actor, action, allies, opponents);
      }
    }

    // ── Ally rescue (non-aggressive non-enemy) ───────────────────────────────
    if (!isEnemy && profile !== 'aggressive' && profile !== 'berserker') {
      const allyRescueThreshold = profile === 'support' ? 0.6
        : profile === 'cautious' ? 0.45
        : 0.3;
      const lowHPAlly = allies.find(p =>
        !p.defeated && p.id !== actor.id && p.currentHP <= p.maxHP * allyRescueThreshold
      );
      if (lowHPAlly) {
        const healSkill = this.getAvailableSkillByCategory(actor, 'HEALING') ||
                          this.getAvailableSkillByCategory(actor, 'HEALING_AOE');
        if (healSkill) {
          const action = { type: 'skill', skillID: healSkill.id, target: lowHPAlly.id };
          return this.checkChildSkillProc(actor, action, allies, opponents);
        }
      }
    }

    // ── Resource restoration ─────────────────────────────────────────────────
    const staminaRatio = actor.currentStamina / actor.maxStamina;
    const manaRatio    = actor.currentMana    / actor.maxMana;
    if (staminaRatio < 0.15 && manaRatio < 0.15) {
      const restoreSkill = isEnemy
        ? this.getEnemySkillByCategory(actor.skills, 'RESTORATION')
        : (this.getAvailableSkillByCategory(actor, 'RESTORATION') || this.getAvailableSkillByCategory(actor, 'CONSUMABLE_RESTORATION'));
      if (restoreSkill) {
        const action = { type: 'skill', skillID: restoreSkill.id, target: actor.id };
        return isEnemy ? action : this.checkChildSkillProc(actor, action, allies, opponents);
      }
    }

    // ── Support profile: ally buff/heal ──────────────────────────────────────
    if (isEnemy && profile === 'support' && aliveAllies.length > 1 && Math.random() < 0.35) {
      const buffSkill = this.getEnemySkillByCategory(actor.skills, 'BUFF');
      if (buffSkill) {
        const weakestAlly = aliveAllies
          .filter(a => a.id !== actor.id)
          .reduce((min, a) => a.currentHP < min.currentHP ? a : min, aliveAllies[0]);
        return { type: 'skill', skillID: buffSkill.id, target: weakestAlly.id };
      }
    }

    // ── Targeting — weighted random vs focused ───────────────────────────────
    const statusEngine = this.statusEngine;
    function _weightedRandomTarget(pool) {
      const weights = pool.map(p => {
        let w = 1.0;
        if (tauntCasterId && p.id === tauntCasterId) w *= 4.0;
        if (p.statusEffects?.some(e => e.id === 'stealth' && e.duration > 0)) w *= 0.15;
        p.statusEffects?.forEach(activeStatus => {
          const def = statusEngine?.statusMap?.[activeStatus.id];
          if (def?.targetingWeight && activeStatus.duration > 0) w *= def.targetingWeight;
        });
        return w;
      });
      const total = weights.reduce((a, b) => a + b, 0);
      let roll = Math.random() * total;
      for (let i = 0; i < pool.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return pool[i];
      }
      return pool[pool.length - 1];
    }

    // If this enemy is taunted, heavily bias targeting toward whoever applied it.
    // sourceId is stamped on the status instance at application time.
    const tauntStatus = isEnemy && actor.statusEffects?.find(e => e.id === 'taunt' && e.duration > 0);
    const tauntCasterId = tauntStatus?.sourceId ?? null;

    let primaryTarget;
    // Taunted enemies always go through weighted random so the caster bias applies.
    const usePreferred = Math.random() < focusChance;
    // Build a candidate pool based on profile preference, then run weighted random
    // on that pool. Status weights (taunt, stealth, etc.) always apply within the pool.
    // Pool size: top 2 candidates by profile metric, or all opponents if pool would be 1.
    let candidatePool;
    if (tauntCasterId || !usePreferred || profile === 'berserker') {
      // No profile preference — full pool
      candidatePool = aliveOpponents;
    } else if (profile === 'tactical' || profile === 'disruptor' || profile === 'cautious') {
      // Prefer highest-threat targets
      const sorted = [...aliveOpponents].sort((a, b) => this._threatScore(b) - this._threatScore(a));
      candidatePool = sorted.slice(0, Math.max(2, Math.ceil(sorted.length * 0.4)));
    } else if (profile === 'opportunist') {
      // Prefer most-debuffed, tiebreak lowest HP
      const sorted = [...aliveOpponents].sort((a, b) => {
        const aDebuffs = (a.statusEffects || []).filter(e => e.duration > 0).length;
        const bDebuffs = (b.statusEffects || []).filter(e => e.duration > 0).length;
        if (bDebuffs !== aDebuffs) return bDebuffs - aDebuffs;
        return a.currentHP - b.currentHP;
      });
      candidatePool = sorted.slice(0, Math.max(2, Math.ceil(sorted.length * 0.4)));
    } else {
      // aggressive, balanced, support — prefer lowest HP
      const sorted = [...aliveOpponents].sort((a, b) => a.currentHP - b.currentHP);
      candidatePool = sorted.slice(0, Math.max(2, Math.ceil(sorted.length * 0.4)));
    }
    primaryTarget = _weightedRandomTarget(candidatePool);

    // ── Build skill pool ─────────────────────────────────────────────────────
    const validCategories = [
      'DAMAGE_SINGLE','DAMAGE_AOE','DAMAGE_MAGIC','DAMAGE_AOE_MAGIC',
      'HEALING','HEALING_AOE','CONTROL','BUFF','DEFENSE','UTILITY','RESTORATION',
      'CONSUMABLE_HEALING','CONSUMABLE_RESTORATION','CONSUMABLE_DAMAGE'
    ];

    const rawPool = isEnemy
      ? (actor.skills || []).map(id => this.skills.find(s => s.id === id)).filter(Boolean)
      : [...this.getAugmentedSkillPool(actor)].map(id => this.skills.find(s => s.id === id)).filter(Boolean);

    const usableSkills = rawPool.filter(s => this.hasResources(actor, s) && validCategories.includes(s.category));

    // ── Untrained Strike injection ────────────────────────────────────────────
    // When a player is mana-starved and has no affordable damage skills, inject
    // the universal fallback. Never available to enemies.
    if (!isEnemy) {
      const manaRatio = actor.currentMana / actor.maxMana;
      const hasAffordableDamage = usableSkills.some(s =>
        s.category && (s.category.includes('DAMAGE') || s.category === 'CONTROL')
      );
      if (manaRatio < 0.15 && !hasAffordableDamage) {
        const untrainedSkill = this.skills.find(s => s.id === 'untrained_strike');
        if (untrainedSkill && this.hasResources(actor, untrainedSkill) &&
            !usableSkills.find(s => s.id === 'untrained_strike')) {
          usableSkills.push(untrainedSkill);
        }
      }
    }

    // Build intrinsic ID set for this actor — used to apply a score penalty below.
    // Intrinsics should fire, but not crowd out skills the player deliberately equipped.
    const intrinsicIds = new Set(
      !isEnemy && actor.skills
        ? actor.skills.filter(s => s.intrinsic).map(s => s.skillID)
        : []
    );

    if (usableSkills.length > 0) {
      const candidates = usableSkills.map(skill => {
        const cat = skill.category;
        let target = primaryTarget.id;

        // Resolve target per category
        if (cat === 'HEALING' || cat === 'HEALING_AOE' || cat === 'RESTORATION' ||
            cat === 'BUFF' || cat === 'DEFENSE' ||
            cat === 'CONSUMABLE_HEALING' || cat === 'CONSUMABLE_RESTORATION') {
          target = actor.id;
        } else if (cat.includes('AOE')) {
          target = null;
        } else if (cat === 'CONTROL' || cat === 'UTILITY') {
          const hasEnemyEffect = skill.effects?.some(e =>
            e.targets === 'single_enemy' || e.targets === 'all_enemies' ||
            (!e.targets && e.type === 'apply_debuff')
          );
          const hasSelfOnly = skill.effects?.every(e =>
            e.targets === 'self' || e.type === 'apply_buff'
          );
          if (hasSelfOnly && !hasEnemyEffect) {
            target = actor.id;
          } else if (profile === 'disruptor' && context.highestThreatScore > 0) {
            target = aliveOpponents.reduce((best, e) =>
              this._threatScore(e) > this._threatScore(best) ? e : best
            ).id;
          }
          // else target stays as primaryTarget.id
        }

        let score = skill.basePower ?? 1;

        // Berserker skips all modifiers — raw power only
        if (profile === 'berserker') return { skill, target, score };

        // ── Shared scoring modifiers ─────────────────────────────────────────

        // Resource ratio
        const resourceRatio = skill.costType === 'stamina'
          ? actor.currentStamina / actor.maxStamina
          : skill.costType === 'mana'
            ? actor.currentMana / actor.maxMana
            : 1.0;
        if (resourceRatio < 0.3) score *= 0.5;

        // Stage budget conservation (players only) — cautious handles its own tighter version above
        if (conservationEnabled && profile !== 'cautious' && context.stagesRemaining > 0) {
          const budgetRatio = skill.costType === 'stamina'
            ? context.staminaBudgetRatio : context.manaBudgetRatio;
          if (budgetRatio < 0.6) score *= 0.75;
        }

        // Debuff redundancy
        const targetCombatant = target ? [...aliveOpponents, ...allies].find(c => c.id === target) : null;
        if (targetCombatant) {
          const primaryDebuff = skill.effects?.find(e => e.type === 'apply_debuff')?.debuff;
          if (primaryDebuff && this._targetHasDebuff(targetCombatant, primaryDebuff)) score *= 0.55;
        }

        // Buff redundancy + active buff penalty — covers UTILITY (e.g. Shadow Step) too
        if (cat === 'BUFF' || cat === 'DEFENSE' || cat === 'UTILITY') {
          const primaryBuff = skill.effects?.find(e => e.type === 'apply_buff')?.buff;
          if (primaryBuff && this._targetHasDebuff(actor, primaryBuff)) score *= 0.15;
          const activeBuffCount = (actor.statusEffects || []).filter(e => e.duration > 0).length;
          if (activeBuffCount >= 1) score *= 0.4;
          if (activeBuffCount >= 2) score *= 0.3;
        }

        // HP pressure — when the actor is hurting, threat removal trumps buffs/utility
        if (cat === 'BUFF' || cat === 'DEFENSE' || cat === 'UTILITY') {
          const hpRatio = actor.currentHP / actor.maxHP;
          if (hpRatio < 0.25) score *= 0.05;
          else if (hpRatio < 0.5) score *= 0.2;
        }

        // Buff cooldown
        if ((cat === 'BUFF' || cat === 'DEFENSE' || cat === 'UTILITY') && actor.buffCooldowns) {
          const lastUsedTurn = actor.buffCooldowns[skill.id];
          if (lastUsedTurn !== undefined) {
            const buffDuration = skill.effects?.find(e => e.duration)?.duration || 3;
            const cooldownWindow = buffDuration + 3;
            const turnsSinceUse = (context.stageTurnCount || 0) - lastUsedTurn;
            if (turnsSinceUse < cooldownWindow) {
              score *= Math.max(0.05, turnsSinceUse / cooldownWindow);
            }
          }
        }

        // Healing efficiency
        if (cat === 'HEALING' || cat === 'HEALING_AOE' || cat === 'CONSUMABLE_HEALING') {
          const healTarget = target ? [...aliveOpponents, ...allies].find(c => c.id === target) : actor;
          if (healTarget) {
            const hpRatio = healTarget.currentHP / healTarget.maxHP;
            if (hpRatio > 0.8) score *= 0.1;
            else if (hpRatio > 0.6) score *= 0.4;
            else if (hpRatio < 0.3) score *= 2.0;
          }
        }

        // Proc pressure bonus (players only)
        if (!isEnemy && context.lastUsedSkillId &&
            cat && !['DEFENSE','BUFF','RESTORATION'].includes(cat) &&
            this._hasProcOpportunity(actor, skill.id, context.lastUsedSkillId)) {
          const childSkill = this.skills.find(child =>
            child.parentSkills?.includes(skill.id) &&
            child.parentSkills?.includes(context.lastUsedSkillId)
          );
          const childRecord = childSkill ? actor.skills?.find(s => s.skillID === childSkill.id) : null;
          const alreadyUnlocked = childRecord && (childRecord.skillLevel || 0) >= 1;
          if (!alreadyUnlocked) score *= procPressureBonus;
        }

        // AOE value
        if (cat && cat.includes('AOE')) score *= Math.max(1, aliveOpponents.length * 0.5);

        // Finishing blow
        if (targetCombatant && targetCombatant.currentHP <= targetCombatant.maxHP * 0.25) score *= 1.2;

        // Highest threat targeting bonus
        if (targetCombatant && context.highestThreatScore > 0) {
          if (Math.abs(this._threatScore(targetCombatant) - context.highestThreatScore) < 0.01) score *= 1.15;
        }

        // Untrained Strike — big score bonus when it's been injected (mana-starved, no damage)
        // Its raw basePower of 1.2 would lose to many things otherwise
        if (skill.id === 'untrained_strike') {
          score *= 4.0;  // override all other scoring — if it's in the pool, use it
        }
        if (profile === 'aggressive') {
          const targetHPPct = targetCombatant
            ? targetCombatant.currentHP / targetCombatant.maxHP
            : 1.0;
          const bloodDrawn = targetHPPct <= 0.75;

          if (!bloodDrawn) {
            // Target is healthy — set up the kill like opportunist would
            if (cat && cat.includes('DAMAGE')) score *= 1.2;
            if (cat === 'CONTROL' || cat === 'UTILITY') score *= 1.3;
            if (cat === 'BUFF' || cat === 'DEFENSE') score *= 0.65;
            if (targetCombatant && (targetCombatant.statusEffects || []).some(e => e.duration > 0)) {
              if (cat && cat.includes('DAMAGE')) score *= 1.8;
            }
          } else {
            // Blood drawn — focus in for the kill
            if (cat && cat.includes('DAMAGE')) score *= 2.2;
            if (cat === 'CONTROL') score *= 0.4;
            if (cat === 'BUFF' || cat === 'DEFENSE') score *= 0.25;
            if (cat === 'UTILITY') score *= 0.35;
            // Deeper into kill range, even more single-minded
            if (targetHPPct <= 0.40) {
              if (cat && cat.includes('DAMAGE')) score *= 1.4;
              if (cat !== 'HEALING' && cat !== 'HEALING_AOE' && !(cat && cat.includes('DAMAGE'))) score *= 0.5;
            }
          }
          // Healing is gated by the 15% emergency threshold above — no additional suppression needed
        }
        if (profile === 'cautious') {
          if (cat === 'UTILITY' || cat === 'DEFENSE') score *= 1.6;
          if (cat === 'BUFF') score *= 1.3;
          if (cat === 'HEALING' || cat === 'HEALING_AOE') score *= 1.4;
          if (cat && cat.includes('DAMAGE')) score *= 0.8;
          if (conservationEnabled && context.stagesRemaining > 0) {
            const budgetRatio = skill.costType === 'stamina'
              ? context.staminaBudgetRatio : context.manaBudgetRatio;
            if (budgetRatio < 0.8) score *= 0.5;
          }
        }
        if (profile === 'support') {
          if (cat === 'HEALING' || cat === 'HEALING_AOE') score *= 1.8;
          if (cat === 'BUFF') score *= 1.6;
          if (cat && cat.includes('DAMAGE')) score *= 0.55;
          if (cat === 'CONTROL') score *= 1.2;
        }
        if (profile === 'disruptor') {
          if (cat === 'CONTROL') score *= 2.0;
          if (cat === 'UTILITY') score *= 1.5;
          if (cat === 'BUFF' || cat === 'DEFENSE') score *= 0.55;
          if (cat && cat.includes('DAMAGE')) score *= 0.9;
        }
        if (profile === 'opportunist') {
          if (cat && cat.includes('DAMAGE')) score *= 1.2;
          if (cat === 'CONTROL' || cat === 'UTILITY') score *= 1.3;
          if (cat === 'BUFF' || cat === 'DEFENSE') score *= 0.65;
          if (targetCombatant && (targetCombatant.statusEffects || []).some(e => e.duration > 0)) {
            if (cat && cat.includes('DAMAGE')) score *= 1.8;
          }
        }
        if (profile === 'tactical') {
          if (cat === 'CONTROL') score *= 1.4;
          if (cat === 'UTILITY') score *= 1.2;
          if (cat && cat.includes('DAMAGE')) score *= 1.1;
        }

        // Turn 1 priority: if the actor has no active buffs, heavily favour casting one
        if ((cat === 'BUFF' || cat === 'DEFENSE') && (context.stageTurnCount || 0) <= 1) {
          const activeBuffCount = (actor.statusEffects || []).filter(e => e.duration > 0).length;
          if (activeBuffCount === 0) score *= 4.0;
        }

        // Buff timing curve — decays over time but floors at 0.35 so buffs stay viable
        if (cat === 'BUFF' || cat === 'DEFENSE' || cat === 'UTILITY') {
          const turn = context.stageTurnCount || 0;
          const buffTimingMultiplier = turn <= 3 ? 1.0 : turn <= 6 ? 0.6 : turn <= 9 ? 0.35 : 0.35;
          score *= buffTimingMultiplier;
        }

        // Buff window — bonus when healthy, gentler solo penalty
        if ((cat === 'BUFF' || cat === 'DEFENSE' || cat === 'UTILITY') &&
            actor.currentHP > actor.maxHP * 0.75 && resourceRatio > 0.5) {
          const enemyPressure = aliveOpponents.length > aliveAllies.length;
          const soloMultiplier = aliveAllies.length <= 1 ? 0.6 : 1.0;  // 0.6 not 0.2
          score *= soloMultiplier * (enemyPressure ? 0.7 : 1.15);
        }

        // AOE healing bonus when 2+ allies hurt
        if (cat === 'HEALING_AOE') {
          const hurtAllies = allies.filter(p => !p.defeated && p.currentHP < p.maxHP * 0.7).length;
          if (hurtAllies >= 2) score *= 1.4;
          // Solo penalty on AOE heals specifically
          if (aliveAllies.length <= 1) score *= 0.3;
        }

        // Consumable use — gated by fight difficulty
        const isConsumable = cat === 'CONSUMABLE_HEALING'     || cat === 'CONSUMABLE_RESTORATION' ||
                             cat === 'CONSUMABLE_DAMAGE'      || cat === 'CONSUMABLE_ESCAPE'      ||
                             cat === 'CONSUMABLE_BUFF'        || cat === 'CONSUMABLE_CONTROL';
        if (isConsumable) {
          const difficulty = this._assessFightDifficulty(actor, allies, aliveOpponents, context);
          if (difficulty === 'easy') { score = 0; return { skill, target, score }; }

          const hpPct      = actor.currentHP / actor.maxHP;
          const staminaPct = actor.currentStamina / actor.maxStamina;
          const manaPct    = actor.currentMana / actor.maxMana;
          const tookBigHit = (context.lastHitDamagePct || 0) >= 0.2;
          const hasBadDebuff = ['silence','blind','weaken','armor_break','exhaustion'].some(d =>
            actor.statusEffects?.some(e => e.id === d && e.duration > 0));
          const isBossFight = aliveOpponents.length === 1 && aliveOpponents[0].maxHP > actor.maxHP * 3;

          if (cat === 'CONSUMABLE_HEALING') {
            const healThreshold = profile === 'cautious' ? 0.50 : profile === 'support' ? 0.45
              : profile === 'aggressive' ? 0.15 : 0.35;
            if (hpPct > healThreshold && !tookBigHit) score *= 0.05;
            else { score *= 1.5; if (tookBigHit) score *= 1.4; if (isBossFight) score *= 1.2; }
          }
          if (cat === 'CONSUMABLE_RESTORATION') {
            const bothLow = staminaPct < 0.20 && manaPct < 0.20;
            const eligible = profile === 'cautious' ? (staminaPct < 0.25 || manaPct < 0.25) : bothLow;
            if (!eligible) score *= 0.02;
            else { score *= 1.3; if (isBossFight) score *= 1.2; }
          }
          if (cat === 'CONSUMABLE_DAMAGE') {
            if (profile === 'aggressive') score *= difficulty === 'hard' ? 1.4 : 0.8;
            else if (profile === 'opportunist') {
              const targetDebuffed = targetCombatant &&
                (targetCombatant.statusEffects || []).some(e => e.duration > 0);
              score *= (isBossFight || targetDebuffed) ? 1.2 : 0.1;
            } else score *= 0.05;
          }
          if (cat === 'CONSUMABLE_BUFF') {
            // Use buffs early in hard fights; cautious/support pop them proactively
            const earlyFight = (context.turnCount || 0) <= 3;
            if (profile === 'cautious' || profile === 'support') score *= earlyFight ? 1.4 : 0.6;
            else if (profile === 'aggressive' || profile === 'berserker') score *= isBossFight ? 1.3 : 0.7;
            else score *= difficulty === 'hard' ? 1.0 : 0.3;
          }
          if (cat === 'CONSUMABLE_CONTROL') {
            // Traps and AOE control — best used early or when outnumbered
            const outnumbered = aliveOpponents.length > allies.filter(a => !a.defeated).length;
            if (profile === 'tactical' || profile === 'disruptor') score *= outnumbered ? 1.5 : 1.0;
            else if (profile === 'aggressive') score *= 0.4;
            else score *= outnumbered ? 0.8 : 0.2;
          }
          if (cat === 'CONSUMABLE_ESCAPE') {
            score *= hasBadDebuff ? 1.8 : 0.05;
          }
          if (difficulty === 'normal') score *= 0.4;
        }

        // Sudden death awareness — field is killing everyone, end the fight NOW
        if (context.suddenDeathActive) {
          if (cat && cat.includes('DAMAGE')) score *= 2.0;
          else if (cat === 'BUFF' || cat === 'DEFENSE' || cat === 'UTILITY') score *= 0.05;
          else if (cat === 'HEALING' || cat === 'HEALING_AOE') score *= 0.05;
          // untrained_strike already has its own bonus but gets the damage boost on top
        }

        return { skill, target, score };
      });

      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];
      if (best) {
        const action = { type: 'skill', skillID: best.skill.id, target: best.target };
        return isEnemy ? action : this.checkChildSkillProc(actor, action, allies, opponents);
      }
    }

    // ── Desperation: NO_RESOURCES fallback ───────────────────────────────────
    const desperationPool = this.skills.filter(s => s.category === 'NO_RESOURCES');
    if (desperationPool.length > 0) {
      const chosenSkill = desperationPool[Math.floor(Math.random() * desperationPool.length)];
      //console.log(`[DESPERATION] ${actor.name} ${actor.id} is out of resources! Randomly selected: ${chosenSkill.name}`);
      const hasDamageEffect = chosenSkill.effects?.some(e =>
        e.type === 'damage' && (!e.targets || e.targets === 'single_enemy' || e.targets === 'all_enemies')
      );
      const isSelfish = !hasDamageEffect && chosenSkill.effects?.some(e =>
        e.type === 'restore_resource' ||
        (e.type === 'apply_buff'   && e.targets === 'self') ||
        (e.type === 'apply_debuff' && e.targets === 'self')
      );
      const targetId = isSelfish ? actor.id
        : aliveOpponents.reduce((min, e) => e.currentHP < min.currentHP ? e : min).id;
      return { type: 'skill', skillID: chosenSkill.id, target: targetId };
    }

    console.error(`[CRITICAL] ${actor.name} has no resources AND NO_RESOURCES pool is empty!`);
    const fallback = aliveOpponents.reduce((min, e) => e.currentHP < min.currentHP ? e : min);
    return { type: 'attack', target: fallback.id };
  }


  /**
   * Build the context object passed to both action selectors each turn.
   */
  _buildContext(stageIndex, allStages, players, enemies, actor, stageTurnCount = 0) {
    const totalStages     = allStages.length;
    const stagesRemaining = Math.max(0, totalStages - stageIndex - 1);
    const aliveEnemies    = enemies.filter(e => !e.defeated);
    const alivePlayers    = players.filter(p => !p.defeated);

    const threatScores    = aliveEnemies.map(e => this._threatScore(e));
    const highestThreatScore = threatScores.length > 0 ? Math.max(...threatScores) : 0;

    return {
      stageIndex,
      totalStages,
      stagesRemaining,
      aliveEnemies,
      alivePlayers,
      highestThreatScore,
      stageTurnCount,
      lastUsedSkillId:  actor.lastUsedSkillId || null,
      lastHitDamagePct: actor.lastHitDamagePct || 0,
      suddenDeathActive: stageTurnCount > 100,
      // Budget ratios only meaningful for players persisting across stages.
      // Enemies respawn fresh each stage so conservation pressure doesn't apply.
      staminaBudgetRatio: actor.type === 'player'
          ? actor.currentStamina / (actor.maxStamina / Math.max(1, stagesRemaining + 1))
          : 1.0,
      manaBudgetRatio: actor.type === 'player'
          ? actor.currentMana / (actor.maxMana / Math.max(1, stagesRemaining + 1))
          : 1.0,
    };
  }

  /**
   * Score a candidate skill+target action for a player character.
   */
  _scoreAction(character, skill, target, context, opts = {}) {
    const { aliveEnemies = [], players = [], profile = 'balanced',
            procPressureBonus = 1.35, conservationEnabled = true } = opts;

    let score = skill.basePower || 1;
    const cat = skill.category;

    // ── Jitter — prevent deterministic lock-in when two damage skills have similar power ──
    if (cat && cat.includes('DAMAGE')) {
        score *= 0.5 + Math.random() * 1.0; // 50%–150% of basePower
    }

    // ── Resource ratio ──
    const resourceRatio = skill.costType === 'stamina'
        ? character.currentStamina / character.maxStamina
        : skill.costType === 'mana'
            ? character.currentMana / character.maxMana
            : 1.0;

    // Penalise expensive skills when resources are low
    if (conservationEnabled && resourceRatio < 0.3) score *= 0.5;

    // Stage budget conservation — late in a multi-stage challenge, spend carefully
    if (conservationEnabled && context.stagesRemaining > 0) {
        const budgetRatio = skill.costType === 'stamina'
            ? context.staminaBudgetRatio : context.manaBudgetRatio;
        if (budgetRatio < 0.6) score *= (profile === 'cautious' ? 0.55 : 0.75);
    }

    // ── Debuff redundancy penalty ──
    const targetCombatant = target
        ? [...aliveEnemies, ...players].find(c => c.id === target)
        : null;
    if (targetCombatant) {
        const primaryDebuff = skill.effects?.find(e => e.type === 'apply_debuff')?.debuff;
        if (primaryDebuff && this._targetHasDebuff(targetCombatant, primaryDebuff)) {
            score *= 0.55;
        }
    }

    // ── Buff redundancy penalty — covers UTILITY (e.g. Shadow Step) too ──
    if (cat === 'BUFF' || cat === 'DEFENSE' || cat === 'UTILITY') {
        const primaryBuff = skill.effects?.find(e => e.type === 'apply_buff')?.buff;
        if (primaryBuff && this._targetHasDebuff(character, primaryBuff)) {
            score *= 0.15;
        }
        const activeBuffCount = (character.statusEffects || []).filter(e => e.duration > 0).length;
        if (activeBuffCount >= 1) score *= 0.4;
        if (activeBuffCount >= 2) score *= 0.3;
    }

    // ── HP pressure — when hurting, threat removal trumps buffs/utility ──
    if (cat === 'BUFF' || cat === 'DEFENSE' || cat === 'UTILITY') {
        const hpRatio = character.currentHP / character.maxHP;
        if (hpRatio < 0.25) score *= 0.05;
        else if (hpRatio < 0.5) score *= 0.2;
    }

    // ── Buff cooldown — penalize reusing a buff skill too soon after last use ──
    // Prevents immediate reapplication the moment a buff expires.
    // Cooldown window = buff duration + 3 turns grace period.
    if ((cat === 'BUFF' || cat === 'DEFENSE' || cat === 'UTILITY') && character.buffCooldowns) {
        const lastUsedTurn = character.buffCooldowns[skill.id];
        if (lastUsedTurn !== undefined) {
            const buffDuration = skill.effects?.find(e => e.duration)?.duration || 3;
            const cooldownWindow = buffDuration + 3;
            const turnsSinceUse = (context.stageTurnCount || 0) - lastUsedTurn;
            if (turnsSinceUse < cooldownWindow) {
                const cooldownPenalty = Math.max(0.05, turnsSinceUse / cooldownWindow);
                score *= cooldownPenalty;
            }
        }
    }

    // ── Healing efficiency — don't heal when near full HP ──
    if (cat === 'HEALING' || cat === 'HEALING_AOE' || cat === 'CONSUMABLE_HEALING') {
        const healTarget = target ? [...aliveEnemies, ...players].find(c => c.id === target) : character;
        if (healTarget) {
            const hpRatio = healTarget.currentHP / healTarget.maxHP;
            if (hpRatio > 0.8) score *= 0.1;       // near full — almost never heal
            else if (hpRatio > 0.6) score *= 0.4;  // healthy — prefer damage instead
            else if (hpRatio < 0.3) score *= 2.0;  // critical — strongly prefer heal
        }
    }

    // ── Proc pressure bonus — nudge toward a combo that might proc a child skill ──
    // Only applies to damage/control skills — not DEFENSE/BUFF which would distort survival decisions
    if (context.lastUsedSkillId &&
        cat && !['DEFENSE','BUFF','RESTORATION'].includes(cat) &&
        this._hasProcOpportunity(character, skill.id, context.lastUsedSkillId)) {
        // Only boost if the child skill isn't already unlocked at level 1+
        const childSkill = this.skills.find(child =>
            child.parentSkills?.includes(skill.id) &&
            child.parentSkills?.includes(context.lastUsedSkillId)
        );
        const childRecord = childSkill
            ? character.skills?.find(s => s.skillID === childSkill.id)
            : null;
        const alreadyUnlocked = childRecord && (childRecord.skillLevel || 0) >= 1;
        if (!alreadyUnlocked) score *= procPressureBonus;
    }

    // ── AOE value — scales with enemy count ──
    if (cat && cat.includes('AOE')) {
        score *= Math.max(1, aliveEnemies.length * 0.5);
    }

    // ── Finishing blow ──
    if (targetCombatant && targetCombatant.currentHP <= targetCombatant.maxHP * 0.25) {
        score *= 1.2;
    }

    // ── Threat bonus — targeting most dangerous enemy ──
    if (targetCombatant && context.highestThreatScore > 0) {
        if (Math.abs(this._threatScore(targetCombatant) - context.highestThreatScore) < 0.01) {
            score *= 1.15;
        }
    }

    // ── Profile-specific scoring ──────────────────────────────────────────────
    // Each profile has a distinct identity — these are meaningful multipliers, not nudges.

    if (profile === 'aggressive') {
      if (cat && cat.includes('DAMAGE')) score *= 1.5;
      if (cat === 'BUFF' || cat === 'DEFENSE') score *= 0.25;  // almost never buffs
      if (cat === 'UTILITY') score *= 0.35;
      if (cat === 'HEALING' || cat === 'HEALING_AOE') score *= 0.5;  // ignores healing
    }

    if (profile === 'cautious') {
      if (cat === 'UTILITY' || cat === 'DEFENSE') score *= 1.6;  // Footwork, block, evasion
      if (cat === 'BUFF') score *= 1.3;
      if (cat === 'HEALING' || cat === 'HEALING_AOE') score *= 1.4;
      if (cat && cat.includes('DAMAGE')) score *= 0.8;
      // Cautious conserves more aggressively across stages
      if (conservationEnabled && context.stagesRemaining > 0) {
        const budgetRatio = skill.costType === 'stamina'
          ? context.staminaBudgetRatio : context.manaBudgetRatio;
        if (budgetRatio < 0.8) score *= 0.5;  // tighter threshold than other profiles
      }
    }

    if (profile === 'support') {
      if (cat === 'HEALING' || cat === 'HEALING_AOE') score *= 1.8;
      if (cat === 'BUFF') score *= 1.6;
      if (cat && cat.includes('DAMAGE')) score *= 0.55;
      if (cat === 'CONTROL') score *= 1.2;
    }

    if (profile === 'disruptor') {
      if (cat === 'CONTROL') score *= 2.0;
      if (cat === 'UTILITY') score *= 1.5;
      if (cat === 'BUFF' || cat === 'DEFENSE') score *= 0.55;
      if (cat && cat.includes('DAMAGE')) score *= 0.9;
    }

    if (profile === 'opportunist') {
      if (cat && cat.includes('DAMAGE')) score *= 1.2;
      if (cat === 'CONTROL' || cat === 'UTILITY') score *= 1.3;  // set up procs
      if (cat === 'BUFF' || cat === 'DEFENSE') score *= 0.65;
      // Big bonus when attacking a debuffed target
      if (targetCombatant && (targetCombatant.statusEffects || []).some(e => e.duration > 0)) {
        if (cat && cat.includes('DAMAGE')) score *= 1.8;
      }
    }

    if (profile === 'balanced') {
      // Small nudges only — balanced is genuinely neutral
      if (cat && cat.includes('DAMAGE')) score *= 1.05;
    }

    if (profile === 'tactical') {
      if (cat === 'CONTROL') score *= 1.4;
      if (cat === 'UTILITY') score *= 1.2;
      if (cat && cat.includes('DAMAGE')) score *= 1.1;
    }

    // ── Buff timing curve — universal ────────────────────────────────────────
    // Turn 1 priority: if the actor has no active buffs, heavily favour casting one
    if ((cat === 'BUFF' || cat === 'DEFENSE') && (context.stageTurnCount || 0) <= 1) {
      const activeBuffCount = (actor.statusEffects || []).filter(e => e.duration > 0).length;
      if (activeBuffCount === 0) score *= 4.0;
    }

    // Early turns: buffing is smart. Late turns: just deal damage.
    // Floors at 0.35 so buffs remain viable throughout combat.
    if (cat === 'BUFF' || cat === 'DEFENSE' || cat === 'UTILITY') {
      const turn = context.stageTurnCount || 0;
      const buffTimingMultiplier = turn <= 3  ? 1.0
        : turn <= 6  ? 0.6
        : 0.35;
      score *= buffTimingMultiplier;
    }

    // ── Buff window — bonus for buffing when healthy ──────────────────────────
    if ((cat === 'BUFF' || cat === 'DEFENSE' || cat === 'UTILITY') &&
        character.currentHP > character.maxHP * 0.75 &&
        resourceRatio > 0.5) {
      const aliveAllies = players.filter(p => !p.defeated).length;
      const enemyPressure = aliveEnemies.length > aliveAllies;
      // Solo penalty — gentler than before (0.6× not 0.2×)
      // HEALING_AOE is the one that's genuinely less useful solo, not utility
      const soloMultiplier = aliveAllies <= 1 ? 0.6 : 1.0;
      score *= soloMultiplier * (enemyPressure ? 0.7 : 1.15);
    }

    // ── Support profile: HEALING_AOE bonus when 2+ allies are hurt ──
    if (cat === 'HEALING_AOE') {
        const hurtAllies = players.filter(p => !p.defeated && p.currentHP < p.maxHP * 0.7).length;
        if (hurtAllies >= 2) score *= 1.4;
    }

    // ── Consumable use — gated by fight difficulty ───────────────────────────
    const isConsumable = cat === 'CONSUMABLE_HEALING'     || cat === 'CONSUMABLE_RESTORATION' ||
                         cat === 'CONSUMABLE_DAMAGE'      || cat === 'CONSUMABLE_ESCAPE'      ||
                         cat === 'CONSUMABLE_BUFF'        || cat === 'CONSUMABLE_CONTROL';

    if (isConsumable) {
      const difficulty = this._assessFightDifficulty(character, players, aliveEnemies, context);

      // Easy fight — never use consumables
      if (difficulty === 'easy') {
        score *= 0.0;
        return score;
      }

      const hpPct          = character.currentHP / character.maxHP;
      const staminaPct     = character.currentStamina / character.maxStamina;
      const manaPct        = character.currentMana / character.maxMana;
      const tookBigHit     = (context.lastHitDamagePct || 0) >= 0.2;
      const hasBadDebuff   = ['silence','blind','weaken','armor_break','exhaustion'].some(d =>
        character.statusEffects?.some(e => e.id === d && e.duration > 0)
      );
      const isBossFight    = aliveEnemies.length === 1 &&
                             aliveEnemies[0].maxHP > (character.maxHP * 3);

      // Per-category base eligibility thresholds
      if (cat === 'CONSUMABLE_HEALING') {
        const healThreshold = {
          cautious:   0.50,
          support:    0.45,
          balanced:   0.35,
          tactical:   0.35,
          disruptor:  0.30,
          opportunist:0.30,
          aggressive: 0.15,
          berserker:  0.10,
        }[profile] ?? 0.35;

        if (hpPct > healThreshold && !tookBigHit) {
          score *= 0.05;  // not eligible yet
        } else {
          score *= 1.5;
          if (tookBigHit) score *= 1.4;  // reactive: just got hit hard
          if (isBossFight) score *= 1.2;
        }
      }

      if (cat === 'CONSUMABLE_RESTORATION') {
        const bothLow = staminaPct < 0.20 && manaPct < 0.20;
        const eitherLow = profile === 'cautious'
          ? (staminaPct < 0.25 || manaPct < 0.25)
          : bothLow;
        if (!eitherLow) {
          score *= 0.02;  // not eligible
        } else {
          score *= 1.3;
          if (isBossFight) score *= 1.2;
        }
      }

      if (cat === 'CONSUMABLE_DAMAGE') {
        // Aggressive and opportunist use damage consumables; others almost never do
        if (profile === 'aggressive') {
          score *= difficulty === 'hard' ? 1.4 : 0.8;
          if (isBossFight) score *= 1.3;
        } else if (profile === 'opportunist') {
          // Only in boss fight or when target is debuffed
          const targetDebuffed = targetCombatant &&
            (targetCombatant.statusEffects || []).some(e => e.duration > 0);
          score *= (isBossFight || targetDebuffed) ? 1.2 : 0.1;
        } else {
          score *= 0.05;  // other profiles almost never throw damage consumables
        }
      }

      if (cat === 'CONSUMABLE_BUFF') {
        const earlyFight = (context.turnCount || 0) <= 3;
        if (profile === 'cautious' || profile === 'support') score *= earlyFight ? 1.4 : 0.6;
        else if (profile === 'aggressive' || profile === 'berserker') score *= isBossFight ? 1.3 : 0.7;
        else score *= difficulty === 'hard' ? 1.0 : 0.3;
      }

      if (cat === 'CONSUMABLE_CONTROL') {
        const outnumbered = aliveEnemies.length > players.filter(p => !p.defeated).length;
        if (profile === 'tactical' || profile === 'disruptor') score *= outnumbered ? 1.5 : 1.0;
        else if (profile === 'aggressive') score *= 0.4;
        else score *= outnumbered ? 0.8 : 0.2;
      }

      // Cleanse consumable — activated by bad debuff regardless of profile
      if (cat === 'CONSUMABLE_ESCAPE') {
        score *= hasBadDebuff ? 1.8 : 0.05;
      }

      // Normal difficulty — additional reluctance multiplier
      if (difficulty === 'normal') score *= 0.4;
    }

    // Intrinsics are always available but should yield to deliberately equipped skills.
    // Apply a moderate penalty so equipped skills win when scores are otherwise close.
    if (intrinsicIds.has(skill.id)) score *= 0.6;

    return score;
  }

  /**
   * Assess how difficult the current fight is for the actor.
   * Returns 'easy', 'normal', or 'hard'.
   * Used to gate consumable use — nobody wastes consumables on an easy fight.
   */
  _assessFightDifficulty(actor, allies, opponents, context) {
    const aliveEnemies  = opponents.filter(e => !e.defeated);
    const aliveAllies   = allies.filter(a => !a.defeated);

    // Easy signals — all of these must be absent for anything beyond 'easy'
    const allEnemiesLow    = aliveEnemies.length > 0 &&
      aliveEnemies.every(e => e.currentHP / e.maxHP < 0.5);
    const allAlliesHealthy = aliveAllies.every(a => a.currentHP / a.maxHP > 0.7);
    const notOutnumbered   = aliveEnemies.length <= aliveAllies.length;
    const fewTurns         = (context.stageTurnCount || 0) < 6;

    if (allEnemiesLow && allAlliesHealthy && notOutnumbered) return 'easy';

    // Hard signals — any one is enough
    const actorHpPct      = actor.currentHP / actor.maxHP;
    const tookBigHit      = (context.lastHitDamagePct || 0) >= 0.2;
    const lowHP           = actorHpPct < 0.35;
    const allyLowHP       = aliveAllies.some(a => a.id !== actor.id && a.currentHP / a.maxHP < 0.3);
    const outnumbered     = aliveEnemies.length > aliveAllies.length + 1;
    const stalledFight    = !fewTurns && aliveEnemies.every(e => e.currentHP / e.maxHP > 0.8);
    const hasBadDebuff    = ['silence','blind','weaken','armor_break','exhaustion'].some(d =>
      actor.statusEffects?.some(e => e.id === d && e.duration > 0)
    );
    const bothResourcesLow = (actor.currentStamina / actor.maxStamina) < 0.2 &&
                             (actor.currentMana    / actor.maxMana)    < 0.2;

    if (tookBigHit || lowHP || allyLowHP || outnumbered || stalledFight || hasBadDebuff || bothResourcesLow) {
      return 'hard';
    }

    return 'normal';
  }

  /**
   * Threat score for a combatant — used for targeting decisions.
   */
  _threatScore(combatant) {
    if (!combatant || combatant.defeated) return 0;
    const stats = combatant.stats || combatant.boostedStats || {};
    const dps = (stats.ambition || 0) * 0.5 + (stats.conviction || 0) * 0.3;
    const hpFactor = combatant.maxHP > 0 ? combatant.currentHP / combatant.maxHP : 0;
    return dps * hpFactor;
  }

  /**
   * Check whether a combatant already has a given debuff active.
   */
  _targetHasDebuff(target, debuffId) {
    if (!target || !debuffId) return false;
    return target.statusEffects?.some(e => e.id === debuffId && e.duration > 0) || false;
  }

  /**
   * Check whether using `skillId` would set up a proc opportunity,
   * given that `lastUsedSkillId` was used last turn.
   */
  _hasProcOpportunity(character, skillId, lastUsedSkillId) {
    if (!lastUsedSkillId || !skillId) return false;
    const pool = this.getAugmentedSkillPool(character);
    return this.skills.some(child => {
        if (!child.parentSkills || child.parentSkills.length < 2) return false;
        return child.parentSkills.includes(lastUsedSkillId) &&
               child.parentSkills.includes(skillId) &&
               skillId !== lastUsedSkillId;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────

  getAvailableSkillByCategory(character, category) {
    // Resolve from the augmented pool: equipped slots + active consumable belt skills.
    // This ensures consumable skills are selectable while qty > 0, and drop off when spent.
    const pool = this.getAugmentedSkillPool(character);
    if (pool.size === 0) return undefined;
    return [...pool]
        .map(skillID => this.skills.find(s => s.id === skillID))
        .filter(s => s && s.category === category && this.hasResources(character, s))
        .sort((a, b) => (b.basePower || 0) - (a.basePower || 0))[0];
  }

  getEnemySkillByCategory(skillIDs, category) {
    return skillIDs
        .map(skillID => this.skills.find(s => s.id === skillID))
        .filter(s => s && s.category === category)
        .sort((a, b) => (b.basePower || 0) - (a.basePower || 0))[0];
  }

  getBestAvailableSkill(character, predicate) {
    // Resolve from the augmented pool: equipped slots + active consumable belt skills.
    const pool = this.getAugmentedSkillPool(character);
    if (pool.size === 0) return undefined;
    return [...pool]
        .map(skillID => this.skills.find(s => s.id === skillID))
        .filter(s => s && predicate(s))
        .sort((a, b) => (b.basePower || 0) - (a.basePower || 0))[0];
  }

  /**
   * Build the full set of skill IDs available to a character this turn.
   * Includes equipped skills + consumable belt skills (while qty > 0) + racial bonus skill.
   * Consumable items live in this.gear — identified by skillID or effect_skillid field.
   * Racial bonus skill is always available, never decrements, no cost check bypass
   * (cost is still paid normally — the race just always has access to it).
   */
  getAugmentedSkillPool(character) {
    const pool = new Set();

    // Equipped skill slots (first two non-intrinsic skills)
    // Intrinsic skills are also always added regardless of position
    if (character.skills) {
        let equippedCount = 0;
        character.skills.forEach(s => {
            if (s.intrinsic) {
                pool.add(s.skillID); // intrinsic always in pool
            } else if (equippedCount < 2) {
                pool.add(s.skillID);
                equippedCount++;
            }
        });
    }

    // Consumable belt — add the skill linked to each consumable with qty > 0
    const consumables = character.consumables || {};
    if (typeof consumables === 'object' && !Array.isArray(consumables)) {
        Object.entries(consumables).forEach(([consumableId, qty]) => {
            if (qty > 0) {
                const itemDef = this.gear.find(g => g.id === consumableId);
                if (itemDef) {
                    const skillId = itemDef.skillID || itemDef.effect_skillid;
                    if (skillId) pool.add(skillId);
                }
            }
        });
    }

    // Drop any IDs that don't resolve to a known skill — prevents "Skill not found"
    // from stale discovered skills or renamed entries in a character's skill array.
    for (const id of pool) {
        if (!this.skills.find(s => s.id === id)) {
            console.warn(`[SKILL POOL] Dropping unknown skill ID: ${id} for ${character.name || character.id}`);
            pool.delete(id);
        }
    }

    return pool;
  }

  /**
   * Build a skill-id → depth map by walking the parent graph.
   * Depth 1 = no parents. Depth N = max(parent depths) + 1.
   * Cycles are ignored (depth stays at whatever was last computed).
   */
  _buildSkillDepthCache() {
      const cache = new Map();
      const depth = (id, visited = new Set()) => {
          if (cache.has(id)) return cache.get(id);
          if (visited.has(id)) return 1;
          visited.add(id);
          const skill = this.skills.find(s => s.id === id);
          if (!skill || !skill.parentSkills || skill.parentSkills.length === 0) {
              cache.set(id, 1);
              return 1;
          }
          const d = Math.max(...skill.parentSkills.map(p => depth(p, new Set(visited)))) + 1;
          cache.set(id, d);
          return d;
      };
      this.skills.forEach(s => depth(s.id));
      return cache;
  }

  /**
   * Resolve proc chance for a child skill.
   * Explicit procChance on the skill data always wins.
   * Otherwise, depth-based rates from PROC_DEPTH_RATES tuning apply.
   */
  _childProcChance(childSkill, character) {
      if (childSkill.procChance != null) return childSkill.procChance;
      // If the character has already learned this skill (level >= 1), use flat 5% proc rate
      const charSkillRecord = character?.skills?.find(s => s.skillID === childSkill.id);
      if (charSkillRecord && (charSkillRecord.skillLevel || 0) >= 1) return 0.05;
      const rates = CombatEngine.TUNING.PROC_DEPTH_RATES;
      const depth = this._skillDepthCache.get(childSkill.id) || 2;
      // rates is indexed from depth 2 upward; clamp to last entry for depth 7+
      const idx = Math.min(depth - 2, rates.length - 1);
      return rates[Math.max(0, idx)];
  }

  /**
   * After the AI selects a skill, check whether a child skill should proc
   * and replace it. Returns the action to execute (may be unchanged).
   */
  checkChildSkillProc(character, selectedAction, players, enemies) {
    if (!selectedAction || selectedAction.type !== 'skill') return selectedAction;

    const selectedSkillDef = this.skills.find(s => s.id === selectedAction.skillID);
    if (!selectedSkillDef) return selectedAction;

    const selectedCategory = selectedSkillDef.category;
    const availablePool    = this.getAugmentedSkillPool(character);

    // Find child skills whose both parents are in the available pool
    const eligibleChildSkills = this.skills.filter(s => {
        if (!s.isChildSkill) return false;
        if (!s.parentSkills || s.parentSkills.length !== 2) return false;
        // Category filter removed — parent availability is the correct gate
        return s.parentSkills.every(parentId => availablePool.has(parentId));
    });

    if (eligibleChildSkills.length === 0) return selectedAction;

    const shuffled = eligibleChildSkills.sort(() => Math.random() - 0.5);

    for (const childSkill of shuffled) {
        const procChance = this._childProcChance(childSkill, character);
        if (Math.random() >= procChance) continue;

        // --- CRITICAL FIX: Prevent "Lunge replacing Lunge" ---
        // If the selected action is ALREADY this child skill, do not re-proc.
        if (selectedAction.skillID === childSkill.id) {
            return selectedAction; 
        }
        // -------------------------------------------------------

        // Proc fires — resolve target
        const aliveEnemies = enemies.filter(e => !e.defeated);
        let target = selectedAction.target;

        if (childSkill.category === 'HEALING' || childSkill.category === 'RESTORATION') {
            const lowHPAlly = players.find(p => !p.defeated && p.currentHP < p.maxHP);
            target = lowHPAlly ? lowHPAlly.id : character.id;
        } else if (childSkill.category === 'BUFF' || childSkill.category === 'DEFENSE') {
            // Buff/defense skills always target self
            target = character.id;
        } else if (aliveEnemies.length > 0) {
            // Damage/control skills — always target an enemy, never inherit a self-target
            const isDamageCat = childSkill.category && (childSkill.category.includes('DAMAGE') || childSkill.category.includes('CONTROL'));
            if (isDamageCat || !target || target === character.id) {
                target = aliveEnemies.reduce((min, e) => e.currentHP < min.currentHP ? e : min).id;
            }
        }

        // Consumable logic (unchanged)
        childSkill.parentSkills.forEach(parentSkillId => {
            const consumables = character.consumables || {};
            Object.entries(consumables).forEach(([consumableId, qty]) => {
                if (qty <= 0) return;
                const itemDef = this.gear.find(g => g.id === consumableId);
                const itemSkillId = itemDef?.skillID || itemDef?.effect_skillid;
                if (itemSkillId === parentSkillId) {
                    consumables[consumableId]--;
                    //console.log(`[CHILD PROC] Consumed ${consumableId} (${consumables[consumableId]} remaining)`);
                }
            });
        });

        // First discovery — add skill record to character
        const alreadyKnown = character.skills && character.skills.some(s => s.skillID === childSkill.id);
        const isFirstDiscovery = !alreadyKnown;

        if (isFirstDiscovery) {
            if (!character.skills) character.skills = [];
            character.skills.push({
                skillID:      childSkill.id,
                skillLevel:   0,
                skillXP:      0,
                usageCount:   0,
                discovered:   true,
                discoveredAt: Date.now()
            });
            //console.log(`[CHILD PROC] ✨ ${character.name} discovered: ${childSkill.name}!`);
        }

        // --- REMOVED: XP Award Logic ---
        // We NO LONGER award XP here. 
        // The Frontend (combat-log.js) will detect isChildSkillProc and award XP 
        // based on the strict rules (Discovery XP only if Level 0).
        // This prevents double-dipping and the "Echo Loop".
        
        //console.log(`[CHILD PROC] ${character.name} → ${childSkill.name} (replaced ${selectedSkillDef.name})`);

        return {
            type:             'skill',
            skillID:          childSkill.id,
            target,
            isChildSkillProc: true,
            isFirstDiscovery,
            replacedSkillID:  selectedAction.skillID
        };
    }

    return selectedAction;
  }

  triggerWeaponProcs(actor, target, skillLevel) {
    if (!actor.equipment?.mainHand || !this.gear) return;
    // Never proc on self — heals and buffs targeting the caster shouldn't trigger weapon effects
    if (target.id === actor.id) return;
    const weapon = this.gear.find(g => g.id === this._eqId(actor.equipment.mainHand));
    if (!weapon) return;
    const procs = [];
    
    for (let i = 1; i <= 3; i++) {
        const skillIdKey = `onhit_skillid_${i}`;
        const chanceKey = `onhit_skillchance_${i}`;
        const procSkillId = weapon[skillIdKey];
        const procChance = weapon[chanceKey];

        if (procSkillId && procChance) {
            const rolled = Math.random() * 100;
            if (rolled <= procChance) {
                procs.push({ skillId: procSkillId, chance: procChance });
            } else {
                //console.log(`[PROC] ${weapon.name} proc ${procSkillId} FAILED (chance=${procChance}%, rolled=${rolled.toFixed(1)})`);
            }
        }
    }

    procs.forEach(proc => {
        const procSkill = this.skills.find(s => s.id === proc.skillId);
        if (!procSkill) {
            console.warn(`[PROC] Skill not found: ${proc.skillId}`);
            return;
        }
        //console.log(`[PROC] ${weapon.name} triggered ${procSkill.name} on ${target.name}!`);
        this.applySkillEffects(procSkill, actor, target);

        if (procSkill.effects?.some(e => e.type === 'damage')) {
            const procDamage = this.calculateDamage(actor, procSkill, target, false, skillLevel);
            target.currentHP -= procDamage;
            if (target.currentHP <= 0) {
                target.currentHP = 0;
                target.defeated = true;
                //console.log(`[DEBUG] ${target.name} defeated by proc! (HP: 0)`);
            }
            //console.log(`[PROC] ${procSkill.name} dealt ${procDamage} damage to ${target.name}`);
        }
    });
  }

  /**
   * Fire on-hit procs from active status effect buffs on the actor.
   * Status definitions can include an onHitProc: { skillId, chance } field.
   * This allows buffs like poison_weapon and stun_weapon to apply their
   * effects on a successful hit without needing weapon item entries.
   */
  triggerStatusProcs(actor, target, skillLevel) {
    if (!actor.statusEffects || actor.statusEffects.length === 0) return;
    if (target.id === actor.id) return;

    actor.statusEffects.forEach(activeStatus => {
        const statusDef = this.statusEngine.statusMap[activeStatus.id];
        if (!statusDef?.onHitProc) return;

        const { skillId, chance } = statusDef.onHitProc;
        const rolled = Math.random() * 100;
        if (rolled > chance) {
            //console.log(`[STATUS PROC] ${activeStatus.name} proc FAILED (chance=${chance}%, rolled=${rolled.toFixed(1)})`);
            return;
        }

        const procSkill = this.skills.find(s => s.id === skillId);
        if (!procSkill) {
            console.warn(`[STATUS PROC] Skill not found: ${skillId}`);
            return;
        }

        //console.log(`[STATUS PROC] ${activeStatus.name} triggered ${procSkill.name} on ${target.name}!`);
        this.applySkillEffects(procSkill, actor, target);

        if (procSkill.effects?.some(e => e.type === 'damage')) {
            const procDamage = this.calculateDamage(actor, procSkill, target, false, skillLevel);
            target.currentHP -= procDamage;
            if (target.currentHP <= 0) {
                target.currentHP = 0;
                target.defeated = true;
                //console.log(`[DEBUG] ${target.name} defeated by status proc! (HP: 0)`);
            }
            //console.log(`[STATUS PROC] ${procSkill.name} dealt ${procDamage} damage to ${target.name}`);
        }
    });
  }

  /**
   * Dual-wield echo: on a DAMAGE_SINGLE hit, 40% chance to fire the skill again
   * at 0.3 power using the offhand weapon for damage and procs.
   * Character stats are unchanged — only weapon damage and procs swap to offhand.
   */
  _triggerDualWieldEcho(actor, skill, target, skillLevel) {
    if (!actor.equipment?.offHand) return 0;
    const offhandItem = this.gear?.find(g => g.id === this._eqId(actor.equipment.offHand));
    if (!offhandItem || !offhandItem.dmg1) return 0; // offhand must be a weapon

    if (Math.random() > 0.40) return 0;

    // Build a temporary actor proxy with offHand swapped into mainHand position
    // so calculateDamage picks up offhand weapon stats without engine surgery.
    const echoActor = Object.assign({}, actor, {
        equipment: Object.assign({}, actor.equipment, { mainHand: actor.equipment.offHand })
    });

    // Full calculation, then modulate output to 30%
    const echoDamage = Math.max(1, Math.floor(this.calculateDamage(echoActor, skill, target, false, skillLevel) * 0.3));

    target.currentHP -= echoDamage;
    if (target.currentHP <= 0) { target.currentHP = 0; target.defeated = true; }

    // Fire offhand weapon procs
    this.triggerWeaponProcs(echoActor, target, skillLevel);

    //console.log(`[DUAL WIELD] Echo: ${actor.name} ${skill.name} offhand hit ${target.name} for ${echoDamage}`);
    return echoDamage;
  }

  resolveAction(action, actor, players, enemies) {
    if (action.type === 'retreat') {
        return this.resolveRetreat(actor, players);
    }

    const skill = this.skills.find(s => s.id === action.skillID);
    if (!skill) {
        console.warn(`[SKILL NOT FOUND] actor=${actor?.name} skillID=${action.skillID}`);
        return {
            roll: null,
            result: { message: 'Skill not found', success: false, delay: 1000 }
        };
    }

    // Non-offensive categories skip damage calculation, variance, and weapon procs entirely.
    // They only apply skill effects (heals, buffs, resource restoration).
    const NON_OFFENSIVE = new Set([
        'HEALING','HEALING_AOE','BUFF','DEFENSE','UTILITY','RESTORATION',
        'CONSUMABLE_HEALING','CONSUMABLE_RESTORATION','CONSUMABLE_BUFF',
        'CONSUMABLE_CONTROL','CONSUMABLE_ESCAPE'
    ]);
    const isOffensive = !NON_OFFENSIVE.has(skill.category);

    // Weapon Delay Modification
    const weapon = actor.equipment?.mainHand ? this.gear.find(g => g.id === this._eqId(actor.equipment.mainHand)) : null;
    const delayMultiplier = weapon?.delay ? (weapon.delay === 1 ? 0.8 : weapon.delay === 3 ? 1.2 : 1.0) : 1.0;

    // Status delay multiplier (slow, haste, freeze, knockback, evasion_boost, speed_boost etc.)
    let statusDelayMult = 1.0;
    if (actor.statusEffects && actor.statusEffects.length > 0) {
        const statusResult = this.statusEngine.processStatusEffects(actor);
        statusDelayMult = statusResult.skillDelayMultiplier || 1.0;
    }

    const finalDelay = Math.round(skill.delay * delayMultiplier * statusDelayMult);
    const statusDelayNote = statusDelayMult !== 1.0 ? `, status=${statusDelayMult.toFixed(2)}x` : '';
    //console.log(`[DELAY] ${actor.name} ${skill.name}: base=${skill.delay}ms, weapon=${weapon?.delay || 'none'}${statusDelayNote}, final=${finalDelay}ms`);

    // Consume resources
    if (skill.costType === 'stamina') {
        const cost = skill.costPercent
            ? Math.floor(actor.maxStamina * skill.costPercent)
            : skill.costAmount;
        actor.currentStamina = Math.max(0, actor.currentStamina - cost);
    } else if (skill.costType === 'mana') {
        actor.currentMana = Math.max(0, actor.currentMana - skill.costAmount);
    }

    // Decrement consumable belt quantity if this skill came from a belt item
    if (actor.type === 'player' && actor.consumables && typeof actor.consumables === 'object') {
        const consumables = actor.consumables;
        for (const [consumableId, qty] of Object.entries(consumables)) {
            if (qty <= 0) continue;
            const itemDef = this.gear.find(g => g.id === consumableId);
            if (!itemDef) continue;
            const itemSkillId = itemDef.skillID || itemDef.effect_skillid;
            if (itemSkillId === skill.id) {
                consumables[consumableId]--;
                //console.log(`[CONSUMABLE] ${actor.name} used ${itemDef.name} (${consumables[consumableId]} remaining)`);
                break;
            }
        }
    }

    // Get skill level
    let skillLevel = 1;
    if (actor.type === 'player' && actor.skills) {
        const skillData = actor.skills.find(s => s.skillID === action.skillID);
        if (skillData) skillLevel = skillData.skillLevel || 1;
    } else if (actor.type === 'enemy') {
        // Enemies have no skill progression — derive effective skill level from spawn level.
        // Mirrors roughly the pace a player develops skills: ~level/4, minimum 1.
        skillLevel = Math.max(1, Math.floor((actor.level || 1) / CONSTANTS.ENEMY_SKILL_LEVEL_DIVISOR));
    }

    // Multi-Hit Support
    const hitCount = skill.hitCount?.fixed ||
        Math.floor(Math.random() * (skill.hitCount?.max - skill.hitCount?.min + 1)) + (skill.hitCount?.min || 1);
    //console.log(`[HITCOUNT] ${actor.name} ${skill.name}: rolling ${hitCount} hit(s)`);

    // ── Determine target list from effect definitions ──
    // AOE is driven by effect targets, not category name.
    // all_enemies → all alive enemies; all_allies → all alive players
    const hasAOEEffect = skill.effects?.some(e =>
        e.targets === 'all_enemies' || e.targets === 'all_allies' || e.targets === 'all_entities'
    );
    const isAllyAOE = skill.effects?.some(e => e.targets === 'all_allies');

    let targetList;
    if (hasAOEEffect) {
        const isEnemyActor = actor.type === 'enemy';
        targetList = isAllyAOE
            ? (isEnemyActor ? enemies.filter(e => !e.defeated) : players.filter(p => !p.defeated))
            : (isEnemyActor ? players.filter(p => !p.defeated) : enemies.filter(e => !e.defeated));
        if (targetList.length === 0) {
            return { roll: null, result: { message: 'No targets found', success: false, delay: finalDelay } };
        }
    } else {
        const singleTarget = players.concat(enemies).find(t => t.id === action.target);
        if (!singleTarget) {
            return { roll: null, result: { message: 'Target not found', success: false, delay: finalDelay } };
        }
        if (singleTarget.defeated) {
            const aliveEnemies = enemies.filter(e => !e.defeated);
            const alivePlayers = players.filter(p => !p.defeated);
            const redirectPool = actor.type === 'player' ? aliveEnemies : alivePlayers;
            if (redirectPool.length === 0) {
                return { roll: null, result: { message: 'No valid targets remaining.', success: false, delay: finalDelay } };
            }
            action.target = redirectPool.reduce((min, t) => t.currentHP < min.currentHP ? t : min).id;
            return this.resolveAction(action, actor, players, enemies);
        }
        targetList = [singleTarget];
    }

    // ── Non-offensive skills: apply effects only, no hit roll, no damage, no procs ──
    if (!isOffensive) {
        targetList.forEach(t => this.applySkillEffects(skill, actor, t, null, players.concat(enemies)));
        const _snap = (c) => (c.statusEffects || []).filter(e => e.duration > 0).map(e => ({ id: e.id, duration: e.duration }));
        return {
            roll: { hit: true, crit: false, hitCount: 1 },
            result: {
                message: `${actor.name} uses ${skill.name}.`,
                damageDealt: 0,
                targets: targetList.map(t => ({ targetId: t.id, hpAfter: t.currentHP, targetStatuses: _snap(t) })),
                success: true, delay: finalDelay,
                actorId: actor.id, actorStatuses: _snap(actor)
            }
        };
    }

    // ── Offensive skills: hit roll → damage loop → procs ──
    const hitChance = this.calculateHitChance(actor, skill, targetList[0], skillLevel);
    const rolled = Math.random();
    const hit = rolled <= hitChance;

    if (!hit) {
        const missMsg = targetList.length > 1
            ? `${actor.name}'s ${skill.name} misses all targets!`
            : `${actor.name}'s ${skill.name} misses ${targetList[0].name}!`;
        return {
            roll: { hitChance, rolled, hit: false, crit: false },
            result: { message: missMsg, damageDealt: 0, targets: [], success: false, delay: finalDelay }
        };
    }

    const isCrit = Math.random() <= this.calculateCritChance(actor, skill);
    let totalDamage = 0;
    const resolvedTargets = [];

    targetList.forEach(target => {
        let hitDamage = 0;
        for (let i = 0; i < hitCount; i++) {
            hitDamage += this.calculateDamage(actor, skill, target, isCrit, skillLevel);
        }
        totalDamage += hitDamage;

        target.currentHP -= hitDamage;
        // Track largest single hit for consumable trigger logic
        if (hitDamage > 0) {
            target.lastHitDamage = hitDamage;
            target.lastHitDamagePct = target.maxHP > 0 ? hitDamage / target.maxHP : 0;
        }
        if (target.currentHP <= 0) {
            target.currentHP = 0;
            target.defeated = true;
            //console.log(`[DEBUG] ${target.name} defeated! (HP: 0)`);
        }

        if (hitDamage > 0 && target.statusEffects?.some(e => e.id === 'sleep' && e.duration > 0)) {
            this.statusEngine.removeStatus(target, 'sleep');
            //console.log(`[STATUS] ${target.name} woke up from damage!`);
        }

        // Counter-ready (single-target hits only)
        if (hitDamage > 0 && !hasAOEEffect) {
            const counterStatus = target.statusEffects?.find(e => e.id === 'counter_ready' && e.duration > 0);
            if (counterStatus) {
                const statusDef = this.statusEngine.statusMap['counter_ready'];
                if (statusDef?.counterProc) {
                    const { skillId, chance } = statusDef.counterProc;
                    if (Math.random() * 100 <= chance) {
                        const counterSkill = this.skills.find(s => s.id === skillId);
                        if (counterSkill) {
                            //console.log(`[COUNTER] ${target.name} counters ${actor.name} with ${counterSkill.name}!`);
                            this.applySkillEffects(counterSkill, target, actor);
                            if (counterSkill.effects?.some(e => e.type === 'damage')) {
                                const counterDamage = this.calculateDamage(target, counterSkill, actor, false, 1);
                                actor.currentHP -= counterDamage;
                                if (actor.currentHP <= 0) { actor.currentHP = 0; actor.defeated = true; }
                                //console.log(`[COUNTER] ${counterSkill.name} dealt ${counterDamage} to ${actor.name}`);
                            }
                            this.statusEngine.removeStatus(target, 'counter_ready');
                        }
                    }
                }
            }
        }

        this.applySkillEffects(skill, actor, target, null, players.concat(enemies));
        this.triggerWeaponProcs(actor, target, skillLevel);
        this.triggerStatusProcs(actor, target, skillLevel);
        if (skill.category === 'DAMAGE_SINGLE') {
            const echoDamage = this._triggerDualWieldEcho(actor, skill, target, skillLevel);
            if (echoDamage > 0) {
                hitDamage += echoDamage;
                totalDamage += echoDamage;
            }
        }

        // ── Reverse damage shield: healAttackerOnHit ──
        // If the target has a siphon_ward-type debuff, the attacker (actor) is healed.
        // Heal amount = hitDamage * fraction, scaled by actor's harmony.
        if (hitDamage > 0) {
            target.statusEffects?.forEach(activeStatus => {
                const statusDef = this.statusEngine.statusMap[activeStatus.id];
                if (!statusDef?.effects?.healAttackerOnHit) return;
                const fraction = statusDef.effects.healAttackerOnHit;
                const harmonyScale = 1 + ((actor.stats?.harmony || 0) / 300);
                const healAmount = Math.max(1, Math.floor(hitDamage * fraction * harmonyScale));
                actor.currentHP = Math.min(actor.maxHP, actor.currentHP + healAmount);
                //console.log(`[LIFEDRAIN] ${actor.name} healed ${healAmount} via ${statusDef.name} on ${target.name}`);
            });
        }

        // ── Cursed blood: onHitProcLifetap ──
        // When the target is hit, there's a chance it fires a lifetap back — dealing
        // damage to the attacker and healing the target for the same amount.
        if (hitDamage > 0 && !hasAOEEffect) {
            target.statusEffects?.forEach(activeStatus => {
                const statusDef = this.statusEngine.statusMap[activeStatus.id];
                if (!statusDef?.onHitProcLifetap) return;
                const { chance, fraction } = statusDef.onHitProcLifetap;
                if (Math.random() * 100 > chance) return;
                const tapAmount = Math.max(1, Math.floor(hitDamage * fraction));
                actor.currentHP -= tapAmount;
                if (actor.currentHP <= 0) { actor.currentHP = 0; actor.defeated = true; }
                target.currentHP = Math.min(target.maxHP, target.currentHP + tapAmount);
                //console.log(`[LIFEDRAIN] Cursed Blood: ${target.name} leeches ${tapAmount} from ${actor.name}`);
            });
        }

        resolvedTargets.push({
            targetId: target.id,
            targetName: target.name,
            damage: hitDamage,
            hpAfter: Math.max(0, target.currentHP),
            targetStatuses: (target.statusEffects || []).filter(e => e.duration > 0).map(e => ({ id: e.id, duration: e.duration }))
        });
    });

    const _statusSnapshot = (combatant) =>
        (combatant.statusEffects || []).filter(e => e.duration > 0).map(e => ({ id: e.id, duration: e.duration }));

    const hitMsg = targetList.length > 1
        ? (isCrit
            ? `${actor.name} critically strikes all targets with ${skill.name} for ${totalDamage} total damage!`
            : `${actor.name} hits ${targetList.length} targets with ${skill.name} for ${totalDamage} total damage.`)
        : (isCrit
            ? `${actor.name} critically hits ${targetList[0].name} with ${skill.name} for ${totalDamage} damage!`
            : `${actor.name} hits ${targetList[0].name} with ${skill.name} for ${totalDamage} damage.`);

    return {
        roll: { hitChance, rolled, hit: true, crit: isCrit, hitCount },
        result: {
            message: hitMsg,
            damageDealt: totalDamage,
            targets: resolvedTargets,
            success: true, delay: finalDelay,
            actorId: actor.id, actorStatuses: _statusSnapshot(actor)
        }
    };
  }


  /**
   * Calculate damage with full stat scaling, weapon integration, and dynamic variance.
   * Implements proportional damage type splitting per SKILL_SYSTEM_GUIDE.md.
   * Adds dynamic weapon variance based on item.type (no JSON edits required).
   */
  calculateDamage(actor, skill, target, isCrit, skillLevel) {
    // ===== PRE-STEP: Fetch Weapon Early for Scope Access =====
    // We fetch this now so it's available for the Variance Debug Log later
    let weapon = null;
    if (actor.equipment?._generatedWeapon) {
      // Procedurally generated weapon — use directly, skip gear lookup
      weapon = actor.equipment._generatedWeapon;
    } else if (actor.equipment?.mainHand && this.gear) {
      weapon = this.gear.find(g => g.id === this._eqId(actor.equipment.mainHand));
    }

    // ===== STEP 1: Calculate Base Skill Damage (NO stat scaling yet) =====
    // Stat multiplier is computed here but applied AFTER weapon damage is added,
    // so stats amplify the entire attack rather than just the tiny skill base.
    const baseDamage = (skill.basePower ?? 1) * (1 + (skillLevel - 1) * 0.1);

    const scaling = skill.scalingFactors || {};
    let statMultiplier = 0;
    if (scaling.conviction) statMultiplier += ((actor.stats?.conviction) || 0) * scaling.conviction / CONSTANTS.STAT_SCALE;
    if (scaling.endurance)  statMultiplier += ((actor.stats?.endurance)  || 0) * scaling.endurance  / CONSTANTS.STAT_SCALE;
    if (scaling.ambition)   statMultiplier += ((actor.stats?.ambition)   || 0) * scaling.ambition   / CONSTANTS.STAT_SCALE;
    if (scaling.harmony)    statMultiplier += ((actor.stats?.harmony)    || 0) * scaling.harmony    / CONSTANTS.STAT_SCALE;

    // skillDamage is raw base — stat multiplier applied later to the whole pool
    const skillDamage = baseDamage;

    // ===== CHECK: Skip weapon damage for healing skills =====
    const isHealingSkill = skill.category === 'HEALING' || skill.effects?.some(e => e.type === 'heal');

    // ===== CLASSIFY SKILL: physical, magic, or hybrid =====
    const MAGIC_DAMAGE_TYPES    = new Set(['fire','cold','lightning','electric','arcane','holy','shadow','nature','poison']);
    const PHYSICAL_DAMAGE_TYPES = new Set(['physical','slashing','piercing','bludgeoning']);

    const skillDamageTypes  = (skill.effects || [])
      .filter(e => e.type === 'damage' && e.damageType)
      .map(e => e.damageType.toLowerCase());

    const skillHasMagicType    = skillDamageTypes.some(t => MAGIC_DAMAGE_TYPES.has(t));
    const skillHasPhysicalType = skillDamageTypes.some(t => PHYSICAL_DAMAGE_TYPES.has(t));

    const isMagicSkill  = skill.category === 'DAMAGE_MAGIC' || (skillHasMagicType && !skillHasPhysicalType);
    const isHybridSkill = skillHasMagicType && skillHasPhysicalType;

    // ===== STEP 2: Collect Weapon Damage & Type =====
    let weaponTotalDamage = 0;
    const weaponDamageBreakdown = {};
    let weaponType = null;

    if (!isHealingSkill && weapon) {
      weaponType = weapon.type ? weapon.type.toLowerCase() : null;
      for (const [dmg, type] of [
        [weapon.dmg1, weapon.dmg_type_1],
        [weapon.dmg2, weapon.dmg_type_2],
        [weapon.dmg3, weapon.dmg_type_3],
        [weapon.dmg4, weapon.dmg_type_4],
      ]) {
        if (dmg && type) {
          weaponTotalDamage += dmg;
          weaponDamageBreakdown[type] = (weaponDamageBreakdown[type] || 0) + dmg;
        }
      }
    }

    // ===== STEP 3: Build damage pool by skill type =====
    let totalDamage = 0;
    let finalDamageBreakdown = {}; // type → raw damage before armor/resistance

    const ARMOR_K    = 16;
    const armorValue = target ? (target.armorValue || 0) : 0;
    const armorReduction = armorValue / (armorValue + ARMOR_K);

    if (isHealingSkill) {
      totalDamage = skillDamage;

    } else if (isMagicSkill) {
      // ── MAGIC PATH ────────────────────────────────────────────────────────
      // Full weapon damage adds to the pool. Type distribution comes from the
      // skill's declared types. Matching weapon types earn a +20% bonus on the
      // matched portion — rewarding synergy without penalising broad weapons.

      const magicTypes = skillDamageTypes.filter(t => MAGIC_DAMAGE_TYPES.has(t));
      const fallbackTypes = magicTypes.length ? magicTypes : ['arcane'];
      const typeCount = fallbackTypes.length;

      // Skill base distributed evenly across its declared types
      for (const t of fallbackTypes) {
        finalDamageBreakdown[t] = (finalDamageBreakdown[t] || 0) + (skillDamage / typeCount);
      }

      // Full weapon damage added — type distribution mirrors skill's declared types
      if (weaponTotalDamage > 0) {
        for (const t of fallbackTypes) {
          finalDamageBreakdown[t] = (finalDamageBreakdown[t] || 0) + (weaponTotalDamage / typeCount);
        }
      }

      // Match bonus: +20% of each weapon damage component whose type matches a skill type
      for (const [wpnType, wpnDmg] of Object.entries(weaponDamageBreakdown)) {
        const wt = wpnType.toLowerCase();
        if (fallbackTypes.includes(wt)) {
          finalDamageBreakdown[wt] = (finalDamageBreakdown[wt] || 0) + (wpnDmg * 0.2);
        }
      }

      totalDamage = Object.values(finalDamageBreakdown).reduce((a, b) => a + b, 0);

    } else if (isHybridSkill) {
      // ── HYBRID PATH ───────────────────────────────────────────────────────
      // Physical weapon damage splits by weapon proportions (standard physical path).
      // Magic weapon component: full weapon adds to magic type(s), match bonus applies.
      // Skill base split evenly across all declared types.

      const physTypes  = skillDamageTypes.filter(t => PHYSICAL_DAMAGE_TYPES.has(t));
      const magicTypes = skillDamageTypes.filter(t => MAGIC_DAMAGE_TYPES.has(t));
      const totalTypes = skillDamageTypes.length || 1;

      // Skill base split across all types
      for (const t of physTypes)  finalDamageBreakdown[t] = (finalDamageBreakdown[t] || 0) + (skillDamage / totalTypes);
      for (const t of magicTypes) finalDamageBreakdown[t] = (finalDamageBreakdown[t] || 0) + (skillDamage / totalTypes);

      // Physical weapon damage — split proportionally across physical weapon types
      for (const [wpnType, wpnDmg] of Object.entries(weaponDamageBreakdown)) {
        if (PHYSICAL_DAMAGE_TYPES.has(wpnType.toLowerCase())) {
          finalDamageBreakdown[wpnType] = (finalDamageBreakdown[wpnType] || 0) + wpnDmg;
        }
      }

      // Magic weapon component — adds to skill's magic type(s) evenly + match bonus
      const wpnMagTotal = Object.entries(weaponDamageBreakdown)
        .filter(([t]) => MAGIC_DAMAGE_TYPES.has(t.toLowerCase()))
        .reduce((s, [, v]) => s + v, 0);
      if (wpnMagTotal > 0 && magicTypes.length > 0) {
        for (const t of magicTypes) {
          finalDamageBreakdown[t] = (finalDamageBreakdown[t] || 0) + (wpnMagTotal / magicTypes.length);
        }
        // Match bonus on magic weapon portion
        for (const [wpnType, wpnDmg] of Object.entries(weaponDamageBreakdown)) {
          if (magicTypes.includes(wpnType.toLowerCase())) {
            finalDamageBreakdown[wpnType.toLowerCase()] = (finalDamageBreakdown[wpnType.toLowerCase()] || 0) + (wpnDmg * 0.2);
          }
        }
      }

      totalDamage = Object.values(finalDamageBreakdown).reduce((a, b) => a + b, 0);

    } else {
      // ── PHYSICAL PATH ─────────────────────────────────────────────────────
      // Skill base + full weapon, split by weapon type proportions. Unchanged.
      totalDamage = skillDamage + weaponTotalDamage;

      if (weaponTotalDamage > 0) {
        for (const [type, dmg] of Object.entries(weaponDamageBreakdown)) {
          finalDamageBreakdown[type] = totalDamage * (dmg / weaponTotalDamage);
        }
      } else {
        const fallbackType = skillDamageTypes[0] || 'physical';
        finalDamageBreakdown[fallbackType] = skillDamage;
      }
    }

    // ===== STEP 3b: Apply stat multiplier to the ENTIRE pool =====
    // Stats now amplify the full attack (skill base + weapon + match bonus),
    // making stat investment meaningful across the whole damage range.
    if (statMultiplier > 0 && !isHealingSkill) {
      for (const t of Object.keys(finalDamageBreakdown)) {
        finalDamageBreakdown[t] *= (1 + statMultiplier);
      }
      totalDamage *= (1 + statMultiplier);
    }

    // ===== STEP 4: Apply Weapon Variance (physical skills only) =====
    if (!isHealingSkill && !isMagicSkill && weaponTotalDamage > 0 && weaponType) {
      const profile = this.weaponVarianceProfiles[weaponType] || this.weaponVarianceProfiles['default'];
      if (profile) {
        const [minVar, maxVar] = profile;
        const varianceMultiplier = minVar + (Math.random() * (maxVar - minVar));
        totalDamage *= varianceMultiplier;
        for (const t of Object.keys(finalDamageBreakdown)) {
          finalDamageBreakdown[t] *= varianceMultiplier;
        }
      }
    }

    // ===== STEP 5: Apply Armor Reduction + Per-type Resistances =====
    let finalDamage = 0;
    const damageBreakdown = [];

    for (const [damageType, rawDmg] of Object.entries(finalDamageBreakdown)) {
      let portion = rawDmg * (1 - armorReduction);
      if (target?.resistances?.[damageType]) {
        portion *= (1 - (target.resistances[damageType] || 0));
      }
      damageBreakdown.push(`${damageType}:${portion.toFixed(2)}`);
      finalDamage += portion;
    }

    if (finalDamage === 0 && !isHealingSkill) {
      finalDamage = skillDamage * (1 - armorReduction);
    }

    // ===== STEP 6: Apply Critical Multiplier =====
    if (isCrit) {
      finalDamage *= skill.critMultiplier || 1.5;
    }

    // ===== STEP 7: Apply Status Effect Multipliers =====
    // Check if target has status effects that modify incoming damage
    if (target.statusEffects && target.statusEffects.length > 0) {
      const statusResults = this.statusEngine.processStatusEffects(target);
      if (statusResults.incomingDamageMultiplier !== 1.0) {
        finalDamage *= statusResults.incomingDamageMultiplier;
      }
    }

    // ===== STEP 8: Minimum Damage Floor & Floor to Integer =====
    const flooredDamage = Math.max(1, Math.floor(finalDamage));
    
    // ===== STEP 9: Log AFTER flooring =====
    //console.log(`[DAMAGE] ${actor.name} → ${target.name}: ${totalDamage.toFixed(2)} total (after variance) = ${flooredDamage} after resistances/defense [${damageBreakdown.join(', ')}]`);
    
    return flooredDamage;
  }

  applySkillEffects(skill, actor, target, healTarget = null, allPlayers = null) {
    if (!skill.effects || skill.effects.length === 0) return;
    skill.effects.forEach(effect => {
        const applyChance = effect.chance !== undefined ? effect.chance : 1.0;
        const rolled = Math.random();
        const success = rolled <= applyChance;
        if (!success) {
            //console.log(`[EFFECT] ${skill.name}: ${effect.type} FAILED to apply (chance=${applyChance}, rolled=${rolled.toFixed(3)})`);
            return; 
        }

        const isHeal = (effect.type === 'heal');
        const isLifetap = (effect.type === 'lifetap');
        const isRestoreResource = (effect.type === 'restore_resource');
        const isRestorePool = (effect.type === 'restore_pool');

        if (isHeal || isLifetap || isRestoreResource || isRestorePool) {
            let poolType = '';
            let recipient = actor;

            if (isLifetap) {
                // Heal the actor (caster) for a harmony-scaled fraction of the target's current damage taken.
                // magnitude = fraction of target's maxHP to heal actor for.
                poolType = 'hp';
                recipient = actor;
                const harmonyScale = 1 + ((actor.stats?.harmony || 0) / 300);
                let healAmount = Math.max(1, Math.floor((target?.maxHP || 1) * effect.magnitude * harmonyScale));
                if (actor.suddenDeathActive) {
                    const sdOvertime = actor.suddenDeathTurn || 0;
                    healAmount = Math.floor(healAmount * Math.max(0.0, 0.20 - Math.floor(sdOvertime / 10) * 0.08));
                }
                recipient.currentHP = Math.min(recipient.maxHP, recipient.currentHP + healAmount);
                //console.log(`[LIFETAP] ${skill.name}: ${actor.name} leeches ${healAmount} HP (harmony scale ${harmonyScale.toFixed(2)})`);
                return;
            }

            if (isHeal) {
                poolType = 'hp';
                if (healTarget) recipient = healTarget;
                else if (target && target.type === 'player') recipient = target;
                else recipient = actor;
            } else if (isRestoreResource) {
                poolType = effect.resource;
                recipient = actor;
            } else if (isRestorePool) {
                poolType = effect.pool;
                if (effect.targets === 'single_ally' && healTarget) recipient = healTarget;
                else recipient = actor;
            }

            if (!poolType) {
                console.warn(`[EFFECT] ${skill.name}: Restoration effect missing pool type.`);
                return;
            }

            let statValue = 0;
            const scaleStat = effect.scalesBy || 'basePower';
            if (scaleStat === 'basePower') statValue = skill.basePower || 1;
            else if (scaleStat !== 'flat' && actor.stats) statValue = actor.stats[scaleStat] || 0;

            let maxPoolValue = 0;
            let currentPoolValue = 0;

            if (poolType === 'hp') { maxPoolValue = recipient.maxHP; currentPoolValue = recipient.currentHP; }
            else if (poolType === 'stamina') { maxPoolValue = recipient.maxStamina; currentPoolValue = recipient.currentStamina; }
            else if (poolType === 'mana') { maxPoolValue = recipient.maxMana; currentPoolValue = recipient.currentMana; }
            else {
                console.warn(`[EFFECT] ${skill.name}: Unknown pool type '${poolType}'`);
                return;
            }

            let restoreAmount;
            if (scaleStat === 'flat') {
                restoreAmount = effect.flatAmount || 0;
            } else {
                const scaleMultiplier = 1 + (statValue / CONSTANTS.STAT_SCALE);
                restoreAmount = Math.floor(maxPoolValue * effect.magnitude * scaleMultiplier);
            }

            // Sudden death — healing drops sharply to ensure stalled fights end.
            // Starts at 20%, drops 8% per 10 turns. Floor: 0% (no healing at all eventually).
            if (poolType === 'hp' && actor.suddenDeathActive) {
                const sdOvertime = (actor.suddenDeathTurn || 0);
                const healEffectiveness = Math.max(0.0, 0.20 - Math.floor(sdOvertime / 10) * 0.08);
                restoreAmount = Math.floor(restoreAmount * healEffectiveness);
            }

            const oldValue = currentPoolValue;
            const newValue = Math.min(maxPoolValue, currentPoolValue + restoreAmount);
            const actualRestored = newValue - oldValue;

            if (poolType === 'hp') recipient.currentHP = newValue;
            else if (poolType === 'stamina') recipient.currentStamina = newValue;
            else if (poolType === 'mana') recipient.currentMana = newValue;

            //console.log(`[EFFECT] ${skill.name}: Restored ${actualRestored} ${poolType.toUpperCase()} to ${recipient.name} (Scaled by ${scaleStat}:${statValue})`);
            return;
        }

        if (effect.type === 'apply_debuff' && effect.debuff) {
            let debuffTarget = target;
            if (effect.targets === 'self') debuffTarget = actor;
            if (debuffTarget) {
                this.statusEngine.applyStatus(debuffTarget, effect.debuff, effect.duration, effect.magnitude || 1);
                // Stamp sourceId so leech DoTs know who to credit heals to
                const applied = debuffTarget.statusEffects?.find(s => s.id === effect.debuff);
                if (applied) applied.sourceId = actor.id;
                //console.log(`[EFFECT] ${skill.name}: ${effect.debuff} applied to ${debuffTarget.name}`);
            }
        } else if (effect.type === 'apply_buff' && effect.buff) {
            let buffTarget = actor;
            if (effect.targets === 'single_ally' && target && target.type === 'player') buffTarget = target;
            if (effect.targets === 'all_allies' && allPlayers) {
                // Allies are combatants on the same side as the actor, not always the player party.
                // enemies have type 'enemy'; players have type 'player'.
                const allies = allPlayers.filter(p => !p.defeated && p.type === actor.type);
                allies.forEach(ally => {
                    this.statusEngine.applyStatus(ally, effect.buff, effect.duration, effect.magnitude || 1);
                });
                //console.log(`[EFFECT] ${skill.name}: ${effect.buff} applied by ${actor.name} to all allies (${allies.map(a => a.name).join(', ')})`);
                return;
            } else if (effect.targets === 'all_allies') {
                //console.log(`[EFFECT] ${skill.name}: AOE buff ${effect.buff} (no allPlayers context — self only)`);
            }
            this.statusEngine.applyStatus(buffTarget, effect.buff, effect.duration, effect.magnitude || 1);
            //console.log(`[EFFECT] ${skill.name}: ${effect.buff} applied to ${buffTarget.name}`);
        } else if (effect.type === 'damage' && effect.damageType) {
            //console.log(`[EFFECT] ${skill.name}: Damage effect (${effect.damageType}) processed in calculateDamage()`);

        } else if (effect.type === 'cleanse') {
            // Remove debuffs from an ally (or self)
            // effect.statusIds: specific IDs to remove, or omit to remove all debuffs
            // effect.targets: 'self' | 'single_ally'
            let cleanseTarget = actor;
            if (effect.targets === 'single_ally' && target && target.type === 'player') cleanseTarget = target;
            if (!cleanseTarget.statusEffects) return;

            const toRemove = effect.statusIds
                ? cleanseTarget.statusEffects.filter(s => effect.statusIds.includes(s.id) && s.type === 'debuff')
                : cleanseTarget.statusEffects.filter(s => s.type === 'debuff');

            const maxRemove = effect.maxRemove || toRemove.length;
            const removed = toRemove.slice(0, maxRemove);
            removed.forEach(s => {
                this.statusEngine.removeStatus(cleanseTarget, s.id);
                //console.log(`[EFFECT] ${skill.name}: Cleansed ${s.name} from ${cleanseTarget.name}`);
            });
            if (removed.length === 0) {
                //console.log(`[EFFECT] ${skill.name}: Nothing to cleanse on ${cleanseTarget.name}`);
            }

        } else if (effect.type === 'dispel') {
            // Remove buffs from an enemy (or specific status IDs)
            // effect.statusIds: specific IDs to remove, or omit to remove all buffs
            // effect.targets: defaults to enemy target
            let dispelTarget = target;
            if (effect.targets === 'self') dispelTarget = actor;

            if (!dispelTarget || !dispelTarget.statusEffects) return;

            const toRemove = effect.statusIds
                ? dispelTarget.statusEffects.filter(s => effect.statusIds.includes(s.id))
                : dispelTarget.statusEffects.filter(s => s.type === 'buff');

            const maxRemove = effect.maxRemove || toRemove.length;
            const removed = toRemove.slice(0, maxRemove);
            removed.forEach(s => {
                this.statusEngine.removeStatus(dispelTarget, s.id);
                //console.log(`[EFFECT] ${skill.name}: Dispelled ${s.name} from ${dispelTarget.name}`);
            });
            if (removed.length === 0) {
                //console.log(`[EFFECT] ${skill.name}: Nothing to dispel on ${dispelTarget.name}`);
            }
        }
    });
  }

  calculateHitChance(actor, skill, target, skillLevel) {
    let hitChance = skill.baseHitChance || CONSTANTS.BASE_HIT_CHANCE;
    hitChance += (actor.stats.conviction || 0) * 0.1;
    hitChance += skillLevel * 0.02;
    // Physical evasion reduces hit chance for physical skills; magical evasion for magical.
    // Each point of evasion = 0.5% reduction in attacker hit chance.
    // target may be null for AOE skills — guard against it.
    if (target) {
        const damageType = skill.effects?.[0]?.damageType || 'physical';
        const isMagical = ['fire','ice','lightning','arcane','holy','shadow'].includes(damageType);
        const evasion = isMagical
            ? (target.magEvasion  || 0)
            : (target.physEvasion || 0);
        hitChance -= evasion * 0.5;
    }
    return Math.max(CONSTANTS.STAT_CAP_MIN, Math.min(CONSTANTS.STAT_CAP_MAX, hitChance));
  }

  calculateCritChance(actor, skill) {
    let critChance = skill.critChance || CONSTANTS.BASE_CRIT_CHANCE;
    if (actor.stats?.ambition) {
        critChance += (actor.stats.ambition / CONSTANTS.STAT_SCALE) * 0.28;
    }
    if (actor.stats?.conviction) {
        critChance += (actor.stats.conviction / CONSTANTS.STAT_SCALE) * 0.07;
    }
    return Math.max(0, Math.min(CONSTANTS.MAX_CRIT_CHANCE, critChance));
  }

  hasResources(actor, skill) {
    // Check status blocks first (e.g. silence blocks mana skills)
    if (this.statusEngine.isSkillBlocked(actor, skill)) return false;
    // costPercent: skill costs a percentage of the actor's max stamina
    if (skill.costPercent && skill.costType === 'stamina') {
      const cost = Math.floor(actor.maxStamina * skill.costPercent);
      return actor.currentStamina >= cost;
    }
    if (skill.costType === 'stamina') return actor.currentStamina >= skill.costAmount;
    if (skill.costType === 'mana') return actor.currentMana >= skill.costAmount;
    return true;
  }

  regenerateResources(combatant) {
    let staminaMultiplier = 1.0;
    let manaMultiplier = 1.0;
    if (combatant.statusEffects && combatant.statusEffects.length > 0) {
        const statusResult = this.statusEngine.processStatusEffects(combatant);
        staminaMultiplier = statusResult.staminaRegenMultiplier || 1.0;
        manaMultiplier   = statusResult.manaRegenMultiplier    || 1.0;
    }

    // Base regen: 3% of max pool per round, scaled by the governing stat.
    // Harmony drives mana regen — high harmony casters recover faster.
    // Endurance drives stamina regen — tough fighters sustain longer.
    const harmonyScale   = 1 + ((combatant.stats?.harmony   || 0) / 200);
    const enduranceScale = 1 + ((combatant.stats?.endurance || 0) / 200);

    const staminaRegen = Math.floor(combatant.maxStamina * 0.03 * enduranceScale * staminaMultiplier);
    const manaRegen    = Math.floor(combatant.maxMana    * 0.03 * harmonyScale   * manaMultiplier);

    combatant.currentStamina = Math.min(combatant.maxStamina, combatant.currentStamina + staminaRegen);
    combatant.currentMana    = Math.min(combatant.maxMana,    combatant.currentMana    + manaRegen);
  }

  calculateInitiative(players, enemies, partySnapshots) {
    const combatants = [];
    players.forEach(p => {
        const baseInitiative = (((p.stats?.ambition) || 0) * 0.5) + (((p.stats?.conviction) || 0) * 0.15);
        const randomComponent = Math.random() * 40;
        p.initiative = baseInitiative + randomComponent;
        //console.log(`[INITIATIVE] ${p.name}: Ambition=${p.stats?.ambition || 0}, Conviction=${p.stats?.conviction || 0}, Base=${baseInitiative.toFixed(1)}, Random=${randomComponent.toFixed(1)}, Total=${p.initiative.toFixed(1)}`);
        combatants.push(p); // push reference, not copy
    });
    enemies.forEach(e => {
        const baseInitiative = (((e.stats?.ambition) || 0) * 0.5) + (((e.stats?.conviction) || 0) * 0.15);
        const randomComponent = Math.random() * 40;
        e.initiative = baseInitiative + randomComponent;
        //console.log(`[INITIATIVE] ${e.name}: Ambition=${e.stats?.ambition || 0}, Conviction=${e.stats?.conviction || 0}, Base=${baseInitiative.toFixed(1)}, Random=${randomComponent.toFixed(1)}, Total=${e.initiative.toFixed(1)}`);
        combatants.push(e); // push reference, not copy
    });
    return combatants;
  }

  initializeEnemies(enemyDefinitions) {
    const enemies = [];
    let globalEnemyIndex = 0;
    enemyDefinitions.forEach(def => {
        const enemyType = this.enemyTypes.find(et => et.id.trim() === def.enemyTypeID.trim());
        if (!enemyType) {
            console.error(`❌ [SPAWN] Enemy type NOT FOUND: "${def.enemyTypeID}". Available: ${this.enemyTypes.map(e => e.id.trim()).join(', ')}`);
            return;
        }

        const enemyLevel = def.level || 1;

          // NEW LOGIC: Handle countRange
          let spawnCount = 1;
          if (def.countRange && Array.isArray(def.countRange) && def.countRange.length === 2) {
              spawnCount = Math.floor(Math.random() * (def.countRange[1] - def.countRange[0] + 1)) + def.countRange[0];
          } else if (def.count) {
              spawnCount = def.count;
          }
        //console.log(`✅ [SPAWN] Spawning ${spawnCount}x ${enemyType.name} (Lvl ${enemyLevel})...`);

        for (let i = 0; i < spawnCount; i++) {
            globalEnemyIndex++;
            const selectedSkills = this.selectRandomSkills(enemyType.availableSkills, enemyType.skillSelectionCount);
            let equipment = { mainHand: null, chest: null, offHand: null };
            
            if (enemyType.equipment && Array.isArray(enemyType.equipment)) {
                // Array format: ["fangs_tiny"] — find weapon and armor by item properties
                const weapon = enemyType.equipment.map(itemId => this.gear.find(g => g.id === itemId)).find(item => item && (item.slot_id1 === 'mainHand' || item.type.includes('weapon') || item.dmg1));
                if (weapon) {
                    equipment.mainHand = weapon.id;
                    //if (i === 0) console.log(`[EQUIP] ${enemyType.name} (Lvl ${enemyLevel}) equipped ${weapon.name}`);
                }
                const armor = enemyType.equipment.map(itemId => this.gear.find(g => g.id === itemId)).find(item => item && (item.slot_id1 === 'chest' || item.armor));
                if (armor) equipment.chest = armor.id;
            } else if (enemyType.equipment && typeof enemyType.equipment === 'object') {
                // Object format: { mainHand: "sword_bronze_tier1", offHand: null, ... }
                // Non-mainHand slots (offHand, chest, etc.) are always used as-is.
                equipment = { ...equipment, ...enemyType.equipment };
            }

            // Generate a procedural weapon from enemy tags and level.
            // Skipped if mainHand is a creatureOnly item (fangs, jaws, claws — fixed by design).
            // Falls back to hardcoded mainHand if present and no generation needed.
            const existingWeapon = equipment.mainHand
                ? this.gear.find(g => g.id === equipment.mainHand)
                : null;
            const isCreatureOnly = existingWeapon?.creatureOnly;

            if (!isCreatureOnly) {
                equipment._generatedWeapon = generateEnemyWeapon(enemyType.tags, enemyLevel);
            }

            // Scale enemy stats to level. Data stats define the distribution
            // (relative weights per stat); level determines the total budget.
            // Budget: 240 + 6*(level-1) — puts enemies just below bot parity at all levels.
            const rawStatTotal = Object.values(enemyType.stats || {}).reduce((a, b) => a + b, 0);
            const targetBudget = 240 + 6 * (enemyLevel - 1);
            const statScale = rawStatTotal > 0 ? targetBudget / rawStatTotal : 1;
            const scaledStats = {};
            for (const [k, v] of Object.entries(enemyType.stats || {})) {
                scaledStats[k] = Math.floor(v * statScale);
            }

            const maxHP = this.calculateMaxHP(scaledStats, enemyLevel, false);
            const maxMana = this.calculateMaxMana(scaledStats, enemyLevel, false);
            const maxStamina = this.calculateMaxStamina(scaledStats, enemyLevel, false);

            // Also sum armor from equipped chest piece if any
            let enemyArmor = enemyType.armorValue || 0;
            if (equipment.chest) {
                const chestItem = this.gear.find(g => g.id === equipment.chest);
                if (chestItem?.armor) enemyArmor += chestItem.armor;
            }

            enemies.push({
                id: `enemy_${enemyType.id.trim()}_${String(globalEnemyIndex).padStart(3, '0')}`,
                name: enemyType.name.trim(),
                type: 'enemy',
                level: enemyLevel,
                stats: { ...scaledStats },
                maxHP: maxHP, currentHP: maxHP,
                maxMana: maxMana, currentMana: maxMana,
                maxStamina: maxStamina, currentStamina: maxStamina,
                skills: selectedSkills,
                defeated: false,
                armorValue:  enemyArmor,
                physEvasion: enemyType.physEvasion || 0,
                magEvasion:  enemyType.magEvasion  || 0,
                resistances: {},
                statusEffects: [],
                equipment: equipment
            });
        }
    });
    //console.log(`[SPAWN] Total enemies spawned: ${enemies.length}`);
    return enemies;
  }

  selectRandomSkills(availableSkillIDs, count) {
    if (!availableSkillIDs || availableSkillIDs.length === 0) return [];

    // Separate damage skills from non-damage skills
    const damageCategories = ['DAMAGE_SINGLE', 'DAMAGE_AOE', 'DAMAGE_MAGIC', 'DAMAGE_AOE_MAGIC'];
    const damageSkills = availableSkillIDs.filter(id => {
        const s = this.skills.find(sk => sk.id === id);
        return s && damageCategories.some(cat => s.category?.includes(cat));
    });
    const otherSkills = availableSkillIDs.filter(id => !damageSkills.includes(id));

    const selected = [];
    const cap = Math.min(count, availableSkillIDs.length);

    // Always include at least one damage skill if any exist
    if (damageSkills.length > 0) {
        const shuffledDamage = [...damageSkills].sort(() => Math.random() - 0.5);
        selected.push(shuffledDamage[0]);
    }

    // Fill remaining slots from the rest of the pool (shuffled)
    const remaining = [...damageSkills.slice(1), ...otherSkills].sort(() => Math.random() - 0.5);
    for (const id of remaining) {
        if (selected.length >= cap) break;
        selected.push(id);
    }

    return selected;
  }

  isCombatFinished(players, enemies) {
    const playersAlive = players.some(p => !p.defeated);
    const enemiesAlive = enemies.some(e => !e.defeated);
    return !playersAlive || !enemiesAlive;
  }

  calculateMaxHP(stats, level, isPlayer = false) {
    const base   = isPlayer ? CONSTANTS.PLAYER_BASE_HP : CONSTANTS.ENEMY_BASE_HP;
    const scaled = base * Math.pow(CONSTANTS.HP_GROWTH, level - 1);
    return Math.floor(scaled * (1 + (stats?.endurance || 0) / CONSTANTS.HP_STAT_DIVISOR));
  }

  calculateMaxMana(stats, level, isPlayer = false) {
    const base      = isPlayer ? CONSTANTS.PLAYER_BASE_MANA : CONSTANTS.ENEMY_BASE_MANA;
    const scaled    = base * Math.pow(CONSTANTS.MANA_GROWTH, level - 1);
    const statBlend = ((stats?.harmony || 0) * 0.7 + (stats?.endurance || 0) * 0.3);
    return Math.floor(scaled * (1 + statBlend / CONSTANTS.MANA_STAT_DIVISOR));
  }

  calculateMaxStamina(stats, level, isPlayer = false) {
    const base      = isPlayer ? CONSTANTS.PLAYER_BASE_STAMINA : CONSTANTS.ENEMY_BASE_STAMINA;
    const scaled    = base * Math.pow(CONSTANTS.STAMINA_GROWTH, level - 1);
    const statBlend = ((stats?.endurance || 0) * 0.7 + (stats?.conviction || 0) * 0.3);
    return Math.floor(scaled * (1 + statBlend / CONSTANTS.STAMINA_STAT_DIVISOR));
  }

  updateCombatStats(character, combatResult, challenge) {
    if (!character.combatStats) {
        character.combatStats = {
            totalCombats: 0, wins: 0, losses: 0, draws: 0, retreats: 0,
            totalDamageDealt: 0, totalDamageTaken: 0, totalHealingDone: 0, totalHealingReceived: 0,
            totalCriticalHits: 0, enemyKills: {}, challengeCompletions: {}, statusEffectsApplied: {}, skillUsage: {}, milestones: {}
        };
    }
    const stats = character.combatStats;
    if (!stats.enemyKills) stats.enemyKills = {};
    if (!stats.challengeCompletions) stats.challengeCompletions = {};
    if (!stats.statusEffectsApplied) stats.statusEffectsApplied = {};
    if (!stats.skillUsage) stats.skillUsage = {};
    if (!stats.milestones) stats.milestones = {};

    stats.totalCombats = stats.totalCombats || 0;
    stats.wins = stats.wins || 0;
    stats.losses = stats.losses || 0;
    stats.draws = stats.draws || 0;
    stats.retreats = stats.retreats || 0;
    stats.totalDamageDealt = stats.totalDamageDealt || 0;
    stats.totalDamageTaken = stats.totalDamageTaken || 0;
    stats.totalHealingDone = stats.totalHealingDone || 0;
    stats.totalHealingReceived = stats.totalHealingReceived || 0;
    stats.totalCriticalHits = stats.totalCriticalHits || 0;

    if (typeof stats.draws !== 'number') stats.draws = 0;
    if (typeof stats.retreats !== 'number') stats.retreats = 0;
    if (typeof stats.totalDamageDealt !== 'number') stats.totalDamageDealt = 0;
    if (typeof stats.totalDamageTaken !== 'number') stats.totalDamageTaken = 0;
    if (typeof stats.totalHealingDone !== 'number') stats.totalHealingDone = 0;
    if (typeof stats.totalHealingReceived !== 'number') stats.totalHealingReceived = 0;
    if (typeof stats.totalCriticalHits !== 'number') stats.totalCriticalHits = 0;

    stats.totalCombats = (stats.totalCombats || 0) + 1;

    if (combatResult.result === 'victory') stats.wins = (stats.wins || 0) + 1;
    else if (combatResult.result === 'loss') stats.losses = (stats.losses || 0) + 1;
    else if (combatResult.result === 'draw') stats.draws = (stats.draws || 0) + 1;
    else if (combatResult.result === 'retreated') stats.retreats = (stats.retreats || 0) + 1;

    let damageDealt = 0;
    let damageTaken = 0;
    let healingDone = 0;
    const enemyKillsThisCombat = {};
    const skillsUsedThisCombat = {};

    combatResult.turns.forEach(turn => {
        if (turn.actorName === character.name && turn.result?.damageDealt > 0) damageDealt += turn.result.damageDealt;
        
        // Damage taken — find entries in targets[] where this character is the target
        if (turn.result?.damageDealt > 0 && Array.isArray(turn.result?.targets)) {
            turn.result.targets.forEach(t => {
                const tid = t.targetId || '';
                if (t.targetName === character.name ||
                    tid === character.id ||
                    tid.startsWith('char_') && tid === character.id ||
                    tid.startsWith('import_') && tid === character.id) {
                    damageTaken += (t.damage || 0);
                }
            });
        }
        
        if (turn.actorName === character.name && turn.result?.healingDone > 0) healingDone += turn.result.healingDone;
        if (turn.actorName === character.name && turn.roll?.crit === true) stats.totalCriticalHits = stats.totalCriticalHits + 1;
        
        // Kill tracking — credit all defeated enemies in targets[], not just the first
        if (turn.actorName === character.name && turn.result?.success && turn.result?.damageDealt > 0) {
            if (Array.isArray(turn.result?.targets)) {
                turn.result.targets.forEach(t => {
                    if (t.hpAfter === 0 && t.targetId?.startsWith('enemy_')) {
                        const enemyType = t.targetId.split('_').slice(1, -1).join('_');
                        enemyKillsThisCombat[enemyType] = (enemyKillsThisCombat[enemyType] || 0) + 1;
                    }
                });
            }
        }
        if (turn.actorName === character.name && turn.action?.type === 'skill') {
            const skillID = turn.action.skillID;
            skillsUsedThisCombat[skillID] = (skillsUsedThisCombat[skillID] || 0) + 1;
        }
    });

    stats.totalDamageDealt = (stats.totalDamageDealt || 0) + damageDealt;
    stats.totalDamageTaken = (stats.totalDamageTaken || 0) + damageTaken;
    stats.totalHealingDone = (stats.totalHealingDone || 0) + healingDone;

    Object.entries(enemyKillsThisCombat).forEach(([enemyType, count]) => {
        stats.enemyKills[enemyType] = (stats.enemyKills[enemyType] || 0) + count;
    });

    if (combatResult.result === 'victory' && challenge) {
        if (!stats.challengeCompletions) stats.challengeCompletions = {};
        if (!stats.challengeCompletions[challenge.id]) {
            stats.challengeCompletions[challenge.id] = { completed: true, completions: 0, secretCompletions: 0, bestTime: null, totalTime: 0 };
        }
        stats.challengeCompletions[challenge.id].completions = stats.challengeCompletions[challenge.id].completions + 1;
        stats.challengeCompletions[challenge.id].totalTime = stats.challengeCompletions[challenge.id].totalTime + combatResult.totalTurns;
        const currentBest = stats.challengeCompletions[challenge.id].bestTime;
        if (!currentBest || combatResult.totalTurns < currentBest) {
            stats.challengeCompletions[challenge.id].bestTime = combatResult.totalTurns;
        }
        // Track secret path completions for lore unlocks
        if (combatResult.rewards?.secretPathCompleted) {
            stats.challengeCompletions[challenge.id].secretCompletions =
                (stats.challengeCompletions[challenge.id].secretCompletions || 0) + 1;
            //console.log(`[STATS] ${character.name} secret path completions for ${challenge.id}: ${stats.challengeCompletions[challenge.id].secretCompletions}`);
        }
    }

    Object.entries(skillsUsedThisCombat).forEach(([skillID, count]) => {
        stats.skillUsage[skillID] = (stats.skillUsage[skillID] || 0) + count;
    });

    stats.winRate = stats.totalCombats > 0 ? (stats.wins / stats.totalCombats).toFixed(3) : 0;
    stats.damagePerCombat = stats.totalCombats > 0 ? (stats.totalDamageDealt / stats.totalCombats).toFixed(1) : 0;

    this.checkMilestones(stats);
    character.lastModified = Date.now();
    character.lastActiveAt = Date.now();
  }

  checkMilestones(stats) {
    if (stats.wins >= 1) stats.milestones.firstBlood = true;
    const totalKills = Object.values(stats.enemyKills).reduce((a, b) => a + b, 0);
    if (totalKills >= 100) stats.milestones.hundredKills = true;
    if (stats.enemyKills['dragon_ancient'] >= 1) stats.milestones.dragonSlayer = true;
    if (stats.totalHealingDone >= 10000) stats.milestones.masterHealer = true;
    if (stats.wins >= 10 && stats.losses === 0) stats.milestones.undefeated = true;
    if (stats.totalCombats >= 100) stats.milestones.centuryOfCombats = true;
  }

  resolveRetreat(actor, players) {
    const playerCount = players.filter(p => !p.defeated).length;
    const retreatChance = 0.5 + (playerCount * 0.1);
    const retreatSuccess = Math.random() <= retreatChance;
    return {
        roll: { retreatChance, success: retreatSuccess },
        result: {
            message: retreatSuccess ? `${actor.name} successfully retreated!` : `${actor.name} failed to retreat!`,
            success: retreatSuccess,
            delay: 1000
        }
    };
  }
}

CombatEngine.TUNING = {
    // Proc chance by skill depth (index 0 = depth 2, index 1 = depth 3, etc.)
    PROC_DEPTH_RATES: [0.18, 0.10, 0.06, 0.03, 0.015, 0.007],
};

CombatEngine.applyTuning = function(tuning) {
    if (tuning.genWeapon) {
        generateEnemyWeapon.TUNING = { ...(generateEnemyWeapon.TUNING || {}), ...tuning.genWeapon };
        console.log('[TUNING] genWeapon applied:', generateEnemyWeapon.TUNING);
    }
    if (tuning.procDepth) {
        CombatEngine.TUNING.PROC_DEPTH_RATES = tuning.procDepth;
        console.log('[TUNING] procDepth applied:', CombatEngine.TUNING.PROC_DEPTH_RATES);
    }
};

module.exports = CombatEngine;