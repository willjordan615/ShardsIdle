// Color a rolled stat value relative to its base value.
// Returns a CSS color string.
function _rollColor(base, rolled) {
    if (!base || base === 0) return 'inherit';
    const ratio = rolled / base;
    if (ratio < 1.0)   return '#888888'; // gray  — below base
    if (ratio < 1.10)  return '#cccccc'; // white — at or near base
    if (ratio < 1.25)  return '#4cd964'; // green
    if (ratio < 1.50)  return '#5ab4ff'; // blue
    if (ratio < 1.80)  return '#c77dff'; // purple
    return '#ffd700';                    // gold  — exceptional
}

// Resolve display value and color for a stat, considering _rolls.
function _statDisplay(item, key, base) {
    const rolled = item._rolls?.[key];
    if (rolled == null) return { val: base, color: '#cccccc' };
    return { val: rolled, color: _rollColor(base, rolled) };
}

// Overall item quality color for the name — driven by best single-stat roll ratio.
function _itemQualityColor(item) {
    if (!item._rolls) return 'var(--gold)';
    const STAT_KEYS = ['dmg1','dmg2','dmg3','armor','phys_ev','mag_ev','hp','mana','stam','con','end','amb','har'];
    let best = 1.0;
    STAT_KEYS.forEach(k => {
        const base = item[k];
        const rolled = item._rolls[k];
        if (base && rolled) best = Math.max(best, rolled / base);
    });
    if (best < 1.10)  return '#cccccc';
    if (best < 1.25)  return '#4cd964';
    if (best < 1.50)  return '#5ab4ff';
    if (best < 1.80)  return '#c77dff';
    return '#ffd700';
}

/**
 * Create and show a tooltip for a gear item
 */
