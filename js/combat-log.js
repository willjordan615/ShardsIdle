// combat-log.js
// Handles combat log display with metered playback and rewards

function sleep(ms) {
    const multiplier = window.combatSpeedMultiplier || 1.0;
    return new Promise(resolve => setTimeout(resolve, ms * multiplier));
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
                <div class="combatant-inner">
                <div class="combatant-name">${pc.characterName}</div>
                <div class="combatant-hp">HP: <span class="hp-value">${pc.maxHP}</span> / ${pc.maxHP}</div>
                <div class="status-effects" id="statuses-${pc.characterID}"></div>
                <div class="health-bar"><div class="health-bar-fill" style="width:100%"></div><div class="health-bar-text">100%</div></div>
                <div class="combatant-mana">Mana: <span class="mana-value">${pc.maxMana || 0}</span> / ${pc.maxMana || 0}</div>
                <div class="mana-bar" style="background:#1a1a2e;border:1px solid #0f3460;height:12px;margin:2px 0;"><div class="mana-bar-fill" style="background:linear-gradient(90deg,#00d4ff,#0084d1);width:100%;height:100%;"></div></div>
                <div class="combatant-stamina">Stamina: <span class="stamina-value">${pc.maxStamina || 0}</span> / ${pc.maxStamina || 0}</div>
                <div class="stamina-bar" style="background:#1a1a2e;border:1px solid #0f3460;height:12px;margin:2px 0;"><div class="stamina-bar-fill" style="background:linear-gradient(90deg,#ffd700,#ff8c00);width:100%;height:100%;"></div></div>
                </div>
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
                    <div class="combatant-inner">
                    <div class="combatant-name">${e.enemyName}</div>
                    <div class="combatant-hp">HP: <span class="hp-value">${e.maxHP}</span> / ${e.maxHP}</div>
                    <div class="status-effects" id="statuses-${e.enemyID}"></div>
                    <div class="health-bar"><div class="health-bar-fill" style="width:100%"></div><div class="health-bar-text">100%</div></div>
                    </div>
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

        function showStageBanner(title, subtext) {
            if (!stageBanner) return;
            stageBanner.style.display = 'block';
            stageBannerTitle.innerHTML = title
                + (subtext ? `<div style="font-size:0.7rem; font-weight:normal; color:#aaa; letter-spacing:1px; text-transform:none; margin-top:4px; font-style:italic;">${subtext}</div>` : '');
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
                    <div class="combatant-inner">
                    <div class="combatant-name">${e.enemyName}</div>
                    <div class="combatant-hp">HP: <span class="hp-value">${e.maxHP}</span> / ${e.maxHP}</div>
                    <div class="status-effects" id="statuses-${e.enemyID}"></div>
                    <div class="health-bar"><div class="health-bar-fill" style="width:100%"></div><div class="health-bar-text">100%</div></div>
                    </div>
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
                showStageBanner(segment.title, segment.introText);

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

                    // Animate attacker lunge + target hit/defeat — unified targets[] format
                    if (turn.result?.damageDealt > 0 && turn.actor && turn.action?.type === 'skill') {
                        const firstTarget = turn.result.targets?.[0];
                        animateAttacker(turn.actor, firstTarget?.targetId || null);
                        if (turn.result.targets?.length > 0) {
                            turn.result.targets.forEach(t => animateHit(t.targetId, turn.roll?.crit, t.hpAfter === 0));
                        }
                    }

                    await sleep(turnDelay);
                }

                // Post-stage sweep: ensure all enemies at 0 HP are visually defeated.
                // Uses finalHP from the engine snapshot as the authoritative source —
                // hpCurrent tracking misses kills from procs and DoTs.
                if (segment.participantsSnapshot?.enemies) {
                    segment.participantsSnapshot.enemies.forEach(e => {
                        if (e.finalHP <= 0 || e.defeated) {
                            const outer = document.getElementById(`enemy-${e.enemyID}`);
                            if (outer) {
                                const inner = outer.querySelector('.combatant-inner') || outer;
                                inner.classList.add('combatant-defeated');
                            }
                        }
                    });
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

        // Skill section is populated by applyCombatRewards after XP is calculated.
        // Clear it now so it's ready to receive content.
        const existingSkillSection = document.getElementById('skillProgressSection');
        if (existingSkillSection) existingSkillSection.remove();

        // Populate character XP
        if (charXPListEl) {
            const totalCharXP = Object.values(rewards.experienceGained || {}).reduce((a, b) => a + b, 0);
            charXPListEl.innerHTML = totalCharXP > 0
                ? `<div>+${totalCharXP} Total Character XP</div>`
                : '<span style="color:#666">No character XP gained.</span>';
        }

        // Skill progress section populated by applyCombatRewards — leave as loading state
        if (skillXPListEl) {
            skillXPListEl.innerHTML = '<div style="color:#555;font-style:italic;font-size:0.8em;">Calculating...</div>';
        }

        // Set result title and countdown text
        if (finalResult === 'victory') {
            if (titleEl) { titleEl.textContent = 'VICTORY!'; titleEl.style.color = '#4cd964'; }
            if (statusTextEl) {
                statusTextEl.style.color = '#ffd700';
                statusTextEl.innerHTML = `Auto-restarting in <span id="countdownTimer" style="font-weight:bold;font-size:1.1rem;">${window.victoryCountdownSeconds || 7}</span>s...`;
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
        // applyCombatRewards always runs — it handles skill XP on all outcomes.
        // Character XP and loot only apply on victory (rewards object will be empty otherwise).
        if (finalResult === 'victory') {
            await applyCombatRewards(combatData);
            startCountdown(window.victoryCountdownSeconds || 7, nextId);
        } else if (finalResult === 'loss' || finalResult === 'defeat') {
            await applyCombatRewards(combatData);
            startCountdown(5, nextId);
        } else if (finalResult === 'retreated') {
            await applyCombatRewards(combatData);
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

    // Multi-target hits — only render per-target breakdown for offensive skills with multiple targets
    if (turn.result?.targets && turn.result.targets.length > 0) {
        const isMultiOffensive = turn.result.damageDealt > 0 && turn.result.targets.length > 1;
        const isSingleOffensive = turn.result.damageDealt > 0 && turn.result.targets.length === 1;

        if (isMultiOffensive) {
            // AOE damage — one entry per target
            turn.result.targets.forEach(targetInfo => {
                const subEl  = document.createElement('div');
                subEl.className = 'combat-turn';
                const isCrit = turn.roll?.crit;
                const name = targetInfo.targetName || 'target';
                const msg = isCrit
                    ? `${turn.actorName} critically hits ${name} for ${targetInfo.damage} damage!`
                    : `${turn.actorName} hits ${name} for ${targetInfo.damage} damage.`;
                subEl.innerHTML = `
                    <div class="turn-header">Turn ${turn.turnNumber}: ${turn.actorName}</div>
                    <div class="turn-message ${isCrit ? 'turn-crit' : ''}">${msg}</div>
                    ${targetInfo.damage > 0 ? `<div class="turn-damage">Damage: ${targetInfo.damage}</div>` : ''}
                `;
                logDisplay.appendChild(subEl);
            });
        } else if (isSingleOffensive) {
            // Single target damage — use the main message
            const isCrit = turn.roll?.crit;
            turnEl.innerHTML = `
                <div class="turn-header">Turn ${turn.turnNumber}: ${turn.actorName}</div>
                <div class="turn-message ${isCrit ? 'turn-crit' : ''}">${turn.result.message || ''}</div>
                <div class="turn-damage">Damage: ${turn.result.damageDealt}</div>
            `;
            logDisplay.appendChild(turnEl);
        } else {
            // Non-offensive (buff, heal, restore) — single summary line
            turnEl.innerHTML = `
                <div class="turn-header">Turn ${turn.turnNumber}: ${turn.actorName}</div>
                <div class="turn-message">${turn.result.message || `${turn.actorName} uses ${turn.action?.skillID || 'skill'}.`}</div>
            `;
            logDisplay.appendChild(turnEl);
        }
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


// Status emoji/tooltip data — populated from gameData on first use
let _statusData = null;
function _getStatusData() {
    if (_statusData) return _statusData;
    const statuses = window.gameData?.statuses || [];
    _statusData = {};
    statuses.forEach(s => {
        _statusData[s.id] = {
            emoji:   s.emoji   || '⚠️',
            tooltip: s.tooltip || s.description || s.id,
            type:    s.type    || 'debuff',
        };
    });
    return _statusData;
}

function updateStatusEffects(combatantId, statuses) {
    const el = document.getElementById(`statuses-${combatantId}`);
    if (!el) return;
    if (!statuses || statuses.length === 0) {
        el.innerHTML = '';
        return;
    }
    const data = _getStatusData();
    el.innerHTML = statuses.map(s => {
        const info = data[s.id] || { emoji: '⚠️', tooltip: s.id, type: 'debuff' };
        const cls  = info.type === 'buff' ? 'status-pip status-pip-buff' : 'status-pip status-pip-debuff';
        const label = info.type === 'buff' ? info.tooltip : info.tooltip;
        return `<span class="${cls}" data-tooltip="${label} (${s.duration}t)">${info.emoji}</span>`;
    }).join('');
}

function updateHealthBars(turn, hpMaxes, hpCurrent) {
    if (turn.result?.targets && turn.result.targets.length > 0) {
        turn.result.targets.forEach(targetInfo => {
            // Try enemy first, then party — unified path uses targets[] for both
            const updated = updateSingleHealthBar(targetInfo.targetId, targetInfo.hpAfter, hpMaxes, hpCurrent, 'enemy');
            if (!updated) updateSingleHealthBar(targetInfo.targetId, targetInfo.hpAfter, hpMaxes, hpCurrent, 'party');
            if (targetInfo.targetStatuses !== undefined) {
                updateStatusEffects(targetInfo.targetId, targetInfo.targetStatuses);
            }
        });
        if (turn.result.actorId && turn.result.actorStatuses !== undefined) {
            updateStatusEffects(turn.result.actorId, turn.result.actorStatuses);
        }
    } else if (turn.result?.targetId) {
        // Legacy fallback — should no longer fire with unified path
        const targetId = turn.result.targetId;
        const newHP    = turn.result.targetHPAfter;
        if (newHP !== undefined) {
            const updated = updateSingleHealthBar(targetId, newHP, hpMaxes, hpCurrent, 'enemy');
            if (!updated) updateSingleHealthBar(targetId, newHP, hpMaxes, hpCurrent, 'party');
        }
        if (turn.result.targetStatuses !== undefined) {
            updateStatusEffects(targetId, turn.result.targetStatuses);
        }
    }
    // Update actor statuses
    if (turn.result?.actorId && turn.result.actorStatuses !== undefined) {
        updateStatusEffects(turn.result.actorId, turn.result.actorStatuses);
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

// --- COMBATANT ANIMATION HELPERS ---

function triggerCombatantAnimation(id, cssClass, durationMs) {
    if (window.combatAnimationsEnabled === false) return;
    const outer = document.getElementById(`party-${id}`) || document.getElementById(`enemy-${id}`);
    if (!outer) return;
    const el = outer.querySelector('.combatant-inner') || outer;
    el.classList.remove(cssClass);
    void el.offsetWidth; // force reflow to restart animation
    el.classList.add(cssClass);
    setTimeout(() => el.classList.remove(cssClass), durationMs);
}

function animateAttacker(actorId, targetId) {
    const isParty = !!document.getElementById(`party-${actorId}`);
    const cls = isParty ? 'combatant-attack-right' : 'combatant-attack-left';
    triggerCombatantAnimation(actorId, cls, 250);
}

function animateHit(targetId, isCrit, isDefeat) {
    if (isDefeat) {
        const outer = document.getElementById(`party-${targetId}`) || document.getElementById(`enemy-${targetId}`);
        if (outer) {
            const el = outer.querySelector('.combatant-inner') || outer;
            el.classList.remove('combatant-hit', 'combatant-crit');
            el.classList.add('combatant-defeated');
        }
    } else if (isCrit) {
        triggerCombatantAnimation(targetId, 'combatant-crit', 450);
    } else {
        triggerCombatantAnimation(targetId, 'combatant-hit', 380);
    }
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
    // rewards may be null on defeat/retreat — skill XP should still apply.
    // Treat missing rewards as empty rather than bailing out early.
    const rewards = combatData.rewards || { experienceGained: {}, lootDropped: [] };

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
    const newUnlocks = [];     // skills that crossed level 0→1 this combat
    const skillXPGains = {};   // skillID → { name, before, after, level, discovered }

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
            const xpBefore = skillRef ? (skillRef.skillXP || 0) : 0;
            
            if (!skillRef) {
                // Expected for NO_RESOURCES desperation skills (last_stand, etc.) which
                // any character can use but won't own. Only warn for genuinely unexpected cases.
                const skillDef = allSkills.find(s => s.id === skillID);
                const isDesperationSkill = skillDef?.category === 'NO_RESOURCES';
                if (!turn.isFirstDiscovery && !isDesperationSkill) {
                    console.warn(`[XP] Skill ${skillID} not found for ${character.name}. Skipping.`);
                }
                return;
            }

            let xpToAward = 0;
            const skillDef = allSkills.find(s => s.id === skillID);
            
            // --- LOGIC BRANCH A: DISCOVERY PHASE (Level 0) ---
            if (skillRef.skillLevel < 1) {
                if (turn.isChildSkillProc) {
                    // Procced from parent combo — full discovery XP (~6 procs to unlock)
                    xpToAward = 20.0;
                } else {
                    // Used directly while still at level 0 — reduced rate (~24 uses to unlock)
                    xpToAward = 5.0;
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
                // Track for modal display
                if (!skillXPGains[skillID]) {
                    skillXPGains[skillID] = {
                        name: skillDef?.name || skillID,
                        before: xpBefore,
                        after: skillRef.skillXP,
                        level: skillRef.skillLevel,
                        discovered: !!skillRef.discovered,
                        xpAwarded: xpToAward
                    };
                } else {
                    skillXPGains[skillID].after = skillRef.skillXP;
                    skillXPGains[skillID].xpAwarded += xpToAward;
                    skillXPGains[skillID].level = skillRef.skillLevel;
                }

                // Level 0 → 1: flat 120 XP discovery threshold.
                // Level 1+: standard formula (100 * level * 1.2).
                const threshold = skillRef.skillLevel < 1
                    ? 120
                    : 100 * skillRef.skillLevel * 1.2;

                if (skillRef.skillXP >= threshold) {
                    skillRef.skillXP -= threshold;
                    skillRef.skillLevel++;
                    // Track discovery unlocks (level 0 → 1) separately for the fanfare modal
                    if (skillRef.skillLevel === 1 && skillRef.discovered) {
                        newUnlocks.push({ skillID, skillDef });
                    } else {
                        showSafeSuccess(`${turn.action.name || skillID} leveled up to ${skillRef.skillLevel}!`);
                    }
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
                window.currentState.currentParty[partyIndex].consumables = character.consumables;
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

    // --- SKILL PROGRESS SECTION (replaces placeholder in modal) ---
    const skillXPListEl = document.getElementById('skillXPList');
    if (skillXPListEl && Object.keys(skillXPGains).length > 0) {
        const UNLOCK_THRESHOLD = 120;
        skillXPListEl.innerHTML = '';

        Object.entries(skillXPGains).forEach(([skillID, data]) => {
            const row = document.createElement('div');
            row.style.cssText = 'margin-bottom:0.6rem; padding-bottom:0.6rem; border-bottom:1px solid rgba(139,115,85,0.2);';

            if (data.discovered && data.level < 1) {
                // Discovery phase — show progress bar
                const pct = Math.min(100, Math.floor((data.after / UNLOCK_THRESHOLD) * 100));
                row.innerHTML = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                        <span style="color:#d4af37; font-size:0.85em;">🔮 ${data.name} <span style="color:#666; font-size:0.75em;">(discovering)</span></span>
                        <span style="color:#aaa; font-size:0.75em;">${data.after.toFixed(0)} / ${UNLOCK_THRESHOLD} XP (+${data.xpAwarded.toFixed(0)})</span>
                    </div>
                    <div style="background:#0f0f1e; border-radius:3px; height:5px; overflow:hidden;">
                        <div style="background:linear-gradient(90deg,#d4af37,#ffe066); width:${pct}%; height:100%;"></div>
                    </div>`;
            } else {
                // Normal equipped skill
                const xpLabel = data.xpAwarded > 0
                    ? `<span style="color:#4cd964; font-size:0.75em;">+${data.xpAwarded.toFixed(1)} XP</span>`
                    : '';
                row.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:#ccc; font-size:0.85em;">${data.name} <span style="color:#8b7355; font-size:0.75em;">Lv.${data.level}</span></span>
                        ${xpLabel}
                    </div>`;
            }
            skillXPListEl.appendChild(row);
        });
    } else if (skillXPListEl) {
        skillXPListEl.innerHTML = '<div style="color:#555; font-size:0.8em; font-style:italic;">No skill activity this combat.</div>';
    }

    // --- DISCOVERY UNLOCK FANFARE ---
    if (newUnlocks.length > 0) {
        const modal = document.getElementById('combatResultModal');
        const modalInner = modal?.querySelector('div');
        if (modalInner) {
            const fanfare = document.createElement('div');
            fanfare.id = 'discoveryUnlockFanfare';
            fanfare.style.cssText = 'margin-bottom:1.2rem; background:linear-gradient(135deg,rgba(212,175,55,0.15),rgba(76,217,100,0.08)); border:2px solid #d4af37; border-radius:8px; padding:1rem 1.2rem; animation:bannerFadeIn 0.5s ease forwards;';
            fanfare.innerHTML = `
                <div style="color:#d4af37; font-weight:bold; font-size:1.05rem; margin-bottom:0.6rem; letter-spacing:1px;">
                    ✨ SKILL UNLOCKED
                </div>
                ${newUnlocks.map(u => {
                    const name = u.skillDef?.name || u.skillID;
                    const desc = u.skillDef?.description || '';
                    const cat  = u.skillDef?.category || '';
                    return `<div style="margin-bottom:0.5rem;">
                        <div style="color:#4cd964; font-weight:bold; font-size:0.95rem;">${name}</div>
                        ${desc ? `<div style="color:#ccc; font-size:0.82rem; font-style:italic; margin-top:2px;">${desc}</div>` : ''}
                        <div style="color:#8b7355; font-size:0.75rem; margin-top:2px;">${cat} — now equippable from your skill slots</div>
                    </div>`;
                }).join('')}
            `;
            // Insert at the top of the modal content, before loot
            modalInner.insertBefore(fanfare, modalInner.firstChild);
        }
        // Toast for each unlock
        newUnlocks.forEach(u => {
            showSafeSuccess(`✨ ${u.skillDef?.name || u.skillID} unlocked and ready to equip!`);
        });
    }

    const totalXP = Object.values(rewards.experienceGained || {}).reduce((a, b) => a + b, 0);
    console.log(`[REWARDS] Total XP awarded: ${totalXP}`);

} catch (error) {
    console.error('[REWARDS] Failed to apply rewards:', error);
    showSafeError('Failed to apply rewards: ' + error.message);
}
}
