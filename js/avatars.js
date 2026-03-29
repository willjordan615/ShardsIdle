/**
 * avatars.js — Character avatar system
 *
 * SVG-based avatars, one set per race (3 variants each).
 * Stored on character as avatarId: "race:index" (e.g. "orc:1").
 * avatarColor: hex string for tint, defaults to race theme color.
 *
 * Public API:
 *   window.AVATARS.getSVG(avatarId, color)  → SVG string
 *   window.AVATARS.renderPicker(raceId, currentAvatarId, onChange)  → HTMLElement
 *   window.AVATARS.renderCardBg(avatarId, color)  → HTML string for card background layer
 */

(function () {

    // ── Race theme colors ────────────────────────────────────────────────────
    const RACE_COLORS = {
        human:    '#8a7a5a',
        dwarf:    '#7a5a3a',
        elf:      '#4a7a5a',
        orc:      '#5a7a3a',
        halfling: '#7a6a4a',
    };

    // ── SVG path data — woodcut silhouette style ─────────────────────────────
    // Each avatar is a 60×80 viewBox. Paths describe a flat silhouette.
    // stroke="currentColor" so CSS tint works; fill is same color at low opacity.

    const AVATARS = {

        human: [
            // 0: Cloaked wanderer
            `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                    <!-- head -->
                    <ellipse cx="30" cy="12" rx="8" ry="9"/>
                    <!-- hood peak -->
                    <polygon points="22,8 30,2 38,8"/>
                    <!-- body/cloak — wide, tapering -->
                    <path d="M18,20 Q12,30 10,55 Q14,58 30,60 Q46,58 50,55 Q48,30 42,20 Q36,17 30,17 Q24,17 18,20Z"/>
                    <!-- staff -->
                    <rect x="50" y="10" width="3" height="55" rx="1"/>
                    <ellipse cx="51.5" cy="10" rx="4" ry="3"/>
                </g>
            </svg>`,

            // 1: Soldier
            `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                    <!-- helm -->
                    <path d="M22,14 Q22,4 30,4 Q38,4 38,14 L38,18 Q34,20 30,20 Q26,20 22,18Z"/>
                    <rect x="20" y="17" width="20" height="4" rx="1"/>
                    <!-- shoulders -->
                    <ellipse cx="18" cy="24" rx="6" ry="4"/>
                    <ellipse cx="42" cy="24" rx="6" ry="4"/>
                    <!-- torso/armour -->
                    <path d="M20,22 L18,50 Q24,55 30,55 Q36,55 42,50 L40,22Z"/>
                    <!-- legs -->
                    <rect x="21" y="53" width="8" height="22" rx="2"/>
                    <rect x="31" y="53" width="8" height="22" rx="2"/>
                    <!-- sword -->
                    <rect x="46" y="20" width="2" height="38" rx="1"/>
                    <rect x="42" y="28" width="10" height="2" rx="1"/>
                </g>
            </svg>`,

            // 2: Scholar/rogue
            `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                    <!-- head, slight tilt -->
                    <ellipse cx="31" cy="12" rx="7" ry="8"/>
                    <!-- wide-brim hat -->
                    <ellipse cx="31" cy="6" rx="13" ry="3"/>
                    <path d="M26,6 Q28,2 31,2 Q34,2 36,6Z"/>
                    <!-- coat, asymmetric -->
                    <path d="M20,22 Q16,35 15,58 L28,58 L30,30 L32,58 L45,58 Q44,35 40,22 Q36,19 31,19 Q26,19 20,22Z"/>
                    <!-- book tucked under arm -->
                    <rect x="11" y="35" width="7" height="10" rx="1"/>
                    <line x1="14.5" y1="35" x2="14.5" y2="45" stroke="currentColor" stroke-width="0.5" fill="none"/>
                </g>
            </svg>`,
        ],

        dwarf: [
            // 0: Axe-bearer
            `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                    <!-- helm with horns -->
                    <path d="M20,16 Q20,5 30,5 Q40,5 40,16 L40,20 Q35,22 30,22 Q25,22 20,20Z"/>
                    <path d="M20,12 Q16,6 14,4 Q17,8 20,12Z"/>
                    <path d="M40,12 Q44,6 46,4 Q43,8 40,12Z"/>
                    <!-- stocky torso — wide and short -->
                    <path d="M17,22 L14,52 Q20,57 30,57 Q40,57 46,52 L43,22Z"/>
                    <!-- short legs -->
                    <rect x="18" y="54" width="10" height="18" rx="2"/>
                    <rect x="32" y="54" width="10" height="18" rx="2"/>
                    <!-- beard -->
                    <path d="M22,20 Q20,30 22,38 Q26,42 30,42 Q34,42 38,38 Q40,30 38,20" fill="currentColor" opacity="0.5"/>
                    <!-- axe -->
                    <rect x="46" y="18" width="2.5" height="42" rx="1"/>
                    <path d="M44,18 Q50,14 52,22 Q50,28 44,26Z"/>
                </g>
            </svg>`,

            // 1: Armoured smith
            `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                    <!-- round helm -->
                    <path d="M21,17 Q21,5 30,5 Q39,5 39,17 L39,20 L21,20Z"/>
                    <rect x="19" y="19" width="22" height="3" rx="1"/>
                    <!-- wide shoulders, barrel chest -->
                    <ellipse cx="16" cy="25" rx="7" ry="5"/>
                    <ellipse cx="44" cy="25" rx="7" ry="5"/>
                    <path d="M19,22 L16,52 Q22,58 30,58 Q38,58 44,52 L41,22Z"/>
                    <!-- belly rivets -->
                    <circle cx="27" cy="35" r="1.5"/>
                    <circle cx="33" cy="35" r="1.5"/>
                    <circle cx="30" cy="41" r="1.5"/>
                    <!-- legs -->
                    <rect x="19" y="55" width="9" height="17" rx="2"/>
                    <rect x="32" y="55" width="9" height="17" rx="2"/>
                    <!-- hammer -->
                    <rect x="47" y="26" width="3" height="36" rx="1"/>
                    <rect x="44" y="22" width="9" height="8" rx="2"/>
                </g>
            </svg>`,

            // 2: Hooded prospector
            `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                    <!-- head + hood -->
                    <ellipse cx="30" cy="13" rx="7" ry="7"/>
                    <path d="M22,10 Q22,3 30,3 Q38,3 38,10 L40,14 Q36,11 30,11 Q24,11 20,14Z"/>
                    <!-- stocky cloaked body -->
                    <path d="M19,22 Q14,32 13,56 Q20,60 30,60 Q40,60 47,56 Q46,32 41,22 Q36,19 30,19 Q24,19 19,22Z"/>
                    <!-- pick -->
                    <rect x="47" y="24" width="2.5" height="38" rx="1" transform="rotate(10,48,43)"/>
                    <path d="M46,22 Q54,18 55,26 Q52,30 46,28Z" transform="rotate(10,48,43)"/>
                </g>
            </svg>`,
        ],

        elf: [
            // 0: Ranger
            `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                    <!-- slender head, pointed ear -->
                    <ellipse cx="30" cy="11" rx="6.5" ry="8"/>
                    <polygon points="37,9 41,6 39,13"/>
                    <!-- lean torso -->
                    <path d="M22,20 Q19,32 18,56 L28,56 L30,28 L32,56 L42,56 Q41,32 38,20 Q34,18 30,18 Q26,18 22,20Z"/>
                    <!-- quiver on back -->
                    <rect x="40" y="18" width="5" height="20" rx="2"/>
                    <line x1="41" y1="16" x2="42" y2="20" stroke="currentColor" stroke-width="1" fill="none"/>
                    <line x1="43" y1="15" x2="44" y2="20" stroke="currentColor" stroke-width="1" fill="none"/>
                    <!-- bow -->
                    <path d="M12,15 Q8,35 12,58" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                    <line x1="12" y1="15" x2="12" y2="58" stroke="currentColor" stroke-width="0.8" fill="none" opacity="0.6"/>
                </g>
            </svg>`,

            // 1: Mage
            `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                    <!-- head, pointed ear, tall -->
                    <ellipse cx="30" cy="11" rx="6" ry="8"/>
                    <polygon points="36,8 41,5 38,13"/>
                    <!-- tall conical hat -->
                    <path d="M22,9 Q26,2 30,0 Q34,2 38,9 L22,9Z"/>
                    <ellipse cx="30" cy="9" rx="9" ry="2.5"/>
                    <!-- flowing robes, tapered -->
                    <path d="M21,20 Q16,33 14,62 Q22,65 30,65 Q38,65 46,62 Q44,33 39,20 Q35,18 30,18 Q25,18 21,20Z"/>
                    <!-- orb/staff -->
                    <rect x="47" y="20" width="2.5" height="44" rx="1"/>
                    <circle cx="48.5" cy="17" r="5" fill="currentColor" opacity="0.7"/>
                    <circle cx="48.5" cy="17" r="3"/>
                </g>
            </svg>`,

            // 2: Scout/blade
            `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                    <!-- head -->
                    <ellipse cx="30" cy="11" rx="6.5" ry="8"/>
                    <polygon points="37,9 42,6 39,13"/>
                    <!-- half-mask/hood -->
                    <path d="M23,14 Q26,18 30,18 Q34,18 37,14 Q34,11 30,11 Q26,11 23,14Z" opacity="0.6"/>
                    <!-- lithe torso + legs as one piece -->
                    <path d="M23,19 Q20,30 19,52 L26,52 L29,30 L31,30 L34,52 L41,52 Q40,30 37,19 Q34,17 30,17 Q26,17 23,19Z"/>
                    <!-- legs -->
                    <rect x="20" y="50" width="8" height="24" rx="2"/>
                    <rect x="32" y="50" width="8" height="24" rx="2"/>
                    <!-- twin daggers, crossed -->
                    <rect x="10" y="22" width="2" height="22" rx="1" transform="rotate(-20,11,33)"/>
                    <rect x="14" y="22" width="2" height="22" rx="1" transform="rotate(15,15,33)"/>
                </g>
            </svg>`,
        ],

        orc: [
            // 0: Berserker
            `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                    <!-- heavy brow, tusks -->
                    <ellipse cx="30" cy="12" rx="9" ry="9"/>
                    <path d="M21,15 Q18,22 20,24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <path d="M39,15 Q42,22 40,24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <!-- massive torso, broad shoulders -->
                    <path d="M14,22 L10,54 Q18,60 30,60 Q42,60 50,54 L46,22 Q40,18 30,18 Q20,18 14,22Z"/>
                    <!-- scar lines -->
                    <line x1="26" y1="28" x2="22" y2="36" stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.5"/>
                    <!-- legs -->
                    <rect x="15" y="57" width="11" height="18" rx="2"/>
                    <rect x="34" y="57" width="11" height="18" rx="2"/>
                    <!-- greataxe -->
                    <rect x="49" y="12" width="3" height="54" rx="1"/>
                    <path d="M47,12 Q56,6 58,18 Q56,26 47,24Z"/>
                    <path d="M47,28 Q56,22 58,30 Q56,36 47,34Z" opacity="0.7"/>
                </g>
            </svg>`,

            // 1: Warchief
            `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                    <!-- head with crest helm -->
                    <ellipse cx="30" cy="13" rx="9" ry="9"/>
                    <path d="M21,10 L30,2 L39,10Z"/>
                    <path d="M20,10 Q20,4 30,4 Q40,4 40,10 L40,15 L20,15Z"/>
                    <!-- tusks -->
                    <path d="M22,17 Q19,24 21,26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
                    <path d="M38,17 Q41,24 39,26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
                    <!-- armoured bulk -->
                    <path d="M15,23 L11,55 Q20,62 30,62 Q40,62 49,55 L45,23 Q38,19 30,19 Q22,19 15,23Z"/>
                    <!-- pauldrons -->
                    <ellipse cx="13" cy="26" rx="7" ry="5" transform="rotate(-15,13,26)"/>
                    <ellipse cx="47" cy="26" rx="7" ry="5" transform="rotate(15,47,26)"/>
                    <!-- legs -->
                    <rect x="16" y="58" width="11" height="17" rx="2"/>
                    <rect x="33" y="58" width="11" height="17" rx="2"/>
                </g>
            </svg>`,

            // 2: Shaman
            `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                    <!-- head -->
                    <ellipse cx="30" cy="12" rx="8.5" ry="9"/>
                    <!-- bone/tusk headdress -->
                    <path d="M22,7 Q20,1 23,0 Q24,3 24,7Z"/>
                    <path d="M30,5 Q30,0 32,0 Q33,3 30,5Z"/>
                    <path d="M38,7 Q40,1 37,0 Q36,3 36,7Z"/>
                    <!-- tusks -->
                    <path d="M23,16 Q20,23 22,25" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <path d="M37,16 Q40,23 38,25" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <!-- robes over bulk -->
                    <path d="M18,22 Q13,34 12,60 Q20,64 30,64 Q40,64 48,60 Q47,34 42,22 Q36,19 30,19 Q24,19 18,22Z"/>
                    <!-- totem staff -->
                    <rect x="8" y="10" width="3" height="56" rx="1"/>
                    <path d="M4,10 Q9.5,5 15,10 Q9.5,15 4,10Z"/>
                    <circle cx="9.5" cy="10" r="2.5"/>
                </g>
            </svg>`,
        ],

        halfling: [
            // 0: Burglar
            `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                    <!-- round head, curly hair suggested -->
                    <ellipse cx="30" cy="14" rx="8" ry="9"/>
                    <path d="M22,10 Q20,5 24,4 Q26,8 22,10Z"/>
                    <path d="M38,10 Q40,5 36,4 Q34,8 38,10Z"/>
                    <path d="M27,6 Q30,3 33,6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <!-- small but round body -->
                    <path d="M20,24 Q17,35 16,56 L28,56 L30,34 L32,56 L44,56 Q43,35 40,24 Q36,21 30,21 Q24,21 20,24Z"/>
                    <!-- large hairy feet suggested by wide base -->
                    <ellipse cx="24" cy="68" rx="9" ry="5"/>
                    <ellipse cx="36" cy="68" rx="9" ry="5"/>
                    <!-- sack/bag -->
                    <path d="M42,30 Q50,28 52,36 Q50,44 42,42Z"/>
                    <line x1="42" y1="36" x2="50" y2="36" stroke="currentColor" stroke-width="0.8" fill="none" opacity="0.5"/>
                </g>
            </svg>`,

            // 1: Hearth-cook / innkeeper
            `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                    <!-- round cheerful head -->
                    <ellipse cx="30" cy="13" rx="8.5" ry="9"/>
                    <!-- round cap -->
                    <path d="M22,9 Q22,3 30,3 Q38,3 38,9 L40,12 L20,12Z"/>
                    <!-- plump body, apron line -->
                    <path d="M19,23 Q16,35 15,57 Q22,62 30,62 Q38,62 45,57 Q44,35 41,23 Q36,20 30,20 Q24,20 19,23Z"/>
                    <path d="M22,26 Q20,40 21,54 Q25,57 30,57 Q35,57 39,54 Q40,40 38,26 Q34,24 30,24 Q26,24 22,26Z" opacity="0.35"/>
                    <!-- ladle -->
                    <rect x="46" y="28" width="2.5" height="32" rx="1" transform="rotate(15,47,44)"/>
                    <ellipse cx="50" cy="26" rx="5" ry="4" transform="rotate(15,47,44)"/>
                </g>
            </svg>`,

            // 2: Tinkerer
            `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
                <g fill="currentColor">
                    <!-- head with goggles suggested -->
                    <ellipse cx="30" cy="13" rx="8" ry="9"/>
                    <rect x="22" y="10" width="7" height="5" rx="2" opacity="0.6"/>
                    <rect x="31" y="10" width="7" height="5" rx="2" opacity="0.6"/>
                    <line x1="29" y1="12.5" x2="31" y2="12.5" stroke="currentColor" stroke-width="1" fill="none"/>
                    <!-- compact body, tool belt -->
                    <path d="M20,23 Q17,34 16,56 Q22,60 30,60 Q38,60 44,56 Q43,34 40,23 Q35,20 30,20 Q25,20 20,23Z"/>
                    <rect x="18" y="38" width="24" height="5" rx="1" opacity="0.5"/>
                    <!-- wrench -->
                    <rect x="46" y="26" width="2.5" height="30" rx="1" transform="rotate(-10,47,41)"/>
                    <path d="M44,24 Q50,20 52,26 Q50,30 44,28Z" transform="rotate(-10,47,41)"/>
                    <!-- feet -->
                    <ellipse cx="25" cy="67" rx="8" ry="4.5"/>
                    <ellipse cx="35" cy="67" rx="8" ry="4.5"/>
                </g>
            </svg>`,
        ],
    };

    const VARIANT_LABELS = {
        human:    ['Wanderer', 'Soldier', 'Scholar'],
        dwarf:    ['Axebearer', 'Smith', 'Prospector'],
        elf:      ['Ranger', 'Mage', 'Scout'],
        orc:      ['Berserker', 'Warchief', 'Shaman'],
        halfling: ['Burglar', 'Innkeeper', 'Tinkerer'],
    };

    // ── Public API ───────────────────────────────────────────────────────────

    /**
     * Get SVG string for an avatarId ("race:index") with a given tint color.
     * Returns null if avatarId is missing or invalid.
     */
    function getSVG(avatarId, color) {
        if (!avatarId) return null;
        const [race, idxStr] = avatarId.split(':');
        const idx = parseInt(idxStr) || 0;
        const set = AVATARS[race];
        if (!set) return null;
        const svg = set[Math.min(idx, set.length - 1)];
        if (!svg) return null;
        const tint = color || RACE_COLORS[race] || '#8a7a5a';
        // Inject color as CSS custom property so currentColor resolves to it
        return svg.replace('<svg ', `<svg style="color:${tint}" `);
    }

    /**
     * Default avatarId for a race (first variant).
     */
    function defaultForRace(raceId) {
        return `${raceId}:0`;
    }

    /**
     * Default color for a race.
     */
    function defaultColor(raceId) {
        return RACE_COLORS[raceId] || '#8a7a5a';
    }

    /**
     * Render the avatar picker widget for character creation.
     * Returns an HTMLElement. Calls onChange(avatarId) on selection.
     */
    function renderPicker(raceId, currentAvatarId, onChange) {
        const set = AVATARS[raceId];
        if (!set) return document.createDocumentFragment();

        const labels = VARIANT_LABELS[raceId] || [];
        const color  = RACE_COLORS[raceId] || '#8a7a5a';

        const container = document.createElement('div');
        container.className = 'avatar-picker';

        set.forEach((_, idx) => {
            const avatarId = `${raceId}:${idx}`;
            const isSelected = currentAvatarId === avatarId;

            const btn = document.createElement('div');
            btn.className = `avatar-option${isSelected ? ' avatar-option--selected' : ''}`;
            btn.dataset.avatarId = avatarId;
            btn.innerHTML = `
                <div class="avatar-option__art">${getSVG(avatarId, color)}</div>
                <div class="avatar-option__label">${labels[idx] || ''}</div>
            `;
            btn.onclick = () => {
                container.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('avatar-option--selected'));
                btn.classList.add('avatar-option--selected');
                onChange(avatarId);
            };
            container.appendChild(btn);
        });

        return container;
    }

    /**
     * HTML string for an avatar background layer inside a card.
     * Positioned absolutely, faded, right-aligned.
     * The card needs position:relative and overflow:hidden.
     */
    function renderCardBg(avatarId, color) {
        const svg = getSVG(avatarId, color);
        if (!svg) return '';
        return `<div class="avatar-card-bg">${svg}</div>`;
    }

    window.AVATARS = { getSVG, defaultForRace, defaultColor, renderPicker, renderCardBg };

})();
