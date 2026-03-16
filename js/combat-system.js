// combat-system.js
// Handles challenge selection, party formation, and combat execution

/**
 * Render available challenges
 */
function renderChallenges() {
    const container = document.getElementById('challengeContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    gameData.challenges.forEach(challenge => {
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
    renderPartyFormation();
    showScreen('party');
}

/**
 * Render party formation screen
 */
async function renderPartyFormation() {
    const character = await getCharacter(currentState.detailCharacterId);  // ← ADD await
    if (!character) {
        showError('Failed to load character');
        return;
    }
    currentState.currentParty = [character];
    
    const challenge = currentState.selectedChallenge;
    if (!challenge) return;
    
    document.getElementById('partyChallengeName').textContent = challenge.name;
    document.getElementById('partyChallengeMeta').textContent = 
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
    
    gameData.bots.forEach(bot => {
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
 * ADDED: For savestate sharing system
 */
async function addPublicCompanion(shareCode, characterName, level, race) {
    // Check party size limit
    const challenge = currentState.selectedChallenge;
    const maxPartySize = challenge?.maxPartySize || 4;
    
    if (currentState.currentParty.length >= maxPartySize) {
        showError('Party is full!');
        return;
    }
    
    try {
        // Import the character first to get a reference
        const response = await fetch(`${BACKEND_URL}/api/character/import/${shareCode}`);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Import failed');
        }
        
        const data = await response.json();

        // Prevent a player from using their own exported character as a companion.
        // Check against every non-imported party member (i.e. characters they own).
        const deviceId = getDeviceId();
        if (!isDevMode() && deviceId && data.importReference.ownerUserId === deviceId) {
            showError('You cannot use your own character as a companion.');
            return;
        }

        // Also prevent adding the same import twice
        const alreadyInParty = currentState.currentParty.some(
            m => m.originalCharacterId === data.importReference.originalCharacterId
        );
        if (alreadyInParty) {
            showError(`${data.importReference.originalCharacterName} is already in your party.`);
            return;
        }

        // Add to current party
        currentState.currentParty.push({
            characterID: data.importReference.importId,
            characterName: data.importReference.originalCharacterName,
            level: data.importReference.level,
            race: data.importReference.race,
            isImported: true,
            isBot: false,
            originalCharacterId: data.importReference.originalCharacterId,
            canReExport: false
        });
        
        // Save to localStorage for persistence
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
        
        showSuccess(`Added ${characterName} to party!`);
        renderCurrentParty();
        renderBotsSelection();
        
    } catch (error) {
        console.error('Add public companion error:', error);
        showError('Failed to add character: ' + error.message);
    }
}

/**
 * Start combat
 */
async function startCombat() {
    try {
        const partySnapshots = currentState.currentParty.map(member => ({
            characterID: member.characterID || member.id,
            characterName: member.characterName || member.name,
            level: member.level,
            stats: member.stats,
            skills: member.skills,
            consumables: member.consumables || {},
            equipment: member.equipment
        }));
        
        const requestBody = {
            partySnapshots,
            challengeID: currentState.selectedChallenge.id,
            challenges: gameData.challenges
        };
        
        console.log('[COMBAT] Starting combat with request:', requestBody.challengeID);

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
        
        // ✅ FIX: Switch to the combat screen IMMEDIATELY
        showScreen('combatlog'); 

        // ✅ THEN start the playback (which will now be visible)
        // We remove 'await' here so the function returns immediately and doesn't block UI
        displayCombatLog(combatResult); 
        
    } catch (error) {
        console.error('Combat error:', error);
        showError('Failed to start combat: ' + error.message);
    }
}

/**
 * Load public characters for companion selection
 * ADDED: For savestate sharing system
 */
async function loadPublicCompanions() {
    const container = document.getElementById('publicCompanionsList');
    if (!container) return;
    
    container.innerHTML = '<div class="card" style="text-align: center; color: #8b7355; grid-column: 1 / -1;">Loading...</div>';
    
    try {
        const level = document.getElementById('publicLevelFilter')?.value || '';
        const sortBy = document.getElementById('publicSortFilter')?.value || 'imports';
        const search = document.getElementById('publicSearchFilter')?.value || '';
        
        const params = new URLSearchParams({ level, sortBy, limit: '20' });
        const response = await fetch(`${BACKEND_URL}/api/character/browse?${params}`);
        
        if (!response.ok) throw new Error('Failed to load');
        
        const data = await response.json();
        
        // Filter by search term
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
        container.innerHTML = characters.map(char => {
            const stats = char.combatStats || {};
            const isOwn = !isDevMode() && char.ownerUserId && char.ownerUserId === deviceId;
            const alreadyAdded = currentState.currentParty.some(m => m.originalCharacterId === char.originalCharacterId);
            const disabled = isOwn || alreadyAdded;
            const disabledLabel = isOwn ? 'Your Character' : alreadyAdded ? 'Already in Party' : null;
            return `
                <div class="card"
                    ${disabled ? 'style="opacity:0.45;cursor:not-allowed;"' : `onclick="addPublicCompanion('${char.shareCode}', '${char.characterName.replace(/'/g, "\'")}', ${char.level}, '${char.race}')" style="cursor:pointer;"`}>
                    <div class="card-title">${char.characterName}</div>
                    <div class="card-subtitle">Level ${char.level} ${char.race}</div>
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
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Load public companions error:', error);
        container.innerHTML = '<div class="card" style="text-align: center; color: #d4484a; grid-column: 1 / -1;">Failed to load public characters</div>';
    }
}





