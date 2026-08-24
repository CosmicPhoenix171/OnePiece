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
    fireDamage: 0,
    waterDamage: 0,
    food: 20, water: 20, medicine: 4, ammo: 15, berries: 500, repair: 2,
    crew: [],
    log: []
  },
  playerSheets: [],
  playerNotes: {},
  playerNoteDates: {},
  rollLog: [],
  dicePreferences: {},
  npcEncounter: [],
  sharedImages: [],
  sharedImageBroadcast: null,
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
  let syncResult = Promise.resolve(false);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Local save skipped; campaign data exceeds browser storage.', error);
  }
  if (!__applyingRemote && typeof window.syncPush === 'function') {
    try { syncResult = window.syncPush(state); } catch (e) { console.error('syncPush failed', e); }
  }
  return syncResult;
}

let __applyingRemote = false;
const __pendingLogBooks = new Set();

function logBookOwnerKey(username, notes = state.playerNotes) {
  const requested = normalizeUsername(username);
  const requestedKey = requested.toLowerCase();
  const existing = Object.keys(notes || {})
    .find((name) => normalizeUsername(name).toLowerCase() === requestedKey);
  return existing || requested;
}

function saveLogBook(username) {
  const owner = logBookOwnerKey(username);
  if (!owner) return Promise.resolve(false);
  const ownerKey = normalizeUsername(owner).toLowerCase();
  __pendingLogBooks.add(ownerKey);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Local save skipped; campaign data exceeds browser storage.', error);
  }
  if (typeof window.syncLogBook !== 'function') return Promise.resolve(false);
  return window.syncLogBook(owner, state.playerNotes[owner], state.playerNoteDates[owner])
    .then((saved) => {
      if (saved) __pendingLogBooks.delete(ownerKey);
      return saved;
    });
}

function applyRemoteState(remote, options = {}) {
  if (!remote || typeof remote !== 'object') return;
  // Preserve viewer-local fields (pan/zoom, UI toggles) across remote updates
  // so other players' edits never hijack this viewer's map viewport.
  const localMapView = state.mapView;
  const localPlayerNotes = state.playerNotes || {};
  const localPlayerNoteDates = state.playerNoteDates || {};
  const incomingBroadcast = remote.sharedImageBroadcast;
  const shouldPresentBroadcast = !options.initial
    && !isGmUser()
    && incomingBroadcast?.id
    && incomingBroadcast.id !== state.sharedImageBroadcast?.id;
  __applyingRemote = true;
  try {
    Object.keys(state).forEach((k) => { delete state[k]; });
    Object.assign(state, structuredClone(DEFAULT_STATE), remote);
    if (localMapView) state.mapView = localMapView;
    __pendingLogBooks.forEach((ownerKey) => {
      const localOwner = Object.keys(localPlayerNotes).find((name) => normalizeUsername(name).toLowerCase() === ownerKey);
      if (!localOwner) return;
      const remoteOwner = logBookOwnerKey(localOwner, state.playerNotes);
      state.playerNotes[remoteOwner] = localPlayerNotes[localOwner];
      if (Array.isArray(localPlayerNoteDates[localOwner])) {
        state.playerNoteDates[remoteOwner] = localPlayerNoteDates[localOwner];
      }
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('Remote state exceeds browser storage; keeping it in memory.', error);
    }
    rerenderAll();
    if (shouldPresentBroadcast) showSharedImageBroadcast(incomingBroadcast);
  } finally {
    __applyingRemote = false;
  }
}
function rerenderAll() {
  try { if (typeof refreshStats === 'function') refreshStats(); } catch (e) { console.error(e); }
  try { if (typeof renderNpcEncounter === 'function') renderNpcEncounter(); } catch (e) { console.error(e); }
  try { if (typeof renderNpcCards === 'function') renderNpcCards(); } catch (e) { console.error(e); }
  try { if (typeof renderRollLog === 'function') renderRollLog(); } catch (e) { console.error(e); }
  try { if (typeof renderLog === 'function') renderLog(); } catch (e) { console.error(e); }
  try { if (typeof renderPlayerSheets === 'function') renderPlayerSheets(); } catch (e) { console.error(e); }
  try { if (typeof renderTravel === 'function') renderTravel(); } catch (e) { console.error(e); }
  try { if (typeof renderShip === 'function') renderShip(); } catch (e) { console.error(e); }
  try { if (typeof renderMap === 'function') renderMap(); } catch (e) { console.error(e); }
  try { if (typeof renderSharedImages === 'function') renderSharedImages(); } catch (e) { console.error(e); }
  try { if (typeof window.refreshPdfSheetFields === 'function') window.refreshPdfSheetFields(); } catch (e) { console.error(e); }
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
  updateGmOnlyUI();
  // After login, make sure non-GM users have their own sheet and re-render it.
  try { ensureOwnSheet(); } catch (e) { console.error(e); }
  try { if (typeof renderPlayerSheets === 'function') renderPlayerSheets(); } catch (e) { console.error(e); }
  try { if (typeof renderRollLog === 'function') renderRollLog(); } catch (e) { console.error(e); }
  try { if (typeof renderLog === 'function') renderLog(); } catch (e) { console.error(e); }
}

function updateGmOnlyUI() {
  const gm = isGmUser();
  $$('[data-gm-only]').forEach((element) => { element.hidden = !gm; });
  if (!gm && $('#tab-npcs')?.classList.contains('active')) showTab('map');
  if (gm) {
    renderNpcEncounter();
    renderNpcCards();
  }
  renderSharedImages();
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
  // Restored session: make sure the current user already has their sheet.
  try { ensureOwnSheet(); } catch (e) { console.error(e); }
}

function initAppInstall() {
  const installButton = $('#install-app-btn');
  const iosInstallHint = $('#ios-install-hint');
  let installPrompt = null;

  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || navigator.standalone === true;

  if (iosInstallHint) iosInstallHint.hidden = !isIos || isInstalled;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    if (installButton) installButton.hidden = false;
  });

  if (installButton) {
    installButton.addEventListener('click', async () => {
      if (!installPrompt) return;
      installButton.hidden = true;
      await installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
    });
  }

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    if (installButton) installButton.hidden = true;
    if (iosInstallHint) iosInstallHint.hidden = true;
  });
}

const DANGER_LABELS = { 1:"Safe or familiar area", 2:"Risky area", 3:"Dangerous area", 4:"Deadly area", 5:"Nightmare area" };
const HEAT_LABELS   = { 0:"Unlisted", 1:"Local notice", 2:"Regional bounty", 3:"Known pirate crew", 4:"Major bounty", 5:"Government priority target" };

/* ===========================================================
   Tab navigation
   =========================================================== */
const tabsMenuToggle = $('#tabs-menu-toggle');
tabsMenuToggle?.addEventListener('click', () => {
  const isOpen = $('#tabs').classList.toggle('menu-open');
  tabsMenuToggle.setAttribute('aria-expanded', String(isOpen));
});

$$('#tabs .tab').forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.tab)));

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
    case 'addShipLog':     addShipLogEntry(); break;
    case 'importMap':      importMapImage(); break;
    case 'uploadSharedImage': if (isGmUser()) $('#shared-image-input')?.click(); break;
    case 'resetMapImage':  if (confirm('Remove the current map image?')) { state.mapImageData = ''; state.mapImageName = ''; save(); renderMap(); } break;
    case 'clearMap':       if (confirm('Remove all map markers?')) { state.mapMarkers = []; save(); renderMap(); } break;
    case 'centerShip':     centerOnShip(); break;
    case 'routeFromMap':   if (typeof enterRoutePickMode === 'function') enterRoutePickMode(); break;
    case 'toggleTravelPanel': if (typeof toggleTravelPanel === 'function') toggleTravelPanel(); break;
    case 'addPlayerSheet': addPlayerSheet(); break;
    case 'clearRollLog':
      if (isGmUser() && confirm('Clear the entire Roll Log?')) {
        state.rollLog = [];
        save();
        renderRollLog();
      }
      break;
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
  if (name === 'npcs' && !isGmUser()) return;
  const tab = $(`#tabs .tab[data-tab="${name}"]`);
  const panel = $(`#tab-${name}`);
  if (!tab || !panel) return;
  $$('#tabs .tab').forEach(x => x.classList.remove('active'));
  $$('.panel').forEach(p => p.classList.remove('active'));
  tab.classList.add('active');
  panel.classList.add('active');
  $('#tabs').classList.remove('menu-open');
  tabsMenuToggle?.setAttribute('aria-expanded', 'false');
  if (name === 'characters') {
    requestAnimationFrame(() => window.pdfSheet?.renderVisible?.());
  }
}

/* ===========================================================
   SHARED IMAGES
   =========================================================== */
const SHARED_IMAGE_WARNING_BYTES = 6 * 1024 * 1024;
const SHARED_IMAGE_CACHE = 'sea-trouble-shared-images-v1';
const sharedImageMemoryCache = new Map();
const sharedImageLoads = new Map();
const migratingSharedImages = new Set();

function sharedImageCacheRequest(imageId) {
  return new Request(`https://sea-trouble-image-cache.invalid/${encodeURIComponent(imageId)}`);
}

async function cacheSharedImageData(imageId, data) {
  if (!imageId || !data) return;
  sharedImageMemoryCache.set(imageId, data);
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(SHARED_IMAGE_CACHE);
    await cache.put(sharedImageCacheRequest(imageId), new Response(data));
  } catch (error) {
    console.warn('Persistent image cache unavailable.', error);
  }
}

async function evictSharedImageData(imageId) {
  sharedImageMemoryCache.delete(imageId);
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(SHARED_IMAGE_CACHE);
    await cache.delete(sharedImageCacheRequest(imageId));
  } catch (error) {
    console.warn('Could not remove cached image.', error);
  }
}

async function resolveSharedImageData(image) {
  if (!image?.id) return '';
  if (image.data) {
    await cacheSharedImageData(image.id, image.data);
    return image.data;
  }
  if (sharedImageMemoryCache.has(image.id)) return sharedImageMemoryCache.get(image.id);
  if (sharedImageLoads.has(image.id)) return sharedImageLoads.get(image.id);

  const load = (async () => {
    if ('caches' in window) {
      try {
        const cached = await caches.match(sharedImageCacheRequest(image.id));
        if (cached) {
          const data = await cached.text();
          sharedImageMemoryCache.set(image.id, data);
          return data;
        }
      } catch (error) {
        console.warn('Could not read cached image.', error);
      }
    }
    if (typeof window.fetchSharedImageData !== 'function') return '';
    const data = await window.fetchSharedImageData(image.id);
    if (data) await cacheSharedImageData(image.id, data);
    return data;
  })().finally(() => sharedImageLoads.delete(image.id));

  sharedImageLoads.set(image.id, load);
  return load;
}

function migrateEmbeddedSharedImage(image) {
  if (!isGmUser() || !image?.id || !image.data || migratingSharedImages.has(image.id)
      || typeof window.storeSharedImageData !== 'function') return;
  migratingSharedImages.add(image.id);
  cacheSharedImageData(image.id, image.data);
  window.storeSharedImageData(image.id, image.data).then((stored) => {
    if (!stored) return;
    delete image.data;
    save();
  }).finally(() => migratingSharedImages.delete(image.id));
}

function sharedImages() {
  if (!Array.isArray(state.sharedImages)) state.sharedImages = [];
  return state.sharedImages;
}

function visibleSharedImages() {
  const images = sharedImages();
  return isGmUser() ? images : images.filter((image) => image.visibleToPlayers);
}

