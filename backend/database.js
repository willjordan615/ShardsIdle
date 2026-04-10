// backend/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB_PATH = path.join(__dirname, 'db', 'game.db');
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
                CREATE TABLE IF NOT EXISTS users (
                    user_id TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    password_hash TEXT,
                    is_guest INTEGER NOT NULL DEFAULT 1,
                    created_at INTEGER NOT NULL,
                    last_active_at INTEGER NOT NULL
                )
            `, (err) => { if (err) reject(err); });

            db.run(`
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    last_used_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(user_id)
                )
            `, (err) => { if (err) reject(err); });

            db.run(`
                CREATE INDEX IF NOT EXISTS idx_sessions_user
                ON sessions(user_id)
            `, (err) => { if (err) reject(err); });

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
                    keyring TEXT NOT NULL DEFAULT '{}',
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
                    // Migrations: add columns to existing databases (errors ignored — column exists on fresh installs)
                    db.run(`ALTER TABLE characters ADD COLUMN aiProfile TEXT DEFAULT 'balanced'`, () => {});
                    db.run(`ALTER TABLE characters ADD COLUMN roleTag TEXT DEFAULT NULL`, () => {});
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

    // Migration: add combatSessionId — used to detect when another device takes over a character
    await new Promise((resolve) => {
        db.run(
            `ALTER TABLE characters ADD COLUMN combatSessionId TEXT DEFAULT NULL`,
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
        ['keyring',         "TEXT NOT NULL DEFAULT '{}'"],
        ['gold',            'REAL NOT NULL DEFAULT 0'],
        ['arcaneDust',      'REAL NOT NULL DEFAULT 0'],
        ['beltOrder',       "TEXT NOT NULL DEFAULT '[null,null,null,null]'"],
        ['shareEnabled',    'INTEGER DEFAULT 0'],
        ['shareCode',       'TEXT DEFAULT NULL'],
        ['buildName',       'TEXT DEFAULT NULL'],
        ['buildDescription','TEXT DEFAULT NULL'],
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

    // Migration: add offline idle session tracking columns
    for (const [col, def] of [
        ['idleChallengeId',       'TEXT DEFAULT NULL'],
        ['idlePartyIds',          'TEXT DEFAULT NULL'],
        ['idleStartedAt',         'INTEGER DEFAULT NULL'],
        ['idleGeneratedBots',     'TEXT DEFAULT NULL'],
        ['idleCombatDurationMs',  'INTEGER DEFAULT NULL'],
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

// ── Idle session helpers ──────────────────────────────────────────────────────

function setIdleSession(characterId, challengeId, partyIds, generatedBotSnapshots, combatDurationMs) {
    return new Promise((resolve, reject) => {
        const durationValue = (combatDurationMs != null && combatDurationMs > 0) ? combatDurationMs : null;
        db.run(
            `UPDATE characters SET idleChallengeId = ?, idlePartyIds = ?, idleStartedAt = ?, idleGeneratedBots = ?,
             idleCombatDurationMs = COALESCE(?, idleCombatDurationMs) WHERE id = ?`,
            [challengeId, JSON.stringify(partyIds), Date.now(), JSON.stringify(generatedBotSnapshots || []), durationValue, characterId],
            (err) => { if (err) reject(err); else resolve(); }
        );
    });
}

function getIdleSession(characterId) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT idleChallengeId, idlePartyIds, idleStartedAt, idleGeneratedBots, idleCombatDurationMs FROM characters WHERE id = ?`,
            [characterId],
            (err, row) => {
                if (err) return reject(err);
                if (!row || !row.idleStartedAt) return resolve(null);
                resolve({
                    challengeId:           row.idleChallengeId,
                    partyIds:              JSON.parse(row.idlePartyIds || '[]'),
                    startedAt:             row.idleStartedAt,
                    generatedBotSnapshots: JSON.parse(row.idleGeneratedBots || '[]'),
                    combatDurationMs:      row.idleCombatDurationMs || null,
                });
            }
        );
    });
}

