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
- `/api/servers` endpoint with placeholder WARDOGS server data ready for future live integration
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

The production server uses `PORT` when supplied, otherwise port `3000`.

### Apache static hosting

Upload the contents of `dist/`, including the hidden `.htaccess` file, to the website document root. `public/.htaccess` is copied into the build and routes direct page requests such as `/about`, `/rules`, and `/companies/vanguard` to React's `index.html`. Existing files and directories are served normally; API URLs are not rewritten.

Apache must enable `mod_rewrite` and permit these directives through `AllowOverride FileInfo` (or the equivalent hosting setting). If direct page links still return an Apache 404, confirm that `.htaccess` was uploaded next to `index.html` and that the host allows rewrite overrides. Static Apache hosting does not run the optional Express API.

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

Future server list placeholder:

```text
GET /api/servers
```

The server endpoint can later be replaced with real WARDOGS server status data.

The WARDOGS game link points to the official Steam page. This community website is not affiliated with BULKHEAD or Team17.
