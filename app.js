/* ===========================================================
   Sea Trouble System — DM Tool
   =========================================================== */

const STORAGE_KEY = 'seaTroubleSystem.v1';
const USERNAME_KEY = 'seaTroubleUser.v1';
const DEFAULT_MAP_IMAGE = 'assets/oneMap.jpeg';

/* ---------- Default state ---------- */
const DEFAULT_RANSOM = [
  { name: "The Coral Eye",        curse: "Whispering Tides",     effect: "Holder dreams of drowning sailors begging for help." },
  { name: "The Bone Compass",     curse: "False North",          effect: "Compasses near it lie. The holder always knows where the next piece is." },
  { name: "The Salt Crown",       curse: "Throne Hunger",        effect: "Holder feels they deserve obedience. NPCs find them oddly imposing." },
  { name: "The Black Pearl Tooth",curse: "Bite of the Deep",     effect: "Saltwater tastes like blood. Sharks follow the ship." },
  { name: "The Iron Sigil",       curse: "Marine Echo",          effect: "Marines instinctively recognize the holder as a wanted face." },
  { name: "The Sun-Drowned Lens", curse: "Burning Memory",       effect: "Holder relives a stranger's death every time they sleep." },
  { name: "The Whaler's Knot",    curse: "Unsnapping Promise",   effect: "Any oath sworn while holding it physically binds — until broken at terrible cost." },
  { name: "The Drowned Bell",     curse: "Tolling Hour",         effect: "Rings faintly when a lie is told nearby." },
  { name: "The Captain's Tongue", curse: "Words of the Lost",    effect: "Holder occasionally speaks in a dead pirate king's voice." },
  { name: "The Tidewriter's Quill",curse: "Ink of Fate",         effect: "Anything written with it tends to come true — twisted." },
  { name: "The Glass Heart",      curse: "Mirror of Want",       effect: "Holder sees what they most desire in every reflection." },
  { name: "The Kraken's Coin",    curse: "Debt of Ten Fathoms",  effect: "Sea itself seems to demand payment. Storms gather over the holder." },
  { name: "The Puzzle Key Core",  curse: "Final Ransom",         effect: "When the 13th piece is held, the artifact awakens. Reality begins to bend around the crew." },
];

const DEFAULT_STATE = {
  campaignName: "The Devil's Ransom",
  location: "East Blue — Open Sea",
  danger: 2,
  heat: 0,
  piecesHeld: 0,
  clock: 0,
  partyLevel: 3,
  partySize: 4,
  faction: "Free pirates",
  marinePresence: "Light patrols",
  rivalPirates: "Buggy splinter crew",
  localProblem: "Smuggling ring under the docks",
  ransomClue: "A torn map fragment shows a key-shaped island in the fog.",
  ransom: DEFAULT_RANSOM.map(p => ({ ...p, holder: "", claimed: false, clueLoc: "", rumors: "" })),
  log: [],
  routes: [],
  activeRouteId: null,
  ship: {
    name: "The Salt Promise",
    class: "Caravel",
    captain: "",
    flag: "Black flag, gold sun broken by a sword",
    hull: 40, hullMax: 40,
    sails: 100,
    morale: 6,
    food: 20, water: 20, medicine: 4, ammo: 15, berries: 500, repair: 2,
    crew: [],
    log: []
  },
  playerSheets: [],
  mapMarkers: [],
  mapImageData: '',
  mapImageName: '',
  mapView: { zoom: 1, panX: 0, panY: 0 }
};

let state = load();

/* ---------- Persistence ---------- */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    // merge with defaults to allow new fields
    return Object.assign(structuredClone(DEFAULT_STATE), parsed);
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!__applyingRemote && typeof window.syncPush === 'function') {
    try { window.syncPush(state); } catch (e) { console.error('syncPush failed', e); }
  }
}

let __applyingRemote = false;
function applyRemoteState(remote) {
  if (!remote || typeof remote !== 'object') return;
  // Preserve viewer-local fields (pan/zoom, UI toggles) across remote updates
  // so other players' edits never hijack this viewer's map viewport.
  const localMapView = state.mapView;
  __applyingRemote = true;
  try {
    Object.keys(state).forEach((k) => { delete state[k]; });
    Object.assign(state, structuredClone(DEFAULT_STATE), remote);
    if (localMapView) state.mapView = localMapView;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    rerenderAll();
  } finally {
    __applyingRemote = false;
  }
}
function rerenderAll() {
  try { if (typeof refreshStats === 'function') refreshStats(); } catch (e) { console.error(e); }
  try { if (typeof renderLog === 'function') renderLog(); } catch (e) { console.error(e); }
  try { if (typeof renderPlayerSheets === 'function') renderPlayerSheets(); } catch (e) { console.error(e); }
  try { if (typeof renderTravel === 'function') renderTravel(); } catch (e) { console.error(e); }
  try { if (typeof renderShip === 'function') renderShip(); } catch (e) { console.error(e); }
  try { if (typeof renderMap === 'function') renderMap(); } catch (e) { console.error(e); }
  $$('[data-bind]').forEach((el) => {
    const key = el.dataset.bind;
    if (state[key] !== undefined && document.activeElement !== el) el.value = state[key];
  });
}
window.applyRemoteState = applyRemoteState;
window.rerenderAll = rerenderAll;
window.__getState = () => state;

/* ---------- Utility ---------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const pick = arr => arr[Math.floor(Math.random()*arr.length)];
const roll = n => Math.floor(Math.random()*n)+1;
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const uid = () => Math.random().toString(36).slice(2,10);

let currentUsername = '';

function normalizeUsername(v) {
  return String(v || '').trim().replace(/\s+/g, ' ').slice(0, 30);
}

function loadUsername() {
  try {
    return normalizeUsername(localStorage.getItem(USERNAME_KEY));
  } catch {
    return '';
  }
}

function setUsername(name) {
  currentUsername = normalizeUsername(name);
  if (currentUsername) localStorage.setItem(USERNAME_KEY, currentUsername);
  else localStorage.removeItem(USERNAME_KEY);
  updateLoginUI();
}

function updateLoginUI() {
  const label = $('#current-user-label');
  if (label) label.textContent = `User: ${currentUsername || 'Guest'}`;

  const overlay = $('#login-overlay');
  if (overlay) overlay.classList.toggle('hidden', Boolean(currentUsername));

  document.body.classList.toggle('app-locked', !currentUsername);
  if (!currentUsername) {
    const input = $('#login-name');
    if (input) {
      input.value = '';
      input.focus();
    }
  }
  // Fog of war depends on who is logged in — refresh the map overlay.
  try { if (typeof renderMapFog === 'function') renderMapFog(); } catch (e) { console.error(e); }
}

function requireUsername() {
  if (currentUsername) return true;
  updateLoginUI();
  return false;
}

function initLogin() {
  currentUsername = loadUsername();
  const form = $('#login-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#login-name');
      const name = normalizeUsername(input ? input.value : '');
      if (!name) {
        alert('Please enter a username.');
        return;
      }
      setUsername(name);
    });
  }
  updateLoginUI();
}

const DANGER_LABELS = { 1:"Safe or familiar area", 2:"Risky area", 3:"Dangerous area", 4:"Deadly area", 5:"Nightmare area" };
const HEAT_LABELS   = { 0:"Unlisted", 1:"Local notice", 2:"Regional bounty", 3:"Known pirate crew", 4:"Major bounty", 5:"Government priority target" };

/* ===========================================================
   Tab navigation
   =========================================================== */
$$('#tabs .tab').forEach(t => t.addEventListener('click', () => {
  $$('#tabs .tab').forEach(x => x.classList.remove('active'));
  $$('.panel').forEach(p => p.classList.remove('active'));
  t.classList.add('active');
  $('#tab-' + t.dataset.tab).classList.add('active');
}));

/* ===========================================================
   Two-way binding for dashboard fields
   =========================================================== */
function bindFields() {
  $$('[data-bind]').forEach(el => {
    const key = el.dataset.bind;
    if (state[key] !== undefined) el.value = state[key];
    el.addEventListener('input', () => {
      let v = el.value;
      if (el.type === 'number') v = Number(v) || 0;
      if (key === 'danger') v = clamp(Number(v),1,5);
      if (key === 'heat')   v = clamp(Number(v),0,5);
      if (key === 'piecesHeld') v = clamp(Number(v),0,13);
      if (key === 'clock')  v = clamp(Number(v),0,6);
      state[key] = v;
      save();
      refreshStats();
    });
  });
}

/* ===========================================================
   Refresh top-level stat displays
   =========================================================== */
function refreshStats() {
  const statDanger = $('#stat-danger');
  const statDangerLabel = $('#stat-danger-label');
  const statHeat = $('#stat-heat');
  const statHeatLabel = $('#stat-heat-label');
  const statPieces = $('#stat-pieces');
  const statDc = $('#stat-dc');
  if (statDanger) statDanger.textContent = state.danger;
  if (statDangerLabel) statDangerLabel.textContent = DANGER_LABELS[state.danger];
  if (statHeat) statHeat.textContent = state.heat;
  if (statHeatLabel) statHeatLabel.textContent = HEAT_LABELS[state.heat];
  if (statPieces) statPieces.textContent = `${state.piecesHeld} / 13`;
  if (statDc) statDc.textContent = 10 + Number(state.piecesHeld);

  // Clock
  const clockVal = $('#clock-val');
  const clockFill = $('#clock-fill');
  const clockAlert = $('#clock-alert');
  if (clockVal) clockVal.textContent = state.clock;
  if (clockFill) clockFill.style.width = (state.clock/6*100) + '%';
  if (clockAlert) clockAlert.classList.toggle('hidden', state.clock < 6);

  // Heat tab
  $('#heat-val').textContent = state.heat;
  $('#heat-fill').style.width = (state.heat/5*100) + '%';
  $('#heat-label-big').textContent = HEAT_LABELS[state.heat];

  // Ransom
  const ransomDc = $('#ransom-dc');
  const ransomCount = $('#ransom-count');
  if (ransomDc) ransomDc.textContent = 10 + Number(state.piecesHeld);
  if (ransomCount) ransomCount.textContent = state.piecesHeld;
}

/* ===========================================================
   Encounter Clock buttons
   =========================================================== */
