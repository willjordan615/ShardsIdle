// Global state for editor
let allChallenges = [];
let allEnemies = [];
let currentChallengeIndex = -1;
let currentEnemyIndex = -1;

async function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    
    if (screenId === 'editor-screen') {
        await loadEditorData();
        switchEditorTab('challenges');
    }
}

function switchEditorTab(tab) {
    document.getElementById('tab-challenges').style.display = tab === 'challenges' ? 'block' : 'none';
    document.getElementById('tab-enemies').style.display = tab === 'enemies' ? 'block' : 'none';
}

async function loadEditorData() {
    try {
        const [chalRes, eneRes] = await Promise.all([
            fetch('/api/admin/data/challenges'),
            fetch('/api/admin/data/enemies')
        ]);
        allChallenges = await chalRes.json();
        allEnemies = await eneRes.json();
        populateDropdowns();
    } catch (err) {
        showError('Failed to load editor data: ' + err.message);
    }
}

function populateDropdowns() {
    const chalSelect = document.getElementById('challenge-select');
    const eneSelect = document.getElementById('enemy-select');
    
    chalSelect.innerHTML = '<option value="">-- Select a Challenge --</option>';
    allChallenges.forEach((c, i) => {
        chalSelect.innerHTML += `<option value="${i}">${c.name} (${c.id})</option>`;
    });

    eneSelect.innerHTML = '<option value="">-- Select an Enemy --</option>';
    allEnemies.forEach((e, i) => {
        eneSelect.innerHTML += `<option value="${i}">${e.name} (${e.id})</option>`;
    });
}

// ================= CHALLENGE LOGIC =================

function loadChallengeIntoForm() {
    const idx = document.getElementById('challenge-select').value;
    if (idx === "") {
        document.getElementById('challenge-form-container').style.display = 'none';
        return;
    }
    currentChallengeIndex = parseInt(idx);
    const c = allChallenges[currentChallengeIndex];
    
    document.getElementById('chal-id').value = c.id;
    document.getElementById('chal-name').value = c.name;
    document.getElementById('chal-desc').value = c.description;
    
    renderStages(c.stages);
    document.getElementById('challenge-form-container').style.display = 'block';
}

function renderStages(stages) {
    const container = document.getElementById('stages-list');
    container.innerHTML = '';
    
    stages.forEach((stage, sIdx) => {
        const stageDiv = document.createElement('div');
        stageDiv.className = 'section';
        stageDiv.style.padding = '1rem';
        stageDiv.style.marginBottom = '1rem';
        
        let html = `
            <h4>Stage ${stage.stageId}: ${stage.title}</h4>
            <div class="grid-2">
                <div class="form-group"><label>Title</label><input type="text" value="${stage.title}" onchange="updateStage(${sIdx}, 'title', this.value)"></div>
                <div class="form-group"><label>Description</label><input type="text" value="${stage.description}" onchange="updateStage(${sIdx}, 'description', this.value)"></div>
            </div>
            
            <h5>Enemies</h5>
            <div id="stage-${sIdx}-enemies"></div>
            <button class="mini-btn" onclick="addEnemyToStage(${sIdx})">+ Add Enemy</button>
            
            <h5>Pre-Combat Opportunities</h5>
            <div id="stage-${sIdx}-precombat"></div>
            <button class="mini-btn" onclick="addPreCombatToStage(${sIdx})">+ Add Opportunity</button>
            
            <button class="danger mini-btn" style="margin-top:1rem" onclick="removeStage(${sIdx})">Remove Stage</button>
        `;
        
        stageDiv.innerHTML = html;
        container.appendChild(stageDiv);
        
        // Render Enemies for this stage
        const eneContainer = document.getElementById(`stage-${sIdx}-enemies`);
        (stage.enemies || []).forEach((ene, eIdx) => {
            const countVal = ene.countRange ? `[${ene.countRange[0]}, ${ene.countRange[1]}]` : ene.count;
            eneContainer.innerHTML += `
                <div style="background:rgba(0,0,0,0.3); padding:0.5rem; margin-bottom:0.5rem; display:flex; gap:0.5rem; align-items:center;">
                    <span>${ene.enemyTypeID}</span>
                    <span>Lvl ${ene.level}</span>
                    <span>Count: ${countVal}</span>
                    <button class="danger mini-btn" onclick="removeEnemyFromStage(${sIdx}, ${eIdx})">X</button>
                </div>
            `;
        });

        // Render Pre-Combat for this stage
        const pcContainer = document.getElementById(`stage-${sIdx}-precombat`);
        (stage.preCombatOpportunities || []).forEach((pc, pcIdx) => {
            pcContainer.innerHTML += `
                <div style="background:rgba(0,0,0,0.3); padding:0.5rem; margin-bottom:0.5rem; border-left: 3px solid var(--color-narrative);">
                    <strong>${pc.name}</strong> (Req: ${pc.requiredSkillID})<br>
                    <small>Success: ${pc.successEffect.type} | Fail: ${pc.failureEffect.type} | Fallback: ${pc.fallbackEffect ? pc.fallbackEffect.type : 'None'}</small>
                    <button class="danger mini-btn" style="float:right" onclick="removePreCombatFromStage(${sIdx}, ${pcIdx})">X</button>
                </div>
            `;
        });
    });
}

