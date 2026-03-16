// combat-log.js
// Handles combat log display with metered playback and rewards
// UPDATED: Float XP System, Category-Based Balancing, Pre-Combat Skill Tracking, Crash Protection

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function displayCombatLog(combatData) {
    // --- STEP 1: SAFETY CHECKS (Data) ---
    console.log('[COMBAT] displayCombatLog called');
    
    if (!combatData) {
        console.error('[COMBAT] FATAL: combatData is null/undefined!');
        showError('Combat data is missing. Cannot display log.');
        return;
    }

    if (!combatData.participants) {
        console.error('[COMBAT] FATAL: combatData.participants is missing!', combatData);
        showError('Invalid combat data structure.');
        return;
    }

    if (!window.gameData) {
        console.warn('[COMBAT] window.gameData is not ready yet. Skill XP may default.');
    }

    // --- STEP 2: SELECT DOM ELEMENTS (BEFORE USING THEM!) ---
    // This fixes the "logDisplay is not defined" crash
    const partyStatus = document.getElementById('partyStatus');
    const enemyStatus = document.getElementById('enemyStatus');
    const logDisplay = document.getElementById('combatLogDisplay');
    const resultDisplay = document.getElementById('combatResult');

    // --- STEP 3: VERIFY ELEMENTS EXIST ---
    if (!partyStatus || !enemyStatus || !logDisplay || !resultDisplay) {
        console.error('[COMBAT] Combat log elements not found in DOM!');
        console.error('Missing:', {
            partyStatus: !!partyStatus,
            enemyStatus: !!enemyStatus,
            logDisplay: !!logDisplay,
            resultDisplay: !!resultDisplay
        });
        showError('UI Error: Combat display elements missing. Check index.html IDs.');
        return;
    }

    // --- STEP 4: INITIALIZE UI (Safe to use variables now) ---
    partyStatus.innerHTML = '';
    enemyStatus.innerHTML = '';
    logDisplay.innerHTML = '';

    // Setup HP Tracking
    const hpMaxes = {};
    const hpCurrent = {};
    
    combatData.participants.playerCharacters.forEach(pc => {
        hpMaxes[pc.characterID] = pc.maxHP;
        hpCurrent[pc.characterID] = pc.maxHP;
    });
    
    combatData.participants.enemies.forEach(e => {
        hpMaxes[e.enemyID] = e.maxHP;
        hpCurrent[e.enemyID] = e.maxHP;
    });

    // Render Initial Party Bars
    combatData.participants.playerCharacters.forEach(pc => {
        const div = document.createElement('div');
        div.className = 'combatant';
        div.id = `party-${pc.characterID}`;
        div.innerHTML = `
            <div class="combatant-name">${pc.characterName}</div>
            <div class="combatant-hp">HP: <span class="hp-value">${pc.maxHP}</span> / ${pc.maxHP}</div>
            <div class="health-bar"><div class="health-bar-fill" style="width: 100%"></div><div class="health-bar-text">100%</div></div>
            <div class="combatant-mana">Mana: <span class="mana-value">${pc.maxMana || 0}</span> / ${pc.maxMana || 0}</div>
            <div class="mana-bar" style="background: #1a1a2e; border: 1px solid #0f3460; height: 12px; margin: 2px 0;"><div class="mana-bar-fill" style="background: linear-gradient(90deg, #00d4ff, #0084d1); width: 100%; height: 100%;"></div></div>
            <div class="combatant-stamina">Stamina: <span class="stamina-value">${pc.maxStamina || 0}</span> / ${pc.maxStamina || 0}</div>
            <div class="stamina-bar" style="background: #1a1a2e; border: 1px solid #0f3460; height: 12px; margin: 2px 0;"><div class="stamina-bar-fill" style="background: linear-gradient(90deg, #ffd700, #ff8c00); width: 100%; height: 100%;"></div></div>
        `;
        partyStatus.appendChild(div);
    });

    const renderEnemies = (enemies) => {
        enemyStatus.innerHTML = '';
        enemies.forEach(e => {
            const div = document.createElement('div');
            div.className = 'combatant';
            div.id = `enemy-${e.enemyID}`;
            div.innerHTML = `
                <div class="combatant-name">${e.enemyName}</div>
                <div class="combatant-hp">HP: <span class="hp-value">${e.maxHP}</span> / ${e.maxHP}</div>
                <div class="health-bar"><div class="health-bar-fill" style="width: 100%"></div><div class="health-bar-text">100%</div></div>
            `;
            enemyStatus.appendChild(div);
        });
    };

    if (combatData.participants.enemies.length > 0) {
        renderEnemies(combatData.participants.enemies);
    }

    const hasSegments = combatData.segments && Array.isArray(combatData.segments) && combatData.segments.length > 0;
    const DEFAULT_DELAY = 1000;
    let overallResult = 'draw';

    if (hasSegments) {
        console.log(`[COMBAT] Playing ${combatData.segments.length} stages (Multi-Stage Mode)...`);
        
        for (const segment of combatData.segments) {
            console.log(`[STAGE] Playing Segment ${segment.stageId}: ${segment.title}`);

            // 1. Intro Narrative
            const introEl = document.createElement('div');
            introEl.className = 'combat-turn narrative-turn';
            introEl.innerHTML = `
                <div class="turn-header" style="color: #ffd700; font-weight: bold;">${segment.title}</div>
                <div class="turn-message" style="font-style: italic; color: #ccc;">${segment.introText}</div>
            `;
            logDisplay.appendChild(introEl);
            logDisplay.scrollTop = logDisplay.scrollHeight;
            await sleep(4000); 

            // 2. Update Enemies
            if (segment.participantsSnapshot && segment.participantsSnapshot.enemies.length > 0) {
                renderEnemies(segment.participantsSnapshot.enemies);
            }

            // 3. Play Turns
            for (let i = 0; i < segment.turns.length; i++) {
                const turn = segment.turns[i];
                const turnDelay = turn.result?.delay || DEFAULT_DELAY;

                renderTurn(turn, logDisplay, hpMaxes, hpCurrent);
                updateHealthBars(turn, hpMaxes, hpCurrent);

                if (turn.playerResourceStates) {
                    updateResourceBars(turn.playerResourceStates);
                }
                await sleep(turnDelay);
            }

            // 4. Stage Summary
            const summaryEl = document.createElement('div');
            summaryEl.className = 'combat-turn summary-turn';
            summaryEl.innerHTML = `
                <div class="turn-header" style="color: #aaa;">Stage Complete</div>
                <div class="turn-message" style="color: #fff; border-left: 3px solid ${segment.status === 'victory' ? '#4caf50' : '#f44336'}; padding-left: 10px;">${segment.summaryText}</div>
            `;
            logDisplay.appendChild(summaryEl);
            logDisplay.scrollTop = logDisplay.scrollHeight;

            if (segment.status === 'defeat' || segment.status === 'loss') {
                overallResult = 'loss';
                break; 
            } else if (segment.status === 'retreat') {
                overallResult = 'retreated';
                break;
            }

            if (segment !== combatData.segments[combatData.segments.length - 1] && overallResult === 'victory') {
                await sleep(2000);
            }
        }
    } else {
        // Legacy Fallback
        const turns = combatData.turns || [];
        for (let i = 0; i < turns.length; i++) {
            const turn = turns[i];
            const turnDelay = turn.result?.delay || DEFAULT_DELAY;
            renderTurn(turn, logDisplay, hpMaxes, hpCurrent);
            updateHealthBars(turn, hpMaxes, hpCurrent);
            if (turn.playerResourceStates) updateResourceBars(turn.playerResourceStates);
            await sleep(turnDelay);
        }
        overallResult = combatData.result;
    }

    const finalResult = overallResult !== 'draw' ? overallResult : combatData.result;
    displayCombatResult({ ...combatData, result: finalResult }, resultDisplay);
    await sleep(1500);

    if (finalResult === 'victory') {
        await applyCombatRewards(combatData);
    } else if (finalResult === 'loss' || finalResult === 'defeat') {
        showError('Defeat! No rewards earned.');
    } else if (finalResult === 'retreated') {
        showSuccess('Successfully retreated. No rewards, but characters are safe.');
    }
}

