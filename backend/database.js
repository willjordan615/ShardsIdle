// backend/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB_PATH = path.join(__dirname, 'data', 'game.db');
let db;

function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                reject(err);
            } else {
                console.log('Connected to SQLite database');
                createTables().then(resolve).catch(reject);
            }
        });
    });
}

function createTables() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`
                CREATE TABLE IF NOT EXISTS combat_logs (
                    id TEXT PRIMARY KEY,
                    challengeID TEXT NOT NULL,
                    partyID TEXT NOT NULL,
                    startTime INTEGER NOT NULL,
                    result TEXT NOT NULL,
                    totalTurns INTEGER NOT NULL,
                    log TEXT NOT NULL,
                    createdAt INTEGER NOT NULL
                )
            `, (err) => { if (err) reject(err); });

            db.run(`
                CREATE TABLE IF NOT EXISTS character_progression (
                    characterID TEXT PRIMARY KEY,
                    level INTEGER NOT NULL DEFAULT 1,
                    experience INTEGER NOT NULL DEFAULT 0,
                    lastCombatAt INTEGER,
                    createdAt INTEGER NOT NULL,
                    updatedAt INTEGER NOT NULL
                )
            `, (err) => { if (err) reject(err); });

            db.run(`
                CREATE TABLE IF NOT EXISTS characters (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    race TEXT NOT NULL,
                    level INTEGER NOT NULL DEFAULT 1,
                    experience INTEGER NOT NULL DEFAULT 0,
                    conviction INTEGER NOT NULL,
                    endurance INTEGER NOT NULL,
                    ambition INTEGER NOT NULL,
                    harmony INTEGER NOT NULL,
                    equipment TEXT NOT NULL DEFAULT '{}',
                    skills TEXT NOT NULL DEFAULT '[]',
                    consumables TEXT NOT NULL DEFAULT '{}',
                    consumableStash TEXT NOT NULL DEFAULT '{}',
                    beltOrder TEXT NOT NULL DEFAULT '[null,null,null,null]',
                    inventory TEXT NOT NULL DEFAULT '[]',
                    gold REAL NOT NULL DEFAULT 0,
                    arcaneDust REAL NOT NULL DEFAULT 0,
                    unlockedCombos TEXT DEFAULT '[]',
                    combatStats TEXT DEFAULT '{}',
                    partyStats TEXT DEFAULT '{}',
                    ownerUserId TEXT,
                    isPublic INTEGER DEFAULT 0,
                    shareCode TEXT,
                    buildName TEXT,
                    buildDescription TEXT,
                    importCount INTEGER DEFAULT 0,
                    lastSharedAt DATETIME,
                    avatarId TEXT,
                    avatarColor TEXT,
                    avatarFrame TEXT,
                    title TEXT,
                    lastActiveAt DATETIME,
                    createdAt INTEGER NOT NULL,
                    lastModified INTEGER NOT NULL,
                    lastSuccessfulChallengeId TEXT DEFAULT NULL
                )
            `, (err) => { if (err) reject(err); });

            db.run(`
                CREATE TABLE IF NOT EXISTS character_imports (
                    import_id TEXT PRIMARY KEY,
                    original_character_id TEXT NOT NULL,
                    importing_user_id TEXT,
                    imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    times_used INTEGER DEFAULT 0,
                    last_used_at DATETIME,
                    FOREIGN KEY (original_character_id) REFERENCES characters(id)
                )
            `, (err) => { if (err) reject(err); });

            db.run(`
                CREATE INDEX IF NOT EXISTS idx_imports_original 
                ON character_imports(original_character_id)
            `, (err) => { if (err) reject(err); });

            db.run(`
                CREATE TABLE IF NOT EXISTS skill_progression (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    characterID TEXT NOT NULL,
                    skillID TEXT NOT NULL,
                    skillXP INTEGER NOT NULL DEFAULT 0,
                    skillLevel INTEGER NOT NULL DEFAULT 1,
                    usageCount INTEGER NOT NULL DEFAULT 0,
                    lastUsedAt INTEGER,
                    UNIQUE(characterID, skillID),
                    FOREIGN KEY(characterID) REFERENCES character_progression(characterID)
                )
            `, (err) => { if (err) reject(err); });

            db.run(`
                CREATE TABLE IF NOT EXISTS character_inventory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    characterID TEXT NOT NULL,
                    itemID TEXT NOT NULL,
                    quantity INTEGER NOT NULL DEFAULT 1,
                    acquiredAt INTEGER NOT NULL,
                    FOREIGN KEY(characterID) REFERENCES character_progression(characterID)
                )
            `, (err) => {
                if (err) reject(err);
                else {
                    // Migration: add aiProfile column to existing databases
                    db.run(`ALTER TABLE characters ADD COLUMN aiProfile TEXT DEFAULT 'balanced'`, () => {
                        // Ignore error — column already exists on fresh installs
                    });
                    resolve();
                }
            });
        });
    });
}

