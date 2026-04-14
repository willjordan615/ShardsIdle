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
            nav.className = 'browse-pagination';
            nav.innerHTML = `
                <button onclick="loadBrowseCharacters(${page - 1})" ${page <= 1 ? 'disabled' : ''} class="secondary btn-compact">← Prev</button>
                <span class="browse-pagination__info">Page ${page} of ${totalPages} <span class="browse-pagination__total">(${total} total)</span></span>
                <button onclick="loadBrowseCharacters(${page + 1})" ${page >= totalPages ? 'disabled' : ''} class="secondary btn-compact">Next →</button>
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
                    <button onclick="loadBrowseCharacters()" class="secondary" style="margin-top:1rem;">Retry</button>
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
    card.className = 'card browse-card';

    const stats = char.combatStats || {};
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
        Defender: '<img src="/assets/icons/chest-armor.svg" class="gi-icon" alt=""> Defender', Bruiser: '<img src="/assets/icons/mailed-fist.svg" class="gi-icon" alt=""> Bruiser', Mage: '<img src="/assets/icons/earth-crack.svg" class="gi-icon" alt=""> Mage',
        Healer: '<img src="/assets/icons/caduceus.svg" class="gi-icon" alt=""> Healer', Support: '<img src="/assets/icons/resonance.svg" class="gi-icon" alt=""> Support', Utility: '<img src="/assets/icons/uncertainty.svg" class="gi-icon" alt=""> Utility', Assassin: '<img src="/assets/icons/cloak-and-dagger.svg" class="gi-icon" alt=""> Assassin'
    };
    const profileLabels = {
        balanced:'<img src="/assets/icons/scales.svg" class="gi-icon" alt="">',
        aggressive:'<img src="/assets/icons/battered-axe.svg" class="gi-icon" alt="">',
        cautious:'<img src="/assets/icons/shield-echoes.svg" class="gi-icon" alt="">',
        support:'<img src="/assets/icons/healing-shield.svg" class="gi-icon" alt="">',
        disruptor:'<img src="/assets/icons/star-swirl.svg" class="gi-icon" alt="">',
        opportunist:'<img src="/assets/icons/crosshair-arrow.svg" class="gi-icon" alt="">'
    };
    const roleLabel = char.roleTag ? ROLE_LABELS[char.roleTag] : null;
    const profileEmoji = profileLabels[char.aiProfile] || '<img src="/assets/icons/scales.svg" class="gi-icon" alt="">';
    const characterClass = (typeof getCharacterClass === 'function' && char.skills)
        ? getCharacterClass(char, window.gameData?.skills || [])
        : null;
    const _nonIntrinsic1 = (char.skills || []).filter(s => !s.intrinsic);
    const _intrinsic1    = (char.skills || []).filter(s => s.intrinsic);
    const activeSkillNames = [..._nonIntrinsic1.slice(0, 2), ..._intrinsic1.slice(0, 1)]
        .map(s => window.gameData?.skills?.find(sk => sk.id === s.skillID)?.name)
        .filter(Boolean);

    const statCell = (label, value, colorClass = '') =>
        `<div class="browse-stat-cell">
            <div class="browse-stat-cell__label">${label}</div>
            <div class="browse-stat-cell__value${colorClass ? ' ' + colorClass : ''}">${value}</div>
        </div>`;

    card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:0.75rem;">
            <div>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <h3 style="margin:0;color:#4eff7f;font-size:1rem;">${char.characterName}</h3>
                    ${roleLabel ? `<span class="role-badge">${roleLabel}</span>` : ''}
                </div>
                <div style="color:#888;font-size:0.8rem;margin-top:2px;">Lv.${char.level} ${char.race}${characterClass ? ' · ' + characterClass : ''} ${profileEmoji}</div>
                ${activeSkillNames.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">${activeSkillNames.map(n => `<span class="skill-tag">${n}</span>`).join('')}</div>` : ''}
            </div>
            <div style="text-align:right;flex-shrink:0;">
                <code style="color:#4eff7f;font-size:0.85rem;letter-spacing:1px;">${char.shareCode}</code>
                <div style="color:#555;font-size:0.7rem;margin-top:2px;">${char.importCount || 0} imports</div>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:0.6rem;">
            ${statCell('Combats', stats.totalCombats || 0)}
            ${statCell('Wins', stats.wins || 0, 'color-green')}
            ${statCell('Win Rate', stats.winRate ? (parseFloat(stats.winRate)*100).toFixed(0)+'%' : '—', 'color-gold')}
            ${statCell('Kills', totalKills || 0, 'color-red-soft')}
            ${statCell('Crits', stats.totalCriticalHits || 0, 'color-red')}
            ${statCell('Challenges', totalChallenges || 0, 'color-blue')}
        </div>

        ${topSkillName ? `
        <div style="font-size:0.75rem;color:#888;margin-bottom:0.5rem;">
            Signature: <span style="color:#d4af37;">${topSkillName}</span>
            ${topKillEntry ? ` · Most hunted: <span style="color:#ff8c8c;">${topKillEntry[0].replace(/_/g,' ')} ×${topKillEntry[1]}</span>` : ''}
        </div>` : ''}

        ${char.isOwn
            ? `<div class="browse-card__own-label">Your Character</div>`
            : `<button onclick="importCharacter('${char.shareCode}')" class="btn-full">Import to Party</button>`
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
            btn.textContent   = enabling ? 'Sharing: On' : 'Sharing: Off';
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
            Defender:'<img src="/assets/icons/chest-armor.svg" class="gi-icon" alt=""> Defender', Bruiser:'<img src="/assets/icons/mailed-fist.svg" class="gi-icon" alt=""> Bruiser', Mage:'<img src="/assets/icons/earth-crack.svg" class="gi-icon" alt=""> Mage',
            Healer:'<img src="/assets/icons/caduceus.svg" class="gi-icon" alt=""> Healer', Support:'<img src="/assets/icons/resonance.svg" class="gi-icon" alt=""> Support', Utility:'<img src="/assets/icons/uncertainty.svg" class="gi-icon" alt=""> Utility', Assassin:'<img src="/assets/icons/cloak-and-dagger.svg" class="gi-icon" alt=""> Assassin'
        };

        container.innerHTML = '';
        characters.forEach(char => {
            const stats = char.combatStats || {};
            const isOwn = char.isOwn || (authUserId && char.ownerUserId && char.ownerUserId === authUserId);
            const alreadyAdded = currentState.currentParty.some(m => m.originalCharacterId === char.originalCharacterId);
            const maxSize = window.currentState?.selectedChallenge?.maxPartySize || 4;
            const partyFull = currentState.currentParty.length >= maxSize;
            const disabled = alreadyAdded || partyFull;
            const disabledLabel = alreadyAdded ? 'Already in Party' : partyFull ? 'Party Full' : null;

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
            const _nonIntrinsic2 = (char.skills || []).filter(s => !s.intrinsic);
            const _intrinsic2    = (char.skills || []).filter(s => s.intrinsic);
            const activeSkillNames = [..._nonIntrinsic2.slice(0, 2), ..._intrinsic2.slice(0, 1)]
                .map(s => window.gameData?.skills?.find(sk => sk.id === s.skillID)?.name)
                .filter(Boolean);

            const totalKills = Object.values(stats.enemyKills || {}).reduce((a, b) => a + b, 0);
            const totalChallenges = Object.keys(stats.challengeCompletions || {}).length;
            const topSkillId = Object.entries(stats.skillUsage || {}).sort((a,b) => b[1]-a[1])[0]?.[0];
            const topSkillName = topSkillId && window.gameData?.skills?.find(s => s.id === topSkillId)?.name || topSkillId;
            const topKillEntry = Object.entries(stats.enemyKills || {}).sort((a,b) => b[1]-a[1])[0];

            card.innerHTML = `
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px;">
                    <span class="card-title" style="margin:0;">${escapeHtml(char.characterName)}</span>
                    ${roleLabel ? `<span class="role-badge role-badge--sm">${roleLabel}</span>` : ''}
                </div>
                <div class="card-subtitle" style="margin-bottom:0.3rem;">Lv.${char.level} ${escapeHtml(char.race)}${charClass ? ' · ' + charClass : ''}</div>
                ${activeSkillNames.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:0.35rem;">${activeSkillNames.map(n => `<span class="skill-tag">${n}</span>`).join('')}</div>` : ''}

                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:0.35rem;">
                    <div class="companion-stat-cell">
                        <div class="companion-stat-cell__label">Combats</div>
                        <div class="companion-stat-cell__value">${stats.totalCombats || 0}</div>
                    </div>
                    <div class="companion-stat-cell">
                        <div class="companion-stat-cell__label">Wins</div>
                        <div class="companion-stat-cell__value color-green">${stats.wins || 0}</div>
                    </div>
                    <div class="companion-stat-cell">
                        <div class="companion-stat-cell__label">Win Rate</div>
                        <div class="companion-stat-cell__value color-gold">${stats.winRate ? (parseFloat(stats.winRate)*100).toFixed(0)+'%' : '—'}</div>
                    </div>
                    <div class="companion-stat-cell">
                        <div class="companion-stat-cell__label">Kills</div>
                        <div class="companion-stat-cell__value color-red-soft">${totalKills}</div>
                    </div>
                    <div class="companion-stat-cell">
                        <div class="companion-stat-cell__label">Crits</div>
                        <div class="companion-stat-cell__value color-red">${stats.totalCriticalHits || 0}</div>
                    </div>
                    <div class="companion-stat-cell">
                        <div class="companion-stat-cell__label">Challenges</div>
                        <div class="companion-stat-cell__value color-blue">${totalChallenges}</div>
                    </div>
                </div>

                ${topSkillName || topKillEntry ? `
                <div style="font-size:0.7rem;color:#666;margin-bottom:0.3rem;">
                    ${topSkillName ? `Sig: <span style="color:#d4af37;">${topSkillName}</span>` : ''}
                    ${topKillEntry ? ` · <span class="color-red-soft">${topKillEntry[0].replace(/_/g,' ')} ×${topKillEntry[1]}</span>` : ''}
                </div>` : ''}

                <div style="color:#8b7355;font-size:0.68rem;margin-bottom:0.4rem;">${char.importCount || 0} imports</div>
                <button class="secondary btn-full" ${disabled ? 'disabled' : ''}>${disabledLabel || 'Add to Party'}</button>
            `;

            container.appendChild(card);
        });

        // Pagination controls
        const { totalPages, total } = pagination;
        if (totalPages > 1) {
            const nav = document.createElement('div');
            nav.className = 'browse-pagination';
            nav.innerHTML = `
                <button onclick="loadPublicCompanions(${page - 1})" ${page <= 1 ? 'disabled' : ''} class="secondary btn-compact">← Prev</button>
                <span class="browse-pagination__info">Page ${page} of ${totalPages} <span class="browse-pagination__total">(${total} total)</span></span>
                <button onclick="loadPublicCompanions(${page + 1})" ${page >= totalPages ? 'disabled' : ''} class="secondary btn-compact">Next →</button>
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


// ---------------------------------------------------------------------------
// Procedural bot generator
// Fills window.gameData.bots above the static cap (level 12) up to MAX_BOT_LEVEL.
// Called lazily from renderBotsSelection — runs once per session, then no-ops.
// ---------------------------------------------------------------------------

const MAX_BOT_LEVEL = 100;
const BOT_STATIC_CAP = 12; // highest level in bots.json
let _botsGenerated = false;
const _botSessionSeed = Date.now() & 0xffffffff;

// Deterministic "random" from a seed so the same level always yields the same bot.
function _botRng(seed) {
    let s = seed;
    return function() {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0xffffffff;
    };
}

function _generateBots() {
    if (_botsGenerated || !window.gameData || !window.gameData.bots) return;
    _botsGenerated = true;

    const skills  = window.gameData.skills  || [];
    const gear    = window.gameData.gear    || [];
    const races   = window.gameData.races   || [];

    // Role definitions -------------------------------------------------------

    // Skill pools are tiered by combo-tree depth.
    // Depth thresholds: d1-2 from level 1, d3 from level 20, d4 from level 40, d5+ never for bots.
    // Each role has { primary: [...tiers], secondary: [...tiers] }
    // where tiers = [ {minLevel, skills[]}, ... ] sorted ascending.
    // pickSkill() walks tiers in reverse to use the deepest available pool.
    const ROLES = [
        {
            role: 'Defender',
            armorTypes: { chest: ['plate', 'chain'], head: ['plate', 'chain'], accessory: ['ring', 'belt', 'amulet'] },
            race: 'dwarf',
            weaponTypes: ['hammer', 'mace'],
            statWeights: { conviction: 0.22, endurance: 0.33, ambition: 0.18, harmony: 0.27 },
            skillPools: {
                primary: [
                    { minLevel:  1, skills: ['block', 'footwork', 'misdirect', 'shove'] },
                    { minLevel: 13, skills: ['stone_skin', 'fortify', 'provoke'] },
                    { minLevel: 20, skills: ['arcane_barrier', 'faith_armor', 'crystal_skin', 'ice_block', 'fire_wall', 'goad', 'jeer', 'dispel', 'stone_ward'] },
                    { minLevel: 40, skills: ['shadow_tendril', 'primal_crush', 'spell_reflection', 'sacred_roots', 'divine_barrier', 'bark_carapace', 'sanctuary', 'frozen_cry', 'holy_roots', 'incite', 'intimidate'] },
                ],
                secondary: [
                    { minLevel:  1, skills: ['shove', 'misdirect', 'block', 'footwork'] },
                    { minLevel: 13, skills: ['stone_skin', 'fortify', 'provoke'] },
                    { minLevel: 20, skills: ['goad', 'jeer', 'dispel', 'nature_wrap', 'entangle', 'mana_shield'] },
                    { minLevel: 40, skills: ['incite', 'intimidate', 'shadow_tendril', 'judgment_field', 'ward_break'] },
                ],
            },
        },
        {
            role: 'Bruiser',
            armorTypes: { chest: ['plate', 'leather', 'chain'], head: ['plate', 'chain'], accessory: ['ring', 'belt', 'gloves'] },
            race: 'orc',
            weaponTypes: ['axe', 'sword', 'hammer'],
            statWeights: { conviction: 0.38, endurance: 0.30, ambition: 0.22, harmony: 0.10 },
            skillPools: {
                primary: [
                    { minLevel:  1, skills: ['basic_attack', 'aim', 'shout', 'buff_strength'] },
                    { minLevel: 13, skills: ['strong_attack', 'lunge', 'slash', 'pummel', 'pierce', 'frenzy', 'warcry'] },
                    { minLevel: 20, skills: ['singe', 'frostbite', 'blood_letting', 'flaming_edge', 'shocking_blow', 'counter_strike', 'riposte', 'stone_fist', 'runic_smash'] },
                    { minLevel: 40, skills: ['shadow_strike', 'inferno_slice', 'glacial_javelin', 'divine_judgment', 'shield_bash', 'silent_death', 'shadow_wound', 'corrosive_wound'] },
                ],
                secondary: [
                    { minLevel:  1, skills: ['shout', 'focus', 'buff_strength', 'buff_all_stats'] },
                    { minLevel: 13, skills: ['warcry', 'vitality_boost', 'berserker_stance', 'blood_rage'] },
                    { minLevel: 20, skills: ['vitality_surge', 'assassinate', 'echoing_prayer'] },
                    { minLevel: 40, skills: ['blood_fury', 'mental_fortitude', 'terror_cry'] },
                ],
            },
        },
        {
            role: 'Assassin',
            armorTypes: { chest: ['leather'], head: ['leather'], accessory: ['cloak', 'gloves', 'boots'] },
            race: 'halfling',
            weaponTypes: ['dagger', 'handaxe'],
            statWeights: { conviction: 0.25, endurance: 0.18, ambition: 0.45, harmony: 0.12 },
            skillPools: {
                primary: [
                    { minLevel:  1, skills: ['aim', 'basic_attack', 'footwork', 'misdirect'] },
                    { minLevel: 13, skills: ['weak_point', 'skirmish', 'lunge', 'slash', 'stalk', 'shadow_step', 'call_target'] },
                    { minLevel: 20, skills: ['singe', 'frostbite', 'blood_letting', 'venomous_slash', 'counter_strike', 'riposte', 'assassinate', 'phantom_lunge', 'wind_cut'] },
                    { minLevel: 40, skills: ['shadow_strike', 'silent_death', 'shadow_wound', 'shadow_riposte', 'arcane_dash'] },
                ],
                secondary: [
                    { minLevel:  1, skills: ['footwork', 'misdirect', 'aim'] },
                    { minLevel: 13, skills: ['stalk', 'shadow_step', 'call_target', 'weak_point'] },
                    { minLevel: 20, skills: ['assassinate', 'counter_strike', 'poison_lunge', 'nature_pierce'] },
                    { minLevel: 40, skills: ['shadow_riposte', 'silent_death', 'arcane_dash', 'penitent_strike'] },
                ],
            },
        },
        {
            role: 'Mage',
            armorTypes: { chest: ['robe', 'vestments', 'cloth'], head: ['cloth', 'diadem'], accessory: ['amulet', 'ring'] },
            race: 'human',
            weaponTypes: ['wand', 'tome'],
            statWeights: { conviction: 0.30, endurance: 0.12, ambition: 0.22, harmony: 0.36 },
            skillPools: {
                primary: [
                    { minLevel:  1, skills: ['channel', 'skill_fireball', 'skill_lightning'] },
                    { minLevel: 13, skills: ['shock', 'produce_flame', 'chill', 'arcane_bolt'] },
                    { minLevel: 20, skills: ['thunderclap', 'frost_slide', 'scorched_shot', 'sleet', 'shadow_bolt', 'mind_spike', 'burning_aura', 'frost_nova', 'lightning_chain', 'fireball'] },
                    { minLevel: 40, skills: ['storm_hammer', 'plague_carrier', 'ring_of_fire', 'blizzard', 'earthquake', 'chain_lightning', 'meteor', 'entropic_decay'] },
                ],
                secondary: [
                    { minLevel:  1, skills: ['focus', 'attunement', 'buff_all_stats'] },
                    { minLevel: 13, skills: ['shock', 'chill', 'arcane_bolt', 'vitality_boost'] },
                    { minLevel: 20, skills: ['thunderclap', 'frost_slide', 'vitality_surge', 'echoing_prayer'] },
                    { minLevel: 40, skills: ['blood_fury', 'mental_fortitude', 'entropic_decay', 'water_bolt'] },
                ],
            },
        },
        {
            role: 'Support',
            armorTypes: { chest: ['vestments', 'tabard', 'robe'], head: ['diadem', 'cloth'], accessory: ['amulet', 'ring'] },
            race: 'human',
            weaponTypes: ['scepter'],
            statWeights: { conviction: 0.15, endurance: 0.22, ambition: 0.18, harmony: 0.45 },
            skillPools: {
                primary: [
                    { minLevel:  1, skills: ['first_aid', 'heal_major', 'restore_mana_minor', 'restore_stam_minor'] },
                    { minLevel: 13, skills: ['mend', 'holy_light', 'nature_touch', 'focused_rest', 'iron_will', 'second_wind'] },
                    { minLevel: 20, skills: ['healing_light', 'regrowth', 'holy_word', 'sacred_grove', 'life_link', 'atonement'] },
                    { minLevel: 40, skills: ['mass_heal', 'forest_embrace', 'rooted_healing', 'martyrdom', 'thorned_regeneration', 'retaliatory_heal', 'persistent_life', 'caustic_mend'] },
                ],
                secondary: [
                    { minLevel:  1, skills: ['shout', 'buff_all_stats', 'focus', 'restore_mana_minor'] },
                    { minLevel: 13, skills: ['focused_rest', 'iron_will', 'warcry', 'vitality_boost'] },
                    { minLevel: 20, skills: ['vitality_surge', 'echoing_prayer', 'mana_cycle'] },
                    { minLevel: 40, skills: ['blood_fury', 'mental_fortitude', 'resurrection_rite'] },
                ],
            },
        },
        {
            role: 'Utility',
            armorTypes: { chest: ['leather', 'cloth'], head: ['leather', 'mask'], accessory: ['cloak', 'boots', 'belt'] },
            race: 'dwarf',
            weaponTypes: ['totem', 'bell', 'flute'],
            statWeights: { conviction: 0.20, endurance: 0.28, ambition: 0.22, harmony: 0.30 },
            skillPools: {
                primary: [
                    { minLevel:  1, skills: ['rest', 'attunement', 'sense', 'restore_stam_minor', 'restore_mana_minor'] },
                    { minLevel: 13, skills: ['focused_rest', 'iron_will', 'stalk', 'call_target', 'shadow_step', 'silent_prayer'] },
                    { minLevel: 20, skills: ['shadow_misdirection', 'stalking_shadow', 'vitality_surge', 'echoing_prayer'] },
                    { minLevel: 40, skills: ['shadow_veil', 'blood_fury', 'mental_fortitude'] },
                ],
                secondary: [
                    { minLevel:  1, skills: ['buff_speed', 'buff_defense', 'buff_all_stats', 'shout', 'focus'] },
                    { minLevel: 13, skills: ['warcry', 'vitality_boost', 'call_target', 'iron_will'] },
                    { minLevel: 20, skills: ['vitality_surge', 'shadow_misdirection', 'mana_cycle'] },
                    { minLevel: 40, skills: ['mental_fortitude', 'shadow_veil', 'terror_cry'] },
                ],
            },
        },
    ];

    const NAMES = {
        Defender: ['Aldric','Brynn','Oswin','Gareth','Mira','Holt','Edda','Vera','Torvin','Bran'],
        Bruiser:  ['Fen','Grolt','Serak','Durn','Krag','Ulf','Barta','Norg','Threx','Vok'],
        Assassin: ['Pip','Nyx','Varyn','Sable','Rhen','Cass','Dusk','Lira','Siv','Zynn'],
        Mage:     ['Wren','Vesper','Calder','Lyss','Mael','Cinder','Tova','Oran','Brix','Fael'],
        Support:  ['Edda','Thessa','Linna','Sera','Clem','Auri','Mira','Bel','Tahl','Wyn'],
        Utility:  ['Cobb','Darro','Fynn','Seld','Mott','Bwick','Arlo','Nessa','Pip','Harn'],
    };

    const validSkillIds = new Set(
        skills.filter(s => s.isStarterSkill || s.isChildSkill).map(s => s.id)
    );

    // pool is a tiered array: [{minLevel, skills[]}, ...]
    // Returns a skill from the deepest tier the bot qualifies for, excluding .
    function pickSkill(tieredPool, botLevel, rng, exclude) {
        const eligible = tieredPool
            .filter(tier => botLevel >= tier.minLevel)
            .flatMap(tier => tier.skills)
            .filter(id => validSkillIds.has(id) && id !== exclude);
        if (!eligible.length) return null;
        return eligible[Math.floor(rng() * eligible.length)];
    }

    // Pick a tier-appropriate item for a given slot and optional type preference list.
    // Tries exact tier first, then tier-1, then any available tier for that slot/type.
    function pickGear(slot, preferredTypes, tier, rng) {
        const isAccessory = slot === 'accessory1';
        const matchSlot = i => isAccessory
            ? (i.slot_id1 === 'accessory1' || i.slot_id1 === 'accessory2')
            : i.slot_id1 === slot;
        const matchType = i => !preferredTypes || !preferredTypes.length || preferredTypes.includes(i.type);
        const notCreature = i => !i.creatureOnly && (i.tier || 0) >= 0;

        for (const t of [tier, tier - 1]) {
            if (t < 0) continue;
            const pool = gear.filter(i => matchSlot(i) && notCreature(i) && matchType(i) && i.tier === t);
            if (pool.length) return pool[Math.floor(rng() * pool.length)].id;
        }
        const fallback = gear.filter(i => matchSlot(i) && notCreature(i) && matchType(i));
        if (fallback.length) return fallback[Math.floor(rng() * fallback.length)].id;
        const any = gear.filter(i => matchSlot(i) && notCreature(i));
        return any.length ? any[Math.floor(rng() * any.length)].id : null;
    }

    function getIntrinsicSkill(raceName) {
        const race = races.find(r => r.id === raceName);
        if (!race) return null;
        const intrinsics = race.intrinsicSkills || [];
        return intrinsics[0] || null;
    }

    const generated = [];

    for (let level = BOT_STATIC_CAP + 1; level <= MAX_BOT_LEVEL; level++) {
        // 1-3 bots per level, role mix varies
        const rng = _botRng(level * 7919 ^ _botSessionSeed);
        const botsThisLevel = 1 + Math.floor(rng() * 3); // 1, 2, or 3
        const usedRoles = new Set();

        for (let i = 0; i < botsThisLevel; i++) {
            const rng2 = _botRng(level * 7919 + i * 131 ^ _botSessionSeed);

            // Pick a role not already used at this level
            const available = ROLES.filter(r => !usedRoles.has(r.role));
            if (!available.length) break;
            const roleDef = available[Math.floor(rng2() * available.length)];
            usedRoles.add(roleDef.role);

            // Stats — calibrated to sit ~15% below a well-geared player at the same level.
            // Player stats come entirely from equipment; a full kit at tier T averages ~8*T stats
            // per slot across 5 slots, plus race base ~330. Bots get a flat base plus a small
            // per-level increment that tracks equipment growth without matching it.
            // budget = 280 + 8 * (level - 1)  → ~360 at lvl 1, ~552 at lvl 25, ~920 at lvl 82
            const budget = 260 + 6 * (level - 1);
            const rng3 = _botRng(level * 2053 + i * 97 ^ _botSessionSeed);
            const jitter = () => Math.floor((rng3() - 0.5) * 20); // ±10
            const raw = {
                conviction: Math.round(budget * roleDef.statWeights.conviction) + jitter(),
                endurance:  Math.round(budget * roleDef.statWeights.endurance)  + jitter(),
                ambition:   Math.round(budget * roleDef.statWeights.ambition)   + jitter(),
                harmony:    Math.round(budget * roleDef.statWeights.harmony)    + jitter(),
            };
            // Clamp negatives, re-normalise to exact budget
            Object.keys(raw).forEach(k => { if (raw[k] < 10) raw[k] = 10; });
            const actual = Object.values(raw).reduce((a, b) => a + b, 0);
            const diff = budget - actual;
            raw.endurance += diff; // absorb rounding error into endurance

            // Skills
            const rng4 = _botRng(level * 1301 + i * 61 ^ _botSessionSeed);
            const skillLevel = Math.min(10, Math.floor(level / 10) + 1);
            const s1id = pickSkill(roleDef.skillPools.primary, level, rng4, null);
            const rng5 = _botRng(level * 1301 + i * 61 + 1 ^ _botSessionSeed);
            const s2id = pickSkill(roleDef.skillPools.secondary, level, rng5, s1id);

            const intrinsicId = getIntrinsicSkill(roleDef.race);
            const botSkills = [];
            if (intrinsicId) {
                botSkills.push({ skillID: intrinsicId, learned: true, intrinsic: true, skillXP: 0, skillLevel: 1, usageCount: 0 });
            }
            if (s1id) botSkills.push({ skillID: s1id, learned: true, skillXP: skillLevel * 80, skillLevel, usageCount: skillLevel * 5 });
            if (s2id) botSkills.push({ skillID: s2id, learned: true, skillXP: skillLevel * 60, skillLevel, usageCount: skillLevel * 4 });

            // Equipment — tier 0–8 over levels 1–100, each tier spans ~12 levels
            const tier = Math.min(8, Math.floor((level - 1) / 12));
            const rng6  = _botRng(level * 541  + i * 43  ^ _botSessionSeed);
            const rng7  = _botRng(level * 613  + i * 53  ^ _botSessionSeed);
            const rng8  = _botRng(level * 719  + i * 67  ^ _botSessionSeed);
            const rng9  = _botRng(level * 827  + i * 79  ^ _botSessionSeed);
            const at = roleDef.armorTypes;
            const weaponId    = pickGear('mainHand',   roleDef.weaponTypes, tier, rng6);
            const chestId     = pickGear('chest',      at.chest,            tier, rng7);
            const headId      = pickGear('head',       at.head,             tier, rng8);
            const accessoryId = pickGear('accessory1', at.accessory,        tier, rng9);

            // Name — deterministic per role+level
            const namePool = NAMES[roleDef.role];
            const name = namePool[(level + i) % namePool.length];

            generated.push({
                characterID: `bot_gen_${roleDef.role.toLowerCase()}_${level}_${i}`,
                characterName: name,
                role: roleDef.role,
                level,
                race: roleDef.race,
                stats: raw,
                skills: botSkills,
                equipment: {
                    ...(weaponId    ? { mainHand:    weaponId    } : {}),
                    ...(chestId     ? { chest:       chestId     } : {}),
                    ...(headId      ? { head:        headId      } : {}),
                    ...(accessoryId ? { accessory1:  accessoryId } : {}),
                },
                consumables: {},
            });
        }
    }

    window.gameData.bots = window.gameData.bots.concat(generated);
    console.log(`[bots] Generated ${generated.length} procedural bots (levels ${BOT_STATIC_CAP + 1}–${MAX_BOT_LEVEL})`);
}

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

    // Generate procedural bots above the static cap if not yet done
    _generateBots();

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
                ${bot.role ? `<span class="bot-role-badge" style="color:${roleColor}; border:1px solid ${roleColor}44;">${bot.role}</span>` : ''}
            </div>
            ${botActiveSkills.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">${botActiveSkills.map(n => `<span class="skill-tag">${n}</span>`).join('')}</div>` : ''}
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
