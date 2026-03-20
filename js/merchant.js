/**
 * Traveling Merchant System
 * Appears after completing a challenge with ~30% chance.
 * Four merchant types each selling randomized consumables from their pool.
 */

const MERCHANTS = [
  {
    id: 'herbalist',
    name: 'The Herbalist',
    greeting: 'She sets up beside a wagon of dried roots and clay jars, and waves you over without looking up.',
    icon: '🌿',
    itemPool: [
      'health_potion_minor', 'health_potion',
      'consumable_potion_health_minor', 'consumable_potion_health_major',
      'mana_potion_minor', 'mana_potion',
      'consumable_potion_mana_minor', 'consumable_potion_mana_major',
      'stamina_potion_minor', 'consumable_potion_stamina_minor',
      'consumable_food_ration', 'consumable_food_feast',
      'consumable_potion_defense_buff', 'consumable_potion_strength_buff',
      'consumable_potion_speed_buff',
    ],
    priceMultiplier: 1.0,
  },
  {
    id: 'alchemist',
    name: 'The Alchemist',
    greeting: "His cart smells like sulfur and something you can't name. He doesn't apologize for it.",
    icon: '⚗️',
    itemPool: [
      'consumable_bomb_fire', 'consumable_bomb_ice', 'consumable_bomb_flash',
      'consumable_bomb_smoke', 'smoke_bomb',
      'consumable_poison_blade', 'consumable_poison_paralytic',
      'consumable_trap_caltrops', 'consumable_trap_bear',
      'strange_mushrooms',
    ],
    priceMultiplier: 1.2,
  },
  {
    id: 'scribe',
    name: 'The Wandering Scribe',
    greeting: 'She carries more knowledge than she will ever use herself. Some of it she is willing to part with.',
    icon: '📜',
    itemPool: [
      'consumable_scroll_fireball', 'consumable_scroll_lightning',
      'consumable_scroll_resurrection', 'consumable_scroll_teleport',
      'consumable_crystal_teleport', 'consumable_crystal_resurrection',
      'consumable_tool_map', 'consumable_tool_torch',
      'consumable_charm_luck',
    ],
    priceMultiplier: 1.4,
  },
  {
    id: 'fence',
    name: 'The Fence',
    greeting: "Doesn't ask where you've been. Doesn't tell you where she got it. Fair trade.",
    icon: '🗝️',
    itemPool: [
      'consumable_tool_lockpick', 'consumable_tool_rope',
      'throwing_knife', 'escape_rope',
      'consumable_charm_luck', 'strange_mushrooms',
      'consumable_bomb_smoke', 'smoke_bomb',
      'consumable_poison_blade',
    ],
    priceMultiplier: 0.9,
  },
];

// Current merchant offer — cleared on dismiss or navigation
let currentMerchant = null;
let currentMerchantStock = [];

/**
 * Roll a merchant appearance. ~30% chance.
 * Returns true if a merchant appeared.
 */
function rollMerchantAppearance() {
  if (Math.random() > 0.30) return false;

  const merchant = MERCHANTS[Math.floor(Math.random() * MERCHANTS.length)];
  const stock = buildMerchantStock(merchant);
  if (stock.length === 0) return false;

  currentMerchant = merchant;
  currentMerchantStock = stock;
  return true;
}

/**
 * Build randomized stock — pick 3-4 items from the pool,
 * each with a generous quantity (3-6 units).
 */
function buildMerchantStock(merchant) {
  const allItems = window.gameData?.items || window.gameData?.gear || [];
  const available = merchant.itemPool
    .map(id => allItems.find(i => i.id === id))
    .filter(Boolean);

  if (available.length === 0) return [];

  // Shuffle and pick 3-4
  const shuffled = available.sort(() => Math.random() - 0.5);
  const count = Math.floor(Math.random() * 2) + 3; // 3 or 4
  const picked = shuffled.slice(0, count);

  return picked.map(item => ({
    item,
    quantity: Math.floor(Math.random() * 4) + 3, // 3-6 units
    price: Math.max(1, Math.round(((item.tier || 0) + 1) * 8 * merchant.priceMultiplier)),
  }));
}

