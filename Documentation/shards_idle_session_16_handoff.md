# Shards Idle — Session 16 Handoff

## Work Completed This Session

### Button Style Audit — Complete
The full inline button/style audit is done across all non-admin JS files and index.html. No more hardcoded colours or inline sizing on player-facing buttons. Files changed: `character-management.js`, `combat-log.js`, `index.html`, `browse-system.js`, `merchant.js`. `admin-panel.js` intentionally skipped.

Key CSS classes added to `styles.css`:
- `.skill-card`, `.btn-swap` — skill slot cards and Change/Equip Skill buttons
- `.stat-name-btn` — stat expand/collapse toggle (suppresses global shimmer)
- `#skillSwapModal`, `#skillSwapModal > div`, `#skillSwapTitle`, `#skillSwapList` — skill swap modal fully CSS-driven
- `.history-entry`, `.__header`, `.__challenge`, `.__meta`, `.__actions`, `.__stage`, `.__textlog` — combat history modal entries
- `.btn-history-log`, `.btn-history-replay` — View Log / Replay buttons
- `#tooltipHint`, `.btn-dismiss-hint` — mobile tooltip hint banner
- `.sudden-death-turn`, `.child-skill-turn`, `.status-turn` — combat log turn variants
- `.stage-outcome-label`, `.summary-turn .turn-message` — stage result display
- `#combatToast`, `.toast-header`, `.toast-timer`, `.toast-actions`, `.btn-toast-watch`, `.btn-toast-stop` — next-run countdown toast
- `.skill-xp-row`, `.__name`, `.__level`, `.__gain`, `.__discovery-*` — skill XP section in result modal
- `.discovery-fanfare`, `.__title`, `.__skill-name`, `.__skill-desc`, `.__skill-cat` — unlock fanfare block
- `.btn-close` — bare-chrome × dismiss buttons in modals
- `.btn-scroll-resume` — scroll-to-bottom pill in battle log
- `.btn-loot-action` — session loot Clear/✕ buttons
- `.btn-full`, `.btn-full--spaced` — full-width action buttons (auth, Begin Challenge)
- `.btn-compact` — small secondary buttons (Combat History, Settings close)
- `.btn-minor` — de-emphasised inline buttons (Inventory)
- `.auth-tab-btn`, `.auth-tab-btn.active` — auth modal tabs (flex:1 and opacity now in CSS)
- `.browse-card`, `.browse-card__own-label` — browse result cards
- `.browse-stat-cell`, `.__label`, `.__value` — stat cells in browse cards
- `.companion-stat-cell`, `.__label`, `.__value` — denser stat cells in companion cards
- `.skill-tag` — gold pill skill name tags (browse, companion, bot cards)
- `.role-badge`, `.role-badge--sm` — role label pills
- `.bot-role-badge` — bot role pill (color/border still inline, data-driven)
- `.browse-pagination`, `.__info`, `.__total` — pagination nav rows
- `.color-green`, `.color-gold`, `.color-red`, `.color-red-soft`, `.color-blue` — semantic color utilities
- `#merchantSlot > div`, `.merchant-header`, `.merchant-name`, `.merchant-greeting`, `#merchantStock`, `.merchant-stock-entry`, `.merchant-item-name`, `.merchant-item-qty`, `.merchant-item-footer`, `.merchant-item-price`, `.btn-merchant-buy` — full merchant panel
- `--font-mono` added to CSS root vars

### Bug Fix — Unknown Skill Graceful Fallback
When a skill ID is no longer found in game data (e.g. after a rename like hunters_mark → call_target), the slot previously showed "Unknown Skill: [id]" to the player. Now renders as an empty slot with "Skill unavailable — please select a replacement." and a functional Equip Skill button. Bad ID logged to console only.
- File: `character-management.js`

### Bug Fix — Provoke Taunting the Player
When Provoke procced as a child skill from Block (a self-targeting DEFENSE skill), it was inheriting Block's self-target and applying taunt to the player's own character. Root cause: Provoke was categorised as `DEFENSE`, hitting the "buff/defense = target self" branch in child proc targeting.
- Fix: `provoke` category changed `DEFENSE` → `CONTROL`
- File: `skills.json`

### Skill Category Audit — All Taunt Skills
Following the provoke fix, all skills that apply taunt were audited. Taunt is crowd control by definition regardless of damage component — all taunt skills should be CONTROL so the engine scores and targets them correctly.

Changed to `CONTROL`:
- `provoke` (was DEFENSE)
- `jeer` (was DEFENSE)
- `intimidate` (was DEFENSE)
- `goad` (was DAMAGE_SINGLE)
- `incite` (was DAMAGE_SINGLE)
- `infuriate` (was DAMAGE_SINGLE)

File: `skills.json`

### Aggressive AI Profile Overhaul
Profile description and scoring logic updated to match actual behaviour. Aggressive now plays in two phases based on target HP:

**Target healthy (> 75% HP):** Behaves opportunistically — sets up debuffs and damage buffs, boosts damage on already-debuffed targets (×1.8).

**Blood drawn (≤ 75% HP):** Shifts to kill-securing mode — heavy damage boost (×2.2), further escalation below 40% (×1.4 on top). Heavily suppresses non-damage skills.

Healing suppression (×0.5) removed — the 15% emergency threshold already gates when healing fires; additional suppression was risking death.

Files: `combatEngine.js`, `character-management.js` (description updated)

### AI Principle Established
**Profile weights express preference among options, not permission to use a skill.** Players have 2 skill slots. If a skill is equipped, it should fire sometimes regardless of profile. Multipliers of 0.05 or 0.25 on a 2-slot character effectively silence a deliberate player choice. This principle should be respected in all future AI tuning — use moderate penalties (0.5–0.7) for off-profile skills, never near-zero suppression.

### marked Status Wording Fixed
Description and tooltip were backwards — implied the marked target was a player being hunted by enemies. Actually a debuff applied to enemies to direct allied targeting. Fixed manually by developer.

---

## Next Session — Top Priority

No outstanding bugs. Backlog items to pick from:

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

## Working Relationship Update

**AI Profile Tuning Principle** (new):
When adjusting AI scoring weights, remember players have very few skill slots. A multiplier low enough to effectively silence a skill is overriding a deliberate player choice. Moderate penalties are fine; near-zero suppression is not. Push back if a proposed weight would make an equipped skill effectively never fire.

**Banter encouraged:**
The developer wants genuine disagreement before capitulation. If there's a real tradeoff or a better answer, say so first. Don't agree immediately just because they pushed back. One exchange of genuine disagreement is better than silent compliance.

---

## Carry Forward

### Bugs / Pending Review
- Profile and role labels — verify emoji prefixes are correct after Session 14 git revert
- Emojis in data files — present and acknowledged. Manual removal deferred indefinitely; do not attempt scripted removal.

### Key Constants (unchanged)
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
