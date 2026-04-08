// combat-system.js
// Handles challenge selection, party formation, and combat execution

// ✅ 1. DECLARE GLOBAL STATE ONCE (guarded against double-load)
if (typeof window.currentState === 'undefined') {
    window.currentState = {
        // Combat state
        selectedChallenge: null,
        currentParty: [],
        selectedBots: [],
        detailCharacterId: null,
        // Idle loop state
        idleActive: false,       // true while the auto-restart loop is running
        pendingLoopExit: false,  // set by "Return from Challenge" — exits after current combat
        // Character creation state (used by character-management.js)
        selectedRace: null,
        selectedSkills: [],
        selectedWeaponType: null,
        allocatedStats: { conviction: 0, endurance: 0, ambition: 0, harmony: 0 },
        pointsRemaining: 25
    };
}
var currentState = window.currentState;

/**
 * Escape a string for safe use in HTML attribute values and content.
 * FIX #4: Replaces the old single-quote-only escape with full HTML escaping
 * to prevent XSS via crafted character names or race values.
 */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Render available challenges
 */
async function renderChallenges() {
    const container = document.getElementById('challengeContainer');
    if (!container) return;
    
    if (!window.gameData || !window.gameData.challenges) {
        console.error('[CHALLENGES] gameData not loaded yet.');
        return;
    }

    // Fetch current character from server to get up-to-date combatStats
    let completions = {};
    if (currentState.detailCharacterId) {
        try {
            const char = await getCharacter(currentState.detailCharacterId);
            completions = char?.combatStats?.challengeCompletions || {};
        } catch (e) {
            console.warn('[CHALLENGES] Could not load character stats for lore:', e);
        }
    }

    container.innerHTML = '';

    // Group challenges by difficulty
    const grouped = {};
    window.gameData.challenges.forEach(challenge => {
        const d = challenge.difficulty;
        if (!grouped[d]) grouped[d] = [];
        grouped[d].push(challenge);
    });

    const sortedDifficulties = Object.keys(grouped).map(Number).sort((a, b) => a - b);

    for (const difficulty of sortedDifficulties) {
        // Section header
        const header = document.createElement('div');
        header.style.cssText = 'grid-column:1/-1; margin:1.2rem 0 0.4rem; padding-bottom:0.4rem; border-bottom:1px solid rgba(212,175,55,0.25);';
        header.innerHTML = `<span style="color:#d4af37; font-size:0.8rem; letter-spacing:0.1em; text-transform:uppercase; font-weight:600;">Difficulty ${difficulty}</span>`;
        container.appendChild(header);

        grouped[difficulty].forEach(challenge => {
        const card = document.createElement('div');
        card.className = 'card';

        const count = completions[challenge.id]?.completions || 0;
        const secretCount = completions[challenge.id]?.secretCompletions || 0;
        const loreEntries = challenge.lore || [];
        const unlockedLore = loreEntries.filter(e => {
            if (e.requiresSecret) return secretCount >= (e.unlocksAfter || 1);
            return count >= e.unlocksAfter;
        });
        const lockedCount = loreEntries.filter(e => {
            if (e.requiresSecret) return secretCount < (e.unlocksAfter || 1);
            return count < e.unlocksAfter;
        }).length;
        const hasLore = loreEntries.length > 0;
        const loreId = `lore-${challenge.id}`;

        card.innerHTML = `
            <div class="card-title">${challenge.name}</div>
            <div class="card-description">${challenge.description}</div>
            <div class="card-description" style="margin-top: 0.75rem;">
                <span style="color: #d4af37;">Recommended Level: ${challenge.recommendedLevel}</span>
            </div>
            <div class="card-description" style="margin-top: 0.5rem;">
                ${challenge.minPartySize}-${challenge.maxPartySize} members
            </div>
            ${hasLore ? `
            <div style="margin-top:0.75rem; border-top:1px solid rgba(139,115,85,0.2); padding-top:0.5rem;">
                <button onclick="event.stopPropagation(); toggleLore('${loreId}')"
                    style="background:none; border:none; color:#8b7355; font-size:0.72rem; letter-spacing:0.06em; text-transform:uppercase; cursor:pointer; padding:0;">
                    📖 Lore ${unlockedLore.length > 0 ? `(${unlockedLore.length}/${loreEntries.length})` : ''}
                </button>
                <div id="${loreId}" style="display:none; margin-top:0.5rem;">
                    ${unlockedLore.map(e => `
                        <div style="color:#a09070; font-size:0.78rem; font-style:italic; margin-bottom:0.4rem; line-height:1.5;">
                            "${e.text}"
                        </div>`).join('')}
                    ${lockedCount > 0 ? `
                        <div style="color:#444; font-size:0.72rem; margin-top:0.25rem;">
                            ${Array(lockedCount).fill('🔒').join(' ')} ${lockedCount} entr${lockedCount === 1 ? 'y' : 'ies'} undiscovered
                        </div>` : ''}
                </div>
            </div>` : ''}
        `;

        card.onclick = async () => await selectChallenge(challenge);
        container.appendChild(card);
        }); // end grouped[difficulty].forEach
    } // end for difficulty
}

