// combat-log.js
// Handles combat log display with metered playback and rewards

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- SAFE UI HELPERS ---
function showSafeError(msg) {
    console.error('[UI ERROR]', msg);
    if (typeof showError === 'function') {
        showError(msg);
    } else {
        alert('ERROR: ' + msg);
    }
}

function showSafeSuccess(msg) {
    console.log('[UI SUCCESS]', msg);
    if (typeof showSuccess === 'function') {
        showSuccess(msg);
    } else {
        alert('SUCCESS: ' + msg);
    }
}

// --- MAIN DISPLAY FUNCTION ---
async function displayCombatLog(combatData) {
    try {
        console.log('[COMBAT] displayCombatLog called');

        // --- SAFETY CHECKS ---
        if (!combatData) throw new Error('Combat data is null/undefined!');
        if (!combatData.participants) throw new Error('Invalid combat data: Missing participants.');
        if (!window.gameData) console.warn('[COMBAT] window.gameData not ready. Skill XP may default.');

        // --- GET DOM ELEMENTS ---
        const partyStatus   = document.getElementById('partyStatus');
        const enemyStatus   = document.getElementById('enemyStatus');
        const logDisplay    = document.getElementById('combatLogDisplay');
        const resultDisplay = document.getElementById('combatResult');

        if (!partyStatus || !enemyStatus || !logDisplay || !resultDisplay) {
            throw new Error('UI elements missing. Check index.html IDs.');
        }

        // --- INIT UI ---
        partyStatus.innerHTML   = '';
        enemyStatus.innerHTML   = '';
        logDisplay.innerHTML    = '';
        resultDisplay.innerHTML = '';

        // HP tracking maps
        const hpMaxes   = {};
        const hpCurrent = {};
        combatData.participants.playerCharacters.forEach(pc => {
            hpMaxes[pc.characterID]   = pc.maxHP;
            hpCurrent[pc.characterID] = pc.maxHP;
        });
        combatData.participants.enemies.forEach(e => {
            hpMaxes[e.enemyID]   = e.maxHP;
            hpCurrent[e.enemyID] = e.maxHP;
        });

        // Render party HP/resource bars
        combatData.participants.playerCharacters.forEach(pc => {
            const div = document.createElement('div');
            div.className = 'combatant';
            div.id = `party-${pc.characterID}`;
            div.innerHTML = `
                <div class="combatant-name">${pc.characterName}</div>
                <div class="combatant-hp">HP: <span class="hp-value">${pc.maxHP}</span> / ${pc.maxHP}</div>
                <div class="health-bar"><div class="health-bar-fill" style="width:100%"></div><div class="health-bar-text">100%</div></div>
                <div class="combatant-mana">Mana: <span class="mana-value">${pc.maxMana || 0}</span> / ${pc.maxMana || 0}</div>
                <div class="mana-bar" style="background:#1a1a2e;border:1px solid #0f3460;height:12px;margin:2px 0;"><div class="mana-bar-fill" style="background:linear-gradient(90deg,#00d4ff,#0084d1);width:100%;height:100%;"></div></div>
                <div class="combatant-stamina">Stamina: <span class="stamina-value">${pc.maxStamina || 0}</span> / ${pc.maxStamina || 0}</div>
                <div class="stamina-bar" style="background:#1a1a2e;border:1px solid #0f3460;height:12px;margin:2px 0;"><div class="stamina-bar-fill" style="background:linear-gradient(90deg,#ffd700,#ff8c00);width:100%;height:100%;"></div></div>
            `;
            partyStatus.appendChild(div);
        });

        // Helper to render enemy bars (used by legacy single-stage fallback)
        const renderEnemies = (enemies) => {
            enemyStatus.innerHTML = '';
            enemies.forEach(e => {
                const div = document.createElement('div');
                div.className = 'combatant';
                div.id = `enemy-${e.enemyID}`;
                div.innerHTML = `
                    <div class="combatant-name">${e.enemyName}</div>
                    <div class="combatant-hp">HP: <span class="hp-value">${e.maxHP}</span> / ${e.maxHP}</div>
                    <div class="health-bar"><div class="health-bar-fill" style="width:100%"></div><div class="health-bar-text">100%</div></div>
                `;
                enemyStatus.appendChild(div);
            });
        };

        // Don't pre-populate enemies from participants.enemies — that reflects the
        // final stage's pool, not stage 1. Each stage reveals its own enemies when
        // its intro finishes. Show a placeholder until then.
        enemyStatus.innerHTML = '<div class="enemy-panel-placeholder">⚔️ Awaiting encounter...</div>';

        // --- PLAYBACK ---
        const hasSegments  = combatData.segments && Array.isArray(combatData.segments) && combatData.segments.length > 0;
        const DEFAULT_DELAY = 1000;
        let overallResult  = 'draw';

        // --- Stage banner helpers ---
        const stageBanner       = document.getElementById('stageBanner');
        const stageBannerTitle  = document.getElementById('stageBannerTitle');
        const stageBannerPre    = document.getElementById('stageBannerPreCombat');

        function showStageBanner(title) {
            if (!stageBanner) return;
            stageBanner.style.display = 'block';
            stageBannerTitle.textContent = title;
            stageBannerPre.innerHTML = '';
            stageBanner.classList.remove('banner-fade-in');
            void stageBanner.offsetWidth; // force reflow
            stageBanner.classList.add('banner-fade-in');
        }

        function hideStageBanner() {
            if (!stageBanner) return;
            stageBanner.style.display = 'none';
            stageBannerTitle.textContent = '';
            stageBannerPre.innerHTML = '';
        }

        async function flashAndRevealEnemies(enemies) {
            for (let i = 0; i < enemies.length; i++) {
                // Flash the banner
                if (stageBanner) {
                    stageBanner.classList.remove('banner-flash');
                    void stageBanner.offsetWidth;
                    stageBanner.classList.add('banner-flash');
                }
                // Slide in the corresponding enemy
                const e = enemies[i];
                const div = document.createElement('div');
                div.className = 'combatant';
                div.id = `enemy-${e.enemyID}`;
                div.innerHTML = `
                    <div class="combatant-name">${e.enemyName}</div>
                    <div class="combatant-hp">HP: <span class="hp-value">${e.maxHP}</span> / ${e.maxHP}</div>
                    <div class="health-bar"><div class="health-bar-fill" style="width:100%"></div><div class="health-bar-text">100%</div></div>
                `;
                div.classList.add('combatant-slide-in');
                enemyStatus.appendChild(div);
                // Brief pause between each enemy reveal
                await sleep(320);
            }
        }

        if (hasSegments) {
            console.log(`[COMBAT] Playing ${combatData.segments.length} stage(s)...`);

            for (const segment of combatData.segments) {
                console.log(`[STAGE] ${segment.stageId}: ${segment.title}`);

                // Clear enemy panel between stages
                enemyStatus.innerHTML = '';

                // 1. Show stage banner with title
                showStageBanner(segment.title);

                // 2. Separate pre-combat turns from combat turns
                const preCombatTurns = segment.turns.filter(
                    t => t.action?.type === 'pre_combat_skill' || t.action?.type === 'pre_combat_fallback'
                );
                const combatTurns = segment.turns.filter(
                    t => t.action?.type !== 'pre_combat_skill' && t.action?.type !== 'pre_combat_fallback'
                );

                // 3. If there's a pre-combat opportunity, show it in the banner
                if (preCombatTurns.length > 0) {
                    await sleep(600); // let banner fade in finish
                    const pc = preCombatTurns[0];
                    const icon = pc.result?.success ? '✅' : '❌';
                    const skillName = pc.action?.name || pc.action?.skillID || 'Skill check';
                    const narrative = pc.result?.message || '';
                    const color = pc.result?.success ? '#4cd964' : '#d4484a';
                    const preCombatEl = document.createElement('div');
                    preCombatEl.className = 'pre-combat-reveal';
                    preCombatEl.style.cssText = `color:${color};`;
                    preCombatEl.innerHTML = `<strong>${icon} ${skillName}</strong> — ${narrative}`;
                    stageBannerPre.appendChild(preCombatEl);
                    await sleep(1800); // read the result
                } else {
                    await sleep(1200); // brief pause on title alone
                }

                // 4. Seed hpMaxes and flash-reveal enemies
                if (segment.participantsSnapshot?.enemies.length > 0) {
                    segment.participantsSnapshot.enemies.forEach(e => {
                        hpMaxes[e.enemyID]   = e.maxHP;
                        hpCurrent[e.enemyID] = e.maxHP;
                    });
                    await flashAndRevealEnemies(segment.participantsSnapshot.enemies);
                }

                await sleep(400); // brief beat before combat turns start

                // 5. Play combat turns (pre-combat already consumed by banner)
                for (const turn of combatTurns) {
                    const turnDelay = turn.result?.delay || DEFAULT_DELAY;
                    renderTurn(turn, logDisplay, hpMaxes, hpCurrent);
                    updateHealthBars(turn, hpMaxes, hpCurrent);
                    if (turn.playerResourceStates) updateResourceBars(turn.playerResourceStates);
                    await sleep(turnDelay);
                }

                // 6. Stage summary — update banner to show outcome, then log it
                const outcomeColor = segment.status === 'victory' ? '#4cd964' : '#f44336';
                const outcomeIcon  = segment.status === 'victory' ? '⚔️ Stage Clear' : '💀 Defeated';
                if (stageBannerPre) {
                    const summaryEl = document.createElement('div');
                    summaryEl.style.cssText = `color:${outcomeColor}; margin-top:6px; font-style:normal; font-weight:bold; font-size:0.85rem;`;
                    summaryEl.textContent = outcomeIcon;
                    stageBannerPre.appendChild(summaryEl);
                }

                // Also log the stage summary for the mechanics layer
                const summaryLogEl = document.createElement('div');
                summaryLogEl.className = 'combat-turn summary-turn';
                summaryLogEl.innerHTML = `
                    <div class="turn-message" style="color:#aaa;border-left:3px solid ${outcomeColor};padding-left:10px;font-style:italic;">${segment.summaryText}</div>
                `;
                logDisplay.appendChild(summaryLogEl);
                logDisplay.scrollTop = logDisplay.scrollHeight;

                if (segment.status === 'defeat' || segment.status === 'loss') {
                    overallResult = 'loss';
                    break;
                } else if (segment.status === 'retreat') {
                    overallResult = 'retreated';
                    break;
                } else {
                    overallResult = 'victory';
                }

                if (segment !== combatData.segments[combatData.segments.length - 1]) {
                    await sleep(1800);
                }
            }
        } else {
            // Legacy single-stage fallback
            const turns = combatData.turns || [];
            for (const turn of turns) {
                const turnDelay = turn.result?.delay || DEFAULT_DELAY;
                renderTurn(turn, logDisplay, hpMaxes, hpCurrent);
                updateHealthBars(turn, hpMaxes, hpCurrent);
                if (turn.playerResourceStates) updateResourceBars(turn.playerResourceStates);
                await sleep(turnDelay);
            }
            overallResult = combatData.result;
        }

        // --- RESULT MODAL ---
        const finalResult  = combatData.result;
        const nextId       = combatData.nextChallengeId || window.lastChallengeId || 'challenge_goblin_camp';

        const modal        = document.getElementById('combatResultModal');
        const titleEl      = document.getElementById('resultModalTitle');
        const lootListEl   = document.getElementById('lootList');
        const charXPListEl = document.getElementById('charXPList');
        const skillXPListEl = document.getElementById('skillXPList');
        const statusTextEl  = document.getElementById('autoRestartText');

        // Clear previous modal content
        if (lootListEl)    lootListEl.innerHTML    = '';
        if (charXPListEl)  charXPListEl.innerHTML  = '';
        if (skillXPListEl) skillXPListEl.innerHTML = '';

        // Populate loot
        const rewards = combatData.rewards || {};
        if (lootListEl) {
            if (rewards.lootDropped && rewards.lootDropped.length > 0) {
                lootListEl.innerHTML = rewards.lootDropped.map(l =>
                    `<span style="color:${l.rarity === 'legendary' ? '#ffaa00' : l.rarity === 'rare' ? '#00d4ff' : '#fff'}">• ${l.itemID}</span>`
                ).join('<br>');
            } else {
                lootListEl.innerHTML = '<span style="color:#666">No loot dropped.</span>';
            }
        }

        // Populate discoveries — scan all turns for child skill procs
        const allTurns = combatData.segments
            ? combatData.segments.flatMap(s => s.turns)
            : (combatData.turns || []);

        const discoveries = [];
        const seen = new Set();
        allTurns.forEach(turn => {
            if (turn.isChildSkillProc && turn.action?.skillID && !seen.has(turn.action.skillID)) {
                seen.add(turn.action.skillID);
                const skillDef = window.gameData?.skills?.find(s => s.id === turn.action.skillID);
                discoveries.push({
                    name: skillDef?.name || turn.action.skillID,
                    isFirst: turn.isFirstDiscovery
                });
            }
        });

        // Add discoveries section to modal if any procs fired
        const modalContent = document.querySelector('#combatResultModal > div');
        const existingDisc = document.getElementById('discoveriesSection');
        if (existingDisc) existingDisc.remove();

        if (discoveries.length > 0 && modalContent) {
            const discSection = document.createElement('div');
            discSection.id = 'discoveriesSection';
            discSection.style.cssText = 'margin-bottom:1rem;background:rgba(212,175,55,0.08);border:1px solid #d4af37;border-radius:8px;padding:1rem;';
            discSection.innerHTML = `
                <div style="color:#d4af37;font-weight:bold;margin-bottom:0.5rem;">🔮 Skill Discoveries</div>
                ${discoveries.map(d =>
                    d.isFirst
                        ? `<div style="color:#4cd964;">✨ ${d.name} — First discovered!</div>`
                        : `<div style="color:#d4af37;">⚡ ${d.name} — XP gained toward unlock</div>`
                ).join('')}
            `;
            // Insert before the XP section
            if (charXPListEl) charXPListEl.parentElement.before(discSection);
            else modalContent.prepend(discSection);
        }

        // Populate character XP
        if (charXPListEl) {
            const totalCharXP = Object.values(rewards.experienceGained || {}).reduce((a, b) => a + b, 0);
            charXPListEl.innerHTML = totalCharXP > 0
                ? `<div>+${totalCharXP} Total Character XP</div>`
                : '<span style="color:#666">No character XP gained.</span>';
        }

        // Populate skill XP note
        if (skillXPListEl) {
            skillXPListEl.innerHTML = '<div style="color:#aaa;font-style:italic;">Skill progress updated based on actions.</div>';
        }

        // Set result title and countdown text
        if (finalResult === 'victory') {
            if (titleEl) { titleEl.textContent = 'VICTORY!'; titleEl.style.color = '#4cd964'; }
            if (statusTextEl) {
                statusTextEl.style.color = '#ffd700';
                statusTextEl.innerHTML = `Auto-restarting in <span id="countdownTimer" style="font-weight:bold;font-size:1.1rem;">3</span>s...`;
            }
        } else if (finalResult === 'defeat' || finalResult === 'loss') {
            if (titleEl) { titleEl.textContent = 'DEFEATED'; titleEl.style.color = '#d4484a'; }
            const fallbackName = nextId.replace('challenge_', '').replace(/_/g, ' ').toUpperCase();
            if (statusTextEl) {
                statusTextEl.style.color = '#ffaa00';
                statusTextEl.innerHTML = `Retreating to ${fallbackName} in <span id="countdownTimer" style="font-weight:bold;font-size:1.1rem;">5</span>s...`;
            }
        } else {
            if (titleEl) { titleEl.textContent = 'RETREATED'; titleEl.style.color = '#aaa'; }
            if (statusTextEl) statusTextEl.textContent = 'Returning to hub...';
        }

        // Show the modal
        if (modal) modal.style.display = 'flex';

        // Trigger rewards and/or countdown
        if (finalResult === 'victory') {
            await applyCombatRewards(combatData);
            startCountdown(3, nextId);
        } else if (finalResult === 'loss' || finalResult === 'defeat') {
            startCountdown(5, nextId);
        } else if (finalResult === 'retreated') {
            setTimeout(() => {
                if (modal) modal.style.display = 'none';
                if (typeof returnToHub === 'function') returnToHub();
            }, 2000);
        }

        // Nested helper — closure keeps access to this call's scope
        function startCountdown(seconds, targetChallengeId) {
            let counter = seconds;
            const timerSpan = document.getElementById('countdownTimer');

            if (!window.currentState) {
                console.error('[IDLE] window.currentState undefined — cannot auto-restart.');
                return;
            }

            const newChallengeObj = window.gameData?.challenges?.find(c => c.id === targetChallengeId);
            if (newChallengeObj) {
                window.currentState.selectedChallenge = newChallengeObj;
                console.log(`[IDLE] Safety Net: currentState updated to ${targetChallengeId}`);
            } else {
                console.error(`[IDLE] Could not find challenge: ${targetChallengeId}`);
            }

            const interval = setInterval(() => {
                counter--;
                if (timerSpan) timerSpan.textContent = counter;

                if (counter <= 0) {
                    clearInterval(interval);
                    const m = document.getElementById('combatResultModal');
                    if (m) m.style.display = 'none';

                    // Graceful exit: player requested loop stop, current combat already finished
                    if (window.currentState.pendingLoopExit) {
                        console.log('[IDLE] Pending exit — stopping loop after this combat.');
                        window.currentState.idleActive = false;
                        window.currentState.pendingLoopExit = false;
                        if (typeof updateChallengeStatusBanner === 'function') updateChallengeStatusBanner();
                        if (typeof showCharacterDetail === 'function' && window.currentState.detailCharacterId) {
                            showCharacterDetail(window.currentState.detailCharacterId);
                        } else if (typeof returnToHub === 'function') {
                            returnToHub();
                        }
                        return;
                    }

                    if (typeof startCombat === 'function') {
                        console.log(`[IDLE] Auto-starting: ${targetChallengeId}`);
                        startCombat();
                    } else {
                        console.error('[IDLE] startCombat not found!');
                    }
                }
            }, 1000);

            window.currentRestartInterval = interval;
        }

    } catch (error) {
        console.error('[COMBAT] FATAL ERROR in displayCombatLog:', error);

        const modal        = document.getElementById('combatResultModal');
        const titleEl      = document.getElementById('resultModalTitle');
        const statusTextEl = document.getElementById('autoRestartText');

        if (modal && titleEl && statusTextEl) {
            titleEl.textContent = 'SYSTEM ERROR';
            titleEl.style.color = '#ff0000';
            statusTextEl.innerHTML = `<span style="color:red">Playback crashed: ${error.message}</span><br>Returning to hub...`;
            modal.style.display = 'block';
            setTimeout(() => {
                modal.style.display = 'none';
                if (typeof returnToHub === 'function') returnToHub();
            }, 3000);
        } else {
            alert('Combat Error: ' + error.message);
            if (typeof returnToHub === 'function') returnToHub();
        }
    }
} // END: displayCombatLog