function renderTurn(turn, logDisplay, hpMaxes, hpCurrent) {
    const turnEl = document.createElement('div');
    turnEl.className = 'combat-turn';

    // Handle Pre-Combat Narrative Skills specifically
    if (turn.action?.type === 'pre_combat_skill' || turn.action?.type === 'pre_combat_fallback') {
        turnEl.classList.add('narrative-turn');
        const icon = turn.result?.success ? '✅' : '❌';
        const actionName = turn.action.name || turn.action.skillID;
        turnEl.innerHTML = `
            <div class="turn-header">${icon} ${turn.actorName} uses ${actionName}</div>
            <div class="turn-message">${turn.result?.message}</div>
        `;
        logDisplay.appendChild(turnEl);
        logDisplay.scrollTop = logDisplay.scrollHeight;
        return;
    }

    // Handle AOE skills
    if (turn.result?.targets && turn.result.targets.length > 0) {
        turn.result.targets.forEach(targetInfo => {
            const subEl = document.createElement('div');
            subEl.className = 'combat-turn';
            const isCrit = turn.roll?.crit;
            const msg = isCrit
                ? `${turn.actorName} critically hits ${targetInfo.targetName} for ${targetInfo.damage} damage!`
                : `${turn.actorName} hits ${targetInfo.targetName} for ${targetInfo.damage} damage.`;
            
            subEl.innerHTML = `
                <div class="turn-header">Turn ${turn.turnNumber}: ${turn.actorName}</div>
                <div class="turn-message ${isCrit ? 'turn-crit' : ''}">${msg}</div>
                ${targetInfo.damage > 0 ? `<div class="turn-damage">Damage: ${targetInfo.damage}</div>` : ''}
            `;
            logDisplay.appendChild(subEl);
        });
        logDisplay.scrollTop = logDisplay.scrollHeight;
        return;
    }

    // Handle Status Effects
    if (turn.action?.type === 'status') {
        turnEl.classList.add('status-turn');
        turnEl.style.fontStyle = 'italic';
        turnEl.style.opacity = '0.8';
        turnEl.innerHTML = `
            <div class="turn-header">Turn ${turn.turnNumber}</div>
            <div class="turn-message">${turn.result?.message || 'Status effect ticks...'}</div>
        `;
        logDisplay.appendChild(turnEl);
        logDisplay.scrollTop = logDisplay.scrollHeight;
        return;
    }

    // Standard Single Target
    const isHit = turn.result?.damageDealt > 0;
    const isCrit = turn.roll?.crit;
    const isMiss = !isHit;

    let messageClass = '';
    if (isCrit) messageClass = 'turn-crit';
    if (isMiss) messageClass = 'turn-miss';

    turnEl.innerHTML = `
        <div class="turn-header">Turn ${turn.turnNumber}: ${turn.actorName}</div>
        <div class="turn-message ${messageClass}">${turn.result?.message || 'Action taken'}</div>
        ${isHit ? `<div class="turn-damage">Damage: ${turn.result.damageDealt}</div>` : ''}
    `;

    logDisplay.appendChild(turnEl);
    logDisplay.scrollTop = logDisplay.scrollHeight;
}

