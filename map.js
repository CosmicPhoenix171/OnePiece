/* ===========================================================
   MAP
   =========================================================== */

const MAP_MARKER_STYLES = {
  port: { color: '#f5c75a', symbol: '⚓' },
  island: { color: '#9ad07a', symbol: '🏝' },
  danger: { color: '#c84a2a', symbol: '☠' },
  treasure: { color: '#ffd76b', symbol: '💰' },
  ransom: { color: '#b04acc', symbol: '💀' },
  ship: { color: '#ffffff', symbol: '⛵' },
  marker: { color: '#7ad0c8', symbol: '📍' }
};

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 600;
const MAP_REPEAT_COUNT = 3;
const MAP_CANVAS_WIDTH = MAP_WIDTH * MAP_REPEAT_COUNT;
const MAP_MIN_ZOOM = 0.5;
const MAP_MAX_ZOOM = 8;
const FOG_RADIUS = 55;
const FOG_OPACITY = 1;
const FOG_COLOR = '#7d7d7d';

let mapDragState = null;
let mapPanState = null;
let mapImageReady = false;
let mapSuppressPlacement = false;
let lastMarkerZoom = null;

function isGmUser() {
  return typeof currentUsername === 'string'
    && currentUsername.trim().toLowerCase() === 'gm';
}

function ensureMapView() {
  if (!state.mapView) state.mapView = { zoom: 1, panX: 0, panY: 0 };
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
  return $('#tab-map')?.classList.contains('active');
}

function normalizeMapX(x) {
  return ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
}

function toCanvasX(mapX, copyIndex = 1) {
  return normalizeMapX(mapX) + copyIndex * MAP_WIDTH;
}

function wrapMapPanX() {
  const viewport = getViewport();
  if (!viewport) return;

  const scaledTileWidth = MAP_WIDTH * state.mapView.zoom;
  const scaledCanvasWidth = MAP_CANVAS_WIDTH * state.mapView.zoom;
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
  const viewport = getViewport();
  if (!viewport) return;
  const scaledHeight = MAP_HEIGHT * state.mapView.zoom;
  state.mapView.panY = scaledHeight <= viewport.clientHeight
    ? Math.round((viewport.clientHeight - scaledHeight) / 2)
    : clamp(state.mapView.panY, Math.round(viewport.clientHeight - scaledHeight), 0);
}

function renderMapView() {
  ensureMapView();
  const canvas = getMapCanvas();
  if (!canvas) return;
  wrapMapPanX();
  clampMapPanY();
  canvas.style.transform = `translate(${state.mapView.panX}px, ${state.mapView.panY}px) scale(${state.mapView.zoom})`;
  if (lastMarkerZoom !== state.mapView.zoom) renderMapMarkers();
  const label = $('#map-zoom-label');
  if (label) label.textContent = `${Math.round(state.mapView.zoom * 100)}%`;
  const picker = $('#map-zoom-picker');
  if (picker) picker.value = String(Math.round(state.mapView.zoom * 100 / 25) * 25);
}