$$('[data-clock]').forEach(b => b.addEventListener('click', () => {
  state.clock = clamp(state.clock + Number(b.dataset.clock), 0, 6);
  save(); refreshStats();
  if (state.clock >= 6) flashTab('clock');
}));

/* ===========================================================
   Heat buttons
   =========================================================== */
$$('[data-heat]').forEach(b => b.addEventListener('click', () => {
  state.heat = clamp(state.heat + Number(b.dataset.heat), 0, 5);
  syncBoundField('heat');
  save(); refreshStats();
}));

function syncBoundField(key) {
  const el = $(`[data-bind="${key}"]`);
  if (el) el.value = state[key];
}

/* ===========================================================
   Action buttons
   =========================================================== */
document.addEventListener('click', e => {
  const a = e.target.closest('[data-action]');
  if (!a) return;
  const act = a.dataset.action;
  switch (act) {
    case 'generate':       generateEncounter(); break;
    case 'ransomTwist':    generateRansomTwist(true); break;
    case 'genMarine':      generateEncounter('Marine patrol'); break;
    case 'genRival':       generateEncounter('Rival pirates'); break;
    case 'genSea':         generateEncounter(pick(['Sea monster','Weather disaster'])); break;
    case 'genIsland':      generateEncounter(pick(['Strange island event','Civilian problem','Local faction conflict'])); break;
    case 'genNPC':         showQuickCard('NPC', generateNPC()); break;
    case 'genReward':      showQuickCard('Reward', generateReward()); break;
    case 'resetClock':     state.clock = 0; syncBoundField('clock'); save(); refreshStats(); break;
    case 'manualMinus':    state.clock = clamp(state.clock-1,0,6); syncBoundField('clock'); save(); refreshStats(); break;
    case 'heatPlus':       state.heat = clamp(state.heat+1,0,5); syncBoundField('heat'); save(); refreshStats(); break;
    case 'heatMinus':      state.heat = clamp(state.heat-1,0,5); syncBoundField('heat'); save(); refreshStats(); break;
    case 'newRoute':       showNewRouteForm(true); break;
    case 'cancelNewRoute': showNewRouteForm(false); break;
    case 'createRoute':    createRouteFromForm(); break;
    case 'loadRouteTemplate': loadRouteTemplate(); break;
    case 'addCrew':        addCrewMember(); break;
    case 'addShipLog':     addShipLogEntry(); break;
    case 'importMap':      importMapImage(); break;
    case 'resetMapImage':  if (confirm('Remove the current map image?')) { state.mapImageData = ''; state.mapImageName = ''; save(); renderMap(); } break;
    case 'clearMap':       if (confirm('Remove all map markers?')) { state.mapMarkers = []; save(); renderMap(); } break;
    case 'centerShip':     centerOnShip(); break;
    case 'routeFromMap':   if (typeof enterRoutePickMode === 'function') enterRoutePickMode(); break;
    case 'toggleTravelPanel': if (typeof toggleTravelPanel === 'function') toggleTravelPanel(); break;
    case 'addPlayerSheet': addPlayerSheet(); break;
    case 'switchUser':
      if (confirm('Switch username? You can type a new one in the login box.')) {
        setUsername('');
      }
      break;
    case 'exportAll':      exportSave(); break;
    case 'importAll':      importSave(); break;
    case 'resetAll':       if (confirm('Erase all campaign data?')) { localStorage.removeItem(STORAGE_KEY); location.reload(); } break;
  }
});

function flashTab(name) {
  const t = $(`#tabs .tab[data-tab="${name}"]`);
  if (!t) return;
  t.style.boxShadow = '0 0 0 3px #f5c75a';
  setTimeout(()=> t.style.boxShadow = '', 1500);
}

function showTab(name) {
  const tab = $(`#tabs .tab[data-tab="${name}"]`);
  const panel = $(`#tab-${name}`);
  if (!tab || !panel) return;
  $$('#tabs .tab').forEach(x => x.classList.remove('active'));
  $$('.panel').forEach(p => p.classList.remove('active'));
  tab.classList.add('active');
  panel.classList.add('active');
}

function encounterOutputTarget() {
  return $('#encounter-output') || $('#log-preview');
}

/* ===========================================================
   ENCOUNTER GENERATOR
   =========================================================== */
const ENCOUNTER_TYPES = [
  "Marine patrol","Rival pirates","Bounty hunter","Sea monster",
  "Weather disaster","Strange island event","Civilian problem","Treasure clue",
  "Devil's Ransom curse pull","Enemy spy or informant","Local faction conflict","Major story encounter"
];

const PURPOSES = {
  Drain: "Uses resources — HP, ammo, ship damage, medicine, supplies, or time.",
  Reveal: "Gives lore, clues, names, maps, rumors, or secrets.",
  Tempt: "Offers treasure, fame, revenge, power, or a risky shortcut.",
  Chase: "Pushes the crew to move quickly.",
  Choice: "Forces the players to choose between difficult options.",
  Consequence: "Shows that past actions matter."
};

const NPC_FIRST = ["Reina","Borgo","Hatchi","Kessler","Mira","Old Pim","Cinder","Vance","Selka","Doc Maro","Tobias","Yumi","Saint Halric","Captain Quill","Bosun Greaves","Lady Asha","Gunner Tess","Iron-Eye Joss","Pearl","Mako"];
const NPC_TITLES = ["the Drifter","the Two-Coin","the Quiet","of the Ash Sails","the Reefborn","the Marked","the Salt-Tongue","the Black Hand","the Penitent","the Tide-Walker","the Last Mate","of the Iron Lantern"];
const NPC_ROLES  = ["wandering swordsman","corrupt Marine ensign","retired bounty hunter","cursed cartographer","blind navigator","starving informant","ex-pirate cook","mysterious noble's bodyguard","preacher of a sea-god","child with strange knowledge","crooked merchant","ruthless tax collector"];
const NPC_TRAITS = ["lies fluently","always indebted","carries a relic they can't sell","sees omens in fish bones","laughs at the wrong moments","has a tattoo of a forgotten flag","missing two fingers","whistles a marching song","afraid of bells","loyal to a dead captain"];

const REWARDS_MINOR  = ["A waterproof map fragment","A pouch of 200 berries","A bottle of strong rum","Marine ration crates","A spyglass with cracked lens","A child's lucky charm","A bag of exotic spices","A signal flare","Three healing herbs","A bone whistle that calls gulls"];
const REWARDS_MEDIUM = ["A named cutlass with a small enchantment","A reinforced ship plank (small ship repair)","A tattered Marine officer's uniform","Coded letters between officers","A small Sea Stone shard","A treasure deed to a nameless island","A trained messenger bird","A favor owed by a smuggler captain"];
const REWARDS_MAJOR  = ["A clue to the next Devil's Ransom piece","A canister of Sea Stone dust","A rare Devil Fruit (uncut, dangerous)","The deed to a hidden cove","An audience with a Yonko's informant","A WANTED poster rewritten in the crew's favor","A pact with a sea spirit"];

const HOOKS = {
  "Marine patrol": ["A Marine cutter signals the crew to halt for inspection.","Smoke rises from a Marine watchtower on the coast.","A Marine deserter begs for asylum aboard."],
  "Rival pirates": ["A black-sailed schooner shadows the crew at dawn.","A drunken pirate in port boasts of bounties — including the crew's.","A familiar flag flies over a 'neutral' tavern."],
  "Bounty hunter": ["A polite stranger asks for a captain by name — quietly.","A poster of one crew member is being copied at every dock.","A bounty hunter is already waiting in the crew's favorite bar."],
  "Sea monster": ["The water grows still. Birds vanish.","Something massive bumps the hull from below.","A wrecked ship floats by, its hull torn open from the inside out."],
  "Weather disaster": ["The sky turns green; the air smells of iron.","Three waterspouts spin in a triangle around the ship.","The barometer drops faster than seems possible."],
  "Strange island event": ["The island's shadows seem to fall the wrong way.","Bells ring from an island with no people on it.","A statue on the shore is wet — though it hasn't rained."],
  "Civilian problem": ["A child runs to the dock crying for help.","The local market is empty mid-day. Doors locked.","A fishing family begs the crew to escort them past the reef."],
  "Treasure clue": ["A drunk sailor sells a 'real' map for the price of a meal.","A song the locals sing accidentally describes a buried route.","An old chart in a Marine office mentions an unmarked cove."],
  "Devil's Ransom curse pull": ["A piece the crew carries grows warm without reason.","A stranger stares at the holder and whispers a name they never told.","Dreams of the same locked door return for everyone aboard."],
  "Enemy spy or informant": ["A new recruit asks too many specific questions.","A message is intercepted with a code the crew once used.","A 'friendly' merchant insists on personal delivery."],
  "Local faction conflict": ["Two gangs of dockworkers brawl in the streets.","A noble and a smuggler both demand the crew's loyalty.","A Marine officer and the local mayor have opposing requests."],
  "Major story encounter": ["A figure from the captain's past walks into the tavern.","A Marine Vice Admiral's flagship enters the harbor.","A piece of the Devil's Ransom shines through a vault wall — visible only to the holder."]
};

const COMPLICATIONS = [
  "A prisoner or civilian is caught in the middle.",
  "A second faction is watching from cover.",
  "The location is unstable — fire, flooding, or collapsing structure.",
  "A Devil's Ransom piece begins reacting unpredictably.",
  "Someone the party trusts is lying.",
  "Time is against them — the Encounter Clock keeps ticking.",
  "The 'enemy' is just desperate, not evil.",
  "Marine reinforcements are visibly inbound.",
  "A storm is closing in within the hour.",
  "An NPC the crew wronged earlier shows up.",
  "The reward is real — but cursed.",
  "An obvious solution will burn a future bridge."
];

const PLAYER_CHOICES = [
  "Fight openly, talk it out, or slip away unseen.",
  "Help the desperate party and gain Heat, or stay clean and lose the lead.",
  "Take the relic now, leave a clue for someone else, or destroy it.",
  "Accept the deal, betray the dealer, or expose them publicly.",
  "Rescue, loot, or hide — pick two.",
  "Trust the stranger, test them, or hand them to the authorities.",
  "Pay the bribe, fake the papers, or fight your way out.",
  "Save the ship, save the cargo, or save the witness.",
];

