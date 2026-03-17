// backend/routes/admin.js
// Admin endpoints for in-game editing

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Load game data
let gameData = {};

function loadGameData() {
    const dataPath = path.join(__dirname, '../data');
    
    try {
        const itemsPath = path.join(dataPath, 'items.json');
        if (fs.existsSync(itemsPath)) {
            gameData.items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
        }
    } catch (error) {
        console.error('Error loading items:', error);
        gameData.items = [];
    }

    try {
        const skillsPath = path.join(dataPath, 'skills.json');
        if (fs.existsSync(skillsPath)) {
            gameData.skills = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));
        }
    } catch (error) {
        console.error('Error loading skills:', error);
        gameData.skills = [];
    }

    try {
        const consumablesPath = path.join(dataPath, 'consumables.json');
        if (fs.existsSync(consumablesPath)) {
            gameData.consumables = JSON.parse(fs.readFileSync(consumablesPath, 'utf8'));
        }
    } catch (error) {
        console.error('Error loading consumables:', error);
        gameData.consumables = [];
    }
}

// ─── SKILLS ENDPOINTS ────────────────────────────────────────────────────────

router.get('/data/skills', (req, res) => {
    if (!gameData.skills) loadGameData();
    res.json(gameData.skills || []);
});

router.post('/data/skills', (req, res) => {
    if (!gameData.skills) loadGameData();
    const incoming = req.body;
    if (!Array.isArray(incoming)) return res.status(400).json({ error: 'Expected array of skills' });
    gameData.skills = incoming;
    const filePath = path.join(__dirname, '../data/skills.json');
    try {
        fs.writeFileSync(filePath, JSON.stringify(gameData.skills, null, 2));
        console.log('[ADMIN] Skills saved');
        res.json({ success: true, count: gameData.skills.length });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save skills', details: error.message });
    }
});

// ─── CONSUMABLES ENDPOINTS ───────────────────────────────────────────────────

router.get('/data/consumables', (req, res) => {
    if (!gameData.consumables) loadGameData();
    res.json(gameData.consumables || []);
});

router.post('/data/consumables', (req, res) => {
    if (!gameData.consumables) loadGameData();
    const incoming = req.body;
    if (!Array.isArray(incoming)) return res.status(400).json({ error: 'Expected array of consumables' });
    gameData.consumables = incoming;
    const filePath = path.join(__dirname, '../data/consumables.json');
    try {
        fs.writeFileSync(filePath, JSON.stringify(gameData.consumables, null, 2));
        console.log('[ADMIN] Consumables saved');
        res.json({ success: true, count: gameData.consumables.length });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save consumables', details: error.message });
    }
});

/**
 * GET /api/admin/items
 * Get all items (for admin panel)
 */
router.get('/items', (req, res) => {
    if (!gameData.items) {
        loadGameData();
    }
    res.json({ items: gameData.items });
});

/**
 * GET /api/admin/items/:id
 * Get a single item by ID
 */
router.get('/items/:id', (req, res) => {
    if (!gameData.items) {
        loadGameData();
    }
    
    const item = gameData.items.find(i => i.id === req.params.id);
    if (!item) {
        return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({ item });
});

/**
 * PUT /api/admin/items/:id
 * Update an item
 */
router.put('/items/:id', (req, res) => {
    if (!gameData.items) {
        loadGameData();
    }
    
    const itemIndex = gameData.items.findIndex(i => i.id === req.params.id);
    if (itemIndex === -1) {
        return res.status(404).json({ error: 'Item not found' });
    }
    
    // Update the item in memory
    gameData.items[itemIndex] = { ...gameData.items[itemIndex], ...req.body };
    
    // Save to file
    const itemsPath = path.join(__dirname, '../data/items.json');
    try {
        fs.writeFileSync(itemsPath, JSON.stringify(gameData.items, null, 2));
        console.log(`[ADMIN] Updated item: ${req.params.id}`);
        res.json({ 
            success: true, 
            message: 'Item updated',
            item: gameData.items[itemIndex]
        });
    } catch (error) {
        console.error('Error saving items:', error);
        res.status(500).json({ 
            error: 'Failed to save item',
            details: error.message
        });
    }
});

/**
 * POST /api/admin/items
 * Create a new item
 */
router.post('/items', (req, res) => {
    if (!gameData.items) {
        loadGameData();
    }
    
    const newItem = req.body;
    
    // Validate required fields
    if (!newItem.id || !newItem.name) {
        return res.status(400).json({ error: 'Item must have id and name' });
    }
    
    // Check for duplicates
    if (gameData.items.some(i => i.id === newItem.id)) {
        return res.status(400).json({ error: 'Item with this ID already exists' });
    }
    
    // Add to items array
    gameData.items.push(newItem);
    
    // Save to file
    const itemsPath = path.join(__dirname, '../data/items.json');
    try {
        fs.writeFileSync(itemsPath, JSON.stringify(gameData.items, null, 2));
        console.log(`[ADMIN] Created new item: ${newItem.id}`);
        res.json({ 
            success: true, 
            message: 'Item created',
            item: newItem
        });
    } catch (error) {
        console.error('Error saving items:', error);
        res.status(500).json({ 
            error: 'Failed to create item',
            details: error.message
        });
    }
});

/**
 * DELETE /api/admin/items/:id
 * Delete an item
 */
router.delete('/items/:id', (req, res) => {
    if (!gameData.items) {
        loadGameData();
    }
    
    const itemIndex = gameData.items.findIndex(i => i.id === req.params.id);
    if (itemIndex === -1) {
        return res.status(404).json({ error: 'Item not found' });
    }
    
    const deletedItem = gameData.items[itemIndex];
    gameData.items.splice(itemIndex, 1);
    
    // Save to file
    const itemsPath = path.join(__dirname, '../data/items.json');
    try {
        fs.writeFileSync(itemsPath, JSON.stringify(gameData.items, null, 2));
        console.log(`[ADMIN] Deleted item: ${req.params.id}`);
        res.json({ 
            success: true, 
            message: 'Item deleted',
            item: deletedItem
        });
    } catch (error) {
        console.error('Error saving items:', error);
        res.status(500).json({ 
            error: 'Failed to delete item',
            details: error.message
        });
    }
});

module.exports = router;
module.exports.loadGameData = loadGameData;
