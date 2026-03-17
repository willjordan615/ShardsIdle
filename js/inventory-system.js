/**
 * Show equipment management modal
 */
async function showEquipmentSwap() {
    const character = await getCharacter(currentState.detailCharacterId);
    if (!character) return;
    
    const equippedList = document.getElementById('equippedList');
    const inventoryList = document.getElementById('inventoryList');
    
    equippedList.innerHTML = '';
    inventoryList.innerHTML = '';
    
    // Display equipped items
    const slots = ['mainHand', 'offHand', 'head', 'chest', 'accessory1', 'accessory2'];
    slots.forEach(slot => {
        const itemId = character.equipment[slot];
        if (itemId) {
            const item = gameData.gear.find(g => g.id === itemId);
            if (item) {
                const card = document.createElement('div');
                card.className = 'card';
                card.style.cursor = 'pointer';
                
                // Build detailed content for equipped items
                let content = `
                    <div class="card-title">${item.name}</div>
                    <div class="card-subtitle">${slot}</div>
                `;
                
                // Add stats summary
                if (item.dmg1) {
                    content += `<div style="color: #ff6b6b; font-size: 0.85rem; margin-top: 0.25rem;">Dmg: ${item.dmg1} ${item.dmg_type_1}${item.dmg2 ? '+' + item.dmg2 : ''}</div>`;
                }
                if (item.armor) {
                    content += `<div style="color: #4eff7f; font-size: 0.85rem;">Armor: ${item.armor}</div>`;
                }
                
                // Add bonuses
                const bonuses = [];
                if (item.hp) bonuses.push(`+${item.hp} HP`);
                if (item.mana) bonuses.push(`+${item.mana} Mana`);
                if (item.con) bonuses.push(`+${item.con} CON`);
                if (item.end) bonuses.push(`+${item.end} END`);
                if (item.amb) bonuses.push(`+${item.amb} AMB`);
                if (item.har) bonuses.push(`+${item.har} HAR`);
                
                if (bonuses.length > 0) {
                    content += `<div style="color: #d4af37; font-size: 0.8rem; margin-top: 0.25rem;">${bonuses.join(', ')}</div>`;
                }

                card.innerHTML = content;
                card.onclick = async () => await unequipItem(character, slot);
                addGearCardTooltip(card, item);
                equippedList.appendChild(card);
            }
        } else {
            // Show empty slot placeholder
            const emptyCard = document.createElement('div');
            emptyCard.className = 'card';
            emptyCard.style.opacity = '0.5';
            emptyCard.innerHTML = `
                <div class="card-title" style="color: #8b7355;">(Empty)</div>
                <div class="card-subtitle">${slot}</div>
            `;
            equippedList.appendChild(emptyCard);
        }
    });
    
    // Display inventory items
    const inventory = character.inventory || [];
    inventory.forEach((invItem, idx) => {
        const item = gameData.gear.find(g => g.id === invItem.itemID);
        if (item) {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.cursor = 'pointer';
            
            // Build detailed content for inventory items
            let content = `
                <div class="card-title">${item.name}</div>
                <div class="card-subtitle">${item.type}</div>
            `;

            // Add stats summary
            if (item.dmg1) {
                content += `<div style="color: #ff6b6b; font-size: 0.85rem; margin-top: 0.25rem;">Dmg: ${item.dmg1} ${item.dmg_type_1}${item.dmg2 ? '+' + item.dmg2 : ''}</div>`;
            }
            if (item.armor) {
                content += `<div style="color: #4eff7f; font-size: 0.85rem;">Armor: ${item.armor}</div>`;
            }
            if (item.delay) {
                content += `<div style="color: #4a9eff; font-size: 0.85rem;">Delay: ${item.delay}ms</div>`;
            }
            
            // Add bonuses
            const bonuses = [];
            if (item.hp) bonuses.push(`+${item.hp} HP`);
            if (item.mana) bonuses.push(`+${item.mana} Mana`);
            if (item.con) bonuses.push(`+${item.con} CON`);
            if (item.end) bonuses.push(`+${item.end} END`);
            if (item.amb) bonuses.push(`+${item.amb} AMB`);
            if (item.har) bonuses.push(`+${item.har} HAR`);
            
            if (bonuses.length > 0) {
                content += `<div style="color: #d4af37; font-size: 0.8rem; margin-top: 0.25rem;">${bonuses.join(', ')}</div>`;
            }

            card.innerHTML = content;
            card.onclick = async () => await equipItem(character, invItem.itemID, idx);
            addGearCardTooltip(card, item);
            inventoryList.appendChild(card);
        }
    });
    
    if (inventory.length === 0) {
        inventoryList.innerHTML = '<p style="color: #8b7355; text-align: center; padding: 1rem;">No items in inventory</p>';
    }
    
    showModal('equipmentSwapModal');
}

/**
 * Equip an item from inventory
 */
