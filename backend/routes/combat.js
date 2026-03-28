const express = require('express');
const router = express.Router();
const CombatEngine = require('../combatEngine');
const StatusEngine = require('../StatusEngine');
const db = require('../database');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { requireAuth } = require('./auth');

const DEFAULT_SAFE_CHALLENGE = 'challenge_goblin_camp';

// Per-character combat queue — serialises concurrent requests for the same character.
// Each entry is a Promise that resolves when the current combat for that character finishes.
// A second request waits on that promise, then runs its own combat when the lock is free.
const characterLocks = new Map();

/**
 * Acquire a lock for a set of character IDs.
 * Returns a release function — call it in finally to free the lock.
 * If any character is already locked, waits for that combat to finish first.
 */
async function acquireCharacterLocks(characterIds) {
    for (const id of characterIds) {
        const existing = characterLocks.get(id);
        if (existing) {
            console.log(`[COMBAT] Character ${id} busy — queuing request`);
            await existing;
        }
    }
    // Set new locks for all characters simultaneously
    let releaseFn;
    const lockPromise = new Promise(resolve => { releaseFn = resolve; });
    characterIds.forEach(id => characterLocks.set(id, lockPromise));
    return () => {
        characterIds.forEach(id => characterLocks.delete(id));
        releaseFn();
    };
}

let combatEngine;

function initializeCombatEngine() {
    if (!combatEngine) {
        try {
            const dataDir = path.join(__dirname, '../data');
            const skills     = JSON.parse(fs.readFileSync(path.join(dataDir, 'skills.json'),        'utf8'));
            const enemyTypes = JSON.parse(fs.readFileSync(path.join(dataDir, 'enemy-types.json'),  'utf8'));
            const races      = JSON.parse(fs.readFileSync(path.join(dataDir, 'races.json'),         'utf8'));
            const gear       = JSON.parse(fs.readFileSync(path.join(dataDir, 'items.json'),         'utf8'));
            const statuses   = JSON.parse(fs.readFileSync(path.join(dataDir, 'statuses.json'),      'utf8'));
            const lootTags   = JSON.parse(fs.readFileSync(path.join(dataDir, 'loot-tags.json'),     'utf8'));

            const statusEngine = new StatusEngine(statuses);
            combatEngine = new CombatEngine(skills, enemyTypes, races, gear, statusEngine, lootTags);

            // Apply persisted tuning overrides
            try {
                const tuning = JSON.parse(fs.readFileSync(path.join(dataDir, 'tuning.json'), 'utf8'));
                if (tuning.genWeapon) CombatEngine.applyTuning(tuning);
            } catch(e) { console.warn('[COMBAT] No tuning.json or parse error — using defaults.'); }

            console.log('[COMBAT] Combat engine initialized');
        } catch (error) {
            console.error('[COMBAT] Failed to initialize combat engine:', error);
            throw error;
        }
    }
    return combatEngine;
}

