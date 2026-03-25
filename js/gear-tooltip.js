/**
 * Create and show a tooltip for a gear item
 */
function createGearTooltip(item) {
    const tooltip = document.createElement('div');
    tooltip.className = 'gear-tooltip';
    tooltip.style.cssText = `
        position: fixed; 
        background: #16213e; 
        border: 2px solid #d4af37; 
        border-radius: 4px; 
        padding: 0.75rem; 
        max-width: 300px; 
        z-index: 10000; 
        color: #d4af37; 
        font-family: 'Courier New', monospace; 
        font-size: 0.85rem; 
        box-shadow: 0 0 20px rgba(0, 0, 0, 0.8); 
        pointer-events: none; 
        word-wrap: break-word; 
        white-space: normal; 
        overflow-wrap: break-word;
    `;
    
    let content = `<div style="font-weight: bold; margin-bottom: 0.5rem; font-size: 0.95rem;">${item.name}</div>`;
    
    // Item type and tier
    content += `<div style="color: #aaa; font-size: 0.8rem; margin-bottom: 0.5rem;">`;
    content += `${item.type.toUpperCase()}`;
    if (item.tier !== undefined) content += ` • Tier ${item.tier}`;
    content += `</div>`;
    
    // Description
    if (item.description) {
        content += `<div style="color: #aaa; margin-bottom: 0.5rem; font-size: 0.8rem;">${item.description}</div>`;
    }
    
    // Damage
    if (item.dmg1) {
        content += `<div style="color: #ff6b6b; margin-top: 0.5rem;">`;
        content += `<strong>Damage:</strong> ${item.dmg1} ${item.dmg_type_1}`;
        if (item.dmg2) content += ` + ${item.dmg2} ${item.dmg_type_2}`;
        content += `</div>`;
    }
    
    // Delay
    if (item.delay !== undefined) {
        content += `<div style="color: #4a9eff;"><strong>Delay:</strong> ${item.delay}ms</div>`;
    }
    
    // Armor/Defense
    if (item.armor) {
        content += `<div style="color: #4eff7f;"><strong>Armor:</strong> ${item.armor}</div>`;
    }
    
    // Evasion
    if (item.phys_ev) {
        content += `<div style="color: #4eff7f;"><strong>Phys EV:</strong> ${item.phys_ev}</div>`;
    }
    if (item.mag_ev) {
        content += `<div style="color: #4eff7f;"><strong>Mag EV:</strong> ${item.mag_ev}</div>`;
    }
    
    // Stat bonuses
    const statBonuses = [];
    if (item.hp) statBonuses.push(`+${item.hp} HP`);
    if (item.mana) statBonuses.push(`+${item.mana} Mana`);
    if (item.con) statBonuses.push(`+${item.con} CON`);
    if (item.end) statBonuses.push(`+${item.end} END`);
    if (item.amb) statBonuses.push(`+${item.amb} AMB`);
    if (item.har) statBonuses.push(`+${item.har} HAR`);
    
    if (statBonuses.length > 0) {
        content += `<div style="color: #d4af37; margin-top: 0.5rem;"><strong>Bonuses:</strong><br>${statBonuses.join(', ')}</div>`;
    }
    
    // On-hit effects
    if (item.onhit_skillid) {
        const skill = gameData.skills.find(s => s.id === item.onhit_skillid);
        if (skill) {
            content += `<div style="color: #ff9999; margin-top: 0.5rem;"><strong>On Hit:</strong> ${skill.name}`;
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
            if (skill) {
                procEffects.push(skill.name);
            }
        }
    }
    
    if (procEffects.length > 0) {
        content += `<div style="color: #ff9999; margin-top: 0.5rem;"><strong>Procs:</strong> ${procEffects.join(', ')}</div>`;
    }
    
    // Effect skill (for consumables)
    if (item.effect_skillid) {
        const skill = gameData.skills.find(s => s.id === item.effect_skillid);
        if (skill) {
            content += `<div style="color: #ff9999; margin-top: 0.5rem;"><strong>Effect:</strong> ${skill.name}`;
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
 * Add tooltip behavior to a gear card
 */
function addGearCardTooltip(cardElement, item) {
    let tooltip = null;
    let tooltipTimeout = null;

    cardElement.addEventListener('mouseenter', (e) => {
        tooltipTimeout = setTimeout(() => {
            tooltip = createGearTooltip(item);
            positionTooltip(tooltip, e, null);
        }, 300);
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
            setTimeout(() => {
                if (tooltip) { tooltip.remove(); tooltip = null; }
            }, 2500);
        }, 400);
    }, { passive: true });

    cardElement.addEventListener('touchend', () => {
        clearTimeout(tooltipTimeout);
    }, { passive: true });

    cardElement.addEventListener('touchmove', () => {
        clearTimeout(tooltipTimeout);
    }, { passive: true });
    });
    
    // Note: We do NOT define destroyGearTooltip here anymore. 
    // It is now global above.
}