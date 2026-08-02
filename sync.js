/* ===========================================================
   Realtime sync via Firebase Realtime Database (optional).
   Activates only when window.FIREBASE_CONFIG.apiKey is set
   in firebase-config.js. Otherwise the app runs local-only.
   =========================================================== */
(function () {
  const indicator = document.getElementById('sync-indicator');
  const label = document.getElementById('sync-label');

  function setStatus(stateClass, text) {
    if (indicator) {
      indicator.classList.remove('connected', 'syncing', 'error');
      if (stateClass) indicator.classList.add(stateClass);
    }
    if (label) label.textContent = text;
  }

  setStatus(null, 'local only');

  const cfg = window.FIREBASE_CONFIG;
  if (!cfg || !cfg.apiKey || !cfg.databaseURL || typeof firebase === 'undefined') {
    return; // Firebase not configured / SDK missing — stay local-only.
  }

  const params = new URLSearchParams(location.search);
  const sessionId = (params.get('session') || window.FIREBASE_SESSION || 'default')
    .replace(/[.#$\[\]\/]/g, '_');
  const writerId = Math.random().toString(36).slice(2, 10);

  let ref;
  let dataRef;
  let imagesRef;
  try {
    firebase.initializeApp(cfg);
    ref = firebase.database().ref('sessions/' + sessionId);
    dataRef = ref.child('data');
    imagesRef = ref.child('_images');
  } catch (err) {
    console.error('[sync] Firebase init failed:', err);
    setStatus('error', 'sync error');
    return;
  }

  setStatus('syncing', 'connecting…');

  // Fields that are per-viewer (pan/zoom, UI toggles) and must NOT be synced —
  // otherwise every player hijacks every other player's viewport.
  const LOCAL_ONLY_FIELDS = ['mapView'];

  function stripLocalOnly(state) {
    if (!state || typeof state !== 'object') return state;
    const copy = { ...state };
    for (const k of LOCAL_ONLY_FIELDS) delete copy[k];
    return copy;
  }

  function extractImagePayloads(state) {
    const snapshot = structuredClone(stripLocalOnly(state));
    const payloads = [];
    if (Array.isArray(snapshot.sharedImages)) {
      snapshot.sharedImages = snapshot.sharedImages.map((image) => {
        if (!image || typeof image !== 'object') return image;
        const metadata = { ...image };
        if (typeof metadata.data === 'string' && metadata.data) {
          payloads.push({ id: metadata.id, data: metadata.data });
          delete metadata.data;
        }
        return metadata;
      });
    }
    return { snapshot, payloads };
  }

  window.storeSharedImageData = function (imageId, data) {
    if (!imageId || typeof data !== 'string' || !data.startsWith('data:image/')) {
      return Promise.resolve(false);
    }
    return imagesRef.child(imageId).set(data)
      .then(() => true)
      .catch((err) => {
        console.error('[sync] image upload failed:', err);
        setStatus('error', 'image upload error');
        return false;
      });
  };

  window.fetchSharedImageData = function (imageId) {
    if (!imageId) return Promise.resolve('');
    return imagesRef.child(imageId).once('value')
      .then((snapshot) => String(snapshot.val() || ''))
      .catch((err) => {
        console.error('[sync] image download failed:', err);
        return '';
      });
  };

  window.deleteSharedImageData = function (imageId) {
    if (!imageId) return Promise.resolve(false);
    return imagesRef.child(imageId).remove()
      .then(() => true)
      .catch((err) => {
        console.error('[sync] image delete failed:', err);
        return false;
      });
  };

  let pushTimer = null;
  let pendingPushResolvers = [];
  window.syncPush = function (state) {
    if (pushTimer) clearTimeout(pushTimer);
    const { snapshot, payloads } = extractImagePayloads(state);
    return new Promise((resolve) => {
      pendingPushResolvers.push(resolve);
      pushTimer = setTimeout(() => {
        const resolvers = pendingPushResolvers;
        pendingPushResolvers = [];
        setStatus('syncing', 'syncing…');
        const timestamp = Date.now();
        Promise.all(payloads.map((image) => imagesRef.child(image.id).set(image.data)))
          .then(() => ref.update({
            _writerId: writerId,
            _ts: timestamp,
            data: { _writerId: writerId, _ts: timestamp, state: snapshot }
          }))
          .then(() => {
            setStatus('connected', 'live · ' + sessionId);
            resolvers.forEach((settle) => settle(true));
          })
          .catch((err) => {
            console.error('[sync] push failed:', err);
            setStatus('error', 'sync error');
            resolvers.forEach((settle) => settle(false));
          });
      }, 300);
    });
  };

  let receivedInitial = false;
  dataRef.on('value', (snap) => {
    const v = snap.val();
    if (!v) {
      // Empty session — seed it with our current local state.
      const st = typeof window.__getState === 'function' ? window.__getState() : null;
      if (st) {
        const { snapshot, payloads } = extractImagePayloads(st);
        const timestamp = Date.now();
        Promise.all(payloads.map((image) => imagesRef.child(image.id).set(image.data)))
          .then(() => ref.update({
            _writerId: writerId,
            _ts: timestamp,
            data: { _writerId: writerId, _ts: timestamp, state: snapshot }
          }))
          .catch((err) => console.error('[sync] seed failed:', err));
      }
      setStatus('connected', 'live · ' + sessionId);
      receivedInitial = true;
      return;
    }
    const envelope = v && v.state && typeof v.state === 'object' ? v : null;
    const remoteState = envelope ? envelope.state : v;
    if (envelope?._writerId === writerId) {
      // Echo of our own write — ignore.
      setStatus('connected', 'live · ' + sessionId);
      receivedInitial = true;
      return;
    }
    if (typeof window.applyRemoteState === 'function' && remoteState) {
      window.applyRemoteState(remoteState, { initial: !receivedInitial });
    }
    setStatus('connected', 'live · ' + sessionId);
    receivedInitial = true;
  }, (err) => {
    console.error('[sync] read error:', err);
    setStatus('error', 'sync error');
  });

  // Helper: expose session id and a one-line invite URL for the DM.
  window.getSyncInviteUrl = function () {
    const url = new URL(location.href);
    url.searchParams.set('session', sessionId);
    return url.toString();
  };
})();
