<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/stats-db.php';
require_once __DIR__ . '/stats-grouping.php';

function wardogsHealthToken(): string
{
    $authorization = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
    if ($authorization === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strcasecmp((string)$name, 'Authorization') === 0) {
                $authorization = trim((string)$value);
                break;
            }
        }
    }

    if (preg_match('/^Bearer\s+(.+)$/i', $authorization, $matches)) {
        return trim((string)$matches[1]);
    }

    return isset($_GET['token']) ? trim((string)$_GET['token']) : '';
}

function wardogsHealthExpectedToken(array $config): string
{
    $token = trim((string)($config['stats_collect_token'] ?? ''));
    if ($token !== '') return $token;
    return trim((string)($config['stats_source_token'] ?? ''));
}

function wardogsHealthError(Throwable $error): array
{
    return [
        'ok' => false,
        'type' => get_class($error),
        'message' => $error->getMessage(),
    ];
}

try {
    $config = wardogsStatsConfig();
    $expectedToken = wardogsHealthExpectedToken($config);
    $providedToken = wardogsHealthToken();

    if ($expectedToken === '' || $providedToken === '' || !hash_equals($expectedToken, $providedToken)) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    $result = [
        'ok' => true,
        'php' => [
            'version' => PHP_VERSION,
            'pdo' => extension_loaded('pdo'),
            'pdo_mysql' => extension_loaded('pdo_mysql'),
        ],
        'database' => [
            'configured' => false,
            'connected' => false,
            'schema' => false,
        ],
        'servers' => [],
        'generatedAt' => gmdate('c'),
    ];

    $database = is_array($config['database'] ?? null) ? $config['database'] : [];
    $requiredDb = ['host', 'name', 'user', 'password'];
    $missingDb = [];
    foreach ($requiredDb as $key) {
        if (trim((string)($database[$key] ?? '')) === '') $missingDb[] = $key;
    }
    $result['database']['configured'] = count($missingDb) === 0;
    if ($missingDb) $result['database']['missing'] = $missingDb;

    try {
        $pdo = wardogsStatsPdo($config);
        $pdo->query('SELECT 1')->fetchColumn();
        $result['database']['connected'] = true;

        $expectedTables = [
            'players',
            'player_aliases',
            'stats_servers',
            'player_group_stats',
            'player_server_stats',
            'player_faction_stats',
            'player_snapshots',
            'player_live_state',
            'matches',
            'player_match_stats',
        ];

        $missingTables = [];
        foreach ($expectedTables as $table) {
            try {
                $pdo->query('SELECT 1 FROM `' . $table . '` LIMIT 1');
            } catch (Throwable $error) {
                $missingTables[] = $table;
            }
        }

        $result['database']['schema'] = count($missingTables) === 0;
        if ($missingTables) $result['database']['missingTables'] = $missingTables;
    } catch (Throwable $error) {
        $result['ok'] = false;
        $result['database']['error'] = wardogsHealthError($error);
    }

    $servers = is_array($config['servers'] ?? null) ? $config['servers'] : [];
    foreach ($servers as $index => $server) {
        if (!is_array($server) || (($server['enabled'] ?? true) === false)) continue;

        $serverNumber = (int)$index + 1;
        $baseUrl = rtrim((string)($server['url'] ?? ''), '/');
        $password = (string)($server['password'] ?? '');
        $entry = [
            'server' => $serverNumber,
            'name' => (string)($server['name'] ?? ('WARDOGS Server #' . $serverNumber)),
            'group' => null,
            'configured' => $baseUrl !== '' && $password !== '' && !str_contains($password, 'CHANGE_ME'),
            'status' => false,
            'players' => false,
        ];

        if (!$entry['configured']) {
            $entry['error'] = 'RCON is not configured';
            $result['ok'] = false;
            $result['servers'][] = $entry;
            continue;
        }

        try {
            $status = wardogsStatsFetchJson($baseUrl . '/v1/status', $password);
            $entry['status'] = true;
            $entry['map'] = $status['map'] ?? null;
            $entry['experiences'] = is_array($status['experiences'] ?? null)
                ? array_values(array_map('strval', $status['experiences']))
                : [];
            $entry['group'] = wardogsStatsDetectGroup($server, $status);
        } catch (Throwable $error) {
            $entry['error'] = 'Status: ' . $error->getMessage();
            $result['ok'] = false;
        }

        try {
            $playersPayload = wardogsStatsFetchJson($baseUrl . '/v1/players', $password);
            $entry['players'] = true;
            $entry['playerCount'] = count(wardogsStatsPlayerRows($playersPayload));
        } catch (Throwable $error) {
            $entry['error'] = isset($entry['error'])
                ? $entry['error'] . '; Players: ' . $error->getMessage()
                : 'Players: ' . $error->getMessage();
            $result['ok'] = false;
        }

        $result['servers'][] = $entry;
    }

    echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
} catch (Throwable $error) {
    http_response_code(503);
    echo json_encode([
        'ok' => false,
        'error' => $error->getMessage(),
        'type' => get_class($error),
    ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
}
