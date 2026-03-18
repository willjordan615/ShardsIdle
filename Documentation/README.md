# Shards Idle

A browser-based idle RPG. Characters fight autonomously through challenges using AI-driven skill selection.

## Setup

### Requirements
- Node.js (v18 or later)

### Install & Run

```bash
cd backend
npm install
npm start
```

Then open **http://localhost:3001** in your browser.

The database (`game.db`) is created automatically on first run. Do not commit it.

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
