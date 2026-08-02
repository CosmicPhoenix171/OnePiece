/* ===========================================================
   MAP
   =========================================================== */

const MAP_MARKER_STYLES = {
  port:     { color: '#f5c75a', symbol: '⚓' },
  island:   { color: '#9ad07a', symbol: '🏝' },
  danger:   { color: '#c84a2a', symbol: '☠' },
  treasure: { color: '#ffd76b', symbol: '💰' },
  ransom:   { color: '#b04acc', symbol: '💀' },
  ship:     { color: '#ffffff', symbol: '⛵' },
  marker:   { color: '#7ad0c8', symbol: '📍' }
};

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 600;
const MAP_REPEAT_COUNT = 3;
const MAP_CANVAS_WIDTH = MAP_WIDTH * MAP_REPEAT_COUNT;
const MAP_CENTER_OFFSET = MAP_WIDTH;
const MAP_MIN_ZOOM = 0.5;
const MAP_MAX_ZOOM = 8;

let mapDragState = null;
let mapPanState = null;
let mapImageReady = false;
let mapSuppressPlacement = false;
let lastMarkerZoom = null;
let mapRoutePick = { active: false, startMarkerId: null, allowMapPoint: false };

/* ---------- Fog of war ----------
   Players see a dark fog over the map with a soft circular hole around
   each ship marker (and the moving ship on an active route).
   The GM (logged in as username "GM", case-insensitive) sees no fog. */
const FOG_RADIUS = 55;      // map units around each ship (was 110, shrunk 50%)
const FOG_OPACITY = 1;      // fully opaque fog
const FOG_COLOR = '#7d7d7d'; // neutral gray

function isGmUser() {
  return typeof currentUsername === 'string'
    && currentUsername.trim().toLowerCase() === 'gm';
}

function ensureMapView() {
  if (!state.mapView) state.mapView = { zoom: 1, panX: 0, panY: 0, travelPanelCollapsed: false };
  if (state.mapView.travelPanelCollapsed === undefined) state.mapView.travelPanelCollapsed = false;
}

function getMapImageSource() {
  return state.mapImageData || DEFAULT_MAP_IMAGE;
}

function getViewport() {
  return $('#map-viewport');
}

function getMapCanvas() {
  return $('#map-canvas');
}

function getMapImages() {
  return $$('.map-image');
}

function mapIsVisible() {
  const panel = $('#tab-map');
  return !!panel && panel.classList.contains('active');
}

function normalizeMapX(x) {
  return ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
}

function toCanvasX(mapX, copyIndex = 1) {
  return normalizeMapX(mapX) + copyIndex * MAP_WIDTH;
}

function wrapMapPanX() {
  ensureMapView();
  const viewport = getViewport();
  if (!viewport) return;

  const scaledTileWidth = MAP_WIDTH * state.mapView.zoom;
  const scaledCanvasWidth = MAP_CANVAS_WIDTH * state.mapView.zoom;

  // Keep the middle copy as the canonical view and wrap by one tile width.
  // This preserves the visible image while preventing the camera from hitting
  // a hard left/right edge inside the repeated strip.
  if (scaledTileWidth * 2 <= viewport.clientWidth) {
    state.mapView.panX = Math.round((viewport.clientWidth - scaledCanvasWidth) / 2);
    return;
  }

  const centerPanX = (viewport.clientWidth - scaledCanvasWidth) / 2;
  const wrapMin = centerPanX - scaledTileWidth / 2;
  const wrapMax = centerPanX + scaledTileWidth / 2;

  while (state.mapView.panX < wrapMin) state.mapView.panX += scaledTileWidth;
  while (state.mapView.panX >= wrapMax) state.mapView.panX -= scaledTileWidth;
}

function clampMapPanY() {
  ensureMapView();
  const viewport = getViewport();
  if (!viewport) return;
  const scaledHeight = MAP_HEIGHT * state.mapView.zoom;

  if (scaledHeight <= viewport.clientHeight) {
    state.mapView.panY = Math.round((viewport.clientHeight - scaledHeight) / 2);
  } else {
    state.mapView.panY = clamp(state.mapView.panY, Math.round(viewport.clientHeight - scaledHeight), 0);
  }
}