function renderSharedImages() {
  const root = $('#shared-image-list');
  const summary = $('#shared-images-summary');
  if (!root) return;

  const gm = isGmUser();
  const allImages = sharedImages();
  const images = visibleSharedImages();
  if (summary) {
    summary.textContent = gm
      ? `${allImages.length} image${allImages.length === 1 ? '' : 's'} stored · ${allImages.filter((image) => image.visibleToPlayers).length} visible to players`
      : `${images.length} image${images.length === 1 ? '' : 's'} shared with the crew`;
  }

  if (!images.length) {
    root.innerHTML = `<p class="shared-images-empty muted">${gm ? 'Upload an image to share it with the players.' : 'The GM has not revealed any images yet.'}</p>`;
    return;
  }

  root.innerHTML = images.map((image) => `<article class="shared-image-card${image.visibleToPlayers ? '' : ' concealed'}" data-shared-image-id="${esc(image.id)}">
    <a href="#" target="_blank" rel="noopener" title="Open full-size image" aria-busy="true">
      <img alt="${esc(image.name || 'Shared image')}" loading="lazy" />
    </a>
    <div class="shared-image-details">
      ${gm
        ? `<input type="text" data-shared-image-name value="${esc(image.name || '')}" maxlength="80" aria-label="Image name" />
          <div class="shared-image-actions">
            <label class="shared-image-visibility"><input type="checkbox" data-shared-image-visible ${image.visibleToPlayers ? 'checked' : ''} /> <span>${image.visibleToPlayers ? 'Visible to players' : 'Hidden from players'}</span></label>
            <button type="button" class="gold" data-push-shared-image>Push to players</button>
            <button type="button" class="danger" data-delete-shared-image>Delete</button>
          </div>`
        : `<strong>${esc(image.name || 'Shared image')}</strong>`}
    </div>
  </article>`).join('');

  images.forEach((image) => {
    migrateEmbeddedSharedImage(image);
    const card = $$('.shared-image-card', root).find((element) => element.dataset.sharedImageId === image.id);
    const link = card?.querySelector('a');
    const imageElement = card?.querySelector('img');
    if (!link || !imageElement) return;
    resolveSharedImageData(image).then((data) => {
      if (!data || !card.isConnected) return;
      link.href = data;
      link.removeAttribute('aria-busy');
      imageElement.src = data;
    });
  });
}

function bindSharedImageGallery() {
  const input = $('#shared-image-input');
  if (!input) return;

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file || !isGmUser()) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file.');
      return;
    }
    if (file.size > SHARED_IMAGE_WARNING_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      const proceed = confirm(
        `This image is ${sizeMb} MB. Large Base64 images use more Firebase bandwidth and may exceed Firebase Realtime Database's per-value limit. Upload anyway?`
      );
      if (!proceed) return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const data = String(reader.result || '');
      if (!data.startsWith('data:image/')) {
        alert('The selected image could not be read.');
        return;
      }
      const image = {
        id: uid(),
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 80),
        visibleToPlayers: false,
        uploadedAt: new Date().toISOString()
      };
      await cacheSharedImageData(image.id, data);

      if (typeof window.storeSharedImageData === 'function') {
        const payloadConfirmed = await window.storeSharedImageData(image.id, data);
        if (!payloadConfirmed) {
          alert('Firebase did not confirm the image upload.');
          return;
        }
      } else {
        image.data = data;
      }

      sharedImages().unshift(image);
      const firebaseConfirmed = await save();
      renderSharedImages();
      if (firebaseConfirmed) alert(`"${file.name}" uploaded to Firebase.`);
      else alert('The image was added locally, but Firebase did not confirm the upload.');
    };
    reader.onerror = () => alert('The selected image could not be read.');
    reader.readAsDataURL(file);
  });

  $('#shared-image-list')?.addEventListener('change', (event) => {
    if (!isGmUser()) return;
    const card = event.target.closest('[data-shared-image-id]');
    const image = sharedImages().find((entry) => entry.id === card?.dataset.sharedImageId);
    if (!image) return;
    if (event.target.matches('[data-shared-image-visible]')) image.visibleToPlayers = event.target.checked;
    if (event.target.matches('[data-shared-image-name]')) image.name = event.target.value.trim().slice(0, 80) || 'Shared image';
    save();
    renderSharedImages();
  });

  $('#shared-image-list')?.addEventListener('click', (event) => {
    const pushButton = event.target.closest('[data-push-shared-image]');
    if (pushButton && isGmUser()) {
      const card = pushButton.closest('[data-shared-image-id]');
      const image = sharedImages().find((entry) => entry.id === card?.dataset.sharedImageId);
      if (!image) return;
      state.sharedImageBroadcast = {
        id: uid(),
        imageId: image.id,
        sentAt: new Date().toISOString()
      };
      save().then((firebaseConfirmed) => {
        if (firebaseConfirmed) alert(`"${image.name || 'Shared image'}" pushed to live players.`);
        else alert('Firebase did not confirm the image push.');
      });
      return;
    }

    const button = event.target.closest('[data-delete-shared-image]');
    if (!button || !isGmUser()) return;
    const card = button.closest('[data-shared-image-id]');
    const index = sharedImages().findIndex((entry) => entry.id === card?.dataset.sharedImageId);
    if (index < 0 || !confirm('Delete this shared image?')) return;
    const imageId = state.sharedImages[index].id;
    state.sharedImages.splice(index, 1);
    evictSharedImageData(imageId);
    if (typeof window.deleteSharedImageData === 'function') window.deleteSharedImageData(imageId);
    save();
    renderSharedImages();
  });

  const overlay = $('#shared-image-broadcast-overlay');
  const closeBroadcast = () => {
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
  };
  $('#close-shared-image-broadcast')?.addEventListener('click', closeBroadcast);
  overlay?.addEventListener('click', (event) => {
    if (event.target === overlay) closeBroadcast();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay?.classList.contains('active')) closeBroadcast();
  });
}

async function showSharedImageBroadcast(broadcast) {
  if (isGmUser() || !broadcast?.imageId) return;
  const image = sharedImages().find((entry) => entry.id === broadcast.imageId);
  const overlay = $('#shared-image-broadcast-overlay');
  const imageElement = $('#shared-image-broadcast-image');
  const title = $('#shared-image-broadcast-title');
  if (!image || !overlay || !imageElement || !title) return;

  const data = await resolveSharedImageData(image);
  if (!data) return;
  imageElement.src = data;
  imageElement.alt = image.name || 'Image shared by the GM';
  title.textContent = image.name || 'Shared by the GM';
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  $('#close-shared-image-broadcast')?.focus();
}

/* ===========================================================
   GM NPC quick reference
   =========================================================== */
const NPC_STAT_BLOCKS = [
  { name: 'Dockside Thug', role: 'Street muscle', tier: 'Minion', ac: 11, hp: 35, speed: 30, stats: [14, 10, 12, 8, 9, 9], attacks: ['Club +3 · 1d6+2 bludgeoning', 'Dirty Trick · DC 11 DEX or blinded until next turn'], traits: ['Pack Tactics: +2 to attacks when an ally is adjacent.'] },
  { name: 'Pirate Deckhand', role: 'Boarding crew', tier: 'Minion', ac: 12, hp: 45, speed: 30, stats: [13, 13, 12, 9, 10, 10], attacks: ['Cutlass +3 · 1d8+1 slashing', 'Flintlock +3 · 1d10 piercing, range 40 ft.'], traits: ['Sea Legs: Advantage against being shoved or knocked prone aboard ship.'] },
  { name: 'Marine Rifleman', role: 'Ranged soldier', tier: 'Minion', ac: 13, hp: 50, speed: 30, stats: [11, 15, 12, 10, 12, 10], attacks: ['Rifle +4 · 1d12+2 piercing, range 100 ft.', 'Bayonet +2 · 1d6 piercing'], traits: ['Take Aim: If stationary this turn, next rifle attack gains advantage.'] },
  { name: 'Marine Sergeant', role: 'Squad leader', tier: 'Standard', ac: 15, hp: 120, speed: 30, stats: [16, 12, 15, 11, 14, 14], attacks: ['Saber +5 · 2d8+3 slashing', 'Commanding Shot +3 · 1d10+1 and ally moves 10 ft.'], traits: ['Hold the Line: Nearby Marine allies gain +1 AC.'] },
  { name: 'Bounty Hunter', role: 'Mobile controller', tier: 'Standard', ac: 14, hp: 150, speed: 35, stats: [14, 16, 14, 13, 15, 12], attacks: ['Chain Blade +5 · 2d6+3 slashing', 'Snare · DC 14 DEX or restrained'], traits: ['Marked Quarry: Deals +1d6 damage to one named target.'] },
  { name: 'Pirate Captain', role: 'Crew commander', tier: 'Elite', ac: 16, hp: 260, speed: 30, stats: [18, 16, 17, 13, 15, 18], attacks: ['Named Cutlass +7 · 3d8+4 slashing', 'Broadside Order · One ally immediately attacks'], traits: ['Fearsome Reputation: First enemy to engage makes DC 15 WIS save or frightened.', 'Second Wind: Recover 40 HP once.'] },
  { name: 'Marine Lieutenant', role: 'Tactical duelist', tier: 'Elite', ac: 17, hp: 280, speed: 35, stats: [17, 18, 17, 15, 16, 15], attacks: ['Justice Saber +7 · 3d10+4 slashing', 'Shave Step · Move 20 ft. without reactions'], traits: ['Parry: Reduce one melee hit by 1d10+4.', 'Tactical Orders: One Marine gains advantage each round.'] },
  { name: 'Fish-Man Bruiser', role: 'Heavy striker', tier: 'Elite', ac: 15, hp: 340, speed: 30, stats: [21, 12, 20, 10, 13, 11], attacks: ['Tidal Fist +8 · 4d8+5 bludgeoning', 'Hurl +8 · Target moves 20 ft. and falls prone'], traits: ['Amphibious.', 'Water Empowered: +2 damage dice while soaked or submerged.'] },
  { name: 'Devil Fruit Adept', role: 'Unpredictable specialist', tier: 'Elite', ac: 15, hp: 300, speed: 30, stats: [12, 17, 16, 16, 14, 17], attacks: ['Fruit Technique +7 · 4d10 thematic damage', 'Environmental Shift · DC 15 save or controlled'], traits: ['Strange Body: Resistance to one physical damage type.', 'Sea Weakness: Incapacitated while substantially submerged.'] },
  { name: 'Sea King Juvenile', role: 'Aquatic monster', tier: 'Boss', ac: 16, hp: 480, speed: 10, stats: [23, 12, 21, 5, 14, 8], attacks: ['Bite +9 · 5d10+6 piercing', 'Tail Sweep · 4d8+6, DC 16 STR or prone'], traits: ['Siege Monster: Double damage to ships and structures.', 'Submerge: Cannot be targeted from deck until it surfaces.'] },
  { name: 'Cipher Agent', role: 'Assassin', tier: 'Boss', ac: 19, hp: 420, speed: 45, stats: [18, 22, 18, 17, 18, 16], attacks: ['Finger Pistol +10 · 4d10+6 piercing', 'Tempest Kick · 4d8 slashing in a 30-ft. line'], traits: ['Six Powers: Dash, disengage, or parry as a bonus action.', 'Evasion: No damage on successful DEX saves.'] },
  { name: 'Vice Admiral', role: 'Campaign threat', tier: 'Legendary', ac: 21, hp: 650, speed: 40, stats: [24, 20, 23, 18, 21, 20], attacks: ['Haki Strike +12 · 6d10+7 force', 'Conqueror\'s Presence · DC 19 WIS or stunned'], traits: ['Armament Haki: Attacks ignore physical resistance.', 'Legendary Resolve: Succeed on three failed saves.'] }
];

