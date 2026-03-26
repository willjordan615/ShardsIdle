// js/browse-system.js
// Browse public characters and import/share system
// NOTE: BACKEND_URL is defined in game-data.js - do not redeclare
 
// Browse pagination state
let _browsePagination = { page: 1, totalPages: 1, total: 0 };
let _browseSearchTimeout = null;

/**
 * Load browse results for the given page. Filters are read from the DOM.
 * All filtering and pagination happens server-side.
 */
async function loadBrowseCharacters(page) {
    if (page === undefined) page = 1;
    _browsePagination.page = page;

    const container = document.getElementById('browseResults');
    const loading   = document.getElementById('browseLoading');

    if (container) container.innerHTML = '';
    if (loading)   loading.style.display = 'block';

    try {
        const params = new URLSearchParams();
        const level  = document.getElementById('browseLevelFilter')?.value?.trim();
        const race   = document.getElementById('browseRaceFilter')?.value;
        const sortBy = document.getElementById('browseSortFilter')?.value;
        const search = document.getElementById('browseSearchFilter')?.value?.trim();
        const role   = document.getElementById('browseRoleFilter')?.value;

        if (level  && parseInt(level) > 0) params.append('level',  parseInt(level));
        if (race)   params.append('race',   race);
        if (sortBy) params.append('sortBy', sortBy);
        if (search) params.append('search', search);
        if (role)   params.append('role',   role);
        params.append('page',  page);
        params.append('limit', '8');

        const response = await authFetch(`${BACKEND_URL}/api/character/browse?${params}`);
        if (!response.ok) throw new Error('Browse failed');
        const data = await response.json();

        if (loading) loading.style.display = 'none';
        if (!container) return;

        const characters   = data.characters || [];
        _browsePagination  = data.pagination  || { page: 1, totalPages: 1, total: 0 };

        if (characters.length === 0) {
            container.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:3rem;color:#888;">
                    <h3>No Characters Found</h3>
                    <p>Try adjusting your filters or be the first to share a character!</p>
                </div>`;
            return;
        }

        characters.forEach(char => container.appendChild(createBrowseCard(char)));

        // Pagination controls
        const { totalPages, total } = _browsePagination;
        if (totalPages > 1) {
            const nav = document.createElement('div');
            nav.style.cssText = 'grid-column:1/-1;display:flex;justify-content:center;align-items:center;gap:12px;margin-top:1rem;';
            nav.innerHTML = `
                <button onclick="loadBrowseCharacters(${page - 1})" ${page <= 1 ? 'disabled' : ''} class="secondary" style="padding:4px 14px;">← Prev</button>
                <span style="color:#8b7355;font-size:0.85rem;">Page ${page} of ${totalPages} <span style="color:#555;">(${total} total)</span></span>
                <button onclick="loadBrowseCharacters(${page + 1})" ${page >= totalPages ? 'disabled' : ''} class="secondary" style="padding:4px 14px;">Next →</button>
            `;
            container.appendChild(nav);
        }

    } catch (error) {
        console.error('Browse error:', error);
        if (loading) loading.style.display = 'none';
        if (container) {
            container.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:3rem;color:#ff6b6b;">
                    <h3>Error Loading Characters</h3>
                    <p>${error.message}</p>
                    <button onclick="loadBrowseCharacters()" class="btn-secondary" style="margin-top:1rem;">Retry</button>
                </div>`;
        }
    }
}

/**
 * Debounced wrapper for text input — avoids a fetch on every keystroke.
 */
function loadBrowseCharactersDebounced() {
    clearTimeout(_browseSearchTimeout);
    _browseSearchTimeout = setTimeout(() => loadBrowseCharacters(1), 350);
}


/**
 * Create a browse result card
 */
