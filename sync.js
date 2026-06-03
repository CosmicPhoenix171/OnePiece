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
  try {
    firebase.initializeApp(cfg);
    ref = firebase.database().ref('sessions/' + sessionId);
  } catch (err) {
    console.error('[sync] Firebase init failed:', err);
    setStatus('error', 'sync error');
    return;
  }

  setStatus('syncing', 'connecting…');

  let pushTimer = null;
  window.syncPush = function (state) {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      setStatus('syncing', 'syncing…');
      ref.set({ _writerId: writerId, _ts: Date.now(), data: state })
        .then(() => setStatus('connected', 'live · ' + sessionId))
        .catch((err) => {
          console.error('[sync] push failed:', err);
          setStatus('error', 'sync error');
        });
    }, 300);
  };

  let receivedInitial = false;
  ref.on('value', (snap) => {
    const v = snap.val();
    if (!v) {
      // Empty session — seed it with our current local state.
      const st = typeof window.__getState === 'function' ? window.__getState() : null;
      if (st) {
        ref.set({ _writerId: writerId, _ts: Date.now(), data: st })
          .catch((err) => console.error('[sync] seed failed:', err));
      }
      setStatus('connected', 'live · ' + sessionId);
      receivedInitial = true;
      return;
    }
    if (v._writerId === writerId) {
      // Echo of our own write — ignore.
      setStatus('connected', 'live · ' + sessionId);
      receivedInitial = true;
      return;
    }
    if (typeof window.applyRemoteState === 'function' && v.data) {
      window.applyRemoteState(v.data);
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
