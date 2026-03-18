const crypto = require('crypto');

// Game balance constants
const CONSTANTS = {
    STAT_SCALE: 300,
    STAT_CAP_MAX: 0.99,
    STAT_CAP_MIN: 0.1,
    BASE_HIT_CHANCE: 0.85,
    MAX_CRIT_CHANCE: 0.4,
    BASE_CRIT_CHANCE: 0.05,
};

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
    constructor(skillsData, enemyTypesData, racesData, gearData, statusEngine) {
        this.skills = skillsData;
        this.enemyTypes = enemyTypesData;
        this.races = racesData;
        this.gear = gearData;
        this.statusEngine = statusEngine;
        
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

    // 1. Find all valid opportunities (player has the required skill)
    const validOptions = opportunities.filter(op => {
      return playerCharacters.some(p => 
        !p.defeated && p.skills && p.skills.some(s => s.skillID === op.requiredSkillID)
      );
    });

    let bestOption = null;
    let highestChance = -1;
    let bestActor = null;
    let bestStatValue = -1;
    let isFallbackScenario = false;

    // SCENARIO A: Player HAS the skill
    if (validOptions.length > 0) {
      validOptions.forEach(op => {
        let candidateBestStat = -1;
        let candidateActor = null;

        playerCharacters.forEach(p => {
          if (p.defeated) return;
          const hasSkill = p.skills && p.skills.some(s => s.skillID === op.requiredSkillID);
          if (!hasSkill) return;

          const primaryVal = p.stats[op.checkStat] || 0;
          const secondaryVal = p.stats[op.secondaryStat] || 0;
          const statValue = primaryVal + (secondaryVal * 0.5);

          if (statValue > candidateBestStat) {
            candidateBestStat = statValue;
            candidateActor = p;
          }
        });

        if (!candidateActor) return;

        const margin = candidateBestStat - op.difficultyThreshold;
        const chance = 0.5 + (margin / CONSTANTS.STAT_SCALE);
        const clampedChance = Math.max(0.05, Math.min(0.95, chance));

        if (clampedChance > highestChance) {
          highestChance = clampedChance;
          bestOption = op;
          bestActor = candidateActor;
          bestStatValue = candidateBestStat;
        }
      });
    } 
    // SCENARIO B: Player LACKS the skill (FALLBACK)
    else {
      const fallbackOpportunity = opportunities.find(op => op.fallbackEffect);
      
      if (fallbackOpportunity) {
        isFallbackScenario = true;
        bestOption = fallbackOpportunity;
        let candidateBestStat = -1;
        let candidateActor = playerCharacters[0]; 
        
        playerCharacters.forEach(p => {
          if (p.defeated) return;
          const primaryVal = p.stats[bestOption.checkStat] || 0;
          if (primaryVal > candidateBestStat) {
            candidateBestStat = primaryVal;
            candidateActor = p;
          }
        });
        
        bestActor = candidateActor;
        bestStatValue = candidateBestStat;
        highestChance = 0;
      }
    }

    if (!bestOption) {
      return { turns: [], turnCount: currentTurnCount };
    }

    // 3. Execute the Option
    currentTurnCount++;
    
    let isSuccess = false;
    let rolled = 0;
    let effect = null;

    if (isFallbackScenario) {
      rolled = 1.0; 
      isSuccess = false;
      effect = bestOption.fallbackEffect;
      
      console.log(`\n[PRE-COMBAT] === Opportunity Detected (FALLBACK) ===`);
      console.log(`[PRE-COMBAT] Skill Required: ${bestOption.name} (ID: ${bestOption.requiredSkillID})`);
      console.log(`[PRE-COMBAT] Status: ❌ NO PARTY MEMBER HAS THIS SKILL`);
      console.log(`[PRE-COMBAT] Result: AUTOMATIC FAILURE (Fallback Triggered)`);
      console.log(`[PRE-COMBAT] Narrative: "${effect.narrative}"\n`);
    } else {
      rolled = Math.random();
      isSuccess = rolled <= highestChance;
      effect = isSuccess ? bestOption.successEffect : bestOption.failureEffect;

      const primaryStatVal = bestActor.stats[bestOption.checkStat] || 0;
      const secondaryStatVal = bestActor.stats[bestOption.secondaryStat] || 0;
      
      console.log(`\n[PRE-COMBAT] === Opportunity Detected ===`);
      console.log(`[PRE-COMBAT] Skill: ${bestOption.name} (ID: ${bestOption.requiredSkillID})`);
      console.log(`[PRE-COMBAT] Actor: ${bestActor.name}`);
      console.log(`[PRE-COMBAT] Stats Check: ${bestOption.checkStat}(${primaryStatVal}) + ${bestOption.secondaryStat}(${secondaryStatVal})*0.5 = ${bestStatValue.toFixed(1)}`);
      console.log(`[PRE-COMBAT] Threshold: ${bestOption.difficultyThreshold} | Margin: ${(bestStatValue - bestOption.difficultyThreshold).toFixed(1)}`);
      console.log(`[PRE-COMBAT] Calculated Chance: ${(highestChance * 100).toFixed(1)}%`);
      console.log(`[PRE-COMBAT] RNG Roll: ${rolled.toFixed(3)} vs Required: ${highestChance.toFixed(3)}`);
      console.log(`[PRE-COMBAT] Result: ${isSuccess ? '✅ SUCCESS' : '❌ FAILURE'}`);
      console.log(`[PRE-COMBAT] Narrative: "${effect.narrative}"\n`);
    }

    const narrativeTurn = {
      turnNumber: currentTurnCount,
      stageTurnNumber: 0,
      actor: bestActor.id,
      actorName: bestActor.name,
      action: { 
        type: isFallbackScenario ? 'pre_combat_fallback' : 'pre_combat_skill', 
        skillID: bestOption.requiredSkillID, 
        name: isFallbackScenario ? `No Countermeasure (${bestOption.name})` : bestOption.name 
      },
      roll: { 
        hitChance: isFallbackScenario ? 0 : highestChance, 
        rolled: rolled, 
        hit: isSuccess 
      },
      result: {
        message: effect.narrative,
        success: isSuccess,
        delay: 1000
      }
    };

    // 4. Apply Effects
    if (effect.type === 'apply_direct_damage') {
      playerCharacters.forEach(p => {
        if (p.defeated) return;
        const maxHP = p.maxHP;
        const damage = Math.floor(maxHP * effect.magnitude);
        p.currentHP = Math.max(0, p.currentHP - damage);
        if (p.currentHP <= 0) {
          p.defeated = true;
          narrativeTurn.result.message += ` ${p.name} falls immediately!`;
        }
      });
    } else if (effect.type === 'apply_status') {
       // Apply status to all players for simplicity in pre-combat
       playerCharacters.forEach(p => {
         if (!p.defeated) {
           this.statusEngine.applyStatus(p, effect.status, effect.duration, effect.magnitude || 1);
         }
       });
    } else if (effect.type === 'remove_enemy') {
       // Remove X enemies of the first type found in the stage
       const countToRemove = effect.magnitude || 1;
       const targetType = stage.enemies[0]?.enemyTypeID; // Simplified for demo
       if (targetType) {
         let removed = 0;
         for (let i = enemies.length - 1; i >= 0; i--) {
           if (enemies[i].name.includes(targetType.split('_').pop()) || enemies[i].id.includes(targetType)) {
              enemies.splice(i, 1);
              removed++;
              if (removed >= countToRemove) break;
           }
         }
       }
    }

    preCombatTurns.push(narrativeTurn);

    return { turns: preCombatTurns, turnCount: currentTurnCount };
  }

