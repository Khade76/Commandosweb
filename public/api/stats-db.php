<?php

declare(strict_types=1);

function wardogsStatsSecretFile(): string
{
    return dirname(__DIR__, 2) . '/wardogs-secrets.php';
}

function wardogsStatsConfig(): array
{
    static $config = null;
    if (is_array($config)) return $config;

    $secretFile = wardogsStatsSecretFile();
    if (!is_file($secretFile)) {
        throw new RuntimeException('WARDOGS configuration is not available');
    }

    $loaded = require $secretFile;
    if (!is_array($loaded)) {
        throw new RuntimeException('WARDOGS configuration is invalid');
    }

    $config = $loaded;
    return $config;
}

function wardogsStatsPdo(array $config): PDO
{
    $database = is_array($config['database'] ?? null) ? $config['database'] : [];
    $host = trim((string)($database['host'] ?? ''));
    $name = trim((string)($database['name'] ?? ''));
    $user = trim((string)($database['user'] ?? ''));
    $password = (string)($database['password'] ?? '');
    $port = max(1, min(65535, (int)($database['port'] ?? 3306)));
    $charset = trim((string)($database['charset'] ?? 'utf8mb4')) ?: 'utf8mb4';

    if ($host === '' || $name === '' || $user === '' || $password === '') {
        throw new RuntimeException('MariaDB is not configured in wardogs-secrets.php');
    }

    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', $host, $port, $name, $charset);
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 6,
    ];

    $sslCa = trim((string)($database['ssl_ca'] ?? ''));
    if ($sslCa !== '' && defined('PDO::MYSQL_ATTR_SSL_CA')) {
        $options[PDO::MYSQL_ATTR_SSL_CA] = $sslCa;
    }

    return new PDO($dsn, $user, $password, $options);
}

function wardogsStatsNow(): DateTimeImmutable
{
    return new DateTimeImmutable('now', new DateTimeZone('UTC'));
}

function wardogsStatsMysqlDate(DateTimeInterface $date): string
{
    return $date->format('Y-m-d H:i:s.v');
}

function wardogsStatsIso(?string $value): ?string
{
    if ($value === null || trim($value) === '') return null;
    try {
        return (new DateTimeImmutable($value, new DateTimeZone('UTC')))->format(DATE_ATOM);
    } catch (Throwable) {
        return null;
    }
}

function wardogsStatsNumber($value, int|float $fallback = 0): int|float
{
    return is_numeric($value) ? 0 + $value : $fallback;
}

function wardogsStatsGroup($value, string $fallback = 'normal'): string
{
    $group = strtolower(trim((string)$value));
    return in_array($group, ['normal', 'hardcore'], true) ? $group : $fallback;
}

function wardogsStatsFetchJson(string $url, string $password): array
{
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Authorization: Bearer ' . $password,
            ],
        ]);

        $body = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);

        if ($body === false || $error !== '') throw new RuntimeException('RCON network request failed');
        if ($status < 200 || $status >= 300) throw new RuntimeException('RCON returned HTTP ' . $status);

        $decoded = json_decode((string)$body, true);
        if (!is_array($decoded)) throw new RuntimeException('RCON returned invalid JSON');
        return $decoded;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "Accept: application/json\r\nAuthorization: Bearer {$password}\r\n",
            'timeout' => 8,
            'ignore_errors' => true,
        ],
    ]);

    $body = @file_get_contents($url, false, $context);
    if ($body === false) throw new RuntimeException('RCON network request failed');

    $status = 0;
    foreach (($http_response_header ?? []) as $header) {
        if (preg_match('#^HTTP/\\S+\\s+(\\d{3})#i', (string)$header, $matches)) {
            $status = (int)$matches[1];
            break;
        }
    }

    if ($status < 200 || $status >= 300) throw new RuntimeException('RCON returned HTTP ' . $status);

    $decoded = json_decode((string)$body, true);
    if (!is_array($decoded)) throw new RuntimeException('RCON returned invalid JSON');
    return $decoded;
}

