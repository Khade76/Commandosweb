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
- MariaDB for persistent player statistics

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
        ├── stats-source.php
        └── player-stats.php
```

`servers.php` and the protected `stats-source.php` use the same server definitions in `wardogs-secrets.php`. This means Server #3 does not need a second copy of its Qonzer HTTP RCON URL/password on the VPS.

The `stats-source.php` endpoint requires a private Bearer token configured as:

```php
'stats_source_token' => 'LONG_RANDOM_SECRET',
```

Each server can explicitly declare its statistics pool:

```php
'statsGroup' => 'normal',
```

or:

```php
'statsGroup' => 'hardcore',
```

Servers #1 and #2 should be `normal`; Server #3 should be `hardcore`.

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

The stats page keeps the two rule sets separate:

```text
Normal   = Servers #1 + #2 combined
Hardcore = Server #3 only
```

A Steam ID has one player identity and alias history, but independent Normal and Hardcore totals for kills, deaths, K/D, matches and tracked time.

### MariaDB schema

The complete schema is in:

```text
database/schema.sql
```

Create an empty database/user, select that database, then import `database/schema.sql`. The schema contains:

- players and aliases
- Normal/Hardcore group totals
- per-server totals
- faction totals
- latest player snapshots used for delta calculation
- current online state
- tables reserved for durable match history / recent matches

### Stats collector flow

The VPS no longer needs copies of the individual WARDOGS RCON passwords.

```text
wardogs-secrets.php on OVH
        ↓
/api/stats-source.php (Bearer token protected)
        ↓
Node stats collector on VPS
        ↓
MariaDB
        ↓
Stats API on VPS
        ↓
/api/player-stats.php on OVH
        ↓
/stats
```

The collector reads `/v1/status` and `/v1/players` through the protected OVH source endpoint, calculates kill/death/playtime deltas, and writes the persistent totals to MariaDB. It does not store a new full database row every poll.

Start the collector on the VPS with:

```bash
npm install
npm run start:stats
```

Relevant `.env` settings:

```env
WARDOGS_STATS_HOST=0.0.0.0
WARDOGS_STATS_PORT=3100
WARDOGS_STATS_POLL_MS=60000
WARDOGS_STATS_ALLOWED_ORIGIN=*

WARDOGS_STATS_SOURCE_URL=https://YOUR-DOMAIN/api/stats-source.php
WARDOGS_STATS_SOURCE_TOKEN=LONG_RANDOM_SECRET

WARDOGS_DB_HOST=
WARDOGS_DB_PORT=3306
WARDOGS_DB_NAME=wardogs_stats
WARDOGS_DB_USER=
WARDOGS_DB_PASSWORD=
WARDOGS_DB_CONNECTION_LIMIT=10
WARDOGS_DB_SSL=false
WARDOGS_DB_SSL_REJECT_UNAUTHORIZED=true
```

The stats service exposes:

```text
GET /health
GET /api/stats/summary?group=normal|hardcore
GET /api/stats/players?group=normal|hardcore
GET /api/stats/players/:id?group=normal|hardcore
```

Statistics begin accumulating when the collector is started. Kill/death totals are derived from successive live RCON player snapshots and match resets; they represent activity observed on the 44th servers rather than global WARDOGS lifetime statistics.

To connect the OVH `/stats` page to the VPS collector, set the public/reachable stats service URL in the private `wardogs-secrets.php` file:

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

The `WARDOGS_RCON_SERVER_*` `.env` values are retained only for this optional Node/local backend and RCON diagnostics. The production OVH website uses `wardogs-secrets.php`.

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

That repo contains the three Node.js bot accounts, Discord presence updates, `/status`, `.env` configuration and AMP Node.js App Runner instructions.

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
