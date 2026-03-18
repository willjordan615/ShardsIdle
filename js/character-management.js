// character-management.js
// Handles character creation, roster display, and character detail screen

/**
 * Initialize character creation screen
 */
function initCharacterCreation() {
    renderRaceSelection();
    renderSkillSelection();
    renderWeaponSelection();
    renderStatAllocation();
}

/**
 * Get a character from server
 */
async function getCharacter(characterId) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/characters/${characterId}`);
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        const data = await response.json();
        return data.character;
    } catch (error) {
        console.error('Error loading character:', error);
        return null;
    }
}

/**
 * Save a NEW character to server (POST)
 */
async function saveCharacter(character) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/characters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(character)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }
        
        const data = await response.json();
        return data.character;
    } catch (error) {
        console.error('Error saving character:', error);
        showError('Failed to save character: ' + error.message);
        return null;
    }
}

/**
 * Update an EXISTING character on server (PUT)
 */
async function saveCharacterToServer(character) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/characters/${character.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(character)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to update character');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error saving character:', error);
        showError('Failed to save progress: ' + error.message);
    }
}

/**
 * Render available races for selection
 */
function renderRaceSelection() {
    const container = document.getElementById('raceSelect');
    if (!container) return;
    
    container.innerHTML = '';
    gameData.races.forEach(race => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-title">${race.name}</div>
            <div class="card-description">${race.description}</div>
        `;
        card.onclick = () => selectRace(race, card);
        container.appendChild(card);
    });
}

/**
 * Select a race and update UI
 */
function selectRace(race, element) {
    currentState.selectedRace = race;
    currentState.pointsRemaining = 25;
    currentState.allocatedStats = {
        conviction: 0,
        endurance: 0,
        ambition: 0,
        harmony: 0
    };
    
    // Update selected state
    document.querySelectorAll('#raceSelect .card').forEach(el => {
        el.classList.remove('selected');
    });
    element.classList.add('selected');
    
    // Show stat allocation section
    const allocationSection = document.getElementById('statAllocationSection');
    if (allocationSection) {
        allocationSection.style.display = 'block';
    }
    
    updateStatDisplay();
    renderStatAllocation();
}

/**
 * Update stat display showing base + allocated
 */
function updateStatDisplay() {
    const race = currentState.selectedRace;
    const allocated = currentState.allocatedStats;
    if (!race) return;
    
    document.getElementById('statConviction').textContent = race.baseStats.conviction + allocated.conviction;
    document.getElementById('statEndurance').textContent = race.baseStats.endurance + allocated.endurance;
    document.getElementById('statAmbition').textContent = race.baseStats.ambition + allocated.ambition;
    document.getElementById('statHarmony').textContent = race.baseStats.harmony + allocated.harmony;
}

/**
 * Render skill selection UI using two dropdown boxes
 */
function renderSkillSelection() {
    const container = document.getElementById('skillSelect');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Get only starter skills
    const starterSkills = gameData.skills.filter(s => s.isStarterSkill === true);
    const selected = currentState.selectedSkills;
    
    // Add instruction text
    const instruction = document.createElement('div');
    instruction.style.cssText = 'margin-bottom: 1rem; padding: 1rem; background: rgba(74, 158, 255, 0.1); border: 1px solid #4a9eff; border-radius: 4px; color: #4a9eff;';
    instruction.innerHTML = `<strong>Select exactly 2 starting skills:</strong> Choose one skill for each dropdown.`;
    container.appendChild(instruction);
    
    // Create grid for two dropdowns
    const gridContainer = document.createElement('div');
    gridContainer.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;';
    
    // Skill 1 Dropdown
    const skill1Container = document.createElement('div');
    skill1Container.innerHTML = 'Primary Skill';
    const skill1Select = document.createElement('select');
    skill1Select.style.cssText = 'width: 100%; padding: 0.75rem; background: #16213e; color: #d4af37; border: 1px solid #d4af37; border-radius: 4px; font-family: Courier New, monospace; font-size: 0.95rem; cursor: pointer;';
    
    const skill1Option = document.createElement('option');
    skill1Option.value = '';
    skill1Option.textContent = '-- Select a skill --';
    skill1Select.appendChild(skill1Option);
    
    starterSkills.forEach(skill => {
        const option = document.createElement('option');
        option.value = skill.id;
        option.textContent = skill.name;
        if (selected[0] === skill.id) option.selected = true;
        skill1Select.appendChild(option);
    });
    
    skill1Select.addEventListener('change', (e) => {
        const skill1 = e.target.value;
        const skill2 = selected[1] || '';
        
        if (skill1 && skill1 === skill2) {
            showError('You cannot select the same skill twice!');
            e.target.value = '';
            return;
        }
        
        if (skill1) {
            currentState.selectedSkills = [skill1, skill2].filter(s => s);
        } else {
            currentState.selectedSkills = [skill2].filter(s => s);
        }
        renderSkillSelection();
    });
    
    skill1Container.appendChild(skill1Select);
    
    if (selected[0]) {
        const skill1 = starterSkills.find(s => s.id === selected[0]);
        if (skill1) {
            const details = document.createElement('div');
            details.style.cssText = 'margin-top: 0.75rem; padding: 0.75rem; background: rgba(212, 175, 55, 0.1); border-left: 2px solid #d4af37; border-radius: 2px;';
            details.innerHTML = `
                <div style="color: #aaa; font-size: 0.9rem;">${skill1.description}</div>
                <div style="margin-top: 0.5rem; color: #888; font-size: 0.85rem;">
                    <strong>Cost:</strong> ${skill1.costAmount} ${skill1.costType}<br>
                    <strong>Category:</strong> ${skill1.category}
                </div>
            `;
            skill1Container.appendChild(details);
        }
    }
    
    gridContainer.appendChild(skill1Container);
    
    // Skill 2 Dropdown
    const skill2Container = document.createElement('div');
    skill2Container.innerHTML = 'Secondary Skill';
    const skill2Select = document.createElement('select');
    skill2Select.style.cssText = 'width: 100%; padding: 0.75rem; background: #16213e; color: #d4af37; border: 1px solid #d4af37; border-radius: 4px; font-family: Courier New, monospace; font-size: 0.95rem; cursor: pointer;';
    
    const skill2Option = document.createElement('option');
    skill2Option.value = '';
    skill2Option.textContent = '-- Select a skill --';
    skill2Select.appendChild(skill2Option);
    
    starterSkills.forEach(skill => {
        const option = document.createElement('option');
        option.value = skill.id;
        option.textContent = skill.name;
        if (selected[1] === skill.id) option.selected = true;
        skill2Select.appendChild(option);
    });
    
    skill2Select.addEventListener('change', (e) => {
        const skill2 = e.target.value;
        const skill1 = selected[0] || '';
        
        if (skill2 && skill2 === skill1) {
            showError('You cannot select the same skill twice!');
            e.target.value = '';
            return;
        }
        
        if (skill2) {
            currentState.selectedSkills = [skill1, skill2].filter(s => s);
        } else {
            currentState.selectedSkills = [skill1].filter(s => s);
        }
        renderSkillSelection();
    });
    
    skill2Container.appendChild(skill2Select);
    
    if (selected[1]) {
        const skill2 = starterSkills.find(s => s.id === selected[1]);
        if (skill2) {
            const details = document.createElement('div');
            details.style.cssText = 'margin-top: 0.75rem; padding: 0.75rem; background: rgba(212, 175, 55, 0.1); border-left: 2px solid #d4af37; border-radius: 2px;';
            details.innerHTML = `
                <div style="color: #aaa; font-size: 0.9rem;">${skill2.description}</div>
                <div style="margin-top: 0.5rem; color: #888; font-size: 0.85rem;">
                    <strong>Cost:</strong> ${skill2.costAmount} ${skill2.costType}<br>
                    <strong>Category:</strong> ${skill2.category}
                </div>
            `;
            skill2Container.appendChild(details);
        }
    }
    
    gridContainer.appendChild(skill2Container);
    container.appendChild(gridContainer);
    
    // Add selection status
    const statusMsg = document.createElement('div');
    statusMsg.style.cssText = 'margin-top: 1.5rem; padding: 0.75rem; text-align: center; border-radius: 4px;';
    if (selected.length === 2) {
        statusMsg.style.cssText += 'background: rgba(78, 255, 127, 0.1); color: #4eff7f; font-weight: bold;';
        statusMsg.textContent = '✓ 2 skills selected - Ready!';
    } else {
        statusMsg.style.cssText += 'background: rgba(255, 107, 107, 0.1); color: #ff6b6b; font-weight: bold;';
        statusMsg.textContent = `${selected.length} / 2 skills selected`;
    }
    container.appendChild(statusMsg);
}

