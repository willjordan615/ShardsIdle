// ── Codex ─────────────────────────────────────────────────────────────────

(function () {

    // ── Modal HTML ────────────────────────────────────────────────────────────

    const CODEX_HTML = `
        <!-- CODEX MODAL -->
        <div id="codexModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.88); z-index:2000; overflow-y:auto; backdrop-filter:blur(4px);">
            <div style="max-width:680px; margin:2rem auto; background:linear-gradient(135deg,var(--window-base) 0%,var(--window-deep) 100%); border:1px solid var(--gold-border); border-radius:var(--radius-lg); box-shadow:0 0 60px rgba(0,0,0,0.8), 0 0 30px rgba(212,175,55,0.07); display:flex; flex-direction:column; max-height:88vh; overflow:hidden;">

                <!-- Header -->
                <div style="display:flex; justify-content:space-between; align-items:center; padding:1rem 1.4rem 0.85rem; border-bottom:1px solid var(--gold-border); flex-shrink:0;">
                    <span style="font-family:var(--font-display); color:var(--gold); font-size:0.95rem; letter-spacing:0.08em; text-transform:uppercase;">Field Codex</span>
                    <button onclick="closeCodexModal()" class="danger btn-compact">Close</button>
                </div>

                <!-- Tabs -->
                <div class="settings-tabs" style="margin:0; border-radius:0; flex-shrink:0; padding:0 0.5rem;">
                    <button class="settings-tab"                     id="codex-tab-guide"    onclick="switchCodexTab('guide')">How to Play</button>
                    <button class="settings-tab settings-tab-active" id="codex-tab-skills"   onclick="switchCodexTab('skills')">Skills</button>
                    <button class="settings-tab"                     id="codex-tab-combos"   onclick="switchCodexTab('combos')">Combinations</button>
                    <button class="settings-tab"                     id="codex-tab-stats"    onclick="switchCodexTab('stats')">Statistics</button>
                    <button class="settings-tab"                     id="codex-tab-combat"   onclick="switchCodexTab('combat')">Combat</button>
                    <button class="settings-tab"                     id="codex-tab-statuses" onclick="switchCodexTab('statuses')">Statuses</button>
                </div>

                <!-- Scrollable content -->
                <div style="overflow-y:auto; padding:1.4rem 1.5rem; flex:1; scrollbar-width:thin; scrollbar-color:var(--gold-dim) transparent;">

                    <!-- ── HOW TO PLAY ── -->
                    <div id="codex-pane-guide" style="display:none;">

                        <div class="codex-section-label">The Game Loop</div>
                        <p>Shards Idle is an asynchronous idle RPG. You build a party, select a challenge, and let combat run. The game observes how long your party takes to complete a run, then uses that average to simulate wins and losses over time — even when you're not watching. Come back later to collect rewards, upgrade your loadout, and push to harder content.</p>
                        <p>You don't need to watch every fight. You're meant to check in, adjust, and leave again.</p>

                        <div class="codex-section-label">Party Composition</div>
                        <p>The game is designed around a party of four. Your character is one slot — the other three are filled by other players' characters or <strong style="color:var(--gold-bright);">bots</strong>. Bots are functional but limited: they use basic skill selections and don't adapt the way a real character does. A party of real players will consistently outperform a bot-filled one. Use the party formation screen to invite other players when you can.</p>

                        <div class="codex-section-label">Skills</div>
                        <p>Your character equips two active skills that fire in combat. Skills are learned from loot drops and upgraded over time. What you equip shapes how the combat AI plays your character — a healer-spec'd character should have healing skills equipped, not damage ones. The <strong style="color:var(--gold-bright);">Skills</strong> tab in this codex covers the full skill system, starter skills, and how skill combinations work.</p>

                        <div class="codex-section-label">Gear and Consumables</div>
                        <p>Gear drops from challenge loot tables and improves your stats directly. Higher-tier gear scales with challenge difficulty — there's no point farming tier 0 gear past the early game. Consumables sit in your belt slots and are used automatically in combat according to your combat style. Stock them before a run and they'll fire when the conditions are right.</p>

                        <div class="codex-section-label">Selecting a Challenge</div>
                        <p>From the character screen, use <strong style="color:var(--gold-bright);">Go to Map</strong> to open the Silver Vale. Challenges are pinned to the map — click a node to see its difficulty, lore, and requirements, then select it to proceed to party formation. Challenges you're close to in level will be visible; ones far above you will be obscured.</p>

                        <div class="codex-section-label">Early Challenges</div>
                        <p>The first few difficulty tiers are short and meant to be cleared quickly. Don't sit on the starting challenge longer than it takes to get a weapon upgrade and a feel for the combat log. Move up. The game opens up once you're past the tutorial tier.</p>

                        <div class="codex-section-label">Reading the Combat Log</div>
                        <p>Open the combat log and watch a full run. A single run gives you a real completion time — the game uses that as your baseline for idle simulation. A minute or two of observation is enough to know whether your party is comfortable with a challenge or struggling. If runs are timing out or ending in wipes, your gear or party composition needs work before you go idle.</p>
                        <p>When you're ready to change challenges — close the idle loop, swap skills or gear on your character, update your party, and select a new challenge from the map. The loop resets cleanly.</p>

                        <div style="margin-top:2rem; padding-top:1.2rem; border-top:1px solid var(--gold-border); display:flex; justify-content:flex-end;">
                            <button onclick="dismissGuideForever()" style="font-family:var(--font-display); font-size:0.78rem; letter-spacing:0.1em; text-transform:uppercase; background:var(--ink-mid); color:var(--gold); border:1px solid var(--gold-border); padding:0.6rem 1.2rem; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--gold-border)'">Got it — don't show again</button>
                        </div>

                    </div>

                    <!-- ── SKILLS ── -->
                    <div id="codex-pane-skills">
                        <div class="codex-section-label">The Skill System</div>
                        <p>Your character begins with access to sixteen <strong style="color:var(--gold-bright);">Starter Skills</strong> — the foundational abilities from which everything else grows. These are not the most powerful skills in the game. They are roots.</p>

                        <div class="section" style="margin:1rem 0;">
                            <div style="color:var(--gold-dim); font-size:0.72rem; letter-spacing:0.09em; text-transform:uppercase; margin-bottom:0.6rem;">Starter Skills</div>
                            <div id="codex-starter-pills" style="display:flex; flex-wrap:wrap; gap:5px;"></div>
                        </div>

                        <p>Skills grow through use. Each time a skill fires in combat it accumulates experience. At <strong style="color:var(--gold-bright);">level 3</strong> a skill will show a hint about what it might combine with. Higher skill levels increase the damage and effectiveness of that skill directly. A skill does not need to be equipped to gain XP — it only needs to be known.</p>

                        <div class="codex-section-label">Learning Skills</div>
                        <p>There is no cap on how many skills your character can learn — the only gate is time and development. You can know dozens of skills. You equip <strong style="color:var(--gold-bright);">two active skills</strong> at a time, which are what your character uses in combat. You can change which two are equipped freely between challenges. Your combat style determines which equipped skill gets prioritised each turn.</p>

                        <div class="codex-section-label">Skill Categories</div>
                        <p>Every skill has a category that describes its combat role. The AI profiles use these to decide what to cast and when.</p>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.45rem 1.5rem; margin:0.6rem 0 1rem; font-size:0.83rem; color:var(--text-secondary);">
                            <div><span style="color:var(--gold-bright);">Damage — Single</span><br>Hits one target hard. Usually your primary offensive option.</div>
                            <div><span style="color:var(--gold-bright);">Damage — Magic</span><br>Elemental or arcane. Bypasses physical armor, subject to resistances.</div>
                            <div style="margin-top:0.4rem;"><span style="color:var(--gold-bright);">Damage — AOE</span><br>Hits all enemies. Lower per-target but efficient against groups.</div>
                            <div style="margin-top:0.4rem;"><span style="color:var(--gold-bright);">Control</span><br>Debuffs, disrupts, or repositions. Often sets up other skills.</div>
                            <div style="margin-top:0.4rem;"><span style="color:var(--gold-bright);">Defense</span><br>Reduces incoming damage or improves evasion.</div>
                            <div style="margin-top:0.4rem;"><span style="color:var(--gold-bright);">Healing</span><br>Restores HP. Prioritised by cautious and support profiles.</div>
                            <div style="margin-top:0.4rem;"><span style="color:var(--gold-bright);">Buff</span><br>Strengthens you or allies. Cast early in a fight, rarely after turn 10.</div>
                            <div style="margin-top:0.4rem;"><span style="color:var(--gold-bright);">Utility</span><br>Manages resources, sets up conditions, enables other skills.</div>
                        </div>

                        <div class="codex-section-label">Resources</div>
                        <p>Skills cost either <span style="color:var(--blue);">Mana</span> or <span style="color:var(--gold);">Stamina</span>. These pools carry between stages — a character who burns everything in the first fight will be dry by the third. When resources run low, your character shifts to desperation skills — a reduced set chosen for low cost — rather than going completely silent.</p>
                    </div>

                    <!-- ── COMBOS ── -->
                    <div id="codex-pane-combos" style="display:none;">
                        <div class="codex-section-label">Skill Combinations</div>
                        <p>Most skills cannot be learned directly. They are <strong style="color:var(--gold-bright);">discovered</strong> by combining two skills you already know. When both parent skills are developed enough, the child unlocks automatically — no crafting, no cost.</p>
                        <p>Hints appear on a skill card once it reaches level 3. A hint like <em style="color:var(--text-muted);">"May combine with: physical"</em> means one of its combination partners has a physical tag. Find that partner among your other known skills.</p>

                        <div class="section" style="margin:1rem 0;">
                            <div style="color:var(--gold-dim); font-size:0.72rem; letter-spacing:0.09em; text-transform:uppercase; margin-bottom:0.6rem;">Example Chains</div>
                            <div style="display:flex; flex-direction:column; gap:0.1rem; margin-top:0.4rem;">
                                <div class="codex-combo-row"><span class="c-parent">Aim</span><span class="c-arrow">+</span><span class="c-parent">Sense</span><span class="c-arrow">—</span><span class="c-result">Weak Point</span><span class="c-note">armor-piercing setup strike</span></div>
                                <div class="codex-combo-row"><span class="c-parent">Aim</span><span class="c-arrow">+</span><span class="c-parent">Footwork</span><span class="c-arrow">—</span><span class="c-result">Skirmish</span><span class="c-note">mobile hit-and-run</span></div>
                                <div class="codex-combo-row"><span class="c-parent">Basic Attack</span><span class="c-arrow">+</span><span class="c-parent">Footwork</span><span class="c-arrow">—</span><span class="c-result">Lunge</span><span class="c-note">high-damage charge</span></div>
                                <div class="codex-combo-row"><span class="c-parent">Lunge</span><span class="c-arrow">+</span><span class="c-parent">Arcane Bolt</span><span class="c-arrow">—</span><span class="c-result">Arcane Lunge</span><span class="c-note">magic-infused charge</span></div>
                                <div class="codex-combo-row"><span class="c-parent">Channel</span><span class="c-arrow">+</span><span class="c-parent">Shock</span><span class="c-arrow">—</span><span class="c-result">Lightning</span><span class="c-note">raw elemental blast</span></div>
                                <div class="codex-combo-row"><span class="c-parent">Shock</span><span class="c-arrow">+</span><span class="c-parent">Chill</span><span class="c-arrow">—</span><span class="c-result">Sleet</span><span class="c-note">storm AOE</span></div>
                                <div class="codex-combo-row"><span class="c-parent">Prayer</span><span class="c-arrow">+</span><span class="c-parent">First Aid</span><span class="c-arrow">—</span><span class="c-result">Holy Light</span><span class="c-note">blessed healing</span></div>
                                <div class="codex-combo-row"><span class="c-parent">Slash</span><span class="c-arrow">+</span><span class="c-parent">Sense</span><span class="c-arrow">—</span><span class="c-result">Blood Letting</span><span class="c-note">inflicts deep bleed</span></div>
                                <div class="codex-combo-row"><span class="c-parent">Shadow Bolt</span><span class="c-arrow">+</span><span class="c-parent">Misdirect</span><span class="c-arrow">—</span><span class="c-result">Shadow Veil</span><span class="c-note">stealth and concealment</span></div>
                            </div>
                        </div>

                        <div class="codex-section-label">The Tree Goes Deep</div>
                        <p>Child skills can themselves be parents of deeper combinations. A depth-4 skill requires two depth-3 skills, each of which required two depth-2 skills. The further down the tree, the more powerful and specialised the result. The investment is the point — these skills are not meant to be accessible early.</p>

                        <div class="codex-section-label">Your Build Is a Path, Not a Collection</div>
                        <p>Combination chains branch. The skills you develop early determine which paths open later. A character who went <em>Aim + Footwork</em> is on a different trajectory than one who went <em>Aim + Sense</em> — even though both started from the same root. You cannot follow every branch. Choosing a direction and committing to it is more effective than spreading attention across many starters.</p>

                        <div class="section" style="margin:1rem 0; border-color:rgba(76,217,100,0.2);">
                            <div style="color:var(--green); font-size:0.72rem; letter-spacing:0.09em; text-transform:uppercase; margin-bottom:0.4rem;">Tip</div>
                            <p style="margin:0;">If a hint mentions a tag you don't recognise, it may belong to a skill you haven't unlocked yet. The hint is showing you where the path leads — not necessarily something you can act on immediately.</p>
                        </div>
                    </div>

                    <!-- ── STATS ── -->
                    <div id="codex-pane-stats" style="display:none;">
                        <div class="codex-section-label">The Four Statistics</div>
                        <p>Every character has four statistics. These come from your race and from equipped gear — they do not increase automatically on level up. Finding and equipping better items is how you grow stronger.</p>

                        <div style="margin:1rem 0;">
                            <div class="codex-stat-bar" style="color:#e07040;">
                                <strong>Conviction</strong>
                                Commitment and force. The primary offensive stat for fighters and strength-based builds.
                                <ul style="margin:0.4rem 0 0 1rem; padding:0; font-size:0.81rem; color:var(--text-muted); list-style:none;">
                                    <li>Increases maximum HP and Stamina</li>
                                    <li>Raises hit chance on all attacks</li>
                                    <li>Amplifies damage for fighter and strength-based skills</li>
                                    <li>Scales fire, arcane, lightning, holy, and shadow magic</li>
                                    <li>Raises your damage ceiling — high Conviction characters hit harder at their peak</li>
                                    <li>Small contributor to critical strike chance</li>
                                </ul>
                            </div>
                            <div class="codex-stat-bar" style="color:#6090d0;">
                                <strong>Endurance</strong>
                                Durability and sustain. A survivability stat first — it contributes modestly to physical damage, but you do not stack it for offense.
                                <ul style="margin:0.4rem 0 0 1rem; padding:0; font-size:0.81rem; color:var(--text-muted); list-style:none;">
                                    <li>Significantly increases maximum HP and Stamina</li>
                                    <li>Reduces the stamina cost of skills — high Endurance characters sustain expensive skills longer</li>
                                    <li>Drives stamina regeneration between actions</li>
                                    <li>Contributes a small bonus to physical attack damage</li>
                                    <li>The defining stat of bruiser-style skills</li>
                                    <li>Does not affect hit chance, crit, or magic damage</li>
                                </ul>
                            </div>
                            <div class="codex-stat-bar" style="color:var(--gold);">
                                <strong>Ambition</strong>
                                Speed, cunning, and hunger. The primary offensive stat for rogues and skirmishers, and for lightning, shadow, and arcane mages.
                                <ul style="margin:0.4rem 0 0 1rem; padding:0; font-size:0.81rem; color:var(--text-muted); list-style:none;">
                                    <li>Primary driver of critical strike chance</li>
                                    <li>Increases attack speed — Ambition characters act faster than their weapons suggest</li>
                                    <li>Amplifies damage for rogue and finesse-based skills</li>
                                    <li>Scales lightning, shadow, and arcane magic</li>
                                    <li>Improves retreat success chance</li>
                                    <li>Increases item drop chance</li>
                                </ul>
                            </div>
                            <div class="codex-stat-bar" style="color:#9060d0;">
                                <strong>Harmony</strong>
                                Attunement and consistency. The primary stat for ice, holy, and nature/poison mages — and the dominant stat for healers and supports.
                                <ul style="margin:0.4rem 0 0 1rem; padding:0; font-size:0.81rem; color:var(--text-muted); list-style:none;">
                                    <li>Significantly increases maximum Mana</li>
                                    <li>Powers all healing and restoration skills</li>
                                    <li>Scales ice, cold, holy, nature, and poison magic damage</li>
                                    <li>Compresses damage variance — high Harmony characters hit reliably rather than swinging wildly</li>
                                    <li>Drives mana regeneration between actions</li>
                                    <li>Increases XP earned from combat</li>
                                    <li>No effect on fire, arcane, lightning, or shadow damage</li>
                                </ul>
                            </div>
                        </div>

                        <div class="codex-section-label">Stats and Skill Damage</div>
                        <p>Each skill has scaling factors — weighted contributions from one or more stats to its damage or healing. A skill with high Ambition scaling rewards characters who have invested in Ambition through their gear. Reading what a skill scales with tells you what build it belongs to.</p>

                        <div class="codex-section-label">HP, Mana, and Stamina</div>
                        <p>These derived resources are calculated from your stats and level. Endurance drives HP and Stamina. Harmony drives Mana. Both grow with level but are strongly amplified by stat values — a well-geared character at a given level has dramatically more resources than one with bare equipment.</p>
                    </div>

                    <!-- ── COMBAT ── -->
                    <div id="codex-pane-combat" style="display:none;">
                        <div class="codex-section-label">How Combat Works</div>
                        <p>Combat is fully automated. Your character acts each turn according to their <strong style="color:var(--gold-bright);">Combat Style</strong>, set on the character screen. The style determines which skills are prioritised, when resources are conserved, and how aggressively the character pushes.</p>

                        <div class="codex-section-label">Challenges and Stages</div>
                        <p>Each challenge is made up of multiple stages. HP, Mana, and Stamina carry between stages — there is no reset between fights. A character who burns everything in stage one will be dry by stage three. Resource management across the whole challenge is a core part of the game.</p>

                        <div class="codex-section-label">Damage Resolution</div>
                        <div style="margin:0.5rem 0 1rem;">
                            <div class="codex-step"><span class="codex-step__n">1.</span><span>Skill base power, multiplied by skill level bonus</span></div>
                            <div class="codex-step"><span class="codex-step__n">2.</span><span>Weapon damage added — physical skills use the full weapon value; magic skills draw from a blended pool</span></div>
                            <div class="codex-step"><span class="codex-step__n">3.</span><span>Stat scaling applied across the full damage pool</span></div>
                            <div class="codex-step"><span class="codex-step__n">4.</span><span>Armor reduction applied (diminishing returns — the first points matter most)</span></div>
                            <div class="codex-step"><span class="codex-step__n">5.</span><span>Elemental resistances applied per damage type</span></div>
                            <div class="codex-step"><span class="codex-step__n">6.</span><span>Critical hit multiplier applied if the roll succeeds</span></div>
                            <div class="codex-step"><span class="codex-step__n">7.</span><span>Active status effect modifiers applied</span></div>
                        </div>

                        <div class="codex-section-label">Armor and Resistances</div>
                        <p>Physical armor reduces physical damage with diminishing returns. Elemental resistances reduce specific damage types separately. Magic skills bypass physical armor but are subject to resistances. Skills with <strong style="color:var(--gold-bright);">armor ignore</strong> bypass a portion of the target's armor regardless of its value.</p>

                        <div class="codex-section-label">Sudden Death</div>
                        <p>If a fight reaches turn 100 without resolution, sudden death triggers. This is a safety valve and should not be routine. If it is happening regularly, your damage output is too low for the challenge. Check your weapon tier, skill levels, and whether your stat distribution matches your equipped skills.</p>

                        <div class="codex-section-label">Global Drop</div>
                        <p>A hidden bonus loot chance accumulates as you run challenges. Each stage completed without triggering it increases the chance. When it fires, a random item drops from a broad pool. Switching challenges resets the accumulation — committing to a single challenge builds the stack faster.</p>

                        <div class="codex-section-label">Dual Wielding</div>
                        <p>Equipping a one-handed weapon in both the main hand and off hand enables dual wield. On any single-target attack, there is a <strong style="color:var(--gold-bright);">40% chance</strong> to echo the skill as an offhand strike — a second hit using the off hand weapon's damage and procs at <strong style="color:var(--gold-bright);">30% power</strong>. Your character's stats apply fully to the echo. The offhand weapon's on-hit procs can also trigger independently on the echo hit.</p>
                        <p style="color:var(--text-muted); font-size:0.82rem;">Echo hits only fire on single-target skills. AOE and magic skills do not trigger the offhand.</p>
                    </div>

                    <!-- ── STATUSES ── -->
                    <div id="codex-pane-statuses" style="display:none;">
                        <div class="codex-section-label">Debuffs</div>
                        <div id="codex-statuses-debuffs"></div>
                        <div class="codex-section-label" style="margin-top:1.2rem;">Buffs</div>
                        <div id="codex-statuses-buffs"></div>
                    </div>

                </div><!-- end scroll area -->
            </div>
        </div>
        <!-- END CODEX MODAL -->
    `;

    document.addEventListener('DOMContentLoaded', function () {
        document.body.insertAdjacentHTML('beforeend', CODEX_HTML);
        document.getElementById('codexModal').addEventListener('click', function (e) {
            if (e.target === this) closeCodexModal();
        });
    });

    // ── Starter skill pills ───────────────────────────────────────────────────

    const _CODEX_STARTERS = [
        'Aim','Attunement','Basic Attack','Block','Channel',
        'Chill','First Aid','Focus','Footwork','Misdirect',
        'Prayer','Produce Flame','Rest','Sense','Shock','Shout','Shove'
    ];

    // ── Public API ────────────────────────────────────────────────────────────

    window.openCodexModal = function (tab) {
        const pills = document.getElementById('codex-starter-pills');
        if (pills && !pills.dataset.rendered) {
            pills.innerHTML = _CODEX_STARTERS.map(s =>
                `<span class="skill-tag">${s}</span>`
            ).join('');
            pills.dataset.rendered = '1';
        }
        document.getElementById('codexModal').style.display = 'block';
        switchCodexTab(tab || 'skills');
    };

    window.closeCodexModal = function () {
        document.getElementById('codexModal').style.display = 'none';
    };

    window.switchCodexTab = function (tab) {
        ['guide','skills','combos','stats','combat','statuses'].forEach(function (t) {
            document.getElementById('codex-pane-' + t).style.display = t === tab ? '' : 'none';
            const btn = document.getElementById('codex-tab-' + t);
            if (btn) btn.classList.toggle('settings-tab-active', t === tab);
        });
        if (tab === 'statuses') _renderCodexStatuses();
    };

    window.dismissGuideForever = function () {
        localStorage.setItem('si_guide_dismissed', '1');
        closeCodexModal();
    };

    // ── Internal ──────────────────────────────────────────────────────────────

    function _renderCodexStatuses() {
        const debuffsEl = document.getElementById('codex-statuses-debuffs');
        const buffsEl   = document.getElementById('codex-statuses-buffs');
        if (debuffsEl.dataset.rendered) return;

        const statuses = (window.gameData && window.gameData.statuses) ? window.gameData.statuses : [];
        const debuffs  = statuses.filter(s => s.type === 'debuff');
        const buffs    = statuses.filter(s => s.type === 'buff');

        function renderGroup(el, list) {
            el.innerHTML = list.map(s => `
                <div id="codex-status-${s.id}" style="margin-bottom:0.9rem; padding-bottom:0.9rem; border-bottom:1px solid rgba(255,255,255,0.06);">
                    <div style="font-weight:700; color:var(--gold-bright); font-size:0.85rem; margin-bottom:0.2rem;">${s.name}</div>
                    <div style="color:var(--text-secondary); font-size:0.8rem; line-height:1.5;">${s.description}</div>
                </div>`).join('');
        }

        renderGroup(debuffsEl, debuffs);
        renderGroup(buffsEl,   buffs);
        debuffsEl.dataset.rendered = '1';
    }

}());
