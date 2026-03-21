// js/browse-system.js
// Browse public characters and import/share system
// NOTE: BACKEND_URL is defined in game-data.js - do not redeclare
 
// Browse pagination state
let _browseAllChars = [];
let _browsePage = 0;
const _BROWSE_PAGE_SIZE = 8;

/**
 * Load and display browse results with pagination
 */
async function loadBrowseCharacters() {
    _browsePage = 0;
    const container = document.getElementById('browseResults');
    const loading = document.getElementById('browseLoading');

    if (container) container.innerHTML = '';
    if (loading) loading.style.display = 'block';

    try {
        const params = new URLSearchParams();
        const level  = document.getElementById('browseLevelFilter')?.value;
        const race   = document.getElementById('browseRaceFilter')?.value;
        const sortBy = document.getElementById('browseSortFilter')?.value;
        const search = document.getElementById('browseSearchFilter')?.value;
        const role   = document.getElementById('browseRoleFilter')?.value;

        if (level)  params.append('level', level);
        if (race)   params.append('race', race);
        if (sortBy) params.append('sortBy', sortBy);
        params.append('limit', '100');

        const response = await authFetch(`${BACKEND_URL}/api/character/browse?${params}`);
        if (!response.ok) throw new Error('Browse failed');
        const data = await response.json();

        if (loading) loading.style.display = 'none';
        if (!container) return;

        let characters = data.characters;

        // Client-side filters
        if (search) {
            const q = search.toLowerCase();
            characters = characters.filter(c =>
                c.characterName.toLowerCase().includes(q)
            );
        }
        if (role) {
            characters = characters.filter(c => c.roleTag === role);
        }

        _browseAllChars = characters;
        _renderBrowsePage();

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

function _renderBrowsePage() {
    const container = document.getElementById('browseResults');
    if (!container) return;

    const total = _browseAllChars.length;
    const start = _browsePage * _BROWSE_PAGE_SIZE;
    const end   = Math.min(start + _BROWSE_PAGE_SIZE, total);
    const page  = _browseAllChars.slice(start, end);

    container.innerHTML = '';

    if (total === 0) {
        container.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:3rem;color:#888;">
                <h3>No Characters Found</h3>
                <p>Try adjusting your filters or be the first to share a character!</p>
            </div>`;
        return;
    }

    page.forEach(char => container.appendChild(createBrowseCard(char)));

    // Pagination controls
    if (total > _BROWSE_PAGE_SIZE) {
        const totalPages = Math.ceil(total / _BROWSE_PAGE_SIZE);
        const nav = document.createElement('div');
        nav.style.cssText = 'grid-column:1/-1;display:flex;justify-content:center;align-items:center;gap:12px;margin-top:1rem;';
        nav.innerHTML = `
            <button onclick="browsePrevPage()" ${_browsePage === 0 ? 'disabled' : ''} class="secondary" style="padding:4px 14px;">← Prev</button>
            <span style="color:#8b7355;font-size:0.85rem;">Page ${_browsePage + 1} of ${totalPages} <span style="color:#555;">(${total} total)</span></span>
            <button onclick="browseNextPage()" ${end >= total ? 'disabled' : ''} class="secondary" style="padding:4px 14px;">Next →</button>
        `;
        container.appendChild(nav);
    }
}

window.browsePrevPage = function() {
    if (_browsePage > 0) { _browsePage--; _renderBrowsePage(); }
};
window.browseNextPage = function() {
    if ((_browsePage + 1) * _BROWSE_PAGE_SIZE < _browseAllChars.length) { _browsePage++; _renderBrowsePage(); }
};


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
                <div style="color:#888;font-size:0.8rem;margin-top:2px;">Lv.${char.level} ${char.race} ${profileEmoji}</div>
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