function createBrowseCard(char) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'padding: 1.25rem; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border: 1px solid #333; border-radius: 12px;';

    const stats = char.combatStats || {};
    const milestones = stats.milestones || {};
    const totalKills = Object.values(stats.enemyKills || {}).reduce((a, b) => a + b, 0);
    const totalChallenges = Object.keys(stats.challengeCompletions || {}).length;

    // Top skill by usage
    const skillUsage = stats.skillUsage || {};
    const topSkillId = Object.entries(skillUsage).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topSkillDef = topSkillId && window.gameData?.skills?.find(s => s.id === topSkillId);
    const topSkillName = topSkillDef?.name || topSkillId;

    // Top kill target
    const topKillEntry = Object.entries(stats.enemyKills || {}).sort((a, b) => b[1] - a[1])[0];

    const ROLE_LABELS = {
        Defender: '🛡 Defender', Bruiser: '⚔️ Bruiser', Mage: '🔮 Mage',
        Healer: '💊 Healer', Support: '💚 Support', Utility: '🔧 Utility', Assassin: '🗡️ Assassin'
    };
    const profileLabels = {
        balanced:'⚖️', aggressive:'⚔️', cautious:'🛡️', support:'💚', disruptor:'🌀', opportunist:'🗡️'
    };
    const roleLabel = char.roleTag ? ROLE_LABELS[char.roleTag] : null;
    const profileEmoji = profileLabels[char.aiProfile] || '⚖️';
    const characterClass = (typeof getCharacterClass === 'function' && char.skills)
        ? getCharacterClass(char, window.gameData?.skills || [])
        : null;
    // Top 2 active (non-intrinsic) skills by level
    const activeSkillNames = (char.skills || [])
        .filter(s => !s.intrinsic)
        .sort((a, b) => (b.skillLevel || 0) - (a.skillLevel || 0))
        .slice(0, 2)
        .map(s => window.gameData?.skills?.find(sk => sk.id === s.skillID)?.name)
        .filter(Boolean);

    // Milestone badges with tooltips
    const badges = [];
    if (milestones.firstBlood)        badges.push({ icon: '🩸', label: 'First Blood — Won their first combat' });
    if (milestones.hundredKills)      badges.push({ icon: '💀', label: '100 Kills — Defeated 100 enemies' });
    if (milestones.masterHealer)      badges.push({ icon: '✨', label: 'Master Healer — 10,000 healing done' });
    if (milestones.undefeated)        badges.push({ icon: '🏆', label: 'Undefeated — 10+ wins, no losses' });
    if (milestones.centuryOfCombats)  badges.push({ icon: '⚔️', label: 'Century — 100 combats fought' });

    const statCell = (label, value, color = '#fff') =>
        `<div style="padding:0.35rem 0.5rem;background:rgba(255,255,255,0.04);border-radius:5px;">
            <div style="color:#666;font-size:0.7rem;">${label}</div>
            <div style="color:${color};font-weight:bold;font-size:0.9rem;">${value}</div>
        </div>`;

    card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.75rem;">
            <div>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <h3 style="margin:0;color:#4eff7f;font-size:1rem;">${char.characterName}</h3>
                    ${roleLabel ? `<span style="font-size:0.72rem;color:#d4af37;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.3);border-radius:10px;padding:1px 7px;">${roleLabel}</span>` : ''}
                </div>
                <div style="color:#888;font-size:0.8rem;margin-top:2px;">Lv.${char.level} ${char.race}${characterClass ? ' · ' + characterClass : ''} ${profileEmoji}</div>
                ${activeSkillNames.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">${activeSkillNames.map(n => `<span style="font-size:0.7rem;color:#d4af37;background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.2);border-radius:3px;padding:1px 6px;">${n}</span>`).join('')}</div>` : ''}
            </div>
            <div style="text-align:right;flex-shrink:0;">
                <code style="color:#4eff7f;font-size:0.85rem;letter-spacing:1px;">${char.shareCode}</code>
                <div style="color:#555;font-size:0.7rem;margin-top:2px;">${char.importCount || 0} imports</div>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:0.6rem;">
            ${statCell('Combats', stats.totalCombats || 0)}
            ${statCell('Wins', stats.wins || 0, '#4eff7f')}
            ${statCell('Win Rate', stats.winRate ? (parseFloat(stats.winRate)*100).toFixed(0)+'%' : '—', '#ffd700')}
            ${statCell('Kills', totalKills || 0, '#ff8c8c')}
            ${statCell('Crits', stats.totalCriticalHits || 0, '#ff6b6b')}
            ${statCell('Challenges', totalChallenges || 0, '#4a9eff')}
        </div>

        ${topSkillName ? `
        <div style="font-size:0.75rem;color:#888;margin-bottom:0.5rem;">
            Signature: <span style="color:#d4af37;">${topSkillName}</span>
            ${topKillEntry ? ` · Most hunted: <span style="color:#ff8c8c;">${topKillEntry[0].replace(/_/g,' ')} ×${topKillEntry[1]}</span>` : ''}
        </div>` : ''}

        ${badges.length ? `
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:0.6rem;">
            ${badges.map(b => `<span title="${b.label}" style="font-size:1rem;cursor:default;" aria-label="${b.label}">${b.icon}</span>`).join('')}
        </div>` : ''}

        ${char.isOwn
            ? `<div style="width:100%;text-align:center;padding:0.4rem;color:#555;font-size:0.82rem;border:1px solid #2a2a3a;border-radius:6px;">Your Character</div>`
            : `<button onclick="importCharacter('${char.shareCode}')" class="btn-primary" style="width:100%;padding:0.4rem;">Import to Party</button>`
        }
    `;

    return card;
}
 
/**
 * Open import modal with share code
 */
async function importCharacter(shareCode) {
    const modal = document.getElementById('importModal');
    const codeInput = document.getElementById('importShareCode');
    const preview = document.getElementById('importPreview');
    const confirmBtn = document.getElementById('importConfirmBtn');
    const warning = document.getElementById('importWarning');
    
    if (!modal || !codeInput) return;
    
    codeInput.value = shareCode || '';
    preview.innerHTML = '';
    preview.style.display = 'none';
    confirmBtn.disabled = true;
    warning.style.display = 'block';
    
    if (shareCode) {
        // Fetch preview data
        try {
            const response = await fetch(`${BACKEND_URL}/api/character/import/${shareCode}`);
            
            if (response.ok) {
                const data = await response.json();
                
                preview.innerHTML = `
                    <div style="text-align: center;">
                        <h4 style="color: #4eff7f; margin: 0 0 0.5rem;">${data.importReference.originalCharacterName}</h4>
                        <p style="color: #888; margin: 0;">Level ${data.importReference.level} ${data.importReference.race}</p>
                        <p style="color: #ffd700; margin: 0.5rem 0 0; font-size: 0.85rem;">
                            Imported by ${data.originalStats.importCount} players
                        </p>
                    </div>
                `;
                preview.style.display = 'block';
                confirmBtn.disabled = false;
                confirmBtn.onclick = () => confirmImport(shareCode);
            }
        } catch (error) {
            preview.innerHTML = `<p style="color: #ff6b6b;">Invalid share code</p>`;
            preview.style.display = 'block';
        }
    }
    
    modal.style.display = 'flex';
}
 
/**
 * Confirm import
 */
async function confirmImport(shareCode) {
    const code = shareCode || document.getElementById('importShareCode').value.trim();
    
    if (!code) {
        showError('Please enter a share code');
        return;
    }
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/character/import/${code}`);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Import failed');
        }
        
        const data = await response.json();
        
        // Store import reference for party formation
        const importRef = {
            importId: data.importReference.importId,
            characterID: data.importReference.importId,
            characterName: data.importReference.originalCharacterName,
            level: data.importReference.level,
            race: data.importReference.race,
            isImported: true,
            originalCharacterId: data.importReference.originalCharacterId,
            canReExport: false
        };
        
        // Add to current party if there's room (for combat formation)
        const maxSize = window.currentState?.selectedChallenge?.maxPartySize || 4;
        if (window.currentState?.currentParty) {
            if (window.currentState.currentParty.length >= maxSize) {
                showError('Party is full! Remove a member before importing.');
                return;
            }
            window.currentState.currentParty.push(importRef);
        }
        
        // Save to localStorage for persistence
        const savedImports = JSON.parse(localStorage.getItem('importedCharacters') || '[]');
        savedImports.push({
            ...importRef,
            importedAt: new Date().toISOString()
        });
        localStorage.setItem('importedCharacters', JSON.stringify(savedImports));
        
        closeModal('importModal');
        showSuccess(`Successfully imported ${data.importReference.originalCharacterName}!`);
        
        // Return to party formation if we're in party formation, otherwise roster
        if (window.currentState?.selectedChallenge) {
            showScreen('party');
        } else {
            showScreen('roster');
        }
        
    } catch (error) {
        console.error('Import error:', error);
        showError('Failed to import: ' + error.message);
    }
}
 