function updateHealthBars(turn, hpMaxes, hpCurrent) {
    if (turn.result?.targets && turn.result.targets.length > 0) {
        turn.result.targets.forEach(targetInfo => {
            updateSingleHealthBar(targetInfo.targetId, targetInfo.hpAfter, hpMaxes, hpCurrent, 'enemy');
        });
    } else if (turn.result?.targetId && turn.result?.damageDealt > 0) {
        const targetId = turn.result.targetId;
        const newHP = turn.result.targetHPAfter;
        let updated = updateSingleHealthBar(targetId, newHP, hpMaxes, hpCurrent, 'enemy');
        if (!updated) updateSingleHealthBar(targetId, newHP, hpMaxes, hpCurrent, 'party');
    }
}

function updateSingleHealthBar(targetId, newHP, hpMaxes, hpCurrent, type) {
    const prefix = type === 'enemy' ? 'enemy' : 'party';
    const el = document.getElementById(`${prefix}-${targetId}`);
    if (el) {
        const maxHP = hpMaxes[targetId] || 100;
        const healthPercent = Math.max(0, (newHP / maxHP) * 100);
        const hpValueEl = el.querySelector('.hp-value');
        const fillEl = el.querySelector('.health-bar-fill');
        const textEl = el.querySelector('.health-bar-text');
        
        if(hpValueEl) hpValueEl.textContent = Math.max(0, newHP);
        if(fillEl) fillEl.style.width = `${healthPercent}%`;
        if(textEl) textEl.textContent = `${Math.max(0, Math.floor(healthPercent))}%`;

        hpCurrent[targetId] = newHP;
        return true;
    }
    return false;
}