function npcModifier(score) {
  const modifier = statMod(score);
  return modifier >= 0 ? `+${modifier}` : String(modifier);
}

function npcCardHtml(npc) {
  const abilities = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
  return `<article class="npc-stat-card" data-npc-search="${esc(JSON.stringify(npc).toLowerCase())}">
    <header><div><h3>${esc(npc.name)}</h3><p>${esc(npc.role)}</p></div><span>${esc(npc.tier)}</span></header>
    <div class="npc-vitals"><b>AC ${npc.ac}</b><b>HP ${npc.hp}</b><b>Speed ${npc.speed} ft.</b></div>
    <div class="npc-abilities">${abilities.map((ability, index) => `<div><b>${ability}</b><span>${npc.stats[index]} (${npcModifier(npc.stats[index])})</span></div>`).join('')}</div>
    <section><h4>Actions</h4>${npc.attacks.map((attack) => `<p>${esc(attack)}</p>`).join('')}</section>
    <section><h4>Traits</h4>${npc.traits.map((trait) => `<p>${esc(trait)}</p>`).join('')}</section>
    <footer><button type="button" data-add-npc="${esc(npc.name)}">Add to Encounter</button></footer>
  </article>`;
}

function addNpcToEncounter(templateName) {
  if (!isGmUser()) return;
  const npc = NPC_STAT_BLOCKS.find((entry) => entry.name === templateName);
  if (!npc) return;
  if (!Array.isArray(state.npcEncounter)) state.npcEncounter = [];
  const matching = state.npcEncounter.filter((entry) => entry.templateName === npc.name).length;
  state.npcEncounter.push({
    id: uid(),
    templateName: npc.name,
    name: matching ? `${npc.name} ${matching + 1}` : npc.name,
    tier: npc.tier,
    ac: npc.ac,
    maxHp: npc.hp,
    hp: npc.hp
  });
  save();
  renderNpcEncounter();
}

function npcEncounterCardHtml(combatant) {
  const maxHp = Math.max(1, Number(combatant.maxHp) || 1);
  const hp = clamp(Number(combatant.hp) || 0, 0, maxHp);
  const percent = clamp((hp / maxHp) * 100, 0, 100);
  return `<article class="npc-combatant${hp === 0 ? ' defeated' : ''}" data-combatant-id="${esc(combatant.id)}">
    <div class="npc-combatant-head">
      <input type="text" data-combatant-name value="${esc(combatant.name)}" aria-label="Combatant name" maxlength="50" />
      <span>${esc(combatant.tier)} · AC ${Number(combatant.ac) || 0}</span>
      <button type="button" class="danger" data-remove-combatant title="Remove from encounter" aria-label="Remove ${esc(combatant.name)}">×</button>
    </div>
    <div class="npc-hp-summary"><strong>${hp} / ${maxHp} HP</strong><span>${hp === 0 ? 'Defeated' : `${Math.round(percent)}%`}</span></div>
    <div class="npc-hp-bar"><div style="width:${percent}%"></div></div>
    <div class="npc-hp-controls">
      <button type="button" data-hp-delta="-10">−10</button>
      <button type="button" data-hp-delta="-5">−5</button>
      <button type="button" data-hp-delta="-1">−1</button>
      <input type="number" min="0" max="${maxHp}" value="${hp}" data-combatant-hp aria-label="Current HP for ${esc(combatant.name)}" />
      <button type="button" data-hp-delta="1">+1</button>
      <button type="button" data-hp-delta="5">+5</button>
      <button type="button" data-hp-delta="10">+10</button>
    </div>
  </article>`;
}

function renderNpcEncounter() {
  const root = $('#npc-encounter-list');
  if (!root || !isGmUser()) return;
  if (!Array.isArray(state.npcEncounter)) state.npcEncounter = [];
  root.innerHTML = state.npcEncounter.length
    ? state.npcEncounter.map(npcEncounterCardHtml).join('')
    : '<p class="muted npc-encounter-empty">No NPCs in the encounter. Add one from a stat block below.</p>';
  const count = $('#npc-encounter-count');
  if (count) count.textContent = `${state.npcEncounter.length} combatant${state.npcEncounter.length === 1 ? '' : 's'}`;
  const clear = $('#npc-clear-encounter');
  if (clear) clear.hidden = !state.npcEncounter.length;
}

function renderNpcCards() {
  const root = $('#npc-card-list');
  if (!root || !isGmUser()) return;
  const query = ($('#npc-search')?.value || '').trim().toLowerCase();
  const matches = NPC_STAT_BLOCKS.filter((npc) => JSON.stringify(npc).toLowerCase().includes(query));
  root.innerHTML = matches.map(npcCardHtml).join('') || '<p class="muted npc-empty">No NPC stat blocks match that search.</p>';
  const count = $('#npc-result-count');
  if (count) count.textContent = `${matches.length} stat block${matches.length === 1 ? '' : 's'}`;
}

function initNpcTab() {
  $('#npc-search')?.addEventListener('input', renderNpcCards);
  $('#npc-random')?.addEventListener('click', () => {
    const npc = pick(NPC_STAT_BLOCKS);
    const search = $('#npc-search');
    if (search) search.value = npc.name;
    renderNpcCards();
  });
  $('#npc-card-list')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-npc]');
    if (button) addNpcToEncounter(button.dataset.addNpc);
  });
  $('#npc-encounter-list')?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-combatant-id]');
    if (!card) return;
    const index = state.npcEncounter.findIndex((entry) => entry.id === card.dataset.combatantId);
    if (index < 0) return;
    if (event.target.closest('[data-remove-combatant]')) {
      state.npcEncounter.splice(index, 1);
    } else {
      const deltaButton = event.target.closest('[data-hp-delta]');
      if (!deltaButton) return;
      const combatant = state.npcEncounter[index];
      combatant.hp = clamp((Number(combatant.hp) || 0) + Number(deltaButton.dataset.hpDelta), 0, Number(combatant.maxHp) || 1);
    }
    save();
    renderNpcEncounter();
  });
  $('#npc-encounter-list')?.addEventListener('change', (event) => {
    const card = event.target.closest('[data-combatant-id]');
    const combatant = state.npcEncounter.find((entry) => entry.id === card?.dataset.combatantId);
    if (!combatant) return;
    if (event.target.matches('[data-combatant-hp]')) {
      combatant.hp = clamp(Number(event.target.value) || 0, 0, Number(combatant.maxHp) || 1);
    }
    if (event.target.matches('[data-combatant-name]')) {
      combatant.name = String(event.target.value || combatant.templateName).trim().slice(0, 50) || combatant.templateName;
    }
    save();
    renderNpcEncounter();
  });
  $('#npc-clear-encounter')?.addEventListener('click', () => {
    if (!state.npcEncounter?.length || !confirm('Clear every NPC from the encounter?')) return;
    state.npcEncounter = [];
    save();
    renderNpcEncounter();
  });
  renderNpcEncounter();
  renderNpcCards();
}

let diceFaceTimer = null;
let diceSettleTimer = null;
let diceHideTimer = null;
let dice3d = null;

function currentDicePreferences() {
  if (!state.dicePreferences || typeof state.dicePreferences !== 'object') state.dicePreferences = {};
  const requested = normalizeUsername(currentUsername) || 'Guest';
  const key = Object.keys(state.dicePreferences)
    .find((name) => normalizeUsername(name).toLowerCase() === requested.toLowerCase()) || requested;
  const stored = state.dicePreferences[key] || {};
  const channel = (name, fallback) => Number.isFinite(Number(stored[name]))
    ? clamp(Number(stored[name]), 0, 255)
    : fallback;
  state.dicePreferences[key] = {
    r: channel('r', 216),
    g: channel('g', 168),
    b: channel('b', 63),
    advantage: Boolean(stored.advantage),
    disadvantage: Boolean(stored.disadvantage)
  };
  return state.dicePreferences[key];
}

function diceColorHex(preferences = currentDicePreferences()) {
  return `#${['r', 'g', 'b'].map((key) => Math.round(preferences[key]).toString(16).padStart(2, '0')).join('')}`;
}

function rollPlayerDice(sides = 20) {
  const preferences = currentDicePreferences();
  const first = roll(sides);
  const useSecond = preferences.advantage || preferences.disadvantage;
  const second = useSecond ? roll(sides) : null;
  const die = preferences.advantage ? Math.max(first, second)
    : preferences.disadvantage ? Math.min(first, second)
    : first;
  return {
    die,
    rolls: useSecond ? [first, second] : [first],
    mode: preferences.advantage ? 'Advantage' : preferences.disadvantage ? 'Disadvantage' : ''
  };
}
window.rollPlayerDice = rollPlayerDice;

function makeD10Geometry() {
  const positions = [];
  const ring = Array.from({ length: 5 }, (_, index) => {
    const angle = (index / 5) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(angle), 0, Math.sin(angle)];
  });
  for (let index = 0; index < 5; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % 5];
    positions.push(0, 1.25, 0, ...current, ...next);
    positions.push(0, -1.25, 0, ...next, ...current);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function diceGeometry(sides) {
  if (sides === 4) return new THREE.TetrahedronGeometry(1, 0);
  if (sides === 6) return new THREE.BoxGeometry(1.55, 1.55, 1.55);
  if (sides === 8) return new THREE.OctahedronGeometry(1, 0);
  if (sides === 12) return new THREE.DodecahedronGeometry(1, 0);
  if (sides === 10) return makeD10Geometry();
  return new THREE.IcosahedronGeometry(1, 0);
}

function numberedDieFaces(geometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const positions = source.getAttribute('position');
  const groups = [];
  for (let index = 0; index < positions.count; index += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(positions, index);
    const b = new THREE.Vector3().fromBufferAttribute(positions, index + 1);
    const c = new THREE.Vector3().fromBufferAttribute(positions, index + 2);
    const center = a.clone().add(b).add(c).divideScalar(3);
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    if (center.dot(normal) < 0) normal.negate();
    let face = groups.find((candidate) => candidate.normal.dot(normal) > 0.9995);
    if (!face) {
      face = { normal, vertices: new Map() };
      groups.push(face);
    }
    [a, b, c].forEach((vertex) => {
      const key = [vertex.x, vertex.y, vertex.z].map((value) => value.toFixed(5)).join(',');
      face.vertices.set(key, vertex);
    });
  }
  if (source !== geometry) source.dispose();
  return groups.map((face) => ({
    normal: face.normal,
    center: Array.from(face.vertices.values())
      .reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3())
      .divideScalar(face.vertices.size),
    label: null
  }));
}

function dieNumberTexture(value) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 128, 128);
  context.fillStyle = '#271006';
  context.strokeStyle = '#f7df94';
  context.lineWidth = 6;
  context.lineJoin = 'round';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `bold ${value >= 10 ? 78 : 92}px Georgia`;
  context.strokeText(String(value), 64, 62);
  context.fillText(String(value), 64, 62);
  if (value === 6 || value === 9) context.fillRect(46, 111, 36, 6);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.needsUpdate = true;
  return texture;
}

