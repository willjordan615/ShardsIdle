// game-data.js
// Handles all data loading from backend and maintains global game state

const BACKEND_URL = 'http://localhost:3001';

let gameData = {
    races: [],
    skills: [],
    gear: [],
    challenges: [],
    consumables: [],
    bots: [],
    characters: []
};

let currentState = {
    detailCharacterId: null,
    selectedChallenge: null,
    currentParty: [],
    selectedBots: [],
    selectedRace: null,
    selectedSkills: [],
    selectedWeaponType: null,
    allocatedStats: { conviction: 0, endurance: 0, ambition: 0, harmony: 0 },
    pointsRemaining: 25
};

/**
 * Initialize the game by loading all data from backend and localStorage
 */
async function initializeGame() {
    try {
        console.log('Loading game data from backend...');
        const response = await fetch(`${BACKEND_URL}/api/data/all`);
        
        if (!response.ok) {
            throw new Error(`Backend returned ${response.status}`);
        }
        
        // 1. Parse the data first
        const dataFromServer = await response.json();
        
        // 2. Update our local gameData object
        gameData.races = dataFromServer.races || [];
        gameData.skills = dataFromServer.skills || [];
        gameData.gear = dataFromServer.gear || [];
        gameData.challenges = dataFromServer.challenges || [];
        gameData.consumables = dataFromServer.consumables || [];
        gameData.bots = dataFromServer.bots || [];
        
        // 3. CRITICAL: Attach to window ONLY after data is safe
        window.gameData = gameData; 
        console.log('✅ Game data loaded and attached to window.gameData');
        
        // 4. Load characters
        const savedCharacters = localStorage.getItem('characters');
        gameData.characters = savedCharacters ? JSON.parse(savedCharacters) : [];
        console.log(`Loaded ${gameData.characters.length} characters from localStorage`);
        
        // 5. Trigger UI renders if needed (optional, depending on your flow)
        if (typeof renderChallenges === 'function') renderChallenges();
        
        return true;
    } catch (error) {
        console.error('❌ Failed to initialize game:', error);
        showError(`Failed to load game data: ${error.message}`);
        return false;
    }
}

/**
 * Save characters to localStorage
 */
function saveCharacters() {
    try {
        localStorage.setItem('characters', JSON.stringify(gameData.characters));
        console.log('Characters saved to localStorage');
    } catch (error) {
        console.error('Failed to save characters:', error);
    }
}

/**
 * Get a character by ID
 */
function getCharacter(characterId) {
    return gameData.characters.find(c => c.id === characterId);
}

/**
 * Determine mentality type based on stat distribution
 */
function getMentality(stats) {
    const total = stats.conviction + stats.endurance + stats.ambition + stats.harmony;
    const convictionRatio = stats.conviction / total;
    const enduranceRatio = stats.endurance / total;
    const ambitionRatio = stats.ambition / total;
    const harmonyRatio = stats.harmony / total;
    
    if (convictionRatio > 0.35) return 'Aggressive';
    if (enduranceRatio > 0.35) return 'Defensive';
    if (ambitionRatio > 0.35) return 'Ambitious';
    if (harmonyRatio > 0.35) return 'Peaceful';
    return 'Balanced';
}

/**
 * Determine class based on primary skills
 */
function getCharacterClass(character, skills) {
    if (!character.skills || character.skills.length === 0) return 'Novice';
    
    let damageCount = 0;
    let healCount = 0;
    let buffCount = 0;
    
    character.skills.forEach(skillEntry => {
        const skill = skills.find(s => s.id === skillEntry.skillID);
        if (skill) {
            if (skill.category.includes('DAMAGE')) damageCount++;
            if (skill.category.includes('HEALING')) healCount++;
            if (skill.category.includes('BUFF')) buffCount++;
        }
    });
    
    if (healCount > damageCount && healCount > buffCount) return 'Healer';
    if (buffCount > damageCount && buffCount > healCount) return 'Support';
    return 'Warrior';
}

/**
 * Get a race by ID
 */
function getRace(raceId) {
    return gameData.races.find(r => r.id === raceId);
}

/**
 * Get a skill by ID
 */
function getSkill(skillId) {
    return gameData.skills.find(s => s.id === skillId);
}

/**
 * Get gear item by ID
 */
function getGearItem(itemId) {
    return gameData.gear.find(g => g.id === itemId);
}

/**
 * Get consumable by ID
 */
function getConsumable(consumableId) {
    return gameData.consumables.find(c => c.id === consumableId);
}

/**
 * Get a bot by ID
 */
function getBot(botId) {
    return gameData.bots.find(b => b.characterID === botId);
}

/**
 * Get a challenge by ID
 */
function getChallenge(challengeId) {
    return gameData.challenges.find(c => c.id === challengeId);
}

/**
 * Calculate total stats including equipment bonuses
 */
function calculateTotalStats(character) {
    let totalStats = {
        conviction: character.stats.conviction || 0,
        endurance: character.stats.endurance || 0,
        ambition: character.stats.ambition || 0,
        harmony: character.stats.harmony || 0
    };
    
    // Add bonuses from equipped items
    if (character.equipment) {
        Object.values(character.equipment).forEach(itemId => {
            if (!itemId) return; // Skip empty slots
            
            const item = gameData.gear.find(g => g.id === itemId);
            
            if (item && item.statBonuses) {
                totalStats.conviction += item.statBonuses.conviction || 0;
                totalStats.endurance += item.statBonuses.endurance || 0;
                totalStats.ambition += item.statBonuses.ambition || 0;
                totalStats.harmony += item.statBonuses.harmony || 0;
            }
        });
    }
    
    return totalStats;
}

/**
 * Calculate derived stats (HP, Mana, Stamina)
 */
function calculateDerivedStats(character) {
    const level = character.level || 1;
    const stats = character.stats || {};
    
    const hp = Math.floor((100 + (level - 1) * 20) * (1 + (stats.endurance || 0) / 300));
    const mana = Math.floor((50 + (level - 1) * 10) * (1 + ((stats.harmony || 0) * 0.7 + (stats.endurance || 0) * 0.3) / 300));
    const stamina = Math.floor((75 + (level - 1) * 15) * (1 + ((stats.endurance || 0) * 0.7 + (stats.conviction || 0) * 0.3) / 300));
    
    return { hp, mana, stamina };
}

/**
 * Calculate derived stats including equipment bonuses
 */
function calculateDerivedStatsWithEquipment(character) {
    const level = character.level || 1;
    const totalStats = calculateTotalStats(character);
    
    const hp = Math.floor((100 + (level - 1) * 20) * (1 + (totalStats.endurance || 0) / 300));
    const mana = Math.floor((50 + (level - 1) * 10) * (1 + ((totalStats.harmony || 0) * 0.7 + (totalStats.endurance || 0) * 0.3) / 300));
    const stamina = Math.floor((75 + (level - 1) * 15) * (1 + ((totalStats.endurance || 0) * 0.7 + (totalStats.conviction || 0) * 0.3) / 300));
    
    return { hp, mana, stamina };
}

/**
 * Calculate XP needed for next level
 */
function getXPToNextLevel(level) {
    return Math.floor(level * 1000 * 1.2);
}

/**
 * Display error message to user
 */
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '20px';
    errorDiv.style.left = '50%';
    errorDiv.style.transform = 'translateX(-50%)';
    errorDiv.style.zIndex = '9999';
    errorDiv.style.minWidth = '400px';
    document.body.appendChild(errorDiv);
    
    setTimeout(() => errorDiv.remove(), 5000);
}