function updateStage(sIdx, field, value) {
    allChallenges[currentChallengeIndex].stages[sIdx][field] = value;
}

function addStage() {
    const c = allChallenges[currentChallengeIndex];
    const newId = c.stages.length > 0 ? Math.max(...c.stages.map(s => s.stageId)) + 1 : 1;
    c.stages.push({
        stageId: newId,
        title: "New Stage",
        description: "Description...",
        enemies: [],
        preCombatOpportunities: []
    });
    renderStages(c.stages);
}

function removeStage(sIdx) {
    if(confirm('Delete this stage?')) {
        allChallenges[currentChallengeIndex].stages.splice(sIdx, 1);
        renderStages(allChallenges[currentChallengeIndex].stages);
    }
}

function addEnemyToStage(sIdx) {
    const typeId = prompt("Enter Enemy Type ID (e.g., goblin_scout):");
    if (!typeId) return;
    const level = parseInt(prompt("Level?", "1"));
    const minC = parseInt(prompt("Min Count?", "1"));
    const maxC = parseInt(prompt("Max Count?", "1"));
    
    const stage = allChallenges[currentChallengeIndex].stages[sIdx];
    stage.enemies.push({
        enemyTypeID: typeId,
        level: level,
        countRange: minC === maxC ? undefined : [minC, maxC],
        count: minC === maxC ? minC : undefined
    });
    renderStages(allChallenges[currentChallengeIndex].stages);
}

function removeEnemyFromStage(sIdx, eIdx) {
    allChallenges[currentChallengeIndex].stages[sIdx].enemies.splice(eIdx, 1);
    renderStages(allChallenges[currentChallengeIndex].stages);
}

function addPreCombatToStage(sIdx) {
    const name = prompt("Opportunity Name:");
    if (!name) return;
    const skill = prompt("Required Skill ID:");
    const stat = prompt("Check Stat (ambition, endurance, etc.):", "ambition");
    
    const stage = allChallenges[currentChallengeIndex].stages[sIdx];
    if (!stage.preCombatOpportunities) stage.preCombatOpportunities = [];
    
    stage.preCombatOpportunities.push({
        id: `opp_${Date.now()}`,
        name: name,
        requiredSkillID: skill,
        checkStat: stat,
        secondaryStat: "endurance",
        difficultyThreshold: 40,
        successEffect: { type: "narrative_only", magnitude: 0, narrative: "Success!" },
        failureEffect: { type: "apply_direct_damage", magnitude: 0.2, statScale: "maxHP", narrative: "Failed!" },
        fallbackEffect: { type: "apply_direct_damage", magnitude: 0.3, statScale: "maxHP", narrative: "No skill!" }
    });
    renderStages(allChallenges[currentChallengeIndex].stages);
}

function removePreCombatFromStage(sIdx, pcIdx) {
    allChallenges[currentChallengeIndex].stages[sIdx].preCombatOpportunities.splice(pcIdx, 1);
    renderStages(allChallenges[currentChallengeIndex].stages);
}

async function saveChallenges() {
    try {
        const res = await fetch('/api/admin/data/challenges', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(allChallenges)
        });
        const result = await res.json();
        if (result.success) showSuccess('Challenges Saved! Reload game to see changes.');
        else showError('Save failed');
    } catch (err) {
        showError(err.message);
    }
}