function addDieFaceNumbers(group, faces, sides) {
  const labelSize = sides === 20 ? 0.46
    : sides === 12 ? 0.52
    : sides === 8 ? 0.58
    : sides === 6 ? 0.66
    : sides === 4 ? 0.6
    : 0.54;
  faces.slice(0, sides).forEach((face, index) => {
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(labelSize, labelSize),
      new THREE.MeshBasicMaterial({
        map: dieNumberTexture(index + 1),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    label.position.copy(face.center).addScaledVector(face.normal, 0.018);
    label.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal);
    face.label = label;
    group.add(label);
  });
}

function initDice3d() {
  if (dice3d) return dice3d;
  const wrap = $('#dice-three-wrap');
  const canvas = $('#dice-three-canvas');
  if (!wrap || !canvas || typeof THREE === 'undefined') {
    wrap?.classList.add('webgl-unavailable');
    return null;
  }
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(180, 180, false);
    renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0.15, 4.5);
    scene.add(new THREE.HemisphereLight(0xfff1bf, 0x321208, 1.35));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(-3, 4, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xd04b25, 0.8);
    rimLight.position.set(4, -2, 2);
    scene.add(rimLight);
    dice3d = {
      renderer, scene, camera, wrap,
      group: null, groups: [], faces: [], faceSets: [],
      sides: null, count: 0, frame: null
    };
    return dice3d;
  } catch (error) {
    console.warn('[dice] WebGL unavailable; using fallback.', error);
    wrap.classList.add('webgl-unavailable');
    return null;
  }
}

function buildDie3d(sides) {
  const geometry = diceGeometry(sides);
  const solid = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: 0xd8a83f,
    emissive: 0x301204,
    emissiveIntensity: 0.18,
    flatShading: true,
    metalness: 0.28,
    roughness: 0.38
  }));
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 12),
    new THREE.LineBasicMaterial({ color: 0x4c1e0a, transparent: true, opacity: 0.82 })
  );
  const faces = numberedDieFaces(geometry);
  const group = new THREE.Group();
  group.add(solid, edges);
  addDieFaceNumbers(group, faces, sides);
  return { group, faces };
}

function startDice3d(sides, reducedMotion, rolls = []) {
  const view = initDice3d();
  if (!view) return;
  const count = rolls.length > 1 ? 2 : 1;
  if (view.sides !== sides || view.count !== count) {
    view.groups.forEach((group) => {
      view.scene.remove(group);
      group.traverse((child) => {
        child.material?.map?.dispose?.();
        child.geometry?.dispose?.();
        child.material?.dispose?.();
      });
    });
    const dice = Array.from({ length: count }, () => buildDie3d(sides));
    view.groups = dice.map((item) => item.group);
    view.faceSets = dice.map((item) => item.faces);
    view.groups.forEach((group) => view.scene.add(group));
    view.group = view.groups[0];
    view.faces = view.faceSets[0];
    view.sides = sides;
    view.count = count;
  }
  const dieColor = diceColorHex();
  view.groups.forEach((group, index) => {
    group.children[0].material.color.set(dieColor);
    group.children[0].material.emissive.set(dieColor).multiplyScalar(0.16);
    group.position.x = count === 2 ? (index === 0 ? -0.82 : 0.82) : 0;
    group.scale.setScalar(count === 2 ? 0.76 : 1);
    group.rotation.set(0.25 + index * 0.4, -0.35 - index * 0.3, 0.1 + index * 0.2);
  });
  view.wrap.style.setProperty('--dice-color', dieColor);
  cancelAnimationFrame(view.frame);
  const animate = () => {
    const overlay = $('#dice-roll-overlay');
    if (!overlay?.classList.contains('active')) return;
    if (overlay.classList.contains('rolling') && !reducedMotion) {
      view.groups.forEach((group, index) => {
        group.rotation.x += 0.14 + index * 0.035;
        group.rotation.y += 0.22 - index * 0.03;
        group.rotation.z += 0.08 + index * 0.025;
      });
    }
    view.renderer.render(view.scene, view.camera);
    view.frame = requestAnimationFrame(animate);
  };
  animate();
}

function settleDice3d(value, dieIndex = 0) {
  const view = dice3d;
  const group = view?.groups?.[dieIndex];
  const faces = view?.faceSets?.[dieIndex];
  const face = faces?.[(Number(value) - 1) % faces.length];
  if (!group || !face) return;
  const forward = new THREE.Vector3(0, 0, 1);
  const faceForward = new THREE.Quaternion().setFromUnitVectors(face.normal, forward);
  const labelUp = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(face.label.quaternion)
    .applyQuaternion(faceForward);
  const straighten = new THREE.Quaternion().setFromAxisAngle(forward, Math.atan2(labelUp.x, labelUp.y));
  group.quaternion.copy(straighten.multiply(faceForward));
  view.renderer.render(view.scene, view.camera);
}

function showDiceRoll({ sides = 20, die, rolls = [], modifier = 0, total = die, label = 'Roll', rollDetail = '' }) {
  const overlay = $('#dice-roll-overlay');
  const face = $('#dice-roll-face');
  const kind = $('#dice-roll-kind');
  const result = $('#dice-roll-result');
  if (!overlay || !face || !kind || !result) return;

  clearInterval(diceFaceTimer);
  clearTimeout(diceSettleTimer);
  clearTimeout(diceHideTimer);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finalDie = clamp(Number(die) || 1, 1, sides);
  const activeRolls = rolls.length > 1 ? rolls.slice(0, 2) : [finalDie];
  const numericModifier = Number(modifier) || 0;
  kind.textContent = `${label} · d${sides}`;
  result.textContent = 'Rolling…';
  face.textContent = reducedMotion ? finalDie : roll(sides);
  overlay.classList.remove('settled');
  overlay.classList.add('active', 'rolling');
  overlay.setAttribute('aria-hidden', 'false');
  startDice3d(sides, reducedMotion, activeRolls);

  const settle = () => {
    clearInterval(diceFaceTimer);
    face.textContent = finalDie;
    result.textContent = rollDetail || (numericModifier
      ? `${finalDie} ${numericModifier >= 0 ? '+' : '−'} ${Math.abs(numericModifier)} = ${Number(total) || 0}`
      : `${finalDie}`);
    activeRolls.forEach((value, index) => settleDice3d(value, index));
    overlay.classList.remove('rolling');
    overlay.classList.add('settled');
    diceHideTimer = setTimeout(() => {
      overlay.classList.remove('active', 'settled');
      overlay.setAttribute('aria-hidden', 'true');
    }, reducedMotion ? 700 : 1100);
  };

  if (reducedMotion) settle();
  else {
    diceFaceTimer = setInterval(() => { face.textContent = roll(sides); }, 65);
    diceSettleTimer = setTimeout(settle, 720);
  }
}
window.showDiceRoll = showDiceRoll;

/* ===========================================================
   Shared roll log
   =========================================================== */
function recordRoll(entry, shouldSave = true) {
  if (!Array.isArray(state.rollLog)) state.rollLog = [];
  state.rollLog.unshift({
    id: uid(),
    roller: normalizeUsername(entry.roller || currentUsername) || 'Unknown',
    character: String(entry.character || '').trim(),
    label: String(entry.label || 'Roll').trim(),
    sides: Number(entry.sides) || 20,
    die: Number(entry.die) || 0,
    rolls: Array.isArray(entry.rolls) ? entry.rolls.slice(0, 2).map(Number) : [],
    modifier: Number(entry.modifier) || 0,
    total: Number(entry.total) || 0,
    detail: String(entry.detail || '').trim(),
    when: new Date().toISOString()
  });
  state.rollLog = state.rollLog.slice(0, 200);
  if (shouldSave) save();
  renderRollLog();
}
window.recordRoll = recordRoll;

