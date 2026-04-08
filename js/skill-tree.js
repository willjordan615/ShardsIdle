/**
 * skill-tree.js — Root-ring skill web
 *
 * The 16 isStarterSkill nodes form a fixed central ring. All other skills
 * radiate outward by depth. Ownership illuminates the tree — owned skills
 * glow, unowned dims with distance from the nearest owned node.
 *
 * Click: zoom + detail panel. Pan: drag. Zoom: scroll.
 */

(function () {

    // ── Constants ────────────────────────────────────────────────────────────

    const PANEL_W    = 268;
    const NODE_H     = 26;
    const NODE_PAD   = 12;
    const NODE_RX    = 5;

    // Ring and radial spacing
    const RING_R     = 180;   // radius of the root ring
    const DEPTH_GAP  = 160;   // additional radius per depth level beyond ring

    // Colors
    const GOLD       = '#d4af37';
    const ROOT_COLOR = '#7a9acc';  // blue-grey — universal starter skills
    const OWNED_COLOR= '#d4af37';  // gold — character's learned skills
    const HIGHLIGHT  = '#40c060';

    const CAT_COLOR = {
        DAMAGE_SINGLE: '#e05540',
        DAMAGE_MAGIC:  '#e05540',
        DAMAGE_AOE:    '#d4722a',
        DAMAGE_PROC:   '#c45a20',
        HEALING:       '#4a90d4',
        HEALING_AOE:   '#3a78bc',
        HEALING_PROC:  '#3a78bc',
        RESTORATION:   '#5aacd4',
        BUFF:          '#9a6ed4',
        CONTROL:       '#3abcac',
        CONTROL_PROC:  '#2a9a8a',
        DEFENSE:       '#6a8aac',
        DEFENSE_PROC:  '#5a7a9c',
        UTILITY:       '#8a8a7a',
        UTILITY_PROC:  '#7a7a6a',
        WEAPON_SKILL:  '#c4a030',
        NO_RESOURCES:  '#707060',
        PROGRESSION:   '#a0c040',
        DEFAULT:       '#8a7a5a',
    };

    // ── State ────────────────────────────────────────────────────────────────

    let _skillsData  = null;
    let _character   = null;
    let _nodes       = [];
    let _edges       = [];
    let _svg         = null;
    let _g           = null;
    let _panel       = null;
    let _pan         = { x: 0, y: 0 };
    let _zoom        = 1;
    let _dragging    = false;
    let _dragMoved   = false;
    let _lastMouse   = { x: 0, y: 0 };
    let _selectedId  = null;
    let _lineageIds  = new Set();

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
        if (!_character) {
            const wrap = document.getElementById('skillTreeCanvasWrap');
            if (wrap) wrap.innerHTML = '<div style="color:#8b7355;padding:2rem;text-align:center;">Could not load character data.</div>';
            return;
        }

        requestAnimationFrame(() => _initCanvas());
    };

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

    function _nodeHalfW(name) {
        return Math.max(36, name.length * 4.2 + NODE_PAD);
    }

    function _categoryColor(skill) {
        if (!skill) return CAT_COLOR.DEFAULT;
        return CAT_COLOR[skill.category] || CAT_COLOR.DEFAULT;
    }

    // ── Layout ────────────────────────────────────────────────────────────────

    function _buildLayout() {
        const owned    = _ownedIds();
        const skillMap = new Map(_skillsData.map(s => [s.id, s]));
        const starters = new Set(_skillsData.filter(s => s.isStarterSkill).map(s => s.id));

        // Compute depth for every skill (1 = root/starter)
        const depthMap = new Map();
        function getDepth(id, visited = new Set()) {
            if (depthMap.has(id)) return depthMap.get(id);
            if (visited.has(id)) return 1;
            visited.add(id);
            const s = skillMap.get(id);
            if (!s || !(s.parentSkills || []).length) {
                depthMap.set(id, 1); return 1;
            }
            const d = Math.max(...s.parentSkills.map(p => getDepth(p, new Set(visited)))) + 1;
            depthMap.set(id, d);
            return d;
        }
        _skillsData.forEach(s => getDepth(s.id));

        // Assign angle to each starter on the ring
        const starterList = _skillsData.filter(s => s.isStarterSkill);
        const starterAngle = new Map();
        starterList.forEach((s, i) => {
            starterAngle.set(s.id, (i / starterList.length) * Math.PI * 2 - Math.PI / 2);
        });

        // For each non-starter skill, compute its angular position as the
        // average of its parents' angles, recursively resolved
        const angleMap = new Map(starterAngle);
        function getAngle(id, visited = new Set()) {
            if (angleMap.has(id)) return angleMap.get(id);
            if (visited.has(id)) return 0;
            visited.add(id);
            const s = skillMap.get(id);
            if (!s || !(s.parentSkills || []).length) return 0;
            const parentAngles = s.parentSkills.map(p => getAngle(p, new Set(visited)));
            // Average angles (handle wraparound via sin/cos)
            const sinSum = parentAngles.reduce((a, t) => a + Math.sin(t), 0);
            const cosSum = parentAngles.reduce((a, t) => a + Math.cos(t), 0);
            const avg = Math.atan2(sinSum, cosSum);
            angleMap.set(id, avg);
            return avg;
        }
        _skillsData.forEach(s => getAngle(s.id));

        // Place nodes: radius = RING_R + (depth - 1) * DEPTH_GAP
        _nodes = [];
        const placed = new Map();

        _skillsData.forEach(s => {
            const depth = depthMap.get(s.id) || 1;
            const angle = angleMap.get(s.id) || 0;
            const r     = RING_R + (depth - 1) * DEPTH_GAP;
            const x     = Math.cos(angle) * r;
            const y     = Math.sin(angle) * r;
            const hw    = _nodeHalfW(s.name);
            const node  = {
                id:      s.id,
                skill:   s,
                rec:     _skillRecord(s.id),
                depth,
                isRoot:  starters.has(s.id),
                owned:   owned.has(s.id),
                x, y, r: hw,
            };
            _nodes.push(node);
            placed.set(s.id, node);
        });

        // Separate overlapping nodes
        _separateNodes();

        // Build edges — immediate parent→child only
        _edges = [];
        _nodes.forEach(node => {
            (node.skill.parentSkills || []).forEach(pid => {
                const pNode = placed.get(pid);
                if (!pNode) return;
                _edges.push({ from: pNode, to: node, immediate: true });
            });
        });
    }

    // ── Separation pass ───────────────────────────────────────────────────────

    function _separateNodes() {
        const MIN_X_GAP = 20;
        const MIN_Y_GAP = 14;
        const PASSES    = 60;

        for (let pass = 0; pass < PASSES; pass++) {
            let moved = false;
            for (let i = 0; i < _nodes.length; i++) {
                for (let j = i + 1; j < _nodes.length; j++) {
                    const a = _nodes[i], b = _nodes[j];
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const overlapX = (a.r + b.r + MIN_X_GAP) - Math.abs(dx);
                    const overlapY = (NODE_H / 2 + NODE_H / 2 + MIN_Y_GAP) - Math.abs(dy);

                    if (overlapX > 0 && overlapY > 0) {
                        moved = true;
                        if (overlapX < overlapY) {
                            const push = (overlapX / 2 + 1) * Math.sign(dx || 1);
                            a.x -= push; b.x += push;
                        } else {
                            const push = (overlapY / 2 + 1) * Math.sign(dy || 1);
                            a.y -= push; b.y += push;
                        }
                    }
                }
            }
            if (!moved) break;
        }
    }

    // ── Ownership distance ────────────────────────────────────────────────────

    function _buildDistanceFromOwned() {
        const owned    = _ownedIds();
        const distMap  = new Map();
        const skillMap = new Map(_skillsData.map(s => [s.id, s]));
        const queue    = [];

        _nodes.forEach(n => {
            if (n.isRoot || owned.has(n.id)) { distMap.set(n.id, 0); queue.push(n.id); }
        });

        let qi = 0;
        while (qi < queue.length) {
            const id   = queue[qi++];
            const dist = distMap.get(id);
            const s    = skillMap.get(id);
            if (!s) continue;
            // Children
            _skillsData.forEach(child => {
                if ((child.parentSkills || []).includes(id) && !distMap.has(child.id)) {
                    distMap.set(child.id, dist + 1);
                    queue.push(child.id);
                }
            });
            // Parents
            (s.parentSkills || []).forEach(pid => {
                if (!distMap.has(pid)) {
                    distMap.set(pid, dist + 1);
                    queue.push(pid);
                }
            });
        }
        return distMap;
    }

    function _nodeOpacity(node, distMap) {
        if (node.isRoot) return 1.0;
        if (node.owned)  return 1.0;
        const dist = distMap.get(node.id) ?? 99;
        if (dist === 0) return 1.0;
        if (dist === 1) return 0.75;
        if (dist === 2) return 0.45;
        if (dist === 3) return 0.22;
        return 0.08;
    }

    function _nodeColor(node) {
        if (node.isRoot)  return ROOT_COLOR;
        if (node.owned)   return OWNED_COLOR;
        return _categoryColor(node.skill);
    }

    // ── Modal ─────────────────────────────────────────────────────────────────

    function _renderModal() {
        let modal = document.getElementById('skillTreeModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'skillTreeModal';
            modal.style.cssText = `
                display:none; position:fixed; inset:0;
                background:rgba(4,3,1,0.96);
                z-index:1000; overflow:hidden;
                width:100vw; height:100vh; box-sizing:border-box;
            `;
            modal.innerHTML = `
                <div style="
                    position:absolute; top:0; left:0; right:0; height:48px;
                    display:flex; align-items:center; justify-content:space-between;
                    padding:0 1.25rem;
                    background:var(--window-base,#080604);
                    border-bottom:1px solid rgba(212,175,55,0.12);
                    z-index:2; box-sizing:border-box;">
                    <div style="display:flex; align-items:center; gap:1rem;">
                        <span style="font-family:var(--font-display); color:${GOLD}; font-size:0.95rem; letter-spacing:0.06em;">Skill Web</span>
                        <span id="skillTreeCharName" style="color:#6a5a30; font-size:0.8rem;"></span>
                    </div>
                    <div style="display:flex; align-items:center; gap:1.5rem;">
                        <div style="display:flex; align-items:center; gap:1rem; font-size:0.72rem; color:#5a4a20;">
                            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${ROOT_COLOR};margin-right:5px;vertical-align:middle;"></span>Starter</span>
                            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${GOLD};margin-right:5px;vertical-align:middle;"></span>Learned</span>
                            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#888;margin-right:5px;vertical-align:middle;opacity:0.5;"></span>Unlearned</span>
                        </div>
                        <button onclick="closeModal('skillTreeModal')"
                            style="background:none; border:1px solid rgba(212,175,55,0.18); color:#6a5a30;
                                   padding:0.25rem 0.65rem; border-radius:3px; cursor:pointer;
                                   font-size:0.8rem; font-family:inherit;">✕ Close</button>
                    </div>
                </div>
                <div style="position:absolute; top:48px; left:0; right:0; bottom:24px; display:flex;">
                    <div id="skillTreeCanvasWrap" style="flex:1; overflow:hidden; cursor:grab; position:relative;">
                        <svg id="skillTreeSVG" style="display:block; width:100%; height:100%;"></svg>
                    </div>
                    <div id="skillTreePanel" style="
                        width:${PANEL_W}px; flex-shrink:0;
                        border-left:1px solid rgba(212,175,55,0.08);
                        background:var(--window-base,#060503);
                        padding:1.25rem 1rem; overflow-y:auto;
                        font-family:var(--font-body);
                        color:var(--text-primary,#e8e0d0);">
                        <div style="color:#3a3020; font-size:0.78rem; font-style:italic; margin-top:2rem; text-align:center;">
                            Select a skill to inspect
                        </div>
                    </div>
                </div>
                <div style="position:absolute; bottom:0; left:0; right:${PANEL_W}px; height:24px;
                    text-align:center; font-size:0.68rem; color:#2a1e08; line-height:24px;
                    font-family:var(--font-body);">Drag to pan · Scroll to zoom</div>
            `;
            document.body.appendChild(modal);
        }

        _pan = { x: 0, y: 0 };
        _zoom = 1;
        _selectedId = null;
        _lineageIds = new Set();
        document.getElementById('skillTreeCharName').textContent = _character?.name || '';
        modal.style.display = 'block';
    }

    // ── Canvas init ───────────────────────────────────────────────────────────

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

        _buildLayout();
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

        const distMap  = _buildDistanceFromOwned();
        const hasSel   = _selectedId !== null;

        // Edges first (behind nodes)
        _edges.forEach(e => {
            const edgeInLineage = _lineageIds.has(e.from.id) && _lineageIds.has(e.to.id);
            if (!edgeInLineage && hasSel) return;  // hide all edges when something selected except lineage
            if (!edgeInLineage) {
                // Only show edge if at least one endpoint is owned or root
                const fromVisible = e.from.isRoot || e.from.owned;
                const toVisible   = e.to.isRoot   || e.to.owned;
                if (!fromVisible && !toVisible) {
                    const fromDist = distMap.get(e.from.id) ?? 99;
                    const toDist   = distMap.get(e.to.id)   ?? 99;
                    if (Math.min(fromDist, toDist) > 2) return;
                }
            }

            const dx  = e.to.x - e.from.x, dy = e.to.y - e.from.y;
            const len = Math.sqrt(dx*dx + dy*dy) || 1;
            const x1  = e.from.x + (dx/len) * e.from.r;
            const y1  = e.from.y + (dy/len) * (NODE_H/2);
            const x2  = e.to.x   - (dx/len) * e.to.r;
            const y2  = e.to.y   - (dy/len) * (NODE_H/2);
            const mx  = (x1+x2)/2, my = (y1+y2)/2;
            const mag = Math.sqrt(mx*mx + my*my) || 1;
            const edgeLen = Math.sqrt((x2-x1)**2+(y2-y1)**2);
            const cx  = mx + (mx/mag) * edgeLen * 0.12;
            const cy  = my + (my/mag) * edgeLen * 0.12;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`);
            path.setAttribute('stroke', edgeInLineage ? 'rgba(60,200,100,0.7)' : 'rgba(180,150,60,0.3)');
            path.setAttribute('stroke-width', edgeInLineage ? 2 : 0.8);
            path.setAttribute('fill', 'none');
            _g.appendChild(path);
        });

        // Nodes
        _nodes.forEach(n => _drawNode(n, distMap, hasSel));
    }

    function _drawNode(node, distMap, hasSel) {
        const inLineage = _lineageIds.has(node.id);
        const color     = inLineage ? HIGHLIGHT : _nodeColor(node);
        const opacity   = hasSel ? (inLineage ? 1.0 : 0.06) : _nodeOpacity(node, distMap);
        const hw        = node.r;
        const hh        = NODE_H / 2;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${node.x},${node.y})`);
        g.dataset.skillId = node.id;
        g.style.cursor    = 'pointer';
        g.style.opacity   = opacity;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', -hw);
        rect.setAttribute('y', -hh);
        rect.setAttribute('width', hw * 2);
        rect.setAttribute('height', NODE_H);
        rect.setAttribute('rx', NODE_RX);
        rect.setAttribute('fill', inLineage ? 'rgba(40,180,80,0.15)' : node.owned || node.isRoot ? 'rgba(212,175,55,0.08)' : 'rgba(10,7,2,0.85)');
        rect.setAttribute('stroke', inLineage ? HIGHLIGHT : color);
        rect.setAttribute('stroke-width', node.id === _selectedId ? 2.5 : node.owned || node.isRoot ? 1.2 : 0.7);
        g.appendChild(rect);

        // Partial parent progress bar
        const parents = node.skill?.parentSkills || [];
        const owned   = _ownedIds();
        if (!node.isRoot && parents.length > 1) {
            const ownedCount = parents.filter(p => owned.has(p)).length;
            if (ownedCount > 0 && ownedCount < parents.length) {
                const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                bar.setAttribute('x', -hw + NODE_RX);
                bar.setAttribute('y', hh - 3);
                bar.setAttribute('width', (hw * 2 - NODE_RX * 2) * (ownedCount / parents.length));
                bar.setAttribute('height', 2);
                bar.setAttribute('rx', 1);
                bar.setAttribute('fill', GOLD);
                bar.setAttribute('fill-opacity', '0.6');
                g.appendChild(bar);
            }
        }

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('fill', inLineage ? HIGHLIGHT : color);
        text.setAttribute('font-size', node.isRoot || node.owned ? '10' : '9');
        text.setAttribute('font-family', 'var(--font-body, sans-serif)');
        text.setAttribute('font-weight', node.isRoot || node.owned ? '600' : '400');
        text.style.pointerEvents = 'none';
        text.style.userSelect    = 'none';
        text.textContent = node.skill?.name || node.id;
        g.appendChild(text);

        if (node.owned && node.rec && (node.rec.skillLevel || 0) >= 1) {
            const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            badge.setAttribute('x', hw - 2);
            badge.setAttribute('y', -(hh - 7));
            badge.setAttribute('text-anchor', 'end');
            badge.setAttribute('fill', '#8b7355');
            badge.setAttribute('font-size', '7');
            badge.setAttribute('font-family', 'var(--font-body, sans-serif)');
            badge.style.pointerEvents = 'none';
            badge.textContent = `L${node.rec.skillLevel}`;
            g.appendChild(badge);
        }

        g.addEventListener('click', (e) => { e.stopPropagation(); if (!_dragMoved) _selectNode(node); });
        _g.appendChild(g);
    }

    // ── Lineage ───────────────────────────────────────────────────────────────

    function _computeLineage(id) {
        const ids      = new Set([id]);
        const skillMap = new Map(_skillsData.map(s => [s.id, s]));

        const walkUp = (sid) => {
            const s = skillMap.get(sid);
            (s?.parentSkills || []).forEach(pid => { if (!ids.has(pid)) { ids.add(pid); walkUp(pid); } });
        };
        const walkDown = (sid) => {
            _skillsData.forEach(s => {
                if ((s.parentSkills || []).includes(sid) && !ids.has(s.id)) { ids.add(s.id); walkDown(s.id); }
            });
        };

        walkUp(id);
        walkDown(id);
        return ids;
    }

    // ── Selection ─────────────────────────────────────────────────────────────

    function _selectNode(node) {
        _selectedId = node.id;
        _lineageIds = _computeLineage(node.id);
        _drawAll();

        const wrap = document.getElementById('skillTreeCanvasWrap');
        if (wrap) {
            const W = wrap.clientWidth, H = wrap.clientHeight;
            const z = Math.max(_zoom, 2.0);
            _zoom  = z;
            _pan.x = W / 2 - node.x * z;
            _pan.y = H / 2 - node.y * z;
            _applyTransform();
        }
        _renderPanel(node);
    }

    // ── Detail panel ──────────────────────────────────────────────────────────

    function _renderPanel(node) {
        if (!_panel) return;
        const { skill, rec, owned, isRoot } = node;
        const ownedSet = _ownedIds();

        const cat     = (skill?.category || '').replace(/_/g, ' ').toLowerCase();
        const costStr = skill?.costType && skill?.costAmount != null ? `${skill.costAmount} ${skill.costType}` : null;
        const parents = (skill?.parentSkills || []).map(pid => {
            const ps = _skillsData.find(s => s.id === pid);
            return { name: ps?.name || pid, owned: ownedSet.has(pid) };
        });
        const scaling = skill?.scalingFactors
            ? Object.entries(skill.scalingFactors).map(([k, v]) => `${k} ×${v}`).join(', ')
            : null;

        const statusColor = isRoot ? ROOT_COLOR : owned ? GOLD : '#8a7a5a';
        const statusText  = isRoot ? 'Starter skill' : owned ? 'Learned' : `Depth ${node.depth}`;

        _panel.innerHTML = `
            <div style="border-bottom:1px solid rgba(212,175,55,0.1); padding-bottom:0.8rem; margin-bottom:0.8rem;">
                <div style="font-family:var(--font-display); color:${GOLD}; font-size:0.95rem; margin-bottom:0.3rem;">${skill?.name || node.id}</div>
                <div style="font-size:0.7rem; color:${statusColor}; letter-spacing:0.07em; text-transform:uppercase;">${statusText}</div>
            </div>
            <div style="font-size:0.78rem; color:#9a8850; line-height:1.65; margin-bottom:0.9rem; font-style:italic;">${skill?.description || ''}</div>
            <div style="font-size:0.7rem; color:#5a4a20; letter-spacing:0.05em; text-transform:uppercase; margin-bottom:0.45rem;">Details</div>
            <div style="font-size:0.78rem; color:#7a6830; line-height:2.0;">
                <div>Category: <span style="color:#9a8040;">${cat}</span></div>
                ${costStr  ? `<div>Cost: <span style="color:#9a8040;">${costStr}</span></div>` : ''}
                ${scaling  ? `<div>Scales: <span style="color:#9a8040;">${scaling}</span></div>` : ''}
                ${rec && (rec.skillLevel || 0) >= 1 ? `<div>Level: <span style="color:${GOLD};">${rec.skillLevel}</span></div>` : ''}
                ${rec && (rec.skillLevel || 0) >= 1 ? `<div>XP: <span style="color:#9a8040;">${Math.floor(rec.skillXP || 0)}</span></div>` : ''}
            </div>
            ${parents.length ? `
            <div style="margin-top:1rem;">
                <div style="font-size:0.7rem; color:#5a4a20; letter-spacing:0.05em; text-transform:uppercase; margin-bottom:0.5rem;">Requires</div>
                ${parents.map(p => `
                    <div style="font-size:0.78rem; color:${p.owned ? GOLD : '#4a3818'};
                         display:flex; align-items:center; gap:0.45rem; margin-bottom:0.35rem;">
                        <span style="width:6px;height:6px;border-radius:50%;flex-shrink:0;
                            background:${p.owned ? GOLD : '#3a2a0e'};display:inline-block;"></span>
                        ${p.name}
                    </div>`).join('')}
            </div>` : ''}
        `;
    }

    // ── Pan / zoom ────────────────────────────────────────────────────────────

    function _bindEvents(wrap) {
        _svg.addEventListener('click', (e) => {
            if (_dragMoved) return;
            if (e.target === _svg || e.target === _g) {
                _selectedId = null;
                _lineageIds = new Set();
                _drawAll();
                if (_panel) _panel.innerHTML = '<div style="color:#3a3020;font-size:0.78rem;font-style:italic;margin-top:2rem;text-align:center;">Select a skill to inspect</div>';
            }
        });

        wrap.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            _dragging  = true;
            _dragMoved = false;
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
            const dx = e.clientX - _lastMouse.x;
            const dy = e.clientY - _lastMouse.y;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _dragMoved = true;
            _pan.x += dx; _pan.y += dy;
            _lastMouse = { x: e.clientX, y: e.clientY };
            _applyTransform();
        });

        wrap.addEventListener('wheel', (e) => {
            e.preventDefault();
            _zoom = Math.min(5, Math.max(0.08, _zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
            _applyTransform();
        }, { passive: false });

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
