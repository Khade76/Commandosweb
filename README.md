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

The same private file contains all four WARDOGS RCON connections used by the live `/servers` page.

## Live server page

`/servers` calls `/api/servers.php`, which reads the server connections directly from `wardogs-secrets.php`.

Each server publishes a persistent WARDOGS join code. Set `joinCode` on each
entry in the private `wardogs-secrets.php`; `joinId` remains accepted during
the transition. Invalid or legacy numeric values fall back to the current
four persistent codes shipped with the site.

### Add XRealm Server #4

Server #4 is `44th Commandos #4 | Hardcore | discord.gg/44thwardogs`. Its website and Discord lookup key is `wardogs-12577`, based on XRealm ID `12577`, and its persistent join code is `7f15ef51-2673-4eab-b3c8-d8176a3b41e4`.

Append the Server #4 entry from `ovh/wardogs-secrets.example.php` to the existing private `servers` array. Keep the existing server records, WARCON key and other settings. Set its RCON password privately and use `http://84.32.103.104:20001` (or the HTTPS scheme if that is what the working WARCON connection uses). Port `20001` is for RCON, not a player join address.

Build and upload `dist/` to OVH `/www`, including the updated `api/servers.php` and `.htaccess`. The directory will show #4's fallback card and copyable join code even before RCON is configured. Once the private entry is configured, `/api/servers.php` must contain `id: "wardogs-12577"`; Discord bot #4 then reads that same record. No Discord bot credentials belong in the website.

Server #3's current website ID is `wardogs-9f71e8ef`; the old Qonzer Hardcore card has been replaced with its Normal server identity.

Adding #4 to WARCON does not automatically add it to the website stats allowlist. Append its existing **WARCON database server ID** to `WARDOGS_STATS_SERVERS`, preserving the other IDs, and recreate the relevant WARCON service containers to load the environment change. Do not substitute XRealm ID `12577` for the WARCON ID. See `integrations/warcon/README.md` for the read-only ID lookup and verification steps.

## Player stats — WARCON

WARCON is the target single source of truth for player search/statistics:

```text
WARDOGS #1 ─┐
WARDOGS #2 ─┼──► WARCON ─► Postgres / TimescaleDB
WARDOGS #3 ─┤                    │
WARDOGS #4 ─┘                    │
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
Normal   = sessions recorded during Standard matches
Hardcore = sessions recorded during Hardcore matches
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
WARDOGS_STATS_API_KEY=LONG_RANDOM_SECRET
WARDOGS_STATS_SERVERS=SERVER_1_ID,SERVER_2_ID,SERVER_3_ID,SERVER_4_ID
```

The integration adjusts WARCON session tracking so kills/deaths accumulate across WARDOGS match counter resets while a player remains connected. It also records positive cash deltas from 15 September 2026 onward for the website's Cash Earned leaderboard; historical cash is deliberately not estimated.

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

The four Discord bots, status presence and `/status` command remain in:

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
The stats page's Cash Earned leader is the highest positive cash total earned by one player in one
round. It is tracked forward from 15 September 2026; current wallet balances and older rounds are
not treated as earnings.
