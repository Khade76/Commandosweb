# WARCON as the 44th website player-stats source

WARCON is the persistent source of truth for `/stats` on `44thwardogs.com`.

The current route reads the same kill feed, match outcomes and session fields as WARCON's leaderboard. It aggregates Servers #1–#5 by default, or one server with `server=1` through `server=5`. `range=7d|30d|90d|all` and `sort=kills|deaths|kd|perHour|time|seeded|matches|wins|winRate|cash` match WARCON's leaderboard choices. The website and Discord bot use all-time unless a website visitor selects another period. Leader cards apply WARCON's 60-minute minimum playtime.

The older Standard/Hardcore split and `cash_earned` patch instructions below are historical and are not required by the current route. Cash now means WARCON's sum of session cash. Kills and deaths combine feed events with the recorded session totals from sessions completed before the kill feed was enabled on each server on 19 September 2026. Sessions crossing that boundary are excluded from the historical addition because their counters cannot be split without double counting. Historical Hardcore events remain in all-time totals.

The website does not need a separate MariaDB collector when `stats_source` is set to `warcon`. WARCON stores player sessions and match history in its own Postgres/TimescaleDB database, and the website reads the API-key-protected public stats route.

## How Standard vs Hardcore is classified internally

Stats are no longer tied to a server number.

All five 44th servers belong in the same WARCON stats source list. The WARCON public stats route still classifies each recorded session from the `matches` row that was active when the player session began:

- if the match `map` or `experiences` contains `Hardcore` (for example `KOTH_Hardcore`), that session is internally classified as **Hardcore**;
- otherwise it is internally classified as **Standard**.

The public Commandos website and Discord bots request `group=all`, which aggregates every configured server and both historical rulesets in one WARCON query. `server=1` through `server=5` optionally narrows the query to one numbered server. The internal ruleset split remains available for historical diagnostics; no stats migration is required.

Because WARCON player sessions can normally span several matches, `apply-ruleset-session-splits.py` closes/reopens the in-memory player session only when the live ruleset changes Standard <-> Hardcore. That keeps cumulative K/D on the correct internal ruleset even when a player stays connected through a rotation change. The split is internal stats bookkeeping and does not generate fake player-join triggers.

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

## 2. Apply forward-only cash-earned tracking

Cash earned is the sum of positive cash changes observed while a player is connected. Existing
cash on join is the baseline and is not counted; decreases from spending are ignored. Historical
sessions remain zero, so the website labels this metric as tracked since 15 September 2026.

Apply the idempotent database column first:

```bash
curl -fsSL https://raw.githubusercontent.com/Khade76/Commandosweb/main/integrations/warcon/cash-earned.sql \
  | docker compose exec -T db psql -U warcon -d warcon -v ON_ERROR_STOP=1
```

Then patch WARCON after the cumulative session K/D patch:

```bash
curl -fsSL https://raw.githubusercontent.com/Khade76/Commandosweb/main/integrations/warcon/apply-cash-earned.py \
  -o /tmp/apply-cash-earned.py
python3 /tmp/apply-cash-earned.py
```

A successful run prints:

```text
[44th WARCON] Applied forward-only cash-earned tracking.
```

## 3. Apply dynamic ruleset session splitting

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

## 4. Install the read-only stats route

```bash
mkdir -p src/routes/api/public/player-stats
curl -fsSL https://raw.githubusercontent.com/Khade76/Commandosweb/main/integrations/warcon/player-stats-route.ts \
  -o src/routes/api/public/player-stats/+server.ts
```

The route only supports `GET` and requires a Bearer token. It exposes player statistics only; it does not expose admin actions, notes, bans, RCON passwords or WARCON sessions/cookies.

## 5. Get the WARCON server IDs

From the WARCON directory:

```bash
docker compose exec -T db psql -U warcon -d warcon -P pager=off \
  -c "SELECT id, name FROM servers ORDER BY sort_order, name;"
```

Use the WARCON IDs for all five current 44th servers:

- 44th Commandos #1
- 44th Commandos #2
- 44th Commandos #3
- 44th Commandos #4 (XRealm)
- 44th Commandos #5 | discord.gg/44thwardogs (XRealm)

The route also accepts exact WARCON server names, but IDs are preferred because names may change.

