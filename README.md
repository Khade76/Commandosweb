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

Server #4 currently appears as `44th Commandos #4 | New Player Friendly | discord.gg/44thwardogs`. Its website and Discord lookup key is `wardogs-12577`, based on XRealm ID `12577`, and its persistent join code is `7f15ef51-2673-4eab-b3c8-d8176a3b41e4`.

Append the Server #4 entry from `ovh/wardogs-secrets.example.php` to the existing private `servers` array. Keep the existing server records, WARCON key and other settings. Set its RCON password privately and use `http://84.32.103.104:20001` (or the HTTPS scheme if that is what the working WARCON connection uses). Port `20001` is for RCON, not a player join address.

Build and upload `dist/` to OVH `/www`, including the updated `api/servers.php` and `.htaccess`. The directory will show #4's fallback card and copyable join code even before RCON is configured. Once the private entry is configured, `/api/servers.php` must contain `id: "wardogs-12577"`; Discord bot #4 then reads that same record. No Discord bot credentials belong in the website.

Server #3's current website ID is `wardogs-9f71e8ef`; the old Qonzer Hardcore card has been replaced with its Normal server identity.

Adding #4 to WARCON does not automatically add it to the website stats allowlist. Append its existing **WARCON database server ID** to `WARDOGS_STATS_SERVERS`, preserving the other IDs, and recreate the relevant WARCON service containers to load the environment change. Do not substitute XRealm ID `12577` for the WARCON ID. See `integrations/warcon/README.md` for the read-only ID lookup and verification steps.

## Joining through the 44th website

Discord buttons and the website's **Join Server** buttons can now use the 44th-hosted page:

```text
https://44thwardogs.com/join?server=1
https://44thwardogs.com/join?server=wardogs-12577
```

Numbered links support Servers #1–#5. Stable website IDs also work, including custom IDs configured with an explicit `number`. The page resolves the requested record through the same-origin join endpoint, attempts to open the validated Steam link once, and keeps a visible **Open in Steam** button for browsers that require a click. It retains copyable persistent join codes and the manual joining steps. It does not contact or link to an external join service.

### Configure the server's Steam lobby

In the **existing private** `wardogs-secrets.php`, add the current Steam lobby link to the matching entry in `servers`. Preserve its ID, RCON connection, join code and all other settings:

```php
'steamJoinUrl' => 'steam://joinlobby/1867240/PASTE_THIS_SERVERS_CURRENT_LOBBY_ID',
```

Alternatively, set the numeric lobby ID alone, keeping it **quoted as a string**:

```php
'steamLobbyId' => 'PASTE_THIS_SERVERS_CURRENT_LOBBY_ID',
```

Use one of these fields and leave the other blank. If both are set they must identify the same lobby. Malformed, conflicting, wrong-game or arbitrary web URLs do not produce a launch link. Invalid or missing lobby configuration leaves manual joining available. The public response contains only the server's display identity, join code and validated lobby link; RCON passwords, management addresses and other configuration remain private.

**The lobby ID is different from the persistent UUID join code.** Current checked [WARDOGS RCON documentation](https://github.com/warcon-app/warcon/blob/main/docs/wardogs-api.md) describes `/v1/server-id` as the persistent code and does not document a Steam lobby resolver. This implementation therefore uses the configured lobby and does **not** discover a replacement automatically. Update the setting when the Steam lobby changes. A valid link is not proof that its lobby remains online. Lobby IDs exceed JavaScript's safe integer range; keep them as decimal strings throughout.

Known website IDs map to their existing server numbers regardless of array order. If you use a custom ID, add `'number' => 1` (or the appropriate number 2–5) to that entry. Disabled records and unknown servers return 404; ambiguous configuration returns 503. Never paste one server's lobby into all five entries.

### Use an existing Steam link directly

An existing lobby link can also be represented on the 44th domain without assigning it to a numbered server:

```text
Steam:   steam://joinlobby/1867240/109775242493124785
Website: https://44thwardogs.com/join?lobby=109775242493124785
```

This route needs no private configuration and makes no claim about which 44th server owns that lobby. It works only while that lobby is valid. It accepts a validated lobby number for WARDOGS only, never an arbitrary destination URL. Specify either `server` or `lobby`, not both.

### Deploy the website before changing the bots

1. Build with `npm ci` and `npm run build`.
2. Upload the complete `dist/` to OVH `/www`, including the updated hidden `.htaccess`, `api/join.php`, `api/join-common.php` and frontend assets. Keep the existing private secrets file above `/www`; add lobby settings there without replacing it with the example.
3. Check `/join?server=1` through `/join?server=5`. With a current configured lobby, test **Open in Steam** on a device with Steam and WARDOGS. Without one, confirm the manual join-code fallback appears.
4. Deploy the companion bot change, then use AMP **Update Application** and restart. Its default destination is `https://44thwardogs.com/join?server=N`. Clear an old explicit `DISCORD_WARDOGS_SERVER_N_JOIN_URL` override if it still points to another site.

The PHP endpoint is `GET /api/join.php`; the optional Node backend supports `/api/join` and `/api/join.php`. Responses are not cached. Node/local lobby settings use `WARDOGS_SERVER_N_STEAM_LOBBY_ID` or `WARDOGS_SERVER_N_STEAM_JOIN_URL` from `.env`; production OVH continues using `wardogs-secrets.php`.

Validation commands: `npm run test:join`, `npm run test:join:php` (PHP 8 required), and `npm run test:join:ui` against a local built server. The browser test uses Playwright and accepts `PLAYWRIGHT_MODULE`, `PLAYWRIGHT_EXECUTABLE_PATH` and `JOIN_TEST_URL` overrides. It does not join a live game or call live RCON.

## Player stats — WARCON

WARCON is the target single source of truth for player search/statistics:

```text
WARDOGS #1 ─┐
WARDOGS #2 ─┼──► WARCON ─► Postgres / TimescaleDB
WARDOGS #3 ─┤                    │
WARDOGS #4 ─┤                    │
WARDOGS #5 ─┘                    │
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

WARCON stores sessions, kill-feed events and match history. The 44th read-only endpoint aggregates all five servers by default and accepts `server=1` through `server=5`. It uses WARCON leaderboard rules for kills, deaths, match results, playtime, seed time and cash. Historical Hardcore activity remains in all-time totals.

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
WARDOGS_STATS_SERVERS=SERVER_1_ID,SERVER_2_ID,SERVER_3_ID,SERVER_4_ID,SERVER_5_ID
```

The website defaults to WARCON's organisation-current season; archived seasons,
7-day, 30-day, 90-day and all-time periods remain selectable. The existing Discord
stats commands use the same current-season default through the PHP endpoint.
The 44th's Season 2 starts at 10:00am BST on 15 October 2026 (09:00 UTC), without
resetting statistics or seeding progress. Cash is WARCON's sum of recorded session
cash, not a wallet balance or earned-income measure.

## Temporary MariaDB fallback

During the cutover, `public/api/player-stats.php` can continue using the already-configured MariaDB collector when:

```php
'stats_source' => 'mariadb',
```

The existing `database/schema.sql`, `stats-db.php`, `collect-stats.php` and health tooling remain for the old Normal/Hardcore endpoints. Global and per-server totals require WARCON; the fallback returns an error rather than a partial total.

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
The stats page uses WARCON's leaderboard data and all five servers for its global view.
