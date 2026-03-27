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

    // Ensure consumables has an entry for every item in beltOrder.
    // Does NOT overwrite existing counts — stack quantities are now authoritative.
    order.forEach(itemId => {
        if (itemId && !(itemId in character.consumables)) {
            character.consumables[itemId] = 1;
        }
    });

    // Remove consumables entries for items no longer in beltOrder
    const inOrder = new Set(order.filter(Boolean));
    Object.keys(character.consumables).forEach(id => {
        if (!inOrder.has(id)) delete character.consumables[id];
    });
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

        return `<div class="loadout-slot ${filled ? 'loadout-slot--filled' : 'loadout-slot--empty'}"
                     onclick="openGearModal('${slot}')" title="${filled ? 'Click to change' : 'Click to equip'}">
            <span class="loadout-slot__label">${SLOT_LABELS[slot]}</span>
            <span class="loadout-slot__item">${filled ? def.name : '—'}</span>
        </div>`;
    }).join('');
};

// ── Inline belt slot panel ────────────────────────────────────────────────────

window.renderBeltSlots = function(character) {
    const el = document.getElementById('beltSlotDisplay');
    if (!el) return;
    _safeStash(character); _safeBelt(character); _safeBeltOrder(character);
    _migrateBelt(character);

    const order = character.beltOrder;

    el.innerHTML = [0, 1, 2, 3].map(i => {
        const itemId = order[i] || null;
        const def    = itemId ? _itemDef(itemId) : null;
        const qty    = itemId ? (character.consumables[itemId] || 0) : 0;
        const filled = !!itemId;

        const sub = filled
            ? `×${qty}${def?.description ? ` — ${def.description}` : ''}`
            : null;

        return `<div class="loadout-slot ${filled ? 'loadout-slot--filled' : 'loadout-slot--empty'} loadout-slot--belt"
                     onclick="openBeltModal('${character.id}', ${i})" title="Click to manage belt slot">
            <span class="loadout-slot__label">Slot ${i + 1}</span>
            <span class="loadout-slot__item">${filled ? (def?.name || itemId) : '—'}</span>
            ${sub ? `<span class="loadout-slot__sub" style="white-space:normal; line-height:1.3;">${sub}</span>` : ''}
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
    _activeGearSlot   = null;
    _activeBeltSlot   = null;
    _activeBeltCharId = null;
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
    window._currentModalChar = character;

    const inventory = _safeInventory(character);
    const eq        = character.equipment || {};

    // Build inventory gear grouped by slot
    const bySlot = {};
    GEAR_SLOTS.forEach(s => bySlot[s] = []);
    inventory.forEach((inv, idx) => {
        if (!inv) return;
        const _baseDef = _itemDef(inv.itemID);
        if (!_isGear(_baseDef)) return;
        // Merge instance-level flavour (name/description from loot tag system) onto a copy
        const def = (inv.itemName || inv.itemDescription)
            ? { ..._baseDef, name: inv.itemName || _baseDef?.name, description: inv.itemDescription || _baseDef?.description }
            : _baseDef;
        const slot1 = _itemSlot(def);
        const slot2 = def?.slot_id2;
        if (slot1 && GEAR_SLOTS.includes(slot1)) bySlot[slot1].push({ inv, idx, def });
        if (slot2 && GEAR_SLOTS.includes(slot2) && slot2 !== slot1) bySlot[slot2].push({ inv, idx, def });
    });

    const visibleSlots = activeSlot ? [activeSlot] : GEAR_SLOTS;

    // ── Header ────────────────────────────────────────────────────────────────
    const header = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-sm); flex-shrink:0;">
            <div style="display:flex; align-items:center; gap:var(--space-md);">
                <h3 style="margin:0; font-size:0.88rem; letter-spacing:0.08em;">GEAR MANAGEMENT</h3>
                <span style="color:var(--gold); font-size:0.78rem;">&#128176; ${character.gold.toFixed(0)}g</span>
                <span style="color:#8888ff; font-size:0.78rem;">&#10022; ${character.arcaneDust.toFixed(2)} dust</span>
            </div>
            <button class="secondary" onclick="closeInventory()" style="padding:3px 10px; font-size:0.72rem;">&#10005; Close</button>
        </div>`;

    // ── Filter tabs ───────────────────────────────────────────────────────────
    const tabs = `
        <div class="inv-tabs">
            <button class="inv-tab ${!activeSlot ? 'inv-tab--active' : ''}"
                    onclick="_renderGearModal(window._currentModalChar, null)">All</button>
            ${GEAR_SLOTS.map(s => `
                <button class="inv-tab ${activeSlot === s ? 'inv-tab--active' : ''}"
                        onclick="_renderGearModal(window._currentModalChar, '${s}')">${SLOT_LABELS[s]}</button>
            `).join('')}
        </div>`;

    // ── Item list ─────────────────────────────────────────────────────────────
    let rows = '';
    let anyItem = false;

    visibleSlots.forEach(slot => {
        const equippedId  = eq[slot];
        const equippedDef = equippedId ? _itemDef(equippedId) : null;
        const invItems    = bySlot[slot] || [];
        const hasContent  = equippedDef || invItems.length > 0;

        if (visibleSlots.length > 1 && !hasContent) return;

        rows += `<div class="inv-slot-header">${SLOT_LABELS[slot]}</div>`;

        // Equipped row
        if (equippedDef) {
            anyItem = true;
            const stats = [
                equippedDef.dmg1 ? `${equippedDef.dmg1} ${equippedDef.dmg_type_1 || ''}`.trim() : null,
                equippedDef.armor ? `${equippedDef.armor} armor` : null,
                _statBonuses(equippedDef) || null,
            ].filter(Boolean).join(' · ');
            rows += `
                <div class="inv-item inv-item--equipped">
                    <div class="inv-item__info">
                        <div class="inv-item__name">${equippedDef.name}</div>
                        ${stats ? `<div class="inv-item__stats">${stats}</div>` : ''}
                    </div>
                    <div class="inv-item__actions">
                        <button class="inv-btn inv-btn--unequip"
                                onclick="unequipItemNew('${character.id}','${slot}')">Unequip</button>
                    </div>
                </div>`;
        } else {
            rows += `<div class="inv-item inv-item--empty"><div class="inv-item__info"><div class="inv-item__name">Empty</div></div></div>`;
        }

        // Inventory rows for this slot
        invItems.forEach(({ inv, idx, def }) => {
            anyItem = true;
            const g = _goldValue(def);
            const stats = [
                def?.dmg1 ? `${def.dmg1} ${def.dmg_type_1 || ''}`.trim() : null,
                def?.armor ? `${def.armor} armor` : null,
                _statBonuses(def) || null,
            ].filter(Boolean).join(' · ');
            rows += `
                <div class="inv-item">
                    <div class="inv-item__info">
                        <div class="inv-item__name" style="color:${_rarityColor(inv.rarity)};">${inv.itemName || def?.name || inv.itemID}</div>
                        ${stats ? `<div class="inv-item__stats">${stats}</div>` : ''}
                    </div>
                    <div class="inv-item__actions">
                        <button class="inv-btn inv-btn--equip"
                                onclick="equipItemNew('${character.id}','${inv.itemID}',${idx})">Equip</button>
                        <button class="inv-btn inv-btn--sell"
                                onclick="sellInventoryItem('${character.id}',${idx})">${g}g</button>
                    </div>
                </div>`;
        });
    });

    if (!anyItem) {
        rows = '<div class="inv-empty-msg">Nothing here.</div>';
    }

    inner.innerHTML = header + tabs + `<div class="inv-list">${rows}</div>`;
}


// ── Belt modal ────────────────────────────────────────────────────────────────

let _activeBeltSlot = null;
let _activeBeltCharId = null;

window.openBeltModal = async function(characterId, slotIdx) {
    _activeBeltSlot   = slotIdx ?? null;
    _activeBeltCharId = characterId;
    const character = await getCharacter(characterId);
    if (!character) return;
    _safeStash(character); _safeBelt(character); _safeBeltOrder(character);
    _migrateBelt(character);
    _renderBeltModal(character, slotIdx);
    const modal = document.getElementById('inventoryModal');
    if (modal) modal.style.display = 'flex';
};

function _consumableEffectLine(def) {
    if (!def) return '';
    const sid = def.skillID;
    if (!sid) return '';
    const skill = window.gameData?.skills?.find(s => s.id === sid);
    if (!skill) return '';
    const effects = skill.effects || [];
    if (!effects.length) return '';

    const targetLabel = { self: 'self', single_ally: 'one ally', all_allies: 'all allies',
                          single_enemy: 'one enemy', all_enemies: 'all enemies' };
    const resourceLabel = { hp: 'HP', health: 'HP', mana: 'MP', stamina: 'Stamina', stamina: 'Stamina' };

    const parts = effects.map(e => {
        const tgt = targetLabel[e.targets] || e.targets || '';
        const pct = e.magnitude ? `${Math.round(e.magnitude * 100)}%` : '';
        const dur = e.duration  ? ` for ${e.duration} turn${e.duration > 1 ? 's' : ''}` : '';

        switch (e.type) {
            case 'heal':
                return `Restores ${pct} HP (${tgt})`;
            case 'restore_resource': {
                const res = resourceLabel[e.resource] || e.resource || 'resource';
                return `Restores ${pct} ${res} (${tgt})`;
            }
            case 'apply_buff': {
                const buffName = e.buff ? e.buff.replace(/_/g, ' ') : 'buff';
                return pct
                    ? `Applies ${buffName} +${pct}${dur} (${tgt})`
                    : `Applies ${buffName}${dur} (${tgt})`;
            }
            case 'apply_debuff': {
                const debuffName = e.debuff ? e.debuff.replace(/_/g, ' ') : 'debuff';
                const chance = e.chance && e.chance < 1 ? ` (${Math.round(e.chance * 100)}% chance)` : '';
                return `Applies ${debuffName}${dur}${chance} (${tgt})`;
            }
            case 'damage': {
                const dmgType = e.damageType ? ` ${e.damageType}` : '';
                return `Deals ${pct}${dmgType} damage (${tgt})`;
            }
            case 'utility':
                return e.utility ? e.utility.replace(/_/g, ' ') : 'utility effect';
            default:
                return '';
        }
    }).filter(Boolean);

    return parts.join(' · ');
}

function _renderBeltModal(character, activeSlot) {
    const inner = document.getElementById('inventoryModalInner');
    if (!inner) return;
    window._currentModalChar = character;

    const order = character.beltOrder;
    const stash = character.consumableStash;

    const header = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-sm); flex-shrink:0;">
            <h3 style="margin:0; font-size:0.88rem; letter-spacing:0.08em;">BELT MANAGEMENT</h3>
            <button class="secondary" onclick="closeInventory()" style="padding:3px 10px; font-size:0.72rem;">&#10005; Close</button>
        </div>`;

    // Slot tabs
    const tabs = `
        <div class="inv-tabs">
            ${[0,1,2,3].map(i => {
                const id  = order[i];
                const def = id ? _itemDef(id) : null;
                return `<button class="inv-tab ${activeSlot === i ? 'inv-tab--active' : ''}"
                                onclick="_renderBeltModal(window._currentModalChar, ${i})">
                    Slot ${i + 1}${def ? ` — ${def.name}` : ''}
                </button>`;
            }).join('')}
        </div>`;

    const slotItemId  = order[activeSlot] ?? null;
    const slotDef     = slotItemId ? _itemDef(slotItemId) : null;
    const slotQty     = slotItemId ? (character.consumables[slotItemId] || 0) : 0;

    let rows = '';

    // Equipped row
    if (slotDef) {
        const slotEffect = _consumableEffectLine(slotDef);
        rows += `
            <div class="inv-slot-header">Equipped</div>
            <div class="inv-item inv-item--equipped">
                <div class="inv-item__info">
                    <div class="inv-item__name">×${slotQty} ${slotDef.name}</div>
                    ${slotDef.description ? `<div class="inv-item__stats">${slotDef.description}</div>` : ''}
                    ${slotEffect ? `<div class="inv-item__stats" style="color:#a0d4ff; margin-top:2px;">${slotEffect}</div>` : ''}
                </div>
                <div class="inv-item__actions">
                    <button class="inv-btn inv-btn--unequip"
                            onclick="clearBeltSlot('${character.id}', '${slotItemId}', ${activeSlot})">Unequip</button>
                </div>
            </div>`;
    }

    // Stash rows
    const stashEntries = Object.entries(stash).filter(([, q]) => q > 0);
    if (stashEntries.length > 0) {
        rows += `<div class="inv-slot-header">Available</div>`;
        stashEntries.forEach(([itemId, qty]) => {
            const def = _itemDef(itemId);
            if (!def) return;
            const isEquippedHere = slotItemId === itemId;
            const effectLine = _consumableEffectLine(def);
            rows += `
                <div class="inv-item ${isEquippedHere ? 'inv-item--equipped' : ''}">
                    <div class="inv-item__info">
                        <div class="inv-item__name">×${qty} ${def.name}</div>
                        ${def.description ? `<div class="inv-item__stats">${def.description}</div>` : ''}
                        ${effectLine ? `<div class="inv-item__stats" style="color:#a0d4ff; margin-top:2px;">${effectLine}</div>` : ''}
                    </div>
                    <div class="inv-item__actions">
                        ${!isEquippedHere
                            ? `<button class="inv-btn inv-btn--equip"
                                       onclick="setBeltSlot('${character.id}', ${activeSlot}, '${itemId}')">Equip ×${qty}</button>`
                            : ''}
                    </div>
                </div>`;
        });
    }

    if (!slotDef && stashEntries.length === 0) {
        rows = '<div class="inv-empty-msg">No consumables in stash.</div>';
    }

    inner.innerHTML = header + tabs + `<div class="inv-list">${rows}</div>`;
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

    // Return displaced stack to stash first
    const prevId = order[slotIdx];
    if (prevId && prevId !== itemId) {
        const prevQty = character.consumables[prevId] || 0;
        stash[prevId] = (parseInt(stash[prevId]) || 0) + prevQty;
        delete character.consumables[prevId];
    }

    // Check stash has the item
    const avail = parseInt(stash[itemId]) || 0;
    if (avail <= 0) {
        if (typeof showError === 'function') showError('Not in stash.');
        return;
    }

    // Move full stack from stash to belt slot
    order[slotIdx] = itemId;
    character.consumables[itemId] = avail;
    delete stash[itemId];

    character.lastModified = Date.now();
    await saveCharacterToServer(character);
    renderBeltSlots(character);
    _renderBeltModal(character, slotIdx);
};

window.clearBeltSlot = async function(characterId, itemId, slotIdx) {
    const character = await getCharacter(characterId);
    if (!character) return;
    _safeStash(character); _safeBelt(character); _safeBeltOrder(character);
    _migrateBelt(character);

    const order = character.beltOrder;
    const stash = character.consumableStash;

    // Return full stack to stash
    const qty = character.consumables[itemId] || 0;
    if (qty > 0) stash[itemId] = (parseInt(stash[itemId]) || 0) + qty;
    delete character.consumables[itemId];

    // Clear all slots holding this item (normally just one)
    order.forEach((id, i) => { if (id === itemId) order[i] = null; });

    character.lastModified = Date.now();
    await saveCharacterToServer(character);
    renderBeltSlots(character);

    // Re-render modal on the same slot if open
    const activeSlot = slotIdx ?? _activeBeltSlot ?? 0;
    _renderBeltModal(character, activeSlot);
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
