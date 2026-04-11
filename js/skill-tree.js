/**
 * skill-tree.js — Hub-and-spoke skill web
 *
 * 16 starter skills as hub nodes. Click a hub to expand its subtree.
 * Sector-based layout minimizes edge crossings — each subtree owns an
 * angular wedge proportional to its descendant count.
 *
 * Click a skill: zoom + detail panel with relationship visual language.
 * Click background: collapse to hub view.
 * Pan: drag. Zoom: scroll / pinch.
 */

(function () {

    // ── Constants (tuned from harness export) ────────────────────────────────

    const PANEL_W      = 268;
    const HUB_SPREAD   = 228;
    const CHILD_R1     = 220;
    const CHILD_GAP    = 240;
    const NODE_H       = 20;
    const HUB_H        = 32;
    const NODE_RX      = 4;
    const HUB_RX       = 7;
    const HUB_FONT     = 14;
    const CHILD_FONT   = 11;

    const OP_HUB_DIM        = 0;
    const OP_OWNED          = 1.0;
    const OP_NEAR           = 0.7;
    const OP_D2             = 0.25;
    const OP_D3             = 0.1;
    const EDGE_DEPTH_FALL   = 0.3;
    const OP_EDGE_PARENT    = 0.75;
    const OP_EDGE_CO        = 0.7;
    const OP_EDGE_CU        = 0.4;
    const OP_EDGE_DEF       = 0.8;
    const EDGE_CURVE        = 0.18;
    const OP_UNRELATED      = 0.02;

    const GOLD      = '#d4af37';
    const HUB_COLOR = '#7a9acc';
    const HIGHLIGHT = '#40c060';
    const AMBER     = '#a07828';

    const CAT_COLOR = {
        DAMAGE_SINGLE:'#e05540', DAMAGE_MAGIC:'#e05540',
        DAMAGE_AOE:'#d4722a',   DAMAGE_PROC:'#c45a20',
        HEALING:'#4a90d4',      HEALING_AOE:'#3a78bc', HEALING_PROC:'#3a78bc',
        RESTORATION:'#5aacd4',  BUFF:'#9a6ed4',
        CONTROL:'#3abcac',      CONTROL_PROC:'#2a9a8a',
        DEFENSE:'#6a8aac',      DEFENSE_PROC:'#5a7a9c',
        UTILITY:'#8a8a7a',      UTILITY_PROC:'#7a7a6a',
        WEAPON_SKILL:'#c4a030', NO_RESOURCES:'#707060',
        PROGRESSION:'#a0c040',  DEFAULT:'#8a7a5a',
    };

    // ── State ────────────────────────────────────────────────────────────────

    let _skillsData  = null;
    let _character   = null;
    let _hubs        = [];
    let _childNodes  = [];
    let _childEdges  = [];
    let _openHubId   = null;
    let _selectedId  = null;
    let _lineageRel  = new Map();
    let _svg         = null;
    let _g           = null;
    let _panel       = null;
    let _pan         = { x: 0, y: 0 };
    let _zoom        = 1;
    let _dragging    = false;
    let _dragMoved   = false;
    let _lastMouse   = { x: 0, y: 0 };

    let _skillMap    = null;
    let _childrenOf  = null;
    let _descCount   = null;

    // ── Public entry point ───────────────────────────────────────────────────

    window.openSkillTree = async function () {
        _skillsData = (window.gameData?.skills || []).filter(s =>
            !s.id.startsWith('proc_') &&
            !s.category?.endsWith('_PROC') &&
            !s.category?.startsWith('CONSUMABLE')
        );

        const charId = currentState?.detailCharacterId;
        if (!charId) return;

        _renderModal();

        _character = await getCharacter(charId);
        if (!_character) return;

        _precompute();
        requestAnimationFrame(() => _initCanvas());
    };

    // ── Precompute ────────────────────────────────────────────────────────────

    function _precompute() {
        _skillMap   = new Map(_skillsData.map(s => [s.id, s]));
        _childrenOf = new Map(_skillsData.map(s => [s.id, []]));
        _skillsData.forEach(s => {
            (s.parentSkills || []).forEach(pid => {
                if (_childrenOf.has(pid)) _childrenOf.get(pid).push(s.id);
            });
        });
        _descCount = new Map();
        function countDesc(id, visited = new Set()) {
            if (_descCount.has(id)) return _descCount.get(id);
            if (visited.has(id)) return 0;
            visited.add(id);
            const total = (_childrenOf.get(id) || []).reduce((n, c) => n + 1 + countDesc(c, new Set(visited)), 0);
            _descCount.set(id, total);
            return total;
        }
        _skillsData.forEach(s => countDesc(s.id));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _ownedIds() {
        const ids = new Set();
        (_character.skills || []).forEach(s => {
            if ((s.skillLevel || 0) >= 1 || s.intrinsic) ids.add(s.skillID);
        });
        return ids;
    }

    function _skillRecord(id) {
        return (_character.skills || []).find(s => s.skillID === id) || null;
    }

    function _hw(name, isHub) {
        const pad = isHub ? 16 : 10;
        return Math.max(isHub ? 44 : 28, name.length * 3.6 + pad);
    }

    function _catColor(skill) {
        return CAT_COLOR[skill?.category] || CAT_COLOR.DEFAULT;
    }

    // ── Hub layout ────────────────────────────────────────────────────────────

    function _layoutHubs(cx, cy) {
        const starters = _skillsData.filter(s => s.isStarterSkill);
        const owned    = _ownedIds();
        starters.sort((a, b) => (_descCount.get(b.id) || 0) - (_descCount.get(a.id) || 0));
        _hubs = starters.map((s, i) => {
            const angle = (i / starters.length) * Math.PI * 2 - Math.PI / 2;
            return {
                id: s.id, skill: s,
                owned: owned.has(s.id),
                desc: _descCount.get(s.id) || 0,
                x: cx + Math.cos(angle) * HUB_SPREAD,
                y: cy + Math.sin(angle) * HUB_SPREAD,
                hw: _hw(s.name, true),
                hh: HUB_H / 2,
                isHub: true,
            };
        });
    }

    // ── Child layout — sector-based ───────────────────────────────────────────

    function _layoutChildren(hubId) {
        const hub = _hubs.find(h => h.id === hubId);
        if (!hub) return;

        // BFS to get all descendants with depth
        const depthInHub = new Map([[hubId, 0]]);
        const queue = [hubId];
        let qi = 0;
        while (qi < queue.length) {
            const id = queue[qi++];
            const d  = depthInHub.get(id);
            (_childrenOf.get(id) || []).forEach(cid => {
                if (!depthInHub.has(cid)) { depthInHub.set(cid, d + 1); queue.push(cid); }
            });
        }

        const byDepth = new Map();
        depthInHub.forEach((d, id) => {
            if (id === hubId) return;
            if (!byDepth.has(d)) byDepth.set(d, []);
            byDepth.get(d).push(id);
        });

        _childNodes = [];
        const placed    = new Map([[hubId, hub]]);
        const sectorOf  = new Map([[hubId, { start: -Math.PI, end: Math.PI }]]);
        const angleOf   = new Map([[hubId, 0]]);

        byDepth.forEach((ids, depth) => {
            const r = CHILD_R1 + (depth - 1) * CHILD_GAP;

            // Group by primary parent
            const byParent = new Map();
            ids.forEach(id => {
                const skill   = _skillMap.get(id);
                const parents = (skill?.parentSkills || []).filter(p => placed.has(p));
                const primary = parents[0] || hubId;
                if (!byParent.has(primary)) byParent.set(primary, []);
                byParent.get(primary).push(id);
            });

            byParent.forEach((siblings, parentId) => {
                const parentSector = sectorOf.get(parentId) || { start: -Math.PI, end: Math.PI };
                const sectorSpan   = parentSector.end - parentSector.start;

                const branching = siblings.filter(id => (_childrenOf.get(id) || []).length > 0);
                const leaves    = siblings.filter(id => (_childrenOf.get(id) || []).length === 0);
                const totalWeight = branching.reduce((s, id) => s + (_descCount.get(id) || 0) + 1, 0) || 1;

                let cursor = parentSector.start;

                // Branching nodes — proportional sector slices
                branching.forEach(id => {
                    const weight = (_descCount.get(id) || 0) + 1;
                    const slice  = (weight / totalWeight) * sectorSpan * (branching.length / siblings.length || 1);
                    const start  = cursor;
                    const end    = cursor + slice;
                    const angle  = (start + end) / 2;
                    cursor = end;
                    sectorOf.set(id, { start, end });
                    angleOf.set(id, angle);
                    const skill = _skillMap.get(id);
                    const node = {
                        id, skill, rec: _skillRecord(id),
                        owned: _ownedIds().has(id), depth,
                        x: hub.x + Math.cos(angle) * r,
                        y: hub.y + Math.sin(angle) * r,
                        hw: _hw(skill?.name || id, false),
                        hh: NODE_H / 2, isHub: false,
                    };
                    _childNodes.push(node);
                    placed.set(id, node);
                });

                // Leaves — remaining sector, pushed slightly further out
                if (leaves.length > 0) {
                    const leafSpan = parentSector.end - cursor;
                    const leafR    = r + Math.min(CHILD_GAP * 0.5, 80);
                    leaves.forEach((id, li) => {
                        const angle = cursor + ((li + 0.5) / leaves.length) * leafSpan;
                        sectorOf.set(id, { start: cursor + (li / leaves.length) * leafSpan, end: cursor + ((li+1) / leaves.length) * leafSpan });
                        angleOf.set(id, angle);
                        const skill = _skillMap.get(id);
                        const node = {
                            id, skill, rec: _skillRecord(id),
                            owned: _ownedIds().has(id), depth,
                            x: hub.x + Math.cos(angle) * leafR,
                            y: hub.y + Math.sin(angle) * leafR,
                            hw: _hw(skill?.name || id, false),
                            hh: NODE_H / 2, isHub: false,
                        };
                        _childNodes.push(node);
                        placed.set(id, node);
                    });
                }
            });
        });

        _separate(_childNodes);

        _childEdges = [];
        _childNodes.forEach(node => {
            (node.skill?.parentSkills || []).forEach(pid => {
                const pNode = placed.get(pid);
                if (pNode) _childEdges.push({ from: pNode, to: node });
            });
        });
    }

    function _separate(nodes) {
        const REPULSE = 100, MIN_X = 18, MIN_Y = 12, PASSES = 100;
        for (let pass = 0; pass < PASSES; pass++) {
            let moved = false;
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const a = nodes[i], b = nodes[j];
                    const dx = b.x - a.x || 0.01, dy = b.y - a.y || 0.01;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    const ox = (a.hw + b.hw + MIN_X) - Math.abs(dx);
                    const oy = (a.hh + b.hh + MIN_Y) - Math.abs(dy);
                    if (ox > 0 && oy > 0) {
                        moved = true;
                        if (ox < oy) { const p = (ox/2+1)*Math.sign(dx); a.x-=p; b.x+=p; }
                        else { const p = (oy/2+1)*Math.sign(dy); a.y-=p; b.y+=p; }
                    } else if (dist < REPULSE) {
                        const force = (REPULSE - dist) / REPULSE * 2.5;
                        a.x -= (dx/dist)*force; a.y -= (dy/dist)*force;
                        b.x += (dx/dist)*force; b.y += (dy/dist)*force;
                        moved = true;
                    }
                }
            }
            if (!moved) break;
        }
    }

    // ── Lineage ───────────────────────────────────────────────────────────────

    function _computeLineage(id) {
        const rel   = new Map([[id, 'selected']]);
        const owned = _ownedIds();
        (_skillMap.get(id)?.parentSkills || []).forEach(pid => { if (!rel.has(pid)) rel.set(pid, 'parent'); });
        (_childrenOf.get(id) || []).forEach(cid => {
            const type = owned.has(cid) ? 'child_owned' : 'child_unowned';
            if (!rel.has(cid)) rel.set(cid, type);
            if (owned.has(cid)) {
                (_childrenOf.get(cid) || []).forEach(gcid => {
                    if (!rel.has(gcid)) rel.set(gcid, owned.has(gcid) ? 'child_owned' : 'child_unowned');
                });
            }
        });
        return rel;
    }

    // ── Modal ─────────────────────────────────────────────────────────────────

    function _renderModal() {
        let modal = document.getElementById('skillTreeModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'skillTreeModal';
            modal.style.cssText = `display:none;position:fixed;inset:0;background:rgba(4,3,1,0.96);z-index:1000;overflow:hidden;width:100vw;height:100vh;box-sizing:border-box;`;
            modal.innerHTML = `
                <div style="position:absolute;top:0;left:0;right:0;height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 1.25rem;background:var(--window-base,#080604);border-bottom:1px solid rgba(212,175,55,0.12);z-index:2;box-sizing:border-box;">
                    <div style="display:flex;align-items:center;gap:1rem;">
                        <span style="font-family:var(--font-display);color:${GOLD};font-size:0.95rem;letter-spacing:0.06em;">Skill Web</span>
                        <span id="skillTreeCharName" style="color:#6a5a30;font-size:0.8rem;"></span>
                        <span id="skillTreeHubName" style="color:#5a8a5a;font-size:0.8rem;font-style:italic;"></span>
                    </div>
                    <div style="display:flex;align-items:center;gap:1.5rem;">
                        <div style="font-size:0.72rem;color:#4a3a18;">Click a branch to explore · Click background to collapse</div>
                        <button onclick="closeModal('skillTreeModal')" style="background:none;border:1px solid rgba(212,175,55,0.18);color:#6a5a30;padding:0.25rem 0.65rem;border-radius:3px;cursor:pointer;font-size:0.8rem;font-family:inherit;">✕ Close</button>
                    </div>
                </div>
                <div style="position:absolute;top:48px;left:0;right:0;bottom:24px;display:flex;">
                    <div id="skillTreeCanvasWrap" style="flex:1;overflow:hidden;cursor:grab;position:relative;">
                        <svg id="skillTreeSVG" style="display:block;width:100%;height:100%;"></svg>
                    </div>
                    <div id="skillTreePanelWrap" style="position:relative;flex-shrink:0;display:flex;">
                        <button id="skillTreePanelTab" onclick="window._skillTreeTogglePanel()" style="
                            position:absolute;left:-22px;top:50%;transform:translateY(-50%);
                            width:22px;height:48px;
                            background:var(--window-base,#080604);
                            border:1px solid rgba(212,175,55,0.15);
                            border-right:none;
                            color:#6a5a30;font-size:10px;
                            cursor:pointer;
                            border-radius:4px 0 0 4px;
                            display:flex;align-items:center;justify-content:center;
                            z-index:10;
                        ">◀</button>
                        <div id="skillTreePanel" style="width:${PANEL_W}px;border-left:1px solid rgba(212,175,55,0.08);background:var(--window-base,#060503);padding:1.25rem 1rem;overflow-y:auto;font-family:var(--font-body);color:var(--text-primary,#e8e0d0);transition:width 0.2s;box-sizing:border-box;">
                            <div style="color:#3a3020;font-size:0.78rem;font-style:italic;margin-top:2rem;text-align:center;">Select a skill to inspect</div>
                        </div>
                    </div>
                </div>
                <div style="position:absolute;bottom:0;left:0;right:${PANEL_W}px;height:24px;text-align:center;font-size:0.68rem;color:#2a1e08;line-height:24px;font-family:var(--font-body);">Drag to pan · Scroll to zoom</div>
            `;
            document.body.appendChild(modal);
        }
        _pan = { x: 0, y: 0 };
        _zoom = 1;
        _openHubId = null;
        _selectedId = null;
        _lineageRel = new Map();
        _childNodes = [];
        _childEdges = [];
        document.getElementById('skillTreeCharName').textContent = _character?.name || '';
        document.getElementById('skillTreeHubName').textContent = '';
        modal.style.display = 'block';

        // Collapse panel by default on mobile
        const isMobile = window.innerWidth < 600;
        window._skillTreePanelOpen = !isMobile;
        window._skillTreeTogglePanel = function() {
            window._skillTreePanelOpen = !window._skillTreePanelOpen;
            const panel = document.getElementById('skillTreePanel');
            const tab   = document.getElementById('skillTreePanelTab');
            if (panel) {
                panel.style.width    = window._skillTreePanelOpen ? '268px' : '0';
                panel.style.padding  = window._skillTreePanelOpen ? '1.25rem 1rem' : '0';
                panel.style.overflow = window._skillTreePanelOpen ? 'auto' : 'hidden';
            }
            // ◀ = panel is closed (click to open), ▶ = panel is open (click to close)
            if (tab) tab.textContent = window._skillTreePanelOpen ? '▶' : '◀';
        };
        // Apply initial CSS state without toggling the flag
        if (isMobile) {
            const panel = document.getElementById('skillTreePanel');
            const tab   = document.getElementById('skillTreePanelTab');
            if (panel) { panel.style.width = '0'; panel.style.padding = '0'; panel.style.overflow = 'hidden'; }
            if (tab) tab.textContent = '◀';
        }
    }

    // ── Canvas ────────────────────────────────────────────────────────────────

    function _initCanvas() {
        const wrap = document.getElementById('skillTreeCanvasWrap');
        if (!wrap) return;
        _svg   = document.getElementById('skillTreeSVG');
        _panel = document.getElementById('skillTreePanel');
        _svg.innerHTML = '';
        _g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        _svg.appendChild(_g);

        const W = wrap.clientWidth, H = wrap.clientHeight;
        _pan.x = W / 2;
        _pan.y = H / 2;

        _layoutHubs(0, 0);
        _drawAll();
        _applyTransform();
        _bindEvents(wrap);
    }

    function _clampPan() {
        // Gather all active node positions (hubs always, child nodes when a hub is open)
        const allNodes = _openHubId
            ? [..._hubs, ..._childNodes]
            : _hubs;
        if (!allNodes.length) return;

        const wrap = document.getElementById('skillTreeCanvasWrap');
        if (!wrap) return;
        const W = wrap.clientWidth, H = wrap.clientHeight;

        // Compute bounding box in screen space
        let minSX = Infinity, maxSX = -Infinity, minSY = Infinity, maxSY = -Infinity;
        for (const n of allNodes) {
            const sx = _pan.x + n.x * _zoom;
            const sy = _pan.y + n.y * _zoom;
            if (sx < minSX) minSX = sx;
            if (sx > maxSX) maxSX = sx;
            if (sy < minSY) minSY = sy;
            if (sy > maxSY) maxSY = sy;
        }

        // Require at least MARGIN px of the node spread to remain inside the canvas
        const MARGIN = 80;

        // Clamp: if all nodes have scrolled past the right edge, pull back
        if (minSX > W - MARGIN) _pan.x -= (minSX - (W - MARGIN));
        // If all nodes have scrolled past the left edge
        if (maxSX < MARGIN)     _pan.x += (MARGIN - maxSX);
        // Bottom
        if (minSY > H - MARGIN) _pan.y -= (minSY - (H - MARGIN));
        // Top
        if (maxSY < MARGIN)     _pan.y += (MARGIN - maxSY);
    }

    function _applyTransform() {
        _clampPan();
        if (_g) _g.setAttribute('transform', `translate(${_pan.x},${_pan.y}) scale(${_zoom})`);
    }

    // ── Drawing ───────────────────────────────────────────────────────────────

    function _drawAll() {
        if (!_g) return;
        _g.innerHTML = '';
        const owned  = _ownedIds();
        const hasSel = _selectedId !== null;

        // Edges
        if (_openHubId) {
            _childEdges.forEach(e => {
                const toRel   = _lineageRel.get(e.to.id);
                const fromRel = _lineageRel.get(e.from.id);
                if (hasSel) {
                    if (!toRel && !fromRel) return;
                    if (fromRel === 'parent' && e.to.id === _selectedId)
                        _drawEdge(e.from, e.to, GOLD, OP_EDGE_PARENT, false);
                    else if (e.from.id === _selectedId && toRel === 'child_owned')
                        _drawEdge(e.from, e.to, GOLD, OP_EDGE_CO, true);
                    else if (e.from.id === _selectedId && toRel === 'child_unowned')
                        _drawEdge(e.from, e.to, AMBER, OP_EDGE_CU, true);
                    else if (fromRel === 'child_owned' && toRel)
                        _drawEdge(e.from, e.to, toRel === 'child_owned' ? GOLD : AMBER, (toRel === 'child_owned' ? OP_EDGE_CO : OP_EDGE_CU) * 0.7, true);
                } else {
                    const maxDepth = Math.max(e.from.depth || 1, e.to.depth || 1);
                    const op = OP_EDGE_DEF * Math.pow(EDGE_DEPTH_FALL, maxDepth - 1);
                    _drawEdge(e.from, e.to, '#b09040', Math.max(0.03, op), false);
                }
            });
        }

        // Child nodes
        if (_openHubId) {
            _childNodes.forEach(node => {
                const rel     = _lineageRel.get(node.id);
                const inLin   = !!rel;
                const opacity = hasSel ? (inLin ? 1.0 : OP_UNRELATED) : _nodeOpacity(node, owned);
                _drawChildNode(node, rel, opacity, owned);
            });

            // Cross-hub parent edges and ghost nodes
            if (hasSel) {
                const inChild = new Set([..._childNodes.map(n => n.id), _openHubId]);
                _lineageRel.forEach((relType, id) => {
                    if (inChild.has(id)) return;
                    const hub = _hubs.find(h => h.id === id);
                    if (!hub) return;
                    const selNode = _childNodes.find(n => n.id === _selectedId);
                    if (selNode) _drawEdge(hub, selNode, GOLD, OP_EDGE_PARENT, false);
                });
            }
        }

        // Hubs
        _hubs.forEach(hub => {
            const isOpen   = hub.id === _openHubId;
            const isParent = _lineageRel.get(hub.id) === 'parent';
            const isDimmed = _openHubId && !isOpen && !isParent;
            const opacity  = isDimmed ? OP_HUB_DIM : 1.0;
            _drawHub(hub, isOpen, isParent, opacity, owned);
        });

        // Parent hub → selected edges
        if (_selectedId && hasSel) {
            const selNode = _childNodes.find(n => n.id === _selectedId);
            if (selNode) {
                _hubs.forEach(hub => {
                    if (_lineageRel.get(hub.id) === 'parent')
                        _drawEdge(hub, selNode, GOLD, OP_EDGE_PARENT, false);
                });
            }
        }

        // Move selected node's group to end of SVG so it renders on top
        if (_selectedId) {
            const selGroup = _g.querySelector(`g[data-skill-id="${_selectedId}"]`);
            if (selGroup) _g.appendChild(selGroup);
        }
    }

    function _nodeOpacity(node, owned) {
        if (node.owned) return OP_OWNED;
        const parents = node.skill?.parentSkills || [];
        if (parents.some(p => owned.has(p))) return OP_NEAR;
        if (node.depth === 2) return OP_D2;
        return OP_D3;
    }

    function _drawEdge(from, to, stroke, opacity, dashed) {
        const dx  = to.x - from.x, dy = to.y - from.y;
        const len = Math.sqrt(dx*dx+dy*dy) || 1;
        const x1  = from.x + (dx/len)*from.hw, y1 = from.y + (dy/len)*from.hh;
        const x2  = to.x   - (dx/len)*to.hw,   y2 = to.y   - (dy/len)*to.hh;
        const mx  = (x1+x2)/2, my = (y1+y2)/2;
        const mag = Math.sqrt(mx*mx+my*my) || 1;
        const el  = Math.sqrt((x2-x1)**2+(y2-y1)**2);
        const cx  = mx + (mx/mag)*el*EDGE_CURVE;
        const cy  = my + (my/mag)*el*EDGE_CURVE;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`);
        path.setAttribute('stroke', stroke);
        path.setAttribute('stroke-opacity', opacity);
        path.setAttribute('stroke-width', dashed ? 1.5 : 1);
        path.setAttribute('fill', 'none');
        if (dashed) path.setAttribute('stroke-dasharray', '5 4');
        _g.appendChild(path);
    }

    function _drawHub(hub, isOpen, isParent, opacity, owned) {
        const color = isParent ? GOLD : hub.owned ? GOLD : HUB_COLOR;
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${hub.x},${hub.y})`);
        g.dataset.skillId = hub.id;
        g.style.cursor    = 'pointer';
        g.style.opacity   = opacity;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', -hub.hw); rect.setAttribute('y', -hub.hh);
        rect.setAttribute('width', hub.hw*2); rect.setAttribute('height', HUB_H);
        rect.setAttribute('rx', HUB_RX);
        rect.setAttribute('fill', isOpen ? 'rgba(122,154,204,0.15)' : hub.owned ? 'rgba(212,175,55,0.1)' : 'rgba(12,10,6,0.9)');
        rect.setAttribute('stroke', isParent ? GOLD : isOpen ? '#aac0e0' : color);
        rect.setAttribute('stroke-width', isParent ? 2 : isOpen ? 2 : 1.2);
        g.appendChild(rect);

        // Owned/total badge
        const ownedCt = _countOwnedDesc(hub.id, owned);
        if (ownedCt > 0) {
            const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            badge.setAttribute('x', hub.hw - 2); badge.setAttribute('y', -(hub.hh - 7));
            badge.setAttribute('text-anchor', 'end');
            badge.setAttribute('fill', '#5a7a5a'); badge.setAttribute('font-size', '7');
            badge.setAttribute('font-family', 'var(--font-body,sans-serif)');
            badge.style.pointerEvents = 'none';
            badge.textContent = `${ownedCt}/${hub.desc}`;
            g.appendChild(badge);
        }

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('fill', isParent ? GOLD : isOpen ? '#aac0e0' : color);
        text.setAttribute('font-size', HUB_FONT); text.setAttribute('font-family', 'var(--font-body,sans-serif)');
        text.setAttribute('font-weight', '600');
        text.style.pointerEvents = 'none'; text.style.userSelect = 'none';
        text.textContent = hub.skill.name;
        g.appendChild(text);

        g.addEventListener('click', e => {
            e.stopPropagation();
            if (_dragMoved) return;
            if (_openHubId && hub.id !== _openHubId) return;
            _openHub(hub);
        });
        _g.appendChild(g);
    }

    function _drawChildNode(node, rel, opacity, owned) {
        const color = rel === 'selected'     ? GOLD
                    : rel === 'parent'        ? GOLD
                    : rel === 'child_owned'   ? GOLD
                    : node.owned ? GOLD : _catColor(node.skill);

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${node.x},${node.y})`);
        g.dataset.skillId = node.id;
        g.style.cursor    = 'pointer';
        g.style.opacity   = opacity;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', -node.hw); rect.setAttribute('y', -node.hh);
        rect.setAttribute('width', node.hw*2); rect.setAttribute('height', NODE_H);
        rect.setAttribute('rx', NODE_RX);
        rect.setAttribute('fill', rel === 'selected' ? 'rgba(212,175,55,0.12)' : node.owned ? 'rgba(212,175,55,0.07)' : 'rgba(10,7,2,0.88)');
        rect.setAttribute('stroke', rel === 'selected' ? HIGHLIGHT : color);
        rect.setAttribute('stroke-width', node.id === _selectedId ? 2.5 : rel === 'parent' ? 1.8 : node.owned ? 1.2 : 0.7);
        g.appendChild(rect);

        // Partial parent bar
        const parents  = node.skill?.parentSkills || [];
        const ownedPCt = parents.filter(p => owned.has(p)).length;
        if (ownedPCt > 0 && ownedPCt < parents.length) {
            const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            bar.setAttribute('x', -node.hw + NODE_RX); bar.setAttribute('y', node.hh - 3);
            bar.setAttribute('width', (node.hw*2 - NODE_RX*2) * (ownedPCt/parents.length));
            bar.setAttribute('height', 2); bar.setAttribute('rx', 1);
            bar.setAttribute('fill', GOLD); bar.setAttribute('fill-opacity', '0.6');
            g.appendChild(bar);
        }

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('fill', color);
        text.setAttribute('font-size', CHILD_FONT); text.setAttribute('font-family', 'var(--font-body,sans-serif)');
        text.setAttribute('font-weight', node.owned ? '600' : '400');
        text.style.pointerEvents = 'none'; text.style.userSelect = 'none';
        text.textContent = node.skill?.name || node.id;
        g.appendChild(text);

        if (node.owned && node.rec && (node.rec.skillLevel || 0) >= 1) {
            const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            badge.setAttribute('x', node.hw - 2); badge.setAttribute('y', -(node.hh - 7));
            badge.setAttribute('text-anchor', 'end'); badge.setAttribute('fill', '#8b7355');
            badge.setAttribute('font-size', '7'); badge.setAttribute('font-family', 'var(--font-body,sans-serif)');
            badge.style.pointerEvents = 'none';
            badge.textContent = `L${node.rec.skillLevel}`;
            g.appendChild(badge);
        }

        g.addEventListener('click', e => {
            e.stopPropagation();
            if (_dragMoved) return;
            // Bring to front
            if (_g && g.parentNode === _g) _g.appendChild(g);
            _selectSkill(node);
        });
        _g.appendChild(g);
    }

    function _countOwnedDesc(hubId, owned) {
        let count = 0;
        const visit = (id, seen = new Set()) => {
            if (seen.has(id)) return; seen.add(id);
            (_childrenOf.get(id) || []).forEach(cid => { if (owned.has(cid)) count++; visit(cid, seen); });
        };
        visit(hubId);
        return count;
    }

    // ── Interactions ──────────────────────────────────────────────────────────

    function _openHub(hub) {
        _openHubId = hub.id;
        if (_selectedId) _lineageRel = _computeLineage(_selectedId);
        _layoutChildren(hub.id);
        document.getElementById('skillTreeHubName').textContent = `— ${hub.skill.name}`;
        const wrap = document.getElementById('skillTreeCanvasWrap');
        if (wrap) {
            _zoom  = 0.7;
            _pan.x = wrap.clientWidth  / 2 - hub.x * _zoom;
            _pan.y = wrap.clientHeight / 2 - hub.y * _zoom;
            _applyTransform();
        }
        _drawAll();
        if (!_selectedId && _panel)
            _panel.innerHTML = '<div style="color:#3a3020;font-size:0.78rem;font-style:italic;margin-top:2rem;text-align:center;">Select a skill to inspect</div>';
    }

    function _selectSkill(node) {
        _selectedId = node.id;
        _lineageRel = _computeLineage(node.id);
        _drawAll();
        // Auto-open panel on mobile when skill selected
        if (!window._skillTreePanelOpen && typeof window._skillTreeTogglePanel === 'function') {
            window._skillTreeTogglePanel();
        }
        const wrap = document.getElementById('skillTreeCanvasWrap');
        if (wrap) {
            const z = Math.max(_zoom, 1.4);
            _zoom  = z;
            _pan.x = wrap.clientWidth  / 2 - node.x * z;
            _pan.y = wrap.clientHeight / 2 - node.y * z;
            _applyTransform();
        }
        _renderPanel(node);
    }

    function _collapse() {
        _openHubId  = null;
        _selectedId = null;
        _lineageRel = new Map();
        _childNodes = [];
        _childEdges = [];
        document.getElementById('skillTreeHubName').textContent = '';
        _drawAll();
        if (_panel) _panel.innerHTML = '<div style="color:#3a3020;font-size:0.78rem;font-style:italic;margin-top:2rem;text-align:center;">Select a skill to inspect</div>';
    }

    // ── Detail panel ──────────────────────────────────────────────────────────

    function _renderPanel(node) {
        if (!_panel) return;
        const { skill, rec, owned } = node;
        const ownedSet = _ownedIds();
        const cat      = (skill?.category || '').replace(/_/g, ' ').toLowerCase();
        const costStr  = skill?.costType && skill?.costAmount != null ? `${skill.costAmount} ${skill.costType}` : null;
        const parents  = (skill?.parentSkills || []).map(pid => ({
            name:  _skillMap.get(pid)?.name || pid,
            owned: ownedSet.has(pid),
        }));
        const scaling  = skill?.scalingFactors
            ? Object.entries(skill.scalingFactors).map(([k, v]) => `${k} ×${v}`).join(', ')
            : null;
        const statusColor = owned ? GOLD : AMBER;
        const statusText  = owned ? 'Learned' : `Depth ${node.depth}`;

        _panel.innerHTML = `
            <div style="border-bottom:1px solid rgba(212,175,55,0.1);padding-bottom:0.8rem;margin-bottom:0.8rem;">
                <div style="font-family:var(--font-display);color:${GOLD};font-size:0.95rem;margin-bottom:0.3rem;">${skill?.name || node.id}</div>
                <div style="font-size:0.7rem;color:${statusColor};letter-spacing:0.07em;text-transform:uppercase;">${statusText}</div>
            </div>
            <div style="font-size:0.78rem;color:#9a8850;line-height:1.65;margin-bottom:0.9rem;font-style:italic;">${skill?.description || ''}</div>
            <div style="font-size:0.7rem;color:#5a4a20;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:0.45rem;">Details</div>
            <div style="font-size:0.78rem;color:#7a6830;line-height:2.0;">
                <div>Category: <span style="color:#9a8040;">${cat}</span></div>
                ${costStr  ? `<div>Cost: <span style="color:#9a8040;">${costStr}</span></div>` : ''}
                ${scaling  ? `<div>Scales: <span style="color:#9a8040;">${scaling}</span></div>` : ''}
                ${rec && (rec.skillLevel||0)>=1 ? `<div>Level: <span style="color:${GOLD};">${rec.skillLevel}</span></div>` : ''}
                ${rec && (rec.skillLevel||0)>=1 ? `<div>XP: <span style="color:#9a8040;">${Math.floor(rec.skillXP||0)}</span></div>` : ''}
            </div>
            ${parents.length ? `
            <div style="margin-top:1rem;">
                <div style="font-size:0.7rem;color:#5a4a20;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:0.5rem;">Requires</div>
                ${parents.map(p => `
                    <div style="font-size:0.78rem;color:${p.owned?GOLD:'#4a3818'};display:flex;align-items:center;gap:0.45rem;margin-bottom:0.35rem;">
                        <span style="width:6px;height:6px;border-radius:50%;flex-shrink:0;background:${p.owned?GOLD:'#3a2a0e'};display:inline-block;"></span>
                        ${p.name}
                    </div>`).join('')}
            </div>` : ''}
        `;
    }

    // ── Pan / zoom ────────────────────────────────────────────────────────────

    function _bindEvents(wrap) {
        _svg.addEventListener('click', e => {
            if (_dragMoved) return;
            if (e.target === _svg || e.target === _g) {
                if (_selectedId) { _selectedId = null; _lineageRel = new Map(); _drawAll(); }
                else if (_openHubId) { _collapse(); }
            }
        });

        wrap.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            _dragging = true; _dragMoved = false;
            _lastMouse = { x: e.clientX, y: e.clientY };
            wrap.style.cursor = 'grabbing';
        });
        window.addEventListener('mouseup', () => {
            _dragging = false;
            const w = document.getElementById('skillTreeCanvasWrap');
            if (w) w.style.cursor = 'grab';
        });
        window.addEventListener('mousemove', e => {
            if (!_dragging) return;
            const dx = e.clientX - _lastMouse.x, dy = e.clientY - _lastMouse.y;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _dragMoved = true;
            _pan.x += dx; _pan.y += dy;
            _lastMouse = { x: e.clientX, y: e.clientY };
            _applyTransform();
        });
        wrap.addEventListener('wheel', e => {
            e.preventDefault();
            _zoom = Math.min(5, Math.max(0.08, _zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
            _applyTransform();
        }, { passive: false });

        let lastTouch = null;
        let lastPinchDist = null;

        function _pinchDist(touches) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            return Math.sqrt(dx * dx + dy * dy);
        }
        function _pinchMid(touches) {
            return {
                x: (touches[0].clientX + touches[1].clientX) / 2,
                y: (touches[0].clientY + touches[1].clientY) / 2,
            };
        }

        wrap.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
                lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                lastPinchDist = null;
            } else if (e.touches.length === 2) {
                lastTouch = null;
                lastPinchDist = _pinchDist(e.touches);
            }
        }, { passive: true });

        wrap.addEventListener('touchmove', e => {
            e.preventDefault();
            if (e.touches.length === 1 && lastTouch) {
                _pan.x += e.touches[0].clientX - lastTouch.x;
                _pan.y += e.touches[0].clientY - lastTouch.y;
                lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                _applyTransform();
            } else if (e.touches.length === 2 && lastPinchDist !== null) {
                const newDist = _pinchDist(e.touches);
                const scale  = newDist / lastPinchDist;
                const mid    = _pinchMid(e.touches);
                const rect   = wrap.getBoundingClientRect();
                // Zoom toward the midpoint of the two fingers
                const cx = mid.x - rect.left;
                const cy = mid.y - rect.top;
                const newZoom = Math.min(5, Math.max(0.08, _zoom * scale));
                _pan.x = cx - (cx - _pan.x) * (newZoom / _zoom);
                _pan.y = cy - (cy - _pan.y) * (newZoom / _zoom);
                _zoom  = newZoom;
                lastPinchDist = newDist;
                _applyTransform();
            }
        }, { passive: false });

        wrap.addEventListener('touchend', e => {
            // Reset single-touch tracking when fingers lift
            if (e.touches.length === 1) {
                lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                lastPinchDist = null;
            } else if (e.touches.length === 0) {
                lastTouch = null;
                lastPinchDist = null;
            }
        }, { passive: true });
    }

})();
