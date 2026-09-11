# WARCON as the 44th website player-stats source

This integration makes WARCON the persistent source of truth for `/stats` on `44thwardogs.com`.

## Why the small WARCON session change is included

Stock WARCON already stores player presence, names, factions, join/leave times, matches and live data in Postgres/TimescaleDB. Its existing API is intended for signed-in panel users, so this integration adds one API-key-protected, read-only endpoint for the public website.

WARCON's stock `player_sessions.kills` / `deaths` values follow the live WARDOGS counters. Those counters reset when a match changes even if a player stays connected. `apply-session-deltas.py` adjusts WARCON's in-memory session tracking so the persisted values accumulate the counter deltas across match resets. No database migration is required.

The installer checks exact upstream source blocks before changing them and stops if the installed WARCON version is incompatible. Running it again is safe.

Existing completed WARCON sessions cannot reconstruct kills/deaths that were overwritten before this change was installed. New observations are cumulative after it is deployed.

## 1. Apply cumulative session K/D tracking

SSH to the WARCON VPS and change to the WARCON source checkout (the directory containing `docker-compose.yml`). Then run:

```bash
curl -fsSL https://raw.githubusercontent.com/Khade76/Commandosweb/main/integrations/warcon/apply-session-deltas.py \
  -o /tmp/apply-session-deltas.py
python3 /tmp/apply-session-deltas.py
```

A successful run prints:

```text
[44th WARCON] Applied cumulative kill/death session tracking.
```

If WARCON upstream has changed in a way that makes the modification unsafe, the script exits without silently editing a different block.

## 2. Install the read-only stats route

```bash
mkdir -p src/routes/api/public/player-stats
curl -fsSL https://raw.githubusercontent.com/Khade76/Commandosweb/main/integrations/warcon/player-stats-route.ts \
  -o src/routes/api/public/player-stats/+server.ts
```

The route only supports `GET` and requires a Bearer token. It exposes player statistics only; it does not expose admin actions, notes, bans, RCON passwords or WARCON sessions/cookies.

## 3. Get the WARCON server IDs

From the WARCON directory:

```bash
docker compose exec -T db psql -U warcon -d warcon -P pager=off \
  -c "SELECT id, name FROM servers ORDER BY sort_order, name;"
```

You need the IDs for:

- 44th Commandos #1
- 44th Commandos #2
- 44th Commandos #3 / Hardcore

The endpoint also accepts exact WARCON server names in the environment variables, but IDs are preferred because names may change.

## 4. Add the WARCON environment settings

Generate a new long random token. Example from PowerShell:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToHexString($bytes)
```

Add the following to WARCON's `.env`:

```env
PUBLIC_STATS_API_KEY=PASTE_THE_RANDOM_TOKEN
PUBLIC_STATS_NORMAL_SERVERS=SERVER_1_ID,SERVER_2_ID
PUBLIC_STATS_HARDCORE_SERVERS=SERVER_3_ID
```

The server lists may contain either WARCON server IDs or exact server names.

## 5. Rebuild WARCON

The standard WARCON Docker Compose file builds from the local checkout, so rebuild after installing the route/session change:

```bash
docker compose up -d --build
```

Then check the containers:

```bash
docker compose ps
```

## 6. Test WARCON directly

From the WARCON VPS:

```bash
TOKEN='PASTE_THE_RANDOM_TOKEN'

curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:3000/api/public/player-stats?group=normal&limit=5'
```

A working response contains:

```json
{
  "group": "normal",
  "players": [],
  "summary": {},
  "source": "warcon"
}
```

Test Hardcore as well:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:3000/api/public/player-stats?group=hardcore&limit=5'
```

## 7. Point the OVH website at WARCON

In the private `wardogs-secrets.php` above `/www`, add/update:

```php
'stats_source' => 'warcon',

'warcon' => [
    'url' => 'http://YOUR-WARCON-HOST:3000',
    'stats_api_key' => 'THE_SAME_RANDOM_TOKEN',
],
```

Use a WARCON URL that the OVH web host can reach. If port 3000 is not intentionally public, expose WARCON through its existing HTTPS/reverse-proxy hostname instead and put that origin in `url`.

The browser never receives the WARCON API key. `/api/player-stats.php` on OVH adds it server-side.

## 8. Verify the website source

Open:

```text
https://44thwardogs.com/api/player-stats.php?group=normal&limit=5
```

The JSON should contain:

```json
"source": "warcon"
```

Then test:

```text
https://44thwardogs.com/api/player-stats.php?group=hardcore&limit=5
```

Finally open `/stats` and verify Normal and Hardcore remain separate.

## Temporary MariaDB fallback

Until `stats_source` is changed to `warcon`, the website continues using the MariaDB collector already configured on OVH. Once WARCON is confirmed as the live source, the MariaDB collector/schema can be removed in a follow-up cleanup.
