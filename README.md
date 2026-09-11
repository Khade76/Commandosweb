# 44th Commando Regiment — WARDOGS Website

React website for the 44th Commando Regiment WARDOGS community, with live WARDOGS server status and Discord integrations.

## Stack

- React
- Vite
- PHP 8.x production status API for OVH shared hosting
- Optional Node.js/Express backend for local/VPS deployments
- Discord.js status bots
- Local lightweight router aliased as `react-router-dom`

## Included

- Full-screen 44th/WARDOGS recruitment homepage
- Separate routed pages for Home, About, Companies, each company, Our Servers, Enlist, WARDOGS and Donate
- Local assets in `public/assets`
- Ko-fi Donate link: `https://ko-fi.com/44thwardogs`
- Discord invite: `https://discord.gg/44thwardogs`
- Live WARDOGS server name, map, mode, players and faction scores
- WARDOGS join IDs for Server #1 and Server #2
- PHP server-status endpoint for FileZilla-only OVH hosting
- Optional Express `/api/servers` endpoint for Node deployments/local testing
- Two lightweight Discord presence bots for WARDOGS Server #1 and Server #2
- Visible HTML loading fallback and React error boundary

## Development

Install dependencies on your PC:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

The development site runs on port `5173` by default. During development the Servers page uses the Node endpoint at `/api/servers` unless `VITE_SERVERS_API_URL` is supplied.

## OVH shared hosting deployment (FileZilla only)

The production website does **not** require Node.js, SSH, PM2, systemd or command-line access on OVH.

The React site is built on your PC. Vite copies `public/api/servers.php` into `dist/api/servers.php`, and OVH executes that PHP file whenever the public Servers page asks for live status.

### 1. Create the private RCON config

Copy:

```text
ovh/wardogs-secrets.example.php
```

to a new local file named:

```text
wardogs-secrets.php
```

Put the two real RCON passwords into that file. The server URLs and join IDs are already populated:

```php
'url' => 'http://165.217.136.52:9001', // Server #1
'joinId' => '175590',

'url' => 'http://165.217.136.99:9006', // Server #2
'joinId' => '294832',
```

`wardogs-secrets.php` is gitignored and must never be committed.

### 2. Build the website on your PC

From the repository folder:

```powershell
git pull
npm install
npm run build
```

The upload-ready website is created in:

```text
dist/
```

The build automatically contains:

```text
dist/
├── index.html
├── .htaccess
├── assets/
└── api/
    └── servers.php
```

### 3. Upload with FileZilla

Your OVH FTP layout should end up like this:

```text
/
├── wardogs-secrets.php        <- private, outside the website folder
└── www/
    ├── index.html
    ├── .htaccess
    ├── assets/
    └── api/
        └── servers.php
```

Upload **the contents of `dist/`** into `/www`.

Upload `wardogs-secrets.php` one level above `/www`. Do **not** place the secret file inside `/www`, `/www/api`, `public`, or `dist`.

In FileZilla, make sure hidden files are shown so `.htaccess` is uploaded.

### 4. Test the PHP API

Open this in a browser using the live website domain:

```text
https://YOUR-DOMAIN/api/servers.php
```

A working setup returns JSON containing both WARDOGS servers, for example:

```json
{
  "servers": [
    {
      "name": "44th Commandos #1 | New Player Friendly | discord.gg/44thwardogs",
      "status": "Online",
      "players": "99 / 100",
      "map": "Bakurani",
      "mode": "KOTH",
      "scores": {
        "valkyra": 46,
        "lonestar": 7,
        "manticore": 3
      }
    }
  ]
}
```

If the private config is missing, the endpoint returns a `503` JSON message telling you to upload `wardogs-secrets.php` above `/www`.

### PHP API behaviour

The OVH PHP endpoint:

- calls `GET /v1/status` on both confirmed Bisect WARDOGS RCON endpoints
- sends the RCON password only from PHP on the server; the browser never receives it
- maps the current server name, players, maximum players, map and mode
- maps Valkyra, Lonestar and Manticore scores
- keeps the existing WARDOGS Join IDs
- caches successful RCON status for 15 seconds in the PHP temporary directory
- uses the last cached status if RCON briefly becomes unavailable
- returns a safe unavailable state if no cached result exists

The public React Servers page refreshes the endpoint every 30 seconds while the page is open.

## WARDOGS RCON endpoints

Confirmed Bisect endpoints:

```text
Server #1: http://165.217.136.52:9001
Server #2: http://165.217.136.99:9006
```

Both use bearer-token authentication and `GET /v1/status` returns live WARDOGS match state including server name, map, experience, players and faction scores.

The RCON password is a full-access bearer token. Keep it only in `wardogs-secrets.php` on OVH or in `.env` for Node/local testing.

## Optional Node.js backend

The existing Node/Express backend remains available for local testing or a future VPS/Node host:

```bash
npm run build
npm start
```

Node loads `.env` automatically and exposes:

```text
GET /api/health
GET /api/servers
```

Typical Node RCON settings:

```env
WARDOGS_RCON_SERVER_1_URL=http://165.217.136.52:9001
WARDOGS_RCON_SERVER_1_PASSWORD=your-rcon-password
WARDOGS_RCON_SERVER_2_URL=http://165.217.136.99:9006
WARDOGS_RCON_SERVER_2_PASSWORD=your-rcon-password
```

You can test Node RCON locally with:

```bash
npm run test:rcon
```

## BisectHosting Starbase integration

The Node backend also supports BisectHosting as an infrastructure/fallback provider:

```env
BISECT_API_KEY=your-starbase-api-key
BISECT_PANEL_HOST=https://games.bisecthosting.com
BISECT_SERVER_IDS=278c7bc5,9290beb1
WARDOGS_SERVER_REGION=Europe / UK
WARDOGS_MAX_PLAYERS=100
```

This is optional for the FileZilla/PHP website deployment because the PHP production endpoint reads the live game status directly from WARDOGS RCON.

## Discord server status bots

The two Discord status bots still require a long-running Node process somewhere. They are separate from the website and cannot run from ordinary FileZilla-only OVH shared hosting.

Typical presence:

```text
Server #1 bot: Online • 99/100 players
Server #2 bot: Online • 1/100 players
```

Configuration:

```env
DISCORD_WARDOGS_SERVER_1_BOT_TOKEN=your-server-1-bot-token
DISCORD_WARDOGS_SERVER_1_IDENTIFIER=278c7bc5
DISCORD_WARDOGS_SERVER_2_BOT_TOKEN=your-server-2-bot-token
DISCORD_WARDOGS_SERVER_2_IDENTIFIER=9290beb1
DISCORD_STATUS_API_URL=
DISCORD_STATUS_REFRESH_MS=30000
```

Start them on a machine/VPS that can run Node continuously:

```bash
npm run start:bots
```

## Apache routing

`public/.htaccess` is copied automatically into `dist/`. It sends direct React routes such as `/about`, `/rules`, and `/companies/vanguard` to `index.html`, while leaving real files/directories such as `/api/servers.php` untouched.

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
- `/wardogs`
- `/donate`

The WARDOGS game link points to the official Steam page. This community website is not affiliated with BULKHEAD or Team17.
