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
            const skills    = JSON.parse(fs.readFileSync(path.join(dataDir, 'skills.json'),      'utf8'));
            const enemyTypes = JSON.parse(fs.readFileSync(path.join(dataDir, 'enemy-types.json'), 'utf8'));
            const races     = JSON.parse(fs.readFileSync(path.join(dataDir, 'races.json'),        'utf8'));
            const gear      = JSON.parse(fs.readFileSync(path.join(dataDir, 'items.json'),        'utf8'));
            const statuses  = JSON.parse(fs.readFileSync(path.join(dataDir, 'statuses.json'),     'utf8'));

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

        // 4. Update combat stats for all participants
        if (result.result !== 'retreated' && result.participants?.playerCharacters) {
            for (const participant of result.participants.playerCharacters) {
                const importRef = await new Promise((resolve, reject) => {
                    rawDb.get(
                        `SELECT * FROM character_imports WHERE import_id = ?`,
                        [participant.characterID],
                        (err, row) => { if (err) reject(err); else resolve(row); }
                    );
                });

                const targetId = importRef ? importRef.original_character_id : participant.characterID;

                // Update import usage count if applicable
                if (importRef) {
                    await new Promise((resolve, reject) => {
                        rawDb.run(
                            `UPDATE character_imports SET times_used = times_used + 1, last_used_at = CURRENT_TIMESTAMP WHERE import_id = ?`,
                            [participant.characterID],
                            (err) => { if (err) reject(err); else resolve(); }
                        );
                    });
                    console.log(`[COMBAT] Import used, updating original: ${targetId}`);
                }

                const character = await db.getCharacter(targetId);
                if (character) {
                    combatEngine.updateCombatStats(character, result, challenge);
                    await db.saveCharacter(character);
                    console.log(`[STATS] Updated combat stats for ${character.name}`);
                } else {
                    console.warn(`[STATS] Character ${targetId} not found, skipping stats update.`);
                }
            }
        }

        // 5. Persist combat log
        if (result.shouldPersist && result.result !== 'retreated') {
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

module.exports = router;
