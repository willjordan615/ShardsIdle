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
    // Need a primary character to check against.
    // We discover it by looking at all characters owned by this user.
    // Use the most recently active one that has an idle session.
    try {
        const res = await authFetch(`${BACKEND_URL}/api/characters`);
        if (!res.ok) return false;
        const characters = await res.json();

        // Find the first character that has an idle session pending
        // by calling /idle/collect — it reads idleStartedAt server-side.
        // We try each owned character; the first one with a session wins.
        // (In practice, only one character runs a loop at a time.)
        for (const char of characters) {
            const id = char.id || char.characterID;
            if (!id || id.startsWith('import_') || id.startsWith('bot_')) continue;

            const collectRes = await authFetch(`${BACKEND_URL}/api/combat/idle/collect`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ characterId: id }),
            });

            if (!collectRes.ok) continue;
            const summary = await collectRes.json();

            if (!summary.hadSession) continue;

            // Found a session — render the summary screen
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
    window._offlineSummaryPrimaryChar = primaryChar;

    const charName = primaryChar?.name || 'Your character';
    const challengeName = _formatChallengeName(summary.challengeId);

    // Time away
    const totalMins  = Math.round(summary.elapsedMs / 60000);
    const hrs        = Math.floor(totalMins / 60);
    const mins       = totalMins % 60;
    const timeAway   = hrs > 0
        ? `${hrs}h ${mins}m`
        : `${mins}m`;

    // Win/loss line
    const total    = summary.combatCount;
    const winRate  = total > 0 ? Math.round((summary.wins / total) * 100) : 0;
    const wlColor  = winRate >= 60 ? 'var(--green)' : winRate >= 40 ? 'var(--gold)' : 'var(--red)';

    // XP summary
    const xpEntries = Object.entries(summary.xpGained || {});
    const xpLines   = xpEntries.map(([charId, xp]) => {
        const name = charId === (primaryChar?.id || primaryChar?.characterID)
            ? charName
            : charId;
        return `<div style="color:var(--text-primary); font-size:0.85rem;">${name} — <span style="color:var(--gold);">+${xp.toLocaleString()} XP</span></div>`;
    }).join('');

    // Loot summary — group by rarity order
    const rarityOrder = { legendary: 0, rare: 1, uncommon: 2, common: 3 };
    const sortedLoot  = [...(summary.lootGained || [])].sort((a, b) =>
        (rarityOrder[a.rarity] ?? 4) - (rarityOrder[b.rarity] ?? 4)
    );
    const rarityColor = { legendary: '#ffaa00', rare: '#00d4ff', uncommon: '#4eff7f', common: '#aaa' };

    const lootRows = sortedLoot.length > 0
        ? sortedLoot.map(l => {
            const color    = rarityColor[l.rarity] || '#aaa';
            const soldNote = l.autosold ? ` <span style="color:var(--text-muted); font-size:0.78rem;">(auto-sold)</span>` : '';
            const qty      = l.count > 1 ? ` <span style="color:var(--text-muted);">×${l.count}</span>` : '';
            return `<div style="padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                <span style="color:${color};">${l.name}</span>${qty}${soldNote}
            </div>`;
        }).join('')
        : `<div style="color:var(--text-muted); font-size:0.85rem;">No gear dropped.</div>`;

    // Gold/dust
    const goldLine = (summary.goldGained > 0 || summary.dustGained > 0)
        ? `<div style="margin-top:6px; font-size:0.82rem; color:var(--text-muted);">
               Auto-sold duplicates: <span style="color:var(--gold);">+${summary.goldGained.toFixed(0)}g</span>
               · <span style="color:#8888ff;">+${summary.dustGained.toFixed(2)} dust</span>
           </div>`
        : '';

    inner.innerHTML = `
        <div style="text-align:center; margin-bottom:2rem;">
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;
                        letter-spacing:0.1em; margin-bottom:0.5rem;">While You Were Away</div>
            <h2 style="margin:0 0 0.25rem; font-size:1.6rem; color:var(--text-primary);">${charName}</h2>
            <div style="color:var(--text-muted); font-size:0.88rem;">${challengeName}</div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:1rem; margin-bottom:2rem;">
            ${_statCard('Time Away', timeAway, 'var(--text-primary)')}
            ${_statCard('Combats', total.toLocaleString(), 'var(--text-primary)')}
            ${_statCard('Win Rate', `${winRate}%`, wlColor)}
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; margin-bottom:2rem;">
            <div class="section">
                <h3 style="margin:0 0 0.75rem; font-size:0.78rem; text-transform:uppercase;
                           letter-spacing:0.08em; color:var(--text-muted);">Experience Gained</h3>
                ${xpLines || '<div style="color:var(--text-muted); font-size:0.85rem;">None.</div>'}
            </div>
            <div class="section">
                <h3 style="margin:0 0 0.75rem; font-size:0.78rem; text-transform:uppercase;
                           letter-spacing:0.08em; color:var(--text-muted);">
                    Wins / Losses
                </h3>
                <div style="font-size:1.1rem;">
                    <span style="color:var(--green);">${summary.wins}W</span>
                    <span style="color:var(--text-muted); margin:0 6px;">/</span>
                    <span style="color:var(--red);">${summary.losses}L</span>
                </div>
            </div>
        </div>

        <div class="section" style="margin-bottom:2rem;">
            <h3 style="margin:0 0 0.75rem; font-size:0.78rem; text-transform:uppercase;
                       letter-spacing:0.08em; color:var(--text-muted);">Loot Collected</h3>
            <div style="max-height:280px; overflow-y:auto; font-size:0.85rem;">
                ${lootRows}
            </div>
            ${goldLine}
        </div>

        <div style="text-align:center; display:flex; gap:1rem; justify-content:center;">
            <button onclick="_dismissOfflineSummary(false)"
                    class="secondary" style="padding:10px 28px;">
                Return to Roster
            </button>
            <button onclick="_dismissOfflineSummary(true)"
                    style="padding:10px 28px;">
                Resume Loop
            </button>
        </div>
    `;
}

function _statCard(label, value, valueColor) {
    return `
        <div class="section" style="text-align:center; padding:1rem;">
            <div style="font-size:1.4rem; font-weight:700; color:${valueColor}; margin-bottom:4px;">${value}</div>
            <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.07em;">${label}</div>
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
    await renderRoster();
    if (typeof showScreen === 'function') showScreen('roster');

    if (!resumeLoop) return;

    // Re-enter the loop: need a character and challenge in currentState.
    // The summary screen was shown before renderRoster, so currentState may
    // not be set yet. renderRoster sets detailCharacterId — use that.
    const charId = window.currentState?.detailCharacterId;
    if (!charId) return;

    // Find the challenge from the summary screen's stored data
    const summaryInner = document.getElementById('offlineSummaryInner');
    if (!summaryInner) return;

    // Re-read challenge from the rendered name element — fallback to last known
    const challengeId = window._offlineSummaryChallengeId || window.currentState?.selectedChallenge?.id;
    if (!challengeId) return;

    const challenge = window.gameData?.challenges?.find(c => c.id === challengeId);
    if (!challenge) return;

    // Load character and party, then start
    try {
        const char = await getCharacter(charId);
        if (!char) return;
        window.currentState.currentParty     = [char];
        window.currentState.selectedChallenge = challenge;
        window.currentState.idleActive        = true;
        if (typeof startCombat === 'function') startCombat();
    } catch (e) {
        console.warn('[OFFLINE] Resume loop failed:', e.message);
    }
}
