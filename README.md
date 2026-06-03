# The Devil's Ransom

A web-based DM tool for a One Piece inspired D&D campaign.

## Run it

Just open `index.html` in any modern browser. No build step, no server, no dependencies.
All campaign data auto-saves to your browser's `localStorage`.

For best results, keep the same browser/profile so the local save stays available.

## Tabs

1. **Bounty** — 0–5 bounty with action buttons; shows what each tier triggers.
2. **Islands** — Save, edit, and load locations as the current scene.
3. **Map** — Full-screen world map with click-to-place markers (port, island, danger, treasure, ransom, ship). Drag to reposition, click to edit, with notes per marker. **Sea Travel lives here as a side panel** — create routes manually or by clicking two markers (🧭 Route from 2 Markers). Active routes draw a dashed line between their start and destination markers, and a ship glyph slides along the line as Travel Days progress.
4. **Ship Tracker** — Hull HP, sails condition, morale, food/water/medicine/cannon shot/berries/repair kits, crew roster with HP & conditions, and a damage/event log.
5. **Captain's Log** — Saved encounter records with status, notes, and export controls for existing entries.

## Realtime sync (Firebase)

Optional. When enabled, all players (and the DM) who open the same URL with the same `?session=NAME` query parameter see the same state in real time.

1. Create a Firebase project at <https://console.firebase.google.com>.
2. Build → Realtime Database → Create database (start in test mode while playing).
3. Project Settings → Your apps → Web app → copy the config.
4. Paste the values into `firebase-config.js` (in this folder).
5. Reload `index.html` — the badge in the tab bar turns green (`live · default`).
6. Share the URL plus `?session=YOUR-CREW` to play together.

Leave `apiKey` empty in `firebase-config.js` to keep the app local-only (default). The local `localStorage` save still works either way.

## Key features

- **Encounter generator** mixes type, purpose, hook, complication, choice, enemies, reward, consequence, ransom twist, heat/clock change, combat & roleplay notes.
- **Ransom twist chance** scales with pieces held (~7% per piece, capped 95%). Twists generate pressure lines, never controlling the PC.
- **Export Encounter as Text** copies a clean DM note to clipboard and opens a printable window.

## Files

- `index.html` — Layout + tabs
- `styles.css` — Pirate / parchment / gold theme
- `app.js` — State, generators, persistence
- `map.js` — World map + Sea Travel overlay (route line + ship marker)
- `sync.js` — Optional Firebase Realtime Database sync
- `firebase-config.js` — Your Firebase project config (empty by default)
