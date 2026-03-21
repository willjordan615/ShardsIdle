// js/admin-panel.js
// In-game admin panel. Triggered by ~ key + password.

(function() {
    'use strict';

    let adminItems    = [];
    let editingItemId = null;
    let isUnlocked    = false;
    const ADMIN_PASSWORD = 'marsh540!vault';

    document.addEventListener('keydown', function(e) {
        if (e.key === '`' || e.key === '~') {
            if (!isUnlocked) {
                const pw = prompt('Admin password:');
                if (pw === ADMIN_PASSWORD) { isUnlocked = true; openPanel(); }
            } else {
                openPanel();
            }
        }
    });

    window.closeAdminPanel = function() {
        const p = document.getElementById('adminPanel');
        if (p) p.style.display = 'none';
    };

    window.openAdminEditor = function(itemId) {
        const item = itemId ? adminItems.find(i => i.id === itemId) : null;
        renderEditor(item);
    };

    function openPanel() {
        const p = document.getElementById('adminPanel');
        if (p) p.style.display = 'block';
        loadItems();
    }

    async function loadItems() {
        try {
            const res  = await fetch(BACKEND_URL + '/api/admin/items');
            const data = await res.json();
            adminItems = data.items || [];
            renderList(adminItems);
        } catch (err) {
            console.error('[ADMIN] load failed:', err);
        }
    }

    // ── List view ─────────────────────────────────────────────────────────────
    function renderList(items) {
        const list = document.getElementById('adminItemsList');
        if (!list) return;
        fillList(items);
    }

    function fillList(items) {
        const list = document.getElementById('adminItemsList');
        if (!list) return;
        list.innerHTML = '';
        if (!items.length) {
            list.innerHTML = '<div style="padding:20px;color:#888;text-align:center">No items found.</div>';
            return;
        }
        items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'admin-item-row';
            const tierBadge = item.tier !== undefined ? `<span style="color:#555;font-size:.75em">T${item.tier}</span> ` : '';
            row.innerHTML = `
                <div class="admin-item-info">
                    <div class="admin-item-name">${tierBadge}${esc(item.name)} <span style="color:#555;font-size:.75em">[${esc(item.id)}]</span></div>
                    <div class="admin-item-meta">${esc(item.type||'unknown')} · ${esc(item.slot_id1||'—')}</div>
                </div>
                <div class="admin-item-stats" style="font-size:.8em;color:#888;">
                    ${item.dmg1 ? `<span style="color:#ff8">DMG ${item.dmg1}</span> ` : ''}${item.armor ? `ARM ${item.armor}` : ''}
                </div>`;
            row.onclick = () => window.openAdminEditor(item.id);
            list.appendChild(row);
        });
    }

    window.adminFilterItems = function(q) {
        const lq = q.toLowerCase();
        fillList(adminItems.filter(i =>
            i.name.toLowerCase().includes(lq) ||
            i.id.toLowerCase().includes(lq) ||
            (i.type||'').toLowerCase().includes(lq) ||
            String(i.tier||'').includes(lq)
        ));
    };

    // ── Item Editor ───────────────────────────────────────────────────────────
    function renderEditor(item) {
        const isNew = !item;
        editingItemId = item ? item.id : null;
        const wrap = document.getElementById('adminTabContent_items');
        if (!wrap) return;

        const v  = (k, fb='') => esc(String(item?.[k] ?? fb));
        const n  = (k, fb=0)  => item?.[k] ?? fb;

        const SLOT_OPTIONS = ['mainHand','offHand','head','chest','accessory1','accessory2','consumable','']
            .map(s => `<option value="${s}" ${(item?.slot_id1||'')=== s?'selected':''}>${s||'(none)'}</option>`).join('');
        const TYPE_OPTIONS = ['sword','dagger','axe','mace','hammer','handaxe','wand','scepter','tome','totem','flute','bell','crossbow','pistol','shield','armor','helmet','accessory','consumable','other']
            .map(t => `<option value="${t}" ${(item?.type||'')=== t?'selected':''}>${t}</option>`).join('');
        const DMG_TYPES = ['','Physical','Fire','Ice','Lightning','Holy','Shadow','Nature','Arcane','Poison','Bludgeoning','Slashing','Piercing','Electric']
            .map(t => `<option value="${t}" ${(item?.dmg_type_1||'')=== t?'selected':''}>${t||'—'}</option>`).join('');
        const DMG_TYPES2 = ['','Physical','Fire','Ice','Lightning','Holy','Shadow','Nature','Arcane','Poison','Bludgeoning','Slashing','Piercing','Electric']
            .map(t => `<option value="${t}" ${(item?.dmg_type_2||'')=== t?'selected':''}>${t||'—'}</option>`).join('');

        wrap.innerHTML = `
        <div style="overflow-y:auto;max-height:65vh;padding:8px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                <button onclick="adminBackToList()" style="padding:4px 10px;background:#1a2a1a;border:1px solid #3a5a3a;color:#8fa;cursor:pointer;border-radius:4px;">← Back</button>
                <span style="color:#d4af37;font-size:1em;font-weight:bold;">${isNew ? '➕ New Item' : '✏️ ' + esc(item.name)}</span>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
                <div class="admin-field"><label>ID</label>
                    <input type="text" id="ae_id" value="${v('id')}" ${isNew?'':'readonly style="opacity:.5"'}></div>
                <div class="admin-field"><label>Name</label>
                    <input type="text" id="ae_name" value="${v('name')}"></div>
                <div class="admin-field"><label>Type</label>
                    <select id="ae_type">${TYPE_OPTIONS}</select></div>
                <div class="admin-field"><label>Slot</label>
                    <select id="ae_slot_id1">${SLOT_OPTIONS}</select></div>
                <div class="admin-field"><label>Tier</label>
                    <input type="number" id="ae_tier" value="${n('tier',0)}" min="0" max="8"></div>
                <div class="admin-field"><label>Armor Value</label>
                    <input type="number" id="ae_armor" value="${n('armor',0)}"></div>
                <div class="admin-field"><label>Delay (1=fast 2=normal 3=slow)</label>
                    <input type="number" id="ae_delay" value="${n('delay',2)}" min="1" max="3"></div>
                <div class="admin-field" style="grid-column:span 2"><label>Description</label>
                    <textarea id="ae_description" style="width:100%;height:50px;">${v('description')}</textarea></div>
            </div>

            <div style="color:#8b7355;font-size:.75rem;letter-spacing:1px;text-transform:uppercase;margin:8px 0 4px;">Damage</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
                <div class="admin-field"><label>DMG 1</label><input type="number" id="ae_dmg1" value="${n('dmg1',0)}"></div>
                <div class="admin-field"><label>Type 1</label><select id="ae_dmg_type_1">${DMG_TYPES}</select></div>
                <div class="admin-field"><label>DMG 2</label><input type="number" id="ae_dmg2" value="${n('dmg2',0)}"></div>
                <div class="admin-field"><label>Type 2</label><select id="ae_dmg_type_2">${DMG_TYPES2}</select></div>
            </div>

            <div style="color:#8b7355;font-size:.75rem;letter-spacing:1px;text-transform:uppercase;margin:8px 0 4px;">Stat Bonuses</div>
            <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:8px;">
                <div class="admin-field"><label>CON</label><input type="number" id="ae_con" value="${n('con',0)}"></div>
                <div class="admin-field"><label>END</label><input type="number" id="ae_end" value="${n('end',0)}"></div>
                <div class="admin-field"><label>AMB</label><input type="number" id="ae_amb" value="${n('amb',0)}"></div>
                <div class="admin-field"><label>HAR</label><input type="number" id="ae_har" value="${n('har',0)}"></div>
                <div class="admin-field"><label>HP</label><input type="number" id="ae_hp" value="${n('hp',0)}"></div>
                <div class="admin-field"><label>Mana</label><input type="number" id="ae_mana" value="${n('mana',0)}"></div>
                <div class="admin-field"><label>Stam</label><input type="number" id="ae_stam" value="${n('stam',0)}"></div>
            </div>

            <div style="color:#8b7355;font-size:.75rem;letter-spacing:1px;text-transform:uppercase;margin:8px 0 4px;">On-Hit Procs</div>
            <div style="display:grid;grid-template-columns:1fr 80px 1fr 80px;gap:8px;margin-bottom:8px;">
                <div class="admin-field"><label>Proc Skill 1 ID</label><input type="text" id="ae_oh1id" value="${v('onhit_skillid_1')}"></div>
                <div class="admin-field"><label>Chance %</label><input type="number" id="ae_oh1ch" value="${n('onhit_skillchance_1',0)}"></div>
                <div class="admin-field"><label>Proc Skill 2 ID</label><input type="text" id="ae_oh2id" value="${v('onhit_skillid_2')}"></div>
                <div class="admin-field"><label>Chance %</label><input type="number" id="ae_oh2ch" value="${n('onhit_skillchance_2',0)}"></div>
            </div>

            <div style="color:#8b7355;font-size:.75rem;letter-spacing:1px;text-transform:uppercase;margin:8px 0 4px;">Flags</div>
            <div style="display:flex;gap:16px;margin-bottom:12px;font-size:.85em;">
                <label><input type="checkbox" id="ae_unique" ${item?.unique?'checked':''}> Unique</label>
                <label><input type="checkbox" id="ae_consumable" ${item?.consumable?'checked':''}> Consumable</label>
                <label><input type="checkbox" id="ae_stackable" ${item?.stackable?'checked':''}> Stackable</label>
            </div>

            <div style="display:flex;gap:8px;">
                <button class="admin-btn-save" onclick="adminSaveItem(${isNew})">${isNew ? '✅ Create' : '💾 Save'}</button>
                ${!isNew ? `<button class="admin-btn-cancel" style="background:#8b2222;" onclick="adminDeleteItem('${editingItemId}')">🗑️ Delete</button>` : ''}
                <button class="admin-btn-cancel" onclick="adminBackToList()">Cancel</button>
            </div>
        </div>`;
    }

    window.adminBackToList = function() {
        editingItemId = null;
        const wrap = document.getElementById('adminTabContent_items');
        if (wrap) {
            wrap.innerHTML = `
                <div class="admin-search">
                    <input type="text" class="admin-search-input" placeholder="Search items..."
                           id="adminSearchInput" oninput="adminFilterItems(this.value)">
                    <button class="admin-btn-create" onclick="openAdminEditor()">+ Create Item</button>
                </div>
                <div class="admin-items-list" id="adminItemsList"></div>`;
        }
        renderList(adminItems);
    };

    // ── Save / Delete ─────────────────────────────────────────────────────────
    window.adminSaveItem = async function(isNew) {
        const id = document.getElementById('ae_id')?.value.trim();
        if (!id) { alert('ID is required.'); return; }

        const num = (eid) => { const n = parseFloat(document.getElementById(eid)?.value); return isNaN(n)||n===0 ? undefined : n; };
        const str = (eid) => { const s = document.getElementById(eid)?.value?.trim(); return s||undefined; };
        const chk = (eid) => document.getElementById(eid)?.checked || false;

        const payload = {
            id,
            name:               document.getElementById('ae_name')?.value.trim() || id,
            type:               str('ae_type'),
            slot_id1:           str('ae_slot_id1'),
            tier:               parseInt(document.getElementById('ae_tier')?.value)||0,
            description:        str('ae_description'),
            dmg1:               num('ae_dmg1'),
            dmg_type_1:         str('ae_dmg_type_1'),
            dmg2:               num('ae_dmg2'),
            dmg_type_2:         str('ae_dmg_type_2'),
            armor:              num('ae_armor'),
            delay:              num('ae_delay'),
            con:                num('ae_con'),
            end:                num('ae_end'),
            amb:                num('ae_amb'),
            har:                num('ae_har'),
            hp:                 num('ae_hp'),
            mana:               num('ae_mana'),
            stam:               num('ae_stam'),
            onhit_skillid_1:    str('ae_oh1id'),
            onhit_skillchance_1:num('ae_oh1ch'),
            onhit_skillid_2:    str('ae_oh2id'),
            onhit_skillchance_2:num('ae_oh2ch'),
            unique:             chk('ae_unique') || undefined,
            consumable:         chk('ae_consumable') || undefined,
            stackable:          chk('ae_stackable') || undefined,
        };

        Object.keys(payload).forEach(k => { if (payload[k] === undefined || payload[k] === false) delete payload[k]; });

        try {
            const method = isNew ? 'POST' : 'PUT';
            const url    = isNew
                ? BACKEND_URL + '/api/admin/items'
                : BACKEND_URL + '/api/admin/items/' + editingItemId;

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(((await res.json()).error) || res.status);

            if (typeof showSuccess === 'function') showSuccess(isNew ? `"${payload.name}" created!` : `"${payload.name}" saved!`);
            await loadItems();
            adminBackToList();
        } catch (err) {
            alert('Save failed: ' + err.message);
        }
    };

    window.adminDeleteItem = async function(itemId) {
        if (!confirm('Delete "' + itemId + '"? This cannot be undone.')) return;
        try {
            const res = await fetch(BACKEND_URL + '/api/admin/items/' + itemId, { method: 'DELETE' });
            if (!res.ok) throw new Error(((await res.json()).error) || res.status);
            if (typeof showSuccess === 'function') showSuccess('"' + itemId + '" deleted.');
            await loadItems();
            adminBackToList();
        } catch (err) {
            alert('Delete failed: ' + err.message);
        }
    };

    function esc(s) {
        return String(s)
            .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
            .replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

})();