/**
 * Render weapon type selection for character creation using dropdown
 */
function renderWeaponSelection() {
    const container = document.getElementById('weaponSelect');
    if (!container) return;
    
    container.innerHTML = '';
    
    const validWeaponTypes = [
        'sword', 'dagger', 'axe', 'handaxe', 'hammer', 'mace',
        'pistol', 'crossbow', 'wand', 'scepter', 'tome', 'totem',
        'bell', 'flute', 'shield'
    ];
    
    const tier0Weapons = gameData.gear.filter(item =>
        item.tier === 0 &&
        validWeaponTypes.includes(item.type)
    );
    
    const weaponTypes = [...new Set(tier0Weapons.map(item => item.type))].sort();
    
    if (weaponTypes.length === 0) {
        container.innerHTML = '<p style="color: #ff6b6b;">Error: No tier 0 weapons found!</p>';
        return;
    }
    
    const instruction = document.createElement('div');
    instruction.style.cssText = 'margin-bottom: 1rem; padding: 1rem; background: rgba(74, 158, 255, 0.1); border: 1px solid #4a9eff; border-radius: 4px; color: #4a9eff;';
    instruction.innerHTML = `<strong>Select a starting weapon type:</strong> You'll begin with a tier 0 weapon of this type.`;
    container.appendChild(instruction);
    
    const dropdownContainer = document.createElement('div');
    dropdownContainer.style.cssText = 'max-width: 400px;';
    
    const label = document.createElement('label');
    label.style.cssText = 'display: block; margin-bottom: 0.5rem; color: #d4af37; font-weight: bold;';
    label.textContent = 'Weapon Type';
    dropdownContainer.appendChild(label);
    
    const weaponSelect = document.createElement('select');
    weaponSelect.style.cssText = 'width: 100%; padding: 0.75rem; background: #16213e; color: #d4af37; border: 1px solid #d4af37; border-radius: 4px; font-family: Courier New, monospace; font-size: 0.95rem; cursor: pointer;';
    
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- Select a weapon type --';
    weaponSelect.appendChild(defaultOption);
    
    weaponTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type.charAt(0).toUpperCase() + type.slice(1);
        if (currentState.selectedWeaponType === type) option.selected = true;
        weaponSelect.appendChild(option);
    });
    
    weaponSelect.addEventListener('change', (e) => {
        currentState.selectedWeaponType = e.target.value;
        renderWeaponSelection();
    });
    
    dropdownContainer.appendChild(weaponSelect);
    container.appendChild(dropdownContainer);
    
    if (currentState.selectedWeaponType) {
        const tier0Weapon = tier0Weapons.find(item => item.type === currentState.selectedWeaponType);
        if (tier0Weapon) {
            const detailsContainer = document.createElement('div');
            detailsContainer.style.cssText = 'margin-top: 1.5rem; padding: 1rem; background: #16213e; border: 1px solid #444; border-radius: 4px;';
            
            const weaponName = document.createElement('div');
            weaponName.style.cssText = 'color: #d4af37; font-weight: bold; margin-bottom: 0.75rem; font-size: 1.1rem;';
            weaponName.textContent = tier0Weapon.name;
            detailsContainer.appendChild(weaponName);
            
            if (tier0Weapon.description) {
                const desc = document.createElement('div');
                desc.style.cssText = 'color: #aaa; font-size: 0.9rem; margin-bottom: 0.75rem;';
                desc.textContent = tier0Weapon.description;
                detailsContainer.appendChild(desc);
            }
            
            const statsDiv = document.createElement('div');
            statsDiv.style.cssText = 'color: #888; font-size: 0.85rem;';
            
            let statsHTML = '';
            if (tier0Weapon.dmg1) {
                statsHTML += `<strong>Damage:</strong> ${tier0Weapon.dmg1} ${tier0Weapon.dmg_type_1}`;
                if (tier0Weapon.dmg2) statsHTML += ` + ${tier0Weapon.dmg2} ${tier0Weapon.dmg_type_2}`;
                statsHTML += '<br>';
            }
            if (tier0Weapon.armor) {
                statsHTML += `<strong>Armor:</strong> ${tier0Weapon.armor}<br>`;
            }
            statsHTML += `<strong>Delay:</strong> ${tier0Weapon.delay || 0}ms`;
            
            statsDiv.innerHTML = statsHTML;
            detailsContainer.appendChild(statsDiv);
            container.appendChild(detailsContainer);
        }
    }
    
    const statusMsg = document.createElement('div');
    statusMsg.style.cssText = 'margin-top: 1.5rem; padding: 0.75rem; text-align: center; border-radius: 4px;';
    if (currentState.selectedWeaponType) {
        statusMsg.style.cssText += 'background: rgba(78, 255, 127, 0.1); color: #4eff7f; font-weight: bold;';
        statusMsg.textContent = `✓ Selected: ${currentState.selectedWeaponType}`;
    } else {
        statusMsg.style.cssText += 'background: rgba(255, 107, 107, 0.1); color: #ff6b6b; font-weight: bold;';
        statusMsg.textContent = 'No weapon selected';
    }
    container.appendChild(statusMsg);
}

/**
 * Render stat allocation UI
 */
