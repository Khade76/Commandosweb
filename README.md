# 44th Commando Regiment — WARDOGS Website

React website for the 44th Commando Regiment WARDOGS community, with live WARDOGS server status and persistent player statistics.

## Repositories

Website and WARCON integration files:

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
- WARCON + Postgres/TimescaleDB as the target player-stat source
- MariaDB retained temporarily as a cutover fallback
- Optional Node.js/Express backend for local development only

## Production OVH layout

Keep the real `wardogs-secrets.php` one level above `/www` so RCON and stats-source credentials are never web-accessible.

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

Production configuration is stored in the private `wardogs-secrets.php`. `.env` is not used by the live OVH website.

The same private file contains all three WARDOGS RCON connections used by the live `/servers` page.

## Live server page

`/servers` calls `/api/servers.php`, which reads the server connections directly from `wardogs-secrets.php`.

## Player stats — WARCON

WARCON is the target single source of truth for player search/statistics:

```text
WARDOGS #1 ─┐
WARDOGS #2 ─┼──► WARCON ─► Postgres / TimescaleDB
WARDOGS #3 ─┘                    │
                                 │ read-only API key
                                 ▼
                              OVH PHP
                                 │
                                 ▼
                    /api/player-stats.php
                                 │
                                 ▼
                              /stats
```

Normal and Hardcore remain separate:

```text
Normal   = WARCON Servers #1 + #2 combined
Hardcore = WARCON Server #3 only
```

WARCON already stores player sessions, names, factions, join/leave times, matches and online state. The 44th integration adds a read-only, API-key-protected endpoint for lifetime player search and combined server-group totals.

The integration is under:

```text
integrations/warcon/
```

See:

```text
integrations/warcon/README.md
```

for the deployment commands, WARCON server-ID lookup, API-key configuration and tests.

### OVH WARCON configuration

After the WARCON endpoint has been deployed and tested, configure the private `wardogs-secrets.php`:

```php
'stats_source' => 'warcon',

'warcon' => [
    'url' => 'https://YOUR-WARCON-ORIGIN',
    'stats_api_key' => 'THE_SAME_RANDOM_KEY_SET_IN_WARCON',
],
```

The browser never receives the WARCON API key. OVH sends it server-to-server.

### WARCON configuration

WARCON receives:

```env
PUBLIC_STATS_API_KEY=LONG_RANDOM_SECRET
PUBLIC_STATS_NORMAL_SERVERS=SERVER_1_ID,SERVER_2_ID
PUBLIC_STATS_HARDCORE_SERVERS=SERVER_3_ID
```

The integration also adjusts WARCON session tracking so kills/deaths accumulate across WARDOGS match counter resets while a player remains connected. No WARCON database migration is required.

## Temporary MariaDB fallback

During the cutover, `public/api/player-stats.php` can continue using the already-configured MariaDB collector when:

```php
'stats_source' => 'mariadb',
```

The existing `database/schema.sql`, `stats-db.php`, `collect-stats.php` and health tooling are retained only until WARCON is confirmed live. Once WARCON has been tested through the public website, they can be removed in a cleanup change.

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
