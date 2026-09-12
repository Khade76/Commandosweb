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
                $group = wardogsStatsDetectGroup($server, $status);

                // wardogsStatsRecordServer already accepts a server-level group. Feed it the
                // live classification so the existing database model does not need a migration.
                $serverForStats = $server;
                $serverForStats['statsGroup'] = $group;

                $playerCount = wardogsStatsRecordServer(
                    $pdo,
                    $serverForStats,
                    $serverNumber,
                    $status,
                    wardogsStatsPlayerRows($playersPayload),
                    $pollSeconds,
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
