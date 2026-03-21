// js/browse-system.js
// Browse public characters and import/share system
// NOTE: BACKEND_URL is defined in game-data.js - do not redeclare
 
/**
 * Load and display browse results
 */
async function loadBrowseCharacters() {
    const container = document.getElementById('browseResults');
    const loading = document.getElementById('browseLoading');
    
    if (container) container.innerHTML = '';
    if (loading) loading.style.display = 'block';
    
    try {
        // Build query params
        const params = new URLSearchParams();
        
        const level = document.getElementById('browseLevelFilter')?.value;
        const race = document.getElementById('browseRaceFilter')?.value;
        const sortBy = document.getElementById('browseSortFilter')?.value;
        const search = document.getElementById('browseSearchFilter')?.value;
        
        if (level) params.append('level', level);
        if (race) params.append('race', race);
        if (sortBy) params.append('sortBy', sortBy);
        params.append('limit', '50');
        
        const response = await fetch(`${BACKEND_URL}/api/character/browse?${params}`);
        
        if (!response.ok) throw new Error('Browse failed');
        
        const data = await response.json();
        
        if (loading) loading.style.display = 'none';
        
        if (!container) return;
        
        if (data.characters.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #888;">
                    <h3>No Characters Found</h3>
                    <p>Try adjusting your filters or be the first to share a character!</p>
                </div>
            `;
            return;
        }
        
        // Filter by search term client-side
        let characters = data.characters;
        if (search) {
            const searchLower = search.toLowerCase();
            characters = characters.filter(c => 
                c.characterName.toLowerCase().includes(searchLower) ||
                c.buildName?.toLowerCase().includes(searchLower)
            );
        }
        
        // Render character cards
        characters.forEach(char => {
            const card = createBrowseCard(char);
            container.appendChild(card);
        });
        
    } catch (error) {
        console.error('Browse error:', error);
        if (loading) loading.style.display = 'none';
        if (container) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #ff6b6b;">
                    <h3>Error Loading Characters</h3>
                    <p>${error.message}</p>
                    <button onclick="loadBrowseCharacters()" class="btn-secondary" style="margin-top: 1rem;">Retry</button>
                </div>
            `;
        }
    }
}
 
/**
 * Create a browse result card
 */
function createBrowseCard(char) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'padding: 1.5rem; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border: 1px solid #333; border-radius: 12px;';
    
    const stats = char.combatStats || {};
    const totalKills = Object.values(stats.enemyKills || {}).reduce((a, b) => a + b, 0);

    const profileLabels = {
        balanced:    '⚖️ Balanced',
        aggressive:  '⚔️ Aggressive',
        cautious:    '🛡️ Cautious',
        support:     '💚 Support',
        disruptor:   '🌀 Disruptor',
        opportunist: '🗡️ Opportunist'
    };
    const profileBadge = profileLabels[char.aiProfile] || '⚖️ Balanced';

    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
            <div>
                <h3 style="margin: 0; color: #4eff7f;">${char.characterName}</h3>
                <p style="margin: 0.25rem 0 0; color: #888;">Level ${char.level} ${char.race}</p>
                <span style="display:inline-block; margin-top: 0.4rem; font-size: 0.8rem; color: #aaa; background: rgba(255,255,255,0.07); border-radius: 4px; padding: 2px 8px;">${profileBadge}</span>
            </div>
            <div style="text-align: right;">
                <div style="color: #888; font-size: 0.85rem;">Share Code</div>
                <code style="color: #4eff7f; font-size: 1.1rem; letter-spacing: 1px;">${char.shareCode}</code>
            </div>
        </div>
        
        ${char.buildName ? `
            <div style="margin-bottom: 1rem; padding: 0.5rem; background: rgba(78, 255, 127, 0.1); border-radius: 6px;">
                <strong style="color: #d4af37;">Build:</strong> ${char.buildName}
            </div>
        ` : ''}
        
        ${char.buildDescription ? `
            <p style="color: #aaa; font-size: 0.9rem; margin-bottom: 1rem; font-style: italic;">
                "${char.buildDescription}"
            </p>
        ` : ''}
        
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-bottom: 1rem;">
            <div style="padding: 0.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 6px;">
                <div style="color: #888; font-size: 0.75rem;">Combats</div>
                <div style="color: #fff; font-weight: bold;">${stats.totalCombats || 0}</div>
            </div>
            <div style="padding: 0.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 6px;">
                <div style="color: #888; font-size: 0.75rem;">Wins</div>
                <div style="color: #4eff7f; font-weight: bold;">${stats.wins || 0}</div>
            </div>
            <div style="padding: 0.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 6px;">
                <div style="color: #888; font-size: 0.75rem;">Win Rate</div>
                <div style="color: #ffd700; font-weight: bold;">${stats.winRate || '0.000'}</div>
            </div>
            <div style="padding: 0.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 6px;">
                <div style="color: #888; font-size: 0.75rem;">Imports</div>
                <div style="color: #ff6b6b; font-weight: bold;">${char.importCount || 0}</div>
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-bottom: 1rem;">
            <div style="padding: 0.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 6px;">
                <div style="color: #888; font-size: 0.75rem;">Damage Dealt</div>
                <div style="color: #ff6b6b; font-weight: bold;">${formatNumber(stats.totalDamageDealt || 0)}</div>
            </div>
            <div style="padding: 0.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 6px;">
                <div style="color: #888; font-size: 0.75rem;">Damage Taken</div>
                <div style="color: #ff6b6b; font-weight: bold;">${formatNumber(stats.totalDamageTaken || 0)}</div>
            </div>
        </div>
        
        ${totalKills > 0 ? `
            <div style="margin-bottom: 1rem; padding: 0.5rem; background: rgba(255, 107, 107, 0.1); border-radius: 6px;">
                <div style="color: #888; font-size: 0.75rem;">Total Enemy Kills</div>
                <div style="color: #ff6b6b; font-weight: bold;">${totalKills}</div>
            </div>
        ` : ''}
        
        <button onclick="importCharacter('${char.shareCode}')" class="btn-primary" style="width: 100%;">
            Import to Party
        </button>
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
 * Open share modal for current character — reflects current sharing state
 */
