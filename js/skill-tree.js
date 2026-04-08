/**
 * skill-tree.js — Radial bubble skill web
 *
 * Owned skills at center. Children arranged in arcs around their parents.
 * Node radius scales with direct child count. Arc space scales with total
 * descendants. Two hops visible; brightness encodes distance from owned.
 *
 * Click: zoom + detail panel. Pan: drag. Zoom: scroll.
 */

(function () {

    // ── Constants ────────────────────────────────────────────────────────────

    const PANEL_W    = 268;
    const NODE_H     = 28;      // node height
    const NODE_PAD   = 10;     // horizontal padding inside node
    const NODE_RX    = 6;      // corner radius
    const HOP1_DIST  = 520;    // px from parent center to hop-1 child center
    const HOP2_DIST  = 420;    // px from hop-1 center to hop-2 child center
    const MIN_SEP    = 8;      // minimum gap between node edges

    const GOLD   = '#d4af37';
    const AMBER  = '#a07828';
    const DIM    = '#5a4520';

    // Category color map
    const CAT_COLOR = {
        DAMAGE_SINGLE:  '#e05540',
        DAMAGE_MAGIC:   '#e05540',
        DAMAGE_AOE:     '#d4722a',
        DAMAGE_PROC:    '#c45a20',
        HEALING:        '#4a90d4',
        HEALING_AOE:    '#3a78bc',
        HEALING_PROC:   '#3a78bc',
        RESTORATION:    '#5aacd4',
        BUFF:           '#9a6ed4',
        CONTROL:        '#3abcac',
        CONTROL_PROC:   '#2a9a8a',
        DEFENSE:        '#6a8aac',
        DEFENSE_PROC:   '#5a7a9c',
        UTILITY:        '#8a8a7a',
        UTILITY_PROC:   '#7a7a6a',
        WEAPON_skill:   '#c4a030',
        NO_RESOURCES:   '#707060',
        PROGRESSION:    '#a0c040',
        DEFAULT:        '#8a7a5a',
    };

    const DIST_OPACITY = [1.0, 0.80, 0.18];

    // Highlight color for selected lineage
    const HIGHLIGHT     = '#40c060';
    const HIGHLIGHT_DIM = 'rgba(20,20,20,0.85)';

    // ── State ────────────────────────────────────────────────────────────────

    let _skillsData  = null;
    let _character   = null;
    let _nodes       = [];   // { id, skill, rec, dist, x, y, r }
    let _edges       = [];   // { from, to, dist }
    let _svg         = null;
    let _g           = null;
    let _panel       = null;
    let _pan         = { x: 0, y: 0 };
    let _zoom        = 1;
    let _dragging    = false;
    let _lastMouse   = { x: 0, y: 0 };
    let _selectedId  = null;
    let _lineageIds  = new Set();  // ids in selected node's full lineage

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

    // Returns half-width of node (used for edge attachment and spacing)
    function _nodeHalfW(name) {
        return Math.max(36, name.length * 4.2 + NODE_PAD);
    }

    // ── Graph layout ──────────────────────────────────────────────────────────

    function _buildLayout(cx, cy) {
        const owned    = _ownedIds();
        const skillMap = new Map(_skillsData.map(s => [s.id, s]));

        // Precompute direct children and total descendants for all skills
        const directChildren = new Map();  // id → count
        const allDescendants = new Map();  // id → count

        _skillsData.forEach(s => directChildren.set(s.id, 0));
        _skillsData.forEach(s => {
            (s.parentSkills || []).forEach(pid => {
                if (directChildren.has(pid)) directChildren.set(pid, directChildren.get(pid) + 1);
            });
        });

        // Build children map first for O(n) descendant counting
        const childrenOf = new Map();
        _skillsData.forEach(s => childrenOf.set(s.id, []));
        _skillsData.forEach(s => {
            (s.parentSkills || []).forEach(pid => {
                if (childrenOf.has(pid)) childrenOf.get(pid).push(s.id);
            });
        });

        function countDescendants(id) {
            if (allDescendants.has(id)) return allDescendants.get(id);
            let count = 0;
            (childrenOf.get(id) || []).forEach(cid => {
                count += 1 + countDescendants(cid);
            });
            allDescendants.set(id, count);
            return count;
        }

        _skillsData.forEach(s => countDescendants(s.id));

        // Assign distances: 0=owned, 1=hop1, 2=hop2
        const distMap = new Map();
        owned.forEach(id => { if (skillMap.has(id)) distMap.set(id, 0); });
        [1, 2].forEach(hop => {
            _skillsData.forEach(s => {
                if (distMap.has(s.id)) return;
                if ((s.parentSkills || []).some(p => distMap.get(p) === hop - 1)) {
                    distMap.set(s.id, hop);
                }
            });
        });
        // Pull in parents of owned that aren't owned (roots)
        owned.forEach(id => {
            const skill = skillMap.get(id);
            if (!skill) return;
            (skill.parentSkills || []).forEach(pid => {
                if (!distMap.has(pid) && skillMap.has(pid)) distMap.set(pid, 1);
            });
        });

        const visible = new Set(distMap.keys());

        // Place owned skills in a tight cluster at center
        _nodes = [];
        _edges = [];
        const placed = new Map(); // id → node

        const ownedList = [...owned].filter(id => skillMap.has(id));
        const ownedCount = ownedList.length;

        ownedList.forEach((id, i) => {
            const skill = skillMap.get(id);
            const r     = _nodeHalfW(skillMap.get(id)?.name || id);
            let x, y;
            if (ownedCount === 1) {
                x = cx; y = cy;
            } else {
                const clusterR = Math.max(80, ownedCount * 30);
                const angle    = (i / ownedCount) * Math.PI * 2;
                x = cx + Math.cos(angle) * clusterR;
                y = cy + Math.sin(angle) * clusterR;
            }
            const node = { id, skill, rec: _skillRecord(id), dist: 0, x, y, r };
            _nodes.push(node);
            placed.set(id, node);
        });

        // Place hop-1 children around their parents
        // Group hop-1 nodes by which owned parent they connect to
        const hop1ByParent = new Map();
        distMap.forEach((dist, id) => {
            if (dist !== 1) return;
            const skill = skillMap.get(id);
            if (!skill) return;
            const knownParents = (skill.parentSkills || []).filter(p => placed.has(p));
            const primaryParent = knownParents[0] || null;
            if (!primaryParent) return;
            if (!hop1ByParent.has(primaryParent)) hop1ByParent.set(primaryParent, []);
            hop1ByParent.get(primaryParent).push(id);
        });

        hop1ByParent.forEach((children, parentId) => {
            const parent = placed.get(parentId);
            if (!parent) return;

            // Sort children by descendant count descending so spacious ones get center angles
            children.sort((a, b) => (allDescendants.get(b) || 0) - (allDescendants.get(a) || 0));

            const totalDesc  = children.reduce((s, id) => s + (allDescendants.get(id) || 0) + 1, 0);
            const totalAngle = Math.min(Math.PI * 1.85, children.length * 0.55);

            // Spread children in full arc around parent
            const baseAngle = Math.atan2(parent.y, parent.x);

            let angleUsed = -totalAngle / 2;
            children.forEach(id => {
                const skill   = skillMap.get(id);
                const r       = _nodeHalfW(skillMap.get(id)?.name || id);
                const share   = ((allDescendants.get(id) || 0) + 1) / Math.max(1, totalDesc);
                const myAngle = share * totalAngle;
                const angle   = baseAngle + angleUsed + myAngle / 2;
                angleUsed    += myAngle;

                const x = parent.x + Math.cos(angle) * (HOP1_DIST + parent.r + r);
                const y = parent.y + Math.sin(angle) * (HOP1_DIST + parent.r + r);

                const node = { id, skill, rec: _skillRecord(id), dist: 1, x, y, r };
                _nodes.push(node);
                placed.set(id, node);

                _edges.push({ from: parent, to: node, dist: 0 });
            });
        });

        // Add edges between owned nodes
        ownedList.forEach(id => {
            const skill = skillMap.get(id);
            (skill?.parentSkills || []).forEach(pid => {
                if (placed.has(pid) && placed.get(pid).dist === 0) {
                    const from = placed.get(pid);
                    const to   = placed.get(id);
                    if (from && to && !_edges.find(e => e.from.id === from.id && e.to.id === to.id)) {
                        _edges.push({ from, to, dist: 0 });
                    }
                }
            });
        });

        // Place hop-2 children around hop-1 parents
        distMap.forEach((dist, id) => {
            if (dist !== 2) return;
            const skill = skillMap.get(id);
            if (!skill) return;
            const knownParents = (skill.parentSkills || []).filter(p => placed.has(p));
            if (!knownParents.length) return;
            const primaryParent = knownParents[0];
            const parent = placed.get(primaryParent);
            if (!parent) return;

            // Find siblings to distribute angle
            const siblings = _nodes.filter(n =>
                n.dist === 2 && (n.skill?.parentSkills || []).includes(primaryParent)
            );
            const sibIdx   = siblings.length; // index of this new node
            const sibCount = (directChildren.get(primaryParent) || 1);
            const totalAngle = Math.min(Math.PI * 1.2, sibCount * 0.45);
            const baseAngle  = Math.atan2(parent.y - cy, parent.x - cx);
            const angle      = baseAngle - totalAngle / 2 + (sibIdx / Math.max(1, sibCount)) * totalAngle;

            const r = _nodeHalfW(skillMap.get(id)?.name || id);
            const x = parent.x + Math.cos(angle) * (HOP2_DIST + parent.r + r);
            const y = parent.y + Math.sin(angle) * (HOP2_DIST + parent.r + r);

            const node = { id, skill, rec: _skillRecord(id), dist: 2, x, y, r };
            _nodes.push(node);
            placed.set(id, node);
            _edges.push({ from: parent, to: node, dist: 1 });
        });

        // Also draw edges for hop-1 nodes that share a parent with owned nodes
        _nodes.filter(n => n.dist === 1).forEach(node => {
            (node.skill?.parentSkills || []).forEach(pid => {
                if (placed.has(pid)) {
                    const from = placed.get(pid);
                    if (!_edges.find(e => e.from.id === from.id && e.to.id === node.id)) {
                        _edges.push({ from, to: node, dist: Math.min(from.dist, node.dist) });
                    }
                }
            });
        });
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
                            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${GOLD};margin-right:5px;vertical-align:middle;"></span>Owned</span>
                            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${AMBER};margin-right:5px;vertical-align:middle;opacity:0.7;"></span>Reachable</span>
                            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${DIM};margin-right:5px;vertical-align:middle;opacity:0.35;"></span>Beyond</span>
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
        _renderModal();
        const wrap = document.getElementById('skillTreeCanvasWrap');
        if (!wrap) return;

        _svg   = document.getElementById('skillTreeSVG');
        _panel = document.getElementById('skillTreePanel');
        _svg.innerHTML = '';
        _g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        _svg.appendChild(_g);

        const W  = wrap.clientWidth;
        const H  = wrap.clientHeight;
        const cx = (W - PANEL_W) / 2;
        const cy = H / 2;

        _pan.x = W / 2;
        _pan.y = H / 2;

        _buildLayout(cx - W / 2, cy - H / 2);  // layout coords relative to pan origin

        _drawAll();
        _applyTransform();
        _bindEvents(wrap);
    }

    function _applyTransform() {
        if (_g) _g.setAttribute('transform', `translate(${_pan.x},${_pan.y}) scale(${_zoom})`);
    }

    // ── Drawing ───────────────────────────────────────────────────────────────

    function _categoryColor(skill) {
        if (!skill) return CAT_COLOR.DEFAULT;
        return CAT_COLOR[skill.category] || CAT_COLOR.DEFAULT;
    }

    function _nodeColor(node) {
        if (node.dist === 0) return GOLD;
        return _categoryColor(node.skill);
    }

    function _edgeColor(dist) {
        if (dist === 0) return 'rgba(212,175,55,0.75)';
        if (dist === 1) return 'rgba(120,100,60,0.22)';
        return 'rgba(50,40,20,0.08)';
    }

    function _drawAll() {
        if (!_g) return;
        _g.innerHTML = '';

        // Edges first — quadratic bezier curves bulging outward from center
        _edges.forEach(e => {
            const edgeInLineage = _lineageIds.has(e.from.id) && _lineageIds.has(e.to.id);
            const hasSel = _selectedId !== null;
            // Attach edge to nearest rect edge rather than center
            const dx = e.to.x - e.from.x, dy = e.to.y - e.from.y;
            const len = Math.sqrt(dx*dx + dy*dy) || 1;
            const x1 = e.from.x + (dx/len) * e.from.r;
            const y1 = e.from.y + (dy/len) * (NODE_H/2);
            const x2 = e.to.x   - (dx/len) * e.to.r;
            const y2 = e.to.y   - (dy/len) * (NODE_H/2);
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
            const mag = Math.sqrt(mx*mx + my*my) || 1;
            const bulge = 0.15;
            const edgeLen = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
            const cx = mx + (mx/mag) * edgeLen * bulge;
            const cy = my + (my/mag) * edgeLen * bulge;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`);
            path.setAttribute('stroke', edgeInLineage ? 'rgba(40,180,80,0.8)' : _edgeColor(e.dist));
            path.setAttribute('stroke-width', edgeInLineage ? 2.5 : e.dist === 0 ? 2 : 0.7);
            path.setAttribute('opacity', hasSel ? (edgeInLineage ? 1 : 0.06) : 1);
            path.setAttribute('fill', 'none');
            _g.appendChild(path);
        });

        _nodes.forEach(n => _drawNode(n));
    }

    function _drawNode(node) {
        const inLineage  = _lineageIds.has(node.id);
        const hasSel     = _selectedId !== null;
        const color      = inLineage ? HIGHLIGHT : _nodeColor(node);
        // Hop-1 nodes where player owns at least one parent get boosted opacity
        const owned      = _ownedIds();
        const ownedParentCount = (node.skill?.parentSkills || []).filter(p => owned.has(p)).length;
        let baseOpacity = DIST_OPACITY[node.dist] ?? 0.15;
        if (node.dist === 1 && ownedParentCount > 0) baseOpacity = 0.88;
        const opacity    = hasSel ? (inLineage ? 1.0 : 0.08) : baseOpacity;
        const name       = node.skill?.name || node.id;
        const hw         = node.r;
        const hh         = NODE_H / 2;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${node.x},${node.y})`);
        g.dataset.skillId = node.id;
        g.style.cursor    = 'pointer';
        g.style.opacity   = opacity;

        // Rounded rect
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', -hw);
        rect.setAttribute('y', -hh);
        rect.setAttribute('width', hw * 2);
        rect.setAttribute('height', NODE_H);
        rect.setAttribute('rx', NODE_RX);
        rect.setAttribute('fill', inLineage ? 'rgba(40,180,80,0.12)' : node.dist === 0 ? 'rgba(212,175,55,0.10)' : 'rgba(10,7,2,0.85)');
        rect.setAttribute('stroke', color);
        rect.setAttribute('stroke-width', node.id === _selectedId ? 2.5 : inLineage ? 1.5 : node.dist === 0 ? 1.5 : 0.7);
        g.appendChild(rect);

        // Partial parent progress bar along bottom edge
        const parents = node.skill?.parentSkills || [];
        if (node.dist > 0 && parents.length > 1) {
            const ownedCount = parents.filter(p => owned.has(p)).length;
            if (ownedCount > 0 && ownedCount < parents.length) {
                const frac = ownedCount / parents.length;
                const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                bar.setAttribute('x', -hw + NODE_RX);
                bar.setAttribute('y', hh - 3);
                bar.setAttribute('width', (hw * 2 - NODE_RX * 2) * frac);
                bar.setAttribute('height', 2);
                bar.setAttribute('rx', 1);
                bar.setAttribute('fill', AMBER);
                bar.setAttribute('fill-opacity', '0.7');
                g.appendChild(bar);
            }
        }

        // Label — full name, font scales slightly with node size
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('fill', inLineage ? HIGHLIGHT : color);
        text.setAttribute('font-size', node.dist === 0 ? '10' : '9');
        text.setAttribute('font-family', 'var(--font-body, sans-serif)');
        text.setAttribute('font-weight', node.dist === 0 ? '600' : '400');
        text.style.pointerEvents = 'none';
        text.style.userSelect    = 'none';
        text.textContent = name;
        g.appendChild(text);

        // Level badge top-right
        if (node.dist === 0 && node.rec && (node.rec.skillLevel || 0) >= 1) {
            const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            badge.setAttribute('x', hw - 3);
            badge.setAttribute('y', -hh + 8);
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

    // ── Lineage computation ──────────────────────────────────────────────────────

    function _computeLineage(id) {
        const ids = new Set([id]);
        const skillMap = new Map(_skillsData.map(s => [s.id, s]));

        // Walk ancestors (parents, grandparents...)
        const walkUp = (sid) => {
            const skill = skillMap.get(sid);
            if (!skill) return;
            (skill.parentSkills || []).forEach(pid => {
                if (!ids.has(pid)) { ids.add(pid); walkUp(pid); }
            });
        };

        // Walk descendants (children, grandchildren...)
        const walkDown = (sid) => {
            _skillsData.forEach(s => {
                if ((s.parentSkills || []).includes(sid) && !ids.has(s.id)) {
                    ids.add(s.id);
                    walkDown(s.id);
                }
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
                _lineageIds = new Set();
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
