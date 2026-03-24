// inventory-system.js — Gear slots + belt slots inline on detail screen.
// Gear modal opens filtered to the clicked slot. Belt dropdowns inline.

// ── Null-safe helpers ─────────────────────────────────────────────────────────
function _safeStash(c)     { if (!c.consumableStash || typeof c.consumableStash !== 'object') c.consumableStash = {}; return c.consumableStash; }
function _safeBelt(c)      { if (!c.consumables    || typeof c.consumables    !== 'object') c.consumables    = {}; return c.consumables; }
function _safeInventory(c) { if (!Array.isArray(c.inventory)) c.inventory = []; return c.inventory; }
function _safeGold(c)      { if (c.gold       == null) c.gold       = 0; return c.gold; }
function _safeDust(c)      { if (c.arcaneDust == null) c.arcaneDust = 0; return c.arcaneDust; }

function _safeBeltOrder(c) {
    if (!Array.isArray(c.beltOrder) || c.beltOrder.length !== 4)
        c.beltOrder = [null, null, null, null];
    return c.beltOrder;
}

function _goldValue(def)   { return def ? (def.goldValue || ((def.tier || 0) * 8 + 5)) : 5; }
function _dustYield(g)     { return parseFloat((g * 0.01).toFixed(4)); }

const GEAR_SLOTS  = ['mainHand','offHand','head','chest','accessory1','accessory2'];
const SLOT_LABELS = { mainHand:'Main Hand', offHand:'Off Hand', head:'Head', chest:'Chest', accessory1:'Accessory 1', accessory2:'Accessory 2' };

function _itemSlot(def)    { return def?.slot_id1 || def?.slot || ''; }
function _isGear(def)      { return def && GEAR_SLOTS.includes(_itemSlot(def)); }
function _isConsumable(def){ return def && (_itemSlot(def) === 'consumable' || def.consumable === true); }
function _itemDef(id)      {
    return window.gameData?.gear?.find(g => g.id === id)
        || window.gameData?.gear?.find(g => g.id === id && g.type === 'consumable');
}
function _rarityColor(r)   { return { legendary:'#ffaa00', rare:'#00d4ff', uncommon:'#4eff7f', common:'#aaa' }[r] || '#aaa'; }
function _statBonuses(def) {
    if (!def) return '';
    const p = [];
    if (def.hp)   p.push(`+${def.hp} HP`);
    if (def.mana) p.push(`+${def.mana} MP`);
    if (def.con)  p.push(`+${def.con} CON`);
    if (def.end)  p.push(`+${def.end} END`);
    if (def.amb)  p.push(`+${def.amb} AMB`);
    if (def.har)  p.push(`+${def.har} HAR`);
    return p.join(' · ');
}

// ── One-time belt migration ───────────────────────────────────────────────────
function _migrateBelt(character) {
    const belt  = _safeBelt(character);
    const stash = _safeStash(character);
    const order = _safeBeltOrder(character);

    // One-time: move old belt contents to stash
    if (Object.keys(belt).length > 0 && Object.keys(stash).length === 0) {
        Object.assign(stash, belt);
        character.consumables = {};
    }

    // Sync beltOrder → consumables: ensure consumables only contains items in beltOrder
    // and rebuild consumables from beltOrder counts
    const newBelt = {};
    order.forEach(itemId => {
        if (itemId) newBelt[itemId] = (newBelt[itemId] || 0) + 1;
    });
    character.consumables = newBelt;
}

// ── Inline gear slot panel ────────────────────────────────────────────────────

window.renderGearSlots = function(character) {
    const el = document.getElementById('gearSlotDisplay');
    if (!el) return;
    const eq = character.equipment || {};

    el.innerHTML = GEAR_SLOTS.map(slot => {
        const itemId = eq[slot];
        const def    = itemId ? _itemDef(itemId) : null;
        const filled = !!def;
        const sub    = filled
            ? [def.dmg1 ? `${def.dmg1} ${def.dmg_type_1||''}`.trim() : null,
               def.armor ? `${def.armor} armor` : null,
               _statBonuses(def) || null].filter(Boolean).join(' · ')
            : null;

        return `<div class="loadout-slot ${filled ? 'loadout-slot--filled' : 'loadout-slot--empty'}"
                     onclick="openGearModal('${slot}')" title="${filled ? 'Click to change' : 'Click to equip'}">
            <span class="loadout-slot__label">${SLOT_LABELS[slot]}</span>
            <span class="loadout-slot__item">${filled ? def.name : '—'}</span>
            ${sub ? `<span class="loadout-slot__sub">${sub}</span>` : ''}
        </div>`;
    }).join('');
};