/**
 * Copy share code to clipboard
 */
function copyShareCode() {
    const code = document.getElementById('shareCodeValue')?.textContent;
    if (!code) return;
    
    navigator.clipboard.writeText(code).then(() => {
        showSuccess('Share code copied to clipboard!');
    }).catch(() => {
        showError('Failed to copy');
    });
}
 
/**
 * Toggle sharing on/off for the current character — no modal.
 */
window.toggleCharacterSharing = async function() {
    const characterId = window.currentState?.detailCharacterId;
    if (!characterId) return;

    const btn = document.getElementById('exportCharacterBtn');
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    try {
        const character = await getCharacter(characterId);
        if (!character) throw new Error('Character not found');

        // shareEnabled is now an alias for isPublic returned by the server
        const enabling = !character.shareEnabled;

        const res = await authFetch(`${BACKEND_URL}/api/character/export`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                characterId,
                isPublic: enabling,
                buildName: '',
                buildDescription: '',
                enableSharing: enabling
            })
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed');
        const data = await res.json();

        // Update local object and persist — isPublic is the canonical field
        character.isPublic    = enabling;
        character.shareEnabled = enabling;
        if (enabling) character.shareCode = data.shareCode;
        await saveCharacterToServer(character);

        if (btn) {
            btn.disabled = false;
            btn.textContent   = enabling ? '📤 Sharing: On' : '📤 Sharing: Off';
            btn.style.color       = enabling ? '#4cd964' : '';
            btn.style.borderColor = enabling ? '#4cd964' : '';
        }

        if (typeof showSuccess === 'function') {
            showSuccess(enabling
                ? `Sharing on — Code: ${data.shareCode}`
                : 'Sharing disabled.');
        }
    } catch(e) {
        if (btn) { btn.disabled = false; }
        if (typeof showError === 'function') showError('Sharing toggle failed: ' + e.message);
        const c = await getCharacter(characterId);
        if (c && typeof renderExportButton === 'function') renderExportButton(c);
    }
};

