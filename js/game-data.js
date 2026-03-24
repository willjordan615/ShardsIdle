// game-data.js
// Loads all static game data from the backend and attaches it to window.gameData.
// NOTE: currentState is declared and owned by combat-system.js.
//       Access it via the global `currentState` or `window.currentState`.
// NOTE: getCharacter, showError, and showSuccess are defined in
//       character-management.js and ui-helpers.js respectively.
//       Do not redefine them here.

// Empty string = use same origin. Works whether running locally (localhost:3001)
// or deployed to any host, since the backend always serves the frontend.
const BACKEND_URL = '';

// ── Auth state ────────────────────────────────────────────────────────────────
// Single source of truth for the session token and current user.
// Updated by initAuth() on load and by login/register/guest flows.
window.authState = {
    token:    null,
    userId:   null,
    username: null,
    isGuest:  true,
    ready:    false,   // true once initAuth() has resolved
};

function getAuthToken() { return window.authState.token; }

/**
 * Fetch wrapper that injects Authorization header on all API calls.
 * Drop-in replacement for fetch() — same signature.
 */
window.authFetch = function(url, options = {}) {
    const token = getAuthToken();
    const headers = { ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(url, { ...options, headers });
};

/**
 * Persist auth state to localStorage.
 */
function saveAuthState() {
    if (window.authState.token) {
        localStorage.setItem('authToken', window.authState.token);
    } else {
        localStorage.removeItem('authToken');
    }
}

/**
 * Apply a login/guest response payload to authState.
 */
function applyAuthResponse(data) {
    window.authState.token    = data.token;
    window.authState.userId   = data.userId;
    window.authState.username = data.username;
    window.authState.isGuest  = !!data.isGuest;
    window.authState.ready    = true;
    saveAuthState();
}

/**
 * Initialize auth on page load.
 * 1. Try stored token → /api/auth/me
 * 2. If invalid/missing, create guest account automatically
 */
async function initAuth() {
    const stored = localStorage.getItem('authToken');
    if (stored) {
        try {
            const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
                headers: { 'Authorization': `Bearer ${stored}` }
            });
            if (res.ok) {
                const data = await res.json();
                window.authState.token    = stored;
                window.authState.userId   = data.userId;
                window.authState.username = data.username;
                window.authState.isGuest  = !!data.isGuest;
                window.authState.ready    = true;
                updateAuthUI();
                return;
            }
        } catch (e) {
            console.warn('[AUTH] Token validation failed:', e.message);
        }
        localStorage.removeItem('authToken');
    }

    // No valid token — create guest automatically
    try {
        const res = await fetch(`${BACKEND_URL}/api/auth/guest`, { method: 'POST' });
        if (res.ok) {
            const data = await res.json();
            applyAuthResponse(data);
            updateAuthUI();
            return;
        }
    } catch (e) {
        console.error('[AUTH] Guest creation failed:', e.message);
    }

    // Offline/error fallback — mark ready so game can still load
    window.authState.ready = true;
}

/**
 * Update the auth indicator in the nav bar.
 */
function updateAuthUI() {
    const el = document.getElementById('authUserDisplay');
    if (!el) return;
    const { username, isGuest } = window.authState;
    if (isGuest) {
        el.innerHTML = `<span style="color:#888;">Guest</span> <button onclick="showAuthModal('login')" style="font-size:0.75rem; padding:2px 8px; margin-left:6px;">Log In</button>`;
        // Show modal automatically for guests on first load
        if (!window._authModalShown) {
            window._authModalShown = true;
            setTimeout(() => window.showAuthModal('login'), 300);
        }
    } else {
        el.innerHTML = `<span style="color:#d4af37;">${username}</span> <button onclick="authLogout()" style="font-size:0.75rem; padding:2px 8px; margin-left:6px; opacity:0.6;">Log Out</button>`;
    }
}

/**
 * Log out — invalidate server session, clear local state, create new guest.
 */