function clearIdleSession(characterId) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE characters SET idleChallengeId = NULL, idlePartyIds = NULL, idleStartedAt = NULL WHERE id = ?`,
            [characterId],
            (err) => { if (err) reject(err); else resolve(); }
        );
    });
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

function saveCharacter(character) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO characters (
                id, name, race, level, experience,
                conviction, endurance, ambition, harmony,
                equipment, skills, consumables, consumableStash, keyring, beltOrder, inventory,
                gold, arcaneDust,
                unlockedCombos, combatStats, partyStats,
                ownerUserId, isPublic, shareCode, buildName, buildDescription,
                importCount, lastSharedAt,
                avatarId, avatarColor, avatarFrame, title, lastActiveAt,
                createdAt, lastModified, lastSuccessfulChallengeId, aiProfile, roleTag
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = ?, race = ?, level = ?, experience = ?,
                conviction = ?, endurance = ?, ambition = ?, harmony = ?,
                equipment = ?, skills = ?, consumables = ?, consumableStash = ?, keyring = ?, beltOrder = ?, inventory = ?,
                gold = ?, arcaneDust = ?,
                unlockedCombos = ?, combatStats = ?, partyStats = ?,
                ownerUserId = ?, isPublic = ?, shareCode = ?, buildName = ?, buildDescription = ?,
                importCount = ?, lastSharedAt = ?,
                avatarId = ?, avatarColor = ?, avatarFrame = ?, title = ?, lastActiveAt = ?,
                lastModified = ?, lastSuccessfulChallengeId = ?, aiProfile = ?, roleTag = ?`,
            [
                character.id, character.name, character.race, character.level, character.experience,
                character.stats?.conviction || 0, character.stats?.endurance || 0,
                character.stats?.ambition || 0, character.stats?.harmony || 0,
                JSON.stringify(character.equipment || {}),
                JSON.stringify(character.skills || []),
                JSON.stringify(character.consumables || {}),
                JSON.stringify(character.consumableStash || {}),
                JSON.stringify(character.keyring || {}),
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
                character.roleTag || null,
                // ON CONFLICT UPDATE values
                character.name, character.race, character.level, character.experience,
                character.stats?.conviction || 0, character.stats?.endurance || 0,
                character.stats?.ambition || 0, character.stats?.harmony || 0,
                JSON.stringify(character.equipment || {}),
                JSON.stringify(character.skills || []),
                JSON.stringify(character.consumables || {}),
                JSON.stringify(character.consumableStash || {}),
                JSON.stringify(character.keyring || {}),
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
                character.aiProfile || 'balanced',
                character.roleTag || null,
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
                    keyring: JSON.parse(row.keyring || '{}'),
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
                    aiProfile: row.aiProfile || 'balanced',
                    roleTag: row.roleTag || null,
                    shareEnabled: row.isPublic === 1,
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
                    keyring: JSON.parse(row.keyring || '{}'),
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
                    aiProfile: row.aiProfile || 'balanced',
                    roleTag: row.roleTag || null,
                    shareEnabled: row.isPublic === 1,
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

// ── Auth helpers ──────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days sliding

function createUser(userId, username, passwordHash, isGuest) {
    return new Promise((resolve, reject) => {
        const now = Date.now();
        db.run(
            `INSERT INTO users (user_id, username, password_hash, is_guest, created_at, last_active_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, username, passwordHash || null, isGuest ? 1 : 0, now, now],
            function(err) { if (err) reject(err); else resolve(); }
        );
    });
}

function getUserById(userId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM users WHERE user_id = ?`, [userId], (err, row) => {
            if (err) reject(err); else resolve(row || null);
        });
    });
}

function getUserByUsername(username) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM users WHERE username = ? AND is_guest = 0`, [username], (err, row) => {
            if (err) reject(err); else resolve(row || null);
        });
    });
}

function getAllUsers() {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT user_id, username, is_guest, created_at FROM users ORDER BY created_at DESC`,
            [],
            (err, rows) => { if (err) reject(err); else resolve(rows || []); }
        );
    });
}