/**
 * Open import modal (manual code entry)
 */
function openImportModal() {
    const modal = document.getElementById('importModal');
    const codeInput = document.getElementById('importShareCode');
    const preview = document.getElementById('importPreview');
    const confirmBtn = document.getElementById('importConfirmBtn');
    const warning = document.getElementById('importWarning');
    
    if (!modal || !codeInput) return;
    
    codeInput.value = '';
    preview.innerHTML = '';
    preview.style.display = 'none';
    confirmBtn.disabled = true;
    warning.style.display = 'block';
    
    // Add debounced listener for manual code entry
    let importSearchTimeout = null;
    codeInput.oninput = async () => {
        clearTimeout(importSearchTimeout);
        const code = codeInput.value.trim();
        if (code.length < 10) {
            preview.innerHTML = '';
            preview.style.display = 'none';
            confirmBtn.disabled = true;
            return;
        }
        importSearchTimeout = setTimeout(async () => {
            try {
                const response = await fetch(`${BACKEND_URL}/api/character/import/${code}`);
                if (response.ok) {
                    const data = await response.json();
                    preview.innerHTML = `
                        <div style="text-align: center;">
                            <h4 style="color: #4eff7f; margin: 0 0 0.5rem;">${data.importReference.originalCharacterName}</h4>
                            <p style="color: #888; margin: 0;">Level ${data.importReference.level} ${data.importReference.race}</p>
                        </div>
                    `;
                    preview.style.display = 'block';
                    confirmBtn.disabled = false;
                    confirmBtn.onclick = () => confirmImport(code);
                } else {
                    preview.innerHTML = `<p style="color: #ff6b6b;">Invalid share code</p>`;
                    preview.style.display = 'block';
                    confirmBtn.disabled = true;
                }
            } catch (error) {
                preview.innerHTML = `<p style="color: #ff6b6b;">Invalid share code</p>`;
                preview.style.display = 'block';
                confirmBtn.disabled = true;
            }
        }, 400); // Wait 400ms after last keystroke before hitting the server
    };
    
    modal.style.display = 'flex';
}
// ── Party formation: public companion list ───────────────────────────────────
// Rendering and pagination for the public companions panel in party formation.
// Lives here rather than combat-system.js because it is browse/display logic.
// addPublicCompanion() (party mutation) stays in combat-system.js.

