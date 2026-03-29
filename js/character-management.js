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
    if (typeof window.updateCombatStyleDesc === 'function') window.updateCombatStyleDesc();
}

/**
 * Get a character from server
 */
async function getCharacter(characterId) {
    try {
        const response = await authFetch(`${BACKEND_URL}/api/characters/${characterId}`);
        if (!response.ok) throw new Error(`Server error: ${response.status}`);
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
        const response = await authFetch(`${BACKEND_URL}/api/characters`, {
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
        const response = await authFetch(`${BACKEND_URL}/api/characters/${character.id}`, {
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

    // Show avatar picker for this race
    const pickerSection   = document.getElementById('avatarPickerSection');
    const pickerContainer = document.getElementById('avatarPickerContainer');
    if (pickerSection && pickerContainer && window.AVATARS) {
        // Default to first variant when race changes
        if (!currentState.selectedAvatarId?.startsWith(race.id)) {
            currentState.selectedAvatarId = window.AVATARS.defaultForRace(race.id);
        }
        pickerContainer.innerHTML = '';
        pickerContainer.appendChild(
            window.AVATARS.renderPicker(race.id, currentState.selectedAvatarId, (id) => {
                currentState.selectedAvatarId = id;
            })
        );
        pickerSection.style.display = 'block';
    }

    updateStatDisplay();
    renderStatAllocation();
    renderSkillSelection();
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
    instruction.innerHTML = `<strong>Select exactly 2 starting skills:</strong> Certain skills used together in combat will reveal new, related skills.`;
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

    // Racial skill notice
    const race = currentState.selectedRace;
    if (race?.intrinsicSkills?.length) {
        const intrinsicId = race.intrinsicSkills[0];
        const intrinsicSkill = gameData.skills.find(s => s.id === intrinsicId);
        if (intrinsicSkill) {
            const racialNotice = document.createElement('div');
            racialNotice.style.cssText = 'margin-top: 1rem; padding: 0.75rem 1rem; background: rgba(180, 120, 255, 0.08); border: 1px solid rgba(180, 120, 255, 0.35); border-radius: 4px;';
            racialNotice.innerHTML = `
                <div style="color: #888; font-size: 0.72rem; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px;">Racial Ability · ${race.name}</div>
                <div style="color: #c9a0ff; font-weight: bold; margin-bottom: 4px;">${intrinsicSkill.name}</div>
                <div style="color: #aaa; font-size: 0.88rem;">${intrinsicSkill.description}</div>
                <div style="margin-top: 6px; color: #777; font-size: 0.8rem;"><strong>Cost:</strong> ${intrinsicSkill.costAmount} ${intrinsicSkill.costType} &nbsp;·&nbsp; <strong>Category:</strong> ${intrinsicSkill.category}</div>
            `;
            container.appendChild(racialNotice);
        }
    }
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
    instruction.innerHTML = `Weapons add to skill damage, and determine physical skill damage type. Delay class modifies skill cooldown. Magic skills gain extra damage from weapons with like damage-typing.`;
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
 * Render stat allocation UI — new layout with inline base value, expand/collapse descriptions
 */
function renderStatAllocation() {
    const container = document.getElementById('statAllocationContainer');
    if (!container) return;

    const race      = currentState.selectedRace;
    const allocated = currentState.allocatedStats;
    const remaining = currentState.pointsRemaining;

    // Update points badge
    const badge = document.getElementById('pointsRemainingBadge');
    if (badge) {
        badge.textContent = remaining > 0
            ? `${remaining} point${remaining !== 1 ? 's' : ''} remaining`
            : '✓ All points allocated';
        badge.style.color = remaining > 0 ? '#d4af37' : '#4cd964';
    }

    const stats = ['conviction','endurance','ambition','harmony'];

    container.innerHTML = stats.map(stat => {
        const def       = typeof STAT_DEFINITIONS !== 'undefined' ? STAT_DEFINITIONS[stat] : null;
        const base      = race?.baseStats?.[stat] ?? 0;
        const alloc     = allocated[stat] ?? 0;
        const total     = base + alloc;
        const canSub    = alloc > 0;
        const canAdd    = remaining > 0;
        const effectsHtml = def ? def.effects.map(e =>
            `<div style="padding:2px 0; font-size:0.82rem; color:#888;">${e}</div>`
        ).join('') : '';

        return `
        <div class="stat-alloc-row" id="statrow_${stat}">
            <div class="stat-alloc-main">
                <button class="stat-btn stat-btn-sub ${canSub ? '' : 'stat-btn-disabled'}"
                    data-stat="${stat}" data-dir="-1"
                    onmousedown="startStatHold('${stat}',-1)"
                    onmouseup="stopStatHold()"
                    onmouseleave="stopStatHold()"
                    ontouchstart="startStatHold('${stat}',-1)"
                    ontouchend="stopStatHold()"
                    onclick="modifyStat('${stat}',-1)"
                    ${canSub ? '' : 'disabled'}>−</button>

                <div class="stat-alloc-values">
                    
                    <span class="stat-total-val ${alloc > 0 ? 'stat-allocated' : ''}">${total}</span>
               
                </div>

                <button class="stat-btn stat-btn-add ${canAdd ? '' : 'stat-btn-disabled'}"
                    data-stat="${stat}" data-dir="1"
                    onmousedown="startStatHold('${stat}',1)"
                    onmouseup="stopStatHold()"
                    onmouseleave="stopStatHold()"
                    ontouchstart="startStatHold('${stat}',1)"
                    ontouchend="stopStatHold()"
                    onclick="modifyStat('${stat}',1)"
                    ${canAdd ? '' : 'disabled'}>+</button>

                <button class="stat-name-btn" onclick="toggleStatDesc('${stat}')">
                    <span style="color:#d4af37;font-weight:bold;font-size:0.95rem;text-decoration:underline dotted;text-underline-offset:3px;">
                        ${def ? def.name : stat}
                    </span>
                    <span id="statarrow_${stat}" style="color:#555;font-size:0.75rem;margin-left:6px;">▶</span>
                </button>
            </div>
            <div id="statdesc_${stat}" class="stat-desc-block" style="display:none;">
                <p style="color:#aaa;font-style:italic;font-size:0.85rem;margin:0 0 6px 0;line-height:1.5;">
                    ${def ? def.description : ''}
                </p>
                ${effectsHtml}
            </div>
        </div>`;
    }).join('');
}

/**
 * Toggle stat description expand/collapse
 */
window.toggleStatDesc = function(stat) {
    const desc  = document.getElementById('statdesc_' + stat);
    const arrow = document.getElementById('statarrow_' + stat);
    if (!desc) return;
    const open = desc.style.display === 'none';
    // Collapse all others
    ['conviction','endurance','ambition','harmony'].forEach(s => {
        const d = document.getElementById('statdesc_' + s);
        const a = document.getElementById('statarrow_' + s);
        if (d) d.style.display = 'none';
        if (a) a.textContent = '▶';
    });
    if (open) {
        desc.style.display = 'block';
        if (arrow) arrow.textContent = '▼';
    }
};

/**
 * Press-and-hold for stat buttons
 */
let _statHoldTimer = null;
let _statHoldInterval = null;

window.startStatHold = function(stat, dir) {
    // Single click fires via onclick — hold starts after 400ms
    _statHoldTimer = setTimeout(() => {
        _statHoldInterval = setInterval(() => modifyStat(stat, dir), 80);
    }, 400);
};

window.stopStatHold = function() {
    clearTimeout(_statHoldTimer);
    clearInterval(_statHoldInterval);
    _statHoldTimer = null;
    _statHoldInterval = null;
};

/**
 * Combat style descriptions for creation screen
 */
const COMBAT_STYLE_DESCS = {
    balanced:    'Adapts fluidly to the situation — finishes wounded enemies, conserves resources across stages, and buffs early in a fight. A solid choice for any build.',
    aggressive:  'Plays opportunistically until an enemy is wounded, then shifts single-mindedly to securing the kill. Sets up debuffs and damage buffs early, then ignores everything else once blood is drawn. High risk, high output.',
    cautious:    'Prioritises survival and utility. Casts defensive skills early, heals proactively, targets the most dangerous enemy first, and conserves resources carefully across long challenges.',
    support:     'Focuses on healing and buffing allies first. Rarely deals damage. Rescues low-HP party members before acting offensively. Best paired with a damage dealer.',
    disruptor:   'Heavily favours control and debuff skills. Targets the most dangerous enemy and locks them down. Deals moderate damage but significantly reduces enemy effectiveness.',
    opportunist: 'Methodically sets up combos and procs. Hits dramatically harder when the target is already debuffed. Targets the most vulnerable enemy and exploits every weakness.',
};

window.updateCombatStyleDesc = function() {
    const sel  = document.getElementById('aiProfileSelect');
    const desc = document.getElementById('combatStyleDesc');
    if (!sel || !desc) return;
    desc.textContent = COMBAT_STYLE_DESCS[sel.value] || '';
};

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

    renderStatAllocation();
}

/**
 * Update stat display — now a no-op since renderStatAllocation handles everything
 */
function updateStatDisplay() {
    renderStatAllocation();
}
/**
 * Create a Character - WITH COMPLETE SAVESTATE FIELDS
 */
async function createCharacter() {
    if (createCharacter._inProgress) return;
    createCharacter._inProgress = true;

    const createBtn = document.querySelector('#create button[onclick*="createCharacter"]');
    if (createBtn) { createBtn.disabled = true; createBtn.textContent = 'Creating…'; }

    const name = document.getElementById('characterName').value.trim();
    const messagesDiv = document.getElementById('creationMessages');

    const _unlock = () => {
        createCharacter._inProgress = false;
        if (createBtn) { createBtn.disabled = false; createBtn.textContent = 'Create Character'; }
    };
    
    // Validation 1: Character name
    if (!name) {
        messagesDiv.innerHTML = '<p style="color: #ff6b6b;">Please enter a character name.</p>';
        _unlock(); return;
    }
    
    // Validation 2: Race selected
    if (!currentState.selectedRace) {
        messagesDiv.innerHTML = '<p style="color: #ff6b6b;">Please select a race.</p>';
        _unlock(); return;
    }
    
    // Validation 3: Exactly 2 skills selected
    if (currentState.selectedSkills.length !== 2) {
        messagesDiv.innerHTML = '<p style="color: #ff6b6b;">You must select exactly 2 starting skills.</p>';
        _unlock(); return;
    }
    
    // Validation 4: Weapon type selected
    if (!currentState.selectedWeaponType) {
        messagesDiv.innerHTML = '<p style="color: #ff6b6b;">Please select a starting weapon type.</p>';
        _unlock(); return;
    }
    
    // Validation 5: All stat points allocated
    if (currentState.pointsRemaining > 0) {
        messagesDiv.innerHTML = '<p style="color: #ff6b6b;">You must allocate all your stat points.</p>';
        _unlock(); return;
    }
    
    // Get tier 0 weapon for selected type
    const tier0Weapon = gameData.gear.find(item =>
        item.type === currentState.selectedWeaponType &&
        item.tier === 0
    );
    
    if (!tier0Weapon) {
        messagesDiv.innerHTML = '<p style="color: #ff6b6b;">Could not find starting weapon. Please select a different weapon type.</p>';
        _unlock(); return;
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
        skills: (() => {
            const equipped = currentState.selectedSkills.map(skillId => ({
                skillID: skillId,
                learned: true,
                usageCount: 0,
                skillXP: 0,
                skillLevel: 1,
                lastUsed: null
            }));
            // Inject racial intrinsic skill
            const raceDef = window.gameData?.races?.find(r => r.id === currentState.selectedRace?.id);
            const intrinsicId = raceDef?.intrinsicSkills?.[0];
            if (intrinsicId && !equipped.some(s => s.skillID === intrinsicId)) {
                equipped.push({
                    skillID: intrinsicId,
                    learned: true,
                    intrinsic: true,
                    usageCount: 0,
                    skillXP: 0,
                    skillLevel: 0,
                    lastUsed: null
                });
            }
            return equipped;
        })(),
        consumables: {},
        consumableStash: {},
        inventory: [],
        gold: 0,
        arcaneDust: 0.0,
        
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
        avatarId: currentState.selectedAvatarId || (window.AVATARS?.defaultForRace(currentState.selectedRace.id) ?? null),
        avatarColor: window.AVATARS?.defaultColor(currentState.selectedRace.id) ?? null,
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
        _unlock(); return;
    }
    
    messagesDiv.innerHTML = '<p style="color: #4eff7f;">Character created successfully!</p>';
    _unlock();
    
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

// Roster pagination state
const _rosterPaging = { page: 1, totalPages: 1 };

/**
 * Render the character roster from server database, paginated (6 per page).
 */
async function renderRoster(page) {
    if (page === undefined) page = _rosterPaging.page;
    _rosterPaging.page = page;

    try {
        const response = await authFetch(`${BACKEND_URL}/api/characters?page=${page}&limit=6`);
        if (!response.ok) {
            throw new Error('Failed to load characters');
        }

        const data = await response.json();
        const characters = data.characters;
        const pagination = data.pagination || {};
        _rosterPaging.totalPages = pagination.totalPages || 1;

        // Keep current page slice in gameData.characters for aiProfile local cache
        gameData.characters = characters;

        const container = document.getElementById('rosterContainer');
        if (!container) return;

        container.innerHTML = '';

        if (characters.length === 0 && page === 1) {
            container.innerHTML = '<p style="color: #8b7355; grid-column: 1 / -1; text-align: center;">No characters yet. Create one to begin your adventure.</p>';
            _renderRosterPagination(pagination);
            return;
        }

        const profileLabels = {
            balanced:'⚖️ Balanced', aggressive:'⚔️ Aggressive', cautious:'🛡️ Cautious',
            support:'💚 Support', disruptor:'🌀 Disruptor', opportunist:'🗡️ Opportunist'
        };

        characters.forEach(character => {
            const race = getRace(character.race);
            const characterClass = getCharacterClass(character, gameData.skills);

            // Top 3 active (non-intrinsic) skills, highest level first
            const skillNames = (character.skills || [])
                .filter(s => !s.intrinsic)
                .sort((a, b) => (b.skillLevel || 0) - (a.skillLevel || 0))
                .slice(0, 3)
                .map(s => {
                    const skill = gameData.skills.find(sk => sk.id === s.skillID);
                    return skill ? skill.name : null;
                })
                .filter(Boolean);

            const profileLabel = profileLabels[character.aiProfile] || '⚖️ Balanced';

            const card = document.createElement('div');
            card.className = 'card roster-card';
            card.style.cssText = 'position:relative; overflow:hidden;';
            card.onclick = async () => await showCharacterDetail(character.id);

            const avatarBg = window.AVATARS?.renderCardBg(character.avatarId, character.avatarColor) ?? '';
            card.innerHTML = `
                ${avatarBg}
                <div class="roster-card__header">
                    <h3 class="roster-card__name">${character.name}</h3>
                    <span class="roster-card__race">${race?.name || 'Unknown'}</span>
                </div>
                <div class="roster-card__level">Level ${character.level} · ${characterClass}</div>
                ${skillNames.length ? `
                <div class="roster-card__skills">
                    ${skillNames.map(n => `<span class="roster-card__skill-tag">${n}</span>`).join('')}
                </div>` : ''}
                <div class="roster-card__footer">
                    <span class="roster-card__profile">${profileLabel}</span>
                </div>
            `;
            container.appendChild(card);
        });

        _renderRosterPagination(pagination);

    } catch (error) {
        console.error('Error rendering roster:', error);
        showError('Failed to load characters: ' + error.message);
    }
}

/**
 * Render pagination controls below the roster grid.
 * Mounts into #rosterPagination, creating the element if absent.
 */
function _renderRosterPagination(pagination) {
    const page       = pagination.page       || 1;
    const totalPages = pagination.totalPages || 1;
    const total      = pagination.total      || 0;

    let nav = document.getElementById('rosterPagination');
    if (!nav) {
        nav = document.createElement('div');
        nav.id = 'rosterPagination';
        const roster = document.getElementById('roster');
        if (roster) roster.appendChild(nav);
    }

    if (totalPages <= 1) {
        nav.innerHTML = '';
        return;
    }

    nav.innerHTML = `
        <div class="roster-pagination">
            <button class="secondary roster-pagination__btn"
                    ${page <= 1 ? 'disabled' : ''}
                    onclick="renderRoster(${page - 1})">← Prev</button>
            <span class="roster-pagination__info">
                Page ${page} of ${totalPages}
                <span class="roster-pagination__total">(${total} characters)</span>
            </span>
            <button class="secondary roster-pagination__btn"
                    ${page >= totalPages ? 'disabled' : ''}
                    onclick="renderRoster(${page + 1})">Next →</button>
        </div>
    `;
}

/**
 * Show character detail screen
 */
/**
 * Ensure a character has their racial intrinsic skill.
 * Migrates existing characters that predate the intrinsic system.
 */
async function ensureIntrinsicSkill(character) {
    const raceDef = window.gameData?.races?.find(r => r.id === character.race);
    const intrinsicId = raceDef?.intrinsicSkills?.[0];
    if (!intrinsicId) return false;

    const existing = (character.skills || []).find(s => s.skillID === intrinsicId);

    // Already present and correctly flagged
    if (existing?.intrinsic) return false;

    if (existing) {
        // Present but missing intrinsic flag — patch it in place
        existing.intrinsic = true;
        await saveCharacterToServer(character);
        console.log(`[MIGRATION] Patched intrinsic flag on ${intrinsicId} for ${character.name}`);
        return true;
    }

    // Not present at all — inject it
    if (!character.skills) character.skills = [];
    character.skills.push({
        skillID: intrinsicId,
        learned: true,
        intrinsic: true,
        usageCount: 0,
        skillXP: 0,
        skillLevel: 0,
        lastUsed: null
    });

    await saveCharacterToServer(character);
    console.log(`[MIGRATION] Injected intrinsic skill ${intrinsicId} for ${character.name}`);
    return true;
}


async function showCharacterDetail(characterId, opts = {}) {
    const silent = opts.silent === true;
    // Clear any stale merchant offer when navigating to detail manually

    try {
        const character = await getCharacter(characterId);
        if (!character) {
            showError('Character not found');
            return;
        }

        // Migrate existing characters that predate the intrinsic skill system
        await ensureIntrinsicSkill(character);

        currentState.detailCharacterId = characterId;
        const race = getRace(character.race);
        const xpToNextLevel = getXPToNextLevel(character.level);
        const xpPercent = getProgressPercent(character.experience, xpToNextLevel);
        
        document.getElementById('detailName').textContent = character.name;
        document.getElementById('detailRace').textContent = race ? race.name : 'Unknown';

        const detailHeader = document.getElementById('detailCharHeader');
        if (detailHeader) {
            const existingBg = detailHeader.querySelector('.avatar-card-bg');
            if (existingBg) existingBg.remove();
            const avatarBg = window.AVATARS?.renderCardBg(character.avatarId, character.avatarColor) ?? '';
            if (avatarBg) {
                detailHeader.insertAdjacentHTML('afterbegin', avatarBg);
                const bgEl = detailHeader.querySelector('.avatar-card-bg');
                const img  = bgEl?.querySelector('img');
                if (bgEl && img) {
                    bgEl.style.backgroundImage  = `url('${img.src}')`;
                    bgEl.style.backgroundSize   = 'auto 160%';
                    bgEl.style.backgroundRepeat = 'no-repeat';
                    bgEl.style.backgroundPosition = 'right 20%';
                    bgEl.style.animation = 'detail-portrait-pan 8s ease-in-out infinite alternate';
                }
            }
        }

        // Currency display
        const goldEl = document.getElementById('detailGold');
        const dustEl = document.getElementById('detailDust');
        if (goldEl) goldEl.textContent = `💰 ${(character.gold || 0).toFixed(0)}g`;
        if (dustEl) dustEl.textContent = `✨ ${(character.arcaneDust || 0).toFixed(2)} dust`;


        const detailLevelEl = document.getElementById('detailLevel');
        if (detailLevelEl) {
            detailLevelEl.innerHTML = `<span style="color:#d4af37;">${character.level}</span><span style="color:#555; font-size:0.85em;"> → ${character.level + 1}</span>`;
        }
        
        const totalStats = calculateTotalStats(character);
        document.getElementById('detailConviction').textContent = totalStats.conviction;
        addStatTooltip(document.getElementById('detailConviction'), 'conviction');
        document.getElementById('detailEndurance').textContent = totalStats.endurance;
        addStatTooltip(document.getElementById('detailEndurance'), 'endurance');
        document.getElementById('detailAmbition').textContent = totalStats.ambition;
        addStatTooltip(document.getElementById('detailAmbition'), 'ambition');
        document.getElementById('detailHarmony').textContent = totalStats.harmony;
        addStatTooltip(document.getElementById('detailHarmony'), 'harmony');
        const derived = calculateDerivedStatsWithEquipment(character);
        document.getElementById('detailHP').textContent = derived.hp;
        document.getElementById('detailMana').textContent = derived.mana;
        document.getElementById('detailStamina').textContent = derived.stamina;

        const xpBarEl  = document.getElementById('xpBar');
        const xpTextEl = document.getElementById('xpText');
        if (xpTextEl) xpTextEl.textContent = `${formatNumber(character.experience)}/${formatNumber(xpToNextLevel)}`;

        // Determine whether to animate the XP bar or just snap it
        const hasXPHistory = opts.prevXP != null && opts.prevLevel != null;
        const leveledUp    = hasXPHistory && character.level > opts.prevLevel;

        // Only snap immediately if we're NOT going to animate — animation handles its own positioning
        if (xpBarEl && !hasXPHistory) {
            xpBarEl.style.transition = 'none';
            xpBarEl.style.width = xpPercent + '%';
        }

        if (typeof renderLoadoutSummary === 'function') renderLoadoutSummary(character);
        renderCharacterSkills(character);
        renderExportButton(character);
        renderImportBadge(character);
        renderCombatHistory(characterId);
        renderGearUpgradeBadge(character);
        if (typeof renderMerchant === 'function') renderMerchant(character);
        _renderTooltipHint();

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

        // Role tag
        const roleTag = character.roleTag || '';
        const ROLE_LABELS = {
            Defender: '🛡 Defender', Bruiser: '⚔️ Bruiser', Mage: '🔮 Mage',
            Healer: '💊 Healer', Support: '💚 Support', Utility: '🔧 Utility', Assassin: '🗡️ Assassin'
        };
        const roleTagBadge = document.getElementById('roleTagBadge');
        if (roleTagBadge) roleTagBadge.textContent = ROLE_LABELS[roleTag] || 'None';
        const roleTagSelect = document.getElementById('roleTagSelect');
        if (roleTagSelect) roleTagSelect.value = roleTag;
        const msg = document.getElementById('aiProfileSaveMsg');
        if (msg) msg.textContent = '';

        if (!silent) {
            showScreen('detail');
            if (typeof updateChallengeStatusBanner === 'function') updateChallengeStatusBanner();

            if (hasXPHistory && xpBarEl) {
                const prevXPToNext = getXPToNextLevel(opts.prevLevel);
                const fromPct      = Math.min(100, (opts.prevXP / prevXPToNext) * 100);

                // Kill CSS transition, snap to pre-combat position, let the browser paint it
                xpBarEl.style.transition = 'none';
                xpBarEl.style.width      = fromPct + '%';

                // Wait for the screen to actually render before starting the sweep
                setTimeout(() => {
                    const levelEl = document.getElementById('detailLevel');

                    if (leveledUp) {
                        // Sweep to 100%
                        xpBarEl.style.transition = 'width 0.9s ease-in-out';
                        xpBarEl.style.width      = '100%';
                        setTimeout(() => {
                            xpBarEl.classList.add('hub-xpbar-levelflash');
                            if (levelEl) levelEl.classList.add('hub-levelup-flash');
                            // Reset to 0, sweep to final
                            setTimeout(() => {
                                xpBarEl.style.transition = 'none';
                                xpBarEl.style.width      = '0%';
                                xpBarEl.classList.remove('hub-xpbar-levelflash');
                                setTimeout(() => {
                                    xpBarEl.style.transition = 'width 1.0s ease-out';
                                    xpBarEl.style.width      = xpPercent + '%';
                                }, 50);
                            }, 480);
                            setTimeout(() => levelEl?.classList.remove('hub-levelup-flash'), 2400);
                        }, 950);
                    } else {
                        // Sweep to final, then pulse twice on arrival
                        xpBarEl.style.transition = 'width 1.4s cubic-bezier(0.16, 1, 0.3, 1)';
                        xpBarEl.style.width      = xpPercent + '%';
                        setTimeout(() => {
                            xpBarEl.classList.add('hub-xpbar-pulse');
                            setTimeout(() => xpBarEl.classList.remove('hub-xpbar-pulse'), 1000);
                        }, 1500);
                    }
                }, 120);
            }
        }
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
        const itemId = (v => v && typeof v === 'object' ? v.itemID : v)(character.equipment[slot]);
        const item = itemId ? gameData.gear.find(g => g.id === itemId) : null;
        
        const slotEl = document.createElement('div');
        slotEl.className = 'equipment-slot';
        
        let bonusText = '';
        let dmgText   = '';
        let descText  = '';
        if (item) {
            const bonuses = [];
            if (item.hp)   bonuses.push(`+${item.hp} HP`);
            if (item.mana) bonuses.push(`+${item.mana} Mana`);
            if (item.con)  bonuses.push(`+${item.con} CON`);
            if (item.end)  bonuses.push(`+${item.end} END`);
            if (item.amb)  bonuses.push(`+${item.amb} AMB`);
            if (item.har)  bonuses.push(`+${item.har} HAR`);
            bonusText = bonuses.length > 0 ? `<div class="slot-bonus">${bonuses.join(', ')}</div>` : '';
            const dmgParts = [];
            [1,2,3,4].forEach(n => {
                if (item[`dmg${n}`]) dmgParts.push(item[`dmg_type_${n}`] ? `${item[`dmg${n}`]} ${item[`dmg_type_${n}`]}` : `${item[`dmg${n}`]}`);
            });
            if (item.armor) dmgParts.push(`${item.armor} Armor`);
            const dmgStr   = dmgParts.join(' + ');
            const delayStr = item.delay != null ? `Delay ${item.delay}` : '';
            const combined = [dmgStr, delayStr].filter(Boolean).join(' · ');
            dmgText  = combined ? `<div class="slot-bonus">${combined}</div>` : '';
            descText = item.description ? `<div class="slot-desc">${item.description}</div>` : '';
        }

        slotEl.innerHTML = `
            <div class="slot-type">${slot}</div>
            <div class="slot-item">${item ? item.name : '(Empty)'}</div>
            ${dmgText}
            ${bonusText}
            ${descText}
        `;
        
        if (item) {
            addGearCardTooltip(slotEl, item);
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
    // Build non-intrinsic skill list for slot rendering
    const nonIntrinsicSkills = (character.skills || []).filter(s => !s.intrinsic);

    for (let i = 0; i < TOTAL_SLOTS; i++) {
        const slotIndex = i;
        // Get the skill currently in this slot (if any) — intrinsics are excluded
        const skillRecord = nonIntrinsicSkills[slotIndex] || null;
        
        const card = document.createElement('div');
        card.className = 'card skill-card';
        
        if (skillRecord) {
            const skillDef = window.gameData.skills.find(s => s.id === skillRecord.skillID);
            
            if (skillDef) {
                // Content
                const contentDiv = document.createElement('div');

                const comboHints = typeof getComboHints === 'function'
                    ? getComboHints(character, skillRecord.skillID)
                    : [];
                const hintHTML = comboHints.length > 0
                    ? `<div style="margin-top:0.5rem; font-size:0.78em; color:#c8a84b; border-top:1px solid rgba(200,168,75,0.25); padding-top:0.4rem;">
                           ⚗ May combine with: ${comboHints.join(', ')}
                       </div>`
                    : '';

                const skillLevel = skillRecord.skillLevel || 1;
                const skillXP = skillRecord.skillXP || 0;
                const xpThreshold = skillLevel < 1 ? 120 : Math.round(100 * skillLevel * 1.2);
                const xpPct = Math.min(100, Math.floor((skillXP / xpThreshold) * 100));
                const xpBarHTML = `
                    <div style="margin-top:0.5rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
                            <span style="color:#888; font-size:0.72em;">XP</span>
                            <span style="color:#888; font-size:0.72em;">${skillXP.toFixed(0)} / ${xpThreshold}</span>
                        </div>
                        <div style="background:#0f0f1e; border-radius:3px; height:4px; overflow:hidden;">
                            <div style="background:linear-gradient(90deg,#d4af37,#ffe066); width:${xpPct}%; height:100%; transition:width 0.3s;"></div>
                        </div>
                    </div>`;

                contentDiv.innerHTML = `
                    <div class="card-title" style="color:#ffd700;">${skillDef.name}</div>
                    <div class="card-description">Level ${skillLevel}</div>
                    ${xpBarHTML}
                    ${hintHTML}
                `;
                card.appendChild(contentDiv);
                
                // Add Tooltip
                addSkillTooltip(card, skillDef);

                // Swap Button
                const btn = document.createElement('button');
                btn.textContent = '🔄 Change Skill';
                btn.className = 'btn-swap secondary';
                btn.onclick = () => openSkillSwapModal(character, slotIndex);
                card.appendChild(btn);
            } else {
                // Stale skill ID — no matching definition in current game data
                console.warn(`[skills] Unknown skill ID in slot ${slotIndex}: ${skillRecord.skillID}`);
                card.innerHTML = `
                    <div class="card-title" style="color:#888;">Skill Unavailable</div>
                    <div class="card-description">This skill no longer exists. Please select a replacement.</div>
                `;
                const btn = document.createElement('button');
                btn.textContent = '⚡ Equip Skill';
                btn.className = 'btn-swap secondary';
                btn.onclick = () => openSkillSwapModal(character, slotIndex);
                card.appendChild(btn);
            }
        } else {
            // Empty Slot
            card.innerHTML = `
                <div class="card-title" style="color:#666;">Empty Slot ${slotIndex + 1}</div>
                <div class="card-description">No skill equipped</div>
                <button id="swap-btn-${slotIndex}" class="btn-swap secondary">
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
    // Intrinsic skills are excluded — they're invisible until naturally unlocked.
    const discoveredLocked = character.skills.filter(
        rec => rec.discovered && (rec.skillLevel || 0) < 1 && !rec.intrinsic
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

            const parents = (skillDef?.parentSkills || [])
                .map(pid => window.gameData?.skills?.find(s => s.id === pid)?.name || pid)
                .filter(Boolean);
            const comboLine = parents.length === 2
                ? `<div style="color:#c8a84b; font-size:0.7em; margin-top:4px;">⚗ Discovered via: ${parents.join(' + ')}</div>`
                : '';

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
                ${comboLine}
            `;
            section.appendChild(row);
        });

        container.appendChild(section);
    }

    // Racial bonus skill — always shown, marked as innate
    const raceDef = window.gameData?.races?.find(r => r.id === character.race);
    const racialSkillIds = raceDef?.intrinsicSkills || [];
    if (racialSkillIds.length) {
        const racialSection = document.createElement('div');
        racialSection.style.cssText = 'margin-top:1rem;';
        racialSection.innerHTML = `<div style="color:#888; font-size:0.75rem; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px;">Racial Ability</div>`;

        racialSkillIds.forEach(skillId => {
            const skillDef = window.gameData?.skills?.find(s => s.id === skillId);
            if (!skillDef) return;
            const card = document.createElement('div');
            card.style.cssText = 'background:rgba(138,100,255,0.08); border:1px solid rgba(138,100,255,0.3); border-radius:6px; padding:8px 10px;';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="color:#aa88ff; font-weight:bold; font-size:0.9em;">⭐ ${skillDef.name}</span>
                    <span style="color:#666; font-size:0.72em;">Innate · ${raceDef.name}</span>
                </div>
                <div style="color:#888; font-size:0.78em; margin-top:3px;">${skillDef.description || ''}</div>
                ${skillDef.costType && skillDef.costType !== 'none' ? `<div style="color:#555; font-size:0.72em; margin-top:2px;">Cost: ${skillDef.costAmount} ${skillDef.costType}</div>` : ''}
            `;
            addSkillTooltip(card, skillDef);
            racialSection.appendChild(card);
        });

        container.appendChild(racialSection);
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

    // Use non-intrinsic skills for slot indexing
    const nonIntrinsic = (character.skills || []).filter(s => !s.intrinsic);
    const otherSlotIndex = slotIndex === 0 ? 1 : 0;
    const otherSlotSkillID = nonIntrinsic[otherSlotIndex]?.skillID;
    const currentSlotSkillID = nonIntrinsic[slotIndex]?.skillID;

    // Collect intrinsic skill IDs for this character's race
    const raceDef = window.gameData?.races?.find(r => r.id === character.race);
    const intrinsicIds = new Set(
        (character.skills || []).filter(s => s.intrinsic).map(s => s.skillID)
    );

    // Filter equippable skills:
    // - Must be a starter skill OR owned at level 1+
    // - Must not be the skill already in THIS slot (no-op swap)
    // - CONSUMABLE skills are excluded
    // - INTRINSIC skills are excluded (they're always active, never need equipping)
    const equippableSkills = window.gameData.skills.filter(s => {
        if (s.category && s.category.includes('CONSUMABLE')) return false;
        if (intrinsicIds.has(s.id)) return false; // intrinsic — always active

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
    if (confirmSkillSwap._inProgress) return;
    confirmSkillSwap._inProgress = true;

    const modal = document.getElementById('skillSwapModal');
    if (modal) modal.style.display = 'none';

    // Separate intrinsic and non-intrinsic skills — intrinsics are never moved
    const intrinsicSkills   = character.skills.filter(s => s.intrinsic);
    const nonIntrinsicSkills = character.skills.filter(s => !s.intrinsic);

    const oldSkillRecord = nonIntrinsicSkills[slotIndex];

    // 1. Find the record for the NEW skill
    let newSkillRecord = nonIntrinsicSkills.find(s => s.skillID === newSkillID) || null;
    if (!newSkillRecord) {
        // New starter skill not yet in array
        newSkillRecord = {
            skillID: newSkillID,
            skillLevel: 1,
            skillXP: 0,
            usageCount: 0,
            learned: true
        };
    }

    // 2. Secure the OLD skill (the one being kicked out of the slot)
    let skillToUnequip = null;
    if (oldSkillRecord && oldSkillRecord.skillID !== newSkillID) {
        skillToUnequip = oldSkillRecord;
    }

    // 3. Rebuild non-intrinsic skills array cleanly
    const otherSlotIndex   = slotIndex === 0 ? 1 : 0;
    const otherSlotID      = nonIntrinsicSkills[otherSlotIndex]?.skillID;
    const otherSkillRecord = nonIntrinsicSkills.find(s => s.skillID === otherSlotID);
    const isSlotSwap       = (newSkillID === otherSlotID);

    let newOtherSlotRecord;
    if (isSlotSwap) {
        newOtherSlotRecord = oldSkillRecord || null;
    } else {
        newOtherSlotRecord = otherSkillRecord || null;
    }

    // Skills beyond the two equipped slots that aren't being moved
    const unequippedSkills = nonIntrinsicSkills.filter(s => {
        if (s.skillID === nonIntrinsicSkills[0]?.skillID || s.skillID === nonIntrinsicSkills[1]?.skillID) return false;
        if (s.skillID === newSkillID) return false;
        if (isSlotSwap && s.skillID === otherSlotID) return false;
        return true;
    });

    if (!isSlotSwap && skillToUnequip && !unequippedSkills.some(s => s.skillID === skillToUnequip.skillID)) {
        unequippedSkills.push(skillToUnequip);
    }

    // Build [slot0, slot1, ...rest] then append intrinsics at the end
    const finalNonIntrinsic = [];
    if (slotIndex === 0) {
        finalNonIntrinsic.push(newSkillRecord);
        if (newOtherSlotRecord) finalNonIntrinsic.push(newOtherSlotRecord);
    } else {
        if (newOtherSlotRecord) finalNonIntrinsic.push(newOtherSlotRecord);
        finalNonIntrinsic.push(newSkillRecord);
    }
    finalNonIntrinsic.push(...unequippedSkills);

    // 4. Apply and Save — intrinsics always preserved at the end
    character.skills = [...finalNonIntrinsic, ...intrinsicSkills];

    try {
        await saveCharacterToServer(character);
        if (typeof showSafeSuccess === 'function') {
            showSafeSuccess(`Equipped ${window.gameData.skills.find(s=>s.id===newSkillID).name}!`);
        }
        await renderCharacterSkills(character);
    } catch (err) {
        if (typeof showSafeError === 'function') showSafeError('Failed to save skills: ' + err.message);
        console.error(err);
    } finally {
        confirmSkillSwap._inProgress = false;
    }
}

/**
 * Helper to create modal HTML if it doesn't exist in index.html
 */
function createSkillSwapModalHTML() {
    const modal = document.createElement('div');
    modal.id = 'skillSwapModal';
    modal.innerHTML = `
        <div>
            <h3 id="skillSwapTitle">Select Skill</h3>
            <div id="skillSwapList"></div>
            <button class="danger" onclick="document.getElementById('skillSwapModal').style.display='none'">Cancel</button>
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
        const response = await authFetch(`${BACKEND_URL}/api/characters/${characterId}/aiProfile`, {
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

async function saveRoleTag() {
    const characterId = currentState.detailCharacterId;
    const select = document.getElementById('roleTagSelect');
    const msg    = document.getElementById('roleTagSaveMsg');
    const badge  = document.getElementById('roleTagBadge');
    if (!characterId || !select) return;

    const roleTag = select.value;
    const ROLE_LABELS = {
        Defender: '🛡 Defender', Bruiser: '⚔️ Bruiser', Mage: '🔮 Mage',
        Healer: '💊 Healer', Support: '💚 Support', Utility: '🔧 Utility', Assassin: '🗡️ Assassin'
    };

    try {
        const character = await getCharacter(characterId);
        if (!character) throw new Error('Character not found');
        character.roleTag = roleTag;
        await saveCharacterToServer(character);

        if (badge) badge.textContent = ROLE_LABELS[roleTag] || 'None';
        if (msg) {
            msg.textContent = 'Role saved.';
            setTimeout(() => { if (msg) msg.textContent = ''; }, 2000);
        }
    } catch (err) {
        if (msg) msg.textContent = 'Failed to save.';
        console.error('saveRoleTag error:', err);
    }
}

async function deleteCharacter(characterId) {
    if (deleteCharacter._inProgress) return;
    if (confirm('Are you sure you want to delete this character? This cannot be undone.')) {
        deleteCharacter._inProgress = true;
        try {
            const response = await authFetch(`${BACKEND_URL}/api/characters/${characterId}`, {
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
        } finally {
            deleteCharacter._inProgress = false;
        }
    }
}

// ============================================================================
// TOOLTIP FUNCTIONS (MISSING FROM OLD FILE)
// ============================================================================

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
 * Score an item by total stat contribution + tier weight.
 * Used for gear upgrade comparisons only — not build-aware by design.
 */
function _gearScore(itemDef) {
    if (!itemDef) return 0;
    const stats = ['con', 'end', 'amb', 'har', 'conviction', 'endurance', 'ambition', 'harmony'];
    let score = stats.reduce((sum, k) => sum + (itemDef[k] || 0), 0);
    if (itemDef.statBonuses) {
        score += Object.values(itemDef.statBonuses).reduce((s, v) => s + (v || 0), 0);
    }
    score += (itemDef.tier || 0) * 2;
    return score;
}

/**
 * Show/hide the gear upgrade badge based on inventory vs equipped.
 * Respects the gearAlerts setting. Runs on every character detail render.
 */
function renderGearUpgradeBadge(character) {
    const badge = document.getElementById('gearUpgradeBadge');
    if (!badge) return;

    // Check setting
    const settings = typeof loadSettings === 'function' ? loadSettings() : {};
    if ((settings.gearAlerts || 'on') === 'off') {
        badge.style.display = 'none';
        return;
    }

    const equipped  = character.equipment || {};
    const inventory = character.inventory  || [];
    if (!inventory.length) { badge.style.display = 'none'; return; }

    const GEAR_SLOTS = ['mainHand', 'offHand', 'head', 'chest', 'accessory1', 'accessory2'];

    // Score each currently equipped item per slot
    const equippedScores = {};
    GEAR_SLOTS.forEach(slot => {
        const itemId  = (v => v && typeof v === 'object' ? v.itemID : v)(equipped[slot]);
        const itemDef = itemId ? window.gameData?.gear?.find(g => g.id === itemId) : null;
        equippedScores[slot] = _gearScore(itemDef);
    });

    // Check if any inventory item beats what's equipped in its slot
    const hasUpgrade = inventory.some(inv => {
        if (!inv?.itemID) return false;
        const itemDef = window.gameData?.gear?.find(g => g.id === inv.itemID);
        if (!itemDef) return false;
        const slot = itemDef.slot_id1 || itemDef.slot;
        if (!GEAR_SLOTS.includes(slot)) return false;
        return _gearScore(itemDef) > equippedScores[slot];
    });

    badge.style.display = hasUpgrade ? 'inline-flex' : 'none';
}

function renderExportButton(character) {
    const btn = document.getElementById('exportCharacterBtn');
    if (!btn) return;

    if (character && character.id) currentState.detailCharacterId = character.id;

    if (character.isImportedReference) {
        btn.disabled = true;
        btn.textContent = '📤 Sharing: N/A';
        btn.title = 'Imported characters cannot be shared';
        btn.style.opacity = '0.4';
        btn.style.cursor = 'not-allowed';
        btn.style.color = '';
        btn.style.borderColor = '';
    } else {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        const isSharing = !!(character.shareEnabled || character.isPublic);
        if (isSharing) {
            btn.textContent       = '📤 Sharing: On';
            btn.style.color       = '#4cd964';
            btn.style.borderColor = '#4cd964';
            btn.title = 'Sharing enabled — click to turn off';
        } else {
            btn.textContent       = '📤 Sharing: Off';
            btn.style.color       = '';
            btn.style.borderColor = '';
            btn.title = 'Click to share this character publicly';
        }
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
            return `<div class="history-entry__stage" style="border-left:2px solid ${sc};">
                <span style="color:${sc}; font-weight:500;">${s.title}: ${s.status?.toUpperCase()}</span>
                ${s.summaryText ? `<span style="color:#666;"> — ${s.summaryText}</span>` : ''}
            </div>`;
        }).join('');

        return `<div class="history-entry" style="border-left:3px solid ${color};">
            <div class="history-entry__header">
                <span class="history-entry__challenge">${challenge}</span>
                <span style="color:${color}; font-size:0.8rem; font-weight:600;">${label}</span>
            </div>
            <div class="history-entry__meta">${date} &middot; ${log.totalTurns} turns</div>
            ${stageRows}
            <div class="history-entry__actions">
                <button class="btn-history-log secondary" onclick="viewCombatTextLog('${log.id}')">📄 View Log</button>
                <button class="btn-history-replay secondary" onclick="replayCombatLog('${log.id}')">▶ Replay</button>
            </div>
            <div id="textlog-${log.id}" class="history-entry__textlog"></div>
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
/**
 * Mobile tooltip hint — shown each session until permanently dismissed.
 * Only renders on touch devices (mobile). Stored flag: 'tooltipHintDismissed'.
 */
function _renderTooltipHint() {
    if (window.innerWidth > 768) return;
    if (localStorage.getItem('tooltipHintDismissed') === 'true') return;

    const el = document.getElementById('tooltipHint');
    if (!el) return;

    el.style.display = 'flex';
    el.innerHTML = `
        <span>💡 Long press skills or gear for details</span>
        <button class="btn-dismiss-hint" onclick="
            localStorage.setItem('tooltipHintDismissed','true');
            document.getElementById('tooltipHint').style.display='none';
        ">Dismiss forever</button>
    `;
}
