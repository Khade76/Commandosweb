# 44th Commando Regiment — WARDOGS Website

React website for the 44th Commando Regiment WARDOGS community, with live WARDOGS server status, Discord bots and persistent player statistics.

## Stack

- React + Vite
- PHP 8.x production status API for OVH shared hosting
- Optional Node.js/Express backend for local/VPS deployments
- Discord.js status bots
- VPS player-stat collector/API backed by a persistent JSON store

## Included

- Live WARDOGS server name, map, mode, players and faction scores
- Server #1 and Server #2 Discord presence bots
- `/status` slash command on each Discord bot
- Persistent WARDOGS player stat collection from `/v1/players`
- Public `/stats` website page with search/sorting
- PHP proxy so the OVH website can read the VPS stats service without exposing RCON passwords

## Development

```bash
npm install
npm run dev
```

The development site runs on port `5173`.

## OVH shared hosting deployment

The production website does not require Node.js on OVH. Build it on your PC:

```powershell
git pull
npm install
npm run build
```

Upload the contents of `dist/` into `/www` using FileZilla. Keep `wardogs-secrets.php` one level above `/www`.

The production build contains both PHP endpoints:

```text
dist/api/servers.php
dist/api/player-stats.php
```

`servers.php` talks directly to WARDOGS RCON for live server status. `player-stats.php` optionally proxies the public stats API running on the VPS.

### Private OVH config

Copy `ovh/wardogs-secrets.example.php` to `wardogs-secrets.php`, add the real RCON passwords, and upload it above `/www`.

Confirmed WARDOGS RCON endpoints:

```text
Server #1: http://165.217.136.52:9001
Server #2: http://165.217.136.99:9006
```

After the VPS stats service is online, also set:

```php
'stats_api_url' => 'http://YOUR_VPS_IP:3100',
```

or preferably point it at an HTTPS hostname/reverse proxy for the VPS later.

## VPS deployment

The VPS can run the two Discord bots and the player stats service together from one Node process.

Recommended Node version: **20.19+**.

```bash
git clone https://github.com/Khade76/Commandosweb.git
cd Commandosweb
npm install
cp .env.example .env
```

Edit `.env` and configure:

```env
# Full-access WARDOGS RCON bearer tokens
WARDOGS_RCON_SERVER_1_URL=http://165.217.136.52:9001
WARDOGS_RCON_SERVER_1_PASSWORD=your-server-1-rcon-password
WARDOGS_RCON_SERVER_2_URL=http://165.217.136.99:9006
WARDOGS_RCON_SERVER_2_PASSWORD=your-server-2-rcon-password

# Discord bots
DISCORD_WARDOGS_SERVER_1_BOT_TOKEN=your-server-1-discord-token
DISCORD_WARDOGS_SERVER_1_IDENTIFIER=278c7bc5
DISCORD_WARDOGS_SERVER_2_BOT_TOKEN=your-server-2-discord-token
DISCORD_WARDOGS_SERVER_2_IDENTIFIER=9290beb1

# Use the 44th guild ID while testing so /status appears immediately.
DISCORD_GUILD_ID=your-discord-guild-id

# Bots read the public website server endpoint
DISCORD_STATUS_API_URL=https://YOUR-WEBSITE/api/servers.php
DISCORD_STATUS_REFRESH_MS=30000

# Player stats service
WARDOGS_STATS_HOST=0.0.0.0
WARDOGS_STATS_PORT=3100
WARDOGS_STATS_POLL_MS=60000
WARDOGS_STATS_FILE=./runtime/wardogs-player-stats.json
WARDOGS_STATS_ALLOWED_ORIGIN=*
```

Start everything together:

```bash
npm run start:vps
```

Individual processes are also available:

```bash
npm run start:bots
npm run start:stats
```

For production, run `npm run start:vps` under systemd or PM2 so it restarts after a crash/reboot.

## Discord bots

Each Discord bot is tied to one WARDOGS server.

Presence examples:

```text
Server #1: Online • 99/100 players
Server #2: Online • 1/100 players
```

### `/status`

Both bots register one slash command:

```text
/status
```

The command displays the bot's assigned server with:

- Online/starting/offline state
- Current/max players
- Map
- Mode
- Valkyra score
- Lonestar score
- Manticore score
- Lighting when available

If `DISCORD_GUILD_ID` is configured, the command is registered directly in that guild for immediate testing. If it is blank, the command is registered globally instead.

No privileged Discord Gateway intents are required.

## Persistent player statistics

The VPS collector polls both servers every 60 seconds by default using:

```text
GET /v1/status
GET /v1/players
```

The persistent file defaults to:

```text
./runtime/wardogs-player-stats.json
```

`runtime/` is gitignored.

For each player the service keeps public-safe aggregate information including:

- Current/last player name
- Previous aliases
- First seen / last seen
- Online state and current server
- Current faction, ping and cash
- Recorded kills and deaths
- K/D ratio
- Matches seen
- Tracked play time
- Peak kills observed in a match
- Peak cash observed
- Faction/server observation counts

Kill/death totals are derived from successive RCON snapshots. If the match marker changes or the live counters reset, the collector treats that as a new match and starts accumulating from the new counters.

### VPS stats API

The player-stat service listens on port `3100` by default:

```text
GET /health
GET /api/stats/summary
GET /api/stats/players
GET /api/stats/players/:id
```

Examples:

```text
/api/stats/players?sort=kills&limit=100
/api/stats/players?sort=kd&search=playername
```

The public OVH website does not need direct RCON access for player stats. `/api/player-stats.php` proxies these public-safe results from the VPS.

## Website Stats page

The React route is:

```text
/stats
```

It displays:

- Tracked players
- Players currently online
- Total kills recorded
- Total tracked hours
- Searchable/sortable player table
- Kills, deaths, K/D, matches, tracked time and last seen

Until `stats_api_url` is set in `wardogs-secrets.php`, the page shows a configuration/unavailable message rather than failing the website.

## Existing server APIs

OVH shared hosting:

```text
GET /api/servers.php
GET /api/player-stats.php
```

Optional Node backend:

```text
GET /api/health
GET /api/servers
```

## Useful scripts

```bash
npm run dev
npm run build
npm run start
npm run start:bots
npm run start:stats
npm run start:vps
npm run test:rcon
npm run test:bisect
```

## Website routes

- `/`
- `/about`
- `/companies`
- `/companies/vanguard`
- `/companies/spectre`
- `/companies/spartan`
- `/servers`
- `/stats`
- `/enlist`
- `/rules`
- `/wardogs`
- `/donate`

The WARDOGS game link points to the official Steam page. This community website is not affiliated with BULKHEAD or Team17.