function fitMapToViewport(saveState = true) {
  ensureMapView();
  const viewport = getViewport();
  if (!viewport?.clientWidth || !viewport.clientHeight) return;
  state.mapView.zoom = clamp(
    Math.min(viewport.clientWidth / MAP_WIDTH, viewport.clientHeight / MAP_HEIGHT),
    MAP_MIN_ZOOM,
    MAP_MAX_ZOOM
  );
  state.mapView.panX = Math.round((viewport.clientWidth - MAP_CANVAS_WIDTH * state.mapView.zoom) / 2);
  state.mapView.panY = Math.round((viewport.clientHeight - MAP_HEIGHT * state.mapView.zoom) / 2);
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
  const layer = $('#map-svg-markers');
  if (!layer) return;
  const inverseScale = 1 / clamp(state.mapView?.zoom || 1, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
  const circleRadius = Number((11 * inverseScale).toFixed(2));
  const iconSize = Number((14 * inverseScale).toFixed(2));
  const iconOffsetY = Number((5 * inverseScale).toFixed(2));
  const labelOffsetY = Number((-16 * inverseScale).toFixed(2));
  const labelSize = Number((13 * inverseScale).toFixed(2));
  const strokeWidth = Number(Math.max(1, 3 * inverseScale).toFixed(2));

  layer.innerHTML = [0, 1, 2].map((copyIndex) => state.mapMarkers.map((marker) => {
    const style = MAP_MARKER_STYLES[marker.type] || MAP_MARKER_STYLES.marker;
    const dotClass = marker.type === 'ship' ? 'dot ship-dot' : 'dot';
    return `
      <g class="marker" data-id="${marker.id}" data-copy="${copyIndex}" transform="translate(${toCanvasX(marker.x, copyIndex)},${marker.y})">
        <circle class="${dotClass}" r="${circleRadius}" fill="${style.color}" />
        <text y="${iconOffsetY}" text-anchor="middle" font-size="${iconSize}" pointer-events="none">${style.symbol}</text>
        <text class="lbl" y="${labelOffsetY}" font-size="${labelSize}" stroke-width="${strokeWidth}">${esc(marker.name || '')}</text>
      </g>`;
  }).join('')).join('');
  lastMarkerZoom = state.mapView?.zoom || 1;
  renderMapFog();
}

function renderMapFog() {
  const layer = $('#map-svg-fog');
  if (!layer) return;
  if (isGmUser()) {
    layer.innerHTML = '';
    return;
  }

  const positions = [];
  for (const marker of state.mapMarkers || []) {
    if (marker.type !== 'ship') continue;
    for (const copyIndex of [0, 1, 2]) {
      positions.push({ x: toCanvasX(marker.x, copyIndex), y: marker.y });
    }
  }
  const cutouts = positions.map((position) =>
    `<circle cx="${position.x.toFixed(2)}" cy="${position.y.toFixed(2)}" r="${FOG_RADIUS}" fill="url(#fog-hole-gradient)"/>`
  ).join('');

  layer.innerHTML = `
    <defs>
      <radialGradient id="fog-hole-gradient">
        <stop offset="0%" stop-color="#000" stop-opacity="1"/>
        <stop offset="65%" stop-color="#000" stop-opacity="1"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0"/>
      </radialGradient>
      <mask id="fog-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${MAP_CANVAS_WIDTH}" height="${MAP_HEIGHT}">
        <rect x="0" y="0" width="${MAP_CANVAS_WIDTH}" height="${MAP_HEIGHT}" fill="white"/>
        ${cutouts}
      </mask>
    </defs>
    <rect x="0" y="0" width="${MAP_CANVAS_WIDTH}" height="${MAP_HEIGHT}" fill="${FOG_COLOR}" fill-opacity="${FOG_OPACITY}" mask="url(#fog-mask)" pointer-events="none"/>`;
}

function renderMap() {
  ensureMapView();
  const wrap = $('#map-wrap');
  const images = getMapImages();
  if (!wrap || !images.length) return;

  const onError = () => {
    mapImageReady = false;
    wrap.classList.remove('has-image');
    images.forEach((image) => image.removeAttribute('src'));
  };
  const onLoad = () => {
    mapImageReady = true;
    wrap.classList.add('has-image');
    if (!state.mapView.zoom || (!state.mapView.panX && !state.mapView.panY)) fitMapToViewport(false);
    else if (mapIsVisible()) renderMapView();
  };
  images.forEach((image) => {
    image.onerror = onError;
    image.onload = onLoad;
  });

  const source = getMapImageSource();
  if (images[0].getAttribute('src') !== source) images.forEach((image) => { image.src = source; });
  else if (images[0].complete && images[0].naturalWidth > 0) onLoad();
  renderMapMarkers();
}

function openMapEditor(id) {
  const marker = state.mapMarkers.find((entry) => entry.id === id);
  const editor = $('#map-editor');
  if (!marker || !editor) return;
  editor.innerHTML = `
    <h3 class="map-editor-title">Edit Marker</h3>
    <div class="grid two">
      <label>Name<input id="me-name" value="${esc(marker.name)}" /></label>
      <label>Type<select id="me-type">${Object.keys(MAP_MARKER_STYLES).map((key) => `<option value="${key}" ${key === marker.type ? 'selected' : ''}>${key}</option>`).join('')}</select></label>
      <label class="full">Notes<textarea id="me-notes" rows="3">${esc(marker.notes || '')}</textarea></label>
    </div>
    <div class="btn-row">
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
  $('#me-del').addEventListener('click', () => {
    if (!confirm('Delete this marker?')) return;
    state.mapMarkers = state.mapMarkers.filter((entry) => entry.id !== id);
    save();
    renderMapMarkers();
    editor.innerHTML = '';
  });
}

function centerOnShip() {
  let shipMarker = state.mapMarkers.find((marker) => marker.type === 'ship');
  if (!shipMarker) {
    if (!confirm('No ship marker on the map. Place one in the center?')) return;
    shipMarker = { id: uid(), type: 'ship', name: state.ship.name || 'Our Ship', x: 500, y: 300, notes: '' };
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
}

function bindMapControls() {
  const viewport = getViewport();
  const svg = $('#map-svg');
  const zoomIn = $('#map-zoom-in');
  const zoomPicker = $('#map-zoom-picker');
  if (!viewport || !svg || zoomIn?.dataset.bound === 'true') return;
  $('#map-zoom-out').dataset.bound = 'true';
  $('#map-zoom-fit').dataset.bound = 'true';
  zoomIn.dataset.bound = 'true';
  zoomIn.addEventListener('click', () => setMapZoom(state.mapView.zoom * 1.2));
  $('#map-zoom-out').addEventListener('click', () => setMapZoom(state.mapView.zoom / 1.2));
  $('#map-zoom-fit').addEventListener('click', () => fitMapToViewport());
  zoomPicker?.addEventListener('input', () => setMapZoom(Number(zoomPicker.value) / 100));

  viewport.addEventListener('wheel', (event) => {
    if (!mapImageReady) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    setMapZoom(state.mapView.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });

  viewport.addEventListener('pointerdown', (event) => {
    if (!mapImageReady || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || event.target.closest('.marker')) return;
    mapPanState = { pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, startPanX: state.mapView.panX, startPanY: state.mapView.panY, moved: false };
    try { viewport.setPointerCapture(event.pointerId); } catch {}
    viewport.classList.add('panning');
    event.preventDefault();
  });

  svg.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const target = event.target.closest('.marker');
    if (!target) return;
    const marker = state.mapMarkers.find((entry) => entry.id === target.dataset.id);
    if (!marker) return;
    const point = viewportPointToMapPoint(event.clientX, event.clientY);
    const markerCanvasX = toCanvasX(marker.x, Number(target.dataset.copy) || 0);
    mapDragState = { id: marker.id, pointerId: event.pointerId, offX: point.canvasX - markerCanvasX, offY: point.y - marker.y, moved: false };
    try { svg.setPointerCapture(event.pointerId); } catch {}
    event.stopPropagation();
    event.preventDefault();
  });

  window.addEventListener('pointermove', (event) => {
    if (mapDragState?.pointerId === event.pointerId) {
      const point = viewportPointToMapPoint(event.clientX, event.clientY);
      const marker = state.mapMarkers.find((entry) => entry.id === mapDragState.id);
      if (!marker) return;
      marker.x = clamp(normalizeMapX(point.canvasX - mapDragState.offX), 8, MAP_WIDTH - 8);
      marker.y = clamp(point.y - mapDragState.offY, 8, MAP_HEIGHT - 8);
      mapDragState.moved = true;
      renderMapMarkers();
      return;
    }
    if (mapPanState?.pointerId === event.pointerId) {
      state.mapView.panX = Math.round(mapPanState.startPanX + event.clientX - mapPanState.startClientX);
      state.mapView.panY = Math.round(mapPanState.startPanY + event.clientY - mapPanState.startClientY);
      mapPanState.moved = true;
      renderMapView();
      event.preventDefault();
    }
  });

  const finishPointer = (event) => {
    if (mapDragState?.pointerId === event.pointerId) {
      if (!mapDragState.moved) openMapEditor(mapDragState.id);
      else mapSuppressPlacement = true;
      save();
      mapDragState = null;
    }
    if (mapPanState?.pointerId === event.pointerId) {
      viewport.classList.remove('panning');
      if (mapPanState.moved) {
        mapSuppressPlacement = true;
        save();
      }
      mapPanState = null;
    }
  };
  window.addEventListener('pointerup', finishPointer);
  window.addEventListener('pointercancel', finishPointer);

  svg.addEventListener('click', (event) => {
    if (!mapImageReady || mapSuppressPlacement || event.target.closest('.marker')) {
      mapSuppressPlacement = false;
      return;
    }
    const point = viewportPointToMapPoint(event.clientX, event.clientY);
    const type = $('#map-marker-type').value;
    const name = prompt(`Name for new ${type}:`, '');
    if (name === null) return;
    state.mapMarkers.push({ id: uid(), type, name: name || type, x: point.x, y: point.y, notes: '' });
    save();
    renderMapMarkers();
  });

  window.addEventListener('resize', () => {
    if (mapIsVisible()) renderMapView();
  });
}

function initMap() {
  ensureMapView();
  bindMapControls();
  renderMap();
  if (mapIsVisible()) renderMapView();
  const mapTab = $('#tabs .tab[data-tab="map"]');
  if (mapTab && mapTab.dataset.mapBound !== 'true') {
    mapTab.dataset.mapBound = 'true';
    mapTab.addEventListener('click', () => requestAnimationFrame(() => renderMapView()));
  }
}

initMap();
