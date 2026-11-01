# The Devil's Ransom

A web-based DM tool for a One Piece inspired D&D campaign.

## Run it

Host the repository with GitHub Pages and open the deployed HTTPS site. The embedded fillable character sheet and install manifest require a web origin and will not load when `index.html` is opened directly as a `file://` page.

For this repository, the GitHub Pages URL is:

<https://cosmicphoenix171.github.io/OnePiece/>

Enable Pages in the repository settings under **Pages**, choose the `main` branch as the source, and open the generated HTTPS URL. No build step or dependencies are required.
All campaign data auto-saves to your browser's `localStorage`.

For best results, keep the same browser/profile so the local save stays available.
The installed app uses the campaign logo for its launcher icon and startup screen; the wide logo is also used in the page header.

## Tabs

1. **Map** — Full-screen world map with click-to-place markers (port, island, danger, treasure, ransom, ship). Drag to reposition, click to edit, with notes per marker. **Sea Travel lives here as a side panel** — create routes manually or by clicking two markers (🧭 Route from 2 Markers). Active routes draw a dashed line between their start and destination markers, and a ship glyph slides along the line as Travel Days progress.
2. **Sound Library** — Collect local intro and outro audio for the One Piece D&D campaign. Upload files, play direct audio URLs, edit sound names, or browse all 82 quick links from the 101soundboards One Piece board; links open on the source site and are not synchronized to the campaign.
3. **Ship Tracker** — Hull and sails condition, fire/water damage, class-based cargo capacity, supplies, and a damage/event log.
4. **Player Sheets** — Fully digital, autosaving character sheets with identity details displayed in the header and editable on demand, bounty in berries, abilities and skills that can be clicked to roll while locked or edited while unlocked, skill proficiency and Expertise checkboxes, and a level-based d100 proficiency table (levels 1–4: +10 proficiency/+20 Expertise, increasing by +5/+10 every four levels). Skill checks roll d100 + full ability score + proficiency bonus; Expertise replaces proficiency with twice the bonus. D100 uses percentile dice: one d10 for tens (00–90) and one for ones (0–9), with 00/0 counting as 100. Combat and health tracking includes HP, AC, and Speed in Quick HP and detailed stats editable on demand, plus editable signature moves, flashback charges, inventory, and Devil's Ransom details. Direct ability checks roll d100 and add the full ability score. The DC guide and success-margin bands are scaled for d100 rolls. Maximum HP is calculated as Constitution score × 10. Armor Class is calculated as armor base AC plus the higher full Constitution or Dexterity score (base 10 when unarmored).
5. **Combat** — A shared duel-mat battlefield with enemies above the center divider and crew below. Cards are sorted by initiative within each side, and the active combatant pulses with a highlighted turn banner. Crew portraits open the character sheet inline below the duel mat for the owner and GM. Card Quick HP controls let owners adjust their own characters while the GM can adjust any combatant. The GM advances turns from beside the round display, controls combat, and can include or sideline each crew member; character owners can click their INIT badge to roll d20 + their full Dexterity score and sync the result. The GM can drag a target handle between combatants to show shared targeting arrows, including multiple targets per combatant.
6. **NPCs** — GM-only stat-block roster and encounter tracker. NPC AC uses the player-sheet armor-base-plus-higher-DEX-or-CON formula. Enemy durability is tiered around successful attacks: 50 HP for Minions, 100 for Standard enemies, and 200 for Elites. Legendary enemies use `(60 × active players) + (CON × 10)` HP, while regular Bosses use 300 HP. Damage is reduced by AC before HP is lost.
7. **Log Book** — Each player gets a private notes area that auto-saves and syncs with the GM. Below it, the GM also sees the encounter archive (saved encounter records with status, notes, and export controls).

## Simple login (username only)

The app now asks for a username before editing tools unlock.

1. Enter a username in the login prompt.
2. The name is saved locally in your browser under `localStorage`.
3. Use the top-bar **Switch User** button to change to another username.

This is intentionally lightweight and not secure authentication; it is only an in-app identity label.

## Realtime sync (Firebase)

Optional. When enabled, all players (and the DM) who open the same URL with the same `?session=NAME` query parameter see the same state in real time.

1. Create a Firebase project at <https://console.firebase.google.com>.
2. Build → Realtime Database → Create database (start in test mode while playing).
3. Project Settings → Your apps → Web app → copy the config.
4. Paste the values into `firebase-config.js` (in this folder).
5. Reload `index.html` — the badge in the tab bar turns green (`live`).
6. Share the URL plus `?session=YOUR-CREW` to play together.

Leave `apiKey` empty in `firebase-config.js` to keep the app local-only (default). The local `localStorage` save still works either way.

## Key features

- **Encounter generator** mixes type, purpose, hook, complication, choice, enemies, reward, consequence, ransom twist, heat/clock change, combat & roleplay notes.
- **Ransom twist chance** scales with pieces held (~7% per piece, capped 95%). Twists generate pressure lines, never controlling the PC.
- **Export Encounter as Text** copies a clean DM note to clipboard and opens a printable window.

## Files

- `index.html` — Layout + tabs
- `styles.css` — Pirate / parchment / gold theme
- `app.js` — State, generators, persistence, and digital character sheets
- `map.js` — World map + Sea Travel overlay (route line + ship marker)
- `sync.js` — Optional Firebase Realtime Database sync
- `firebase-config.js` — Your Firebase project config (empty by default)