// ── Inline belt slot panel ────────────────────────────────────────────────────

window.renderBeltSlots = function(character) {
    const el = document.getElementById('beltSlotDisplay');
    if (!el) return;
    _safeStash(character); _safeBelt(character); _safeBeltOrder(character);
    _migrateBelt(character);

    const order = character.beltOrder;   // [itemId|null, ...] length 4
    const stash = character.consumableStash;
    const stashOptions = Object.entries(stash).filter(([, qty]) => qty > 0);

    el.innerHTML = [0, 1, 2, 3].map(i => {
        const itemId = order[i] || null;
        const def    = itemId ? _itemDef(itemId) : null;
        const qty    = itemId ? (character.consumables[itemId] || 0) : 0;
        const filled = !!itemId;

        // Dropdown: all stash items (items already in other belt slots still show)
        const opts = stashOptions
            .map(([id, q]) => {
                const d = _itemDef(id);
                return `<option value="${id}">${d?.name || id} ×${q}</option>`;
            }).join('');

        return `<div class="loadout-slot ${filled ? 'loadout-slot--filled' : 'loadout-slot--empty'} loadout-slot--belt" style="position:relative; cursor:pointer;">
            <span class="loadout-slot__label">Slot ${i + 1}</span>
            <span class="loadout-slot__item">${filled ? def?.name || itemId : '—'}</span>
            ${filled ? `<span class="loadout-slot__sub">×${qty} &nbsp;
                <span class="loadout-slot__remove" style="position:relative; z-index:2;"
                      onclick="clearBeltSlot('${character.id}','${itemId}'); event.stopPropagation();">✕</span>
            </span>` : ''}
            <select style="position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; z-index:1; font-size:16px;"
                    onchange="setBeltSlot('${character.id}',${i},this.value); this.value='';">
                <option value="">—</option>
                ${opts}
            </select>
        </div>`;
    }).join('');
};

// ── Gear modal (filtered by slot) ────────────────────────────────────────────

let _activeGearSlot = null;

window.openGearModal = async function(slot) {
    _activeGearSlot = slot || null;
    const character = await getCharacter(currentState.detailCharacterId);
    if (!character) return;
    _safeInventory(character); _safeStash(character); _safeBelt(character);
    _safeGold(character); _safeDust(character);
    _migrateBelt(character);
    _renderGearModal(character, slot);
    const modal = document.getElementById('inventoryModal');
    if (modal) modal.style.display = 'flex';
};

window.showInventory = async function(slot) {
    await openGearModal(slot || null);
};

window.closeInventory = function() {
    if (typeof destroyGearTooltip === 'function') destroyGearTooltip();
    const modal = document.getElementById('inventoryModal');
    if (modal) modal.style.display = 'none';
    _activeGearSlot = null;
};

// Legacy aliases
window.showEquipmentSwap    = window.showInventory;
window.closeEquipmentSwap   = window.closeInventory;
window.showConsumableManagement  = window.showInventory;
window.closeConsumableManagement = window.closeInventory;

// ── Gear modal renderer ───────────────────────────────────────────────────────