function createGearTooltip(item) {
    const tooltip = document.createElement('div');
    tooltip.className = 'gear-tooltip';
    tooltip.style.cssText = `
        position: fixed;
        z-index: 10000;
        max-width: 320px;
        min-width: 200px;
        width: max-content;
        pointer-events: none;
        box-sizing: border-box;
    `;

    const nameColor = _itemQualityColor(item);
    let content = `<div style="font-weight: 700; margin-bottom: 0.4rem; font-size: 0.9rem; color: ${nameColor}; font-family: var(--font-display); letter-spacing: 0.04em;">${item.name}</div>`;

    // Item type and tier
    content += `<div style="color: var(--text-secondary); font-size: 0.8rem; margin-bottom: 0.5rem;">`;
    content += `${item.type.toUpperCase()}`;
    if (item.tier !== undefined) content += ` • Tier ${item.tier}`;
    content += `</div>`;

    // Description
    if (item.description) {
        content += `<div style="color: var(--text-secondary); margin-bottom: 0.5rem; font-size: 0.8rem;">${item.description}</div>`;
    }

    // Damage
    if (item.dmg1) {
        const d1 = _statDisplay(item, 'dmg1', item.dmg1);
        content += `<div style="color: #ff7070; margin-top: 0.5rem;">`;
        content += `<strong>Damage:</strong> <span style="color:${d1.color}">${d1.val}</span> ${item.dmg_type_1}`;
        if (item.dmg2) {
            const d2 = _statDisplay(item, 'dmg2', item.dmg2);
            content += ` + <span style="color:${d2.color}">${d2.val}</span> ${item.dmg_type_2}`;
        }
        content += `</div>`;
    }

    // Delay
    if (item.delay !== undefined) {
        content += `<div style="color: #5ab4ff;"><strong>Delay:</strong> ${item.delay}ms</div>`;
    }

    // Armor/Defense
    if (item.armor) {
        const a = _statDisplay(item, 'armor', item.armor);
        content += `<div style="color: #4cd964;"><strong>Armor:</strong> <span style="color:${a.color}">${a.val}</span></div>`;
    }

    // Evasion
    if (item.phys_ev) {
        const ev = _statDisplay(item, 'phys_ev', item.phys_ev);
        content += `<div style="color: #4cd964;"><strong>Phys EV:</strong> <span style="color:${ev.color}">${ev.val}</span></div>`;
    }
    if (item.mag_ev) {
        const ev = _statDisplay(item, 'mag_ev', item.mag_ev);
        content += `<div style="color: #4cd964;"><strong>Mag EV:</strong> <span style="color:${ev.color}">${ev.val}</span></div>`;
    }

    // Stat bonuses
    const statBonusMap = [
        ['hp',   'HP'],
        ['mana', 'Mana'],
        ['stam', 'Stam'],
        ['con',  'CON'],
        ['end',  'END'],
        ['amb',  'AMB'],
        ['har',  'HAR'],
    ];
    const statBonuses = statBonusMap
        .filter(([key]) => item[key])
        .map(([key, label]) => {
            const d = _statDisplay(item, key, item[key]);
            return `<span style="color:${d.color}">+${d.val} ${label}</span>`;
        });

    if (statBonuses.length > 0) {
        content += `<div style="margin-top: 0.5rem;"><strong style="color:var(--gold)">Bonuses:</strong><br>${statBonuses.join(', ')}</div>`;
    }

    // On-hit effects
    if (item.onhit_skillid) {
        const skill = gameData.skills.find(s => s.id === item.onhit_skillid);
        if (skill) {
            content += `<div style="color: #ffaaaa; margin-top: 0.5rem;"><strong>On Hit:</strong> ${skill.name}`;
            if (item.onhit_chance) content += ` (${(item.onhit_chance * 100).toFixed(0)}%)`;
            content += `</div>`;
        }
    }

    // Proc effects
    const procEffects = [];
    for (let key in item) {
        if (key.startsWith('proc_') && item[key]) {
            const skillId = item[key];
            const skill = gameData.skills.find(s => s.id === skillId);
            if (skill) procEffects.push(skill.name);
        }
    }
    if (procEffects.length > 0) {
        content += `<div style="color: #ffaaaa; margin-top: 0.5rem;"><strong>Procs:</strong> ${procEffects.join(', ')}</div>`;
    }

    // Effect skill (for consumables)
    if (item.effect_skillid) {
        const skill = gameData.skills.find(s => s.id === item.effect_skillid);
        if (skill) {
            content += `<div style="color: #ffaaaa; margin-top: 0.5rem;"><strong>Effect:</strong> ${skill.name}`;
            if (item.effect_ct) content += ` (CT: ${item.effect_ct})`;
            content += `</div>`;
        }
    }

    tooltip.innerHTML = content;
    document.body.appendChild(tooltip);
    return tooltip;
}

/**
 * Position tooltip near mouse cursor or element (touch)
 */
function positionTooltip(tooltip, event, targetEl) {
    const padding = 10;
    const tw = tooltip.offsetWidth || tooltip.getBoundingClientRect().width || 300;
    const th = tooltip.offsetHeight || tooltip.getBoundingClientRect().height || 100;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x, y;

    if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        x = rect.left + (rect.width / 2) - (tw / 2);
        y = rect.bottom + 8;
        if (y + th > vh - padding) y = rect.top - th - 8;
    } else {
        x = event.clientX + padding;
        y = event.clientY + padding;
        if (x + tw > vw - padding) x = event.clientX - tw - padding;
        if (y + th > vh - padding) y = event.clientY - th - padding;
    }

    if (x + tw > vw - padding) x = vw - tw - padding;
    if (x < padding) x = padding;
    if (y + th > vh - padding) y = vh - th - padding;
    if (y < padding) y = padding;

    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
}

/**
 * GLOBAL FUNCTION: Force remove any existing gear tooltip
 * Moved outside addGearCardTooltip so inventory-system.js can access it
 */
function destroyGearTooltip() {
    const existingTooltip = document.querySelector('.gear-tooltip');
    if (existingTooltip) {
        existingTooltip.remove();
    }
}

/**
 * Global escape hatch — dismiss any stray tooltip on outside tap, click, or scroll.
 */
document.addEventListener('touchstart', (e) => {
    if (!e.target.closest('.gear-tooltip') && !e.target.closest('.skill-tooltip') && !e.target.closest('[data-gear-tooltip]')) {
        destroyGearTooltip();
        destroySkillTooltip();
    }
}, { passive: true });