async function openShareModal(characterId) {
    if (!characterId) { showError('No character selected'); return; }

    const modal = document.getElementById('shareModal');
    if (modal) modal.dataset.characterId = characterId;

    const character = await getCharacter(characterId);
    if (!character) { showError('Character not found'); return; }

    const isEnabled   = !!character.shareEnabled;
    const hasCode     = !!character.shareCode;

    // Elements
    const toggleSection  = document.getElementById('shareToggleSection');
    const setupSection   = document.getElementById('shareSetupSection');
    const activeSection  = document.getElementById('shareActiveSection');
    const toggleBtn      = document.getElementById('shareToggleBtn');
    const codeValue      = document.getElementById('shareCodeValue');
    const codeLevel      = document.getElementById('shareCodeLevel');

    // Show active state if sharing is on
    if (toggleSection)  toggleSection.style.display  = 'block';
    if (isEnabled && hasCode) {
        if (setupSection)   setupSection.style.display   = 'none';
        if (activeSection)  activeSection.style.display  = 'block';
        if (codeValue)      codeValue.textContent        = character.shareCode;
        if (codeLevel)      codeLevel.textContent        = `Level ${character.level} ${character.name} — auto-syncing after each combat`;
        if (toggleBtn) { toggleBtn.textContent = 'Disable Sharing'; toggleBtn.dataset.action = 'disable'; }
    } else {
        if (setupSection)   setupSection.style.display   = 'block';
        if (activeSection)  activeSection.style.display  = 'none';
        const buildNameInput = document.getElementById('shareBuildName');
        const buildDescInput = document.getElementById('shareBuildDescription');
        if (buildNameInput) buildNameInput.value = character.buildName || '';
        if (buildDescInput) buildDescInput.value = character.buildDescription || '';
        if (toggleBtn) { toggleBtn.textContent = 'Enable Sharing'; toggleBtn.dataset.action = 'enable'; }
    }

    showModal('shareModal');
}

/**
 * Handle the share toggle button — enable or disable sharing
 */
async function handleShareToggle() {
    const modal       = document.getElementById('shareModal');
    const characterId = modal?.dataset.characterId;
    const btn         = document.getElementById('shareToggleBtn');
    if (!characterId || !btn) return;

    const action = btn.dataset.action;

    if (action === 'enable') {
        const buildName        = document.getElementById('shareBuildName')?.value || '';
        const buildDescription = document.getElementById('shareBuildDescription')?.value || '';
        btn.disabled = true;
        btn.textContent = 'Enabling...';
        try {
            const res = await authFetch(`${BACKEND_URL}/api/character/export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ characterId, isPublic: true, buildName, buildDescription, enableSharing: true })
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Export failed');
            const data = await res.json();

            // Persist shareEnabled + shareCode on the character locally
            const character = await getCharacter(characterId);
            if (character) {
                character.shareEnabled     = true;
                character.shareCode        = data.shareCode;
                character.buildName        = buildName;
                character.buildDescription = buildDescription;
                await saveCharacterToServer(character);
            }

            // Update modal to active state
            const codeValue = document.getElementById('shareCodeValue');
            const codeLevel = document.getElementById('shareCodeLevel');
            if (codeValue) codeValue.textContent = data.shareCode;
            if (codeLevel) codeLevel.textContent = `Level ${data.level} ${data.characterName} — auto-syncing after each combat`;
            document.getElementById('shareSetupSection').style.display  = 'none';
            document.getElementById('shareActiveSection').style.display = 'block';
            btn.textContent      = 'Disable Sharing';
            btn.dataset.action   = 'disable';
            btn.disabled         = false;
            showSuccess('Sharing enabled! Your character will update automatically after each combat.');
        } catch (e) {
            showError('Failed to enable sharing: ' + e.message);
            btn.disabled = false;
            btn.textContent = 'Enable Sharing';
        }

    } else {
        // Disable — flip is_public to 0 on the snapshot, clear flag on character
        btn.disabled = true;
        btn.textContent = 'Disabling...';
        try {
            await authFetch(`${BACKEND_URL}/api/character/export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ characterId, isPublic: false, buildName: '', buildDescription: '', enableSharing: false })
            });
            const character = await getCharacter(characterId);
            if (character) {
                character.shareEnabled = false;
                await saveCharacterToServer(character);
            }
            document.getElementById('shareSetupSection').style.display  = 'block';
            document.getElementById('shareActiveSection').style.display = 'none';
            btn.textContent    = 'Enable Sharing';
            btn.dataset.action = 'enable';
            btn.disabled       = false;
            showSuccess('Sharing disabled. Your character is no longer visible in the browse list.');
        } catch (e) {
            showError('Failed to disable sharing: ' + e.message);
            btn.disabled = false;
            btn.textContent = 'Disable Sharing';
        }
    }
}
 
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