const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

let gameData = {};

// Load all game data on startup
function loadGameData() {
    try {
        const dataDir = path.join(__dirname, '../data');
        
        gameData.skills = JSON.parse(fs.readFileSync(path.join(dataDir, 'skills.json'), 'utf8'));
        gameData.enemyTypes = JSON.parse(fs.readFileSync(path.join(dataDir, 'enemy-types.json'), 'utf8'));
        gameData.races = JSON.parse(fs.readFileSync(path.join(dataDir, 'races.json'), 'utf8'));
        // Normalize all racial skill field names to intrinsicSkills regardless of what the JSON uses
        gameData.races = gameData.races.map(race => {
            const skills = race.intrinsicSkills || race.bonusSkills || race.racialSkills || race.startingSkills || [];
            const normalized = { ...race, intrinsicSkills: skills };
            delete normalized.bonusSkills;
            delete normalized.racialSkills;
            delete normalized.startingSkills;
            return normalized;
        });
        gameData.challenges = JSON.parse(fs.readFileSync(path.join(dataDir, 'challenges.json'), 'utf8'));
        gameData.gear = JSON.parse(fs.readFileSync(path.join(dataDir, 'items.json'), 'utf8'));
        gameData.bots = JSON.parse(fs.readFileSync(path.join(dataDir, 'bots.json'), 'utf8'));
        gameData.statuses = JSON.parse(fs.readFileSync(path.join(dataDir, 'statuses.json'), 'utf8'));
        
        console.log('Game data loaded successfully');
    } catch (error) {
        console.error('Failed to load game data:', error);
        throw error;
    }
}

// GET /api/data/all - Get all game data at once
router.get('/all', (req, res) => {
    res.json(gameData);
});

// GET /api/data/skills
router.get('/skills', (req, res) => {
    res.json(gameData.skills || []);
});

// GET /api/data/enemy-types
router.get('/enemy-types', (req, res) => {
    res.json(gameData.enemyTypes || []);
});

// GET /api/data/races
router.get('/races', (req, res) => {
    res.json(gameData.races || []);
});

// GET /api/data/challenges
router.get('/challenges', (req, res) => {
    res.json(gameData.challenges || []);
});

// GET /api/data/gear
router.get('/gear', (req, res) => {
    res.json(gameData.gear || []);
});

// GET /api/data/consumables — returns consumable items from gear for backwards compatibility
router.get('/consumables', (req, res) => {
    res.json((gameData.gear || []).filter(i => i.type === 'consumable'));
});

// GET /api/data/bots
router.get('/bots', (req, res) => {
    res.json(gameData.bots || []);
});

// GET /api/data/:dataType - Generic endpoint for any data type
router.get('/:dataType', (req, res) => {
    const dataType = req.params.dataType;
    if (gameData[dataType]) {
        res.json(gameData[dataType]);
    } else {
        res.status(404).json({ error: `Data type '${dataType}' not found` });
    }
});

module.exports = { router, loadGameData };