function updateResourceBars(resourceStates) {
    resourceStates.forEach(state => {
        const actorEl = document.getElementById(`party-${state.characterID}`);
        if (actorEl) {
            // Stamina
            const staVal = actorEl.querySelector('.stamina-value');
            const staBar = actorEl.querySelector('.stamina-bar-fill');
            const staText = actorEl.querySelector('.combatant-stamina');
            if (staVal && staBar && staText) {
                const max = parseInt(staText.textContent.split(' / ')[1]);
                const pct = Math.max(0, (state.currentStamina / max) * 100);
                staVal.textContent = state.currentStamina;
                staBar.style.width = `${pct}%`;
            }
            // Mana
            const manVal = actorEl.querySelector('.mana-value');
            const manBar = actorEl.querySelector('.mana-bar-fill');
            const manText = actorEl.querySelector('.combatant-mana');
            if (manVal && manBar && manText) {
                const max = parseInt(manText.textContent.split(' / ')[1]);
                const pct = Math.max(0, (state.currentMana / max) * 100);
                manVal.textContent = state.currentMana;
                manBar.style.width = `${pct}%`;
            }
        }
    });
}

function displayCombatResult(combatData, resultDisplay) {
    const resultClass = combatData.result === 'victory' ? 'result-victory' :
                        combatData.result === 'defeat' || combatData.result === 'loss' ? 'result-defeat' :
                        combatData.result === 'retreated' ? 'result-retreat' : 'result-draw';
    
    resultDisplay.innerHTML = `
        <div class="combat-result ${resultClass}" style="text-align:center; padding: 2rem; border: 2px solid #d4af37; background: rgba(0,0,0,0.5);">
            <h2 style="color: ${combatData.result === 'victory' ? '#4cd964' : '#d4484a'}">${combatData.result.toUpperCase()}</h2>
            <p style="font-size: 1.1rem; margin-top: 1rem;">Combat completed in ${combatData.totalTurns} turns</p>
        </div>
    `;
}

