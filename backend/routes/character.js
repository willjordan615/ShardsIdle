const express = require('express');
const router = express.Router();
const db = require('../database');

/**
 * GET /api/characters
 * Get all characters for the user
 */
router.get('/', async (req, res) => {
    try {
        const characters = await db.getAllCharacters();
        res.json({ success: true, characters });
    } catch (error) {
        console.error('Error fetching characters:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/characters/:characterId
 * Get a specific character
 */
router.get('/:characterId', async (req, res) => {
    try {
        const character = await db.getCharacter(req.params.characterId);
        if (!character) {
            return res.status(404).json({ success: false, error: 'Character not found' });
        }
        res.json({ success: true, character });
    } catch (error) {
        console.error('Error fetching character:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/characters
 * Create a new character
 */
router.post('/', async (req, res) => {
    try {
        const character = req.body;
        
        // Validation
        if (!character.id || !character.name || !character.race) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: id, name, race' 
            });
        }
        
        if (!character.stats || typeof character.stats !== 'object') {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid stats object' 
            });
        }
        
        // Ensure default values
        character.level = character.level || 1;
        character.experience = character.experience || 0;
        character.equipment = character.equipment || {};
        character.skills = character.skills || [];
        character.consumables = character.consumables || {};
        character.inventory = character.inventory || [];
        
        // Save to database
        await db.saveCharacter(character);
        
        res.json({ 
            success: true, 
            message: 'Character created',
            character 
        });
    } catch (error) {
        console.error('Error creating character:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/characters/:characterId
 * Update a character
 */
router.put('/:characterId', async (req, res) => {
    try {
        const character = req.body;
        
        // Verify character exists and belongs to user
        const existing = await db.getCharacter(req.params.characterId);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Character not found' });
        }
        
        // Ensure ID matches
        character.id = req.params.characterId;
        
        // Save to database
        await db.saveCharacter(character);
        
        res.json({ 
            success: true, 
            message: 'Character updated',
            character 
        });
    } catch (error) {
        console.error('Error updating character:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PATCH /api/characters/:characterId/aiProfile
 * Update a character's AI profile without full save
 */
router.patch('/:characterId/aiProfile', async (req, res) => {
    try {
        const { aiProfile } = req.body;
        const valid = ['balanced','aggressive','cautious','support','disruptor','opportunist'];
        if (!valid.includes(aiProfile)) {
            return res.status(400).json({ success: false, error: `Invalid aiProfile. Must be one of: ${valid.join(', ')}` });
        }
        const character = await db.getCharacter(req.params.characterId);
        if (!character) {
            return res.status(404).json({ success: false, error: 'Character not found' });
        }
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
 * Delete a character
 */
router.delete('/:characterId', async (req, res) => {
    try {
        // Verify character exists
        const existing = await db.getCharacter(req.params.characterId);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Character not found' });
        }
        
        // Delete from database
        await db.deleteCharacter(req.params.characterId);
        
        res.json({ 
            success: true, 
            message: 'Character deleted'
        });
    } catch (error) {
        console.error('Error deleting character:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;