function renderStatAllocation() {
    const container = document.getElementById('statAllocationContainer');
    if (!container) return;
    
    const allocated = currentState.allocatedStats;
    const remaining = currentState.pointsRemaining;
    
    container.innerHTML = `
        <p style="margin-bottom: 1rem; color: #d4af37;">Points Remaining: ${remaining}</p>
        <div class="stat-allocation-grid">
            <div class="stat-allocation-item">
                <div class="stat-tooltip" data-tooltip="Conviction increases hit chance, critical strike chance, and damage scaling.">Conviction</div>
                <div style="display: flex; gap: 0.5rem; align-items: center; justify-content: center;">
                    <button onclick="modifyStat('conviction', -1)" class="mini-btn">−</button>
                    <div class="stat-value" style="min-width: 30px; text-align: center;">${allocated.conviction}</div>
                    <button onclick="modifyStat('conviction', 1)" class="mini-btn" ${remaining <= 0 ? 'disabled' : ''}>+</button>
                </div>
            </div>
            <div class="stat-allocation-item">
                <div class="stat-tooltip" data-tooltip="Endurance increases maximum HP, Stamina, and damage mitigation.">Endurance</div>
                <div style="display: flex; gap: 0.5rem; align-items: center; justify-content: center;">
                    <button onclick="modifyStat('endurance', -1)" class="mini-btn">−</button>
                    <div class="stat-value" style="min-width: 30px; text-align: center;">${allocated.endurance}</div>
                    <button onclick="modifyStat('endurance', 1)" class="mini-btn" ${remaining <= 0 ? 'disabled' : ''}>+</button>
                </div>
            </div>
            <div class="stat-allocation-item">
                <div class="stat-tooltip" data-tooltip="Ambition improves initiative, retreat success chance, and certain skill effects.">Ambition</div>
                <div style="display: flex; gap: 0.5rem; align-items: center; justify-content: center;">
                    <button onclick="modifyStat('ambition', -1)" class="mini-btn">−</button>
                    <div class="stat-value" style="min-width: 30px; text-align: center;">${allocated.ambition}</div>
                    <button onclick="modifyStat('ambition', 1)" class="mini-btn" ${remaining <= 0 ? 'disabled' : ''}>+</button>
                </div>
            </div>
            <div class="stat-allocation-item">
                <div class="stat-tooltip" data-tooltip="Harmony boosts maximum Mana, healing power, and group synergy effects.">Harmony</div>
                <div style="display: flex; gap: 0.5rem; align-items: center; justify-content: center;">
                    <button onclick="modifyStat('harmony', -1)" class="mini-btn">−</button>
                    <div class="stat-value" style="min-width: 30px; text-align: center;">${allocated.harmony}</div>
                    <button onclick="modifyStat('harmony', 1)" class="mini-btn" ${remaining <= 0 ? 'disabled' : ''}>+</button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Modify stat allocation
 */
function modifyStat(statName, amount) {
    const allocated = currentState.allocatedStats;
    const newValue = allocated[statName] + amount;
    
    if (newValue < 0) return;
    if (amount > 0 && currentState.pointsRemaining <= 0) return;
    
    allocated[statName] = newValue;
    currentState.pointsRemaining -= amount;
    
    updateStatDisplay();
    renderStatAllocation();
}

/**
 * Create a Character - WITH COMPLETE SAVESTATE FIELDS
 */
async function createCharacter() {
    const name = document.getElementById('characterName').value.trim();
    const messagesDiv = document.getElementById('creationMessages');
    
    // Validation 1: Character name
    if (!name) {
        messagesDiv.innerHTML = '<p style="color: #ff6b6b;">Please enter a character name.</p>';
        return;
    }
    
    // Validation 2: Race selected
    if (!currentState.selectedRace) {
        messagesDiv.innerHTML = '<p style="color: #ff6b6b;">Please select a race.</p>';
        return;
    }
    
    // Validation 3: Exactly 2 skills selected
    if (currentState.selectedSkills.length !== 2) {
        messagesDiv.innerHTML = '<p style="color: #ff6b6b;">You must select exactly 2 starting skills.</p>';
        return;
    }
    
    // Validation 4: Weapon type selected
    if (!currentState.selectedWeaponType) {
        messagesDiv.innerHTML = '<p style="color: #ff6b6b;">Please select a starting weapon type.</p>';
        return;
    }
    
    // Validation 5: All stat points allocated
    if (currentState.pointsRemaining > 0) {
        messagesDiv.innerHTML = '<p style="color: #ff6b6b;">You must allocate all your stat points.</p>';
        return;
    }
    
    // Get tier 0 weapon for selected type
    const tier0Weapon = gameData.gear.find(item =>
        item.type === currentState.selectedWeaponType &&
        item.tier === 0
    );
    
    if (!tier0Weapon) {
        messagesDiv.innerHTML = '<p style="color: #ff6b6b;">Could not find starting weapon. Please select a different weapon type.</p>';
        return;
    }
    
    // ===== COMPLETE CHARACTER OBJECT WITH ALL SAVESTATE FIELDS =====
    const character = {
        id: 'char_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16),
        name: name,
        race: currentState.selectedRace.id,
        stats: {
            conviction: currentState.selectedRace.baseStats.conviction + currentState.allocatedStats.conviction,
            endurance: currentState.selectedRace.baseStats.endurance + currentState.allocatedStats.endurance,
            ambition: currentState.selectedRace.baseStats.ambition + currentState.allocatedStats.ambition,
            harmony: currentState.selectedRace.baseStats.harmony + currentState.allocatedStats.harmony
        },
        level: 1,
        experience: 0,
        equipment: {
            mainHand: tier0Weapon.id,
            offHand: null,
            head: null,
            chest: null,
            accessory1: null,
            accessory2: null
        },
        skills: currentState.selectedSkills.map(skillId => ({
            skillID: skillId,
            learned: true,
            usageCount: 0,
            skillXP: 0,
            skillLevel: 1,
            lastUsed: null
        })),
        consumables: {},
        inventory: [],
        
        // ===== SAVESTATE SHARING FIELDS (THESE WERE MISSING!) =====
        unlockedCombos: [],
        combatStats: {
            totalCombats: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            retreats: 0,
            totalDamageDealt: 0,
            totalDamageTaken: 0,
            totalHealingDone: 0,
            enemyKills: {},
            challengeCompletions: {},
            statusEffectsApplied: {},
            skillUsage: {},
            milestones: {}
        },
        partyStats: {
            totalPartiesJoined: 0,
            uniquePartyMembers: [],
            totalPartyWins: 0,
            totalPartyLosses: 0,
            favoritePartyMembers: []
        },
        ownerUserId: getDeviceId(),
        isPublic: false,
        shareCode: null,
        buildName: null,
        buildDescription: null,
        importCount: 0,
        lastSharedAt: null,
        avatarId: null,
        avatarColor: null,
        avatarFrame: null,
        title: null,
        aiProfile: document.getElementById('aiProfileSelect')?.value || 'balanced',
        lastActiveAt: Date.now(),
        createdAt: Date.now(),
        lastModified: Date.now()
    };
    
    gameData.characters.push(character);
    
    // Save to server (POST for new character)
    const saved = await saveCharacter(character);
    if (!saved) {
        messagesDiv.innerHTML = '<p style="color: #ff6b6b;">Failed to save character. Check console for details.</p>';
        return;
    }
    
    messagesDiv.innerHTML = '<p style="color: #4eff7f;">Character created successfully!</p>';
    
    setTimeout(() => {
        document.getElementById('characterName').value = '';
        currentState.selectedRace = null;
        currentState.selectedSkills = [];
        currentState.selectedWeaponType = null;
        currentState.allocatedStats = { conviction: 0, endurance: 0, ambition: 0, harmony: 0 };
        currentState.pointsRemaining = 25;
        
        renderRaceSelection();
        renderSkillSelection();
        renderWeaponSelection();
        renderStatAllocation();
        messagesDiv.innerHTML = '';
        
        renderRoster();
        showScreen('roster');
    }, 1500);
}

/**
 * Render the character roster from server database
 */
async function renderRoster() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/characters`);
        if (!response.ok) {
            throw new Error('Failed to load characters');
        }
        
        const data = await response.json();
        const characters = data.characters;
        
        const container = document.getElementById('rosterContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (characters.length === 0) {
            container.innerHTML = '<p style="color: #8b7355; grid-column: 1 / -1; text-align: center;">No characters yet. Create one to begin your adventure.</p>';
            return;
        }
        
        characters.forEach(character => {
            const race = getRace(character.race);
            const mentality = getMentality(character.stats);
            const characterClass = getCharacterClass(character, gameData.skills);
            
            const card = document.createElement('div');
            card.className = 'card';
            card.onclick = async () => await showCharacterDetail(character.id);
            
            const skillNames = character.skills
                .slice(0, 3)
                .map(s => {
                    const skill = gameData.skills.find(sk => sk.id === s.skillID);
                    return skill ? skill.name : 'Unknown';
                })
                .join(', ');
            
            card.innerHTML = `
                <div class="card-title">
                    <h3>${character.name}</h3>
                    <div class="card-description" style="margin-bottom: 0.75rem; color: #d4af37; font-size: 0.8rem;">
                        <strong>Skills:</strong> ${skillNames || 'None yet'}
                    </div>
                </div>
                <div class="card-subtitle">Level ${character.level} • ${mentality} ${characterClass}</div>
                <div class="card-description" style="margin-bottom: 1rem; color: #8b7355; font-style: italic;">${race ? race.name : 'Unknown'}</div>
            `;
            container.appendChild(card);
        });
    } catch (error) {
        console.error('Error rendering roster:', error);
        showError('Failed to load characters: ' + error.message);
    }
}

