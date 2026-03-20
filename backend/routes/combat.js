const express = require('express');
const router = express.Router();
const CombatEngine = require('../combatEngine');
const StatusEngine = require('../StatusEngine');
const db = require('../database');
const fs = require('fs');
const path = require('path');

const DEFAULT_SAFE_CHALLENGE = 'challenge_goblin_camp';

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

            const statusEngine = new StatusEngine(statuses);
            combatEngine = new CombatEngine(skills, enemyTypes, races, gear, statusEngine);

            console.log('[COMBAT] Combat engine initialized');
        } catch (error) {
            console.error('[COMBAT] Failed to initialize combat engine:', error);
            throw error;
        }
    }
    return combatEngine;
}

router.post('/start', async (req, res) => {
    try {
        initializeCombatEngine();

        const { partySnapshots, challengeID, challenges } = req.body;

        if (!partySnapshots || !challengeID || !challenges) {
            return res.status(400).json({
                error: 'Missing required fields: partySnapshots, challengeID, challenges'
            });
        }

        const challenge = challenges.find(c => c.id === challengeID);
        if (!challenge) {
            return res.status(404).json({ error: `Challenge not found: ${challengeID}` });
        }

        const rawDb = db.getDatabase();

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

            // 5. SAVE TO DATABASE
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
            combatID:      result.combatID,
            result:        result.result,
            totalTurns:    result.totalTurns,
            turns:         result.turns,
            segments:      result.segments,
            participants:  result.participants,
            rewards:       result.rewards,
            shouldPersist: result.shouldPersist,
            retreated:     result.result === 'retreated',
            nextChallengeId
        });

    } catch (error) {
        console.error('[COMBAT] Critical error:', error);
        res.status(500).json({ error: 'Combat simulation failed', details: error.message });
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
