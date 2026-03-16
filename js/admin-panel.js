// admin-panel.js
// In-game admin panel for editing items

const ADMIN_PASSWORD = 'admin123'; // Change this to something secure!
let adminMode = false;
let currentEditingItem = null;
let devMode = false; // Bypasses ownership checks for testing

/**
 * Initialize admin panel
 */
function initAdminPanel() {
    // Listen for hotkey (backtick/tilde key)
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Backquote' && !adminMode) {
            openAdminPanel();
        }
        if (e.key === 'Escape' && adminMode) {
            closeAdminPanel();
        }
    });
}

/**
 * Open admin panel with authentication
 */
function openAdminPanel() {
    const password = prompt('Enter admin password:');
    if (password !== ADMIN_PASSWORD) {
        showError('Invalid admin password');
        return;
    }
    
    adminMode = true;
    renderAdminPanel();
}

/**
 * Close admin panel
 */
function closeAdminPanel() {
    adminMode = false;
    const panel = document.getElementById('adminPanel');
    if (panel) {
        panel.style.display = 'none';
    }
    currentEditingItem = null;
}

/**
 * Render the admin panel UI
 */
function renderAdminPanel(tab) {
    if (tab) window._adminTab = tab;
    let panel = document.getElementById('adminPanel');
    
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'adminPanel';
        document.body.appendChild(panel);
    }
    
    panel.style.display = 'block';

    if (window._adminTab === 'dev') {
        renderDevTools(panel);
    } else if (!currentEditingItem) {
        renderItemList(panel);
    } else {
        renderItemEditor(panel);
    }
}

/**
 * Render list of all items
 */