document.addEventListener('scroll', () => {
    destroyGearTooltip();
    destroySkillTooltip();
}, { passive: true, capture: true });

/**
 * Add tooltip behavior to a gear card
 */
function addGearCardTooltip(cardElement, item, delay) {
    let tooltip = null;
    let tooltipTimeout = null;
    const resolvedDelay = () => delay ?? window.tooltipDelay ?? 500;

    cardElement.addEventListener('mouseenter', (e) => {
        tooltipTimeout = setTimeout(() => {
            tooltip = createGearTooltip(item);
            positionTooltip(tooltip, e, null);
        }, resolvedDelay());
    });

    cardElement.addEventListener('mousemove', (e) => {
        if (tooltip) positionTooltip(tooltip, e, null);
    });

    cardElement.addEventListener('mouseleave', () => {
        if (tooltipTimeout) clearTimeout(tooltipTimeout);
        if (tooltip) { tooltip.remove(); tooltip = null; }
    });

    cardElement.addEventListener('touchstart', (e) => {
        tooltipTimeout = setTimeout(() => {
            if (tooltip) { tooltip.remove(); tooltip = null; }
            tooltip = createGearTooltip(item);
            positionTooltip(tooltip, null, cardElement);
        }, resolvedDelay());
    }, { passive: true });

    cardElement.addEventListener('touchend', () => {
        clearTimeout(tooltipTimeout);
        if (tooltip) { tooltip.remove(); tooltip = null; }
    }, { passive: true });

    cardElement.addEventListener('touchmove', () => {
        clearTimeout(tooltipTimeout);
        if (tooltip) { tooltip.remove(); tooltip = null; }
    }, { passive: true });

    // Note: We do NOT define destroyGearTooltip here anymore. 
    // It is now global above.
}

/**
 * Force remove any existing skill tooltip
 */
function destroySkillTooltip() {
    const existing = document.querySelector('.skill-tooltip');
    if (existing) existing.remove();
}

/**
 * Create and show a tooltip for a skill
 */
function createSkillTooltip(skill) {
    const tooltip = document.createElement('div');
    tooltip.className = 'skill-tooltip';
    tooltip.style.cssText = `
        position: fixed;
        background: #16213e;
        border: 2px solid #4a9eff;
        border-radius: 4px;
        padding: 0.75rem;
        max-width: 350px;
        z-index: 10000;
        color: #4a9eff;
        font-family: 'Courier New', monospace;
        font-size: 0.85rem;
        box-shadow: 0 0 20px rgba(0, 0, 0, 0.8);
        pointer-events: none;
        word-wrap: break-word;
        white-space: normal;
    `;

    let content = `<div style="font-weight: bold; margin-bottom: 0.5rem; font-size: 0.95rem;">${skill.name}</div>`;
    content += `<div style="color: #aaa; font-size: 0.8rem; margin-bottom: 0.5rem;">${skill.category}</div>`;

    if (skill.description) {
        content += `<div style="color: #aaa; margin-bottom: 0.75rem; font-size: 0.85rem;">${skill.description}</div>`;
    }
    if (skill.costType && skill.costType !== 'none') {
        content += `<div style="color: #d4af37;"><strong>Cost:</strong> ${skill.costAmount} ${skill.costType}</div>`;
    }
    if (skill.basePower) {
        content += `<div style="color: #ff6b6b;"><strong>Power:</strong> ${skill.basePower}x</div>`;
    }
    if (skill.baseHitChance) {
        content += `<div style="color: #4eff7f;"><strong>Hit Chance:</strong> ${(skill.baseHitChance * 100).toFixed(0)}%</div>`;
    }
    if (skill.critChance) {
        content += `<div style="color: #ffd700;"><strong>Crit Chance:</strong> ${(skill.critChance * 100).toFixed(0)}%</div>`;
    }
    if (skill.delay) {
        content += `<div style="color: #4a9eff;"><strong>Delay:</strong> ${skill.delay}ms</div>`;
    }
    if (skill.hitCount) {
        if (skill.hitCount.fixed) {
            content += `<div style="color: #4eff7f;"><strong>Hits:</strong> ${skill.hitCount.fixed}</div>`;
        } else {
            content += `<div style="color: #4eff7f;"><strong>Hits:</strong> ${skill.hitCount.min}-${skill.hitCount.max}</div>`;
        }
    }
    if (skill.scalingFactors) {
        const scaling = Object.entries(skill.scalingFactors)
            .filter(([k, v]) => v > 0)
            .map(([k, v]) => `${(v * 100).toFixed(0)}% ${k}`)
            .join(', ');
        if (scaling) {
            content += `<div style="color: #d4af37; margin-top: 0.5rem;"><strong>Scaling:</strong> ${scaling}</div>`;
        }
    }
    if (skill.effects && skill.effects.length > 0) {
        content += `<div style="color: #ff9999; margin-top: 0.5rem;"><strong>Effects:</strong><br>`;
        skill.effects.forEach(effect => {
            let effectText = effect.type.toUpperCase();
            if (effect.damageType) effectText += ` (${effect.damageType})`;
            if (effect.debuff) effectText += ` - ${effect.debuff}`;
            if (effect.buff) effectText += ` - ${effect.buff}`;
            content += `• ${effectText}<br>`;
        });
        content += `</div>`;
    }

    tooltip.innerHTML = content;
    document.body.appendChild(tooltip);
    return tooltip;
}