async function authLogout() {
    try {
        await authFetch(`${BACKEND_URL}/api/auth/logout`, { method: 'POST' });
    } catch (e) { /* non-fatal */ }
    localStorage.removeItem('authToken');
    window.authState = { token: null, userId: null, username: null, isGuest: true, ready: false };
    await initAuth();
    updateAuthUI();
    if (typeof renderRoster === 'function') renderRoster();
    if (typeof showScreen === 'function') showScreen('hub');
}

window.showAuthModal = function(tab = 'login') {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    switchAuthTab(tab);
    // Pre-populate guest token for migration on login
    const guestInput = document.getElementById('authGuestToken');
    if (guestInput && window.authState.isGuest && window.authState.token) {
        guestInput.value = window.authState.token;
    }
    modal.style.display = 'flex';
};

window.closeAuthModal = function() {
    const modal = document.getElementById('authModal');
    if (modal) modal.style.display = 'none';
    document.getElementById('authError').textContent = '';
};

window.switchAuthTab = function(tab) {
    document.getElementById('authLoginTab').style.display  = tab === 'login'    ? 'block' : 'none';
    document.getElementById('authRegisterTab').style.display = tab === 'register' ? 'block' : 'none';
    document.querySelectorAll('.auth-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
    });
};

window.submitLogin = async function() {
    const username   = document.getElementById('loginUsername').value.trim();
    const password   = document.getElementById('loginPassword').value;
    const errorEl    = document.getElementById('authError');
    const guestToken = window.authState.isGuest ? window.authState.token : null;
    errorEl.textContent = '';

    if (!username || !password) { errorEl.textContent = 'Username and password required.'; return; }

    try {
        const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, guestToken })
        });
        const data = await res.json();
        if (!res.ok) { errorEl.textContent = data.error || 'Login failed.'; return; }
        applyAuthResponse(data);
        closeAuthModal();
        updateAuthUI();
        if (typeof renderRoster === 'function') renderRoster();
    } catch (e) {
        errorEl.textContent = 'Network error. Please try again.';
    }
};