function wardogsStatsPlayerRows(array $payload): array
{
    if (array_is_list($payload)) return $payload;
    if (is_array($payload['players'] ?? null)) return $payload['players'];
    if (is_array($payload['data'] ?? null)) return $payload['data'];
    return [];
}

function wardogsStatsNormalisePlayer(array $player): ?array
{
    $steamId = trim((string)(
        $player['steamId']
        ?? $player['steamID']
        ?? $player['steam_id']
        ?? $player['playerId']
        ?? $player['id']
        ?? ''
    ));
    if ($steamId === '') return null;

    $name = trim((string)($player['name'] ?? $player['playerName'] ?? $steamId));
    $faction = trim((string)($player['faction'] ?? $player['team'] ?? 'Unknown')) ?: 'Unknown';

    return [
        'steamId' => $steamId,
        'name' => $name !== '' ? $name : 'Unknown Player',
        'faction' => $faction,
        'kills' => max(0, (int)wardogsStatsNumber($player['kills'] ?? 0)),
        'deaths' => max(0, (int)wardogsStatsNumber($player['deaths'] ?? 0)),
        'cash' => (int)wardogsStatsNumber($player['cash'] ?? 0),
        'pingMs' => max(0, (int)wardogsStatsNumber($player['pingMs'] ?? $player['ping'] ?? 0)),
    ];
}

function wardogsStatsMatchMarker(array $status): string
{
    $experiences = is_array($status['experiences'] ?? null)
        ? implode(',', array_map('strval', $status['experiences']))
        : '';
    $rotation = is_array($status['rotation'] ?? null) ? $status['rotation'] : [];
    $marker = (string)($status['map'] ?? '') . '|' . $experiences . '|' . (string)($rotation['nowIndex'] ?? '');
    return substr($marker, 0, 512);
}