// Public companions pagination state
let _publicCompanionsSearchTimeout = null;

/**
 * Debounced wrapper for public companion text inputs.
 */
function loadPublicCompanionsDebounced() {
    clearTimeout(_publicCompanionsSearchTimeout);
    _publicCompanionsSearchTimeout = setTimeout(() => loadPublicCompanions(1), 350);
}

/**
 * Load public characters for companion selection, server-side paginated.
 */
async function loadPublicCompanions(page) {
    if (page === undefined) page = 1;
    const container = document.getElementById('publicCompanionsList');
    if (!container) return;

    container.innerHTML = '<div class="card" style="text-align: center; color: #8b7355; grid-column: 1 / -1;">Loading...</div>';

    try {
        const level  = document.getElementById('publicLevelFilter')?.value?.trim();
        const sortBy = document.getElementById('publicSortFilter')?.value || 'imports';
        const search = document.getElementById('publicSearchFilter')?.value?.trim();

        const params = new URLSearchParams({ sortBy, page, limit: '6' });
        if (level && parseInt(level) > 0) params.append('level', parseInt(level));
        if (search) params.append('search', search);

        const response = await authFetch(`${BACKEND_URL}/api/character/browse?${params}`);
        if (!response.ok) throw new Error('Failed to load');

        const data = await response.json();
        const characters = data.characters || [];
        const pagination = data.pagination || { page: 1, totalPages: 1, total: 0 };

        if (characters.length === 0) {
            container.innerHTML = '<div class="card" style="text-align: center; color: #8b7355; grid-column: 1 / -1;">No characters found</div>';
            return;
        }

        const authUserId = window.authState?.userId;
        const ROLE_LABELS = {
            Defender:'🛡 Defender', Bruiser:'⚔️ Bruiser', Mage:'🔮 Mage',
            Healer:'💊 Healer', Support:'💚 Support', Utility:'🔧 Utility', Assassin:'🗡️ Assassin'
        };

        container.innerHTML = '';
        characters.forEach(char => {
            const stats = char.combatStats || {};
            const isOwn = char.isOwn || (authUserId && char.ownerUserId && char.ownerUserId === authUserId);
            const alreadyAdded = currentState.currentParty.some(m => m.originalCharacterId === char.originalCharacterId);
            const maxSize = window.currentState?.selectedChallenge?.maxPartySize || 4;
            const partyFull = currentState.currentParty.length >= maxSize;
            const disabled = isOwn || alreadyAdded || partyFull;
            const disabledLabel = isOwn ? 'Your Character' : alreadyAdded ? 'Already in Party' : partyFull ? 'Party Full' : null;

            const card = document.createElement('div');
            card.className = 'card';

            if (disabled) {
                card.style.opacity = '0.45';
                card.style.cursor = 'not-allowed';
            } else {
                card.style.cursor = 'pointer';
                card.dataset.shareCode = char.shareCode;
                card.dataset.characterName = char.characterName;
                card.dataset.level = char.level;
                card.dataset.race = char.race;
                card.addEventListener('click', () => {
                    addPublicCompanion(
                        card.dataset.shareCode,
                        card.dataset.characterName,
                        Number(card.dataset.level),
                        card.dataset.race
                    );
                });
            }

            const roleLabel = char.roleTag ? ROLE_LABELS[char.roleTag] : null;
            const charClass = (typeof getCharacterClass === 'function' && char.skills)
                ? getCharacterClass(char, window.gameData?.skills || [])
                : null;
            const activeSkillNames = (char.skills || [])
                .filter(s => !s.intrinsic)
                .sort((a, b) => (b.skillLevel || 0) - (a.skillLevel || 0))
                .slice(0, 2)
                .map(s => window.gameData?.skills?.find(sk => sk.id === s.skillID)?.name)
                .filter(Boolean);

            const milestones = stats.milestones || {};
            const badges = [
                milestones.firstBlood       && { icon: '🩸', title: 'First Blood' },
                milestones.hundredKills     && { icon: '💀', title: '100 Kills' },
                milestones.masterHealer     && { icon: '✨', title: 'Master Healer' },
                milestones.undefeated       && { icon: '🏆', title: 'Undefeated' },
                milestones.centuryOfCombats && { icon: '⚔️', title: 'Century' },
            ].filter(Boolean);

            const totalKills = Object.values(stats.enemyKills || {}).reduce((a, b) => a + b, 0);
            const totalChallenges = Object.keys(stats.challengeCompletions || {}).length;
            const topSkillId = Object.entries(stats.skillUsage || {}).sort((a,b) => b[1]-a[1])[0]?.[0];
            const topSkillName = topSkillId && window.gameData?.skills?.find(s => s.id === topSkillId)?.name || topSkillId;
            const topKillEntry = Object.entries(stats.enemyKills || {}).sort((a,b) => b[1]-a[1])[0];

            card.innerHTML = `
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px;">
                    <span class="card-title" style="margin:0;">${escapeHtml(char.characterName)}</span>
                    ${roleLabel ? `<span style="font-size:0.68rem;color:#d4af37;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.25);border-radius:8px;padding:1px 6px;">${roleLabel}</span>` : ''}
                </div>
                <div class="card-subtitle" style="margin-bottom:0.3rem;">Lv.${char.level} ${escapeHtml(char.race)}${charClass ? ' · ' + charClass : ''}</div>
                ${activeSkillNames.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:0.35rem;">${activeSkillNames.map(n => `<span style="font-size:0.7rem;color:#d4af37;background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.2);border-radius:3px;padding:1px 6px;">${n}</span>`).join('')}</div>` : ''}

                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:0.35rem;">
                    <div style="background:rgba(10,14,39,0.6);padding:0.2rem;border-radius:4px;text-align:center;">
                        <div style="color:#8b7355;font-size:0.65rem;">Combats</div>
                        <div style="color:#ccc;font-weight:bold;font-size:0.82rem;">${stats.totalCombats || 0}</div>
                    </div>
                    <div style="background:rgba(10,14,39,0.6);padding:0.2rem;border-radius:4px;text-align:center;">
                        <div style="color:#8b7355;font-size:0.65rem;">Wins</div>
                        <div style="color:#4cd964;font-weight:bold;font-size:0.82rem;">${stats.wins || 0}</div>
                    </div>
                    <div style="background:rgba(10,14,39,0.6);padding:0.2rem;border-radius:4px;text-align:center;">
                        <div style="color:#8b7355;font-size:0.65rem;">Win Rate</div>
                        <div style="color:#d4af37;font-weight:bold;font-size:0.82rem;">${stats.winRate ? (parseFloat(stats.winRate)*100).toFixed(0)+'%' : '—'}</div>
                    </div>
                    <div style="background:rgba(10,14,39,0.6);padding:0.2rem;border-radius:4px;text-align:center;">
                        <div style="color:#8b7355;font-size:0.65rem;">Kills</div>
                        <div style="color:#ff8c8c;font-weight:bold;font-size:0.82rem;">${totalKills}</div>
                    </div>
                    <div style="background:rgba(10,14,39,0.6);padding:0.2rem;border-radius:4px;text-align:center;">
                        <div style="color:#8b7355;font-size:0.65rem;">Crits</div>
                        <div style="color:#ff6b6b;font-weight:bold;font-size:0.82rem;">${stats.totalCriticalHits || 0}</div>
                    </div>
                    <div style="background:rgba(10,14,39,0.6);padding:0.2rem;border-radius:4px;text-align:center;">
                        <div style="color:#8b7355;font-size:0.65rem;">Challenges</div>
                        <div style="color:#4a9eff;font-weight:bold;font-size:0.82rem;">${totalChallenges}</div>
                    </div>
                </div>

                ${topSkillName || topKillEntry ? `
                <div style="font-size:0.7rem;color:#666;margin-bottom:0.3rem;">
                    ${topSkillName ? `Sig: <span style="color:#d4af37;">${topSkillName}</span>` : ''}
                    ${topKillEntry ? ` · <span style="color:#ff8c8c;">${topKillEntry[0].replace(/_/g,' ')} ×${topKillEntry[1]}</span>` : ''}
                </div>` : ''}

                ${badges.length ? `<div style="margin-bottom:0.3rem;font-size:0.95rem;letter-spacing:2px;">${badges.map(b => `<span title="${b.title}" style="cursor:default;">${b.icon}</span>`).join('')}</div>` : ''}

                <div style="color:#8b7355;font-size:0.68rem;margin-bottom:0.4rem;">${char.importCount || 0} imports</div>
                <button class="secondary" style="width:100%;font-size:0.82rem;" ${disabled ? 'disabled' : ''}>${disabledLabel || 'Add to Party'}</button>
            `;

            container.appendChild(card);
        });

        // Pagination controls
        const { totalPages, total } = pagination;
        if (totalPages > 1) {
            const nav = document.createElement('div');
            nav.style.cssText = 'grid-column:1/-1;display:flex;justify-content:center;align-items:center;gap:12px;margin-top:1rem;';
            nav.innerHTML = `
                <button onclick="loadPublicCompanions(${page - 1})" ${page <= 1 ? 'disabled' : ''} class="secondary" style="padding:4px 14px;">← Prev</button>
                <span style="color:#8b7355;font-size:0.85rem;">Page ${page} of ${totalPages} <span style="color:#555;">(${total} total)</span></span>
                <button onclick="loadPublicCompanions(${page + 1})" ${page >= totalPages ? 'disabled' : ''} class="secondary" style="padding:4px 14px;">Next →</button>
            `;
            container.appendChild(nav);
        }

        // Scroll the companion panel into view without jumping to the top of the page
        if (page > 1) {
            container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

    } catch (error) {
        console.error('Load public companions error:', error);
        container.innerHTML = '<div class="card" style="text-align: center; color: #d4484a; grid-column: 1 / -1;">Failed to load public characters</div>';
    }
}

// ── Bot companion selection: rendering and pagination ────────────────────────
// Party mutation (addBotToParty, removeBotFromParty) stays in combat-system.js.

// Bot selection pagination state
const _botsPaging = { page: 1, totalPages: 1 };

const BOT_PAGE_SIZE = 6;

/**
 * Render available bots for selection, paginated.
 * Shows only bots at or below the player's level, sorted by level descending
 * so the strongest relevant bots appear first.
 */
function renderBotsSelection(page) {
    if (page === undefined) page = _botsPaging.page;
    _botsPaging.page = page;

    const container = document.getElementById('botsDisplay');
    if (!container) return;

    container.innerHTML = '';

    const challenge = currentState.selectedChallenge;
    if (!challenge || !window.gameData || !window.gameData.bots) return;

    // Determine player level from the first owned character in the party
    const playerChar = currentState.currentParty.find(m =>
        !m.characterID?.startsWith('bot_') && !m.characterID?.startsWith('import_')
    );
    const playerLevel = playerChar?.level || 1;

    // Show bots at or below player level, sorted strongest-first
    const eligibleBots = window.gameData.bots
        .filter(b => b.level <= playerLevel)
        .sort((a, b) => b.level - a.level);

    _botsPaging.totalPages = Math.max(1, Math.ceil(eligibleBots.length / BOT_PAGE_SIZE));

    // Clamp page in case removal shrinks the list
    if (_botsPaging.page > _botsPaging.totalPages) _botsPaging.page = _botsPaging.totalPages;

    if (eligibleBots.length === 0) {
        container.innerHTML = '<div style="color:#555; font-style:italic; padding:1rem;">No companions available yet.</div>';
        return;
    }

    const start = (_botsPaging.page - 1) * BOT_PAGE_SIZE;
    const pageSlice = eligibleBots.slice(start, start + BOT_PAGE_SIZE);

    const roleColors = {
        Defender:  '#4a9eff',
        Bruiser:   '#ff6b6b',
        Mage:      '#c77dff',
        Support:   '#4cd964',
        Utility:   '#ffd700',
        Assassin:  '#ff9f43',
    };

    pageSlice.forEach(bot => {
        const isSelected = currentState.currentParty.some(m => m.characterID === bot.characterID);
        const canAdd = currentState.currentParty.length < challenge.maxPartySize && !isSelected;

        const derivedStats = calculateDerivedStats(bot);
        const card = document.createElement('div');
        card.className = 'card';
        if (isSelected) card.classList.add('selected');

        const roleColor = roleColors[bot.role] || '#aaa';

        const botClass = (typeof getCharacterClass === 'function' && bot.skills)
            ? getCharacterClass(bot, window.gameData?.skills || [])
            : null;
        const botActiveSkills = (bot.skills || [])
            .filter(s => !s.intrinsic)
            .sort((a, b) => (b.skillLevel || 0) - (a.skillLevel || 0))
            .slice(0, 2)
            .map(s => window.gameData?.skills?.find(sk => sk.id === s.skillID)?.name)
            .filter(Boolean);

        card.innerHTML = `
            <div class="card-title">${bot.characterName}</div>
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; flex-wrap:wrap;">
                <span class="card-subtitle" style="margin:0;">Lv.${bot.level}${botClass ? ' · ' + botClass : ''}</span>
                ${bot.role ? `<span style="font-size:0.7rem; color:${roleColor}; background:rgba(255,255,255,0.06); border:1px solid ${roleColor}44; border-radius:4px; padding:1px 6px;">${bot.role}</span>` : ''}
            </div>
            ${botActiveSkills.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">${botActiveSkills.map(n => `<span style="font-size:0.7rem;color:#d4af37;background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.2);border-radius:3px;padding:1px 6px;">${n}</span>`).join('')}</div>` : ''}
            <div class="card-description" style="margin-bottom: 0.75rem;">
                HP: ${formatNumber(derivedStats.hp)}
            </div>
        `;

        if (canAdd) {
            card.style.cursor = 'pointer';
            card.onclick = () => addBotToParty(bot);
        } else if (isSelected) {
            card.style.cursor = 'pointer';
            card.onclick = () => removeBotFromParty(bot.characterID);
        } else {
            card.style.opacity = '0.5';
            card.style.cursor = 'not-allowed';
        }

        container.appendChild(card);
    });

    _renderBotsPagination(eligibleBots.length);
}

/**
 * Render pagination controls below the bots grid.
 * Mounts into #botsPagination, creating the element if absent.
 */
function _renderBotsPagination(total) {
    const page       = _botsPaging.page;
    const totalPages = _botsPaging.totalPages;

    let nav = document.getElementById('botsPagination');
    if (!nav) {
        nav = document.createElement('div');
        nav.id = 'botsPagination';
        const botsDisplay = document.getElementById('botsDisplay');
        if (botsDisplay) botsDisplay.parentNode.insertBefore(nav, botsDisplay.nextSibling);
    }

    if (totalPages <= 1) {
        nav.innerHTML = '';
        return;
    }

    nav.innerHTML = `
        <div class="roster-pagination">
            <button class="secondary roster-pagination__btn"
                    ${page <= 1 ? 'disabled' : ''}
                    onclick="renderBotsSelection(${page - 1})">← Prev</button>
            <span class="roster-pagination__info">
                Page ${page} of ${totalPages}
                <span class="roster-pagination__total">(${total} bots)</span>
            </span>
            <button class="secondary roster-pagination__btn"
                    ${page >= totalPages ? 'disabled' : ''}
                    onclick="renderBotsSelection(${page + 1})">Next →</button>
        </div>
    `;
}