/**
 * Show character detail screen
 */
async function showCharacterDetail(characterId) {
    try {
        const character = await getCharacter(characterId);
        if (!character) {
            showError('Character not found');
            return;
        }
        
        currentState.detailCharacterId = characterId;
        const race = getRace(character.race);
        const xpToNextLevel = getXPToNextLevel(character.level);
        const xpPercent = getProgressPercent(character.experience, xpToNextLevel);
        
        document.getElementById('detailName').textContent = character.name;
        document.getElementById('detailRace').textContent = race ? race.name : 'Unknown';
        document.getElementById('detailLevel').textContent = character.level;
        
        const totalStats = calculateTotalStats(character);
        document.getElementById('detailConviction').textContent = totalStats.conviction;
        addStatTooltip(document.getElementById('detailConviction'), 'conviction', 400);
        document.getElementById('detailEndurance').textContent = totalStats.endurance;
        addStatTooltip(document.getElementById('detailEndurance'), 'endurance', 400);
        document.getElementById('detailAmbition').textContent = totalStats.ambition;
        addStatTooltip(document.getElementById('detailAmbition'), 'ambition', 400);
        document.getElementById('detailHarmony').textContent = totalStats.harmony;
        addStatTooltip(document.getElementById('detailHarmony'), 'harmony', 400);
        
        const derived = calculateDerivedStatsWithEquipment(character);
        document.getElementById('detailHP').textContent = derived.hp;
        document.getElementById('detailMana').textContent = derived.mana;
        document.getElementById('detailStamina').textContent = derived.stamina;
        
        document.getElementById('xpBar').style.width = xpPercent + '%';
        document.getElementById('xpText').textContent = `${formatNumber(character.experience)}/${formatNumber(xpToNextLevel)}`;
        
        const inventoryDisplay = document.getElementById('inventoryDisplay');
        if (inventoryDisplay) {
            inventoryDisplay.innerHTML = '';
            if (character.inventory && character.inventory.length > 0) {
                character.inventory.forEach(item => {
                    const gear = gameData.gear.find(g => g.id === item.itemID);
                    const rarityColor = 
                        item.rarity === 'rare' ? '#ffd700' :
                        item.rarity === 'uncommon' ? '#00ccff' : '#8b7355';
                    
                    const itemCard = document.createElement('div');
                    itemCard.className = 'item-card';
                    itemCard.style.borderColor = rarityColor;
                    itemCard.innerHTML = `
                        <div class="item-name">${gear?.name || item.itemID}</div>
                        <div class="item-rarity" style="color: ${rarityColor};">${item.rarity}</div>
                        ${gear?.description ? `<div class="item-desc">${gear.description}</div>` : ''}
                        <div class="item-date">Acquired: ${new Date(item.acquiredAt).toLocaleDateString()}</div>
                    `;
                    inventoryDisplay.appendChild(itemCard);
                });
            } else {
                inventoryDisplay.innerHTML = '<p class="empty-inventory" style="text-align: center; color: #aaa;">No items yet — defeat enemies to earn loot!</p>';
            }
        }
        
        renderEquippedGear(character);
        renderCharacterSkills(character);
        renderConsumableBelt(character);
        renderExportButton(character); 
renderImportBadge(character);
        renderCombatHistory(characterId);

        // Populate Combat Style section
        const profile = character.aiProfile || 'balanced';
        const profileLabels = {
            balanced:    '⚖️ Balanced',
            aggressive:  '⚔️ Aggressive',
            cautious:    '🛡️ Cautious',
            support:     '💚 Support',
            disruptor:   '🌀 Disruptor',
            opportunist: '🗡️ Opportunist'
        };
        const badge = document.getElementById('aiProfileBadge');
        if (badge) badge.textContent = profileLabels[profile] || profile;
        const select = document.getElementById('aiProfileDetailSelect');
        if (select) select.value = profile;
        const msg = document.getElementById('aiProfileSaveMsg');
        if (msg) msg.textContent = '';

        showScreen('detail');
        // Refresh idle loop status banner whenever character detail is shown
        if (typeof updateChallengeStatusBanner === 'function') updateChallengeStatusBanner();
    } catch (error) {
        console.error('Error showing character detail:', error);
        showError('Failed to load character details');
    }
}

/**
 * Render equipped gear on detail screen
 */
function renderEquippedGear(character) {
    const container = document.getElementById('equippedDisplay');
    if (!container) return;
    
    container.innerHTML = '';
    const displaySlots = ['mainHand', 'offHand', 'head', 'chest', 'accessory1', 'accessory2'];
    
    displaySlots.forEach(slot => {
        const itemId = character.equipment[slot];
        const item = itemId ? gameData.gear.find(g => g.id === itemId) : null;
        
        const slotEl = document.createElement('div');
        slotEl.className = 'equipment-slot';
        
        let bonusText = '';
        if (item) {
            const bonuses = [];
            if (item.hp) bonuses.push(`+${item.hp} HP`);
            if (item.mana) bonuses.push(`+${item.mana} Mana`);
            if (item.con) bonuses.push(`+${item.con} CON`);
            if (item.end) bonuses.push(`+${item.end} END`);
            if (item.amb) bonuses.push(`+${item.amb} AMB`);
            if (item.har) bonuses.push(`+${item.har} HAR`);
            bonusText = bonuses.length > 0 ? `<div class="slot-bonus">${bonuses.join(', ')}</div>` : '';
        }
        
        slotEl.innerHTML = `
            <div class="slot-type">${slot}</div>
            <div class="slot-item">${item ? item.name : '(Empty)'}</div>
            ${bonusText}
        `;
        
        if (item) {
            addEquippedGearTooltip(slotEl, item, 800);
        }
        
        container.appendChild(slotEl);
    });
}

/**
 * Render character skills with TWO DROPDOWNS/SLOTS for active equipment.
 * Assumes: character.skills[0] and [1] are the equipped slots.
 * Items at index 2+ are owned but unequipped.
 */
