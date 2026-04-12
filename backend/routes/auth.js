// backend/routes/auth.js
const express     = require('express');
const router      = express.Router();
const crypto      = require('crypto');
const bcrypt      = require('bcryptjs');
const rateLimit   = require('express-rate-limit');
const db          = require('../database');

const BCRYPT_ROUNDS = 12;

// Rate limiter for login — 10 attempts per 15 minutes per IP
const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

// ── Sanitization ──────────────────────────────────────────────────────────────

// Display name fields: strip HTML, control chars, dangerous symbols
function sanitizeDisplayText(value, maxLength = 30) {
    if (typeof value !== 'string') return '';
    return value
        .replace(/<[^>]*>/g, '')
        .replace(/[<>"'&]/g, '')
        .replace(/[\x00-\x1F]/g, '')
        .trim()
        .slice(0, maxLength);
}

// Username: alphanumeric + underscore + hyphen only, 3–24 chars
function sanitizeUsername(value) {
    if (typeof value !== 'string') return '';
    return value
        .replace(/[^a-zA-Z0-9_\-]/g, '')
        .trim()
        .slice(0, 24);
}

// Password: strip only control characters (0x00–0x1F), allow everything else
function sanitizePassword(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\x00-\x1F]/g, '');
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function generateGuestName() {
    const adjectives = ['Swift', 'Brave', 'Silent', 'Iron', 'Storm', 'Ash', 'Ember', 'Frost', 'Hollow', 'Grim'];
    const nouns      = ['Wanderer', 'Blade', 'Shade', 'Warden', 'Seeker', 'Exile', 'Pilgrim', 'Wraith', 'Sentinel', 'Drifter'];
    const adj  = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num  = Math.floor(Math.random() * 9000) + 1000;
    return `${adj}${noun}${num}`;
}

// ── Middleware ────────────────────────────────────────────────────────────────

// Resolves token → user. Attaches req.userId, req.isAdmin, and req.sessionToken.
// Returns 401 if token is missing or expired. Use on protected routes.
async function requireAuth(req, res, next) {
    const header = req.headers['authorization'] || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        const session = await db.getSession(token);
        if (!session) return res.status(401).json({ error: 'Invalid or expired session' });

        // Slide expiry window
        await db.touchSession(token);

        req.userId       = session.user_id;
        req.sessionToken = token;
        req.isAdmin      = false;

        // Attach admin flag — getUserById uses SELECT * so is_admin is included
        const user = await db.getUserById(session.user_id);
        if (user) req.isAdmin = !!user.is_admin;

        next();
    } catch (err) {
        console.error('[AUTH] requireAuth error:', err);
        res.status(500).json({ error: 'Auth check failed' });
    }
}

// Same as requireAuth but non-blocking — attaches req.userId if valid,
// leaves it null if no token. Use on routes that are public but auth-aware.
async function optionalAuth(req, res, next) {
    const header = req.headers['authorization'] || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    req.userId       = null;
    req.sessionToken = null;
    if (!token) return next();

    try {
        const session = await db.getSession(token);
        if (session) {
            await db.touchSession(token);
            req.userId       = session.user_id;
            req.sessionToken = token;
        }
    } catch (err) {
        // Non-fatal — just proceed unauthenticated
        console.warn('[AUTH] optionalAuth error:', err.message);
    }
    next();
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/guest
 * Creates a guest account and returns a session token.
 * Called on first load if no token exists in localStorage.
 */
router.post('/guest', async (req, res) => {
    try {
        const userId   = crypto.randomUUID();
        const username = generateGuestName();
        const token    = generateToken();

        await db.createUser(userId, username, null, true);
        await db.createSession(token, userId);

        res.json({ token, userId, username, isGuest: true });
    } catch (err) {
        console.error('[AUTH] /guest error:', err);
        res.status(500).json({ error: 'Failed to create guest account' });
    }
});

/**
 * POST /api/auth/register
 * Claims a guest account — sets username + password, converts to full account.
 * Requires a valid session token (the guest's existing token).
 * Transfers all characters owned by the guest user_id to the new account.
 */
router.post('/register', requireAuth, async (req, res) => {
    try {
        let { username, password } = req.body;

        // Sanitize
        username = sanitizeUsername(username || '');
        password = sanitizePassword(password || '');

        if (username.length < 3)  return res.status(400).json({ error: 'Username must be at least 3 characters' });
        if (username.length > 24) return res.status(400).json({ error: 'Username must be 24 characters or fewer' });
        if (password.length < 8)  return res.status(400).json({ error: 'Password must be at least 8 characters' });
        if (password.length > 128) return res.status(400).json({ error: 'Password must be 128 characters or fewer' });

        // Check username not already taken
        const existing = await db.getUserByUsername(username);
        if (existing) return res.status(409).json({ error: 'Username already taken' });

        // Check caller is still a guest
        const user = await db.getUserById(req.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!user.is_guest) return res.status(400).json({ error: 'Account is already registered' });

        const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        await db.updateUserPassword(req.userId, hash, username);

        res.json({ success: true, userId: req.userId, username, isGuest: false });
    } catch (err) {
        console.error('[AUTH] /register error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

/**
 * POST /api/auth/login
 * Log in with username + password. Returns a new session token.
 * The client should store this token, replacing any existing guest token.
 * Characters previously owned by the guest session can optionally be migrated
 * by passing the old guest token as guestToken in the body.
 */
router.post('/login', loginRateLimiter, async (req, res) => {
    try {
        let { username, password, guestToken } = req.body;

        username = sanitizeUsername(username || '');
        password = sanitizePassword(password || '');

        if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

        const user = await db.getUserByUsername(username);
        // Generic error — don't reveal whether username exists
        if (!user || !user.password_hash) return res.status(401).json({ error: 'Invalid username or password' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Invalid username or password' });

        // If a guest token was provided, migrate that guest's characters
        if (guestToken && typeof guestToken === 'string' && guestToken.length === 64) {
            try {
                const guestSession = await db.getSession(guestToken);
                if (guestSession && guestSession.user_id !== user.user_id) {
                    const transferred = await db.transferCharactersToUser(guestSession.user_id, user.user_id);
                    if (transferred > 0) console.log(`[AUTH] Transferred ${transferred} characters from guest ${guestSession.user_id} to ${user.user_id}`);
                    await db.deleteSession(guestToken);
                }
            } catch (e) {
                console.warn('[AUTH] Guest migration failed (non-fatal):', e.message);
            }
        }

        const token = generateToken();
        await db.createSession(token, user.user_id);

        // Stamp last_login on all characters owned by this user — fire-and-forget
        db.touchCharacterLastLogin(user.user_id).catch(() => {});

        res.json({ token, userId: user.user_id, username: user.username, isGuest: false });
    } catch (err) {
        console.error('[AUTH] /login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * POST /api/auth/logout
 * Invalidates the current session token.
 */
router.post('/logout', requireAuth, async (req, res) => {
    try {
        await db.deleteSession(req.sessionToken);
        res.json({ success: true });
    } catch (err) {
        console.error('[AUTH] /logout error:', err);
        res.status(500).json({ error: 'Logout failed' });
    }
});

/**
 * GET /api/auth/me
 * Returns the current user's info. Used on load to validate a stored token.
 */
router.get('/me', requireAuth, async (req, res) => {
    try {
        const user = await db.getUserById(req.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({
            userId:   user.user_id,
            username: user.username,
            isGuest:  !!user.is_guest
        });
    } catch (err) {
        console.error('[AUTH] /me error:', err);
        res.status(500).json({ error: 'Failed to get user info' });
    }
});

module.exports = { router, requireAuth, optionalAuth };
