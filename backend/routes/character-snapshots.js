// backend/routes/character-snapshots.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const crypto = require('crypto');

/**
 * Generate a readable share code from character name
 * e.g., "Deadeye" → "DEADEYE-X7K9"
 */
function generateShareCode(characterName) {
    const prefix = characterName.substring(0, 8).toUpperCase().replace(/[^A-Z]/g, '');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${random}`;
}

/**
 * POST /api/character/export
 * Export a character to the sharing system (only owners can export)
 */
router.post('/export', async (req, res) => {
    try {
        const { characterId, isPublic, buildName, buildDescription } = req.body;

        // Validate required fields
        if (!characterId) {
            return res.status(400).json({ error: 'characterId is required' });
        }

        // ===== CHECK 1: Is this an imported reference? (BEFORE character lookup) =====
        const importRef = await db.getImportByCharacterId(characterId);
        if (importRef) {
            return res.status(403).json({ 
                error: 'Cannot export imported characters. Only the original owner can export.' 
            });
        }
        // ==============================================================================

        // Get character from database
        const character = await db.getCharacter(characterId);
        if (!character) {
            return res.status(404).json({ error: 'Character not found' });
        }

        // Generate unique share code
        const shareCode = generateShareCode(character.name);

        // Get ownerUserId (will be null until auth is implemented)
        const ownerUserId = character.ownerUserId || null;

        // Get raw database instance for direct SQL queries
        const rawDb = db.getDatabase();

        // Prepare snapshot data
        const snapshot = {
            snapshot_id: crypto.randomUUID(),
            character_id: characterId,
            owner_user_id: ownerUserId,
            share_code: shareCode,
            character_name: character.name,
            level: character.level,
            race: character.race,
            stats: JSON.stringify(character.stats),
            skills: JSON.stringify(character.skills),
            equipment: JSON.stringify(character.equipment),
            combat_stats: JSON.stringify(character.combatStats || {}),
            party_stats: JSON.stringify(character.partyStats || {}),
            avatar_id: character.avatarId || null,
            avatar_color: character.avatarColor || null,
            avatar_frame: character.avatarFrame || null,
            title: character.title || null,
            build_name: buildName || null,
            build_description: buildDescription || null,
            is_public: isPublic ? 1 : 0,
            import_count: 0,
            last_shared_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        // Insert snapshot into database
        await new Promise((resolve, reject) => {
            rawDb.run(`
                INSERT INTO character_snapshots 
                (snapshot_id, character_id, owner_user_id, share_code, character_name, level, race, 
                 stats, skills, equipment, combat_stats, party_stats,
                 avatar_id, avatar_color, avatar_frame, title,
                 build_name, build_description, is_public, import_count, 
                 created_at, updated_at, last_shared_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                snapshot.snapshot_id,
                snapshot.character_id,
                snapshot.owner_user_id,
                snapshot.share_code,
                snapshot.character_name,
                snapshot.level,
                snapshot.race,
                snapshot.stats,
                snapshot.skills,
                snapshot.equipment,
                snapshot.combat_stats,
                snapshot.party_stats,
                snapshot.avatar_id,
                snapshot.avatar_color,
                snapshot.avatar_frame,
                snapshot.title,
                snapshot.build_name,
                snapshot.build_description,
                snapshot.is_public,
                snapshot.import_count,
                snapshot.created_at,
                snapshot.updated_at,
                snapshot.last_shared_at
            ], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Update character with sharing metadata
        await db.saveCharacter(character);

        console.log(`[EXPORT] Character ${character.name} exported with code ${shareCode}`);

        res.json({
            shareCode,
            message: 'Character exported successfully',
            isPublic,
            characterName: character.name,
            level: character.level
        });
    } catch (error) {
        console.error('[EXPORT] Error:', error);
        res.status(500).json({ error: 'Failed to export character', details: error.message });
    }
});

/**
 * GET /api/character/import/:shareCode
 * Import a shared character (creates a REFERENCE, not a copy)
 */
