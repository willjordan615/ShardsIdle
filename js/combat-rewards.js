/**
 * combat-rewards.js — Animated result modal
 *
 * Call window.animateCombatRewards(payload) after applyCombatRewards computes
 * its data. Replaces the static modal content with a sequenced animation:
 *
 *   1. Title flash (victory/defeat)
 *   2. Skill unlocks fanfare (if any)
 *   3. Loot items cascade in one by one
 *   4. Character XP bar sweeps, flashes on level-up
 *   5. Skill XP bars animate from before→after, shutter on level boundary
 *
 * payload shape:
 * {
 *   result:       'victory' | 'defeat' | 'retreated'
 *   loot:         [ { name, rarity } ]
 *   charXP:       [ { name, xpGained, levelBefore, levelAfter, xpBefore, xpAfter, xpToNext } ]
 *   skillXP:      { skillID: { name, before, after, level, discovered, xpAwarded, leveledUp } }
 *   newUnlocks:   [ { skillID, skillDef } ]
 * }
 */

(function () {

    // ── Helpers ───────────────────────────────────────────────────────────────

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    function rarityColor(rarity) {
        return { legendary: '#ffaa00', rare: '#00d4ff', uncommon: '#b060ff' }[rarity] || '#e8e0d0';
    }

    function rarityGlow(rarity) {
        return {
            legendary: '0 0 18px rgba(255,170,0,0.7), 0 0 6px rgba(255,170,0,0.4)',
            rare:      '0 0 14px rgba(0,212,255,0.6), 0 0 5px rgba(0,212,255,0.3)',
            uncommon:  '0 0 10px rgba(176,96,255,0.5)',
        }[rarity] || 'none';
    }

    // ── Particle burst ────────────────────────────────────────────────────────

    function spawnParticles(container, count, color, opts = {}) {
        const { x = 50, y = 50, spread = 60, life = 900 } = opts;
        for (let i = 0; i < count; i++) {
            const p = document.createElement('div');
            const angle  = Math.random() * 360;
            const dist   = 20 + Math.random() * spread;
            const dx     = Math.cos(angle * Math.PI / 180) * dist;
            const dy     = Math.sin(angle * Math.PI / 180) * dist;
            const size   = 3 + Math.random() * 4;
            p.style.cssText = `
                position:absolute; border-radius:50%;
                width:${size}px; height:${size}px;
                background:${color};
                left:${x}%; top:${y}%;
                transform:translate(-50%,-50%);
                pointer-events:none; z-index:20;
                transition: transform ${life}ms cubic-bezier(0,.8,.2,1), opacity ${life}ms ease;
                opacity:1;
            `;
            container.appendChild(p);
            requestAnimationFrame(() => {
                p.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
                p.style.opacity   = '0';
            });
            setTimeout(() => p.remove(), life + 50);
        }
    }

    // ── Bar animator ──────────────────────────────────────────────────────────

    /**
     * Animate a progress bar from startPct to endPct over duration ms.
     * Calls onLevelUp() if the bar crosses 100% mid-animation.
     * Returns a promise that resolves when animation completes.
     */
    function animateBar(barEl, startPct, endPct, duration, onLevelUp) {
        return new Promise(resolve => {
            const start = performance.now();
            const range = endPct - startPct;

            // If bar crosses 100 (level-up), split into two phases
            if (endPct > 100 && startPct < 100) {
                const fillTime = duration * ((100 - startPct) / range);
                _animate(barEl, startPct, 100, fillTime, () => {
                    onLevelUp && onLevelUp();
                    setTimeout(() => {
                        // Reset to 0 and fill to remainder
                        barEl.style.width = '0%';
                        const remainder = endPct - 100;
                        _animate(barEl, 0, Math.min(remainder, 100), duration - fillTime, null, resolve);
                    }, 120);
                });
            } else {
                _animate(barEl, startPct, Math.min(endPct, 100), duration, null, resolve);
            }
        });
    }

    function _animate(barEl, from, to, duration, onDone, onResolve) {
        const start = performance.now();
        const range = to - from;
        function frame(now) {
            const t   = Math.min(1, (now - start) / duration);
            const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease in-out quad
            barEl.style.width = (from + range * ease) + '%';
            if (t < 1) {
                requestAnimationFrame(frame);
            } else {
                onDone && onDone();
                onResolve && onResolve();
            }
        }
        requestAnimationFrame(frame);
    }

    // ── Main entry point ──────────────────────────────────────────────────────

    window.animateCombatRewards = async function (payload) {
        const modal     = document.getElementById('combatResultModal');
        const inner     = modal?.querySelector('.result-modal-inner');
        if (!modal || !inner) return;

        const isVictory = payload.result === 'victory';
        const isDefeat  = payload.result === 'defeat' || payload.result === 'loss';

        // Clear existing static content, rebuild with animated sections
        inner.innerHTML = _buildShell(payload.result);

        // ── 1. Title animation ────────────────────────────────────────────────
        const titleEl = inner.querySelector('.rm-title');
        await sleep(80);
        titleEl.classList.add('rm-title--in');
        if (isVictory) {
            spawnParticles(inner, 28, '#d4af37', { x: 50, y: 8, spread: 80, life: 1100 });
            spawnParticles(inner, 16, '#ffe066', { x: 30, y: 8, spread: 50, life: 900 });
            spawnParticles(inner, 16, '#ffe066', { x: 70, y: 8, spread: 50, life: 900 });
        }
        await sleep(320);

        // ── 2. Skill unlocks fanfare ──────────────────────────────────────────
        if (payload.newUnlocks?.length) {
            const fanfareEl = inner.querySelector('.rm-unlocks');
            if (fanfareEl) {
                fanfareEl.style.display = 'block';
                await sleep(80);
                fanfareEl.classList.add('rm-section--in');
                spawnParticles(inner, 20, '#4cd964', { x: 50, y: 22, spread: 60, life: 900 });
                await sleep(400);
            }
        }

        // ── 3. Loot cascade ───────────────────────────────────────────────────
        const lootSection = inner.querySelector('.rm-loot-section');
        if (lootSection && payload.loot?.length) {
            lootSection.style.display = 'block';
            lootSection.classList.add('rm-section--in');
            const lootList = lootSection.querySelector('.rm-loot-list');
            await sleep(100);

            for (const item of payload.loot) {
                const row = document.createElement('div');
                row.className = 'rm-loot-row rm-loot-row--in';
                const color = rarityColor(item.rarity);
                const glow  = rarityGlow(item.rarity);
                row.style.color = color;
                if (glow !== 'none') row.style.textShadow = glow;
                row.innerHTML = `<span class="rm-loot-bullet">▸</span> ${item.name}${item.rarity && item.rarity !== 'common' ? ` <span class="rm-rarity">${item.rarity}</span>` : ''}`;
                lootList.appendChild(row);

                if (item.rarity === 'legendary') {
                    spawnParticles(inner, 18, '#ffaa00', { x: 50, y: 45, spread: 55, life: 800 });
                } else if (item.rarity === 'rare') {
                    spawnParticles(inner, 10, '#00d4ff', { x: 50, y: 45, spread: 40, life: 700 });
                }

                await sleep(item.rarity === 'legendary' ? 260 : item.rarity === 'rare' ? 180 : 110);
            }
            await sleep(180);
        }

        // ── 4. Character XP bars ──────────────────────────────────────────────
        const xpSection = inner.querySelector('.rm-xp-section');
        if (xpSection && payload.charXP?.length) {
            xpSection.style.display = 'block';
            xpSection.classList.add('rm-section--in');
            const xpList = xpSection.querySelector('.rm-xp-list');

            for (const entry of payload.charXP) {
                const row      = document.createElement('div');
                row.className  = 'rm-xp-row';
                const beforePct = Math.min(100, (entry.xpBefore / entry.xpToNext) * 100);
                const afterPct  = (entry.xpAfter  / entry.xpToNext) * 100;
                const leveled   = entry.levelAfter > entry.levelBefore;

                row.innerHTML = `
                    <div class="rm-xp-header">
                        <span class="rm-xp-name">${entry.name}</span>
                        <span class="rm-xp-gain">+${entry.xpGained} XP${leveled ? ' <span class="rm-levelup">LEVEL UP!</span>' : ''}</span>
                    </div>
                    <div class="rm-bar-track">
                        <div class="rm-bar rm-bar--char" style="width:${beforePct}%"></div>
                    </div>`;
                xpList.appendChild(row);
                await sleep(60);

                const bar = row.querySelector('.rm-bar--char');
                await animateBar(bar, beforePct, afterPct, 700, () => {
                    bar.classList.add('rm-bar--flash');
                    spawnParticles(inner, leveled ? 24 : 10, '#4cd964', { x: 50, y: 65, spread: leveled ? 70 : 30, life: 700 });
                    setTimeout(() => bar.classList.remove('rm-bar--flash'), 500);
                });
                await sleep(120);
            }
            await sleep(150);
        }

        // ── 5. Skill XP bars ──────────────────────────────────────────────────
        const skillSection = inner.querySelector('.rm-skill-section');
        if (skillSection && payload.skillXP && Object.keys(payload.skillXP).length) {
            skillSection.style.display = 'block';
            skillSection.classList.add('rm-section--in');
            const skillList = skillSection.querySelector('.rm-skill-list');
            const UNLOCK_XP = 120;

            const entries = Object.entries(payload.skillXP);
            // Sort: leveled-up first, then discovering, then mastery
            entries.sort(([,a],[,b]) => {
                const aScore = (a.leveledUp ? 100 : 0) + (a.discovered ? 10 : 0);
                const bScore = (b.leveledUp ? 100 : 0) + (b.discovered ? 10 : 0);
                return bScore - aScore;
            });

            for (const [skillID, data] of entries) {
                const isDisc   = data.discovered && data.level < 1;
                const threshold = isDisc ? UNLOCK_XP : Math.round(100 * (data.level || 1) * 1.2);
                const beforePct = Math.min(100, (data.before / threshold) * 100);
                const afterPct  = (data.after / threshold) * 100;
                const leveled   = data.leveledUp;

                const row = document.createElement('div');
                row.className = 'rm-skill-row';
                row.innerHTML = `
                    <div class="rm-skill-header">
                        <span class="rm-skill-name ${isDisc ? 'rm-skill-name--disc' : ''}">${isDisc ? '🔮 ' : ''}${data.name}${!isDisc ? ` <span class="rm-skill-level">Lv.${data.level}</span>` : ''}</span>
                        <span class="rm-skill-xp">+${data.xpAwarded.toFixed(0)} XP${leveled ? ' <span class="rm-levelup">UNLOCKED!</span>' : ''}</span>
                    </div>
                    <div class="rm-bar-track">
                        <div class="rm-bar ${isDisc ? 'rm-bar--disc' : 'rm-bar--skill'}" style="width:${beforePct}%"></div>
                    </div>`;
                skillList.appendChild(row);
                await sleep(40);

                const bar = row.querySelector('.rm-bar');
                await animateBar(bar, beforePct, afterPct, isDisc ? 800 : 500, () => {
                    bar.classList.add('rm-bar--flash');
                    spawnParticles(inner, leveled ? 20 : 8,
                        isDisc ? '#d4af37' : '#5ab4ff',
                        { x: 50, y: 80, spread: leveled ? 60 : 25, life: 600 }
                    );
                    setTimeout(() => bar.classList.remove('rm-bar--flash'), 450);
                });
                await sleep(leveled ? 200 : 55);
            }
        }

        // ── Footer ────────────────────────────────────────────────────────────
        const footer = inner.querySelector('.rm-footer');
        if (footer) {
            await sleep(200);
            footer.classList.add('rm-section--in');
        }
    };

    // ── Shell HTML ────────────────────────────────────────────────────────────

    function _buildShell(result) {
        const isVictory = result === 'victory';
        const isDefeat  = result === 'defeat' || result === 'loss';
        const titleText  = isVictory ? 'VICTORY' : isDefeat ? 'DEFEATED' : 'RETREATED';
        const titleColor = isVictory ? 'var(--green)' : isDefeat ? 'var(--red)' : 'var(--text-muted)';

        return `
        <div class="rm-title" style="color:${titleColor};">${titleText}</div>

        <div class="rm-unlocks" style="display:none;">
            <div class="rm-section-label rm-section-label--unlock">✨ Skill Unlocked</div>
            <div class="rm-unlock-list"></div>
        </div>

        <div class="rm-loot-section" style="display:none;">
            <div class="rm-section-label">⚔ Loot</div>
            <div class="rm-loot-list"></div>
        </div>

        <div class="rm-xp-section" style="display:none;">
            <div class="rm-section-label">✦ Experience</div>
            <div class="rm-xp-list"></div>
        </div>

        <div class="rm-skill-section" style="display:none;">
            <div class="rm-section-label">◈ Skill Progress</div>
            <div class="rm-skill-list"></div>
        </div>

        <div class="rm-footer">
            <p id="autoRestartText" class="rm-countdown"></p>
            <div class="rm-footer-btns">
                <button class="secondary" onclick="cancelAutoRestart()">Stop Loop</button>
                <button onclick="dismissResultModal()">Dismiss ✕</button>
            </div>
        </div>`;
    }

    // ── Populate unlock list (called separately, data arrives async) ──────────

    window.populateUnlockFanfare = function (newUnlocks) {
        const list = document.querySelector('.rm-unlock-list');
        if (!list) return;
        list.innerHTML = newUnlocks.map(u => {
            const name = u.skillDef?.name || u.skillID;
            const desc = u.skillDef?.description || '';
            const cat  = u.skillDef?.category || '';
            return `<div class="rm-unlock-entry">
                <div class="rm-unlock-name">${name}</div>
                ${desc ? `<div class="rm-unlock-desc">${desc}</div>` : ''}
                <div class="rm-unlock-cat">${cat} — now equippable</div>
            </div>`;
        }).join('');
    };

})();