function renderRollLog() {
  const root = $('#roll-log-list');
  if (!root) return;
  if (!Array.isArray(state.rollLog)) state.rollLog = [];
  const clearButton = $('[data-action="clearRollLog"]');
  if (clearButton) clearButton.hidden = !isGmUser() || !state.rollLog.length;
  if (!state.rollLog.length) {
    root.innerHTML = '<p class="muted roll-log-empty">No rolls yet. Character and Sea Travel rolls will appear here.</p>';
    return;
  }
  root.innerHTML = state.rollLog.map((entry) => {
    const modifier = Number(entry.modifier) || 0;
    const expression = entry.die
      ? entry.rolls?.length > 1
        ? `d${Number(entry.sides) || 20} rolls: ${entry.rolls.map(Number).join(', ')} → kept ${Number(entry.die)}${modifier ? ` ${modifier >= 0 ? '+' : '-'} ${Math.abs(modifier)} = ${Number(entry.total) || 0}` : ''}`
        : `d${Number(entry.sides) || 20} (${Number(entry.die)})${modifier ? ` ${modifier >= 0 ? '+' : '-'} ${Math.abs(modifier)}` : ''} = ${Number(entry.total) || 0}`
      : entry.detail;
    const identity = entry.character && entry.character !== entry.roller
      ? `${entry.roller} · ${entry.character}`
      : entry.roller;
    const timestamp = entry.when && !Number.isNaN(Date.parse(entry.when))
      ? new Date(entry.when).toLocaleString()
      : '';
    return `<article class="roll-log-entry">
      <div class="roll-log-result">${esc(entry.total)}</div>
      <div class="roll-log-copy">
        <strong>${esc(entry.label)}</strong>
        <span>${esc(expression)}</span>
        ${entry.detail && !(entry.rolls?.length > 1) ? `<small>${esc(entry.detail)}</small>` : ''}
      </div>
      <div class="roll-log-meta"><strong>${esc(identity)}</strong><time datetime="${esc(entry.when || '')}">${esc(timestamp)}</time></div>
    </article>`;
  }).join('');
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

let __notesViewing = '';
const __notesPageByUser = {};
let __notesViewportBound = false;

function notesPages(value) {
  const pages = String(value || '').split('\f');
  return pages.length ? pages : [''];
}

function notesPagesPerView() {
  return window.matchMedia('(max-width: 720px)').matches ? 1 : 2;
}

function playerLogKey(username) {
  const requested = normalizeUsername(username);
  const requestedKey = requested.toLowerCase();
  const existing = Object.keys(state.playerNotes || {})
    .find((name) => normalizeUsername(name).toLowerCase() === requestedKey);
  return existing || requested;
}

function isOwnLogBook(username) {
  return normalizeUsername(username).toLowerCase() === normalizeUsername(currentUsername).toLowerCase();
}

function renderLog() {
  if (!state.playerNotes || typeof state.playerNotes !== 'object') state.playerNotes = {};
  if (!state.playerNoteDates || typeof state.playerNoteDates !== 'object') state.playerNoteDates = {};

  // Player notes (everyone) — only this user can read their own notes; GM can read all.
  const notesRoot = $('#notes-area');
  if (notesRoot) renderPlayerNotes(notesRoot);

  // Encounter archive — keep visible to the GM only.
  const archive = $('#encounter-archive');
  if (archive) archive.style.display = isGmUser() ? '' : 'none';

  renderEncounterArchive();
}

function renderPlayerNotes(root) {
  if (!currentUsername) {
    root.innerHTML = '<p class="muted">Log in to write in your log book.</p>';
    root.dataset.notesSig = '';
    return;
  }
  const gm = isGmUser();
  if (!gm) __notesViewing = playerLogKey(currentUsername);
  if (!__notesViewportBound) {
    __notesViewportBound = true;
    window.matchMedia('(max-width: 720px)').addEventListener('change', () => {
      root.dataset.notesSig = '';
      renderPlayerNotes(root);
    });
  }

  // Build the list of users who have notes; always include the current user.
  const knownUsers = Object.keys(state.playerNotes || {});
  (state.playerSheets || []).forEach((sheet) => {
    const owner = normalizeUsername(sheet?.player);
    if (owner && !knownUsers.some((name) => normalizeUsername(name).toLowerCase() === owner.toLowerCase())) {
      knownUsers.push(owner);
    }
  });
  const currentLogKey = playerLogKey(currentUsername);
  if (currentLogKey && !knownUsers.includes(currentLogKey)) knownUsers.push(currentLogKey);
  knownUsers.sort((a, b) => a.localeCompare(b));

  if (!knownUsers.includes(__notesViewing)) __notesViewing = currentLogKey;
  const pages = notesPages(state.playerNotes[__notesViewing]);
  const pageDates = Array.isArray(state.playerNoteDates[__notesViewing])
    ? state.playerNoteDates[__notesViewing]
    : [];
  const pageStep = notesPagesPerView();
  const maxStart = Math.max(0, pages.length - 1);
  let pageStart = clamp(Number(__notesPageByUser[__notesViewing]) || 0, 0, maxStart);
  pageStart -= pageStart % pageStep;
  __notesPageByUser[__notesViewing] = pageStart;
  const canEdit = isOwnLogBook(__notesViewing);

  // Only rebuild the DOM when the structure changes — avoids clobbering an
  // active textarea (and losing keystrokes) when remote sync fires.
  const signature = `${gm ? 'gm' : 'pc'}|${currentUsername}|${knownUsers.join(',')}|${__notesViewing}|${pageStart}|${pages.length}|${pageStep}`;
  if (root.dataset.notesSig !== signature) {
    root.dataset.notesSig = signature;
    const selectorHtml = gm
      ? `<label class="notes-select-label">
           <span>Viewing notes for:</span>
           <select id="notes-user-select">
             ${knownUsers.map(u => `<option value="${esc(u)}" ${u===__notesViewing?'selected':''}>${esc(u)}${u===currentUsername?' (you)':''}</option>`).join('')}
           </select>
         </label>`
      : '';

    const pageHtml = [pageStart, pageStart + 1].map((pageIndex, side) => `
      <section class="log-book-page log-book-page-${side ? 'right' : 'left'} ${pageIndex >= pages.length ? 'log-book-page-blank' : ''}" data-book-page="${pageIndex}" ${pageIndex >= pages.length ? 'aria-hidden="true"' : ''}>
        ${pageIndex === 0
          ? '<div class="log-book-page-heading">Log Book</div>'
            : `<input class="log-book-page-date" type="text" data-notes-date="${pageIndex}"
              aria-label="Heading for Log Book page ${pageIndex + 1}" value="${esc(pageDates[pageIndex] || '')}"
              ${pageIndex >= pages.length ? 'disabled' : (canEdit ? '' : 'readonly')} />`}
        <textarea class="notes-page-text" data-notes-page="${pageIndex}"
          aria-label="Log Book page ${pageIndex + 1}"
          placeholder="Set down the day’s course, discoveries, and promises…"
          ${pageIndex >= pages.length ? 'disabled' : (canEdit ? '' : 'readonly')}>${esc(pages[pageIndex] || '')}</textarea>
        <div class="log-book-page-footer">
          ${side === 0 ? `<button type="button" data-book-action="previous" aria-label="Previous pages" title="Previous pages" ${pageStart === 0 ? 'disabled' : ''}>←</button>` : ''}
          <span class="log-book-page-number">${pageIndex < pages.length ? pageIndex + 1 : ''}</span>
          ${side === 1 ? `<button type="button" data-book-action="next" aria-label="Next pages" title="Next pages" ${pageStart + pageStep >= pages.length ? 'disabled' : ''}>→</button>` : ''}
          ${side === 0 ? `<button type="button" class="log-book-next-mobile" data-book-action="next" aria-label="Next pages" title="Next pages" ${pageStart + pageStep >= pages.length ? 'disabled' : ''}>→</button>` : ''}
        </div>
      </section>`).join('');

    root.innerHTML = `
      ${selectorHtml ? `<div class="log-book-toolbar">${selectorHtml}</div>` : ''}
      <div class="log-book" aria-label="Log Book">
        <div class="log-book-spread">${pageHtml}</div>
      </div>`;

    const sel = $('#notes-user-select', root);
    if (sel) sel.addEventListener('change', () => {
      __notesViewing = sel.value;
      renderPlayerNotes(root);
    });

    $$('.notes-page-text', root).forEach((textarea) => {
      textarea.addEventListener('input', () => {
        if (!isOwnLogBook(__notesViewing)) return;
        const nextPages = notesPages(state.playerNotes[__notesViewing]);
        const pageIndex = Number(textarea.dataset.notesPage);
        const isLastPage = pageIndex === nextPages.length - 1;
        nextPages[pageIndex] = textarea.value;
        if (isLastPage && textarea.value) {
          nextPages.push('', '');
          const nextDates = Array.isArray(state.playerNoteDates[__notesViewing])
            ? [...state.playerNoteDates[__notesViewing]]
            : [];
          nextDates.push('', '');
          state.playerNoteDates[__notesViewing] = nextDates;
        }
        state.playerNotes[__notesViewing] = nextPages.join('\f');
        saveLogBook(__notesViewing);
        if (isLastPage && textarea.value) {
          root.dataset.notesSig = '';
          renderPlayerNotes(root);
          $(`[data-notes-page="${pageIndex}"]`, root)?.focus();
        }
      });
    });
    $$('.log-book-page-date', root).forEach((dateInput) => {
      dateInput.addEventListener('input', () => {
        if (!isOwnLogBook(__notesViewing)) return;
        const nextDates = Array.isArray(state.playerNoteDates[__notesViewing])
          ? [...state.playerNoteDates[__notesViewing]]
          : [];
        nextDates[Number(dateInput.dataset.notesDate)] = dateInput.value;
        state.playerNoteDates[__notesViewing] = nextDates;
        saveLogBook(__notesViewing);
      });
    });

    $$('[data-book-action]', root).forEach((button) => button.addEventListener('click', () => {
      const action = button.dataset.bookAction;
      const step = notesPagesPerView();
      if (action === 'previous') __notesPageByUser[__notesViewing] = Math.max(0, pageStart - step);
      if (action === 'next') __notesPageByUser[__notesViewing] = Math.min(pages.length - 1, pageStart + step);
      root.dataset.notesSig = '';
      renderPlayerNotes(root);
      $('.notes-page-text', root)?.focus();
    }));
  }

  // Sync content + edit-state without touching the user's cursor.
  $$('.notes-page-text', root).forEach((textarea) => {
    const value = pages[Number(textarea.dataset.notesPage)] || '';
    if (document.activeElement !== textarea && textarea.value !== value) textarea.value = value;
    textarea.readOnly = !canEdit;
  });
  $$('.log-book-page-date', root).forEach((dateInput) => {
    const value = pageDates[Number(dateInput.dataset.notesDate)] || '';
    if (document.activeElement !== dateInput && dateInput.value !== value) dateInput.value = value;
    dateInput.readOnly = !canEdit;
  });
}

function renderEncounterArchive() {
  const root = $('#log-list');
  if (!root) return;
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
const PDF_FIELD_RENAMES = {
  home_sea_island_extra: 'home_sea_island_notes',
  portrait_or_character_art_note: 'portrait_or_description',
  flashback_power_up_1: 'flashback_power_1',
  flashback_power_up_2: 'flashback_power_2',
  flashback_power_up_3: 'flashback_power_3',
  signature_move_1_description: 'signature_move_1_what_it_does',
  signature_move_2_description: 'signature_move_2_what_it_does',
  signature_move_3_description: 'signature_move_3_what_it_does',
  signature_move_4_description: 'signature_move_4_what_it_does',
  devils_ransom_piece_casted: 'devils_ransom_piece_cursed',
};
const PDF_ABILITY_MOD_FIELDS = {
  strength_score: 'strength_mod',
  dexterity_score: 'dexterity_mod',
  constitution_score: 'constitution_mod',
  intelligence_score: 'intelligence_mod',
  wisdom_score: 'wisdom_mod',
  charisma_score: 'charisma_mod',
};
const PDF_SKILL_ABILITIES = {
  acrobatics: 'dexterity',
  animal_handling: 'wisdom',
  devil_fruit_lore: 'intelligence',
  athletics: 'strength',
  deception: 'charisma',
  history: 'intelligence',
  insight: 'wisdom',
  intimidation: 'charisma',
  investigation: 'intelligence',
  medicine: 'wisdom',
  navigation: 'intelligence',
  perception: 'wisdom',
  performance: 'charisma',
  persuasion: 'charisma',
  shipwright: 'intelligence',
  sleight_of_hand: 'dexterity',
  stealth: 'dexterity',
  survival: 'wisdom',
};

function statMod(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.floor((n - 10) / 2);
}
function fmtMod(m) { return (m >= 0 ? `+${m}` : `${m}`); }
function maximumHpFromConstitution(score) {
  const modifier = statMod(score);
  return modifier > 0 ? 100 + (modifier * 100) : 100 + (modifier * 10);
}
function updatePdfAbilityModifier(fields, scoreField) {
  const modifierField = PDF_ABILITY_MOD_FIELDS[scoreField];
  if (!modifierField) return false;
  const rawScore = fields[scoreField];
  const score = Number(rawScore);
  if (rawScore === '' || !Number.isInteger(score) || score < 1 || score > 30) {
    delete fields[modifierField];
  } else {
    const modifier = statMod(score);
    fields[modifierField] = fmtMod(modifier);
    if (scoreField === 'constitution_score') fields.max_hp = String(maximumHpFromConstitution(score));
  }
  if (scoreField === 'constitution_score' && !fields[modifierField]) delete fields.max_hp;
  return true;
}
function updatePdfSkillModifiers(fields, changedField) {
  const isAbilityScore = Object.hasOwn(PDF_ABILITY_MOD_FIELDS, changedField);
  const isProficiency = /^skill_.+_proficient$/.test(changedField || '');
  if (changedField && !isAbilityScore && !isProficiency) return false;

  Object.entries(PDF_SKILL_ABILITIES).forEach(([skill, ability]) => {
    const score = Number(fields[`${ability}_score`]);
    const modifierField = `skill_${skill}_modifier`;
    if (!Number.isInteger(score) || score < 1 || score > 30) {
      delete fields[modifierField];
      return;
    }
    const proficient = Boolean(fields[`skill_${skill}_proficient`]);
    fields[modifierField] = fmtMod(statMod(score) + (proficient ? 5 : 0));
  });
  const perceptionModifier = Number(fields.skill_perception_modifier);
  if (Number.isFinite(perceptionModifier)) {
    fields.passive_perception = String(10 + perceptionModifier);
  } else {
    delete fields.passive_perception;
  }
  return true;
}
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
    portraitHidden: false,
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
    maxHp: 100,
    hp: 100,
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
    // Live PDF form values: { field_name: value } matching the AcroForm field
    // names in assets/Wanted_Character_Sheet_Form_Fillable (4).pdf.
    pdfFields: {},
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
  merged.pdfFields = (pc.pdfFields && typeof pc.pdfFields === 'object') ? { ...pc.pdfFields } : {};
  Object.entries(PDF_FIELD_RENAMES).forEach(([oldName, newName]) => {
    if (merged.pdfFields[newName] === undefined && merged.pdfFields[oldName] !== undefined) {
      merged.pdfFields[newName] = merged.pdfFields[oldName];
    }
  });
  // First time we see a legacy sheet, seed pdfFields from the structured data
  // so the embedded PDF form opens pre-populated.
  if (!pc.pdfFields || !Object.keys(pc.pdfFields).length) {
    seedPdfFieldsFromLegacy(merged);
  }
  Object.keys(PDF_ABILITY_MOD_FIELDS).forEach((scoreField) => {
    updatePdfAbilityModifier(merged.pdfFields, scoreField);
  });
  if (merged.pdfFields.max_hp !== undefined) merged.maxHp = Number(merged.pdfFields.max_hp) || 100;
  updatePdfSkillModifiers(merged.pdfFields);
  return merged;
}

/* Map legacy structured sheet fields into the new pdfFields map, keyed by the
  actual AcroForm field names inside Wanted_Character_Sheet_Form_Fillable (4).pdf. */
function seedPdfFieldsFromLegacy(sheet) {
  const f = sheet.pdfFields;
  const put = (k, v) => { if (v !== undefined && v !== null && v !== '' && f[k] === undefined) f[k] = String(v); };
  put('character_name', sheet.name);
  put('epithet_title',  sheet.epithet);
  put('crew_role',      sheet.role);
  put('age',            sheet.age);
  put('home_sea_island', sheet.home);
  ['str','dex','con','int','wis','cha'].forEach((k) => {
    const long = { str:'strength', dex:'dexterity', con:'constitution', int:'intelligence', wis:'wisdom', cha:'charisma' }[k];
    if (sheet.stats?.[k] !== undefined) {
      put(`${long}_score`, sheet.stats[k]);
      put(`${long}_mod`,   fmtMod(statMod(sheet.stats[k])));
    }
  });
  put('armor_class', sheet.ac);
  put('initiative',  sheet.initiative);
  put('speed',       sheet.speed);
  put('max_hp',      sheet.maxHp);
  put('current_hp',  sheet.hp);
  put('temp_hp',     sheet.tempHp);
  put('bounty',      sheet.bounty);
  (sheet.moves || []).slice(0,4).forEach((m, i) => {
    put(`signature_move_${i+1}_name`,        m?.name);
    put(`signature_move_${i+1}_what_it_does`, m?.desc);
  });
  (sheet.inventory || []).slice(0,6).forEach((row, i) => {
    put(`inventory_item_${i+1}`,     row?.item);
    put(`inventory_quantity_${i+1}`, row?.qty);
  });
  put('physical_scar',              sheet.scars?.physical);
  put('emotional_scar',             sheet.scars?.emotional);
  put('reputation_scar',            sheet.scars?.reputation);
  put('devils_ransom_piece_cursed', sheet.ransom?.piece);
  put('devils_ransom_curse_name',   sheet.ransom?.curseName);
  put('devils_ransom_curse_pull_dc', sheet.ransom?.curseDC);
  // Flashback charges → checkboxes
  for (let i = 1; i <= 3; i++) {
    if (i <= (Number(sheet.flashback) || 0)) f[`flashback_power_${i}`] = true;
  }
}

/* True when the logged-in user has GM-level access (case-insensitive). */
function isGmUser() {
  return typeof currentUsername === 'string'
    && currentUsername.trim().toLowerCase() === 'gm';
}

/* True when `sheet.player` matches the logged-in user. Compared
   case-insensitively and trim-tolerant so re-logins ("Alice" vs "alice")
   never lock the rightful owner out of editing or saving. */
function isSheetOwner(sheet, username) {
  const u = String(username != null ? username : currentUsername || '').trim().toLowerCase();
  const p = String((sheet && sheet.player) || '').trim().toLowerCase();
  return Boolean(u) && Boolean(p) && u === p;
}

/* True if the current viewer is allowed to edit `sheet` (owner or GM). */
function canEditSheet(sheet) {
  return isGmUser() || isSheetOwner(sheet);
}

/* Ensure the logged-in (non-GM) user has at least one sheet of their own. */
function ensureOwnSheet() {
  if (!currentUsername || isGmUser()) return;
  if (!Array.isArray(state.playerSheets)) state.playerSheets = [];
  const owned = state.playerSheets.find((s) => isSheetOwner(s));
  if (owned) {
    // Heal legacy/casing drift so the live record matches the current login.
    if (owned.player !== currentUsername) {
      owned.player = currentUsername;
      stampSheetEdit(owned);
      save();
    }
    return;
  }
  const sheet = makeEmptySheet();
  sheet.player = currentUsername;
  sheet.name = currentUsername;
  sheet.pdfFields = sheet.pdfFields || {};
  sheet.pdfFields.character_name = currentUsername;
  state.playerSheets.unshift(sheet);
  save();
}

function addPlayerSheet() {
  if (!requireUsername()) return;
  const sheet = makeEmptySheet();
  sheet.player = currentUsername;
  if (currentUsername) {
    sheet.name = currentUsername;
    sheet.pdfFields = sheet.pdfFields || {};
    sheet.pdfFields.character_name = currentUsername;
  }
  state.playerSheets.unshift(sheet);
  const root = $('#player-sheet-list');
  if (root) root.dataset.activeSheetId = sheet.id;
  save();
  renderPlayerSheets();
  showTab('characters');
}

/* Sheets the current viewer is allowed to see + edit.
   GM sees every sheet. Other users see only sheets they own. */
function visibleSheetsForCurrentUser() {
  if (!Array.isArray(state.playerSheets)) return [];
  if (isGmUser()) return state.playerSheets.map((s, i) => ({ s, i }));
  if (!currentUsername) return [];
  return state.playerSheets
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => isSheetOwner(s));
}

