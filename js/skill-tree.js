/**
 * skill-tree.js — Hub-and-spoke skill web
 *
 * Default view: 16 starter skills as hub nodes, sized by descendant count.
 * Click a hub: its full subtree expands around it, other hubs dim.
 * Click a child: detail panel, lineage highlight within the open hub.
 * Click background: collapse to hub view.
 */

(function () {

    // ── Constants ────────────────────────────────────────────────────────────

    const PANEL_W     = 268;
    const NODE_H      = 26;
    const NODE_PAD    = 14;
    const NODE_RX     = 5;
    const HUB_H       = 36;
    const HUB_PAD     = 18;
    const HUB_RX      = 8;

    // Hub layout — hubs spread on a grid/ring in canvas center
    const HUB_SPREAD  = 340;   // radius of hub arrangement circle

    // Child layout
    const CHILD_RING_BASE = 180;  // base radius from hub center to first child ring
    const CHILD_RING_GAP  = 120;  // additional radius per depth level

    // Colors
    const GOLD        = '#d4af37';
    const HUB_COLOR   = '#7a9acc';   // starter/hub color
    const OWNED_COLOR = '#d4af37';
    const HIGHLIGHT   = '#40c060';
    const AMBER       = '#a07828';
    const DIM         = '#3a3020';

    const CAT_COLOR = {
        DAMAGE_SINGLE: '#e05540', DAMAGE_MAGIC:  '#e05540',
        DAMAGE_AOE:    '#d4722a', DAMAGE_PROC:   '#c45a20',
        HEALING:       '#4a90d4', HEALING_AOE:   '#3a78bc', HEALING_PROC: '#3a78bc',
        RESTORATION:   '#5aacd4', BUFF:          '#9a6ed4',
        CONTROL:       '#3abcac', CONTROL_PROC:  '#2a9a8a',
        DEFENSE:       '#6a8aac', DEFENSE_PROC:  '#5a7a9c',
        UTILITY:       '#8a8a7a', UTILITY_PROC:  '#7a7a6a',
        WEAPON_SKILL:  '#c4a030', NO_RESOURCES:  '#707060',
        PROGRESSION:   '#a0c040', DEFAULT:       '#8a7a5a',
    };

    // ── State ────────────────────────────────────────────────────────────────

    let _skillsData   = null;
    let _character    = null;
    let _hubs         = [];      // hub node objects
    let _childNodes   = [];      // child node objects for open hub
    let _childEdges   = [];      // edges for open hub
    let _openHubId    = null;    // currently expanded hub
    let _selectedId   = null;    // selected skill id
    let _lineageRel   = new Map();  // id → relationship type
    let _svg          = null;
    let _g            = null;
    let _panel        = null;
    let _pan          = { x: 0, y: 0 };
    let _zoom         = 1;
    let _dragging     = false;
    let _dragMoved    = false;
    let _lastMouse    = { x: 0, y: 0 };

    // Precomputed
    let _skillMap     = null;
    let _childrenOf   = null;
    let _descCount    = null;
    let _depthInHub   = null;   // map of skillId → depth within open hub

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

        // Memoized descendant count
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
        const pad = isHub ? HUB_PAD : NODE_PAD;
        return Math.max(isHub ? 50 : 36, name.length * 4.4 + pad);
    }

    function _catColor(skill) {
        return CAT_COLOR[skill?.category] || CAT_COLOR.DEFAULT;
    }

    // ── Hub layout ────────────────────────────────────────────────────────────

    function _layoutHubs(cx, cy) {
        const starters = _skillsData.filter(s => s.isStarterSkill);
        const owned    = _ownedIds();

        // Sort by descendant count desc for visual weight
        starters.sort((a, b) => (_descCount.get(b.id) || 0) - (_descCount.get(a.id) || 0));

        _hubs = starters.map((s, i) => {
            const angle  = (i / starters.length) * Math.PI * 2 - Math.PI / 2;
            const desc   = _descCount.get(s.id) || 0;
            // Hub radius scales with descendants — bigger hub = more tree beneath it
            const hubR   = Math.max(HUB_SPREAD * 0.5, HUB_SPREAD * 0.7 + (desc / 128) * HUB_SPREAD * 0.4);
            return {
                id:    s.id,
                skill: s,
                rec:   _skillRecord(s.id),
                owned: owned.has(s.id),
                desc,
                x:     cx + Math.cos(angle) * HUB_SPREAD,
                y:     cy + Math.sin(angle) * HUB_SPREAD,
                hw:    _hw(s.name, true),
                hh:    HUB_H / 2,
                isHub: true,
            };
        });
    }

    // ── Child layout for open hub ─────────────────────────────────────────────

    function _layoutChildren(hubId) {
        const hub    = _hubs.find(h => h.id === hubId);
        if (!hub) return;
        const owned  = _ownedIds();

        // BFS from hub to collect all descendants with depth
        _depthInHub = new Map([[hubId, 0]]);
        const queue = [hubId];
        let qi = 0;
        while (qi < queue.length) {
            const id = queue[qi++];
            const d  = _depthInHub.get(id);
            (_childrenOf.get(id) || []).forEach(cid => {
                if (!_depthInHub.has(cid)) {
                    _depthInHub.set(cid, d + 1);
                    queue.push(cid);
                }
            });
        }

        // Group by depth
        const byDepth = new Map();
        _depthInHub.forEach((d, id) => {
            if (id === hubId) return;
            if (!byDepth.has(d)) byDepth.set(d, []);
            byDepth.get(d).push(id);
        });

        // Place children in rings around hub
        _childNodes = [];
        const placed = new Map([[hubId, hub]]);

        byDepth.forEach((ids, depth) => {
            const r = CHILD_RING_BASE + (depth - 1) * CHILD_RING_GAP;

            // Sort by angle of primary parent to keep related skills together
            ids.sort((a, b) => {
                const aParents = (_skillMap.get(a)?.parentSkills || []);
                const bParents = (_skillMap.get(b)?.parentSkills || []);
                const aAngle   = _angleOfParent(aParents, placed, hub);
                const bAngle   = _angleOfParent(bParents, placed, hub);
                return aAngle - bAngle;
            });

            ids.forEach((id, i) => {
                const skill  = _skillMap.get(id);
                if (!skill) return;
                const angle  = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
                const x      = hub.x + Math.cos(angle) * r;
                const y      = hub.y + Math.sin(angle) * r;
                const node   = {
                    id, skill,
                    rec:   _skillRecord(id),
                    owned: owned.has(id),
                    depth,
                    x, y,
                    hw:    _hw(skill.name, false),
                    hh:    NODE_H / 2,
                    isHub: false,
                    sharedWithOtherHub: (skill.parentSkills || []).some(p =>
                        _skillsData.find(s => s.isStarterSkill && s.id === p) && p !== hubId
                    ),
                };
                _childNodes.push(node);
                placed.set(id, node);
            });
        });

        // Separate overlapping child nodes
        _separateNodes(_childNodes);

        // Build edges — parent→child within this hub's tree
        _childEdges = [];
        _childNodes.forEach(node => {
            (node.skill.parentSkills || []).forEach(pid => {
                const pNode = placed.get(pid);
                if (!pNode) return;
                _childEdges.push({ from: pNode, to: node });
            });
        });
    }

    function _angleOfParent(parentIds, placed, hub) {
        for (const pid of parentIds) {
            const p = placed.get(pid);
            if (p) return Math.atan2(p.y - hub.y, p.x - hub.x);
        }
        return 0;
    }

    // ── Separation pass ───────────────────────────────────────────────────────

    function _separateNodes(nodes) {
        const MIN_X = 18, MIN_Y = 12, PASSES = 80;
        for (let pass = 0; pass < PASSES; pass++) {
            let moved = false;
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const a = nodes[i], b = nodes[j];
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const ox = (a.hw + b.hw + MIN_X) - Math.abs(dx);
                    const oy = (a.hh + b.hh + MIN_Y) - Math.abs(dy);
                    if (ox > 0 && oy > 0) {
                        moved = true;
                        if (ox < oy) {
                            const p = (ox / 2 + 1) * Math.sign(dx || 1);
                            a.x -= p; b.x += p;
                        } else {
                            const p = (oy / 2 + 1) * Math.sign(dy || 1);
                            a.y -= p; b.y += p;
                        }
                    }
                }
            }
            if (!moved) break;
        }
    }

    // ── Lineage ───────────────────────────────────────────────────────────────

    // Returns map of id → relationship ('selected'|'parent'|'child_owned'|'child_unowned')
    function _computeLineage(id) {
        const owned   = _ownedIds();
        const rel     = new Map([[id, 'selected']]);

        // Direct parents
        (_skillMap.get(id)?.parentSkills || []).forEach(pid => {
            if (!rel.has(pid)) rel.set(pid, 'parent');
        });

        // Direct children
        (_childrenOf.get(id) || []).forEach(cid => {
            const type = owned.has(cid) ? 'child_owned' : 'child_unowned';
            if (!rel.has(cid)) rel.set(cid, type);
            // If child is owned, show its children too
            if (owned.has(cid)) {
                (_childrenOf.get(cid) || []).forEach(gcid => {
                    if (!rel.has(gcid)) rel.set(gcid, owned.has(gcid) ? 'child_owned' : 'child_unowned');
                });
            }
        });

        return rel;
    }

    function _lineageIds() {
        return new Set(_lineageRel.keys());
    }

    // Nodes that need to be drawn for lineage but aren't in the open hub's child list
    function _lineageExtraNodes() {
        if (!_selectedId) return [];
        const _lineageIds = new Set(_lineageRel.keys());
        const owned    = _ownedIds();
        const inChild  = new Set([..._childNodes.map(n => n.id), _openHubId]);
        const extras   = [];
        new Set(_lineageRel.keys()).forEach(id => {
            if (inChild.has(id)) return;
            const skill = _skillMap.get(id);
            if (!skill) return;
            // Find position — use hub position if it's a hub, otherwise place near its child
            const hub = _hubs.find(h => h.id === id);
            if (hub) { extras.push(hub); return; }
            // Place near the selected node as a ghost
            const sel = _childNodes.find(n => n.id === _selectedId);
            if (!sel) return;
            const idx   = extras.length;
            const angle = (idx / 4) * Math.PI * 2;
            extras.push({
                id, skill, rec: _skillRecord(id),
                owned: owned.has(id),
                depth: 0,
                x: sel.x + Math.cos(angle) * 200,
                y: sel.y + Math.sin(angle) * 200,
                hw: _hw(skill.name, false),
                hh: NODE_H / 2,
                isHub: false,
                ghost: true,
            });
        });
        return extras;
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
                        <div style="font-size:0.72rem;color:#4a3a18;">Click a skill branch to explore it</div>
                        <button onclick="closeModal('skillTreeModal')" style="background:none;border:1px solid rgba(212,175,55,0.18);color:#6a5a30;padding:0.25rem 0.65rem;border-radius:3px;cursor:pointer;font-size:0.8rem;font-family:inherit;">✕ Close</button>
                    </div>
                </div>
                <div style="position:absolute;top:48px;left:0;right:0;bottom:24px;display:flex;">
                    <div id="skillTreeCanvasWrap" style="flex:1;overflow:hidden;cursor:grab;position:relative;">
                        <svg id="skillTreeSVG" style="display:block;width:100%;height:100%;"></svg>
                    </div>
                    <div id="skillTreePanel" style="width:${PANEL_W}px;flex-shrink:0;border-left:1px solid rgba(212,175,55,0.08);background:var(--window-base,#060503);padding:1.25rem 1rem;overflow-y:auto;font-family:var(--font-body);color:var(--text-primary,#e8e0d0);">
                        <div style="color:#3a3020;font-size:0.78rem;font-style:italic;margin-top:2rem;text-align:center;">Select a skill to inspect</div>
                    </div>
                </div>
                <div style="position:absolute;bottom:0;left:0;right:${PANEL_W}px;height:24px;text-align:center;font-size:0.68rem;color:#2a1e08;line-height:24px;font-family:var(--font-body);">Drag to pan · Scroll to zoom · Click hub to explore · Click background to collapse</div>
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

    function _applyTransform() {
        if (_g) _g.setAttribute('transform', `translate(${_pan.x},${_pan.y}) scale(${_zoom})`);
    }

    // ── Drawing ───────────────────────────────────────────────────────────────

    function _drawAll() {
        if (!_g) return;
        _g.innerHTML = '';
        const owned  = _ownedIds();
        const hasSel = _selectedId !== null;

        // Draw child edges (behind everything)
        if (_openHubId) {
            _childEdges.forEach(e => {
                const toRel   = _lineageRel.get(e.to.id);
                const fromRel = _lineageRel.get(e.from.id);
                if (hasSel && !toRel && !fromRel) return;
                if (!hasSel) {
                    _drawEdge(e.from, e.to, 'rgba(180,150,60,0.2)', 0.8, false);
                    return;
                }
                // Parent edge: from parent to selected
                if (fromRel === 'parent' && e.to.id === _selectedId) {
                    _drawEdge(e.from, e.to, 'rgba(212,175,55,0.85)', 2, false);
                }
                // Child owned edge: from selected to owned child
                else if (e.from.id === _selectedId && toRel === 'child_owned') {
                    _drawEdge(e.from, e.to, 'rgba(212,175,55,0.7)', 1.5, true);
                }
                // Child unowned edge
                else if (e.from.id === _selectedId && toRel === 'child_unowned') {
                    _drawEdge(e.from, e.to, 'rgba(160,130,50,0.4)', 1, true);
                }
                // Grandchild edges (owned child → its children)
                else if (fromRel === 'child_owned' && toRel) {
                    _drawEdge(e.from, e.to, toRel === 'child_owned' ? 'rgba(212,175,55,0.5)' : 'rgba(140,110,40,0.3)', 1, true);
                }
            });
        }

        // Draw child nodes
        if (_openHubId) {
            _childNodes.forEach(node => {
                const inLineage = _lineageRel.has(node.id);
                const opacity   = hasSel ? (inLineage ? 1.0 : 0.07) : (node.owned ? 1.0 : _distOpacity(node, owned));
                _drawNode(node, inLineage, opacity, owned);
            });

            // Draw extra lineage nodes (cross-hub parents/children not in current subtree)
            if (hasSel) {
                const extras = _lineageExtraNodes();
                extras.forEach(node => {
                    if (_hubs.find(h => h.id === node.id)) return; // hubs drawn separately
                    _drawNode(node, true, 1.0, owned);
                });
                // Draw edges to extra nodes
                const allVisible = new Map([..._childNodes.map(n => [n.id, n]), ...extras.map(n => [n.id, n])]);
                extras.forEach(node => {
                    (node.skill?.parentSkills || []).forEach(pid => {
                        const pNode = allVisible.get(pid);
                        if (pNode) _drawEdge(pNode, node, 'rgba(60,200,100,0.5)', 1.2);
                    });
                    (_childrenOf.get(node.id) || []).forEach(cid => {
                        const cNode = allVisible.get(cid);
                        if (cNode && _lineageRel.has(cid)) _drawEdge(node, cNode, 'rgba(60,200,100,0.5)', 1.2);
                    });
                });
            }
        }

        // Draw hubs (always on top)
        _hubs.forEach(hub => {
            const isOpen   = hub.id === _openHubId;
            const isParent = _lineageRel.get(hub.id) === 'parent';
            const isDimmed = _openHubId && !isOpen && !isParent;
            const opacity  = isDimmed ? 0.25 : 1.0;
            _drawHub(hub, isOpen, opacity, owned, isParent);
        });

        // Draw solid gold edges from parent hubs to selected skill
        if (_selectedId && hasSel) {
            const selNode = _childNodes.find(n => n.id === _selectedId);
            if (selNode) {
                _hubs.forEach(hub => {
                    if (_lineageRel.get(hub.id) === 'parent') {
                        _drawEdge(hub, selNode, 'rgba(212,175,55,0.75)', 2, false);
                    }
                });
            }
        }
    }

    function _distOpacity(node, owned) {
        // How many hops from an owned skill or hub root
        const parents = node.skill?.parentSkills || [];
        const ownedParents = parents.filter(p => owned.has(p) || _hubs.find(h => h.id === p));
        if (node.owned) return 1.0;
        if (ownedParents.length > 0) return 0.75;
        if (node.depth === 2) return 0.45;
        if (node.depth === 3) return 0.25;
        return 0.12;
    }

    function _drawEdge(from, to, stroke, width, dashed=false) {
        const dx  = to.x - from.x, dy = to.y - from.y;
        const len = Math.sqrt(dx*dx + dy*dy) || 1;
        const x1  = from.x + (dx/len) * from.hw;
        const y1  = from.y + (dy/len) * from.hh;
        const x2  = to.x   - (dx/len) * to.hw;
        const y2  = to.y   - (dy/len) * to.hh;
        const mx  = (x1+x2)/2, my = (y1+y2)/2;
        const mag = Math.sqrt(mx*mx+my*my) || 1;
        const el  = Math.sqrt((x2-x1)**2+(y2-y1)**2);
        const cx  = mx + (mx/mag)*el*0.1;
        const cy  = my + (my/mag)*el*0.1;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`);
        path.setAttribute('stroke', stroke);
        path.setAttribute('stroke-width', width);
        path.setAttribute('fill', 'none');
        if (dashed) path.setAttribute('stroke-dasharray', '5 4');
        _g.appendChild(path);
    }

    function _drawHub(hub, isOpen, opacity, owned, isParent=false) {
        const color = hub.owned ? OWNED_COLOR : HUB_COLOR;
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${hub.x},${hub.y})`);
        g.dataset.skillId = hub.id;
        g.dataset.isHub   = '1';
        g.style.cursor    = 'pointer';
        g.style.opacity   = opacity;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x',      -hub.hw);
        rect.setAttribute('y',      -hub.hh);
        rect.setAttribute('width',   hub.hw * 2);
        rect.setAttribute('height',  HUB_H);
        rect.setAttribute('rx',      HUB_RX);
        rect.setAttribute('fill',    isOpen ? 'rgba(122,154,204,0.18)' : hub.owned ? 'rgba(212,175,55,0.12)' : 'rgba(12,10,6,0.9)');
        rect.setAttribute('stroke',  isParent ? GOLD : isOpen ? '#aac0e0' : color);
        rect.setAttribute('stroke-width', isParent ? 2 : isOpen ? 2 : 1.2);
        g.appendChild(rect);

        // Desc count badge
        const desc = _descCount.get(hub.id) || 0;
        const owned_ct = _countOwnedDesc(hub.id, owned);
        const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        badge.setAttribute('x', hub.hw - 3);
        badge.setAttribute('y', -(hub.hh - 8));
        badge.setAttribute('text-anchor', 'end');
        badge.setAttribute('fill', '#5a7a5a');
        badge.setAttribute('font-size', '7');
        badge.setAttribute('font-family', 'var(--font-body,sans-serif)');
        badge.style.pointerEvents = 'none';
        badge.textContent = owned_ct > 0 ? `${owned_ct}/${desc}` : desc;
        g.appendChild(badge);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('fill', isOpen ? '#aac0e0' : color);
        text.setAttribute('font-size', '11');
        text.setAttribute('font-family', 'var(--font-body,sans-serif)');
        text.setAttribute('font-weight', '600');
        text.style.pointerEvents = 'none';
        text.style.userSelect    = 'none';
        text.textContent = hub.skill.name;
        g.appendChild(text);

        g.addEventListener('click', e => { e.stopPropagation(); if (!_dragMoved) _openHub(hub); });
        _g.appendChild(g);
    }

    function _drawNode(node, inLineage, opacity, owned) {
        const rel   = _lineageRel.get(node.id);
        const color = rel === 'selected'      ? HIGHLIGHT
                    : rel === 'parent'         ? GOLD
                    : rel === 'child_owned'    ? GOLD
                    : rel === 'child_unowned'  ? _catColor(node.skill)
                    : node.owned ? OWNED_COLOR : _catColor(node.skill);
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${node.x},${node.y})`);
        g.dataset.skillId = node.id;
        g.style.cursor    = 'pointer';
        g.style.opacity   = opacity;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x',      -node.hw);
        rect.setAttribute('y',      -node.hh);
        rect.setAttribute('width',   node.hw * 2);
        rect.setAttribute('height',  NODE_H);
        rect.setAttribute('rx',      NODE_RX);
        const selFill = rel === 'selected' ? 'rgba(212,175,55,0.15)'
                       : rel === 'parent'  ? 'rgba(212,175,55,0.08)'
                       : node.owned ? 'rgba(212,175,55,0.06)' : 'rgba(10,7,2,0.88)';
        rect.setAttribute('fill',    selFill);
        rect.setAttribute('stroke',  color);
        rect.setAttribute('stroke-width', rel === 'selected' ? 2.5 : rel === 'parent' ? 1.8 : rel === 'child_owned' ? 1.5 : node.owned ? 1.2 : 0.7);
        g.appendChild(rect);

        // Partial parent bar
        const parents = node.skill?.parentSkills || [];
        const ownedPCt = parents.filter(p => owned.has(p)).length;
        if (ownedPCt > 0 && ownedPCt < parents.length) {
            const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            bar.setAttribute('x', -node.hw + NODE_RX);
            bar.setAttribute('y', node.hh - 3);
            bar.setAttribute('width', (node.hw * 2 - NODE_RX * 2) * (ownedPCt / parents.length));
            bar.setAttribute('height', 2);
            bar.setAttribute('rx', 1);
            bar.setAttribute('fill', GOLD);
            bar.setAttribute('fill-opacity', '0.6');
            g.appendChild(bar);
        }

        // Shared-hub indicator dot
        if (node.sharedWithOtherHub) {
            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', node.hw - 5);
            dot.setAttribute('cy', 0);
            dot.setAttribute('r', 3);
            dot.setAttribute('fill', AMBER);
            dot.setAttribute('fill-opacity', '0.7');
            g.appendChild(dot);
        }

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('fill', color);
        text.setAttribute('font-size', node.owned ? '10' : '9');
        text.setAttribute('font-family', 'var(--font-body,sans-serif)');
        text.setAttribute('font-weight', node.owned ? '600' : '400');
        text.style.pointerEvents = 'none';
        text.style.userSelect    = 'none';
        text.textContent = node.skill?.name || node.id;
        g.appendChild(text);

        if (node.owned && node.rec && (node.rec.skillLevel || 0) >= 1) {
            const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            badge.setAttribute('x', node.hw - 2);
            badge.setAttribute('y', -(node.hh - 7));
            badge.setAttribute('text-anchor', 'end');
            badge.setAttribute('fill', '#8b7355');
            badge.setAttribute('font-size', '7');
            badge.setAttribute('font-family', 'var(--font-body,sans-serif)');
            badge.style.pointerEvents = 'none';
            badge.textContent = `L${node.rec.skillLevel}`;
            g.appendChild(badge);
        }

        g.addEventListener('click', e => { e.stopPropagation(); if (!_dragMoved) _selectSkill(node); });
        _g.appendChild(g);
    }

    function _countOwnedDesc(hubId, owned) {
        let count = 0;
        const visit = (id, seen = new Set()) => {
            if (seen.has(id)) return; seen.add(id);
            (_childrenOf.get(id) || []).forEach(cid => {
                if (owned.has(cid)) count++;
                visit(cid, seen);
            });
        };
        visit(hubId);
        return count;
    }

    // ── Interactions ──────────────────────────────────────────────────────────

    function _openHub(hub) {
        _openHubId = hub.id;
        // Preserve selection — don't clear _selectedId or _lineageRel
        _layoutChildren(hub.id);

        const hubNameEl = document.getElementById('skillTreeHubName');
        if (hubNameEl) hubNameEl.textContent = `— ${hub.skill.name}`;

        // If there's an active selection, recompute lineage in case new hub
        // exposes nodes that are parents/children of the selected skill
        if (_selectedId) _lineageRel = _computeLineage(_selectedId);

        // Pan to hub
        const wrap = document.getElementById('skillTreeCanvasWrap');
        if (wrap) {
            _zoom  = 0.7;
            _pan.x = wrap.clientWidth  / 2 - hub.x * _zoom;
            _pan.y = wrap.clientHeight / 2 - hub.y * _zoom;
            _applyTransform();
        }

        _drawAll();

        // If no active selection, reset panel
        if (!_selectedId && _panel) {
            _panel.innerHTML = `<div style="color:#3a3020;font-size:0.78rem;font-style:italic;margin-top:2rem;text-align:center;">Select a skill to inspect</div>`;
        }
    }

    function _selectSkill(node) {
        _selectedId = node.id;
        _lineageRel = _computeLineage(node.id);
        _drawAll();

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
        const hubNameEl = document.getElementById('skillTreeHubName');
        if (hubNameEl) hubNameEl.textContent = '';
        _drawAll();
        if (_panel) _panel.innerHTML = `<div style="color:#3a3020;font-size:0.78rem;font-style:italic;margin-top:2rem;text-align:center;">Select a skill to inspect</div>`;
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
            ? Object.entries(skill.scalingFactors).map(([k,v]) => `${k} ×${v}`).join(', ')
            : null;
        const statusColor = owned ? GOLD : AMBER;
        const statusText  = owned ? 'Learned' : `Depth ${node.depth} — not yet learned`;

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
                ${rec && (rec.skillLevel||0) >= 1 ? `<div>Level: <span style="color:${GOLD};">${rec.skillLevel}</span></div>` : ''}
                ${rec && (rec.skillLevel||0) >= 1 ? `<div>XP: <span style="color:#9a8040;">${Math.floor(rec.skillXP||0)}</span></div>` : ''}
            </div>
            ${parents.length ? `
            <div style="margin-top:1rem;">
                <div style="font-size:0.7rem;color:#5a4a20;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:0.5rem;">Requires</div>
                ${parents.map(p => `
                    <div style="font-size:0.78rem;color:${p.owned ? GOLD : '#4a3818'};display:flex;align-items:center;gap:0.45rem;margin-bottom:0.35rem;">
                        <span style="width:6px;height:6px;border-radius:50%;flex-shrink:0;background:${p.owned ? GOLD : '#3a2a0e'};display:inline-block;"></span>
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
                if (_selectedId) {
                    _selectedId = null; _lineageRel = new Map(); _drawAll();
                } else if (_openHubId) {
                    _collapse();
                }
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
        wrap.addEventListener('touchstart', e => {
            if (e.touches.length === 1) lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        });
        wrap.addEventListener('touchmove', e => {
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
