/**
 * Stat/Attribute definitions and effects
 */
const STAT_DEFINITIONS = {
    conviction: {
        name: 'Conviction',
        description: 'Strength of will and magical power. Core stat for damage, spellcasting, and utility.',
        effects: [
            '• Scales physical and magical damage skills',
            '• Powers utility and detection abilities',
            '• Enhances spell potency and effects',
            '• Increases magical skill effectiveness'
        ]
    },
    endurance: {
        name: 'Endurance',
        description: 'Physical toughness and stamina. Governs defense, durability, and recovery.',
        effects: [
            '• Increases maximum health (HP)',
            '• Increases armor rating',
            '• Increases stamina pool',
            '• Scales defensive and blocking abilities',
            '• Powers stamina restoration and recovery skills'
        ]
    },
    ambition: {
        name: 'Ambition',
        description: 'Cunning and decisive action. Governs critical strikes, evasion, initiative, and loot acquisition.',
        effects: [
            '• Scales with damage for precision and crit chance',
            '• Increases evasion and dodge chance',
            '• Determines combat initiative order',
            '• Affects loot rarity and drop chance',
            '• Powers cunning and evasion-based skills'
        ]
    },
    harmony: {
        name: 'Harmony',
        description: 'Inner balance and healing affinity. Scales support, healing, and group benefits.',
        effects: [
            '• Scales healing spell power',
            '• Scales support and buff abilities',
            '• Powers group assistance skills',
            '• Enhances status recovery and restoration',
            '• Increases healing received from all sources'
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
    tooltip.className = 'stat-tooltip';
    tooltip.style.cssText = `
        position: fixed;
        background: #16213e;
        border: 2px solid #d4af37;
        border-radius: 4px;
        padding: 1rem;
        max-width: 400px;
        width: auto;
        z-index: 10000;
        color: #d4af37;
        font-family: 'Courier New', monospace;
        font-size: 0.85rem;
        box-shadow: 0 0 20px rgba(0, 0, 0, 0.8);
        pointer-events: none;
        word-wrap: break-word;
        white-space: normal;
        overflow-wrap: break-word;
        box-sizing: border-box;
    `;
    
    let content = `<div style="font-weight: bold; margin-bottom: 0.75rem; font-size: 1rem; color: #d4af37;">${stat.name}</div>`;
    content += `<div style="color: #aaa; margin-bottom: 0.75rem; font-size: 0.85rem;">${stat.description}</div>`;
    content += `<div style="color: #4eff7f; font-weight: bold; margin-bottom: 0.5rem;">Effects:</div>`;
    content += `<div style="color: #888; line-height: 1.5;">`;
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
            if (tooltip) {
                positionTooltip(tooltip, e);
            }
        }, delay);
    });
    
    element.addEventListener('mousemove', (e) => {
        if (tooltip) {
            positionTooltip(tooltip, e);
        }
    });
    
    element.addEventListener('mouseleave', () => {
        if (tooltipTimeout) clearTimeout(tooltipTimeout);
        if (tooltip) {
            tooltip.remove();
            tooltip = null;
        }
    });
}