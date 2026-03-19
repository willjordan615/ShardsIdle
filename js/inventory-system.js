// inventory-system.js
// Equipment swap, consumable stash/belt management, and item selling.

// ── Helpers ───────────────────────────────────────────────────────────────────

function _safeStash(character) {
    if (!character.consumableStash || typeof character.consumableStash !== 'object')
        character.consumableStash = {};
    return character.consumableStash;
}
function _safeBelt(character) {
    if (!character.consumables || typeof character.consumables !== 'object')
        character.consumables = {};
    return character.consumables;
}
function _safeInventory(character) {
    if (!Array.isArray(character.inventory)) character.inventory = [];
    return character.inventory;
}
function _safeGold(character) {
    if (character.gold == null) character.gold = 0;
    return character.gold;
}
function _safeDust(character) {
    if (character.arcaneDust == null) character.arcaneDust = 0;
    return character.arcaneDust;
}

function _goldValue(itemDef) {
    if (!itemDef) return 5;
    return itemDef.goldValue || ((itemDef.tier || 0) * 8 + 5);
}
function _dustYield(gold) {
    return parseFloat((gold * 0.01).toFixed(4));
}

const GEAR_SLOTS = ['mainHand','offHand','head','chest','accessory1','accessory2'];
const SLOT_LABELS = {
    mainHand:'Main Hand', offHand:'Off Hand', head:'Head',
    chest:'Chest', accessory1:'Accessory 1', accessory2:'Accessory 2'
};

function _itemSlot(itemDef) {
    return itemDef?.slot_id1 || itemDef?.slot || '';
}

function _isGear(itemDef) {
    return itemDef && GEAR_SLOTS.includes(_itemSlot(itemDef));
}

function _isConsumable(itemDef) {
    return itemDef && (_itemSlot(itemDef) === 'consumable' || itemDef.consumable === true);
}

function _itemDef(itemId) {
    return window.gameData?.gear?.find(g => g.id === itemId)
        || window.gameData?.consumables?.find(g => g.id === itemId);
}

function _rarityColor(rarity) {
    return { legendary:'#ffaa00', rare:'#00d4ff', uncommon:'#4eff7f', common:'#aaa' }[rarity] || '#aaa';
}

// ── Equipment Swap Modal ───────────────────────────────────────────────────────

async function showEquipmentSwap() {
    const character = await getCharacter(currentState.detailCharacterId);
    if (!character) return;

    _safeInventory(character);
    _safeStash(character);
    _safeBelt(character);
    _safeGold(character);
    _safeDust(character);

    // One-time migration: old consumables → stash
    const belt = _safeBelt(character);
    const stash = _safeStash(character);
    if (Object.keys(belt).length > 0 && Object.keys(stash).length === 0) {
        Object.assign(stash, belt);
        character.consumables = {};
        await saveCharacterToServer(character);
    }

    _renderEquipmentModal(character);
    showModal('equipmentSwapModal');
}