window.submitRegister = async function() {
    const username  = document.getElementById('registerUsername').value.trim();
    const password  = document.getElementById('registerPassword').value;
    const confirm   = document.getElementById('registerConfirm').value;
    const errorEl   = document.getElementById('authError');
    errorEl.textContent = '';

    if (!username || !password) { errorEl.textContent = 'Username and password required.'; return; }
    if (password !== confirm)   { errorEl.textContent = 'Passwords do not match.'; return; }
    if (password.length < 8)    { errorEl.textContent = 'Password must be at least 8 characters.'; return; }

    try {
        const res = await authFetch(`${BACKEND_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) { errorEl.textContent = data.error || 'Registration failed.'; return; }
        // Update local state — token stays the same, account is now registered
        window.authState.username = data.username;
        window.authState.isGuest  = false;
        saveAuthState();
        closeAuthModal();
        updateAuthUI();
        if (typeof showSuccess === 'function') showSuccess(`Welcome, ${data.username}! Your characters have been saved to your account.`);
    } catch (e) {
        errorEl.textContent = 'Network error. Please try again.';
    }
};

let gameData = {
    races: [],
    skills: [],
    gear: [],
    challenges: [],
    consumables: [],  // deprecated — consumable definitions now live in gear (items)
    bots: [],
    statuses: [],
    characters: []
};

/**
 * Initialize the game by loading all data from the backend.
 */
async function initializeGame() {
    try {
        // Auth must resolve before any protected API calls
        await initAuth();

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
        gameData.bots       = dataFromServer.bots       || [];
        gameData.statuses   = dataFromServer.statuses   || [];

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
Determine character class based on skills, equipment, stats, and combat history.
Returns a descriptive archetype that reflects actual playstyle.
*/
function getCharacterClass(character, skills) {
    // ── SAFETY CHECKS ─────────────────────────────────────────────────────
    if (!character || !skills || !Array.isArray(skills)) return 'Adventurer';
    
    const charSkills = character.skills || [];
    if (!charSkills.length) return 'Novice';
    
    const equipment = character.equipment || {};
    const stats = character.stats || {};
    const combatStats = character.combatStats || {};
    const milestones = combatStats.milestones || {};
    
    // ── CATEGORY COUNTING ─────────────────────────────────────────────────
    const categories = {
        DAMAGE: 0,
        HEALING: 0,
        BUFF: 0,
        DEFENSE: 0,
        CONTROL: 0,
        UTILITY: 0,
        RESTORATION: 0
    };
    
    let damageTypes = { physical: 0, magic: 0 };
    let topSkillCategory = null;
    let skillCount = 0;
    
    // Analyze equipped skills (non-intrinsic only for class determination)
    charSkills.forEach(skillEntry => {
        if (skillEntry.intrinsic) return; // Skip racial abilities
        if (!skillEntry.learned || (skillEntry.skillLevel || 0) < 1) return;
        
        const skill = skills.find(s => s.id === skillEntry.skillID);
        if (!skill || !skill.category) return;
        
        skillCount++;
        
        // Map skill categories
        const cat = skill.category.toUpperCase();
        if (cat.includes('DAMAGE')) {
            categories.DAMAGE++;
            // Track damage type from skill effects
            if (skill.effects) {
                skill.effects.forEach(effect => {
                    if (effect.type === 'damage' && effect.damageType) {
                        const dtype = effect.damageType.toLowerCase();
                        const magicTypes = ['fire', 'cold', 'lightning', 'arcane', 'holy', 'shadow', 'nature', 'poison'];
                        if (magicTypes.includes(dtype)) {
                            damageTypes.magic++;
                        } else {
                            damageTypes.physical++;
                        }
                    }
                });
            }
        }
        if (cat.includes('HEALING')) categories.HEALING++;
        if (cat.includes('BUFF')) categories.BUFF++;
        if (cat.includes('DEFENSE')) categories.DEFENSE++;
        if (cat.includes('CONTROL')) categories.CONTROL++;
        if (cat.includes('UTILITY')) categories.UTILITY++;
        if (cat.includes('RESTORATION')) categories.RESTORATION++;
    });
    
    if (skillCount === 0) return 'Novice';
    
    // ── WEAPON ANALYSIS ───────────────────────────────────────────────────
    const weaponId = equipment.mainHand;
    const weapon = weaponId ? window.gameData?.gear?.find(g => g.id === weaponId) : null;
    const weaponType = weapon?.type?.toLowerCase() || '';
    const weaponDamageType = weapon?.dmg_type_1?.toLowerCase() || 'physical';
    
    // ── STAT DISTRIBUTION ─────────────────────────────────────────────────
    const totalStats = (stats.conviction || 0) + (stats.endurance || 0) + 
                       (stats.ambition || 0) + (stats.harmony || 0);
    const statRatios = totalStats > 0 ? {
        conviction: (stats.conviction || 0) / totalStats,
        endurance:  (stats.endurance || 0) / totalStats,
        ambition:   (stats.ambition || 0) / totalStats,
        harmony:    (stats.harmony || 0) / totalStats
    } : { conviction: 0.25, endurance: 0.25, ambition: 0.25, harmony: 0.25 };
    
    // ── COMBAT PERFORMANCE ────────────────────────────────────────────────
    const totalHealing = combatStats.totalHealingDone || 0;
    const totalDamage = combatStats.totalDamageDealt || 0;
    const totalKills = Object.values(combatStats.enemyKills || {}).reduce((a, b) => a + b, 0);
    const winRate = combatStats.wins && combatStats.totalCombats 
        ? combatStats.wins / combatStats.totalCombats 
        : 0;
    
    // ── ARCHETYPE DETERMINATION ───────────────────────────────────────────
    // Check hybrid archetypes first (combinations), then pure archetypes
    
    const hasDamage = categories.DAMAGE > 0;
    const hasHealing = categories.HEALING > 0;
    const hasBuff = categories.BUFF > 0;
    const hasDefense = categories.DEFENSE > 0;
    const hasControl = categories.CONTROL > 0;
    const hasUtility = categories.UTILITY > 0;
    
    // ─── HYBRID ARCHETYPES ───────────────────────────────────────────────
    
    // Spellblade: Magic damage + melee weapon
    if (damageTypes.magic > damageTypes.physical && 
        ['sword', 'dagger', 'axe'].includes(weaponType)) {
        return 'Spellblade';
    }
    
    // Battle Cleric: Healing + Damage (healing focused)
    if (hasHealing && hasDamage && categories.HEALING >= categories.DAMAGE) {
        if (weaponType.includes('mace') || weaponType.includes('hammer')) {
            return 'War Priest';
        }
        return 'Battle Cleric';
    }
    
    // Paladin: Defense + Healing + Damage
    if (hasDefense && hasHealing && hasDamage) {
        return 'Paladin';
    }
    
    // Shadow Assassin: Control + Damage + stealthy weapon
    if (hasControl && hasDamage && ['dagger', 'knife'].includes(weaponType)) {
        return 'Shadow Assassin';
    }
    
    // Warden: Defense + Control (tank who locks down enemies)
    if (hasDefense && hasControl && categories.DEFENSE >= categories.DAMAGE) {
        return 'Warden';
    }
    
    // Enchanter: Buff + Utility (pure support buffer)
    if (hasBuff && hasUtility && !hasDamage && !hasHealing) {
        return 'Enchanter';
    }
    
    // Spellsword: Magic damage + sword
    if (damageTypes.magic > 0 && weaponType.includes('sword')) {
        return 'Spellsword';
    }
    
    // ─── PURE ARCHETYPES ─────────────────────────────────────────────────
    
    // Find dominant category
    const maxCategoryCount = Math.max(...Object.values(categories));
    if (maxCategoryCount === 0) return 'Adventurer';
    
    // Healer variants
    if (categories.HEALING === maxCategoryCount && categories.HEALING > 0) {
        if (totalHealing > 10000 || milestones.masterHealer) {
            return 'High Priest';
        }
        if (hasBuff) return 'Disciple';  // Healing + Buff hybrid
        if (weaponType.includes('staff') || weaponType.includes('wand')) {
            return 'Divine Caster';
        }
        return 'Healer';
    }
    
    // Support variants
    if (categories.BUFF === maxCategoryCount && categories.BUFF > 0) {
        if (hasHealing) return 'Disciple';
        if (hasUtility) return 'Tactician';
        if (statRatios.harmony > 0.35) return 'Channeler';
        return 'Support';
    }
    
    // Tank variants
    if (categories.DEFENSE === maxCategoryCount && categories.DEFENSE > 0) {
        if (statRatios.endurance > 0.35) {
            if (weaponType.includes('shield')) return 'Shieldbearer';
            return 'Guardian';
        }
        if (hasControl) return 'Warden';
        return 'Defender';
    }
    
    // Control variants
    if (categories.CONTROL === maxCategoryCount && categories.CONTROL > 0) {
        if (hasDamage) {
            if (weaponType.includes('dagger')) return 'Shadow Assassin';
            if (damageTypes.magic > 0) return 'Hexer';
            return 'Skirmisher';
        }
        if (statRatios.ambition > 0.35) return 'Manipulator';
        return 'Controller';
    }
    
    // Damage variants (most common)
    if (categories.DAMAGE === maxCategoryCount && categories.DAMAGE > 0) {
        // Magic damage dealers
        if (damageTypes.magic > damageTypes.physical) {
            if (weaponType.includes('wand') || weaponType.includes('scepter')) {
                return 'Mage';
            }
            if (weaponType.includes('staff') || weaponType.includes('tome')) {
                return 'Wizard';
            }
            if (weaponType.includes('dagger')) return 'Spellblade';
            return 'Sorcerer';
        }
        
        // Physical damage dealers - weapon specific
        if (weaponType.includes('sword')) {
            if (statRatios.conviction > 0.35) return 'Blademaster';
            if (statRatios.ambition > 0.35) return 'Duelist';
            return 'Swordsman';
        }
        if (weaponType.includes('axe') || weaponType.includes('handaxe')) {
            if (statRatios.conviction > 0.35) return 'Berserker';
            return 'Marauder';
        }
        if (weaponType.includes('dagger') || weaponType.includes('knife')) {
            if (statRatios.ambition > 0.35) return 'Assassin';
            if (hasControl) return 'Shadow Assassin';
            return 'Rogue';
        }
        if (weaponType.includes('bow') || weaponType.includes('crossbow')) {
            if (statRatios.ambition > 0.35) return 'Sniper';
            return 'Ranger';
        }
        if (weaponType.includes('hammer') || weaponType.includes('mace')) {
            if (statRatios.endurance > 0.35) return 'Crusader';
            return 'Bruiser';
        }
        if (weaponType.includes('pistol')) return 'Gunslinger';
        if (weaponType.includes('spear')) return 'Lancer';
        
        // Generic damage dealers
        if (statRatios.conviction > 0.35) return 'Warrior';
        if (statRatios.ambition > 0.35) return 'Striker';
        if (totalKills > 100 || milestones.hundredKills) return 'Veteran';
        return 'Fighter';
    }
    
    // Utility/Restoration specialists
    if (categories.UTILITY >= 1 || categories.RESTORATION >= 1) {
        if (statRatios.harmony > 0.35) return 'Monk';
        if (hasBuff) return 'Tactician';
        return 'Specialist';
    }
    
    // Fallback based on stats
    if (statRatios.conviction > 0.35) return 'Warrior';
    if (statRatios.endurance > 0.35) return 'Guardian';
    if (statRatios.ambition > 0.35) return 'Rogue';
    if (statRatios.harmony > 0.35) return 'Mystic';
    
    return 'Adventurer';
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
    return gameData.gear.find(g => g.id === consumableId && g.type === 'consumable');
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

    // Item stat fields use short keys: con, end, amb, har
    const statFieldMap = { con: 'conviction', end: 'endurance', amb: 'ambition', har: 'harmony' };

    if (character.equipment) {
        Object.values(character.equipment).forEach(itemId => {
            if (!itemId) return;
            const item = gameData.gear.find(g => g.id === itemId);
            if (!item) return;
            // Short-key bonuses (con, end, amb, har) — primary format
            Object.entries(statFieldMap).forEach(([shortKey, longKey]) => {
                if (item[shortKey]) totalStats[longKey] += item[shortKey];
            });
            // Long-key bonuses via statBonuses object — legacy fallback
            if (item.statBonuses) {
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
 * Calculate derived stats (HP, Mana, Stamina) from base stats.
 * Mirrors combatEngine.js calculateMaxHP/Mana/Stamina exactly so the
 * character detail screen shows what will actually be used in combat.
 */
/**
 * Calculate derived stats (HP, Mana, Stamina) for a character including equipment bonuses.
 * Matches combatEngine.calculateMaxHP/Mana/Stamina exactly — single source of truth.
 */
function calculateDerivedStats(character) {
    const level = character.level || 1;
    const stats = calculateTotalStats(character);

    const hp      = Math.floor(50 * Math.pow(1.12, level - 1) * (1 + (stats.endurance || 0) / 300));
    const mana    = Math.floor(80 * Math.pow(1.10, level - 1) * (1 + ((stats.harmony || 0) * 0.7 + (stats.endurance || 0) * 0.3) / 300));
    const stamina = Math.floor(80 * Math.pow(1.10, level - 1) * (1 + ((stats.endurance || 0) * 0.7 + (stats.conviction || 0) * 0.3) / 300));

    return { hp, mana, stamina };
}

// Alias — same formula, kept for call-site compatibility
function calculateDerivedStatsWithEquipment(character) {
    return calculateDerivedStats(character);
}

/**
 * Calculate XP needed to reach the next level.
 */
function getXPToNextLevel(level) {
    // Exponential curve: 7300 * 1.15^(level-1)
    // L1→L2 costs 7,300 XP. L92→L93 costs ~2.4 billion XP.
    // Early levels feel fast and satisfying; late levels are a genuine wall.
    // L92 ≈ 33% of L100 total XP — RuneScape-inspired steep late curve.
    // Game is designed to be "beatable" around level 70-90.
    // Level 100 requires D14-D16 endgame content over months.
    return Math.max(1, Math.floor(7300 * Math.pow(1.15, level - 1)));
}
