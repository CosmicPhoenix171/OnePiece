# Sea Trouble System — One Piece DM Tool

A web-based Dungeon Master dashboard for a One Piece inspired D&D campaign.

## Run it

Just open `index.html` in any modern browser. No build step, no server, no dependencies.
All campaign data auto-saves to your browser's `localStorage`.

For best results (so saves persist reliably): keep the same browser/profile, and use **Settings → Export Save (JSON)** to back up.

## Tabs

1. **Dashboard** — Campaign Setup: name, location, danger, heat, ransom pieces, encounter clock, party, factions, clues.
2. **Generate Encounter** — Random encounter generator, scaled by Danger / Heat / Ransom pieces / party.
3. **Encounter Clock** — 0–6 clock with the action buttons from the spec; alerts you at 6.
4. **Heat Tracker** — 0–5 heat with action buttons; shows what each tier triggers.
5. **Devil's Ransom** — 13 cursed pieces, save DC = 10 + pieces held, curse pressure generator (Wis/Cha saves).
6. **Islands** — Save, edit, and load locations as the current scene.
7. **Encounter Log** — Every generated encounter is auto-saved with status + notes + export.
8. **Settings** — Export / Import JSON save, reset all data.

## Key features

- **Encounter generator** mixes type, purpose, hook, complication, choice, enemies, reward, consequence, ransom twist, heat/clock change, combat & roleplay notes.
- **Ransom twist chance** scales with pieces held (~7% per piece, capped 95%). Twists generate pressure lines, never controlling the PC.
- **Export Encounter as Text** copies a clean DM note to clipboard and opens a printable window.
- **Quick action buttons** on the Dashboard for Marine Patrol, Rival Pirates, Sea Event, Island Problem, NPC, Reward, Ransom Twist.

## Files

- `index.html` — Layout + tabs
- `styles.css` — Pirate / parchment / gold theme
- `app.js` — State, generators, persistence
