// game-data.js
// Loads all static game data from the backend and attaches it to window.gameData.
// NOTE: currentState is declared and owned by combat-system.js.
//       Access it via the global `currentState` or `window.currentState`.
// NOTE: getCharacter, showError, and showSuccess are defined in
//       character-management.js and ui-helpers.js respectively.
//       Do not redefine them here.

// Empty string = use same origin. Works whether running locally (localhost:3001)
// or deployed to any host, since the backend always serves the frontend.

// ── Stat Definitions ────────────────────────────────────────────────────────
const STAT_DEFINITIONS = {
    conviction: {
        name: 'Conviction',
        description: 'Commitment and force. The primary offensive stat for fighters and strength-based builds.',
        effects: [
            '• Increases maximum HP and Stamina',
            '• Raises hit chance on all attacks',
            '• Amplifies damage for fighter and strength-based skills',
            '• Scales fire, arcane, lightning, holy, and shadow magic',
            '• Raises your damage ceiling — high Conviction characters hit harder at their peak',
            '• Small contributor to critical strike chance',
        ]
    },
    endurance: {
        name: 'Endurance',
        description: 'Durability and sustain. A survivability stat first — it contributes modestly to physical damage, but you do not stack it for offense.',
        effects: [
            '• Significantly increases maximum HP and Stamina',
            '• Reduces the stamina cost of skills — high Endurance characters sustain expensive skills longer',
            '• Drives stamina regeneration between actions',
            '• Contributes a small bonus to physical attack damage',
            '• The defining stat of bruiser-style skills (pummel, earthquake, shove)',
            '• Does not affect hit chance, crit, or magic damage',
        ]
    },
    ambition: {
        name: 'Ambition',
        description: 'Speed, cunning, and hunger. The primary offensive stat for rogues and skirmishers, and for lightning, shadow, and arcane mages.',
        effects: [
            '• Primary driver of critical strike chance',
            '• Increases attack speed — Ambition characters act faster than their weapons suggest',
            '• Amplifies damage for rogue and finesse-based skills',
            '• Scales lightning, shadow, and arcane magic',
            '• Improves retreat success chance',
            '• Increases item drop chance (ambition 150 = +30%, ambition 300 = +60%)',
        ]
    },
    harmony: {
        name: 'Harmony',
        description: 'Attunement and consistency. The primary stat for ice, holy, and nature/poison mages — and the dominant stat for healers and supports.',
        effects: [
            '• Significantly increases maximum Mana',
            '• Powers all healing and restoration skills',
            '• Scales ice, cold, holy, nature, and poison magic damage',
            '• Compresses damage variance — high Harmony characters hit reliably rather than swinging wildly',
            '• Drives mana regeneration between actions',
            '• Increases XP earned from combat (harmony 150 = +20%, harmony 300 = +40%)',
            '• No effect on fire, arcane, lightning, or shadow damage',
        ]
    }
};

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
        gameData.tuning     = dataFromServer.tuning     || {};

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
Determine character class based on skills, equipment, stats, and combat history.
Comprehensive system that prioritizes skill investment over equipment,
while recognizing weapon synergy, stat alignment, and performance achievements.

Hierarchy:
1. Key Skills (40%) - Deep unlocks like assassinate, mass_heal, meteor, necromancy
2. Skill Categories & Tags (30%) - Damage types, elements, categories
3. Equipment Synergy (15%) - Weapon type, armor type, damage type matching
4. Stat Distribution (10%) - Conviction/Endurance/Ambition/Harmony ratios
5. Performance (5%) - Win rate, challenges, milestones for prestige titles

