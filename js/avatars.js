/**
 * avatars.js — Character avatar system
 *
 * Image-based portraits with SVG silhouette fallbacks.
 * Stored on character as avatarId: "race:index" (e.g. "human:1").
 *
 * Public API:
 *   window.AVATARS.defaultForRace(raceId)               → avatarId string
 *   window.AVATARS.defaultColor(raceId)                 → hex string
 *   window.AVATARS.renderPicker(raceId, currentId, cb)  → HTMLElement
 *   window.AVATARS.renderCardBg(avatarId, color)          → HTML string
 */

(function () {

    const AVATAR_PATH = 'assets/avatars/';

    const IMAGES = {
        human:    [
            { file: 'human1.png',    label: 'Warrior'     },
            { file: 'human2.png',    label: 'Veteran'     },
            { file: 'human3.png',    label: 'Scout'       },
        ],
        dwarf:    [
            { file: 'dwarf1.png',    label: 'Ironhand'    },
        ],
        elf:      [
            { file: 'elf1.png',      label: 'Wanderer'    },
        ],
        halfling: [
            { file: 'halfling1.png', label: 'Burglar'     },
            { file: 'halfling2.png', label: 'Trickster'   },
        ],
        orc:      [
            { file: 'orc1.png',      label: 'Bonecrusher' },
        ],
    };

    const RACE_COLORS = {
        human:    '#8a7a5a',
        dwarf:    '#7a5a3a',
        elf:      '#4a7a5a',
        orc:      '#5a7a3a',
        halfling: '#7a6a4a',
    };

    const SVG_FALLBACKS = {
        human: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg"><g fill="currentColor"><ellipse cx="30" cy="12" rx="8" ry="9"/><polygon points="22,8 30,2 38,8"/><path d="M18,20 Q12,30 10,55 Q14,58 30,60 Q46,58 50,55 Q48,30 42,20 Q36,17 30,17 Q24,17 18,20Z"/><rect x="50" y="10" width="3" height="55" rx="1"/></g></svg>`,
        dwarf: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg"><g fill="currentColor"><path d="M20,16 Q20,5 30,5 Q40,5 40,16 L40,20 Q35,22 30,22 Q25,22 20,20Z"/><path d="M17,22 L14,52 Q20,57 30,57 Q40,57 46,52 L43,22Z"/><rect x="18" y="54" width="10" height="18" rx="2"/><rect x="32" y="54" width="10" height="18" rx="2"/></g></svg>`,
        elf: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg"><g fill="currentColor"><ellipse cx="30" cy="11" rx="6.5" ry="8"/><polygon points="37,9 41,6 39,13"/><path d="M22,20 Q19,32 18,56 L28,56 L30,28 L32,56 L42,56 Q41,32 38,20 Q34,18 30,18 Q26,18 22,20Z"/></g></svg>`,
        orc: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg"><g fill="currentColor"><ellipse cx="30" cy="12" rx="9" ry="9"/><path d="M14,22 L10,54 Q18,60 30,60 Q42,60 50,54 L46,22 Q40,18 30,18 Q20,18 14,22Z"/><rect x="15" y="57" width="11" height="18" rx="2"/><rect x="34" y="57" width="11" height="18" rx="2"/></g></svg>`,
        halfling: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg"><g fill="currentColor"><ellipse cx="30" cy="14" rx="8" ry="9"/><path d="M20,24 Q17,35 16,56 L28,56 L30,34 L32,56 L44,56 Q43,35 40,24 Q36,21 30,21 Q24,21 20,24Z"/><ellipse cx="24" cy="68" rx="9" ry="5"/><ellipse cx="36" cy="68" rx="9" ry="5"/></g></svg>`,
    };

    function _resolve(avatarId, fallbackRace) {
        if (avatarId) {
            for (const [race, set] of Object.entries(IMAGES)) {
                const entry = set.find(e => e.file === avatarId);
                if (entry) return { race, entry };
            }
        }
        if (fallbackRace && IMAGES[fallbackRace]?.[0]) {
            return { race: fallbackRace, entry: IMAGES[fallbackRace][0] };
        }
        return null;
    }

    function _imgTag(file, label) {
        return `<img src="${AVATAR_PATH}${file}" alt="${label || ''}" draggable="false"
            onerror="this.style.display='none';var s=this.nextElementSibling;if(s)s.style.display=''"
            style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block;">`;
    }

    function _svgFallbackInner(race) {
        return (SVG_FALLBACKS[race] || '').replace(/<svg[^>]*>/, '').replace('</svg>', '');
    }

    function defaultForRace(raceId) { return IMAGES[raceId]?.[0]?.file || null; }
    function defaultColor(raceId)   { return RACE_COLORS[raceId] || '#8a7a5a'; }

    function renderPicker(raceId, currentAvatarId, onChange) {
        const set   = IMAGES[raceId] || [];
        const count = Math.max(set.length, 1);
        const color = RACE_COLORS[raceId] || '#8a7a5a';

        const container = document.createElement('div');
        container.className = 'avatar-picker';

        for (let idx = 0; idx < count; idx++) {
            const entry      = set[idx];
            const avatarId   = entry?.file || `${raceId}:${idx}`;
            const isSelected = currentAvatarId === avatarId;

            const btn = document.createElement('div');
            btn.className    = `avatar-option${isSelected ? ' avatar-option--selected' : ''}`;
            btn.dataset.avatarId = avatarId;

            const inner = entry
                ? `${_imgTag(entry.file, entry.label)}<svg style="color:${color};display:none;width:100%;height:100%" viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">${_svgFallbackInner(raceId)}</svg>`
                : SVG_FALLBACKS[raceId]?.replace('<svg ', `<svg style="color:${color}" `) || '';

            btn.innerHTML = `<div class="avatar-option__art">${inner}</div><div class="avatar-option__label">${entry?.label || ''}</div>`;
            btn.onclick = () => {
                container.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('avatar-option--selected'));
                btn.classList.add('avatar-option--selected');
                onChange(avatarId);
            };
            container.appendChild(btn);
        }
        return container;
    }

    function renderCardBg(avatarId, color) {
        const resolved = _resolve(avatarId);
        if (!resolved) return '';
        const { race, entry } = resolved;
        const tint = color || RACE_COLORS[race] || '#8a7a5a';

        if (entry) {
            return `<div class="avatar-card-bg">${_imgTag(entry.file, entry.label)}<svg style="color:${tint};display:none;width:100%;height:100%" viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">${_svgFallbackInner(race)}</svg></div>`;
        }
        const svg = SVG_FALLBACKS[race];
        if (!svg) return '';
        return `<div class="avatar-card-bg">${svg.replace('<svg ', `<svg style="color:${tint}" `)}</div>`;
    }

    window.AVATARS = { defaultForRace, defaultColor, renderPicker, renderCardBg };

})();
