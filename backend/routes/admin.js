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
    
    // Load items
    try {
        const itemsPath = path.join(dataPath, 'items.json');
        if (fs.existsSync(itemsPath)) {
            gameData.items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
        }
    } catch (error) {
        console.error('Error loading items:', error);
        gameData.items = [];
    }
}

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
