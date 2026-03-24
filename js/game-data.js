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
Determine character class based on Skills (Primary), Stats (Secondary), and Equipment (Tertiary).
Hierarchy:
1. Skill Categories & Tags (Defines Core Archetype: Mage, Warrior, Healer, etc.)
2. Stat Distribution (Defines Variant: Berserker vs Warrior, Assassin vs Rogue)
3. Weapon Type (Defines Modifier: Spellblade, Gunslinger, Knight)
4. Performance/Tier (Defines Prestige: Arch-, Veteran, Master)
*/
function getCharacterClass(character, skills) {
    // ── SAFETY CHECKS ─────────────────────────────────────────────────────
    if (!character || !skills || !Array.isArray(skills)) {
        return 'Adventurer';
    }
    // Ensure gameData is loaded before accessing gear
    if (!window.gameData || !window.gameData.gear) {
        return 'Novice'; 
    }

    const charSkills = character.skills || [];
    // Filter out intrinsic skills for class determination (focus on equipped)
    const activeSkills = charSkills.filter(s => !s.intrinsic && s.learned && (s.skillLevel || 0) >= 1);
    
    if (activeSkills.length === 0) return 'Novice';

    const equipment = character.equipment || {};
    const stats = character.stats || {};
    const gearData = window.gameData.gear || [];

    // ── 1. SKILL ANALYSIS (PRIMARY WEIGHT) ────────────────────────────────
    const categories = {
        damageMagic: 0,
        damagePhysical: 0,
        healing: 0,
        buff: 0,
        defense: 0,
        control: 0,
        utility: 0,
        restoration: 0
    };

    const tags = {
        fire: 0, cold: 0, lightning: 0, arcane: 0,
        holy: 0, shadow: 0, nature: 0, poison: 0,
        physical: 0, slashing: 0, piercing: 0, bludgeoning: 0
    };

    let totalSkillCount = 0;

    activeSkills.forEach(skillEntry => {
        const skill = skills.find(s => s.id === skillEntry.skillID);
        if (!skill || !skill.category) return;

        totalSkillCount++;
        const cat = skill.category.toUpperCase();
        const skillTags = skill.tags || [];
        const effects = skill.effects || [];

        // Category Counting
        if (cat.includes('DAMAGE')) {
            if (cat.includes('MAGIC')) categories.damageMagic++;
            else categories.damagePhysical++;
        }
        if (cat === 'HEALING' || cat === 'HEALING_AOE') categories.healing++;
        if (cat === 'BUFF') categories.buff++;
        if (cat === 'DEFENSE') categories.defense++;
        if (cat === 'CONTROL') categories.control++;
        if (cat === 'UTILITY') categories.utility++;
        if (cat === 'RESTORATION') categories.restoration++;

        // Tag Counting (from skill tags)
        skillTags.forEach(tag => {
            const t = tag.toLowerCase();
            if (tags[t] !== undefined) tags[t]++;
        });

        // Tag Counting (from effect damage types)
        effects.forEach(effect => {
            if (effect.type === 'damage' && effect.damageType) {
                const dt = effect.damageType.toLowerCase();
                if (tags[dt] !== undefined) tags[dt]++;
            }
        });
    });

    // ── 2. STAT ANALYSIS (SECONDARY WEIGHT) ──────────────────────────────
    const totalStats = (stats.conviction || 0) + (stats.endurance || 0) + 
                       (stats.ambition || 0) + (stats.harmony || 0);
    const statRatios = totalStats > 0 ? {
        conviction: (stats.conviction || 0) / totalStats,
        endurance:  (stats.endurance || 0) / totalStats,
        ambition:   (stats.ambition || 0) / totalStats,
        harmony:    (stats.harmony || 0) / totalStats
    } : { conviction: 0.25, endurance: 0.25, ambition: 0.25, harmony: 0.25 };

    const dominantStat = Object.entries(statRatios).sort((a, b) => b[1] - a[1])[0][0];

    // ── 3. WEAPON ANALYSIS (TERTIARY WEIGHT) ─────────────────────────────
    const weaponId = equipment.mainHand;
    const weapon = weaponId ? gearData.find(g => g.id === weaponId) : null;
    const weaponType = weapon?.type?.toLowerCase() || '';
    const weaponTier = weapon?.tier || 0;
    
    // Check weapon damage types for synergy
    const weaponHasMagic = weapon?.dmg_type_1 && ['Fire','Cold','Lightning','Arcane','Holy','Shadow','Nature','Poison'].includes(weapon.dmg_type_1);
    const isMeleeWeapon = ['sword', 'dagger', 'axe', 'handaxe', 'hammer', 'mace'].includes(weaponType);
    const isRangedWeapon = ['bow', 'crossbow', 'pistol'].includes(weaponType);
    const isCasterWeapon = ['wand', 'scepter', 'tome', 'totem', 'bell', 'flute'].includes(weaponType);
    const isShield = weaponType === 'shield' || (equipment.offHand && gearData.find(g => g.id === equipment.offHand)?.type === 'shield');

    // ── CLASS DETERMINATION LOGIC ────────────────────────────────────────
    let baseClass = 'Adventurer';
    let variant = '';
    let prefix = '';
    let suffix = '';

    // ─── STEP 1: CORE ARCHETYPE (Based on Skills) ────────────────────────
    const hasHealing = categories.healing > 0;
    const hasBuff = categories.buff > 0;
    const hasDefense = categories.defense > 0;
    const hasControl = categories.control > 0;
    const hasMagicDamage = categories.damageMagic > 0;
    const hasPhysDamage = categories.damagePhysical > 0;
    
    // Hybrid Checks First
    if (hasHealing && hasMagicDamage && hasDefense) {
        baseClass = 'Paladin'; // Holy Warrior Trifecta
    } else if (hasHealing && hasPhysDamage) {
        baseClass = 'Battle Cleric'; // Healing Fighter
    } else if (hasHealing && hasMagicDamage) {
        baseClass = 'Disciple'; // Healing Caster
    } else if (hasControl && tags.shadow >= 1) {
        baseClass = 'Warlock'; // Control + Shadow
    } else if (hasControl && tags.nature >= 1) {
        baseClass = 'Druid'; // Control + Nature
    } else if (hasDefense && hasPhysDamage && statRatios.endurance > 0.35) {
        baseClass = 'Guardian'; // Tanky Fighter
    } 
    // Pure Roles
    else if (categories.healing >= 2 || (categories.healing > 0 && categories.buff > 0 && !hasPhysDamage && !hasMagicDamage)) {
        baseClass = 'Healer';
    } else if (categories.buff >= 2 && !hasHealing && !hasMagicDamage && !hasPhysDamage) {
        baseClass = 'Support';
    } else if (categories.defense >= 2 && statRatios.endurance > 0.35) {
        baseClass = 'Defender';
    } else if (hasMagicDamage) {
        baseClass = 'Mage';
    } else if (hasPhysDamage) {
        baseClass = 'Warrior';
    } else if (hasControl) {
        baseClass = 'Controller';
    }

    // ─── STEP 2: SPECIALIZATION (Based on Skill Tags/Elements) ──────────
    // Determine dominant element/tag from skills
    const dominantTag = Object.entries(tags)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    if (baseClass === 'Mage') {
        if (dominantTag === 'fire') baseClass = 'Pyromancer';
        else if (dominantTag === 'cold') baseClass = 'Cryomancer';
        else if (dominantTag === 'lightning') baseClass = 'Storm Caller';
        else if (dominantTag === 'shadow') baseClass = 'Shadow Mage';
        else if (dominantTag === 'holy') baseClass = 'Priest';
        else if (dominantTag === 'nature') baseClass = 'Elementalist';
        else if (dominantTag === 'arcane') baseClass = 'Wizard';
        else if (dominantTag === 'poison') baseClass = 'Alchemist';
    } else if (baseClass === 'Warrior') {
        if (dominantTag === 'shadow') baseClass = 'Dark Knight';
        else if (dominantTag === 'holy') baseClass = 'Crusader';
        else if (dominantTag === 'fire') baseClass = 'Berserker';
        else if (dominantTag === 'slashing') baseClass = 'Swordsman';
        else if (dominantTag === 'piercing') baseClass = 'Duelist';
        else if (dominantTag === 'bludgeoning') baseClass = 'Bruiser';
    } else if (baseClass === 'Defender' || baseClass === 'Guardian') {
        if (dominantTag === 'holy') baseClass = 'Paladin';
        else if (dominantTag === 'nature') baseClass = 'Warden';
        else if (dominantTag === 'arcane') baseClass = 'Spellguard';
    } else if (baseClass === 'Healer' || baseClass === 'Disciple') {
        if (dominantTag === 'holy') baseClass = 'Cleric';
        else if (dominantTag === 'nature') baseClass = 'Druid';
        else if (dominantTag === 'shadow') baseClass = 'Reaper'; // Healing + Shadow
    } else if (baseClass === 'Warlock' || baseClass === 'Shadow Mage') {
        if (tags.shadow >= 2 && categories.healing > 0) baseClass = 'Necromancer';
    }

    // ─── STEP 3: STAT VARIANT (Based on Dominant Stat) ──────────────────
    // Refine the class name based on how stats shape the playstyle
    if (dominantStat === 'ambition') {
        // Precision/Crit focused
        if (baseClass === 'Warrior' || baseClass === 'Swordsman') variant = 'Duelist';
        else if (baseClass === 'Mage' || baseClass === 'Wizard') variant = 'Sorcerer';
        else if (baseClass === 'Defender') variant = 'Sentinel';
        else if (baseClass === 'Pyromancer' || baseClass === 'Cryomancer') variant = 'Sniper';
        else if (baseClass === 'Warrior' && tags.shadow) variant = 'Assassin';
    } else if (dominantStat === 'conviction') {
        // Power/Brute focused
        if (baseClass === 'Warrior' || baseClass === 'Swordsman') variant = 'Berserker';
        else if (baseClass === 'Mage') variant = 'War Mage';
        else if (baseClass === 'Healer' || baseClass === 'Cleric') variant = 'Templar';
        else if (baseClass === 'Defender') variant = 'Juggernaut';
    } else if (dominantStat === 'harmony') {
        // Spiritual/Resource focused
        if (baseClass === 'Mage' || baseClass === 'Wizard') variant = 'Sage';
        else if (baseClass === 'Warrior') variant = 'Monk';
        else if (baseClass === 'Healer' || baseClass === 'Cleric') variant = 'High Priest';
        else if (baseClass === 'Druid') variant = 'Archdruid';
    } else if (dominantStat === 'endurance') {
        // Survival focused
        if (baseClass === 'Warrior') variant = 'Veteran';
        else if (baseClass === 'Defender') variant = 'Bastion';
        else if (baseClass === 'Healer') variant = 'Sanctifier';
    }

    // Apply variant if found
    if (variant) baseClass = variant;

    // ─── STEP 4: WEAPON MODIFIER (Based on Gear Synergy) ────────────────
    // Only modify if the weapon synergizes with the skill-based class
    if (baseClass === 'Mage' || baseClass === 'Pyromancer' || baseClass === 'Wizard' || baseClass === 'Sorcerer') {
        if (isMeleeWeapon) baseClass = 'Spellblade'; // Magic Skills + Melee Weapon
        else if (baseClass === 'Pyromancer' && isCasterWeapon) baseClass = 'Pyromancer'; // Keep specific
    } else if (baseClass === 'Warrior' || baseClass === 'Berserker' || baseClass === 'Swordsman') {
        if (isRangedWeapon && weaponType === 'pistol') baseClass = 'Gunslinger';
        else if (isRangedWeapon) baseClass = 'Archer';
        else if (baseClass === 'Warrior' && isShield) baseClass = 'Knight';
        else if (baseClass === 'Warrior' && weaponType === 'axe') baseClass = 'Marauder';
    } else if (baseClass === 'Defender' || baseClass === 'Guardian' || baseClass === 'Paladin') {
        if (isShield) suffix = 'Shieldbearer';
        else if (weaponType === 'hammer' || weaponType === 'mace') suffix = 'Crusader';
    } else if (baseClass === 'Assassin' || baseClass === 'Rogue' || baseClass === 'Duelist') {
        if (weaponType === 'dagger') suffix = 'Nightblade';
        else if (isRangedWeapon) suffix = 'Sniper';
    }

    // Apply suffix if found (otherwise keep baseClass)
    if (suffix) baseClass = suffix;

    // ─── STEP 5: PRESTIGE TITLES (Based on Tier/Milestones) ─────────────
    // Add prefixes for high-level characters
    if (weaponTier >= 7) {
        if (baseClass.includes('Mage') || baseClass.includes('Wizard') || baseClass.includes('Sorcerer')) prefix = 'Arch';
        else if (baseClass.includes('Warrior') || baseClass.includes('Knight') || baseClass.includes('Paladin')) prefix = 'High';
        else if (baseClass.includes('Healer') || baseClass.includes('Priest') || baseClass.includes('Cleric')) prefix = 'Grand';
        else if (baseClass.includes('Assassin') || baseClass.includes('Rogue')) prefix = 'Master';
        else prefix = 'Legendary';
    } else if (weaponTier >= 5) {
        if (baseClass.includes('Mage')) prefix = 'Senior';
        else if (baseClass.includes('Warrior')) prefix = 'Elite';
    } else if (character.combatStats && character.combatStats.milestones && character.combatStats.milestones.hundredKills) {
        prefix = 'Veteran';
    } else if (character.combatStats && character.combatStats.milestones && character.combatStats.milestones.masterHealer) {
        prefix = 'Saint';
    }

    // ─── FINAL ASSEMBLY ──────────────────────────────────────────────────
    let finalClass = baseClass;
    if (prefix) finalClass = `${prefix} ${finalClass}`;
    
    // Fallback safety
    if (!finalClass || finalClass.trim() === '') return 'Adventurer';

    return finalClass;
}
    if (!character || !skills || !Array.isArray(skills)) {
        return 'Adventurer';
    }
    if (!window.gameData || !window.gameData.gear) {
        return 'Novice'; // Data not loaded yet
    }

    const charSkills = character.skills || [];
    // Filter out intrinsic skills for class determination (focus on equipped)
    const activeSkills = charSkills.filter(s => !s.intrinsic && s.learned && (s.skillLevel || 0) >= 1);
    
    if (activeSkills.length === 0) return 'Novice';

    const equipment = character.equipment || {};
    const stats = character.stats || {};
    const gearData = window.gameData.gear || [];

    // ── 1. SKILL ANALYSIS (Primary Weight) ─────────────────────────────────
    const categories = {
        damageMagic: 0, damagePhysical: 0, healing: 0, buff: 0, 
        defense: 0, control: 0, utility: 0
    };
    const tags = {
        fire: 0, cold: 0, lightning: 0, arcane: 0,
        holy: 0, shadow: 0, nature: 0, poison: 0
    };

    activeSkills.forEach(skillEntry => {
        const skillDef = skills.find(s => s.id === skillEntry.skillID);
        if (!skillDef || !skillDef.category) return;

        const cat = skillDef.category.toUpperCase();
        const skillTags = skillDef.tags || [];
        const effects = skillDef.effects || [];

        // Count Categories
        if (cat.includes('DAMAGE')) {
            if (cat.includes('MAGIC')) categories.damageMagic++;
            else categories.damagePhysical++;
        }
        if (cat === 'HEALING' || cat === 'HEALING_AOE') categories.healing++;
        if (cat === 'BUFF') categories.buff++;
        if (cat === 'DEFENSE') categories.defense++;
        if (cat === 'CONTROL') categories.control++;
        if (cat === 'UTILITY') categories.utility++;

        // Count Tags (from skill tags)
        skillTags.forEach(tag => {
            const t = tag.toLowerCase();
            if (tags[t] !== undefined) tags[t]++;
        });

        // Count Tags (from effect damage types)
        effects.forEach(effect => {
            if (effect.type === 'damage' && effect.damageType) {
                const dt = effect.damageType.toLowerCase();
                if (tags[dt] !== undefined) tags[dt]++;
            }
        });
    });

    // ── 2. STAT ANALYSIS (Secondary Weight) ────────────────────────────────
    const totalStats = (stats.conviction || 0) + (stats.endurance || 0) + 
                       (stats.ambition || 0) + (stats.harmony || 0);
    const statRatios = totalStats > 0 ? {
        conviction: (stats.conviction || 0) / totalStats,
        endurance:  (stats.endurance || 0) / totalStats,
        ambition:   (stats.ambition || 0) / totalStats,
        harmony:    (stats.harmony || 0) / totalStats
    } : { conviction: 0.25, endurance: 0.25, ambition: 0.25, harmony: 0.25 };

    const dominantStat = Object.entries(statRatios).sort((a, b) => b[1] - a[1])[0][0];

    // ── 3. WEAPON ANALYSIS (Tertiary Weight) ───────────────────────────────
    const weaponId = equipment.mainHand;
    const weapon = weaponId ? gearData.find(g => g.id === weaponId) : null;
    const weaponType = weapon?.type?.toLowerCase() || '';
    const weaponTier = weapon?.tier || 0;
    
    // Check weapon damage types (matches items.json keys)
    const weaponHasMagic = weapon?.dmg_type_1 && ['Fire','Cold','Lightning','Arcane','Holy','Shadow','Nature','Poison'].includes(weapon.dmg_type_1);
    const isMeleeWeapon = ['sword', 'dagger', 'axe', 'handaxe', 'hammer', 'mace'].includes(weaponType);
    const isRangedWeapon = ['bow', 'crossbow', 'pistol'].includes(weaponType);
    const isCasterWeapon = ['wand', 'scepter', 'tome', 'totem', 'bell', 'flute'].includes(weaponType);
    const isShield = weaponType === 'shield' || (equipment.offHand && gearData.find(g => g.id === equipment.offHand)?.type === 'shield');

    // ── 4. CLASS DETERMINATION LOGIC ───────────────────────────────────────
    let baseClass = 'Adventurer';
    let variant = '';
    let prefix = '';
    let suffix = '';

    const hasHealing = categories.healing > 0;
    const hasBuff = categories.buff > 0;
    const hasDefense = categories.defense > 0;
    const hasControl = categories.control > 0;
    const hasMagicDamage = categories.damageMagic > 0;
    const hasPhysDamage = categories.damagePhysical > 0;
    
    // ── STEP 1: Core Archetype (Based on Skills) ──────────────────────────
    if (hasHealing && hasMagicDamage && hasDefense) {
        baseClass = 'Paladin';
    } else if (hasHealing && hasPhysDamage) {
        baseClass = 'Battle Cleric';
    } else if (hasHealing && hasMagicDamage) {
        baseClass = 'Disciple';
    } else if (hasControl && tags.shadow >= 1) {
        baseClass = 'Warlock';
    } else if (hasControl && tags.nature >= 1) {
        baseClass = 'Druid';
    } else if (hasDefense && hasPhysDamage && statRatios.endurance > 0.35) {
        baseClass = 'Guardian';
    } else if (categories.healing >= 2 || (categories.healing > 0 && categories.buff > 0 && !hasPhysDamage && !hasMagicDamage)) {
        baseClass = 'Healer';
    } else if (categories.buff >= 2 && !hasHealing && !hasMagicDamage && !hasPhysDamage) {
        baseClass = 'Support';
    } else if (categories.defense >= 2 && statRatios.endurance > 0.35) {
        baseClass = 'Defender';
    } else if (hasMagicDamage) {
        baseClass = 'Mage';
    } else if (hasPhysDamage) {
        baseClass = 'Warrior';
    } else if (hasControl) {
        baseClass = 'Controller';
    }

    // ── STEP 2: Specialization (Based on Skill Tags/Elements) ─────────────
    const dominantTag = Object.entries(tags)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    if (baseClass === 'Mage') {
        if (dominantTag === 'fire') baseClass = 'Pyromancer';
        else if (dominantTag === 'cold') baseClass = 'Cryomancer';
        else if (dominantTag === 'lightning') baseClass = 'Storm Caller';
        else if (dominantTag === 'shadow') baseClass = 'Shadow Mage';
        else if (dominantTag === 'holy') baseClass = 'Priest';
        else if (dominantTag === 'nature') baseClass = 'Elementalist';
        else if (dominantTag === 'arcane') baseClass = 'Wizard';
        else if (dominantTag === 'poison') baseClass = 'Alchemist';
    } else if (baseClass === 'Warrior') {
        if (dominantTag === 'shadow') baseClass = 'Dark Knight';
        else if (dominantTag === 'holy') baseClass = 'Crusader';
        else if (dominantTag === 'fire') baseClass = 'Berserker';
        else if (dominantTag === 'slashing') baseClass = 'Swordsman';
        else if (dominantTag === 'piercing') baseClass = 'Duelist';
        else if (dominantTag === 'bludgeoning') baseClass = 'Bruiser';
    } else if (baseClass === 'Defender' || baseClass === 'Guardian') {
        if (dominantTag === 'holy') baseClass = 'Paladin';
        else if (dominantTag === 'nature') baseClass = 'Warden';
        else if (dominantTag === 'arcane') baseClass = 'Spellguard';
    } else if (baseClass === 'Healer' || baseClass === 'Disciple') {
        if (dominantTag === 'holy') baseClass = 'Cleric';
        else if (dominantTag === 'nature') baseClass = 'Druid';
        else if (dominantTag === 'shadow') baseClass = 'Reaper';
    } else if (baseClass === 'Warlock' || baseClass === 'Shadow Mage') {
        if (tags.shadow >= 2 && categories.healing > 0) baseClass = 'Necromancer';
    }

    // ── STEP 3: Stat Variant (Based on Dominant Stat) ─────────────────────
    if (dominantStat === 'ambition') {
        if (baseClass === 'Warrior' || baseClass === 'Swordsman') variant = 'Duelist';
        else if (baseClass === 'Mage' || baseClass === 'Wizard') variant = 'Sorcerer';
        else if (baseClass === 'Defender') variant = 'Sentinel';
        else if (baseClass === 'Pyromancer' || baseClass === 'Cryomancer') variant = 'Sniper';
        else if (baseClass === 'Warrior' && tags.shadow) variant = 'Assassin';
    } else if (dominantStat === 'conviction') {
        if (baseClass === 'Warrior' || baseClass === 'Swordsman') variant = 'Berserker';
        else if (baseClass === 'Mage') variant = 'War Mage';
        else if (baseClass === 'Healer' || baseClass === 'Cleric') variant = 'Templar';
        else if (baseClass === 'Defender') variant = 'Juggernaut';
    } else if (dominantStat === 'harmony') {
        if (baseClass === 'Mage' || baseClass === 'Wizard') variant = 'Sage';
        else if (baseClass === 'Warrior') variant = 'Monk';
        else if (baseClass === 'Healer' || baseClass === 'Cleric') variant = 'High Priest';
        else if (baseClass === 'Druid') variant = 'Archdruid';
    } else if (dominantStat === 'endurance') {
        if (baseClass === 'Warrior') variant = 'Veteran';
        else if (baseClass === 'Defender') variant = 'Bastion';
        else if (baseClass === 'Healer') variant = 'Sanctifier';
    }

    if (variant) baseClass = variant;

    // ── STEP 4: Weapon Modifier (Based on Gear Synergy) ───────────────────
    if (baseClass === 'Mage' || baseClass === 'Pyromancer' || baseClass === 'Wizard' || baseClass === 'Sorcerer') {
        if (isMeleeWeapon) baseClass = 'Spellblade';
    } else if (baseClass === 'Warrior' || baseClass === 'Berserker' || baseClass === 'Swordsman') {
        if (isRangedWeapon && weaponType === 'pistol') baseClass = 'Gunslinger';
        else if (isRangedWeapon) baseClass = 'Archer';
        else if (baseClass === 'Warrior' && isShield) baseClass = 'Knight';
        else if (baseClass === 'Warrior' && weaponType === 'axe') baseClass = 'Marauder';
    } else if (baseClass === 'Defender' || baseClass === 'Guardian' || baseClass === 'Paladin') {
        if (isShield) suffix = 'Shieldbearer';
        else if (weaponType === 'hammer' || weaponType === 'mace') suffix = 'Crusader';
    } else if (baseClass === 'Assassin' || baseClass === 'Rogue' || baseClass === 'Duelist') {
        if (weaponType === 'dagger') suffix = 'Nightblade';
        else if (isRangedWeapon) suffix = 'Sniper';
    }

    if (suffix) baseClass = suffix;

    // ── STEP 5: Prestige Titles (Based on Tier/Milestones) ────────────────
    // Only apply if weapon exists and has tier
    if (weaponTier >= 7) {
        if (baseClass.includes('Mage') || baseClass.includes('Wizard') || baseClass.includes('Sorcerer')) prefix = 'Arch';
        else if (baseClass.includes('Warrior') || baseClass.includes('Knight') || baseClass.includes('Paladin')) prefix = 'High';
        else if (baseClass.includes('Healer') || baseClass.includes('Priest') || baseClass.includes('Cleric')) prefix = 'Grand';
        else if (baseClass.includes('Assassin') || baseClass.includes('Rogue')) prefix = 'Master';
        else prefix = 'Legendary';
    } else if (weaponTier >= 5) {
        if (baseClass.includes('Mage')) prefix = 'Senior';
        else if (baseClass.includes('Warrior')) prefix = 'Elite';
    }

    // ── FINAL ASSEMBLY ────────────────────────────────────────────────────
    let finalClass = baseClass;
    if (prefix) finalClass = `${prefix} ${finalClass}`;
    
    // Fallback safety
    if (!finalClass || finalClass.trim() === '') return 'Adventurer';

    return

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
