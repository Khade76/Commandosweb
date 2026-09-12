<?php

declare(strict_types=1);

/**
 * Resolve the stats bucket from the live WARDOGS match status.
 *
 * By default every rotation is "normal". If the live map, mode or any
 * experience/modifier contains the Hardcore tag, the poll is written to the
 * separate "hardcore" bucket. This deliberately does not depend on server
 * number, so any 44th server can host Hardcore later without mixing stats.
 *
 * Set statsGroupOverride to "normal" or "hardcore" on a server only when a
 * temporary/manual override is required.
 */
function wardogsStatsDetectGroup(array $server, array $status): string
{
    $override = strtolower(trim((string)($server['statsGroupOverride'] ?? '')));
    if (in_array($override, ['normal', 'hardcore'], true)) return $override;

    $values = [];

    foreach (['map', 'mode', 'gameMode', 'game_mode', 'experience'] as $key) {
        if (!isset($status[$key])) continue;
        $value = trim((string)$status[$key]);
        if ($value !== '') $values[] = $value;
    }

    if (is_array($status['experiences'] ?? null)) {
        foreach ($status['experiences'] as $experience) {
            $value = trim((string)$experience);
            if ($value !== '') $values[] = $value;
        }
    }

    foreach ($values as $value) {
        if (stripos($value, 'hardcore') !== false) return 'hardcore';
    }

    return 'normal';
}

/**
 * Track which physical servers a player has used for each ruleset. The legacy
 * player_server_stats table is intentionally left intact for total per-server
 * history; this ruleset-aware table prevents a server changing between
 * Standard and Hardcore from moving historical "servers played" information
 * between tabs.
 */
function wardogsStatsRecordServerGroupPresence(
    PDO $pdo,
    int $serverNumber,
    string $group,
    array $rawPlayers,
    DateTimeImmutable $now,
): void {
    $statement = $pdo->prepare('SELECT id FROM stats_servers WHERE server_number = ? LIMIT 1');
    $statement->execute([$serverNumber]);
    $serverId = (int)($statement->fetchColumn() ?: 0);
    if ($serverId < 1) return;

    $nowSql = wardogsStatsMysqlDate($now);
    $findPlayer = $pdo->prepare('SELECT id FROM players WHERE steam_id = ? LIMIT 1');
    $upsert = $pdo->prepare(
        'INSERT INTO player_server_group_stats
            (player_id, server_id, stats_group, first_seen, last_seen, polls_seen)
         VALUES (?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
            last_seen = VALUES(last_seen),
            polls_seen = polls_seen + 1'
    );

    foreach ($rawPlayers as $rawPlayer) {
        if (!is_array($rawPlayer)) continue;
        $player = wardogsStatsNormalisePlayer($rawPlayer);
        if ($player === null) continue;

        $findPlayer->execute([$player['steamId']]);
        $playerId = (int)($findPlayer->fetchColumn() ?: 0);
        if ($playerId < 1) continue;

        $upsert->execute([$playerId, $serverId, $group, $nowSql, $nowSql]);
    }
}

function wardogsStatsApplyRulesetServerCounts(PDO $pdo, array $result, string $group): array
{
    $players = is_array($result['players'] ?? null) ? $result['players'] : [];
    if (!$players) return $result;

    $steamIds = array_values(array_unique(array_filter(array_map(
        static fn(array $player): string => trim((string)($player['id'] ?? '')),
        $players,
    ))));
    if (!$steamIds) return $result;

    $placeholders = implode(',', array_fill(0, count($steamIds), '?'));
    $statement = $pdo->prepare(
        'SELECT p.steam_id, ss.server_number, psgs.polls_seen
         FROM player_server_group_stats psgs
         INNER JOIN players p ON p.id = psgs.player_id
         INNER JOIN stats_servers ss ON ss.id = psgs.server_id
         WHERE psgs.stats_group = ? AND p.steam_id IN (' . $placeholders . ')'
    );
    $statement->execute(array_merge([$group], $steamIds));

    $counts = [];
    foreach ($statement->fetchAll() as $row) {
        $steamId = (string)$row['steam_id'];
        if (!isset($counts[$steamId])) $counts[$steamId] = [];
        $counts[$steamId]['server-' . (int)$row['server_number']] = (int)$row['polls_seen'];
    }

    foreach ($players as &$player) {
        $steamId = (string)($player['id'] ?? '');
        $player['serverCounts'] = $counts[$steamId] ?? [];
    }
    unset($player);

    $result['players'] = $players;
    return $result;
}

function wardogsStatsCollectDynamic(PDO $pdo, array $config): array
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
                $rawPlayers = wardogsStatsPlayerRows($playersPayload);
                $group = wardogsStatsDetectGroup($server, $status);

                // wardogsStatsRecordServer already accepts a server-level group. Feed it the
                // live classification so the existing aggregate model can be reused.
                $serverForStats = $server;
                $serverForStats['statsGroup'] = $group;

                $playerCount = wardogsStatsRecordServer(
                    $pdo,
                    $serverForStats,
                    $serverNumber,
                    $status,
                    $rawPlayers,
                    $pollSeconds,
                );

                wardogsStatsRecordServerGroupPresence(
                    $pdo,
                    $serverNumber,
                    $group,
                    $rawPlayers,
                    wardogsStatsNow(),
                );

                $results[] = [
                    'server' => $serverNumber,
                    'ok' => true,
                    'players' => $playerCount,
                    'statsGroup' => $group,
                    'experiences' => is_array($status['experiences'] ?? null)
                        ? array_values(array_map('strval', $status['experiences']))
                        : [],
                ];
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

function wardogsStatsMaybeCollectDynamic(PDO $pdo, array $config): void
{
    $pollSeconds = max(30, (int)($config['stats_poll_seconds'] ?? 60));
    $lastSeen = $pdo->query('SELECT MAX(last_seen) FROM stats_servers')->fetchColumn();
    if ($lastSeen !== false && $lastSeen !== null) {
        $lastTimestamp = strtotime((string)$lastSeen . ' UTC');
        if ($lastTimestamp !== false && (time() - $lastTimestamp) < $pollSeconds) return;
    }

    wardogsStatsCollectDynamic($pdo, $config);
}
