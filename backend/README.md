# Shards Idle

A browser-based idle RPG. Characters fight autonomously through challenges using AI-driven skill selection.

## Requirements

- Node.js v18 or later
- npm (included with Node.js)
- A C++ build toolchain for the SQLite native addon:
  - **Windows** — [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (select "Desktop development with C++" workload), or run `npm install --global windows-build-tools` from an admin terminal
  - **Mac** — Xcode Command Line Tools: run `xcode-select --install` in Terminal
  - **Linux** — `sudo apt install build-essential python3` (Debian/Ubuntu) or equivalent

If `npm install` fails with an error about `node_sqlite3.node`, the build toolchain is missing.

## Setup

```bash
cd backend
npm install
npm start
```

Then open **http://localhost:3001** in your browser.

The database (`game.db`) is created automatically on first run.

## Project Structure

```
backend/          Node.js/Express server + combat engine
  server.js       Entry point
  combatEngine.js Combat simulation
  StatusEngine.js Status effect processing
  database.js     SQLite schema and queries
  routes/         API route handlers
  data/           JSON game data files

js/               Frontend JavaScript
css/              Styles
index.html        Single-page frontend
```

## Notes

- The backend serves the frontend as static files — there is no separate frontend build step.
- All API calls use relative URLs, so the app works on any host without configuration.
- The `data/` directory contains all game content (skills, enemies, challenges, items). Editing these JSON files changes game behaviour without touching engine code.
- Do not commit `backend/data/game.db` — each install generates its own database on first run.