function selectPlayerSheetTab(root, sheetId) {
  const cards = $$('.player-card', root);
  const tabs = $$('[data-sheet-tab]', root);
  if (!cards.some((card) => card.dataset.sheetId === sheetId)) return;

  root.dataset.activeSheetId = sheetId;
  cards.forEach((card) => {
    const active = card.dataset.sheetId === sheetId;
    card.hidden = !active;
  });
  tabs.forEach((tab) => {
    const active = tab.dataset.sheetTab === sheetId;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  if (window.pdfSheet && typeof window.pdfSheet.renderVisible === 'function') {
    window.pdfSheet.renderVisible();
    requestAnimationFrame(() => window.pdfSheet?.renderVisible?.());
  }
}

function reorderPlayerSheetTabs(root, draggedId, targetId, placeAfter) {
  const visible = visibleSheetsForCurrentUser();
  if (draggedId === targetId || !visible.some(({ s }) => s.id === draggedId)) return;

  const ordered = visible.map(({ s }) => s);
  const draggedIndex = ordered.findIndex((sheet) => sheet.id === draggedId);
  const [dragged] = ordered.splice(draggedIndex, 1);
  const targetIndex = ordered.findIndex((sheet) => sheet.id === targetId);
  if (targetIndex < 0) return;
  ordered.splice(targetIndex + (placeAfter ? 1 : 0), 0, dragged);

  visible.forEach(({ i }, index) => {
    state.playerSheets[i] = ordered[index];
  });
  root.dataset.activeSheetId = draggedId;
  root.dataset.sheetSig = '';
  save();
  renderPlayerSheets();
}

function tabDropGoesAfter(root, draggedId, targetId) {
  const ids = $$('[data-sheet-tab]', root).map((tab) => tab.dataset.sheetTab);
  return ids.indexOf(draggedId) < ids.indexOf(targetId);
}

function renderPlayerSheets() {
  const root = $('#player-sheet-list');
  if (!root) return;

  if (!Array.isArray(state.playerSheets)) state.playerSheets = [];
  // Normalize any legacy sheets in place so they pick up the new fields.
  state.playerSheets = state.playerSheets.map(normalizeSheet);

  // Make sure the logged-in player has their own sheet auto-created.
  ensureOwnSheet();

  // Every logged-in player can add more characters; each new sheet remains theirs.
  const addBtn = document.querySelector('[data-action="addPlayerSheet"]');
  if (addBtn) addBtn.style.display = currentUsername ? '' : 'none';

  const visible = visibleSheetsForCurrentUser();

  if (!currentUsername) {
    root.innerHTML = '<p class="muted">Log in to see your character sheet.</p>';
    return;
  }
  if (!visible.length) {
    root.innerHTML = '<p class="muted">No character sheet yet.</p>';
    return;
  }

  // Fast path: if the visible sheets, owners, and order are unchanged from
  // last render, leave the cards alone and just refresh the field values.
  // This avoids re-rendering the PDF canvas on every Firebase sync update.
  const signature = visible
    .map(({ s }) => `${s.id}|${s.player || ''}|${s.updatedBy || ''}|${s.portrait?.length || 0}|${Boolean(s.portraitHidden)}`)
    .join(';');
  if (root.dataset.sheetSig === signature && $$('.player-card', root).length === visible.length) {
    if (typeof window.refreshPdfSheetFields === 'function') window.refreshPdfSheetFields();
    // Refresh meta text + notes in place.
    visible.forEach(({ s }) => {
      const card = root.querySelector(`.player-card[data-sheet-id="${cssEsc(s.id)}"]`);
      if (!card) return;
      const meta = card.querySelector('.updated-meta');
      if (meta) meta.textContent = sheetMetaText(s);
      ['notes'].forEach((k) => {
        const el = card.querySelector(`[data-pf="${k}"]`);
        if (el && el !== document.activeElement && el.value !== (s[k] || '')) el.value = s[k] || '';
      });
    });
    return;
  }

  // Rebuild path: the visible set changed (different sheet, new sheet, owner swap).
  const requestedSheetId = root.dataset.activeSheetId;
  const activeSheetId = visible.some(({ s }) => s.id === requestedSheetId)
    ? requestedSheetId
    : visible[0].s.id;
  root.dataset.sheetSig = signature;
  root.innerHTML = `
    ${visible.length > 1 ? `<div class="character-sheet-tabs" role="tablist" aria-label="Character sheets">
      ${visible.map(({ s }) => `<button type="button" role="tab" title="Drag to reorder" data-sheet-tab="${esc(s.id)}">${esc(s.name || s.player || 'Character')}</button>`).join('')}
    </div>` : ''}
    <div class="character-sheet-panels">
      ${visible.map(({ s, i }) => renderSheetHtml(s, i)).join('')}
    </div>`;

  const sheetToolbar = document.querySelector('#tab-characters > .parchment > .btn-row');
  if (sheetToolbar) {
    sheetToolbar.querySelector('.sheet-reference-grid')?.remove();
    const sharedReferences = root.querySelector('.sheet-reference-grid');
    if (sharedReferences) {
      sheetToolbar.appendChild(sharedReferences);
      sharedReferences.querySelectorAll('details').forEach((details) => {
        details.addEventListener('toggle', () => {
          if (!details.open) return;
          sharedReferences.querySelectorAll('details[open]').forEach((other) => {
            if (other !== details) other.open = false;
          });
        });
      });
      sharedReferences.querySelectorAll('[data-die-sides]').forEach((button) => {
        button.addEventListener('click', () => {
          const sides = Number(button.dataset.dieSides);
          const outcome = rollPlayerDice(sides);
          const { die, rolls, mode } = outcome;
          const activeSheet = state.playerSheets.find((sheet) => sheet.id === root.dataset.activeSheetId);
          const character = activeSheet?.name || activeSheet?.player || '';
          const rollDetail = rolls.length > 1 ? `${rolls.join(', ')} → kept ${die}` : '';
          showDiceRoll({ sides, die, rolls, total: die, label: mode || 'Custom', rollDetail });
          recordRoll({
            label: mode ? `${mode} d${sides}` : `Custom d${sides}`,
            character,
            sides,
            die,
            rolls,
            total: die,
            detail: rollDetail
          });
          button.closest('details')?.removeAttribute('open');
        });
      });
      const rgbInputs = ['r', 'g', 'b'].map((channel) => sharedReferences.querySelector(`[data-dice-rgb="${channel}"]`));
      const colorInput = sharedReferences.querySelector('[data-dice-color]');
      const advantageInput = sharedReferences.querySelector('[data-dice-advantage]');
      const disadvantageInput = sharedReferences.querySelector('[data-dice-disadvantage]');
      const saveDicePreferences = () => {
        const preferences = currentDicePreferences();
        ['r', 'g', 'b'].forEach((channel, index) => {
          preferences[channel] = clamp(Number(rgbInputs[index]?.value) || 0, 0, 255);
          if (rgbInputs[index]) rgbInputs[index].value = preferences[channel];
        });
        preferences.advantage = Boolean(advantageInput?.checked);
        preferences.disadvantage = Boolean(disadvantageInput?.checked);
        if (colorInput) colorInput.value = diceColorHex(preferences);
        save();
      };
      rgbInputs.forEach((input) => input?.addEventListener('change', saveDicePreferences));
      colorInput?.addEventListener('input', () => {
        const color = colorInput.value;
        rgbInputs.forEach((input, index) => {
          if (input) input.value = parseInt(color.slice(1 + index * 2, 3 + index * 2), 16);
        });
        saveDicePreferences();
      });
      advantageInput?.addEventListener('change', () => {
        if (advantageInput.checked && disadvantageInput) disadvantageInput.checked = false;
        saveDicePreferences();
      });
      disadvantageInput?.addEventListener('change', () => {
        if (disadvantageInput.checked && advantageInput) advantageInput.checked = false;
        saveDicePreferences();
      });
    }
    root.querySelectorAll('.sheet-reference-grid').forEach((references) => references.remove());
  }

  $$('.player-card', root).forEach((card) => {
    const idx = Number(card.dataset.pidx);
    const sheet = state.playerSheets[idx];
    if (!sheet) return;
    attachSheetHandlers(card, sheet, idx);
  });

  let pointerDrag = null;
  const clearTabDragClasses = () => {
    $$('[data-sheet-tab]', root).forEach((item) => item.classList.remove('dragging', 'drop-before', 'drop-after'));
  };
  $$('[data-sheet-tab]', root).forEach((tab) => {
    tab.addEventListener('click', (event) => {
      if (pointerDrag?.moved) {
        event.preventDefault();
        pointerDrag = null;
        return;
      }
      selectPlayerSheetTab(root, tab.dataset.sheetTab);
    });
    tab.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      pointerDrag = {
        pointerId: event.pointerId,
        draggedId: tab.dataset.sheetTab,
        targetId: tab.dataset.sheetTab,
        startX: event.clientX,
        startY: event.clientY,
        moved: false
      };
      tab.setPointerCapture(event.pointerId);
    });
    tab.addEventListener('pointermove', (event) => {
      if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
      if (!pointerDrag.moved && Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY) < 6) return;
      pointerDrag.moved = true;
      event.preventDefault();
      clearTabDragClasses();
      tab.classList.add('dragging');
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-sheet-tab]');
      if (!target || !root.contains(target)) return;
      pointerDrag.targetId = target.dataset.sheetTab;
      const placeAfter = tabDropGoesAfter(root, pointerDrag.draggedId, pointerDrag.targetId);
      target.classList.add(placeAfter ? 'drop-after' : 'drop-before');
    });
    const finishPointerDrag = (event) => {
      if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
      const completedDrag = pointerDrag;
      clearTabDragClasses();
      if (completedDrag.moved && completedDrag.targetId !== completedDrag.draggedId) {
        reorderPlayerSheetTabs(root, completedDrag.draggedId, completedDrag.targetId,
          tabDropGoesAfter(root, completedDrag.draggedId, completedDrag.targetId));
      } else if (!completedDrag.moved) {
        pointerDrag = null;
      }
    };
    tab.addEventListener('pointerup', finishPointerDrag);
    tab.addEventListener('pointercancel', () => {
      clearTabDragClasses();
      pointerDrag = null;
    });
    tab.addEventListener('keydown', (event) => {
      const tabs = $$('[data-sheet-tab]', root);
      const current = tabs.indexOf(tab);
      let next = current;
      if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectPlayerSheetTab(root, tabs[next].dataset.sheetTab);
      tabs[next].focus();
    });
  });
  selectPlayerSheetTab(root, activeSheetId);
}

