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
Determine character class based on equipped skills, weapon type, and racial abilities.
Analyzes skill categories, damage types, tags, and parent-child relationships.
*/
function getCharacterClass(character, skills) {
    if (!character || !character.skills || !skills || !Array.isArray(skills)) {
        return 'Adventurer';
    }

    const charSkills = character.skills.filter(s => s.learned && (s.skillLevel || 0) >= 1 && !s.intrinsic);
    if (charSkills.length === 0) return 'Novice';

    // Get weapon type
    const weaponId = character.equipment?.mainHand;
    const weapon = weaponId ? window.gameData?.gear?.find(g => g.id === weaponId) : null;
    const weaponType = weapon?.type?.toLowerCase() || '';

    // Get racial skills
    const raceDef = window.gameData?.races?.find(r => r.id === character.race);
    const racialSkillIds = raceDef?.intrinsicSkills || [];
    const hasRacialSkill = (skillId) => racialSkillIds.includes(skillId);

    // Count skill categories
    const categories = {
        damagePhysical: 0,
        damageMagic: 0,
        damageHybrid: 0,
        healing: 0,
        buff: 0,
        defense: 0,
        control: 0,
        utility: 0,
        restoration: 0
    };

    // Track damage types and tags
    const damageTypes = {
        physical: 0, fire: 0, cold: 0, lightning: 0, arcane: 0,
        holy: 0, shadow: 0, nature: 0, poison: 0
    };

    const tags = {
        beast: 0, arcane: 0, holy: 0, shadow: 0, nature: 0,
        fire: 0, cold: 0, lightning: 0, poison: 0
    };

    // Analyze each equipped skill
    charSkills.forEach(skillEntry => {
        const skill = skills.find(s => s.id === skillEntry.skillID);
        if (!skill || !skill.category) return;

        const category = skill.category.toUpperCase();
        const skillTags = skill.tags || [];

        // Category classification
        if (category.includes('DAMAGE')) {
            // Determine if physical, magic, or hybrid
            const effects = skill.effects || [];
            const hasPhysical = effects.some(e => 
                e.damageType && ['physical', 'slashing', 'piercing', 'bludgeoning'].includes(e.damageType.toLowerCase())
            );
            const hasMagic = effects.some(e => 
                e.damageType && ['fire', 'cold', 'lightning', 'electric', 'arcane', 'holy', 'shadow', 'nature', 'poison'].includes(e.damageType.toLowerCase())
            ) || category.includes('MAGIC');

            if (hasPhysical && hasMagic) {
                categories.damageHybrid++;
            } else if (hasMagic) {
                categories.damageMagic++;
            } else {
                categories.damagePhysical++;
            }

            // Count damage types
            effects.forEach(effect => {
                if (effect.type === 'damage' && effect.damageType) {
                    const dtype = effect.damageType.toLowerCase();
                    if (damageTypes[dtype] !== undefined) {
                        damageTypes[dtype]++;
                    }
                }
            });

            // Count tags
            skillTags.forEach(tag => {
                if (tags[tag] !== undefined) {
                    tags[tag]++;
                }
            });
        }

        if (category === 'HEALING' || category === 'HEALING_AOE') categories.healing++;
        if (category === 'BUFF') categories.buff++;
        if (category === 'DEFENSE') categories.defense++;
        if (category === 'CONTROL') categories.control++;
        if (category === 'UTILITY') categories.utility++;
        if (category === 'RESTORATION') categories.restoration++;
    });

    const totalDamage = categories.damagePhysical + categories.damageMagic + categories.damageHybrid;
    const totalSkills = charSkills.length;

    // Helper: Check if character has specific skill
    const hasSkill = (skillId) => charSkills.some(s => s.skillID === skillId);

    // Helper: Check dominant damage type
    const dominantDamageType = Object.entries(damageTypes)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    const dominantTag = Object.entries(tags)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // ─── RACIAL CLASS VARIANTS ──────────────────────────────────────
    // Check for racial-specific builds first

    // Orc Berserker
    if (hasRacialSkill('bloodlust') && categories.damagePhysical >= 1) {
        if (categories.damagePhysical >= 2 || hasSkill('frenzy')) {
            return 'Orc Berserker';
        }
        return 'Orc Warrior';
    }

    // Dwarf Defender
    if (hasRacialSkill('fortify') && categories.defense >= 1) {
        if (categories.healing >= 1 || hasSkill('second_wind')) {
            return 'Dwarf Warden';
        }
        return 'Dwarf Guardian';
    }

    // ─── HYBRID CLASSES (Mixed damage types) ────────────────────────

    // Spellsword / Spellblade: Hybrid damage + melee weapon
    if (categories.damageHybrid >= 1 || (categories.damageMagic >= 1 && categories.damagePhysical >= 1)) {
        if (['sword', 'dagger', 'axe'].includes(weaponType)) {
            if (dominantTag === 'shadow') return 'Shadowblade';
            if (dominantTag === 'fire') return 'Flame Knight';
            if (dominantTag === 'cold') return 'Frost Knight';
            return 'Spellblade';
        }
    }

    // Battle Cleric / War Priest: Healing + Damage
    if (categories.healing >= 1 && totalDamage >= 1) {
        if (categories.healing > totalDamage) {
            if (weaponType.includes('mace') || weaponType.includes('hammer')) {
                return 'War Priest';
            }
            if (dominantTag === 'holy') return 'Battle Cleric';
            if (dominantTag === 'nature') return 'Circle Warden';
            return 'Combat Healer';
        } else {
            if (dominantTag === 'holy') return 'Paladin';
            if (dominantTag === 'nature') return 'Druid';
            return 'Skirmisher';
        }
    }

    // Necromancer / Warlock: Shadow damage + Control/Debuffs
    if (damageTypes.shadow >= 2 || (damageTypes.shadow >= 1 && categories.control >= 1)) {
        if (hasSkill('necromancy') || hasSkill('lifetap')) {
            return 'Necromancer';
        }
        if (categories.control >= 1) return 'Warlock';
        return 'Shadow Mage';
    }

    // Elementalist: Multiple magic damage types
    const magicTypes = ['fire', 'cold', 'lightning', 'arcane'].filter(t => damageTypes[t] >= 1);
    if (magicTypes.length >= 2 && categories.damageMagic >= 2) {
        if (magicTypes.includes('fire') && magicTypes.includes('cold')) return 'Elementalist';
        if (magicTypes.includes('lightning')) return 'Storm Caller';
        return 'Arcanist';
    }

    // ─── PURE DAMAGE CLASSES ────────────────────────────────────────

    if (totalDamage >= 1) {
        // Magic Damage Dealers
        if (categories.damageMagic > categories.damagePhysical && categories.damageMagic > categories.damageHybrid) {
            if (dominantTag === 'fire') {
                if (weaponType.includes('wand') || weaponType.includes('scepter')) return 'Pyromancer';
                return 'Fire Mage';
            }
            if (dominantTag === 'cold') {
                if (weaponType.includes('staff') || weaponType.includes('tome')) return 'Cryomancer';
                return 'Frost Mage';
            }
            if (dominantTag === 'lightning') {
                if (hasSkill('lightning_chain') || hasSkill('chain_lightning')) return 'Thundercaller';
                return 'Storm Mage';
            }
            if (dominantTag === 'arcane') {
                if (weaponType.includes('wand')) return 'Arcanist';
                return 'Wizard';
            }
            if (dominantTag === 'holy') {
                if (weaponType.includes('mace') || weaponType.includes('tome')) return 'Cleric';
                return 'Holy Caster';
            }
            if (dominantTag === 'nature') {
                if (weaponType.includes('staff') || weaponType.includes('tome')) return 'Druid';
                return 'Nature Mage';
            }
            if (dominantTag === 'shadow') {
                return 'Warlock';
            }
            // Generic magic
            if (weaponType.includes('wand') || weaponType.includes('scepter')) return 'Mage';
            if (weaponType.includes('staff')) return 'Wizard';
            if (weaponType.includes('tome')) return 'Scholar';
            return 'Sorcerer';
        }

        // Physical Damage Dealers
        if (categories.damagePhysical >= categories.damageMagic) {
            // Weapon-specific classes
            if (weaponType.includes('sword')) {
                if (hasSkill('slash') && hasSkill('pierce')) return 'Duelist';
                if (hasSkill('counter_strike') || hasSkill('riposte')) return 'Swashbuckler';
                if (categories.defense >= 1) return 'Knight';
                return 'Swordsman';
            }

            if (weaponType.includes('dagger') || weaponType.includes('knife')) {
                if (hasSkill('assassinate') || hasSkill('shadow_step')) return 'Assassin';
                if (hasSkill('apply_poison') || damageTypes.poison >= 1) return 'Rogue';
                if (categories.control >= 1) return 'Trickster';
                return 'Thief';
            }

            if (weaponType.includes('axe') || weaponType.includes('handaxe')) {
                if (hasRacialSkill('bloodlust')) return 'Berserker';
                if (hasSkill('strong_attack') || hasSkill('pummel')) return 'Marauder';
                return 'Barbarian';
            }

            if (weaponType.includes('hammer') || weaponType.includes('mace')) {
                if (categories.defense >= 1) return 'Crusader';
                if (hasSkill('pummel') || hasSkill('stone_fist')) return 'Juggernaut';
                return 'Warrior';
            }

            if (weaponType.includes('bow') || weaponType.includes('crossbow')) {
                if (hasSkill('aim') && categories.utility >= 1) return 'Ranger';
                if (hasSkill('apply_poison') || damageTypes.poison >= 1) return 'Hunter';
                return 'Archer';
            }

            if (weaponType.includes('spear')) {
                if (categories.defense >= 1) return 'Lancer';
                return 'Spearmaster';
            }

            if (weaponType.includes('shield')) {
                if (categories.damagePhysical >= 1) return 'Shieldbearer';
                return 'Defender';
            }

            // Generic physical
            if (categories.control >= 1) return 'Brawler';
            return 'Fighter';
        }
    }

    // ─── SUPPORT CLASSES ────────────────────────────────────────────

    if (categories.healing >= 2 || (categories.healing >= 1 && categories.buff >= 1)) {
        if (dominantTag === 'holy') {
            if (hasSkill('mass_heal') || hasSkill('holy_word')) return 'High Priest';
            return 'Cleric';
        }
        if (dominantTag === 'nature') {
            if (hasSkill('regrowth') || hasSkill('forest_embrace')) return 'Druid';
            return 'Circle Keeper';
        }
        if (categories.buff >= 2) return 'Support';
        return 'Healer';
    }

    if (categories.buff >= 2 && categories.damagePhysical < 1 && categories.damageMagic < 1) {
        if (hasSkill('warcry') || hasSkill('shout')) return 'Banneret';
        if (hasSkill('vitality_boost')) return 'Channeler';
        return 'Buffer';
    }

    // ─── CONTROL/TANK CLASSES ───────────────────────────────────────

    if (categories.control >= 2 || (categories.control >= 1 && categories.defense >= 1)) {
        if (dominantTag === 'nature') {
            if (hasSkill('entangle') || hasSkill('nature_wrap')) return 'Warden';
            return 'Druid';
        }
        if (dominantTag === 'shadow') {
            if (hasSkill('shadow_tendril') || hasSkill('shadow_grasp')) return 'Shadow Controller';
            return 'Warlock';
        }
        if (categories.defense >= 2) return 'Guardian';
        return 'Controller';
    }

    if (categories.defense >= 2 && totalDamage < 1) {
        if (weaponType.includes('shield')) return 'Shieldbearer';
        if (hasSkill('stone_skin') || hasSkill('block')) return 'Defender';
        return 'Tank';
    }

    // ─── UTILITY/SPECIALIST CLASSES ─────────────────────────────────

    if (categories.utility >= 2 && totalDamage < 1 && categories.healing < 1) {
        if (hasSkill('stalk') || hasSkill('sense')) return 'Scout';
        if (hasSkill('attunement')) return 'Mystic';
        return 'Specialist';
    }

    // ─── FALLBACK CLASSES ───────────────────────────────────────────

    if (totalDamage >= 1) {
        if (categories.damageMagic > 0) return 'Mage';
        if (categories.damagePhysical > 0) return 'Warrior';
    }

    if (categories.healing >= 1) return 'Healer';
    if (categories.buff >= 1) return 'Support';
    if (categories.defense >= 1) return 'Defender';

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
