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

      return {
        id: snapshot.characterID,
        name: snapshot.characterName,
        type: 'player',
        stats,
        level,
        maxHP: this.calculateMaxHP(stats, level, true),
        currentHP: this.calculateMaxHP(stats, level, true),
        maxMana: this.calculateMaxMana(stats, level, true),
        currentMana: this.calculateMaxMana(stats, level, true),
        maxStamina: this.calculateMaxStamina(stats, level, true),
        currentStamina: this.calculateMaxStamina(stats, level, true),
        skills,
        consumables: snapshot.consumables || {},
        equipment: snapshot.equipment || [],
        // Augmented skill pool: equipped skills + active consumable belt skills.
        // Consumable belt skills are available as long as quantity > 0.
        // This is recalculated each turn via getAugmentedSkillPool().
        defeated: false,
        index: idx,
        statusEffects: []
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
            const action = this.selectPlayerAction(playerChar, playerCharacters, enemies);
            const turnResult = this.resolveAction(action, playerChar, playerCharacters, enemies);
            
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
            
            const action = this.selectEnemyAction(enemy, playerCharacters, enemies);
            
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

        playerCharacters.forEach(p => this.regenerateResources(p));
        enemies.forEach(e => this.regenerateResources(e));

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
                result: { message: msg, success: true, delay: 500 }
              });
            });
          }
          if (statusResults.healed > 0) {
            combatant.currentHP = Math.min(combatant.maxHP, combatant.currentHP + statusResults.healed);
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
  selectPlayerAction(character, players, enemies) {
    const aliveEnemies = enemies.filter(e => !e.defeated);
    
    if (aliveEnemies.length === 0) {
        return { type: 'attack', target: null };
    }

    // Priority 1: Emergency heal if critical
    if (character.currentHP <= character.maxHP * 0.3) {
        const healSkill = this.getAvailableSkillByCategory(character, 'HEALING');
        if (healSkill) {
            const action = { type: 'skill', skillID: healSkill.id, target: character.id };
            return this.checkChildSkillProc(character, action, players, enemies);
        }
    }

    // Priority 2: Heal low HP ally
    const lowHPAlly = players.find(p => !p.defeated && p.id !== character.id && p.currentHP <= p.maxHP * 0.5);
    if (lowHPAlly) {
        const healSkill = this.getAvailableSkillByCategory(character, 'HEALING');
        if (healSkill) {
            const action = { type: 'skill', skillID: healSkill.id, target: lowHPAlly.id };
            return this.checkChildSkillProc(character, action, players, enemies);
        }
    }

    // Priority 3: AOE damage if 3+ enemies
    if (aliveEnemies.length >= 3) {
        const aoeSkill = this.getAvailableSkillByCategory(character, 'DAMAGE_AOE');
        if (aoeSkill) {
            const action = { type: 'skill', skillID: aoeSkill.id, target: null };
            return this.checkChildSkillProc(character, action, players, enemies);
        }
    }

    // Priority 4: Single-target damage (highest power available)
    const damageSkill = this.getBestAvailableSkill(character, skill => 
        skill.category && skill.category.includes('DAMAGE_SINGLE') && this.hasResources(character, skill)
    );
    if (damageSkill) {
        const lowestHPEnemy = aliveEnemies.reduce((min, e) => e.currentHP < min.currentHP ? e : min);
        const action = { type: 'skill', skillID: damageSkill.id, target: lowestHPEnemy.id };
        return this.checkChildSkillProc(character, action, players, enemies);
    }

    // Priority 5: Any damage skill
    const anyDamage = this.getBestAvailableSkill(character, skill => 
        skill.category && skill.category.includes('DAMAGE') && this.hasResources(character, skill)
    );
    if (anyDamage) {
        const lowestHPEnemy = aliveEnemies.reduce((min, e) => e.currentHP < min.currentHP ? e : min);
        const action = { type: 'skill', skillID: anyDamage.id, target: lowestHPEnemy.id };
        return this.checkChildSkillProc(character, action, players, enemies);
    }

    // NEW LOGIC: NO RESOURCES FALLBACK
    const desperationPool = this.skills.filter(s => s.category === 'NO_RESOURCES');

    if (desperationPool.length > 0) {
        const randomIndex = Math.floor(Math.random() * desperationPool.length);
        const chosenSkill = desperationPool[randomIndex];

        console.log(`[DESPERATION] ${character.name} ${character.id} is out of resources! Randomly selected: ${chosenSkill.name}`);

        let targetId = null;
        const isSelfish = chosenSkill.effects?.some(e => 
            e.type === 'restore_resource' || 
            (e.type === 'apply_buff' && e.targets === 'self') ||
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
  selectEnemyAction(enemy, players, enemies) {
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

    // Priority 1: Emergency heal if critical
    if (enemy.currentHP <= enemy.maxHP * 0.3) {
        const healSkill = this.getEnemySkillByCategory(enemy.skills, 'HEALING');
        if (healSkill) {
            return { type: 'skill', skillID: healSkill.id, target: enemy.id };
        }
    }

    // Priority 2: AOE if multiple players
    if (alivePlayers.length >= 3) {
        const aoeSkill = this.getEnemySkillByCategory(enemy.skills, 'DAMAGE_AOE');
        if (aoeSkill) {
            return { type: 'skill', skillID: aoeSkill.id, target: null };
        }
    }

    // Priority 3: Strongest damage skill available
    const bestSkill = enemy.skills
        .map(skillID => this.skills.find(s => s.id === skillID))
        .filter(s => s && s.category && s.category.includes('DAMAGE') && this.hasResources(enemy, s))
        .sort((a, b) => (b.basePower || 0) - (a.basePower || 0))[0];

    if (bestSkill) {
        const target = alivePlayers.reduce((min, p) => p.currentHP < min.currentHP ? p : min);
        return { type: 'skill', skillID: bestSkill.id, target: target.id };
    }

    // NEW LOGIC: NO RESOURCES FALLBACK (Enemies)
    const desperationPool = this.skills.filter(s => s.category === 'NO_RESOURCES');

    if (desperationPool.length > 0) {
        const randomIndex = Math.floor(Math.random() * desperationPool.length);
        const chosenSkill = desperationPool[randomIndex];

        console.log(`[DESPERATION] ${enemy.name} ${enemy.id} is out of resources! Randomly selected: ${chosenSkill.name}`);

        let targetId = null;
        const isSelfish = chosenSkill.effects?.some(e => 
            e.type === 'restore_resource' || 
            (e.type === 'apply_buff' && e.targets === 'self') ||
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

        if (procSkill.effects?.some(e => e.type === 'damage' || e.type === 'apply_debuff')) {
            const procDamage = this.calculateDamage(actor, procSkill, target, false, skillLevel);
            target.currentHP -= procDamage;
            console.log(`[PROC] ${procSkill.name} dealt ${procDamage} damage to ${target.name}`);
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

    // Weapon Delay Modification
    const weapon = actor.equipment?.mainHand ? this.gear.find(g => g.id === actor.equipment.mainHand) : null;
    const delayMultiplier = weapon?.delay ? (weapon.delay === 1 ? 0.8 : weapon.delay === 3 ? 1.2 : 1.0) : 1.0;
    const finalDelay = skill.delay * delayMultiplier;
    console.log(`[DELAY] ${actor.name} ${skill.name}: base=${skill.delay}ms, weapon=${weapon?.delay || 'none'}, final=${finalDelay}ms`);

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

    // Handle AOE skills
    if (skill.category && skill.category.includes('AOE')) {
        const aliveEnemies = enemies.filter(e => !e.defeated);
        if (aliveEnemies.length === 0) {
            return { roll: null, result: { message: 'No targets found', success: false, delay: finalDelay } };
        }

        const hitChance = this.calculateHitChance(actor, skill, null, skillLevel);
        const rolled = Math.random();
        const hit = rolled <= hitChance;

        if (!hit) {
            return {
                roll: { hitChance, rolled, hit: false, crit: false },
                result: { message: `${actor.name}'s ${skill.name} misses all targets!`, damageDealt: 0, targets: [], success: false, delay: finalDelay }
            };
        }

        const isCrit = Math.random() <= this.calculateCritChance(actor, skill);
        let totalDamage = 0;
        const targets = [];

        aliveEnemies.forEach(enemy => {
            let hitDamage = 0;
            for (let i = 0; i < hitCount; i++) {
                const damage = this.calculateDamage(actor, skill, enemy, isCrit, skillLevel);
                hitDamage += damage;
            }
            totalDamage += hitDamage;
            enemy.currentHP -= hitDamage;
            if (enemy.currentHP <= 0) {
                enemy.currentHP = 0;
                enemy.defeated = true;
                console.log(`[DEBUG] ${enemy.name} defeated! (HP: 0)`);
            }
            this.applySkillEffects(skill, actor, enemy);
            this.triggerWeaponProcs(actor, enemy, skillLevel);
            targets.push({ targetId: enemy.id, targetName: enemy.name, damage: hitDamage, hpAfter: Math.max(0, enemy.currentHP) });
        });

        return {
            roll: { hitChance, rolled, hit: true, crit: isCrit, hitCount },
            result: {
                message: isCrit ? `${actor.name} critically hits ${targets.length} targets with ${skill.name} for ${totalDamage} total damage!` : `${actor.name} hits ${targets.length} targets with ${skill.name} for ${totalDamage} total damage.`,
                damageDealt: totalDamage, targets, success: true, delay: finalDelay
            }
        };
    }

    // Handle single-target skills
    const target = players.concat(enemies).find(t => t.id === action.target);
    if (!target) {
        return { roll: null, result: { message: 'Target not found', success: false, delay: finalDelay } };
    }

    const hitChance = this.calculateHitChance(actor, skill, target, skillLevel);
    const rolled = Math.random();
    const hit = rolled <= hitChance;

    if (!hit) {
        return {
            roll: { hitChance, rolled, hit: false, crit: false },
            result: { message: `${actor.name}'s ${skill.name} misses ${target.name}!`, damageDealt: 0, targetId: target.id, targetHPAfter: target.currentHP, success: false, delay: finalDelay }
        };
    }

    const isCrit = Math.random() <= this.calculateCritChance(actor, skill);
    let totalDamage = 0;
    for (let i = 0; i < hitCount; i++) {
        const damage = this.calculateDamage(actor, skill, target, isCrit, skillLevel);
        totalDamage += damage;
    }

    target.currentHP -= totalDamage;
    if (target.currentHP <= 0) {
        target.currentHP = 0;
        target.defeated = true;
        console.log(`[DEBUG] ${target.name} defeated! (HP: 0)`);
    }
    this.applySkillEffects(skill, actor, target);
    this.triggerWeaponProcs(actor, target, skillLevel);

    return {
        roll: { hitChance, rolled, hit: true, crit: isCrit, hitCount },
        result: {
            message: isCrit ? `${actor.name} critically hits ${target.name} with ${skill.name} for ${totalDamage} damage!` : `${actor.name} hits ${target.name} with ${skill.name} for ${totalDamage} damage.`,
            damageDealt: totalDamage, targetId: target.id, targetHPAfter: Math.max(0, target.currentHP), success: true, delay: finalDelay
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
      // Roll defense ONCE for the entire attack (not per type)
      let defenseMultiplier = 1.0;
      if (target.maxDefense) {
        const defense = Math.random() * target.maxDefense;
        defenseMultiplier = (1 - defense / 100);
      }

      for (const [damageType, typeDamage] of Object.entries(weaponDamageBreakdown)) {
        // Calculate proportion of this damage type relative to original weapon dmg
        const proportion = typeDamage / weaponTotalDamage;

        // Split the VARIANCE-ADJUSTED total damage by this proportion
        let typeDamagePortion = totalDamage * proportion;

        // Apply defense (same roll for all types)
        typeDamagePortion = typeDamagePortion * defenseMultiplier;

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
      finalDamage = totalDamage;
      if (target.maxDefense) {
        const defense = Math.random() * target.maxDefense;
        finalDamage = finalDamage * (1 - defense / 100);
      }
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

  applySkillEffects(skill, actor, target, healTarget = null) {
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
            if (effect.targets === 'all_allies') {
                console.log(`[EFFECT] ${skill.name}: AOE buff ${effect.buff} (Single target resolution)`);
            }
            this.statusEngine.applyStatus(buffTarget, effect.buff, effect.duration, effect.magnitude || 1);
            console.log(`[EFFECT] ${skill.name}: ${effect.buff} applied to ${buffTarget.name}`);
        } else if (effect.type === 'damage' && effect.damageType) {
            console.log(`[EFFECT] ${skill.name}: Damage effect (${effect.damageType}) processed in calculateDamage()`);
        }
    });
  }

  calculateHitChance(actor, skill, target, skillLevel) {
    let hitChance = skill.baseHitChance || CONSTANTS.BASE_HIT_CHANCE;
    hitChance += (actor.stats.conviction || 0) * 0.1;
    hitChance += skillLevel * 0.02;
    hitChance -= (target.maxDefense || 0) * 0.05;
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
    if (skill.costType === 'stamina') return actor.currentStamina >= skill.costAmount;
    if (skill.costType === 'mana') return actor.currentMana >= skill.costAmount;
    return true;
  }

  regenerateResources(combatant) {
    const staminaRegen = Math.floor(combatant.maxStamina * 0.02);
    const manaRegen = Math.floor(combatant.maxMana * 0.02);
    combatant.currentStamina = Math.min(combatant.maxStamina, combatant.currentStamina + staminaRegen);
    combatant.currentMana = Math.min(combatant.maxMana, combatant.currentMana + manaRegen);
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
                maxDefense: enemyType.baseDefense,
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
    const shuffled = [...availableSkillIDs].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
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
        
        if (turn.result?.damageDealt > 0) {
            if (turn.result?.targetName === character.name) damageTaken += turn.result.damageDealt;
            else if (Array.isArray(turn.result?.targets)) {
                const targetEntry = turn.result.targets.find(t => t.targetName === character.name);
                if (targetEntry?.damage) damageTaken += targetEntry.damage;
            } else if (turn.result?.targetId && (turn.result.targetId.startsWith('char_') || turn.result.targetId.startsWith('import_'))) {
                damageTaken += turn.result.damageDealt;
            }
        }
        
        if (turn.actorName === character.name && turn.result?.healingDone > 0) healingDone += turn.result.healingDone;
        if (turn.actorName === character.name && turn.roll?.crit === true) stats.totalCriticalHits = stats.totalCriticalHits + 1;
        
        if (turn.actorName === character.name && turn.result?.success && turn.result?.damageDealt > 0) {
            const targetId = turn.result.targetId || (turn.result.targets?.[0]?.targetId);
            if (targetId && targetId.startsWith('enemy_')) {
                const enemyType = targetId.split('_').slice(1, -1).join('_');
                enemyKillsThisCombat[enemyType] = (enemyKillsThisCombat[enemyType] || 0) + 1;
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