/* Escape a string for use inside a CSS attribute selector. */
function cssEsc(v) {
  return String(v ?? '').replace(/["\\]/g, '\\$&');
}

/* Card shell: header actions, embedded-PDF mount point, supplemental fields. */
function renderSheetHtml(pc, idx) {
  const owner = pc.player || '—';
  const isMine = isSheetOwner(pc);
  const canEdit = canEditSheet(pc);
  const dicePreferences = currentDicePreferences();
  const hasPortrait = Boolean(pc.portrait);
  const portraitHidden = hasPortrait && Boolean(pc.portraitHidden);
  const skillSummary = Object.keys(PDF_SKILL_ABILITIES).map((skill) => {
    const name = skill.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    const modifier = pc.pdfFields?.[`skill_${skill}_modifier`] || '—';
    return `<div><span>${esc(name)}</span><b>${esc(modifier)}</b></div>`;
  }).join('');
  return `
  <article class="player-card pdf-sheet-card" data-pidx="${idx}" data-sheet-id="${esc(pc.id)}">
    <div class="sheet-actions-top btn-row">
      <span class="sheet-owner">Owner: <b>${esc(owner)}</b>${isGmUser() && !isMine ? ' <span class="muted">(viewing as GM)</span>' : ''}</span>
      ${canEdit ? `<button type="button" data-pa="choose-portrait">${hasPortrait ? 'Change Portrait' : 'Add Portrait'}</button>
      <input type="file" data-portrait-file accept="image/*" hidden />` : ''}
      ${hasPortrait ? `<button type="button" data-pa="hide-portrait"${portraitHidden ? ' hidden' : ''}>Hide Portrait</button>
      <button type="button" data-pa="show-portrait"${portraitHidden ? '' : ' hidden'}>Show Portrait</button>` : ''}
      <button type="button" data-pa="download-pdf" class="gold">📄 Download Filled PDF</button>
      ${isGmUser() ? '<button type="button" class="danger" data-pa="delete">Delete Sheet</button>' : ''}
    </div>
    <details class="mobile-skill-summary" open>
      <summary>Skills</summary>
      <div class="mobile-skill-grid">${skillSummary}</div>
    </details>
    <div class="sheet-reference-grid" aria-label="Roll reference tables">
      <details class="sheet-reference sheet-reference-outcomes">
        <summary>Roll Outcomes</summary>
        <div class="sheet-reference-panel">
          <table>
            <thead><tr><th>Result vs. DC</th><th>Outcome</th></tr></thead>
            <tbody>
              <tr class="critical"><td>Natural 1</td><td>Instant Failure</td></tr>
              <tr><td>11+ below</td><td>Disastrous Failure</td></tr>
              <tr><td>6–10 below</td><td>Failure</td></tr>
              <tr><td>1–5 below</td><td>Partial Failure</td></tr>
              <tr><td>Meets DC</td><td>Narrow Success</td></tr>
              <tr><td>1–5 above</td><td>Success</td></tr>
              <tr><td>6–10 above</td><td>Great Success</td></tr>
              <tr><td>11+ above</td><td>Exceptional Success</td></tr>
              <tr class="critical"><td>Natural 20</td><td>Instant Success</td></tr>
            </tbody>
          </table>
        </div>
      </details>
      <details class="sheet-reference sheet-reference-dcs">
        <summary>DC Guide</summary>
        <div class="sheet-reference-panel">
          <table>
            <thead><tr><th>DC</th><th>Challenge</th></tr></thead>
            <tbody>
              <tr><td>5</td><td>Very Easy</td></tr>
              <tr><td>8</td><td>Easy</td></tr>
              <tr><td>10</td><td>Routine</td></tr>
              <tr><td>12</td><td>Moderate</td></tr>
              <tr><td>15</td><td>Challenging</td></tr>
              <tr><td>18</td><td>Difficult</td></tr>
              <tr><td>20</td><td>Very Difficult</td></tr>
              <tr><td>25</td><td>Extreme</td></tr>
              <tr><td>30</td><td>Legendary</td></tr>
              <tr><td>35</td><td>Superhuman</td></tr>
              <tr><td>40+</td><td>Nearly Impossible</td></tr>
            </tbody>
          </table>
        </div>
      </details>
      <details class="sheet-reference sheet-reference-dice">
        <summary>Dice Options</summary>
        <div class="sheet-reference-panel dice-options-panel">
          <div class="dice-color-controls">
            <label class="dice-color-swatch">Color
              <input type="color" data-dice-color value="${diceColorHex(dicePreferences)}" aria-label="Dice color" />
            </label>
            ${['r', 'g', 'b'].map((channel) => `<label>${channel.toUpperCase()}
              <input type="number" min="0" max="255" step="1" data-dice-rgb="${channel}" value="${dicePreferences[channel]}" />
            </label>`).join('')}
          </div>
          <div class="dice-roll-modes">
            <label><input type="checkbox" data-dice-advantage ${dicePreferences.advantage ? 'checked' : ''} /> Advantage</label>
            <label><input type="checkbox" data-dice-disadvantage ${dicePreferences.disadvantage ? 'checked' : ''} /> Disadvantage</label>
          </div>
          <div class="dice-options-grid" aria-label="Choose a die to roll">
            ${[4, 6, 8, 10, 12, 20].map((sides) => `<button type="button" data-die-sides="${sides}" title="Roll a d${sides}">d${sides}</button>`).join('')}
          </div>
        </div>
      </details>
    </div>
    <div class="pdf-sheet-wrap${canEdit ? '' : ' readonly'}" data-pdf-mount="pending">
      <div class="pdf-sheet-status muted" role="status" aria-live="polite">Loading fillable character sheet…</div>
      <canvas class="pdf-sheet-canvas"></canvas>
      <div class="pdf-sheet-widgets"></div>
      ${hasPortrait ? `<div class="character-portrait-overlay"${portraitHidden ? ' hidden' : ''}>
        <img src="${pc.portrait}" alt="${esc(pc.name || 'Character')} portrait" />
      </div>` : ''}
    </div>
    <section class="sheet-extras parchment inset">
      <div class="grid">
        <label class="full">General Notes<textarea data-pf="notes" rows="3">${esc(pc.notes)}</textarea></label>
      </div>
    </section>
    <div class="muted updated-meta">${sheetMetaText(pc)}</div>
  </article>`;
}

function attachSheetHandlers(card, sheet, idx) {
  const sheetId = sheet.id;

  // Always resolve to the LIVE sheet inside state — applyRemoteState() can
  // replace `state.playerSheets` with a brand-new array, leaving the closure's
  // `sheet` reference pointing at an orphaned object. If we mutated that
  // orphan, the next save() would persist state.playerSheets without the
  // user's edit and silently lose the data on refresh.
  const getSheet = () => {
    if (!Array.isArray(state.playerSheets)) return null;
    return state.playerSheets.find((s) => s && s.id === sheetId) || null;
  };

  // Re-check edit permission against the LIVE sheet + current login every
  // time, so the rightful owner is never blocked by a stale closure (e.g.
  // they logged out and back in, or remote sync replaced the sheet object).
  const canEditLive = () => {
    const s = getSheet() || sheet;
    return canEditSheet(s);
  };

  const portraitFile = card.querySelector('[data-portrait-file]');
  portraitFile?.addEventListener('change', () => {
    if (!canEditLive()) return;
    const file = portraitFile.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const liveSheet = getSheet();
      if (!liveSheet || typeof reader.result !== 'string') return;
      liveSheet.portrait = reader.result;
      liveSheet.portraitHidden = false;
      stampSheetEdit(liveSheet);
      save();
      const root = $('#player-sheet-list');
      if (root) root.dataset.sheetSig = '';
      renderPlayerSheets();
    });
    reader.readAsDataURL(file);
  });

  const metaEl = card.querySelector('.updated-meta');
  const refreshMeta = () => {
    const s = getSheet();
    if (metaEl && s) metaEl.textContent = sheetMetaText(s);
  };
  // Initial values — used only for the first paint of disabled-state on
  // supplemental fields. The live check above governs every actual edit.
  const initialCanEdit = canEditSheet(sheet);

  const persist = () => {
    const s = getSheet();
    if (!s) return;
    stampSheetEdit(s);
    save();
    refreshMeta();
  };

  // --- supplemental (non-PDF) fields ---
  $$('[data-pf]', card).forEach((el) => {
    if (!initialCanEdit) { el.setAttribute('disabled', 'disabled'); return; }
    const handler = () => {
      if (!requireUsername()) return;
      if (!canEditLive()) return;
      const s = getSheet();
      if (!s) return;
      s[el.dataset.pf] = el.value;
      persist();
    };
    el.addEventListener('input', handler);
  });

  // --- top action buttons ---
  $$('[data-pa]', card).forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.pa;
      if (act === 'choose-portrait') {
        portraitFile?.click();
        return;
      }
      if (act === 'hide-portrait') {
        const liveSheet = getSheet();
        if (liveSheet) {
          liveSheet.portraitHidden = true;
          stampSheetEdit(liveSheet);
          save();
        }
        card.querySelector('.character-portrait-overlay')?.setAttribute('hidden', '');
        btn.hidden = true;
        const showButton = card.querySelector('[data-pa="show-portrait"]');
        if (showButton) showButton.hidden = false;
        window.pdfSheet?.renderVisible?.();
        return;
      }
      if (act === 'show-portrait') {
        const liveSheet = getSheet();
        if (liveSheet) {
          liveSheet.portraitHidden = false;
          stampSheetEdit(liveSheet);
          save();
        }
        card.querySelector('.character-portrait-overlay')?.removeAttribute('hidden');
        btn.hidden = true;
        const hideButton = card.querySelector('[data-pa="hide-portrait"]');
        if (hideButton) hideButton.hidden = false;
        return;
      }
      if (act === 'download-pdf') {
        const s = getSheet() || sheet;
        if (window.pdfSheet && typeof window.pdfSheet.download === 'function') {
          window.pdfSheet.download(s).catch((e) => {
            console.error('[pdf-sheet] download failed', e);
            alert('Could not download filled PDF: ' + (e?.message || e));
          });
        }
        return;
      }
      if (!canEditLive()) return;
      if (act === 'delete') {
        const s = getSheet();
        if (!s) return;
        if (!confirm(`Delete ${s.name || s.player || 'this'} character sheet?`)) return;
        // Look up the live index — the array may have been re-ordered by a
        // remote sync since this card was first rendered.
        const liveIdx = state.playerSheets.findIndex((p) => p && p.id === sheetId);
        if (liveIdx >= 0) state.playerSheets.splice(liveIdx, 1);
        save();
        renderPlayerSheets();
      }
    });
  });

  // --- mount the embedded fillable PDF form ---
  if (window.pdfSheet && typeof window.pdfSheet.mount === 'function') {
    window.pdfSheet.mount(card, sheet, {
      canEdit: initialCanEdit,
      onChange: (fieldName, value) => {
        if (!requireUsername()) return;
        if (!canEditLive()) return;
        const s = getSheet();
        if (!s) return;
        s.pdfFields = s.pdfFields || {};
        if (value === '' || value === false || value === null || value === undefined) {
          delete s.pdfFields[fieldName];
        } else {
          s.pdfFields[fieldName] = value;
        }
        const updatedModifier = updatePdfAbilityModifier(s.pdfFields, fieldName);
        const updatedSkills = updatePdfSkillModifiers(s.pdfFields, fieldName);
        if (fieldName === 'constitution_score') s.maxHp = Number(s.pdfFields.max_hp) || 100;
        // Keep a few mirrored convenience fields in sync so display names update.
        if (fieldName === 'character_name') s.name = String(value || '');
        if (fieldName === 'bounty')         s.bounty = Number(value) || 0;
        if ((updatedModifier || updatedSkills) && window.pdfSheet) window.pdfSheet.refreshAll();
        persist();
      },
    });
  } else {
    const wrap = card.querySelector('.pdf-sheet-wrap');
    if (wrap) wrap.querySelector('.pdf-sheet-status').textContent =
      'PDF renderer not loaded. Check your network connection and reload.';
  }
}