function renderMapView() {
  ensureMapView();
  const canvas = getMapCanvas();
  const label = $('#map-zoom-label');
  if (!canvas) return;
  wrapMapPanX();
  clampMapPanY();
  canvas.style.transform = `translate(${state.mapView.panX}px, ${state.mapView.panY}px) scale(${state.mapView.zoom})`;
  if (lastMarkerZoom !== state.mapView.zoom) renderMapMarkers();
  renderMapRoute();
  if (label) label.textContent = `${Math.round(state.mapView.zoom * 100)}%`;
}

function fitMapToViewport(saveState = true) {
  ensureMapView();
  const viewport = getViewport();
  if (!viewport) return;
  if (!viewport.clientWidth || !viewport.clientHeight) return;
  const fitZoom = clamp(
    Math.min(viewport.clientWidth / MAP_WIDTH, viewport.clientHeight / MAP_HEIGHT),
    MAP_MIN_ZOOM,
    MAP_MAX_ZOOM
  );
  state.mapView.zoom = fitZoom;
  state.mapView.panX = Math.round((viewport.clientWidth - MAP_CANVAS_WIDTH * fitZoom) / 2);
  state.mapView.panY = Math.round((viewport.clientHeight - MAP_HEIGHT * fitZoom) / 2);
  renderMapView();
  if (saveState) save();
}