function toggleLore(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

/**
 * Start challenge flow from character detail
 */
function selectCharacterForChallenge(characterId) {
    currentState.detailCharacterId = characterId;
    window.initMapScreen(characterId).then(() => showScreen('map'));
}

/**
 * Select a challenge and move to party formation
 */
async function selectChallenge(challenge) {
    currentState.selectedChallenge = challenge;
    currentState.selectedBots = [];
    currentState.currentParty = [];
    await renderPartyFormation();
    showScreen('party');
}

/**
 * Render party formation screen
 */
async function renderPartyFormation() {
    if (!currentState.detailCharacterId) {
        showError('No character selected.');
        return;
    }

    const character = await getCharacter(currentState.detailCharacterId);
    if (!character) {
        showError('Failed to load character');
        return;
    }
    currentState.currentParty = [character];
    
    const challenge = currentState.selectedChallenge;
    if (!challenge) return;
    
    const nameEl = document.getElementById('partyChallengeName');
    const metaEl = document.getElementById('partyChallengeMeta');
    
    if (nameEl) nameEl.textContent = challenge.name;
    if (metaEl) metaEl.textContent = 
        `Difficulty ${challenge.difficulty} · Recommended Level ${challenge.recommendedLevel}`;
    
    renderCurrentParty();
    renderBotsSelection();
}

/**
 * Render current party members
 */
function renderCurrentParty() {
    const container = document.getElementById('partyDisplay');
    if (!container) return;
    
    container.innerHTML = '';
    
    currentState.currentParty.forEach((member, idx) => {
        const derivedStats = calculateDerivedStats(member);
        const memberName = member.characterName || member.name;
        const memberEl = document.createElement('div');
        memberEl.className = 'party-member';
        memberEl.innerHTML = `
            <div class="party-member-info">
                <div class="party-member-name">${memberName}</div>
                <div class="party-member-stats">Level ${member.level} &middot; HP: ${formatNumber(derivedStats.hp)}</div>
            </div>
            ${idx > 0 ? `<button onclick="removeFromParty(${idx})" class="danger" style="padding: 0.5rem 1rem;">Remove</button>` : ''}
        `;
        container.appendChild(memberEl);
    });
}

/**
 * Add a bot to the current party
 */
function addBotToParty(bot) {
    const challenge = currentState.selectedChallenge;
    if (!challenge) return;

    if (currentState.currentParty.length < challenge.maxPartySize) {
        currentState.currentParty.push(JSON.parse(JSON.stringify(bot)));
        currentState.selectedBots.push(bot.characterID);
        renderCurrentParty();
        renderBotsSelection();
    }
}

/**
 * Remove a bot from the current party
 */
function removeBotFromParty(botId) {
    currentState.currentParty = currentState.currentParty.filter(m => m.characterID !== botId);
    currentState.selectedBots = currentState.selectedBots.filter(id => id !== botId);
    renderCurrentParty();
    renderBotsSelection();
}

/**
 * Remove party member by index
 */
function removeFromParty(idx) {
    if (idx > 0) {
        const botId = currentState.currentParty[idx].characterID;
        removeBotFromParty(botId);
    }
}

/**
 * Confirm party and start combat
 */
function confirmPartyAndStart() {
    const challenge = currentState.selectedChallenge;
    if (!challenge) {
        showError('No challenge selected.');
        return;
    }
    if (currentState.currentParty.length < challenge.minPartySize) {
        showError(`This challenge requires at least ${challenge.minPartySize} party members.`);
        return;
    }

    startCombat();
}

/**
 * Show companion tab (bots or public characters)
 */
function showCompanionTab(tab) {
    const botsDiv = document.getElementById('botsDisplay');
    const publicDiv = document.getElementById('publicCompanionsDisplay');
    const botsBtn = document.getElementById('tab-bots');
    const publicBtn = document.getElementById('tab-public');
    
    if (!botsDiv || !publicDiv) return;
    
    if (tab === 'bots') {
        botsDiv.style.display = 'grid';
        publicDiv.style.display = 'none';
        if (botsBtn) {
            botsBtn.classList.add('selected');
            botsBtn.classList.remove('secondary');
        }
        if (publicBtn) {
            publicBtn.classList.remove('selected');
            publicBtn.classList.add('secondary');
        }
    } else {
        botsDiv.style.display = 'none';
        publicDiv.style.display = 'block';
        if (botsBtn) {
            botsBtn.classList.remove('selected');
            botsBtn.classList.add('secondary');
        }
        if (publicBtn) {
            publicBtn.classList.add('selected');
            publicBtn.classList.remove('secondary');
        }
        loadPublicCompanions();
    }
}

/**
 * Add a public character to the current party
 */
async function addPublicCompanion(shareCode, characterName, level, race) {
    const challenge = currentState.selectedChallenge;
    const maxPartySize = challenge?.maxPartySize || 4;
    
    if (currentState.currentParty.length >= maxPartySize) {
        showError('Party is full!');
        return;
    }
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/character/import/${shareCode}`);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Import failed');
        }
        
        const data = await response.json();

        const deviceId = getDeviceId();
        // Prevent using own character as companion
        if (deviceId && data.importReference.ownerUserId === deviceId) {
            showError('You cannot use your own character as a companion.');
            return;
        }

        // Prevent duplicates
        const alreadyInParty = currentState.currentParty.some(
            m => m.originalCharacterId === data.importReference.originalCharacterId
        );
        if (alreadyInParty) {
            showError(`${data.importReference.originalCharacterName} is already in your party.`);
            return;
        }

        // FIX #1: Include stats, skills, consumables, and equipment so startCombat
        // can build a valid partySnapshot for imported characters.
        currentState.currentParty.push({
            characterID: data.importReference.importId,
            characterName: data.importReference.originalCharacterName,
            level: data.importReference.level,
            race: data.importReference.race,
            stats: data.importReference.stats || {},
            skills: data.importReference.skills || [],
            consumables: data.importReference.consumables || {},
            equipment: data.importReference.equipment || {},
            isImported: true,
            isBot: false,
            originalCharacterId: data.importReference.originalCharacterId,
            canReExport: false
        });
        
        const savedImports = JSON.parse(localStorage.getItem('importedCharacters') || '[]');
        savedImports.push({
            characterID: data.importReference.importId,
            characterName: data.importReference.originalCharacterName,
            level: data.importReference.level,
            race: data.importReference.race,
            isImported: true,
            isBot: false,
            originalCharacterId: data.importReference.originalCharacterId,
            canReExport: false,
            importedAt: new Date().toISOString()
        });
        localStorage.setItem('importedCharacters', JSON.stringify(savedImports));
        
        // FIX #2: Use the confirmed server name instead of the raw parameter
        // to ensure the success message reflects what was actually imported.
        showSuccess(`Added ${data.importReference.originalCharacterName} to party!`);
        renderCurrentParty();
        renderBotsSelection();
        
    } catch (error) {
        console.error('Add public companion error:', error);
        showError('Failed to add character: ' + error.message);
    }
}

/**
 * Start combat
 * @param {string} [forcedChallengeId] - Optional ID to override currentState.selectedChallenge (for auto-retry)
 */
async function startCombat(forcedChallengeId) {
    if (window._combatStartInFlight) {
        console.warn('[COMBAT] startCombat called while request already in flight — ignored.');
        return;
    }
    window._combatStartInFlight = true;
    try {
        // ✅ FIX: Handle Forced Challenge ID (for Auto-Retry Loop)
        if (forcedChallengeId) {
            if (!window.gameData || !window.gameData.challenges) {
                throw new Error('Game data not loaded yet.');
            }
            const newChallenge = window.gameData.challenges.find(c => c.id === forcedChallengeId);
            if (!newChallenge) {
                throw new Error(`Challenge not found: ${forcedChallengeId}`);
            }
            currentState.selectedChallenge = newChallenge;
            console.log(`[COMBAT] Force-starting challenge: ${forcedChallengeId}`);
        }

        if (!currentState.selectedChallenge) {
            throw new Error('No challenge selected.');
        }

        const partySnapshots = currentState.currentParty.map(member => ({
            characterID: member.characterID || member.id,
            characterName: member.characterName || member.name,
            level: member.level,
            stats: member.stats,
            skills: member.skills,
            consumables: member.consumables || {},
            equipment: member.equipment,
            isImported: member.isImported || false,
            aiProfile: member.aiProfile || 'balanced',
            race: member.race || null,
            avatarId: member.avatarId || null,
            avatarColor: member.avatarColor || null
        }));

        // Inject story companions whose gates are met for this challenge
        const companions = window.gameData?.companions || [];
        if (companions.length > 0) {
            const challengeID = currentState.selectedChallenge.id;
            const playerChar = currentState.currentParty.find(m =>
                !m.characterID?.startsWith('bot_') && !m.characterID?.startsWith('import_')
            );
            const inventory = playerChar?.inventory || [];
            const completions = playerChar?.combatStats?.challengeCompletions || {};

            for (const companion of companions) {
                // Scope check: allowedChallenges list, or fallback to d16 if absent
                const allowed = companion.allowedChallenges
                    ? companion.allowedChallenges.includes(challengeID)
                    : challengeID === 'challenge_spire_fractured_time';
                if (!allowed) continue;

                const hasItem = inventory.some(i => i.itemID === companion.requiredItem);
                if (!hasItem) continue;

                if (companion.requiresChallengeNotCompleted) {
                    const cleared = (completions[companion.requiresChallengeNotCompleted]?.completions || 0) > 0;
                    if (cleared) continue;
                }

                partySnapshots.push({
                    characterID: companion.characterID,
                    characterName: companion.characterName,
                    level: companion.level,
                    stats: companion.stats,
                    skills: companion.skills,
                    consumables: companion.consumables || {},
                    equipment: companion.equipment,
                    isImported: false,
                    aiProfile: companion.aiProfile || 'balanced',
                    race: companion.race || null,
                    avatarId: null,
                    avatarColor: null
                });
                console.log(`[COMPANIONS] ${companion.characterName} joined the party.`);
            }
        }

        const requestBody = {
            partySnapshots,
            challengeID: currentState.selectedChallenge.id,
            challenges: window.gameData.challenges
        };

        // Save Current Challenge ID to Window for Fallback
        window.lastChallengeId = currentState.selectedChallenge.id;

        // Mark the idle loop as active so character detail can show the banner
        currentState.idleActive = true;
        updateChallengeStatusBanner();
        if (typeof _updateMediaControls === 'function') _updateMediaControls();
        // Stamp idle session on server so offline collect works if tab is closed
        _notifyIdleStart();

        console.log('[COMBAT] Starting combat:', requestBody.challengeID);

        const combatStartTime = Date.now();
        const response = await authFetch(`${BACKEND_URL}/api/combat/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const combatResult = await response.json();
        const combatDurationMs = Date.now() - combatStartTime;
        currentState.lastCombatDurationMs = combatDurationMs;
        _notifyIdleUpdate(combatDurationMs);

        console.log('[COMBAT] Server response received. Result:', combatResult.result);

        // If the player used an escape consumable, POST to the escape endpoint,
        // then return to hub without displaying the combat log.
        if (window._escapeRequested && combatResult.combatID) {
            const characterID = currentState.currentParty?.[0]?.characterID || currentState.currentParty?.[0]?.id;
            try {
                await authFetch(`${BACKEND_URL}/api/combat/escape`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        combatID:               combatResult.combatID,
                        characterID,
                        itemUsed:               window._escapeItemUsed,
                        lastCompletedStageIndex: window._escapeStageIndex,
                    })
                });
                console.log('[ESCAPE] Escape processed — returning to hub.');
            } catch (err) {
                console.warn('[ESCAPE] Escape endpoint failed:', err);
            }
            window._escapeRequested  = false;
            window._escapeStageIndex = null;
            window._escapeItemUsed   = null;
            if (typeof returnToHub === 'function') returnToHub();
            return;
        }

        // If the player navigated away during the idle loop, don't drag them back to
        // the combat screen — just run the log silently and let the toast notify them.
        const silent = window._silentCombatRestart;
        window._silentCombatRestart = false;

        if (!silent) {
            showScreen('combatlog');
        }
        await displayCombatLog(combatResult);

    } catch (error) {
        console.error('Combat error:', error);
        showError('Failed to start combat: ' + error.message);
    } finally {
        window._combatStartInFlight = false;
    }
}

