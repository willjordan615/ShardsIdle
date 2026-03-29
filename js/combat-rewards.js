/**
 * combat-rewards.js — Animated result modal
 *
 * Fully CSS-driven stagger animation. No JS sleep loops for item flow.
 * Gear items shake on entry (intensity scales with rarity).
 * XP bars animate via JS after a stagger delay.
 */

(function () {

    function rarityColor(rarity) {
        return { legendary: '#ffaa00', rare: '#00d4ff', uncommon: '#b060ff' }[rarity] || 'var(--text-primary)';
    }

    function rarityShakeClass(rarity) {
        return { legendary: 'rm-shake--legendary', rare: 'rm-shake--rare', uncommon: 'rm-shake--uncommon' }[rarity] || '';
    }

    function animateBar(barEl, fromPct, toPct, duration, onCross) {
        return new Promise(resolve => {
            const start   = performance.now();
            const crosses = toPct > 100 && fromPct < 100;
            let crossed   = false;

            function frame(now) {
                const t    = Math.min(1, (now - start) / duration);
                const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
                const cur  = fromPct + (toPct - fromPct) * ease;

                if (crosses && !crossed && cur >= 100) {
                    crossed = true;
                    barEl.style.width = '100%';
                    barEl.classList.add('rm-bar--flash');
                    onCross && onCross();
                    setTimeout(() => {
                        barEl.classList.remove('rm-bar--flash');
                        barEl.style.width = '0%';
                    }, 180);
                } else if (!crosses || cur < 100) {
                    barEl.style.width = Math.min(cur, 100) + '%';
                }

                if (t < 1) {
                    requestAnimationFrame(frame);
                } else {
                    const finalPct = toPct >= 100 ? (toPct % 100 || 100) : toPct;
                    barEl.style.width = Math.min(finalPct, 100) + '%';
                    resolve();
                }
            }
            requestAnimationFrame(frame);
        });
    }

    function spawnParticles(container, count, color, opts = {}) {
        const { spread = 55, life = 800 } = opts;
        for (let i = 0; i < count; i++) {
            const p     = document.createElement('div');
            const angle = Math.random() * 360;
            const dist  = 15 + Math.random() * spread;
            const dx    = Math.cos(angle * Math.PI / 180) * dist;
            const dy    = Math.sin(angle * Math.PI / 180) * dist;
            const size  = 2.5 + Math.random() * 4;
            p.style.cssText = `
                position:absolute; border-radius:50%;
                width:${size}px; height:${size}px;
                background:${color};
                left:50%; top:15%;
                transform:translate(-50%,-50%);
                pointer-events:none; z-index:20;
                transition: transform ${life}ms cubic-bezier(0,.9,.2,1), opacity ${life}ms ease-in;
                opacity:1;
            `;
            container.appendChild(p);
            requestAnimationFrame(() => {
                p.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
                p.style.opacity   = '0';
            });
            setTimeout(() => p.remove(), life + 60);
        }
    }

    window.animateCombatRewards = async function (payload) {
        const modal = document.getElementById('combatResultModal');
        const inner = modal?.querySelector('.result-modal-inner');
        if (!modal || !inner) return;

        const isVictory = payload.result === 'victory';
        const isDefeat  = payload.result === 'defeat' || payload.result === 'loss';
        const UNLOCK_XP = 120;

        const titleText  = isVictory ? 'VICTORY' : isDefeat ? 'DEFEATED' : 'RETREATED';
        const titleColor = isVictory ? 'var(--green)' : isDefeat ? 'var(--red)' : 'var(--text-muted)';

        // Unlocks section
        const unlocksHTML = payload.newUnlocks?.length ? `
            <div class="rm-section rm-unlocks" style="--rm-delay:0.1s">
                <div class="rm-section-label rm-section-label--unlock">✨ Skill Unlocked</div>
                ${payload.newUnlocks.map(u => `
                    <div class="rm-unlock-entry">
                        <div class="rm-unlock-name">${u.skillDef?.name || u.skillID}</div>
                        ${u.skillDef?.description ? `<div class="rm-unlock-desc">${u.skillDef.description}</div>` : ''}
                        <div class="rm-unlock-cat">${u.skillDef?.category || ''} — now equippable</div>
                    </div>`).join('')}
            </div>` : '';

        // Loot section — each item CSS staggered
        const lootCount = payload.loot?.length || 0;
        const lootHTML  = lootCount ? `
            <div class="rm-section rm-loot-section" style="--rm-delay:0.18s">
                <div class="rm-section-label">⚔ Loot</div>
                <div class="rm-loot-list">
                    ${payload.loot.map((item, i) => {
                        const color      = rarityColor(item.rarity);
                        const shakeClass = item.isConsumable ? '' : rarityShakeClass(item.rarity);
                        const delay      = (0.25 + i * 0.1).toFixed(2);
                        const rarityTag  = (item.rarity && item.rarity !== 'common')
                            ? `<span class="rm-rarity rm-rarity--${item.rarity}">${item.rarity}</span>` : '';
                        return `<div class="rm-loot-row ${shakeClass}" style="color:${color}; animation-delay:${delay}s; --rm-shake-delay:${delay}s;">
                                    <span class="rm-loot-bullet">▸</span>${item.name}${rarityTag}
                                </div>`;
                    }).join('')}
                </div>
            </div>` : '';

        // Char XP section
        const xpDelay  = (0.22 + lootCount * 0.1).toFixed(2);
        const charXPHTML = payload.charXP?.length ? `
            <div class="rm-section rm-xp-section" style="--rm-delay:${xpDelay}s">
                <div class="rm-section-label">✦ Experience</div>
                <div class="rm-xp-list">
                    ${payload.charXP.map(entry => {
                        const leveled   = entry.levelAfter > entry.levelBefore;
                        const beforePct = Math.min(100, (entry.xpBefore / entry.xpToNext) * 100);
                        const afterPct  = (entry.xpAfter  / entry.xpToNext) * 100;
                        return `<div class="rm-xp-row" data-from="${beforePct}" data-to="${afterPct}" data-leveled="${leveled}">
                            <div class="rm-xp-header">
                                <span class="rm-xp-name">${entry.name}</span>
                                <span class="rm-xp-gain">+${entry.xpGained} XP${leveled ? ' <span class="rm-levelup">LEVEL UP!</span>' : ''}</span>
                            </div>
                            <div class="rm-bar-track"><div class="rm-bar rm-bar--char" style="width:${beforePct}%"></div></div>
                        </div>`;
                    }).join('')}
                </div>
            </div>` : '';

        // Skill XP section
        const skillEntries = Object.entries(payload.skillXP || {});
        skillEntries.sort(([,a],[,b]) => {
            const score = x => (x.leveledUp ? 100 : 0) + (x.discovered ? 10 : 0);
            return score(b) - score(a);
        });
        const skillDelay = (0.28 + lootCount * 0.1).toFixed(2);
        const skillXPHTML = skillEntries.length ? `
            <div class="rm-section rm-skill-section" style="--rm-delay:${skillDelay}s">
                <div class="rm-section-label">◈ Skill Progress</div>
                <div class="rm-skill-list">
                    ${skillEntries.map(([, data]) => {
                        const isDisc    = data.discovered && data.level < 1;
                        const threshold = isDisc ? UNLOCK_XP : Math.round(100 * (data.level || 1) * 1.2);
                        const beforePct = Math.min(100, (data.before / threshold) * 100);
                        const afterPct  = (data.after / threshold) * 100;
                        return `<div class="rm-skill-row" data-from="${beforePct}" data-to="${afterPct}" data-leveled="${!!data.leveledUp}" data-disc="${isDisc}">
                            <div class="rm-skill-header">
                                <span class="rm-skill-name ${isDisc ? 'rm-skill-name--disc' : ''}">${isDisc ? '🔮 ' : ''}${data.name}${!isDisc ? ` <span class="rm-skill-level">Lv.${data.level}</span>` : ''}</span>
                                <span class="rm-skill-xp">+${data.xpAwarded.toFixed(0)} XP${data.leveledUp ? ` <span class="rm-levelup">${isDisc ? 'UNLOCKED!' : 'LEVEL UP!'}</span>` : ''}</span>
                            </div>
                            <div class="rm-bar-track"><div class="rm-bar ${isDisc ? 'rm-bar--disc' : 'rm-bar--skill'}" style="width:${beforePct}%"></div></div>
                        </div>`;
                    }).join('')}
                </div>
            </div>` : '';

        const footerDelay = (0.35 + lootCount * 0.1).toFixed(2);

        // Inject all at once — no flicker
        inner.innerHTML = `
            <div class="rm-title" style="color:${titleColor};">${titleText}</div>
            ${unlocksHTML}
            ${lootHTML}
            ${charXPHTML}
            ${skillXPHTML}
            <div class="rm-footer rm-section" style="--rm-delay:${footerDelay}s">
                <p id="autoRestartText" class="rm-countdown"></p>
                <div class="rm-footer-btns">
                    <button class="secondary" onclick="cancelAutoRestart()">Stop Loop</button>
                    <button onclick="dismissResultModal()">Dismiss ✕</button>
                </div>
            </div>`;

        // Show modal only after content is ready
        modal.style.display = 'flex';

        // Kick off title animation next frame
        requestAnimationFrame(() => {
            const titleEl = inner.querySelector('.rm-title');
            if (titleEl) titleEl.classList.add('rm-title--in');

            if (isVictory) {
                spawnParticles(inner, 28, 'var(--gold)',       { spread: 85, life: 1100 });
                spawnParticles(inner, 14, 'var(--gold-bright)',{ spread: 45, life: 850  });
            }
            if (payload.newUnlocks?.length) {
                setTimeout(() => spawnParticles(inner, 18, 'var(--green)', { spread: 60, life: 900 }), 250);
            }
        });

        // Animate bars after loot has cascaded in
        const barStartDelay = (parseFloat(xpDelay) + 0.35) * 1000;
        setTimeout(async () => {
            for (const row of inner.querySelectorAll('.rm-xp-row')) {
                const bar     = row.querySelector('.rm-bar--char');
                const from    = parseFloat(row.dataset.from);
                const to      = parseFloat(row.dataset.to);
                const leveled = row.dataset.leveled === 'true';
                if (bar) {
                    animateBar(bar, from, to, 680, () => {
                        bar.classList.add('rm-bar--flash');
                        if (leveled) spawnParticles(inner, 18, 'var(--green)', { spread: 55, life: 700 });
                        setTimeout(() => bar.classList.remove('rm-bar--flash'), 480);
                    });
                }
                await new Promise(r => setTimeout(r, 75));
            }

            await new Promise(r => setTimeout(r, 120));

            for (const row of inner.querySelectorAll('.rm-skill-row')) {
                const bar     = row.querySelector('.rm-bar');
                const from    = parseFloat(row.dataset.from);
                const to      = parseFloat(row.dataset.to);
                const leveled = row.dataset.leveled === 'true';
                const isDisc  = row.dataset.disc === 'true';
                if (bar) {
                    animateBar(bar, from, to, isDisc ? 720 : 460, () => {
                        bar.classList.add('rm-bar--flash');
                        if (leveled) spawnParticles(inner, isDisc ? 20 : 10,
                            isDisc ? 'var(--gold)' : 'var(--blue)', { spread: isDisc ? 60 : 28, life: 620 });
                        setTimeout(() => bar.classList.remove('rm-bar--flash'), 420);
                    });
                }
                await new Promise(r => setTimeout(r, isDisc ? 55 : 30));
            }
        }, barStartDelay);
    };

    window.populateUnlockFanfare = function () {};

})();