// --- GLOBAL MODAL BUTTON HANDLERS ---
// Attached to window so index.html onclick attributes can reach them.

window.cancelAutoRestart = function() {
    if (window.currentRestartInterval) clearInterval(window.currentRestartInterval);
    const modal = document.getElementById('combatResultModal');
    if (modal) modal.style.display = 'none';
    // Hard stop — only reached if called outside the countdown (e.g. retreat modal)
    if (window.currentState) {
        window.currentState.idleActive = false;
        window.currentState.pendingLoopExit = false;
    }
    if (typeof updateChallengeStatusBanner === 'function') updateChallengeStatusBanner();
    if (typeof returnToHub === 'function') returnToHub();
};

window.forceRestartNow = function() {
    if (window.currentRestartInterval) clearInterval(window.currentRestartInterval);
    const modal = document.getElementById('combatResultModal');
    if (modal) modal.style.display = 'none';
    if (typeof startCombat === 'function') startCombat();
};

// --- TURN RENDERER ---

function renderTurn(turn, logDisplay, hpMaxes, hpCurrent) {
    const turnEl = document.createElement('div');
    turnEl.className = 'combat-turn';

    // Pre-combat skill narrative
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

    // Child skill discovery proc
    if (turn.isChildSkillProc) {
        turnEl.classList.add('narrative-turn');
        turnEl.style.border = '1px solid #d4af37';
        turnEl.style.background = 'rgba(212,175,55,0.08)';
        const skillDef = window.gameData?.skills?.find(s => s.id === turn.action?.skillID);
        const skillName = skillDef?.name || turn.action?.skillID || 'Unknown Skill';
        const discoveryHeader = turn.isFirstDiscovery
            ? `✨ An unknown technique fires — <strong>${skillName}</strong> discovered!`
            : `⚡ <strong>${skillName}</strong> (Lv.0 — gaining XP)`;
        turnEl.innerHTML = `
            <div class="turn-header" style="color:#d4af37;">${discoveryHeader}</div>
            <div class="turn-message">${turn.result?.message || skillName + ' fires!'}</div>
        `;
        logDisplay.appendChild(turnEl);
        logDisplay.scrollTop = logDisplay.scrollHeight;
        return;
    }

    // Multi-target hits
    if (turn.result?.targets && turn.result.targets.length > 0) {
        turn.result.targets.forEach(targetInfo => {
            const subEl  = document.createElement('div');
            subEl.className = 'combat-turn';
            const isCrit = turn.roll?.crit;
            const msg    = isCrit
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

    // Status effect tick
    if (turn.action?.type === 'status') {
        turnEl.classList.add('status-turn');
        turnEl.style.fontStyle = 'italic';
        turnEl.style.opacity   = '0.8';
        turnEl.innerHTML = `
            <div class="turn-header">Turn ${turn.turnNumber}</div>
            <div class="turn-message">${turn.result?.message || 'Status effect ticks...'}</div>
        `;
        logDisplay.appendChild(turnEl);
        logDisplay.scrollTop = logDisplay.scrollHeight;
        return;
    }

    // Standard attack / action
    const isHit  = turn.result?.damageDealt > 0;
    const isCrit = turn.roll?.crit;
    let messageClass = '';
    if (isCrit) messageClass = 'turn-crit';
    if (!isHit) messageClass = 'turn-miss';

    turnEl.innerHTML = `
        <div class="turn-header">Turn ${turn.turnNumber}: ${turn.actorName}</div>
        <div class="turn-message ${messageClass}">${turn.result?.message || 'Action taken'}</div>
        ${isHit ? `<div class="turn-damage">Damage: ${turn.result.damageDealt}</div>` : ''}
    `;
    logDisplay.appendChild(turnEl);
    logDisplay.scrollTop = logDisplay.scrollHeight;
}

// --- HEALTH BAR UPDATERS ---

function updateHealthBars(turn, hpMaxes, hpCurrent) {
    if (turn.result?.targets && turn.result.targets.length > 0) {
        turn.result.targets.forEach(targetInfo => {
            updateSingleHealthBar(targetInfo.targetId, targetInfo.hpAfter, hpMaxes, hpCurrent, 'enemy');
        });
    } else if (turn.result?.targetId) {
        const targetId = turn.result.targetId;
        const newHP    = turn.result.targetHPAfter;
        if (newHP !== undefined) {
            const updated = updateSingleHealthBar(targetId, newHP, hpMaxes, hpCurrent, 'enemy');
            if (!updated) updateSingleHealthBar(targetId, newHP, hpMaxes, hpCurrent, 'party');
        }
    }
}

function updateSingleHealthBar(targetId, newHP, hpMaxes, hpCurrent, type) {
    const prefix = type === 'enemy' ? 'enemy' : 'party';
    const el = document.getElementById(`${prefix}-${targetId}`);
    if (el) {
        const maxHP         = hpMaxes[targetId] || 100;
        const healthPercent = Math.max(0, (newHP / maxHP) * 100);

        const hpValueEl = el.querySelector('.hp-value');
        const fillEl    = el.querySelector('.health-bar-fill');
        const textEl    = el.querySelector('.health-bar-text');

        if (hpValueEl) hpValueEl.textContent = Math.max(0, newHP);
        if (fillEl)    fillEl.style.width     = `${healthPercent}%`;
        if (textEl)    textEl.textContent     = `${Math.max(0, Math.floor(healthPercent))}%`;

        hpCurrent[targetId] = newHP;
        return true;
    }
    return false;
}

function updateResourceBars(resourceStates) {
    resourceStates.forEach(state => {
        const actorEl = document.getElementById(`party-${state.characterID}`);
        if (!actorEl) return;

        const staVal  = actorEl.querySelector('.stamina-value');
        const staBar  = actorEl.querySelector('.stamina-bar-fill');
        const staText = actorEl.querySelector('.combatant-stamina');
        if (staVal && staBar && staText) {
            const max = parseInt(staText.textContent.split(' / ')[1]);
            const pct = Math.max(0, (state.currentStamina / max) * 100);
            staVal.textContent = state.currentStamina;
            staBar.style.width = `${pct}%`;
        }

        const manVal  = actorEl.querySelector('.mana-value');
        const manBar  = actorEl.querySelector('.mana-bar-fill');
        const manText = actorEl.querySelector('.combatant-mana');
        if (manVal && manBar && manText) {
            const max = parseInt(manText.textContent.split(' / ')[1]);
            const pct = Math.max(0, (state.currentMana / max) * 100);
            manVal.textContent = state.currentMana;
            manBar.style.width = `${pct}%`;
        }
    });
}

// --- REWARD PROCESSOR ---
async function applyCombatRewards(combatData) {
try {
    const rewards = combatData.rewards;
    if (!rewards) {
        console.warn('[REWARDS] No rewards in combat data.');
        return;
    }

    const allTurns = combatData.segments
        ? combatData.segments.flatMap(s => s.turns)
        : (combatData.turns || []);

    // Load skill definitions
    let allSkills = [];
    if (window.gameData?.skills) {
        allSkills = window.gameData.skills; 
    } else {
        try {
            const baseUrl = typeof BACKEND_URL !== 'undefined' ? BACKEND_URL : '';
            const res = await fetch(`${baseUrl}/api/data/skills`);
            if (res.ok) allSkills = await res.json();
        } catch (e) {
            console.error('[REWARDS] Failed to load skills:', e);
        }
    }

    // Track saved character objects by ID so the loot section can reuse them
    // without a second getCharacter() call that would return a stale DB snapshot
    // and overwrite XP we just saved.
    const savedCharacters = {};

    for (const participant of combatData.participants.playerCharacters) {
        const charId = participant.characterID;
        
        // Skip imported characters and bots
        if (charId.startsWith('import_')) continue;
        if (window.gameData?.bots?.some(b => b.characterID === charId)) continue;

        const character = await getCharacter(charId);
        if (!character) continue;

        // Log current discovery XP so we can confirm accumulation across combats
        const discoveries = character.skills.filter(s => s.discovered && (s.skillLevel || 0) < 1);
        if (discoveries.length > 0) {
            discoveries.forEach(s => console.log(`[XP] 📖 ${s.skillID} entering combat rewards at XP: ${(s.skillXP||0).toFixed(0)} / 120`));
        }

        const oldLevel = character.level || 1;

        // Apply character XP and level-ups
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
            showSafeSuccess(`${character.name} leveled up to Level ${character.level}!`);
        }

        // --- CRITICAL FIX: AGGRESSIVE DISCOVERY INJECTION ---
        // We scan ALL turns for this character. If we see a isFirstDiscovery flag,
        // we FORCE add the skill to the local character object immediately.
        console.log(`[REWARDS] Scanning turns for discoveries for ${character.name}...`);
        
        allTurns.forEach(turn => {
            // Match by ID first, then Name as fallback
            const isMyTurn = (turn.actor === charId) || (turn.actorName === character.name);
            
            if (isMyTurn && turn.isFirstDiscovery && turn.action?.skillID) {
                const exists = character.skills.some(s => s.skillID === turn.action.skillID);
                if (!exists) {
                    console.log(`[REWARDS] ⚡ FORCE INJECTING discovery: ${turn.action.skillID}`);
                    character.skills.push({
                        skillID: turn.action.skillID,
                        skillLevel: 0,
                        skillXP: 0,
                        usageCount: 0,
                        discovered: true,
                        discoveredAt: Date.now()
                    });
                } else {
                    console.log(`[REWARDS] ℹ️ Skill ${turn.action.skillID} already exists locally.`);
                }
            }
        });
        // ------------------------------------------------------

        // Apply skill XP
        allTurns.forEach(turn => {
            // Match by ID first, then Name
            const isMyTurn = (turn.actor === charId) || (turn.actorName === character.name);
            if (!isMyTurn) return;

            const isRegularSkill   = turn.action?.type === 'skill';
            const isPreCombatSkill = turn.action?.type === 'pre_combat_skill' || turn.action?.type === 'pre_combat_fallback';
            
            if (!isRegularSkill && !isPreCombatSkill) return;

            const skillID = turn.action.skillID;
            if (!skillID) return;

            // Find the skill in the character's owned list (now includes injected discoveries)
            const skillRef = character.skills.find(s => s.skillID === skillID);
            
            if (!skillRef) {
                // Only warn if it's NOT a discovery turn (discoveries should be injected now)
                if (!turn.isFirstDiscovery) {
                    console.warn(`[XP] Skill ${skillID} not found for ${character.name}. Skipping.`);
                }
                return;
            }

            let xpToAward = 0;
            const skillDef = allSkills.find(s => s.id === skillID);
            
            // --- LOGIC BRANCH A: DISCOVERY PHASE (Level 0) ---
            if (skillRef.skillLevel < 1) {
                if (turn.isChildSkillProc) {
                    // Flat 20 XP per proc toward the 120 XP unlock threshold (~6 procs)
                    xpToAward = 20.0;
                } else {
                    // Skill is Level 0 but NOT procced. No XP.
                    return; 
                }
            } 
            // --- LOGIC BRANCH B: MASTERY PHASE (Level >= 1) ---
            else {
                // Standard XP for intentional use
                const multiplier = (!turn.result?.success && isPreCombatSkill) ? 0.5 : 1.0;
                
                let baseSkillXP = 50.0;
                if (skillDef?.category?.includes('DAMAGE_SINGLE')) { 
                    baseSkillXP = 2.0; 
                }

                xpToAward = (baseSkillXP * multiplier) / Math.log(skillRef.skillLevel + 2);
                
                if (turn.isDesperation) {
                    xpToAward = 0; 
                }
            }

            if (xpToAward > 0) {
                skillRef.skillXP = (skillRef.skillXP || 0) + xpToAward;
                skillRef.usageCount = (skillRef.usageCount || 0) + 1;

                // Level 0 → 1: flat 120 XP discovery threshold.
                // Level 1+: standard formula (100 * level * 1.2).
                const threshold = skillRef.skillLevel < 1
                    ? 120
                    : 100 * skillRef.skillLevel * 1.2;

                if (skillRef.skillXP >= threshold) {
                    skillRef.skillXP -= threshold;
                    skillRef.skillLevel++;
                    showSafeSuccess(`${turn.action.name || skillID} leveled up to ${skillRef.skillLevel}!`);
                    console.log(`[XP] 🎉 ${skillID} reached Level ${skillRef.skillLevel}!`);
                } else if (skillRef.skillLevel < 1) {
                    console.log(`[XP] ✨ ${skillID} discovery XP: ${skillRef.skillXP.toFixed(0)} / ${threshold} (+${xpToAward})`);
                }
            }
        });

        await saveCharacterToServer(character);
        savedCharacters[charId] = character; // keep in-memory for loot section

        // --- PATCH: SYNC STATE FOR NEXT COMBAT ---
        if (window.currentState && window.currentState.currentParty) {
            const partyIndex = window.currentState.currentParty.findIndex(
                m => m.characterID === charId || m.id === charId
            );
            
            if (partyIndex !== -1) {
                window.currentState.currentParty[partyIndex].skills = character.skills;
                window.currentState.currentParty[partyIndex].experience = character.experience;
                window.currentState.currentParty[partyIndex].level = character.level;
                console.log(`[STATE SYNC] Updated currentState for ${character.name} (Skills: ${character.skills.length})`);
            }
        }
        // --- END PATCH ---
    }

        // Apply Loot
        if (rewards.lootDropped && rewards.lootDropped.length > 0) {
            const firstParticipant = combatData.participants.playerCharacters.find(
                p => !p.characterID.startsWith('import_') && !window.gameData?.bots?.some(b => b.characterID === p.characterID)
            );

            if (firstParticipant) {
                const firstCharId = firstParticipant.characterID;
                // Use the already-saved in-memory copy if available — avoids re-fetching
                // a stale DB snapshot that would overwrite XP we just saved.
                const character = savedCharacters[firstCharId] || await getCharacter(firstCharId);
                
                if (character) {
                    if (!character.inventory) character.inventory = [];
                    if (!character.consumables) character.consumables = {};

                    const consumableDrops = [];
                    const inventoryDrops  = [];

                    rewards.lootDropped.forEach(loot => {
                        const itemDef = window.gameData?.gear?.find(g => g.id === loot.itemID);
                        if (itemDef?.slot_id1 === 'consumable' || itemDef?.slot === 'consumable') {
                            character.consumables[loot.itemID] = (character.consumables[loot.itemID] || 0) + 1;
                            consumableDrops.push(itemDef?.name || loot.itemID);
                        } else {
                            character.inventory.push({ itemID: loot.itemID, rarity: loot.rarity, acquiredAt: Date.now() });
                            inventoryDrops.push(itemDef?.name || loot.itemID);
                        }
                    });

                    const allDropNames = [
                        ...consumableDrops.map(n => `${n} (belt)`),
                        ...inventoryDrops
                    ];
                    showSafeSuccess(`Loot obtained: ${allDropNames.join(', ')}`);
                    await saveCharacterToServer(character);

                    if (window.currentState && window.currentState.currentParty) {
                        const partyIndex = window.currentState.currentParty.findIndex(
                            m => m.characterID === firstCharId || m.id === firstCharId
                        );
                        if (partyIndex !== -1) {
                            window.currentState.currentParty[partyIndex].inventory = character.inventory;
                            console.log(`[STATE SYNC] Updated inventory in currentState for ${character.name}`);
                        }
                    }
                }
            }
        }

    if (typeof renderRoster === 'function') await renderRoster();
    if (window.currentState?.detailCharacterId && typeof showCharacterDetail === 'function') {
        await showCharacterDetail(window.currentState.detailCharacterId);
    }

    const totalXP = Object.values(rewards.experienceGained || {}).reduce((a, b) => a + b, 0);
    console.log(`[REWARDS] Total XP awarded: ${totalXP}`);

} catch (error) {
    console.error('[REWARDS] Failed to apply rewards:', error);
    showSafeError('Failed to apply rewards: ' + error.message);
}
}