router.post('/start', requireAuth, async (req, res) => {
    const userId = req.userId;
    let releaseLocks = null;

    try {
        initializeCombatEngine();

        const { partySnapshots, challengeID, challenges } = req.body;

        if (!partySnapshots || !challengeID || !challenges) {
            return res.status(400).json({
                error: 'Missing required fields: partySnapshots, challengeID, challenges'
            });
        }

        // Acquire per-character locks for all owned (non-imported, non-bot) characters
        const ownedCharacterIds = partySnapshots
            .map(s => s.characterID)
            .filter(id => id && !id.startsWith('import_') && !id.startsWith('bot_'));

        if (ownedCharacterIds.length > 0) {
            releaseLocks = await acquireCharacterLocks(ownedCharacterIds);
            console.log(`[COMBAT] Locks acquired for: ${ownedCharacterIds.join(', ')}`);
        }

        const rawDb = db.getDatabase();

        // Stamp a session ID on each owned character so other devices can detect the takeover
        const combatSessionId = crypto.randomUUID();
        for (const charId of ownedCharacterIds) {
            await new Promise((resolve, reject) => {
                rawDb.run(
                    `UPDATE characters SET combatSessionId = ? WHERE id = ?`,
                    [combatSessionId, charId],
                    (err) => { if (err) reject(err); else resolve(); }
                );
            });
        }
        console.log(`[COMBAT] Session ${combatSessionId} stamped on: ${ownedCharacterIds.join(', ')}`);

        const challenge = challenges.find(c => c.id === challengeID);
        if (!challenge) {
            return res.status(404).json({ error: `Challenge not found: ${challengeID}` });
        }

        // 1. Hydrate imported character snapshots
        // Imported characters carry only minimal data from the frontend.
        // Fetch the original character's full stats/skills/equipment from the DB.
        const hydratedSnapshots = await Promise.all(partySnapshots.map(async (snapshot) => {
            if (snapshot.isImported || !snapshot.stats) {
                const importRec = await new Promise((resolve, reject) => {
                    rawDb.get(
                        `SELECT * FROM character_imports WHERE import_id = ?`,
                        [snapshot.characterID],
                        (err, row) => { if (err) reject(err); else resolve(row); }
                    );
                });

                if (importRec) {
                    const originalChar = await db.getCharacter(importRec.original_character_id);
                    if (originalChar) {
                        console.log(`[COMBAT] Hydrated import "${snapshot.characterName}" from ${importRec.original_character_id}`);
                        return {
                            ...snapshot,
                            stats:       originalChar.stats,
                            skills:      originalChar.skills,
                            equipment:   originalChar.equipment,
                            consumables: originalChar.consumables || [],
                            level:       originalChar.level,
                        };
                    }
                }
                console.warn(`[COMBAT] Could not hydrate import "${snapshot.characterName}" (${snapshot.characterID}) — no import record`);
            }
            return snapshot;
        }));

        // 2. Run simulation
        // Fetch per-character globalDropChance from DB so the engine has reliable state
        // regardless of what the frontend snapshot includes.
        const mainSnapshot = hydratedSnapshots.find(s => !s.isImported);
        if (mainSnapshot) {
            const freshChar = await db.getCharacter(mainSnapshot.characterID);
            if (freshChar) {
                const lastId    = freshChar.lastSuccessfulChallengeId || null;
                const switched  = lastId && challengeID && lastId !== challengeID;
                const storedChance = freshChar.combatStats?.globalDropChance ?? 0.01;
                challenge._globalDropChance            = switched ? 0.01 : storedChance;
                challenge._lastSuccessfulChallengeId   = lastId;
            }
        }
        const result = combatEngine.runCombat(hydratedSnapshots, challenge);

        const isVictory = result.result === 'victory';
        const isDefeat  = result.result === 'defeat' || result.result === 'loss';

        // 3. Safety Net: track last successful challenge per player character
        let nextChallengeId = challengeID;

        const mainParticipant = result.participants?.playerCharacters?.find(p => !p.isImported);
        if (mainParticipant) {
            // Resolve the real character ID (may be an import reference)
            const importRef = await new Promise((resolve, reject) => {
                rawDb.get(
                    `SELECT * FROM character_imports WHERE import_id = ?`,
                    [mainParticipant.characterID],
                    (err, row) => { if (err) reject(err); else resolve(row); }
                );
            });
            const targetId = importRef ? importRef.original_character_id : mainParticipant.characterID;

            if (isVictory) {
                await new Promise((resolve, reject) => {
                    rawDb.run(
                        `UPDATE characters SET lastSuccessfulChallengeId = ?, lastModified = ? WHERE id = ?`,
                        [challengeID, Date.now(), targetId],
                        (err) => { if (err) reject(err); else resolve(); }
                    );
                });
                nextChallengeId = challengeID;
                console.log(`[SAFETY NET] ${targetId} won. Safe zone → ${challengeID}`);

            } else if (isDefeat) {
                const charData = await db.getCharacter(targetId);
                nextChallengeId = charData?.lastSuccessfulChallengeId || DEFAULT_SAFE_CHALLENGE;
                console.log(`[SAFETY NET] ${targetId} lost. Falling back to → ${nextChallengeId}`);
            }
        }

 // 4. Update combat stats AND persist skill progression for all participants
    if (result.participants?.playerCharacters) {
        for (const participant of result.participants.playerCharacters) {
            // Skip imports for DB write (they are handled via original_character_id)
            if (participant.characterID.startsWith('import_')) {
                // Still need to update the import usage count
                await new Promise((resolve, reject) => {
                    rawDb.run(
                        `UPDATE character_imports SET times_used = times_used + 1, last_used_at = CURRENT_TIMESTAMP WHERE import_id = ?`,
                        [participant.characterID],
                        (err) => { if (err) reject(err); else resolve(); }
                    );
                });
                continue; 
            }

            const targetId = participant.characterID;
            const character = await db.getCharacter(targetId);

            if (character) {
                // Check if another device took over this character mid-combat
                const currentSession = await new Promise((resolve, reject) => {
                    rawDb.get(
                        `SELECT combatSessionId FROM characters WHERE id = ?`,
                        [targetId],
                        (err, row) => { if (err) reject(err); else resolve(row?.combatSessionId); }
                    );
                });
                if (currentSession !== combatSessionId) {
                    console.warn(`[COMBAT] Session mismatch for ${targetId} — another device took over. Saving result but marking loop displaced.`);
                    // Still save the result so no data is lost, but flag the response
                    result._loopDisplaced = true;
                }
            // --- PATCH START: SAFE SKILL MERGE LOGIC ---
            
            // 1. Create a map of incoming skills from the engine result for quick lookup
            const incomingSkillsMap = new Map();
            if (participant.skills && Array.isArray(participant.skills)) {
                participant.skills.forEach(skill => {
                    incomingSkillsMap.set(skill.skillID, skill);
                });
            }

            // 2. Prepare the final skills array
            const finalSkills = [];
            const processedSkillIDs = new Set();

            // A. Iterate over EXISTING DB skills (Preserve history & XP for unused skills)
            if (Array.isArray(character.skills)) {
                for (const dbSkill of character.skills) {
                    const incoming = incomingSkillsMap.get(dbSkill.skillID);
                    
                    if (incoming) {
                        // CRITICAL: For discovery-phase skills (level 0), the engine never
                        // awards XP — that is frontend-only. Always keep the DB's skillXP
                        // and skillLevel so the frontend's accumulated progress isn't wiped
                        // on the next combat's backend save.
                        const isDiscoveryPhase = (dbSkill.skillLevel || 0) < 1;
                        if (isDiscoveryPhase) {
                            finalSkills.push({
                                ...incoming,
                                skillXP:    dbSkill.skillXP    ?? incoming.skillXP,
                                skillLevel: dbSkill.skillLevel ?? incoming.skillLevel,
                                // Always preserve intrinsic flag from DB — engine result may not include it
                                ...(dbSkill.intrinsic ? { intrinsic: true } : {})
                            });
                        } else {
                            // Level 1+ skills: engine result is authoritative, but preserve intrinsic flag
                            finalSkills.push({
                                ...dbSkill,
                                ...incoming,
                                ...(dbSkill.intrinsic ? { intrinsic: true } : {})
                            });
                        }
                        processedSkillIDs.add(dbSkill.skillID);
                    } else {
                        // Skill exists in DB but NOT in result — keep exactly as-is (includes intrinsics)
                        finalSkills.push(dbSkill);
                        processedSkillIDs.add(dbSkill.skillID);
                    }
                }
            }

            // B. Add NEW skills discovered this fight (Present in Result, Missing in DB)
            if (participant.skills && Array.isArray(participant.skills)) {
                for (const newSkill of participant.skills) {
                    if (!processedSkillIDs.has(newSkill.skillID)) {
                        // This is a newly discovered child skill
                        console.log(`[SKILL SYNC] ✨ Persisting new discovery: ${newSkill.skillID}`);
                        finalSkills.push(newSkill);
                    }
                }
            }

            // 3. Apply the merged array to the character object
            character.skills = finalSkills;
            // --- PATCH END ---

            // Log only skills that weren't in the DB before this combat (genuinely new this run)
            const existingDBIds = new Set((character.skills || []).map(s => s.skillID));
            const trulyNew = finalSkills.filter(s => s.discovered && (s.skillLevel || 0) < 1 && !existingDBIds.has(s.skillID));
            const inProgress = finalSkills.filter(s => s.discovered && (s.skillLevel || 0) < 1 && existingDBIds.has(s.skillID));

            trulyNew.forEach(s => {
                console.log(`[SKILL SYNC] ✨ ${character.name} discovered: ${s.skillID} (XP:0 — frontend will award discovery XP)`);
            });
            inProgress.forEach(s => {
                console.log(`[SKILL SYNC] 📖 ${character.name} ${s.skillID}: preserving XP:${(s.skillXP||0).toFixed(0)} from DB`);
            });
            console.log(`[SKILL SYNC] ${character.name}: ${finalSkills.length} skills saved (${trulyNew.length} new this combat, ${inProgress.length} in discovery).`);

            // 4. Update aggregate stats (wins, losses, etc.)
            combatEngine.updateCombatStats(character, result, challenge);

            // 4b. Stack consumable loot into consumableStash — done server-side so the
            // per-character lock guarantees no concurrent read-modify-write between devices.
            if (result.rewards?.lootDropped?.length > 0) {
                if (!character.consumableStash) character.consumableStash = {};
                result.rewards.lootDropped.forEach(loot => {
                    if (!loot?.itemID) return;
                    // Only process loot assigned to this character
                    if (loot.characterID && loot.characterID !== targetId) return;
                    const itemDef = combatEngine.gear.find(g => g.id === loot.itemID);
                    const isConsumable = itemDef?.slot_id1 === 'consumable'
                        || itemDef?.slot === 'consumable'
                        || itemDef?.consumable === true;
                    if (isConsumable) {
                        character.consumableStash[loot.itemID] = (character.consumableStash[loot.itemID] || 0) + 1;
                        console.log(`[LOOT] Stacked ${loot.itemID} → stash[${character.consumableStash[loot.itemID]}] for ${character.name}`);
                    }
                });
            }

            // 5. Persist ramping global drop chance into combatStats
            if (result.rewards?.nextGlobalDropChance !== undefined) {
                if (!character.combatStats) character.combatStats = {};
                character.combatStats.globalDropChance = result.rewards.nextGlobalDropChance;
            }

            // 6. SAVE TO DATABASE
            await db.saveCharacter(character);
            console.log(`[DB SAVE] ✅ Successfully saved ${character.name} (Skills Count: ${character.skills.length})`);
        } else {
            console.warn(`[DB SAVE] ⚠️ Character ${targetId} not found. Skipping.`);
        }
        }
    }

        // 5. Persist combat log (all outcomes including retreats)
        if (result.shouldPersist || result.result === 'retreated') {
            await db.saveCombatLog({
                id: result.combatID,
                challengeID,
                partyID:    partySnapshots.map(s => s.characterID).join(','),
                startTime:  Date.now(),
                result:     result.result,
                totalTurns: result.totalTurns,
                log:        result
            });
        }

        // 6. Respond
        res.json({
            combatID:       result.combatID,
            result:         result.result,
            totalTurns:     result.totalTurns,
            turns:          result.turns,
            segments:       result.segments,
            participants:   result.participants,
            rewards:        result.rewards,
            shouldPersist:  result.shouldPersist,
            retreated:      result.result === 'retreated',
            nextChallengeId,
            combatSessionId,
            loopDisplaced:  result._loopDisplaced || false,
        });

    } catch (error) {
        console.error('[COMBAT] Critical error:', error);
        res.status(500).json({ error: 'Combat simulation failed', details: error.message });
    } finally {
        if (releaseLocks) releaseLocks();
    }
});

