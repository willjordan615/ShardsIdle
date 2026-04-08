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
                            // Level 1+ skills: engine result is authoritative for most fields,
                            // but the DB may have a higher skillLevel than the engine snapshot
                            // if the frontend awarded discovery XP that crossed 0→1 last combat.
                            // Always take the max to prevent regressing a leveled skill back to 0.
                            finalSkills.push({
                                ...dbSkill,
                                ...incoming,
                                skillLevel: Math.max(dbSkill.skillLevel || 0, incoming.skillLevel || 0),
                                skillXP:    (dbSkill.skillLevel || 0) > (incoming.skillLevel || 0)
                                                ? dbSkill.skillXP  // DB is ahead — preserve its XP too
                                                : incoming.skillXP,
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
                    const isQuestItem  = itemDef?.slot_id1 === 'consumable' && !itemDef?.type;
                    if (isConsumable) {
                        if (isQuestItem) {
                            // Quest items: player may only hold one; silently skip duplicates
                            if (!character.consumableStash[loot.itemID]) {
                                character.consumableStash[loot.itemID] = 1;
                                console.log(`[LOOT] Quest item ${loot.itemID} added to stash for ${character.name}`);
                            }
                        } else {
                            character.consumableStash[loot.itemID] = (character.consumableStash[loot.itemID] || 0) + 1;
                            console.log(`[LOOT] Stacked ${loot.itemID} → stash[${character.consumableStash[loot.itemID]}] for ${character.name}`);
                        }
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

// ── Offline idle endpoints ────────────────────────────────────────────────────

// POST /idle/start — persist idle session when the loop activates
router.post('/idle/start', requireAuth, async (req, res) => {
    const { characterId, challengeId, partyIds, generatedBotSnapshots, combatDurationMs } = req.body;
    if (!characterId || !challengeId || !Array.isArray(partyIds)) {
        return res.status(400).json({ error: 'characterId, challengeId, and partyIds are required' });
    }
    try {
        await db.setIdleSession(characterId, challengeId, partyIds, generatedBotSnapshots || [], combatDurationMs || null);
        res.json({ ok: true });
    } catch (err) {
        console.error('[IDLE] Failed to set idle session:', err);
        res.status(500).json({ error: 'Failed to save idle session' });
    }
});

// POST /idle/stop — clear idle session when the loop is cancelled
router.post('/idle/stop', requireAuth, async (req, res) => {
    const { characterId } = req.body;
    if (!characterId) return res.status(400).json({ error: 'characterId is required' });
    try {
        await db.clearIdleSession(characterId);
        res.json({ ok: true });
    } catch (err) {
        console.error('[IDLE] Failed to clear idle session:', err);
        res.status(500).json({ error: 'Failed to clear idle session' });
    }
});

// POST /idle/collect — run all missed combats server-side, apply rewards, return summary
router.post('/idle/collect', requireAuth, async (req, res) => {
    const { characterId } = req.body;
    if (!characterId) return res.status(400).json({ error: 'characterId is required' });

    let releaseLocks;
    try {
        const session = await db.getIdleSession(characterId);
        if (!session) return res.json({ hadSession: false });

        // Always clear the session first — so a crash doesn't trap the player
        await db.clearIdleSession(characterId);

        const { challengeId, partyIds, startedAt, combatDurationMs } = session;
        const elapsedMs   = Date.now() - startedAt;
        const cappedMs    = Math.min(elapsedMs, 24 * 60 * 60 * 1000); // 24hr cap
        const MIN_CYCLE   = 45  * 1000; // 45 second floor
        const cycleMs     = Math.max(MIN_CYCLE, combatDurationMs || MIN_CYCLE);
        const combatCount = Math.max(1, Math.floor(cappedMs / cycleMs));

        const engine = initializeCombatEngine();
        const dataDir    = path.join(__dirname, '../data');
        const challenges = JSON.parse(fs.readFileSync(path.join(dataDir, 'challenges.json'), 'utf8'));
        const challenge = challenges.find(c => c.id === challengeId);
        if (!challenge) return res.status(404).json({ error: `Challenge not found: ${challengeId}` });

        // Load all party members fresh from DB
        const ownedIds = partyIds.filter(id => id && !id.startsWith('import_') && !id.startsWith('bot_'));
        releaseLocks = await acquireCharacterLocks(ownedIds);

        // Build party snapshots from live DB state
        const storedBotSnapshots = session.generatedBotSnapshots || [];
        const partySnapshots = await Promise.all(partyIds.map(async (id) => {
            if (id.startsWith('bot_')) {
                if (id.startsWith('bot_gen_')) {
                    // Generated bots don't exist in bots.json — use the snapshot stored at idle/start
                    const stored = storedBotSnapshots.find(b => b.characterID === id);
                    return stored ? { ...stored, isBot: true } : null;
                }
                const bots = JSON.parse(fs.readFileSync(path.join(dataDir, 'bots.json'), 'utf8'));
                const bot = bots.find(b => b.characterID === id);
                return bot ? { ...bot, characterID: bot.characterID, characterName: bot.name, isBot: true } : null;
            }
            const char = await db.getCharacter(id);
            if (!char) return null;
            return {
                characterID:   char.id,
                characterName: char.name,
                race:          char.race,
                level:         char.level,
                stats:         char.stats,
                skills:        char.skills,
                equipment:     char.equipment,
                consumables:   char.consumables || {},
                aiProfile:     char.aiProfile || 'balanced',
            };
        }));

        const validParty = partySnapshots.filter(Boolean);
        if (!validParty.length) return res.status(400).json({ error: 'No valid party members found' });

        // Seed drop chance from the primary character
        const primaryChar = await db.getCharacter(characterId);
        const lastId      = primaryChar?.lastSuccessfulChallengeId || null;
        const switched    = lastId && challengeId && lastId !== challengeId;
        challenge._globalDropChance = switched ? 0.01 : (primaryChar?.combatStats?.globalDropChance ?? 0.01);
        challenge._lastSuccessfulChallengeId = lastId;

        // ── Run combats ───────────────────────────────────────────────────────
        const summary = {
            hadSession:   true,
            challengeId,
            elapsedMs:    cappedMs,
            combatCount,
            wins:         0,
            losses:       0,
            xpGained:     {},   // characterId → total XP
            skillXP:      {},   // skillID → { name, before, after, level, xpAwarded, leveledUp, discovered }
            newDiscoveries: [], // { skillID, name, description, category } — skills that hit level 1 this session
            lootGained:   [],   // aggregated loot entries
            goldGained:   0,
            dustGained:   0,
        };

        // Track live character state across runs so each combat sees updated skills/stats
        const liveChars = {};
        // Also snapshot starting skill state so we can compute before/after for the summary
        const skillSnapshots = {}; // characterId → { skillID → { xp, level } }
        for (const snap of validParty) {
            if (!snap.characterID.startsWith('bot_') && !snap.characterID.startsWith('import_')) {
                const char = await db.getCharacter(snap.characterID);
                if (char) {
                    liveChars[snap.characterID] = char;
                    skillSnapshots[snap.characterID] = {};
                    (char.skills || []).forEach(s => {
                        skillSnapshots[snap.characterID][s.skillID] = {
                            xp:    s.skillXP    || 0,
                            level: s.skillLevel || 0,
                        };
                    });
                }
            }
        }

        for (let i = 0; i < combatCount; i++) {
            // Refresh party snapshots from live char state for owned members
            const currentParty = validParty.map(snap => {
                const live = liveChars[snap.characterID];
                if (!live) return snap;
                return {
                    ...snap,
                    level:    live.level,
                    skills:   live.skills,
                    equipment: live.equipment,
                    stats:    live.stats,
                };
            });

            const result = engine.runCombat(currentParty, challenge);
            const isVictory = result.result === 'victory';
            const isDefeat  = result.result === 'defeat' || result.result === 'loss';

            if (isVictory) summary.wins++;
            else summary.losses++;

            // Apply rewards to each owned character
            if (result.participants?.playerCharacters) {
                for (const participant of result.participants.playerCharacters) {
                    const pid = participant.characterID;
                    if (pid.startsWith('bot_') || pid.startsWith('import_')) continue;

                    const character = liveChars[pid];
                    if (!character) continue;

                    // XP
                    const xpGained = result.rewards?.experienceGained?.[pid] || 0;
                    if (xpGained > 0) {
                        character.experience = (character.experience || 0) + xpGained;
                        let xpThreshold = getXPToNextLevel(character.level);
                        while (character.experience >= xpThreshold) {
                            character.experience -= xpThreshold;
                            character.level++;
                            xpThreshold = getXPToNextLevel(character.level);
                        }
                        if (pid === characterId) summary.xpGained[pid] = (summary.xpGained[pid] || 0) + xpGained;
                    }

                    // Skill merge (same logic as live combat route)
                    const incomingMap = new Map(
                        (participant.skills || []).map(s => [s.skillID, s])
                    );
                    const finalSkills = [];
                    const seen = new Set();
                    for (const dbSkill of (character.skills || [])) {
                        const incoming = incomingMap.get(dbSkill.skillID);
                        if (incoming) {
                            const isDiscovery = (dbSkill.skillLevel || 0) < 1;
                            finalSkills.push(isDiscovery
                                ? { ...incoming, skillXP: dbSkill.skillXP, skillLevel: dbSkill.skillLevel, ...(dbSkill.intrinsic ? { intrinsic: true } : {}) }
                                : { ...dbSkill, ...incoming, skillLevel: Math.max(dbSkill.skillLevel || 0, incoming.skillLevel || 0), ...(dbSkill.intrinsic ? { intrinsic: true } : {}) }
                            );
                        } else {
                            finalSkills.push(dbSkill);
                        }
                        seen.add(dbSkill.skillID);
                    }
                    for (const s of (participant.skills || [])) {
                        if (!seen.has(s.skillID)) finalSkills.push(s);
                    }
                    character.skills = finalSkills;

                    // Combat stats
                    engine.updateCombatStats(character, result, challenge);

                    // Drop chance ramp
                    if (result.rewards?.nextGlobalDropChance !== undefined) {
                        if (!character.combatStats) character.combatStats = {};
                        character.combatStats.globalDropChance = result.rewards.nextGlobalDropChance;
                        challenge._globalDropChance = result.rewards.nextGlobalDropChance;
                    }

                    // lastSuccessfulChallengeId
                    if (isVictory) character.lastSuccessfulChallengeId = challengeId;
                }
            }

            // Loot — stack consumables, add gear to primary char inventory
            if (result.rewards?.lootDropped?.length > 0) {
                const primary = liveChars[characterId];
                if (primary) {
                    if (!primary.consumableStash) primary.consumableStash = {};
                    if (!primary.inventory)       primary.inventory = [];

                    result.rewards.lootDropped.forEach(loot => {
                        if (!loot?.itemID) return;
                        const itemDef = engine.gear.find(g => g.id === loot.itemID);
                        const isConsumable = itemDef?.slot_id1 === 'consumable'
                            || itemDef?.slot === 'consumable'
                            || itemDef?.consumable === true;

                        const isQuestItem = itemDef?.slot_id1 === 'consumable' && !itemDef?.type;
                        if (isConsumable) {
                            if (isQuestItem) {
                                if (!primary.consumableStash[loot.itemID]) {
                                    primary.consumableStash[loot.itemID] = 1;
                                }
                            } else {
                                primary.consumableStash[loot.itemID] = (primary.consumableStash[loot.itemID] || 0) + 1;
                            }
                        } else if (itemDef?.slot_id1 && ['mainHand','offHand','head','chest','accessory1','accessory2'].includes(itemDef.slot_id1)) {
                            // Check for duplicate before adding gear
                            const equippedIds = Object.values(primary.equipment || {}).filter(Boolean).map(v => typeof v === 'object' ? v.itemID : v);
                            const inInv = (primary.inventory || []).some(i => i?.itemID === loot.itemID);
                            if (equippedIds.includes(loot.itemID) || inInv) {
                                // Auto-sell duplicate
                                const goldVal = loot.itemID ? (itemDef?.goldValue || ((itemDef?.tier || 0) * 8 + 5)) : 5;
                                primary.gold = parseFloat(((primary.gold || 0) + goldVal).toFixed(2));
                                primary.arcaneDust = parseFloat(((primary.arcaneDust || 0) + goldVal * 0.01).toFixed(4));
                                summary.goldGained += goldVal;
                                summary.dustGained += goldVal * 0.01;
                                loot._autosold = true;
                            } else {
                                primary.inventory.push({ itemID: loot.itemID, rarity: loot.rarity || 'common', acquiredAt: Date.now() });
                            }
                        } else {
                            // Quest/misc items
                            primary.inventory.push({ itemID: loot.itemID, rarity: loot.rarity || 'common', acquiredAt: Date.now() });
                        }

                        // Add to summary loot list (aggregate by itemID)
                        const existing = summary.lootGained.find(l => l.itemID === loot.itemID && l.rarity === loot.rarity);
                        if (existing) existing.count++;
                        else summary.lootGained.push({ itemID: loot.itemID, name: itemDef?.name || loot.itemID, rarity: loot.rarity || 'common', count: 1, autosold: !!loot._autosold });
                    });
                }
            }
        } // end combat loop

        // ── Compute skill XP gains for summary display ────────────────────────
        const allSkillDefs = JSON.parse(fs.readFileSync(path.join(dataDir, 'skills.json'), 'utf8'));

        for (const [pid, char] of Object.entries(liveChars)) {
            if (pid !== characterId) continue;
            const startSnap = skillSnapshots[pid] || {};
            for (const skill of (char.skills || [])) {
                const sid   = skill.skillID;
                const snap  = startSnap[sid] || { xp: 0, level: 0 };
                const def   = allSkillDefs.find(s => s.id === sid);
                const name  = def?.name || sid;

                // Only include skills that actually moved
                const xpMoved    = (skill.skillXP || 0) !== snap.xp;
                const levelMoved = (skill.skillLevel || 0) !== snap.level;
                if (!xpMoved && !levelMoved) continue;

                const isDisc     = skill.discovered && snap.level < 1;
                const leveledUp  = (skill.skillLevel || 0) > snap.level;
                const xpAwarded  = Math.max(0,
                    ((skill.skillXP || 0) - snap.xp) +
                    (leveledUp ? _xpThresholdForLevel(snap.level) : 0)
                );

                // Was this skill newly discovered this session?
                const wasKnown = snap.level >= 1 || snap.xp > 0;
                if (leveledUp && snap.level === 0 && !wasKnown) {
                    summary.newDiscoveries.push({
                        skillID:     sid,
                        name,
                        description: def?.description || '',
                        category:    def?.category    || '',
                    });
                }

                summary.skillXP[sid] = {
                    name,
                    before:    snap.xp,
                    after:     skill.skillXP || 0,
                    level:     snap.level,
                    xpAwarded,
                    leveledUp,
                    discovered: !!skill.discovered,
                };
            }
        }

        // Persist all character state
        for (const char of Object.values(liveChars)) {
            await db.saveCharacter(char);
            console.log(`[IDLE] Saved ${char.name} after ${combatCount} offline combats`);
        }

        console.log(`[IDLE] Collect complete: ${combatCount} combats, ${summary.wins}W/${summary.losses}L for ${characterId}`);
        res.json(summary);

    } catch (err) {
        console.error('[IDLE] Collect failed:', err);
        res.status(500).json({ error: 'Offline collect failed: ' + err.message });
    } finally {
        if (releaseLocks) releaseLocks();
    }
});

// ── XP helpers (mirror client-side formulas) ──────────────────────────────────
function getXPToNextLevel(level) {
    return Math.max(1, Math.floor(7300 * Math.pow(1.15, (level || 1) - 1)));
}
function _xpThresholdForLevel(level) {
    // Skill level-up threshold: level 0→1 costs 120 XP, level N→N+1 costs 100*N*1.2
    return level < 1 ? 120 : Math.round(100 * level * 1.2);
}

// Allow admin saves to invalidate the singleton so next combat re-reads fresh JSON data.
function resetCombatEngine() {
    combatEngine = null;
    console.log('[COMBAT] Engine cache invalidated — will reinitialize on next combat.');
}

module.exports = router;
module.exports.resetCombatEngine = resetCombatEngine;