async function applyCombatRewards(combatData) {
    try {
        const rewards = combatData.rewards;
        if (!rewards) {
            console.warn('[REWARDS] No rewards found in combat data');
            return;
        }

        // Gather all turns from segments or flat list
        let allTurns = [];
        if (combatData.segments) {
            allTurns = combatData.segments.flatMap(s => s.turns);
        } else {
            allTurns = combatData.turns || [];
        }

        // --- FIX: Robustly Load Skills Data ---
        let allSkills = [];
        
        // Priority 1: Check window.gameData
        if (window.gameData && window.gameData.skills) {
            allSkills = window.gameData.skills;
            console.log(`[REWARDS] ✅ Using window.gameData (${allSkills.length} skills).`);
        } 
        // Priority 2: Check global gameData variable
        else if (typeof gameData !== 'undefined' && gameData.skills) {
            allSkills = gameData.skills;
            console.log(`[REWARDS] ✅ Using global gameData variable (${allSkills.length} skills).`);
        } 
        // Priority 3: Fetch from API
        else {
            console.warn('[REWARDS] ⚠️ gameData not found in memory. Fetching skills...');
            try {
                const baseUrl = typeof BACKEND_URL !== 'undefined' ? BACKEND_URL : '';
                const res = await fetch(`${baseUrl}/api/data/skills`);
                
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                
                allSkills = await res.json();
                console.log(`[REWARDS] ✅ Fetched ${allSkills.length} skills successfully.`);
            } catch (e) {
                console.error('[REWARDS] ❌ Failed to load skills via fetch:', e);
                console.warn('[REWARDS] Proceeding with default XP (no category balancing).');
                allSkills = []; 
            }
        }
        // --------------------------------------

        for (const participant of combatData.participants.playerCharacters) {
            const charId = participant.characterID;
            
            if (charId.startsWith('import_')) {
                console.log('[REWARDS] Skipping imported character:', charId);
                continue;
            }

            const character = await getCharacter(charId);
            if (!character) continue;

            const oldLevel = character.level || 1;
            const oldSkills = character.skills ? character.skills.map(s => ({
                skillID: s.skillID,
                skillLevel: s.skillLevel || 1,
                skillXP: s.skillXP || 0
            })) : [];

            // --- 1. Apply Base Character XP ---
            const xpGained = rewards.experienceGained?.[charId] || 0;
            if (xpGained > 0) {
                character.experience = (character.experience || 0) + xpGained;
                character.lastModified = Date.now();
                let xpThreshold = getXPToNextLevel(character.level);
                while (character.experience >= xpThreshold) {
                    character.experience -= xpThreshold;
                    character.level++;
                    xpThreshold = getXPToNextLevel(character.level);
                }
            }

            if (character.level > oldLevel) {
                showSuccess(`${character.name} leveled up to Level ${character.level}!`, 5000);
            }

            // --- 2. Apply Skill XP (Including Pre-Combat Uses) ---
            allTurns.forEach(turn => {
                if (turn.actor !== charId && turn.actorName !== character.name) return;

                const isRegularSkill = turn.action?.type === 'skill';
                const isPreCombatSkill = turn.action?.type === 'pre_combat_skill' || turn.action?.type === 'pre_combat_fallback';

                if (isRegularSkill || isPreCombatSkill) {
                    const skillID = turn.action.skillID;
                    if (!skillID) return;

                    const skillRef = character.skills.find(s => s.skillID === skillID);
                    
                    if (skillRef) {
                        let baseSkillXP = 50.0; // Default XP (Float)
                        const skillName = turn.action.name || skillID;
                        
                        // --- CHECK CATEGORY ---
                        const skillDef = allSkills.find(s => s.id === skillID);
                        
                        if (skillDef) {
                            if (skillDef.category && skillDef.category.includes('DAMAGE_SINGLE')) {
                                baseSkillXP = 2; // THE NERF: Only 2 XP per hit
                            }
                        }

                        // Calculate Gain (KEEP AS FLOAT)
                        let multiplier = 1.0;
                        if (!turn.result?.success && isPreCombatSkill) {
                            multiplier = 0.5; 
                        }

                        const rawGain = (baseSkillXP * multiplier) / Math.log(skillRef.skillLevel + 2);
                        const skillXPGain = Math.max(0.01, rawGain); 

                        skillRef.skillXP = (skillRef.skillXP || 0) + skillXPGain;
                        skillRef.usageCount = (skillRef.usageCount || 0) + 1;

                        // Check Level Up
                        const threshold = 100 * skillRef.skillLevel * 1.2;
                        if (skillRef.skillXP >= threshold) {
                            skillRef.skillXP -= threshold;
                            skillRef.skillLevel++;
                            showSuccess(`${skillName} leveled up to ${skillRef.skillLevel}!`, 4000);
                            console.log(`[SKILL XP] 🎉 ${skillName} leveled up to ${skillRef.skillLevel}!`);
                        }
                    }
                }
            });

            await saveCharacterToServer(character);
        }

        // --- 3. Apply Loot ---
        if (rewards.lootDropped && rewards.lootDropped.length > 0) {
            const firstCharId = combatData.participants.playerCharacters[0]?.characterID;
            const character = await getCharacter(firstCharId);
            if (character) {
                if (!character.inventory) character.inventory = [];
                rewards.lootDropped.forEach(loot => {
                    character.inventory.push({ itemID: loot.itemID, rarity: loot.rarity, acquiredAt: Date.now() });
                });
                showSuccess(`Loot obtained: ${rewards.lootDropped.map(l => l.itemID).join(', ')}`);
                await saveCharacterToServer(character);
            }
        }
        
        await renderRoster();
        if (currentState.detailCharacterId) await showCharacterDetail(currentState.detailCharacterId);
        
        const totalXP = Object.values(rewards.experienceGained || {}).reduce((a, b) => a + b, 0);
        showSuccess(`Combat rewards applied! +${totalXP} XP total`, 4000);
    } catch (error) {
        console.error('[REWARDS] Failed to apply rewards:', error);
        showError('Failed to apply rewards: ' + error.message);
    }
}