/**
   * Run a complete combat simulation
   */
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
      const equipmentSlots = ['mainHand', 'offHand', 'head', 'chest', 'legs', 'hands', 'feet', 'accessory1', 'accessory2'];
      const boostedStats = { ...stats }; // don't mutate the original snapshot stats
      equipmentSlots.forEach(slot => {
        const itemId = equipment[slot];
        if (!itemId) return;
        const itemDef = this.gear.find(g => g.id === itemId);
        if (!itemDef) return;
        Object.entries(statFieldMap).forEach(([shortKey, longKey]) => {
          if (itemDef[shortKey]) boostedStats[longKey] = (boostedStats[longKey] || 0) + itemDef[shortKey];
        });
      });

      // Sum armor and evasion from all equipped armor pieces.
      // armor → flat damage reduction; phys_ev/mag_ev → hit chance reduction (separate).
      const armorSlots = ['head', 'chest', 'offHand', 'legs', 'hands', 'feet'];
      let totalArmor = 0;
      let totalPhysEv = 0;
      let totalMagEv  = 0;
      armorSlots.forEach(slot => {
        const itemId = equipment[slot];
        if (!itemId) return;
        const itemDef = this.gear.find(g => g.id === itemId);
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
        console.log(`[BRANCH] Evaluating branches for Stage ${stage.stageId}: ${stage.title}`);
        let resolvedNextStageId = null;

        for (const branch of stage.stageBranches) {
          if (!branch.condition) {
            // Default fallback branch — keep as candidate but keep scanning for a condition match
            resolvedNextStageId = branch.nextStageId;
            if (branch.overrideDescription) stage.description = branch.overrideDescription;
            continue; 
          }

          // Evaluate Condition
          let conditionMet = false;
          if (branch.condition.type === 'has_skill') {
            conditionMet = playerCharacters.some(p => 
              !p.defeated && p.skills && p.skills.some(s => s.skillID === branch.condition.value)
            );
          }
          
          if (conditionMet) {
            resolvedNextStageId = branch.nextStageId;
            if (branch.overrideDescription) stage.description = branch.overrideDescription;
            console.log(`[BRANCH] Condition met (${branch.condition.type}: ${branch.condition.value}). Jumping to Stage ${resolvedNextStageId}`);
            break;
          }
        }

        if (resolvedNextStageId !== null) {
          const targetIdx = allStages.findIndex(s => s.stageId === resolvedNextStageId);
          if (targetIdx !== -1) {
            stage = allStages[targetIdx];
            // FIX: record target so stageIndex++ below advances PAST the branched stage
            forcedNextStageIndex = targetIdx;
            console.log(`[BRANCH] Resolved to stage index ${targetIdx} (stageId: ${stage.stageId})`);
          } else {
            console.error(`[BRANCH] Target stage ${resolvedNextStageId} not found!`);
          }
        }
      }
      // -----------------------

      if (playerCharacters.every(p => p.defeated)) {
        combatResult = 'loss';
        break;
      }

      console.log(`\n[STAGE] Starting Stage ${stage.stageId}: ${stage.title}`);
      
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

      // Reset lastUsedSkillId at the start of each stage
      playerCharacters.forEach(p => { p.lastUsedSkillId = null; });

      let stageTurnCount = stageTurns.length;
      const startStageHP = playerCharacters.map(p => ({ id: p.id, hp: p.currentHP }));

      while (!this.isCombatFinished(playerCharacters, enemies)) {
        for (const combatant of turnOrder) {
          if (combatant.defeated) continue;

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
            const context = this._buildContext(stageIndex, allStages, playerCharacters, enemies, playerChar);
            const action = this.selectPlayerAction(playerChar, playerCharacters, enemies, context);
            const turnResult = this.resolveAction(action, playerChar, playerCharacters, enemies);
            
            // Track last used skill for proc pressure
            if (action.type === 'skill' && action.skillID) {
              playerChar.lastUsedSkillId = action.skillID;
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
            
            const context = this._buildContext(stageIndex, allStages, playerCharacters, enemies, enemy);
            const action = this.selectEnemyAction(enemy, playerCharacters, enemies, context);
            
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
    const rewards = (allStagesWon && combatResult === 'victory') ? this.calculateRewards(playerCharacters, challenge) : null;

    return {
      combatID,
      result: combatResult,
      totalTurns: globalTurnCount,
      segments,  
      turns: segments.flatMap(s => s.turns), 
      participants: {
        playerCharacters: playerCharacters.map(p => ({
          characterID: p.id, 
          characterName: p.name, 
          maxHP: p.maxHP, 
          finalHP: p.currentHP, 
          maxMana: p.maxMana, 
          finalMana: p.currentMana, 
          maxStamina: p.maxStamina, 
          finalStamina: p.currentStamina, 
          defeated: p.defeated,
          skills: p.skills // ✅ ADD THIS LINE TO PRESERVE UPDATED SKILLS
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
        shouldPersist: false
    };
  }

  /**
   * Calculate rewards using the challenge object directly
   */
  calculateRewards(players, challenge) {
     const rewards = {
        experienceGained: {},
        lootDropped: []
    };

    const baseXP = challenge?.rewards?.baseXP || 100;
    const baseGold = challenge?.rewards?.baseGold || 50;
    const lootTable = challenge?.rewards?.lootTable || [];

    // XP scaled by harmony
    players.forEach(player => {
        const xpReward = Math.floor(baseXP * (1 + (player.stats?.harmony || 0) / 250));
        rewards.experienceGained[player.id] = xpReward;
    });

    // Loot scaled by ambition
    lootTable.forEach(lootItem => {
        const dropChance = (lootItem.dropChance || 0.3) * (1 + (players[0]?.stats?.ambition || 0) / 500);
        if (Math.random() <= dropChance) {
            rewards.lootDropped.push({
                characterID: players[0].id,
                itemID: lootItem.itemID,
                itemName: lootItem.itemID,
                rarity: lootItem.rarity
            });
        }
    });

    return rewards;
  }

  /**
   * Select action for a player character - uses dynamic skill selection
   */
  selectPlayerAction(character, players, enemies, context = {}) {
    const aliveEnemies = enemies.filter(e => !e.defeated);
    if (aliveEnemies.length === 0) return { type: 'attack', target: null };

    const profile = character.aiProfile || 'balanced';

    // Profile modifiers
    const emergencyHPThreshold = profile === 'cautious' ? 0.4 : 0.2;
    const allyRescueThreshold  = (profile === 'support') ? 0.5 : 0.3;
    const procPressureBonus    = (profile === 'opportunist') ? 1.6 : 1.35;
    const conservationEnabled  = (profile !== 'aggressive');

    // ── Emergency survival override (HP critical) ──
    if (character.currentHP <= character.maxHP * emergencyHPThreshold) {
        const healSkill = this.getAvailableSkillByCategory(character, 'HEALING') ||
                          this.getAvailableSkillByCategory(character, 'HEALING_AOE');
        if (healSkill) {
            const action = { type: 'skill', skillID: healSkill.id, target: character.id };
            return this.checkChildSkillProc(character, action, players, enemies);
        }
        // No heal — try defense
        const defSkill = this.getAvailableSkillByCategory(character, 'DEFENSE');
        if (defSkill) {
            const action = { type: 'skill', skillID: defSkill.id, target: character.id };
            return this.checkChildSkillProc(character, action, players, enemies);
        }
    }

    // ── Ally rescue ──
    if (profile !== 'aggressive') {
        const lowHPAlly = players.find(p =>
            !p.defeated && p.id !== character.id &&
            p.currentHP <= p.maxHP * allyRescueThreshold
        );
        if (lowHPAlly) {
            const healSkill = this.getAvailableSkillByCategory(character, 'HEALING') ||
                              this.getAvailableSkillByCategory(character, 'HEALING_AOE');
            if (healSkill) {
                const action = { type: 'skill', skillID: healSkill.id, target: lowHPAlly.id };
                return this.checkChildSkillProc(character, action, players, enemies);
            }
        }
    }

    // ── RESTORATION — prefer over NO_RESOURCES when stamina/mana both low but not zero ──
    const staminaRatio = character.currentStamina / character.maxStamina;
    const manaRatio    = character.currentMana    / character.maxMana;
    if (staminaRatio < 0.15 && manaRatio < 0.15) {
        const restoreSkill = this.getAvailableSkillByCategory(character, 'RESTORATION')
            || this.getAvailableSkillByCategory(character, 'CONSUMABLE_RESTORATION');
        if (restoreSkill) {
            const action = { type: 'skill', skillID: restoreSkill.id, target: character.id };
            return this.checkChildSkillProc(character, action, players, enemies);
        }
    }

    // ── Build candidate pool ──
    const pool = this.getAugmentedSkillPool(character);
    const candidates = [];

    const damageCategories = ['DAMAGE_SINGLE','DAMAGE_AOE','DAMAGE_MAGIC','DAMAGE_AOE_MAGIC'];
    const allSkillCategories = [
        ...damageCategories,
        'HEALING','HEALING_AOE','CONTROL','BUFF','DEFENSE','UTILITY','RESTORATION',
        'CONSUMABLE_HEALING','CONSUMABLE_RESTORATION','CONSUMABLE_DAMAGE'
    ];

    for (const skillID of pool) {
        const skill = this.skills.find(s => s.id === skillID);
        if (!skill || !this.hasResources(character, skill)) continue;
        if (!allSkillCategories.includes(skill.category)) continue;

        // Determine target
        let target = null;
        const cat = skill.category;

        if (cat === 'HEALING' || cat === 'HEALING_AOE' || cat === 'RESTORATION' ||
            cat === 'BUFF' || cat === 'DEFENSE' ||
            cat === 'CONSUMABLE_HEALING' || cat === 'CONSUMABLE_RESTORATION') {
            target = character.id;
        } else if (cat === 'CONTROL' || cat === 'UTILITY') {
            // Check if skill has any self-only effects vs enemy effects
            const hasEnemyEffect = skill.effects?.some(e =>
                e.targets === 'single_enemy' || e.targets === 'all_enemies' ||
                (!e.targets && (e.type === 'apply_debuff'))
            );
            const hasSelfOnlyEffects = skill.effects?.every(e =>
                e.targets === 'self' || e.type === 'apply_buff'
            );

            if (hasSelfOnlyEffects && !hasEnemyEffect) {
                target = character.id; // purely self-targeting utility/buff
            } else if (profile === 'disruptor' && context.highestThreatScore > 0) {
                const threatened = aliveEnemies.reduce((best, e) =>
                    this._threatScore(e) > this._threatScore(best) ? e : best
                );
                target = threatened.id;
            } else {
                target = aliveEnemies.reduce((min, e) => e.currentHP < min.currentHP ? e : min).id;
            }
        } else if (cat.includes('AOE')) {
            target = null; // AOE hits all
        } else {
            // Damage single: default lowest HP, but disruptor targets highest threat
            if (profile === 'disruptor' && context.highestThreatScore > 0) {
                const threatened = aliveEnemies.reduce((best, e) =>
                    this._threatScore(e) > this._threatScore(best) ? e : best
                );
                target = threatened.id;
            } else {
                target = aliveEnemies.reduce((min, e) => e.currentHP < min.currentHP ? e : min).id;
            }
        }

        const score = this._scoreAction(character, skill, target, context, {
            aliveEnemies, players, profile, procPressureBonus, conservationEnabled
        });

        candidates.push({ skill, target, score });
    }

    if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];
        const action = { type: 'skill', skillID: best.skill.id, target: best.target };
        return this.checkChildSkillProc(character, action, players, enemies);
    }

    // NEW LOGIC: NO RESOURCES FALLBACK
    const desperationPool = this.skills.filter(s => s.category === 'NO_RESOURCES');

    if (desperationPool.length > 0) {
        const randomIndex = Math.floor(Math.random() * desperationPool.length);
        const chosenSkill = desperationPool[randomIndex];

        console.log(`[DESPERATION] ${character.name} ${character.id} is out of resources! Randomly selected: ${chosenSkill.name}`);

        let targetId = null;
        // A skill is selfish (self-targeted) only if it has NO enemy damage effects.
        // Skills like desperate_attack have a self-debuff but deal damage to enemies —
        // the self-debuff is a cost, not the primary target.
        const hasDamageEffect = chosenSkill.effects?.some(e =>
            e.type === 'damage' &&
            (!e.targets || e.targets === 'single_enemy' || e.targets === 'all_enemies')
        );
        const isSelfish = !hasDamageEffect && chosenSkill.effects?.some(e =>
            e.type === 'restore_resource' ||
            (e.type === 'apply_buff'   && e.targets === 'self') ||
            (e.type === 'apply_debuff' && e.targets === 'self')
        );

        if (isSelfish) {
            targetId = character.id;
        } else {
            const target = aliveEnemies.reduce((min, e) => e.currentHP < min.currentHP ? e : min);
            targetId = target.id;
        }

        return { 
            type: 'skill', 
            skillID: chosenSkill.id, 
            target: targetId 
        };
    }

    console.error(`[CRITICAL] ${character.name} ${character.id} has no resources AND the global NO_RESOURCES pool is empty! Falling back to basic attack.`);
    const lowestHPEnemyFallback = aliveEnemies.reduce((min, e) => e.currentHP < min.currentHP ? e : min);
    return { type: 'attack', target: lowestHPEnemyFallback.id };
  }

  /**
   * Select action for an enemy - uses dynamic skill selection
   */
  selectEnemyAction(enemy, players, enemies, context = {}) {
    const actionBlock = this.statusEngine.checkActionBlock(enemy);
    if (!actionBlock.canAct) {
        console.log(`[DEBUG] ${enemy.name} is stunned and cannot act!`);
        return { type: 'blocked', reason: actionBlock.reason };
    }

    const alivePlayers = players.filter(p => !p.defeated);
    if (alivePlayers.length === 0) return { type: 'attack', target: null };

    if (!enemy.skills || enemy.skills.length === 0) {
        const target = alivePlayers.reduce((min, p) => p.currentHP < min.currentHP ? p : min);
        return { type: 'attack', target: target.id };
    }

    const profile = enemy.aiProfile || 'aggressive';

    // ── Targeting weights ──
    // Each player gets a weight that influences how likely they are to be chosen.
    // Taunt: greatly increases selection weight
    // Stealth: greatly reduces selection weight (but doesn't make target immune)
    // Weights are used when the enemy makes a random target choice.
    const statusEngine = this.statusEngine;

    function _weightedRandomTarget(pool) {
        const weights = pool.map(p => {
            let w = 1.0;
            if (p.statusEffects?.some(e => e.id === 'taunt'   && e.duration > 0)) w *= 4.0;
            if (p.statusEffects?.some(e => e.id === 'stealth' && e.duration > 0)) w *= 0.15;
            // marked/provoked: apply targetingWeight multiplier from status definition
            p.statusEffects?.forEach(activeStatus => {
                const def = statusEngine?.statusMap?.[activeStatus.id];
                if (def?.targetingWeight && activeStatus.duration > 0) {
                    w *= def.targetingWeight;
                }
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

    // Taunt: check if any player has taunt active (used to bias preferred-target logic too)
    const tauntTarget = alivePlayers.find(p =>
        p.statusEffects?.some(e => e.id === 'taunt' && e.duration > 0)
    );
    const aliveEnemies = enemies.filter(e => !e.defeated);

    // Emergency heal
    if (profile !== 'berserker' && enemy.currentHP <= enemy.maxHP * 0.3) {
        const healSkill = this.getEnemySkillByCategory(enemy.skills, 'HEALING');
        if (healSkill) return { type: 'skill', skillID: healSkill.id, target: enemy.id };
    }

    // Support profile: occasionally buff/heal allies
    if (profile === 'support' && aliveEnemies.length > 1 && Math.random() < 0.35) {
        const buffSkill = this.getEnemySkillByCategory(enemy.skills, 'BUFF');
        if (buffSkill) {
            const weakestAlly = aliveEnemies
                .filter(e => e.id !== enemy.id)
                .reduce((min, e) => e.currentHP < min.currentHP ? e : min, aliveEnemies[0]);
            return { type: 'skill', skillID: buffSkill.id, target: weakestAlly.id };
        }
    }

    // Build all usable skills (include CONTROL, BUFF, DEFENSE — not just DAMAGE)
    const usableSkills = enemy.skills
        .map(skillID => this.skills.find(s => s.id === skillID))
        .filter(s => s && this.hasResources(enemy, s) &&
            ['DAMAGE_SINGLE','DAMAGE_AOE','DAMAGE_MAGIC','DAMAGE_AOE_MAGIC',
             'CONTROL','BUFF','DEFENSE','UTILITY'].includes(s.category)
        );

    if (usableSkills.length === 0) {
        // No usable skills — fall through to desperation below
        null;
    } else {
        // Pick target based on profile, with weighted randomness so enemies
        // don't always robotically focus the same target.
        // focusChance = probability of picking the "preferred" target;
        // otherwise picks randomly from alive players.
        const focusChance = {
            aggressive: 0.70,
            tactical:   0.65,
            berserker:  0.40,
            support:    0.55,
        }[profile] ?? 0.70;

        let primaryTarget = null;

        // Taunt: when a taunting player exists, non-berserker profiles always use
        // weighted random (which strongly favours the taunting player). Berserker
        // only uses weighted random on its random rolls, not its preferred-target rolls.
        const usePreferred = Math.random() < focusChance;

        if (!usePreferred || profile === 'berserker') {
            // Random selection — weights handle taunt and stealth influence
            primaryTarget = _weightedRandomTarget(alivePlayers);
        } else if (tauntTarget) {
            // Preferred selection but taunt is active — honour taunt
            primaryTarget = tauntTarget;
            console.log(`[TAUNT] ${enemy.name} drawn to ${tauntTarget.name}`);
        } else if (profile === 'tactical') {
            primaryTarget = alivePlayers.reduce((best, p) =>
                this._threatScore(p) > this._threatScore(best) ? p : best
            );
        } else {
            // aggressive / support / default: lowest HP
            primaryTarget = alivePlayers.reduce((min, p) => p.currentHP < min.currentHP ? p : min);
        }

        // Score candidates
        const candidates = usableSkills.map(skill => {
            let target = primaryTarget.id;
            const cat = skill.category;

            // AOE
            if (cat.includes('AOE')) target = null;
            // Control: prefer debuff if not already applied
            if (cat === 'CONTROL') {
                const mainDebuff = skill.effects?.find(e => e.type === 'apply_debuff')?.debuff;
                if (mainDebuff && this._targetHasDebuff(primaryTarget, mainDebuff)) {
                    // Already debuffed — score will be penalised
                }
            }

            let score = skill.basePower || 1;

            // Berserker: always highest power, no modifiers
            if (profile === 'berserker') return { skill, target, score };

            // Debuff redundancy penalty
            const mainDebuff = skill.effects?.find(e => e.type === 'apply_debuff')?.debuff;
            if (mainDebuff && primaryTarget && this._targetHasDebuff(primaryTarget, mainDebuff)) {
                score *= 0.5;
            }

            // Buff redundancy penalty — don't recast a buff already active on self
            const mainBuff = skill.effects?.find(e => e.type === 'apply_buff' && (e.targets === 'self' || !e.targets))?.buff;
            if (mainBuff && enemy.statusEffects?.some(s => s.id === mainBuff && s.duration > 0)) {
                score *= 0.15;
            }

            // AOE bonus
            if (cat.includes('AOE') && alivePlayers.length >= 2) {
                score *= (alivePlayers.length * 0.5);
            }

            // Control bonus for tactical profile
            if (profile === 'tactical' && cat === 'CONTROL') score *= 1.4;

            // Finishing blow bonus
            if (primaryTarget && primaryTarget.currentHP <= primaryTarget.maxHP * 0.25) score *= 1.2;

            return { skill, target, score };
        });

        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];
        if (best) {
            return { type: 'skill', skillID: best.skill.id, target: best.target };
        }
    }

    // NEW LOGIC: NO RESOURCES FALLBACK (Enemies)
    const desperationPool = this.skills.filter(s => s.category === 'NO_RESOURCES');

    if (desperationPool.length > 0) {
        const randomIndex = Math.floor(Math.random() * desperationPool.length);
        const chosenSkill = desperationPool[randomIndex];

        console.log(`[DESPERATION] ${enemy.name} ${enemy.id} is out of resources! Randomly selected: ${chosenSkill.name}`);

        let targetId = null;
        const hasDamageEffect = chosenSkill.effects?.some(e =>
            e.type === 'damage' &&
            (!e.targets || e.targets === 'single_enemy' || e.targets === 'all_enemies')
        );
        const isSelfish = !hasDamageEffect && chosenSkill.effects?.some(e =>
            e.type === 'restore_resource' ||
            (e.type === 'apply_buff'   && e.targets === 'self') ||
            (e.type === 'apply_debuff' && e.targets === 'self')
        );

        if (isSelfish) {
            targetId = enemy.id;
        } else {
            const target = alivePlayers.reduce((min, p) => p.currentHP < min.currentHP ? p : min);
            targetId = target.id;
        }

        return { 
            type: 'skill', 
            skillID: chosenSkill.id, 
            target: targetId 
        };
    }

    console.error(`[CRITICAL] ${enemy.name} has no resources AND the global NO_RESOURCES pool is empty! Falling back to basic attack.`);
    const targetFallback = alivePlayers.reduce((min, p) => p.currentHP < min.currentHP ? p : min);
    return { type: 'attack', target: targetFallback.id };
  }

  // ── AI HELPER METHODS ─────────────────────────────────────────────────────

  /**
   * Build the context object passed to both action selectors each turn.
   */
  _buildContext(stageIndex, allStages, players, enemies, actor) {
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
      lastUsedSkillId:  actor.lastUsedSkillId || null,
      staminaBudgetRatio: actor.currentStamina / (actor.maxStamina / Math.max(1, stagesRemaining + 1)),
      manaBudgetRatio:    actor.currentMana    / (actor.maxMana    / Math.max(1, stagesRemaining + 1)),
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

    // ── Buff redundancy penalty — don't reapply a buff already active on self ──
    if (cat === 'BUFF' || cat === 'DEFENSE') {
        const primaryBuff = skill.effects?.find(e => e.type === 'apply_buff')?.buff;
        if (primaryBuff && this._targetHasDebuff(character, primaryBuff)) {
            score *= 0.15; // very low — almost never reapply an active buff
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

    // ── Proc pressure bonus ──
    if (context.lastUsedSkillId && this._hasProcOpportunity(character, skill.id, context.lastUsedSkillId)) {
        score *= procPressureBonus;
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

    // ── Profile-specific boosts ──
    if (profile === 'support') {
        if (cat === 'HEALING' || cat === 'HEALING_AOE' || cat === 'BUFF') score *= 1.5;
        if (cat && cat.includes('DAMAGE')) score *= 0.7;
    }
    if (profile === 'disruptor') {
        if (cat === 'CONTROL') score *= 1.6;
        if (cat === 'UTILITY') score *= 1.3;
    }
    if (profile === 'aggressive') {
        if (cat && cat.includes('DAMAGE')) score *= 1.3;
        if (cat === 'BUFF' || cat === 'DEFENSE') score *= 0.5;
    }

    // ── Buff window — small bonus for buffing when healthy ──
    if ((cat === 'BUFF' || cat === 'DEFENSE') &&
        character.currentHP > character.maxHP * 0.6 &&
        resourceRatio > 0.5) {
        score *= 1.2;
    }

    // ── Support profile: HEALING_AOE bonus when 2+ allies are hurt ──
    if (cat === 'HEALING_AOE') {
        const hurtAllies = players.filter(p => !p.defeated && p.currentHP < p.maxHP * 0.7).length;
        if (hurtAllies >= 2) score *= 1.4;
    }

    return score;
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
   * Includes equipped skills + consumable belt skills (while qty > 0).
   * Consumable items live in this.gear — identified by skillID or effect_skillid field.
   */
  getAugmentedSkillPool(character) {
    const pool = new Set();

    // Equipped skill slots (indices 0 and 1 only)
    if (character.skills) {
        character.skills.slice(0, 2).forEach(s => pool.add(s.skillID));
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

    return pool;
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
        if (s.category !== selectedCategory) return false;
        return s.parentSkills.every(parentId => availablePool.has(parentId));
    });

    if (eligibleChildSkills.length === 0) return selectedAction;

    const shuffled = eligibleChildSkills.sort(() => Math.random() - 0.5);

    for (const childSkill of shuffled) {
        const procChance = childSkill.procChance || 0.05;
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
        } else if (!target && aliveEnemies.length > 0) {
            target = aliveEnemies.reduce((min, e) => e.currentHP < min.currentHP ? e : min).id;
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
                    console.log(`[CHILD PROC] Consumed ${consumableId} (${consumables[consumableId]} remaining)`);
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
            console.log(`[CHILD PROC] ✨ ${character.name} discovered: ${childSkill.name}!`);
        }

        // --- REMOVED: XP Award Logic ---
        // We NO LONGER award XP here. 
        // The Frontend (combat-log.js) will detect isChildSkillProc and award XP 
        // based on the strict rules (Discovery XP only if Level 0).
        // This prevents double-dipping and the "Echo Loop".
        
        console.log(`[CHILD PROC] ${character.name} → ${childSkill.name} (replaced ${selectedSkillDef.name})`);

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
    const weapon = this.gear.find(g => g.id === actor.equipment.mainHand);
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
                console.log(`[PROC] ${weapon.name} proc ${procSkillId} FAILED (chance=${procChance}%, rolled=${rolled.toFixed(1)})`);
            }
        }
    }

    procs.forEach(proc => {
        const procSkill = this.skills.find(s => s.id === proc.skillId);
        if (!procSkill) {
            console.warn(`[PROC] Skill not found: ${proc.skillId}`);
            return;
        }
        console.log(`[PROC] ${weapon.name} triggered ${procSkill.name} on ${target.name}!`);
        this.applySkillEffects(procSkill, actor, target);

        if (procSkill.effects?.some(e => e.type === 'damage')) {
            const procDamage = this.calculateDamage(actor, procSkill, target, false, skillLevel);
            target.currentHP -= procDamage;
            if (target.currentHP <= 0) {
                target.currentHP = 0;
                target.defeated = true;
                console.log(`[DEBUG] ${target.name} defeated by proc! (HP: 0)`);
            }
            console.log(`[PROC] ${procSkill.name} dealt ${procDamage} damage to ${target.name}`);
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
            console.log(`[STATUS PROC] ${activeStatus.name} proc FAILED (chance=${chance}%, rolled=${rolled.toFixed(1)})`);
            return;
        }

        const procSkill = this.skills.find(s => s.id === skillId);
        if (!procSkill) {
            console.warn(`[STATUS PROC] Skill not found: ${skillId}`);
            return;
        }

        console.log(`[STATUS PROC] ${activeStatus.name} triggered ${procSkill.name} on ${target.name}!`);
        this.applySkillEffects(procSkill, actor, target);

        if (procSkill.effects?.some(e => e.type === 'damage')) {
            const procDamage = this.calculateDamage(actor, procSkill, target, false, skillLevel);
            target.currentHP -= procDamage;
            if (target.currentHP <= 0) {
                target.currentHP = 0;
                target.defeated = true;
                console.log(`[DEBUG] ${target.name} defeated by status proc! (HP: 0)`);
            }
            console.log(`[STATUS PROC] ${procSkill.name} dealt ${procDamage} damage to ${target.name}`);
        }
    });
  }

  resolveAction(action, actor, players, enemies) {
    if (action.type === 'retreat') {
        return this.resolveRetreat(actor, players);
    }

    const skill = this.skills.find(s => s.id === action.skillID);
    if (!skill) {
        console.log(`[DEBUG] Skill not found: ${action.skillID}`);
        return {
            roll: null,
            result: { message: 'Skill not found', success: false, delay: 1000 }
        };
    }

    // Non-offensive categories skip damage calculation, variance, and weapon procs entirely.
    // They only apply skill effects (heals, buffs, resource restoration).
    const NON_OFFENSIVE = new Set([
        'HEALING','HEALING_AOE','BUFF','DEFENSE','UTILITY','RESTORATION',
        'CONSUMABLE_HEALING','CONSUMABLE_RESTORATION'
    ]);
    const isOffensive = !NON_OFFENSIVE.has(skill.category);

    // Weapon Delay Modification
    const weapon = actor.equipment?.mainHand ? this.gear.find(g => g.id === actor.equipment.mainHand) : null;
    const delayMultiplier = weapon?.delay ? (weapon.delay === 1 ? 0.8 : weapon.delay === 3 ? 1.2 : 1.0) : 1.0;

    // Status delay multiplier (slow, haste, freeze, knockback, evasion_boost, speed_boost etc.)
    let statusDelayMult = 1.0;
    if (actor.statusEffects && actor.statusEffects.length > 0) {
        const statusResult = this.statusEngine.processStatusEffects(actor);
        statusDelayMult = statusResult.skillDelayMultiplier || 1.0;
    }

    const finalDelay = Math.round(skill.delay * delayMultiplier * statusDelayMult);
    const statusDelayNote = statusDelayMult !== 1.0 ? `, status=${statusDelayMult.toFixed(2)}x` : '';
    console.log(`[DELAY] ${actor.name} ${skill.name}: base=${skill.delay}ms, weapon=${weapon?.delay || 'none'}${statusDelayNote}, final=${finalDelay}ms`);

    // Consume resources
    if (skill.costType === 'stamina') {
        actor.currentStamina = Math.max(0, actor.currentStamina - skill.costAmount);
    } else if (skill.costType === 'mana') {
        actor.currentMana = Math.max(0, actor.currentMana - skill.costAmount);
    }

    // Get skill level
    let skillLevel = 1;
    if (actor.type === 'player' && actor.skills) {
        const skillData = actor.skills.find(s => s.skillID === action.skillID);
        if (skillData) skillLevel = skillData.skillLevel || 1;
    }

    // Multi-Hit Support
    const hitCount = skill.hitCount?.fixed ||
        Math.floor(Math.random() * (skill.hitCount?.max - skill.hitCount?.min + 1)) + (skill.hitCount?.min || 1);
    console.log(`[HITCOUNT] ${actor.name} ${skill.name}: rolling ${hitCount} hit(s)`);

    // ── Determine target list from effect definitions ──
    // AOE is driven by effect targets, not category name.
    // all_enemies → all alive enemies; all_allies → all alive players
    const hasAOEEffect = skill.effects?.some(e =>
        e.targets === 'all_enemies' || e.targets === 'all_allies' || e.targets === 'all_entities'
    );
    const isAllyAOE = skill.effects?.some(e => e.targets === 'all_allies');

    let targetList;
    if (hasAOEEffect) {
        targetList = isAllyAOE
            ? players.filter(p => !p.defeated)
            : enemies.filter(e => !e.defeated);
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
        targetList.forEach(t => this.applySkillEffects(skill, actor, t, null, players));
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
        if (target.currentHP <= 0) {
            target.currentHP = 0;
            target.defeated = true;
            console.log(`[DEBUG] ${target.name} defeated! (HP: 0)`);
        }

        if (hitDamage > 0 && target.statusEffects?.some(e => e.id === 'sleep' && e.duration > 0)) {
            this.statusEngine.removeStatus(target, 'sleep');
            console.log(`[STATUS] ${target.name} woke up from damage!`);
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
                            console.log(`[COUNTER] ${target.name} counters ${actor.name} with ${counterSkill.name}!`);
                            this.applySkillEffects(counterSkill, target, actor);
                            if (counterSkill.effects?.some(e => e.type === 'damage')) {
                                const counterDamage = this.calculateDamage(target, counterSkill, actor, false, 1);
                                actor.currentHP -= counterDamage;
                                if (actor.currentHP <= 0) { actor.currentHP = 0; actor.defeated = true; }
                                console.log(`[COUNTER] ${counterSkill.name} dealt ${counterDamage} to ${actor.name}`);
                            }
                            this.statusEngine.removeStatus(target, 'counter_ready');
                        }
                    }
                }
            }
        }

        this.applySkillEffects(skill, actor, target, null, players);
        this.triggerWeaponProcs(actor, target, skillLevel);
        this.triggerStatusProcs(actor, target, skillLevel);

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
    if (actor.equipment?.mainHand && this.gear) {
      weapon = this.gear.find(g => g.id === actor.equipment.mainHand);
    }

    // ===== STEP 1: Calculate Base Skill Damage =====
    const baseDamage = (skill.basePower || 1) * (1 + (skillLevel - 1) * 0.1);
    
    // Stat scaling (ADDITIVE per spec, not multiplicative)
    const scaling = skill.scalingFactors || {};
    let statMultiplier = 0;
    
    if (scaling.conviction) statMultiplier += ((actor.stats?.conviction) || 0) * scaling.conviction / CONSTANTS.STAT_SCALE;
    if (scaling.endurance) statMultiplier += ((actor.stats?.endurance) || 0) * scaling.endurance / CONSTANTS.STAT_SCALE;
    if (scaling.ambition) statMultiplier += ((actor.stats?.ambition) || 0) * scaling.ambition / CONSTANTS.STAT_SCALE;
    if (scaling.harmony) statMultiplier += ((actor.stats?.harmony) || 0) * scaling.harmony / CONSTANTS.STAT_SCALE;
    
    const skillDamage = baseDamage * (1 + statMultiplier);
    
    // ===== CHECK: Skip weapon damage for healing skills =====
    const isHealingSkill = skill.category === 'HEALING' || skill.effects?.some(e => e.type === 'heal');
    
    // ===== STEP 2: Collect Weapon Damage & Type =====
    let weaponTotalDamage = 0;
    const weaponDamageBreakdown = {}; // { "Physical": 28, "Holy": 15 }
    let weaponType = null;

    if (!isHealingSkill && weapon) {
      // Use the pre-fetched weapon
      weaponType = weapon.type ? weapon.type.toLowerCase() : null;
      
      if (weapon.dmg1) { 
        weaponTotalDamage += weapon.dmg1; 
        weaponDamageBreakdown[weapon.dmg_type_1] = (weaponDamageBreakdown[weapon.dmg_type_1] || 0) + weapon.dmg1; 
      }
      if (weapon.dmg2) { 
        weaponTotalDamage += weapon.dmg2; 
        weaponDamageBreakdown[weapon.dmg_type_2] = (weaponDamageBreakdown[weapon.dmg_type_2] || 0) + weapon.dmg2; 
      }
      if (weapon.dmg3) { 
        weaponTotalDamage += weapon.dmg3; 
        weaponDamageBreakdown[weapon.dmg_type_3] = (weaponDamageBreakdown[weapon.dmg_type_3] || 0) + weapon.dmg3; 
      }
      if (weapon.dmg4) { 
        weaponTotalDamage += weapon.dmg4; 
        weaponDamageBreakdown[weapon.dmg_type_4] = (weaponDamageBreakdown[weapon.dmg_type_4] || 0) + weapon.dmg4; 
      }
    }

    // ===== STEP 3: Total Damage = Skill + Weapon =====
    let totalDamage = skillDamage + weaponTotalDamage;
    
    // ===== STEP 4: Apply Dynamic Weapon Variance (NEW) =====
    // Only apply variance to physical attacks with a known weapon type
    if (!isHealingSkill && weaponTotalDamage > 0 && weaponType) {
      // Look up the profile generated in the constructor based on item.type
      const profile = this.weaponVarianceProfiles[weaponType] || this.weaponVarianceProfiles['default'];
      
      if (profile) {
        const [minVar, maxVar] = profile;
        // Calculate random multiplier within the range [min, max]
        const varianceMultiplier = minVar + (Math.random() * (maxVar - minVar));
        
        // Apply variance to the TOTAL damage (Skill + Weapon) to simulate swing consistency
        totalDamage *= varianceMultiplier;
        
        // Debug Log: Now 'weapon' is defined in scope!
        console.log(`[VARIANCE DEBUG] Weapon: ${weapon.name} (${weaponType}), Roll: ${varianceMultiplier.toFixed(2)}x, Range: [${minVar}, ${maxVar}]`);
      }
    }

    // ===== STEP 5: Split Damage by Type (Proportional to Weapon) =====
    let finalDamage = 0;
    const damageBreakdown = []; // For debugging

    // If weapon has damage types, split proportionally
    if (weaponTotalDamage > 0 && Object.keys(weaponDamageBreakdown).length > 0) {
      // Flat armor reduction — subtract armorValue directly from total damage before splitting.
      // armorValue comes from equipped armor items (head + chest + etc.), not a percentage roll.
      const armorReduction = target.armorValue || 0;
      const damageAfterArmor = Math.max(0, totalDamage - armorReduction);

      for (const [damageType, typeDamage] of Object.entries(weaponDamageBreakdown)) {
        // Calculate proportion of this damage type relative to original weapon dmg
        const proportion = typeDamage / weaponTotalDamage;

        // Split the armor-reduced total damage by proportion
        let typeDamagePortion = damageAfterArmor * proportion;

        // Apply resistance for this specific damage type
        if (target.resistances && target.resistances[damageType]) {
          const resistance = target.resistances[damageType] || 0;
          typeDamagePortion = typeDamagePortion * (1 - resistance);
        }

        damageBreakdown.push(`${damageType}:${typeDamagePortion.toFixed(2)}`);
        finalDamage += typeDamagePortion;
      }
    } 
    // No weapon damage types - apply defense/resistance to total
    else {
      // Flat armor reduction for no-weapon-type damage
      const armorReduction = target.armorValue || 0;
      finalDamage = Math.max(0, totalDamage - armorReduction);
      // Check skill effect for damage type resistance
      if (skill.effects?.[0]?.damageType && target.resistances) {
        const resistance = target.resistances[skill.effects[0].damageType] || 0;
        finalDamage = finalDamage * (1 - resistance);
      }
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
    console.log(`[DAMAGE] ${actor.name} → ${target.name}: ${totalDamage.toFixed(2)} total (after variance) = ${flooredDamage} after resistances/defense [${damageBreakdown.join(', ')}]`);
    
    return flooredDamage;
  }

  applySkillEffects(skill, actor, target, healTarget = null, allPlayers = null) {
    if (!skill.effects || skill.effects.length === 0) return;
    skill.effects.forEach(effect => {
        const applyChance = effect.chance !== undefined ? effect.chance : 1.0;
        const rolled = Math.random();
        const success = rolled <= applyChance;
        if (!success) {
            console.log(`[EFFECT] ${skill.name}: ${effect.type} FAILED to apply (chance=${applyChance}, rolled=${rolled.toFixed(3)})`);
            return; 
        }

        const isHeal = (effect.type === 'heal');
        const isRestoreResource = (effect.type === 'restore_resource');
        const isRestorePool = (effect.type === 'restore_pool');

        if (isHeal || isRestoreResource || isRestorePool) {
            let poolType = '';
            let recipient = actor;

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
            else if (actor.stats) statValue = actor.stats[scaleStat] || 0;

            let maxPoolValue = 0;
            let currentPoolValue = 0;

            if (poolType === 'hp') { maxPoolValue = recipient.maxHP; currentPoolValue = recipient.currentHP; }
            else if (poolType === 'stamina') { maxPoolValue = recipient.maxStamina; currentPoolValue = recipient.currentStamina; }
            else if (poolType === 'mana') { maxPoolValue = recipient.maxMana; currentPoolValue = recipient.currentMana; }
            else {
                console.warn(`[EFFECT] ${skill.name}: Unknown pool type '${poolType}'`);
                return;
            }

            const scaleMultiplier = 1 + (statValue / CONSTANTS.STAT_SCALE);
            const restoreAmount = Math.floor(maxPoolValue * effect.magnitude * scaleMultiplier);

            const oldValue = currentPoolValue;
            const newValue = Math.min(maxPoolValue, currentPoolValue + restoreAmount);
            const actualRestored = newValue - oldValue;

            if (poolType === 'hp') recipient.currentHP = newValue;
            else if (poolType === 'stamina') recipient.currentStamina = newValue;
            else if (poolType === 'mana') recipient.currentMana = newValue;

            console.log(`[EFFECT] ${skill.name}: Restored ${actualRestored} ${poolType.toUpperCase()} to ${recipient.name} (Scaled by ${scaleStat}:${statValue})`);
            return;
        }

        if (effect.type === 'apply_debuff' && effect.debuff) {
            let debuffTarget = target;
            if (effect.targets === 'self') debuffTarget = actor;
            if (debuffTarget) {
                this.statusEngine.applyStatus(debuffTarget, effect.debuff, effect.duration, effect.magnitude || 1);
                console.log(`[EFFECT] ${skill.name}: ${effect.debuff} applied to ${debuffTarget.name}`);
            }
        } else if (effect.type === 'apply_buff' && effect.buff) {
            let buffTarget = actor;
            if (effect.targets === 'single_ally' && target && target.type === 'player') buffTarget = target;
            if (effect.targets === 'all_allies' && allPlayers) {
                const allies = allPlayers.filter(p => !p.defeated);
                allies.forEach(ally => {
                    this.statusEngine.applyStatus(ally, effect.buff, effect.duration, effect.magnitude || 1);
                });
                console.log(`[EFFECT] ${skill.name}: ${effect.buff} applied by ${actor.name} to all allies (${allies.map(a => a.name).join(', ')})`);
                return;
            } else if (effect.targets === 'all_allies') {
                console.log(`[EFFECT] ${skill.name}: AOE buff ${effect.buff} (no allPlayers context — self only)`);
            }
            this.statusEngine.applyStatus(buffTarget, effect.buff, effect.duration, effect.magnitude || 1);
            console.log(`[EFFECT] ${skill.name}: ${effect.buff} applied to ${buffTarget.name}`);
        } else if (effect.type === 'damage' && effect.damageType) {
            console.log(`[EFFECT] ${skill.name}: Damage effect (${effect.damageType}) processed in calculateDamage()`);

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
                console.log(`[EFFECT] ${skill.name}: Cleansed ${s.name} from ${cleanseTarget.name}`);
            });
            if (removed.length === 0) {
                console.log(`[EFFECT] ${skill.name}: Nothing to cleanse on ${cleanseTarget.name}`);
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
                console.log(`[EFFECT] ${skill.name}: Dispelled ${s.name} from ${dispelTarget.name}`);
            });
            if (removed.length === 0) {
                console.log(`[EFFECT] ${skill.name}: Nothing to dispel on ${dispelTarget.name}`);
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
        const initiative = baseInitiative + randomComponent;
        console.log(`[INITIATIVE] ${p.name}: Ambition=${p.stats?.ambition || 0}, Conviction=${p.stats?.conviction || 0}, Base=${baseInitiative.toFixed(1)}, Random=${randomComponent.toFixed(1)}, Total=${initiative.toFixed(1)}`);
        combatants.push({ ...p, initiative });
    });
    enemies.forEach(e => {
        const baseInitiative = (((e.stats?.ambition) || 0) * 0.5) + (((e.stats?.conviction) || 0) * 0.15);
        const randomComponent = Math.random() * 40;
        const initiative = baseInitiative + randomComponent;
        console.log(`[INITIATIVE] ${e.name}: Ambition=${e.stats?.ambition || 0}, Conviction=${e.stats?.conviction || 0}, Base=${baseInitiative.toFixed(1)}, Random=${randomComponent.toFixed(1)}, Total=${initiative.toFixed(1)}`);
        combatants.push({ ...e, initiative });
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
        console.log(`✅ [SPAWN] Spawning ${spawnCount}x ${enemyType.name} (Lvl ${enemyLevel})...`);

        for (let i = 0; i < spawnCount; i++) {
            globalEnemyIndex++;
            const selectedSkills = this.selectRandomSkills(enemyType.availableSkills, enemyType.skillSelectionCount);
            let equipment = { mainHand: null, chest: null, offHand: null };
            
            if (enemyType.equipment && Array.isArray(enemyType.equipment)) {
                const weapon = enemyType.equipment.map(itemId => this.gear.find(g => g.id === itemId)).find(item => item && (item.slot_id1 === 'mainHand' || item.type.includes('weapon') || item.dmg1));
                if (weapon) {
                    equipment.mainHand = weapon.id;
                    if (i === 0) console.log(`[EQUIP] ${enemyType.name} (Lvl ${enemyLevel}) equipped ${weapon.name}`);
                }
                const armor = enemyType.equipment.map(itemId => this.gear.find(g => g.id === itemId)).find(item => item && (item.slot_id1 === 'chest' || item.armor));
                if (armor) equipment.chest = armor.id;
            }

            const maxHP = this.calculateMaxHP(enemyType.stats, enemyLevel, false);
            const maxMana = this.calculateMaxMana(enemyType.stats, enemyLevel, false);
            const maxStamina = this.calculateMaxStamina(enemyType.stats, enemyLevel, false);

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
                stats: { ...enemyType.stats },
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
    console.log(`[SPAWN] Total enemies spawned: ${enemies.length}`);
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
    const BASE_HP = isPlayer ? 50 : 18;
    const GROWTH_FACTOR = 1.12;
    const scaledBase = BASE_HP * Math.pow(GROWTH_FACTOR, level - 1);
    const statMultiplier = 1 + (stats?.endurance || 0) / 300;
    return Math.floor(scaledBase * statMultiplier);
  }

  calculateMaxMana(stats, level, isPlayer = false) {
    const BASE_MANA = isPlayer ? 80 : 40; 
    const GROWTH_FACTOR = 1.10; 
    const scaledBase = BASE_MANA * Math.pow(GROWTH_FACTOR, level - 1);
    const statBlend = ((stats?.harmony || 0) * 0.7 + (stats?.endurance || 0) * 0.3);
    const statMultiplier = 1 + statBlend / 300;
    return Math.floor(scaledBase * statMultiplier);
  }

  calculateMaxStamina(stats, level, isPlayer = false) {
    const BASE_STAMINA = isPlayer ? 80 : 40; 
    const GROWTH_FACTOR = 1.10; 
    const scaledBase = BASE_STAMINA * Math.pow(GROWTH_FACTOR, level - 1);
    const statBlend = ((stats?.endurance || 0) * 0.7 + (stats?.conviction || 0) * 0.3);
    const statMultiplier = 1 + statBlend / 300;
    return Math.floor(scaledBase * statMultiplier);
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
            stats.challengeCompletions[challenge.id] = { completed: true, completions: 0, bestTime: null, totalTime: 0 };
        }
        stats.challengeCompletions[challenge.id].completions = stats.challengeCompletions[challenge.id].completions + 1;
        stats.challengeCompletions[challenge.id].totalTime = stats.challengeCompletions[challenge.id].totalTime + combatResult.totalTurns;
        const currentBest = stats.challengeCompletions[challenge.id].bestTime;
        if (!currentBest || combatResult.totalTurns < currentBest) {
            stats.challengeCompletions[challenge.id].bestTime = combatResult.totalTurns;
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

module.exports = CombatEngine;