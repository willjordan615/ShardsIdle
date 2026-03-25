# Shards Idle — Session 12 Handoff

---

## Work Completed This Session

### Balance

**Enemy stat scaling**
- Enemy `conviction`, `endurance`, `ambition`, `harmony` now scale with level at spawn time
- Formula: `statScale = 1 + (enemyLevel - 1) * 0.04`
- Stats written directly onto the enemy object — all downstream code (initiative, damage, hit chance, crit) picks them up automatically
- HP/mana/stamina formulas untouched (they already scaled by level)
- File: `backend/combatEngine.js`

**XP penalty for range**
- Replaced soft difficulty scale with steep cliff curve keyed on `avgPartyLevel - recommendedLevel`
- Delta 0: 100% | Delta +3: 73% | Delta +5: 62% | Delta +7: 22% | Delta +10: 5% | Delta +20: 0.3% | Delta +20: 1% floor
- A level 45 character dragging lowbies through level 1 content gets ~1% XP for everyone
- File: `backend/combatEngine.js`

**CONTROL skill timing system**
- New scoring block for `CONTROL` category and skills tagged `control`
- Turn 0-1: ×0.5 (buff window, stay out of the way)
- Turns 2-5: ×2.0 on clean targets, ×1.2 if already debuffed (pure CONTROL); ×1.4 for control-tagged damage skills
- Turns 6-10: ×0.8
- Turn 10+: ×0.5
- Dying target suppression: below 50% HP ×0.5, below 30% ×0.15
- File: `backend/combatEngine.js`

**`control` tag added to hard CC skills**
- 18 non-CONTROL skills with hard CC effects (`stun`, `freeze`, `sleep`, `silence`, `slow`) tagged with `"control"`
- Skills: `absolute_zero`, `arcane_shield_bash`, `deploy_trap_stun`, `earthquake`, `eternal_winter`, `mind_spike`, `neuro_toxin`, `shield_bash`, `sleet`, `smothering_darkness`, `stone_fist`, `storm_hammer`, `storm_of_a_thousand_storms`, `thunder_god`, `thunderclap`, `titan_foot`, `undertow`, `water_bolt`
- File: `backend/data/skills.json`

---

### Features

**Skill combination hints**
- `getComboHints(character, skillID)` added to `game-data.js`
- Fires when skill is level >= 3, other parent is in character's known skills, child not yet discovered
- Returns array of tag/category descriptor strings (e.g. `["physical", "defensive"]`)
- Hint renders in equipped skill card: "⚗ May combine with a physical or defensive skill"
- Tag display map: `beast`→`primal`, tagless parents fall back to category (`DEFENSE`→`defensive` etc.)
- Files: `js/game-data.js`, `js/character-management.js`

**Merchant system overhaul**
- `dismissMerchant()` removed from `showCharacterDetail` — merchant persists until player explicitly sends away
- `rollMerchantAppearance()` now guards against overwriting an active merchant
- `renderMerchant(character)` called at end of `showCharacterDetail` so gold display is always current
- `#merchantNotifier` button added to combat nav — amber pulsing "🛒 Merchant" button appears when merchant spawns, links to character detail, hidden on dismiss
- Files: `js/merchant.js`, `js/character-management.js`, `index.html`, `css/styles.css`

**Session loot aggregation**
- Session loot panel now aggregates all runs into a single list instead of per-run entries
- Duplicate drops shown as `Item ×4`
- Header reads "Received this run:" or "Received over 12 runs:"
- Internal structure changed from `_sessionLoot` array to `_sessionLootAgg` object
- File: `js/combat-log.js`

**Skill card XP progress bar**
- Active equipped skill cards now show a slim gold XP progress bar toward next level
- Formula: `100 * skillLevel * 1.2` threshold
- Same visual language as the discovery section
- File: `js/character-management.js`

**Mobile tooltip fixes**
- All three tooltip systems (`ui-helpers`, `gear-tooltip`, `stat-tooltip`) updated
- Touch devices: long press (400ms) triggers tooltip positioned relative to element, clamped to all four viewport edges, auto-dismisses after 2.5s
- Regular tap cancels the long press timer — normal button interactions unaffected
- One-time mobile hint bar at bottom of character detail: "💡 Long press skills or gear for details" with "Dismiss forever" button (localStorage flag `tooltipHintDismissed`)
- Files: `js/ui-helpers.js`, `js/gear-tooltip.js`, `js/stat-tooltip.js`, `js/character-management.js`, `index.html`

**Upgrades available badge**
- `gearUpgradeBadge` changed from text pill to circular `✦` icon with `data-tooltip="Upgrades available"`
- `display` toggled to `inline-flex` (was `inline`) so icon centres correctly
- Files: `index.html`, `js/character-management.js`

**Header auth/settings visibility**
- `#headerTopBar` moved outside `<header>` in `index.html` so it persists across all screens (header is hidden on non-roster screens)
- `.settings-btn` absolute positioning removed — sits naturally in flex row
- `#headerTopBar` base CSS rule changed from `display:none` to `display:flex` with full layout
- Mobile redundant overrides cleaned up
- Files: `index.html`, `css/styles.css`

---

### Bug Fixes

**`rawDb` temporal dead zone crash**
- `const rawDb = db.getDatabase()` was declared after its first use inside a loop
- Moved declaration above the session ID stamping loop
- File: `backend/routes/combat.js`

**Session loot "Run 1 — Unknown" label**
- Challenge name was not resolving — label simplified to just run number, then replaced entirely by aggregation (see above)
- File: `js/combat-log.js`

**Merchant "No Gold" on buy buttons**
- `renderMerchant` wasn't called when navigating to character detail after merchant spawned
- Fixed by calling `renderMerchant(character)` at end of `showCharacterDetail`
- File: `js/character-management.js`

---

## Files Changed This Session

| File | Change |
|------|--------|
| `backend/combatEngine.js` | Enemy stat scaling, XP range penalty cliff, CONTROL timing system |
| `backend/data/skills.json` | `control` tag on 18 hard CC skills |
| `backend/routes/combat.js` | `rawDb` declaration moved above loop |
| `js/game-data.js` | `getComboHints()` appended |
| `js/character-management.js` | Hint code in skill cards, XP progress bar, merchant re-render, tooltip hint bar, badge inline-flex fix, dismissMerchant removed |
| `js/combat-log.js` | Session loot aggregation |
| `js/merchant.js` | Persist-until-dismissed, double-merchant guard, notifier show/hide |
| `js/ui-helpers.js` | Long press tooltip support, element-relative positioning |
| `js/gear-tooltip.js` | Long press tooltip support, element-relative positioning |
| `js/stat-tooltip.js` | Long press tooltip support, element-relative positioning |
| `css/styles.css` | Settings-btn positioning, headerTopBar always-flex, merchant notifier styles |
| `index.html` | headerTopBar outside header, merchant notifier button, tooltip hint div, upgrades badge icon |

---

## Known Remaining / Not Yet Addressed

**Pending review:**
- FEAT: Polish Discovery Systems — needs a character to reach skill level 3 with a valid partner to confirm hint fires correctly in production

**Backlog:**
- BAL: Higher Level Bots
- FEAT: Summoning
- FEAT: Charming
- FEAT: Async Multiplayer Progression
- BAL: (none remaining — range penalty and enemy scaling done)
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
- Browse page size: 8 (party formation companions: 6)
- Roster page size: 6
