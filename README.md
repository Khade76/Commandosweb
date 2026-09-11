# 44th Commando Regiment — WARDOGS Website

React + Node.js website for the 44th Commando Regiment WARDOGS community.

## Stack

- React
- Vite
- Node.js 20+
- Express
- Local lightweight router aliased as `react-router-dom`

## Included

- Full-screen 44th/WARDOGS recruitment homepage
- Separate routed pages for Home, About, Companies, each company, Our Servers, Enlist, WARDOGS and Donate
- Local assets in `public/assets` so the site is not dependent on Google Drive hotlinks
- Ko-fi Donate link: `https://ko-fi.com/44thwardogs`
- Discord invite: `https://discord.gg/44thwardogs`
- Express production server
- `/api/health` endpoint
- `/api/servers` endpoint with BisectHosting infrastructure data and optional direct WARDOGS RCON match data
- Live server state, players, map, mode, match timer and faction scores when RCON is configured
- Visible HTML loading fallback and React error boundary so the site should not silently black-screen

## Development

Install dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

The development site runs on port `5173` by default.

If you previously installed dependencies before the router changes, run this once to clear stale installs:

```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

On Windows PowerShell:

```powershell
Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue
npm install
npm run dev
```

## Production

Build the React frontend:

```bash
npm run build
```

Start the Node.js/Express server:

```bash
npm start
```

The production server uses `PORT` when supplied, otherwise port `3000`. The backend automatically loads a local `.env` file when present.

### BisectHosting Starbase integration

Copy `.env.example` to `.env` on the OVH backend and set the API key there. The two known Bisect server identifiers are already included in `.env.example`:

```env
BISECT_API_KEY=your-starbase-api-key
BISECT_PANEL_HOST=https://games.bisecthosting.com
BISECT_SERVER_IDS=278c7bc5,9290beb1
WARDOGS_SERVER_REGION=Europe / UK
WARDOGS_MAX_PLAYERS=100
```

`BISECT_API_KEY` must never be added to React/Vite variables or committed to GitHub. The browser calls the 44th Node backend, and only the backend talks to Starbase.

The backend accepts the short Starbase server identifiers shown in the panel. It refreshes live results at most once every 15 seconds. If Starbase is unavailable, the public endpoint returns a safe fallback rather than exposing API errors or secrets.

To test the Bisect connection directly from OVH without exposing the API key, run:

```bash
npm run test:bisect
```

The diagnostic checks server details, resources, online players, and startup metadata for both configured servers. Sensitive fields such as passwords, tokens, credentials, and API keys are redacted. It also prints RCON/API-related startup variables such as the assigned internal/API port when Bisect exposes them.

### WARDOGS RCON live match integration

The backend can query the WARDOGS `/v1/status` API directly and use it as the primary source for live match information. Bisect remains the infrastructure/fallback source.

The confirmed Bisect WARDOGS RCON endpoints are exposed over plain HTTP:

```env
WARDOGS_RCON_SERVER_1_URL=http://165.217.136.52:9001
WARDOGS_RCON_SERVER_1_PASSWORD=your-rcon-password

WARDOGS_RCON_SERVER_2_URL=http://165.217.136.99:9006
WARDOGS_RCON_SERVER_2_PASSWORD=your-rcon-password
```

The RCON password is a full-access bearer token, not a read-only key, so it must never be sent to the browser or committed to GitHub. Keep the RCON calls server-side on the OVH Node backend only.

When RCON is available, `/api/servers` prefers its live values for:

- server name
- online state
- current/max players
- current map
- current experience/mode
- match elapsed seconds
- lighting
- score cap/tick data
- Valkyra/Lonestar/Manticore faction scores when the server includes numeric score fields

Test the RCON connection from OVH with:

```bash
npm run test:rcon
```

That command checks DNS/TCP, fingerprints the `/v1/status` endpoint, authenticates using the configured RCON password, then calls `/v1/status` and `/v1/capabilities`. It never prints the RCON passwords.

### Apache static hosting

Upload the contents of `dist/`, including the hidden `.htaccess` file, to the website document root. `public/.htaccess` is copied into the build and routes direct page requests such as `/about`, `/rules`, and `/companies/vanguard` to React's `index.html`. Existing files and directories are served normally; API URLs are not rewritten.

Apache must enable `mod_rewrite` and permit these directives through `AllowOverride FileInfo` (or the equivalent hosting setting). If direct page links still return an Apache 404, confirm that `.htaccess` was uploaded next to `index.html` and that the host allows rewrite overrides. Static Apache hosting does not run the Express API, so live server data requires the Node backend to be running on OVH and `/api/*` to be routed to it.

Example:

```bash
PORT=8080 npm start
```

## Routes

- `/`
- `/about`
- `/companies`
- `/companies/vanguard`
- `/companies/spectre`
- `/companies/spartan`
- `/servers`
- `/enlist`
- `/rules`
- `/wardogs` (legacy alias for Rules)
- `/donate` (legacy redirect to Ko-fi; navigation links open Ko-fi directly)

## API

Rules content lives in `src/data/rules.js`. Add a category with a stable `id`, `title`, `description`, and a `rules` array of `{ title, text }` entries. Empty categories display “Not published”; only add game or event rules once agreed. The layout uses the expandable categories on https://www.44thsquad.com/rules as a reference, with community wording adapted for this site.

Health check:

```text
GET /api/health
```

Live server directory:

```text
GET /api/servers
```

The public server endpoint returns public-safe data only. Bisect API keys and WARDOGS RCON passwords are never returned to the browser.

The WARDOGS game link points to the official Steam page. This community website is not affiliated with BULKHEAD or Team17.