function createNewChallenge() {
    const id = prompt("New Challenge ID (e.g., challenge_my_quest):");
    if (!id) return;
    allChallenges.push({
        id: id,
        name: "New Challenge",
        description: "Description",
        difficulty: 1,
        recommendedLevel: 1,
        minPartySize: 1,
        maxPartySize: 4,
        stages: [{ stageId: 1, title: "Stage 1", description: "Start", enemies: [] }],
        rewards: { baseXP: 100, baseGold: 50, lootTable: [] }
    });
    populateDropdowns();
    document.getElementById('challenge-select').value = allChallenges.length - 1;
    loadChallengeIntoForm();
}

// ================= ENEMY LOGIC =================

function loadEnemyIntoForm() {
    const idx = document.getElementById('enemy-select').value;
    if (idx === "") {
        document.getElementById('enemy-form-container').style.display = 'none';
        return;
    }
    currentEnemyIndex = parseInt(idx);
    const e = allEnemies[currentEnemyIndex];
    
    document.getElementById('ene-id').value = e.id;
    document.getElementById('ene-name').value = e.name;
    document.getElementById('ene-desc').value = e.description;
    document.getElementById('ene-stat-conviction').value = e.stats.conviction;
    document.getElementById('ene-stat-endurance').value = e.stats.endurance;
    document.getElementById('ene-stat-ambition').value = e.stats.ambition;
    document.getElementById('ene-stat-harmony').value = e.stats.harmony;
    document.getElementById('ene-defense').value = e.baseDefense;
    document.getElementById('ene-skill-count').value = e.skillSelectionCount;
    document.getElementById('ene-skills').value = e.availableSkills.join(', ');
    
    document.getElementById('enemy-form-container').style.display = 'block';
}

function updateEnemyField(field, value) {
    if (!allEnemies[currentEnemyIndex]) return;
    if (field.startsWith('stat_')) {
        const statName = field.replace('stat_', '');
        allEnemies[currentEnemyIndex].stats[statName] = parseInt(value) || 0;
    } else if (field === 'skills') {
        allEnemies[currentEnemyIndex].availableSkills = value.split(',').map(s => s.trim()).filter(s => s);
    } else if (field === 'defense') {
        allEnemies[currentEnemyIndex].baseDefense = parseInt(value) || 0;
    } else if (field === 'skill-count') {
        allEnemies[currentEnemyIndex].skillSelectionCount = parseInt(value) || 1;
    } else {
        allEnemies[currentEnemyIndex][field] = value;
    }
}

// Attach listeners to enemy inputs
document.addEventListener('DOMContentLoaded', () => {
    ['ene-name', 'ene-desc'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', (e) => updateEnemyField(id.replace('ene-', ''), e.target.value));
    });
    ['ene-stat-conviction', 'ene-stat-endurance', 'ene-stat-ambition', 'ene-stat-harmony'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', (e) => updateEnemyField('stat_' + id.split('-')[2], e.target.value));
    });
    const defEl = document.getElementById('ene-defense');
    if(defEl) defEl.addEventListener('input', (e) => updateEnemyField('defense', e.target.value));
    const scEl = document.getElementById('ene-skill-count');
    if(scEl) scEl.addEventListener('input', (e) => updateEnemyField('skill-count', e.target.value));
    const skEl = document.getElementById('ene-skills');
    if(skEl) skEl.addEventListener('input', (e) => updateEnemyField('skills', e.target.value));
});

async function saveEnemies() {
    try {
        const res = await fetch('/api/admin/data/enemies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(allEnemies)
        });
        const result = await res.json();
        if (result.success) showSuccess('Enemy Types Saved! Reload game to see changes.');
        else showError('Save failed');
    } catch (err) {
        showError(err.message);
    }
}

function createNewEnemy() {
    const id = prompt("New Enemy ID (e.g., my_custom_goblin):");
    if (!id) return;
    allEnemies.push({
        id: id,
        name: "New Enemy",
        description: "Description",
        stats: { conviction: 10, endurance: 10, ambition: 10, harmony: 10 },
        baseDefense: 0,
        availableSkills: ["basic_attack"],
        skillSelectionCount: 1,
        equipment: { mainHand: null, chest: null, offHand: null, head: null, accessory1: null, accessory2: null }
    });
    populateDropdowns();
    document.getElementById('enemy-select').value = allEnemies.length - 1;
    loadEnemyIntoForm();
}