function setMapZoom(nextZoom, anchorX, anchorY) {
  ensureMapView();
  const viewport = getViewport();
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  const localX = anchorX ?? rect.width / 2;
  const localY = anchorY ?? rect.height / 2;
  const worldX = (localX - state.mapView.panX) / state.mapView.zoom;
  const worldY = (localY - state.mapView.panY) / state.mapView.zoom;

  state.mapView.zoom = clamp(nextZoom, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
  state.mapView.panX = Math.round(localX - worldX * state.mapView.zoom);
  state.mapView.panY = Math.round(localY - worldY * state.mapView.zoom);
  renderMapView();
  save();
}

function viewportPointToMapPoint(clientX, clientY) {
  ensureMapView();
  const viewport = getViewport();
  const rect = viewport.getBoundingClientRect();
  const canvasX = (clientX - rect.left - state.mapView.panX) / state.mapView.zoom;
  const y = (clientY - rect.top - state.mapView.panY) / state.mapView.zoom;
  return {
    canvasX: clamp(Math.round(canvasX), 0, MAP_CANVAS_WIDTH),
    x: Math.round(normalizeMapX(canvasX)),
    y: clamp(Math.round(y), 0, MAP_HEIGHT)
  };
}

function renderMapMarkers() {
  const layer = $('#map-svg-markers') || $('#map-svg');
  if (!layer) return;
  const zoomScale = clamp(state.mapView?.zoom || 1, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
  const inverseScale = 1 / zoomScale;
  const labelScale = inverseScale * inverseScale;
  const circleRadius = Number((11 * inverseScale).toFixed(2));
  const iconSize = Number((14 * inverseScale).toFixed(2));
  const iconOffsetY = Number((5 * inverseScale).toFixed(2));
  const labelOffsetY = Number((-16 * labelScale).toFixed(2));
  const labelSize = Number((13 * labelScale).toFixed(2));
  const strokeWidth = Number(Math.max(1, 3 * labelScale).toFixed(2));
  const copies = [0, 1, 2];
  layer.innerHTML = copies.map((copyIndex) => (
    state.mapMarkers.map((m) => {
      const style = MAP_MARKER_STYLES[m.type] || MAP_MARKER_STYLES.marker;
      const pickClass = mapRoutePick.active && mapRoutePick.startMarkerId === m.id ? ' route-pick-start' : '';
      return `
        <g class="marker${pickClass}" data-id="${m.id}" data-copy="${copyIndex}" transform="translate(${toCanvasX(m.x, copyIndex)},${m.y})">
          <circle class="dot" r="${circleRadius}" fill="${style.color}" />
          <text y="${iconOffsetY}" text-anchor="middle" font-size="${iconSize}" pointer-events="none">${style.symbol}</text>
          <text class="lbl" y="${labelOffsetY}" font-size="${labelSize}" stroke-width="${strokeWidth}">${esc(m.name || '')}</text>
        </g>`;
    }).join('')
  )).join('');
  lastMarkerZoom = state.mapView?.zoom || 1;
  renderMapFog();
}

function findMarker(id) {
  return id ? state.mapMarkers.find((m) => m.id === id) : null;
}

function renderMapRoute() {
  const routeLayer = $('#map-svg-routes');
  const shipLayer = $('#map-svg-ship');
  if (!routeLayer || !shipLayer) return;
  routeLayer.innerHTML = '';
  shipLayer.innerHTML = '';
  if (typeof activeRoute !== 'function') return;
  const r = activeRoute();
  if (!r || r.status !== 'active') return;
  const start = findMarker(r.startMarkerId);
  const dest  = findMarker(r.destMarkerId);
  if (!start || !dest) return;

  const zoomScale = clamp(state.mapView?.zoom || 1, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
  const inverseScale = 1 / zoomScale;
  const lineWidth = Number((3 * inverseScale).toFixed(2));
  const dashArr = `${(10 * inverseScale).toFixed(2)} ${(8 * inverseScale).toFixed(2)}`;
  const haloR  = Number((18 * inverseScale).toFixed(2));
  const dotR   = Number((9 * inverseScale).toFixed(2));
  const glyphSize = Number((18 * inverseScale).toFixed(2));
  const glyphStroke = Number(Math.max(1, 2 * inverseScale).toFixed(2));

  const days = Math.max(1, Number(r.days) || 1);
  const day = clamp(Number(r.currentDay) || 0, 0, days);
  const t = clamp(day / days, 0, 1);

  let routeSvg = '';
  let shipSvg = '';
  for (const copyIndex of [0, 1, 2]) {
    const x1 = toCanvasX(start.x, copyIndex);
    const x2 = toCanvasX(dest.x,  copyIndex);
    const y1 = start.y;
    const y2 = dest.y;
    routeSvg += `<line class="route-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${lineWidth}" stroke-dasharray="${dashArr}" />`;
    const sx = x1 + (x2 - x1) * t;
    const sy = y1 + (y2 - y1) * t;
    shipSvg += `
      <g class="route-ship" transform="translate(${sx.toFixed(2)},${sy.toFixed(2)})">
        <circle class="route-ship-halo" r="${haloR}" />
        <circle class="route-ship-halo" r="${dotR}" />
        <text class="route-ship-glyph" y="${(glyphSize/3).toFixed(2)}" font-size="${glyphSize}" stroke-width="${glyphStroke}">⛵</text>
      </g>`;
  }
  routeLayer.innerHTML = routeSvg;
  shipLayer.innerHTML = shipSvg;
  renderMapFog();
}

function renderMapFog() {
  const layer = $('#map-svg-fog');
  if (!layer) return;
  if (isGmUser()) {
    layer.innerHTML = '';
    return;
  }

  // Collect ship anchor positions in canvas-space, one per repeated tile copy.
  const positions = [];
  const shipMarkers = (state.mapMarkers || []).filter((m) => m.type === 'ship');
  for (const m of shipMarkers) {
    for (const copyIndex of [0, 1, 2]) {
      positions.push({ x: toCanvasX(m.x, copyIndex), y: m.y });
    }
  }

  // Include the moving ship glyph if a route is in progress.
  const r = typeof activeRoute === 'function' ? activeRoute() : null;
  if (r && r.status === 'active') {
    const start = findMarker(r.startMarkerId);
    const dest  = findMarker(r.destMarkerId);
    if (start && dest) {
      const days = Math.max(1, Number(r.days) || 1);
      const day  = clamp(Number(r.currentDay) || 0, 0, days);
      const t    = clamp(day / days, 0, 1);
      for (const copyIndex of [0, 1, 2]) {
        const x1 = toCanvasX(start.x, copyIndex);
        const x2 = toCanvasX(dest.x,  copyIndex);
        positions.push({
          x: x1 + (x2 - x1) * t,
          y: start.y + (dest.y - start.y) * t
        });
      }
    }
  }

  const cutouts = positions.map((p) =>
    `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${FOG_RADIUS}" fill="url(#fog-hole-gradient)"/>`
  ).join('');

  layer.innerHTML = `
    <defs>
      <radialGradient id="fog-hole-gradient">
        <stop offset="0%"   stop-color="#000" stop-opacity="1"/>
        <stop offset="65%"  stop-color="#000" stop-opacity="1"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0"/>
      </radialGradient>
      <mask id="fog-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${MAP_CANVAS_WIDTH}" height="${MAP_HEIGHT}">
        <rect x="0" y="0" width="${MAP_CANVAS_WIDTH}" height="${MAP_HEIGHT}" fill="white"/>
        ${cutouts}
      </mask>
    </defs>
    <rect x="0" y="0" width="${MAP_CANVAS_WIDTH}" height="${MAP_HEIGHT}"
          fill="${FOG_COLOR}" fill-opacity="${FOG_OPACITY}"
          mask="url(#fog-mask)" pointer-events="none"/>
  `;
}

function enterRoutePickMode() {
  mapRoutePick = { active: true, startMarkerId: null, allowMapPoint: false };
  const banner = $('#route-pick-status');
  const text = $('#route-pick-text');
  if (banner) banner.classList.remove('hidden');
  if (text) text.textContent = 'Click the START marker on the map…';
  renderMapMarkers();
}

function plotCourseFromShip(shipId) {
  const ship = findMarker(shipId);
  if (!ship) return;
  mapRoutePick = { active: true, startMarkerId: shipId, allowMapPoint: true };
  const banner = $('#route-pick-status');
  const text = $('#route-pick-text');
  if (banner) banner.classList.remove('hidden');
  if (text) text.textContent = `Plotting course from ${ship.name || 'ship'} — click anywhere on the map (or another marker) to set the destination…`;
  renderMapMarkers();
}

function exitRoutePickMode() {
  mapRoutePick = { active: false, startMarkerId: null, allowMapPoint: false };
  const banner = $('#route-pick-status');
  if (banner) banner.classList.add('hidden');
  renderMapMarkers();
}

function openRouteFromMarkers(startId, destId) {
  const startMarker = findMarker(startId);
  const destMarker  = findMarker(destId);
  if (!startMarker || !destMarker) return;
  if (typeof showNewRouteForm === 'function') showNewRouteForm(true);
  if (typeof setTravelPanelCollapsed === 'function') setTravelPanelCollapsed(false);
  const form = $('#travel-new-form');
  if (form) {
    form.dataset.startMarkerId = startMarker.id;
    form.dataset.destMarkerId  = destMarker.id;
  }
  const startInput = $('#nr-start');
  const destInput  = $('#nr-dest');
  if (startInput) startInput.value = startMarker.name || 'Start';
  if (destInput)  destInput.value  = destMarker.name  || 'Destination';
  const status = $('#nr-marker-status');
  if (status) status.textContent = `Linked to map markers: ${startMarker.name || 'Start'} → ${destMarker.name || 'Destination'}`;
  form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function setTravelPanelCollapsed(collapsed) {
  ensureMapView();
  state.mapView.travelPanelCollapsed = !!collapsed;
  const shell = document.querySelector('#tab-map .map-shell');
  if (shell) shell.classList.toggle('travel-collapsed', state.mapView.travelPanelCollapsed);
  save();
  if (mapIsVisible()) renderMapView();
}

function toggleTravelPanel() {
  ensureMapView();
  setTravelPanelCollapsed(!state.mapView.travelPanelCollapsed);
}

function cleanupRouteMarkerRefs(removedId) {
  if (!removedId || !Array.isArray(state.routes)) return;
  let changed = false;
  for (const r of state.routes) {
    if (r.startMarkerId === removedId) { r.startMarkerId = null; changed = true; }
    if (r.destMarkerId  === removedId) { r.destMarkerId  = null; changed = true; }
  }
  if (changed) renderMapRoute();
}

function updateMapStatus(text) {
  const status = $('#map-status');
  if (status) status.textContent = text;
}

function renderMap() {
  ensureMapView();
  const wrap = $('#map-wrap');
  const imgs = getMapImages();
  if (!wrap || !imgs.length) return;

  const onError = () => {
    mapImageReady = false;
    wrap.classList.remove('has-image');
    imgs.forEach((img) => img.removeAttribute('src'));
    updateMapStatus(`No game map image loaded yet. Add ${DEFAULT_MAP_IMAGE} to the repo or use Import Game Map.`);
  };
  const onLoad = () => {
    mapImageReady = true;
    wrap.classList.add('has-image');
    updateMapStatus(
      state.mapImageData
        ? (state.mapImageName ? `Current map image: ${state.mapImageName}` : 'Current map image loaded from browser storage.')
        : `Current map image: ${DEFAULT_MAP_IMAGE}`
    );
    if ((!state.mapView || !state.mapView.zoom || (!state.mapView.panX && !state.mapView.panY)) && mapIsVisible()) {
      fitMapToViewport(false);
    } else if (mapIsVisible()) {
      renderMapView();
    }
  };

  imgs.forEach((img) => {
    img.onerror = onError;
    img.onload = onLoad;
  });

  const source = getMapImageSource();
  if (imgs[0].getAttribute('src') !== source) imgs.forEach((img) => { img.src = source; });
  else if (imgs[0].complete && imgs[0].naturalWidth > 0) {
    mapImageReady = true;
    wrap.classList.add('has-image');
    renderMapView();
    updateMapStatus(
      state.mapImageData
        ? (state.mapImageName ? `Current map image: ${state.mapImageName}` : 'Current map image loaded from browser storage.')
        : `Current map image: ${DEFAULT_MAP_IMAGE}`
    );
  }

  renderMapMarkers();
}

function importMapImage() {
  $('#map-file-input')?.click();
}

function bindMapImporter() {
  const input = $('#map-file-input');
  if (!input || input.dataset.bound === 'true') return;
  input.dataset.bound = 'true';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file.');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.mapImageData = String(reader.result || '');
      state.mapImageName = file.name;
      fitMapToViewport(false);
      save();
      renderMap();
      input.value = '';
    };
    reader.readAsDataURL(file);
  });
}

function openMapEditor(id) {
  const marker = state.mapMarkers.find((entry) => entry.id === id);
  const editor = $('#map-editor');
  if (!marker || !editor) return;

  const plotCourseBtn = marker.type === 'ship'
    ? `<button class="gold" id="me-plot">🧭 Plot Course from this Ship</button>`
    : '';

  editor.innerHTML = `
    <h3 class="map-editor-title">Edit Marker</h3>
    <div class="grid two">
      <label>Name<input id="me-name" value="${esc(marker.name)}" /></label>
      <label>Type
        <select id="me-type">
          ${Object.keys(MAP_MARKER_STYLES).map((key) =>
            `<option value="${key}" ${key === marker.type ? 'selected' : ''}>${key}</option>`
          ).join('')}
        </select>
      </label>
      <label class="full">Notes<textarea id="me-notes" rows="3">${esc(marker.notes || '')}</textarea></label>
    </div>
    <div class="btn-row">
      ${plotCourseBtn}
      <button class="gold" id="me-save">Save</button>
      <button id="me-close">Close</button>
      <button class="danger" id="me-del">Delete Marker</button>
    </div>`;

  $('#me-save').addEventListener('click', () => {
    marker.name = $('#me-name').value;
    marker.type = $('#me-type').value;
    marker.notes = $('#me-notes').value;
    save();
    renderMapMarkers();
    editor.innerHTML = '';
  });
  $('#me-close').addEventListener('click', () => { editor.innerHTML = ''; });
  const plotBtn = $('#me-plot');
  if (plotBtn) plotBtn.addEventListener('click', () => {
    editor.innerHTML = '';
    plotCourseFromShip(marker.id);
  });
  $('#me-del').addEventListener('click', () => {
    if (!confirm('Delete this marker?')) return;
    state.mapMarkers = state.mapMarkers.filter((entry) => entry.id !== id);
    cleanupRouteMarkerRefs(id);
    save();
    renderMapMarkers();
    renderMapRoute();
    editor.innerHTML = '';
  });
}

function centerOnShip() {
  let shipMarker = state.mapMarkers.find((marker) => marker.type === 'ship');
  if (!shipMarker) {
    if (!confirm('No ship marker on the map. Place one in the center?')) return;
    shipMarker = {
      id: uid(),
      type: 'ship',
      name: state.ship.name || 'Our Ship',
      x: 500,
      y: 300,
      notes: ''
    };
    state.mapMarkers.push(shipMarker);
    save();
    renderMapMarkers();
  }

  const viewport = getViewport();
  if (viewport) {
    state.mapView.panX = Math.round(viewport.clientWidth / 2 - toCanvasX(shipMarker.x) * state.mapView.zoom);
    state.mapView.panY = Math.round(viewport.clientHeight / 2 - shipMarker.y * state.mapView.zoom);
    renderMapView();
    save();
  }

  const node = document.querySelector(`#map-svg .marker[data-id="${shipMarker.id}"]`);
  if (node) {
    node.classList.add('selected');
    setTimeout(() => node.classList.remove('selected'), 1500);
  }
}

function bindMapControls() {
  const zoomIn = $('#map-zoom-in');
  const zoomOut = $('#map-zoom-out');
  const zoomFit = $('#map-zoom-fit');
  const viewport = getViewport();
  const svg = $('#map-svg');
  if (!viewport || !svg || zoomIn?.dataset.bound === 'true') return;

  zoomIn.dataset.bound = 'true';
  zoomOut.dataset.bound = 'true';
  zoomFit.dataset.bound = 'true';

  zoomIn.addEventListener('click', () => setMapZoom(state.mapView.zoom * 1.2));
  zoomOut.addEventListener('click', () => setMapZoom(state.mapView.zoom / 1.2));
  zoomFit.addEventListener('click', () => fitMapToViewport());

  viewport.addEventListener('wheel', (event) => {
    if (!mapImageReady) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    setMapZoom(state.mapView.zoom * factor, localX, localY);
  }, { passive: false });

  viewport.addEventListener('mousedown', (event) => {
    if (!mapImageReady) return;
    if (event.target.closest('.marker')) return;
    mapPanState = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanX: state.mapView.panX,
      startPanY: state.mapView.panY,
      moved: false
    };
    viewport.classList.add('panning');
  });

  svg.addEventListener('mousedown', (event) => {
    const target = event.target.closest('.marker');
    if (!target) return;
    const marker = state.mapMarkers.find((entry) => entry.id === target.dataset.id);
    if (!marker) return;
    if (mapRoutePick.active) {
      event.stopPropagation();
      event.preventDefault();
      if (!mapRoutePick.startMarkerId) {
        mapRoutePick.startMarkerId = marker.id;
        const text = $('#route-pick-text');
        if (text) text.textContent = `Start: ${marker.name || 'marker'} — now click the DESTINATION marker…`;
        renderMapMarkers();
      } else if (mapRoutePick.startMarkerId === marker.id) {
        // Same marker tapped twice; just refresh prompt
        const text = $('#route-pick-text');
        if (text) text.textContent = 'Pick a different marker as the destination.';
      } else {
        const startId = mapRoutePick.startMarkerId;
        openRouteFromMarkers(startId, marker.id);
        exitRoutePickMode();
      }
      mapSuppressPlacement = true;
      return;
    }
    const point = viewportPointToMapPoint(event.clientX, event.clientY);
    const copyIndex = Number(target.dataset.copy) || 0;
    const markerCanvasX = toCanvasX(marker.x, copyIndex);
    mapDragState = {
      id: marker.id,
      offX: point.canvasX - markerCanvasX,
      offY: point.y - marker.y,
      moved: false
    };
    event.stopPropagation();
    event.preventDefault();
  });

  window.addEventListener('mousemove', (event) => {
    if (mapDragState) {
      const point = viewportPointToMapPoint(event.clientX, event.clientY);
      const marker = state.mapMarkers.find((entry) => entry.id === mapDragState.id);
      if (!marker) return;
      marker.x = clamp(normalizeMapX(point.canvasX - mapDragState.offX), 8, MAP_WIDTH - 8);
      marker.y = clamp(point.y - mapDragState.offY, 8, MAP_HEIGHT - 8);
      mapDragState.moved = true;
      renderMapMarkers();
      return;
    }
    if (mapPanState) {
      state.mapView.panX = Math.round(mapPanState.startPanX + (event.clientX - mapPanState.startClientX));
      state.mapView.panY = Math.round(mapPanState.startPanY + (event.clientY - mapPanState.startClientY));
      mapPanState.moved = true;
      renderMapView();
    }
  });

  window.addEventListener('mouseup', () => {
    if (mapDragState) {
      if (!mapDragState.moved) openMapEditor(mapDragState.id);
      else mapSuppressPlacement = true;
      save();
      mapDragState = null;
    }
    if (mapPanState) {
      viewport.classList.remove('panning');
      if (mapPanState.moved) {
        mapSuppressPlacement = true;
        save();
      }
      mapPanState = null;
    }
  });

  svg.addEventListener('click', (event) => {
    if (!mapImageReady) return;
    if (mapRoutePick.active) {
      if (mapRoutePick.allowMapPoint && mapRoutePick.startMarkerId && !event.target.closest('.marker')) {
        const point = viewportPointToMapPoint(event.clientX, event.clientY);
        const namePrompt = prompt('Name for destination:', 'Destination');
        if (namePrompt === null) return;
        const destMarker = {
          id: uid(),
          type: 'marker',
          name: namePrompt || 'Destination',
          x: point.x,
          y: point.y,
          notes: 'Auto-placed destination for plotted course.'
        };
        state.mapMarkers.push(destMarker);
        const startId = mapRoutePick.startMarkerId;
        save();
        renderMapMarkers();
        openRouteFromMarkers(startId, destMarker.id);
        exitRoutePickMode();
      }
      return;
    }
    if (mapSuppressPlacement) {
      mapSuppressPlacement = false;
      return;
    }
    if (mapDragState || event.target.closest('.marker')) return;
    const point = viewportPointToMapPoint(event.clientX, event.clientY);
    const type = $('#map-marker-type').value;
    const namePrompt = prompt(`Name for new ${type}:`, '');
    if (namePrompt === null) return;
    state.mapMarkers.push({
      id: uid(),
      type,
      name: namePrompt || type,
      x: point.x,
      y: point.y,
      notes: ''
    });
    save();
    renderMapMarkers();
  });

  window.addEventListener('resize', () => {
    if (!mapIsVisible()) return;
    renderMapView();
  });
}

function initMap() {
  bindMapImporter();
  bindMapControls();
  bindRoutePickCancel();
  ensureMapView();
  const shell = document.querySelector('#tab-map .map-shell');
  if (shell) shell.classList.toggle('travel-collapsed', !!state.mapView.travelPanelCollapsed);
  renderMap();
  if (mapIsVisible()) renderMapView();

  const mapTabButton = $('#tabs .tab[data-tab="map"]');
  if (mapTabButton && mapTabButton.dataset.mapBound !== 'true') {
    mapTabButton.dataset.mapBound = 'true';
    mapTabButton.addEventListener('click', () => {
      requestAnimationFrame(() => {
        if (!state.mapView || !state.mapView.zoom || (!state.mapView.panX && !state.mapView.panY)) {
          fitMapToViewport(false);
        }
        renderMapView();
      });
    });
  }
}

function bindRoutePickCancel() {
  const cancelBtn = $('#route-pick-cancel');
  if (cancelBtn && cancelBtn.dataset.bound !== 'true') {
    cancelBtn.dataset.bound = 'true';
    cancelBtn.addEventListener('click', () => exitRoutePickMode());
  }
}

initMap();