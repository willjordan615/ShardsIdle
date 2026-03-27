// backend/routes/admin.js
// Admin endpoints for in-game editing

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Lazy reference to combat engine invalidation — avoids a circular require at module load.
// items.json changes affect weapon variance profiles cached in the engine singleton.
function invalidateCombatEngine() {
    try {
        const combatRoutes = require('./combat');
        if (typeof combatRoutes.resetCombatEngine === 'function') {
            combatRoutes.resetCombatEngine();
        }
    } catch (e) {
        console.warn('[ADMIN] Could not reset combat engine cache:', e.message);
    }
}

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
        invalidateCombatEngine();
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
        invalidateCombatEngine();
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
        invalidateCombatEngine();
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

// ── DB Admin Routes ───────────────────────────────────────────────────────────
// These require the live database — load it lazily via db module
function getDB() {
    return require('../database').getDatabase();
}

// GET /api/admin/db/characters — list all characters
router.get('/db/characters', (req, res) => {
    const db = getDB();
    db.all(`SELECT id, name, race, level, experience FROM characters ORDER BY level DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// GET /api/admin/db/characters/:id — get full character data
router.get('/db/characters/:id', (req, res) => {
    const db = getDB();
    db.get(`SELECT * FROM characters WHERE id = ?`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Not found' });
        try { row.skills = JSON.parse(row.skills || '[]'); } catch(e) {}
        try { row.equipment = JSON.parse(row.equipment || '{}'); } catch(e) {}
        try { row.stats = JSON.parse(row.stats || '{}'); } catch(e) {}
        res.json(row);
    });
});

// DELETE /api/admin/db/characters/:id — delete a character
router.delete('/db/characters/:id', (req, res) => {
    const db = getDB();
    db.run(`DELETE FROM characters WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, deleted: this.changes });
    });
});

// GET /api/admin/db/snapshots — list all snapshots
router.get('/db/snapshots', (req, res) => {
    const db = getDB();
    db.all(`SELECT snapshot_id, character_name, share_code, level, race, is_public, import_count, created_at
            FROM character_snapshots ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// DELETE /api/admin/db/snapshots/:id — delete a snapshot
router.delete('/db/snapshots/:id', (req, res) => {
    const db = getDB();
    db.run(`DELETE FROM character_snapshots WHERE snapshot_id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, deleted: this.changes });
    });
});

// GET /api/admin/db/combat-logs — list recent combat logs (summary only)
router.get('/db/combat-logs', (req, res) => {
    const db = getDB();
    db.all(`SELECT id, challengeID, partyID, result, totalTurns, createdAt
            FROM combat_logs ORDER BY createdAt DESC LIMIT 100`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// DELETE /api/admin/db/combat-logs — clear all combat logs
router.delete('/db/combat-logs', (req, res) => {
    const db = getDB();
    db.run(`DELETE FROM combat_logs`, [], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, deleted: this.changes });
    });
});

// POST /api/admin/db/query — run a raw SQL query (SELECT only for safety)
router.post('/db/query', (req, res) => {
    const { sql } = req.body;
    if (!sql) return res.status(400).json({ error: 'No SQL provided' });
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('PRAGMA')) {
        return res.status(403).json({ error: 'Only SELECT and PRAGMA queries allowed' });
    }
    const db = getDB();
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ rows: rows || [], count: (rows || []).length });
    });
});


// GET /api/admin/db/users — list all users
router.get('/db/users', async (req, res) => {
    try {
        const db = require('../database');
        const users = await db.getAllUsers();
        res.json(users);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/db/characters/:id/reassign — reassign character to another user
router.post('/db/characters/:id/reassign', async (req, res) => {
    const { id } = req.params;
    const { toUserId } = req.body;
    if (!toUserId) return res.status(400).json({ error: 'toUserId required' });
    try {
        const db = require('../database');
        // Verify target user exists
        const user = await db.getUserById(toUserId);
        if (!user) return res.status(404).json({ error: 'Target user not found' });
        const changes = await db.reassignCharacter(id, toUserId);
        if (!changes) return res.status(404).json({ error: 'Character not found' });
        res.json({ success: true, characterId: id, toUserId, username: user.username });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.loadGameData = loadGameData;