/**
 * Navigate to character detail screen without stopping the idle loop.
 * Called from the "👤 View Character" button on the combat log screen.
 */
function viewCharacterDuringCombat() {
    const charId = currentState.detailCharacterId;
    if (charId && typeof showCharacterDetail === 'function') {
        showCharacterDetail(charId);
    } else {
        showScreen('detail');
    }
}

/**
 * Update the challenge status banner on the character detail screen.
 * Called whenever idleActive or pendingLoopExit changes.
 */
function updateChallengeStatusBanner() {
    const banner    = document.getElementById('challengeStatusBanner');
    const returnBtn = document.getElementById('returnFromChallengeBtn');
    const selectBtn = document.getElementById('selectChallengeBtn');

    if (!banner) return;

    if (currentState.idleActive) {
        const challengeName = currentState.selectedChallenge?.name || 'a challenge';

        if (currentState.pendingLoopExit) {
            banner.style.display = 'flex';
            banner.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; flex:1; flex-wrap:wrap;">
                    <span style="color:#ffd700;">⏳ Finishing current challenge...</span>
                    <span style="color:#aaa; font-size:0.82em;">Will stop after this run.</span>
                </div>
                <div style="display:flex; gap:8px; margin-left:auto;">
                    <button onclick="showScreen('combatlog')" class="secondary" style="font-size:0.85rem; padding:6px 14px;">▶ Watch</button>
                    <button onclick="cancelLoopExit()" class="secondary" style="font-size:0.85rem; padding:6px 14px;">✕ Cancel Stop</button>
                </div>
            `;
        } else {
            banner.style.display = 'flex';
            banner.innerHTML = `
                <span style="color:#4cd964;">⚔️ Active:</span>
                <span style="color:#ffd700; margin-left:6px;">${challengeName}</span>
                <div style="margin-left:auto; display:flex; gap:8px;">
                    <button onclick="showScreen('combatlog')" class="secondary" style="font-size:0.85rem; padding:6px 14px;">▶ Watch</button>
                    <button id="returnFromChallengeBtn" onclick="requestLoopExit()" class="secondary" style="font-size:0.85rem; padding:6px 14px;">⏹ Return from Challenge</button>
                </div>
            `;
        }

        // Hide "Select Challenge" while idle loop is running
        if (selectBtn) selectBtn.style.display = 'none';
    } else {
        banner.style.display = 'none';
        if (selectBtn) selectBtn.style.display = '';
    }
}

/**
 * Request a graceful exit from the idle loop.
 * The current combat runs to completion; the loop doesn't restart.
 */
function requestLoopExit() {
    if (!currentState.idleActive) return;
    currentState.pendingLoopExit = true;
    updateChallengeStatusBanner();
    if (typeof _updateMediaControls === 'function') _updateMediaControls();
    console.log('[IDLE] Loop exit requested — will stop after current combat.');
    // Notify server so offline collect doesn't fire on next load
    _notifyIdleStop();
}

/**
 * Cancel a pending loop exit — restores the active idle state.
 * Called from the "✕ Cancel Stop" button in the banner.
 */
function cancelLoopExit() {
    if (!currentState.idleActive) return;
    currentState.pendingLoopExit = false;
    updateChallengeStatusBanner();
    if (typeof _updateMediaControls === 'function') _updateMediaControls();
    console.log('[IDLE] Loop exit cancelled — continuing idle loop.');
    // Re-stamp idle session since player is back in the loop
    _notifyIdleStart();
}

// ── Offline idle session notifications ───────────────────────────────────────

function _notifyIdleStart() {
    const challengeId = currentState.selectedChallenge?.id;
    const partyIds    = (currentState.currentParty || []).map(m => m.characterID || m.id).filter(Boolean);
    const primaryId   = partyIds.find(id => !id.startsWith('bot_') && !id.startsWith('import_'));
    if (!primaryId || !challengeId) return;
    // Snapshot generated bots (bot_gen_*) in full — they don't exist in bots.json on the server
    const generatedBotSnapshots = (currentState.currentParty || [])
        .filter(m => (m.characterID || m.id || '').startsWith('bot_gen_'))
        .map(m => ({
            characterID:   m.characterID || m.id,
            characterName: m.characterName || m.name,
            race:          m.race,
            level:         m.level,
            stats:         m.stats,
            skills:        m.skills,
            equipment:     m.equipment,
            consumables:   m.consumables || {},
            aiProfile:     m.aiProfile || 'balanced',
        }));
    authFetch(`${BACKEND_URL}/api/combat/idle/start`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ characterId: primaryId, challengeId, partyIds, generatedBotSnapshots }),
    }).catch(e => console.warn('[IDLE] Failed to stamp idle session:', e.message));
}

// Called after the first combat result returns — updates the session with a real measured duration.
function _notifyIdleUpdate(combatDurationMs) {
    const challengeId = currentState.selectedChallenge?.id;
    const partyIds    = (currentState.currentParty || []).map(m => m.characterID || m.id).filter(Boolean);
    const primaryId   = partyIds.find(id => !id.startsWith('bot_') && !id.startsWith('import_'));
    if (!primaryId || !challengeId) return;
    authFetch(`${BACKEND_URL}/api/combat/idle/start`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ characterId: primaryId, challengeId, partyIds, combatDurationMs }),
    }).catch(e => console.warn('[IDLE] Failed to update idle duration:', e.message));
}

function _notifyIdleStop() {
    const partyIds  = (currentState.currentParty || []).map(m => m.characterID || m.id).filter(Boolean);
    const primaryId = partyIds.find(id => !id.startsWith('bot_') && !id.startsWith('import_'));
    if (!primaryId) return;
    authFetch(`${BACKEND_URL}/api/combat/idle/stop`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ characterId: primaryId }),
    }).catch(e => console.warn('[IDLE] Failed to clear idle session:', e.message));
}
