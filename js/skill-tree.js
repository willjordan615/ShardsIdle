/**
 * skill-tree.js — Force-directed skill web
 *
 * Shows owned skills + 2 hops out. Brightness encodes distance from owned
 * cluster. Owned skills glow gold; each hop dims. Edges follow the same falloff.
 *
 * Click a node: zoom to it, open detail panel on the right.
 * Pan: drag. Zoom: scroll wheel / pinch.
 */

(function () {

    // ── Constants ────────────────────────────────────────────────────────────

    const NODE_R       = 24;
    const MIN_GAP      = NODE_R * 2 + 24;  // minimum center-to-center distance
    const PANEL_W      = 268;

    const DIST_OPACITY = [1.0, 0.65, 0.32];

    const GOLD   = '#d4af37';
    const AMBER  = '#a07828';
    const DIM    = '#5a4520';

    const EDGE_OWNED = 'rgba(212,175,55,0.6)';
    const EDGE_HOP1  = 'rgba(140,100,30,0.35)';
    const EDGE_HOP2  = 'rgba(70,50,15,0.18)';

    // ── State ────────────────────────────────────────────────────────────────

    let _skillsData = null;
    let _character  = null;
    let _nodes      = [];
    let _edges      = [];
    let _svg        = null;
    let _g          = null;
    let _panel      = null;
    let _pan        = { x: 0, y: 0 };
    let _zoom       = 1;
    let _dragging   = false;
    let _lastMouse  = { x: 0, y: 0 };
    let _selectedId = null;
    let _simHandle  = null;

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
        const skillMap = new Map(_skillsData.map(s => [s.id, s]));

        // Assign distances: 0 = owned, 1 = one hop, 2 = two hops
        const distMap = new Map();
        owned.forEach(id => { if (skillMap.has(id)) distMap.set(id, 0); });

        [1, 2].forEach(hop => {
            _skillsData.forEach(s => {
                if (distMap.has(s.id)) return;
                const parents = s.parentSkills || [];
                if (parents.some(p => distMap.get(p) === hop - 1)) {
                    distMap.set(s.id, hop);
                }
            });
        });

        // Also pull in parents of owned skills that aren't owned (so the web shows roots)
        owned.forEach(id => {
            const skill = skillMap.get(id);
            if (!skill) return;
            (skill.parentSkills || []).forEach(pid => {
                if (!distMap.has(pid) && skillMap.has(pid)) distMap.set(pid, 1);
            });
        });

        // Build node list without positions — positions assigned in _initCanvas
        const byDist = { 0: [], 1: [], 2: [] };
        distMap.forEach((dist, id) => {
            if (byDist[dist]) byDist[dist].push(id);
        });

        _nodes = [];
        [0, 1, 2].forEach(dist => {
            byDist[dist].forEach(id => {
                _nodes.push({
                    id,
                    skill:  skillMap.get(id),
                    rec:    _skillRecord(id),
                    dist,
                    owned:  owned.has(id),
                    x: 0, y: 0, vx: 0, vy: 0,
                });
            });
        });

        // Edges between visible nodes
        const visible = new Set(distMap.keys());
        _edges = [];
        _nodes.forEach(node => {
            (node.skill?.parentSkills || []).forEach(pid => {
                if (!visible.has(pid)) return;
                const pNode = _nodes.find(n => n.id === pid);
                if (!pNode) return;
                _edges.push({ from: pNode, to: node, dist: Math.min(node.dist, pNode.dist) });
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
                            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${GOLD};margin-right:5px;vertical-align:middle;"></span>Owned</span>
                            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${AMBER};margin-right:5px;vertical-align:middle;opacity:0.65;"></span>Reachable</span>
                            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${DIM};margin-right:5px;vertical-align:middle;opacity:0.32;"></span>Beyond</span>
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

        // Assign initial positions now that dimensions are known
        const cx = (W - PANEL_W) / 2;
        const cy = H / 2;
        const ringR   = [0, 220, 460];
        const jitters = [0, 40, 70];
        const byDist  = { 0: [], 1: [], 2: [] };
        _nodes.forEach(n => { if (byDist[n.dist]) byDist[n.dist].push(n); });
        [0, 1, 2].forEach(dist => {
            const group  = byDist[dist];
            const r      = ringR[dist];
            const jitter = () => (Math.random() - 0.5) * jitters[dist] * 2;
            group.forEach((n, i) => {
                const angle = (i / Math.max(1, group.length)) * Math.PI * 2;
                n.x = cx + (dist === 0 && group.length === 1 ? 0 : Math.cos(angle) * r) + jitter();
                n.y = cy + (dist === 0 && group.length === 1 ? 0 : Math.sin(angle) * r) + jitter();
            });
        });

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
        const W = (wrap.clientWidth - PANEL_W) / 2;
        const H = wrap.clientHeight / 2;

        function tick() {
            if (alpha < 0.003) return;
            alpha *= 0.965;

            _nodes.forEach(n => { n.fx = 0; n.fy = 0; });

            // Collision + repulsion combined — guarantees minimum gap
            for (let i = 0; i < _nodes.length; i++) {
                for (let j = i + 1; j < _nodes.length; j++) {
                    const a = _nodes[i], b = _nodes[j];
                    const dx = b.x - a.x || 0.01;
                    const dy = b.y - a.y || 0.01;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    // Repulsion
                    const rep = (18000 * alpha) / (dist * dist);
                    const rx = rep * dx / dist;
                    const ry = rep * dy / dist;
                    a.fx -= rx; a.fy -= ry;
                    b.fx += rx; b.fy += ry;
                    // Hard collision push
                    if (dist < MIN_GAP) {
                        const push = (MIN_GAP - dist) / dist * 0.6;
                        a.fx -= push * dx; a.fy -= push * dy;
                        b.fx += push * dx; b.fy += push * dy;
                    }
                }
            }

            // Edge springs
            _edges.forEach(e => {
                const dx    = e.to.x - e.from.x;
                const dy    = e.to.y - e.from.y;
                const dist  = Math.sqrt(dx * dx + dy * dy) || 0.1;
                const ideal = 180 + e.dist * 80;
                const f     = (dist - ideal) / dist * 0.25 * alpha;
                e.from.fx += f * dx; e.from.fy += f * dy;
                e.to.fx   -= f * dx; e.to.fy   -= f * dy;
            });

            // Gentle center pull — just enough to keep graph from drifting
            _nodes.forEach(n => {
                n.fx -= n.x * 0.003 * alpha;
                n.fy -= n.y * 0.003 * alpha;
            });

            // Integrate
            _nodes.forEach(n => {
                n.vx = (n.vx + n.fx) * 0.78;
                n.vy = (n.vy + n.fy) * 0.78;
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
        return dist === 0 ? GOLD : dist === 1 ? AMBER : DIM;
    }

    function _edgeColor(dist) {
        return dist === 0 ? EDGE_OWNED : dist === 1 ? EDGE_HOP1 : EDGE_HOP2;
    }

    function _drawAll() {
        if (!_g) return;
        _g.innerHTML = '';

        // Edges behind nodes
        _edges.forEach(e => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', e.from.x); line.setAttribute('y1', e.from.y);
            line.setAttribute('x2', e.to.x);   line.setAttribute('y2', e.to.y);
            line.setAttribute('stroke', _edgeColor(e.dist));
            line.setAttribute('stroke-width', e.dist === 0 ? 1.5 : 1);
            line.setAttribute('fill', 'none');
            line.dataset.edge = '1';
            _g.appendChild(line);
        });

        _nodes.forEach(n => _drawNode(n));
    }

    function _drawNode(node) {
        const color   = _nodeColor(node.dist);
        const opacity = DIST_OPACITY[node.dist] ?? 0.15;
        const owned   = _ownedIds();

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${node.x},${node.y})`);
        g.dataset.skillId = node.id;
        g.style.cursor    = 'pointer';
        g.style.opacity   = opacity;

        // Background circle
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('r', NODE_R);
        circle.setAttribute('fill', node.dist === 0 ? 'rgba(212,175,55,0.10)' : 'rgba(10,7,2,0.75)');
        circle.setAttribute('stroke', color);
        circle.setAttribute('stroke-width', node.id === _selectedId ? 2.5 : 1);
        g.appendChild(circle);

        // Partial arc — one of two parents owned
        const parents = node.skill?.parentSkills || [];
        if (node.dist > 0 && parents.length > 0) {
            const ownedCount = parents.filter(p => owned.has(p)).length;
            if (ownedCount > 0 && ownedCount < parents.length) {
                const r2   = NODE_R + 5;
                const circ = 2 * Math.PI * r2;
                const frac = ownedCount / parents.length;
                const arc  = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                arc.setAttribute('r', r2);
                arc.setAttribute('fill', 'none');
                arc.setAttribute('stroke', AMBER);
                arc.setAttribute('stroke-width', '2');
                arc.setAttribute('stroke-dasharray', `${circ * frac} ${circ}`);
                arc.setAttribute('stroke-opacity', '0.7');
                arc.setAttribute('transform', 'rotate(-90)');
                g.appendChild(arc);
            }
        }

        // Label
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('fill', color);
        text.setAttribute('font-size', node.dist === 0 ? '10' : '9');
        text.setAttribute('font-family', 'var(--font-body, sans-serif)');
        text.setAttribute('font-weight', node.dist === 0 ? '600' : '400');
        text.style.pointerEvents = 'none';
        text.style.userSelect    = 'none';
        const name = node.skill?.name || node.id;
        text.textContent = name.length > 12 ? name.slice(0, 11) + '…' : name;
        g.appendChild(text);

        // Level badge
        if (node.dist === 0 && node.rec && (node.rec.skillLevel || 0) >= 1) {
            const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            badge.setAttribute('x', NODE_R - 1);
            badge.setAttribute('y', -(NODE_R - 2));
            badge.setAttribute('text-anchor', 'end');
            badge.setAttribute('fill', '#8b7355');
            badge.setAttribute('font-size', '7');
            badge.setAttribute('font-family', 'var(--font-body, sans-serif)');
            badge.style.pointerEvents = 'none';
            badge.textContent = `L${node.rec.skillLevel}`;
            g.appendChild(badge);
        }

        g.addEventListener('click', (e) => { e.stopPropagation(); _selectNode(node); });
        _g.appendChild(g);
    }

    // ── Selection ─────────────────────────────────────────────────────────────

    function _selectNode(node) {
        _selectedId = node.id;
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
        const { skill, rec, dist } = node;
        const owned = _ownedIds();

        const cat      = (skill?.category || '').replace(/_/g, ' ').toLowerCase();
        const costStr  = skill?.costType && skill?.costAmount != null ? `${skill.costAmount} ${skill.costType}` : null;
        const parents  = (skill?.parentSkills || []).map(pid => {
            const ps = _skillsData.find(s => s.id === pid);
            return { name: ps?.name || pid, owned: owned.has(pid) };
        });
        const scaling  = skill?.scalingFactors
            ? Object.entries(skill.scalingFactors).map(([k, v]) => `${k} ×${v}`).join(', ')
            : null;

        const statusColor = dist === 0 ? GOLD : dist === 1 ? AMBER : DIM;
        const statusText  = dist === 0 ? 'Owned' : dist === 1 ? 'One step away' : 'Two steps away';

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
            if (e.target === _svg || e.target === _g) {
                _selectedId = null;
                _drawAll();
                if (_panel) _panel.innerHTML = '<div style="color:#3a3020;font-size:0.78rem;font-style:italic;margin-top:2rem;text-align:center;">Select a skill to inspect</div>';
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
            _zoom = Math.min(5, Math.max(0.1, _zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
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
