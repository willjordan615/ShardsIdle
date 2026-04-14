// offline-summary.js
// On page load, checks whether the player left an idle session running.
// If so, hits /idle/collect to run all missed combats server-side,
// then renders a summary screen before returning to the roster.

/**
 * Called from the init block in index.html after initializeGame() resolves.
 * Returns true if an offline session was found and the summary screen was shown.
 * Returns false if nothing was pending — caller should proceed normally.
 */
async function checkOfflineProgress() {
    try {
        const res = await authFetch(`${BACKEND_URL}/api/characters`);
        if (!res.ok) return false;
        const data = await res.json();
        const characters = data.characters || [];

        for (const char of characters) {
            const id = char.id || char.characterID;
            if (!id || id.startsWith('import_') || id.startsWith('bot_')) continue;

            const collectRes = await authFetch(`${BACKEND_URL}/api/combat/idle/collect`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ characterId: id }),
            });

            if (!collectRes.ok) {
                console.warn(`[OFFLINE] collect failed for ${id}: ${collectRes.status}`);
                continue;
            }
            const summary = await collectRes.json();
            console.log(`[OFFLINE] collect response for ${id}:`, summary.hadSession, summary.combatCount);

            if (!summary.hadSession) continue;

            _renderOfflineSummary(summary, char);
            if (typeof showScreen === 'function') showScreen('offlineSummary');
            return true;
        }

        return false;
    } catch (e) {
        console.warn('[OFFLINE] checkOfflineProgress failed:', e.message);
        return false;
    }
}

/**
 * Render the offline summary into #offlineSummaryInner.
 */