// ── Tab switcher ──────────────────────────────────────────────────────────────

window.switchAdminTab = function(tab) {
    const tabs = ['items', 'skills', 'enemies', 'characters', 'snapshots', 'db'];
    tabs.forEach(t => {
        const content = document.getElementById('adminTabContent_' + t);
        if (content) content.style.display = t === tab ? 'block' : 'none';
    });
    // Items tab has a different button ID
    const itemsBtn = document.getElementById('adminTabItems');
    if (itemsBtn) itemsBtn.style.background = tab === 'items' ? '' : '#2a3a2a';
    tabs.filter(t => t !== 'items').forEach(t => {
        const btn = document.getElementById('adminTab_' + t);
        if (btn) btn.style.background = t === tab ? '' : '#2a3a2a';
    });

    if (tab === 'skills')     switchSkillSubTab('edit');
    if (tab === 'enemies')    loadAdminEnemies();
    if (tab === 'characters') loadAdminCharacters();
    if (tab === 'snapshots')  loadAdminSnapshots();
    if (tab === 'db')         renderAdminDB();
};

// ── Skill Tree Tab (read-only combo view) ─────────────────────────────────────

window.renderAdminSkillTree = function() {
    const container = document.getElementById('adminSkillTreeContent');
    if (!container) return;
    const skills = window.gameData?.skills;
    if (!skills) { container.innerHTML = '<p style="color:#888;">Game data not loaded.</p>'; return; }

    const skillMap = {};
    skills.forEach(s => skillMap[s.id] = s);

    const children = skills.filter(s => s.parentSkills && s.parentSkills.length === 2);

    const catLabels = {
        DAMAGE_SINGLE:'Physical Damage', DAMAGE_MAGIC:'Magic Damage',
        DAMAGE_AOE:'Area of Effect', HEALING:'Healing', HEALING_AOE:'Area Healing',
        BUFF:'Buffs', CONTROL:'Control', DEFENSE:'Defense',
        RESTORATION:'Restoration', UTILITY:'Utility'
    };
    const catOrder = ['DAMAGE_SINGLE','DAMAGE_MAGIC','DAMAGE_AOE','HEALING','HEALING_AOE','BUFF','CONTROL','DEFENSE','RESTORATION','UTILITY'];

    const byCat = {};
    children.forEach(c => {
        const cat = c.category || 'OTHER';
        if (!byCat[cat]) byCat[cat] = [];
        byCat[cat].push(c);
    });

    const searchBar = `<div style="margin-bottom:10px;">
        <input id="skillTreeSearch" type="text" placeholder="Filter skills..." oninput="filterSkillTree(this.value)"
            style="width:100%; padding:6px 10px; background:#0f1923; color:#d4af37; border:1px solid #333; border-radius:4px; font-size:0.85rem;">
    </div>`;

    const sections = catOrder.filter(c => byCat[c]).map(cat => {
        const rows = [...byCat[cat]].sort((a,b) => a.name.localeCompare(b.name)).map(c => {
            const p1 = skillMap[c.parentSkills[0]]?.name || c.parentSkills[0];
            const p2 = skillMap[c.parentSkills[1]]?.name || c.parentSkills[1];
            const proc = c.procChance ? `<span style="color:#888; font-size:0.75rem;"> ${Math.round(c.procChance*100)}%</span>` : '';
            return `<tr class="skill-tree-row" style="border-bottom:1px solid #1a2a3a;">
                <td style="padding:4px 8px; color:#aaa;">${p1}</td>
                <td style="padding:4px 8px; color:#555;">+</td>
                <td style="padding:4px 8px; color:#aaa;">${p2}</td>
                <td style="padding:4px 8px; color:#555;">→</td>
                <td style="padding:4px 8px; color:#d4af37; font-weight:500;">${c.name}${proc}</td>
            </tr>`;
        }).join('');
        return `<div class="skill-tree-section" style="margin-bottom:16px;">
            <div style="color:#4a9eff; font-size:0.75rem; letter-spacing:1px; text-transform:uppercase; padding:4px 0; border-bottom:1px solid #1a2a3a; margin-bottom:4px;">${catLabels[cat] || cat} (${byCat[cat].length})</div>
            <table style="width:100%; border-collapse:collapse; font-size:0.82rem;">${rows}</table>
        </div>`;
    }).join('');

    container.innerHTML = searchBar + `<div id="skillTreeBody">${sections}</div>
        <div style="color:#555; font-size:0.75rem; margin-top:8px; text-align:right;">${children.length} combinations total</div>`;
};