function renderItemList(panel) {
    const searchInput = document.querySelector('#adminSearchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    
    const filtered = gameData.gear.filter(item => 
        item.name.toLowerCase().includes(searchTerm) ||
        item.id.toLowerCase().includes(searchTerm) ||
        (item.type && item.type.toLowerCase().includes(searchTerm))
    );
    
    panel.innerHTML = `
        <div class="admin-panel-container">
            <div class="admin-header">
                <h2>🔧 ADMIN PANEL</h2>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <button onclick="renderAdminPanel('items')" style="padding:0.3rem 0.75rem;background:${!window._adminTab || window._adminTab==='items'?'#d4af37':'#333'};color:#000;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Items</button>
                    <button onclick="renderAdminPanel('dev')" style="padding:0.3rem 0.75rem;background:${window._adminTab==='dev'?'#4a9eff':'#333'};color:${window._adminTab==='dev'?'#000':'#fff'};border:none;border-radius:4px;cursor:pointer;font-weight:bold;">🛠 Dev Tools</button>
                    <button class="admin-close-btn" onclick="closeAdminPanel()">✕</button>
                </div>
            </div>
            
            <div class="admin-search">
                <input 
                    type="text" 
                    id="adminSearchInput"
                    placeholder="Search items by name, ID, or type..."
                    onkeyup="renderAdminPanel('items')"
                    class="admin-search-input"
                >
                <button class="admin-btn-create" onclick="createNewItem()">➕ Create Item</button>
            </div>
            
            <div class="admin-items-list">
                ${filtered.length === 0 ? '<p>No items found</p>' : ''}
                ${filtered.map(item => `
                    <div class="admin-item-row" onclick="selectItemForEdit('${item.id}')">
                        <div class="admin-item-info">
                            <div class="admin-item-name">${item.name}</div>
                            <div class="admin-item-meta">
                                ID: ${item.id} | Type: ${item.type || 'unknown'} | Tier: ${item.tier || '?'}
                            </div>
                        </div>
                        <div class="admin-item-stats">
                            ${item.dmg1 ? `DMG: ${item.dmg1}` : ''}
                            ${item.armor ? `ARM: ${item.armor}` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div class="admin-footer">
                <p>Click an item to edit | Press ESC to close | Total items: ${gameData.gear.length}</p>
            </div>
        </div>
    `;
}

/**
 * Select an item to edit
 */
function selectItemForEdit(itemId) {
    currentEditingItem = gameData.gear.find(item => item.id === itemId);
    if (currentEditingItem) {
        renderAdminPanel();
    }
}

/**
 * Render item editor
 */
function renderItemEditor(panel) {
    const item = currentEditingItem;
    
    panel.innerHTML = `
        <div class="admin-panel-container">
            <div class="admin-header">
                <button class="admin-back-btn" onclick="currentEditingItem = null; renderAdminPanel()">← Back</button>
                <h2>Editing: ${item.name}</h2>
                <button class="admin-close-btn" onclick="closeAdminPanel()">✕</button>
            </div>
            
            <div class="admin-editor">
                <div class="admin-editor-section">
                    <h3>Basic Info</h3>
                    <div class="admin-field">
                        <label>Name:</label>
                        <input type="text" id="admin_name" value="${item.name}" onchange="updateItemField('name', this.value)">
                    </div>
                    <div class="admin-field">
                        <label>ID:</label>
                        <input type="text" id="admin_id" value="${item.id}" readonly style="opacity: 0.6;">
                    </div>
                    <div class="admin-field">
                        <label>Type:</label>
                        <input type="text" id="admin_type" value="${item.type || ''}" onchange="updateItemField('type', this.value)">
                    </div>
                    <div class="admin-field">
                        <label>Description:</label>
                        <textarea id="admin_desc" onchange="updateItemField('description', this.value)">${item.description || ''}</textarea>
                    </div>
                </div>
                
                <div class="admin-editor-section">
                    <h3>Consumable Properties</h3>
                    <div class="admin-field">
                        <label>Is Consumable:</label>
                        <input type="checkbox" ${item.consumable ? 'checked' : ''} onchange="updateItemField('consumable', this.checked)">
                    </div>
                    <div class="admin-field">
                        <label>Stackable:</label>
                        <input type="checkbox" ${item.stackable ? 'checked' : ''} onchange="updateItemField('stackable', this.checked)">
                    </div>
                </div>
                
                <div class="admin-editor-section">
                    <h3>Damage</h3>
                    <div class="admin-field">
                        <label>Type 1:</label>
                        <input type="text" id="admin_dmg_type_1" value="${item.dmg_type_1 || ''}" onchange="updateItemField('dmg_type_1', this.value)">
                        <input type="number" id="admin_dmg1" value="${item.dmg1 || 0}" onchange="updateItemField('dmg1', parseInt(this.value))">
                    </div>
                    <div class="admin-field">
                        <label>Type 2:</label>
                        <input type="text" id="admin_dmg_type_2" value="${item.dmg_type_2 || ''}" onchange="updateItemField('dmg_type_2', this.value)">
                        <input type="number" id="admin_dmg2" value="${item.dmg2 || 0}" onchange="updateItemField('dmg2', parseInt(this.value))">
                    </div>
                    <div class="admin-field">
                        <label>Delay:</label>
                        <input type="number" id="admin_delay" value="${item.delay || 0}" onchange="updateItemField('delay', parseInt(this.value))">
                    </div>
                </div>
                
                <div class="admin-editor-section">
                    <h3>Defense & Stats</h3>
                    <div class="admin-field">
                        <label>Armor:</label>
                        <input type="number" id="admin_armor" value="${item.armor || 0}" onchange="updateItemField('armor', parseInt(this.value))">
                    </div>
                    <div class="admin-field">
                        <label>Phys EV:</label>
                        <input type="number" id="admin_phys_ev" value="${item.phys_ev || 0}" onchange="updateItemField('phys_ev', parseInt(this.value))">
                    </div>
                    <div class="admin-field">
                        <label>Mag EV:</label>
                        <input type="number" id="admin_mag_ev" value="${item.mag_ev || 0}" onchange="updateItemField('mag_ev', parseInt(this.value))">
                    </div>
                </div>
                
                <div class="admin-editor-section">
                    <h3>Attribute Bonuses</h3>
                    <div class="admin-stats-grid">
                        <div class="admin-field">
                            <label>HP:</label>
                            <input type="number" id="admin_hp" value="${item.hp || 0}" onchange="updateItemField('hp', parseInt(this.value))">
                        </div>
                        <div class="admin-field">
                            <label>Mana:</label>
                            <input type="number" id="admin_mana" value="${item.mana || 0}" onchange="updateItemField('mana', parseInt(this.value))">
                        </div>
                        <div class="admin-field">
                            <label>Stam:</label>
                            <input type="number" id="admin_stam" value="${item.stam || 0}" onchange="updateItemField('stam', parseInt(this.value))">
                        </div>
                        <div class="admin-field">
                            <label>CON:</label>
                            <input type="number" id="admin_con" value="${item.con || 0}" onchange="updateItemField('con', parseInt(this.value))">
                        </div>
                        <div class="admin-field">
                            <label>END:</label>
                            <input type="number" id="admin_end" value="${item.end || 0}" onchange="updateItemField('end', parseInt(this.value))">
                        </div>
                        <div class="admin-field">
                            <label>AMB:</label>
                            <input type="number" id="admin_amb" value="${item.amb || 0}" onchange="updateItemField('amb', parseInt(this.value))">
                        </div>
                        <div class="admin-field">
                            <label>HAR:</label>
                            <input type="number" id="admin_har" value="${item.har || 0}" onchange="updateItemField('har', parseInt(this.value))">
                        </div>
                    </div>
                </div>
                
                <div class="admin-editor-section">
                    <h3>Effects & Skills</h3>
                    ${item.consumable ? `
                        <div class="admin-field">
                            <label>Effect Skill ID:</label>
                            <input type="text" value="${item.effect_skillid || ''}" onchange="updateItemField('effect_skillid', this.value)">
                        </div>
                        <div class="admin-field">
                            <label>Effect Count:</label>
                            <input type="number" value="${item.effect_ct || 0}" onchange="updateItemField('effect_ct', parseInt(this.value))">
                        </div>
                    ` : `
                        <div class="admin-field">
                            <label><strong>On-Hit Effects</strong></label>
                        </div>
                        ${['1', '2', '3'].map(i => `
                            <div class="admin-field">
                                <label>Skill ID ${i}:</label>
                                <input type="text" value="${item[`onhit_skillid_${i}`] || ''}" onchange="updateItemField('onhit_skillid_${i}', this.value)">
                                <input type="number" placeholder="Chance %" value="${item[`onhit_skillchance_${i}`] || 0}" onchange="updateItemField('onhit_skillchance_${i}', parseInt(this.value))">
                            </div>
                        `).join('')}
                    `}
                </div>
                
                <div class="admin-editor-section">
                    <h3>Other</h3>
                    <div class="admin-field">
                        <label>Tier:</label>
                        <input type="number" id="admin_tier" value="${item.tier || 0}" onchange="updateItemField('tier', parseInt(this.value))">
                    </div>
                    <div class="admin-field">
                        <label>Unique:</label>
                        <input type="checkbox" id="admin_unique" ${item.unique ? 'checked' : ''} onchange="updateItemField('unique', this.checked)">
                    </div>
                </div>
                
                <div class="admin-actions">
                    <button class="admin-btn-save" onclick="${currentEditingItem && currentEditingItem.id.startsWith('item_') ? 'saveNewItem()' : 'saveEditedItem()'}">💾 ${currentEditingItem && currentEditingItem.id.startsWith('item_') ? 'Create Item' : 'Save Changes'}</button>
                    <button class="admin-btn-cancel" onclick="currentEditingItem = null; renderAdminPanel()">Cancel</button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Update a field in the current item being edited
 */
function updateItemField(field, value) {
    if (currentEditingItem) {
        currentEditingItem[field] = value;
    }
}

/**
 * Save the edited item to the server
 */
async function saveEditedItem() {
    if (!currentEditingItem) return;
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/items/${currentEditingItem.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentEditingItem)
        });
        
        if (!response.ok) {
            throw new Error('Failed to save item');
        }
        
        showSuccess(`Item "${currentEditingItem.name}" saved successfully!`);
        currentEditingItem = null;
        renderAdminPanel();
    } catch (error) {
        console.error('Error saving item:', error);
        showError('Failed to save item: ' + error.message);
    }
}