function wardogsStatsRecordServer(PDO $pdo, array $server, int $serverNumber, array $status, array $rawPlayers, int $pollSeconds): int
{
    $fallbackGroup = $serverNumber === 3 ? 'hardcore' : 'normal';
    $group = wardogsStatsGroup($server['statsGroup'] ?? null, $fallbackGroup);
    $externalId = substr(trim((string)($server['id'] ?? ('server-' . $serverNumber))), 0, 128);
    $serverName = substr(trim((string)($server['name'] ?? ('WARDOGS Server #' . $serverNumber))), 0, 191);
    $now = wardogsStatsNow();
    $nowSql = wardogsStatsMysqlDate($now);
    $matchMarker = wardogsStatsMatchMarker($status);
    $players = [];
    foreach ($rawPlayers as $rawPlayer) {
        if (!is_array($rawPlayer)) continue;
        $player = wardogsStatsNormalisePlayer($rawPlayer);
        if ($player !== null) $players[] = $player;
    }

    $pdo->beginTransaction();
    try {
        $statement = $pdo->prepare(
            'INSERT INTO stats_servers (server_number, external_id, name, stats_group, last_seen)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                external_id = VALUES(external_id),
                name = VALUES(name),
                stats_group = VALUES(stats_group),
                last_seen = VALUES(last_seen)'
        );
        $statement->execute([$serverNumber, $externalId, $serverName, $group, $nowSql]);

        $statement = $pdo->prepare('SELECT id FROM stats_servers WHERE server_number = ? LIMIT 1');
        $statement->execute([$serverNumber]);
        $serverId = (int)($statement->fetchColumn() ?: 0);
        if ($serverId < 1) throw new RuntimeException('Unable to resolve stats server id');

        foreach ($players as $observed) {
            $statement = $pdo->prepare('SELECT id, current_name FROM players WHERE steam_id = ? LIMIT 1 FOR UPDATE');
            $statement->execute([$observed['steamId']]);
            $stored = $statement->fetch();

            if (!$stored) {
                $statement = $pdo->prepare(
                    'INSERT INTO players (steam_id, current_name, first_seen, last_seen) VALUES (?, ?, ?, ?)'
                );
                $statement->execute([$observed['steamId'], $observed['name'], $nowSql, $nowSql]);
                $playerId = (int)$pdo->lastInsertId();
            } else {
                $playerId = (int)$stored['id'];
                $previousName = trim((string)($stored['current_name'] ?? ''));
                if ($previousName !== '' && $previousName !== $observed['name']) {
                    $statement = $pdo->prepare(
                        'INSERT INTO player_aliases (player_id, alias, first_seen, last_seen)
                         VALUES (?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE last_seen = VALUES(last_seen)'
                    );
                    $statement->execute([$playerId, $previousName, $nowSql, $nowSql]);
                }

                $statement = $pdo->prepare('UPDATE players SET current_name = ?, last_seen = ? WHERE id = ?');
                $statement->execute([$observed['name'], $nowSql, $playerId]);
            }

            $statement = $pdo->prepare(
                'INSERT IGNORE INTO player_group_stats (player_id, stats_group, first_seen, last_seen)
                 VALUES (?, ?, ?, ?)'
            );
            $statement->execute([$playerId, $group, $nowSql, $nowSql]);

            $statement = $pdo->prepare(
                'SELECT kills, deaths, seen_at, match_marker
                 FROM player_snapshots WHERE server_id = ? AND player_id = ? LIMIT 1'
            );
            $statement->execute([$serverId, $playerId]);
            $previous = $statement->fetch() ?: null;

            $markerChanged = $previous !== null && (string)$previous['match_marker'] !== $matchMarker;
            $statsReset = $previous !== null && (
                $observed['kills'] < (int)$previous['kills'] || $observed['deaths'] < (int)$previous['deaths']
            );
            $newMatch = $previous === null || $markerChanged || $statsReset;

            $killDelta = $observed['kills'];
            $deathDelta = $observed['deaths'];
            $matchDelta = 1;
            $elapsedSeconds = 0;

            if ($previous !== null && !$newMatch) {
                $killDelta = max(0, $observed['kills'] - (int)$previous['kills']);
                $deathDelta = max(0, $observed['deaths'] - (int)$previous['deaths']);
                $matchDelta = 0;
                $previousTime = strtotime((string)$previous['seen_at'] . ' UTC');
                if ($previousTime !== false) {
                    $elapsed = max(0, $now->getTimestamp() - $previousTime);
                    $maxCredible = (int)ceil($pollSeconds * 2.5);
                    if ($elapsed <= $maxCredible) $elapsedSeconds = $elapsed;
                }
            }

            $statement = $pdo->prepare(
                'UPDATE player_group_stats
                 SET last_seen = ?,
                     total_kills = total_kills + ?,
                     total_deaths = total_deaths + ?,
                     matches_seen = matches_seen + ?,
                     seconds_tracked = seconds_tracked + ?,
                     peak_kills_in_match = GREATEST(peak_kills_in_match, ?),
                     peak_cash = GREATEST(peak_cash, ?)
                 WHERE player_id = ? AND stats_group = ?'
            );
            $statement->execute([
                $nowSql, $killDelta, $deathDelta, $matchDelta, $elapsedSeconds,
                $observed['kills'], $observed['cash'], $playerId, $group,
            ]);

            $statement = $pdo->prepare(
                'INSERT INTO player_server_stats
                    (player_id, server_id, first_seen, last_seen, total_kills, total_deaths, matches_seen, seconds_tracked, polls_seen)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE
                    last_seen = VALUES(last_seen),
                    total_kills = total_kills + VALUES(total_kills),
                    total_deaths = total_deaths + VALUES(total_deaths),
                    matches_seen = matches_seen + VALUES(matches_seen),
                    seconds_tracked = seconds_tracked + VALUES(seconds_tracked),
                    polls_seen = polls_seen + 1'
            );
            $statement->execute([
                $playerId, $serverId, $nowSql, $nowSql, $killDelta, $deathDelta, $matchDelta, $elapsedSeconds,
            ]);

            $statement = $pdo->prepare(
                'INSERT INTO player_faction_stats
                    (player_id, stats_group, faction, first_seen, last_seen, total_kills, total_deaths, seconds_tracked, polls_seen)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE
                    last_seen = VALUES(last_seen),
                    total_kills = total_kills + VALUES(total_kills),
                    total_deaths = total_deaths + VALUES(total_deaths),
                    seconds_tracked = seconds_tracked + VALUES(seconds_tracked),
                    polls_seen = polls_seen + 1'
            );
            $statement->execute([
                $playerId, $group, $observed['faction'], $nowSql, $nowSql,
                $killDelta, $deathDelta, $elapsedSeconds,
            ]);

            $statement = $pdo->prepare(
                'INSERT INTO player_snapshots (server_id, player_id, stats_group, kills, deaths, seen_at, match_marker)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    stats_group = VALUES(stats_group),
                    kills = VALUES(kills),
                    deaths = VALUES(deaths),
                    seen_at = VALUES(seen_at),
                    match_marker = VALUES(match_marker)'
            );
            $statement->execute([
                $serverId, $playerId, $group, $observed['kills'], $observed['deaths'], $nowSql, $matchMarker,
            ]);

            $statement = $pdo->prepare(
                'INSERT INTO player_live_state (player_id, server_id, stats_group, faction, ping_ms, cash, last_seen)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    server_id = VALUES(server_id),
                    stats_group = VALUES(stats_group),
                    faction = VALUES(faction),
                    ping_ms = VALUES(ping_ms),
                    cash = VALUES(cash),
                    last_seen = VALUES(last_seen)'
            );
            $statement->execute([
                $playerId, $serverId, $group, $observed['faction'], $observed['pingMs'], $observed['cash'], $nowSql,
            ]);
        }

        $pdo->commit();
        return count($players);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function wardogsStatsCollect(PDO $pdo, array $config): array
{
    $lock = (int)$pdo->query("SELECT GET_LOCK('44th_wardogs_stats_collect', 0)")->fetchColumn();
    if ($lock !== 1) return ['skipped' => true, 'servers' => []];

    $pollSeconds = max(30, (int)($config['stats_poll_seconds'] ?? 60));
    $results = [];

    try {
        $pdo->exec('DELETE FROM player_live_state');
        $servers = is_array($config['servers'] ?? null) ? $config['servers'] : [];

        foreach ($servers as $index => $server) {
            if (!is_array($server) || (($server['enabled'] ?? true) === false)) continue;

            $serverNumber = (int)$index + 1;
            $baseUrl = rtrim(trim((string)($server['url'] ?? '')), '/');
            $password = (string)($server['password'] ?? '');
            if ($baseUrl === '' || $password === '' || str_contains($password, 'CHANGE_ME')) {
                $results[] = ['server' => $serverNumber, 'ok' => false, 'error' => 'RCON not configured'];
                continue;
            }

            try {
                $status = wardogsStatsFetchJson($baseUrl . '/v1/status', $password);
                $playersPayload = wardogsStatsFetchJson($baseUrl . '/v1/players', $password);
                $playerCount = wardogsStatsRecordServer(
                    $pdo,
                    $server,
                    $serverNumber,
                    $status,
                    wardogsStatsPlayerRows($playersPayload),
                    $pollSeconds,
                );
                $results[] = ['server' => $serverNumber, 'ok' => true, 'players' => $playerCount];
            } catch (Throwable $error) {
                error_log('44th WARDOGS stats collection failed for server #' . $serverNumber . ': ' . $error->getMessage());
                $results[] = ['server' => $serverNumber, 'ok' => false, 'error' => 'Collection failed'];
            }
        }
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('44th_wardogs_stats_collect')");
    }

    return ['skipped' => false, 'servers' => $results];
}

function wardogsStatsMaybeCollect(PDO $pdo, array $config): void
{
    $pollSeconds = max(30, (int)($config['stats_poll_seconds'] ?? 60));
    $lastSeen = $pdo->query('SELECT MAX(last_seen) FROM stats_servers')->fetchColumn();
    if ($lastSeen !== false && $lastSeen !== null) {
        $lastTimestamp = strtotime((string)$lastSeen . ' UTC');
        if ($lastTimestamp !== false && (time() - $lastTimestamp) < $pollSeconds) return;
    }

    wardogsStatsCollect($pdo, $config);
}

function wardogsStatsSummary(PDO $pdo, string $group): array
{
    $statement = $pdo->prepare(
        'SELECT
            COUNT(*) AS tracked_players,
            SUM(CASE WHEN live.player_id IS NULL THEN 0 ELSE 1 END) AS online_players,
            COALESCE(SUM(stats.total_kills), 0) AS total_kills,
            COALESCE(SUM(stats.total_deaths), 0) AS total_deaths,
            COALESCE(SUM(stats.seconds_tracked), 0) AS seconds_tracked,
            MAX(stats.last_seen) AS updated_at
         FROM player_group_stats stats
         LEFT JOIN player_live_state live
            ON live.player_id = stats.player_id AND live.stats_group = stats.stats_group
         WHERE stats.stats_group = ?'
    );
    $statement->execute([$group]);
    $row = $statement->fetch() ?: [];

    return [
        'group' => $group,
        'trackedPlayers' => (int)wardogsStatsNumber($row['tracked_players'] ?? 0),
        'onlinePlayers' => (int)wardogsStatsNumber($row['online_players'] ?? 0),
        'totalKillsRecorded' => (int)wardogsStatsNumber($row['total_kills'] ?? 0),
        'totalDeathsRecorded' => (int)wardogsStatsNumber($row['total_deaths'] ?? 0),
        'secondsTracked' => (int)wardogsStatsNumber($row['seconds_tracked'] ?? 0),
        'updatedAt' => wardogsStatsIso(isset($row['updated_at']) ? (string)$row['updated_at'] : null),
    ];
}

function wardogsStatsPlayers(PDO $pdo, array $options): array
{
    $group = wardogsStatsGroup($options['group'] ?? 'normal');
    $search = trim((string)($options['search'] ?? ''));
    $sort = (string)($options['sort'] ?? 'kills');
    $limit = min(500, max(1, (int)($options['limit'] ?? 100)));
    $offset = min(100000, max(0, (int)($options['offset'] ?? 0)));

    $sortSql = [
        'kills' => 'stats.total_kills DESC',
        'deaths' => 'stats.total_deaths DESC',
        'kd' => '(CASE WHEN stats.total_deaths > 0 THEN stats.total_kills / stats.total_deaths ELSE stats.total_kills END) DESC',
        'time' => 'stats.seconds_tracked DESC',
        'matches' => 'stats.matches_seen DESC',
        'lastSeen' => 'stats.last_seen DESC',
        'name' => 'p.current_name ASC',
    ][$sort] ?? 'stats.total_kills DESC';

    $where = ['stats.stats_group = ?'];
    $params = [$group];
    if ($search !== '') {
        $where[] = '(p.current_name LIKE ? OR p.steam_id LIKE ? OR EXISTS (
            SELECT 1 FROM player_aliases alias WHERE alias.player_id = p.id AND alias.alias LIKE ?
        ))';
        $like = '%' . $search . '%';
        array_push($params, $like, $like, $like);
    }
    $whereSql = implode(' AND ', $where);

    $statement = $pdo->prepare(
        'SELECT COUNT(*) FROM player_group_stats stats
         INNER JOIN players p ON p.id = stats.player_id
         WHERE ' . $whereSql
    );
    $statement->execute($params);
    $total = (int)$statement->fetchColumn();

    $sql = 'SELECT
                p.id AS db_id,
                p.steam_id,
                p.current_name,
                stats.first_seen,
                stats.last_seen,
                stats.total_kills,
                stats.total_deaths,
                stats.matches_seen,
                stats.seconds_tracked,
                stats.peak_kills_in_match,
                stats.peak_cash,
                live.player_id AS live_player_id,
                live.faction,
                live.ping_ms,
                live.cash,
                server.server_number
            FROM player_group_stats stats
            INNER JOIN players p ON p.id = stats.player_id
            LEFT JOIN player_live_state live
                ON live.player_id = p.id AND live.stats_group = stats.stats_group
            LEFT JOIN stats_servers server ON server.id = live.server_id
            WHERE ' . $whereSql . '
            ORDER BY ' . $sortSql . '
            LIMIT ' . $limit . ' OFFSET ' . $offset;
    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    $rows = $statement->fetchAll();

    if (!$rows) return ['group' => $group, 'total' => $total, 'players' => []];

    $ids = array_values(array_filter(array_map(static fn(array $row): int => (int)$row['db_id'], $rows)));
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $aliases = [];
    $factions = [];
    $servers = [];

    $statement = $pdo->prepare(
        'SELECT player_id, alias FROM player_aliases WHERE player_id IN (' . $placeholders . ') ORDER BY last_seen DESC'
    );
    $statement->execute($ids);
    foreach ($statement->fetchAll() as $row) {
        $playerId = (int)$row['player_id'];
        if (!isset($aliases[$playerId])) $aliases[$playerId] = [];
        if (count($aliases[$playerId]) < 10) $aliases[$playerId][] = (string)$row['alias'];
    }

    $statement = $pdo->prepare(
        'SELECT player_id, faction, polls_seen FROM player_faction_stats
         WHERE stats_group = ? AND player_id IN (' . $placeholders . ')'
    );
    $statement->execute(array_merge([$group], $ids));
    foreach ($statement->fetchAll() as $row) {
        $playerId = (int)$row['player_id'];
        if (!isset($factions[$playerId])) $factions[$playerId] = [];
        $factions[$playerId][(string)$row['faction']] = (int)$row['polls_seen'];
    }

    $statement = $pdo->prepare(
        'SELECT pss.player_id, ss.server_number, pss.polls_seen
         FROM player_server_stats pss
         INNER JOIN stats_servers ss ON ss.id = pss.server_id
         WHERE ss.stats_group = ? AND pss.player_id IN (' . $placeholders . ')'
    );
    $statement->execute(array_merge([$group], $ids));
    foreach ($statement->fetchAll() as $row) {
        $playerId = (int)$row['player_id'];
        if (!isset($servers[$playerId])) $servers[$playerId] = [];
        $servers[$playerId]['server-' . (int)$row['server_number']] = (int)$row['polls_seen'];
    }

    $players = [];
    foreach ($rows as $row) {
        $playerId = (int)$row['db_id'];
        $kills = (int)$row['total_kills'];
        $deaths = (int)$row['total_deaths'];
        $online = $row['live_player_id'] !== null;

        $players[] = [
            'id' => (string)$row['steam_id'],
            'name' => (string)$row['current_name'],
            'aliases' => $aliases[$playerId] ?? [],
            'group' => $group,
            'firstSeen' => wardogsStatsIso((string)$row['first_seen']),
            'lastSeen' => wardogsStatsIso((string)$row['last_seen']),
            'online' => $online,
            'currentServer' => $online && $row['server_number'] !== null ? (int)$row['server_number'] : null,
            'currentGroup' => $online ? $group : null,
            'currentFaction' => $online ? ($row['faction'] !== null ? (string)$row['faction'] : null) : null,
            'currentPingMs' => $online && $row['ping_ms'] !== null ? (int)$row['ping_ms'] : null,
            'currentCash' => $online && $row['cash'] !== null ? (int)$row['cash'] : null,
            'totalKills' => $kills,
            'totalDeaths' => $deaths,
            'kd' => $deaths > 0 ? round($kills / $deaths, 2) : $kills,
            'matchesSeen' => (int)$row['matches_seen'],
            'secondsTracked' => (int)$row['seconds_tracked'],
            'peakKillsInMatch' => (int)$row['peak_kills_in_match'],
            'peakCash' => (int)$row['peak_cash'],
            'factionCounts' => $factions[$playerId] ?? [],
            'serverCounts' => $servers[$playerId] ?? [],
        ];
    }

    return ['group' => $group, 'total' => $total, 'players' => $players];
}