/**
 * Add tooltip behavior to a skill card
 */
function addSkillTooltip(element, skill, delay) {
    let tooltip = null;
    let tooltipTimeout = null;
    const resolvedDelay = () => delay ?? window.tooltipDelay ?? 500;

    element.addEventListener('mouseenter', (e) => {
        tooltipTimeout = setTimeout(() => {
            tooltip = createSkillTooltip(skill);
            positionTooltip(tooltip, e, null);
        }, resolvedDelay());
    });

    element.addEventListener('mousemove', (e) => {
        if (tooltip) positionTooltip(tooltip, e, null);
    });

    element.addEventListener('mouseleave', () => {
        if (tooltipTimeout) clearTimeout(tooltipTimeout);
        if (tooltip) { tooltip.remove(); tooltip = null; }
    });

    element.addEventListener('touchstart', (e) => {
        tooltipTimeout = setTimeout(() => {
            if (tooltip) { tooltip.remove(); tooltip = null; }
            tooltip = createSkillTooltip(skill);
            positionTooltip(tooltip, null, element);
        }, resolvedDelay());
    }, { passive: true });

    element.addEventListener('touchend', () => {
        clearTimeout(tooltipTimeout);
        if (tooltip) { tooltip.remove(); tooltip = null; }
    }, { passive: true });

    element.addEventListener('touchmove', () => {
        clearTimeout(tooltipTimeout);
        if (tooltip) { tooltip.remove(); tooltip = null; }
    }, { passive: true });
}
// ── Stat tooltips ─────────────────────────────────────────────────────────────

/**
 * Stat/Attribute definitions and effects
 */