async function initializeCharacterSnapshotsTable() {
    const sql = `
        CREATE TABLE IF NOT EXISTS character_snapshots (
            snapshot_id TEXT PRIMARY KEY,
            character_id TEXT NOT NULL,
            owner_user_id TEXT,
            share_code TEXT UNIQUE NOT NULL,
            character_name TEXT NOT NULL,
            level INTEGER NOT NULL,
            race TEXT NOT NULL,
            stats TEXT NOT NULL,
            skills TEXT NOT NULL,
            equipment TEXT NOT NULL,
            combat_stats TEXT NOT NULL,
            party_stats TEXT,
            avatar_id TEXT,
            avatar_color TEXT,
            avatar_frame TEXT,
            title TEXT,
            build_name TEXT,
            build_description TEXT,
            is_public INTEGER DEFAULT 0,
            import_count INTEGER DEFAULT 0,
            last_shared_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_active_at DATETIME,
            ai_profile TEXT DEFAULT 'balanced'
        )
    `;
    
    await db.run(sql);
    await db.run('CREATE INDEX IF NOT EXISTS idx_public_characters ON character_snapshots(is_public)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_share_code ON character_snapshots(share_code)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_character_level ON character_snapshots(level)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_imports ON character_snapshots(import_count)');
    console.log('[DATABASE] character_snapshots table initialized');

    // Migration: add ai_profile to character_snapshots
    await new Promise((resolve) => {
        db.run(`ALTER TABLE character_snapshots ADD COLUMN ai_profile TEXT DEFAULT 'balanced'`, () => resolve());
    });

    // Migration: add lastSuccessfulChallengeId to existing databases that predate this column
    await new Promise((resolve) => {
        db.run(
            `ALTER TABLE characters ADD COLUMN lastSuccessfulChallengeId TEXT DEFAULT NULL`,
            (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    console.warn('[DATABASE] Migration note:', err.message);
                }
                resolve();
            }
        );
    });

    // Migration: add consumableStash, gold, arcaneDust, beltOrder columns
    for (const [col, def] of [
        ['consumableStash', "TEXT NOT NULL DEFAULT '{}'"],
        ['gold',            'REAL NOT NULL DEFAULT 0'],
        ['arcaneDust',      'REAL NOT NULL DEFAULT 0'],
        ['beltOrder',       "TEXT NOT NULL DEFAULT '[null,null,null,null]'"]
    ]) {
        await new Promise((resolve) => {
            db.run(`ALTER TABLE characters ADD COLUMN ${col} ${def}`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    console.warn(`[DATABASE] Migration note (${col}):`, err.message);
                }
                resolve();
            });
        });
    }
}

function saveCombatLog(logData) {
    return new Promise((resolve, reject) => {
        const { id, challengeID, partyID, startTime, result, totalTurns, log } = logData;
        db.run(
            `INSERT INTO combat_logs (id, challengeID, partyID, startTime, result, totalTurns, log, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, challengeID, partyID, startTime, result, totalTurns, JSON.stringify(log), Date.now()],
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

function getCombatLog(logID) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM combat_logs WHERE id = ?`, [logID], (err, row) => {
            if (err) reject(err);
            else resolve(row ? { ...row, log: JSON.parse(row.log) } : null);
        });
    });
}

