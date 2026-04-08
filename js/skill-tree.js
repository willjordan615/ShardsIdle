/**
 * skill-tree.js — Force-directed skill web
 *
 * All player-learnable skills shown. Brightness encodes distance from the
 * character's owned cluster — owned skills are the light source, the graph
 * dims continuously outward. Edges follow the same falloff.
 *
 * Click a node: zoom to it, open detail panel on the right.
 * Pan: drag. Zoom: scroll wheel / pinch.
 */

(function () {

    // ── Constants ────────────────────────────────────────────────────────────

    const NODE_R        = 22;
    const MAX_DIST      = 5;
    const PANEL_W       = 260;

    const DIST_OPACITY  = [1.0, 0.72, 0.48, 0.28, 0.14, 0.07];

    const GOLD          = '#d4af37';
    const AMBER         = '#a07828';
    const DIM           = '#4a3a1a';

    const EDGE_OWNED    = 'rgba(212,175,55,0.55)';
    const EDGE_NEAR     = 'rgba(160,120,40,0.30)';
    const EDGE_FAR      = 'rgba(60,50,30,0.15)';

    // ── State ────────────────────────────────────────────────────────────────

    let _skillsData   = null;
    let _character    = null;
    let _nodes        = [];
    let _edges        = [];
    let _svg          = null;
    let _g            = null;
    let _panel        = null;
    let _pan          = { x: 0, y: 0 };
    let _zoom         = 1;
    let _dragging     = false;
    let _lastMouse    = { x: 0, y: 0 };
    let _selectedId   = null;
    let _simHandle    = null;

    // ── Public entry point ───────────────────────────────────────────────────

    window.openSkillTree = async function () {
        _skillsData = (window.gameData?.skills || []).filter(s =>
            !s.id.startsWith('proc_') &&
            !s.category?.endsWith('_PROC') &&
            !s.category?.startsWith('CONSUMABLE')
        );

        const charId = currentState?.detailCharacterId;
        if (!charId) return;

        _renderModal(true);

        _character = await getCharacter(charId);
        if (!_character) {
            const wrap = document.getElementById('skillTreeCanvasWrap');
            if (wrap) wrap.innerHTML = '<div style="color:#8b7355;padding:2rem;text-align:center;">Could not load character data.</div>';
            return;
        }

        _buildGraph();
        requestAnimationFrame(() => _initCanvas());
    };

    // ── Graph construction ───────────────────────────────────────────────────

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

    function _buildGraph() {
        const owned    = _ownedIds();
        const wrap     = document.getElementById('skillTreeCanvasWrap');
        const W        = (wrap?.clientWidth || 900) - PANEL_W;
        const H        = wrap?.clientHeight || 700;
        const skillMap = new Map(_skillsData.map(s => [s.id, s]));

        // BFS from owned nodes to assign distance
        const distMap = new Map();
        const queue   = [];

        owned.forEach(id => {
            if (skillMap.has(id)) { distMap.set(id, 0); queue.push(id); }
        });

        let qi = 0;
        while (qi < queue.length) {
            const id   = queue[qi++];
            const dist = distMap.get(id);
            if (dist >= MAX_DIST) continue;
            const skill = skillMap.get(id);
            if (!skill) continue;

            _skillsData.forEach(s => {
                if ((s.parentSkills || []).includes(id) && !distMap.has(s.id)) {
                    distMap.set(s.id, dist + 1);
                    queue.push(s.id);
                }
            });
            (skill.parentSkills || []).forEach(pid => {
                if (skillMap.has(pid) && !distMap.has(pid)) {
                    distMap.set(pid, dist + 1);
                    queue.push(pid);
                }
            });
        }

        const visible = new Set(distMap.keys());

        // Initial positions by distance ring
        const cx = W / 2, cy = H / 2;
        _nodes = [];
        const byDist = {};
        distMap.forEach((dist, id) => {
            if (!byDist[dist]) byDist[dist] = [];
            byDist[dist].push(id);
        });

        Object.entries(byDist).forEach(([dist, ids]) => {
            const d = parseInt(dist);
            const r = d === 0 ? 0 : 300 + d * 280;
            const jitter = () => (Math.random() - 0.5) * 120;
            ids.forEach((id, i) => {
                const angle = (i / ids.length) * Math.PI * 2;
                const skill = skillMap.get(id);
                const rec   = _skillRecord(id);
                _nodes.push({
                    id, skill, rec,
                    dist: d,
                    owned: owned.has(id),
                    x: cx + Math.cos(angle) * r + jitter(),
                    y: cy + Math.sin(angle) * r + jitter(),
                    vx: 0, vy: 0,
                });
            });
        });

        _edges = [];
        _nodes.forEach(node => {
            (node.skill.parentSkills || []).forEach(pid => {
                if (!visible.has(pid)) return;
                const pNode = _nodes.find(n => n.id === pid);
                if (!pNode) return;
                const edgeDist = Math.min(node.dist, pNode.dist);
                _edges.push({ from: pNode, to: node, dist: edgeDist });
            });
        });
    }

    // ── Modal ────────────────────────────────────────────────────────────────

    function _renderModal(loading = false) {
        let modal = document.getElementById('skillTreeModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'skillTreeModal';
            modal.style.cssText = `
                display:none; position:fixed; inset:0;
                background:rgba(0,0,0,0.94);
                z-index:1000; overflow:hidden;
                width:100vw; height:100vh; box-sizing:border-box;
            `;
            modal.innerHTML = `
                <div id="skillTreeHeader" style="
                    position:absolute; top:0; left:0; right:0;
                    display:flex; align-items:center; justify-content:space-between;
                    padding:0 1.25rem;
                    background:var(--window-base,#0a0806);
                    border-bottom:1px solid rgba(212,175,55,0.15);
                    z-index:2; height:48px; box-sizing:border-box;">
                    <div style="display:flex; align-items:center; gap:1rem;">
                        <span style="font-family:var(--font-display); color:${GOLD}; font-size:0.95rem; letter-spacing:0.06em;">Skill Web</span>
                        <span id="skillTreeCharName" style="color:#6a5a30; font-size:0.8rem;"></span>
                    </div>
                    <button onclick="closeModal('skillTreeModal')"
                        style="background:none; border:1px solid rgba(212,175,55,0.2); color:#6a5a30;
                               padding:0.25rem 0.65rem; border-radius:3px; cursor:pointer;
                               font-size:0.8rem; font-family:inherit;">✕ Close</button>
                </div>
                <div style="position:absolute; top:48px; left:0; right:0; bottom:24px; display:flex;">
                    <div id="skillTreeCanvasWrap" style="flex:1; overflow:hidden; cursor:grab; position:relative;">
                        <svg id="skillTreeSVG" style="display:block; width:100%; height:100%;"></svg>
                    </div>
                    <div id="skillTreePanel" style="
                        width:${PANEL_W}px; flex-shrink:0;
                        border-left:1px solid rgba(212,175,55,0.1);
                        background:var(--window-base,#0a0806);
                        padding:1.2rem 1rem; overflow-y:auto;
                        font-family:var(--font-body);
                        color:var(--text-primary,#e8e0d0);">
                        <div style="color:#3a3020; font-size:0.78rem; font-style:italic; margin-top:2rem; text-align:center;">
                            Select a skill to inspect
                        </div>
                    </div>
                </div>
                <div style="position:absolute; bottom:0; left:0; right:${PANEL_W}px; height:24px;
                    text-align:center; font-size:0.7rem; color:#2a2010;
                    line-height:24px; font-family:var(--font-body);">Drag to pan · Scroll to zoom</div>
            `;
            document.body.appendChild(modal);
        }

        _pan = { x: 0, y: 0 };
        _zoom = 0.9;
        _selectedId = null;
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

        _drawAll();
        _applyTransform();
        _bindEvents(wrap);
        _runSimulation(wrap);
    }

    function _applyTransform() {
        if (_g) _g.setAttribute('transform', `translate(${_pan.x},${_pan.y}) scale(${_zoom})`);
    }

    // ── Force simulation ──────────────────────────────────────────────────────

    function _runSimulation(wrap) {
        if (_simHandle) cancelAnimationFrame(_simHandle);
        let alpha = 1;
        const W = wrap.clientWidth - PANEL_W;
        const H = wrap.clientHeight;

        function tick() {
            if (alpha < 0.004) return;
            alpha *= 0.97;
            const k = Math.sqrt((W * H) / Math.max(1, _nodes.length)) * 6;

            _nodes.forEach(n => { n.fx = 0; n.fy = 0; });

            // Collision — nodes never touch
            for (let i = 0; i < _nodes.length; i++) {
                for (let j = i + 1; j < _nodes.length; j++) {
                    const a = _nodes[i], b = _nodes[j];
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
                    const minDist = NODE_R * 2 + 16;
                    if (dist < minDist) {
                        const push = (minDist - dist) / dist * 0.5;
                        a.fx -= push * dx; a.fy -= push * dy;
                        b.fx += push * dx; b.fy += push * dy;
                    }
                }
            }

            // Repulsion between all nodes
            for (let i = 0; i < _nodes.length; i++) {
                for (let j = i + 1; j < _nodes.length; j++) {
                    const a = _nodes[i], b = _nodes[j];
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
                    const force = (k * k) / (dist * dist) * alpha;
                    const fx = force * dx / dist;
                    const fy = force * dy / dist;
                    a.fx -= fx; a.fy -= fy;
                    b.fx += fx; b.fy += fy;
                }
            }

            // Spring attraction along edges
            _edges.forEach(e => {
                const dx   = e.to.x - e.from.x;
                const dy   = e.to.y - e.from.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
                const ideal = 200 + e.dist * 60;
                const force  = (dist - ideal) / dist * 0.3 * alpha;
                e.from.fx += force * dx; e.from.fy += force * dy;
                e.to.fx   -= force * dx; e.to.fy   -= force * dy;
            });

            // Gentle gravity to center
            _nodes.forEach(n => {
                n.fx -= n.x * 0.002 * alpha;
                n.fy -= n.y * 0.002 * alpha;
            });

            // Integrate + dampen
            _nodes.forEach(n => {
                n.vx = (n.vx + n.fx) * 0.82;
                n.vy = (n.vy + n.fy) * 0.82;
                n.x += n.vx;
                n.y += n.vy;
            });

            _drawAll();
            _simHandle = requestAnimationFrame(tick);
        }

        tick();
    }

    // ── Drawing ───────────────────────────────────────────────────────────────

    function _nodeColor(dist) {
        if (dist === 0) return GOLD;
        if (dist === 1) return '#c09030';
        if (dist === 2) return AMBER;
        if (dist === 3) return '#6a4a18';
        return DIM;
    }

    function _edgeColor(dist) {
        if (dist === 0) return EDGE_OWNED;
        if (dist <= 2)  return EDGE_NEAR;
        return EDGE_FAR;
    }

    function _nodeOpacity(dist) {
        return DIST_OPACITY[Math.min(dist, MAX_DIST)] ?? 0.07;
    }

    function _drawAll() {
        if (!_g) return;
        _g.innerHTML = '';

        _edges.forEach(e => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', e.from.x); line.setAttribute('y1', e.from.y);
            line.setAttribute('x2', e.to.x);   line.setAttribute('y2', e.to.y);
            line.setAttribute('stroke', _edgeColor(e.dist));
            line.setAttribute('stroke-width', e.dist === 0 ? 1.5 : 1);
            line.setAttribute('fill', 'none');
            line.dataset.edge = '1';
            line.dataset.from = e.from.id;
            line.dataset.to   = e.to.id;
            _g.appendChild(line);
        });

        _nodes.forEach(node => _drawNode(node));
    }

    function _drawNode(node) {
        const opacity = _nodeOpacity(node.dist);
        const color   = _nodeColor(node.dist);
        const owned   = _ownedIds();

        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('transform', `translate(${node.x},${node.y})`);
        group.dataset.skillId = node.id;
        group.style.cursor    = 'pointer';
        group.style.opacity   = opacity;

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('r', NODE_R);
        circle.setAttribute('fill', node.dist === 0 ? 'rgba(212,175,55,0.12)' : 'rgba(15,10,4,0.7)');
        circle.setAttribute('stroke', color);
        circle.setAttribute('stroke-width', node.id === _selectedId ? 2.5 : 1);
        group.appendChild(circle);

        // Partial parent ring — shows you're partway there
        const parents = node.skill.parentSkills || [];
        if (parents.length > 0 && node.dist > 0) {
            const ownedParentCount = parents.filter(p => owned.has(p)).length;
            if (ownedParentCount > 0 && ownedParentCount < parents.length) {
                const frac = ownedParentCount / parents.length;
                const r2   = NODE_R + 4;
                const circ = 2 * Math.PI * r2;
                const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                ring.setAttribute('r', r2);
                ring.setAttribute('fill', 'none');
                ring.setAttribute('stroke', AMBER);
                ring.setAttribute('stroke-width', '1.5');
                ring.setAttribute('stroke-dasharray', `${circ * frac} ${circ}`);
                ring.setAttribute('stroke-opacity', '0.65');
                ring.setAttribute('transform', 'rotate(-90)');
                group.appendChild(ring);
            }
        }

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'central');
        label.setAttribute('fill', color);
        label.setAttribute('font-size', '9');
        label.setAttribute('font-family', 'var(--font-body, sans-serif)');
        label.setAttribute('font-weight', node.dist === 0 ? '600' : '400');
        label.style.pointerEvents = 'none';
        label.style.userSelect    = 'none';
        const name = node.skill.name;
        label.textContent = name.length > 11 ? name.slice(0, 10) + '…' : name;
        group.appendChild(label);

        if (node.dist === 0 && node.rec && (node.rec.skillLevel || 0) >= 1) {
            const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            badge.setAttribute('x', NODE_R - 1);
            badge.setAttribute('y', -(NODE_R - 1));
            badge.setAttribute('text-anchor', 'end');
            badge.setAttribute('fill', '#8b7355');
            badge.setAttribute('font-size', '7');
            badge.setAttribute('font-family', 'var(--font-body, sans-serif)');
            badge.style.pointerEvents = 'none';
            badge.textContent = `L${node.rec.skillLevel}`;
            group.appendChild(badge);
        }

        group.addEventListener('click', (e) => {
            e.stopPropagation();
            _selectNode(node);
        });

        _g.appendChild(group);
    }

    // ── Selection ─────────────────────────────────────────────────────────────

    function _selectNode(node) {
        _selectedId = node.id;
        _drawAll();

        const wrap = document.getElementById('skillTreeCanvasWrap');
        if (wrap) {
            const W = wrap.clientWidth, H = wrap.clientHeight;
            const targetZoom = Math.max(_zoom, 1.8);
            _zoom  = targetZoom;
            _pan.x = W / 2 - node.x * targetZoom;
            _pan.y = H / 2 - node.y * targetZoom;
            _applyTransform();
        }

        _renderPanel(node);
    }

    // ── Detail panel ──────────────────────────────────────────────────────────

    function _renderPanel(node) {
        if (!_panel) return;
        const { skill, rec, dist } = node;
        const owned = _ownedIds();

        const categoryLabel = (skill.category || '').replace(/_/g, ' ').toLowerCase();
        const costStr = skill.costType && skill.costAmount != null
            ? `${skill.costAmount} ${skill.costType}` : null;
        const parents = (skill.parentSkills || []).map(pid => {
            const ps = _skillsData.find(s => s.id === pid);
            return { id: pid, name: ps?.name || pid, owned: owned.has(pid) };
        });
        const scalingStr = skill.scalingFactors
            ? Object.entries(skill.scalingFactors).map(([k, v]) => `${k} ×${v}`).join(', ')
            : null;

        const statusColor = dist === 0 ? GOLD : dist === 1 ? '#c09030' : AMBER;
        const statusText  = dist === 0 ? 'Owned'
            : dist === 1 ? 'One step away'
            : `${dist} steps away`;

        let html = `
            <div style="border-bottom:1px solid rgba(212,175,55,0.12); padding-bottom:0.75rem; margin-bottom:0.75rem;">
                <div style="font-family:var(--font-display); color:${GOLD}; font-size:0.95rem; margin-bottom:0.25rem;">${skill.name}</div>
                <div style="font-size:0.72rem; color:${statusColor}; letter-spacing:0.06em; text-transform:uppercase;">${statusText}</div>
            </div>
            <div style="font-size:0.78rem; color:#a09060; line-height:1.6; margin-bottom:0.75rem; font-style:italic;">${skill.description || ''}</div>
            <div style="font-size:0.72rem; color:#6a5a30; letter-spacing:0.04em; text-transform:uppercase; margin-bottom:0.4rem;">Details</div>
            <div style="font-size:0.78rem; color:#8a7040; line-height:1.9;">
                <div>Category: <span style="color:#a09060;">${categoryLabel}</span></div>
                ${costStr   ? `<div>Cost: <span style="color:#a09060;">${costStr}</span></div>`     : ''}
                ${scalingStr ? `<div>Scales: <span style="color:#a09060;">${scalingStr}</span></div>` : ''}
                ${rec && rec.skillLevel >= 1 ? `<div>Level: <span style="color:${GOLD};">${rec.skillLevel}</span></div>` : ''}
                ${rec && rec.skillLevel >= 1 ? `<div>XP: <span style="color:#a09060;">${Math.floor(rec.skillXP || 0)}</span></div>` : ''}
            </div>
        `;

        if (parents.length > 0) {
            html += `
                <div style="margin-top:1rem;">
                    <div style="font-size:0.72rem; color:#6a5a30; letter-spacing:0.04em; text-transform:uppercase; margin-bottom:0.5rem;">Requires</div>
                    ${parents.map(p => `
                        <div style="font-size:0.78rem; color:${p.owned ? GOLD : '#4a3a18'};
                             display:flex; align-items:center; gap:0.4rem; margin-bottom:0.3rem;">
                            <span style="display:inline-block; width:6px; height:6px; border-radius:50%;
                                background:${p.owned ? GOLD : '#3a2a10'}; flex-shrink:0;"></span>
                            ${p.name}
                        </div>`).join('')}
                </div>
            `;
        }

        _panel.innerHTML = html;
    }

    // ── Pan / zoom ────────────────────────────────────────────────────────────

    function _bindEvents(wrap) {
        _svg.addEventListener('click', (e) => {
            if (e.target === _svg || e.target === _g) {
                _selectedId = null;
                _drawAll();
                if (_panel) _panel.innerHTML = '<div style="color:#3a3020; font-size:0.78rem; font-style:italic; margin-top:2rem; text-align:center;">Select a skill to inspect</div>';
            }
        });

        wrap.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            _dragging  = true;
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
            _zoom = Math.min(4, Math.max(0.15, _zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
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
