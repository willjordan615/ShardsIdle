# Shards Idle — Session 15 Handoff

## Work Completed This Session

### Git Recovery
- Codebase was corrupted by the emoji strip script from Session 14 (`strip_emojis.py` ran `open(path, 'w')` on 25 files in place)
- Recovered via `git revert --no-edit 8e2f33c` — clean history preserved
- Working relationship document updated with destructive operations safety rules (see below)

### Bot Pagination
- `renderBotsSelection()` in `combat-system.js` was rendering all eligible bots at once
- Paginated to 6 per page — `_botsPaging` state, `BOT_PAGE_SIZE`, `renderBotsSelection(page)`, `_renderBotsPagination()`
- Moved to `browse-system.js` where the public companion pagination already lives — `combat-system.js` retains only call sites and party mutation (`addBotToParty`, `removeBotFromParty`)

### Info Icon Z-Index Fix
- Combat Style and Role ⓘ icons on character detail panel were firing under the invisible `<select>` overlay
- Fixed: `position:relative; z-index:2` on both spans
- File: `index.html`

### Settings Overhaul
- **Removed:** "Coming Soon" stubs (Loot Notification Style, Auto-Challenge) from Gameplay tab
- **Renamed:** "Colour Theme" → "Accent Color", "Background" → "Background Darkness" → "Background Gamma"
- **Moved:** Text Size from Gameplay to Appearance; split into two independent controls: UI Text Size and Combat Log Text Size
- **New controls added:**
  - Background Hue (5 swatches: Navy, Dungeon, Crimson, Arcane, Verdant)
  - Window Color (6 swatches: same + Slate) — controls card/panel/modal surfaces
  - Background Overlay (6 swatches) — controls `body::before` gradient tint
  - Background Gamma — continuous slider (10–100), replaces 4 discrete buttons
  - Background Opacity — continuous slider (0–100), controls `body::before` opacity
- Settings modal now scrolls internally (`max-height: 88vh`, own scrollbar)
- Settings layout: single-column rows, label above options, options wrap freely
- Files: `index.html`, `styles.css`

### CSS Variable System — Full Pass
- Introduced `--window-base`, `--window-deep`, `--window-raised`, `--window-input`, `--window-subtle`, `--window-muted` for all card/panel/modal surfaces
- Introduced `--overlay-r`, `--overlay-g`, `--overlay-b`, `--overlay-opacity` for the background gradient
- Replaced all hardcoded `#1a2240`, `rgba(7,10,24,*)`, `rgba(18,24,48,*)` across `.card`, `.section`, `.stat-item`, `.party-member`, `.equipment-slot`, `[id$="Modal"] > div`, `#sessionLootDrawerPanel`, inputs, settings groups, etc.
- `body::before` gradient now fully driven by CSS variables
- Files: `styles.css`, `index.html`

### Tooltip Fixes
- `gear-tooltip.js` and `stat-tooltip.js` were hardcoded (`#16213e` background, `'Courier New'` font, `2px solid #d4af37` border)
- Visual styling moved to CSS classes (`.stat-tooltip-panel`, `.gear-tooltip`) so CSS variables actually resolve — inline `style.cssText` only sets positioning/sizing now
- Fixed `.stat-tooltip` class conflict: was `display:inline-flex` (inline label wrapper), floating panel now uses `.stat-tooltip-panel` class instead
- Stat tooltip: `max-width: 460px`, `width: max-content` — no more column layout
- Files: `gear-tooltip.js`, `stat-tooltip.js`, `styles.css`

### Inventory Modal Redesign
- Old: three-column grid (Equipped | Inventory | Sell), inline styles throughout, hardcoded colours
- New: single scrollable flat list, grouped by slot with header labels
  - Equipped row: green left border, Unequip button
  - Inventory rows: Equip + sell price button inline
  - Filter tabs use `.inv-tab` / `.inv-tab--active` CSS classes
  - Modal: max 560px, uses `--window-*` variables, gold scrollbar
- All inline styles on `#inventoryModal` and `#inventoryModalInner` stripped — now CSS-driven
- Files: `inventory-system.js`, `styles.css`, `index.html`

---

## Next Session — Top Priority

**Button style audit.**
Buttons across the UI (character-management.js, combat-log.js, index.html, and others) still use hardcoded inline styles — colours, sizing, padding all bespoke per button. The CSS variable system is now solid enough to do this properly.

Suggested order:
1. `character-management.js` — most player-facing, skill swap modal, detail screen buttons
2. `combat-log.js` — combat history, result screen buttons
3. `index.html` — scattered inline button styles

Approach per file: read all inline-styled buttons, identify recurring patterns, add CSS classes to `styles.css`, replace inline styles with classes. One file per session chunk.

---

## Working Relationship Update

The working relationship document was updated this session. Key additions:

**Destructive Operations — Hard Rules** (new section):
- Bulk file-overwrite scripts require git safety check before running
- Prefer surgical edits over bulk scripts
- Never load all project files simultaneously (has crashed sessions)
- Flag uncertainty about script safety rather than proceeding

**Honest about limitations** (expanded):
- Explicitly permitted to say "I don't know" or "I'm not sure"
- Flag uncertainty before implementing, not after

---

## Carry Forward from Previous Sessions

### Bugs / Pending Review
- `marked` status tooltip wording still incorrect — says "enemies more likely to target you", should reflect allies directed to focus this target
- Profile and role labels should be verified after emoji revert — were text-only after the strip, should now be back to emoji prefixes

### Backlog
- FEAT: Bot pagination on party formation screen — done this session
- FEAT: Polish Discovery Systems — confirm hint fires correctly with level 3 skill and valid partner
- BAL: Higher Level Bots
- FEAT: Summoning
- FEAT: Charming
- FEAT: Async Multiplayer Progression
- FEAT: Assignable Character Progression
- FEAT: Unique/Rare Items
- Mobile layout polish (ongoing)
- New challenges (script reviewed, ready to begin implementation)

---

## Key Constants (unchanged)

- `STAT_SCALE = 300`
- `SUDDEN_DEATH_START = 100`
- Harmony XP: `1 + harmony/750`
- Ambition loot: `baseDropChance × (1 + ambition/500)`
- `untrained_strike` injected at mana < 15%, `costPercent: 0.35`
- Enemy stat scale: `1 + (level - 1) * 0.04`
- Skill combo hint threshold: level >= 3
- Stealth targeting weight: 0.15
- Taunt targeting weight: 4.0
- Browse page size: 8 (party formation companions: 6)
- Bot page size: 6
- Roster page size: 6