function _renderOfflineSummary(summary, primaryChar) {
    const inner = document.getElementById('offlineSummaryInner');
    if (!inner) return;

    // Stash for resume-loop path
    window._offlineSummaryChallengeId = summary.challengeId;
    window._offlineSummaryPartyIds    = summary.partyIds || null;
    window._offlineSummaryPrimaryChar = primaryChar;

    const charName     = primaryChar?.name || 'Your character';
    const challengeName = _formatChallengeName(summary.challengeId);
    const avatarId     = primaryChar?.avatarId   || null;
    const avatarColor  = primaryChar?.avatarColor || '#8a7a5a';

    // Avatar HTML — full portrait treatment
    const avatarHtml = window.AVATARS
        ? window.AVATARS.renderCardBgForCharacter(primaryChar)
        : '';

    // Time away
    const totalMins = Math.round(summary.elapsedMs / 60000);
    const hrs       = Math.floor(totalMins / 60);
    const mins      = totalMins % 60;
    const timeAway  = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

    // Win/loss
    const total   = summary.combatCount;
    const winRate = total > 0 ? Math.round((summary.wins / total) * 100) : 0;
    const wlColor = winRate >= 60 ? 'var(--green)' : winRate >= 40 ? 'var(--gold)' : 'var(--red)';

    // XP
    const xpEntries = Object.entries(summary.xpGained || {});
    const xpLines   = xpEntries.map(([charId, xp]) => {
        const name = charId === (primaryChar?.id || primaryChar?.characterID)
            ? charName : charId;
        return `<div style="color:var(--text-primary); font-size:0.85rem; margin-bottom:3px;">
            ${name} — <span style="color:var(--gold);">+${xp.toLocaleString()} XP</span>
        </div>`;
    }).join('');

    // Char XP bars — need level data from the primary character
    // We'll pull current state from the char object for end state;
    // the server tells us total xpGained so we back-calculate before state.
    const charXPRows = xpEntries.map(([charId, totalXP]) => {
        const name      = charId === (primaryChar?.id || primaryChar?.characterID) ? charName : charId;
        const afterLevel = primaryChar?.level || 1;
        const afterXP    = primaryChar?.experience || 0;
        const xpToNext   = _xpToNextLevel(afterLevel);
        // Approximate before: current XP minus gained (may have leveled, so clamp)
        const beforeXP   = Math.max(0, afterXP - (totalXP % xpToNext));
        const beforePct  = Math.min(100, (beforeXP / xpToNext) * 100);
        const afterPct   = Math.min(200, (afterXP  / xpToNext) * 100); // allow overshoot for level-cross
        return `<div class="os-xp-row rm-xp-row" data-from="${beforePct}" data-to="${afterPct}" data-leveled="false">
            <div class="rm-xp-header">
                <span class="rm-xp-name">${name}</span>
                <span class="rm-xp-gain">+${totalXP.toLocaleString()} XP</span>
            </div>
            <div class="rm-bar-track"><div class="rm-bar rm-bar--char" style="width:${beforePct}%"></div></div>
        </div>`;
    }).join('');

    // Skill XP rows — reuse rm-skill-row markup exactly
    const UNLOCK_XP = 120;
    const skillEntries = Object.entries(summary.skillXP || {});
    skillEntries.sort(([, a], [, b]) => {
        const score = x => (x.leveledUp ? 100 : 0) + (x.discovered && x.level < 1 ? 10 : 0);
        return score(b) - score(a);
    });
    const skillRows = skillEntries.map(([, data]) => {
        const isDisc    = data.discovered && data.level < 1;
        const threshold = isDisc ? UNLOCK_XP : Math.round(100 * (data.level || 1) * 1.2);
        const beforePct = Math.min(100, (data.before / threshold) * 100);
        const afterPct  = (data.after  / threshold) * 100;
        const discIcon  = isDisc ? '◆ ' : '';
        const levelTag  = !isDisc ? ` <span class="rm-skill-level">Lv.${data.level}</span>` : '';
        const levelUpTag = data.leveledUp
            ? ` <span class="rm-levelup">${isDisc ? 'UNLOCKED!' : 'LEVEL UP!'}</span>` : '';
        return `<div class="rm-skill-row" data-from="${beforePct}" data-to="${afterPct}"
                     data-leveled="${!!data.leveledUp}" data-disc="${isDisc}">
            <div class="rm-skill-header">
                <span class="rm-skill-name ${isDisc ? 'rm-skill-name--disc' : ''}">${discIcon}${data.name}${levelTag}</span>
                <span class="rm-skill-xp">+${(data.xpAwarded || 0).toFixed(0)} XP${levelUpTag}</span>
            </div>
            <div class="rm-bar-track"><div class="rm-bar ${isDisc ? 'rm-bar--disc' : 'rm-bar--skill'}" style="width:${beforePct}%"></div></div>
        </div>`;
    }).join('');

    // Discoveries
    const discoveries = summary.newDiscoveries || [];
    const discoveryHTML = discoveries.length ? `
        <div class="section os-discoveries">
            <div class="os-section-label" style="color:var(--gold);">◆ Skills Discovered</div>
            ${discoveries.map(d => `
                <div class="os-discovery-entry">
                    <div class="os-discovery-name">${d.name}</div>
                    ${d.description ? `<div class="os-discovery-desc">${d.description}</div>` : ''}
                    ${d.category ? `<div class="os-discovery-cat">${d.category} — now equippable</div>` : ''}
                </div>`).join('')}
        </div>` : '';

    // Loot
    const rarityOrder = { legendary: 0, rare: 1, uncommon: 2, common: 3 };
    const rarityColor = { legendary: '#ffaa00', rare: '#00d4ff', uncommon: '#4eff7f', common: '#aaa' };
    const sortedLoot  = [...(summary.lootGained || [])].sort((a, b) =>
        (rarityOrder[a.rarity] ?? 4) - (rarityOrder[b.rarity] ?? 4)
    );
    const lootRows = sortedLoot.length > 0
        ? sortedLoot.map(l => {
            const color    = rarityColor[l.rarity] || '#aaa';
            const soldNote = l.autosold ? ` <span style="color:var(--text-muted); font-size:0.78rem;">(auto-sold)</span>` : '';
            const qty      = l.count > 1 ? ` <span style="color:var(--text-muted);">×${l.count}</span>` : '';
            return `<div class="os-loot-row os-loot-row--hidden" data-rarity="${l.rarity || 'common'}" data-quest="${!!l.isQuestItem}">
                <span style="color:${color};">${l.name}</span>${qty}${soldNote}
            </div>`;
        }).join('')
        : `<div style="color:var(--text-muted); font-size:0.85rem;">No gear dropped.</div>`;

    const goldLine = (summary.goldGained > 0 || summary.dustGained > 0)
        ? `<div style="margin-top:8px; font-size:0.82rem; color:var(--text-muted);">
               Auto-sold duplicates:
               <span style="color:var(--gold);">+${summary.goldGained.toFixed(0)}g</span>
               · <span style="color:#8888ff;">+${summary.dustGained.toFixed(2)} dust</span>
           </div>`
        : '';

    // Particle dots — pure CSS animation, injected as spans
    const particles = Array.from({ length: 12 }, (_, i) =>
        `<span class="os-particle" style="--i:${i};"></span>`
    ).join('');

    inner.innerHTML = `
        <!-- Hero header -->
        <div class="os-hero">
            ${particles}
            <div class="os-hero__shimmer"></div>

            <div class="os-hero__content">
                <div class="os-hero__eyebrow">While You Were Away</div>
                <div class="os-hero__name">${charName}</div>
                <div class="os-hero__challenge">${challengeName}</div>
            </div>

            <div class="os-hero__avatar">
                ${avatarHtml}
                <div class="os-hero__avatar-glow" style="--avatar-color:${avatarColor};"></div>
            </div>
        </div>

        <!-- Stat row -->
        <div class="os-stats">
            ${_statCard('Time Away',  timeAway,              'var(--text-primary)')}
            ${_statCard('Combats',    total.toLocaleString(), 'var(--text-primary)')}
            ${_statCard('Win Rate',   `${winRate}%`,          wlColor)}
        </div>

        <!-- XP + W/L -->
        <div class="os-grid-2">
            <div class="section">
                <div class="os-section-label">Wins / Losses</div>
                <div style="font-size:1.15rem; margin-top:4px;">
                    <span style="color:var(--green);">${summary.wins}W</span>
                    <span style="color:var(--text-muted); margin:0 8px;">/</span>
                    <span style="color:var(--red);">${summary.losses}L</span>
                </div>
            </div>
            <div class="section">
                <div class="os-section-label">Experience Gained</div>
                ${xpLines || '<div style="color:var(--text-muted); font-size:0.85rem;">None.</div>'}
            </div>
        </div>

        ${discoveryHTML}

        ${charXPRows ? `
        <div class="section" style="margin-bottom:0.75rem;">
            <div class="os-section-label">Character XP</div>
            <div class="rm-xp-list">${charXPRows}</div>
        </div>` : ''}

        ${skillRows ? `
        <div class="section" style="margin-bottom:0.75rem;">
            <div class="os-section-label">Skill Progress</div>
            <div class="rm-skill-list os-skill-list">${skillRows}</div>
        </div>` : ''}

        <!-- Loot -->
        <div class="section os-loot">
            <div class="os-section-label">Loot Collected</div>
            <div class="os-loot__list">${lootRows}</div>
            ${goldLine}
        </div>

        <!-- Quest item hints -->
        ${(() => {
            const ch = window.gameData?.challenges?.find(c => c.id === summary.challengeId);
            const hints = (typeof window.getQuestItemHints === 'function')
                ? window.getQuestItemHints(ch, primaryChar)
                : [];
            if (!hints.length) return '';
            return `<div class="section os-hints" style="margin-bottom:0.75rem;">
                <div class="os-section-label" style="color:var(--text-muted);">✦ Your Pack</div>
                ${hints.map(h => `<div style="color:var(--text-muted); font-size:0.82rem; font-style:italic; margin-bottom:4px;">${h.text}</div>`).join('')}
            </div>`;
        })()}

        <!-- Actions -->
        <div class="os-actions">
            <button onclick="_dismissOfflineSummary(false)" class="secondary os-btn">
                Return to Roster
            </button>
            <button onclick="_viewCharacterFromSummary()" class="secondary os-btn">
                See Character
            </button>
            <button onclick="_dismissOfflineSummary(true)" class="os-btn os-btn--primary">
                Resume Loop
            </button>
        </div>
    `;

    // Animate bars after the DOM settles
    requestAnimationFrame(() => _animateOfflineBars(inner, summary));
}

