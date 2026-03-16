const express = require('express');
const router = express.Router();
const CombatEngine = require('../combatEngine');
const StatusEngine = require('../StatusEngine');
const db = require('../database');
const fs = require('fs');
const path = require('path');

let combatEngine;
let gameData;

function initializeCombatEngine() {
    if (!combatEngine) {
        try {
            const dataDir = path.join(__dirname, '../data');
            const skillsPath = path.join(dataDir, 'skills.json');
            const enemyTypesPath = path.join(dataDir, 'enemy-types.json');
            const racesPath = path.join(dataDir, 'races.json');
            const gearPath = path.join(dataDir, 'items.json');
            const statusesPath = path.join(dataDir, 'statuses.json');

            const skills = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));
            const enemyTypes = JSON.parse(fs.readFileSync(enemyTypesPath, 'utf8'));
            const races = JSON.parse(fs.readFileSync(racesPath, 'utf8'));
            const gear = JSON.parse(fs.readFileSync(gearPath, 'utf8'));
            const statuses = JSON.parse(fs.readFileSync(statusesPath, 'utf8'));
            
            const statusEngine = new StatusEngine(statuses);
            combatEngine = new CombatEngine(skills, enemyTypes, races, gear, statusEngine);
            gameData = { skills, enemyTypes, races, gear };
            
            console.log('[COMBAT] Combat engine initialized');
        } catch (error) {
            console.error('Failed to initialize combat engine:', error);
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

        // Add this BEFORE the find() call
console.log('[DEBUG] challengeID:', challengeID);
console.log('[DEBUG] challenges array:', JSON.stringify(challenges, null, 2));
console.log('[DEBUG] First challenge ID:', challenges[0]?.id);

        const challenge = challenges.find(c => c.id === challengeID);
        if (!challenge) {
            return res.status(404).json({ error: 'Challenge not found' });
        }

        // Hydrate imported character snapshots before combat.
        // The frontend only stores a minimal reference for imported characters
        // (importId, characterName, level, race) with no stats or skills.
        // We must fetch the original character's full data from the DB here.
        const rawDb = db.getDatabase();
        const hydratedSnapshots = await Promise.all(partySnapshots.map(async (snapshot) => {
            // Imported characters use their importId as characterID and have no stats
            if (snapshot.isImported || !snapshot.stats) {
                // Look up the import record to find the original character
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
                        console.log(`[COMBAT] Hydrated imported character "${snapshot.characterName}" from original ${importRec.original_character_id}`);
                        return {
                            ...snapshot,
                            characterID: snapshot.characterID, // keep import ID for stat tracking
                            stats: originalChar.stats,
                            skills: originalChar.skills,
                            equipment: originalChar.equipment,
                            consumables: originalChar.consumables || [],
                            level: originalChar.level,
                        };
                    }
                }

                // Import record not found — warn and let combatEngine defaults handle it
                console.warn(`[COMBAT] Could not hydrate imported character "${snapshot.characterName}" (ID: ${snapshot.characterID}) — no import record found`);
            }
            return snapshot;
        }));

        const result = combatEngine.runCombat(hydratedSnapshots, challenge);

        // LINKED REFERENCE: Update ORIGINAL character's stats
        if (result.result !== 'retreated' && result.participants?.playerCharacters) {
            const rawDb = db.getDatabase();
            
            for (const participant of result.participants.playerCharacters) {
                const importRef = await new Promise((resolve, reject) => {
                    rawDb.get(
                        `SELECT * FROM character_imports WHERE import_id = ?`,
                        [participant.characterID],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        }
                    );
                });

                let targetCharacterId = participant.characterID;
                
                if (importRef) {
                    targetCharacterId = importRef.original_character_id;
                    
                    await new Promise((resolve, reject) => {
                        rawDb.run(
                            `UPDATE character_imports 
                             SET times_used = times_used + 1, last_used_at = CURRENT_TIMESTAMP 
                             WHERE import_id = ?`,
                            [participant.characterID],
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });
                    
                    console.log(`[COMBAT] Imported character used, updating original: ${targetCharacterId}`);
                }

                const character = await db.getCharacter(targetCharacterId);
                if (character) {
                    combatEngine.updateCombatStats(character, result, challenge);
                    await db.saveCharacter(character);
                    console.log(`[STATS] Updated combat stats for ${character.name}`);
                }
            }
        }

        if (result.shouldPersist && result.result !== 'retreated') {
            await db.saveCombatLog({
                id: result.combatID,
                challengeID,
                partyID: partySnapshots.map(s => s.characterID).join(','),
                startTime: Date.now(),
                result: result.result,
                totalTurns: result.totalTurns,
                log: result
            });
        }

        res.json({
            combatID: result.combatID,
            result: result.result,
            totalTurns: result.totalTurns,
            turns: result.turns,
            segments: result.segments,
            participants: result.participants,
            rewards: result.rewards,
            shouldPersist: result.shouldPersist,
            retreated: result.result === 'retreated'
        });
    } catch (error) {
        console.error('[COMBAT] Error:', error);
        res.status(500).json({ error: 'Combat simulation failed', details: error.message });
    }
});

router.get('/:combatID', async (req, res) => {
    try {
        const log = await db.getCombatLog(req.params.combatID);
        if (!log) {
            return res.status(404).json({ error: 'Combat log not found' });
        }
        res.json(log);
    } catch (error) {
        console.error('Error retrieving combat log:', error);
        res.status(500).json({ error: 'Failed to retrieve combat log' });
    }
});

router.get('/history/:characterID', async (req, res) => {
    try {
        const logs = await db.getCombatLogs(req.params.characterID);
        res.json(logs);
    } catch (error) {
        console.error('Error retrieving combat history:', error);
        res.status(500).json({ error: 'Failed to retrieve combat history' });
    }
});

module.exports = router;