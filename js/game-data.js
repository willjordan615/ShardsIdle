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
Determine character class based on:
1. Key Skills (50% weight) - Deep unlocks like assassinate, mass_heal, meteor
2. Skill Tags/Elements (25% weight) - Fire, shadow, holy, nature specialization
3. Equipment (15% weight) - Weapon/armor refines but doesn't override skills
4. Performance (10% weight) - Prestige titles from winrate & milestones
*/
function getCharacterClass(character, skills) {
    if (!character || !character.skills || !skills || !Array.isArray(skills)) {
        return 'Adventurer';
    }
    
    const charSkills = character.skills.filter(s => s.learned && (s.skillLevel || 0) >= 1 && !s.intrinsic);
    if (charSkills.length === 0) return 'Novice';

    const equipment = character.equipment || {};
    const stats = character.stats || {};
    const combatStats = character.combatStats || {};
    const milestones = combatStats.milestones || {};

    // ── GEAR ANALYSIS ─────────────────────────────────────────────────────
    const gearData = window.gameData?.gear || [];
    const weaponId = equipment.mainHand;
    const weapon = weaponId ? gearData.find(g => g.id === weaponId) : null;
    const weaponType = weapon?.type?.toLowerCase() || '';
    const weaponTier = weapon?.tier || 0;
    
    const chestId = equipment.chest;
    const chestArmor = chestId ? gearData.find(g => g.id === chestId) : null;
    const armorType = chestArmor?.type?.toLowerCase() || '';
    
    const offHandId = equipment.offHand;
    const offHand = offHandId ? gearData.find(g => g.id === offHandId) : null;
    const hasShield = offHand?.type?.toLowerCase() === 'shield';

    const isHeavyArmor = ['plate', 'cuirass', 'chain'].includes(armorType);
    const isMediumArmor = ['leather', 'studded'].includes(armorType);
    const isLightArmor = ['cloth', 'robe', 'vestments'].includes(armorType);
    const isMeleeWeapon = ['sword', 'dagger', 'axe', 'handaxe', 'hammer', 'mace'].includes(weaponType);
    const isRangedWeapon = ['bow', 'crossbow', 'pistol'].includes(weaponType);
    const isCasterWeapon = ['wand', 'scepter', 'tome', 'totem', 'bell', 'flute'].includes(weaponType);

    // ── SKILL CATEGORY COUNTING ───────────────────────────────────────────
    const categories = {
        damagePhysical: 0, damageMagic: 0, healing: 0, buff: 0,
        defense: 0, control: 0, utility: 0, restoration: 0
    };
    const damageTypes = {
        physical: 0, fire: 0, cold: 0, lightning: 0, arcane: 0,
        holy: 0, shadow: 0, nature: 0, poison: 0
    };
    const tags = {
        beast: 0, arcane: 0, holy: 0, shadow: 0, nature: 0,
        fire: 0, cold: 0, lightning: 0, poison: 0
    };

    charSkills.forEach(skillEntry => {
        const skill = skills.find(s => s.id === skillEntry.skillID);
        if (!skill || !skill.category) return;
        
        const category = skill.category.toUpperCase();
        const skillTags = skill.tags || [];
        
        if (category.includes('DAMAGE')) {
            const effects = skill.effects || [];
            const hasPhysical = effects.some(e => 
                e.damageType && ['physical', 'slashing', 'piercing', 'bludgeoning'].includes(e.damageType.toLowerCase())
            );
            const hasMagic = effects.some(e => 
                e.damageType && ['fire', 'cold', 'lightning', 'electric', 'arcane', 'holy', 'shadow', 'nature', 'poison'].includes(e.damageType.toLowerCase())
            ) || category.includes('MAGIC');
            
            if (hasPhysical && hasMagic) {
                categories.damageMagic++;
                categories.damagePhysical++;
            } else if (hasMagic) {
                categories.damageMagic++;
            } else {
                categories.damagePhysical++;
            }
            
            effects.forEach(effect => {
                if (effect.type === 'damage' && effect.damageType) {
                    const dtype = effect.damageType.toLowerCase();
                    if (damageTypes[dtype] !== undefined) damageTypes[dtype]++;
                }
            });
        }
        
        if (category === 'HEALING' || category === 'HEALING_AOE') categories.healing++;
        if (category === 'BUFF') categories.buff++;
        if (category === 'DEFENSE') categories.defense++;
        if (category === 'CONTROL') categories.control++;
        if (category === 'UTILITY') categories.utility++;
        if (category === 'RESTORATION') categories.restoration++;
        
        skillTags.forEach(tag => {
            if (tags[tag] !== undefined) tags[tag]++;
        });
    });

    const totalDamage = categories.damagePhysical + categories.damageMagic;
    const totalSkills = charSkills.length;

    // ── HELPER: Check for specific skill ─────────────────────────────────
    const hasSkill = (skillId) => charSkills.some(s => s.skillID === skillId);

    // ── HELPER: Dominant tag ─────────────────────────────────────────────
    const dominantTag = Object.entries(tags)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // ── HELPER: Stat ratio calculation ───────────────────────────────────
    const totalStats = (stats.conviction || 0) + (stats.endurance || 0) + 
                        (stats.ambition || 0) + (stats.harmony || 0);
    const statRatios = totalStats > 0 ? {
        conviction: (stats.conviction || 0) / totalStats,
        endurance:  (stats.endurance || 0) / totalStats,
        ambition:   (stats.ambition || 0) / totalStats,
        harmony:    (stats.harmony || 0) / totalStats
    } : { conviction: 0.25, endurance: 0.25, ambition: 0.25, harmony: 0.25 };

    // ── COMBAT PERFORMANCE ───────────────────────────────────────────────
    const lifetimeDamageDealt = combatStats.totalDamageDealt || 0;
    const totalHealing = combatStats.totalHealingDone || 0;
    const totalKills = Object.values(combatStats.enemyKills || {}).reduce((a, b) => a + b, 0);
    const winRate = combatStats.wins && combatStats.totalCombats 
        ? combatStats.wins / combatStats.totalCombats 
        : 0;

    // ═══════════════════════════════════════════════════════════════════
    // CLASS DETERMINATION LOGIC - SKILLS FIRST, WEAPON SECOND
    // ═══════════════════════════════════════════════════════════════════

    // ─── STEP 1: KEY SKILL CHECKS (Highest Priority - 50% weight) ───────
    // These represent deep build investment and ALWAYS take precedence
    
    // Assassin Build - Requires shadow_step + assassinate (deep combo)
    if (hasSkill('assassinate')) {
        if (dominantTag === 'shadow') return 'Master Assassin';
        if (isRangedWeapon) return 'Shadow Hunter';  // Crossbow assassin
        if (weaponType === 'dagger') return 'Grand Assassin';
        return 'Assassin';
    }
    
    // Necromancer - Shadow damage + healing (lifetap)
    if (hasSkill('necromancy') || (hasSkill('lifetap') && dominantTag === 'shadow')) {
        return 'Necromancer';
    }
    
    // High Priest - Mass heal + holy word (deep healing combo)
    if (hasSkill('mass_heal') && hasSkill('holy_word')) {
        return 'High Priest';
    }
    
    // Archmage - Meteor + fireball/chain_lightning (deep magic combo)
    if (hasSkill('meteor')) {
        if (dominantTag === 'fire') return 'Archmage';
        if (dominantTag === 'lightning') return 'Storm Lord';
        return 'Archmage';
    }
    
    // Druid - Nature touch + entangle + regrowth (deep nature combo)
    if (hasSkill('entangle') && hasSkill('nature_touch') && categories.healing > 0) {
        return 'Druid';
    }
    
    // Paladin - Holy smite + holy light + defense
    if (hasSkill('holy_smite') && hasSkill('holy_light') && categories.defense > 0) {
        return 'Paladin';
    }
    
    // Warlock - Shadow bolt + shadow tendril + control
    if (dominantTag === 'shadow' && categories.control >= 2 && categories.damageMagic > 0) {
        return 'Warlock';
    }

    // ─── STEP 2: HYBRID ARCHETYPES (Skill + Element Synergy) ────────────
    
    // Spellblade: Magic damage + melee weapon
    if (categories.damageMagic > 0 && isMeleeWeapon) {
        if (dominantTag === 'fire') return 'Fire Blade';
        if (dominantTag === 'cold') return 'Frost Blade';
        if (dominantTag === 'lightning') return 'Storm Blade';
        if (dominantTag === 'shadow') return 'Shadow Blade';
        if (dominantTag === 'holy') return 'Holy Blade';
        if (dominantTag === 'arcane') return 'Arcane Blade';
        return 'Spellblade';
    }
    
    // Battle Cleric / War Priest: Healing + Damage
    if (categories.healing > 0 && totalDamage > 0) {
        if (dominantTag === 'holy' && isMeleeWeapon) {
            if (isHeavyArmor) return 'War Priest';
            return 'Battle Cleric';
        }
        if (dominantTag === 'nature') return 'Circle Warden';
        if (categories.healing > totalDamage) return 'Combat Healer';
        return 'Skirmisher';
    }
    
    // Death Knight: Shadow damage + heavy armor + bleed/poison
    if (dominantTag === 'shadow' && isHeavyArmor && totalDamage > 0) {
        return 'Death Knight';
    }

// ─── PURE DAMAGE CLASSES (Skill-Specific FIRST, Weapon Refines Second) ─

if (totalDamage > 0) {
    // Magic Damage Dealers
    if (categories.damageMagic > categories.damagePhysical) {
        if (isCasterWeapon) {
            if (dominantTag === 'fire') {
                if (weaponType === 'wand') return 'Pyromancer';
                if (weaponType === 'tome') return 'Fire Sage';
                return 'Fire Mage';
            }
            if (dominantTag === 'cold') {
                if (weaponType === 'wand') return 'Cryomancer';
                if (weaponType === 'tome') return 'Frost Sage';
                return 'Frost Mage';
            }
            if (dominantTag === 'lightning') {
                if (hasSkill('lightning_chain') || hasSkill('chain_lightning')) return 'Thundercaller';
                return 'Storm Mage';
            }
            if (dominantTag === 'arcane') {
                if (weaponType === 'wand') return 'Arcanist';
                if (weaponType === 'tome') return 'Wizard';
                return 'Mage';
            }
            if (dominantTag === 'holy') {
                if (weaponType === 'scepter') return 'Priest';
                if (weaponType === 'tome') return 'Divine Scholar';
                return 'Holy Caster';
            }
            if (dominantTag === 'shadow') {
                if (weaponType === 'wand') return 'Warlock';
                if (weaponType === 'tome') return 'Shadow Scholar';
                return 'Shadow Mage';
            }
            if (dominantTag === 'nature') {
                if (weaponType === 'totem') return 'Druid';
                if (weaponType === 'tome') return 'Nature Sage';
                return 'Nature Mage';
            }
            return 'Mage';
        }
        
        // Hybrid magic melee
        if (isMeleeWeapon) {
            if (dominantTag === 'fire') return 'Flame Knight';
            if (dominantTag === 'cold') return 'Frost Knight';
            if (dominantTag === 'lightning') return 'Storm Knight';
            if (dominantTag === 'shadow') return 'Dark Knight';
            if (dominantTag === 'holy') return 'Templar';
            return 'Spellblade';
        }
        
        return 'Sorcerer';
    }
    
    // Physical Damage Dealers - SKILL CHECKS FIRST, THEN WEAPON
    if (categories.damagePhysical >= categories.damageMagic) {
        // ✅ ASSASSIN CHECK - Before any weapon type!
        if (hasSkill('assassinate')) {
            if (dominantTag === 'shadow' || hasSkill('shadow_step')) return 'Master Assassin';
            if (isRangedWeapon) return 'Shadow Hunter';  // Crossbow assassin
            if (weaponType === 'dagger') return 'Grand Assassin';
            return 'Assassin';
        }
        
        // ✅ NECROMANCER CHECK - Before weapon type!
        if (hasSkill('necromancy') || hasSkill('lifetap')) {
            if (dominantTag === 'shadow') return 'Necromancer';
            return 'Dark Priest';
        }
        
        // ✅ BERSERKER CHECK - Before weapon type!
        if (hasSkill('bloodlust') || hasSkill('frenzy')) {
            if (statRatios.conviction > 0.4) return 'Berserker';
            return 'Rager';
        }
        
        // Now check weapon type for remaining characters
        // Sword users
        if (weaponType === 'sword') {
            if (isBleedBuild && statRatios.ambition > 0.35) return 'Duelist';
            if (hasShield && isHeavyArmor) return 'Knight';
            if (statRatios.conviction > 0.35) return 'Blademaster';
            if (statRatios.ambition > 0.35) return 'Swordsman';
            return 'Warrior';
        }
        
        // Dagger users
        if (weaponType === 'dagger') {
            if (isPoisonBuild) return 'Assassin';
            if (isShadowBuild) return 'Shadow Assassin';
            if (statRatios.ambition > 0.4) return 'Rogue';
            return 'Thief';
        }
        
        // Axe users
        if (weaponType === 'axe' || weaponType === 'handaxe') {
            if (isBleedBuild && statRatios.conviction > 0.4) return 'Berserker';
            if (isHeavyArmor) return 'Marauder';
            if (statRatios.conviction > 0.35) return 'Barbarian';
            return 'Axeman';
        }
        
        // Hammer/Mace users
        if (weaponType === 'hammer' || weaponType === 'mace') {
            if (isHolyBuild) return 'Crusader';
            if (isHeavyArmor && hasShield) return 'Juggernaut';
            if (statRatios.endurance > 0.35) return 'Bruiser';
            return 'Warrior';
        }
        
        // Ranged users
        if (isRangedWeapon) {
            if (isPoisonBuild) return 'Hunter';
            if (statRatios.ambition > 0.4) return 'Sniper';
            if (weaponType === 'crossbow') return 'Crossbowman';
            if (weaponType === 'pistol') return 'Gunslinger';
            return 'Ranger';
        }
        
        // Generic physical
        if (statRatios.conviction > 0.35) return 'Warrior';
        if (statRatios.ambition > 0.35) return 'Striker';
        if (totalKills > 100) return 'Veteran';
        return 'Fighter';
    }
}

    // ─── STEP 4: SUPPORT CLASSES ────────────────────────────────────────
    
    if (categories.healing >= 2 || (categories.healing >= 1 && categories.buff >= 1)) {
        if (isLightArmor) {
            if (dominantTag === 'holy') {
                if (totalHealing > 10000 || milestones.masterHealer) return 'High Priest';
                if (weaponType === 'scepter') return 'Priest';
                if (weaponType === 'tome') return 'Cleric';
                return 'Healer';
            }
            if (dominantTag === 'nature') {
                if (weaponType === 'totem') return 'Druid';
                return 'Circle Keeper';
            }
            if (categories.buff >= 2) return 'Support';
            return 'Healer';
        }
        
        if (isHeavyArmor && categories.healing > 0) return 'War Priest';
    }

    if (categories.buff >= 2 && totalDamage < 1) {
        if (hasSkill('warcry') || hasSkill('shout')) return 'Banneret';
        if (statRatios.harmony > 0.35) return 'Channeler';
        return 'Buffer';
    }

    // ─── STEP 5: TANK CLASSES ───────────────────────────────────────────
    
    if (categories.defense >= 2 || (categories.defense >= 1 && hasShield)) {
        if (isHeavyArmor) {
            if (hasShield) return 'Shieldbearer';
            if (statRatios.endurance > 0.4) return 'Guardian';
            return 'Defender';
        }
        if (isMediumArmor && categories.control > 0) return 'Warden';
        return 'Defender';
    }

    // ─── STEP 6: CONTROL/SPECIALIST CLASSES ─────────────────────────────
    
    if (categories.control >= 2) {
        if (dominantTag === 'shadow') return 'Warlock';
        if (dominantTag === 'nature') return 'Druid';
        if (statRatios.ambition > 0.35) return 'Manipulator';
        return 'Controller';
    }

    if (categories.utility >= 2 && totalDamage < 1 && categories.healing < 1) {
        if (hasSkill('stalk') || hasSkill('sense')) return 'Scout';
        if (statRatios.harmony > 0.35) return 'Mystic';
        return 'Specialist';
    }

    // ─── STEP 7: FALLBACKS ──────────────────────────────────────────────
    
    if (isHeavyArmor && totalDamage > 0) {
        if (dominantTag === 'holy') return 'Crusader';
        if (dominantTag === 'shadow') return 'Dark Knight';
        return 'Knight';
    }

    if (isLightArmor && categories.damageMagic > 0) {
        if (dominantTag === 'arcane') return 'Mage';
        if (dominantTag === 'holy') return 'Priest';
        if (dominantTag === 'shadow') return 'Warlock';
        return 'Caster';
    }
    
    if (isMediumArmor && totalDamage > 0) {
        if (statRatios.ambition > 0.35) return 'Rogue';
        if (statRatios.conviction > 0.35) return 'Ranger';
        return 'Scout';
    }

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