SAFE VERSION: All object access guarded with null checks and fallbacks.
*/
function getCharacterClass(character, skills) {
    try {
        // ── SAFETY CHECKS ─────────────────────────────────────────────────────
        if (!character || !skills || !Array.isArray(skills)) {
            return 'Adventurer';
        }

        // Ensure gameData is loaded for gear lookups
        const gearData = (typeof window !== 'undefined' && window.gameData && Array.isArray(window.gameData.gear))
            ? window.gameData.gear
            : [];

        const charSkills = character.skills || [];
        // Filter to learned, non-intrinsic skills for class determination (active combat skills)
        // Intrinsics are racial bonuses, not build choices
        const activeSkills = charSkills.filter(s =>
            s &&
            !s.intrinsic &&
            s.learned !== false &&
            (s.skillLevel || 0) >= 1
        );

        // Edge case: No active skills
        if (activeSkills.length === 0) {
            return 'Novice';
        }

        const equipment = character.equipment || {};
        const stats = character.stats || {};
        const combatStats = character.combatStats || {};
        const milestones = combatStats.milestones || {};

        // ── GEAR ANALYSIS ─────────────────────────────────────────────────────
        // Get main hand weapon
        const weaponId = (v => v && typeof v === 'object' ? v.itemID : v)(equipment.mainHand);
        const weapon = weaponId && gearData.length > 0
            ? gearData.find(g => g && g.id === weaponId)
            : null;
        const weaponType = (weapon && weapon.type) ? weapon.type.toLowerCase() : '';
        const weaponTier = weapon?.tier || 0;

        // Get weapon damage types
        const weaponDamageTypes = [];
        if (weapon?.dmg_type_1) weaponDamageTypes.push(weapon.dmg_type_1.toLowerCase());
        if (weapon?.dmg_type_2) weaponDamageTypes.push(weapon.dmg_type_2.toLowerCase());
        if (weapon?.dmg_type_3) weaponDamageTypes.push(weapon.dmg_type_3.toLowerCase());
        if (weapon?.dmg_type_4) weaponDamageTypes.push(weapon.dmg_type_4.toLowerCase());

        // Get weapon on-hit procs
        const weaponProcs = [];
        if (weapon?.onhit_skillid_1) weaponProcs.push(weapon.onhit_skillid_1);
        if (weapon?.onhit_skillid_2) weaponProcs.push(weapon.onhit_skillid_2);
        if (weapon?.onhit_skillid_3) weaponProcs.push(weapon.onhit_skillid_3);

        // Get chest armor type
        const chestId = equipment.chest;
        const chestArmor = chestId && gearData.length > 0
            ? gearData.find(g => g && g.id === chestId)
            : null;
        const armorType = (chestArmor && chestArmor.type) ? chestArmor.type.toLowerCase() : '';

        // Get off-hand (shield check)
        const offHandId = equipment.offHand;
        const offHand = offHandId && gearData.length > 0
            ? gearData.find(g => g && g.id === offHandId)
            : null;
        const hasShield = offHand?.type?.toLowerCase() === 'shield';

        // ── SKILL CATEGORY COUNTING ───────────────────────────────────────────
        const categories = {
            damagePhysical: 0,
            damageMagic: 0,
            healing: 0,
            buff: 0,
            defense: 0,
            control: 0,
            utility: 0,
            restoration: 0
        };

        const damageTypes = {
            physical: 0, fire: 0, cold: 0, lightning: 0, arcane: 0,
            holy: 0, shadow: 0, nature: 0, poison: 0, electric: 0, water: 0
        };

        const tags = {
            beast: 0, arcane: 0, holy: 0, shadow: 0, nature: 0,
            fire: 0, cold: 0, lightning: 0, poison: 0, water: 0,
            slashing: 0, piercing: 0, bludgeoning: 0, healing: 0,
            song: 0, spirit: 0
        };

        // Track skill scaling factors to check stat alignment
        const skillScaling = { conviction: 0, endurance: 0, ambition: 0, harmony: 0 };

        // Track key skills for priority classification
        const keySkills = {
            assassinate: false,
            shadow_step: false,
            mass_heal: false,
            holy_word: false,
            meteor: false,
            fireball: false,
            chain_lightning: false,
            necromancy: false,
            lifetap: false,
            entangle: false,
            nature_touch: false,
            bloodlust: false,
            frenzy: false,
            fortify: false,
            second_wind: false,
            stalk: false,
            sense: false,
            misdirect: false,
            footwork: false,
            produce_flame: false,
            chill: false,
            shock: false,
            arcane_bolt: false,
            shadow_bolt: false,
            holy_light: false,
            smite: false,
            slash: false,
            pierce: false,
            pummel: false,
            lunge: false,
            weak_point: false,
            aim: false,
            basic_attack: false,
            block: false,
            first_aid: false,
            rest: false,
            shout: false,
            warcry: false,
            attunement: false,
            prayer: false,
            channel: false,
            // Bard skills
            song_of_vigor: false,
            battle_hymn: false,
            soothing_verse: false,
            grand_symphony: false,
            siren_call: false,
            haunting_refrain: false,
            chorus: false,
            // Shaman skills
            totemic_aura: false,
            spirit_link: false,
            spirit_storm: false,
            ancestral_shroud: false,
            hex: false
        };

        // Track child skills for depth bonus
        let childSkillCount = 0;
        let maxSkillLevel = 0;

        activeSkills.forEach(skillEntry => {
            try {
                if (!skillEntry || !skillEntry.skillID) return;

                const skill = skills.find(s => s && s.id === skillEntry.skillID);
                if (!skill || !skill.category) return;

                const category = skill.category.toUpperCase();
                const skillTags = skill.tags || [];
                const effects = skill.effects || [];
                const skillScalingFactors = skill.scalingFactors || {};

                // Track skill level
                if ((skillEntry.skillLevel || 0) > maxSkillLevel) {
                    maxSkillLevel = skillEntry.skillLevel;
                }

                // Track child skills
                if (skill.isChildSkill === true) {
                    childSkillCount++;
                }

                // Category Counting
                if (category.includes('DAMAGE')) {
                    const hasPhysical = effects.some(e =>
                        e.damageType && ['physical', 'slashing', 'piercing', 'bludgeoning'].includes(e.damageType.toLowerCase())
                    );
                    const hasMagic = effects.some(e =>
                        e.damageType && ['fire', 'cold', 'lightning', 'electric', 'arcane', 'holy', 'shadow', 'nature', 'poison', 'water'].includes(e.damageType.toLowerCase())
                    ) || category.includes('MAGIC');

                    if (hasPhysical && hasMagic) {
                        categories.damageMagic++;
                        categories.damagePhysical++;
                    } else if (hasMagic) {
                        categories.damageMagic++;
                    } else {
                        categories.damagePhysical++;
                    }
                }

                if (category === 'HEALING' || category === 'HEALING_AOE') categories.healing++;
                if (category === 'BUFF') categories.buff++;
                if (category === 'DEFENSE') categories.defense++;
                if (category === 'CONTROL') categories.control++;
                if (category === 'UTILITY') categories.utility++;
                if (category === 'RESTORATION') categories.restoration++;

                // Tag Counting (from skill tags)
                skillTags.forEach(tag => {
                    if (tag && typeof tag === 'string') {
                        const t = tag.toLowerCase();
                        if (tags[t] !== undefined) tags[t]++;
                    }
                });

                // Tag Counting (from effect damage types)
                effects.forEach(effect => {
                    if (effect && effect.type === 'damage' && effect.damageType) {
                        const dt = effect.damageType.toLowerCase();
                        if (damageTypes[dt] !== undefined) damageTypes[dt]++;
                        if (tags[dt] !== undefined) tags[dt]++;
                    }
                });

                // Track scaling factors
                if (skillScalingFactors.conviction) skillScaling.conviction += skillScalingFactors.conviction;
                if (skillScalingFactors.endurance) skillScaling.endurance += skillScalingFactors.endurance;
                if (skillScalingFactors.ambition) skillScaling.ambition += skillScalingFactors.ambition;
                if (skillScalingFactors.harmony) skillScaling.harmony += skillScalingFactors.harmony;

                // Track key skills
                const sid = skill.id.toLowerCase();
                if (keySkills[sid] !== undefined) {
                    keySkills[sid] = true;
                }

            } catch (skillErr) {
                // Skip problematic skills silently
                console.warn('[getCharacterClass] Skill analysis error:', skillErr.message);
            }
        });

        const totalDamage = categories.damagePhysical + categories.damageMagic;
        const totalSkills = activeSkills.length;

        // ── HELPER: Check for specific skill ─────────────────────────────────
        const hasSkill = (skillId) => activeSkills.some(s => s.skillID === skillId);

        // ── HELPER: Check weapon proc ────────────────────────────────────────
        const hasWeaponProc = (procId) => weaponProcs.includes(procId);

        // ── HELPER: Dominant damage type ─────────────────────────────────────
        const dominantDamageType = Object.entries(damageTypes)
            .filter(([_, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

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

        // ── HELPER: Skill scaling ratio ──────────────────────────────────────
        const totalScaling = Object.values(skillScaling).reduce((a, b) => a + b, 0) || 1;
        const scalingRatios = {
            conviction: skillScaling.conviction / totalScaling,
            endurance:  skillScaling.endurance / totalScaling,
            ambition:   skillScaling.ambition / totalScaling,
            harmony:    skillScaling.harmony / totalScaling
        };

        // Check if stats align with skill scaling (within 15% tolerance)
        const statsAlignWithScaling = (stat) => {
            return Math.abs(statRatios[stat] - scalingRatios[stat]) < 0.15;
        };

        // ── ARMOR CLASSIFICATION ─────────────────────────────────────────────
        const isHeavyArmor = ['plate', 'cuirass', 'chain'].includes(armorType);
        const isMediumArmor = ['leather', 'studded'].includes(armorType);
        const isLightArmor = ['cloth', 'robe', 'vestments'].includes(armorType);

        // ── WEAPON CLASSIFICATION ────────────────────────────────────────────
        const isMeleeWeapon = ['sword', 'dagger', 'axe', 'handaxe', 'hammer', 'mace'].includes(weaponType);
        const isRangedWeapon = ['bow', 'crossbow', 'pistol'].includes(weaponType);
        const isCasterWeapon = ['wand', 'scepter', 'tome'].includes(weaponType);
        const isInstrumentWeapon = ['flute', 'bell', 'totem'].includes(weaponType);
        const isCasterOrInstrument = isCasterWeapon || isInstrumentWeapon;

        // ── COMBAT PERFORMANCE ───────────────────────────────────────────────
        const lifetimeDamageDealt = combatStats.totalDamageDealt || 0;
        const totalHealing = combatStats.totalHealingDone || 0;
        const totalKills = Object.values(combatStats.enemyKills || {}).reduce((a, b) => a + b, 0);
        const winRate = combatStats.wins && combatStats.totalCombats
            ? combatStats.wins / combatStats.totalCombats
            : 0;
        const totalChallenges = Object.keys(combatStats.challengeCompletions || {}).length;

        // ═══════════════════════════════════════════════════════════════════
        // CLASS DETERMINATION LOGIC - SKILLS FIRST, EQUIPMENT SECOND
        // ═══════════════════════════════════════════════════════════════════

        let baseClass = 'Adventurer';
        let variant = '';
        let prefix = '';

        // ─── STEP 1: KEY SKILL CHECKS (Highest Priority - 40% weight) ───────
        // These represent deep build investment and ALWAYS take precedence

        // Assassin Build - Requires shadow_step + assassinate (deep combo)
        if (keySkills.assassinate && (keySkills.shadow_step || dominantTag === 'shadow')) {
            if (weaponType === 'dagger') return 'Master Assassin';
            if (isRangedWeapon) return 'Shadow Hunter';
            if (keySkills.stalk || keySkills.sense) return 'Nightblade';
            return 'Assassin';
        }

        // Necromancer - Shadow damage + healing (lifetap/necromancy)
        if (keySkills.necromancy || (keySkills.lifetap && dominantTag === 'shadow')) {
            if (categories.healing > 0 && categories.damageMagic > 0) return 'Necromancer';
            return 'Shadow Priest';
        }

        // High Priest - Mass heal + holy word (deep healing combo)
        if (keySkills.mass_heal && keySkills.holy_word) {
            if (weaponType === 'tome') return 'High Priest';
            if (weaponType === 'scepter') return 'Hierophant';
            return 'High Priest';
        }

        // Archmage - Meteor + fireball/chain_lightning (deep magic combo)
        if (keySkills.meteor) {
            if (dominantTag === 'fire') return 'Archmage';
            if (dominantTag === 'lightning') return 'Storm Lord';
            if (dominantTag === 'cold') return 'Archmage';
            return 'Archmage';
        }

        // Thundercaller - Chain lightning specialist
        if (keySkills.chain_lightning && dominantTag === 'lightning') {
            if (isCasterOrInstrument) return 'Thundercaller';
            return 'Storm Mage';
        }

        // Druid - Nature touch + entangle/regrowth (deep nature combo)
        if (keySkills.nature_touch && (keySkills.entangle || categories.healing > 0)) {
            if (weaponType === 'totem') return 'Archdruid';
            if (isLightArmor) return 'Druid';
            return 'Circle Warden';
        }

        // Paladin - Holy smite + holy light + defense/heavy armor
        if (keySkills.smite && keySkills.holy_light && (categories.defense > 0 || isHeavyArmor)) {
            if (hasShield) return 'Shield Paladin';
            if (isHeavyArmor) return 'Paladin';
            return 'Crusader';
        }

        // Berserker - Bloodlust/frenzy + physical damage + high conviction
        if ((keySkills.bloodlust || keySkills.frenzy) && categories.damagePhysical > 0) {
            if (statRatios.conviction > 0.35) return 'Berserker';
            return 'Brawler';
        }

        // Guardian/Warden - Fortify + defense skills
        if (keySkills.fortify && categories.defense > 0) {
            if (dominantTag === 'nature') return 'Warden';
            if (isHeavyArmor) return 'Guardian';
            return 'Defender';
        }

        // Scout/Rogue - Stalk + sense + utility
        if ((keySkills.stalk || keySkills.sense) && categories.utility > 0 && categories.damagePhysical < 2) {
            if (statRatios.ambition > 0.35) return 'Rogue';
            return 'Scout';
        }

        // Bard — any song-tagged skill is the definitive signal, instrument refines the title.
        // Two skill slots means a bard often has just one song skill + a utility/heal.
        const hasSongSkill = tags.song >= 1 || keySkills.chorus || keySkills.song_of_vigor ||
            keySkills.battle_hymn || keySkills.soothing_verse || keySkills.grand_symphony ||
            keySkills.siren_call || keySkills.haunting_refrain;
        if (hasSongSkill) {
            if (weaponType === 'flute') return keySkills.grand_symphony ? 'Virtuoso' : 'Bard';
            if (weaponType === 'bell') return 'Choirmaster';
            if (isInstrumentWeapon) return 'Bard';
            if (keySkills.grand_symphony) return 'Grand Bard';
            if (categories.healing > 0 && tags.song >= 2) return 'Battle Bard';
            if (tags.song >= 2) return 'Bard';
            // Single song skill without instrument — classify by what else they have
            if (categories.healing >= 1) return 'Minstrel';
            return 'Bard';
        }

        // Shaman - spirit skills are the signal; totem weapon refines
        if (tags.spirit >= 2 || (keySkills.totemic_aura && keySkills.spirit_link) || keySkills.spirit_storm) {
            if (weaponType === 'totem') {
                if (keySkills.spirit_storm) return 'Storm Shaman';
                if (categories.healing >= 2) return 'Healing Shaman';
                return 'Shaman';
            }
            if (keySkills.hex || keySkills.ancestral_shroud) return 'Witch Doctor';
            if (categories.healing >= 2) return 'Spirit Healer';
            return 'Shaman';
        }

        // ─── STEP 2: TIER-BASED PRESTIGE TITLES (Endgame only) ─────────────
        if (weaponTier >= 7) {
            if (dominantTag === 'holy' && isHeavyArmor) return 'Ascended Paladin';
            if (dominantTag === 'shadow' && isLightArmor) return 'Void Walker';
            if (dominantTag === 'fire' && isMeleeWeapon) return 'Phoenix Knight';
            if (dominantTag === 'lightning' && isCasterOrInstrument) return 'Storm Lord';
            if (categories.healing > 3 && isLightArmor) return 'Arch Priest';
            if (categories.damageMagic > 4) return 'Archmage';
            if (categories.damagePhysical > 4 && isHeavyArmor) return 'Warlord';
        }

        if (weaponTier >= 5) {
            if (dominantTag === 'holy') return 'Celestial Knight';
            if (dominantTag === 'shadow') return 'Shadow Master';
            if (dominantTag === 'fire') return 'Flame Warden';
            if (dominantTag === 'lightning') return 'Thundercaller';
            if (damageTypes.physical > 2) return 'Blood Knight';
            if (damageTypes.poison > 2) return 'Venom Lord';
        }

        // ─── STEP 3: HYBRID ARCHETYPES (Weapon + Skill Synergy) ────────────

        // Instrument Users (Flute/Bell/Totem) - Musical/Caster hybrids
        if (isInstrumentWeapon && totalDamage > 0) {
            if (categories.damageMagic > 0) {
                if (dominantTag === 'nature') return 'Bard';
                if (dominantTag === 'holy') return 'Choirmaster';
                if (dominantTag === 'shadow') return 'Dirge Singer';
                if (dominantTag === 'fire') return 'Pyromancer';
                if (dominantTag === 'cold') return 'Frost Singer';
                if (dominantTag === 'lightning') return 'Thundercaller';
                return 'Mage';
            }
            if (categories.healing > 0) {
                if (dominantTag === 'nature') return 'Druid';
                if (dominantTag === 'holy') return 'Priest';
                return 'Mender';
            }
        }

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
            if (categories.healing > totalDamage) return 'Field Medic';
            return 'Vanguard';
        }

        // Paladin: Heavy armor + holy damage + healing or defense
        if (isHeavyArmor && (dominantTag === 'holy' || categories.healing > 0) && categories.defense > 0) {
            if (hasShield) return 'Shield Paladin';
            return 'Paladin';
        }

        // Death Knight: Shadow damage + heavy armor + bleed/poison
        if (dominantTag === 'shadow' && isHeavyArmor && (damageTypes.physical > 2 || damageTypes.poison > 2)) {
            return 'Death Knight';
        }

        // ─── STEP 4: PURE DAMAGE CLASSES (Skill-Specific, Weapon Refines) ──

        if (totalDamage > 0) {
            // Magic Damage Dealers
            if (categories.damageMagic > categories.damagePhysical) {
                if (isCasterOrInstrument) {
                    if (dominantTag === 'fire') {
                        if (weaponType === 'wand') return 'Pyromancer';
                        if (weaponType === 'tome') return 'Fire Sage';
                        if (weaponType === 'totem') return 'Fire Shaman';
                        return 'Fire Mage';
                    }
                    if (dominantTag === 'cold') {
                        if (weaponType === 'wand') return 'Cryomancer';
                        if (weaponType === 'tome') return 'Frost Sage';
                        if (weaponType === 'totem') return 'Frost Shaman';
                        return 'Frost Mage';
                    }
                    if (dominantTag === 'lightning') {
                        if (weaponType === 'wand') return 'Thunder Mage';
                        if (weaponType === 'tome') return 'Storm Sage';
                        if (weaponType === 'totem') return 'Storm Shaman';
                        return 'Storm Mage';
                    }
                    if (dominantTag === 'arcane') {
                        if (weaponType === 'wand') return 'Arcanist';
                        if (weaponType === 'tome') return 'Wizard';
                        if (weaponType === 'totem') return 'Shaman';
                        return 'Mage';
                    }
                    if (dominantTag === 'holy') {
                        if (weaponType === 'scepter') return 'Priest';
                        if (weaponType === 'tome') return 'Divine Scholar';
                        if (weaponType === 'bell') return 'Choirmaster';
                        return 'Invoker';
                    }
                    if (dominantTag === 'shadow') {
                        if (weaponType === 'wand') return 'Warlock';
                        if (weaponType === 'tome') return 'Shadow Scholar';
                        if (weaponType === 'bell') return 'Dirge Singer';
                        return 'Shadow Mage';
                    }
                    if (dominantTag === 'nature') {
                        if (weaponType === 'totem') return 'Druid';
                        if (weaponType === 'tome') return 'Nature Sage';
                        if (weaponType === 'flute') return 'Bard';
                        return 'Nature Mage';
                    }
                    if (dominantTag === 'poison') {
                        if (weaponType === 'tome') return 'Alchemist';
                        return 'Plague Mage';
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

                return 'Spellweaver';
            }

            // Physical Damage Dealers - Weapon Specific
            if (categories.damagePhysical >= categories.damageMagic) {
                // Sword users
                if (weaponType === 'sword') {
                    if (damageTypes.physical > 2 && statRatios.ambition > 0.35) return 'Duelist';
                    if (hasShield && isHeavyArmor) return 'Knight';
                    if (statRatios.conviction > 0.35 && statsAlignWithScaling('conviction')) return 'Blademaster';
                    if (statRatios.ambition > 0.35) return 'Duelist';
                    return 'Warrior';
                }

                // Dagger users
                if (weaponType === 'dagger') {
                    if (damageTypes.poison > 2) return 'Assassin';
                    if (dominantTag === 'shadow') return 'Shadow Assassin';
                    if (statRatios.ambition > 0.4) return 'Rogue';
                    if (keySkills.assassinate) return 'Assassin';
                    return 'Thief';
                }

                // Axe users
                if (weaponType === 'axe' || weaponType === 'handaxe') {
                    if (damageTypes.physical > 2 && statRatios.conviction > 0.4) return 'Berserker';
                    if (isHeavyArmor) return 'Marauder';
                    if (statRatios.conviction > 0.35) return 'Barbarian';
                    return 'Ravager';
                }

                // Hammer/Mace users
                if (weaponType === 'hammer' || weaponType === 'mace') {
                    if (dominantTag === 'holy') return 'Crusader';
                    if (isHeavyArmor && hasShield) return 'Juggernaut';
                    if (statRatios.endurance > 0.35) return 'Bruiser';
                    return 'Warrior';
                }

                // Ranged users
                if (isRangedWeapon) {
                    if (damageTypes.poison > 2) return 'Hunter';
                    if (statRatios.ambition > 0.4) return 'Sniper';
                    if (weaponType === 'crossbow') return 'Crossbowman';
                    if (weaponType === 'pistol') return 'Gunslinger';
                    return 'Ranger';
                }

                // Generic physical
                if (statRatios.conviction > 0.35 && statsAlignWithScaling('conviction')) return 'Warrior';
                if (statRatios.ambition > 0.35) return 'Pugilist';
                if (totalKills > 100) return 'Veteran';
                return 'Footsoldier';
            }
        }

        // ─── STEP 5: SUPPORT CLASSES ────────────────────────────────────────

        if (categories.healing >= 2 || (categories.healing >= 1 && categories.buff >= 1)) {
            if (isLightArmor) {
                if (dominantTag === 'holy') {
                    if (totalHealing > 10000 || milestones.masterHealer) return 'High Priest';
                    if (weaponType === 'scepter') return 'Priest';
                    if (weaponType === 'tome') return 'Cleric';
                    if (weaponType === 'bell') return 'Choirmaster';
                    return 'Mender';
                }
                if (dominantTag === 'nature') {
                    if (weaponType === 'totem') return 'Druid';
                    if (weaponType === 'flute') return 'Bard';
                    return 'Circle Keeper';
                }
                if (categories.buff >= 2) return 'Warden';
                return 'Mender';
            }

            // Tank healer (heavy armor + healing)
            if (isHeavyArmor && categories.healing > 0) {
                return 'War Priest';
            }
        }

        if (categories.buff >= 2 && totalDamage < 1) {
            if (keySkills.warcry || keySkills.shout) return 'Banneret';
            if (statRatios.harmony > 0.35) return 'Harmonist';
            return 'Tactician';
        }

        // ─── STEP 6: TANK CLASSES ───────────────────────────────────────────

        if (categories.defense >= 2 || (categories.defense >= 1 && hasShield)) {
            if (isHeavyArmor) {
                if (hasShield) return 'Shieldbearer';
                if (statRatios.endurance > 0.4 && statsAlignWithScaling('endurance')) return 'Guardian';
                return 'Defender';
            }
            if (isMediumArmor && categories.control > 0) return 'Warden';
            return 'Defender';
        }

        // ─── STEP 7: CONTROL/SPECIALIST CLASSES ─────────────────────────────

        if (categories.control >= 2) {
            if (dominantTag === 'shadow') return 'Warlock';
            if (dominantTag === 'nature') return 'Druid';
            if (statRatios.ambition > 0.35) return 'Saboteur';
            return 'Hexblade';
        }

        if (categories.utility >= 2 && totalDamage < 1 && categories.healing < 1) {
            if (keySkills.stalk || keySkills.sense) return 'Scout';
            if (statRatios.harmony > 0.35) return 'Mystic';
            return 'Pathfinder';
        }

        // ─── STEP 8: ARMOR-BASED FALLBACKS ──────────────────────────────────

        if (isHeavyArmor && totalDamage > 0) {
            if (dominantTag === 'holy') return 'Crusader';
            if (dominantTag === 'shadow') return 'Dark Knight';
            return 'Knight';
        }

        if (isLightArmor && categories.damageMagic > 0) {
            if (dominantTag === 'arcane') return 'Mage';
            if (dominantTag === 'holy') return 'Priest';
            if (dominantTag === 'shadow') return 'Warlock';
            return 'Arcanist';
        }

        if (isMediumArmor && totalDamage > 0) {
            if (statRatios.ambition > 0.35) return 'Rogue';
            if (statRatios.conviction > 0.35) return 'Ranger';
            return 'Scout';
        }

        // ─── STEP 9: STAT-BASED FALLBACKS ───────────────────────────────────

        if (statRatios.conviction > 0.35 && statsAlignWithScaling('conviction')) return 'Warrior';
        if (statRatios.endurance > 0.35 && statsAlignWithScaling('endurance')) return 'Guardian';
        if (statRatios.ambition > 0.35 && statsAlignWithScaling('ambition')) return 'Rogue';
        if (statRatios.harmony > 0.35 && statsAlignWithScaling('harmony')) return 'Mystic';

        // ─── STEP 10: SKILL DEPTH BONUS ─────────────────────────────────────
        // Characters with deep skill trees get prestige modifiers
        if (childSkillCount >= 3 && maxSkillLevel >= 5) {
            if (baseClass.includes('Mage') || baseClass.includes('Wizard')) {
                baseClass = 'Arch' + baseClass;
            } else if (baseClass.includes('Warrior') || baseClass.includes('Knight')) {
                baseClass = 'Master ' + baseClass;
            }
        }

        // ─── STEP 11: PERFORMANCE PREFIX (Based on Winrate & Challenges) ───
        // High winrate + challenge completions = prestige titles
        if (winRate >= 0.85 && totalChallenges >= 5 && combatStats.totalCombats >= 50) {
            if (baseClass.includes('Mage') || baseClass.includes('Wizard') || baseClass.includes('Priest') || baseClass.includes('Cleric')) {
                prefix = 'Arch';
            } else if (baseClass.includes('Warrior') || baseClass.includes('Knight') || baseClass.includes('Paladin') || baseClass.includes('Berserker')) {
                prefix = 'High';
            } else if (baseClass.includes('Healer') || baseClass.includes('Druid')) {
                prefix = 'Grand';
            } else if (baseClass.includes('Assassin') || baseClass.includes('Rogue') || baseClass.includes('Shadow')) {
                prefix = 'Master';
            } else {
                prefix = 'Legendary';
            }
        } else if (winRate >= 0.70 && totalChallenges >= 3 && combatStats.totalCombats >= 25) {
            if (baseClass.includes('Mage') || baseClass.includes('Wizard')) {
                prefix = 'Senior';
            } else if (baseClass.includes('Warrior') || baseClass.includes('Knight')) {
                prefix = 'Elite';
            } else if (baseClass.includes('Healer') || baseClass.includes('Cleric')) {
                prefix = 'Exalted';
            }
        } else if (milestones.hundredKills || milestones.masterHealer) {
            if (totalHealing > 10000) {
                prefix = 'Saint';
            } else if (totalKills >= 100) {
                prefix = 'Veteran';
            }
        } else if (milestones.undefeated && combatStats.wins >= 10) {
            prefix = 'Undefeated';
        } else if (combatStats.totalCombats >= 100) {
            prefix = 'Seasoned';
        }

        // ─── FINAL ASSEMBLY ──────────────────────────────────────────────────
        let finalClass = baseClass;
        if (prefix) finalClass = `${prefix} ${finalClass}`;

        // Fallback safety - never return empty or undefined
        if (!finalClass || finalClass.trim() === '') {
            return 'Adventurer';
        }

        return finalClass;

    } catch (error) {
        // CRITICAL: Never break character loading - return safe default
        console.error('[getCharacterClass] Critical error:', error.message);
        return 'Adventurer';
    }
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
        Object.values(character.equipment).forEach(val => {
            const itemId = val && typeof val === 'object' ? val.itemID : val;
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

// Resource scaling constants — must match CONSTANTS in combatEngine.js exactly.
// When tuning combat balance, update both files.
const DERIVED_STATS_CONSTANTS = {
    PLAYER_BASE_HP:       60,
    PLAYER_BASE_MANA:     80,
    PLAYER_BASE_STAMINA:  80,
    HP_GROWTH:            1.05,
    MANA_GROWTH:          1.02,
    STAMINA_GROWTH:       1.02,
    HP_STAT_DIVISOR:      150,
    MANA_STAT_DIVISOR:    150,
    STAMINA_STAT_DIVISOR: 150,
};

/**
 * Calculate derived stats (HP, Mana, Stamina) for a character.
 * Mirrors combatEngine.js calculateMaxHP/Mana/Stamina exactly so the
 * character sheet shows what will actually be used in combat.
 * Tune via DERIVED_STATS_CONSTANTS above — keep in sync with combatEngine.js CONSTANTS.
 */
function calculateDerivedStats(character) {
    const level = character.level || 1;
    const stats = calculateTotalStats(character);
    const C = DERIVED_STATS_CONSTANTS;

    const hp      = Math.floor(C.PLAYER_BASE_HP      * Math.pow(C.HP_GROWTH,      level - 1) * (1 + (stats.endurance || 0) / C.HP_STAT_DIVISOR));
    const mana    = Math.floor(C.PLAYER_BASE_MANA    * Math.pow(C.MANA_GROWTH,    level - 1) * (1 + ((stats.harmony || 0) * 0.7 + (stats.endurance || 0) * 0.3) / C.MANA_STAT_DIVISOR));
    const stamina = Math.floor(C.PLAYER_BASE_STAMINA * Math.pow(C.STAMINA_GROWTH, level - 1) * (1 + ((stats.endurance || 0) * 0.7 + (stats.conviction || 0) * 0.3) / C.STAMINA_STAT_DIVISOR));

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
/**
 * Returns hint descriptors for undiscovered skill combinations involving skillID.
 * A hint fires when:
 *   - The skill is at level >= 3
 *   - A child skill exists with this skill as one parent
 *   - The other parent is in the character's known skills (level >= 1 or starter)
 *   - The child skill has not yet been discovered
 *
 * Returns an array of unique descriptor strings (e.g. ["fire", "defensive"])
 * suitable for display as combination hints.
 */
function getComboHints(character, skillID) {
    if (!window.gameData?.skills) return [];

    const skillRecord = (character.skills || []).find(r => r.skillID === skillID);
    if (!skillRecord || (skillRecord.skillLevel || 0) < 3) return [];

    const TAG_DISPLAY = {
        physical:    'physical',
        fire:        'fire',
        cold:        'cold',
        shadow:      'shadow',
        holy:        'holy',
        arcane:      'arcane',
        nature:      'nature',
        lightning:   'lightning',
        poison:      'poison',
        healing:     'healing',
        beast:       'primal',
        water:       'water',
    };

    const CATEGORY_DISPLAY = {
        DEFENSE:      'defensive',
        RESTORATION:  'restorative',
        BUFF:         'empowering',
        CONTROL:      'control',
        UTILITY:      'utility',
        DAMAGE_SINGLE:'offensive',
        DAMAGE_AOE:   'offensive',
        DAMAGE_MAGIC: 'arcane',
    };

    const knownIDs = new Set(
        (character.skills || [])
            .filter(r => r.isStarterSkill || (r.skillLevel || 0) >= 1)
            .map(r => r.skillID)
    );

    // Also include starter skills from gameData even if not in character.skills yet
    window.gameData.skills
        .filter(s => s.isStarterSkill)
        .forEach(s => knownIDs.add(s.id));

    // Include skills known by any current party member — combo paths can cross party members
    const partyMembers = window.currentState?.currentParty || [];
    partyMembers.forEach(member => {
        (member.skills || [])
            .filter(r => r.isStarterSkill || (r.skillLevel || 0) >= 1)
            .forEach(r => knownIDs.add(r.skillID));
    });

    const discoveredIDs = new Set(
        (character.skills || [])
            .filter(r => r.discovered && (r.skillLevel || 0) >= 1)
            .map(r => r.skillID)
    );

    const hints = new Set();

    const children = window.gameData.skills.filter(s => {
        const parents = s.parentSkills;
        return parents && parents.includes(skillID);
    });

    for (const child of children) {
        // Skip already discovered children
        if (discoveredIDs.has(child.id)) continue;

        const otherParentID = child.parentSkills.find(p => p !== skillID);
        if (!otherParentID) continue;

        // Other parent must be known to this character
        if (!knownIDs.has(otherParentID)) continue;

        const otherParent = window.gameData.skills.find(s => s.id === otherParentID);
        if (!otherParent) continue;

        // Derive descriptor from other parent's tags, falling back to category
        const tags = otherParent.tags || [];
        const usableTag = tags.find(t => TAG_DISPLAY[t]);
        if (usableTag) {
            hints.add(TAG_DISPLAY[usableTag]);
        } else {
            const cat = otherParent.category || '';
            const catKey = Object.keys(CATEGORY_DISPLAY).find(k => cat.startsWith(k));
            if (catKey) hints.add(CATEGORY_DISPLAY[catKey]);
        }
    }

    return [...hints];
}

// ---------------------------------------------------------------------------
// Server status indicator
// Polls /api/health every 30s. Updates the dot and label in the header.
// Green = online (<500ms), Yellow = slow (500ms–2s), Red = offline/timeout.
// ---------------------------------------------------------------------------

(function initServerStatus() {
    const POLL_INTERVAL = 30000; // 30s
    const SLOW_THRESHOLD = 500;  // ms
    const TIMEOUT_MS = 5000;     // treat as offline after 5s

    function setStatus(state, label) {
        const dot = document.getElementById('serverStatusDot');
        const lbl = document.getElementById('serverStatusLabel');
        if (!dot || !lbl) return;
        dot.className = 'server-dot ' + state;
        lbl.className = 'server-label ' + state;
        lbl.textContent = label;
    }

    async function poll() {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const t0 = Date.now();
        try {
            const res = await fetch(`${BACKEND_URL}/api/health`, {
                signal: controller.signal,
                cache: 'no-store',
            });
            clearTimeout(timeout);
            if (!res.ok) throw new Error('non-ok');
            const ms = Date.now() - t0;
            if (ms >= SLOW_THRESHOLD) {
                setStatus('slow', `Slow (${ms}ms)`);
            } else {
                setStatus('online', 'Online');
            }
        } catch {
            clearTimeout(timeout);
            setStatus('offline', 'Offline');
        }
    }

    // First poll after a short delay so DOM is ready
    setTimeout(poll, 1500);
    setInterval(poll, POLL_INTERVAL);
})();

// ── Quest Item Hints ──────────────────────────────────────────────────────────
// Returns hint objects for any quest items the player holds that are referenced
// in the current challenge's opportunities or branch conditions.
// Used by the rewards modal and offline summary to nudge players toward
// re-attempting with the right items in their pack.
window.getQuestItemHints = function(challenge, character) {
    if (!challenge || !character) return [];

    const inventory = character.inventory || [];
    const items     = window.gameData?.gear || [];

    // Collect all item IDs referenced in this challenge's opportunities and branches
    const referencedItems = new Set();
    for (const stage of (challenge.stages || [])) {
        for (const opp of (stage.preCombatOpportunities || [])) {
            if (opp.requiredItemID) referencedItems.add(opp.requiredItemID);
        }
        for (const branch of (stage.stageBranches || [])) {
            if (branch.condition?.type === 'has_item' && branch.condition?.value) {
                referencedItems.add(branch.condition.value);
            }
        }
    }

    if (referencedItems.size === 0) return [];

    // Find which of those items the player is carrying
    const hints = [];
    for (const itemID of referencedItems) {
        const held = inventory.find(i => i.itemID === itemID);
        if (!held) continue;

        const def = items.find(i => i.id === itemID);
        if (!def) continue;

        // Only hint for quest items (slot_id1 consumable, no type)
        if (def.slot_id1 !== 'consumable' || def.type) continue;

        const name = held.itemName || def.name || itemID;
        hints.push({
            itemID,
            name,
            text: `You carry the ${name}. It may open a different path if you return.`,
        });
    }

    return hints;
};