function getCombatLogs(characterID) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT * FROM combat_logs WHERE partyID LIKE ? ORDER BY createdAt DESC LIMIT 50`,
            [`%${characterID}%`],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows ? rows.map(r => ({ ...r, log: JSON.parse(r.log) })) : []);
            }
        );
    });
}

function updateCharacterProgression(characterID, level, experience) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO character_progression (characterID, level, experience, createdAt, updatedAt) 
             VALUES (?, ?, ?, ?, ?) 
             ON CONFLICT(characterID) DO UPDATE SET 
             level = ?, experience = ?, updatedAt = ?, lastCombatAt = ?`,
            [characterID, level, experience, Date.now(), Date.now(), level, experience, Date.now(), Date.now()],
            function(err) {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

function updateSkillProgression(characterID, skillID, skillXP, skillLevel, usageCount) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO skill_progression (characterID, skillID, skillXP, skillLevel, usageCount, lastUsedAt) 
             VALUES (?, ?, ?, ?, ?, ?) 
             ON CONFLICT(characterID, skillID) DO UPDATE SET 
             skillXP = ?, skillLevel = ?, usageCount = ?, lastUsedAt = ?`,
            [characterID, skillID, skillXP, skillLevel, usageCount, Date.now(), skillXP, skillLevel, usageCount, Date.now()],
            function(err) {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

function addItemToInventory(characterID, itemID, quantity = 1) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO character_inventory (characterID, itemID, quantity, acquiredAt) 
             VALUES (?, ?, ?, ?) 
             ON CONFLICT(characterID, itemID) DO UPDATE SET quantity = quantity + ?`,
            [characterID, itemID, quantity, Date.now(), quantity],
            function(err) {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

function consumeItem(characterID, itemID, quantity = 1) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE character_inventory 
             SET quantity = quantity - ? 
             WHERE characterID = ? AND itemID = ? AND quantity >= ?`,
            [quantity, characterID, itemID, quantity],
            function(err) {
                if (err) reject(err);
                else resolve(this.changes > 0);
            }
        );
    });
}

function getCharacterInventory(characterID) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT itemID, quantity FROM character_inventory WHERE characterID = ? AND quantity > 0`,
            [characterID],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            }
        );
    });
}

function saveCharacter(character) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO characters (
                id, name, race, level, experience,
                conviction, endurance, ambition, harmony,
                equipment, skills, consumables, consumableStash, beltOrder, inventory,
                gold, arcaneDust,
                unlockedCombos, combatStats, partyStats,
                ownerUserId, isPublic, shareCode, buildName, buildDescription,
                importCount, lastSharedAt,
                avatarId, avatarColor, avatarFrame, title, lastActiveAt,
                createdAt, lastModified, lastSuccessfulChallengeId, aiProfile
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = ?, race = ?, level = ?, experience = ?,
                conviction = ?, endurance = ?, ambition = ?, harmony = ?,
                equipment = ?, skills = ?, consumables = ?, consumableStash = ?, beltOrder = ?, inventory = ?,
                gold = ?, arcaneDust = ?,
                unlockedCombos = ?, combatStats = ?, partyStats = ?,
                ownerUserId = ?, isPublic = ?, shareCode = ?, buildName = ?, buildDescription = ?,
                importCount = ?, lastSharedAt = ?,
                avatarId = ?, avatarColor = ?, avatarFrame = ?, title = ?, lastActiveAt = ?,
                lastModified = ?, lastSuccessfulChallengeId = ?, aiProfile = ?`,
            [
                character.id, character.name, character.race, character.level, character.experience,
                character.stats?.conviction || 0, character.stats?.endurance || 0,
                character.stats?.ambition || 0, character.stats?.harmony || 0,
                JSON.stringify(character.equipment || {}),
                JSON.stringify(character.skills || []),
                JSON.stringify(character.consumables || {}),
                JSON.stringify(character.consumableStash || {}),
                JSON.stringify(character.beltOrder || [null,null,null,null]),
                JSON.stringify(character.inventory || []),
                character.gold || 0,
                character.arcaneDust || 0,
                JSON.stringify(character.unlockedCombos || []),
                JSON.stringify(character.combatStats || {}),
                JSON.stringify(character.partyStats || {}),
                character.ownerUserId || null, character.isPublic ? 1 : 0, character.shareCode || null,
                character.buildName || null, character.buildDescription || null,
                character.importCount || 0, character.lastSharedAt || null,
                character.avatarId || null, character.avatarColor || null,
                character.avatarFrame || null, character.title || null,
                character.lastActiveAt || Date.now(),
                character.createdAt || Date.now(), Date.now(),
                character.lastSuccessfulChallengeId || null,
                character.aiProfile || 'balanced',
                // ON CONFLICT UPDATE values
                character.name, character.race, character.level, character.experience,
                character.stats?.conviction || 0, character.stats?.endurance || 0,
                character.stats?.ambition || 0, character.stats?.harmony || 0,
                JSON.stringify(character.equipment || {}),
                JSON.stringify(character.skills || []),
                JSON.stringify(character.consumables || {}),
                JSON.stringify(character.consumableStash || {}),
                JSON.stringify(character.beltOrder || [null,null,null,null]),
                JSON.stringify(character.inventory || []),
                character.gold || 0,
                character.arcaneDust || 0,
                JSON.stringify(character.unlockedCombos || []),
                JSON.stringify(character.combatStats || {}),
                JSON.stringify(character.partyStats || {}),
                character.ownerUserId || null, character.isPublic ? 1 : 0, character.shareCode || null,
                character.buildName || null, character.buildDescription || null,
                character.importCount || 0, character.lastSharedAt || null,
                character.avatarId || null, character.avatarColor || null,
                character.avatarFrame || null, character.title || null,
                character.lastActiveAt || Date.now(),
                Date.now(), character.lastSuccessfulChallengeId || null,
                character.aiProfile || 'balanced'
            ],
            function(err) {
                if (err) reject(err);
                else resolve(character.id);
            }
        );
    });
}

function getCharacter(characterId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM characters WHERE id = ?`, [characterId], (err, row) => {
            if (err) reject(err);
            else if (row) {
                resolve({
                    id: row.id,
                    name: row.name,
                    race: row.race,
                    level: row.level,
                    experience: row.experience,
                    stats: {
                        conviction: row.conviction,
                        endurance: row.endurance,
                        ambition: row.ambition,
                        harmony: row.harmony
                    },
                    equipment: JSON.parse(row.equipment || '{}'),
                    skills: JSON.parse(row.skills || '[]'),
                    consumables: JSON.parse(row.consumables || '{}'),
                    consumableStash: JSON.parse(row.consumableStash || '{}'),
                    beltOrder: JSON.parse(row.beltOrder || '[null,null,null,null]'),
                    inventory: JSON.parse(row.inventory || '[]'),
                    gold: row.gold || 0,
                    arcaneDust: row.arcaneDust || 0,
                    unlockedCombos: JSON.parse(row.unlockedCombos || '[]'),
                    combatStats: JSON.parse(row.combatStats || '{}'),
                    partyStats: JSON.parse(row.partyStats || '{}'),
                    ownerUserId: row.ownerUserId,
                    isPublic: row.isPublic === 1,
                    shareCode: row.shareCode,
                    buildName: row.buildName,
                    buildDescription: row.buildDescription,
                    importCount: row.importCount,
                    lastSharedAt: row.lastSharedAt,
                    avatarId: row.avatarId,
                    avatarColor: row.avatarColor,
                    avatarFrame: row.avatarFrame,
                    title: row.title,
                    createdAt: row.createdAt,
                    lastModified: row.lastModified,
                    lastActiveAt: row.lastActiveAt,
                    lastSuccessfulChallengeId: row.lastSuccessfulChallengeId || null,
                    aiProfile: row.aiProfile || 'balanced'
                });
            } else {
                resolve(null);
            }
        });
    });
}

