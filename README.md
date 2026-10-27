# DailyLevelUp

A local-first daily task planner. Organize tasks as a node graph of nested categories, plan which long-term tasks count today, and watch your progress, streaks and XP build up.

Your data stays on your own machine, in a plain JSON file. No account, no cloud.

## Features

- **Three views of the same tasks:** a horizontal node tree, an indented outline table, and a flat sortable list.
- **Nested categories** to any depth. Click a name to edit it (title, link, deadline, notes, difficulty), drag a row onto another to move it.
- **Daily and long-term tasks.** Daily tasks count every day. Long-term tasks sit in a backlog until you plan them for today (the **Today** chip, or **Plan day**), and unfinished ones carry over.
- **Progress:** a bar per top-level category (click for the breakdown), a monthly calendar of completion rings (click a day to see what you finished), and bonus credit for finishing unplanned tasks.
- **Stats:** streaks, 7 and 30 day trends, per-category averages and daily-task completion (the chart button, top right).
- **Level and XP** that grow as you finish tasks.
- **Deadline heat:** tasks get a growing 🔥 and glow as the date nears.
- **Undo** for deletes and moves (Ctrl/Cmd+Z), light and dark mode.

## Quick start

You need [Node.js](https://nodejs.org) 18.18 or newer.

```bash
git clone <your-repo-url>
cd DailyLevelUp
npm install
npm run dev
```

Open <http://localhost:3000>.

For everyday use, a production build is faster and lighter:

```bash
npm run build
npm start
```

The fonts (Montserrat, IBM Plex Sans, Righteous) are downloaded from Google Fonts the first time you run or build, so you need an internet connection for that first run.

## Where your data lives

Everything is saved to **`data/state.json`** in the project folder, written a moment after each change. A copy of the previous version is kept once a day in `data/backups/` (the last 14 are kept), and if the main file is ever corrupted the newest backup is restored automatically.

- The `data/` folder is git-ignored, so your tasks are never committed.
- To back up or move your data, copy `data/state.json`.
- To keep the data somewhere else (a synced folder, for example), set `DATA_DIR`:

  ```bash
  DATA_DIR=~/Documents/DailyLevelUpData npm run dev
  ```

- Your browser also keeps a cached copy and falls back to it if the server can't be reached. The header shows **Saved ✓**, **Saving…** or **Offline**.

There is **no login**. Anyone who can reach the app can read and change your tasks, so don't expose it to the public internet as it is. The server also needs a disk that persists, so serverless hosts such as Vercel won't keep your data.

If you open it on two devices at once, the most recent save wins: a device that tries to save over newer data loads the newer data instead.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run typecheck` | TypeScript check |

## How the score works

- **Daily tasks** count every day and come back unchecked.
- **Long-term tasks** count only once you plan them for a day. Until you finish them they stay counted, so missing a day carries them over instead of counting as a miss.
- **Backlog tasks** are dimmed and don't affect today's percentage. Finishing one anyway earns **bonus**.
- A task's difficulty (1–3 stars) is its weight, so a 3-star task is worth three times a 1-star one.
- A deleted task stops counting for that day, whether or not it was checked.

## Troubleshooting

- **`dyld: Library not loaded … libicui18n`** when running `node` or `npm` (Homebrew on macOS): Node and its ICU library are out of step. Run `brew reinstall node`.
- **Port 3000 is busy:** `npm run dev -- -p 3001`.
- **Start fresh:** stop the app and delete the `data/` folder (and clear the site's data in your browser, since it keeps a cached copy).

## Tech

[Next.js](https://nextjs.org) (App Router), React and TypeScript. The only backend is one API route (`app/api/state/route.ts`) that reads and writes the JSON file.

## License

Add a license of your choice before sharing (for example MIT) and note it here.