window.filterSkillTree = function(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('.skill-tree-row').forEach(row => {
        row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
    document.querySelectorAll('.skill-tree-section').forEach(sec => {
        const visible = [...sec.querySelectorAll('.skill-tree-row')].some(r => r.style.display !== 'none');
        sec.style.display = visible ? '' : 'none';
    });
};

// ── Enemies Tab ───────────────────────────────────────────────────────────────

let _adminEnemies = [];
let _adminEnemyEditing = null;

async function loadAdminEnemies() {
    const el = document.getElementById('adminTabContent_enemies');
    if (!el) return;
    el.innerHTML = '<p style="color:#aaa;padding:12px;">Loading...</p>';
    try {
        const res = await fetch(BACKEND_URL + '/api/admin/data/enemies');
        _adminEnemies = await res.json();
        renderEnemyList();
    } catch(e) { el.innerHTML = `<p style="color:#f88;padding:12px;">Error: ${e.message}</p>`; }
}

function renderEnemyList() {
    const el = document.getElementById('adminTabContent_enemies');
    if (!el) return;

    const rows = _adminEnemies.map((e, i) => {
        const s = e.stats || {};
        return `<tr style="border-bottom:1px solid #1a1a1a;cursor:pointer;" onclick="openAdminEnemy(${i})">
            <td style="padding:5px 8px;color:#d4af37;">${e.name}</td>
            <td style="padding:5px 8px;color:#666;font-size:.8em;">${e.id}</td>
            <td style="padding:5px 8px;text-align:center;">${s.conviction||0}</td>
            <td style="padding:5px 8px;text-align:center;">${s.endurance||0}</td>
            <td style="padding:5px 8px;text-align:center;">${s.ambition||0}</td>
            <td style="padding:5px 8px;text-align:center;">${s.harmony||0}</td>
            <td style="padding:5px 8px;text-align:center;">${e.armorValue||0}</td>
            <td style="padding:5px 8px;color:#888;font-size:.75em;">${(e.availableSkills||[]).slice(0,3).join(', ')}${(e.availableSkills||[]).length>3?'…':''}</td>
        </tr>`;
    }).join('');

    el.innerHTML = `
        <div style="padding:8px;">
            <div style="display:flex;gap:8px;margin-bottom:8px;">
                <input type="text" placeholder="Filter enemies..." oninput="filterAdminEnemies(this.value)"
                    style="flex:1;padding:5px 8px;background:#0f1923;color:#d4af37;border:1px solid #333;border-radius:4px;font-size:.85em;">
                <button onclick="openAdminEnemy(-1)" style="padding:5px 12px;background:#1a3a1a;border:1px solid #3a6a3a;color:#8fa;cursor:pointer;border-radius:4px;">+ New</button>
            </div>
            <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:.82em;" id="adminEnemyTable">
                <thead><tr style="color:#8b7355;border-bottom:1px solid #333;font-size:.75em;letter-spacing:.5px;">
                    <th style="text-align:left;padding:4px 8px;">Name</th>
                    <th style="text-align:left;padding:4px 8px;">ID</th>
                    <th style="text-align:center;padding:4px 8px;">CON</th>
                    <th style="text-align:center;padding:4px 8px;">END</th>
                    <th style="text-align:center;padding:4px 8px;">AMB</th>
                    <th style="text-align:center;padding:4px 8px;">HAR</th>
                    <th style="text-align:center;padding:4px 8px;">ARM</th>
                    <th style="text-align:left;padding:4px 8px;">Skills</th>
                </tr></thead>
                <tbody id="adminEnemyBody">${rows}</tbody>
            </table></div>
        </div>`;
}

window.filterAdminEnemies = function(q) {
    const lq = q.toLowerCase();
    document.querySelectorAll('#adminEnemyBody tr').forEach((row, i) => {
        const e = _adminEnemies[i];
        if (!e) return;
        const match = e.name.toLowerCase().includes(lq) || e.id.toLowerCase().includes(lq) ||
            (e.availableSkills||[]).some(s => s.toLowerCase().includes(lq));
        row.style.display = match ? '' : 'none';
    });
};

window.openAdminEnemy = function(idx) {
    _adminEnemyEditing = idx;
    const e = idx >= 0 ? _adminEnemies[idx] : null;
    const isNew = !e;
    const el = document.getElementById('adminTabContent_enemies');
    if (!el) return;

    const s = e?.stats || {};
    const eq = e?.equipment || {};
    const v = (k, fb='') => String(e?.[k] ?? fb).replace(/"/g, '&quot;');

    el.innerHTML = `
        <div style="overflow-y:auto;max-height:65vh;padding:8px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                <button onclick="loadAdminEnemies()" style="padding:4px 10px;background:#1a2a1a;border:1px solid #3a5a3a;color:#8fa;cursor:pointer;border-radius:4px;">← Back</button>
                <span style="color:#d4af37;font-weight:bold;">${isNew ? '➕ New Enemy' : '✏️ ' + (e.name||'')}</span>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
                <div class="admin-field"><label>ID</label>
                    <input type="text" id="ene_id" value="${v('id')}" ${isNew?'':'readonly style="opacity:.5"'}></div>
                <div class="admin-field"><label>Name</label>
                    <input type="text" id="ene_name" value="${v('name')}"></div>
                <div class="admin-field" style="grid-column:span 2"><label>Description</label>
                    <textarea id="ene_desc" style="width:100%;height:50px;">${v('description')}</textarea></div>
                <div class="admin-field"><label>AI Profile</label>
                    <select id="ene_ai">
                        ${['balanced','aggressive','cautious','support','tactical','berserker'].map(p =>
                            `<option value="${p}" ${(e?.aiProfile||'balanced')===p?'selected':''}>${p}</option>`).join('')}
                    </select></div>
                <div class="admin-field"><label>Armor Value</label>
                    <input type="number" id="ene_armor" value="${e?.armorValue||0}"></div>
                <div class="admin-field"><label>Skill Selection Count</label>
                    <input type="number" id="ene_skillcount" value="${e?.skillSelectionCount||2}" min="1" max="5"></div>
                <div class="admin-field"><label>Main Hand Weapon ID</label>
                    <input type="text" id="ene_weapon" value="${eq.mainHand||''}"></div>
            </div>

            <div style="color:#8b7355;font-size:.75rem;letter-spacing:1px;text-transform:uppercase;margin:8px 0 4px;">Stats</div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px;">
                <div class="admin-field"><label>Conviction</label><input type="number" id="ene_con" value="${s.conviction||0}"></div>
                <div class="admin-field"><label>Endurance</label><input type="number" id="ene_end" value="${s.endurance||0}"></div>
                <div class="admin-field"><label>Ambition</label><input type="number" id="ene_amb" value="${s.ambition||0}"></div>
                <div class="admin-field"><label>Harmony</label><input type="number" id="ene_har" value="${s.harmony||0}"></div>
            </div>

            <div style="color:#8b7355;font-size:.75rem;letter-spacing:1px;text-transform:uppercase;margin:8px 0 4px;">Available Skills (comma-separated IDs)</div>
            <div class="admin-field" style="margin-bottom:8px;">
                <textarea id="ene_skills" style="width:100%;height:60px;font-family:monospace;font-size:.82em;">${(e?.availableSkills||[]).join(', ')}</textarea>
            </div>

            <div style="color:#8b7355;font-size:.75rem;letter-spacing:1px;text-transform:uppercase;margin:8px 0 4px;">Tags (comma-separated)</div>
            <div class="admin-field" style="margin-bottom:12px;">
                <input type="text" id="ene_tags" value="${(e?.tags||[]).join(', ')}">
            </div>

            <div style="display:flex;gap:8px;">
                <button class="admin-btn-save" onclick="adminSaveEnemy(${isNew})">${isNew ? '✅ Create' : '💾 Save'}</button>
                ${!isNew ? `<button class="admin-btn-cancel" style="background:#8b2222;" onclick="adminDeleteEnemy()">🗑️ Delete</button>` : ''}
                <button class="admin-btn-cancel" onclick="loadAdminEnemies()">Cancel</button>
            </div>
        </div>`;
};

window.adminSaveEnemy = async function(isNew) {
    const id = document.getElementById('ene_id')?.value.trim();
    if (!id) { alert('ID is required.'); return; }

    const skillsRaw = document.getElementById('ene_skills')?.value || '';
    const tagsRaw   = document.getElementById('ene_tags')?.value || '';

    const payload = {
        id,
        name:        document.getElementById('ene_name')?.value.trim() || id,
        description: document.getElementById('ene_desc')?.value.trim() || '',
        aiProfile:   document.getElementById('ene_ai')?.value || 'balanced',
        armorValue:  parseInt(document.getElementById('ene_armor')?.value) || 0,
        skillSelectionCount: parseInt(document.getElementById('ene_skillcount')?.value) || 2,
        stats: {
            conviction: parseInt(document.getElementById('ene_con')?.value) || 0,
            endurance:  parseInt(document.getElementById('ene_end')?.value) || 0,
            ambition:   parseInt(document.getElementById('ene_amb')?.value) || 0,
            harmony:    parseInt(document.getElementById('ene_har')?.value) || 0,
        },
        equipment: { mainHand: document.getElementById('ene_weapon')?.value.trim() || null },
        availableSkills: skillsRaw.split(',').map(s => s.trim()).filter(Boolean),
        tags: tagsRaw.split(',').map(s => s.trim()).filter(Boolean),
    };

    if (isNew) {
        _adminEnemies.push(payload);
    } else {
        // Merge — preserve fields we don't edit (lootTable, etc.)
        _adminEnemies[_adminEnemyEditing] = { ..._adminEnemies[_adminEnemyEditing], ...payload };
    }

    try {
        const res = await fetch(BACKEND_URL + '/api/admin/data/enemies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(_adminEnemies)
        });
        const data = await res.json();
        if (data.success) {
            if (typeof showSuccess === 'function') showSuccess(`Enemy "${payload.name}" saved. Reload game to see changes.`);
            loadAdminEnemies();
        } else throw new Error(data.error || 'Save failed');
    } catch(e) { alert('Save failed: ' + e.message); }
};

window.adminDeleteEnemy = async function() {
    if (_adminEnemyEditing < 0) return;
    const e = _adminEnemies[_adminEnemyEditing];
    if (!confirm(`Delete "${e.name}"? This cannot be undone.`)) return;
    _adminEnemies.splice(_adminEnemyEditing, 1);
    try {
        await fetch(BACKEND_URL + '/api/admin/data/enemies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(_adminEnemies)
        });
        if (typeof showSuccess === 'function') showSuccess(`Enemy deleted.`);
        loadAdminEnemies();
    } catch(e) { alert('Delete failed: ' + e.message); }
};

// ── Characters Tab ────────────────────────────────────────────────────────────

async function loadAdminCharacters() {
    const el = document.getElementById('adminTabContent_characters');
    if (!el) return;
    el.innerHTML = '<p style="color:#aaa;padding:12px;">Loading...</p>';
    try {
        const res = await fetch(BACKEND_URL + '/api/admin/db/characters');
        const rows = await res.json();
        if (!rows.length) { el.innerHTML = '<p style="color:#888;padding:12px;">No characters found.</p>'; return; }
        el.innerHTML = `
            <table style="width:100%;border-collapse:collapse;font-size:.85em;">
                <thead><tr style="color:#aaa;border-bottom:1px solid #333;">
                    <th style="text-align:left;padding:6px;">Name</th>
                    <th style="text-align:left;padding:6px;">Race</th>
                    <th style="text-align:center;padding:6px;">Lvl</th>
                    <th style="text-align:center;padding:6px;">XP</th>
                    <th style="padding:6px;"></th>
                </tr></thead>
                <tbody>${rows.map(r => `
                    <tr style="border-bottom:1px solid #222;" id="char-row-${r.id}">
                        <td style="padding:6px;">${r.name}</td>
                        <td style="padding:6px;color:#aaa;">${r.race}</td>
                        <td style="padding:6px;text-align:center;">${r.level}</td>
                        <td style="padding:6px;text-align:center;">${(r.experience||0).toLocaleString()}</td>
                        <td style="padding:6px;text-align:right;">
                            <button onclick="adminViewCharacter('${r.id}')" style="margin-right:4px;padding:2px 8px;background:#1a2a3a;border:1px solid #345;color:#8af;cursor:pointer;border-radius:3px;">View</button>
                            <button onclick="adminDeleteCharacter('${r.id}','${r.name}')" style="padding:2px 8px;background:#2a1a1a;border:1px solid #533;color:#f88;cursor:pointer;border-radius:3px;">Delete</button>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>`;
    } catch(e) { el.innerHTML = `<p style="color:#f88;padding:12px;">Error: ${e.message}</p>`; }
}

window.adminViewCharacter = async function(id) {
    try {
        const res = await fetch(BACKEND_URL + '/api/admin/db/characters/' + encodeURIComponent(id));
        const char = await res.json();
        const info = `Name: ${char.name}\nRace: ${char.race}\nLevel: ${char.level}\nXP: ${char.experience}\nSkills: ${(char.skills||[]).length}\nEquipment: ${JSON.stringify(char.equipment||{},null,2)}`;
        alert(info);
    } catch(e) { alert('Error: ' + e.message); }
};

window.adminDeleteCharacter = async function(id, name) {
    if (!confirm(`Delete character "${name}"? This cannot be undone.`)) return;
    try {
        const res = await fetch(BACKEND_URL + '/api/admin/db/characters/' + encodeURIComponent(id), { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            const row = document.getElementById('char-row-' + id);
            if (row) row.remove();
        } else { alert('Delete failed: ' + JSON.stringify(data)); }
    } catch(e) { alert('Error: ' + e.message); }
};

// ── Snapshots Tab ─────────────────────────────────────────────────────────────

async function loadAdminSnapshots() {
    const el = document.getElementById('adminTabContent_snapshots');
    if (!el) return;
    el.innerHTML = '<p style="color:#aaa;padding:12px;">Loading...</p>';
    try {
        const res = await fetch(BACKEND_URL + '/api/admin/db/snapshots');
        const rows = await res.json();
        if (!rows.length) { el.innerHTML = '<p style="color:#888;padding:12px;">No snapshots found.</p>'; return; }
        el.innerHTML = `
            <table style="width:100%;border-collapse:collapse;font-size:.85em;">
                <thead><tr style="color:#aaa;border-bottom:1px solid #333;">
                    <th style="text-align:left;padding:6px;">Name</th>
                    <th style="text-align:left;padding:6px;">Code</th>
                    <th style="text-align:center;padding:6px;">Lvl</th>
                    <th style="text-align:center;padding:6px;">Public</th>
                    <th style="text-align:center;padding:6px;">Imports</th>
                    <th style="padding:6px;"></th>
                </tr></thead>
                <tbody>${rows.map(r => `
                    <tr style="border-bottom:1px solid #222;" id="snap-row-${r.snapshot_id}">
                        <td style="padding:6px;">${r.character_name}</td>
                        <td style="padding:6px;color:#aaa;font-family:monospace;">${r.share_code}</td>
                        <td style="padding:6px;text-align:center;">${r.level}</td>
                        <td style="padding:6px;text-align:center;">${r.is_public ? '✓' : '—'}</td>
                        <td style="padding:6px;text-align:center;">${r.import_count||0}</td>
                        <td style="padding:6px;text-align:right;">
                            <button onclick="adminDeleteSnapshot('${r.snapshot_id}','${r.character_name}')" style="padding:2px 8px;background:#2a1a1a;border:1px solid #533;color:#f88;cursor:pointer;border-radius:3px;">Delete</button>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>`;
    } catch(e) { el.innerHTML = `<p style="color:#f88;padding:12px;">Error: ${e.message}</p>`; }
}

window.adminDeleteSnapshot = async function(id, name) {
    if (!confirm(`Delete snapshot for "${name}"? This removes the share code.`)) return;
    try {
        const res = await fetch(BACKEND_URL + '/api/admin/db/snapshots/' + encodeURIComponent(id), { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            const row = document.getElementById('snap-row-' + id);
            if (row) row.remove();
        } else { alert('Delete failed: ' + JSON.stringify(data)); }
    } catch(e) { alert('Error: ' + e.message); }
};

// ── DB Query Tab ──────────────────────────────────────────────────────────────

function renderAdminDB() {
    const el = document.getElementById('adminTabContent_db');
    if (!el || el.dataset.rendered) return;
    el.dataset.rendered = '1';
    el.innerHTML = `
        <div style="padding:12px;">
            <p style="color:#aaa;margin-bottom:8px;font-size:.85em;">SELECT and PRAGMA queries only.</p>
            <textarea id="adminDbQuery" placeholder="SELECT * FROM characters LIMIT 10"
                style="width:100%;box-sizing:border-box;height:80px;background:#111;color:#ddd;border:1px solid #333;padding:8px;font-family:monospace;font-size:.85em;border-radius:4px;resize:vertical;"></textarea>
            <div style="display:flex;gap:8px;margin-top:8px;">
                <button onclick="adminRunQuery()" style="padding:6px 16px;background:#1a3a2a;border:1px solid #3a6a4a;color:#8fa;cursor:pointer;border-radius:4px;">Run Query</button>
                <button onclick="adminClearLogs()" style="padding:6px 16px;background:#2a1a1a;border:1px solid #533;color:#f88;cursor:pointer;border-radius:4px;">Clear All Combat Logs</button>
            </div>
            <div id="adminDbResults" style="margin-top:12px;max-height:50vh;overflow-y:auto;"></div>
        </div>`;
}

window.adminRunQuery = async function() {
    const sql = document.getElementById('adminDbQuery')?.value?.trim();
    if (!sql) return;
    const results = document.getElementById('adminDbResults');
    results.innerHTML = '<p style="color:#aaa;">Running...</p>';
    try {
        const res = await fetch(BACKEND_URL + '/api/admin/db/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql })
        });
        const data = await res.json();
        if (data.error) { results.innerHTML = `<p style="color:#f88;">${data.error}</p>`; return; }
        if (!data.rows.length) { results.innerHTML = '<p style="color:#888;">No results.</p>'; return; }
        const cols = Object.keys(data.rows[0]);
        results.innerHTML = `
            <p style="color:#aaa;font-size:.8em;margin-bottom:6px;">${data.count} row(s)</p>
            <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:.8em;">
                <thead><tr style="color:#aaa;border-bottom:1px solid #333;">
                    ${cols.map(c => `<th style="text-align:left;padding:4px 8px;">${c}</th>`).join('')}
                </tr></thead>
                <tbody>${data.rows.map(row => `
                    <tr style="border-bottom:1px solid #1a1a1a;">
                        ${cols.map(c => `<td style="padding:4px 8px;color:#ccc;">${String(row[c] ?? '')}</td>`).join('')}
                    </tr>`).join('')}
                </tbody>
            </table></div>`;
    } catch(e) { results.innerHTML = `<p style="color:#f88;">Error: ${e.message}</p>`; }
};

window.adminClearLogs = async function() {
    if (!confirm('Delete ALL combat logs? This frees up space but removes all history.')) return;
    try {
        const res = await fetch(BACKEND_URL + '/api/admin/db/combat-logs', { method: 'DELETE' });
        const data = await res.json();
        if (data.success) alert(`Cleared ${data.deleted} combat logs.`);
        else alert('Failed: ' + JSON.stringify(data));
    } catch(e) { alert('Error: ' + e.message); }
};

// ── Skill Editor Tab ──────────────────────────────────────────────────────────

let _adminSkills        = [];
let _adminSkillIdx      = -1;
let _adminSkillEffects  = [];
const ALL_STATUSES = ["all_stats","ambition_edge","ambition_falter","amplify","arcane_burn","armor_break","attack_boost","barrier","berserker_stance_buff","bleed","blind","bloodlust_buff","burn","chilled","confused","conviction_drain","conviction_surge","counter_ready","cursed","cursed_blood","dazed","deep_wound","defense","echo","electrified","endurance_crack","endurance_shield","evasion_boost","exhaustion","focus","fortify_buff","fortitude","freeze","harmony","harmony_bond","harmony_discord","haste","knockback","life_leech","loot_luck","mana_burn","marked","poison","poison_deadly","poison_strong","poison_weak","poison_weapon","protection","provoked","regen","shadowed","silence","siphon_ward","sleep","slow","speed_boost","spell_amplification","stealth","strength","stun","stun_weapon","taunt","unity","weaken"];

window.switchSkillSubTab = function(tab) {
    document.getElementById('skillSubContent_edit').style.display = tab === 'edit' ? 'block' : 'none';
    document.getElementById('skillSubContent_tree').style.display = tab === 'tree' ? 'block' : 'none';
    document.getElementById('skillSubTab_edit').style.background  = tab === 'edit' ? '#1a3a2a' : '#2a3a2a';
    document.getElementById('skillSubTab_edit').style.color       = tab === 'edit' ? '#8fa' : '#888';
    document.getElementById('skillSubTab_tree').style.background  = tab === 'tree' ? '#1a3a2a' : '#2a3a2a';
    document.getElementById('skillSubTab_tree').style.color       = tab === 'tree' ? '#8fa' : '#888';
    if (tab === 'edit' && !_adminSkills.length) _adminLoadSkills();
    if (tab === 'tree') renderAdminSkillTree();
};

async function _adminLoadSkills() {
    try {
        const res = await fetch(BACKEND_URL + '/api/data/skills');
        _adminSkills = await res.json();
        adminFilterSkills();
    } catch(e) { console.error('[ADMIN] skill load failed:', e); }
}

window.adminFilterSkills = function(q) {
    const search = (q !== undefined ? q : document.getElementById('adminSkillSearch')?.value || '').toLowerCase();
    const catF   = document.getElementById('adminSkillCatFilter')?.value || '';
    const sel    = document.getElementById('adminSkillSelect');
    if (!sel) return;
    sel.innerHTML = '';
    let count = 0;
    [..._adminSkills]
        .map((s, i) => ({ s, i }))
        .sort((a, b) => a.s.name.localeCompare(b.s.name))
        .forEach(({ s, i }) => {
            if (catF && s.category !== catF) return;
            if (search && !s.name.toLowerCase().includes(search) && !s.id.toLowerCase().includes(search)) return;
            const tag = s.isStarterSkill ? '⭐ ' : (s.parentSkills?.length === 2) ? '🔮 ' : '';
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `${tag}${s.name} (${s.id})`;
            sel.appendChild(opt);
            count++;
        });
    const countEl = document.getElementById('adminSkillCount');
    if (countEl) countEl.textContent = `${count} skill${count !== 1 ? 's' : ''} shown`;
};

window.openAdminSkill = function(idx) {
    _adminSkillIdx = idx;
    const s = idx >= 0 ? _adminSkills[idx] : null;
    const isNew = !s;
    const el = document.getElementById('adminSkillEditor');
    if (!el) return;

    _adminSkillEffects = s ? JSON.parse(JSON.stringify(s.effects || [])) : [];

    const v = (k, fb = '') => String(s?.[k] ?? fb);
    const n = (k, fb = 0)  => s?.[k] ?? fb;

    const isChild = !!(s?.parentSkills?.length === 2);
    const hitCountType = s?.hitCount?.min !== undefined ? 'range' : 'fixed';

    const CATS = ['DAMAGE_SINGLE','DAMAGE_MAGIC','DAMAGE_AOE','DAMAGE_PROC','HEALING','HEALING_AOE','HEALING_PROC','RESTORATION','BUFF','DEFENSE','DEFENSE_PROC','CONTROL','CONTROL_PROC','UTILITY','UTILITY_PROC','TRAP','CONSUMABLE_HEALING','CONSUMABLE_DAMAGE','CONSUMABLE_RESTORATION','CONSUMABLE_ESCAPE','NO_RESOURCES','WEAPON_SKILL'];
    const catOpts = CATS.map(c => `<option value="${c}" ${v('category') === c ? 'selected' : ''}>${c}</option>`).join('');

    el.innerHTML = `
        <div style="border-top:1px solid #1a2a3a;padding-top:10px;">
            <div style="color:#d4af37;font-weight:bold;margin-bottom:8px;">${isNew ? '➕ New Skill' : '✏️ ' + (s.name || '')}</div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
                <div class="admin-field"><label>ID</label>
                    <input type="text" id="sk_id" value="${v('id')}" ${isNew ? '' : 'readonly style="opacity:.5"'}></div>
                <div class="admin-field"><label>Name</label>
                    <input type="text" id="sk_name" value="${v('name')}" oninput="${isNew ? 'adminAutoSkillId(this.value)' : ''}"></div>
                <div class="admin-field"><label>Category</label>
                    <select id="sk_cat">${catOpts}</select></div>
                <div class="admin-field"><label>Cost Type</label>
                    <select id="sk_costtype">
                        ${['stamina','mana','none'].map(c => `<option value="${c}" ${v('costType')===c?'selected':''}>${c}</option>`).join('')}
                    </select></div>
                <div class="admin-field"><label>Cost Amount</label>
                    <input type="number" id="sk_costamt" value="${n('costAmount',5)}"></div>
                <div class="admin-field"><label>Base Power</label>
                    <input type="number" step="0.1" id="sk_power" value="${n('basePower',1.0)}"></div>
                <div class="admin-field"><label>Hit Chance</label>
                    <input type="number" step="0.01" id="sk_hitchance" value="${n('baseHitChance',0.95)}"></div>
                <div class="admin-field"><label>Crit Chance</label>
                    <input type="number" step="0.01" id="sk_critchance" value="${n('critChance',0.05)}"></div>
                <div class="admin-field"><label>Crit Multiplier</label>
                    <input type="number" step="0.1" id="sk_critmult" value="${n('critMultiplier',1.5)}"></div>
                <div class="admin-field"><label>Delay (ms)</label>
                    <input type="number" id="sk_delay" value="${n('delay',1000)}"></div>
            </div>

            <div class="admin-field" style="margin-bottom:6px;"><label>Description</label>
                <textarea id="sk_desc" style="width:100%;height:44px;">${v('description')}</textarea></div>

            <div style="color:#8b7355;font-size:.73rem;letter-spacing:1px;text-transform:uppercase;margin:6px 0 3px;">Scaling Factors</div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:6px;">
                <div class="admin-field"><label>Conviction</label><input type="number" step="0.1" id="sk_sc_con" value="${n('scalingFactors.conviction',0)||s?.scalingFactors?.conviction||0}"></div>
                <div class="admin-field"><label>Endurance</label><input type="number" step="0.1" id="sk_sc_end" value="${s?.scalingFactors?.endurance||0}"></div>
                <div class="admin-field"><label>Ambition</label><input type="number" step="0.1" id="sk_sc_amb" value="${s?.scalingFactors?.ambition||0}"></div>
                <div class="admin-field"><label>Harmony</label><input type="number" step="0.1" id="sk_sc_har" value="${s?.scalingFactors?.harmony||0}"></div>
            </div>

            <div style="display:flex;gap:16px;margin-bottom:6px;font-size:.82em;">
                <label><input type="checkbox" id="sk_isStarter" ${s?.isStarterSkill?'checked':''}> Starter Skill</label>
                <label><input type="checkbox" id="sk_isChild" ${isChild?'checked':''} onchange="adminToggleChildFields()"> Child Skill</label>
            </div>

            <div id="sk_childFields" style="display:${isChild?'block':'none'};margin-bottom:6px;background:rgba(0,0,0,0.2);padding:8px;border-radius:4px;">
                <div style="color:#8b7355;font-size:.73rem;text-transform:uppercase;margin-bottom:4px;">Parent Skills</div>
                <div style="display:grid;grid-template-columns:1fr 1fr 80px;gap:6px;">
                    <div class="admin-field"><label>Parent 1 ID</label>
                        <input type="text" id="sk_parent1" value="${s?.parentSkills?.[0]||''}"></div>
                    <div class="admin-field"><label>Parent 2 ID</label>
                        <input type="text" id="sk_parent2" value="${s?.parentSkills?.[1]||''}"></div>
                    <div class="admin-field"><label>Proc %</label>
                        <input type="number" step="0.01" id="sk_procchance" value="${n('procChance',0.05)}"></div>
                </div>
            </div>

            <div style="color:#8b7355;font-size:.73rem;letter-spacing:1px;text-transform:uppercase;margin:6px 0 3px;">
                Effects
                <button onclick="adminOpenEffectModal(null)" style="margin-left:8px;padding:2px 8px;background:#1a2a3a;border:1px solid #345;color:#8af;cursor:pointer;border-radius:3px;font-size:.75rem;">+ Add</button>
            </div>
            <div id="sk_effectsList" style="margin-bottom:8px;"></div>

            <div style="display:flex;gap:6px;">
                <button class="admin-btn-save" onclick="adminSaveSkill(${isNew})">${isNew ? '✅ Create' : '💾 Save'}</button>
                ${!isNew ? `<button class="admin-btn-cancel" style="background:#8b2222;" onclick="adminDeleteSkill()">🗑️ Delete</button>` : ''}
                <button class="admin-btn-cancel" onclick="document.getElementById('adminSkillEditor').style.display='none'">Cancel</button>
            </div>
        </div>`;

    _adminRenderEffectsList();
    el.style.display = 'block';
};

window.adminAutoSkillId = function(name) {
    const el = document.getElementById('sk_id');
    if (!el || el.dataset.userEdited === 'true') return;
    el.value = name.toLowerCase().replace(/[^a-z0-9\s]/g,'').trim().replace(/\s+/g,'_');
};

window.adminToggleChildFields = function() {
    const show = document.getElementById('sk_isChild')?.checked;
    const f = document.getElementById('sk_childFields');
    if (f) f.style.display = show ? 'block' : 'none';
};

function _adminRenderEffectsList() {
    const el = document.getElementById('sk_effectsList');
    if (!el) return;
    if (!_adminSkillEffects.length) { el.innerHTML = '<div style="color:#555;font-size:.8em;">No effects.</div>'; return; }
    el.innerHTML = _adminSkillEffects.map((eff, i) => {
        const statusId = eff.buff || eff.debuff || '';
        const extras = [eff.damageType, statusId, eff.resource,
            eff.magnitude !== undefined ? `mag:${eff.magnitude}` : '',
            eff.duration ? `${eff.duration}t` : '',
        ].filter(Boolean).join(' ');
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 6px;background:rgba(0,0,0,0.25);border-radius:3px;margin-bottom:3px;font-size:.8em;">
            <span style="color:#ccc;"><strong style="color:#d4af37;">${eff.type}</strong> → <em style="color:#aaa;">${eff.targets}</em> <span style="color:#666;">${extras}</span></span>
            <div style="display:flex;gap:4px;">
                <button onclick="adminOpenEffectModal(${i})" style="padding:1px 6px;background:#1a2a3a;border:1px solid #345;color:#8af;cursor:pointer;border-radius:3px;">Edit</button>
                <button onclick="adminRemoveEffect(${i})" style="padding:1px 6px;background:#2a1a1a;border:1px solid #533;color:#f88;cursor:pointer;border-radius:3px;">✕</button>
            </div>
        </div>`;
    }).join('');
}

window.adminRemoveEffect = function(i) {
    _adminSkillEffects.splice(i, 1);
    _adminRenderEffectsList();
};

window.adminOpenEffectModal = function(idx) {
    const eff = (idx !== null && _adminSkillEffects[idx]) ? _adminSkillEffects[idx] : {};
    document.getElementById('eff-idx').value    = idx === null ? '' : idx;
    document.getElementById('eff-type').value   = eff.type    || 'damage';
    document.getElementById('eff-targets').value = eff.targets || 'single_enemy';
    document.getElementById('eff-chance').value = String(eff.chance ?? 1.0);
    document.getElementById('eff-dmgtype').value = eff.damageType || 'physical';
    document.getElementById('eff-ignorearmor').value = eff.ignoreArmor ?? 0;
    document.getElementById('eff-magnitude').value = eff.magnitude ?? 1.0;
    document.getElementById('eff-duration').value = eff.duration ?? 2;
    document.getElementById('eff-resource').value = eff.resource || 'stamina';
    document.getElementById('eff-scalesby').value = eff.scalesBy || 'harmony';
    adminPopulateStatusList(eff.buff || eff.debuff || '');
    adminUpdateEffectFields();
    document.getElementById('adminEffectModal').style.display = 'flex';
};

window.adminUpdateEffectFields = function() {
    const type = document.getElementById('eff-type').value;
    document.getElementById('eff-damage-fields').style.display  = type === 'damage' ? 'grid' : 'none';
    document.getElementById('eff-buff-fields').style.display    = ['apply_buff','apply_debuff'].includes(type) ? 'block' : 'none';
    document.getElementById('eff-resource-fields').style.display = type === 'restore_resource' ? 'block' : 'none';
    document.getElementById('eff-magnitude-fields').style.display = !['dispel','cleanse','utility'].includes(type) ? 'grid' : 'none';
    if (['apply_buff','apply_debuff'].includes(type)) adminPopulateStatusList(document.getElementById('eff-buff')?.value || '');
};

window.adminPopulateStatusList = function(selected) {
    const search = (document.getElementById('eff-buff-search')?.value || '').toLowerCase();
    const sel = document.getElementById('eff-buff');
    if (!sel) return;
    sel.innerHTML = '';
    ALL_STATUSES.filter(s => !search || s.includes(search)).forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = s;
        if (s === selected) opt.selected = true;
        sel.appendChild(opt);
    });
};

window.adminFilterStatusList = function(q) { adminPopulateStatusList(document.getElementById('eff-buff')?.value || ''); };

window.adminConfirmSaveEffect = function() {
    const idxVal = document.getElementById('eff-idx').value;
    const idx    = idxVal === '' ? null : parseInt(idxVal);
    const type   = document.getElementById('eff-type').value;

    const eff = {
        type,
        targets: document.getElementById('eff-targets').value,
        chance:  parseFloat(document.getElementById('eff-chance').value) || 1.0,
    };
    if (!['dispel','cleanse','utility'].includes(type)) {
        const mag = parseFloat(document.getElementById('eff-magnitude').value);
        if (!isNaN(mag)) eff.magnitude = mag;
        const sb = document.getElementById('eff-scalesby').value;
        if (sb) eff.scalesBy = sb;
    }
    if (type === 'damage') {
        const dt = document.getElementById('eff-dmgtype').value;
        if (dt) eff.damageType = dt;
        const ia = parseFloat(document.getElementById('eff-ignorearmor').value);
        if (ia > 0) eff.ignoreArmor = ia;
    }
    if (type === 'apply_buff' || type === 'apply_debuff') {
        const statusId = document.getElementById('eff-buff').value;
        if (statusId) { type === 'apply_buff' ? (eff.buff = statusId) : (eff.debuff = statusId); }
        const dur = parseInt(document.getElementById('eff-duration').value);
        if (!isNaN(dur)) eff.duration = dur;
    }
    if (type === 'restore_resource') eff.resource = document.getElementById('eff-resource').value;

    if (idx !== null) _adminSkillEffects[idx] = eff;
    else _adminSkillEffects.push(eff);

    _adminRenderEffectsList();
    document.getElementById('adminEffectModal').style.display = 'none';
};

window.adminSaveSkill = async function(isNew) {
    const id   = document.getElementById('sk_id')?.value.trim();
    const name = document.getElementById('sk_name')?.value.trim();
    if (!id || !name) { alert('ID and name are required.'); return; }

    const isChild  = document.getElementById('sk_isChild')?.checked;
    const parent1  = document.getElementById('sk_parent1')?.value.trim();
    const parent2  = document.getElementById('sk_parent2')?.value.trim();

    const skill = {
        id, name,
        category:      document.getElementById('sk_cat')?.value,
        description:   document.getElementById('sk_desc')?.value.trim() || '',
        basePower:     parseFloat(document.getElementById('sk_power')?.value) || 1.0,
        costType:      document.getElementById('sk_costtype')?.value,
        costAmount:    parseInt(document.getElementById('sk_costamt')?.value) || 0,
        requiredLevel: 1,
        baseHitChance: parseFloat(document.getElementById('sk_hitchance')?.value) || 0.95,
        critChance:    parseFloat(document.getElementById('sk_critchance')?.value) || 0.05,
        critMultiplier: parseFloat(document.getElementById('sk_critmult')?.value) || 1.5,
        delay:         parseInt(document.getElementById('sk_delay')?.value) || 1000,
        hitCount:      { fixed: 1 },
        scalingFactors: {
            conviction: parseFloat(document.getElementById('sk_sc_con')?.value) || 0,
            endurance:  parseFloat(document.getElementById('sk_sc_end')?.value) || 0,
            ambition:   parseFloat(document.getElementById('sk_sc_amb')?.value) || 0,
            harmony:    parseFloat(document.getElementById('sk_sc_har')?.value) || 0,
        },
        effects: _adminSkillEffects,
    };
    if (document.getElementById('sk_isStarter')?.checked) skill.isStarterSkill = true;
    if (isChild && parent1 && parent2) {
        skill.isChildSkill = true;
        skill.isStarterSkill = false;
        skill.parentSkills = [parent1, parent2];
        skill.procChance = parseFloat(document.getElementById('sk_procchance')?.value) || 0.05;
    }

    if (isNew) {
        if (_adminSkills.some(s => s.id === id)) { alert('Skill ID already exists.'); return; }
        _adminSkills.push(skill);
        _adminSkillIdx = _adminSkills.length - 1;
    } else {
        // Preserve fields not shown in the editor (tags, etc.)
        _adminSkills[_adminSkillIdx] = { ..._adminSkills[_adminSkillIdx], ...skill };
    }

    try {
        const res = await fetch(BACKEND_URL + '/api/admin/data/skills', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(_adminSkills)
        });
        const data = await res.json();
        if (data.success) {
            if (typeof showSuccess === 'function') showSuccess(`Skill "${name}" saved. Reload game to see changes.`);
            adminFilterSkills();
            document.getElementById('adminSkillEditor').style.display = 'none';
        } else throw new Error(data.error || 'Save failed');
    } catch(e) { alert('Save failed: ' + e.message); }
};

window.adminDeleteSkill = async function() {
    if (_adminSkillIdx < 0) return;
    const s = _adminSkills[_adminSkillIdx];
    if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) return;
    _adminSkills.splice(_adminSkillIdx, 1);
    _adminSkillIdx = -1;
    try {
        await fetch(BACKEND_URL + '/api/admin/data/skills', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(_adminSkills)
        });
        if (typeof showSuccess === 'function') showSuccess('Skill deleted.');
        adminFilterSkills();
        document.getElementById('adminSkillEditor').style.display = 'none';
    } catch(e) { alert('Delete failed: ' + e.message); }
};
