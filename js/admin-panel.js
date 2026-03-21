// js/admin-panel.js
// In-game admin panel: item browser + editor. Triggered by ~ key + password.
// Wrapped in an IIFE — no top-level declarations that conflict with game-data.js.

(function() {
    'use strict';

    let adminItems    = [];
    let editingItemId = null;
    let isUnlocked    = false;
    const ADMIN_PASSWORD = 'marsh540!vault';

    // ~ key triggers password prompt, then opens panel
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

    // Called by index.html onclick="closeAdminPanel()"
    window.closeAdminPanel = function() {
        const p = document.getElementById('adminPanel');
        if (p) p.style.display = 'none';
    };

    // Called by index.html onclick="openAdminEditor()" and from item rows
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
        const wrap = document.querySelector('#adminPanel .admin-panel-container');
        if (!wrap) return;
        wrap.innerHTML = `
            <div class="admin-header">
                <h2>🔧 Admin Panel</h2>
                <button onclick="closeAdminPanel()" class="admin-close-btn">Close</button>
            </div>
            <div class="admin-search">
                <input type="text" class="admin-search-input" placeholder="Search items..."
                       id="adminSearchInput" oninput="adminFilterItems(this.value)">
                <button class="admin-btn-create" onclick="openAdminEditor()">+ Create Item</button>
            </div>
            <div class="admin-items-list" id="adminItemsList"></div>
            <div class="admin-footer">Admin Panel v1.0 | Shards Idle</div>
        `;
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
            row.innerHTML = `
                <div class="admin-item-info">
                    <div class="admin-item-name">${esc(item.name)} <span style="color:#666;font-size:.8em">[${esc(item.id)}]</span></div>
                    <div class="admin-item-meta">${esc(item.type||'unknown')} · ${esc(item.rarity||'common')}</div>
                </div>
                <div class="admin-item-stats">
                    ${item.dmg1 ? 'DMG: '+item.dmg1 : ''}
                    ${item.armor ? ' ARM: '+item.armor : ''}
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
            (i.type||'').toLowerCase().includes(lq)
        ));
    };

    // ── Editor view ───────────────────────────────────────────────────────────
    function renderEditor(item) {
        const isNew = !item;
        editingItemId = item ? item.id : null;
        const wrap = document.querySelector('#adminPanel .admin-panel-container');
        if (!wrap) return;

        const sb = item?.statBonuses || {};
        const v  = (k, fb='') => esc(String(item?.[k] ?? fb));

        wrap.innerHTML = `
            <div class="admin-header">
                <button onclick="adminBackToList()" class="admin-back-btn">← Back</button>
                <h2>${isNew ? '➕ New Item' : '✏️ ' + esc(item.name)}</h2>
                <button onclick="closeAdminPanel()" class="admin-close-btn">Close</button>
            </div>
            <div class="admin-editor">

                <div class="admin-editor-section">
                    <h3>Identity</h3>
                    <div class="admin-field"><label>ID</label>
                        <input type="text" id="ae_id" value="${v('id')}" ${isNew?'':'readonly style="opacity:.5"'}></div>
                    <div class="admin-field"><label>Name</label>
                        <input type="text" id="ae_name" value="${v('name')}"></div>
                    <div class="admin-field"><label>Type</label>
                        <input type="text" id="ae_type" value="${v('type')}"></div>
                    <div class="admin-field"><label>Rarity</label>
                        <input type="text" id="ae_rarity" value="${v('rarity','common')}"></div>
                    <div class="admin-field"><label>Slot</label>
                        <input type="text" id="ae_slot_id1" value="${v('slot_id1')}"></div>
                    <div class="admin-field"><label>Description</label>
                        <textarea id="ae_description">${v('description')}</textarea></div>
                </div>

                <div class="admin-editor-section">
                    <h3>Damage</h3>
                    <div class="admin-stats-grid">
                        <div class="admin-field"><label>DMG 1</label><input type="number" id="ae_dmg1" value="${v('dmg1',0)}"></div>
                        <div class="admin-field"><label>Type 1</label><input type="text" id="ae_dmg_type_1" value="${v('dmg_type_1')}"></div>
                        <div class="admin-field"><label>DMG 2</label><input type="number" id="ae_dmg2" value="${v('dmg2',0)}"></div>
                        <div class="admin-field"><label>Type 2</label><input type="text" id="ae_dmg_type_2" value="${v('dmg_type_2')}"></div>
                    </div>
                </div>

                <div class="admin-editor-section">
                    <h3>Defense &amp; Stats</h3>
                    <div class="admin-stats-grid">
                        <div class="admin-field"><label>Armor</label><input type="number" id="ae_armor" value="${v('armor',0)}"></div>
                        <div class="admin-field"><label>Delay (1-3)</label><input type="number" id="ae_delay" value="${v('delay',2)}" min="1" max="3"></div>
                    </div>
                    <div style="margin-top:10px;color:#888;font-size:.85em">Stat Bonuses</div>
                    <div class="admin-stats-grid" style="margin-top:6px">
                        <div class="admin-field"><label>Conv.</label><input type="number" id="ae_sc" value="${sb.conviction||0}"></div>
                        <div class="admin-field"><label>End.</label><input type="number" id="ae_se" value="${sb.endurance||0}"></div>
                        <div class="admin-field"><label>Amb.</label><input type="number" id="ae_sa" value="${sb.ambition||0}"></div>
                        <div class="admin-field"><label>Harm.</label><input type="number" id="ae_sh" value="${sb.harmony||0}"></div>
                    </div>
                </div>

                <div class="admin-editor-section">
                    <h3>On-Hit Procs</h3>
                    <div class="admin-stats-grid">
                        <div class="admin-field"><label>Skill 1</label><input type="text" id="ae_oh1id" value="${v('onhit_skillid_1')}"></div>
                        <div class="admin-field"><label>Chance 1 %</label><input type="number" id="ae_oh1ch" value="${v('onhit_skillchance_1',0)}"></div>
                        <div class="admin-field"><label>Skill 2</label><input type="text" id="ae_oh2id" value="${v('onhit_skillid_2')}"></div>
                        <div class="admin-field"><label>Chance 2 %</label><input type="number" id="ae_oh2ch" value="${v('onhit_skillchance_2',0)}"></div>
                    </div>
                </div>

                <div class="admin-actions">
                    <button class="admin-btn-save" onclick="adminSaveItem(${isNew})">
                        ${isNew ? '✅ Create' : '💾 Save'}
                    </button>
                    ${!isNew ? `<button class="admin-btn-cancel" style="background:#8b2222"
                        onclick="adminDeleteItem('${editingItemId}')">🗑️ Delete</button>` : ''}
                    <button class="admin-btn-cancel" onclick="adminBackToList()">Cancel</button>
                </div>
            </div>`;
    }

    window.adminBackToList = function() {
        editingItemId = null;
        renderList(adminItems);
    };

    // ── Save / Delete ─────────────────────────────────────────────────────────
    window.adminSaveItem = async function(isNew) {
        const id = document.getElementById('ae_id')?.value.trim();
        if (!id) { alert('ID is required.'); return; }

        const num = id => { const n = parseFloat(document.getElementById(id)?.value); return isNaN(n)||n===0 ? undefined : n; };
        const str = id => { const s = document.getElementById(id)?.value.trim(); return s||undefined; };

        const statBonuses = {
            conviction: parseFloat(document.getElementById('ae_sc')?.value)||0,
            endurance:  parseFloat(document.getElementById('ae_se')?.value)||0,
            ambition:   parseFloat(document.getElementById('ae_sa')?.value)||0,
            harmony:    parseFloat(document.getElementById('ae_sh')?.value)||0,
        };

        const payload = {
            id,
            name:               document.getElementById('ae_name')?.value.trim() || id,
            type:               str('ae_type'),
            rarity:             str('ae_rarity') || 'common',
            description:        str('ae_description'),
            slot_id1:           str('ae_slot_id1'),
            dmg1:               num('ae_dmg1'),
            dmg_type_1:         str('ae_dmg_type_1'),
            dmg2:               num('ae_dmg2'),
            dmg_type_2:         str('ae_dmg_type_2'),
            armor:              num('ae_armor'),
            delay:              num('ae_delay'),
            onhit_skillid_1:    str('ae_oh1id'),
            onhit_skillchance_1:num('ae_oh1ch'),
            onhit_skillid_2:    str('ae_oh2id'),
            onhit_skillchance_2:num('ae_oh2ch'),
        };

        // Only include statBonuses if at least one is non-zero
        if (Object.values(statBonuses).some(v => v !== 0)) payload.statBonuses = statBonuses;

        // Strip undefined
        Object.keys(payload).forEach(k => { if (payload[k] === undefined) delete payload[k]; });

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
            console.error('[ADMIN]', err);
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
            console.error('[ADMIN]', err);
        }
    };

    // ── Utility ───────────────────────────────────────────────────────────────
    function esc(s) {
        return String(s)
            .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
            .replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

})();

// ── Skill Tree Tab ────────────────────────────────────────────────────────────

window.switchAdminTab = function(tab) {
    const tabs = ['items', 'skills', 'characters', 'snapshots', 'db'];
    tabs.forEach(t => {
        const content = document.getElementById('adminTabContent_' + t);
        if (content) content.style.display = t === tab ? 'block' : 'none';
        const btn = document.getElementById('adminTab_' + t) ||
                    document.getElementById('adminTabItems'); // fallback for items
        if (btn && btn.id === 'adminTab_' + t) btn.style.background = t === tab ? '' : '#2a3a2a';
    });
    // items tab button has different ID
    const itemsBtn = document.getElementById('adminTabItems');
    if (itemsBtn) itemsBtn.style.background = tab === 'items' ? '' : '#2a3a2a';
    if (tab === 'skills')     renderAdminSkillTree();
    if (tab === 'characters') loadAdminCharacters();
    if (tab === 'snapshots')  loadAdminSnapshots();
    if (tab === 'db')         renderAdminDB();
};

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
                    <tr style="border-bottom:1px solid #222;" id="char-row-${esc(r.id)}">
                        <td style="padding:6px;">${esc(r.name)}</td>
                        <td style="padding:6px;color:#aaa;">${esc(r.race)}</td>
                        <td style="padding:6px;text-align:center;">${r.level}</td>
                        <td style="padding:6px;text-align:center;">${(r.experience||0).toLocaleString()}</td>
                        <td style="padding:6px;text-align:right;">
                            <button onclick="adminViewCharacter('${esc(r.id)}')" style="margin-right:4px;padding:2px 8px;background:#1a2a3a;border:1px solid #345;color:#8af;cursor:pointer;border-radius:3px;">View</button>
                            <button onclick="adminDeleteCharacter('${esc(r.id)}','${esc(r.name)}')" style="padding:2px 8px;background:#2a1a1a;border:1px solid #533;color:#f88;cursor:pointer;border-radius:3px;">Delete</button>
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
                    <tr style="border-bottom:1px solid #222;" id="snap-row-${esc(r.snapshot_id)}">
                        <td style="padding:6px;">${esc(r.character_name)}</td>
                        <td style="padding:6px;color:#aaa;font-family:monospace;">${esc(r.share_code)}</td>
                        <td style="padding:6px;text-align:center;">${r.level}</td>
                        <td style="padding:6px;text-align:center;">${r.is_public ? '✓' : '—'}</td>
                        <td style="padding:6px;text-align:center;">${r.import_count||0}</td>
                        <td style="padding:6px;text-align:right;">
                            <button onclick="adminDeleteSnapshot('${esc(r.snapshot_id)}','${esc(r.character_name)}')" style="padding:2px 8px;background:#2a1a1a;border:1px solid #533;color:#f88;cursor:pointer;border-radius:3px;">Delete</button>
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
        if (data.error) { results.innerHTML = `<p style="color:#f88;">${esc(data.error)}</p>`; return; }
        if (!data.rows.length) { results.innerHTML = '<p style="color:#888;">No results.</p>'; return; }
        const cols = Object.keys(data.rows[0]);
        results.innerHTML = `
            <p style="color:#aaa;font-size:.8em;margin-bottom:6px;">${data.count} row(s)</p>
            <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:.8em;">
                <thead><tr style="color:#aaa;border-bottom:1px solid #333;">
                    ${cols.map(c => `<th style="text-align:left;padding:4px 8px;">${esc(c)}</th>`).join('')}
                </tr></thead>
                <tbody>${data.rows.map(row => `
                    <tr style="border-bottom:1px solid #1a1a1a;">
                        ${cols.map(c => `<td style="padding:4px 8px;color:#ccc;">${esc(String(row[c] ?? ''))}</td>`).join('')}
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