// ── Escape endpoint ───────────────────────────────────────────────────────────
// Called by the client after a combat result arrives when the player used an
// escape consumable mid-run. Marks the log as escaped, strips rewards past the
// last completed stage, decrements the consumed item, saves the character.
router.post('/escape', requireAuth, async (req, res) => {
    const { combatID, characterID, itemUsed, lastCompletedStageIndex } = req.body;
    if (!combatID || !characterID || !itemUsed) {
        return res.status(400).json({ error: 'combatID, characterID, and itemUsed are required' });
    }

    let releaseLocks;
    try {
        releaseLocks = await acquireCharacterLocks([characterID]);

        // Load combat log
        const logEntry = await db.getCombatLog(combatID);
        if (!logEntry) return res.status(404).json({ error: 'Combat log not found' });

        const combatData = logEntry.log;

        // Mark as escaped
        combatData.result = 'escaped';
        combatData.escapedAtStage = lastCompletedStageIndex ?? null;

        // Strip rewards past the last completed stage.
        // If no stages were completed (smoke bomb unused / teleport mid-stage-0),
        // null out rewards entirely.
        const completedCount = typeof lastCompletedStageIndex === 'number'
            ? lastCompletedStageIndex + 1
            : 0;

        if (completedCount === 0 || !combatData.rewards) {
            combatData.rewards = null;
        }
        // If rewards exist and some stages were won, they already only reflect
        // completed stages via calculateRewards — no further stripping needed.

        // Update the combat log record
        await db.saveCombatLog({
            id: combatID,
            challengeID: logEntry.challengeID,
            partyID: logEntry.partyID,
            startTime: logEntry.startTime,
            result: 'escaped',
            totalTurns: logEntry.totalTurns,
            log: combatData,
        });

        // Decrement the item from the character's belt
        const character = await db.getCharacter(characterID);
        if (!character) return res.status(404).json({ error: 'Character not found' });

        const consumables = character.consumables || {};
        if (consumables[itemUsed] && consumables[itemUsed] > 0) {
            consumables[itemUsed]--;
            if (consumables[itemUsed] <= 0) delete consumables[itemUsed];
            character.consumables = consumables;
            await db.saveCharacter(character);
            console.log(`[ESCAPE] ${character.name} used ${itemUsed} — ${consumables[itemUsed] ?? 0} remaining`);
        } else {
            console.warn(`[ESCAPE] ${character.name} escape item ${itemUsed} not found in belt — no decrement`);
        }

        res.json({ success: true, result: 'escaped' });

    } catch (err) {
        console.error('[ESCAPE] Error:', err);
        res.status(500).json({ error: 'Escape processing failed', details: err.message });
    } finally {
        if (releaseLocks) releaseLocks();
    }
});