async function equipItem(character, itemId, inventoryIndex) {
    // ✅ FIX: Force close any open tooltips immediately upon click
    if (typeof destroyGearTooltip === 'function') {
        destroyGearTooltip();
    }

    const item = gameData.gear.find(g => g.id === itemId);
    if (!item) return;
    
    // Determine which slot to equip to based on item type
    let targetSlot = 'mainHand';  // Default
    if (item.type === 'shield' || item.slot_id1 === 'offHand') {
        targetSlot = 'offHand';
    } else if (['head', 'circlet', 'helm', 'chain', 'plate', 'cloth', 'leather', 'robe', 'vestments'].includes(item.type)) {
        targetSlot = 'head';
    } else if (['chest', 'cuirass', 'chain', 'plate', 'cloth', 'leather', 'robe', 'vestments'].includes(item.type)) {
        targetSlot = 'chest';
    } else if (item.type.includes('ring') || item.type === 'amulet' || item.type === 'cloak' || item.type === 'belt') {
        // Use first available accessory slot
        targetSlot = character.equipment.accessory1 ? 'accessory2' : 'accessory1';
    }
    
    // Unequip current item in target slot if one exists
    if (character.equipment[targetSlot]) {
        const currentItemId = character.equipment[targetSlot];
        character.inventory = character.inventory || [];
        character.inventory.push({ 
            itemID: currentItemId, 
            acquiredAt: Date.now() 
        });
    }
    
    // Remove from inventory by index (more reliable than filtering)
    character.inventory.splice(inventoryIndex, 1);
    
    // Equip item
    character.equipment[targetSlot] = itemId;
    character.lastModified = Date.now();
    
    await saveCharacterToServer(character);
    await showCharacterDetail(character.id);
    closeModal('equipmentSwapModal');

    // Destroy tooltip after DOM rebuilds
    if (typeof destroyGearTooltip === 'function') destroyGearTooltip();

    showSuccess(`${item.name} equipped!`);
}


/**
 * Unequip an item
 */
async function unequipItem(character, slot) {
    // Force close any open tooltips immediately upon click
    if (typeof destroyGearTooltip === 'function') destroyGearTooltip();

    const itemId = character.equipment[slot];
    if (!itemId) return;
    
    character.inventory = character.inventory || [];
    character.inventory.push({ 
        itemID: itemId, 
        acquiredAt: Date.now() 
    });
    
    character.equipment[slot] = null;
    character.lastModified = Date.now();
    
    await saveCharacterToServer(character);
    await showCharacterDetail(character.id);
    await showEquipmentSwap();

    // Destroy again after DOM rebuilds — mouse may still be hovering
    // over the same position, triggering a new tooltip on the redrawn card
    if (typeof destroyGearTooltip === 'function') destroyGearTooltip();

    showSuccess('Item unequipped');
}

/**
 * Show consumable management modal
 */
async function showConsumableManagement() {
    const character = await getCharacter(currentState.detailCharacterId);
    if (!character) return;
    
    const availableList = document.getElementById('availableConsumablesList');
    const beltList = document.getElementById('beltList');
    
    availableList.innerHTML = '';
    beltList.innerHTML = '';
    
    const consumableSlots = character.consumables || {};
    
    // Show available consumables (not on belt)
    gameData.consumables.forEach(consumable => {
        const qty = consumableSlots[consumable.id] || 0;
        if (qty > 0) {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.cursor = 'pointer';
            card.innerHTML = `
                <div class="card-title">${consumable.name}</div>
                <div class="card-description">Available: ${qty}</div>
            `;
            card.onclick = async () => await addConsumableToBelt(character, consumable.id);
            availableList.appendChild(card);
        }
    });
    
    if (availableList.innerHTML === '') {
        availableList.innerHTML = '<p style="color: #8b7355; text-align: center;">No consumables available</p>';
    }
    
    // Show belt items
    let beltCount = 0;
    for (let consumableId in consumableSlots) {
        if (beltCount < 4 && consumableSlots[consumableId] > 0) {
            const consumable = getConsumable(consumableId);
            if (consumable) {
                const card = document.createElement('div');
                card.className = 'consumable-slot filled';
                card.innerHTML = `
                    <div style="flex: 1;">
                        <div class="consumable-name">${consumable.name}</div>
                    </div>
                    <button onclick="removeConsumableFromBelt('${currentState.detailCharacterId}', '${consumableId}')" class="danger" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;">Remove</button>
                `;
                beltList.appendChild(card);
                beltCount++;
            }
        }
    }
    
    // Fill remaining belt slots
    while (beltCount < 4) {
        const slot = document.createElement('div');
        slot.className = 'consumable-slot';
        slot.innerHTML = '<div style="color: #8b7355;">Empty</div>';
        beltList.appendChild(slot);
        beltCount++;
    }
    
    showModal('consumableModal');
}

/**
 * Add consumable to belt (move from inventory)
 */
async function addConsumableToBelt(character, consumableId) {
    if (!character.consumables) character.consumables = {};
    
    // Count items already on belt
    const beltCount = Object.keys(character.consumables).filter(id => 
        character.consumables[id] > 0
    ).length;
    
    if (beltCount >= 4) {
        showError('Belt is full! Remove an item first.');
        return;
    }
    
    // Move from inventory to belt
    character.consumables[consumableId] = (character.consumables[consumableId] || 0) + 1;
    character.lastModified = Date.now();
    
    await saveCharacterToServer(character);
    await showCharacterDetail(character.id);
    await showConsumableManagement();
}

/**
 * Remove consumable from belt (return to inventory)
 */
async function removeConsumableFromBelt(characterId, consumableId) {
    const character = await getCharacter(characterId);
    if (!character) return;
    
    if (!character.consumables) character.consumables = {};
    if (!character.consumables[consumableId]) character.consumables[consumableId] = 0;
    
    // Move back to inventory
    character.consumables[consumableId]--;
    if (character.consumables[consumableId] <= 0) {
        delete character.consumables[consumableId];
    }
    
    character.lastModified = Date.now();
    
    await saveCharacterToServer(character);
    await showCharacterDetail(character.id);
    await showConsumableManagement();
}

/**
Close equipment swap modal
*/
function closeEquipmentSwap() {
    // ✅ FIX: Clean up tooltips when closing the modal manually
    if (typeof destroyGearTooltip === 'function') {
        destroyGearTooltip();
    }
    closeModal('equipmentSwapModal');
}

/**
 * Close consumable management modal
 */
function closeConsumableManagement() {
    closeModal('consumableModal');
}