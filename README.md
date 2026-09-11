# 44th Commando Regiment — WARDOGS Website

React website for the 44th Commando Regiment WARDOGS community, with live WARDOGS server status and persistent player statistics.

## Repositories

Website and player statistics:

```text
https://github.com/Khade76/Commandosweb
```

Discord bots are maintained separately:

```text
https://github.com/Khade76/44th-wardogs-discord-bots
```

AMP is used only for the Discord bots. It is not part of the website/player-stats path.

## Stack

- React
- Vite
- PHP 8.x on OVH shared hosting
- MariaDB on the external database host
- Optional Node.js/Express backend for local development only

## Production OVH layout

Keep the real `wardogs-secrets.php` one level above `/www` so RCON and database credentials are never web-accessible.

```text
/
├── wardogs-secrets.php
└── www/
    ├── index.html
    ├── .htaccess
    ├── assets/
    └── api/
        ├── servers.php
        ├── stats-db.php
        ├── collect-stats.php
        └── player-stats.php
```

Production configuration is stored in the private `wardogs-secrets.php`. `.env` is not used by the live OVH website.

Example database section:

```php
'database' => [
    'host' => 'DB_HOST',
    'port' => 3306,
    'name' => 'DB_NAME',
    'user' => 'DB_USER',
    'password' => 'DB_PASSWORD',
    'charset' => 'utf8mb4',
    'ssl_ca' => '',
],

'stats_poll_seconds' => 60,
'stats_collect_token' => 'LONG_RANDOM_SECRET',
```

The same private file contains all three WARDOGS RCON connections. Each server should have a stats pool:

```php
'statsGroup' => 'normal',
```

or:

```php
'statsGroup' => 'hardcore',
```

Server #1 and #2 are `normal`; Server #3 is `hardcore`.

## Live server page

`/servers` calls `/api/servers.php`, which reads the server connections directly from `wardogs-secrets.php`.

## Player stats

The stats architecture is entirely server-side on OVH plus the external MariaDB host:

```text
WARDOGS RCON Servers #1 / #2 / #3
              ↓
          OVH PHP
              ↓
       External MariaDB
              ↓
   /api/player-stats.php
              ↓
           /stats
```

There is no VPS/AMP/Node stats collector.

The pools remain separate:

```text
Normal   = Servers #1 + #2 combined
Hardcore = Server #3 only
```

A Steam ID has one identity/alias history with independent Normal and Hardcore totals.

### MariaDB schema

Import:

```text
database/schema.sql
```

The schema stores:

- players and aliases
- Normal/Hardcore totals
- per-server totals
- faction totals
- latest snapshots used to calculate deltas
- live/online state
- tables reserved for future match history

### Collection

`/api/collect-stats.php` polls `/v1/status` and `/v1/players` for all configured WARDOGS servers and writes deltas directly to MariaDB.

It is protected by `stats_collect_token`. A scheduled HTTP call can use:

```text
Authorization: Bearer YOUR_TOKEN
```

or, where a scheduler cannot set headers:

```text
/api/collect-stats.php?token=YOUR_TOKEN
```

For reliable 24/7 statistics, schedule that endpoint at the same cadence as `stats_poll_seconds` (normally 60 seconds). `/api/player-stats.php` also performs a stale-data collection attempt as a fallback when someone opens the stats page.

## Website development

```bash
npm install
npm run dev
```

Build for OVH:

```bash
npm run build
```

Upload the contents of `dist/` to `/www`.

The optional `.env` file is only for the local Node development backend and RCON diagnostics. It is not part of the production website configuration.

## Discord bots

The three Discord bots, status presence and `/status` command remain in:

```text
https://github.com/Khade76/44th-wardogs-discord-bots
```

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
