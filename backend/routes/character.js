// backend/routes/character.js
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { requireAuth, optionalAuth } = require('./auth');

// ── Input sanitization ────────────────────────────────────────────────────────
function sanitizeText(value, maxLength = 40) {
    if (typeof value !== 'string') return '';
    return value
        .replace(/<[^>]*>/g, '')
        .replace(/[<>"'&]/g, '')
        .replace(/[\x00-\x1F]/g, '')
        .trim()
        .slice(0, maxLength);
}

// ── Ownership check ───────────────────────────────────────────────────────────
function ownsCharacter(character, userId) {
    if (!character.ownerUserId) return false;
    return character.ownerUserId === userId;
}

/**
 * GET /api/characters
 * Returns paginated characters owned by the authenticated user.
 * Query params: page (1-based, default 1), limit (default 6, max 20)
 */
router.get('/', requireAuth, async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 6));
        const offset = (page - 1) * limit;

        const rawDb = db.getDatabase();

        const totalRow = await new Promise((resolve, reject) => {
            rawDb.get(
                `SELECT COUNT(*) as count FROM characters WHERE ownerUserId = ?`,
                [req.userId],
                (err, row) => { if (err) reject(err); else resolve(row); }
            );
        });
        const total = totalRow?.count || 0;

        const rows = await new Promise((resolve, reject) => {
            rawDb.all(
                `SELECT * FROM characters WHERE ownerUserId = ? ORDER BY lastModified DESC LIMIT ? OFFSET ?`,
                [req.userId, limit, offset],
                (err, rows) => { if (err) reject(err); else resolve(rows || []); }
            );
        });

        const parsed = rows.map(row => ({
            id:           row.id,
            name:         row.name,
            race:         row.race,
            level:        row.level,
            experience:   row.experience,
            stats: {
                conviction: row.conviction,
                endurance:  row.endurance,
                ambition:   row.ambition,
                harmony:    row.harmony,
            },
            equipment:        JSON.parse(row.equipment   || '{}'),
            skills:           JSON.parse(row.skills      || '[]'),
            consumables:      JSON.parse(row.consumables || '{}'),
            consumableStash:  JSON.parse(row.consumableStash || '{}'),
            beltOrder:        JSON.parse(row.beltOrder   || '[null,null,null,null]'),
            inventory:        JSON.parse(row.inventory   || '[]'),
            gold:             row.gold       || 0,
            arcaneDust:       row.arcaneDust || 0,
            unlockedCombos:   JSON.parse(row.unlockedCombos || '[]'),
            combatStats:      JSON.parse(row.combatStats || '{}'),
            partyStats:       JSON.parse(row.partyStats  || '{}'),
            ownerUserId:      row.ownerUserId,
            isPublic:         !!row.isPublic,
            shareEnabled:     !!row.shareEnabled,
            shareCode:        row.shareCode        || null,
            buildName:        row.buildName        || null,
            buildDescription: row.buildDescription || null,
            importCount:      row.importCount      || 0,
            lastSharedAt:     row.lastSharedAt,
            avatarId:         row.avatarId,
            avatarColor:      row.avatarColor,
            avatarFrame:      row.avatarFrame,
            title:            row.title,
            createdAt:        row.createdAt,
            lastModified:     row.lastModified,
            lastActiveAt:     row.lastActiveAt,
            lastSuccessfulChallengeId: row.lastSuccessfulChallengeId || null,
            aiProfile:        row.aiProfile || 'balanced',
        }));

        res.json({
            success: true,
            characters: parsed,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            }
        });
    } catch (error) {
        console.error('Error fetching characters:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/characters/:characterId
 * Returns a character only if the requester owns it.
 */
router.get('/:characterId', requireAuth, async (req, res) => {
    try {
        const character = await db.getCharacter(req.params.characterId);
        if (!character) return res.status(404).json({ success: false, error: 'Character not found' });
        if (!ownsCharacter(character, req.userId)) return res.status(403).json({ success: false, error: 'Forbidden' });
        res.json({ success: true, character });
    } catch (error) {
        console.error('Error fetching character:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/characters
 * Create a new character — always owned by the authenticated user.
 */
router.post('/', requireAuth, async (req, res) => {
    try {
        const character = req.body;

        if (!character.id || !character.name || !character.race) {
            return res.status(400).json({ success: false, error: 'Missing required fields: id, name, race' });
        }
        if (!character.stats || typeof character.stats !== 'object') {
            return res.status(400).json({ success: false, error: 'Invalid stats object' });
        }

        character.name = sanitizeText(character.name, 30);
        if (!character.name) return res.status(400).json({ success: false, error: 'Invalid character name' });

        character.ownerUserId = req.userId;
        character.level       = character.level       || 1;
        character.experience  = character.experience  || 0;
        character.equipment   = character.equipment   || {};
        character.skills      = character.skills      || [];
        character.consumables = character.consumables || {};
        character.inventory   = character.inventory   || [];

        await db.saveCharacter(character);
        res.json({ success: true, message: 'Character created', character });
    } catch (error) {
        console.error('Error creating character:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/characters/:characterId
 * Update a character — only the owner may update.
 */
router.put('/:characterId', requireAuth, async (req, res) => {
    try {
        const existing = await db.getCharacter(req.params.characterId);
        if (!existing) return res.status(404).json({ success: false, error: 'Character not found' });
        if (!ownsCharacter(existing, req.userId)) return res.status(403).json({ success: false, error: 'Forbidden' });

        const character      = req.body;
        character.id         = req.params.characterId;
        character.ownerUserId = req.userId;

        if (character.name) {
            character.name = sanitizeText(character.name, 30);
            if (!character.name) return res.status(400).json({ success: false, error: 'Invalid character name' });
        }

        await db.saveCharacter(character);
        res.json({ success: true, message: 'Character updated', character });
    } catch (error) {
        console.error('Error updating character:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PATCH /api/characters/:characterId/aiProfile
 * Update AI profile — only the owner may update.
 */
router.patch('/:characterId/aiProfile', requireAuth, async (req, res) => {
    try {
        const { aiProfile } = req.body;
        const valid = ['balanced','aggressive','cautious','support','disruptor','opportunist'];
        if (!valid.includes(aiProfile)) {
            return res.status(400).json({ success: false, error: `Invalid aiProfile. Must be one of: ${valid.join(', ')}` });
        }
        const character = await db.getCharacter(req.params.characterId);
        if (!character) return res.status(404).json({ success: false, error: 'Character not found' });
        if (!ownsCharacter(character, req.userId)) return res.status(403).json({ success: false, error: 'Forbidden' });
        character.aiProfile = aiProfile;
        await db.saveCharacter(character);
        res.json({ success: true, aiProfile });
    } catch (error) {
        console.error('Error updating aiProfile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/characters/:characterId
 * Delete a character — only the owner may delete.
 */
router.delete('/:characterId', requireAuth, async (req, res) => {
    try {
        const existing = await db.getCharacter(req.params.characterId);
        if (!existing) return res.status(404).json({ success: false, error: 'Character not found' });
        if (!ownsCharacter(existing, req.userId)) return res.status(403).json({ success: false, error: 'Forbidden' });
        await db.deleteCharacter(req.params.characterId);
        res.json({ success: true, message: 'Character deleted' });
    } catch (error) {
        console.error('Error deleting character:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
