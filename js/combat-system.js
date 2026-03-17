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
function renderChallenges() {
    const container = document.getElementById('challengeContainer');
    if (!container) return;
    
    if (!window.gameData || !window.gameData.challenges) {
        console.error('[CHALLENGES] gameData not loaded yet.');
        return;
    }

    container.innerHTML = '';
    
    window.gameData.challenges.forEach(challenge => {
        const card = document.createElement('div');
        card.className = 'card';
        card.onclick = async () => await selectChallenge(challenge);
        
        card.innerHTML = `
            <div class="challenge-difficulty">Difficulty ${challenge.difficulty}</div>
            <div class="card-title">${challenge.name}</div>
            <div class="card-description">${challenge.description}</div>
            <div class="card-description" style="margin-top: 0.75rem;">
                <span style="color: #d4af37;">Recommended Level: ${challenge.recommendedLevel}</span>
            </div>
            <div class="card-description" style="margin-top: 0.5rem;">
                ${challenge.minPartySize}-${challenge.maxPartySize} members
            </div>
        `;
        container.appendChild(card);
    });
}

/**
 * Start challenge flow from character detail
 */
function selectCharacterForChallenge(characterId) {
    currentState.detailCharacterId = characterId;
    renderChallenges();
    showScreen('challenge');
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
        `Difficulty ${challenge.difficulty} • Recommended Level ${challenge.recommendedLevel}`;
    
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
                <div class="party-member-stats">Level ${member.level} • HP: ${formatNumber(derivedStats.hp)}</div>
            </div>
            ${idx > 0 ? `<button onclick="removeFromParty(${idx})" class="danger" style="padding: 0.5rem 1rem;">Remove</button>` : ''}
        `;
        container.appendChild(memberEl);
    });
}

/**
 * Render available bots for selection
 */
function renderBotsSelection() {
    const container = document.getElementById('botsDisplay');
    if (!container) return;
    
    container.innerHTML = '';
    
    const challenge = currentState.selectedChallenge;
    if (!challenge || !window.gameData || !window.gameData.bots) return;
    
    window.gameData.bots.forEach(bot => {
        const isSelected = currentState.currentParty.some(m => m.characterID === bot.characterID);
        const canAdd = currentState.currentParty.length < challenge.maxPartySize && !isSelected;
        
        const derivedStats = calculateDerivedStats(bot);
        const card = document.createElement('div');
        card.className = 'card';
        if (isSelected) card.classList.add('selected');
        
        card.innerHTML = `
            <div class="card-title">${bot.characterName}</div>
            <div class="card-subtitle">Level ${bot.level}</div>
            <div class="card-description" style="margin-bottom: 0.75rem;">
                HP: ${formatNumber(derivedStats.hp)}
            </div>
        `;
        
        if (canAdd) {
            card.style.cursor = 'pointer';
            card.onclick = () => addBotToParty(bot);
        } else if (isSelected) {
            card.style.cursor = 'pointer';
            card.onclick = () => removeBotFromParty(bot.characterID);
        } else {
            card.style.opacity = '0.5';
            card.style.cursor = 'not-allowed';
        }
        
        container.appendChild(card);
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
            isImported: member.isImported || false
        }));

        const requestBody = {
            partySnapshots,
            challengeID: currentState.selectedChallenge.id,
            challenges: window.gameData.challenges
        };

        // Save Current Challenge ID to Window for Fallback
        window.lastChallengeId = currentState.selectedChallenge.id;

        // Mark the idle loop as active so character detail can show the banner
        currentState.idleActive = true;
        currentState.pendingLoopExit = false;
        updateChallengeStatusBanner();

        console.log('[COMBAT] Starting combat:', requestBody.challengeID);

        const response = await fetch(`${BACKEND_URL}/api/combat/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const combatResult = await response.json();

        console.log('[COMBAT] Server response received. Result:', combatResult.result);
        
        if (combatResult.nextChallengeId) {
            console.log('[COMBAT] Server suggests next challenge:', combatResult.nextChallengeId);
        }

        showScreen('combatlog'); 
        displayCombatLog(combatResult); 

    } catch (error) {
        console.error('Combat error:', error);
        showError('Failed to start combat: ' + error.message);
    }
}

/**
 * Load public characters for companion selection
 */