function getAllCharacters() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM characters ORDER BY lastModified DESC`, (err, rows) => {
            if (err) reject(err);
            else {
                const characters = rows ? rows.map(row => ({
                    id: row.id,
                    name: row.name,
                    race: row.race,
                    level: row.level,
                    experience: row.experience,
                    stats: {
                        conviction: row.conviction,
                        endurance: row.endurance,
                        ambition: row.ambition,
                        harmony: row.harmony
                    },
                    equipment: JSON.parse(row.equipment || '{}'),
                    skills: JSON.parse(row.skills || '[]'),
                    consumables: JSON.parse(row.consumables || '{}'),
                    consumableStash: JSON.parse(row.consumableStash || '{}'),
                    beltOrder: JSON.parse(row.beltOrder || '[null,null,null,null]'),
                    inventory: JSON.parse(row.inventory || '[]'),
                    gold: row.gold || 0,
                    arcaneDust: row.arcaneDust || 0,
                    unlockedCombos: JSON.parse(row.unlockedCombos || '[]'),
                    combatStats: JSON.parse(row.combatStats || '{}'),
                    partyStats: JSON.parse(row.partyStats || '{}'),
                    ownerUserId: row.ownerUserId,
                    isPublic: row.isPublic === 1,
                    shareCode: row.shareCode,
                    buildName: row.buildName,
                    buildDescription: row.buildDescription,
                    importCount: row.importCount,
                    lastSharedAt: row.lastSharedAt,
                    avatarId: row.avatarId,
                    avatarColor: row.avatarColor,
                    avatarFrame: row.avatarFrame,
                    title: row.title,
                    createdAt: row.createdAt,
                    lastModified: row.lastModified,
                    lastActiveAt: row.lastActiveAt,
                    lastSuccessfulChallengeId: row.lastSuccessfulChallengeId || null,
                    aiProfile: row.aiProfile || 'balanced'
                })) : [];
                resolve(characters);
            }
        });
    });
}

function deleteCharacter(characterId) {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM characters WHERE id = ?`, [characterId], function(err) {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function getImportReference(importId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM character_imports WHERE import_id = ?`, [importId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

async function getImportByCharacterId(characterId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM character_imports WHERE import_id = ?`, [characterId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

async function getCharacterImports(characterId) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM character_imports WHERE original_character_id = ?`, [characterId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

async function createImportReference(importId, originalCharacterId, importingUserId = null) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO character_imports (import_id, original_character_id, importing_user_id, times_used) VALUES (?, ?, ?, 0)`,
            [importId, originalCharacterId, importingUserId],
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

async function incrementImportUsage(importId) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE character_imports SET times_used = times_used + 1, last_used_at = CURRENT_TIMESTAMP WHERE import_id = ?`,
            [importId],
            function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
}

async function isImportedCharacter(characterId) {
    const importRef = await getImportByCharacterId(characterId);
    return importRef !== undefined && importRef !== null;
}

function getDatabase() {
    return db;
}

// ── Combat log pruning ────────────────────────────────────────────────────────
// Two-tier cleanup to prevent unbounded growth in an idle game context:
//   1. Strip full turn data from logs older than 24h (keep metadata + segment summaries)
//   2. Hard delete logs older than 7 days entirely
// Called on server startup and periodically during runtime.

function pruneCombatLogs() {
    return new Promise((resolve, reject) => {
        const now = Date.now();
        const oneDayAgo  = now - 24 * 60 * 60 * 1000;
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

        db.serialize(() => {
            // Step 1: Hard delete logs older than 7 days
            db.run(
                `DELETE FROM combat_logs WHERE createdAt < ?`,
                [sevenDaysAgo],
                function(err) {
                    if (err) { console.error('[PRUNE] Delete error:', err); }
                    else if (this.changes > 0) {
                        console.log(`[PRUNE] Deleted ${this.changes} combat logs older than 7 days`);
                    }
                }
            );

            // Step 2: Strip full log payload from logs older than 24h
            // Replace log JSON with a lightweight summary preserving result metadata
            db.all(
                `SELECT id, log FROM combat_logs WHERE createdAt < ? AND createdAt >= ?`,
                [oneDayAgo, sevenDaysAgo],
                (err, rows) => {
                    if (err) { console.error('[PRUNE] Read error:', err); return reject(err); }
                    if (!rows || rows.length === 0) return resolve();

                    let stripped = 0;
                    const stmt = db.prepare(
                        `UPDATE combat_logs SET log = ? WHERE id = ?`
                    );

                    rows.forEach(row => {
                        try {
                            const full = JSON.parse(row.log);
                            // Already stripped if no turns field
                            if (!full.turns && !full.segments) return;

                            // Keep only the summary — no turn-by-turn data
                            const summary = {
                                result:      full.result,
                                totalTurns:  full.totalTurns,
                                combatID:    full.combatID,
                                pruned:      true,
                                prunedAt:    now,
                                // Keep segment summaries (stage outcomes, loot, XP)
                                segments: (full.segments || []).map(s => ({
                                    stageId:      s.stageId,
                                    result:       s.result,
                                    lootAwarded:  s.lootAwarded,
                                    xpAwarded:    s.xpAwarded,
                                    secretPath:   s.secretPath,
                                })),
                            };

                            stmt.run(JSON.stringify(summary), row.id);
                            stripped++;
                        } catch (e) {
                            // Already invalid JSON or already stripped — skip
                        }
                    });

                    stmt.finalize();
                    if (stripped > 0) {
                        console.log(`[PRUNE] Stripped full log data from ${stripped} combat logs (>24h old)`);
                    }
                    resolve();
                }
            );
        });
    });
}

// Run pruning on startup, then every 6 hours
function scheduleCombatLogPruning() {
    pruneCombatLogs().catch(err => console.error('[PRUNE] Startup prune failed:', err));
    setInterval(() => {
        pruneCombatLogs().catch(err => console.error('[PRUNE] Scheduled prune failed:', err));
    }, 6 * 60 * 60 * 1000);
}

module.exports = {
    initializeDatabase,
    initializeCharacterSnapshotsTable,
    saveCombatLog,
    getCombatLog,
    getCombatLogs,
    pruneCombatLogs,
    scheduleCombatLogPruning,
    updateCharacterProgression,
    updateSkillProgression,
    addItemToInventory,
    consumeItem,
    getCharacterInventory,
    saveCharacter,
    getCharacter,
    getAllCharacters,
    deleteCharacter,
    getImportReference,
    getImportByCharacterId,
    getCharacterImports,
    createImportReference,
    incrementImportUsage,
    isImportedCharacter,
    getDatabase
};