/**
 * skill-tree.js — Character skill discovery tree modal
 *
 * Layout: vertical depth rows. Depth 0 (roots) at top, branches flow downward.
 * Node visibility:
 *   - Depth-0 starter skills (isStarterSkill): always named and visible.
 *   - Depth-0 non-starter roots: blank/locked until character has them at any level.
 *   - All deeper nodes: blank/locked until at least one parent is level 1+.
 *
 * Node states:
 *   owned        — skillLevel >= 1, or intrinsic. Gold, solid.
 *   discovering  — skillLevel === 0, both parents known. Dim gold, XP bar.
 *   reachable    — in graph (parent is lv1+) but not yet owned. Silver dashed.
 *   (out-of-graph skills are simply not rendered)
 *
 * Pan: drag. Zoom: scroll wheel / pinch.
 */

(function () {

    // ── Constants ────────────────────────────────────────────────────────────

    const NODE_W     = 148;
    const NODE_H     = 52;
    const COL_GAP    = 172;  // horizontal spacing between nodes in a row
    const ROW_GAP    = 100;  // vertical spacing between depth rows
    const UNLOCK_XP  = 120;

    const COLOR_OWNED        = '#d4af37';
    const COLOR_OWNED_TEXT   = '#070a18';
    const COLOR_DISC_TEXT    = '#e8e0d0';
    const COLOR_REACH_TEXT   = '#7a9acc';
    const COLOR_LOCKED_TEXT  = '#2a2a4a';

    const COLOR_EDGE_OWNED   = 'rgba(212,175,55,0.5)';
    const COLOR_EDGE_DISC    = 'rgba(139,115,85,0.32)';
    const COLOR_EDGE_REACH   = 'rgba(58,74,106,0.28)';
    const COLOR_EDGE_LOCKED  = 'rgba(30,30,60,0.18)';
    const COLOR_EDGE_REVEALED= 'rgba(212,175,55,0.9)';

    // ── State ────────────────────────────────────────────────────────────────

    let _skillsData   = null;
    let _character    = null;
    let _nodes        = [];
    let _edges        = [];
    let _svg          = null;
    let _g            = null;
    let _tooltip      = null;
    let _pan          = { x: 0, y: 0 };
    let _zoom         = 1;
    let _dragging     = false;
    let _selectedNode = null;
    let _lastMouse    = { x: 0, y: 0 };
    let _canvasW      = 0;
    let _canvasH      = 0;

    // ── Public entry point ───────────────────────────────────────────────────

    window.openSkillTree = async function () {
        _skillsData = (window.gameData?.skills) || [];
        const charId = currentState?.detailCharacterId;
        if (!charId) return;

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

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _ownedIds() {
        const ids = new Set();
        (_character.skills || []).forEach(s => ids.add(s.skillID));
        return ids;
    }

    function _skillRecord(id) {
        return (_character.skills || []).find(s => s.skillID === id) || null;
    }

    function _truncate(str, max) {
        return str.length > max ? str.slice(0, max - 1) + '…' : str;
    }

    function _parentLevel(parentId) {
        const rec = _skillRecord(parentId);
        return rec ? (rec.skillLevel || 0) : 0;
    }

    // A node is "revealed" (shows name/info) when:
    //   - It's a starter skill (isStarterSkill), OR
    //   - The character owns it (any level), OR
    //   - At least one parent is owned at level >= 1
    function _isRevealed(skill, owned) {
        if (skill.isStarterSkill) return true;
        if (owned.has(skill.id)) return true;
        const parents = skill.parentSkills || [];
        if (!parents.length) return false; // non-starter root: must own it
        return parents.some(pid => _parentLevel(pid) >= 1);
    }

    // ── Graph construction ───────────────────────────────────────────────────

    function _buildGraph() {
        const owned = _ownedIds();

        // ── Compute depth for every skill ────────────────────────────────────
        // All roots are depth 0. Children are max(parentDepths) + 1.
        const depthMap = {};
        function getDepth(id) {
            if (depthMap[id] !== undefined) return depthMap[id];
            const skill = _skillsData.find(s => s.id === id);
            if (!skill) { depthMap[id] = 0; return 0; }
            const parents = skill.parentSkills || [];
            if (!parents.length) { depthMap[id] = 0; return 0; }
            const d = Math.max(...parents.map(getDepth)) + 1;
            depthMap[id] = d;
            return d;
        }
        _skillsData.forEach(s => getDepth(s.id));

        // ── Decide which skills appear in the graph at all ───────────────────
        // - Starter roots (isStarterSkill): always included.
        // - Non-starter roots (procs, item skills, consumables): only if character owns them.
        // - Deeper skills: only if at least one parent is in the graph.
        // Evaluated depth-order so parents resolve before children.
        const inGraph = new Set();
        const depthsSorted = [...new Set(Object.values(depthMap))].sort((a, b) => a - b);
        depthsSorted.forEach(d => {
            _skillsData
                .filter(s => depthMap[s.id] === d)
                .forEach(skill => {
                    const parents = skill.parentSkills || [];
                    if (!parents.length) {
                        if (skill.isStarterSkill || owned.has(skill.id)) inGraph.add(skill.id);
                    } else {
                        if (parents.some(p => inGraph.has(p))) inGraph.add(skill.id);
                    }
                });
        });

        // ── Assign states to in-graph skills ─────────────────────────────────
        // States: owned | discovering | reachable  (no locked — out-of-graph = not rendered)
        const nodeMap = new Map();

        _skillsData.filter(s => inGraph.has(s.id)).forEach(skill => {
            const parents = skill.parentSkills || [];
            const knownParents = parents.filter(p => owned.has(p));
            const revealed = _isRevealed(skill, owned);

            let state;
            if (owned.has(skill.id)) {
                const rec = _skillRecord(skill.id);
                state = (rec && rec.skillLevel >= 1) ? 'owned' : 'discovering';
            } else {
                state = 'reachable';
            }

            const rec = _skillRecord(skill.id);
            const purchaseRevealed = (_character.revealedParents || []).includes(skill.id);

            nodeMap.set(skill.id, {
                id: skill.id,
                skill,
                state,
                rec: rec || null,
                depth: depthMap[skill.id] || 0,
                knownParents,
                revealed,
                purchaseRevealed,
                x: 0,
                y: 0,
            });
        });

        // ── Layout: group by depth row, sort within each row ─────────────────
        const byDepth = {};
        nodeMap.forEach((node) => {
            const d = node.depth;
            if (!byDepth[d]) byDepth[d] = [];
            byDepth[d].push(node);
        });

        // Owned first, then discovering, then reachable. Alphabetical within each.
        const stateOrder = { owned: 0, discovering: 1, reachable: 2 };
        Object.values(byDepth).forEach(row => {
            row.sort((a, b) => {
                const so = stateOrder[a.state] - stateOrder[b.state];
                return so !== 0 ? so : a.skill.name.localeCompare(b.skill.name);
            });
        });

        // ── Assign pixel positions ────────────────────────────────────────────
        const depths = Object.keys(byDepth).map(Number).sort((a, b) => a - b);
        depths.forEach(d => {
            const row = byDepth[d];
            row.forEach((node, i) => {
                node.x = i * COL_GAP + NODE_W / 2;
                node.y = d * ROW_GAP + NODE_H / 2;
            });
        });

        _nodes = [];
        nodeMap.forEach(n => _nodes.push(n));

        // ── Canvas size ───────────────────────────────────────────────────────
        const maxX = Math.max(..._nodes.map(n => n.x)) + NODE_W;
        const maxY = Math.max(..._nodes.map(n => n.y)) + NODE_H;
        _canvasW = maxX + 60;
        _canvasH = maxY + 80;

        // ── Build edges ───────────────────────────────────────────────────────
        _edges = [];
        nodeMap.forEach((node, id) => {
            const parents = node.skill.parentSkills || [];
            parents.forEach(pid => {
                const pNode = nodeMap.get(pid);
                if (!pNode) return;

                const isRevealed = node.purchaseRevealed;
                let color;
                if (node.state === 'owned')        color = COLOR_EDGE_OWNED;
                else if (node.state === 'discovering') color = COLOR_EDGE_DISC;
                else if (node.state === 'reachable')   color = isRevealed ? COLOR_EDGE_REVEALED : COLOR_EDGE_REACH;
                else                                   color = COLOR_EDGE_LOCKED;

                _edges.push({
                    from: pNode,
                    to: node,
                    color,
                    revealed: isRevealed,
                    state: node.state,
                });
            });
        });
    }

    // ── Modal ─────────────────────────────────────────────────────────────────

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
                width:100vw; height:100vh;
                box-sizing:border-box;
            `;
            modal.innerHTML = `
                <div id="skillTreeHeader" style="
                    position:absolute; top:0; left:0; right:0;
                    display:flex; align-items:center; justify-content:space-between;
                    padding:0 1.25rem;
                    background:linear-gradient(135deg,var(--window-base) 0%,var(--window-deep) 100%);
                    border-bottom:1px solid rgba(212,175,55,0.2);
                    z-index:2; height:52px; box-sizing:border-box;
                ">
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        <span style="font-family:var(--font-display);color:var(--gold);font-size:1rem;font-weight:600;letter-spacing:0.05em;">Skill Web</span>
                        <span id="skillTreeCharName" style="color:#8b7355;font-size:0.82rem;"></span>
                    </div>
                    <div style="display:flex;align-items:center;gap:1.2rem;">
                        <div style="display:flex;align-items:center;gap:1.2rem;font-size:0.75rem;color:#8b7355;">
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
                    <svg id="skillTreeSVG" style="display:block;width:100%;height:100%;overflow:visible;"></svg>
                    <div id="skillTreeTooltip" style="
                        display:none; position:absolute;
                        background:linear-gradient(135deg,var(--window-base),var(--window-deep));
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
                    line-height:28px; font-family:var(--font-body);
                ">Drag to pan · Scroll to zoom</div>
            `;
            document.body.appendChild(modal);
        }

        _pan  = { x: 40, y: 40 };
        _zoom = 1;
        _selectedNode = null;

        document.getElementById('skillTreeCharName').textContent = _character?.name || '';
        modal.style.display = 'block';

        if (loading) {
            const wrap = document.getElementById('skillTreeCanvasWrap');
            wrap.innerHTML = `<div style="
                display:flex;align-items:center;justify-content:center;
                height:100%;color:#8b7355;
                font-family:var(--font-body);font-size:0.9rem;letter-spacing:0.05em;
            "><span style="opacity:0.6;">Reading the paths…</span></div>`;
        }
    }

    // ── SVG init ──────────────────────────────────────────────────────────────

    function _initSVG() {
        const wrap = document.getElementById('skillTreeCanvasWrap');

        wrap.innerHTML = `
            <svg id="skillTreeSVG" style="display:block;width:100%;height:100%;overflow:visible;"></svg>
            <div id="skillTreeTooltip" style="
                display:none; position:absolute;
                background:linear-gradient(135deg,var(--window-base),var(--window-deep));
                border:1px solid rgba(212,175,55,0.35);
                border-radius:6px; padding:0.6rem 0.8rem;
                font-family:var(--font-body); font-size:0.8rem;
                color:var(--text-primary); pointer-events:none;
                max-width:220px; z-index:10;
                box-shadow:0 4px 20px rgba(0,0,0,0.6);
            "></div>`;

        _svg     = document.getElementById('skillTreeSVG');
        _tooltip = document.getElementById('skillTreeTooltip');

        _svg.setAttribute('viewBox', `0 0 ${wrap.clientWidth} ${wrap.clientHeight}`);

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `
            <filter id="stGlowGold" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur"/>
                <feFlood flood-color="#d4af37" flood-opacity="0.45" result="color"/>
                <feComposite in="color" in2="blur" operator="in" result="glow"/>
                <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <style>
                .st-node-owned     { fill: #1a1200; }
                .st-node-disc      { fill: #0e0a04; }
                .st-node-reachable { fill: #080d1a; }

                .st-label          { font-family: var(--font-body, Lato, sans-serif); font-size: 11px; }
                .st-badge          { font-family: var(--font-body, Lato, sans-serif); font-size: 9px; }
                .st-sub            { font-family: var(--font-body, Lato, sans-serif); font-size: 9px; }
                .st-bar-bg         { fill: rgba(255,255,255,0.06); }
            </style>`;
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

    // ── Drawing ───────────────────────────────────────────────────────────────

    function _drawAll() {
        _g.innerHTML = '';

        // Edges first
        _edges.forEach(edge => {
            // Top-center of parent node → bottom-center of child node
            const x1 = edge.from.x;
            const y1 = edge.from.y + NODE_H / 2;
            const x2 = edge.to.x;
            const y2 = edge.to.y - NODE_H / 2;
            const mid = (y1 + y2) / 2;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`);
            path.setAttribute('stroke', edge.color);
            path.setAttribute('stroke-width', edge.state === 'owned' ? '1.5' : '1');
            path.setAttribute('fill', 'none');
            path.dataset.edge = '1';
            path.dataset.from = edge.from.id;
            path.dataset.to   = edge.to.id;

            if (edge.state === 'reachable' && !edge.revealed) {
                path.setAttribute('stroke-dasharray', '4 4');
            }

            if (edge.revealed) {
                path.setAttribute('stroke-width', '2');
                requestAnimationFrame(() => {
                    const len = path.getTotalLength ? path.getTotalLength() : 200;
                    path.style.strokeDasharray = len;
                    path.style.strokeDashoffset = len;
                    path.style.transition = 'stroke-dashoffset 0.7s ease-in-out';
                    requestAnimationFrame(() => {
                        path.style.strokeDashoffset = '0';
                        setTimeout(() => {
                            path.style.transition = '';
                            path.style.strokeDasharray = '';
                            path.style.strokeDashoffset = '';
                        }, 750);
                    });
                });
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
        rect.setAttribute('rx', '4');

        if (state === 'owned') {
            rect.setAttribute('class', 'st-node-owned');
            rect.setAttribute('stroke', COLOR_OWNED);
            rect.setAttribute('stroke-width', '1.5');
            rect.setAttribute('filter', 'url(#stGlowGold)');
        } else if (state === 'discovering') {
            rect.setAttribute('class', 'st-node-disc');
            rect.setAttribute('stroke', '#6a5530');
            rect.setAttribute('stroke-width', '1');
            rect.setAttribute('stroke-dasharray', '3 2');
        } else {
            // reachable
            rect.setAttribute('class', 'st-node-reachable');
            rect.setAttribute('stroke', '#2a3a5a');
            rect.setAttribute('stroke-width', '1');
            rect.setAttribute('stroke-dasharray', '4 3');
        }
        group.appendChild(rect);



        // Name
        const displayName = (state === 'reachable' && !node.revealed && !node.purchaseRevealed)
            ? '???'
            : skill.name;

        const textColor = state === 'owned'       ? COLOR_OWNED_TEXT
                        : state === 'discovering' ? COLOR_DISC_TEXT
                        : COLOR_REACH_TEXT;

        const textY = (state === 'discovering' && rec) ? NODE_H / 2 - 4 : NODE_H / 2 + 5;

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', NODE_W / 2);
        text.setAttribute('y', textY);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('class', 'st-label');
        text.setAttribute('fill', textColor);
        text.textContent = _truncate(displayName, 15);
        group.appendChild(text);

        // XP bar for discovering
        if (state === 'discovering' && rec) {
            const xp  = rec.skillXP || 0;
            const pct = Math.min(1, xp / UNLOCK_XP);
            const barW = NODE_W - 16;
            const barY = NODE_H / 2 + 8;

            const barBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            barBg.setAttribute('x', '8'); barBg.setAttribute('y', barY);
            barBg.setAttribute('width', barW); barBg.setAttribute('height', '4');
            barBg.setAttribute('rx', '2'); barBg.setAttribute('class', 'st-bar-bg');
            group.appendChild(barBg);

            const barFill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            barFill.setAttribute('x', '8'); barFill.setAttribute('y', barY);
            barFill.setAttribute('width', Math.max(2, barW * pct));
            barFill.setAttribute('height', '4');
            barFill.setAttribute('rx', '2');
            barFill.setAttribute('fill', '#6a5530');
            group.appendChild(barFill);
        }

        // Level badge (owned)
        if (state === 'owned' && rec && rec.skillLevel >= 1) {
            const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            badge.setAttribute('x', NODE_W - 4);
            badge.setAttribute('y', 10);
            badge.setAttribute('text-anchor', 'end');
            badge.setAttribute('class', 'st-badge');
            badge.setAttribute('fill', '#8b7355');
            badge.textContent = `Lv${rec.skillLevel}`;
            group.appendChild(badge);
        }

        // Intrinsic badge
        if (state === 'owned' && rec?.intrinsic) {
            const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            badge.setAttribute('x', '5');
            badge.setAttribute('y', '10');
            badge.setAttribute('class', 'st-badge');
            badge.setAttribute('fill', '#c9a0ff');
            badge.textContent = '★';
            group.appendChild(badge);
        }

        // "needs ???" hint for revealed reachable with missing parents
        if (state === 'reachable' && node.revealed) {
            const owned = _ownedIds();
            const missing = (skill.parentSkills || []).filter(p => !owned.has(p));
            if (missing.length > 0) {
                const sub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                sub.setAttribute('x', NODE_W / 2);
                sub.setAttribute('y', NODE_H - 6);
                sub.setAttribute('text-anchor', 'middle');
                sub.setAttribute('class', 'st-sub');
                sub.setAttribute('fill', '#2a4a6a');
                sub.textContent = '+ needs ???';
                group.appendChild(sub);
            }
        }

        // Events (not locked)
        group.addEventListener('mouseenter', (e) => _showTooltip(e, node));
        group.addEventListener('mouseleave', () => { if (_tooltip) _tooltip.style.display = 'none'; });
        group.addEventListener('mousemove',  (e) => _moveTooltip(e));
        group.addEventListener('click', (e) => {
            e.stopPropagation();
            if (_selectedNode === node.id) {
                _selectedNode = null;
                _closeNodeMenu();
            } else {
                _selectedNode = node.id;
                _showNodeMenu(node);
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
            groups.forEach(g => g.style.opacity = '1');
            _g.querySelectorAll('path[data-edge]').forEach(p => p.style.opacity = '1');
            return;
        }

        const childIds = new Set(
            _nodes.filter(n => (n.skill.parentSkills || []).includes(_selectedNode)).map(n => n.id)
        );
        const parentIds = new Set(
            (_nodes.find(n => n.id === _selectedNode)?.skill.parentSkills) || []
        );

        groups.forEach(g => {
            const id = g.dataset.skillId;
            g.style.opacity = (id === _selectedNode || childIds.has(id) || parentIds.has(id)) ? '1' : '0.15';
        });

        _g.querySelectorAll('path[data-edge]').forEach(p => {
            const from = p.dataset.from, to = p.dataset.to;
            const relevant = (from === _selectedNode && childIds.has(to))
                          || (to === _selectedNode && parentIds.has(from));
            p.style.opacity = relevant ? '1' : '0.05';
        });
    }

    // ── Node context menu ─────────────────────────────────────────────────────

    let _nodeMenu = null;

    function _closeNodeMenu() {
        if (_nodeMenu) { _nodeMenu.remove(); _nodeMenu = null; }
    }

    function _revealCost(depth, knownParentCount) {
        const base = Math.pow(10, depth + 1); // depth 0 → 10g, depth 1 → 100g, etc.
        return knownParentCount >= 1 ? Math.floor(base * 0.5) : base;
    }

    async function _purchaseReveal(node) {
        const cost = _revealCost(node.depth, (node.knownParents || []).length);
        if ((_character.gold || 0) < cost) {
            showError(`Not enough gold. Revealing this path costs ${cost}g.`);
            return;
        }
        _character.gold -= cost;
        if (!_character.revealedParents) _character.revealedParents = [];
        _character.revealedParents.push(node.id);
        await saveCharacterToServer(_character);
        _closeNodeMenu();
        _buildGraph();
        _drawAll();
    }

    function _showNodeMenu(node) {
        _closeNodeMenu();
        const wrap = document.getElementById('skillTreeCanvasWrap');
        if (!wrap) return;

        // Zoom to node
        const ww = wrap.clientWidth, wh = wrap.clientHeight;
        const targetZoom = 2;
        _zoom = targetZoom;
        _pan.x = ww / 2 - node.x * targetZoom;
        _pan.y = wh / 2 - node.y * targetZoom;
        _applyTransform();

        // Screen position: below the node
        const screenX = node.x * _zoom + _pan.x - NODE_W * _zoom / 2;
        const screenY = node.y * _zoom + _pan.y + NODE_H * _zoom / 2 + 8;

        const menu = document.createElement('div');
        menu.id = 'stNodeMenu';
        menu.style.cssText = [
            'position:absolute',
            `left:${Math.max(4, Math.min(screenX, ww - 220))}px`,
            `top:${Math.max(4, Math.min(screenY, wh - 130))}px`,
            'width:212px',
            'background:linear-gradient(135deg,var(--window-base),var(--window-deep))',
            'border:1px solid var(--gold-border)',
            'border-radius:6px',
            'padding:10px 12px',
            'z-index:50',
            'box-shadow:0 4px 20px rgba(0,0,0,0.7)',
            'font-family:var(--font-body)',
        ].join(';');

        const { skill, state, knownParents } = node;
        const gold = _character.gold || 0;

        let html = `<div style="font-family:var(--font-display);color:var(--gold);font-size:0.85rem;margin-bottom:8px;">${skill.name}</div>`;

        if (state === 'reachable') {
            const owned = _ownedIds();
            const missing = (skill.parentSkills || []).filter(p => !owned.has(p));
            if (missing.length > 0 && !node.purchaseRevealed) {
                const revCost = _revealCost(node.depth, (knownParents || []).length);
                const canReveal = gold >= revCost;
                html += _menuBtn(`Reveal parents: ${revCost}g`, canReveal, 'stMenuReveal');
            }
        }

        if (state === 'owned' || state === 'discovering') {
            html += `<div style="color:var(--text-muted);font-size:0.78rem;">Nothing to purchase.</div>`;
        }

        html += `<div style="text-align:right;margin-top:8px;">
            <button id="stMenuClose" style="font-size:0.72rem;background:none;border:none;color:var(--text-muted);cursor:pointer;">✕ Close</button>
        </div>`;

        menu.innerHTML = html;
        wrap.appendChild(menu);
        _nodeMenu = menu;

        const revBtn = menu.querySelector('#stMenuReveal');
        if (revBtn) revBtn.addEventListener('click', () => _purchaseReveal(node));
        menu.querySelector('#stMenuClose').addEventListener('click', _closeNodeMenu);
    }

    function _menuBtn(label, active, id) {
        const bg     = active ? '#1a2010' : '#111';
        const color  = active ? 'var(--gold)' : '#444';
        const border = active ? 'var(--gold-border)' : '#222';
        const cursor = active ? 'pointer' : 'not-allowed';
        return `<button id="${id}" ${active ? '' : 'disabled'} style="
            display:block;width:100%;text-align:left;margin-bottom:6px;
            background:${bg};color:${color};border:1px solid ${border};
            border-radius:4px;padding:6px 8px;font-size:0.78rem;
            cursor:${cursor};font-family:var(--font-body);
        ">${label}</button>`;
    }

    // ── Tooltip ───────────────────────────────────────────────────────────────

    function _showTooltip(e, node) {
        const { skill, state, rec } = node;
        const owned = _ownedIds();

        let html = `<div style="color:var(--gold);font-family:var(--font-display);font-size:0.85rem;margin-bottom:4px;">${skill.name}</div>`;

        if (state === 'owned') {
            const level = rec?.skillLevel ?? '?';
            const xp    = rec?.skillXP ?? 0;
            const nextXp = level < 1 ? UNLOCK_XP : Math.round(100 * level * 1.2);
            html += `<div style="color:#8b7355;font-size:0.75rem;margin-bottom:4px;">Level ${level}</div>`;
            if (level >= 1) {
                html += `<div style="color:#6a6a8a;font-size:0.72rem;">${Math.floor(xp)} / ${nextXp} XP to next level</div>`;
            }
            if (rec?.intrinsic) {
                html += `<div style="color:#c9a0ff;font-size:0.72rem;margin-top:4px;">Racial intrinsic</div>`;
            }
            if (skill.description) {
                html += `<div style="color:#6a6070;font-size:0.72rem;margin-top:6px;font-style:italic;">${skill.description}</div>`;
            }
        } else if (state === 'discovering') {
            const xp  = rec?.skillXP ?? 0;
            const pct = Math.min(100, Math.floor((xp / UNLOCK_XP) * 100));
            html += `<div style="color:#8b7355;font-size:0.75rem;margin-bottom:4px;">Discovering — ${pct}%</div>`;
            html += `<div style="color:#6a6a8a;font-size:0.72rem;">${Math.floor(xp)} / ${UNLOCK_XP} XP to unlock</div>`;
            if (skill.description) {
                html += `<div style="color:#6a6070;font-size:0.72rem;margin-top:6px;font-style:italic;">${skill.description}</div>`;
            }
        } else if (state === 'reachable') {
            if (!node.revealed && !node.purchaseRevealed) {
                html += `<div style="color:#3a4a6a;font-size:0.75rem;margin-bottom:4px;">Something stirs in the dark.</div>`;
                html += `<div style="color:#4a4a6a;font-size:0.72rem;font-style:italic;">Develop your skills further to reveal this path.</div>`;
            } else {
                const missing = (skill.parentSkills || []).filter(p => !owned.has(p));
                html += `<div style="color:#3a6a9a;font-size:0.75rem;margin-bottom:4px;">Within reach</div>`;
                if (missing.length > 0) {
                    html += `<div style="color:#6a6a8a;font-size:0.72rem;">Also needs: <span style="color:#7a9acc;">${'???'.repeat(missing.length)}</span></div>`;
                }
                if (skill.description) {
                    html += `<div style="color:#6a6070;font-size:0.72rem;margin-top:6px;font-style:italic;">${skill.description}</div>`;
                }
            }
        }

        _tooltip.innerHTML = html;
        _tooltip.style.display = 'block';
        _moveTooltip(e);
    }

    function _moveTooltip(e) {
        const wrap = document.getElementById('skillTreeCanvasWrap');
        if (!wrap || !_tooltip) return;
        const rect = wrap.getBoundingClientRect();
        let tx = e.clientX - rect.left + 14;
        let ty = e.clientY - rect.top  + 14;
        const tw = _tooltip.offsetWidth  || 200;
        const th = _tooltip.offsetHeight || 80;
        if (tx + tw > rect.width  - 8) tx = e.clientX - rect.left - tw - 14;
        if (ty + th > rect.height - 8) ty = e.clientY - rect.top  - th - 14;
        _tooltip.style.left = tx + 'px';
        _tooltip.style.top  = ty + 'px';
    }

    // ── Pan / zoom ────────────────────────────────────────────────────────────

    function _bindEvents(wrap) {
        _svg.addEventListener('click', (e) => {
            if (e.target === _svg || e.target === _g) {
                _selectedNode = null;
                _closeNodeMenu();
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
            const w = document.getElementById('skillTreeCanvasWrap');
            if (w) w.style.cursor = 'grab';
        });
        window.addEventListener('mousemove', (e) => {
            if (!_dragging) return;
            _pan.x += e.clientX - _lastMouse.x;
            _pan.y += e.clientY - _lastMouse.y;
            _lastMouse = { x: e.clientX, y: e.clientY };
            _applyTransform();
        });
        wrap.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.1 : 0.9;
            _zoom = Math.min(3, Math.max(0.15, _zoom * factor));
            _applyTransform();
        }, { passive: false });

        // Touch
        let lastTouch = null;
        wrap.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        });
        wrap.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1 && lastTouch) {
                e.preventDefault();
                _pan.x += e.touches[0].clientX - lastTouch.x;
                _pan.y += e.touches[0].clientY - lastTouch.y;
                lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                _applyTransform();
            }
        }, { passive: false });
    }

})();