function _renderEquipmentModal(character) {
    const modal = document.getElementById('equipmentSwapModal');
    if (!modal) return;

    const inventory = _safeInventory(character);

    // Build inventory gear grouped by slot
    const bySlot = {};
    GEAR_SLOTS.forEach(s => bySlot[s] = []);
    inventory.forEach((inv, idx) => {
        if (!inv) return;
        const def = _itemDef(inv.itemID);
        const slot = _itemSlot(def);
        if (GEAR_SLOTS.includes(slot)) bySlot[slot].push({ inv, idx, def });
    });

    // Quest / misc items
    const miscItems = inventory.filter((inv, idx) => {
        if (!inv) return false;
        const def = _itemDef(inv.itemID);
        return !_isGear(def) && !_isConsumable(def);
    });

    const html = `
    <div style="display:flex; flex-direction:column; height:100%;">
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-shrink:0;">
            <h3 style="margin:0; color:#ffd700;">⚔ Equipment & Inventory</h3>
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="color:#d4af37; font-size:0.85rem;">💰 ${character.gold.toFixed(0)}g</span>
                <span style="color:#8888ff; font-size:0.85rem;">✨ ${character.arcaneDust.toFixed(2)} dust</span>
                <button onclick="closeEquipmentSwap()" style="padding:4px 12px; background:#4a2a2a; color:#fff; border:none; border-radius:4px; cursor:pointer;">✕ Close</button>
            </div>
        </div>

        <!-- Three columns -->
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; overflow:hidden; flex:1;">

            <!-- Column 1: Equipped -->
            <div style="display:flex; flex-direction:column; overflow:hidden;">
                <div style="color:#888; font-size:0.75rem; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px; flex-shrink:0;">Equipped</div>
                <div style="overflow-y:auto; flex:1;">
                    ${GEAR_SLOTS.map(slot => {
                        const itemId = character.equipment?.[slot];
                        const def = itemId ? _itemDef(itemId) : null;
                        if (def) {
                            const bonuses = _statBonuses(def);
                            return `<div class="inv-card inv-equipped" onclick="unequipItemNew('${character.id}','${slot}')" title="Click to unequip">
                                <div style="color:#888; font-size:0.7rem;">${SLOT_LABELS[slot]}</div>
                                <div style="color:#d4af37; font-weight:500; font-size:0.85rem;">${def.name}</div>
                                ${def.dmg1 ? `<div style="color:#ff6b6b; font-size:0.75rem;">Dmg: ${def.dmg1} ${def.dmg_type_1||''}</div>` : ''}
                                ${def.armor ? `<div style="color:#4eff7f; font-size:0.75rem;">Armor: ${def.armor}</div>` : ''}
                                ${bonuses ? `<div style="color:#aaa; font-size:0.72rem;">${bonuses}</div>` : ''}
                                <div style="color:#d44; font-size:0.7rem; margin-top:3px;">↩ Unequip</div>
                            </div>`;
                        } else {
                            return `<div class="inv-card inv-empty-slot">
                                <div style="color:#888; font-size:0.7rem;">${SLOT_LABELS[slot]}</div>
                                <div style="color:#444; font-size:0.8rem; font-style:italic;">Empty</div>
                            </div>`;
                        }
                    }).join('')}
                </div>
            </div>

            <!-- Column 2: Inventory gear (click to equip) -->
            <div style="display:flex; flex-direction:column; overflow:hidden;">
                <div style="color:#888; font-size:0.75rem; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px; flex-shrink:0;">Inventory</div>
                <div style="overflow-y:auto; flex:1;" id="invGearList">
                    ${GEAR_SLOTS.map(slot => {
                        const items = bySlot[slot];
                        if (!items.length) return '';
                        return `<div style="color:#4a9eff; font-size:0.7rem; letter-spacing:1px; margin:6px 0 3px; text-transform:uppercase;">${SLOT_LABELS[slot]}</div>`
                            + items.map(({inv, idx, def}) => {
                                const rc = _rarityColor(inv.rarity);
                                const bonuses = _statBonuses(def);
                                const equipped = Object.values(character.equipment||{}).includes(inv.itemID);
                                const dupeBadge = equipped ? '<span style="color:#ff8800; font-size:0.65rem;"> DUPE</span>' : '';
                                return `<div class="inv-card inv-gear" onclick="equipItemNew('${character.id}','${inv.itemID}',${idx})" title="Click to equip">
                                    <div style="color:${rc}; font-weight:500; font-size:0.85rem;">${def?.name || inv.itemID}${dupeBadge}</div>
                                    ${def?.dmg1 ? `<div style="color:#ff6b6b; font-size:0.75rem;">Dmg: ${def.dmg1} ${def.dmg_type_1||''}</div>` : ''}
                                    ${def?.armor ? `<div style="color:#4eff7f; font-size:0.75rem;">Armor: ${def.armor}</div>` : ''}
                                    ${bonuses ? `<div style="color:#aaa; font-size:0.72rem;">${bonuses}</div>` : ''}
                                    <div style="color:#4a9eff; font-size:0.7rem; margin-top:3px;">↑ Equip</div>
                                </div>`;
                            }).join('');
                    }).join('')}
                    ${miscItems.length ? `
                        <div style="color:#888; font-size:0.7rem; letter-spacing:1px; margin:6px 0 3px; text-transform:uppercase;">Other</div>
                        ${miscItems.map((inv) => {
                            const def = _itemDef(inv.itemID);
                            const realIdx = inventory.indexOf(inv);
                            return `<div class="inv-card" style="border-color:#333;">
                                <div style="color:#aaa; font-size:0.85rem;">${def?.name || inv.itemID}</div>
                                <div style="color:#555; font-size:0.72rem; font-style:italic;">Quest item</div>
                                <button onclick="deleteInventoryItem('${character.id}',${realIdx})" style="margin-top:4px; font-size:0.7rem; padding:2px 6px; background:#4a1a1a; color:#ff6b6b; border:none; border-radius:3px; cursor:pointer;">🗑 Delete</button>
                            </div>`;
                        }).join('')}` : ''}
                    ${Object.values(bySlot).every(a => !a.length) && !miscItems.length ?
                        '<p style="color:#555; font-style:italic; font-size:0.82rem; text-align:center; padding:1rem 0;">No items in inventory</p>' : ''}
                </div>
            </div>

            <!-- Column 3: Sell -->
            <div style="display:flex; flex-direction:column; overflow:hidden;">
                <div style="color:#888; font-size:0.75rem; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px; flex-shrink:0;">Sell</div>
                <div style="overflow-y:auto; flex:1;">
                    ${inventory.filter(inv => inv && _isGear(_itemDef(inv.itemID))).map((inv, listIdx) => {
                        const def = _itemDef(inv.itemID);
                        const realIdx = inventory.indexOf(inv);
                        const g = _goldValue(def);
                        const d = _dustYield(g);
                        const rc = _rarityColor(inv.rarity);
                        return `<div class="inv-card" style="border-color:#2a3a2a;">
                            <div style="color:${rc}; font-size:0.82rem; font-weight:500;">${def?.name || inv.itemID}</div>
                            <div style="color:#888; font-size:0.72rem;">${g}g · ${d.toFixed(2)} dust</div>
                            <button onclick="sellInventoryItem('${character.id}',${realIdx})" style="margin-top:4px; font-size:0.7rem; padding:2px 8px; background:#2a3a1a; color:#4eff7f; border:1px solid #3a5a2a; border-radius:3px; cursor:pointer;">💰 Sell</button>
                        </div>`;
                    }).join('')}
                    ${!inventory.some(inv => inv && _isGear(_itemDef(inv.itemID))) ?
                        '<p style="color:#555; font-style:italic; font-size:0.82rem; text-align:center; padding:1rem 0;">Nothing to sell</p>' : ''}

                    <!-- Consumable stash sell section -->
                    <div style="color:#888; font-size:0.7rem; letter-spacing:1px; margin:10px 0 4px; text-transform:uppercase; border-top:1px solid #222; padding-top:8px;">Consumables</div>
                    ${Object.entries(_safeStash(character)).filter(([,qty]) => qty > 0).map(([id, qty]) => {
                        const def = _itemDef(id);
                        return `<div class="inv-card" style="border-color:#2a2a3a;">
                            <div style="color:#aaa; font-size:0.82rem;">${def?.name || id} <span style="color:#666;">x${qty}</span></div>
                            <div style="color:#888; font-size:0.72rem;">1g each</div>
                            <button onclick="sellConsumableFromStash('${character.id}','${id}')" style="margin-top:4px; font-size:0.7rem; padding:2px 8px; background:#2a2a3a; color:#aaa; border:1px solid #444; border-radius:3px; cursor:pointer;">💰 Sell 1</button>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        </div>
    </div>`;

    // Inject into modal inner div
    const inner = modal.querySelector('div');
    if (inner) inner.innerHTML = html;
}

function _statBonuses(def) {
    if (!def) return '';
    const parts = [];
    if (def.hp)  parts.push(`+${def.hp} HP`);
    if (def.mana) parts.push(`+${def.mana} MP`);
    if (def.con) parts.push(`+${def.con} CON`);
    if (def.end) parts.push(`+${def.end} END`);
    if (def.amb) parts.push(`+${def.amb} AMB`);
    if (def.har) parts.push(`+${def.har} HAR`);
    return parts.join(' ');
}

// ── Equip / Unequip ───────────────────────────────────────────────────────────

async function equipItemNew(characterId, itemId, inventoryIndex) {
    if (typeof destroyGearTooltip === 'function') destroyGearTooltip();
    const character = await getCharacter(characterId);
    if (!character) return;

    const def = _itemDef(itemId);
    if (!def) return;

    const slot = _itemSlot(def);
    let targetSlot = slot;
    if (!GEAR_SLOTS.includes(targetSlot)) {
        if (['ring','amulet','cloak','belt','accessory'].includes(slot) || def.type === 'accessory') {
            targetSlot = character.equipment?.accessory1 ? 'accessory2' : 'accessory1';
        } else {
            targetSlot = 'mainHand';
        }
    }

    // Move currently equipped item to inventory
    const currentId = character.equipment?.[targetSlot];
    if (currentId) {
        _safeInventory(character).push({ itemID: currentId, rarity: 'common', acquiredAt: Date.now() });
    }

    // Remove from inventory
    _safeInventory(character).splice(inventoryIndex, 1);
    character.equipment[targetSlot] = itemId;
    character.lastModified = Date.now();

    await saveCharacterToServer(character);
    await showCharacterDetail(character.id);
    await showEquipmentSwap();
    if (typeof destroyGearTooltip === 'function') destroyGearTooltip();
    if (typeof showSuccess === 'function') showSuccess(`${def.name} equipped to ${SLOT_LABELS[targetSlot]}.`);
}

async function unequipItemNew(characterId, slot) {
    if (typeof destroyGearTooltip === 'function') destroyGearTooltip();
    const character = await getCharacter(characterId);
    if (!character) return;

    const itemId = character.equipment?.[slot];
    if (!itemId) return;

    _safeInventory(character).push({ itemID: itemId, rarity: 'common', acquiredAt: Date.now() });
    character.equipment[slot] = null;
    character.lastModified = Date.now();

    await saveCharacterToServer(character);
    await showCharacterDetail(character.id);
    await showEquipmentSwap();
    if (typeof destroyGearTooltip === 'function') destroyGearTooltip();
    if (typeof showSuccess === 'function') showSuccess('Item unequipped.');
}

// Keep old names as aliases so any existing onclick attributes still work
async function equipItem(character, itemId, inventoryIndex) {
    await equipItemNew(character.id, itemId, inventoryIndex);
}
async function unequipItem(character, slot) {
    await unequipItemNew(character.id, slot);
}

// ── Selling ───────────────────────────────────────────────────────────────────

async function sellInventoryItem(characterId, inventoryIndex) {
    const character = await getCharacter(characterId);
    if (!character) return;

    const inv = _safeInventory(character)[inventoryIndex];
    if (!inv) return;

    const def = _itemDef(inv.itemID);
    const g = _goldValue(def);
    const d = _dustYield(g);

    character.gold      = parseFloat(((_safeGold(character)) + g).toFixed(2));
    character.arcaneDust = parseFloat(((_safeDust(character)) + d).toFixed(4));
    character.inventory.splice(inventoryIndex, 1);
    character.lastModified = Date.now();

    await saveCharacterToServer(character);
    await showCharacterDetail(character.id);
    await showEquipmentSwap();
    if (typeof showSuccess === 'function') showSuccess(`Sold ${def?.name || inv.itemID} for ${g}g (+${d.toFixed(2)} dust).`);
}

async function sellConsumableFromStash(characterId, itemId) {
    const character = await getCharacter(characterId);
    if (!character) return;

    const stash = _safeStash(character);
    if (!stash[itemId] || stash[itemId] <= 0) return;

    stash[itemId]--;
    if (stash[itemId] === 0) delete stash[itemId];

    character.gold = parseFloat(((_safeGold(character)) + 1).toFixed(2));
    // 1gp per consumable; dust at 1/100gp ratio
    character.arcaneDust = parseFloat(((_safeDust(character)) + 0.01).toFixed(4));
    character.lastModified = Date.now();

    await saveCharacterToServer(character);
    await showCharacterDetail(character.id);
    await showEquipmentSwap();
    const def = _itemDef(itemId);
    if (typeof showSuccess === 'function') showSuccess(`Sold ${def?.name || itemId} for 1g.`);
}

async function deleteInventoryItem(characterId, inventoryIndex) {
    const character = await getCharacter(characterId);
    if (!character) return;

    const inv = _safeInventory(character)[inventoryIndex];
    if (!inv) return;

    const def = _itemDef(inv.itemID);
    if (!confirm(`Delete ${def?.name || inv.itemID}? This cannot be undone.`)) return;

    character.inventory.splice(inventoryIndex, 1);
    character.lastModified = Date.now();

    await saveCharacterToServer(character);
    await showCharacterDetail(character.id);
    await showEquipmentSwap();
    if (typeof showSuccess === 'function') showSuccess('Item deleted.');
}

// ── Consumable Belt Modal ─────────────────────────────────────────────────────

async function showConsumableManagement() {
    const character = await getCharacter(currentState.detailCharacterId);
    if (!character) return;

    _safeStash(character);
    _safeBelt(character);

    // One-time migration
    const belt = _safeBelt(character);
    const stash = _safeStash(character);
    if (Object.keys(belt).length > 0 && Object.keys(stash).length === 0) {
        Object.assign(stash, belt);
        character.consumables = {};
        await saveCharacterToServer(character);
    }

    _renderConsumableModal(character);
    showModal('consumableModal');
}

function _renderConsumableModal(character) {
    const availableList = document.getElementById('availableConsumablesList');
    const beltList      = document.getElementById('beltList');
    if (!availableList || !beltList) return;

    const stash = _safeStash(character);
    const belt  = _safeBelt(character);

    availableList.innerHTML = '';
    beltList.innerHTML = '';

    // Stash items
    const stashEntries = Object.entries(stash).filter(([, qty]) => qty > 0);
    if (stashEntries.length === 0) {
        availableList.innerHTML = '<p style="color:#8b7355; text-align:center; font-size:0.85rem;">Stash is empty</p>';
    } else {
        stashEntries.forEach(([id, qty]) => {
            const def = _itemDef(id);
            const card = document.createElement('div');
            card.className = 'card';
            card.style.cursor = 'pointer';
            card.innerHTML = `
                <div class="card-title" style="font-size:0.9rem;">${def?.name || id}</div>
                <div class="card-description">Stash: ${qty}</div>
                <div style="color:#4a9eff; font-size:0.75rem; margin-top:4px;">↑ Add to belt</div>
            `;
            card.onclick = async () => {
                const fresh = await getCharacter(character.id);
                await addConsumableToBelt(fresh, id);
            };
            availableList.appendChild(card);
        });
    }

    // Belt slots
    let beltCount = 0;
    Object.entries(belt).filter(([, qty]) => qty > 0).slice(0, 4).forEach(([id, qty]) => {
        const def = _itemDef(id);
        const slot = document.createElement('div');
        slot.className = 'consumable-slot filled';
        slot.innerHTML = `
            <div style="flex:1;">
                <div class="consumable-name">${def?.name || id}</div>
                <div style="font-size:0.75rem; color:#888;">x${qty} equipped</div>
            </div>
            <button onclick="removeConsumableFromBelt('${character.id}','${id}')"
                class="danger" style="padding:0.25rem 0.5rem; font-size:0.7rem;">Remove</button>
        `;
        beltList.appendChild(slot);
        beltCount++;
    });
    while (beltCount < 4) {
        const slot = document.createElement('div');
        slot.className = 'consumable-slot';
        slot.innerHTML = '<div style="color:#8b7355; font-size:0.85rem;">Empty slot</div>';
        beltList.appendChild(slot);
        beltCount++;
    }
}

async function addConsumableToBelt(character, consumableId) {
    const stash = _safeStash(character);
    const belt  = _safeBelt(character);

    if (!stash[consumableId] || stash[consumableId] <= 0) {
        if (typeof showError === 'function') showError('Item not in stash.');
        return;
    }
    const beltCount = Object.values(belt).filter(qty => qty > 0).length;
    if (beltCount >= 4) {
        if (typeof showError === 'function') showError('Belt is full! Remove an item first.');
        return;
    }

    stash[consumableId]--;
    if (stash[consumableId] <= 0) delete stash[consumableId];
    belt[consumableId] = (belt[consumableId] || 0) + 1;
    character.lastModified = Date.now();

    await saveCharacterToServer(character);
    await showCharacterDetail(character.id);
    await showConsumableManagement();
}

async function removeConsumableFromBelt(characterId, consumableId) {
    const character = await getCharacter(characterId);
    if (!character) return;

    const belt  = _safeBelt(character);
    const stash = _safeStash(character);

    if (!belt[consumableId] || belt[consumableId] <= 0) return;

    belt[consumableId]--;
    if (belt[consumableId] <= 0) delete belt[consumableId];
    stash[consumableId] = (stash[consumableId] || 0) + 1;
    character.lastModified = Date.now();

    await saveCharacterToServer(character);
    await showCharacterDetail(character.id);
    await showConsumableManagement();
}

function closeEquipmentSwap() {
    if (typeof destroyGearTooltip === 'function') destroyGearTooltip();
    closeModal('equipmentSwapModal');
}

function closeConsumableManagement() {
    closeModal('consumableModal');
}
