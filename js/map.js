(function () {

// ── DATA ────────────────────────────────────────────────────────────────────

const MAP_CHALLENGES = [
  {id:"whispering_willow_shrine",name:"Whispering Willow Shrine",diff:1,minLvl:1,tags:["nature","sacred"],xp:37.1,yp:78.8,lore:"The Order of the Verdant Word dissolved not from heresy but from debt. The willow circle grew on its own in a single season after the monks left."},
  {id:"grizzlethorn_encampment",name:"Grizzlethorn Encampment",diff:1,minLvl:1,tags:["goblin","woodland"],xp:33.4,yp:73.1,lore:"The halfling families who hunted this wood remember it differently. They call it the Greywood now, and none of them will say why."},
  {id:"moonlit_ferry",name:"The Moonlit Ferry",diff:2,minLvl:5,tags:["spirit","coastal"],xp:23.4,yp:81.4,lore:"The ferry runs whether you board it or not. It has been running for thirty years without a living hand on the oar."},
  {id:"blighted_orchard",name:"The Blighted Orchard",diff:2,minLvl:5,tags:["nature","corrupted"],xp:30.1,yp:61.5,lore:"The Withered Choir does not believe it is suffering. They sing while they work, close enough to the old hymns that travelers sometimes stop."},
  {id:"vultures_perch",name:"The Vulture's Perch",diff:2,minLvl:5,tags:["martial","mercenary"],xp:73.5,yp:56.4,lore:"The Vulture Company did not start as bandits. Most of them were soldiers. Some of them were good ones."},
  {id:"burnt_outpost",name:"The Burnt Outpost",diff:3,minLvl:10,tags:["fire","corrupted"],xp:34.1,yp:69.9,lore:"The Royal Guard report lists the outpost as destroyed by fire of unknown origin. The mage is listed as deceased. He is not."},
  {id:"kennels_wolfs_head",name:"Kennels of Wolf's Head",diff:3,minLvl:10,tags:["beast","martial"],xp:76.8,yp:43.6,lore:"The Alpha has been here longer than any of the Keepers. The Keepers think they manage it. They do not manage it."},
  {id:"broken_axle_crossing",name:"Broken Axle Crossing",diff:3,minLvl:10,tags:["dwarven","mountain"],xp:86.2,yp:58.3,lore:"Banner-Captain Kaelen keeps a precise ledger of everything seized. Command has stopped acknowledging receipt."},
  {id:"salt_wept_beacon",name:"Salt-Wept Beacon",diff:4,minLvl:15,tags:["coastal","spirit"],xp:12.7,yp:78.8,lore:"The ships that follow the beacon light do not survive the rocks. The Salt-Wept believe they are guiding them safely."},
  {id:"whispering_athenaeum",name:"The Whispering Athenaeum",diff:4,minLvl:15,tags:["arcane","sacred"],xp:28.1,yp:43.6,lore:"The preservation ritual was intended to make the texts permanent. It worked. So will the scribes writing when the ink made contact."},
  {id:"sealed_excavation",name:"The Sealed Excavation",diff:4,minLvl:15,tags:["dwarven","arcane"],xp:96.2,yp:35.9,lore:"The Ward-Core is not a spirit. It is a memory — the accumulated memory of every Verdant Word blessing ever performed in the Silver Vale."},
  {id:"shrine_first_oath",name:"Shrine of the First Oath",diff:5,minLvl:20,tags:["sacred","oath"],xp:25.7,yp:36.5,lore:"The pact was specific. Song and silver, seasonally. The halflings stopped when Bram died. The spirits noticed immediately."},
  {id:"bastion_fractured_ward",name:"Bastion of the Fractured Ward",diff:5,minLvl:20,tags:["martial","arcane"],xp:66.8,yp:69.2,lore:"The priests abandoned the ward when the dissolution order came. The soldiers had no warning. The priests survived."},
  {id:"guildhall_silent_trade",name:"Guildhall of Silent Trade",diff:5,minLvl:20,tags:["mercenary","martial"],xp:77.2,yp:82.1,lore:"The Guildhall has been sealed for four years. The Verdant Auditors have been petitioning for access for three."},
  {id:"ancestral_forge",name:"The Ancestral Forge",diff:6,minLvl:25,tags:["dwarven","arcane"],xp:81.8,yp:27.6,lore:"The seals required the kingdom to be united before entry. Both factions broke them on the same day using the same intelligence."},
  {id:"marsh_broken_oaths",name:"Marsh of Broken Oaths",diff:6,minLvl:25,tags:["oath","corrupted"],xp:39.4,yp:94.9,lore:"The Tidebound Vanguard chose this location specifically. The corrupted residue responds to the water spirit's frequency. It is an amplifier."},
  {id:"watchtower_northern_lights",name:"Watchtower of Northern Lights",diff:6,minLvl:25,tags:["dwarven","undead"],xp:92.9,yp:11.8,lore:"The monitoring crystal records the water spirit's pattern. It is moving deliberately, in a specific direction, toward a specific point."},
  {id:"sunken_sanctum",name:"Sunken Sanctum of Aethelgard",diff:7,minLvl:30,tags:["coastal","arcane"],xp:3.5,yp:59.6,lore:"The ritual that sank Aethelgard was not meant to bind the spirit. The original text called it an invitation. The spirit accepted."},
  {id:"hall_ancestral_echoes",name:"Hall of Ancestral Echoes",diff:7,minLvl:30,tags:["dwarven","sacred"],xp:67.1,yp:19.9,lore:"The Hall requires a unanimous verdict from the Stone Jurors before recognizing a new king. The verdict has been unanimous throughout."},
  {id:"stonetusk_forward_camp",name:"Stone-Tusk Forward Camp",diff:7,minLvl:30,tags:["orc","martial"],xp:70.1,yp:31.4,lore:"Krog's raiding doctrine: supply lines only, no settlements, no civilians. The discipline is the only thing preventing something worse."},
  {id:"spire_silent_conviction",name:"Spire of Silent Conviction",diff:7,minLvl:30,tags:["arcane","undead"],xp:54.8,yp:39.7,lore:"The Capital sealed the Spire the day after the dissolution. The official reason given was magical contamination."},
  {id:"gallery_fractured_light",name:"Gallery of Fractured Light",diff:8,minLvl:35,tags:["elven","nature"],xp:16.7,yp:10.9,lore:"The Fraying is the visible residue of broken oaths. The Elves sealed themselves away. They chose quarantine over help."},
  {id:"ironvein_relay",name:"The Ironvein Relay",diff:8,minLvl:35,tags:["dwarven","undead"],xp:91.9,yp:47.4,lore:"The cargo manifests are sealed. The Frostbite Conscripts took an oath of preservation. The war did not end."},
  {id:"vultures_roost",name:"The Vulture's Roost",diff:8,minLvl:35,tags:["mercenary","martial"],xp:84.8,yp:74.4,lore:"The Roost is the Vulture Company's true stronghold. The Perch was a waypoint. What they guard here has never been inventoried."},
  {id:"tidebound_forward_basin",name:"Tidebound Forward Basin",diff:9,minLvl:40,tags:["coastal","arcane"],xp:5.0,yp:39.7,lore:"Watch Commander Thrain sent three warnings to the Capital. The third was never acknowledged. That was five years ago."},
  {id:"frayed_outpost",name:"Frayed Outpost",diff:9,minLvl:40,tags:["arcane","undead"],xp:42.8,yp:62.8,lore:"The ward held for fifty years. When it fractured, the energy released took the form of every oath ever sworn in its presence."},
  {id:"merchants_ledger_vault",name:"Merchant's Ledger Vault",diff:9,minLvl:40,tags:["mercenary","oath"],xp:81.5,yp:87.8,lore:"The vault does not contain trade goods. It contains evidence. The Guild has been waiting for the right moment to use it."},
  {id:"barricades_of_sorrow",name:"Barricades of Sorrow",diff:10,minLvl:45,tags:["martial","corrupted"],xp:72.1,yp:78.2,lore:"The Royal Guard isn't protecting people. They are containing them. The Fraying feeds on the despair outside the gates."},
  {id:"field_shattered_vows",name:"Field of Shattered Vows",diff:10,minLvl:45,tags:["shadow","corrupted"],xp:44.1,yp:53.8,lore:"The field was the site of the last alliance before the Order dissolved. The Fraying here is particularly dense. It remembers."},
  {id:"chamber_of_petitioners",name:"Chamber of Petitioners",diff:10,minLvl:45,tags:["dwarven","arcane"],xp:76.8,yp:35.9,lore:"The Ancestral Constructs view both claimants as usurpers. Their criteria for legitimacy have not changed in four hundred years."},
  {id:"coronation_of_stone",name:"Coronation of Stone",diff:11,minLvl:50,tags:["dwarven","mountain"],xp:74.5,yp:6.0,lore:"The Third Heir does not know about the claim. The Guildmaster Vane does, which is part of why the gates are sealed."},
  {id:"reconciliation_of_elara",name:"Reconciliation of Elara",diff:11,minLvl:50,tags:["elven","sacred"],xp:12.4,yp:18.6,lore:"Elara split herself fifty years ago. The Fragment kept the pacts. The Core quarantined to survive. They have not spoken since."},
  {id:"sigil_bearers_keep",name:"Sigil-Bearer's Keep",diff:11,minLvl:50,tags:["shadow","arcane"],xp:52.1,yp:28.2,lore:"The Architect speaks through the priest. It knows about the Sharding. It has known for some time."},
  {id:"architects_first_hand",name:"Architect's First Hand",diff:12,minLvl:55,tags:["corrupted","shadow"],xp:49.4,yp:23.7,lore:"The Architect's lieutenants do not know they serve it. They believe they act of their own will. This is the cruelest part."},
  {id:"driftwood_station",name:"Driftwood Station",diff:12,minLvl:55,tags:["coastal","spirit"],xp:13.4,yp:48.1,lore:"The station was abandoned when the coastal road collapsed. The logs continue past that date, in handwriting that matches no one."},
  {id:"field_of_settled_debts",name:"Field of Settled Debts",diff:12,minLvl:55,tags:["orc","oath"],xp:58.1,yp:47.4,lore:"The arbitration required the Vulture Company Ledger and the Heir's Signet. Krog pledged the Stone-Tusk Clan. Honor is transactional."},
  {id:"mortuary_unsung_names",name:"Mortuary of Unsung Names",diff:12,minLvl:55,tags:["dwarven","undead"],xp:80.5,yp:19.9,lore:"The dead rise not because of necromancy, but because the burial rites ceased when the Verdant Word fell. The ancestors are not at rest."},
  {id:"tidebound_southern_reach",name:"Tidebound Southern Reach",diff:12,minLvl:55,tags:["coastal","corrupted"],xp:8.0,yp:62.8,lore:"The Tidebound advance south in waves, timed to the water spirit's resonance. They are not raiding. They are completing a pattern."},
  {id:"quarantine_ward",name:"Quarantine Ward",diff:12,minLvl:55,tags:["shadow","corrupted"],xp:48.1,yp:34.0,lore:"The ward was meant to contain. It has been containing the wrong thing for fifty years."},
  {id:"archive_broken_seals",name:"Archive of Broken Seals",diff:13,minLvl:60,tags:["shadow","arcane"],xp:42.8,yp:20.5,lore:"The restricted texts were not removed to protect the Order. They were removed to protect three entities from the Order."},
  {id:"blood_oath_tribunal",name:"Blood-Oath Tribunal",diff:13,minLvl:60,tags:["orc","oath"],xp:43.1,yp:25.0,lore:"The tribunal was convened by neither faction. The Stone-Tusk Clan invoked ancient compact law. Both sides are bound to attend."},
  {id:"echoing_caravan",name:"The Echoing Caravan",diff:13,minLvl:60,tags:["sacred","spirit"],xp:33.4,yp:26.9,lore:"The Halflings carry the True Name of Lyra across generations. If the song stops, the water spirit cannot be separated from the Architect."},
  {id:"pass_of_the_rejected",name:"Pass of the Rejected",diff:13,minLvl:60,tags:["dwarven","mountain"],xp:90.2,yp:16.7,lore:"The pass has been closed to both factions. The constructs that guard it recognize neither seal, neither sigil, neither blood."},
  {id:"wound_in_the_world",name:"Wound in the World",diff:13,minLvl:60,tags:["corrupted","shadow"],xp:46.4,yp:22.4,lore:"The wound is not a failed ritual. It is where the Architect first broke through. The scar has been expanding toward the Spire for fifty years."},
  {id:"gates_of_atonement",name:"Gates of Atonement",diff:14,minLvl:65,tags:["martial","oath"],xp:69.5,yp:61.5,lore:"Hrolf realizes the quarantine is over. He breaks the gates open from the inside. The Guard marches out to join the Vanguard."},
  {id:"nexus_broken_vows",name:"Nexus of Broken Vows",diff:14,minLvl:65,tags:["corrupted","shadow"],xp:53.4,yp:19.9,lore:"As the gates open, the Architect strikes back. The Fraying concentrates. The danger is no longer everywhere. It is here."},
  {id:"vanguards_last_camp",name:"Vanguard's Last Camp",diff:14,minLvl:65,tags:["orc","martial"],xp:64.1,yp:55.1,lore:"The Dwarves dig trenches. The Orcs sharpen axes. The Halflings tune their instruments. The Elves watch from the tree line."},
  {id:"rally_of_the_broken",name:"Rally of the Broken",diff:15,minLvl:70,tags:["corrupted","shadow"],xp:60.1,yp:16.0,lore:"Everything broken in the Vale gathers here. The Architect draws them like a tide. They are not enemies. They are symptoms."},
  {id:"threshold_of_echoes",name:"Threshold of Echoes",diff:15,minLvl:70,tags:["arcane","shadow"],xp:57.1,yp:17.9,lore:"The architecture shifts between Past, Present, and Future. Every step forward is a rejection of what was. History is trying to stop you."},
  {id:"vault_of_the_unmade",name:"Vault of the Unmade",diff:15,minLvl:70,tags:["arcane","corrupted"],xp:51.4,yp:17.3,lore:"The Unmade were once people. The Architect did not destroy them. It unmade them — stripped every oath, every memory, every tether."},
  {id:"spire_fractured_time",name:"Spire of Fractured Time",diff:16,minLvl:80,tags:["corrupted","arcane"],xp:55.8,yp:14.7,lore:"The Architect waits at the summit. It is not a god. It is the accumulated weight of every broken promise in the Vale given intent."},
];

// ── STATE ────────────────────────────────────────────────────────────────────

const MAP_GLYPHS = "ᚠᚢᚦᚨᚷᚹᚺᚾᛁᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟᚩᚪᚫᚬᚭᚮᛣᛤᛥ";
const mapRg = n => Array.from({length: n}, () => MAP_GLYPHS[Math.floor(Math.random() * MAP_GLYPHS.length)]).join('');
const mapNodeStates = {}, mapGlyphCache = {}, mapScrambles = {};
let mapCurrentChallenge = null;

MAP_CHALLENGES.forEach(c => {
  mapNodeStates[c.id] = 'locked';
  mapGlyphCache[c.id] = mapRg(c.name.length);
});

// ── MODAL (injected into body to avoid stacking context trap) ────────────────

function mapInjectModal() {
  if (document.getElementById('mapModalOverlay')) return;
  const ov = document.createElement('div');
  ov.id = 'mapModalOverlay';
  ov.innerHTML = `
    <div id="mapModal" style="background:#0f0d07;border:1px solid #2e2410;width:360px;max-width:90vw;position:relative;transform:translateY(12px);transition:transform 0.2s;">
      <button onclick="mapCloseModal()" style="position:absolute;top:12px;right:14px;background:none;border:none;color:#3a2a10;font-size:16px;cursor:pointer;line-height:1;">×</button>
      <div style="padding:18px 20px 14px;border-bottom:1px solid #1e1a0a;">
        <div id="mapModalName" style="font-family:'Cinzel',serif;font-size:15px;color:#c8a84b;line-height:1.3;margin-bottom:5px;"></div>
        <div style="display:flex;gap:12px;align-items:center;">
          <div id="mapModalDiff" style="font-size:11px;color:#6a5020;letter-spacing:1px;"></div>
          <div id="mapModalTags" style="font-size:11px;color:#7a6030;font-style:italic;"></div>
        </div>
      </div>
      <div style="padding:16px 20px;">
        <div id="mapModalStatus" style="font-size:10px;letter-spacing:1px;font-family:'Cinzel',serif;text-transform:uppercase;margin-bottom:12px;"></div>
        <div id="mapModalLore" style="font-size:13px;color:#8a7040;line-height:1.6;font-style:italic;margin-bottom:16px;min-height:48px;"></div>
        <div style="display:flex;gap:10px;">
          <button id="mapBtnSelect" style="font-family:'Cinzel',serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;background:#2a1e08;color:#c8a84b;border:1px solid #c8a84b;padding:9px 20px;cursor:pointer;transition:all 0.2s;flex:1;">Select Challenge</button>
          <button onclick="mapCloseModal()" style="font-family:'Cinzel',serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;background:none;color:#4a3810;border:1px solid #2a2010;padding:9px 14px;cursor:pointer;">Close</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(ov);

  ov.addEventListener('click', e => { if (e.target === ov) mapCloseModal(); });
  document.getElementById('mapBtnSelect').addEventListener('click', async () => {
    const btn = document.getElementById('mapBtnSelect');
    if (!mapCurrentChallenge || btn.disabled) return;
    const full = window.gameData && window.gameData.challenges
      ? window.gameData.challenges.find(c => c.id === mapCurrentChallenge.id)
      : null;
    if (full && typeof selectChallenge === 'function') {
      mapCloseModal();
      await selectChallenge(full);
    }
  });
}

// ── MODAL OPEN / CLOSE ───────────────────────────────────────────────────────

function mapOpenModal(c) {
  mapCurrentChallenge = c;
  const s = mapNodeStates[c.id];
  const locked = s === 'locked' || s === 'near';

  document.getElementById('mapModalName').textContent = locked ? '???' : c.name;
  document.getElementById('mapModalDiff').textContent = locked
    ? '· · · · ·'
    : '✦'.repeat(Math.min(c.diff, 8)) + (c.diff > 8 ? '+' : '') + '  d' + c.diff;
  document.getElementById('mapModalTags').textContent = locked ? 'unknown territory' : c.tags.join(' · ');
  document.getElementById('mapModalLore').textContent = locked
    ? 'Your knowledge of this place has not yet surfaced from the deep.'
    : c.lore;

  const st = document.getElementById('mapModalStatus');
  st.textContent = {available: '— available', active: '— active', locked: '— beyond your sight', near: '— coming into focus'}[s] || '';
  st.style.color   = {available: '#a88030', active: '#c8a84b', locked: '#3a2a10', near: '#6a5020'}[s] || '';

  const btn = document.getElementById('mapBtnSelect');
  btn.disabled = locked;
  btn.textContent = s === 'active' ? 'Currently Running' : 'Select Challenge';

  document.getElementById('mapModalOverlay').classList.add('visible');
}

window.mapCloseModal = function () {
  document.getElementById('mapModalOverlay').classList.remove('visible');
  mapCurrentChallenge = null;
};

// ── GLYPH SCRAMBLE ───────────────────────────────────────────────────────────

function mapStartScramble(id, name, el) {
  if (mapScrambles[id]) { clearInterval(mapScrambles[id]); delete mapScrambles[id]; }
  let tick = 0, total = 22;
  mapScrambles[id] = setInterval(() => {
    tick++;
    const rev = Math.floor(tick / total * name.length);
    let d = name.slice(0, rev);
    for (let i = rev; i < name.length; i++) d += MAP_GLYPHS[Math.floor(Math.random() * MAP_GLYPHS.length)];
    if (el && el.parentNode) el.textContent = d;
    if (tick >= total) {
      clearInterval(mapScrambles[id]);
      delete mapScrambles[id];
      if (el && el.parentNode) el.textContent = name;
    }
  }, 60);
}

// ── NODE STATE ───────────────────────────────────────────────────────────────

function mapGetState(c, lvl) {
  return lvl >= c.minLvl ? 'available' : lvl >= c.minLvl - 10 ? 'near' : 'locked';
}

// ── BUILD NODES ──────────────────────────────────────────────────────────────

function mapBuildNodes(level) {
  const layer = document.getElementById('mapNodesLayer');
  if (!layer) return;

  MAP_CHALLENGES.forEach(c => {
    const newState = mapGetState(c, level);
    const prev = mapNodeStates[c.id];
    const revealing = newState !== 'locked' && prev === 'locked';
    mapNodeStates[c.id] = newState;

    let el = document.getElementById('mapnode-' + c.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'map-node';
      el.id = 'mapnode-' + c.id;
      el.style.cssText = 'position:absolute;transform:translate(-50%,-50%);cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;z-index:10;left:' + c.xp + '%;top:' + c.yp + '%;';
      const pip = document.createElement('div');
      pip.className = 'map-node-pip';
      const lbl = document.createElement('div');
      lbl.className = 'map-node-label';
      lbl.id = 'maplbl-' + c.id;
      el.appendChild(pip);
      el.appendChild(lbl);
      layer.appendChild(el);
      el.addEventListener('click', () => mapOpenModal(c));
    }

    el.className = 'map-node state-' + newState;
    const lbl = document.getElementById('maplbl-' + c.id);
    if (newState === 'available' || newState === 'active') {
      if (revealing) { lbl.textContent = mapGlyphCache[c.id]; mapStartScramble(c.id, c.name, lbl); }
      else if (!mapScrambles[c.id]) lbl.textContent = c.name;
    } else if (newState === 'near') {
      lbl.textContent = mapGlyphCache[c.id].slice(0, Math.ceil(c.name.length * 0.3));
    } else {
      lbl.textContent = mapGlyphCache[c.id].slice(0, 2);
    }
  });
}

// ── INIT ─────────────────────────────────────────────────────────────────────

window.initMapScreen = async function (characterId) {
  mapInjectModal();
  try {
    const char = await getCharacter(characterId);
    const lvl = char?.level || 1;
    document.getElementById('mapLevelDisplay').textContent = lvl;
    mapBuildNodes(lvl);
    mapInitPanZoom();
  } catch (e) {
    console.warn('[MAP] Could not load character level', e);
    mapBuildNodes(1);
    mapInitPanZoom();
  }
};

// ── PAN & ZOOM ───────────────────────────────────────────────────────────────

function mapInitPanZoom() {
  const wrap  = document.getElementById('mapWrap');
  const layer = document.getElementById('mapNodesLayer');
  const img   = document.getElementById('mapBgImg');
  if (!wrap || !layer || !img || wrap._panZoomInit) return;
  wrap._panZoomInit = true;

  // Inner container — note: no will-change:transform to avoid trapping fixed children
  const inner = document.createElement('div');
  inner.id = 'mapInner';
  inner.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;transform-origin:0 0;';
  wrap.appendChild(inner);
  inner.appendChild(img);
  inner.appendChild(layer);

  const vig = wrap.querySelector('div[style*="radial-gradient"]');
  if (vig) inner.appendChild(vig);

  img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;';

  let scale = 1, panX = 0, panY = 0;
  let dragging = false, startX = 0, startY = 0, startPanX = 0, startPanY = 0;
  const MIN = 0.5, MAX = 3;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function applyTransform() {
    const ww = wrap.offsetWidth, wh = wrap.offsetHeight;
    const iw = ww * scale, ih = wh * scale;
    panX = clamp(panX, Math.min(0, ww - iw), Math.max(0, ww - iw));
    panY = clamp(panY, Math.min(0, wh - ih), Math.max(0, wh - ih));
    inner.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
  }

  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = clamp(scale * delta, MIN, MAX);
    panX = mx - (mx - panX) * (newScale / scale);
    panY = my - (my - panY) * (newScale / scale);
    scale = newScale;
    applyTransform();
  }, {passive: false});

  wrap.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    dragging = true; startX = e.clientX; startY = e.clientY;
    startPanX = panX; startPanY = panY;
    wrap.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    panX = startPanX + (e.clientX - startX);
    panY = startPanY + (e.clientY - startY);
    applyTransform();
  });
  window.addEventListener('mouseup', () => { dragging = false; wrap.style.cursor = ''; });

  let touches = {}, lastDist = null;
  wrap.addEventListener('touchstart', e => {
    Array.from(e.changedTouches).forEach(t => touches[t.identifier] = {x: t.clientX, y: t.clientY});
    if (Object.keys(touches).length === 1) {
      const t = e.touches[0];
      dragging = true; startX = t.clientX; startY = t.clientY; startPanX = panX; startPanY = panY;
    }
    lastDist = null;
  }, {passive: true});
  wrap.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 2) {
      dragging = false;
      const a = e.touches[0], b = e.touches[1];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      if (lastDist) {
        const rect = wrap.getBoundingClientRect();
        const mx = (a.clientX + b.clientX) / 2 - rect.left;
        const my = (a.clientY + b.clientY) / 2 - rect.top;
        const delta = dist / lastDist;
        const newScale = clamp(scale * delta, MIN, MAX);
        panX = mx - (mx - panX) * (newScale / scale);
        panY = my - (my - panY) * (newScale / scale);
        scale = newScale;
        applyTransform();
      }
      lastDist = dist;
    } else if (e.touches.length === 1 && dragging) {
      const t = e.touches[0];
      panX = startPanX + (t.clientX - startX);
      panY = startPanY + (t.clientY - startY);
      applyTransform();
    }
  }, {passive: false});
  wrap.addEventListener('touchend', e => {
    Array.from(e.changedTouches).forEach(t => delete touches[t.identifier]);
    if (Object.keys(touches).length === 0) { dragging = false; lastDist = null; }
  }, {passive: true});

  const controls = document.createElement('div');
  controls.style.cssText = 'position:absolute;bottom:12px;right:12px;z-index:50;display:flex;flex-direction:column;gap:4px;';
  controls.innerHTML = `
    <button onclick="mapZoom(1.25)" style="width:28px;height:28px;background:#0f0d07;border:1px solid #2e2410;color:#c8a84b;font-size:16px;cursor:pointer;line-height:1;">+</button>
    <button onclick="mapZoom(0.8)"  style="width:28px;height:28px;background:#0f0d07;border:1px solid #2e2410;color:#c8a84b;font-size:16px;cursor:pointer;line-height:1;">−</button>
    <button onclick="mapResetView()" style="width:28px;height:28px;background:#0f0d07;border:1px solid #2e2410;color:#c8a84b;font-size:10px;cursor:pointer;line-height:1;" title="Reset">⌂</button>
  `;
  wrap.appendChild(controls);

  window.mapZoom = function (delta) {
    const ww = wrap.offsetWidth, wh = wrap.offsetHeight;
    const mx = ww / 2, my = wh / 2;
    const newScale = clamp(scale * delta, MIN, MAX);
    panX = mx - (mx - panX) * (newScale / scale);
    panY = my - (my - panY) * (newScale / scale);
    scale = newScale; applyTransform();
  };
  window.mapResetView = function () { scale = 1; panX = 0; panY = 0; applyTransform(); };
  wrap.style.cursor = 'grab';
  applyTransform();
}

})();