router.get('/import/:shareCode', async (req, res) => {
    try {
        const { shareCode } = req.params;
        const rawDb = db.getDatabase();

        // Find public snapshot
        const snapshot = await new Promise((resolve, reject) => {
            rawDb.get(
                `SELECT * FROM character_snapshots WHERE share_code = ? AND is_public = 1`,
                [shareCode],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!snapshot) {
            return res.status(404).json({
                error: 'Character not found or not public'
            });
        }

        // Create import reference (NOT a copy)
        const importId = 'import_' + Date.now();
        await new Promise((resolve, reject) => {
            rawDb.run(
                `INSERT INTO character_imports 
                 (import_id, original_character_id, importing_user_id, times_used)
                 VALUES (?, ?, ?, 0)`,
                [importId, snapshot.character_id, null],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Increment import count on ORIGINAL snapshot
        await new Promise((resolve, reject) => {
            rawDb.run(
                `UPDATE character_snapshots SET import_count = import_count + 1 WHERE share_code = ?`,
                [shareCode],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Get the original character's full data
        const originalCharacter = await db.getCharacter(snapshot.character_id);

        // Return reference info (NOT a copy)
        res.json({
            importReference: {
                importId: importId,
                originalCharacterId: snapshot.character_id,
                originalCharacterName: snapshot.character_name,
                ownerUserId: snapshot.owner_user_id,
                level: snapshot.level,
                race: snapshot.race,
                // Include full data so party formation shows correct HP preview.
                // Backend combat.js re-hydrates from DB before simulation.
                stats:       originalCharacter?.stats        || JSON.parse(snapshot.stats      || '{}'),
                skills:      originalCharacter?.skills       || JSON.parse(snapshot.skills     || '[]'),
                equipment:   originalCharacter?.equipment    || JSON.parse(snapshot.equipment  || '{}'),
                consumables: originalCharacter?.consumables  || {},
                shareCode: shareCode,
                importedAt: new Date().toISOString(),
                canReExport: false,
                isLinkedReference: true
            },
            originalStats: {
                wins: JSON.parse(snapshot.combat_stats).wins,
                totalDamageDealt: JSON.parse(snapshot.combat_stats).totalDamageDealt,
                enemyKills: JSON.parse(snapshot.combat_stats).enemyKills,
                challengeCompletions: JSON.parse(snapshot.combat_stats).challengeCompletions,
                importCount: snapshot.import_count + 1,
                ownerUserId: snapshot.owner_user_id
            }
        });
    } catch (error) {
        console.error('[IMPORT] Error:', error);
        res.status(500).json({ error: 'Failed to import character', details: error.message });
    }
});

/**
 * GET /api/character/browse
 * Browse public characters with filters
 */
router.get('/browse', async (req, res) => {
    try {
        const { level, race, sortBy, orderBy, limit } = req.query;
        const rawDb = db.getDatabase();
        
        let query = `
        SELECT 
        cs.*,
        c.combatStats as live_combat_stats,
        c.partyStats as live_party_stats
        FROM character_snapshots cs
        INNER JOIN characters c ON cs.character_id = c.id
        WHERE cs.is_public = 1
`;
        const params = [];

        if (level) {
            query += ` AND level >= ?`;
            params.push(parseInt(level));
        }

        if (race) {
            query += ` AND race = ?`;
            params.push(race);
        }

        // ORDER BY is independent of the race filter — was incorrectly chained as else-if
        if (sortBy === 'combats') {
            query += ` ORDER BY json_extract(combat_stats, '$.totalCombats') DESC`;
        } else if (sortBy === 'kills') {
            query += ` ORDER BY json_extract(combat_stats, '$.enemyKills') DESC`;
        } else if (sortBy === 'completions') {
            query += ` ORDER BY json_extract(combat_stats, '$.challengeCompletions') DESC`;
        } else if (sortBy === 'winrate') {
            query += ` ORDER BY json_extract(combat_stats, '$.winRate') DESC`;
        } else if (sortBy === 'crits') {
            query += ` ORDER BY json_extract(combat_stats, '$.totalCriticalHits') DESC`;
        } else {
            query += ` ORDER BY import_count DESC`;
        }

        const resultLimit = Math.min(parseInt(limit) || 50, 100);
        query += ` LIMIT ?`;
        params.push(resultLimit);

        const snapshots = await new Promise((resolve, reject) => {
    rawDb.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

// ===== NEW: Post-process to merge live stats =====
const characters = await Promise.all(snapshots.map(async (s) => {
    // Try to fetch live character data
    let liveCombatStats = {};
    try {
        const liveChar = await db.getCharacter(s.character_id);
        if (liveChar?.combatStats) {
            liveCombatStats = liveChar.combatStats;
        }
    } catch (e) {
        // Fallback to snapshot stats if live fetch fails
        console.log(`[BROWSE] Using snapshot stats for ${s.character_name}:`, e.message);
    }
    
    return {
        shareCode: s.share_code,
        originalCharacterId: s.character_id,  // needed for self-import prevention
        characterName: s.character_name,
        level: s.level,
        race: s.race,
        // Use LIVE stats if available, otherwise snapshot
        combatStats: liveCombatStats,
        partyStats: JSON.parse(s.party_stats || '{}'),
        buildName: s.build_name,
        buildDescription: s.build_description,
        importCount: s.import_count,
        ownerUserId: s.owner_user_id,
        avatarId: s.avatar_id,
        title: s.title,
        lastActiveAt: s.last_active_at
    };
}));
// ===============================================

res.json({
    characters: characters,  // ← Use the post-processed array
    total: snapshots.length,
    filters: { level, race, sortBy, orderBy }
});

    } catch (error) {
        console.error('[BROWSE] Error:', error);
        res.status(500).json({ error: 'Failed to browse characters', details: error.message });
    }
});

module.exports = router;