const STAT_DEFINITIONS = {
    conviction: {
        name: 'Conviction',
        description: 'Raw force of will and physical power. The primary offensive stat for fighters, bruisers, and fire, arcane, and lightning mages.',
        effects: [
            '• Increases maximum HP and Stamina',
            '• Raises hit chance on all attacks',
            '• Amplifies damage for fighter and strength-based skills',
            '• Scales fire, arcane, lightning, holy, and shadow magic',
            '• A small contributor to critical strike chance',
        ]
    },
    endurance: {
        name: 'Endurance',
        description: 'Durability and staying power. A survivability stat first — it contributes modestly to physical damage, but you do not stack it for offense.',
        effects: [
            '• Significantly increases maximum HP and Stamina',
            '• Contributes a small bonus to physical attack damage',
            '• The defining stat of bruiser-style skills (pummel, earthquake, shove)',
            '• Does not affect hit chance, crit, or magic damage',
        ]
    },
    ambition: {
        name: 'Ambition',
        description: 'Speed, cunning, and precision. The primary offensive stat for rogues and skirmishers, and for fire, arcane, and lightning mages. Also improves loot drop rates.',
        effects: [
            '• Primary driver of critical strike chance',
            '• Amplifies damage for rogue and finesse-based skills',
            '• Scales lightning, shadow, and arcane magic',
            '• Raises Mana slightly',
            '• Improves retreat success chance',
            '• Increases item drop chance (ambition 150 = +30%, ambition 300 = +60%)',
        ]
    },
    harmony: {
        name: 'Harmony',
        description: 'Attunement to magic and the natural world. The primary stat for ice, holy, and nature/poison mages — and the dominant stat for healers and supports. Also accelerates experience gain.',
        effects: [
            '• Significantly increases maximum Mana',
            '• Scales ice and cold magic damage',
            '• Scales holy magic damage',
            '• Scales nature and poison magic damage',
            '• Powers all healing and restoration skills',
            '• Increases XP earned from combat (harmony 150 = +20%, harmony 300 = +40%)',
            '• No effect on fire, arcane, lightning, or shadow damage',
        ]
    }
};

/**
 * Create and show a tooltip for a stat/attribute
 */
function createStatTooltip(statKey) {
    const stat = STAT_DEFINITIONS[statKey];
    if (!stat) return null;

    const tooltip = document.createElement('div');
    tooltip.className = 'stat-tooltip-panel gear-tooltip';
    tooltip.style.cssText = `
        position: fixed;
        z-index: 10000;
        max-width: 460px;
        min-width: 280px;
        width: max-content;
        pointer-events: none;
        box-sizing: border-box;
    `;

    let content = `<div style="font-weight: 700; margin-bottom: 0.6rem; font-size: 0.9rem; color: var(--gold); font-family: var(--font-display); letter-spacing: 0.05em;">${stat.name}</div>`;
    content += `<div style="color: var(--text-secondary); margin-bottom: 0.6rem; font-size: 0.8rem; line-height: 1.5;">${stat.description}</div>`;
    content += `<div style="color: var(--gold-dim); font-weight: 700; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 0.4rem;">Effects</div>`;
    content += `<div style="color: var(--text-secondary); line-height: 1.6; font-size: 0.8rem;">`;
    stat.effects.forEach(effect => {
        content += `<div>${effect}</div>`;
    });
    content += `</div>`;

    tooltip.innerHTML = content;
    document.body.appendChild(tooltip);
    return tooltip;
}

/**
 * Add tooltip behavior to a stat label/display element
 */
function addStatTooltip(element, statKey, delay) {
    let tooltip = null;
    let tooltipTimeout = null;
    const resolvedDelay = () => delay ?? window.tooltipDelay ?? 500;

    element.addEventListener('mouseenter', (e) => {
        element.style.cursor = 'help';
        tooltipTimeout = setTimeout(() => {
            tooltip = createStatTooltip(statKey);
            if (tooltip) positionTooltip(tooltip, e, null);
        }, resolvedDelay());
    });

    element.addEventListener('mousemove', (e) => {
        if (tooltip) positionTooltip(tooltip, e, null);
    });

    element.addEventListener('mouseleave', () => {
        if (tooltipTimeout) clearTimeout(tooltipTimeout);
        if (tooltip) { tooltip.remove(); tooltip = null; }
    });

    let touchLongPress = null;

    element.addEventListener('touchstart', (e) => {
        touchLongPress = setTimeout(() => {
            if (tooltip) { tooltip.remove(); tooltip = null; }
            tooltip = createStatTooltip(statKey);
            if (tooltip) positionTooltip(tooltip, null, element);
        }, resolvedDelay());
    }, { passive: true });

    element.addEventListener('touchend', () => {
        clearTimeout(touchLongPress);
        if (tooltip) { tooltip.remove(); tooltip = null; }
    }, { passive: true });

    element.addEventListener('touchmove', () => {
        clearTimeout(touchLongPress);
        if (tooltip) { tooltip.remove(); tooltip = null; }
    }, { passive: true });
}