function _statCard(label, value, valueColor) {
    return `
        <div class="os-stat-card">
            <div class="os-stat-card__value" style="color:${valueColor};">${value}</div>
            <div class="os-stat-card__label">${label}</div>
        </div>`;
}

function _formatChallengeName(id) {
    if (!id) return 'Unknown Challenge';
    // Try gameData first for the real display name
    const ch = window.gameData?.challenges?.find(c => c.id === id);
    if (ch?.name) return ch.name;
    return id.replace('challenge_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Dismiss the summary screen.
 * resumeLoop: if true, re-activates the idle loop on the same challenge.
 */
async function _dismissOfflineSummary(resumeLoop) {
    // Clear the summary content immediately so it can't bleed through
    const inner = document.getElementById('offlineSummaryInner');
    if (inner) inner.innerHTML = '';

    await renderRoster();
    if (typeof showScreen === 'function') showScreen('roster');

    if (!resumeLoop) return;

    const primaryChar = window._offlineSummaryPrimaryChar;
    const charId = primaryChar?.id || primaryChar?.characterID;
    if (!charId) return;

    const challengeId = window._offlineSummaryChallengeId || window.currentState?.selectedChallenge?.id;
    if (!challengeId) return;

    const challenge = window.gameData?.challenges?.find(c => c.id === challengeId);
    if (!challenge) return;

    // Load character and party, then start
    try {
        const char = await getCharacter(charId);
        if (!char) return;

        // Rebuild the original party from stored IDs
        const storedPartyIds = window._offlineSummaryPartyIds;
        let party = [char];

        if (Array.isArray(storedPartyIds) && storedPartyIds.length > 1) {
            const savedImports = JSON.parse(localStorage.getItem('importedCharacters') || '[]');
            const rebuilt = await Promise.all(storedPartyIds.map(async id => {
                if (id === charId) return char;
                if (id.startsWith('bot_') && !id.startsWith('bot_gen_')) {
                    return window.gameData?.bots?.find(b => b.characterID === id) || null;
                }
                if (id.startsWith('import_')) {
                    return savedImports.find(i => i.characterID === id) || null;
                }
                // bot_gen_ can't be reconstructed after session clear — omit
                return null;
            }));
            const valid = rebuilt.filter(Boolean);
            if (valid.length > 0) party = valid;
        }

        window.currentState.currentParty     = party;
        window.currentState.selectedChallenge = challenge;
        window.currentState.idleActive        = true;
        if (typeof startCombat === 'function') startCombat();
    } catch (e) {
        console.warn('[OFFLINE] Resume loop failed:', e.message);
    }
}

async function _viewCharacterFromSummary() {
    const inner = document.getElementById('offlineSummaryInner');
    if (inner) inner.innerHTML = '';

    const charId = (window._offlineSummaryPrimaryChar?.id)
        || (window._offlineSummaryPrimaryChar?.characterID);
    await renderRoster();
    if (charId && typeof showCharacterDetail === 'function') {
        if (typeof showScreen === 'function') showScreen('detail');
        await showCharacterDetail(charId);
    } else {
        if (typeof showScreen === 'function') showScreen('roster');
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _xpToNextLevel(level) {
    return Math.max(1, Math.floor(7300 * Math.pow(1.15, (level || 1) - 1)));
}

function _osAnimateBar(barEl, fromPct, toPct, duration, onCross) {
    return new Promise(resolve => {
        const start   = performance.now();
        let crossed   = false;
        const crosses = toPct > 100 && fromPct < 100;
        function frame(now) {
            const t    = Math.min(1, (now - start) / duration);
            const ease = t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t;
            const cur  = fromPct + (toPct - fromPct) * ease;
            if (crosses && !crossed && cur >= 100) {
                crossed = true;
                barEl.style.width = '100%';
                barEl.classList.add('rm-bar--flash');
                onCross && onCross();
                setTimeout(() => { barEl.classList.remove('rm-bar--flash'); barEl.style.width = '0%'; }, 180);
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

function _osSpawnParticles(container, count, color, spread = 55, life = 800) {
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
            left:50%; top:30%;
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

async function _animateOfflineBars(container) {
    // Slight delay so CSS fade-in finishes first
    await new Promise(r => setTimeout(r, 400));

    // Char XP bars
    for (const row of container.querySelectorAll('.rm-xp-row')) {
        const bar     = row.querySelector('.rm-bar--char');
        const from    = parseFloat(row.dataset.from);
        const to      = parseFloat(row.dataset.to);
        if (!bar) continue;
        await _osAnimateBar(bar, from, to, 700, () => {
            _osSpawnParticles(container, 14, 'var(--gold)', 60, 900);
        });
        await new Promise(r => setTimeout(r, 80));
    }

    await new Promise(r => setTimeout(r, 120));

    // Skill XP bars
    for (const row of container.querySelectorAll('.rm-skill-row')) {
        const bar     = row.querySelector('.rm-bar');
        const from    = parseFloat(row.dataset.from);
        const to      = parseFloat(row.dataset.to);
        const leveled = row.dataset.leveled === 'true';
        const isDisc  = row.dataset.disc === 'true';
        if (!bar) continue;
        await _osAnimateBar(bar, from, to, isDisc ? 720 : 460, () => {
            bar.classList.add('rm-bar--flash');
            if (leveled) _osSpawnParticles(container,
                isDisc ? 20 : 10,
                isDisc ? 'var(--gold)' : '#5ab4ff',
                isDisc ? 60 : 28, 620
            );
            setTimeout(() => bar.classList.remove('rm-bar--flash'), 420);
        });
        await new Promise(r => setTimeout(r, isDisc ? 55 : 30));
    }

    // Discovery fanfare — pulse the discovery section if present
    const discSection = container.querySelector('.os-discoveries');
    if (discSection) {
        _osSpawnParticles(container, 22, 'var(--gold)', 80, 1000);
    }

    // Loot reveal — staggered by rarity
    await new Promise(r => setTimeout(r, 180));
    const rarityDelay    = { legendary: 320, rare: 220, uncommon: 120, common: 70 };
    const rarityParticles = { legendary: [20, '#ffaa00', 70, 900], rare: [12, '#00d4ff', 45, 700] };
    const lootRows = container.querySelectorAll('.os-loot-row--hidden');
    for (const row of lootRows) {
        const rarity = row.dataset.rarity || 'common';
        const delay  = rarityDelay[rarity] ?? 70;
        row.classList.remove('os-loot-row--hidden');
        row.classList.add('os-loot-row--reveal');
        const isQuest = row.dataset.quest === 'true';
        if (!isQuest && rarityParticles[rarity]) {
            const [count, color, spread, life] = rarityParticles[rarity];
            _osSpawnParticles(container, count, color, spread, life);
            row.classList.add('os-loot-row--shake');
            setTimeout(() => row.classList.remove('os-loot-row--shake'), 500);
        }
        await new Promise(r => setTimeout(r, delay));
    }
}