/**
 * Render the merchant panel on the character detail screen.
 * Inserts into #merchantSlot if it exists.
 */
function renderMerchant(character) {
  const slot = document.getElementById('merchantSlot');
  if (!slot) return;

  if (!currentMerchant || currentMerchantStock.length === 0) {
    slot.innerHTML = '';
    slot.style.display = 'none';
    return;
  }

  const gold = character?.gold || 0;
  const m = currentMerchant;

  slot.style.display = 'block';
  slot.innerHTML = `
    <div style="border:1px solid rgba(212,175,55,0.35); border-radius:6px; padding:1rem; background:rgba(212,175,55,0.04); margin-bottom:1rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
        <span style="color:#d4af37; font-size:0.85rem; font-weight:600; letter-spacing:0.05em; text-transform:uppercase;">
          ${m.icon} ${m.name}
        </span>
        <button onclick="dismissMerchant()" style="background:none; border:none; color:#666; cursor:pointer; font-size:0.8rem; padding:0;">✕ Send away</button>
      </div>
      <div style="color:#8b7355; font-size:0.78rem; font-style:italic; margin-bottom:0.75rem; line-height:1.5;">
        "${m.greeting}"
      </div>
      <div id="merchantStock" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px,1fr)); gap:0.5rem;">
        ${currentMerchantStock.map((entry, idx) => renderStockEntry(entry, idx, gold)).join('')}
      </div>
    </div>
  `;
}

function renderStockEntry(entry, idx, gold) {
  const { item, quantity, price } = entry;
  const canAfford = gold >= price;
  const soldOut = quantity <= 0;
  return `
    <div style="background:rgba(0,0,0,0.2); border:1px solid rgba(139,115,85,0.2); border-radius:4px; padding:0.5rem; display:flex; flex-direction:column; gap:0.25rem;">
      <div style="color:#e8d5b0; font-size:0.8rem; font-weight:600;">${item.name}</div>
      <div style="color:#666; font-size:0.72rem;">Qty: ${quantity}</div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.25rem;">
        <span style="color:#d4af37; font-size:0.78rem;">${price}g each</span>
        <button onclick="buyFromMerchant(${idx})"
          ${soldOut || !canAfford ? 'disabled' : ''}
          style="padding:2px 8px; font-size:0.72rem; background:${soldOut ? '#333' : canAfford ? '#2a4a2a' : '#3a2a1a'}; color:${soldOut ? '#555' : canAfford ? '#4cd964' : '#888'}; border:1px solid ${soldOut ? '#444' : canAfford ? '#3a6a3a' : '#5a4a2a'}; border-radius:3px; cursor:${soldOut || !canAfford ? 'not-allowed' : 'pointer'};">
          ${soldOut ? 'Sold out' : !canAfford ? 'No gold' : 'Buy'}
        </button>
      </div>
    </div>
  `;
}

async function buyFromMerchant(idx) {
  const entry = currentMerchantStock[idx];
  if (!entry || entry.quantity <= 0) return;

  const characterId = currentState.detailCharacterId;
  if (!characterId) return;

  const character = await getCharacter(characterId);
  if (!character) return;

  if ((character.gold || 0) < entry.price) {
    showError('Not enough gold.');
    return;
  }

  // Deduct gold
  character.gold = (character.gold || 0) - entry.price;

  // Add to stash
  if (!character.consumableStash) character.consumableStash = {};
  character.consumableStash[entry.item.id] = (character.consumableStash[entry.item.id] || 0) + 1;

  // Decrement stock
  entry.quantity -= 1;

  // Save
  await saveCharacterToServer(character);

  // Re-render
  renderMerchant(character);
  showSuccess(`Bought ${entry.item.name} for ${entry.price}g.`);
}

function dismissMerchant() {
  currentMerchant = null;
  currentMerchantStock = [];
  const slot = document.getElementById('merchantSlot');
  if (slot) { slot.innerHTML = ''; slot.style.display = 'none'; }
}
