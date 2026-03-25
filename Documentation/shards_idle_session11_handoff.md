# Shards Idle — Session 11 Handoff

---

## Work Completed This Session

### Pagination & Browse System

**Server-side pagination on `/api/character/browse`**
- All filters (search, level, role, race) moved to SQL — no more client-side slicing
- `character_name LIKE ?` for search, `c.roleTag = ?` joins correctly via existing JOIN
- `COUNT(*)` + `LIMIT/OFFSET` with full `pagination` object returned
- Default 8 per page, max 20
- Sort options for `wins` and `damage` now have actual `ORDER BY` clauses (previously fell through to `import_count`)

**Level filter** changed from dropdown (1/5/10+) to `type="number"` input across both the browse screen and party formation public companions panel. Min 1, max 99.

**Search debounced** at 350ms on both browse and companion filters via `loadBrowseCharactersDebounced()` and `loadPublicCompanionsDebounced()`.

**Class title and active skills** added to browse cards, party formation public companion cards, and bot companion cards. Calls `getCharacterClass()` client-side using `skills` and `equipment` now returned by the browse endpoint (they were already stored on snapshots but stripped from the response).

**`loadPublicCompanions` moved** from `combat-system.js` to `browse-system.js` — it's browse/display logic and doesn't belong in the combat system. `addPublicCompanion` (party mutation) stays in `combat-system.js`.

**Party Full state** — browse and companion cards now show a disabled "Party Full" button when `currentParty.length >= maxPartySize`, rather than hiding the button.

---

### Code Organisation

- `escapeHtml()` moved from `combat-system.js` to `ui-helpers.js` (loads first, used by three files)
- `getMentality()` deleted from `game-data.js` — was only referenced in the `.bak` file, unused
- `getCharacterClass()` stays in `game-data.js` — called from three files, depends on load order
- Tooltip system standardised: single `positionTooltip()` in `ui-helpers.js` with full 4-edge viewport clamping, `data-tooltip` delegation handler replaces CSS `::after` pseudo-element tooltips on `.stat-tooltip` and `.status-pip`

---

### Bug Fixes

**Concurrent combat / character fighting on two locations**
- Replaced per-user boolean lock (`activeCombats` Map) with per-character promise queue (`characterLocks` Map + `acquireCharacterLocks()`)
- Added `combatSessionId` (UUID stamped on character at combat start via `UPDATE characters SET combatSessionId = ?`)
- Migration added: `ALTER TABLE characters ADD COLUMN combatSessionId TEXT DEFAULT NULL`
- If another device runs a combat with the same character mid-loop, the session ID mismatch is detected before save — data is still saved (no loss), but `loopDisplaced: true` is returned in the response
- Frontend sets `idleActive = false` on `loopDisplaced`, stopping the PC loop cleanly after one overlap combat

**Consumables not stacking**
- Root cause: frontend race condition — two combats from different challenges both called `getCharacter`, got the same `consumableStash`, each added their drops, second save overwrote the first
- Fix: consumable stacking moved server-side to `combat.js`, inside the per-character locked section. Uses `combatEngine.gear` to identify consumables (`slot_id1 === 'consumable'` or `consumable === true`)
- Frontend still displays loot lines but no longer writes to `consumableStash`

**Rewards toast removed**
- All four `showSafeSuccess` calls in `applyCombatRewards` removed (level up, skill level up, loot drop, skill unlock). Information is in the victory modal and character detail screen.

**Victory modal + countdown toast overlap**
- `dismissResultModal` now checks active screen before spawning the countdown toast — if you're on the combat log, dismissing the modal just closes it without spawning the toast

**Browse system loading failure at scale**
- Was fetching 100 full records + `db.getCharacter()` per result in `Promise.all` — now paginated server-side, 8 per page

---

### Mobile Layout

Full mobile pass on the combat log screen (`≤768px`):

- `#combatlog.screen` — `display: flex !important` now scoped to `.active` only (was bleeding into roster and character detail)
- Layout: enemies (fixed top strip) → battle log (flex:1 middle) → party (fixed bottom strip)
- Enemy and party cards at `flex: 0 0 90px` — truncated name, stacked bars (no labels), 3-column DMG/RCVD/HEAL grid below
- Enemies scroll horizontally, party scrolls horizontally
- Stage banner collapsible on tap (lore hidden by default, title only), tap to expand
- Media controls compact (smaller padding, smaller SVG icons)
- Battle log: tighter font (`0.75rem`), reduced padding and turn spacing via CSS variable overrides scoped to `#combatlog`
- Victory modal: smaller padding, reduced font sizes on all sections

