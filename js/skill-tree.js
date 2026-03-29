/**
 * skill-tree.js — Character skill discovery tree modal
 *
 * Shows the player's personal skill web: skills they own, skills within reach
 * (one parent known), and children requiring both parents (shown partially).
 * Skills where the character has zero parents are invisible — discovery by play.
 *
 * Node states:
 *   owned        — skillLevel >= 1, or intrinsic. Gold, solid.
 *   discovering  — skillLevel === 0, both parents known. Dim gold, XP ring.
 *   reachable    — one parent known, one unknown (shown as ???). Silver, dashed border.
 *
 * Pan: drag. Zoom: scroll wheel / pinch.
 */

(function () {

    // ── Constants ────────────────────────────────────────────────────────────

    const NODE_W        = 155;
    const NODE_H        = 58;
    const COL_GAP       = 210;  // horizontal spacing between depth columns
    const ROW_GAP       = 72;   // vertical spacing between nodes in a column
    const DEPTH_COLS    = 7;    // depths 1–7

    const COLOR_OWNED       = '#d4af37';
    const COLOR_OWNED_TEXT  = '#070a18';
    const COLOR_DISC        = '#8b7355';
    const COLOR_DISC_TEXT   = '#e8e0d0';
    const COLOR_REACH       = '#3a4a6a';
    const COLOR_REACH_TEXT  = '#7a9acc';
    const COLOR_EDGE_OWNED  = 'rgba(212,175,55,0.55)';
    const COLOR_EDGE_DISC   = 'rgba(139,115,85,0.35)';
    const COLOR_EDGE_REACH  = 'rgba(58,74,106,0.3)';
    const UNLOCK_XP         = 120;

    // ── State ────────────────────────────────────────────────────────────────

    let _skillsData   = null;   // full skills.json array
    let _character    = null;   // current character
    let _nodes        = [];     // computed display nodes
    let _edges        = [];     // computed display edges
    let _svg          = null;
    let _g            = null;   // transform group inside SVG
    let _tooltip      = null;
    let _pan          = { x: 0, y: 0 };
    let _zoom         = 1;
    let _dragging     = false;
    let _selectedNode = null;   // currently clicked node id
    let _lastMouse    = { x: 0, y: 0 };
    let _canvasW      = 0;
    let _canvasH      = 0;

    // ── Public entry point ───────────────────────────────────────────────────

    window.openSkillTree = async function () {
        _skillsData = (window.gameData?.skills) || [];
        const charId = currentState?.detailCharacterId;
        if (!charId) return;

        // Show modal immediately with loading state
        _renderModal(true);

        _character = await getCharacter(charId);
        if (!_character) {
            const wrap = document.getElementById('skillTreeCanvasWrap');
            if (wrap) wrap.innerHTML = '<div style="color:#8b7355;padding:2rem;text-align:center;font-family:Lato,sans-serif;">Could not load character data.</div>';
            return;
        }

        _buildGraph();
        requestAnimationFrame(() => _initSVG());
    };

    // ── Graph construction ───────────────────────────────────────────────────

    function _ownedIds() {
        const ids = new Set();
        (_character.skills || []).forEach(s => ids.add(s.skillID));
        return ids;
    }

    function _skillRecord(id) {
        return (_character.skills || []).find(s => s.skillID === id) || null;
    }

    function _buildGraph() {
        const owned = _ownedIds();

        // Which skills to show and in what state
        // owned: in owned set
        // discovering: both parents in owned set, skill itself in owned at level 0
        // reachable: exactly one parent in owned set (character doesn't own the child yet)
        // hidden: zero parents known → not shown

        const visible = new Map(); // skillId → state object

        _skillsData.forEach(skill => {
            const parents = skill.parentSkills || [];

            if (!parents.length) {
                // Root skill — only show if owned
                if (owned.has(skill.id)) {
                    visible.set(skill.id, { skill, state: 'owned', knownParents: [] });
                }
                return;
            }

            const knownParents = parents.filter(p => owned.has(p));

            if (knownParents.length === 0) return; // invisible

            if (owned.has(skill.id)) {
                const rec = _skillRecord(skill.id);
                const state = (rec && rec.skillLevel >= 1) ? 'owned' : 'discovering';
                visible.set(skill.id, { skill, state, rec, knownParents });
            } else if (knownParents.length >= 1) {
                // Name revealed if any known parent is level 3+
                const nameRevealed = knownParents.some(pid => {
                    const rec = _skillRecord(pid);
                    return rec && rec.skillLevel >= 3;
                });
                visible.set(skill.id, { skill, state: 'reachable', knownParents, nameRevealed });
            }
        });

        // Assign depths
        const depthCache = {};
        function getDepth(id) {
            if (depthCache[id] !== undefined) return depthCache[id];
            const skill = _skillsData.find(s => s.id === id);
            if (!skill) { depthCache[id] = 1; return 1; }
            const parents = skill.parentSkills || [];
            if (!parents.length) { depthCache[id] = 1; return 1; }
            const d = Math.max(...parents.map(getDepth)) + 1;
            depthCache[id] = d;
            return d;
        }

        // Group by depth, sort within each column by skill name for consistency
        const byDepth = {};
        visible.forEach((node, id) => {
            const d = getDepth(id);
            node.depth = d;
            if (!byDepth[d]) byDepth[d] = [];
            byDepth[d].push({ id, node });
        });

        // Lay out positions
        _nodes = [];
        Object.keys(byDepth).sort((a, b) => a - b).forEach(depth => {
            const col = byDepth[depth];
            col.sort((a, b) => a.node.skill.name.localeCompare(b.node.skill.name));
            col.forEach((item, rowIdx) => {
                const x = (parseInt(depth) - 1) * COL_GAP + NODE_W / 2;
                const y = rowIdx * ROW_GAP + NODE_H / 2;
                item.node.x = x;
                item.node.y = y;
                item.node.id = item.id;
                _nodes.push(item.node);
            });
        });

        // Build edges: for each visible non-root skill, draw edges from known parents
        _edges = [];
        visible.forEach((node, id) => {
            const parents = node.skill.parentSkills || [];
            parents.forEach(pid => {
                if (!visible.has(pid)) return;
                const pNode = visible.get(pid);
                const childState = node.state;
                const color = childState === 'owned'       ? COLOR_EDGE_OWNED
                            : childState === 'discovering' ? COLOR_EDGE_DISC
                            :                                COLOR_EDGE_REACH;
                _edges.push({ from: pNode, to: node, color });
            });
        });

        // Canvas size
        const maxX = Math.max(..._nodes.map(n => n.x)) + NODE_W;
        const maxY = Math.max(..._nodes.map(n => n.y)) + NODE_H;
        _canvasW = maxX + 60;
        _canvasH = maxY + 60;
    }

    // ── Modal render ─────────────────────────────────────────────────────────

    function _renderModal(loading = false) {
        let modal = document.getElementById('skillTreeModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'skillTreeModal';
            modal.style.cssText = `
                display:none; position:fixed; inset:0;
                background:rgba(0,0,0,0.92);
                z-index:1000;
                backdrop-filter:blur(4px);
                overflow:hidden;
                width:100vw;
                height:100vh;
                box-sizing:border-box;
            `;
            modal.innerHTML = `
                <div id="skillTreeHeader" style="
                    position:absolute; top:0; left:0; right:0;
                    display:flex; align-items:center; justify-content:space-between;
                    padding:0.75rem 1.25rem;
                    background:linear-gradient(135deg, #1a2240 0%, #10162d 100%);
                    border-bottom:1px solid rgba(212,175,55,0.2);
                    z-index:2; height:52px; box-sizing:border-box;
                ">
                    <div>
                        <span style="font-family:var(--font-display); color:var(--gold); font-size:1rem; font-weight:600; letter-spacing:0.05em;">
                            Skill Web
                        </span>
                        <span id="skillTreeCharName" style="color:#8b7355; font-size:0.82rem; margin-left:0.75rem;"></span>
                    </div>
                    <div style="display:flex; align-items:center; gap:1rem;">
                        <div style="display:flex; align-items:center; gap:1.2rem; font-size:0.75rem; color:#8b7355;">
                            <span><span style="display:inline-block;width:10px;height:10px;background:#d4af37;border-radius:2px;margin-right:4px;vertical-align:middle;"></span>Owned</span>
                            <span><span style="display:inline-block;width:10px;height:10px;background:#4a3a1a;border:1px solid #8b7355;border-radius:2px;margin-right:4px;vertical-align:middle;"></span>Discovering</span>
                            <span><span style="display:inline-block;width:10px;height:10px;background:#1a2a4a;border:1px dashed #3a5a8a;border-radius:2px;margin-right:4px;vertical-align:middle;"></span>Within reach</span>
                        </div>
                        <button onclick="closeModal('skillTreeModal')"
                            style="background:none;border:1px solid rgba(212,175,55,0.3);color:#8b7355;padding:0.3rem 0.7rem;border-radius:4px;cursor:pointer;font-size:0.82rem;font-family:inherit;">
                            ✕ Close
                        </button>
                    </div>
                </div>
                <div id="skillTreeCanvasWrap" style="
                    position:absolute; top:52px; left:0; right:0; bottom:28px;
                    overflow:hidden; cursor:grab;
                ">
                    <svg id="skillTreeSVG" style="display:block; width:100%; height:100%;"></svg>
                    <div id="skillTreeTooltip" style="
                        display:none; position:absolute;
                        background:linear-gradient(135deg,#1a2240,#10162d);
                        border:1px solid rgba(212,175,55,0.35);
                        border-radius:6px; padding:0.6rem 0.8rem;
                        font-family:var(--font-body); font-size:0.8rem;
                        color:var(--text-primary); pointer-events:none;
                        max-width:220px; z-index:10;
                        box-shadow:0 4px 20px rgba(0,0,0,0.6);
                    "></div>
                </div>
                <div style="
                    position:absolute; bottom:0; left:0; right:0; height:28px;
                    text-align:center; font-size:0.72rem; color:#3a3a5a;
                    line-height:28px;
                    font-family:var(--font-body);
                ">Drag to pan · Scroll to zoom</div>
            `;
            document.body.appendChild(modal);
        }

        // Reset pan/zoom/selection each open
        _pan  = { x: 40, y: 40 };
        _zoom = 1;
        _selectedNode = null;

        document.getElementById('skillTreeCharName').textContent = _character?.name || '';

        modal.style.display = 'block';

        // Show loading indicator until data arrives
        const wrap = document.getElementById('skillTreeCanvasWrap');
        if (wrap && loading) {
            wrap.innerHTML = `
                <div style="
                    display:flex; align-items:center; justify-content:center;
                    height:100%; color:#8b7355;
                    font-family:var(--font-body); font-size:0.9rem;
                    letter-spacing:0.05em;
                ">
                    <span style="opacity:0.6;">Reading the paths…</span>
                </div>`;
            // Re-attach SVG and tooltip after clearing
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.id = 'skillTreeSVG';
            svg.style.cssText = 'display:none; width:100%; height:100%;';
            wrap.appendChild(svg);
            const tip = document.createElement('div');
            tip.id = 'skillTreeTooltip';
            tip.style.cssText = `
                display:none; position:absolute;
                background:linear-gradient(135deg,#1a2240,#10162d);
                border:1px solid rgba(212,175,55,0.35);
                border-radius:6px; padding:0.6rem 0.8rem;
                font-family:var(--font-body); font-size:0.8rem;
                color:var(--text-primary); pointer-events:none;
                max-width:220px; z-index:10;
                box-shadow:0 4px 20px rgba(0,0,0,0.6);
            `;
            wrap.appendChild(tip);
        }
    }

    // ── SVG setup ────────────────────────────────────────────────────────────

    function _initSVG() {
        const wrap = document.getElementById('skillTreeCanvasWrap');

        // Clear loading state, rebuild canvas
        wrap.innerHTML = `
            <svg id="skillTreeSVG" style="display:block; width:100%; height:100%;"></svg>
            <div id="skillTreeTooltip" style="
                display:none; position:absolute;
                background:linear-gradient(135deg,#1a2240,#10162d);
                border:1px solid rgba(212,175,55,0.35);
                border-radius:6px; padding:0.6rem 0.8rem;
                font-family:var(--font-body); font-size:0.8rem;
                color:var(--text-primary); pointer-events:none;
                max-width:220px; z-index:10;
                box-shadow:0 4px 20px rgba(0,0,0,0.6);
            "></div>`;

        _svg  = document.getElementById('skillTreeSVG');
        _tooltip = document.getElementById('skillTreeTooltip');

        _svg.setAttribute('viewBox', `0 0 ${wrap.clientWidth} ${wrap.clientHeight}`);
        _svg.innerHTML = '';

        // Defs: glow filter
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `
            <filter id="stGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="stGlowGold" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur"/>
                <feFlood flood-color="#d4af37" flood-opacity="0.5" result="color"/>
                <feComposite in="color" in2="blur" operator="in" result="glow"/>
                <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        `;
        _svg.appendChild(defs);

        _g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        _svg.appendChild(_g);

        _drawAll();
        _applyTransform();
        _bindEvents(wrap);
    }

    function _applyTransform() {
        if (_g) _g.setAttribute('transform', `translate(${_pan.x},${_pan.y}) scale(${_zoom})`);
    }

    function _drawAll() {
        _g.innerHTML = '';

        // Edges first (behind nodes)
        _edges.forEach(edge => {
            const x1 = edge.from.x + NODE_W / 2;
            const y1 = edge.from.y;
            const x2 = edge.to.x - NODE_W / 2;
            const y2 = edge.to.y;
            const cx1 = x1 + (x2 - x1) * 0.5;
            const cy1 = y1;
            const cx2 = x1 + (x2 - x1) * 0.5;
            const cy2 = y2;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M${x1},${y1} C${cx1},${cy1} ${cx2},${cy2} ${x2},${y2}`);
            path.setAttribute('stroke', edge.color);
            path.setAttribute('stroke-width', '1.5');
            path.setAttribute('fill', 'none');
            path.dataset.edge = '1';
            path.dataset.from = edge.from.id;
            path.dataset.to   = edge.to.id;
            if (edge.color === COLOR_EDGE_REACH) {
                path.setAttribute('stroke-dasharray', '4 4');
            }
            _g.appendChild(path);
        });

        // Nodes
        _nodes.forEach(node => _drawNode(node));
    }

    function _drawNode(node) {
        const { x, y, state, skill, rec } = node;
        const nx = x - NODE_W / 2;
        const ny = y - NODE_H / 2;

        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('transform', `translate(${nx},${ny})`);
        group.dataset.skillId = node.id;
        group.style.cursor = 'pointer';

        // Background rect
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', NODE_W);
        rect.setAttribute('height', NODE_H);
        rect.setAttribute('rx', '5');

        if (state === 'owned') {
            rect.setAttribute('fill', '#2a1f06');
            rect.setAttribute('stroke', COLOR_OWNED);
            rect.setAttribute('stroke-width', '1.5');
            rect.setAttribute('filter', 'url(#stGlowGold)');
        } else if (state === 'discovering') {
            rect.setAttribute('fill', '#1e1608');
            rect.setAttribute('stroke', COLOR_DISC);
            rect.setAttribute('stroke-width', '1');
            rect.setAttribute('stroke-dasharray', '3 2');
        } else {
            rect.setAttribute('fill', '#0d1628');
            rect.setAttribute('stroke', '#2a3a5a');
            rect.setAttribute('stroke-width', '1');
            rect.setAttribute('stroke-dasharray', '4 3');
        }
        group.appendChild(rect);

        // Name text
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', NODE_W / 2);
        text.setAttribute('y', NODE_H / 2 + (state === 'discovering' ? -4 : 5));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');

        text.setAttribute('fill', state === 'owned' ? COLOR_OWNED : state === 'discovering' ? COLOR_DISC_TEXT : COLOR_REACH_TEXT);

        const displayName = (state === 'reachable' && !node.nameRevealed) ? '???' : skill.name;

        text.textContent = _truncate(displayName, 14);
        group.appendChild(text);

        // XP bar for discovering state
        if (state === 'discovering' && rec) {
            const xp  = rec.skillXP || 0;
            const pct = Math.min(1, xp / UNLOCK_XP);
            const barW = NODE_W - 16;
            const barY = NODE_H / 2 + 8;

            const barBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            barBg.setAttribute('x', '8'); barBg.setAttribute('y', barY);
            barBg.setAttribute('width', barW); barBg.setAttribute('height', '4');
            barBg.setAttribute('rx', '2'); barBg.setAttribute('fill', '#2a1f06');
            group.appendChild(barBg);

            const barFill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            barFill.setAttribute('x', '8'); barFill.setAttribute('y', barY);
            barFill.setAttribute('width', Math.max(2, barW * pct));
            barFill.setAttribute('height', '4');
            barFill.setAttribute('rx', '2'); barFill.setAttribute('fill', COLOR_DISC);
            group.appendChild(barFill);
        }

        // Missing parent indicator for reachable — only when name revealed
        if (state === 'reachable' && node.nameRevealed) {
            const missing = (skill.parentSkills || []).filter(p => !_ownedIds().has(p));
            if (missing.length > 0) {
                const sub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                sub.setAttribute('x', NODE_W / 2);
                sub.setAttribute('y', NODE_H - 7);
                sub.setAttribute('text-anchor', 'middle');
                sub.setAttribute('class', 'st-sub');
                sub.setAttribute('fill', '#3a5a7a');
                sub.textContent = '+ needs ???';
                group.appendChild(sub);
            }
        }

        // Level badge for owned
        if (state === 'owned' && rec && rec.skillLevel >= 1) {
            const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            badge.setAttribute('x', NODE_W - 5);
            badge.setAttribute('y', 9);
            badge.setAttribute('text-anchor', 'end');
            badge.setAttribute('class', 'st-badge');
            badge.setAttribute('fill', '#8b7355');
            badge.textContent = `Lv${rec.skillLevel}`;
            group.appendChild(badge);
        }

        // Intrinsic badge
        if (state === 'owned' && rec && rec.intrinsic) {
            const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            badge.setAttribute('x', '5');
            badge.setAttribute('y', '9');
            badge.setAttribute('class', 'st-badge');
            badge.setAttribute('fill', '#c9a0ff');
            badge.textContent = '★';
            group.appendChild(badge);
        }

        // Hover + click events
        group.addEventListener('mouseenter', (e) => _showTooltip(e, node));
        group.addEventListener('mouseleave', () => { _tooltip.style.display = 'none'; });
        group.addEventListener('mousemove', (e) => _moveTooltip(e));
        group.addEventListener('click', (e) => {
            e.stopPropagation();
            if (_selectedNode === node.id) {
                _selectedNode = null;
            } else {
                _selectedNode = node.id;
            }
            _applySelection();
        });

        _g.appendChild(group);
    }

    // ── Selection highlight ───────────────────────────────────────────────────

    function _applySelection() {
        if (!_g) return;
        const groups = _g.querySelectorAll('g[data-skill-id]');

        if (!_selectedNode) {
            // Clear — restore all to full opacity
            groups.forEach(g => g.style.opacity = '1');
            // Restore edge opacity
            _g.querySelectorAll('path[data-edge]').forEach(p => p.style.opacity = '1');
            return;
        }

        // Find the selected node
        const selNode = _nodes.find(n => n.id === _selectedNode);
        if (!selNode) return;

        // Children of selected node that are reachable
        const childIds = new Set(
            _nodes
                .filter(n => (n.skill.parentSkills || []).includes(_selectedNode) && n.state === 'reachable')
                .map(n => n.id)
        );
        // Also highlight owned/discovering children
        const ownedChildIds = new Set(
            _nodes
                .filter(n => (n.skill.parentSkills || []).includes(_selectedNode) && n.state !== 'reachable')
                .map(n => n.id)
        );

        groups.forEach(g => {
            const id = g.dataset.skillId;
            if (id === _selectedNode || childIds.has(id) || ownedChildIds.has(id)) {
                g.style.opacity = '1';
            } else {
                g.style.opacity = '0.2';
            }
        });

        // Dim edges — only keep edges connected to selected or its children
        _g.querySelectorAll('path[data-edge]').forEach(p => {
            const from = p.dataset.from;
            const to   = p.dataset.to;
            const relevant = (from === _selectedNode && (childIds.has(to) || ownedChildIds.has(to)));
            p.style.opacity = relevant ? '1' : '0.08';
        });
    }

    // ── Tooltip ───────────────────────────────────────────────────────────────

    function _showTooltip(e, node) {
        const { skill, state, rec, knownParents } = node;
        const owned = _ownedIds();
        const parents = skill.parentSkills || [];

        let html = `<div style="color:var(--gold); font-family:var(--font-display); font-size:0.85rem; margin-bottom:4px;">${skill.name}</div>`;

        if (state === 'owned') {
            const level = rec?.skillLevel ?? '?';
            const xp    = rec?.skillXP ?? 0;
            const nextXp = level < 1 ? UNLOCK_XP : Math.round(100 * level * 1.2);
            html += `<div style="color:#8b7355; font-size:0.75rem; margin-bottom:4px;">Level ${level}</div>`;
            if (level >= 1) {
                html += `<div style="color:#6a6a8a; font-size:0.72rem;">${Math.floor(xp)} / ${nextXp} XP to next level</div>`;
            }
            if (rec?.intrinsic) {
                html += `<div style="color:#c9a0ff; font-size:0.72rem; margin-top:4px;">Racial intrinsic</div>`;
            }
        } else if (state === 'discovering') {
            const xp  = rec?.skillXP ?? 0;
            const pct = Math.min(100, Math.floor((xp / UNLOCK_XP) * 100));
            html += `<div style="color:#8b7355; font-size:0.75rem; margin-bottom:4px;">Discovering — ${pct}%</div>`;
            html += `<div style="color:#6a6a8a; font-size:0.72rem;">${Math.floor(xp)} / ${UNLOCK_XP} XP to unlock</div>`;
        } else {
            // Reachable
            if (!node.nameRevealed) {
                // Name not yet revealed — say nothing useful
                html += `<div style="color:#3a4a6a; font-size:0.75rem; margin-bottom:4px;">Something stirs in the dark.</div>`;
                html += `<div style="color:#4a4a6a; font-size:0.72rem; font-style:italic;">Develop your skills further to reveal this path.</div>`;
            } else {
                const missingCount = parents.filter(p => !owned.has(p)).length;
                html += `<div style="color:#3a6a9a; font-size:0.75rem; margin-bottom:4px;">Within reach</div>`;
                if (missingCount > 0) {
                    html += `<div style="color:#6a6a8a; font-size:0.72rem;">Also needs: <span style="color:#7a9acc;">${'???'.repeat(missingCount)}</span></div>`;
                }
                if (skill.description) {
                    html += `<div style="color:#6a6070; font-size:0.72rem; margin-top:6px; font-style:italic;">${skill.description}</div>`;
                }
            }
        }

        if (state !== 'reachable' && skill.description) {
            html += `<div style="color:#6a6070; font-size:0.72rem; margin-top:6px; font-style:italic;">${skill.description}</div>`;
        }

        _tooltip.innerHTML = html;
        _tooltip.style.display = 'block';
        _moveTooltip(e);
    }

    function _moveTooltip(e) {
        const wrap = document.getElementById('skillTreeCanvasWrap');
        const rect = wrap.getBoundingClientRect();
        let tx = e.clientX - rect.left + 14;
        let ty = e.clientY - rect.top + 14;
        const tw = _tooltip.offsetWidth || 200;
        const th = _tooltip.offsetHeight || 80;
        if (tx + tw > rect.width  - 8) tx = e.clientX - rect.left - tw - 14;
        if (ty + th > rect.height - 8) ty = e.clientY - rect.top  - th - 14;
        _tooltip.style.left = tx + 'px';
        _tooltip.style.top  = ty + 'px';
    }

    // ── Pan / zoom ────────────────────────────────────────────────────────────

    function _bindEvents(wrap) {
        // Click background to deselect
        _svg.addEventListener('click', (e) => {
            if (e.target === _svg || e.target === _g) {
                _selectedNode = null;
                _applySelection();
            }
        });

        wrap.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            _dragging = true;
            _lastMouse = { x: e.clientX, y: e.clientY };
            wrap.style.cursor = 'grabbing';
        });
        window.addEventListener('mouseup', () => {
            _dragging = false;
            const wrap = document.getElementById('skillTreeCanvasWrap');
            if (wrap) wrap.style.cursor = 'grab';
        });
        window.addEventListener('mousemove', (e) => {
            if (!_dragging) return;
            const dx = e.clientX - _lastMouse.x;
            const dy = e.clientY - _lastMouse.y;
            _pan.x += dx;
            _pan.y += dy;
            _lastMouse = { x: e.clientX, y: e.clientY };
            _applyTransform();
        });
        wrap.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.1 : 0.9;
            _zoom = Math.min(3, Math.max(0.2, _zoom * factor));
            _applyTransform();
        }, { passive: false });

        // Touch pan
        let lastTouch = null;
        wrap.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        });
        wrap.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1 && lastTouch) {
                e.preventDefault();
                const dx = e.touches[0].clientX - lastTouch.x;
                const dy = e.touches[0].clientY - lastTouch.y;
                _pan.x += dx; _pan.y += dy;
                lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                _applyTransform();
            }
        }, { passive: false });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _truncate(str, max) {
        return str.length > max ? str.slice(0, max - 1) + '…' : str;
    }

})();
