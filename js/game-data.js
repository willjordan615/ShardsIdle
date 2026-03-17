// game-data.js
// Loads all static game data from the backend and attaches it to window.gameData.
// NOTE: currentState is declared and owned by combat-system.js.
//       Access it via the global `currentState` or `window.currentState`.
// NOTE: getCharacter, showError, and showSuccess are defined in
//       character-management.js and ui-helpers.js respectively.
//       Do not redefine them here.

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

/**
 * Initialize the game by loading all data from the backend.
 */
async function initializeGame() {
    try {
        console.log('Loading game data from backend...');
        const response = await fetch(`${BACKEND_URL}/api/data/all`);

        if (!response.ok) {
            throw new Error(`Backend returned ${response.status}`);
        }

        const dataFromServer = await response.json();

        gameData.races      = dataFromServer.races      || [];
        gameData.skills     = dataFromServer.skills     || [];
        gameData.gear       = dataFromServer.gear       || [];
        gameData.challenges = dataFromServer.challenges || [];
        gameData.consumables = dataFromServer.consumables || [];
        gameData.bots       = dataFromServer.bots       || [];

        // Attach to window ONLY after data is fully populated
        window.gameData = gameData;
        console.log('✅ Game data loaded and attached to window.gameData');

        // Characters live on the server — load count from localStorage for display only
        const savedCharacters = localStorage.getItem('characters');
        gameData.characters = savedCharacters ? JSON.parse(savedCharacters) : [];
        console.log(`Loaded ${gameData.characters.length} characters from localStorage`);

        if (typeof renderChallenges === 'function') renderChallenges();

        return true;
    } catch (error) {
        console.error('❌ Failed to initialize game:', error);
        // showError is defined in ui-helpers.js which loads after this file
        if (typeof showError === 'function') {
            showError(`Failed to load game data: ${error.message}`);
        }
        return false;
    }
}

/**
 * Determine mentality type based on stat distribution.
 */
function getMentality(stats) {
    const total = stats.conviction + stats.endurance + stats.ambition + stats.harmony;
    if (total === 0) return 'Balanced';
    const convictionRatio = stats.conviction / total;
    const enduranceRatio  = stats.endurance  / total;
    const ambitionRatio   = stats.ambition   / total;
    const harmonyRatio    = stats.harmony    / total;

    if (convictionRatio > 0.35) return 'Aggressive';
    if (enduranceRatio  > 0.35) return 'Defensive';
    if (ambitionRatio   > 0.35) return 'Ambitious';
    if (harmonyRatio    > 0.35) return 'Peaceful';
    return 'Balanced';
}

/**
 * Determine class based on primary skills.
 */
function getCharacterClass(character, skills) {
    if (!character.skills || character.skills.length === 0) return 'Novice';

    let damageCount = 0;
    let healCount   = 0;
    let buffCount   = 0;

    character.skills.forEach(skillEntry => {
        const skill = skills.find(s => s.id === skillEntry.skillID);
        if (skill) {
            if (skill.category.includes('DAMAGE'))  damageCount++;
            if (skill.category.includes('HEALING')) healCount++;
            if (skill.category.includes('BUFF'))    buffCount++;
        }
    });

    if (healCount > damageCount && healCount > buffCount) return 'Healer';
    if (buffCount > damageCount && buffCount > healCount) return 'Support';
    return 'Warrior';
}

// --- Lookup helpers ---

function getRace(raceId) {
    return gameData.races.find(r => r.id === raceId);
}

function getSkill(skillId) {
    return gameData.skills.find(s => s.id === skillId);
}

function getGearItem(itemId) {
    return gameData.gear.find(g => g.id === itemId);
}

function getConsumable(consumableId) {
    return gameData.consumables.find(c => c.id === consumableId);
}

function getBot(botId) {
    return gameData.bots.find(b => b.characterID === botId);
}

function getChallenge(challengeId) {
    return gameData.challenges.find(c => c.id === challengeId);
}

// --- Stat calculation helpers ---

/**
 * Calculate total stats including equipment bonuses.
 */
function calculateTotalStats(character) {
    let totalStats = {
        conviction: character.stats.conviction || 0,
        endurance:  character.stats.endurance  || 0,
        ambition:   character.stats.ambition   || 0,
        harmony:    character.stats.harmony    || 0
    };

    if (character.equipment) {
        Object.values(character.equipment).forEach(itemId => {
            if (!itemId) return;
            const item = gameData.gear.find(g => g.id === itemId);
            if (item && item.statBonuses) {
                totalStats.conviction += item.statBonuses.conviction || 0;
                totalStats.endurance  += item.statBonuses.endurance  || 0;
                totalStats.ambition   += item.statBonuses.ambition   || 0;
                totalStats.harmony    += item.statBonuses.harmony    || 0;
            }
        });
    }

    return totalStats;
}

/**
 * Calculate derived stats (HP, Mana, Stamina) from base stats only.
 */
function calculateDerivedStats(character) {
    const level = character.level || 1;
    const stats = character.stats || {};

    const hp      = Math.floor((100 + (level - 1) * 20) * (1 + (stats.endurance || 0) / 300));
    const mana    = Math.floor((50  + (level - 1) * 10) * (1 + ((stats.harmony || 0) * 0.7 + (stats.endurance || 0) * 0.3) / 300));
    const stamina = Math.floor((75  + (level - 1) * 15) * (1 + ((stats.endurance || 0) * 0.7 + (stats.conviction || 0) * 0.3) / 300));

    return { hp, mana, stamina };
}

/**
 * Calculate derived stats including equipment bonuses.
 */
function calculateDerivedStatsWithEquipment(character) {
    const level      = character.level || 1;
    const totalStats = calculateTotalStats(character);

    const hp      = Math.floor((100 + (level - 1) * 20) * (1 + (totalStats.endurance || 0) / 300));
    const mana    = Math.floor((50  + (level - 1) * 10) * (1 + ((totalStats.harmony || 0) * 0.7 + (totalStats.endurance || 0) * 0.3) / 300));
    const stamina = Math.floor((75  + (level - 1) * 15) * (1 + ((totalStats.endurance || 0) * 0.7 + (totalStats.conviction || 0) * 0.3) / 300));

    return { hp, mana, stamina };
}

/**
 * Calculate XP needed to reach the next level.
 */
function getXPToNextLevel(level) {
    return Math.floor(level * 1000 * 1.2);
}