const CONSEQUENCES = [
  "Heat increases if witnesses survive.",
  "A new ally appears — but expects a favor later.",
  "A rival gains the next Devil's Ransom lead.",
  "The crew's ship takes a lasting wound.",
  "A bounty is rewritten — higher.",
  "A friendly port closes to the crew for a season.",
  "A Marine officer remembers a face.",
  "A nightmare claims one crew member's next long rest.",
  "A piece of the Devil's Ransom reacts publicly — witnesses talk.",
  "Word reaches a Yonko's informant."
];

const COMBAT_NOTES = [
  "Open terrain — ranged advantage.",
  "Tight quarters — melee favored, hard to escape.",
  "Vertical fight — rigging, ladders, scaffolds.",
  "Crowd around — innocents at risk on misses.",
  "Slippery deck — DEX save or fall prone on dash.",
  "Visibility low — fog, smoke, or rain (disadvantage on ranged).",
  "Environmental hazard each round — falling debris, rising water.",
  "Reinforcements arrive on round 3 if combat continues."
];

const ROLEPLAY_NOTES = [
  "NPC speaks slowly and watches faces — Insight is meaningful.",
  "NPC is hiding fear with bravado.",
  "NPC will break if pressed on a specific name.",
  "NPC mirrors the loudest player.",
  "NPC respects strength but distrusts charm.",
  "NPC tests the crew with a small lie before truth.",
  "NPC offers a deal that sounds fair — and isn't."
];

function generateNPC() {
  return `${pick(NPC_FIRST)} "${pick(NPC_TITLES)}" — ${pick(NPC_ROLES)}. Trait: ${pick(NPC_TRAITS)}.`;
}

function generateReward(tier) {
  const d = state.danger;
  if (!tier) tier = d >= 4 ? 'major' : d >= 2 ? 'medium' : 'minor';
  if (tier === 'major')  return pick(REWARDS_MAJOR);
  if (tier === 'medium') return pick(REWARDS_MEDIUM);
  return pick(REWARDS_MINOR);
}

function pickEnemies(type) {
  const danger = state.danger;
  const heat = state.heat;
  const lvl = state.partyLevel;
  const size = state.partySize;
  const scale = `Scaled for level ${lvl} party of ${size}.`;
  const prepared = heat >= 3 ? " They are PREPARED — they expected this crew." : "";
  const namedHunter = heat >= 4 ? " A named officer or bounty hunter is present." : "";
  const govt = heat >= 5 ? " A World Government agent observes from cover." : "";
  const map = {
    "Marine patrol":         `${1+danger*2} Marine sailors, 1 petty officer${danger>=3?", 1 lieutenant":""}${danger>=4?", reinforced with a small cutter":""}.${prepared}${namedHunter}${govt} ${scale}`,
    "Rival pirates":         `${2+danger} rival pirates led by a brawler captain${danger>=3?", plus a specialist (gunner, navigator, or fighter)":""}.${prepared}${namedHunter} ${scale}`,
    "Bounty hunter":         `A named bounty hunter and ${danger} hired thugs${heat>=4?", plus a Sea Stone trap":""}.${prepared} ${scale}`,
    "Sea monster":           `A ${pick(["sea king juvenile","massive reef serpent","ink-blooded kraken","carnivorous tide swarm","ghost whale"])}${danger>=4?" — adult, hungry, and territorial":""}. ${scale}`,
    "Weather disaster":      `No enemies — the sea itself is the threat. Skill challenge: navigate, brace, repair. ${scale}`,
    "Strange island event":  `Local hazards and 1–2 cursed locals or wildlife. ${scale}`,
    "Civilian problem":      `Frightened civilians; possibly ${danger} thugs pressuring them. ${scale}`,
    "Treasure clue":         `No direct enemies; potential trap or rival scout. ${scale}`,
    "Devil's Ransom curse pull": `No physical enemy — the artifact itself acts. Saves required.`,
    "Enemy spy or informant":`1 disguised informant${heat>=3?", with a hidden backup pair":""}. ${scale}`,
    "Local faction conflict":`${2+danger} fighters from each of two factions. ${scale}`,
    "Major story encounter": `A signature antagonist appropriate to the campaign arc. ${scale}`,
  };
  return map[type] || "Improvise based on the location.";
}

function ransomTwistChance() {
  // 0 pieces => 0%, 13 pieces => ~95%
  return Math.min(0.95, state.piecesHeld * 0.07);
}

function maybeRansomTwist() {
  if (Math.random() < ransomTwistChance()) return generateRansomTwist(false);
  return null;
}

const CURSE_PRESSURE = [
  "You feel like leaving this clue behind would be a mistake.",
  "The artifact grows warm near the hidden clue.",
  "The thought of selling the piece makes your stomach twist.",
  "You cannot stop staring at the locked chest.",
  "You know the pirate is lying, but part of you wants to follow him anyway.",
  "A voice in your dream tonight will use your mother's voice.",
  "The salt on your lips tastes like iron whenever the piece is near.",
  "You feel watched by something that knows your real name.",
  "Refusing the next offer feels physically painful.",
  "You hear the puzzle key clicking — but no one else does."
];

function generateRansomTwist(asPanel) {
  const dc = 10 + Number(state.piecesHeld);
  const saveType = pick(["Wisdom","Charisma"]);
  const reason = saveType === "Wisdom"
    ? pick(["obsession","greed","curiosity","fear","temptation"])
    : pick(["resisting control","resisting magical marking","being pulled toward the artifact"]);
  const pressure = pick(CURSE_PRESSURE);
  const twist = {
    dc, saveType, reason, pressure,
    text: `${saveType} save DC ${dc} vs ${reason}. On failure: ${pressure}`
  };
  if (asPanel) {
    const output = $('#ransom-twist-output') || encounterOutputTarget();
    if (!output) return twist;
    output.innerHTML = `
      <div class="encounter-card">
        <h2>💀 Devil's Ransom Curse Pressure</h2>
        <div class="row"><b>${saveType} Save DC ${dc}</b> — vs ${reason}</div>
        <div class="row twist">${pressure}</div>
        <div class="row muted">The artifact does not control the player — it pressures, tempts, or whispers.</div>
      </div>`;
  }
  return twist;
}

function generateEncounter(forcedType) {
  const type = forcedType || pick(ENCOUNTER_TYPES);
  const purpose = pick(Object.keys(PURPOSES));
  const purpose2 = Math.random() < 0.35 ? pick(Object.keys(PURPOSES).filter(p => p !== purpose)) : null;
  const purposes = purpose2 ? `${purpose} and ${purpose2}` : purpose;
  const hook = pick(HOOKS[type] || ["Improvise based on location."]);
  const complication = pick(COMPLICATIONS);
  const choice = pick(PLAYER_CHOICES);
  const enemies = pickEnemies(type);
  const reward = generateReward();
  const consequence = pick(CONSEQUENCES);

  // Heat / Clock changes based on type & danger
  const heatChange = (type === "Marine patrol" || type === "Bounty hunter") ? "+1 if combat goes loud"
                  : (type === "Major story encounter") ? "+1 to +2"
                  : (type === "Devil's Ransom curse pull") ? "0 (private)"
                  : "0 to +1 depending on visibility";
  const clockChange = "Reset to 0 after encounter resolves. Add +1 if loose ends remain.";

  const difficulty = (() => {
    const d = state.danger;
    if (d <= 1) return "Easy";
    if (d === 2) return "Standard";
    if (d === 3) return "Hard";
    if (d === 4) return "Deadly";
    return "Nightmare — consider escape routes as a real path.";
  })();

  const nameAdj = pick(["Black","Drowning","Whispering","Iron","Salt-Bitten","Cursed","Half-Sunk","Gilded","Last","Quiet"]);
  const nameNoun = pick(["Tide","Coffin","Bell","Lantern","Compass","Sail","Reef","Promise","Hour","Ledger"]);
  const name = `The ${nameAdj} ${nameNoun}`;

  const twist = maybeRansomTwist();
  const ransomConnection = twist
    ? `A piece of the Devil's Ransom reacts. ${twist.text}`
    : (state.piecesHeld > 0 ? "Faint resonance only — no save this time." : "No direct connection.");

  const combatNote = pick(COMBAT_NOTES);
  const rpNote = pick(ROLEPLAY_NOTES);

  const enc = {
    id: uid(),
    createdAt: new Date().toISOString(),
    name,
    location: state.location,
    danger: state.danger,
    type,
    purpose: purposes,
    purposeText: [purpose, purpose2].filter(Boolean).map(p => `${p}: ${PURPOSES[p]}`).join(' / '),
    hook,
    complication,
    choice,
    enemies,
    reward,
    consequence,
    ransom: ransomConnection,
    heatChange,
    clockChange,
    difficulty,
    combatNote,
    rpNote,
    status: 'Unused',
    notes: ''
  };

  renderEncounter(enc);
  // Save to log
  state.log.unshift(enc);
  save();
  renderLog();
  showTab('log');
}

function renderEncounter(enc) {
  const html = `
    <div class="encounter-card" data-eid="${enc.id}">
      <h2>${enc.name}</h2>
      <div class="tags">
        <span class="tag">${enc.type}</span>
        <span class="tag">Danger ${enc.danger}</span>
        <span class="tag">Heat ${state.heat}</span>
        <span class="tag">Difficulty: ${enc.difficulty}</span>
      </div>
      <div class="row"><b>Location:</b> ${esc(enc.location)}</div>
      <div class="row"><b>Purpose:</b> ${esc(enc.purpose)} — <i>${esc(enc.purposeText)}</i></div>
      <div class="row"><b>Hook:</b> ${esc(enc.hook)}</div>
      <div class="row"><b>Complication:</b> ${esc(enc.complication)}</div>
      <div class="row"><b>Player Choice:</b> ${esc(enc.choice)}</div>
      <div class="row"><b>Enemies / NPCs:</b> ${esc(enc.enemies)}</div>
      <div class="row"><b>Reward:</b> ${esc(enc.reward)}</div>
      <div class="row"><b>Consequence:</b> ${esc(enc.consequence)}</div>
      <div class="row twist"><b>Devil's Ransom Connection:</b> ${esc(enc.ransom)}</div>
      <div class="row"><b>Heat Change:</b> ${esc(enc.heatChange)}</div>
      <div class="row"><b>Encounter Clock Change:</b> ${esc(enc.clockChange)}</div>
      <div class="row"><b>Combat Notes:</b> ${esc(enc.combatNote)}</div>
      <div class="row"><b>Roleplay Notes:</b> ${esc(enc.rpNote)}</div>
      <div class="btn-row">
        <button class="gold" onclick="exportEncounter('${enc.id}')">📋 Export as Text</button>
        <button onclick="rerollEncounter()">🎲 Reroll</button>
        <button onclick="resetClockAfter()">Reset Clock to 0</button>
      </div>
    </div>`;
  const output = encounterOutputTarget();
  if (!output) return;
  output.innerHTML = html;
}