router.get('/:combatID', async (req, res) => {
    try {
        const log = await db.getCombatLog(req.params.combatID);
        if (!log) return res.status(404).json({ error: 'Combat log not found' });
        res.json(log);
    } catch (error) {
        console.error('[COMBAT] Error retrieving log:', error);
        res.status(500).json({ error: 'Failed to retrieve combat log' });
    }
});

router.get('/history/:characterID', async (req, res) => {
    try {
        const logs = await db.getCombatLogs(req.params.characterID);
        res.json(logs);
    } catch (error) {
        console.error('[COMBAT] Error retrieving history:', error);
        res.status(500).json({ error: 'Failed to retrieve combat history' });
    }
});

// Lightweight summary — strips full log payload, returns only display fields
router.get('/history/:characterID/summary', async (req, res) => {
    try {
        const logs = await db.getCombatLogs(req.params.characterID);
        const summary = logs.map(l => ({
            id:          l.id,
            challengeID: l.challengeID,
            result:      l.result,
            totalTurns:  l.totalTurns,
            createdAt:   l.createdAt,
            // Pull stage summaries from the log without sending full turn data
            stages: (l.log?.segments || []).map(s => ({
                title:       s.title,
                status:      s.status,
                summaryText: s.summaryText
            }))
        }));
        res.json(summary);
    } catch (error) {
        console.error('[COMBAT] Error retrieving history summary:', error);
        res.status(500).json({ error: 'Failed to retrieve combat history' });
    }
});

// Manual prune endpoint — useful during testing to clear log buildup
router.post('/admin/prune-logs', async (req, res) => {
    try {
        await db.pruneCombatLogs();
        res.json({ success: true, message: 'Combat logs pruned' });
    } catch (error) {
        console.error('[COMBAT] Prune error:', error);
        res.status(500).json({ error: 'Failed to prune combat logs' });
    }
});

// Allow admin saves to invalidate the singleton so next combat re-reads fresh JSON data.
function resetCombatEngine() {
    combatEngine = null;
    console.log('[COMBAT] Engine cache invalidated — will reinitialize on next combat.');
}

module.exports = router;
module.exports.resetCombatEngine = resetCombatEngine;