/* Called by sync.js / app.js after applyRemoteState — gives the PDF module a
   chance to refresh widget values without rebuilding the canvas. */
window.refreshPdfSheetFields = function () {
  if (!window.pdfSheet || typeof window.pdfSheet.refreshAll !== 'function') return;
  window.pdfSheet.refreshAll();
};

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
  showDiceRoll({ sides: 20, die: rollVal, total: rollVal, label: `Sea Travel · ${role}` });
  recordRoll({
    label: `Sea Travel · ${role}`,
    character: role,
    sides: 20,
    die: rollVal,
    total: rollVal,
    detail: `Day ${r.currentDay} · DC ${dc} · ${resultText}`
  }, false);

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
  const crewCount = Math.max(1, Number(state.partySize) || 4);
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
  showDiceRoll({ sides: 10, die: idx + 1, total: idx + 1, label: 'Sailing Event' });
  recordRoll({
    label: 'Sailing Event',
    sides: 10,
    die: idx + 1,
    total: idx + 1,
    detail: ev
  }, false);
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
  showDiceRoll({ sides: 12, die: idx + 1, total: idx + 1, label: 'Complication Detail' });
  recordRoll({
    label: 'Complication Detail',
    sides: 12,
    die: idx + 1,
    total: idx + 1,
    detail: c
  }, false);
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
  const root = $('#travel-active');
  if (!root) return;
  // Active route
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
const SHIP_SUPPLY_CAPS = {
  Dinghy: 50,
  Sloop: 80,
  Caravel: 150,
  Galleon: 250,
  "Man-o'-War": 400,
  'Unique / Story Ship': 300,
};
const SHIP_SUPPLY_KEYS = ['food', 'water', 'medicine', 'ammo', 'repair'];

function shipSupplyCapacity(ship = state.ship) {
  return SHIP_SUPPLY_CAPS[ship.class] || SHIP_SUPPLY_CAPS['Unique / Story Ship'];
}

function shipSupplyTotal(ship = state.ship) {
  return SHIP_SUPPLY_KEYS.reduce((total, key) => total + Math.max(0, Number(ship[key]) || 0), 0);
}

function formatBerries(value) {
  return Math.max(0, Number(value) || 0).toLocaleString('en-US');
}

function bindShipFields() {
  $$('[data-ship]').forEach(el => {
    const k = el.dataset.ship;
    if (state.ship[k] !== undefined) el.value = state.ship[k];
    el.addEventListener('input', () => {
      let v = el.value;
      if (el.type === 'number' || el.type === 'range') v = Number(v) || 0;
      if (k === 'berries') {
        v = Math.max(0, Number(String(v).replace(/[^\d]/g, '')) || 0);
      }
      if (k === 'fireDamage' || k === 'waterDamage') v = clamp(v, 0, 100);
      state.ship[k] = v;
      save(); renderShip();
    });
    if (k === 'berries') {
      el.addEventListener('focus', () => { el.value = String(Math.max(0, Number(state.ship.berries) || 0)); });
      el.addEventListener('blur', () => { el.value = formatBerries(state.ship.berries); });
    }
  });
  $$('[data-shipdelta]').forEach(b => b.addEventListener('click', () => {
    const { k, d } = JSON.parse(b.dataset.shipdelta);
    let v = (state.ship[k] || 0) + d;
    if (k === 'hull') v = clamp(v, 0, state.ship.hullMax || 9999);
    if (k === 'sails') v = clamp(v, 0, 100);
    if (SHIP_SUPPLY_KEYS.includes(k)) {
      const available = Math.max(0, shipSupplyCapacity() - shipSupplyTotal());
      v = Math.max(0, d > 0 ? (state.ship[k] || 0) + Math.min(d, available) : v);
    }
    if (k === 'berries') v = Math.max(0, v);
    state.ship[k] = v;
    save(); renderShip();
  }));
}

function renderShip() {
  const s = state.ship;
  if (!Array.isArray(s.crew)) s.crew = [];
  if (!Array.isArray(s.log)) s.log = [];
  s.fireDamage = clamp(Number(s.fireDamage) || 0, 0, 100);
  s.waterDamage = clamp(Number(s.waterDamage) || 0, 0, 100);
  const waterOverlay = $('#water-damage-overlay');
  if (waterOverlay) {
    waterOverlay.style.height = `${s.waterDamage}vh`;
    waterOverlay.style.opacity = s.waterDamage > 0 ? String(0.32 + (s.waterDamage * 0.0025)) : '0';
    waterOverlay.classList.toggle('active', s.waterDamage > 0);
  }
  $('#ship-hull').textContent = s.hull;
  $('#ship-sails').textContent = s.sails;
  $('#ship-food').textContent = s.food;
  $('#ship-water').textContent = s.water;
  $('#ship-medicine').textContent = s.medicine;
  $('#ship-ammo').textContent = s.ammo;
  const berriesInput = $('#ship-berries');
  if (berriesInput !== document.activeElement) berriesInput.value = formatBerries(s.berries);
  $('#ship-repair').textContent = s.repair;
  const hullPct = s.hullMax ? clamp((s.hull / s.hullMax) * 100, 0, 100) : 0;
  $('#hull-fill').style.width = hullPct + '%';
  $('#sails-fill').style.width = clamp(s.sails, 0, 100) + '%';
  const fireDamage = $('#ship-fire-damage');
  const waterDamage = $('#ship-water-damage');
  if (fireDamage !== document.activeElement) fireDamage.value = s.fireDamage;
  if (waterDamage !== document.activeElement) waterDamage.value = s.waterDamage;
  $('#ship-fire-damage-value').textContent = s.fireDamage;
  $('#ship-water-damage-value').textContent = s.waterDamage;
  const supplyTotal = shipSupplyTotal(s);
  const supplyCapacity = shipSupplyCapacity(s);
  const supplyOver = supplyTotal > supplyCapacity;
  $('#ship-supply-used').textContent = supplyTotal;
  $('#ship-supply-cap').textContent = supplyCapacity;
  $('#ship-supply-fill').style.width = `${Math.min(100, (supplyTotal / supplyCapacity) * 100)}%`;
  $('#ship-supply-capacity').classList.toggle('over-capacity', supplyOver);
  $('#ship-supply-status').textContent = supplyOver
    ? `${supplyTotal - supplyCapacity} over capacity — remove supplies before adding more.`
    : `${supplyCapacity - supplyTotal} cargo spaces available.`;
  $$('[data-shipdelta]').forEach((button) => {
    const { k, d } = JSON.parse(button.dataset.shipdelta);
    if (SHIP_SUPPLY_KEYS.includes(k) && d > 0) button.disabled = supplyTotal >= supplyCapacity;
  });

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
initAppInstall();
initLogin();
bindSharedImageGallery();
refreshStats();
renderLog();
renderRollLog();
renderPlayerSheets();
initNpcTab();
updateGmOnlyUI();
renderSharedImages();
renderTravel();
renderShip();