/**
 * Create a new item
 */
function createNewItem() {
    // Generate a unique ID
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const newId = `item_${timestamp}_${randomId}`;
    
    // Create a basic item template
    currentEditingItem = {
        id: newId,
        name: 'New Item',
        type: 'weapon',
        slot_id1: 'mainHand',
        slot_id2: null,
        dmg_type_1: null,
        dmg1: null,
        dmg_type_2: null,
        dmg2: null,
        dmg_type_3: null,
        dmg3: null,
        dmg_type_4: null,
        dmg4: null,
        delay: null,
        armor: null,
        phys_ev: null,
        mag_ev: null,
        hp: null,
        mana: null,
        stam: null,
        con: null,
        end: null,
        amb: null,
        har: null,
        effect_skillid: null,
        effect_ct: null,
        consumable: false,
        stackable: false,
        unique: false,
        onhit_skillid_1: null,
        onhit_skillchance_1: null,
        onhit_skillid_2: null,
        onhit_skillchance_2: null,
        onhit_skillid_3: null,
        onhit_skillchance_3: null,
        extra_cost: null,
        description: 'A new item',
        tier: 0
    };
    
    renderAdminPanel();
}

/**
 * Save the new item to the server
 */
async function saveNewItem() {
    if (!currentEditingItem) return;
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentEditingItem)
        });
        
        if (!response.ok) {
            throw new Error('Failed to create item');
        }
        
        // Add to gameData
        gameData.gear.push(currentEditingItem);
        
        showSuccess(`Item "${currentEditingItem.name}" created successfully!`);
        currentEditingItem = null;
        renderAdminPanel();
    } catch (error) {
        console.error('Error creating item:', error);
        showError('Failed to create item: ' + error.message);
    }
}


/**
 * Check if dev mode is active (used by combat-system.js ownership checks)
 */
function isDevMode() {
    return devMode;
}

/**
 * Render dev tools panel
 */