function showQuickCard(title, body) {
  const output = encounterOutputTarget();
  if (!output) return;
  output.innerHTML = `
    <div class="encounter-card">
      <h2>${title}</h2>
      <div class="row">${esc(body)}</div>
    </div>`;
  showTab('log');
}

function rerollEncounter() { generateEncounter(); }
function resetClockAfter() { state.clock = 0; syncBoundField('clock'); save(); refreshStats(); }

/* ===========================================================
   EXPORT
   =========================================================== */
function encounterToText(enc) {
  return [
    `Encounter Name: ${enc.name}`,
    `Location: ${enc.location}`,
    `Danger Level: ${enc.danger}`,
    `Encounter Type: ${enc.type}`,
    `Purpose: ${enc.purpose}`,
    `Hook: ${enc.hook}`,
    `Complication: ${enc.complication}`,
    `Player Choice: ${enc.choice}`,
    `Enemies or NPCs: ${enc.enemies}`,
    `Reward: ${enc.reward}`,
    `Consequence: ${enc.consequence}`,
    `Devil's Ransom Connection: ${enc.ransom}`,
    `Heat Change: ${enc.heatChange}`,
    `Encounter Clock Change: ${enc.clockChange}`,
    `Suggested Difficulty: ${enc.difficulty}`,
    `Optional Combat Notes: ${enc.combatNote}`,
    `Optional Roleplay Notes: ${enc.rpNote}`
  ].join('\n');
}

window.exportEncounter = function(id) {
  const enc = state.log.find(e => e.id === id);
  if (!enc) return;
  const txt = encounterToText(enc);
  navigator.clipboard?.writeText(txt).catch(()=>{});
  // Also show in a popup-like overlay
  const w = window.open('', '_blank', 'width=600,height=700');
  if (w) {
    w.document.write(`<pre style="font-family:Georgia,serif;padding:20px;white-space:pre-wrap;">${esc(txt)}</pre>`);
    w.document.title = enc.name;
  } else {
    alert(txt);
  }
};

