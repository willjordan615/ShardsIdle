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
function addStatTooltip(element, statKey, delay = 400) {
    let tooltip = null;
    let tooltipTimeout = null;
    
    element.addEventListener('mouseenter', (e) => {
        element.style.cursor = 'help';
        tooltipTimeout = setTimeout(() => {
            tooltip = createStatTooltip(statKey);
            if (tooltip) positionTooltip(tooltip, e, null);
        }, delay);
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
            setTimeout(() => {
                if (tooltip) { tooltip.remove(); tooltip = null; }
            }, 2500);
        }, 400);
    }, { passive: true });

    element.addEventListener('touchend', () => {
        clearTimeout(touchLongPress);
    }, { passive: true });

    element.addEventListener('touchmove', () => {
        clearTimeout(touchLongPress);
    }, { passive: true });
}