async function loadPublicCompanions() {
    const container = document.getElementById('publicCompanionsList');
    if (!container) return;
    
    container.innerHTML = '<div class="card" style="text-align: center; color: #8b7355; grid-column: 1 / -1;">Loading...</div>';
    
    try {
        const levelFilter = document.getElementById('publicLevelFilter');
        const sortFilter = document.getElementById('publicSortFilter');
        const searchFilter = document.getElementById('publicSearchFilter');

        const level = levelFilter ? levelFilter.value : '';
        const sortBy = sortFilter ? sortFilter.value : 'imports';
        const search = searchFilter ? searchFilter.value : '';
        
        // FIX #3: Only append 'level' if it has a value, to avoid sending
        // an empty level= param that may cause unintended server-side filtering.
        const params = new URLSearchParams({ sortBy, limit: '20' });
        if (level) params.append('level', level);
        const response = await fetch(`${BACKEND_URL}/api/character/browse?${params}`);
        
        if (!response.ok) throw new Error('Failed to load');
        
        const data = await response.json();
        
        let characters = data.characters;
        if (search) {
            const searchLower = search.toLowerCase();
            characters = characters.filter(c => 
                c.characterName.toLowerCase().includes(searchLower) ||
                c.buildName?.toLowerCase().includes(searchLower)
            );
        }
        
        if (characters.length === 0) {
            container.innerHTML = '<div class="card" style="text-align: center; color: #8b7355; grid-column: 1 / -1;">No characters found</div>';
            return;
        }
        
        const deviceId = getDeviceId();

        // FIX #4: Build cards using DOM methods and data-* attributes instead of
        // inline onclick strings, eliminating the XSS risk from user-supplied
        // character names and race values that previously only escaped single quotes.
        container.innerHTML = '';
        characters.forEach(char => {
            const stats = char.combatStats || {};
            const isOwn = deviceId && char.ownerUserId && char.ownerUserId === deviceId;
            const alreadyAdded = currentState.currentParty.some(m => m.originalCharacterId === char.originalCharacterId);
            const disabled = isOwn || alreadyAdded;
            const disabledLabel = isOwn ? 'Your Character' : alreadyAdded ? 'Already in Party' : null;

            const card = document.createElement('div');
            card.className = 'card';

            if (disabled) {
                card.style.opacity = '0.45';
                card.style.cursor = 'not-allowed';
            } else {
                card.style.cursor = 'pointer';
                card.dataset.shareCode = char.shareCode;
                card.dataset.characterName = char.characterName;
                card.dataset.level = char.level;
                card.dataset.race = char.race;
                card.addEventListener('click', () => {
                    addPublicCompanion(
                        card.dataset.shareCode,
                        card.dataset.characterName,
                        Number(card.dataset.level),
                        card.dataset.race
                    );
                });
            }

            card.innerHTML = `
                <div class="card-title">${escapeHtml(char.characterName)}</div>
                <div class="card-subtitle">Level ${char.level} ${escapeHtml(char.race)}</div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; margin-top: 0.5rem;">
                    <div style="background: rgba(10, 14, 39, 0.6); padding: 0.25rem; border-radius: 4px; text-align: center;">
                        <div style="color: #8b7355; font-size: 0.7rem;">Wins</div>
                        <div style="color: #4cd964; font-weight: bold;">${stats.wins || 0}</div>
                    </div>
                    <div style="background: rgba(10, 14, 39, 0.6); padding: 0.25rem; border-radius: 4px; text-align: center;">
                        <div style="color: #8b7355; font-size: 0.7rem;">Win Rate</div>
                        <div style="color: #d4af37; font-weight: bold;">${stats.winRate || '0.000'}</div>
                    </div>
                </div>
                <div style="margin-top: 0.5rem; color: #8b7355; font-size: 0.75rem; text-align: center;">
                    Imported by ${char.importCount || 0} players
                </div>
                <button class="secondary" style="width: 100%; margin-top: 0.5rem; font-size: 0.85rem;" ${disabled ? 'disabled' : ''}>${disabledLabel || 'Add to Party'}</button>
            `;

            container.appendChild(card);
        });
        
    } catch (error) {
        console.error('Load public companions error:', error);
        container.innerHTML = '<div class="card" style="text-align: center; color: #d4484a; grid-column: 1 / -1;">Failed to load public characters</div>';
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
                <span style="color:#ffd700;">⏳ Finishing current challenge...</span>
                <span style="color:#aaa; font-size:0.85em; margin-left:8px;">Will return here when done.</span>
            `;
            // returnFromChallengeBtn was replaced by innerHTML — re-hide not needed
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
    console.log('[IDLE] Loop exit requested — will stop after current combat.');
}