function exportSave() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sea-trouble-${Date.now()}.json`;
  a.click();
}

function importSave() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = () => {
    const f = input.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        state = Object.assign(structuredClone(DEFAULT_STATE), data);
        save();
        location.reload();
      } catch (e) { alert('Invalid save file.'); }
    };
    r.readAsText(f);
  };
  input.click();
}

/* ===========================================================
   RANSOM PIECE UI
   =========================================================== */
function renderRansom() {
  const root = $('#ransom-list');
  root.innerHTML = '';
  state.ransom.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'ransom-piece' + (p.claimed ? ' claimed' : '');
    div.innerHTML = `
      <h4>${i+1}. ${esc(p.name)}</h4>
      <div class="curse">Curse: ${esc(p.curse)}</div>
      <div class="muted">${esc(p.effect)}</div>
      <label><input type="checkbox" data-i="${i}" data-k="claimed" ${p.claimed?'checked':''}/> Claimed by the crew</label>
      <label>Current Holder<input type="text" data-i="${i}" data-k="holder" value="${esc(p.holder)}"/></label>
      <label>Clue Location<input type="text" data-i="${i}" data-k="clueLoc" value="${esc(p.clueLoc)}"/></label>
      <label>Known Rumors<textarea data-i="${i}" data-k="rumors" rows="2">${esc(p.rumors)}</textarea></label>
    `;
    root.appendChild(div);
  });
  // Bind
  $$('#ransom-list [data-i]').forEach(el => {
    el.addEventListener('input', () => {
      const i = Number(el.dataset.i), k = el.dataset.k;
      state.ransom[i][k] = el.type === 'checkbox' ? el.checked : el.value;
      // Sync piecesHeld count from claimed
      state.piecesHeld = state.ransom.filter(p => p.claimed).length;
      syncBoundField('piecesHeld');
      save(); refreshStats();
    });
  });
}

/* ===========================================================
   LOG
   =========================================================== */
const STATUSES = ['Unused','Active','Resolved','Changed by player choice','Returning later'];

function renderLog() {
  const root = $('#log-list');
  if (!state.log.length) { root.innerHTML = '<p class="muted">No encounters generated yet.</p>'; return; }
  root.innerHTML = '';
  state.log.forEach((enc, idx) => {
    const div = document.createElement('div');
    div.className = 'log-entry';
    const date = new Date(enc.createdAt).toLocaleString();
    div.innerHTML = `
      <header>
        <h4>${esc(enc.name)} <span class="muted">— ${esc(enc.type)} @ ${esc(enc.location)}</span></h4>
        <span class="status">
          <select data-idx="${idx}" data-k="status">
            ${STATUSES.map(s => `<option ${s===enc.status?'selected':''}>${s}</option>`).join('')}
          </select>
        </span>
      </header>
      <div class="muted">${date} · Danger ${enc.danger} · ${esc(enc.purpose)}</div>
      <div><b>Hook:</b> ${esc(enc.hook)}</div>
      <label>Notes<textarea data-idx="${idx}" data-k="notes" rows="2">${esc(enc.notes)}</textarea></label>
      <div class="btn-row">
        <button onclick="exportEncounter('${enc.id}')">📋 Export</button>
        <button onclick="reshowEncounter('${enc.id}')">👁 View</button>
        <button class="danger" onclick="deleteEncounter('${enc.id}')">Delete</button>
      </div>`;
    root.appendChild(div);
  });
  $$('#log-list [data-idx]').forEach(el => {
    el.addEventListener('input', () => {
      const i = Number(el.dataset.idx);
      state.log[i][el.dataset.k] = el.value;
      save();
    });
  });
}

window.reshowEncounter = function(id) {
  const enc = state.log.find(e => e.id === id);
  if (enc) {
    renderEncounter(enc);
    showTab('log');
  }
};
window.deleteEncounter = function(id) {
  if (!confirm('Delete this log entry?')) return;
  state.log = state.log.filter(e => e.id !== id);
  save(); renderLog();
};

/* ===========================================================
   Utility
   =========================================================== */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/* ===========================================================
   PLAYER CHARACTER SHEETS
   =========================================================== */
function stampSheetEdit(sheet) {
  sheet.updatedAt = new Date().toISOString();
  sheet.updatedBy = currentUsername || 'Unknown';
}

function sheetMetaText(sheet) {
  const who = sheet.updatedBy || 'Unknown';
  if (!sheet.updatedAt) return `Last update: not yet edited · by ${esc(who)}`;
  return `Last update: ${new Date(sheet.updatedAt).toLocaleString()} · by ${esc(who)}`;
}

const BODY_PARTS = [
  { key: 'head',  num: 1, label: 'Head / Senses' },
  { key: 'torso', num: 2, label: 'Torso / Core'  },
  { key: 'rArm',  num: 3, label: 'Right Arm'     },
  { key: 'lArm',  num: 4, label: 'Left Arm'      },
  { key: 'rLeg',  num: 5, label: 'Right Leg'     },
  { key: 'lLeg',  num: 6, label: 'Left Leg'      },
];
const DAMAGE_THRESHOLDS = [25, 50, 75, 100];
const STAT_DEFS = [
  { key: 'str', label: 'Strength' },
  { key: 'dex', label: 'Dexterity' },
  { key: 'con', label: 'Constitution' },
  { key: 'int', label: 'Intelligence' },
  { key: 'wis', label: 'Wisdom' },
  { key: 'cha', label: 'Charisma' },
];

function statMod(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.floor((n - 10) / 2);
}
function fmtMod(m) { return (m >= 0 ? `+${m}` : `${m}`); }
function sectionHp(maxHp) { return Math.max(1, Math.ceil((Number(maxHp) || 6) / 6)); }

function makeEmptyBodyPart() {
  return { damage: 0, states: { 25: false, 50: false, 75: false, 100: false } };
}

function makeEmptySheet() {
  const stats = {};
  STAT_DEFS.forEach(s => { stats[s.key] = 10; });
  const body = {};
  BODY_PARTS.forEach(p => { body[p.key] = makeEmptyBodyPart(); });
  return {
    id: uid(),
    player: currentUsername,
    // Identity
    name: 'New Character',
    epithet: '',
    role: '',
    age: '',
    home: '',
    portrait: '',
    // Inventory
    inventory: [],
    // Stats
    stats,
    ac: 10,
    initiative: 0,
    speed: 30,
    // Combat / class
    level: 1,
    charClass: '',
    // Signature moves (4 slots)
    moves: [
      { name: '', desc: '' },
      { name: '', desc: '' },
      { name: '', desc: '' },
      { name: '', desc: '' },
    ],
    // Flashback Power-Up (3 charges)
    flashback: 0,
    // Health
    maxHp: 20,
    hp: 20,
    tempHp: 0,
    // Scars
    scars: { physical: '', emotional: '', reputation: '' },
    // Devil's Ransom
    ransom: { piece: '', curseName: '', curseDC: 10 },
    // Bounty
    bounty: 0,
    // Cinematic Health Tracker
    deathSaves: { success: [false, false, false], fail: [false, false, false] },
    body,
    healthNotes: '',
    // (legacy) Devil Fruit + notes
    devilFruit: '',
    notes: '',
    updatedBy: currentUsername,
    updatedAt: new Date().toISOString(),
  };
}

/* Fill missing fields on old sheets so the new UI renders safely. */
function normalizeSheet(pc) {
  if (!pc || typeof pc !== 'object') return makeEmptySheet();
  const base = makeEmptySheet();
  const merged = Object.assign(base, pc);
  merged.stats = Object.assign({}, base.stats, pc.stats || {});
  merged.scars = Object.assign({}, base.scars, pc.scars || {});
  merged.ransom = Object.assign({}, base.ransom, pc.ransom || {});
  merged.inventory = Array.isArray(pc.inventory) ? pc.inventory.map(it => ({
    item: String(it?.item ?? ''),
    qty: Number(it?.qty) || 0,
    weight: String(it?.weight ?? ''),
  })) : [];
  merged.moves = (Array.isArray(pc.moves) ? pc.moves : []).slice(0, 4);
  while (merged.moves.length < 4) merged.moves.push({ name: '', desc: '' });
  merged.moves = merged.moves.map(m => ({ name: String(m?.name ?? ''), desc: String(m?.desc ?? '') }));
  const ds = pc.deathSaves || {};
  merged.deathSaves = {
    success: [0,1,2].map(i => Boolean(ds.success?.[i])),
    fail:    [0,1,2].map(i => Boolean(ds.fail?.[i])),
  };
  const bodyIn = pc.body || {};
  merged.body = {};
  BODY_PARTS.forEach(p => {
    const src = bodyIn[p.key] || {};
    merged.body[p.key] = {
      damage: Number(src.damage) || 0,
      states: {
        25:  Boolean(src.states?.[25]),
        50:  Boolean(src.states?.[50]),
        75:  Boolean(src.states?.[75]),
        100: Boolean(src.states?.[100]),
      },
    };
  });
  merged.flashback = clamp(Number(pc.flashback) || 0, 0, 3);
  return merged;
}

function addPlayerSheet() {
  if (!requireUsername()) return;
  state.playerSheets.unshift(makeEmptySheet());
  save();
  renderPlayerSheets();
  showTab('characters');
}

function renderPlayerSheets() {
  const root = $('#player-sheet-list');
  if (!root) return;

  if (!Array.isArray(state.playerSheets)) state.playerSheets = [];
  // Normalize any legacy sheets in place so they pick up the new fields.
  state.playerSheets = state.playerSheets.map(normalizeSheet);

  if (!state.playerSheets.length) {
    root.innerHTML = '<p class="muted">No character sheets yet. Click "+ Add Character Sheet" to start.</p>';
    return;
  }

  root.innerHTML = state.playerSheets.map((pc, idx) => renderSheetHtml(pc, idx)).join('');

  $$('.player-card', root).forEach(card => {
    const idx = Number(card.dataset.pidx);
    const sheet = state.playerSheets[idx];
    if (!sheet) return;
    attachSheetHandlers(card, sheet, idx);
  });
}

function renderSheetHtml(pc, idx) {
  const sec = sectionHp(pc.maxHp);
  const totalDmg = BODY_PARTS.reduce((sum, p) => sum + (Number(pc.body?.[p.key]?.damage) || 0), 0);

  // --- helpers ------------------------------------------------
  const styleAt = (l, t, w, h = 2.4) =>
    `left:${l}%; top:${t}%; width:${w}%; height:${h}%;`;
  const ovTxt = (pf, val, l, t, w, h, ph = '') =>
    `<input type="text" class="ov-input" data-pf="${pf}" value="${esc(val ?? '')}" placeholder="${esc(ph)}" style="${styleAt(l,t,w,h)}" />`;
  const ovNum = (pf, val, l, t, w, h, opts = {}) => {
    const min = opts.min !== undefined ? ` min="${opts.min}"` : '';
    const step = opts.step !== undefined ? ` step="${opts.step}"` : '';
    return `<input type="number" class="ov-input ov-num" data-pf="${pf}" value="${Number(val) || 0}"${min}${step} style="${styleAt(l,t,w,h)}" />`;
  };
  const ovMod = (key, l, t, w = 5.2, h = 2.4) => {
    const m = fmtMod(statMod(pc.stats?.[key]));
    return `<span class="ov-mod" data-mod-for="${key}" style="${styleAt(l,t,w,h)}">${m}</span>`;
  };

  /* ========== WANTED sheet overlay positions (percentages of image) ========== */
  // Identity rows (left card)
  const identityOverlay = [
    ovTxt('name',    pc.name,    13.5, 25.8, 15.0, 2.4),
    ovTxt('epithet', pc.epithet, 22.0, 28.9, 7.0,  2.4, 'e.g. Straw Hat'),
    ovTxt('role',    pc.role,    17.0, 32.0, 12.5, 2.4),
    ovTxt('age',     pc.age,     10.5, 35.2, 18.0, 2.4),
    ovTxt('home',    pc.home,    23.7, 38.3, 5.5,  2.4),
    ovTxt('player',  pc.player,   4.8, 41.6, 25.0, 2.4, 'Player username'),
  ].join('');

  // Inventory rows (7 visible)
  const invRowsHtml = [];
  for (let i = 0; i < 7; i++) {
    const row = pc.inventory[i] || { item: '', qty: 0, weight: '' };
    const top = 30.0 + i * 2.95;
    invRowsHtml.push(ovTxt(`inv:item:${i}`,   row.item,   57.0, top, 17.5, 2.5));
    invRowsHtml.push(ovNum(`inv:qty:${i}`,    row.qty,    76.0, top,  8.5, 2.5, { min: 0 }));
    invRowsHtml.push(ovTxt(`inv:weight:${i}`, row.weight, 85.5, top, 10.5, 2.5));
  }
  const inventoryOverlay = invRowsHtml.join('');

  // Stats — score & mod
  const STAT_ROWS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  const statsOverlay = STAT_ROWS.map((k, i) => {
    const top = 60.4 + i * 3.25;
    return (
      ovNum(`stat:${k}`, pc.stats?.[k], 21.5, top, 5.0, 2.4, { min: 0 }) +
      ovMod(k, 28.0, top, 5.0, 2.4)
    );
  }).join('');
  // AC / Initiative / Speed
  const combatOverlay = [
    ovNum('ac',         pc.ac,         21.5, 81.5, 6.0, 2.4),
    ovNum('initiative', pc.initiative, 21.5, 84.5, 6.0, 2.4),
    ovNum('speed',      pc.speed,      21.5, 87.5, 6.0, 2.4),
  ].join('');

  // Signature moves (4 stacked on right side)
  const movesOverlay = pc.moves.slice(0, 4).map((m, i) => {
    const blockTop = 54.6 + i * 9.6;
    return (
      ovTxt(`move:name:${i}`, m.name, 40.5, blockTop + 1.0, 51.0, 2.4) +
      ovTxt(`move:desc:${i}`, m.desc, 46.5, blockTop + 4.0, 45.0, 2.4)
    );
  }).join('');

  // Flashback circles (3) — overlaid as click targets above HEALTH box
  const flashOverlay = [0, 1, 2].map(i => {
    const left = 8.5 + i * 6.8;
    return `<button type="button" class="flash-circle ${i < pc.flashback ? 'filled' : ''}" data-pa="flash" data-i="${i}" style="${styleAt(left, 88.6, 4.0, 3.0)}" title="Flashback charge ${i + 1}"></button>`;
  }).join('');

  // Bottom row (Health / Scars / Ransom)
  const healthOverlay = [
    ovNum('maxHp',  pc.maxHp,  13.0, 93.0, 14.5, 2.4, { min: 1 }),
    ovNum('hp',     pc.hp,     17.0, 95.5, 10.5, 2.4, { min: 0 }),
    ovNum('tempHp', pc.tempHp, 13.0, 97.8, 14.5, 2.4, { min: 0 }),
  ].join('');
  const scarsOverlay = [
    ovTxt('scars:physical',   pc.scars.physical,   47.5, 93.0, 18.0, 2.4),
    ovTxt('scars:emotional',  pc.scars.emotional,  47.5, 95.5, 18.0, 2.4),
    ovTxt('scars:reputation', pc.scars.reputation, 47.5, 97.8, 18.0, 2.4),
  ].join('');
  const ransomOverlay = [
    ovTxt('ransom:piece',     pc.ransom.piece,     73.5, 93.0, 20.0, 2.4),
    ovTxt('ransom:curseName', pc.ransom.curseName, 73.5, 95.5, 20.0, 2.4),
    ovNum('ransom:curseDC',   pc.ransom.curseDC,   75.5, 97.8, 7.0,  2.4, { min: 0 }),
  ].join('');

  // Bounty banner (very bottom)
  const bountyOverlay = ovNum('bounty', pc.bounty, 58.0, 99.4, 30.0, 2.6, { min: 0, step: 100 });

  // Portrait overlay (inside oval)
  const portraitOverlay = `
    <div class="ov-portrait" style="${styleAt(34.0, 17.5, 21.0, 26.0)}">
      ${pc.portrait
        ? `<img src="${esc(pc.portrait)}" alt="portrait" />`
        : `<span class="muted">click to add portrait</span>`}
      <input type="file" accept="image/*" class="hidden" data-pa="portrait-file" aria-label="Portrait file" title="Portrait file" />
      <button type="button" class="ov-portrait-btn" data-pa="portrait-upload" title="Upload portrait"></button>
      ${pc.portrait ? `<button type="button" class="ov-portrait-clear danger" data-pa="portrait-clear" title="Clear portrait">×</button>` : ''}
    </div>
  `;

  /* ========== HP TRACKER overlay positions (percentages of image) ========== */
  // Top stat boxes (4 across) and death saves
  const chtTopOverlay = [
    ovNum('maxHp', pc.maxHp, 7.0,  19.0, 10.0, 4.0, { min: 1 }),
    ovNum('hp',    pc.hp,    31.0, 19.0, 10.0, 4.0, { min: 0 }),
    `<span class="ov-readout" data-cht="totalDmg" style="${styleAt(55.0, 19.0, 10.0, 4.0)}">${totalDmg}</span>`,
    `<span class="ov-readout" data-cht="sectionHp" style="${styleAt(79.0, 19.0, 10.0, 4.0)}">${sec}</span>`,
  ].join('');

  // Death save checkboxes (rough positions — adjust if needed)
  const dsBoxes = ['success', 'fail'].map((kind, ki) => {
    const top = 27.0 + ki * 3.5;
    return [0, 1, 2].map(i => {
      const left = 64.0 + i * 4.5;
      return `<label class="ov-check" style="${styleAt(left, top, 2.4, 2.4)}"><input type="checkbox" data-pf="ds:${kind}:${i}" ${pc.deathSaves[kind][i] ? 'checked' : ''} /><span></span></label>`;
    }).join('');
  }).join('');

  // 6 body parts overlaid around silhouette
  // Left column (rows 1-3): Head, Torso, R Arm at left ~3-22%
  // Right column (rows 4-6): L Arm, R Leg, L Leg at right ~78-97%
  const partPositions = {
    head:  { col: 'left',  top: 38.0 },
    torso: { col: 'left',  top: 53.5 },
    rArm:  { col: 'left',  top: 69.0 },
    lArm:  { col: 'right', top: 38.0 },
    rLeg:  { col: 'right', top: 53.5 },
    lLeg:  { col: 'right', top: 69.0 },
  };
  const bodyOverlayHtml = BODY_PARTS.map(p => {
    const pos = partPositions[p.key];
    const left = pos.col === 'left' ? 3.0 : 76.0;
    const w = 21.0;
    const part = pc.body[p.key];
    const states = DAMAGE_THRESHOLDS.map(t => `
      <label class="ov-state-box">
        <input type="checkbox" data-pf="body:state:${p.key}:${t}" ${part.states[t] ? 'checked' : ''} />
        <span>${t}%</span>
      </label>
    `).join('');
    return `
      <div class="ov-bodypart" style="${styleAt(left, pos.top, w, 13.5)}">
        <div class="ov-bp-row"><span class="ov-bp-label">${esc(p.label)}</span></div>
        <div class="ov-bp-row"><span>Section HP</span><b class="ov-bp-val" data-cht-section>${sec}</b></div>
        <div class="ov-bp-row"><span>Damage</span>
          <input type="number" class="ov-bp-input" data-pf="body:damage:${p.key}" min="0" value="${Number(part.damage) || 0}" />
        </div>
        <div class="ov-bp-states">${states}</div>
      </div>
    `;
  }).join('');

  return `
  <article class="player-card sheet-image-card" data-pidx="${idx}">
    <div class="sheet-actions-top btn-row">
      <button type="button" data-pa="portrait-upload">${pc.portrait ? 'Change Portrait' : 'Upload Portrait'}</button>
      ${pc.portrait ? '<button type="button" class="danger" data-pa="portrait-clear">Clear Portrait</button>' : ''}
      <button type="button" data-pa="hpdelta" data-delta="-5">-5 HP</button>
      <button type="button" data-pa="hpdelta" data-delta="-1">-1 HP</button>
      <button type="button" data-pa="hpdelta" data-delta="1">+1 HP</button>
      <button type="button" data-pa="hpdelta" data-delta="5">+5 HP</button>
      <button type="button" class="danger" data-pa="delete">Delete Sheet</button>
    </div>

    <!-- ========== WANTED CHARACTER SHEET (image overlay) ========== -->
    <div class="sheet-image-wrap wanted-wrap">
      <img class="sheet-image" src="assets/Charicter sheet.png" alt="Wanted character sheet" draggable="false" />
      ${identityOverlay}
      ${portraitOverlay}
      ${inventoryOverlay}
      ${statsOverlay}
      ${combatOverlay}
      ${movesOverlay}
      ${flashOverlay}
      ${healthOverlay}
      ${scarsOverlay}
      ${ransomOverlay}
      ${bountyOverlay}
    </div>

    <!-- ========== CINEMATIC HEALTH TRACKER (image overlay) ========== -->
    <div class="sheet-image-wrap cht-wrap">
      <img class="sheet-image" src="assets/Charicter HP.png" alt="Cinematic health tracker" draggable="false" />
      ${chtTopOverlay}
      ${dsBoxes}
      ${bodyOverlayHtml}
    </div>

    <!-- Supplemental fields not on the printable sheet -->
    <section class="sheet-extras parchment inset">
      <div class="grid two">
        <label>Level<input type="number" data-pf="level" min="1" value="${Math.max(1, Number(pc.level) || 1)}" /></label>
        <label>Class<input type="text" data-pf="charClass" value="${esc(pc.charClass)}" placeholder="e.g. Swordsman" /></label>
        <label>Devil Fruit<input type="text" data-pf="devilFruit" value="${esc(pc.devilFruit)}" placeholder="e.g. Gomu Gomu no Mi" /></label>
        <label class="full">Health Notes / Lingering Injuries<textarea data-pf="healthNotes" rows="3">${esc(pc.healthNotes)}</textarea></label>
        <label class="full">General Notes<textarea data-pf="notes" rows="3">${esc(pc.notes)}</textarea></label>
      </div>
      <div class="btn-row">
        <button type="button" data-pa="inv-add">+ Add Item to Inventory</button>
      </div>
    </section>

    <div class="muted updated-meta">${sheetMetaText(pc)}</div>
  </article>`;
}

function attachSheetHandlers(card, sheet, idx) {
  const metaEl = $('.updated-meta', card);
  const refreshMeta = () => { if (metaEl) metaEl.textContent = sheetMetaText(sheet); };

  const persist = () => {
    stampSheetEdit(sheet);
    save();
    refreshMeta();
  };

  const totalDamage = () =>
    BODY_PARTS.reduce((sum, p) => sum + (Number(sheet.body?.[p.key]?.damage) || 0), 0);

  const refreshDerived = () => {
    // stat mods (overlay spans on Wanted sheet)
    STAT_DEFS.forEach(s => {
      const modEl = card.querySelector(`[data-mod-for="${s.key}"]`);
      if (modEl) modEl.textContent = fmtMod(statMod(sheet.stats[s.key]));
    });
    // CHT readouts (total damage + section HP)
    const totalEl = card.querySelector('[data-cht="totalDmg"]');
    if (totalEl) totalEl.textContent = totalDamage();
    const secEl = card.querySelector('[data-cht="sectionHp"]');
    if (secEl) secEl.textContent = sectionHp(sheet.maxHp);
    // per body-part section HP value
    card.querySelectorAll('[data-cht-section]').forEach(el => {
      el.textContent = sectionHp(sheet.maxHp);
    });
  };

  // ---------- field bindings (data-pf="key" or "ns:sub" etc.) ----------
  $$('[data-pf]', card).forEach(el => {
    const handler = () => {
      if (!requireUsername()) return;
      const path = el.dataset.pf.split(':');
      const ns = path[0];
      let value;
      if (el.type === 'checkbox') value = el.checked;
      else if (el.type === 'number') value = Number(el.value) || 0;
      else value = el.value;

      switch (ns) {
        case 'stat': {
          const k = path[1];
          sheet.stats[k] = Math.max(0, value);
          refreshDerived();
          persist();
          return;
        }
        case 'inv': {
          const field = path[1];
          const ri = Number(path[2]);
          if (!sheet.inventory[ri]) return;
          if (field === 'qty') sheet.inventory[ri].qty = Math.max(0, value);
          else sheet.inventory[ri][field] = value;
          persist();
          return;
        }
        case 'move': {
          const field = path[1];
          const mi = Number(path[2]);
          if (!sheet.moves[mi]) sheet.moves[mi] = { name: '', desc: '' };
          sheet.moves[mi][field] = value;
          persist();
          return;
        }
        case 'scars':
          sheet.scars[path[1]] = value;
          persist();
          return;
        case 'ransom':
          sheet.ransom[path[1]] = path[1] === 'curseDC' ? Math.max(0, value) : value;
          persist();
          return;
        case 'ds': {
          const kind = path[1];
          const i = Number(path[2]);
          sheet.deathSaves[kind][i] = Boolean(value);
          persist();
          return;
        }
        case 'body': {
          const field = path[1];
          const pk = path[2];
          if (field === 'damage') sheet.body[pk].damage = Math.max(0, value);
          else if (field === 'state') sheet.body[pk].states[path[3]] = Boolean(value);
          refreshDerived();
          persist();
          return;
        }
        default: {
          const key = ns;
          if (key === 'maxHp') {
            sheet.maxHp = Math.max(1, value);
            if (sheet.hp > sheet.maxHp) {
              sheet.hp = sheet.maxHp;
              const hpInput = card.querySelector('[data-pf="hp"]');
              if (hpInput) hpInput.value = sheet.hp;
            }
            refreshDerived();
            persist();
            return;
          }
          if (key === 'hp')      value = clamp(value, 0, Math.max(1, Number(sheet.maxHp) || 1));
          if (key === 'tempHp')  value = Math.max(0, value);
          if (key === 'bounty')  value = Math.max(0, value);
          if (key === 'level')   value = Math.max(1, value);
          if (key === 'ac' || key === 'speed') value = Math.max(0, value);
          sheet[key] = value;
          if (key === 'hp') refreshDerived();
          persist();
        }
      }
    };
    el.addEventListener('input', handler);
    if (el.type === 'checkbox') el.addEventListener('change', handler);
  });

  // ---------- action buttons (these can re-render safely; no text focus) ----------
  $$('[data-pa]', card).forEach(btn => {
    const act = btn.dataset.pa;
    btn.addEventListener('click', () => {
      if (act !== 'portrait-file' && !requireUsername()) return;
      switch (act) {
        case 'hpdelta': {
          const delta = Number(btn.dataset.delta) || 0;
          sheet.hp = clamp((Number(sheet.hp) || 0) + delta, 0, Math.max(1, Number(sheet.maxHp) || 1));
          const hpInput = card.querySelector('[data-pf="hp"]');
          if (hpInput) hpInput.value = sheet.hp;
          refreshDerived();
          persist();
          break;
        }
        case 'flash': {
          const i = Number(btn.dataset.i);
          // Click filled circle to clear from there; click empty to fill up to it.
          sheet.flashback = (sheet.flashback === i + 1) ? i : i + 1;
          card.querySelectorAll('.flash-circle').forEach((el, j) => {
            el.classList.toggle('filled', j < sheet.flashback);
          });
          persist();
          break;
        }
        case 'inv-add':
          sheet.inventory.push({ item: '', qty: 1, weight: '' });
          save();
          renderPlayerSheets();
          break;
        case 'inv-del': {
          const ri = Number(btn.dataset.row);
          sheet.inventory.splice(ri, 1);
          save();
          renderPlayerSheets();
          break;
        }
        case 'portrait-upload': {
          const fileInput = card.querySelector('[data-pa="portrait-file"]');
          if (fileInput) fileInput.click();
          break;
        }
        case 'portrait-clear':
          sheet.portrait = '';
          save();
          renderPlayerSheets();
          break;
        case 'delete':
          if (!confirm(`Delete ${sheet.name || 'this'} character sheet?`)) return;
          state.playerSheets.splice(idx, 1);
          save();
          renderPlayerSheets();
          break;
      }
    });
  });

  // Portrait file input -> data URL
  const fileEl = $('[data-pa="portrait-file"]', card);
  if (fileEl) {
    fileEl.addEventListener('change', () => {
      if (!requireUsername()) return;
      const f = fileEl.files && fileEl.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        sheet.portrait = String(reader.result || '');
        save();
        renderPlayerSheets();
      };
      reader.readAsDataURL(f);
    });
  }
}

/* ===========================================================
   SEA TRAVEL — Routes
   =========================================================== */
const ROUTE_TEMPLATES = [
  { label: "Coastal hop (East Blue)",       days: 2,  dc: 10, danger: 0 },
  { label: "Inter-island, calm sea",        days: 4,  dc: 12, danger: 1 },
  { label: "Open ocean crossing",           days: 6,  dc: 14, danger: 2 },
  { label: "Grand Line leg (Log Pose)",     days: 10, dc: 15, danger: 3 },
  { label: "Storm sea / cursed water",      days: 14, dc: 17, danger: 5 },
];

const COMPLICATION_TABLE = [
  "Storm front — ship takes 1d6 hull, lose 1 day of progress.",
  "Off course — next roll at disadvantage.",
  "Sea King sighting — Lookout DC+2 or take a wound, lose 1 progress.",
  "Sickness aboard — Cook/Doctor save or –1 to crew rolls until treated.",
  "Supplies spoiled — lose 1 food and 1 water.",
  "Rigging fails — Shipwright DC or lose 10% Sails condition.",
  "Marine patrol on horizon — sneak, run, or fight.",
  "Rival pirate shadow — they want what you carry.",
  "Mutiny whisper — Captain Charisma check or –1 Morale.",
  "Cursed fog — Devil's Ransom resonance, force a Ransom Twist.",
  "Drifting wreck / castaway — reveal hook, costs a day.",
  "Whirlpool / reef — DEX vehicle check; hull damage on fail."
];

const SAILING_EVENTS = [
  "Dead calm — no wind; first roll today at disadvantage.",
  "Following wind — first success today counts +1 extra progress.",
  "Strange tide — Navigator Wisdom save or lose a day.",
  "Music on the water — distant ship sings; Morale +1.",
  "Sea bird omen — DM picks next complication (foreshadow).",
  "Bottle in the waves — clue, map fragment, or distress note.",
  "Drifting cargo — 1 supply of food/water/medicine recovered.",
  "Whale pod — peaceful unless attacked.",
  "Storm building — every roll today at +1 DC.",
  "Devil's Ransom resonance — pieces glow; trigger Ransom Twist."
];

const SETBACKS = [
  "lose 1 food",
  "lose 1 water",
  "−5 hull",
  "−10% sails",
  "−1 Morale",
  "1 crew member injured",
];

function showNewRouteForm(show) {
  $('#travel-new-form').classList.toggle('hidden', !show);
}

function loadRouteTemplate() {
  const lines = ROUTE_TEMPLATES.map((t,i) => `${i+1}. ${t.label} — ${t.days} days, DC ${t.dc}, +${t.danger} danger`).join('\n');
  const pickStr = prompt(`Pick a template (1-${ROUTE_TEMPLATES.length}):\n\n${lines}`);
  const idx = Number(pickStr) - 1;
  const t = ROUTE_TEMPLATES[idx];
  if (!t) return;
  showNewRouteForm(true);
  $('#nr-days').value = t.days;
  $('#nr-dc').value = t.dc;
  $('#nr-danger').value = t.danger;
}

function createRouteFromForm() {
  const start = $('#nr-start').value.trim() || 'Unknown Port';
  const dest  = $('#nr-dest').value.trim()  || 'Unknown Destination';
  const days  = Math.max(1, Number($('#nr-days').value) || 1);
  const dc    = Number($('#nr-dc').value) || 12;
  const dangerMod = Math.max(0, Number($('#nr-danger').value) || 0);
  const compLim = Math.max(1, Number($('#nr-complim').value) || 3);
  const target = days + dangerMod;
  const roles = $$('input[name="nr-role"]:checked').map(el => el.value);
  const form = $('#travel-new-form');
  const startMarkerId = form?.dataset.startMarkerId || null;
  const destMarkerId  = form?.dataset.destMarkerId  || null;
  const route = {
    id: uid(),
    createdAt: new Date().toISOString(),
    start, dest, days, dc, dangerMod, target, compLim, roles,
    progress: 0, complications: 0, currentDay: 1,
    status: 'active', // 'active' | 'won' | 'lost'
    startMarkerId, destMarkerId,
    log: []
  };
  state.routes.unshift(route);
  state.activeRouteId = route.id;
  save();
  showNewRouteForm(false);
  ['nr-start','nr-dest'].forEach(id => { const el = $('#'+id); if (el) el.value = ''; });
  if (form) {
    delete form.dataset.startMarkerId;
    delete form.dataset.destMarkerId;
  }
  const status = $('#nr-marker-status');
  if (status) status.textContent = '';
  renderTravel();
  if (typeof renderMap === 'function') renderMap();
}

function activeRoute() {
  return state.routes.find(r => r.id === state.activeRouteId) || null;
}

function applyRoll(roleIdx, rollVal) {
  const r = activeRoute();
  if (!r || r.status !== 'active') return;
  const role = r.roles[roleIdx] || 'Crew';
  const dc = r.dc;
  let progress = 0, complication = 0, setback = null;
  let resultText = '';
  if (rollVal === 20) { progress = 3; resultText = 'Nat 20 — +3 progress'; }
  else if (rollVal === 1) {
    complication = 1;
    setback = pick(SETBACKS);
    resultText = `Nat 1 — +1 complication + setback (${setback})`;
  }
  else if (rollVal >= dc + 5) { progress = 2; resultText = `Beat DC by 5+ — +2 progress`; }
  else if (rollVal >= dc)     { progress = 1; resultText = `Met DC — +1 progress`; }
  else if (rollVal >= dc - 4) { progress = 0; resultText = `Failed by 1–4 — 0 progress`; }
  else                        { complication = 1; resultText = `Failed by 5+ — +1 complication`; }

  r.progress += progress;
  r.complications += complication;
  r.log.push({
    day: r.currentDay,
    role, roll: rollVal, dc,
    progress, complication, setback,
    text: resultText,
    when: new Date().toISOString()
  });

  // Win/Lose check
  if (r.progress >= r.target) r.status = 'won';
  else if (r.complications >= r.compLim) r.status = 'lost';

  save();
  renderTravel();
}

function nextTravelDay() {
  const r = activeRoute();
  if (!r || r.status !== 'active') return;
  r.currentDay += 1;
  // Daily food/water consumption based on crew count (min 1)
  const crewCount = Math.max(1, state.ship.crew.length || state.partySize || 4);
  state.ship.food = Math.max(0, state.ship.food - crewCount);
  state.ship.water = Math.max(0, state.ship.water - crewCount);
  r.log.push({
    day: r.currentDay - 1,
    role: '— end of day —',
    text: `Day ${r.currentDay - 1} ends. Consumed ${crewCount} food and ${crewCount} water.`,
    when: new Date().toISOString(),
    isMeta: true
  });
  save();
  renderTravel();
  renderShip();
}

function rollSailingEvent() {
  const r = activeRoute();
  if (!r) return;
  const idx = roll(10) - 1;
  const ev = SAILING_EVENTS[idx];
  r.log.push({
    day: r.currentDay,
    role: '⛵ Sailing Event',
    text: `(d10 = ${idx+1}) ${ev}`,
    when: new Date().toISOString(),
    isMeta: true
  });
  save(); renderTravel();
}

function rollComplicationDetail() {
  const r = activeRoute();
  if (!r) return;
  const idx = roll(12) - 1;
  const c = COMPLICATION_TABLE[idx];
  r.log.push({
    day: r.currentDay,
    role: '⚠ Complication Detail',
    text: `(d12 = ${idx+1}) ${c}`,
    when: new Date().toISOString(),
    isMeta: true
  });
  save(); renderTravel();
}

function endRoute(force) {
  const r = activeRoute();
  if (!r) return;
  if (r.status === 'active' && !confirm('End this route now? It will be marked as Aborted.')) return;
  if (r.status === 'active') r.status = force || 'aborted';
  state.activeRouteId = null;
  save(); renderTravel();
}

function resumeRoute(id) {
  state.activeRouteId = id;
  const r = state.routes.find(x => x.id === id);
  if (r && r.status !== 'active') r.status = 'active';
  save(); renderTravel();
}

function deleteRoute(id) {
  if (!confirm('Delete this route entirely?')) return;
  state.routes = state.routes.filter(r => r.id !== id);
  if (state.activeRouteId === id) state.activeRouteId = null;
  save(); renderTravel();
}

function renderTravel() {
  if (typeof renderMapRoute === 'function') renderMapRoute();
  // Active route
  const root = $('#travel-active');
  const r = activeRoute();
  if (!r) {
    root.innerHTML = '<p class="muted">No active sea route. Create one to begin tracking.</p>';
  } else {
    const progPct = Math.min(100, (r.progress / r.target) * 100);
    const compPct = Math.min(100, (r.complications / r.compLim) * 100);
    const statusBanner = r.status === 'won'
      ? '<div class="route-status win">🏁 SUCCESS — Reached destination!</div>'
      : r.status === 'lost'
      ? '<div class="route-status lose">☠ FAILURE — Complication limit hit. The route becomes a story event.</div>'
      : '<div class="route-status active">⛵ Voyage in progress…</div>';
    const roleOpts = r.roles.map((rl,i) => `<option value="${i}">${esc(rl)}</option>`).join('');
    root.innerHTML = `
      <div class="route-card">
        <h3>${esc(r.start)} → ${esc(r.dest)}</h3>
        ${statusBanner}
        <div class="pair">
          <div><span>Day:</span> <b>${r.currentDay} / ${r.days}</b></div>
          <div><span>Roll DC:</span> <b>${r.dc}</b></div>
          <div><span>Target:</span> <b>${r.target}</b> (days ${r.days} + danger ${r.dangerMod})</div>
          <div><span>Complication Limit:</span> <b>${r.compLim}</b></div>
        </div>
        <div class="bars">
          <div class="bar-block">
            <div class="bar-label"><span>Progress</span><span>${r.progress} / ${r.target}</span></div>
            <div class="clock-bar progress"><div style="width:${progPct}%"></div></div>
          </div>
          <div class="bar-block">
            <div class="bar-label"><span>Complications</span><span>${r.complications} / ${r.compLim}</span></div>
            <div class="clock-bar complications"><div style="width:${compPct}%"></div></div>
          </div>
        </div>

        ${r.status === 'active' ? `
        <div class="roll-input">
          <label>Crew Role
            <select id="roll-role">${roleOpts}</select>
          </label>
          <label>d20 Roll
            <input type="number" id="roll-val" min="1" max="20" value="10" />
          </label>
          <button class="gold" id="apply-roll">Apply Roll</button>
          <button id="auto-roll">🎲 Auto-roll d20</button>
          <button id="next-day">▶ Next Day</button>
          <button id="sail-event">d10 Sailing Event</button>
          <button id="comp-detail">d12 Complication</button>
        </div>` : `
        <div class="btn-row">
          <button class="gold" id="end-route">Archive Route</button>
        </div>`}

        <div class="day-log" id="day-log"></div>

        <div class="btn-row">
          <button class="danger" id="abort-route">Abort / Close Route</button>
        </div>
      </div>`;

    // Render log
    const logRoot = $('#day-log');
    if (!r.log.length) logRoot.innerHTML = '<div class="entry meta">No rolls yet. Make a roll to start the voyage.</div>';
    else {
      logRoot.innerHTML = r.log.slice().reverse().map(e => {
        if (e.isMeta) {
          return `<div class="entry"><span class="meta">Day ${e.day} · ${esc(e.role)}</span><br>${esc(e.text)}</div>`;
        }
        const cls = e.progress > 0 ? 'pos' : (e.complication > 0 ? 'neg' : '');
        const delta = e.progress > 0 ? `<span class="pos">+${e.progress} progress</span>`
                    : e.complication > 0 ? `<span class="neg">+${e.complication} complication${e.setback ? ` (${esc(e.setback)})` : ''}</span>`
                    : '<span class="meta">no change</span>';
        return `<div class="entry">
          <span class="meta">Day ${e.day} · ${esc(e.role)} · rolled ${e.roll} vs DC ${e.dc}</span><br>
          ${esc(e.text)} — ${delta}
        </div>`;
      }).join('');
    }

    // Wire buttons
    const applyBtn = $('#apply-roll');
    if (applyBtn) applyBtn.addEventListener('click', () => {
      const role = Number($('#roll-role').value);
      const v = clamp(Number($('#roll-val').value) || 0, 1, 20);
      applyRoll(role, v);
    });
    const autoBtn = $('#auto-roll');
    if (autoBtn) autoBtn.addEventListener('click', () => {
      const role = Number($('#roll-role').value);
      const v = roll(20);
      $('#roll-val').value = v;
      applyRoll(role, v);
    });
    const nextBtn = $('#next-day');
    if (nextBtn) nextBtn.addEventListener('click', nextTravelDay);
    const seBtn = $('#sail-event');
    if (seBtn) seBtn.addEventListener('click', rollSailingEvent);
    const cdBtn = $('#comp-detail');
    if (cdBtn) cdBtn.addEventListener('click', rollComplicationDetail);
    const endBtn = $('#end-route');
    if (endBtn) endBtn.addEventListener('click', () => { state.activeRouteId = null; save(); renderTravel(); });
    const abortBtn = $('#abort-route');
    if (abortBtn) abortBtn.addEventListener('click', () => endRoute('aborted'));
  }

  // History
  const hist = $('#travel-history');
  const others = state.routes.filter(r2 => r2.id !== state.activeRouteId);
  if (!others.length) {
    hist.innerHTML = '<p class="muted">No archived routes yet.</p>';
  } else {
    hist.innerHTML = others.map(r2 => `
      <div class="route-card">
        <h3>${esc(r2.start)} → ${esc(r2.dest)}
          <span class="muted" style="font-size:0.85rem; font-weight:normal;">
            · ${esc(r2.status.toUpperCase())} · ${r2.progress}/${r2.target} progress · ${r2.complications}/${r2.compLim} comps
          </span>
        </h3>
        <div class="pair">
          <div><span>Days:</span> <b>${r2.days}</b></div>
          <div><span>DC:</span> <b>${r2.dc}</b></div>
          <div><span>Created:</span> <b>${new Date(r2.createdAt).toLocaleDateString()}</b></div>
        </div>
        <div class="btn-row">
          <button onclick="resumeRoute('${r2.id}')">Resume</button>
          <button class="danger" onclick="deleteRoute('${r2.id}')">Delete</button>
        </div>
      </div>`).join('');
  }
}
window.resumeRoute = resumeRoute;
window.deleteRoute = deleteRoute;

/* ===========================================================
   SHIP TRACKER
   =========================================================== */
function bindShipFields() {
  $$('[data-ship]').forEach(el => {
    const k = el.dataset.ship;
    if (state.ship[k] !== undefined) el.value = state.ship[k];
    el.addEventListener('input', () => {
      let v = el.value;
      if (el.type === 'number') v = Number(v) || 0;
      state.ship[k] = v;
      save(); renderShip();
    });
  });
  $$('[data-shipdelta]').forEach(b => b.addEventListener('click', () => {
    const { k, d } = JSON.parse(b.dataset.shipdelta);
    let v = (state.ship[k] || 0) + d;
    if (k === 'hull') v = clamp(v, 0, state.ship.hullMax || 9999);
    if (k === 'sails') v = clamp(v, 0, 100);
    if (k === 'morale') v = clamp(v, 0, 10);
    if (['food','water','medicine','ammo','berries','repair'].includes(k)) v = Math.max(0, v);
    state.ship[k] = v;
    save(); renderShip();
  }));
}

function renderShip() {
  const s = state.ship;
  $('#ship-hull').textContent = s.hull;
  $('#ship-sails').textContent = s.sails;
  $('#ship-morale').textContent = s.morale;
  $('#ship-food').textContent = s.food;
  $('#ship-water').textContent = s.water;
  $('#ship-medicine').textContent = s.medicine;
  $('#ship-ammo').textContent = s.ammo;
  $('#ship-berries').textContent = s.berries;
  $('#ship-repair').textContent = s.repair;
  const hullPct = s.hullMax ? clamp((s.hull / s.hullMax) * 100, 0, 100) : 0;
  $('#hull-fill').style.width = hullPct + '%';
  $('#sails-fill').style.width = clamp(s.sails, 0, 100) + '%';
  $('#morale-fill').style.width = clamp(s.morale * 10, 0, 100) + '%';

  // Crew
  const crewRoot = $('#crew-list');
  if (!s.crew.length) crewRoot.innerHTML = '<p class="muted">No crew added yet.</p>';
  else {
    crewRoot.innerHTML = s.crew.map((c, i) => `
      <div class="crew-card" data-i="${i}">
        <div class="grid two">
          <label>Name<input data-cf="name" value="${esc(c.name)}" /></label>
          <label>Role<input data-cf="role" value="${esc(c.role)}" /></label>
          <label>HP <input type="number" data-cf="hp" value="${c.hp}" /></label>
          <label>Max HP <input type="number" data-cf="maxHp" value="${c.maxHp}" /></label>
          <label class="full">Status / Conditions<input data-cf="status" value="${esc(c.status)}" /></label>
          <label class="full">Notes<textarea data-cf="notes" rows="2">${esc(c.notes)}</textarea></label>
        </div>
        <div class="row-end"><button class="danger" data-ca="del">Remove</button></div>
      </div>`).join('');
    $$('#crew-list .crew-card').forEach(card => {
      const i = Number(card.dataset.i);
      $$('[data-cf]', card).forEach(el => {
        el.addEventListener('input', () => {
          const k = el.dataset.cf;
          state.ship.crew[i][k] = el.type === 'number' ? (Number(el.value) || 0) : el.value;
          save();
        });
      });
      $('[data-ca="del"]', card).addEventListener('click', () => {
        if (confirm('Remove this crew member?')) {
          state.ship.crew.splice(i,1); save(); renderShip();
        }
      });
    });
  }

  // Log
  const logRoot = $('#ship-log-list');
  if (!s.log.length) logRoot.innerHTML = '<p class="muted">No ship events logged.</p>';
  else {
    logRoot.innerHTML = s.log.slice().reverse().map((e, revIdx) => {
      const realIdx = s.log.length - 1 - revIdx;
      return `<div class="entry">
        <span>${esc(e.text)}</span>
        <span class="when">${new Date(e.when).toLocaleString()}
          <button data-lidx="${realIdx}">✕</button>
        </span>
      </div>`;
    }).join('');
    $$('#ship-log-list [data-lidx]').forEach(b => b.addEventListener('click', () => {
      state.ship.log.splice(Number(b.dataset.lidx), 1); save(); renderShip();
    }));
  }
}

function addCrewMember() {
  state.ship.crew.push({
    name: 'New Crew', role: '', hp: 20, maxHp: 20, status: '', notes: ''
  });
  save(); renderShip();
}

function addShipLogEntry() {
  const input = $('#ship-log-input');
  const txt = input.value.trim();
  if (!txt) return;
  state.ship.log.push({ text: txt, when: new Date().toISOString() });
  input.value = '';
  save(); renderShip();
}

/* ===========================================================
   INIT
   =========================================================== */
bindFields();
bindShipFields();
initLogin();
refreshStats();
renderLog();
renderPlayerSheets();
renderTravel();
renderShip();