Global mobile compression (`≤768px`):
- CSS variables overridden at `:root`: `--space-xl: 1rem`, `--space-lg: 0.75rem`, `--space-md: 0.65rem`
- Header: auth display and settings button wrapped in `#headerTopBar` flex row above the title — no more overlap
- Nav buttons, sections, cards, stat blocks, loadout slots all tightened
- Companion filters compress to 2-column grid
- Roster goes to 2-column grid

480px:
- Variables compressed further
- Roster drops to 1 column
- Section/card padding at minimum

---

### Background Image

- Path fixed: `./assets/AI_FLAVOR.jpg` → `../assets/AI_FLAVOR.jpg` (CSS resolves relative to stylesheet, not HTML)
- `body::before` overlay opacity reduced from `0.7` to `0.92` so image shows as subtle dark texture
- `.card` and `.section` backgrounds changed from semi-transparent `rgba` to fully opaque equivalents — they lift cleanly off the background

---

### Session Loot Log

New feature: running tally of all loot acquired during an idle loop session.

- Module-level `_sessionLoot` array and `_sessionLootRun` counter in `combat-log.js`
- `_appendSessionLoot()` called at end of each combat's loot processing, keyed by challenge name
- Entries displayed newest-first with run number and challenge name as header
- **Desktop**: collapsible "Session Loot" panel below the battle log in the center column, with run count badge and Clear button
- **Mobile**: panel hidden; small 🎒 tab button appears in bottom-right of combat screen when loot exists, taps to slide up a drawer overlay with full list
- Cleared automatically on loop stop (`cancelAutoRestart`) and via manual Clear button
- `window.clearSessionLoot`, `window.openSessionLootDrawer`, `window.closeSessionLootDrawer` exposed globally

---

## Files Changed This Session

| File | Change |
|------|--------|
| `backend/routes/character.js` | Paginated `GET /api/characters` (page/limit params, COUNT + OFFSET) |
| `backend/routes/character-snapshots.js` | Full browse rewrite — server-side filters, pagination, `skills`/`equipment` in response |
| `backend/routes/combat.js` | Per-character lock queue, session ID stamping, server-side consumable stacking, `loopDisplaced` flag |
| `backend/database.js` | Migration: `combatSessionId TEXT DEFAULT NULL` on characters table |
| `js/combat-log.js` | Session loot log, rewards toast removed, `dismissResultModal` toast suppression, `showStageBanner` subtext fix, mobile stage banner tap handler |
| `js/combat-system.js` | `loopDisplaced` handling, `loadPublicCompanions` removed (moved to browse-system) |
| `js/browse-system.js` | Server-side pagination + filters, debounced inputs, class title + skill tags on cards, Party Full state, `loadPublicCompanions` moved here |
| `js/character-management.js` | Paginated `renderRoster`, `_renderRosterPagination`, `positionTooltip` removed (now in ui-helpers) |
| `js/ui-helpers.js` | `positionTooltip` (4-edge clamped), `data-tooltip` delegation handler, `escapeHtml` |
| `js/game-data.js` | `getMentality` removed |
| `js/stat-tooltip.js` | Uses global `positionTooltip` from ui-helpers (no change needed, was already calling it) |
| `css/styles.css` | Full mobile pass, background image, lifted containers, tooltip z-index, session loot drawer CSS |
| `index.html` | Session loot panel + drawer HTML, `#headerTopBar` wrapper, level filters changed to number inputs, browse modal classes added |

---

## Known Remaining / Not Yet Addressed

**Bugs:**
- Enforce Party Limits — frontend validation + route-level enforcement still not implemented

**Formal Suggestions (untouched):**
- BAL: Higher Level Bots
- FEAT: Add Loot Container
- FEAT: Summoning
- FEAT: Charming
- FEAT: Async Multiplayer Progression
- FEAT: Polish Discovery Systems
- BAL: XP Penalty for Range
- FEAT: Assignable Character Progression
- FEAT: Unique/Rare Items
- Glossary / keyword system
- Mobile layout polish (ongoing)

**Balance (carried from session 10):**
- Enemy stat values (conviction/endurance/ambition) not yet scaled to match enemy levels — high-tier enemies have correct HP from the level formula but skill damage scaling may underperform

---

## Key Constants (unchanged)

- `STAT_SCALE = 300`
- `SUDDEN_DEATH_START = 100`
- Harmony XP: `1 + harmony/750`
- Ambition loot: `baseDropChance × (1 + ambition/500)`
- `untrained_strike` injected at mana < 15%, `costPercent: 0.35`
- Browse page size: 8 (party formation companions: 6)
- Roster page size: 6