function renderDevTools(panel) {
    const currentDeviceId = getDeviceId();
    const spoofedId = localStorage.getItem('spoofedDeviceId') || '';

    panel.innerHTML = `
        <div class="admin-panel-container">
            <div class="admin-header">
                <h2>🔧 ADMIN PANEL</h2>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <button onclick="renderAdminPanel('items')" style="padding:0.3rem 0.75rem;background:#333;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Items</button>
                    <button onclick="renderAdminPanel('dev')" style="padding:0.3rem 0.75rem;background:#4a9eff;color:#000;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">🛠 Dev Tools</button>
                    <button class="admin-close-btn" onclick="closeAdminPanel()">✕</button>
                </div>
            </div>

            <div style="padding:1.5rem;display:flex;flex-direction:column;gap:1.5rem;">

                <!-- Dev Mode Toggle -->
                <div style="padding:1rem;background:rgba(255,255,255,0.05);border-radius:8px;border:1px solid ${devMode ? '#4eff7f' : '#555'};">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <div style="color:${devMode ? '#4eff7f' : '#aaa'};font-weight:bold;font-size:1.1rem;">
                                ${devMode ? '✅ Dev Mode ON' : '⬜ Dev Mode OFF'}
                            </div>
                            <div style="color:#888;font-size:0.85rem;margin-top:0.25rem;">
                                Bypasses self-import ownership check. Lets you add your own exported characters as party companions.
                            </div>
                        </div>
                        <button onclick="toggleDevMode()" style="padding:0.5rem 1.25rem;background:${devMode ? '#6b2020' : '#1a4a1a'};color:${devMode ? '#ff6b6b' : '#4eff7f'};border:1px solid ${devMode ? '#ff6b6b' : '#4eff7f'};border-radius:6px;cursor:pointer;font-weight:bold;">
                            ${devMode ? 'Disable' : 'Enable'}
                        </button>
                    </div>
                </div>

                <!-- Device ID Spoofer -->
                <div style="padding:1rem;background:rgba(255,255,255,0.05);border-radius:8px;border:1px solid #555;">
                    <div style="color:#d4af37;font-weight:bold;margin-bottom:0.75rem;">🪪 Device ID</div>
                    <div style="color:#888;font-size:0.8rem;margin-bottom:0.5rem;">Current ID (used for ownership):</div>
                    <code style="color:#4a9eff;font-size:0.85rem;word-break:break-all;">${currentDeviceId}</code>
                    <div style="margin-top:1rem;">
                        <div style="color:#888;font-size:0.8rem;margin-bottom:0.5rem;">
                            Spoof as a different device ID to test cross-device imports:
                        </div>
                        <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
                            <input id="spoofIdInput" type="text" value="${spoofedId}" placeholder="Paste a device_XXXX ID..."
                                style="flex:1;padding:0.5rem;background:#16213e;color:#d4af37;border:1px solid #444;border-radius:4px;font-family:monospace;font-size:0.85rem;">
                            <button onclick="applySpoofId()" style="padding:0.5rem 1rem;background:#1a3a5a;color:#4a9eff;border:1px solid #4a9eff;border-radius:4px;cursor:pointer;">Apply</button>
                            <button onclick="clearSpoofId()" style="padding:0.5rem 1rem;background:#2a1a1a;color:#ff6b6b;border:1px solid #ff6b6b;border-radius:4px;cursor:pointer;">Reset</button>
                        </div>
                        ${spoofedId ? `<div style="margin-top:0.5rem;color:#ff9800;font-size:0.8rem;">⚠️ Spoofing active — ownership checks use spoofed ID</div>` : ''}
                    </div>
                </div>

            </div>

            <div class="admin-footer">
                <p>Press ESC to close</p>
            </div>
        </div>
    `;
}

/**
 * Toggle dev mode on/off
 */
function toggleDevMode() {
    devMode = !devMode;
    showSuccess(devMode ? 'Dev mode enabled — self-import allowed' : 'Dev mode disabled');
    renderDevTools(document.getElementById('adminPanel'));
}

/**
 * Apply a spoofed device ID for testing cross-ownership imports
 */
function applySpoofId() {
    const input = document.getElementById('spoofIdInput')?.value.trim();
    if (!input) { showError('Enter a device ID to spoof'); return; }
    localStorage.setItem('spoofedDeviceId', input);
    // Override deviceId in localStorage so getDeviceId() returns the spoofed value
    localStorage.setItem('deviceId', input);
    showSuccess('Device ID spoofed — reload the page for full effect');
    renderDevTools(document.getElementById('adminPanel'));
}

/**
 * Reset device ID back to this device's real ID
 */
function clearSpoofId() {
    const realId = localStorage.getItem('_realDeviceId') || ('device_' + crypto.randomUUID());
    localStorage.setItem('deviceId', realId);
    localStorage.removeItem('spoofedDeviceId');
    showSuccess('Device ID reset to original');
    renderDevTools(document.getElementById('adminPanel'));
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initAdminPanel);
