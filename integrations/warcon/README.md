# WARCON as the 44th website player-stats source

WARCON is the persistent source of truth for `/stats` on `44thwardogs.com`.

The website does not need a separate MariaDB collector when `stats_source` is set to `warcon`. WARCON stores player sessions and match history in its own Postgres/TimescaleDB database, and the website reads the API-key-protected public stats route.

## How Standard vs Hardcore is classified

Stats are no longer tied to a server number.

All three 44th servers are included in the same WARCON stats source list. The public stats route looks at the WARCON `matches` row that was active when a player session began:

- if the match `map` or `experiences` contains `Hardcore` (for example `KOTH_Hardcore`), that session belongs to **Hardcore**;
- otherwise it belongs to **Standard**.

This means Server #1, #2 or #3 can host a Hardcore rotation later without changing the website configuration.

Because WARCON player sessions can normally span several matches, `apply-ruleset-session-splits.py` closes/reopens the in-memory player session only when the live ruleset changes Standard <-> Hardcore. That keeps cumulative K/D on the correct ruleset even when a player stays connected through a rotation change. The split is internal stats bookkeeping and does not generate fake player-join triggers.

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

Running the script again is safe. If WARCON upstream has changed in a way that makes the modification unsafe, it exits rather than editing an unexpected block.

## 2. Apply dynamic ruleset session splitting

Run this after the cumulative K/D patch:

```bash
curl -fsSL https://raw.githubusercontent.com/Khade76/Commandosweb/main/integrations/warcon/apply-ruleset-session-splits.py \
  -o /tmp/apply-ruleset-session-splits.py
python3 /tmp/apply-ruleset-session-splits.py
```

A successful run prints:

```text
[44th WARCON] Applied dynamic Standard/Hardcore session splitting.
```

No WARCON database migration is required. Existing historical sessions are classified from the match that was active when each session began. Very old sessions that crossed Standard/Hardcore boundaries before this patch cannot be perfectly reconstructed; future ruleset changes are split correctly.

## 3. Install the read-only stats route

```bash
mkdir -p src/routes/api/public/player-stats
curl -fsSL https://raw.githubusercontent.com/Khade76/Commandosweb/main/integrations/warcon/player-stats-route.ts \
  -o src/routes/api/public/player-stats/+server.ts
```

The route only supports `GET` and requires a Bearer token. It exposes player statistics only; it does not expose admin actions, notes, bans, RCON passwords or WARCON sessions/cookies.

## 4. Get the WARCON server IDs

From the WARCON directory:

```bash
docker compose exec -T db psql -U warcon -d warcon -P pager=off \
  -c "SELECT id, name FROM servers ORDER BY sort_order, name;"
```

Use the WARCON IDs for all three current 44th servers:

- 44th Commandos #1
- 44th Commandos #2
- 44th Commandos #3

The route also accepts exact WARCON server names, but IDs are preferred because names may change.

## 5. Add/update the WARCON environment settings

Generate a long random token if one is not already configured. Example from PowerShell:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToHexString($bytes)
```

WARCON `.env` should contain:

```env
WARDOGS_STATS_API_KEY=PASTE_THE_RANDOM_TOKEN
WARDOGS_STATS_SERVERS=SERVER_1_ID,SERVER_2_ID,SERVER_3_ID
```

`WARDOGS_STATS_SERVERS` replaces the old fixed `WARDOGS_STATS_NORMAL_SERVERS` / `WARDOGS_STATS_HARDCORE_SERVERS` split. The updated route still reads the old variables as a migration fallback, but they should be removed after `WARDOGS_STATS_SERVERS` is confirmed.

Do not prefix the private values with `PUBLIC_`. SvelteKit reserves `PUBLIC_` for client-exposed configuration, while this API key must remain server-only.

## 6. Rebuild WARCON

The standard WARCON Docker Compose file builds from the local checkout, so rebuild after applying the patches and installing the route:

```bash
docker compose up -d --build
```

Then check the containers:

```bash
docker compose ps
```

## 7. Test WARCON directly

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

Hardcore may legitimately be empty while none of the configured servers has recorded a Hardcore-tagged match.

## 8. Website configuration

The private `wardogs-secrets.php` above `/www` should keep WARCON selected:

```php
'stats_source' => 'warcon',

'warcon' => [
    'url' => 'https://warcon.44thwardogs.com',
    'stats_api_key' => 'THE_SAME_RANDOM_TOKEN',
],
```

The browser never receives the WARCON API key. `/api/player-stats.php` on OVH adds it server-side.

Server #3's website/RCON status entry also needs to contain its new Bisect connection details now that it is no longer hosted by Qonzer. That is separate from WARCON stats grouping.

## 9. Verify the website source

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

Finally open `/stats`. The tabs should describe **Standard** and **Hardcore rulesets**, not specific server numbers.
