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
        
        const response = await fetch(`${BACKEND_URL}/api/combat/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        
        const combatResult = await response.json();
        displayCombatLog(combatResult);
        showScreen('combatlog');
    } catch (error) {
        console.error('Combat error:', error);
        showError('Failed to start combat: ' + error.message);
    }
}