function reassignCharacter(characterId, toUserId) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE characters SET ownerUserId = ? WHERE id = ?`,
            [toUserId, characterId],
            function(err) { if (err) reject(err); else resolve(this.changes); }
        );
    });
}

function reassignSnapshots(characterId, toUserId) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE character_snapshots SET owner_user_id = ? WHERE character_id = ?`,
            [toUserId, characterId],
            function(err) { if (err) reject(err); else resolve(this.changes); }
        );
    });
}

function updateUserPassword(userId, passwordHash, username) {
    return new Promise((resolve, reject) => {
        const now = Date.now();
        db.run(
            `UPDATE users SET password_hash = ?, username = ?, is_guest = 0, last_active_at = ? WHERE user_id = ?`,
            [passwordHash, username, now, userId],
            function(err) { if (err) reject(err); else resolve(); }
        );
    });
}

function createSession(token, userId) {
    return new Promise((resolve, reject) => {
        const now     = Date.now();
        const expires = now + SESSION_TTL_MS;
        db.run(
            `INSERT INTO sessions (token, user_id, created_at, last_used_at, expires_at)
             VALUES (?, ?, ?, ?, ?)`,
            [token, userId, now, now, expires],
            function(err) { if (err) reject(err); else resolve(); }
        );
    });
}

function getSession(token) {
    return new Promise((resolve, reject) => {
        const now = Date.now();
        db.get(
            `SELECT * FROM sessions WHERE token = ? AND expires_at > ?`,
            [token, now],
            (err, row) => { if (err) reject(err); else resolve(row || null); }
        );
    });
}

function touchSession(token) {
    // Slide the expiry window on each use
    const now     = Date.now();
    const expires = now + SESSION_TTL_MS;
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE token = ?`,
            [now, expires, token],
            function(err) { if (err) reject(err); else resolve(); }
        );
    });
}

function deleteSession(token) {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM sessions WHERE token = ?`, [token],
            function(err) { if (err) reject(err); else resolve(); }
        );
    });
}

function transferCharactersToUser(fromGuestId, toUserId) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE characters SET ownerUserId = ? WHERE ownerUserId = ?`,
            [toUserId, fromGuestId],
            function(err) { if (err) reject(err); else resolve(this.changes); }
        );
    });
}

function pruneExpiredSessions() {
    return new Promise((resolve, reject) => {
        const now = Date.now();
        db.run(`DELETE FROM sessions WHERE expires_at < ?`, [now], function(err) {
            if (err) { console.error('[AUTH] Session prune error:', err); reject(err); }
            else {
                if (this.changes > 0) console.log(`[AUTH] Pruned ${this.changes} expired sessions`);
                resolve(this.changes);
            }
        });
    });
}

function scheduleSessionPruning() {
    pruneExpiredSessions().catch(err => console.error('[AUTH] Startup session prune failed:', err));
    setInterval(() => {
        pruneExpiredSessions().catch(err => console.error('[AUTH] Scheduled session prune failed:', err));
    }, 6 * 60 * 60 * 1000);
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

                    // Reclaim freed pages — SQLite does not shrink the file without this
                    db.run('VACUUM', (err) => {
                        if (err) console.error('[PRUNE] VACUUM error:', err);
                        else console.log('[PRUNE] VACUUM complete');
                        resolve();
                    });
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
    getDatabase,
    // Auth
    createUser,
    getUserById,
    getUserByUsername,
    updateUserPassword,
    createSession,
    getSession,
    touchSession,
    deleteSession,
    transferCharactersToUser,
    getAllUsers,
    reassignCharacter,
    reassignSnapshots,
    pruneExpiredSessions,
    scheduleSessionPruning,
    // Idle session
    setIdleSession,
    getIdleSession,
    clearIdleSession,
};