Server #4 is already registered in WARCON. Read its existing ID with the query above; XRealm ID `12577` and website ID `wardogs-12577` are separate identifiers. For Server #5, first check the same query for an existing record before creating anything. Its XRealm ID is `12648` and the website lookup ID is `wardogs-12648`; neither value should be assumed to be its WARCON database ID.

## 6. Add/update the WARCON environment settings

Generate a long random token if one is not already configured. Example from PowerShell:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToHexString($bytes)
```

WARCON `.env` should contain:

```env
WARDOGS_STATS_API_KEY=PASTE_THE_RANDOM_TOKEN
WARDOGS_STATS_SERVERS=SERVER_1_ID,SERVER_2_ID,SERVER_3_ID,SERVER_4_ID,SERVER_5_ID
```

`WARDOGS_STATS_SERVERS` replaces the old fixed `WARDOGS_STATS_NORMAL_SERVERS` / `WARDOGS_STATS_HARDCORE_SERVERS` split. The route still reads the old variables as a migration fallback, but returns 503 until all five numbered servers resolve. Remove the legacy variables after the new list is confirmed.

For an existing installation, preserve the current API key and set all five verified WARCON server IDs. On 23 September 2026, the running web service used the legacy allowlists for #1–#3 only, although WARCON already stored sessions for #4 and #5. Recheck the IDs before applying configuration; the read-only lookup above is authoritative. This update does not rewrite historical sessions.

Do not prefix the private values with `PUBLIC_`. SvelteKit reserves `PUBLIC_` for client-exposed configuration, while this API key must remain server-only.

## 7. Rebuild WARCON

The standard WARCON Docker Compose file builds from the local checkout, so rebuild after applying the patches and installing the route:

```bash
docker compose up -d --no-deps --build warcon
```

Then check the containers:

```bash
docker compose ps
```

## 8. Test WARCON directly

From the WARCON VPS:

```bash
TOKEN='PASTE_THE_RANDOM_TOKEN'

curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:3000/api/public/player-stats?group=all&limit=5'
```

A working response contains:

```json
{
  "group": "all",
  "players": [],
  "summary": {},
  "source": "warcon-leaderboard"
}
```

Test a numbered server and confirm its `serverCounts` and totals are scoped:

```bash
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  'http://127.0.0.1:3000/api/public/player-stats?group=all&server=4&limit=5'
```

If a numbered server is missing from `WARDOGS_STATS_SERVERS`, the route returns a configuration error instead of attributing another server's sessions to it.

## 9. Website configuration

The private `wardogs-secrets.php` above `/www` should keep WARCON selected:

```php
'stats_source' => 'warcon',

'warcon' => [
    'url' => 'https://warcon.44thwardogs.com',
    'stats_api_key' => 'THE_SAME_RANDOM_TOKEN',
],
```

The browser never receives the WARCON API key. `/api/player-stats.php` on OVH adds it server-side.

Server #5's website/RCON status entry must also be added to the private `wardogs-secrets.php` using XRealm ID `12648`, RCON endpoint `88.216.222.131:20001`, the persistent join code `3500961c-24df-40b1-b299-6a897eddc2bd`, and the real Server #5 RCON password. The repository example contains the complete non-secret record.

## 10. Verify the website source

Open:

```text
https://44thwardogs.com/api/player-stats.php?group=all&limit=5
```

The JSON should contain:

```json
"source": "warcon-leaderboard"
```

Then test each numbered server:

```text
https://44thwardogs.com/api/player-stats.php?group=all&server=4&limit=5
```

Finally open `/stats`. There should be one combined 44th player-stats view with no separate Hardcore section. Compare one server-scoped player row with WARCON's own leaderboard for that server and the same period.

## Historical cash-earned patch (not used by the current leaderboard route)

An older stats route used a single-round cash-earned record. Its optional patch sequence was:

```bash
python3 /path/to/Commandosweb/integrations/warcon/apply-round-session-splits.py
```

Then apply `apply-cash-earned.py`. The match-clock reset closes the old public-stat sessions and
opens fresh ones without generating join notifications. Positive cash deltas are accumulated within
that round, so spending does not reduce the recorded earnings. The stats route uses the greatest
single `cash_earned` session for each player. The current route ignores that column and instead follows WARCON's leaderboard cash calculation.
