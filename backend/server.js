const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs'); // Required for file operations (Admin Editor)
const db = require('./database');
const combatRoutes = require('./routes/combat');
const { router: dataRoutes, loadGameData } = require('./routes/data');
const characterRoutes = require('./routes/character');
const adminRoutes = require('./routes/admin');
const characterSnapshotsRoutes = require('./routes/character-snapshots');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// ==========================================
// STATIC FILE SERVING
// ==========================================
// CRITICAL: Serve the ROOT directory ('..') because admin-editor.html is in the root,
// while server.js is in /backend.
app.use(express.static(path.join(__dirname, '..')));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Combat engine is running' });
});

// ==========================================
// NEW: Admin Editor Routes for JSON Files
// ==========================================

// Helper to get file path safely
// Files are located in /backend/data/
const getDataFilePath = (filename) => {
    return path.join(__dirname, 'data', filename);
};

// GET: Load Challenges
app.get('/api/admin/data/challenges', (req, res) => {
    try {
        const filePath = getDataFilePath('challenges.json');
        console.log(`[EDITOR] Reading challenges from: ${filePath}`);
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found at ${filePath}`);
        }
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        res.json(data);
    } catch (error) {
        console.error('[EDITOR] Error reading challenges:', error);
        res.status(500).json({ error: 'Failed to read challenges: ' + error.message });
    }
});

// POST: Save Challenges
app.post('/api/admin/data/challenges', (req, res) => {
    try {
        const newData = req.body;
        const filePath = getDataFilePath('challenges.json');
        
        // Write with formatting (2 spaces) for readability
        fs.writeFileSync(filePath, JSON.stringify(newData, null, 2), 'utf8');
        console.log('[EDITOR] ✅ Challenges saved successfully.');
        
        // Optional: Reload game data if your server caches it
        if (typeof loadGameData === 'function') loadGameData();
        
        res.json({ success: true, message: 'Challenges saved!' });
    } catch (error) {
        console.error('[EDITOR] Error saving challenges:', error);
        res.status(500).json({ error: 'Failed to save challenges: ' + error.message });
    }
});

// GET: Load Enemy Types
app.get('/api/admin/data/enemies', (req, res) => {
    try {
        const filePath = getDataFilePath('enemy-types.json');
        console.log(`[EDITOR] Reading enemies from: ${filePath}`);
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found at ${filePath}`);
        }
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        res.json(data);
    } catch (error) {
        console.error('[EDITOR] Error reading enemies:', error);
        res.status(500).json({ error: 'Failed to read enemies: ' + error.message });
    }
});

// POST: Save Enemy Types
app.post('/api/admin/data/enemies', (req, res) => {
    try {
        const newData = req.body;
        const filePath = getDataFilePath('enemy-types.json');
        
        fs.writeFileSync(filePath, JSON.stringify(newData, null, 2), 'utf8');
        console.log('[EDITOR] ✅ Enemy Types saved successfully.');

        // Optional: Reload game data
        if (typeof loadGameData === 'function') loadGameData();

        res.json({ success: true, message: 'Enemy Types saved!' });
    } catch (error) {
        console.error('[EDITOR] Error saving enemies:', error);
        res.status(500).json({ error: 'Failed to save enemies: ' + error.message });
    }
});
// ==========================================

// --- EXISTING ROUTES (Restored) ---

// Combat routes
app.use('/api/combat', combatRoutes);

// Character routes
app.use('/api/characters', characterRoutes);

// Data routes
app.use('/api/data', dataRoutes);

// Admin routes (existing item management, etc.)
app.use('/api/admin', adminRoutes);

// Char Snapshots
app.use('/api/character', characterSnapshotsRoutes);

// Initialize database and start server
async function start() {
    try {
        loadGameData();
        
        // Initialize core database tables
        await db.initializeDatabase();
        console.log('Core database initialized');
        
        // Initialize character snapshots table for savestate sharing
        await db.initializeCharacterSnapshotsTable();
        console.log('Character snapshots table initialized');
        
        app.listen(PORT, () => {
            console.log(`\n🚀 Server running on http://localhost:${PORT}`);
            console.log(`\n--- AVAILABLE ENDPOINTS ---`);
            console.log(`GET  /api/health - Health check`);
            console.log(`POST /api/combat/start - Start a new combat`);
            console.log(`GET  /api/combat/:combatID - Get combat log`);
            console.log(`GET  /api/characters - Get all characters`);
            console.log(`GET  /api/data/all - Get all game data`);
            console.log(`GET  /api/admin/items - Get all items`);
            
            console.log(`\n--- NEW EDITOR ENDPOINTS ---`);
            console.log(`GET  /api/admin/data/challenges - Get challenges JSON`);
            console.log(`POST /api/admin/data/challenges - Save challenges JSON`);
            console.log(`GET  /api/admin/data/enemies - Get enemy types JSON`);
            console.log(`POST /api/admin/data/enemies - Save enemy types JSON`);
            
            console.log(`\n--- STATIC FILES ---`);
            console.log(`Serving ROOT directory.`);
            console.log(`✅ Access editor at: http://localhost:${PORT}/admin-editor.html\n`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

start();

module.exports = app;