function _renderGearModal(character, activeSlot) {
    const inner = document.getElementById('inventoryModalInner');
    if (!inner) return;

    const inventory = _safeInventory(character);

    // Build inventory gear grouped by slot
    const bySlot = {};
    GEAR_SLOTS.forEach(s => bySlot[s] = []);
    inventory.forEach((inv, idx) => {
        if (!inv) return;
        const def = _itemDef(inv.itemID);
        if (_isGear(def)) bySlot[_itemSlot(def)].push({ inv, idx, def });
    });

    const miscItems = inventory.filter(inv => {
        if (!inv) return false;
        const def = _itemDef(inv.itemID);
        return !_isGear(def) && !_isConsumable(def);
    });

    // Which slots to show in inventory column — filtered if slot active
    const visibleSlots = activeSlot ? [activeSlot] : GEAR_SLOTS;
    const hasInventoryItems = visibleSlots.some(s => bySlot[s]?.length) || (!activeSlot && miscItems.length);

    // Slot filter tabs
    const filterTabs = `
        <div style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:10px; flex-shrink:0;">
            <button onclick="_renderGearModal(window._currentModalChar, null)"
                style="font-size:0.72rem; padding:2px 8px; border-radius:3px; cursor:pointer;
                       background:${!activeSlot?'#2a4a6a':'#111'}; color:${!activeSlot?'#d4af37':'#666'};
                       border:1px solid ${!activeSlot?'#d4af37':'#333'};">All</button>
            ${GEAR_SLOTS.map(s => `
                <button onclick="_renderGearModal(window._currentModalChar, '${s}')"
                    style="font-size:0.72rem; padding:2px 8px; border-radius:3px; cursor:pointer;
                           background:${activeSlot===s?'#2a4a6a':'#111'}; color:${activeSlot===s?'#d4af37':'#666'};
                           border:1px solid ${activeSlot===s?'#d4af37':'#333'};">${SLOT_LABELS[s]}</button>
            `).join('')}
        </div>`;

    // Store ref for tab clicks
    window._currentModalChar = character;

    inner.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-shrink:0;">
        <div style="display:flex; align-items:center; gap:12px;">
            <h3 style="margin:0; color:#ffd700;">⚔ Gear Management</h3>
            <span style="color:#d4af37; font-size:0.82rem;">💰 ${character.gold.toFixed(0)}g</span>
            <span style="color:#8888ff; font-size:0.82rem;">✨ ${character.arcaneDust.toFixed(2)} dust</span>
        </div>
        <button onclick="closeInventory()" style="padding:4px 12px; background:#4a2a2a; color:#fff; border:none; border-radius:4px; cursor:pointer;">✕ Close</button>
    </div>

    ${filterTabs}

    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; overflow:hidden; flex:1; min-height:0;">

        <!-- Equipped -->
        <div style="display:flex; flex-direction:column; overflow:hidden;">
            <div style="color:#888; font-size:0.72rem; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px; flex-shrink:0;">Equipped</div>
            <div style="overflow-y:auto; flex:1;">
                ${visibleSlots.map(slot => {
                    const itemId = character.equipment?.[slot];
                    const def = itemId ? _itemDef(itemId) : null;
                    if (def) {
                        return `<div class="inv-card inv-equipped" onclick="unequipItemNew('${character.id}','${slot}')" title="Click to unequip">
                            <div style="color:#555; font-size:0.68rem;">${SLOT_LABELS[slot]}</div>
                            <div style="color:#d4af37; font-size:0.82rem; font-weight:500;">${def.name}</div>
                            ${def.dmg1  ? `<div style="color:#ff6b6b; font-size:0.72rem;">${def.dmg1} ${def.dmg_type_1||''}</div>` : ''}
                            ${def.armor ? `<div style="color:#4eff7f; font-size:0.72rem;">Armor: ${def.armor}</div>` : ''}
                            ${_statBonuses(def) ? `<div style="color:#aaa; font-size:0.7rem;">${_statBonuses(def)}</div>` : ''}
                            <div style="color:#d44; font-size:0.68rem; margin-top:2px;">↩ Unequip</div>
                        </div>`;
                    } else {
                        return `<div class="inv-card inv-empty-slot">
                            <div style="color:#555; font-size:0.68rem;">${SLOT_LABELS[slot]}</div>
                            <div style="color:#333; font-size:0.78rem; font-style:italic;">Empty</div>
                        </div>`;
                    }
                }).join('')}
            </div>
        </div>

        <!-- Inventory -->
        <div style="display:flex; flex-direction:column; overflow:hidden;">
            <div style="color:#888; font-size:0.72rem; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px; flex-shrink:0;">Inventory</div>
            <div style="overflow-y:auto; flex:1;">
                ${visibleSlots.map(slot => {
                    const items = bySlot[slot] || [];
                    if (!items.length) return '';
                    const header = visibleSlots.length > 1
                        ? `<div style="color:#4a9eff; font-size:0.68rem; letter-spacing:1px; margin:5px 0 2px; text-transform:uppercase;">${SLOT_LABELS[slot]}</div>`
                        : '';
                    return header + items.map(({inv, idx, def}) =>
                        `<div class="inv-card inv-gear" onclick="equipItemNew('${character.id}','${inv.itemID}',${idx})" title="Click to equip">
                            <div style="color:${_rarityColor(inv.rarity)}; font-size:0.82rem; font-weight:500;">${def?.name || inv.itemID}</div>
                            ${def?.dmg1  ? `<div style="color:#ff6b6b; font-size:0.72rem;">${def.dmg1} ${def.dmg_type_1||''}</div>` : ''}
                            ${def?.armor ? `<div style="color:#4eff7f; font-size:0.72rem;">Armor: ${def.armor}</div>` : ''}
                            ${_statBonuses(def) ? `<div style="color:#aaa; font-size:0.7rem;">${_statBonuses(def)}</div>` : ''}
                            <div style="color:#4a9eff; font-size:0.68rem; margin-top:2px;">↑ Equip</div>
                        </div>`
                    ).join('');
                }).join('')}
                ${!activeSlot && miscItems.map(inv => {
                    const def = _itemDef(inv.itemID);
                    const ri  = inventory.indexOf(inv);
                    return `<div class="inv-card" style="border-color:#333;">
                        <div style="color:#aaa; font-size:0.82rem;">${def?.name || inv.itemID}</div>
                        <div style="color:#555; font-size:0.7rem; font-style:italic;">Quest item</div>
                        <button onclick="deleteInventoryItem('${character.id}',${ri})" style="margin-top:3px; font-size:0.68rem; padding:2px 6px; background:#4a1a1a; color:#ff6b6b; border:none; border-radius:3px; cursor:pointer;">🗑 Delete</button>
                    </div>`;
                }).join('')}
                ${!hasInventoryItems ? '<p style="color:#444; font-style:italic; font-size:0.8rem; text-align:center; padding:1rem 0;">No items for this slot</p>' : ''}
            </div>
        </div>

        <!-- Sell -->
        <div style="display:flex; flex-direction:column; overflow:hidden;">
            <div style="color:#888; font-size:0.72rem; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px; flex-shrink:0;">Sell</div>
            <div style="overflow-y:auto; flex:1;">
                ${inventory.filter(inv => {
                    if (!inv) return false;
                    const def = _itemDef(inv.itemID);
                    if (!_isGear(def)) return false;
                    return !activeSlot || _itemSlot(def) === activeSlot;
                }).map(inv => {
                    const def = _itemDef(inv.itemID);
                    const ri  = inventory.indexOf(inv);
                    const g   = _goldValue(def);
                    const d   = _dustYield(g);
                    return `<div class="inv-card" style="border-color:#2a3a2a;">
                        <div style="color:${_rarityColor(inv.rarity)}; font-size:0.8rem; font-weight:500;">${def?.name || inv.itemID}</div>
                        <div style="color:#666; font-size:0.7rem;">${g}g · ${d.toFixed(2)} dust</div>
                        <button onclick="sellInventoryItem('${character.id}',${ri})" style="margin-top:3px; font-size:0.68rem; padding:2px 8px; background:#2a3a1a; color:#4eff7f; border:1px solid #3a5a2a; border-radius:3px; cursor:pointer;">💰 Sell</button>
                    </div>`;
                }).join('')}
                ${!inventory.some(inv => inv && _isGear(_itemDef(inv.itemID)) && (!activeSlot || _itemSlot(_itemDef(inv.itemID)) === activeSlot))
                    ? '<p style="color:#444; font-style:italic; font-size:0.8rem; text-align:center; padding:0.5rem 0;">Nothing to sell</p>' : ''}
            </div>
        </div>
    </div>`;
}

// ── Belt slot actions ─────────────────────────────────────────────────────────

window.setBeltSlot = async function(characterId, slotIdx, itemId) {
    if (!itemId) return;
    const character = await getCharacter(characterId);
    if (!character) return;
    _safeStash(character); _safeBelt(character); _safeBeltOrder(character);
    _migrateBelt(character);

    const order = character.beltOrder;
    const stash = character.consumableStash;

    // If this slot already has this item, do nothing
    if (order[slotIdx] === itemId) return;

    // If slot has a different item, return it to stash first
    const prevId = order[slotIdx];
    if (prevId) {
        stash[prevId] = (parseInt(stash[prevId]) || 0) + 1;
    }

    // Check stash has the item
    const avail = parseInt(stash[itemId]) || 0;
    if (avail <= 0) {
        if (typeof showError === 'function') showError('Not enough in stash.');
        renderBeltSlots(character);
        return;
    }

    // Assign to slot
    stash[itemId] = avail - 1;
    if (stash[itemId] <= 0) delete stash[itemId];
    order[slotIdx] = itemId;

    // Rebuild consumables from beltOrder
    const newBelt = {};
    order.forEach(id => { if (id) newBelt[id] = (newBelt[id] || 0) + 1; });
    character.consumables = newBelt;
    character.lastModified = Date.now();

    await saveCharacterToServer(character);
    renderBeltSlots(character);
    renderGearSlots(character);
};

window.clearBeltSlot = async function(characterId, itemId) {
    const character = await getCharacter(characterId);
    if (!character) return;
    _safeStash(character); _safeBelt(character); _safeBeltOrder(character);
    _migrateBelt(character);

    const order = character.beltOrder;
    const stash = character.consumableStash;

    // Find and clear all slots containing this item
    let returned = 0;
    order.forEach((id, i) => {
        if (id === itemId) { order[i] = null; returned++; }
    });
    if (returned > 0) {
        stash[itemId] = (parseInt(stash[itemId]) || 0) + returned;
    }

    // Rebuild consumables from beltOrder
    const newBelt = {};
    order.forEach(id => { if (id) newBelt[id] = (newBelt[id] || 0) + 1; });
    character.consumables = newBelt;
    character.lastModified = Date.now();

    await saveCharacterToServer(character);
    renderBeltSlots(character);
    renderGearSlots(character);
};

// ── Equip / Unequip ───────────────────────────────────────────────────────────
async function equipItemNew(characterId, itemId, inventoryIndex) {
    if (typeof destroyGearTooltip === 'function') destroyGearTooltip();
    
    const character = await getCharacter(characterId);
    if (!character) return;
    
    const def = _itemDef(itemId);
    if (!def) return;

    // 1. Determine primary slot from item definition
    let targetSlot = _itemSlot(def);
    const slotId2 = def?.slot_id2;

    // 2. If item supports a secondary slot (e.g. accessories), check occupancy
    if (slotId2 && GEAR_SLOTS.includes(slotId2)) {
        // If primary slot is occupied...
        if (character.equipment?.[targetSlot]) {
            // ...check if secondary slot is free
            if (!character.equipment?.[slotId2]) {
                targetSlot = slotId2; // Equip to secondary
            } else {
                // Both slots occupied
                if (typeof showError === 'function') showError('Both accessory slots are occupied.');
                return; // Stop execution
            }
        }
    } 
    // 3. Fallback for items with invalid slot definitions (legacy support)
    else if (!GEAR_SLOTS.includes(targetSlot)) {
        targetSlot = character.equipment?.accessory1 ? 'accessory2' : 'accessory1';
    }

    // 4. Perform Swap (Move current equipment to inventory)
    const currentId = character.equipment?.[targetSlot];
    if (currentId) {
        _safeInventory(character).push({ itemID: currentId, rarity: 'common', acquiredAt: Date.now() });
    }

    // 5. Equip New Item
    _safeInventory(character).splice(inventoryIndex, 1);
    character.equipment[targetSlot] = itemId;
    character.lastModified = Date.now();

    // 6. Save & Refresh
    await saveCharacterToServer(character);
    await showCharacterDetail(character.id);
    _renderGearModal(character, _activeGearSlot);
    if (typeof showSuccess === 'function') showSuccess(`${def.name} equipped.`);
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
    _renderGearModal(character, _activeGearSlot);
    if (typeof showSuccess === 'function') showSuccess('Item unequipped.');
}

async function equipItem(character, itemId, idx) { await equipItemNew(character.id, itemId, idx); }
async function unequipItem(character, slot)       { await unequipItemNew(character.id, slot); }

// ── Sell / Delete ─────────────────────────────────────────────────────────────

async function sellInventoryItem(characterId, inventoryIndex) {
    const character = await getCharacter(characterId);
    if (!character) return;
    const inv = _safeInventory(character)[inventoryIndex];
    if (!inv) return;
    const def = _itemDef(inv.itemID);
    const g = _goldValue(def);
    const d = _dustYield(g);
    character.gold       = parseFloat((_safeGold(character) + g).toFixed(2));
    character.arcaneDust = parseFloat((_safeDust(character) + d).toFixed(4));
    character.inventory.splice(inventoryIndex, 1);
    character.lastModified = Date.now();
    await saveCharacterToServer(character);
    await showCharacterDetail(character.id);
    _renderGearModal(character, _activeGearSlot);
    if (typeof showSuccess === 'function') showSuccess(`Sold ${def?.name || inv.itemID} for ${g}g.`);
}

async function sellConsumableFromStash(characterId, itemId) {
    const character = await getCharacter(characterId);
    if (!character) return;
    const stash = _safeStash(character);
    if (!stash[itemId] || stash[itemId] <= 0) return;
    stash[itemId]--;
    if (stash[itemId] === 0) delete stash[itemId];
    character.gold       = parseFloat((_safeGold(character) + 1).toFixed(2));
    character.arcaneDust = parseFloat((_safeDust(character) + 0.01).toFixed(4));
    character.lastModified = Date.now();
    await saveCharacterToServer(character);
    renderBeltSlots(character);
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
    _renderGearModal(character, _activeGearSlot);
    if (typeof showSuccess === 'function') showSuccess('Item deleted.');
}

// ── Wire into showCharacterDetail ─────────────────────────────────────────────

window.renderLoadoutSummary = function(character) {
    _safeStash(character); _safeBelt(character);
    _migrateBelt(character);
    renderGearSlots(character);
    renderBeltSlots(character);
};