async function renderCharacterSkills(character) {
    const container = document.getElementById('skillDisplay');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Ensure we have an array
    if (!character.skills) character.skills = [];

    const TOTAL_SLOTS = 2;
    
    // Render the 2 Equipment Slots
    for (let i = 0; i < TOTAL_SLOTS; i++) {
        const slotIndex = i;
        // Get the skill currently in this slot (if any)
        const skillRecord = character.skills[slotIndex] || null;
        
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = 'flex:1; margin:5px; min-width:140px; border: 1px solid #d4af37; background: rgba(20,30,50,0.8); position:relative; display:flex; flex-direction:column; justify-content:space-between;';
        
        if (skillRecord) {
            const skillDef = window.gameData.skills.find(s => s.id === skillRecord.skillID);
            
            if (skillDef) {
                // Content
                const contentDiv = document.createElement('div');
                contentDiv.innerHTML = `
                    <div class="card-title" style="color:#ffd700;">${skillDef.name}</div>
                    <div class="card-description">Level ${skillRecord.skillLevel || 1}</div>
                    <div class="card-description" style="margin-top: 0.5rem; font-size:0.8em; color:#aaa;">XP: ${skillRecord.skillXP ? skillRecord.skillXP.toFixed(2) : '0'}</div>
                `;
                card.appendChild(contentDiv);
                
                // Add Tooltip
                addSkillTooltip(card, skillDef, 500);

                // Swap Button
                const btn = document.createElement('button');
                btn.textContent = '🔄 Change Skill';
                btn.style.cssText = 'margin-top:10px; width:100%; padding:5px; background:#2a4a6a; color:#fff; border:1px solid #4a6a8a; cursor:pointer;';
                btn.onclick = () => openSkillSwapModal(character, slotIndex);
                card.appendChild(btn);
            } else {
                // Corrupt data
                card.innerHTML = `<div class="card-title" style="color:red;">Unknown Skill</div><div class="card-description">ID: ${skillRecord.skillID}</div>`;
            }
        } else {
            // Empty Slot
            card.innerHTML = `
                <div class="card-title" style="color:#666;">Empty Slot ${slotIndex + 1}</div>
                <div class="card-description">No skill equipped</div>
                <button id="swap-btn-${slotIndex}" style="margin-top:10px; width:100%; padding:5px; background:#2a4a6a; color:#fff; border:1px solid #4a6a8a; cursor:pointer;">
                    ⚡ Equip Skill
                </button>
            `;
            const btn = card.querySelector(`#swap-btn-${slotIndex}`);
            if (btn) btn.onclick = () => openSkillSwapModal(character, slotIndex);
        }
        
        container.appendChild(card);
    }

    // --- DISCOVERED SKILLS (level 0 — not yet equippable) ---
    // Skills that have been discovered via child skill proc but haven't reached level 1 yet.
    // They live at index 2+ in character.skills. Show XP progress toward the 120 unlock threshold.
    const discoveredLocked = character.skills.slice(2).filter(
        rec => rec.discovered && (rec.skillLevel || 0) < 1
    );

    if (discoveredLocked.length > 0) {
        const section = document.createElement('div');
        section.style.cssText = 'width:100%; margin-top:14px;';

        const heading = document.createElement('div');
        heading.style.cssText = 'color:#d4af37; font-size:0.8em; letter-spacing:1px; margin-bottom:6px; text-transform:uppercase;';
        heading.textContent = '\u{1F52E} Discovered (Unlocking...)';
        section.appendChild(heading);

        const UNLOCK_THRESHOLD = 120;

        discoveredLocked.forEach(rec => {
            const skillDef = window.gameData?.skills?.find(s => s.id === rec.skillID);
            const name = skillDef?.name || rec.skillID;
            const xp   = rec.skillXP || 0;
            const pct  = Math.min(100, Math.floor((xp / UNLOCK_THRESHOLD) * 100));

            const row = document.createElement('div');
            row.style.cssText = 'background:rgba(212,175,55,0.07); border:1px solid rgba(212,175,55,0.3); border-radius:6px; padding:8px 10px; margin-bottom:6px;';
            row.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="color:#d4af37; font-weight:bold; font-size:0.9em;">${name}</span>
                    <span style="color:#aaa; font-size:0.75em;">${xp.toFixed(0)} / ${UNLOCK_THRESHOLD} XP</span>
                </div>
                <div style="background:#0f0f1e; border-radius:3px; height:6px; overflow:hidden;">
                    <div style="background:linear-gradient(90deg,#d4af37,#ffe066); width:${pct}%; height:100%; transition:width 0.3s;"></div>
                </div>
                <div style="color:#888; font-size:0.72em; margin-top:3px;">
                    ${skillDef?.description || 'Discovered in combat — keep fighting to unlock.'}
                </div>
            `;
            section.appendChild(row);
        });

        container.appendChild(section);
    }
}

/**
 * Opens a modal to swap a skill in the specified slot index (0 or 1).
 */
async function openSkillSwapModal(character, slotIndex) {
    let modal = document.getElementById('skillSwapModal');
    
    // Create modal if it doesn't exist
    if (!modal) {
        createSkillSwapModalHTML();
        modal = document.getElementById('skillSwapModal');
    }

    const modalTitle = document.getElementById('skillSwapTitle');
    const modalList = document.getElementById('skillSwapList');
    
    if (!modalTitle || !modalList) return;

    modalTitle.textContent = `Select Skill for Slot ${slotIndex + 1}`;
    modalList.innerHTML = '<div style="text-align:center; color:#aaa;">Loading skills...</div>';
    modal.style.display = 'flex';

    // Identify the skill in the OTHER slot to prevent duplicates
    const otherSlotIndex = slotIndex === 0 ? 1 : 0;
    const otherSlotSkillID = character.skills[otherSlotIndex]?.skillID;
    const currentSlotSkillID = character.skills[slotIndex]?.skillID;

    // Filter equippable skills:
    // - Must be a starter skill OR owned at level 1+
    // - Must not be the skill already in THIS slot (no-op swap)
    // - CONSUMABLE skills are excluded
    // Note: the skill in the OTHER slot IS included — swapping the two equipped
    // skills is valid and should always be available.
    const equippableSkills = window.gameData.skills.filter(s => {
        if (s.category && s.category.includes('CONSUMABLE')) return false;

        const isStarter = s.isStarterSkill === true;
        const ownedRecord = character.skills.find(rec => rec.skillID === s.id);
        const isOwnedAndUnlocked = ownedRecord && (ownedRecord.skillLevel || 0) >= 1;

        if (!isStarter && !isOwnedAndUnlocked) return false;
        if (s.id === currentSlotSkillID) return false; // already in this slot

        return true;
    });

    modalList.innerHTML = '';
    if (equippableSkills.length === 0) {
        modalList.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">No other skills available.<br><small>Discover new skills by combining parents in combat!</small></div>';
    } else {
        equippableSkills.forEach(skill => {
            const ownedRec = character.skills.find(r => r.skillID === skill.id);
            const levelText = ownedRec ? `Lv.${ownedRec.skillLevel}` : 'Starter';
            const xpText = ownedRec ? `(XP: ${ownedRec.skillXP.toFixed(1)})` : '';

            const item = document.createElement('div');
            item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #333; cursor:pointer; transition:background 0.2s;';
            item.onmouseover = function() { this.style.background = '#2a4a6a'; };
            item.onmouseout = function() { this.style.background = 'transparent'; };
            
            item.innerHTML = `
                <div>
                    <div style="font-weight:bold; color:#ffd700;">${skill.name}</div>
                    <div style="font-size:0.85em; color:#aaa;">${skill.category} | ${levelText} ${xpText}</div>
                </div>
                <div style="color:#4cd964; font-weight:bold; font-size:0.9em;">Equip ➜</div>
            `;

            item.onclick = async () => {
                await confirmSkillSwap(character, slotIndex, skill.id);
            };

            modalList.appendChild(item);
        });
    }
}

/**
 * Handles the logic of swapping the skill and saving to server.
 */
async function confirmSkillSwap(character, slotIndex, newSkillID) {
    const modal = document.getElementById('skillSwapModal');
    if (modal) modal.style.display = 'none';

    const oldSkillRecord = character.skills[slotIndex];
    
    // 1. Find the record for the NEW skill in the full array
    let newSkillRecordIndex = character.skills.findIndex(s => s.skillID === newSkillID);
    let newSkillRecord = null;

    if (newSkillRecordIndex === -1) {
        // New starter skill not yet in array
        newSkillRecord = {
            skillID: newSkillID,
            skillLevel: 1,
            skillXP: 0,
            usageCount: 0,
            learned: true
        };
    } else {
        // Grab the existing record
        newSkillRecord = character.skills[newSkillRecordIndex];
        
        // ⚠️ CRITICAL FIX: If the new skill is currently sitting in the "unequipped" pool (index 2+),
        // we must remove it from there first so we don't duplicate it when we place it in the slot.
        if (newSkillRecordIndex !== slotIndex) {
             // We will handle the removal after we secure the old skill, 
             // to avoid index shifting issues.
        }
    }

    // 2. Secure the OLD skill (the one being kicked out of the slot)
    // We only keep it if it's not the same as the new skill (swapping A for A does nothing)
    let skillToUnequip = null;
    if (oldSkillRecord && oldSkillRecord.skillID !== newSkillID) {
        skillToUnequip = oldSkillRecord;
    }

    // 3. Rebuild the skills array cleanly, respecting slotIndex.
    const otherSlotIndex   = slotIndex === 0 ? 1 : 0;
    const otherSlotID      = character.skills[otherSlotIndex]?.skillID;
    const otherSkillRecord = character.skills.find(s => s.skillID === otherSlotID);

    // Determine what goes into the OTHER slot after this swap:
    // - If the player picked the skill that's currently in the other slot,
    //   the old skill from THIS slot should move there (a clean slot-swap).
    // - Otherwise the other slot stays as-is and the old skill moves to unequipped.
    const isSlotSwap = (newSkillID === otherSlotID);

    let newOtherSlotRecord;
    if (isSlotSwap) {
        // The old skill from the current slot takes the other slot's place
        newOtherSlotRecord = oldSkillRecord || null;
    } else {
        newOtherSlotRecord = otherSkillRecord || null;
    }

    // Skills beyond index 1 that are not being moved into either slot
    const unequippedSkills = character.skills.filter((s, idx) => {
        if (idx === 0 || idx === 1) return false;       // skip current equipped pair
        if (s.skillID === newSkillID) return false;     // moving to this slot
        if (isSlotSwap && s.skillID === otherSlotID) return false; // moving to other slot
        return true;
    });

    // If we're not doing a slot-swap, the kicked-out old skill goes to unequipped
    if (!isSlotSwap && skillToUnequip && !unequippedSkills.some(s => s.skillID === skillToUnequip.skillID)) {
        unequippedSkills.push(skillToUnequip);
    }

    // Build [slot0, slot1, ...rest] in the correct order
    const finalSkills = [];
    if (slotIndex === 0) {
        finalSkills.push(newSkillRecord);
        if (newOtherSlotRecord) finalSkills.push(newOtherSlotRecord);
    } else {
        if (newOtherSlotRecord) finalSkills.push(newOtherSlotRecord);
        finalSkills.push(newSkillRecord);
    }
    finalSkills.push(...unequippedSkills);

    // 4. Apply and Save
    character.skills = finalSkills;

    try {
        await saveCharacterToServer(character);
        if (typeof showSafeSuccess === 'function') {
            showSafeSuccess(`Equipped ${window.gameData.skills.find(s=>s.id===newSkillID).name}!`);
        }
        await renderCharacterSkills(character);
    } catch (err) {
        if (typeof showSafeError === 'function') showSafeError('Failed to save skills: ' + err.message);
        console.error(err);
    }
}

/**
 * Helper to create modal HTML if it doesn't exist in index.html
 */
function createSkillSwapModalHTML() {
    const modal = document.createElement('div');
    modal.id = 'skillSwapModal';
    modal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:2000; justify-content:center; align-items:center;';
    modal.innerHTML = `
        <div style="background:#1a1a2e; border:2px solid #d4af37; padding:20px; width:90%; max-width:500px; max-height:80vh; overflow-y:auto; border-radius:8px; position:relative; box-shadow:0 0 20px rgba(0,0,0,0.5);">
            <h3 id="skillSwapTitle" style="color:#ffd700; margin-top:0; border-bottom:1px solid #333; padding-bottom:10px;">Select Skill</h3>
            <div id="skillSwapList" style="margin-bottom:20px; max-height:60vh; overflow-y:auto;"></div>
            <button onclick="document.getElementById('skillSwapModal').style.display='none'" style="width:100%; padding:12px; background:#4a2a2a; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Cancel</button>
        </div>
    `;
    document.body.appendChild(modal);
}

/**
 * Render consumable belt on character detail screen
 */
function renderConsumableBelt(character) {
    const container = document.getElementById('consumableBeltDisplay');
    if (!container) return;

    container.innerHTML = '';
    const consumableSlots = character.consumables || {};

    // Collect all filled belt entries in order
    const filled = Object.entries(consumableSlots)
        .filter(([, qty]) => qty > 0)
        .map(([id, qty]) => ({ consumable: getConsumable(id), qty }))
        .filter(entry => entry.consumable !== null && entry.consumable !== undefined);

    for (let i = 0; i < 4; i++) {
        const slot = document.createElement('div');
        slot.className = 'consumable-slot';

        if (filled[i]) {
            slot.classList.add('filled');
            slot.innerHTML = `
                <div class="consumable-name">${filled[i].consumable.name}</div>
                <div class="consumable-quantity">Qty: ${filled[i].qty}</div>
            `;
        } else {
            slot.innerHTML = '<div style="color: #8b7355;">Empty Slot</div>';
        }

        container.appendChild(slot);
    }
}

/**
 * Delete a character
 */
async function saveAiProfile() {
    const characterId = currentState.detailCharacterId;
    const select = document.getElementById('aiProfileDetailSelect');
    const msg = document.getElementById('aiProfileSaveMsg');
    const badge = document.getElementById('aiProfileBadge');
    if (!characterId || !select) return;

    const aiProfile = select.value;
    try {
        const response = await fetch(`${BACKEND_URL}/api/characters/${characterId}/aiProfile`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aiProfile })
        });
        if (!response.ok) throw new Error('Failed to save');

        // Update local character cache
        const character = gameData.characters.find(c => c.id === characterId);
        if (character) character.aiProfile = aiProfile;

        const profileLabels = {
            balanced:    '⚖️ Balanced',
            aggressive:  '⚔️ Aggressive',
            cautious:    '🛡️ Cautious',
            support:     '💚 Support',
            disruptor:   '🌀 Disruptor',
            opportunist: '🗡️ Opportunist'
        };
        if (badge) badge.textContent = profileLabels[aiProfile] || aiProfile;
        if (msg) {
            msg.textContent = 'Combat style saved.';
            setTimeout(() => { if (msg) msg.textContent = ''; }, 2000);
        }
    } catch (err) {
        if (msg) msg.textContent = 'Failed to save. Try again.';
        console.error('saveAiProfile error:', err);
    }
}

async function deleteCharacter(characterId) {
    if (confirm('Are you sure you want to delete this character? This cannot be undone.')) {
        try {
            const response = await fetch(`${BACKEND_URL}/api/characters/${characterId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) throw new Error('Failed to delete character');
            
            await renderRoster();
            showScreen('roster');
            showSuccess('Character deleted');
        } catch (error) {
            console.error('Error deleting character:', error);
            showError('Failed to delete character: ' + error.message);
        }
    }
}

// ============================================================================
// TOOLTIP FUNCTIONS (MISSING FROM OLD FILE)
// ============================================================================

/**
 * Position tooltip near cursor
 */
function positionTooltip(tooltip, event) {
    const xOffset = 15;
    const yOffset = 15;
    
    let left = event.clientX + xOffset;
    let top = event.clientY + yOffset;
    
    // Prevent tooltip from going off-screen
    if (left + tooltip.offsetWidth > window.innerWidth) {
        left = event.clientX - tooltip.offsetWidth - xOffset;
    }
    if (top + tooltip.offsetHeight > window.innerHeight) {
        top = event.clientY - tooltip.offsetHeight - yOffset;
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

/**
 * Create and show a tooltip for a skill
 */
function createSkillTooltip(skill) {
    const tooltip = document.createElement('div');
    tooltip.className = 'skill-tooltip';
    tooltip.style.cssText = `
        position: fixed; 
        background: #16213e; 
        border: 2px solid #4a9eff; 
        border-radius: 4px; 
        padding: 0.75rem; 
        max-width: 350px; 
        z-index: 10000; 
        color: #4a9eff; 
        font-family: 'Courier New', monospace; 
        font-size: 0.85rem; 
        box-shadow: 0 0 20px rgba(0, 0, 0, 0.8); 
        pointer-events: none;
        word-wrap: break-word;
        white-space: normal;
    `;
    
    let content = `<div style="font-weight: bold; margin-bottom: 0.5rem; font-size: 0.95rem;">${skill.name}</div>`;
    content += `<div style="color: #aaa; font-size: 0.8rem; margin-bottom: 0.5rem;">${skill.category}</div>`;
    
    if (skill.description) {
        content += `<div style="color: #aaa; margin-bottom: 0.75rem; font-size: 0.85rem;">${skill.description}</div>`;
    }
    
    if (skill.costType && skill.costType !== 'none') {
        content += `<div style="color: #d4af37;"><strong>Cost:</strong> ${skill.costAmount} ${skill.costType}</div>`;
    }
    
    if (skill.basePower) {
        content += `<div style="color: #ff6b6b;"><strong>Power:</strong> ${skill.basePower}x</div>`;
    }
    
    if (skill.baseHitChance) {
        content += `<div style="color: #4eff7f;"><strong>Hit Chance:</strong> ${(skill.baseHitChance * 100).toFixed(0)}%</div>`;
    }
    
    if (skill.critChance) {
        content += `<div style="color: #ffd700;"><strong>Crit Chance:</strong> ${(skill.critChance * 100).toFixed(0)}%</div>`;
    }
    
    if (skill.delay) {
        content += `<div style="color: #4a9eff;"><strong>Delay:</strong> ${skill.delay}ms</div>`;
    }
    
    if (skill.hitCount) {
        if (skill.hitCount.fixed) {
            content += `<div style="color: #4eff7f;"><strong>Hits:</strong> ${skill.hitCount.fixed}</div>`;
        } else {
            content += `<div style="color: #4eff7f;"><strong>Hits:</strong> ${skill.hitCount.min}-${skill.hitCount.max}</div>`;
        }
    }
    
    if (skill.scalingFactors) {
        const scaling = Object.entries(skill.scalingFactors)
            .filter(([k, v]) => v > 0)
            .map(([k, v]) => `${(v * 100).toFixed(0)}% ${k}`)
            .join(', ');
        if (scaling) {
            content += `<div style="color: #d4af37; margin-top: 0.5rem;"><strong>Scaling:</strong> ${scaling}</div>`;
        }
    }
    
    if (skill.effects && skill.effects.length > 0) {
        content += `<div style="color: #ff9999; margin-top: 0.5rem;"><strong>Effects:</strong><br>`;
        skill.effects.forEach(effect => {
            let effectText = effect.type.toUpperCase();
            if (effect.damageType) effectText += ` (${effect.damageType})`;
            if (effect.debuff) effectText += ` - ${effect.debuff}`;
            if (effect.buff) effectText += ` - ${effect.buff}`;
            content += `• ${effectText}<br>`;
        });
        content += `</div>`;
    }
    
    tooltip.innerHTML = content;
    document.body.appendChild(tooltip);
    return tooltip;
}

/**
 * Add tooltip behavior to a skill card
 */
function addSkillTooltip(element, skill, delay = 500) {
    let tooltip = null;
    let tooltipTimeout = null;
    
    element.addEventListener('mouseenter', (e) => {
        tooltipTimeout = setTimeout(() => {
            tooltip = createSkillTooltip(skill);
            positionTooltip(tooltip, e);
        }, delay);
    });
    
    element.addEventListener('mousemove', (e) => {
        if (tooltip) {
            positionTooltip(tooltip, e);
        }
    });
    
    element.addEventListener('mouseleave', () => {
        if (tooltipTimeout) clearTimeout(tooltipTimeout);
        if (tooltip) {
            tooltip.remove();
            tooltip = null;
        }
    });
}

/**
 * Create gear tooltip
 */
function createGearTooltip(item) {
    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
        position: fixed; 
        background: #16213e; 
        border: 2px solid #d4af37; 
        border-radius: 4px; 
        padding: 0.75rem; 
        max-width: 300px; 
        z-index: 10000; 
        color: #d4af37; 
        font-family: 'Courier New', monospace; 
        font-size: 0.85rem; 
        box-shadow: 0 0 20px rgba(0, 0, 0, 0.8); 
        pointer-events: none;
    `;
    
    let content = `<div style="font-weight: bold; margin-bottom: 0.5rem;">${item.name}</div>`;
    content += `<div style="color: #aaa; font-size: 0.8rem; margin-bottom: 0.5rem;">${item.type}</div>`;
    
    if (item.description) {
        content += `<div style="color: #aaa; margin-bottom: 0.75rem;">${item.description}</div>`;
    }
    
    if (item.dmg1) {
        content += `<div style="color: #ff6b6b;">Damage: ${item.dmg1} ${item.dmg_type_1}</div>`;
    }
    if (item.armor) {
        content += `<div style="color: #4eff7f;">Armor: ${item.armor}</div>`;
    }
    if (item.delay) {
        content += `<div style="color: #4a9eff;">Delay: ${item.delay}</div>`;
    }
    
    tooltip.innerHTML = content;
    document.body.appendChild(tooltip);
    return tooltip;
}

/**
 * Add tooltip behavior to equipped gear
 */
function addEquippedGearTooltip(element, item, delay = 500) {
    let tooltip = null;
    let tooltipTimeout = null;
    
    element.addEventListener('mouseenter', (e) => {
        tooltipTimeout = setTimeout(() => {
            tooltip = createGearTooltip(item);
            positionTooltip(tooltip, e);
        }, delay);
    });
    
    element.addEventListener('mousemove', (e) => {
        if (tooltip) {
            positionTooltip(tooltip, e);
        }
    });
    
    element.addEventListener('mouseleave', () => {
        if (tooltipTimeout) clearTimeout(tooltipTimeout);
        if (tooltip) {
            tooltip.remove();
            tooltip = null;
        }
    });
}

// addStatTooltip is defined in stat-tooltip.js (richer version with createStatTooltip).
// The duplicate that used to live here has been removed to prevent the weaker inline
// version from shadowing the correct one during the window between script loads.

/**
 * Check if a character is imported (linked reference)
 */
async function checkIfImported(characterId) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/character/check-import/${characterId}`);
        if (!response.ok) return { isImported: false };
        return await response.json();
    } catch (error) {
        console.error('Error checking import status:', error);
        return { isImported: false };
    }
}

/**
* Render export button (disabled for imported characters)
*/
function renderExportButton(character) {
    const exportBtn = document.getElementById('exportCharacterBtn');
    if (!exportBtn) return;

    // ENSURE Global State is synced immediately
    if (character && character.id) {
        currentState.detailCharacterId = character.id;
    }

    // Check if character is imported (cannot re-export)
    if (character.isImportedReference) {
        exportBtn.disabled = true;
        exportBtn.textContent = 'Cannot Export (Imported Character)';
        exportBtn.title = 'Only the original owner can export this character';
        exportBtn.style.opacity = '0.5';
        exportBtn.style.cursor = 'not-allowed';
    } else {
        exportBtn.disabled = false;
        exportBtn.textContent = 'Share Character';
        exportBtn.title = 'Export this character for others to use';
        exportBtn.style.opacity = '1';
        exportBtn.style.cursor = 'pointer';
        
        // Capture the ID at render time and pass directly — avoids window.currentState
        // scope mismatch between character-management.js and browse-system.js
        const capturedId = character.id;
        exportBtn.onclick = () => openShareModal(capturedId);
    }
}

/**
 * Fetch combat history and cache it; called when character detail loads.
 */
async function renderCombatHistory(characterId) {
    // Pre-fetch and cache so the modal opens instantly
    window._combatHistoryCharId = characterId;
    window._combatHistoryCache  = null;
    try {
        const response = await fetch(`${BACKEND_URL}/api/combat/history/${characterId}/summary`);
        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        window._combatHistoryCache = await response.json();
    } catch (err) {
        console.error('[HISTORY]', err);
    }
}

/**
 * Open the combat history modal and render cached results.
 */
function openCombatHistoryModal() {
    const modal     = document.getElementById('combatHistoryModal');
    const container = document.getElementById('combatHistoryDisplay');
    if (!modal || !container) return;

    modal.style.display = 'flex';

    const logs = window._combatHistoryCache;
    if (!logs || logs.length === 0) {
        container.innerHTML = '<p style="color:#888; font-style:italic; padding:1rem 0;">No combat history yet. Send this character on a challenge to see results here.</p>';
        return;
    }

    const resultColors = { victory:'#4cd964', loss:'#d4484a', defeat:'#d4484a', retreated:'#aaa' };
    const resultLabels = { victory:'VICTORY',  loss:'DEFEATED', defeat:'DEFEATED', retreated:'RETREATED' };

    const challengeNames = {};
    (window.gameData?.challenges || []).forEach(c => { challengeNames[c.id] = c.name; });

    container.innerHTML = logs.slice(0, 20).map(log => {
        const color     = resultColors[log.result] || '#aaa';
        const label     = resultLabels[log.result] || log.result.toUpperCase();
        const date      = new Date(log.createdAt).toLocaleDateString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
        const challenge = challengeNames[log.challengeID] || (log.challengeID?.replace('challenge_','').replace(/_/g,' ') || 'Unknown');

        const stageRows = (log.stages || []).map(s => {
            const sc = s.status === 'victory' ? '#4cd964' : '#d4484a';
            return `<div style="font-size:0.78rem; margin-top:3px; padding:3px 8px; border-left:2px solid ${sc}; color:#888;">
                <span style="color:${sc}; font-weight:500;">${s.title}: ${s.status?.toUpperCase()}</span>
                ${s.summaryText ? `<span style="color:#666;"> — ${s.summaryText}</span>` : ''}
            </div>`;
        }).join('');

        return `<div style="margin-bottom:10px; padding:10px 12px; background:rgba(20,30,50,0.7); border:1px solid rgba(255,255,255,0.06); border-left:3px solid ${color}; border-radius:4px;">
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:3px;">
                <span style="color:#d4af37; font-weight:500; font-size:0.9rem;">${challenge}</span>
                <span style="color:${color}; font-size:0.8rem; font-weight:600;">${label}</span>
            </div>
            <div style="color:#555; font-size:0.75rem; margin-bottom:6px;">${date} &middot; ${log.totalTurns} turns</div>
            ${stageRows}
            <div style="display:flex; gap:6px; margin-top:8px;">
                <button onclick="viewCombatTextLog('${log.id}')" style="font-size:0.75rem; padding:3px 10px; background:#1a2a3a; color:#aaa; border:1px solid #334; border-radius:3px; cursor:pointer;">📄 View Log</button>
                <button onclick="replayCombatLog('${log.id}')" style="font-size:0.75rem; padding:3px 10px; background:#1a2a3a; color:#d4af37; border:1px solid #554; border-radius:3px; cursor:pointer;">▶ Replay</button>
            </div>
            <div id="textlog-${log.id}" style="display:none; margin-top:8px; max-height:260px; overflow-y:auto; background:rgba(0,0,0,0.3); border-radius:4px; padding:8px; font-size:0.75rem; color:#aaa; font-family:monospace;"></div>
        </div>`;
    }).join('') || '<p style="color:#666; font-style:italic;">No combat history yet.</p>';
}


/**
 * Fetch full log and render as readable text inline under the history entry.
 */
async function viewCombatTextLog(combatId) {
    const container = document.getElementById(`textlog-${combatId}`);
    if (!container) return;

    // Toggle off if already open
    if (container.style.display !== 'none') {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    container.textContent = 'Loading...';

    try {
        const response = await fetch(`${BACKEND_URL}/api/combat/${combatId}`);
        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        const data = await response.json();
        const fullLog = data.log || data;

        const allTurns = fullLog.segments
            ? fullLog.segments.flatMap(s => s.turns)
            : (fullLog.turns || []);

        if (allTurns.length === 0) {
            container.textContent = 'No turn data available.';
            return;
        }

        container.innerHTML = allTurns.map(turn => {
            if (turn.action?.type === 'status') {
                return `<div style="color:#555; padding:1px 0;">[Status] ${turn.result?.message || ''}</div>`;
            }
            const msg = turn.result?.message || '';
            const dmg = turn.result?.damageDealt > 0 ? ` <span style="color:#ff6b6b;">(${turn.result.damageDealt} dmg)</span>` : '';
            const hit = turn.roll?.hit === false ? ' <span style="color:#666;">MISS</span>' : '';
            const crit = turn.roll?.crit ? ' <span style="color:#ffd700;">CRIT</span>' : '';
            return `<div style="padding:1px 0; border-bottom:1px solid rgba(255,255,255,0.04);">${msg}${dmg}${hit}${crit}</div>`;
        }).join('');

    } catch (err) {
        container.textContent = 'Could not load log.';
        console.error('[TEXTLOG]', err);
    }
}

/**
 * Fetch full log and replay it on the combat log screen.
 */
async function replayCombatLog(combatId) {
    document.getElementById('combatHistoryModal').style.display = 'none';

    try {
        const response = await fetch(`${BACKEND_URL}/api/combat/${combatId}`);
        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        const data = await response.json();
        const fullLog = data.log || data;

        showScreen('combatlog');
        if (typeof displayCombatLog === 'function') {
            await displayCombatLog(fullLog);
        }
    } catch (err) {
        if (typeof showSafeError === 'function') showSafeError('Could not load combat replay.');
        console.error('[REPLAY]', err);
    }
}


/**
 * Show import badge on character detail screen
 */
function renderImportBadge(character) {
    const badgeContainer = document.getElementById('importBadgeContainer');
    if (!badgeContainer) return;
    
    if (character.isImportedReference) {
        badgeContainer.style.display = 'block';
        badgeContainer.innerHTML = `
            <div style="padding: 0.75rem; background: rgba(74, 158, 255, 0.1); border: 1px solid #4a9eff; border-radius: 4px; margin-bottom: 1rem;">
                <div style="color: #4a9eff; font-weight: bold; margin-bottom: 0.5rem;">📥 Imported Character</div>
                <div style="color: #aaa; font-size: 0.85rem;">
                    <div>Original Owner: ${character.originalOwnerUserId || 'Anonymous'}</div>
                    <div>Share Code: ${character.originalShareCode}</div>
                    <div style="margin-top: 0.5rem; color: #888;">
                        Combat stats update the original character. You cannot re-export this character.
                    </div>
                </div>
            </div>
        `;
    } else {
        badgeContainer.style.display = 'none';
    }
}

// exportCharacter, browseCharacters, importCharacter, and getProgressPercent
// are defined in browse-system.js and ui-helpers.js — do not duplicate here.