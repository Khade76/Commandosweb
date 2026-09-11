# 44th Commando Regiment — WARDOGS Website

React website for the 44th Commando Regiment WARDOGS community, with live WARDOGS server status and persistent player statistics.

## Repositories

Website, OVH PHP API and player-stat tracking:

```text
https://github.com/Khade76/Commandosweb
```

Discord status bots have moved to their own standalone repository:

```text
https://github.com/Khade76/44th-wardogs-discord-bots
```

The website repo no longer contains or starts the Discord bots.

## Stack

- React
- Vite
- PHP 8.x for production status/proxy endpoints on OVH shared hosting
- Optional Node.js/Express backend for local/VPS testing
- Node.js WARDOGS player-stat collector/API

## Website development

```bash
npm install
npm run dev
```

Build for OVH:

```bash
npm run build
```

Upload the contents of `dist/` to the OVH `/www` directory with FileZilla.

## OVH shared hosting

Production server status is provided by:

```text
/api/servers.php
```

Keep the private file:

```text
wardogs-secrets.php
```

one level above `/www` so the RCON passwords are never publicly accessible.

Example FTP layout:

```text
/
├── wardogs-secrets.php
└── www/
    ├── index.html
    ├── .htaccess
    ├── assets/
    └── api/
        ├── servers.php
        └── player-stats.php
```

The confirmed WARDOGS RCON endpoints are:

```text
Server #1: http://165.217.136.52:9001
Server #2: http://165.217.136.99:9006
```

The RCON bearer tokens must remain server-side only.

## Live server page

`/servers` displays live WARDOGS information including:

- online/starting/offline status
- current/max players
- current map
- mode
- Valkyra score
- Lonestar score
- Manticore score
- WARDOGS join action

The production React build calls `/api/servers.php` and refreshes while the page is open.

## Player stats

The website includes:

```text
/stats
```

Persistent stats are collected by the Node.js service in:

```text
server/stats/
```

It polls WARDOGS RCON `/v1/status` and `/v1/players`, persists observations to disk, and exposes a small HTTP API for the OVH PHP proxy.

Start it on a VPS with:

```bash
npm run start:stats
```

Relevant `.env` settings:

```env
WARDOGS_RCON_SERVER_1_URL=http://165.217.136.52:9001
WARDOGS_RCON_SERVER_1_PASSWORD=
WARDOGS_RCON_SERVER_2_URL=http://165.217.136.99:9006
WARDOGS_RCON_SERVER_2_PASSWORD=

WARDOGS_STATS_HOST=0.0.0.0
WARDOGS_STATS_PORT=3100
WARDOGS_STATS_POLL_MS=60000
WARDOGS_STATS_FILE=./runtime/wardogs-player-stats.json
WARDOGS_STATS_ALLOWED_ORIGIN=*
```

The stats service exposes:

```text
GET /health
GET /api/stats/summary
GET /api/stats/players
GET /api/stats/players/:id
```

Statistics begin accumulating when the collector is started. Kill/death totals are derived from successive live RCON player snapshots and match resets; they represent activity observed on the 44th servers rather than global WARDOGS lifetime statistics.

To connect the OVH `/stats` page to the VPS collector, add the public/reachable stats service URL to the private `wardogs-secrets.php` file:

```php
'stats_api_url' => 'http://YOUR-VPS-IP:3100',
```

The browser calls `/api/player-stats.php`; OVH then proxies the safe public stats data from the VPS.

## Optional Node backend

For local testing or a full Node deployment:

```bash
npm start
```

It exposes:

```text
GET /api/health
GET /api/servers
```

RCON diagnostics:

```bash
npm run test:rcon
```

Bisect diagnostics:

```bash
npm run test:bisect
```

## Discord bots

The Discord bots are intentionally maintained separately from this website repo:

```text
https://github.com/Khade76/44th-wardogs-discord-bots
```

That repo contains the two Node.js bot accounts, Discord presence updates, `/status`, `.env` configuration and AMP Node.js App Runner instructions.

## Routes

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
